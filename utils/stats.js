const { getDatabase } = require('../db');
const { user_stats } = require('../db/schema');
const { eq } = require('drizzle-orm');

/**
 * Update user game statistics
 * @param {Object} options - Stats update options
 * @param {string} options.userId - User ID
 * @param {boolean} options.won - Whether user won the game
 * @param {boolean} options.truthCompleted - Whether user completed a truth
 * @param {boolean} options.dareCompleted - Whether user completed a dare
 */
async function updateUserStats({ userId, won = false, truthCompleted = false, dareCompleted = false }) {
  if (!userId) {
    console.warn('⚠️  Cannot update stats: userId is required');
    return;
  }

  try {
    const db = getDatabase();

    // Get current stats
    const statsResult = await db
      .select()
      .from(user_stats)
      .where(eq(user_stats.user_id, userId))
      .limit(1);

    if (statsResult.length === 0) {
      console.warn(`⚠️  No stats found for user ${userId}`);
      return;
    }

    const currentStats = statsResult[0];

    // Calculate updates
    const updates = {
      games_played: currentStats.games_played + 1,
      games_won: currentStats.games_won + (won ? 1 : 0),
      games_lost: currentStats.games_lost + (won ? 0 : 1),
      truths_completed: currentStats.truths_completed + (truthCompleted ? 1 : 0),
      dares_completed: currentStats.dares_completed + (dareCompleted ? 1 : 0),
    };

    // Update stats
    await db
      .update(user_stats)
      .set(updates)
      .where(eq(user_stats.user_id, userId));

    console.log(`✅ Updated stats for user ${userId}:`, updates);
  } catch (error) {
    console.error('❌ Error updating user stats:', error);
  }
}

/**
 * Increment truth completed count
 * @param {string} userId - User ID
 */
async function incrementTruthCompleted(userId) {
  if (!userId) return;

  try {
    const db = getDatabase();
    const statsResult = await db
      .select()
      .from(user_stats)
      .where(eq(user_stats.user_id, userId))
      .limit(1);

    if (statsResult.length > 0) {
      await db
        .update(user_stats)
        .set({
          truths_completed: statsResult[0].truths_completed + 1,
        })
        .where(eq(user_stats.user_id, userId));
    }
  } catch (error) {
    console.error('❌ Error incrementing truth count:', error);
  }
}

/**
 * Increment dare completed count
 * @param {string} userId - User ID
 */
async function incrementDareCompleted(userId) {
  if (!userId) return;

  try {
    const db = getDatabase();
    const statsResult = await db
      .select()
      .from(user_stats)
      .where(eq(user_stats.user_id, userId))
      .limit(1);

    if (statsResult.length > 0) {
      await db
        .update(user_stats)
        .set({
          dares_completed: statsResult[0].dares_completed + 1,
        })
        .where(eq(user_stats.user_id, userId));
    }
  } catch (error) {
    console.error('❌ Error incrementing dare count:', error);
  }
}

/**
 * Record game result for two players
 * @param {Object} options - Game result options
 * @param {string} options.winnerId - Winner user ID
 * @param {string} options.loserId - Loser user ID
 */
async function recordGameResult({ winnerId, loserId }) {
  if (winnerId) {
    await updateUserStats({ userId: winnerId, won: true });
  }

  if (loserId) {
    await updateUserStats({ userId: loserId, won: false });
  }
}

/**
 * Get user statistics
 * @param {string} userId - User ID
 * @returns {Object|null} User stats object or null
 */
async function getUserStats(userId) {
  if (!userId) return null;

  try {
    const db = getDatabase();
    const statsResult = await db
      .select()
      .from(user_stats)
      .where(eq(user_stats.user_id, userId))
      .limit(1);

    if (statsResult.length === 0) {
      return null;
    }

    const stats = statsResult[0];
    return {
      gamesPlayed: stats.games_played,
      gamesWon: stats.games_won,
      gamesLost: stats.games_lost,
      truthsCompleted: stats.truths_completed,
      daresCompleted: stats.dares_completed,
      winRate: stats.games_played > 0
        ? Math.round((stats.games_won / stats.games_played) * 100)
        : 0,
    };
  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    return null;
  }
}

module.exports = {
  updateUserStats,
  incrementTruthCompleted,
  incrementDareCompleted,
  recordGameResult,
  getUserStats,
};
