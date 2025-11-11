# REST API Fallback Strategy

This document explains how to build clients that work with both real-time WebSocket connections and REST API fallback when WebSocket is unavailable.

## Overview

The Truth or Dare server supports two connection modes:

1. **WebSocket (Recommended)**: Real-time bidirectional communication for instant updates
2. **REST API (Fallback)**: Traditional HTTP requests with polling for state updates

The `GameClient` utility (`public/gameClient.js`) automatically handles fallback from WebSocket to REST when connections fail.

## Why REST Fallback?

REST fallback is essential for:

- **Corporate networks** with WebSocket restrictions
- **Older devices** with limited WebSocket support
- **Unreliable connections** where WebSocket keeps dropping
- **Battery optimization** on mobile devices
- **Async/turn-based gameplay** where real-time isn't critical

## Using the GameClient

### Basic Setup

```javascript
// For authenticated users (recommended)
const client = new GameClient({
  token: 'your-jwt-access-token',
  apiBaseUrl: 'https://your-server.com',
  pollingInterval: 3000, // Poll every 3 seconds in REST mode
  useWebSocket: true, // Try WebSocket first, fallback to REST
});

await client.connect();

// Listen for game events
client.addEventListener('game:round-result', (event) => {
  console.log('Round result:', event.detail);
});

// Make a move
await client.makeMove(gameId, 'rock');
```

### Anonymous Users

```javascript
// For anonymous/guest users
const client = new GameClient({
  token: null, // No authentication
  useWebSocket: true,
});

await client.connect();
await client.joinRoom('ROOM123', 'GuestUser');
```

### Force REST Mode

```javascript
// Disable WebSocket entirely (useful for testing or specific use cases)
const client = new GameClient({
  token: 'your-jwt-token',
  useWebSocket: false, // Only use REST API
});

await client.connect();
```

## REST API Endpoints

All game functionality is available via REST API:

### Game Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/games/create` | Create new game | Optional |
| POST | `/api/games/join/:roomCode` | Join existing game | Optional |
| GET | `/api/games/:gameId` | Get game state | Optional |
| POST | `/api/games/:gameId/move` | Make RPS move | Optional |
| POST | `/api/games/:gameId/truth-dare` | Select truth/dare | Optional |
| POST | `/api/games/:gameId/complete` | Complete game | Optional |
| GET | `/api/games/history/me` | Get game history | Required |
| POST | `/api/games/:gameId/invite` | Send email invitation | Required |
| DELETE | `/api/games/:gameId` | Forfeit game | Optional |

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout (invalidate refresh token) |
| GET | `/api/auth/me` | Get current user profile |

### Friends Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/friends` | Get friends list |
| POST | `/api/friends/request/:userId` | Send friend request |
| GET | `/api/friends/requests` | Get pending requests |
| POST | `/api/friends/accept/:friendshipId` | Accept request |
| POST | `/api/friends/reject/:friendshipId` | Reject request |
| DELETE | `/api/friends/:friendshipId` | Remove friend |
| GET | `/api/friends/online` | Get online friends |

### Notifications Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get notifications (paginated) |
| GET | `/api/notifications/unread-count` | Get unread count |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications/:id` | Delete notification |
| POST | `/api/notifications/fcm-token` | Register FCM push token |
| DELETE | `/api/notifications/fcm-token` | Unregister FCM token |

## Polling Strategy

When in REST mode, the `GameClient` automatically polls for updates:

### Default Polling

- **Interval**: 3 seconds (configurable)
- **Auto-start**: Begins when joining a game
- **Auto-stop**: Stops when game completes

### Optimized Polling

```javascript
// Adjust polling frequency based on game state
const client = new GameClient({
  token: 'your-token',
  pollingInterval: gameState === 'waiting_for_opponent' ? 5000 : 2000,
});
```

### Manual Polling

```javascript
// Get current game state without automatic polling
const gameState = await client.getGameState(gameId);
```

## WebSocket Events

When using WebSocket mode, the following real-time events are available:

### Room Events

- `room:joined` - Successfully joined a room
- `room:user-joined` - Another user joined the room
- `room:user-left` - User left the room

### Chat Events

- `chat:new-message` - New message in chat
- `chat:user-typing` - User is typing

### Game Events

- `game:opponent-ready` - Opponent made their move
- `game:truth-dare-selected` - Truth or Dare selection made
- `game:round-result` - Round completed with result
- `game:round-started` - New round started

### Friend Events

- `friend:request-received` - New friend request
- `friend:request-accepted` - Friend request accepted

### Online Status Events

- `user:online` - Friend came online
- `user:offline` - Friend went offline

### Notification Events

- `notification:new` - New notification received

## Mobile App Implementation

### React Native Example

```javascript
import GameClient from './gameClient';

// In your component
useEffect(() => {
  const client = new GameClient({
    token: userToken,
    apiBaseUrl: API_URL,
  });

  client.addEventListener('game:round-result', handleRoundResult);
  client.connect();

  return () => {
    client.disconnect();
  };
}, [userToken]);
```

### Flutter Example

For Flutter apps, implement a similar client in Dart:

```dart
class GameClient {
  final String? token;
  final String apiBaseUrl;
  final bool useWebSocket;

  GameClient({
    this.token,
    required this.apiBaseUrl,
    this.useWebSocket = true,
  });

  Future<void> connect() async {
    if (useWebSocket) {
      try {
        await _connectWebSocket();
      } catch (e) {
        _fallbackToRest();
      }
    } else {
      _fallbackToRest();
    }
  }

  // Implement REST API calls using http package
  // Implement WebSocket using socket_io_client package
}
```

## JWT Authentication

### Getting a Token

```javascript
// Register new user
const registerResponse = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword',
    username: 'cooluser',
  }),
});

const { accessToken, refreshToken } = await registerResponse.json();

// Store tokens securely
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
```

### Using Token with API

```javascript
// All authenticated requests need the token
const response = await fetch('/api/games/history/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
});
```

### Refreshing Tokens

```javascript
// When access token expires (24 hours), use refresh token
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const { accessToken, refreshToken: newRefreshToken } = await response.json();

  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', newRefreshToken);

  return accessToken;
}
```

## Push Notifications (Mobile)

### Registering FCM Token

```javascript
// After user logs in, register FCM token for push notifications
const client = new GameClient({ token: accessToken });
await client.connect();

// Get FCM token from Firebase
const fcmToken = await getFCMToken(); // Your Firebase implementation

// Register with server
await client.registerPushToken(fcmToken, 'android'); // or 'ios', 'web'
```

### Notification Types

The server sends push notifications for:

- **Friend requests**: When someone sends you a friend request
- **Friend accepted**: When someone accepts your friend request
- **Game invite**: When invited to a game
- **Game joined**: When someone joins your game
- **Your turn**: When it's your turn in an async game
- **Round result**: When a round completes

## Best Practices

### Connection Management

1. **Always attempt WebSocket first** - It provides the best user experience
2. **Gracefully fallback to REST** - Don't show errors to users
3. **Handle reconnection** - Auto-reconnect when network returns
4. **Clean up on unmount** - Always call `client.disconnect()`

### Token Management

1. **Store tokens securely** - Use secure storage on mobile
2. **Refresh before expiry** - Refresh tokens before they expire
3. **Handle 401 errors** - Auto-refresh and retry on auth failures
4. **Logout on refresh failure** - If refresh fails, log user out

### Polling Optimization

1. **Adjust frequency** - Poll less often when user is idle
2. **Stop polling** - Stop when game completes or app backgrounded
3. **Batch requests** - Combine multiple API calls when possible
4. **Cache responses** - Don't re-fetch unchanged data

### Error Handling

```javascript
client.addEventListener('error', (event) => {
  console.error('Client error:', event.detail);

  // Show user-friendly message
  showToast('Connection error. Retrying...');

  // Attempt reconnection
  setTimeout(() => client.connect(), 3000);
});
```

## Testing REST Fallback

### Force REST Mode for Testing

```javascript
// Disable WebSocket to test REST-only functionality
const client = new GameClient({
  token: 'test-token',
  useWebSocket: false,
});
```

### Simulate WebSocket Failure

```javascript
// In your test environment
const client = new GameClient({ token: 'test-token' });

// Mock Socket.io to always fail
jest.mock('socket.io-client', () => {
  return () => {
    throw new Error('WebSocket unavailable');
  };
});

await client.connect();
// Should automatically fallback to REST
```

## Performance Considerations

### WebSocket vs REST

| Feature | WebSocket | REST + Polling |
|---------|-----------|----------------|
| Real-time updates | Instant | 1-5s delay |
| Server load | Low | Medium-High |
| Battery usage | Low | Medium |
| Data usage | Low | Medium |
| Firewall friendly | No | Yes |

### Recommendations

- **Real-time games**: Always use WebSocket
- **Turn-based games**: REST is acceptable
- **Mobile on cellular**: Consider REST to save battery
- **Corporate networks**: REST may be necessary

## Troubleshooting

### WebSocket Not Connecting

```javascript
// Check CORS configuration
// Make sure server allows your origin
const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:3000';

// Check firewall/network
// Some networks block WebSocket connections

// Check SSL
// WebSocket requires secure connection (wss://) in production
```

### Polling Not Working

```javascript
// Verify game ID is correct
const gameState = await client.getGameState(gameId);

// Check authentication
// Some endpoints require valid JWT token

// Monitor console for errors
client.addEventListener('error', console.error);
```

### Token Expired

```javascript
// Implement automatic token refresh
async function makeAuthenticatedRequest(endpoint) {
  try {
    return await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  } catch (error) {
    if (error.message.includes('Token expired')) {
      const newToken = await refreshAccessToken();
      // Retry with new token
      return await fetch(endpoint, {
        headers: { Authorization: `Bearer ${newToken}` }
      });
    }
    throw error;
  }
}
```

## Example: Complete Game Flow

```javascript
// 1. Initialize client
const client = new GameClient({
  token: localStorage.getItem('accessToken'),
  apiBaseUrl: 'https://api.truthordare.com',
});

// 2. Connect (auto-fallback to REST if needed)
await client.connect();
console.log(`Connected via ${client.connectionMode}`);

// 3. Create or join game
const game = await client.joinRoom('ROOM123', 'Player1');

// 4. Listen for events
client.addEventListener('game:opponent-ready', () => {
  console.log('Opponent made their move!');
});

client.addEventListener('game:round-result', (event) => {
  const { winner, loser } = event.detail;
  console.log(`Winner: ${winner}, Loser: ${loser}`);
});

// 5. Make moves
await client.makeMove(game.id, 'rock');

// 6. Select truth or dare (if you lose)
await client.selectTruthDare(game.id, 'truth');

// 7. Disconnect when done
client.disconnect();
```

## Support

For issues or questions:
- Check the server logs for error messages
- Verify JWT tokens are valid and not expired
- Test with REST-only mode to isolate WebSocket issues
- Review CORS configuration if connecting from different origin

## Next Steps

- Implement the GameClient in your mobile app
- Add automatic token refresh logic
- Test fallback behavior by disabling WebSocket
- Integrate push notifications with FCM
- Add offline mode with local state persistence
