/**
 * Game Client with WebSocket and REST API Fallback
 *
 * This module provides a unified interface for real-time gameplay
 * that automatically falls back to REST API polling when WebSocket
 * is unavailable.
 *
 * Usage:
 * const client = new GameClient({ token: 'your-jwt-token' });
 * await client.connect();
 * client.on('game:move', (data) => console.log(data));
 * await client.makeMove(gameId, 'rock');
 */

class GameClient extends EventTarget {
  constructor(options = {}) {
    super();
    this.token = options.token || null;
    this.apiBaseUrl = options.apiBaseUrl || window.location.origin;
    this.pollingInterval = options.pollingInterval || 3000; // 3 seconds
    this.useWebSocket = options.useWebSocket !== false; // Default to true

    this.socket = null;
    this.isConnected = false;
    this.isAuthenticated = !!this.token;
    this.pollingTimers = new Map();
    this.lastGameState = new Map();
    this.connectionMode = null; // 'websocket' or 'rest'
  }

  /**
   * Connect to the game server
   * Attempts WebSocket first, falls back to REST if unavailable
   */
  async connect() {
    if (this.useWebSocket) {
      try {
        await this._connectWebSocket();
        this.connectionMode = 'websocket';
        console.log('✅ Connected via WebSocket');
        return true;
      } catch (error) {
        console.warn('⚠️  WebSocket connection failed, falling back to REST API');
        this._fallbackToRest();
        return true;
      }
    } else {
      this._fallbackToRest();
      return true;
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear all polling timers
    this.pollingTimers.forEach(timer => clearInterval(timer));
    this.pollingTimers.clear();

    this.isConnected = false;
    this.connectionMode = null;
    console.log('❌ Disconnected from server');
  }

  /**
   * Join a game room
   */
  async joinRoom(roomCode, username) {
    if (this.connectionMode === 'websocket' && this.socket) {
      return new Promise((resolve) => {
        this.socket.emit('room:join', { room: roomCode, username });
        this.socket.once('room:joined', resolve);
      });
    } else {
      // REST: Join via API
      const response = await this._apiRequest('POST', `/api/games/join/${roomCode}`, {
        username: username || 'Anonymous',
      });

      // Start polling for this game
      this._startGamePolling(response.game.id);

      return response;
    }
  }

  /**
   * Make a game move (rock, paper, scissors)
   */
  async makeMove(gameId, choice) {
    if (this.connectionMode === 'websocket' && this.socket) {
      this.socket.emit('game:choice', { room: gameId, choice });
      return { success: true };
    } else {
      // REST: Make move via API
      const response = await this._apiRequest('POST', `/api/games/${gameId}/move`, {
        move: choice,
      });

      // Trigger immediate poll to get updated state
      await this._pollGameState(gameId);

      return response;
    }
  }

  /**
   * Select truth or dare
   */
  async selectTruthDare(gameId, selection) {
    if (this.connectionMode === 'websocket' && this.socket) {
      this.socket.emit('game:truth-dare', { room: gameId, selection });
      return { success: true };
    } else {
      // REST: Select via API
      const response = await this._apiRequest('POST', `/api/games/${gameId}/truth-dare`, {
        selection,
      });

      await this._pollGameState(gameId);
      return response;
    }
  }

  /**
   * Send chat message
   */
  async sendMessage(roomCode, message) {
    if (this.connectionMode === 'websocket' && this.socket) {
      this.socket.emit('chat:message', { room: roomCode, message });
      return { success: true };
    } else {
      // REST: Messages are not supported via REST in current implementation
      // You would need to add a messages API endpoint
      console.warn('⚠️  Chat messages not supported in REST mode');
      return { success: false, error: 'Chat not supported in REST mode' };
    }
  }

  /**
   * Get game state (REST only, WebSocket receives updates automatically)
   */
  async getGameState(gameId) {
    const response = await this._apiRequest('GET', `/api/games/${gameId}`);
    return response.game;
  }

  /**
   * Get game history
   */
  async getGameHistory() {
    if (!this.isAuthenticated) {
      throw new Error('Authentication required for game history');
    }
    const response = await this._apiRequest('GET', '/api/games/history/me');
    return response.games;
  }

  /**
   * Register for push notifications
   */
  async registerPushToken(fcmToken, deviceType = 'web') {
    if (!this.isAuthenticated) {
      throw new Error('Authentication required for push notifications');
    }
    return await this._apiRequest('POST', '/api/notifications/fcm-token', {
      token: fcmToken,
      deviceType,
    });
  }

  // ========== Private Methods ==========

  /**
   * Connect via WebSocket
   */
  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        const socketOptions = {};

        // Add JWT token for authentication
        if (this.token) {
          socketOptions.auth = { token: this.token };
        }

        this.socket = io(this.apiBaseUrl, socketOptions);

        this.socket.on('connect', () => {
          this.isConnected = true;
          this._setupWebSocketHandlers();
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          reject(error);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  _setupWebSocketHandlers() {
    // Room events
    this.socket.on('room:joined', (data) => {
      this.dispatchEvent(new CustomEvent('room:joined', { detail: data }));
    });

    this.socket.on('room:user-joined', (data) => {
      this.dispatchEvent(new CustomEvent('room:user-joined', { detail: data }));
    });

    this.socket.on('room:user-left', (data) => {
      this.dispatchEvent(new CustomEvent('room:user-left', { detail: data }));
    });

    // Chat events
    this.socket.on('chat:new-message', (data) => {
      this.dispatchEvent(new CustomEvent('chat:new-message', { detail: data }));
    });

    this.socket.on('chat:user-typing', (data) => {
      this.dispatchEvent(new CustomEvent('chat:user-typing', { detail: data }));
    });

    // Game events
    this.socket.on('game:opponent-ready', (data) => {
      this.dispatchEvent(new CustomEvent('game:opponent-ready', { detail: data }));
    });

    this.socket.on('game:truth-dare-selected', (data) => {
      this.dispatchEvent(new CustomEvent('game:truth-dare-selected', { detail: data }));
    });

    this.socket.on('game:round-result', (data) => {
      this.dispatchEvent(new CustomEvent('game:round-result', { detail: data }));
    });

    this.socket.on('game:round-started', (data) => {
      this.dispatchEvent(new CustomEvent('game:round-started', { detail: data }));
    });

    // Friend events
    this.socket.on('friend:request-received', (data) => {
      this.dispatchEvent(new CustomEvent('friend:request-received', { detail: data }));
    });

    this.socket.on('friend:request-accepted-notification', (data) => {
      this.dispatchEvent(new CustomEvent('friend:request-accepted', { detail: data }));
    });

    // Online status events
    this.socket.on('user:online', (data) => {
      this.dispatchEvent(new CustomEvent('user:online', { detail: data }));
    });

    this.socket.on('user:offline', (data) => {
      this.dispatchEvent(new CustomEvent('user:offline', { detail: data }));
    });

    // Notification events
    this.socket.on('notification:new', (data) => {
      this.dispatchEvent(new CustomEvent('notification:new', { detail: data }));
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: error }));
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;

      // Auto-reconnect or fallback to REST
      if (reason === 'io server disconnect') {
        // Server kicked us out, try to reconnect
        setTimeout(() => this.connect(), 1000);
      }
    });
  }

  /**
   * Fallback to REST API mode
   */
  _fallbackToRest() {
    this.connectionMode = 'rest';
    this.isConnected = true;
    console.log('🔄 Using REST API mode with polling');
  }

  /**
   * Start polling for game state updates
   */
  _startGamePolling(gameId) {
    if (this.pollingTimers.has(gameId)) {
      return; // Already polling
    }

    // Initial poll
    this._pollGameState(gameId);

    // Setup interval
    const timer = setInterval(() => {
      this._pollGameState(gameId);
    }, this.pollingInterval);

    this.pollingTimers.set(gameId, timer);
  }

  /**
   * Poll game state and emit events for changes
   */
  async _pollGameState(gameId) {
    try {
      const game = await this.getGameState(gameId);
      const lastState = this.lastGameState.get(gameId);

      // Detect changes and emit events
      if (lastState) {
        // Check for new moves
        if (game.moves && game.moves.length > (lastState.moves?.length || 0)) {
          this.dispatchEvent(new CustomEvent('game:opponent-ready', {
            detail: { gameId, game }
          }));
        }

        // Check for round completion
        if (game.status !== lastState.status) {
          if (game.status === 'completed') {
            this.dispatchEvent(new CustomEvent('game:round-result', {
              detail: { gameId, game }
            }));

            // Stop polling for completed games
            this._stopGamePolling(gameId);
          }
        }

        // Check for truth/dare selection
        if (game.truth_dare_selection && game.truth_dare_selection !== lastState.truth_dare_selection) {
          this.dispatchEvent(new CustomEvent('game:truth-dare-selected', {
            detail: { gameId, selection: game.truth_dare_selection }
          }));
        }
      }

      // Update last known state
      this.lastGameState.set(gameId, game);
    } catch (error) {
      console.error('Error polling game state:', error);
    }
  }

  /**
   * Stop polling for a game
   */
  _stopGamePolling(gameId) {
    const timer = this.pollingTimers.get(gameId);
    if (timer) {
      clearInterval(timer);
      this.pollingTimers.delete(gameId);
    }
  }

  /**
   * Make API request with authentication
   */
  async _apiRequest(method, endpoint, body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add JWT token if authenticated
    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Add body for POST/PUT/PATCH
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return await response.json();
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameClient;
} else {
  window.GameClient = GameClient;
}
