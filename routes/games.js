const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { games, game_moves, users, notifications } = require('../db/schema');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { eq, and, or, desc, sql } = require('drizzle-orm');
const {
  generateRoomCode,
  isValidChoice,
  isValidTruthDare,
  formatGameForClient,
  createInitialGameState,
  updateGameStateWithChoice,
  processRoundResult,
} = require('../utils/gameLogic');
const { recordGameResult, incrementTruthCompleted, incrementDareCompleted } = require('../utils/stats');
const { sendGameInvitationEmail } = require('../utils/email');

const router = express.Router();

/**
 * Helper function to create notification
 */
async function createNotification(db, userId, type, title, body, data = {}) {
  if (!userId) return;

  try {
    await db.insert(notifications).values({
      id: uuidv4(),
      user_id: userId,
      type,
      title,
      body,
      data: JSON.stringify(data),
      read: false,
      created_at: new Date(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

/**
 * POST /api/games/create
 * Create a new game
 */
router.post('/create', optionalAuth, async (req, res) => {
  try {
    const creatorId = req.user?.id || null;
    const db = getDatabase();

    // Generate unique room code
    let roomCode;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      roomCode = generateRoomCode();
      const existing = await db
        .select()
        .from(games)
        .where(eq(games.room_code, roomCode))
        .limit(1);

      if (existing.length === 0) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts === maxAttempts) {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to generate unique room code',
      });
    }

    // Create game
    const gameId = uuidv4();
    const now = new Date();
    const initialState = createInitialGameState(creatorId);

    await db.insert(games).values({
      id: gameId,
      room_code: roomCode,
      creator_id: creatorId,
      opponent_id: null,
      status: 'waiting',
      current_turn: null,
      game_state: JSON.stringify(initialState),
      winner_id: null,
      created_at: now,
      updated_at: now,
    });

    res.status(201).json({
      message: 'Game created successfully',
      game: {
        id: gameId,
        roomCode,
        status: 'waiting',
        gameState: initialState,
      },
    });
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create game',
    });
  }
});

/**
 * POST /api/games/join/:roomCode
 * Join an existing game
 */
router.post('/join/:roomCode', optionalAuth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const opponentId = req.user?.id || null;
    const db = getDatabase();

    // Find game
    const gameResult = await db
      .select()
      .from(games)
      .where(eq(games.room_code, roomCode))
      .limit(1);

    if (gameResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Game not found',
      });
    }

    const game = gameResult[0];

    // Check if game is joinable
    if (game.status !== 'waiting') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Game is not accepting players',
      });
    }

    if (game.opponent_id) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Game is full',
      });
    }

    // Update game with opponent
    const now = new Date();
    await db
      .update(games)
      .set({
        opponent_id: opponentId,
        status: 'in_progress',
        current_turn: game.creator_id || opponentId,
        updated_at: now,
      })
      .where(eq(games.id, game.id));

    // Create notification for creator if they're authenticated
    if (game.creator_id) {
      await createNotification(
        db,
        game.creator_id,
        'game_joined',
        'Someone joined your game!',
        `A player has joined your game ${roomCode}`,
        { gameId: game.id, roomCode }
      );
    }

    res.status(200).json({
      message: 'Joined game successfully',
      game: {
        id: game.id,
        roomCode: game.room_code,
        status: 'in_progress',
      },
    });
  } catch (error) {
    console.error('Join game error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to join game',
    });
  }
});

/**
 * GET /api/games/:gameId
 * Get game state
 */
router.get('/:gameId', optionalAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const db = getDatabase();

    const gameResult = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (gameResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Game not found',
      });
    }

    const game = formatGameForClient(gameResult[0]);

    res.status(200).json({ game });
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch game',
    });
  }
});

/**
 * POST /api/games/:gameId/move
 * Make a move (RPS choice)
 */
router.post('/:gameId/move', optionalAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { choice } = req.body;
    const userId = req.user?.id || req.body.anonymousId; // Support anonymous users
    const db = getDatabase();

    // Validate choice
    if (!isValidChoice(choice)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid choice. Must be rock, paper, or scissors',
      });
    }

    // Get game
    const gameResult = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (gameResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Game not found',
      });
    }

    const game = gameResult[0];

    // Validate game status
    if (game.status !== 'in_progress') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Game is not in progress',
      });
    }

    // Parse game state
    const gameState = typeof game.game_state === 'string'
      ? JSON.parse(game.game_state)
      : game.game_state;

    // Update game state with choice
    const updatedState = updateGameStateWithChoice(gameState, userId, choice);

    // Record move
    await db.insert(game_moves).values({
      id: uuidv4(),
      game_id: gameId,
      user_id: req.user?.id || null,
      move_type: 'rps',
      move_data: JSON.stringify({ choice }),
      timestamp: new Date(),
    });

    // Check if both players have made their choice
    const creatorId = game.creator_id;
    const opponentId = game.opponent_id;

    if (updatedState.choices[creatorId] && updatedState.choices[opponentId]) {
      // Process round result
      const finalState = processRoundResult(updatedState, creatorId, opponentId);

      // Update game
      await db
        .update(games)
        .set({
          game_state: JSON.stringify(finalState),
          updated_at: new Date(),
        })
        .where(eq(games.id, gameId));

      // Notify opponent if they're authenticated
      const opponentUserId = userId === creatorId ? opponentId : creatorId;
      if (opponentUserId) {
        await createNotification(
          db,
          opponentUserId,
          'game_round_result',
          'Round Complete!',
          finalState.winner === opponentUserId
            ? 'You won the round! Choose truth or dare.'
            : 'Your opponent won the round.',
          { gameId, roomCode: game.room_code }
        );
      }

      res.status(200).json({
        message: 'Move recorded and round processed',
        roundResult: {
          winner: finalState.winner,
          loser: finalState.loser,
          awaitingTruthDare: finalState.awaitingTruthDare,
        },
      });
    } else {
      // Update game state only
      await db
        .update(games)
        .set({
          game_state: JSON.stringify(updatedState),
          updated_at: new Date(),
        })
        .where(eq(games.id, gameId));

      res.status(200).json({
        message: 'Move recorded. Waiting for opponent.',
      });
    }
  } catch (error) {
    console.error('Make move error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to record move',
    });
  }
});

/**
 * POST /api/games/:gameId/truth-dare
 * Select truth or dare
 */
router.post('/:gameId/truth-dare', optionalAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { selection } = req.body;
    const userId = req.user?.id || req.body.anonymousId;
    const db = getDatabase();

    // Validate selection
    if (!isValidTruthDare(selection)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid selection. Must be truth or dare',
      });
    }

    // Get game
    const gameResult = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (gameResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Game not found',
      });
    }

    const game = gameResult[0];
    const gameState = typeof game.game_state === 'string'
      ? JSON.parse(game.game_state)
      : game.game_state;

    // Verify user is the winner
    if (gameState.winner !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the winner can select truth or dare',
      });
    }

    // Update game state
    gameState.truthDareSelection = selection;

    await db
      .update(games)
      .set({
        game_state: JSON.stringify(gameState),
        updated_at: new Date(),
      })
      .where(eq(games.id, gameId));

    // Record move
    await db.insert(game_moves).values({
      id: uuidv4(),
      game_id: gameId,
      user_id: req.user?.id || null,
      move_type: selection,
      move_data: JSON.stringify({ selection }),
      timestamp: new Date(),
    });

    res.status(200).json({
      message: `${selection} selected`,
      selection,
    });
  } catch (error) {
    console.error('Truth/dare selection error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to record selection',
    });
  }
});

/**
 * POST /api/games/:gameId/complete
 * Complete truth/dare and end round
 */
router.post('/:gameId/complete', optionalAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user?.id || req.body.anonymousId;
    const db = getDatabase();

    // Get game
    const gameResult = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (gameResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Game not found',
      });
    }

    const game = gameResult[0];
    const gameState = typeof game.game_state === 'string'
      ? JSON.parse(game.game_state)
      : game.game_state;

    // Mark truth/dare as completed
    gameState.truthDareCompleted = true;

    // Update game
    await db
      .update(games)
      .set({
        game_state: JSON.stringify(gameState),
        winner_id: gameState.winner,
        status: 'completed',
        updated_at: new Date(),
      })
      .where(eq(games.id, gameId));

    // Update stats if users are authenticated
    if (game.creator_id && game.opponent_id) {
      await recordGameResult({
        winnerId: gameState.winner === game.creator_id ? game.creator_id : game.opponent_id,
        loserId: gameState.loser === game.creator_id ? game.creator_id : game.opponent_id,
      });

      // Update truth/dare stats
      if (gameState.truthDareSelection === 'truth' && gameState.loser) {
        if (gameState.loser === game.creator_id) {
          await incrementTruthCompleted(game.creator_id);
        } else {
          await incrementTruthCompleted(game.opponent_id);
        }
      } else if (gameState.truthDareSelection === 'dare' && gameState.loser) {
        if (gameState.loser === game.creator_id) {
          await incrementDareCompleted(game.creator_id);
        } else {
          await incrementDareCompleted(game.opponent_id);
        }
      }
    }

    res.status(200).json({
      message: 'Game completed',
    });
  } catch (error) {
    console.error('Complete game error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to complete game',
    });
  }
});

/**
 * GET /api/games/history
 * Get game history for authenticated user
 */
router.get('/history/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;
    const db = getDatabase();

    const gamesResult = await db
      .select()
      .from(games)
      .where(
        and(
          or(
            eq(games.creator_id, userId),
            eq(games.opponent_id, userId)
          ),
          eq(games.status, 'completed')
        )
      )
      .orderBy(desc(games.updated_at))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const formattedGames = gamesResult.map(game => formatGameForClient(game));

    res.status(200).json({
      games: formattedGames,
      total: gamesResult.length,
    });
  } catch (error) {
    console.error('Get game history error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch game history',
    });
  }
});

/**
 * POST /api/games/:gameId/invite
 * Send email invitation to play game
 */
router.post('/:gameId/invite', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { email } = req.body;
    const db = getDatabase();

    if (!email) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email is required',
      });
    }

    // Get game
    const gameResult = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (gameResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Game not found',
      });
    }

    const game = gameResult[0];

    // Send invitation email
    await sendGameInvitationEmail({
      to: email,
      inviterName: req.user.username,
      roomCode: game.room_code,
    });

    res.status(200).json({
      message: 'Invitation sent',
    });
  } catch (error) {
    console.error('Send game invitation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send invitation',
    });
  }
});

/**
 * DELETE /api/games/:gameId
 * Forfeit/leave game
 */
router.delete('/:gameId', optionalAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user?.id || req.body.anonymousId;
    const db = getDatabase();

    // Get game
    const gameResult = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (gameResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Game not found',
      });
    }

    const game = gameResult[0];

    // Update game status
    await db
      .update(games)
      .set({
        status: 'forfeit',
        updated_at: new Date(),
      })
      .where(eq(games.id, gameId));

    res.status(200).json({
      message: 'Game forfeited',
    });
  } catch (error) {
    console.error('Forfeit game error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to forfeit game',
    });
  }
});

module.exports = router;
