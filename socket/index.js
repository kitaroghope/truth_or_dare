const { verifyAccessToken } = require('../utils/jwt');
const { setUserOnline, setUserOffline, getSocketIdsByUser } = require('../utils/onlineStatus');
const { getDatabase } = require('../db');
const { users } = require('../db/schema');
const { eq } = require('drizzle-orm');

/**
 * Socket.io authentication middleware
 * Supports both authenticated users (with JWT token) and anonymous users
 */
async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      // Allow anonymous users
      socket.userId = null;
      socket.isAuthenticated = false;
      console.log(`🔓 Anonymous socket connected: ${socket.id}`);
      return next();
    }

    // Verify JWT token
    try {
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.userId;
      socket.isAuthenticated = true;

      // Get user details
      const db = getDatabase();
      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);

      if (userResult.length > 0) {
        socket.username = userResult[0].username;
        socket.userEmail = userResult[0].email;
      }

      console.log(`🔐 Authenticated socket connected: ${socket.id} (User: ${socket.username})`);
      next();
    } catch (error) {
      console.warn(`⚠️  Invalid token for socket ${socket.id}: ${error.message}`);
      // Still allow connection but as anonymous
      socket.userId = null;
      socket.isAuthenticated = false;
      next();
    }
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
}

/**
 * Setup Socket.io event handlers
 */
function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`✅ Socket connected: ${socket.id} ${socket.isAuthenticated ? '(Authenticated)' : '(Anonymous)'}`);

    // Track online status for authenticated users
    if (socket.isAuthenticated && socket.userId) {
      setUserOnline(socket.id, socket.userId);

      // Notify friends that user is online
      socket.broadcast.emit('user:online', {
        userId: socket.userId,
        username: socket.username,
      });
    }

    /**
     * Join a room
     */
    socket.on('room:join', ({ room, username }) => {
      socket.join(room);
      socket.currentRoom = room;
      socket.displayUsername = username || socket.username || 'Anonymous';

      console.log(`👤 ${socket.displayUsername} joined room: ${room}`);

      // Notify others in the room
      socket.to(room).emit('room:user-joined', {
        username: socket.displayUsername,
        userId: socket.userId,
        socketId: socket.id,
      });

      // Send room info back to user
      const roomSockets = io.sockets.adapter.rooms.get(room);
      socket.emit('room:joined', {
        room,
        userCount: roomSockets ? roomSockets.size : 0,
      });
    });

    /**
     * Leave a room
     */
    socket.on('room:leave', ({ room }) => {
      socket.leave(room);
      socket.to(room).emit('room:user-left', {
        username: socket.displayUsername,
        userId: socket.userId,
        socketId: socket.id,
      });
      console.log(`👋 ${socket.displayUsername} left room: ${room}`);
    });

    /**
     * Send chat message
     */
    socket.on('chat:message', ({ room, message, type }) => {
      const messageData = {
        id: require('uuid').v4(),
        room,
        username: socket.displayUsername,
        userId: socket.userId,
        content: message,
        type: type || 'text',
        timestamp: new Date().toISOString(),
      };

      // Broadcast to room (including sender)
      io.to(room).emit('chat:new-message', messageData);
      console.log(`💬 Message in ${room} from ${socket.displayUsername}`);
    });

    /**
     * Game: Make RPS choice
     */
    socket.on('game:choice', ({ room, choice }) => {
      console.log(`🎮 ${socket.displayUsername} made choice in ${room}: ${choice}`);

      // Broadcast to room (excluding sender)
      socket.to(room).emit('game:opponent-ready', {
        username: socket.displayUsername,
        userId: socket.userId,
      });

      // If both players ready, the game logic in API will handle winner determination
    });

    /**
     * Game: Truth or Dare selection
     */
    socket.on('game:truth-dare', ({ room, selection }) => {
      console.log(`🎯 ${socket.displayUsername} selected ${selection} in ${room}`);

      io.to(room).emit('game:truth-dare-selected', {
        username: socket.displayUsername,
        userId: socket.userId,
        selection,
      });
    });

    /**
     * Game: Round complete
     */
    socket.on('game:round-complete', ({ room, winner, loser }) => {
      io.to(room).emit('game:round-result', {
        winner,
        loser,
      });
    });

    /**
     * Game: Start new round
     */
    socket.on('game:new-round', ({ room }) => {
      io.to(room).emit('game:round-started', {
        timestamp: new Date().toISOString(),
      });
      console.log(`🔄 New round started in ${room}`);
    });

    /**
     * Typing indicator
     */
    socket.on('chat:typing', ({ room, isTyping }) => {
      socket.to(room).emit('chat:user-typing', {
        username: socket.displayUsername,
        userId: socket.userId,
        isTyping,
      });
    });

    /**
     * Friend request notification (real-time)
     */
    socket.on('friend:request-sent', ({ recipientId }) => {
      // Find recipient's socket(s)
      const recipientSockets = getSocketIdsByUser(recipientId);
      recipientSockets.forEach(socketId => {
        io.to(socketId).emit('friend:request-received', {
          senderId: socket.userId,
          senderUsername: socket.username,
          timestamp: new Date().toISOString(),
        });
      });
      console.log(`👥 Friend request sent from ${socket.username} to user ${recipientId}`);
    });

    /**
     * Friend request accepted notification (real-time)
     */
    socket.on('friend:request-accepted', ({ senderId }) => {
      const senderSockets = getSocketIdsByUser(senderId);
      senderSockets.forEach(socketId => {
        io.to(socketId).emit('friend:request-accepted-notification', {
          accepterId: socket.userId,
          accepterUsername: socket.username,
          timestamp: new Date().toISOString(),
        });
      });
      console.log(`✅ Friend request accepted by ${socket.username} for user ${senderId}`);
    });

    /**
     * New notification (real-time push)
     */
    socket.on('notification:send', ({ userId, notification }) => {
      const userSockets = getSocketIdsByUser(userId);
      userSockets.forEach(socketId => {
        io.to(socketId).emit('notification:new', notification);
      });
    });

    /**
     * Get online friends
     */
    socket.on('friends:get-online', async () => {
      if (!socket.isAuthenticated) {
        return socket.emit('error', { message: 'Authentication required' });
      }

      // This would typically query the database for friends
      // and check their online status
      // For now, we'll emit an event that the client can handle
      socket.emit('friends:online-status', {
        // Will be populated by client polling /api/friends/online
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * User activity heartbeat
     */
    socket.on('user:heartbeat', () => {
      if (socket.isAuthenticated && socket.userId) {
        setUserOnline(socket.id, socket.userId);
      }
    });

    /**
     * Disconnect handler
     */
    socket.on('disconnect', (reason) => {
      console.log(`❌ Socket disconnected: ${socket.id} (Reason: ${reason})`);

      // Mark user as offline
      if (socket.isAuthenticated && socket.userId) {
        setUserOffline(socket.id);

        // Notify friends that user is offline
        socket.broadcast.emit('user:offline', {
          userId: socket.userId,
          username: socket.username,
        });
      }

      // Notify room if user was in one
      if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit('room:user-left', {
          username: socket.displayUsername,
          userId: socket.userId,
          socketId: socket.id,
        });
      }
    });

    /**
     * Error handler
     */
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  return io;
}

module.exports = {
  authenticateSocket,
  setupSocketHandlers,
};
