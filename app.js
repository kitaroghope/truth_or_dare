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

// In-memory game state - NOW USER-ID-BASED (supports both authenticated and anonymous users)
// Structure: { [roomCode]: { users: { [userId]: {socketId, username} }, choices: { [userId]: choice }, winner: userId, loser: userId, ... } }
const games = {};

// Helper functions for userId ↔ socket mapping
function getSocketIdByUserId(room, userId) {
  if (!games[room] || !games[room].users) {
    console.warn(`⚠️  getSocketIdByUserId: Room ${room} not found`);
    return null;
  }

  const userInfo = games[room].users[userId];
  if (!userInfo || !userInfo.socketId) {
    console.warn(`⚠️  getSocketIdByUserId: User ID "${userId}" not found in room ${room}`);
    return null;
  }

  // Validate that socket still exists
  const socket = io.sockets.sockets.get(userInfo.socketId);
  if (!socket || !socket.connected) {
    console.warn(`⚠️  Socket ${userInfo.socketId} for user "${userId}" is no longer connected`);
    return null;
  }

  return userInfo.socketId;
}

function getUserIdBySocketId(room, socketId) {
  if (!games[room] || !games[room].users) {
    console.warn(`⚠️  getUserIdBySocketId: Room ${room} not found`);
    return null;
  }

  const userId = Object.keys(games[room].users).find(uid => games[room].users[uid].socketId === socketId);
  if (!userId) {
    console.warn(`⚠️  getUserIdBySocketId: Socket ${socketId} not found in room ${room}`);
  }

  return userId || null;
}

function getUsernameByUserId(room, userId) {
  if (!games[room] || !games[room].users || !games[room].users[userId]) {
    return null;
  }
  return games[room].users[userId].username;
}

function updateSocketMapping(room, userId, newSocketId, username) {
  if (!games[room]) {
    console.warn(`⚠️  updateSocketMapping: Room ${room} not found`);
    return false;
  }
  games[room].users[userId] = { socketId: newSocketId, username };
  console.log(`✅ Updated socket mapping: ${username} (${userId}) → ${newSocketId} in room ${room}`);
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
  socket.on("joinRoom", async ({ room, username, userId }) => {
    const userType = userId?.startsWith('anon_') ? 'anonymous' : 'authenticated';
    console.log(`🚪 [JOIN ROOM] ${userType} user "${username}" (${userId}) attempting to join room ${room}`);

    // Validate inputs
    if (!room || !username || !userId) {
      console.log(`❌ [JOIN ROOM] Invalid join attempt - missing room, username, or userId`);
      socket.emit("error", { message: "Invalid request" });
      return;
    }

    // Step 1: Try to load existing game from database
    console.log(`🔍 [JOIN ROOM] Checking database for existing game in room ${room}...`);
    const dbGame = await loadGameState(room);

    if (!games[room]) {
      console.log(`🆕 [JOIN ROOM] Room ${room} does not exist in memory, initializing...`);
      // Initialize in-memory state
      games[room] = {
        users: {},           // { [userId]: {socketId, username} }
        choices: {},         // { [userId]: choice }
        chatVisible: false,
        gameState: 'waiting',
        gamePhase: 'lobby',
        winner: null,        // userId, not socketId
        loser: null,         // userId, not socketId
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

        console.log(`✅ [JOIN ROOM] Restored game state for room ${room} from database (phase: ${dbGame.gamePhase}, creator: ${dbGame.creatorId}, opponent: ${dbGame.opponentId})`);
      } else {
        console.log(`🆕 [JOIN ROOM] No database record found, creating fresh game state`);
      }
    }

    // Check if userId already exists in this room
    const existingUserInfo = games[room].users[userId];
    const userExists = existingUserInfo !== undefined;
    const isRejoining = userExists && (existingUserInfo.socketId === socket.id || existingUserInfo.socketId === null);

    if (!isRejoining) {
      // New user joining - check room capacity
      const userCount = Object.keys(games[room].users).length;
      console.log(`👥 [JOIN ROOM] Current players in room: ${userCount}/2`);

      if (userCount >= 2) {
        console.log(`❌ [JOIN ROOM] Room ${room} is full (${userCount}/2 players)`);
        socket.emit("roomFull");
        return;
      }
    }

    // Update socket mapping (works for both new users and rejoining)
    games[room].users[userId] = { socketId: socket.id, username };
    const action = isRejoining ? 'rejoined' : 'joined';
    console.log(`✅ [JOIN ROOM] User "${username}" (${userId}) ${action} room ${room}`);
    console.log(`👥 [JOIN ROOM] Current users in room ${room}:`, Object.keys(games[room].users).map(id => `${games[room].users[id].username} (${id})`));
    socket.join(room);

    // Sync with database: create or update game record
    console.log(`💾 [JOIN ROOM] Syncing game state to database...`);
    await createOrUpdateGame(room, games[room], userId, username);

    // Confirm successful join to the client
    socket.emit("joinedRoom");

    // Notify all players of updated user list (send usernames for display)
    const userList = Object.values(games[room].users).map(u => u.username);
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
      userChoice: games[room].choices[userId] || null,
      isWinner: games[room].winner === userId,
      isLoser: games[room].loser === userId,
    };

    // Emit full state restoration
    socket.emit("fullStateRestoration", currentState);

    // Show truth/dare modal if appropriate
    if (games[room].awaitingTruthDare) {
      const isLoser = games[room].loser === userId;
      const isWinner = games[room].winner === userId;

      if (isLoser && !games[room].truthDareSelection) {
        socket.emit("showTruthDareModal", { type: "choose" });
      } else if (isWinner && !games[room].truthDareSelection) {
        socket.emit("showTruthDareModal", { type: "waiting" });
      }
    }

    // Save current state to database (debounced)
    scheduleSaveGameState(room, games[room]);

    socket.on("makeChoice", async (choice) => {
      // Get userId from socket ID
      const currentUserId = getUserIdBySocketId(room, socket.id);
      if (!currentUserId) {
        console.error('❌ makeChoice: Could not find userId for socket', socket.id);
        return;
      }

      const currentUsername = getUsernameByUserId(room, currentUserId);

      // Store choice using userId as key
      games[room].choices[currentUserId] = choice;
      games[room].gamePhase = 'choosing';

      // Save system message for choice
      const choiceMsg = await saveSystemMessage(room, `${currentUsername} chose ${choice}`);
      io.to(room).emit("newMessage", choiceMsg);

      // Check if both players have made their choices
      if (Object.keys(games[room].choices).length === 2) {
        const [userId1, userId2] = Object.keys(games[room].choices);
        const c1 = games[room].choices[userId1];
        const c2 = games[room].choices[userId2];

        const username1 = getUsernameByUserId(room, userId1);
        const username2 = getUsernameByUserId(room, userId2);

        const rules = { rock: "scissors", scissors: "paper", paper: "rock" };
        let result;

        if (c1 === c2) {
          // Tie - reset choices and stay in choosing phase
          result = { [userId1]: "It's a tie", [userId2]: "It's a tie" };
          games[room].choices = {};
          games[room].gamePhase = 'lobby';

          // Get socket IDs for sending results
          const socketId1 = getSocketIdByUserId(room, userId1);
          const socketId2 = getSocketIdByUserId(room, userId2);

          // Save system message for tie
          const tieMsg = await saveSystemMessage(room, `${username1}: It's a tie`);
          io.to(room).emit("newMessage", tieMsg);

          if (socketId1) io.to(socketId1).emit("result", { message: result[userId1] });
          if (socketId2) io.to(socketId2).emit("result", { message: result[userId2] });
        } else {
          // Determine winner and loser (store userIds, not socket IDs)
          const winnerUserId = rules[c1] === c2 ? userId1 : userId2;
          const loserUserId = winnerUserId === userId1 ? userId2 : userId1;

          const winnerUsername = getUsernameByUserId(room, winnerUserId);
          const loserUsername = getUsernameByUserId(room, loserUserId);

          result = {
            [winnerUserId]: "You win! You may ask a truth or give a dare.",
            [loserUserId]: "You lose! Choose Truth or Dare.",
          };

          // Update game state with winner/loser (userIds)
          games[room].winner = winnerUserId;
          games[room].loser = loserUserId;
          games[room].awaitingTruthDare = true;
          games[room].truthDareSelection = null;
          games[room].gamePhase = 'result';

          // Get socket IDs for emitting events
          const winnerSocketId = getSocketIdByUserId(room, winnerUserId);
          const loserSocketId = getSocketIdByUserId(room, loserUserId);

          // Save system messages for win/lose (customized for each player)
          const winMsg = await saveSystemMessage(room, `${winnerUsername} won! ${loserUsername} must choose truth or dare.`);
          io.to(room).emit("newMessage", winMsg);

          // Send results
          if (winnerSocketId) io.to(winnerSocketId).emit("result", { message: result[winnerUserId] });
          if (loserSocketId) io.to(loserSocketId).emit("result", { message: result[loserUserId] });

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
      // Get userId from socket ID
      const currentUserId = getUserIdBySocketId(room, socket.id);
      if (!currentUserId) {
        console.error('❌ truthOrDare: Could not find userId for socket', socket.id);
        return;
      }

      const currentUsername = getUsernameByUserId(room, currentUserId);

      // Check if this user is the loser and truth/dare is awaited
      if (games[room].awaitingTruthDare && games[room].loser === currentUserId) {
        games[room].truthDareSelection = selection;
        games[room].awaitingTruthDare = false;
        games[room].gamePhase = 'chat';

        const winnerId = games[room].winner;
        const winnerUsername = getUsernameByUserId(room, winnerId);
        const winnerSocketId = getSocketIdByUserId(room, winnerId);
        const loserSocketId = getSocketIdByUserId(room, currentUserId);

        // currentUsername is the LOSER (the one making the selection)
        const loserUsername = currentUsername;

        // Send ONLY personalized messages to each player (no broadcast to room)
        // Loser sees: "You chose truth"
        if (loserSocketId) {
          const loserMsg = {
            id: uuidv4(),
            room,
            username: "System",
            content: `You chose <strong>${selection}</strong>`,
            type: "system"
          };
          io.to(loserSocketId).emit("newMessage", loserMsg);
        }

        // Winner sees: "LoserName selected truth" (NOT winnerName!)
        if (winnerSocketId) {
          const winnerMsg = {
            id: uuidv4(),
            room,
            username: "System",
            content: `${loserUsername} selected <strong>${selection}</strong>`,
            type: "system"
          };
          io.to(winnerSocketId).emit("newMessage", winnerMsg);
        }

        // Save neutral message to database for chat history
        await saveSystemMessage(room, `${currentUsername} chose <strong>${selection}</strong>`);

        // Hide modal for both players
        io.to(room).emit("hideTruthDareModal");

        // Notify both players of the selection
        io.to(room).emit("truthOrDareResponse", {
          username: currentUsername,
          selection,
        });

        // Persist state to database
        scheduleSaveGameState(room, games[room]);
      }
    });

    socket.on("sendMessage", async (msg) => {
      // Get userId from socket ID
      const currentUserId = getUserIdBySocketId(room, socket.id);
      if (!currentUserId) {
        console.error('❌ sendMessage: Could not find userId for socket', socket.id);
        return;
      }

      const currentUsername = getUsernameByUserId(room, currentUserId);
      const id = uuidv4();

      try {
        const { getDatabase } = require('./db');
        const { messages } = require('./db/schema');
        const drizzleDb = getDatabase();

        await drizzleDb.insert(messages).values({
          id,
          room,
          username: currentUsername,
          content: msg,
          type: "text",
          timestamp: new Date()
        });

        io.to(room).emit("newMessage", { id, room, username: currentUsername, content: msg, type: "text" });
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

      // Get userId from socket ID
      const currentUserId = getUserIdBySocketId(room, socket.id);
      if (!currentUserId) return;

      const currentUsername = getUsernameByUserId(room, currentUserId);
      console.log(`🔌 User "${currentUsername}" (${currentUserId}) disconnected from room ${room}`);

      // Mark user as disconnected (set socket to null, keep game state)
      // This allows the user to reconnect and restore their state
      games[room].users[currentUserId] = { socketId: null, username: currentUsername };

      // Get list of CONNECTED users (exclude those with null socket IDs)
      const connectedUsernames = Object.values(games[room].users)
        .filter(u => u.socketId !== null)
        .map(u => u.username);

      // Notify remaining connected players
      io.to(room).emit("playerUpdate", connectedUsernames);

      // If no connected users, schedule cleanup after timeout
      if (connectedUsernames.length === 0) {
        console.log(`⏱️  Room ${room} empty, scheduling cleanup in 5 minutes`);
        setTimeout(() => {
          // Check again if room still has no connected users
          if (games[room]) {
            const stillConnected = Object.values(games[room].users).filter(
              u => u.socketId !== null
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

      const currentUserId = getUserIdBySocketId(room, socket.id);
      if (!currentUserId) return;

      const currentUsername = getUsernameByUserId(room, currentUserId);
      console.log(`🚪 User "${currentUsername}" (${currentUserId}) left room ${room}`);

      // Remove user completely (intentional leave, not temporary disconnect)
      delete games[room].users[currentUserId];

      // Also clear their choices and other state
      if (games[room].choices) {
        delete games[room].choices[currentUserId];
      }

      // Reset winner/loser if they were this user
      if (games[room].winner === currentUserId) {
        games[room].winner = null;
      }
      if (games[room].loser === currentUserId) {
        games[room].loser = null;
      }

      socket.leave(room);

      // Get remaining usernames for display
      const remainingUsernames = Object.values(games[room].users).map(u => u.username);

      // Notify remaining players
      io.to(room).emit("playerUpdate", remainingUsernames);

      // If room empty, clean up immediately (no timeout)
      if (remainingUsernames.length === 0) {
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
