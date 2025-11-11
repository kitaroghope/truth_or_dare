const { getDatabase } = require('../db');
const { users } = require('../db/schema');
const { eq } = require('drizzle-orm');

// Store online users in memory (socketId -> userId mapping)
const onlineUsers = new Map();

/**
 * Mark user as online
 * @param {string} socketId - Socket.io socket ID
 * @param {string} userId - User ID
 */
function setUserOnline(socketId, userId) {
  if (!userId) return;

  onlineUsers.set(socketId, userId);
  updateLastSeen(userId);
  console.log(`✅ User ${userId} is now online (socket: ${socketId})`);
}

/**
 * Mark user as offline
 * @param {string} socketId - Socket.io socket ID
 */
function setUserOffline(socketId) {
  const userId = onlineUsers.get(socketId);
  if (userId) {
    onlineUsers.delete(socketId);
    updateLastSeen(userId);
    console.log(`👋 User ${userId} is now offline (socket: ${socketId})`);
  }
}

/**
 * Check if user is online
 * @param {string} userId - User ID
 * @returns {boolean}
 */
function isUserOnline(userId) {
  if (!userId) return false;

  for (const [_, uid] of onlineUsers) {
    if (uid === userId) {
      return true;
    }
  }
  return false;
}

/**
 * Get all online user IDs
 * @returns {string[]}
 */
function getOnlineUserIds() {
  return [...new Set(onlineUsers.values())];
}

/**
 * Get user ID by socket ID
 * @param {string} socketId - Socket.io socket ID
 * @returns {string|null}
 */
function getUserIdBySocket(socketId) {
  return onlineUsers.get(socketId) || null;
}

/**
 * Get all socket IDs for a user
 * @param {string} userId - User ID
 * @returns {string[]}
 */
function getSocketIdsByUser(userId) {
  const socketIds = [];
  for (const [socketId, uid] of onlineUsers) {
    if (uid === userId) {
      socketIds.push(socketId);
    }
  }
  return socketIds;
}

/**
 * Update user's last_seen timestamp
 * @param {string} userId - User ID
 */
async function updateLastSeen(userId) {
  if (!userId) return;

  try {
    const db = getDatabase();
    await db
      .update(users)
      .set({ last_seen: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('Error updating last_seen:', error);
  }
}

/**
 * Heartbeat function to update last_seen for all online users
 * Should be called periodically (e.g., every minute)
 */
async function heartbeatOnlineUsers() {
  const onlineUserIds = getOnlineUserIds();

  for (const userId of onlineUserIds) {
    await updateLastSeen(userId);
  }

  console.log(`💓 Heartbeat: Updated last_seen for ${onlineUserIds.length} online users`);
}

/**
 * Get online status for multiple users
 * @param {string[]} userIds - Array of user IDs
 * @returns {Object} Map of userId -> isOnline
 */
function getBulkOnlineStatus(userIds) {
  const status = {};
  for (const userId of userIds) {
    status[userId] = isUserOnline(userId);
  }
  return status;
}

module.exports = {
  setUserOnline,
  setUserOffline,
  isUserOnline,
  getOnlineUserIds,
  getUserIdBySocket,
  getSocketIdsByUser,
  updateLastSeen,
  heartbeatOnlineUsers,
  getBulkOnlineStatus,
};
