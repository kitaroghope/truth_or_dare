const { getDatabase, schema } = require('../db');
const { eq } = require('drizzle-orm');
const { v4: uuidv4 } = require('uuid');

const { games } = schema;

/**
 * Load game state from database by room code
 * @param {string} roomCode - The room code to search for
 * @returns {Promise<Object|null>} Game state object or null if not found
 */
async function loadGameState(roomCode) {
  try {
    const db = getDatabase();

    const result = await db
      .select()
      .from(games)
      .where(eq(games.room_code, roomCode))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const game = result[0];

    // Parse game_state JSON if it exists
    const parsedState = game.game_state ?
      (typeof game.game_state === 'string' ? JSON.parse(game.game_state) : game.game_state) :
      {};

    return {
      id: game.id,
      roomCode: game.room_code,
      creatorId: game.creator_id,
      opponentId: game.opponent_id,
      status: game.status,
      currentTurn: game.current_turn,
      gamePhase: game.game_phase,
      winnerId: game.winner_id,
      gameState: parsedState,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
    };
  } catch (error) {
    console.error('❌ Error loading game state:', error);
    return null;
  }
}

/**
 * Save or update game state to database
 * @param {string} roomCode - The room code
 * @param {Object} gameState - The in-memory game state object
 * @param {Object} options - Additional options (creatorUsername, opponentUsername, etc.)
 * @returns {Promise<boolean>} Success status
 */
async function saveGameState(roomCode, gameState, options = {}) {
  try {
    const db = getDatabase();

    // Check if game exists
    const existingGame = await db
      .select()
      .from(games)
      .where(eq(games.room_code, roomCode))
      .limit(1);

    const now = new Date();

    // Prepare game_state JSON
    const gameStateJson = {
      users: gameState.users || {},
      choices: gameState.choices || {},
      winner: gameState.winner || null,
      loser: gameState.loser || null,
      chatVisible: gameState.chatVisible || false,
      awaitingTruthDare: gameState.awaitingTruthDare || false,
      truthDareSelection: gameState.truthDareSelection || null,
    };

    // Determine game phase based on state
    let gamePhase = gameState.gamePhase || 'lobby';
    if (gameState.gameState === 'waiting') {
      gamePhase = 'lobby';
    } else if (gameState.gameState === 'choosing') {
      gamePhase = 'choosing';
    } else if (gameState.awaitingTruthDare) {
      gamePhase = 'truth_dare_selection';
    } else if (gameState.chatVisible) {
      gamePhase = 'chat';
    } else if (gameState.gameState === 'completed') {
      gamePhase = 'completed';
    }

    if (existingGame.length > 0) {
      // Update existing game
      await db
        .update(games)
        .set({
          game_state: JSON.stringify(gameStateJson),
          game_phase: gamePhase,
          status: gameState.gameState === 'completed' ? 'completed' : 'in_progress',
          updated_at: now,
        })
        .where(eq(games.room_code, roomCode));

      console.log(`✅ Game state saved for room: ${roomCode} (phase: ${gamePhase})`);
      return true;
    } else {
      // Create new game
      const gameId = uuidv4();

      await db.insert(games).values({
        id: gameId,
        room_code: roomCode,
        creator_id: options.creatorId || null,
        opponent_id: options.opponentId || null,
        status: 'in_progress',
        current_turn: null,
        game_state: JSON.stringify(gameStateJson),
        game_phase: gamePhase,
        winner_id: null,
        created_at: now,
        updated_at: now,
      });

      console.log(`✅ New game created for room: ${roomCode} (phase: ${gamePhase})`);
      return true;
    }
  } catch (error) {
    console.error('❌ Error saving game state:', error);
    return false;
  }
}

/**
 * Update only the game phase without changing other data
 * @param {string} roomCode - The room code
 * @param {string} phase - New game phase
 * @returns {Promise<boolean>} Success status
 */
async function syncGamePhase(roomCode, phase) {
  try {
    const db = getDatabase();
    const now = new Date();

    await db
      .update(games)
      .set({
        game_phase: phase,
        updated_at: now,
      })
      .where(eq(games.room_code, roomCode));

    console.log(`✅ Game phase updated to: ${phase} for room: ${roomCode}`);
    return true;
  } catch (error) {
    console.error('❌ Error updating game phase:', error);
    return false;
  }
}

/**
 * Create or update a game record with user IDs
 * Useful for ensuring a game exists and has proper user associations
 * @param {string} roomCode - The room code
 * @param {Object} gameState - Current in-memory game state
 * @param {string} userId - User ID of the joining user
 * @param {string} username - Username of the joining user
 * @returns {Promise<string|null>} Game ID or null on failure
 */
async function createOrUpdateGame(roomCode, gameState, userId, username) {
  try {
    const db = getDatabase();
    const userType = userId?.startsWith('anon_') ? 'anonymous' : 'authenticated';

    console.log(`💾 [DB SYNC] Syncing game for room ${roomCode}, user ${username} (${userType}: ${userId})`);

    const existingGame = await db
      .select()
      .from(games)
      .where(eq(games.room_code, roomCode))
      .limit(1);

    const now = new Date();
    const userIds = Object.keys(gameState.users || {});

    // Determine creator and opponent based on join order
    let creatorId = null;
    let opponentId = null;

    if (userIds.length === 1) {
      // First user is creator
      creatorId = userIds[0];
      console.log(`👤 [DB SYNC] Single user - setting as creator: ${creatorId}`);
    } else if (userIds.length === 2) {
      // Two users: assign creator and opponent
      creatorId = userIds[0];
      opponentId = userIds[1];
      console.log(`👥 [DB SYNC] Two users - creator: ${creatorId}, opponent: ${opponentId}`);
    }

    if (existingGame.length > 0) {
      console.log(`🔄 [DB SYNC] Game exists in database, updating...`);
      console.log(`   Existing - creator: ${existingGame[0].creator_id}, opponent: ${existingGame[0].opponent_id}`);

      // Update existing game with participant info
      const updates = {
        updated_at: now,
      };

      // Only update opponent_id if it's null and we have a second player
      if (!existingGame[0].opponent_id && opponentId) {
        updates.opponent_id = opponentId;
        updates.status = 'in_progress';
        console.log(`   ➕ Adding opponent: ${opponentId}, status → in_progress`);
      }

      await db
        .update(games)
        .set(updates)
        .where(eq(games.room_code, roomCode));

      console.log(`✅ [DB SYNC] Game record updated for room: ${roomCode}`);
      return existingGame[0].id;
    }

    // Create new game
    console.log(`🆕 [DB SYNC] Creating new game record...`);
    const gameId = uuidv4();

    await db.insert(games).values({
      id: gameId,
      room_code: roomCode,
      creator_id: creatorId,
      opponent_id: opponentId,
      status: userIds.length === 2 ? 'in_progress' : 'waiting',
      current_turn: null,
      game_state: JSON.stringify({
        users: gameState.users || {},
        choices: gameState.choices || {},
        winner: gameState.winner || null,
        loser: gameState.loser || null,
        chatVisible: gameState.chatVisible || false,
        awaitingTruthDare: gameState.awaitingTruthDare || false,
        truthDareSelection: gameState.truthDareSelection || null,
      }),
      game_phase: gameState.gamePhase || 'lobby',
      winner_id: null,
      created_at: now,
      updated_at: now,
    });

    console.log(`✅ [DB SYNC] Game record created - ID: ${gameId}, Room: ${roomCode}`);
    console.log(`   Creator: ${creatorId || 'NULL'}`);
    console.log(`   Opponent: ${opponentId || 'waiting'}`);
    console.log(`   Status: ${userIds.length === 2 ? 'in_progress' : 'waiting'}`);

    return gameId;
  } catch (error) {
    console.error('❌ [DB SYNC] Error creating/updating game:', error);
    return null;
  }
}

/**
 * Delete old/abandoned games from the database
 * Call this periodically to cleanup
 * @param {number} hoursOld - Delete games older than this many hours
 * @returns {Promise<number>} Number of games deleted
 */
async function cleanupOldGames(hoursOld = 24) {
  try {
    const db = getDatabase();
    const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);

    // For SQLite, we need to handle the timestamp differently
    const dbType = process.env.DATABASE_TYPE || 'sqlite';

    if (dbType === 'sqlite') {
      // SQLite uses INTEGER timestamps (Unix epoch in seconds)
      const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

      const result = await db
        .delete(games)
        .where(eq(games.updated_at, cutoffTimestamp))
        .returning();

      console.log(`🧹 Cleaned up ${result.length} old games`);
      return result.length;
    } else {
      // PostgreSQL uses proper timestamps
      const { sql } = require('drizzle-orm');

      const result = await db
        .delete(games)
        .where(sql`${games.updated_at} < ${cutoffDate}`)
        .returning();

      console.log(`🧹 Cleaned up ${result.length} old games`);
      return result.length;
    }
  } catch (error) {
    console.error('❌ Error cleaning up old games:', error);
    return 0;
  }
}

/**
 * Debounced save function to prevent excessive database writes
 * Usage: const debouncedSave = debouncedSaveGameState();
 *        debouncedSave(roomCode, gameState, options);
 */
function debouncedSaveGameState(delay = 500) {
  const timers = {}; // Track timers per room

  return function (roomCode, gameState, options = {}) {
    // Clear existing timer for this room
    if (timers[roomCode]) {
      clearTimeout(timers[roomCode]);
    }

    // Set new timer
    timers[roomCode] = setTimeout(() => {
      saveGameState(roomCode, gameState, options);
      delete timers[roomCode];
    }, delay);
  };
}

module.exports = {
  loadGameState,
  saveGameState,
  syncGamePhase,
  createOrUpdateGame,
  cleanupOldGames,
  debouncedSaveGameState,
};
