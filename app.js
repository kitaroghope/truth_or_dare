// Project: rps_socket_room_links + chat with SQLite + file & voice note support
// Dependencies: express, socket.io, sqlite3, uuid, multer
// Enhanced with: JWT auth, Drizzle ORM, multi-database support

// Load environment variables
require('dotenv').config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors");

// Import new modules
const { initDatabase, runMigrations } = require('./db');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const friendsRoutes = require('./routes/friends');
const gamesRoutes = require('./routes/games');
const notificationsRoutes = require('./routes/notifications');
const { heartbeatOnlineUsers } = require('./utils/onlineStatus');
// DISABLED: Duplicate socket system (conflicts with main game socket handlers)
// const { authenticateSocket, setupSocketHandlers } = require('./socket');
const { apiLimiter } = require('./middleware/rateLimiter');
const { securityHeaders, sanitizeQueryParams } = require('./middleware/validation');

const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// CORS Configuration
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

// DISABLED: Duplicate socket system (conflicts with main game socket handlers)
// Apply Socket.io authentication middleware
// io.use(authenticateSocket);

// Setup new Socket.io event handlers (for authenticated mobile/web clients)
// setupSocketHandlers(io);

// Admin authentication
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const adminSessions = new Set();

// Security middleware
app.use(securityHeaders);
app.use(sanitizeQueryParams);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general API rate limiting to all /api routes
app.use('/api/', apiLimiter);

// Make adminSessions available to middleware
app.set('adminSessions', adminSessions);

// Generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized. Admin access required." });
  }
  
  next();
}

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/notifications', notificationsRoutes);

app.get("/ping", (req, res) => {
  res.json({ message: "Server is alive" });
});

// Admin login endpoint
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = generateSessionToken();
    adminSessions.add(token);
    
    // Auto-expire session after 1 hour
    setTimeout(() => {
      adminSessions.delete(token);
    }, 60 * 60 * 1000);
    
    res.json({ 
      success: true, 
      token: token,
      message: "Login successful" 
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: "Invalid credentials" 
    });
  }
});

// Admin logout endpoint
app.post("/api/admin/logout", (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    adminSessions.delete(token);
  }
  res.json({ success: true, message: "Logged out successfully" });
});

// Admin API endpoints (protected)
app.get("/api/admin/conversations", requireAdminAuth, async (req, res) => {
  try {
    const { getDatabase } = require('./db');
    const { messages } = require('./db/schema');
    const { desc } = require('drizzle-orm');
    const drizzleDb = getDatabase();

    // Fetch all messages ordered by timestamp
    const rows = await drizzleDb.select().from(messages).orderBy(desc(messages.timestamp));

    // Convert timestamp objects to ISO strings for JSON serialization
    const serializedRows = rows.map(row => ({
      ...row,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp
    }));

    // Calculate statistics
    const stats = {
      totalMessages: serializedRows.length,
      totalRooms: new Set(serializedRows.map(row => row.room)).size,
      totalUsers: new Set(serializedRows.map(row => row.username)).size,
      totalFiles: serializedRows.filter(row => row.type === 'file' || row.type === 'audio').length
    };

    res.json({
      conversations: serializedRows,
      stats: stats
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/admin/conversations", requireAdminAuth, async (req, res) => {
  try {
    const { getDatabase } = require('./db');
    const { messages } = require('./db/schema');
    const { sql } = require('drizzle-orm');
    const drizzleDb = getDatabase();

    // Delete all messages
    const result = await drizzleDb.delete(messages);

    res.json({
      success: true,
      message: `Deleted all messages successfully`
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Multer storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// File upload endpoint
app.post("/upload/:room/:username", upload.single("file"), async (req, res) => {
  const { room, username } = req.params;
  const fileUrl = `/uploads/${req.file.filename}`;
  const id = uuidv4();
  const type = req.file.mimetype.startsWith("audio/") ? "audio" : "file";

  try {
    const { getDatabase } = require('./db');
    const { messages } = require('./db/schema');
    const drizzleDb = getDatabase();

    await drizzleDb.insert(messages).values({
      id,
      room,
      username,
      content: fileUrl,
      type,
      timestamp: new Date()
    });

    io.to(room).emit("newMessage", { id, room, username, content: fileUrl, type });
    res.json({ success: true, fileUrl });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// Import game state sync utilities
const {
  loadGameState,
  saveGameState,
  debouncedSaveGameState,
  createOrUpdateGame,
} = require('./utils/gameStateSync');

// Create debounced save function
const scheduleSaveGameState = debouncedSaveGameState(500);

// In-memory game state - NOW USERNAME-BASED
// Structure: { [roomCode]: { users: { [username]: socketId }, choices: { [username]: choice }, winner: username, loser: username, ... } }
const games = {};

// Helper functions for username ↔ socket mapping
function getSocketIdByUsername(room, username) {
  if (!games[room] || !games[room].users) {
    console.warn(`⚠️  getSocketIdByUsername: Room ${room} not found`);
    return null;
  }

  const socketId = games[room].users[username];
  if (!socketId) {
    console.warn(`⚠️  getSocketIdByUsername: Username "${username}" not found in room ${room}`);
    return null;
  }

  // Validate that socket still exists
  const socket = io.sockets.sockets.get(socketId);
  if (!socket || !socket.connected) {
    console.warn(`⚠️  Socket ${socketId} for "${username}" is no longer connected`);
    return null;
  }

  return socketId;
}

function getUsernameBySocketId(room, socketId) {
  if (!games[room] || !games[room].users) {
    console.warn(`⚠️  getUsernameBySocketId: Room ${room} not found`);
    return null;
  }

  const username = Object.keys(games[room].users).find(username => games[room].users[username] === socketId);
  if (!username) {
    console.warn(`⚠️  getUsernameBySocketId: Socket ${socketId} not found in room ${room}`);
  }

  return username || null;
}

function updateSocketMapping(room, username, newSocketId) {
  if (!games[room]) {
    console.warn(`⚠️  updateSocketMapping: Room ${room} not found`);
    return false;
  }
  games[room].users[username] = newSocketId;
  console.log(`✅ Updated socket mapping: ${username} → ${newSocketId} in room ${room}`);
  return true;
}

// Helper function to save system messages to database
async function saveSystemMessage(room, content) {
  const id = uuidv4();

  try {
    const { getDatabase } = require('./db');
    const { messages } = require('./db/schema');
    const drizzleDb = getDatabase();

    await drizzleDb.insert(messages).values({
      id,
      room,
      username: "System",
      content,
      type: "system",
      timestamp: new Date()
    });
  } catch (err) {
    console.error('❌ Error saving system message:', err);
  }

  return { id, room, username: "System", content, type: "system" };
}

io.on("connection", (socket) => {
  socket.on("joinRoom", async ({ room, username }) => {
    // Step 1: Try to load existing game from database
    const dbGame = await loadGameState(room);

    if (!games[room]) {
      // Initialize in-memory state
      games[room] = {
        users: {},           // { [username]: socketId }
        choices: {},         // { [username]: choice }
        chatVisible: false,
        gameState: 'waiting',
        gamePhase: 'lobby',
        winner: null,        // username, not socketId
        loser: null,         // username, not socketId
        truthDareSelection: null,
        awaitingTruthDare: false
      };

      // If game exists in database, restore state
      if (dbGame) {
        const dbState = dbGame.gameState || {};
        games[room].chatVisible = dbState.chatVisible || false;
        games[room].gameState = dbGame.status === 'waiting' ? 'waiting' : 'in_progress';
        games[room].gamePhase = dbGame.gamePhase || 'lobby';
        games[room].winner = dbState.winner || null;
        games[room].loser = dbState.loser || null;
        games[room].truthDareSelection = dbState.truthDareSelection || null;
        games[room].awaitingTruthDare = dbState.awaitingTruthDare || false;
        games[room].choices = dbState.choices || {};

        console.log(`✅ Restored game state for room ${room} from database (phase: ${dbGame.gamePhase})`);
      }
    }

    // Check if username already exists in this room
    const existingSocketId = games[room].users[username];
    const usernameExists = existingSocketId !== undefined;
    const isRejoining = usernameExists && (existingSocketId === socket.id || existingSocketId === null);
    const isDuplicateUsername = usernameExists && existingSocketId !== socket.id && existingSocketId !== null;

    // Block duplicate usernames (different user trying to use existing name)
    if (isDuplicateUsername) {
      console.log(`❌ Username "${username}" already taken in room ${room}`);
      socket.emit("nameExists");
      return;
    }

    if (!isRejoining) {
      // New user joining - check room capacity
      const userCount = Object.keys(games[room].users).length;

      if (userCount >= 2) {
        console.log(`❌ Room ${room} is full (${userCount}/2 players)`);
        socket.emit("roomFull");
        return;
      }
    }

    // Update socket mapping (works for both new users and rejoining)
    games[room].users[username] = socket.id;
    console.log(`✅ User "${username}" ${isRejoining ? 'rejoined' : 'joined'} room ${room}`);
    socket.join(room);

    // Confirm successful join to the client
    socket.emit("joinedRoom");

    // Notify all players of updated user list
    const userList = Object.keys(games[room].users);
    io.to(room).emit("playerUpdate", userList);

    // Send previous messages
    (async () => {
      try {
        const { getDatabase } = require('./db');
        const { messages } = require('./db/schema');
        const { eq, asc } = require('drizzle-orm');
        const drizzleDb = getDatabase();

        const rows = await drizzleDb.select()
          .from(messages)
          .where(eq(messages.room, room))
          .orderBy(asc(messages.timestamp));

        // Serialize timestamps for client
        const serializedRows = rows.map(row => ({
          ...row,
          timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp
        }));

        socket.emit("previousMessages", serializedRows);
      } catch (err) {
        console.error("Error fetching previous messages:", err);
      }
    })();

    // Send full state restoration to rejoining/new user
    const currentState = {
      gamePhase: games[room].gamePhase,
      gameState: games[room].gameState,
      chatVisible: games[room].chatVisible,
      awaitingTruthDare: games[room].awaitingTruthDare,
      winner: games[room].winner,
      loser: games[room].loser,
      truthDareSelection: games[room].truthDareSelection,
      userChoice: games[room].choices[username] || null,
      isWinner: games[room].winner === username,
      isLoser: games[room].loser === username,
    };

    // Emit full state restoration
    socket.emit("fullStateRestoration", currentState);

    // Show truth/dare modal if appropriate
    if (games[room].awaitingTruthDare) {
      const isLoser = games[room].loser === username;
      const isWinner = games[room].winner === username;

      if (isLoser && !games[room].truthDareSelection) {
        socket.emit("showTruthDareModal", { type: "choose" });
      } else if (isWinner && !games[room].truthDareSelection) {
        socket.emit("showTruthDareModal", { type: "waiting" });
      }
    }

    // Create or update game in database
    if (!dbGame) {
      await createOrUpdateGame(room, username, games[room]);
    }

    // Save current state to database (debounced)
    scheduleSaveGameState(room, games[room]);

    socket.on("makeChoice", async (choice) => {
      // Get username from socket ID
      const username = getUsernameBySocketId(room, socket.id);
      if (!username) {
        console.error('❌ makeChoice: Could not find username for socket', socket.id);
        return;
      }

      // Store choice using username as key
      games[room].choices[username] = choice;
      games[room].gamePhase = 'choosing';

      // Save system message for choice
      const choiceMsg = await saveSystemMessage(room, `${username} chose ${choice}`);
      io.to(room).emit("newMessage", choiceMsg);

      // Check if both players have made their choices
      if (Object.keys(games[room].choices).length === 2) {
        const [username1, username2] = Object.keys(games[room].choices);
        const c1 = games[room].choices[username1];
        const c2 = games[room].choices[username2];

        const rules = { rock: "scissors", scissors: "paper", paper: "rock" };
        let result;

        if (c1 === c2) {
          // Tie - reset choices and stay in choosing phase
          result = { [username1]: "It's a tie", [username2]: "It's a tie" };
          games[room].choices = {};
          games[room].gamePhase = 'lobby';

          // Get socket IDs for sending results
          const socketId1 = getSocketIdByUsername(room, username1);
          const socketId2 = getSocketIdByUsername(room, username2);

          // Save system message for tie
          const tieMsg = await saveSystemMessage(room, `${username1}: It's a tie`);
          io.to(room).emit("newMessage", tieMsg);

          if (socketId1) io.to(socketId1).emit("result", { message: result[username1] });
          if (socketId2) io.to(socketId2).emit("result", { message: result[username2] });
        } else {
          // Determine winner and loser (store usernames, not socket IDs)
          const winnerUsername = rules[c1] === c2 ? username1 : username2;
          const loserUsername = winnerUsername === username1 ? username2 : username1;

          result = {
            [winnerUsername]: "You win! You may ask a truth or give a dare.",
            [loserUsername]: "You lose! Choose Truth or Dare.",
          };

          // Update game state with winner/loser (usernames)
          games[room].winner = winnerUsername;
          games[room].loser = loserUsername;
          games[room].awaitingTruthDare = true;
          games[room].truthDareSelection = null;
          games[room].gamePhase = 'result';

          // Get socket IDs for emitting events
          const winnerSocketId = getSocketIdByUsername(room, winnerUsername);
          const loserSocketId = getSocketIdByUsername(room, loserUsername);

          // Save system messages for win/lose
          const winMsg = await saveSystemMessage(room, `${winnerUsername}: You win! You may ask a truth or give a dare.`);
          const loseMsg = await saveSystemMessage(room, `${loserUsername}: You lose! Choose Truth or Dare.`);
          io.to(room).emit("newMessage", winMsg);
          io.to(room).emit("newMessage", loseMsg);

          // Send results
          if (winnerSocketId) io.to(winnerSocketId).emit("result", { message: result[winnerUsername] });
          if (loserSocketId) io.to(loserSocketId).emit("result", { message: result[loserUsername] });

          // Show modals
          if (loserSocketId) io.to(loserSocketId).emit("showTruthDareModal", { type: "choose" });
          if (winnerSocketId) io.to(winnerSocketId).emit("showTruthDareModal", { type: "waiting" });

          // Enable chat
          games[room].chatVisible = true;
          io.to(room).emit("chatVisible", true);

          // Update phase to truth/dare selection
          games[room].gamePhase = 'truth_dare_selection';
        }

        // Clear choices after round
        games[room].choices = {};

        // Persist state to database
        scheduleSaveGameState(room, games[room]);
      }
    });

    socket.on("truthOrDare", async (selection) => {
      // Get username from socket ID
      const username = getUsernameBySocketId(room, socket.id);
      if (!username) {
        console.error('❌ truthOrDare: Could not find username for socket', socket.id);
        return;
      }

      // Check if this user is the loser and truth/dare is awaited
      if (games[room].awaitingTruthDare && games[room].loser === username) {
        games[room].truthDareSelection = selection;
        games[room].awaitingTruthDare = false;
        games[room].gamePhase = 'chat';

        // Save system message for truth/dare selection
        const tdMsg = await saveSystemMessage(room, `${username} chose <strong>${selection}</strong>`);
        io.to(room).emit("newMessage", tdMsg);

        // Hide modal for both players
        io.to(room).emit("hideTruthDareModal");

        // Notify both players of the selection
        io.to(room).emit("truthOrDareResponse", {
          username: username,
          selection,
        });

        // Persist state to database
        scheduleSaveGameState(room, games[room]);
      }
    });

    socket.on("sendMessage", async (msg) => {
      // Get username from socket ID
      const username = getUsernameBySocketId(room, socket.id);
      if (!username) {
        console.error('❌ sendMessage: Could not find username for socket', socket.id);
        return;
      }

      const id = uuidv4();

      try {
        const { getDatabase } = require('./db');
        const { messages } = require('./db/schema');
        const drizzleDb = getDatabase();

        await drizzleDb.insert(messages).values({
          id,
          room,
          username,
          content: msg,
          type: "text",
          timestamp: new Date()
        });

        io.to(room).emit("newMessage", { id, room, username, content: msg, type: "text" });
      } catch (err) {
        console.error("Database error:", err);
      }
    });

    socket.on("startNewRound", async () => {
      // Reset game state for new round
      games[room].chatVisible = false;
      games[room].awaitingTruthDare = false;
      games[room].winner = null;
      games[room].loser = null;
      games[room].truthDareSelection = null;
      games[room].gameState = 'waiting';
      games[room].gamePhase = 'lobby';
      games[room].choices = {}; // Clear any pending choices

      // Notify all players
      io.to(room).emit("chatVisible", false);
      io.to(room).emit("hideTruthDareModal");
      io.to(room).emit("clearResultMessage");
      io.to(room).emit("gameStateUpdate", { state: "waiting" });

      // Persist clean state to database
      scheduleSaveGameState(room, games[room]);
    });

    socket.on("disconnect", () => {
      if (!games[room]) return;

      // Get username from socket ID
      const username = getUsernameBySocketId(room, socket.id);
      if (!username) return;

      console.log(`🔌 User "${username}" disconnected from room ${room}`);

      // Mark user as disconnected (set socket to null, keep game state)
      // This allows the user to reconnect and restore their state
      games[room].users[username] = null;

      // Get list of CONNECTED users (exclude those with null socket IDs)
      const connectedUsers = Object.keys(games[room].users).filter(
        user => games[room].users[user] !== null
      );

      // Notify remaining connected players
      io.to(room).emit("playerUpdate", connectedUsers);

      // If no connected users, schedule cleanup after timeout
      if (connectedUsers.length === 0) {
        console.log(`⏱️  Room ${room} empty, scheduling cleanup in 5 minutes`);
        setTimeout(() => {
          // Check again if room still has no connected users
          if (games[room]) {
            const stillConnected = Object.keys(games[room].users).filter(
              user => games[room].users[user] !== null
            );
            if (stillConnected.length === 0) {
              console.log(`🧹 Cleaning up empty room: ${room}`);
              delete games[room];
            }
          }
        }, 5 * 60 * 1000); // 5 minutes timeout
      } else {
        // Persist state to database (user may reconnect)
        scheduleSaveGameState(room, games[room]);
      }
    });

    // Handle user intentionally leaving room (not just disconnecting)
    socket.on("leaveRoom", () => {
      if (!games[room]) return;

      const username = getUsernameBySocketId(room, socket.id);
      if (!username) return;

      console.log(`🚪 User "${username}" left room ${room}`);

      // Remove user completely (intentional leave, not temporary disconnect)
      delete games[room].users[username];

      // Also clear their choices and other state
      if (games[room].choices) {
        delete games[room].choices[username];
      }

      // Reset winner/loser if they were this user
      if (games[room].winner === username) {
        games[room].winner = null;
      }
      if (games[room].loser === username) {
        games[room].loser = null;
      }

      socket.leave(room);

      // Get remaining users
      const remainingUsers = Object.keys(games[room].users);

      // Notify remaining players
      io.to(room).emit("playerUpdate", remainingUsers);

      // If room empty, clean up immediately (no timeout)
      if (remainingUsers.length === 0) {
        console.log(`🧹 Cleaning up empty room: ${room}`);
        delete games[room];
      } else {
        // Reset game state if only one player remains
        games[room].gamePhase = "lobby";
        games[room].choices = {};
        games[room].winner = null;
        games[room].loser = null;
        games[room].chatVisible = false;
        games[room].awaitingTruthDare = false;
        games[room].truthDareSelection = null;

        // Persist updated state
        scheduleSaveGameState(room, games[room]);

        // Notify remaining player to reset their UI
        io.to(room).emit("gameReset");
      }
    });
  });

  // ✅ NEW: Handle room list request from client
  socket.on("getRooms", () => {
    const availableRooms = [];
    for (const [roomId, roomObj] of io.sockets.adapter.rooms) {
      const isUserRoom = [...io.sockets.sockets.keys()].includes(roomId);
      if (isUserRoom) continue;

      const game = games[roomId];
      if (game && Object.keys(game.users).length < 2) {
        availableRooms.push(roomId);
      }
    }
    socket.emit("roomsList", availableRooms);
  });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Initializing Truth or Dare Server...');

    // Initialize Drizzle database connection
    await initDatabase();

    // Run migrations
    await runMigrations();

    // Start server
    server.listen(port, () => {
      console.log(`✅ Server running at http://localhost:${port}`);
      console.log(`📊 Database: ${process.env.DATABASE_TYPE || 'sqlite'}`);
      console.log(`🔐 Auth endpoints: /api/auth`);
      console.log(`👤 User endpoints: /api/users`);
      console.log(`👥 Friends endpoints: /api/friends`);
      console.log(`🎮 Games endpoints: /api/games`);
      console.log(`🔔 Notifications endpoints: /api/notifications`);
      console.log(`📱 CORS enabled for: ${corsOrigins.join(', ')}`);

      // Start heartbeat for online status (every 2 minutes)
      setInterval(() => {
        heartbeatOnlineUsers();
      }, 2 * 60 * 1000);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
