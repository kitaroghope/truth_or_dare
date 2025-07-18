// Project: rps_socket_room_links + chat with SQLite + file & voice note support
// Dependencies: express, socket.io, sqlite3, uuid, multer

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin authentication
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const adminSessions = new Set();

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
app.get("/api/admin/conversations", requireAdminAuth, (req, res) => {
  db.all("SELECT * FROM messages ORDER BY timestamp DESC", [], (err, rows) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    // Calculate statistics
    const stats = {
      totalMessages: rows.length,
      totalRooms: new Set(rows.map(row => row.room)).size,
      totalUsers: new Set(rows.map(row => row.username)).size,
      totalFiles: rows.filter(row => row.type === 'file' || row.type === 'audio').length
    };

    res.json({
      conversations: rows,
      stats: stats
    });
  });
});

app.delete("/api/admin/conversations", requireAdminAuth, (req, res) => {
  db.run("DELETE FROM messages", [], function(err) {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json({ 
      success: true, 
      message: `Deleted ${this.changes} messages` 
    });
  });
});
// SQLite setup
const db = new sqlite3.Database("chat.db");
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT,
    room TEXT,
    username TEXT,
    content TEXT,
    type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
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
app.post("/upload/:room/:username", upload.single("file"), (req, res) => {
  const { room, username } = req.params;
  const fileUrl = `/uploads/${req.file.filename}`;
  const id = uuidv4();
  const type = req.file.mimetype.startsWith("audio/") ? "audio" : "file";

  db.run(
    "INSERT INTO messages (id, room, username, content, type) VALUES (?, ?, ?, ?, ?)",
    [id, room, username, fileUrl, type],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      io.to(room).emit("newMessage", { id, room, username, content: fileUrl, type });
      res.json({ success: true, fileUrl });
    }
  );
});

const games = {}; // { roomName: { users: {}, choices: {}, chatVisible: false, gameState: 'waiting', winner: null, loser: null, truthDareSelection: null } }

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ room, username }) => {
    if (!games[room]) {
      games[room] = { 
        users: {}, 
        choices: {}, 
        chatVisible: false, 
        gameState: 'waiting', 
        winner: null, 
        loser: null, 
        truthDareSelection: null,
        awaitingTruthDare: false 
      };
    }

    // Check if user is rejoining (same username exists)
    const existingSocketId = Object.keys(games[room].users).find(id => games[room].users[id] === username);
    const isRejoining = existingSocketId !== undefined;
    
    if (isRejoining) {
      // User is rejoining - update socket ID but keep game state
      delete games[room].users[existingSocketId];
      delete games[room].choices[existingSocketId];
      
      // Update winner/loser references if they were the rejoining user
      if (games[room].winner === existingSocketId) {
        games[room].winner = socket.id;
      }
      if (games[room].loser === existingSocketId) {
        games[room].loser = socket.id;
      }
    } else {
      // New user joining
      const nameExists = Object.values(games[room].users).includes(username);
      if (nameExists) {
        socket.emit("nameExists");
        return;
      }

      const userCount = Object.keys(games[room].users).length;
      if (userCount >= 2) {
        socket.emit("roomFull");
        return;
      }
    }

    games[room].users[socket.id] = username;
    socket.join(room);
    io.to(room).emit("playerUpdate", Object.values(games[room].users));

    // Send previous messages
    db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC", [room], (err, rows) => {
      if (!err) socket.emit("previousMessages", rows);
    });

    // Send current game state including truth/dare modal state
    if (games[room].awaitingTruthDare) {
      const isLoser = games[room].loser === socket.id;
      const isWinner = games[room].winner === socket.id;
      
      if (isLoser && !games[room].truthDareSelection) {
        socket.emit("showTruthDareModal", { type: "choose" });
      } else if (isWinner && !games[room].truthDareSelection) {
        socket.emit("showTruthDareModal", { type: "waiting" });
      }
    }
    
    // Send current game state to rejoining user
    if (isRejoining) {
      socket.emit("chatVisible", games[room].chatVisible);
      
      // If game is finished, show appropriate state
      if (games[room].chatVisible && !games[room].awaitingTruthDare) {
        socket.emit("gameStateUpdate", { state: "finished" });
      }
    }

    socket.on("makeChoice", (choice) => {
      games[room].choices[socket.id] = choice;
      if (Object.keys(games[room].choices).length === 2) {
        const [id1, id2] = Object.keys(games[room].choices);
        const c1 = games[room].choices[id1];
        const c2 = games[room].choices[id2];

        const rules = { rock: "scissors", scissors: "paper", paper: "rock" };
        let result;

        if (c1 === c2) {
          result = { [id1]: "It's a tie", [id2]: "It's a tie" };
          games[room].choices = {};
        } else {
          const winner = rules[c1] === c2 ? id1 : id2;
          const loser = winner === id1 ? id2 : id1;
          result = {
            [winner]: "You win! You may ask a truth or give a dare.",
            [loser]: "You lose! Choose Truth or Dare.",
          };
          
          // Store winner and loser for Truth or Dare modal
          games[room].winner = winner;
          games[room].loser = loser;
          games[room].awaitingTruthDare = true;
          games[room].truthDareSelection = null;
          
          // Show modal to loser, waiting state to winner
          io.to(loser).emit("showTruthDareModal", { type: "choose" });
          io.to(winner).emit("showTruthDareModal", { type: "waiting" });
        }

        io.to(id1).emit("result", { message: result[id1] });
        io.to(id2).emit("result", { message: result[id2] });

        if (c1 !== c2) {
          games[room].chatVisible = true;
          io.to(room).emit("chatVisible", true);
        }
        games[room].choices = {};
      }
    });

    socket.on("truthOrDare", (selection) => {
      if (games[room].awaitingTruthDare && games[room].loser === socket.id) {
        games[room].truthDareSelection = selection;
        games[room].awaitingTruthDare = false;
        
        // Hide modal for both players
        io.to(room).emit("hideTruthDareModal");
        
        // Notify both players of the selection
        io.to(room).emit("truthOrDareResponse", {
          username: games[room].users[socket.id],
          selection,
        });
      }
    });

    socket.on("sendMessage", (msg) => {
      const username = games[room].users[socket.id];
      const id = uuidv4();
      db.run("INSERT INTO messages (id, room, username, content, type) VALUES (?, ?, ?, ?, ?)", [id, room, username, msg, "text"], (err) => {
        if (!err) {
          io.to(room).emit("newMessage", { id, room, username, content: msg, type: "text" });
        }
      });
    });

    socket.on("startNewRound", () => {
      games[room].chatVisible = false;
      games[room].awaitingTruthDare = false;
      games[room].winner = null;
      games[room].loser = null;
      games[room].truthDareSelection = null;
      games[room].gameState = 'waiting';
      games[room].choices = {}; // Clear any pending choices
      io.to(room).emit("chatVisible", false);
      io.to(room).emit("hideTruthDareModal");
      io.to(room).emit("clearResultMessage"); // Clear result message for all players
      io.to(room).emit("gameStateUpdate", { state: "waiting" });
    });

    socket.on("disconnect", () => {
      if (games[room]) {
        delete games[room].users[socket.id];
        delete games[room].choices[socket.id];
        if (Object.keys(games[room].users).length === 0) {
          delete games[room];
        } else {
          io.to(room).emit("playerUpdate", Object.values(games[room].users));
        }
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

server.listen(port, () => {
  console.log("Server running at http://localhost:" + port);
});
