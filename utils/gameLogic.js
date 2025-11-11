/**
 * Game Logic Utilities
 * Rock, Paper, Scissors game logic and utilities
 */

/**
 * Determine RPS winner
 * @param {string} choice1 - Player 1's choice (rock/paper/scissors)
 * @param {string} choice2 - Player 2's choice (rock/paper/scissors)
 * @returns {number} 1 if player1 wins, 2 if player2 wins, 0 if draw
 */
function determineWinner(choice1, choice2) {
  if (choice1 === choice2) return 0; // Draw

  const winConditions = {
    rock: 'scissors',
    paper: 'rock',
    scissors: 'paper',
  };

  return winConditions[choice1] === choice2 ? 1 : 2;
}

/**
 * Validate RPS choice
 * @param {string} choice - Choice to validate
 * @returns {boolean}
 */
function isValidChoice(choice) {
  return ['rock', 'paper', 'scissors'].includes(choice);
}

/**
 * Validate truth or dare selection
 * @param {string} selection - Selection to validate
 * @returns {boolean}
 */
function isValidTruthDare(selection) {
  return ['truth', 'dare'].includes(selection);
}

/**
 * Generate unique room code
 * @returns {string} 6-character room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Check if game is complete
 * @param {Object} gameState - Game state object
 * @returns {boolean}
 */
function isGameComplete(gameState) {
  if (!gameState) return false;

  // Game is complete if both players made choices and result was determined
  return (
    gameState.status === 'completed' ||
    gameState.status === 'forfeit' ||
    (gameState.winner_id && gameState.truthDareCompleted)
  );
}

/**
 * Calculate game statistics
 * @param {Array} games - Array of game objects
 * @param {string} userId - User ID to calculate stats for
 * @returns {Object} Stats object
 */
function calculateUserGameStats(games, userId) {
  const stats = {
    totalGames: games.length,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
  };

  games.forEach(game => {
    if (game.winner_id === userId) {
      stats.wins++;
    } else if (game.winner_id && game.winner_id !== userId) {
      stats.losses++;
    } else if (game.status === 'completed' && !game.winner_id) {
      stats.draws++;
    }
  });

  if (stats.totalGames > 0) {
    stats.winRate = Math.round((stats.wins / stats.totalGames) * 100);
  }

  return stats;
}

/**
 * Format game state for client
 * @param {Object} game - Game database object
 * @returns {Object} Formatted game state
 */
function formatGameForClient(game) {
  return {
    id: game.id,
    roomCode: game.room_code,
    creatorId: game.creator_id,
    opponentId: game.opponent_id,
    status: game.status,
    currentTurn: game.current_turn,
    winnerId: game.winner_id,
    gameState: typeof game.game_state === 'string'
      ? JSON.parse(game.game_state)
      : game.game_state,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

/**
 * Create initial game state object
 * @param {string} creatorId - Creator user ID
 * @returns {Object} Initial game state
 */
function createInitialGameState(creatorId) {
  return {
    choices: {},
    chatVisible: false,
    winner: null,
    loser: null,
    truthDareSelection: null,
    awaitingTruthDare: false,
    truthDareCompleted: false,
    roundNumber: 1,
  };
}

/**
 * Update game state with RPS choice
 * @param {Object} currentState - Current game state
 * @param {string} userId - User ID making choice
 * @param {string} choice - RPS choice
 * @returns {Object} Updated game state
 */
function updateGameStateWithChoice(currentState, userId, choice) {
  const newState = { ...currentState };
  newState.choices = { ...newState.choices, [userId]: choice };
  return newState;
}

/**
 * Process RPS round and determine winner
 * @param {Object} gameState - Current game state
 * @param {string} creatorId - Creator user ID
 * @param {string} opponentId - Opponent user ID
 * @returns {Object} Updated game state with winner/loser
 */
function processRoundResult(gameState, creatorId, opponentId) {
  const newState = { ...gameState };
  const creatorChoice = newState.choices[creatorId];
  const opponentChoice = newState.choices[opponentId];

  const result = determineWinner(creatorChoice, opponentChoice);

  if (result === 0) {
    // Draw - reset choices
    newState.choices = {};
    newState.winner = null;
    newState.loser = null;
  } else if (result === 1) {
    // Creator wins
    newState.winner = creatorId;
    newState.loser = opponentId;
    newState.awaitingTruthDare = true;
    newState.chatVisible = true;
  } else {
    // Opponent wins
    newState.winner = opponentId;
    newState.loser = creatorId;
    newState.awaitingTruthDare = true;
    newState.chatVisible = true;
  }

  return newState;
}

module.exports = {
  determineWinner,
  isValidChoice,
  isValidTruthDare,
  generateRoomCode,
  isGameComplete,
  calculateUserGameStats,
  formatGameForClient,
  createInitialGameState,
  updateGameStateWithChoice,
  processRoundResult,
};
