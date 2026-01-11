# 🎲 Truth or Dare - Rock, Paper, Scissors Edition

A modern, real-time multiplayer Truth or Dare game with Rock, Paper, Scissors mechanics. Features include JWT authentication, friends system, game history, push notifications, and multi-database support.

## ✨ Features

### Core Gameplay
- 🎮 **Rock, Paper, Scissors** - Determine who gets Truth or Dare
- 💬 **Real-time Chat** - Text, voice notes, and file sharing
- 🎯 **Truth or Dare System** - Winner asks, loser chooses
- 🔄 **Multiple Rounds** - Play as many rounds as you want
- 📱 **Responsive Design** - Works on desktop and mobile

### Authentication & Users
- 🔐 **JWT Authentication** - Secure 24-hour access + 90-day refresh tokens
- 👤 **User Profiles** - Avatars, bios, and statistics
- 📊 **Game Statistics** - Track wins, losses, and win rate
- ✉️ **Email Verification** - SendGrid integration
- 🔑 **Password Reset** - Secure token-based reset flow
- 👥 **Anonymous Play** - No account required to play

### Social Features
- 👥 **Friends System** - Add, accept, reject friends
- 🟢 **Online Status** - See who's online
- 🔔 **Real-time Notifications** - Friend requests, game updates
- 📧 **Email Invitations** - Invite friends via email
- 📱 **Push Notifications** - Firebase Cloud Messaging (FCM)

### Game Features
- 🎲 **Room-based Gameplay** - Create or join rooms
- 📜 **Game History** - Review past games
- 🏆 **Leaderboard** - Top players by win rate
- 🔄 **Async/Turn-based Mode** - Play when users aren't simultaneously online
- 💾 **Persistent Games** - Games saved to database

### Technical Features
- ⚡ **Real-time Communication** - Socket.io with JWT authentication
- 🔄 **REST API Fallback** - Automatic fallback when WebSocket unavailable
- 🗄️ **Multi-Database Support** - SQLite, PostgreSQL, Neon, Supabase
- 🛡️ **Rate Limiting** - Protection against abuse
- 🔒 **Input Validation** - XSS and injection protection
- 🌐 **CORS Configured** - Ready for mobile apps

## 📦 Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js 5.1
- **Database ORM**: Drizzle ORM
- **Real-time**: Socket.io 4.8
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **Email**: SendGrid
- **Push Notifications**: Firebase Admin SDK
- **Image Processing**: Sharp
- **File Uploads**: Multer

### Frontend
- **UI Framework**: Bootstrap 5.3
- **JavaScript**: Vanilla JS (ES6+)
- **Real-time Client**: Socket.io Client
- **Icons**: Emoji-based

### Databases Supported
- SQLite (default, file-based)
- PostgreSQL (recommended for production)
- Neon (serverless PostgreSQL)
- Supabase (PostgreSQL with extras)

## 🚀 Quick Start

### Prerequisites

- Node.js 20 or higher
- npm or yarn
- (Optional) PostgreSQL database

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kitaroghope/truth_or_dare.git
   cd truth_or_dare
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Generate JWT secrets:**
   ```bash
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
   node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
   ```

5. **Run database migrations:**
   ```bash
   npm run migrate
   ```

6. **Start the server:**
   ```bash
   npm start
   ```

7. **Open your browser:**
   ```
   http://localhost:3000
   ```

## 📝 Configuration

### Minimum Configuration (.env)

```bash
# JWT Secrets (generate with crypto.randomBytes)
JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Database (SQLite by default)
DATABASE_TYPE=sqlite
DATABASE_URL=./chat.db

# Server
PORT=3000
BASE_URL=http://localhost:3000
```

### Full Configuration

See [.env.example](.env.example) for all available options including:
- SendGrid email configuration
- Firebase push notifications
- Admin panel credentials
- CORS origins
- Database connections

## 📚 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
- **[SECURITY.md](SECURITY.md)** - Security implementation details
- **[DATABASE.md](DATABASE.md)** - Database setup and switching
- **[REST_FALLBACK.md](REST_FALLBACK.md)** - REST API + WebSocket fallback strategy
- **[PHASE_SUMMARY.md](PHASE_SUMMARY.md)** - Development phase overview

## 🎯 API Endpoints

### Authentication
```
POST   /api/auth/register          - Register new user
POST   /api/auth/login             - Login
POST   /api/auth/refresh           - Refresh access token
POST   /api/auth/logout            - Logout
GET    /api/auth/me                - Get current user
POST   /api/auth/send-verification - Send verification email
GET    /api/auth/verify-email/:token - Verify email
POST   /api/auth/forgot-password   - Request password reset
POST   /api/auth/reset-password/:token - Reset password
```

### Users
```
GET    /api/users/profile/:userId  - Get user profile
PATCH  /api/users/profile          - Update own profile
POST   /api/users/avatar           - Upload avatar
DELETE /api/users/avatar           - Delete avatar
GET    /api/users/search           - Search users
GET    /api/users/stats/leaderboard - Get leaderboard
```

### Friends
```
GET    /api/friends                - Get friends list
POST   /api/friends/request/:userId - Send friend request
GET    /api/friends/requests       - Get pending requests
POST   /api/friends/accept/:id     - Accept friend request
POST   /api/friends/reject/:id     - Reject friend request
DELETE /api/friends/:id             - Remove friend
GET    /api/friends/online         - Get online friends
```

### Games
```
POST   /api/games/create           - Create new game
POST   /api/games/join/:roomCode   - Join game by room code
GET    /api/games/:gameId          - Get game state
POST   /api/games/:gameId/move     - Make game move
POST   /api/games/:gameId/truth-dare - Select truth or dare
POST   /api/games/:gameId/complete - Complete game
GET    /api/games/history/me       - Get game history
POST   /api/games/:gameId/invite   - Send email invitation
DELETE /api/games/:gameId          - Forfeit game
```

### Notifications
```
GET    /api/notifications          - Get notifications
GET    /api/notifications/unread-count - Get unread count
PATCH  /api/notifications/:id/read - Mark as read
PATCH  /api/notifications/read-all - Mark all as read
DELETE /api/notifications/:id      - Delete notification
POST   /api/notifications/fcm-token - Register FCM token
DELETE /api/notifications/fcm-token - Unregister FCM token
```

## 🔌 WebSocket Events

### Client → Server
```javascript
'room:join'               // Join a game room
'room:leave'              // Leave a room
'chat:message'            // Send chat message
'chat:typing'             // Typing indicator
'game:choice'             // Make RPS choice
'game:truth-dare'         // Select truth or dare
'game:new-round'          // Start new round
'friend:request-sent'     // Notify friend request sent
'user:heartbeat'          // Keep-alive heartbeat
```

### Server → Client
```javascript
'room:joined'             // Successfully joined room
'room:user-joined'        // Another user joined
'room:user-left'          // User left room
'chat:new-message'        // New chat message
'chat:user-typing'        // User is typing
'game:opponent-ready'     // Opponent made choice
'game:truth-dare-selected' // Truth/dare selection
'game:round-result'       // Round result
'game:round-started'      // New round started
'friend:request-received' // New friend request
'friend:request-accepted' // Friend request accepted
'user:online'             // Friend came online
'user:offline'            // Friend went offline
'notification:new'        // New notification
```

## 🎮 Usage Examples

### Web Client

```html
<!-- Include Socket.io and GameClient -->
<script src="/socket.io/socket.io.js"></script>
<script src="gameClient.js"></script>
<script src="auth.js"></script>

<script>
// Automatically connects with JWT authentication
// Uses WebSocket, falls back to REST if needed
</script>
```

### Mobile App (React Native)

```javascript
import GameClient from './gameClient';

const client = new GameClient({
  token: accessToken,
  apiBaseUrl: 'https://api.yourdomain.com',
});

await client.connect();

// Make moves
await client.makeMove(gameId, 'rock');

// Listen for events
client.addEventListener('game:round-result', (event) => {
  console.log('Round result:', event.detail);
});
```

### REST API (No WebSocket)

```javascript
const client = new GameClient({
  token: accessToken,
  useWebSocket: false, // Force REST mode
  pollingInterval: 3000, // Poll every 3 seconds
});
```

## 🛡️ Security Features

- ✅ **Rate Limiting** - Protect against brute force and abuse
- ✅ **Input Validation** - Prevent XSS and injection attacks
- ✅ **JWT Authentication** - Secure token-based auth
- ✅ **Password Hashing** - bcrypt with 10 rounds
- ✅ **Security Headers** - XSS, clickjacking, MIME sniffing protection
- ✅ **CORS Configuration** - Whitelist allowed origins
- ✅ **Token Rotation** - Refresh tokens are single-use
- ✅ **SQL Injection Protection** - Parameterized queries via Drizzle ORM
- ✅ **File Upload Security** - Type checking, size limits, sanitization

See [SECURITY.md](SECURITY.md) for detailed security documentation.

## 📊 Database Schema

### Main Tables

- **users** - User accounts and authentication
- **user_stats** - Game statistics per user
- **games** - Game sessions and results
- **game_moves** - Individual moves in games
- **friendships** - Friend relationships
- **notifications** - User notifications
- **refresh_tokens** - JWT refresh tokens
- **email_verification_tokens** - Email verification
- **password_reset_tokens** - Password reset
- **fcm_tokens** - Firebase Cloud Messaging tokens
- **messages** - Chat messages (legacy)

### Switching Databases

Change database type in `.env`:

```bash
# SQLite (default)
DATABASE_TYPE=sqlite
DATABASE_URL=./chat.db

# PostgreSQL
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://user:pass@host:5432/db

# Neon (serverless)
DATABASE_TYPE=neon
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/db

# Supabase
DATABASE_TYPE=supabase
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
```

Run migrations:
```bash
npm run migrate
```

See [DATABASE.md](DATABASE.md) for detailed instructions.

## 🚀 Deployment

### Quick Deploy Options

**Render (Recommended):**
1. Push to GitHub
2. Connect repository on Render
3. Add environment variables
4. Deploy!

**Railway:**
1. Connect GitHub
2. Add environment variables
3. Deploy!

**Heroku:**
```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:mini
heroku config:set JWT_SECRET=your_secret
git push heroku main
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide including VPS, Docker, and production best practices.

## 📈 Performance

- **WebSocket** - Sub-second message delivery
- **REST Fallback** - 1-3 second polling interval
- **Database Connection Pooling** - Efficient resource usage
- **Image Optimization** - Sharp resizes to 512x512 WebP
- **Rate Limiting** - Prevent resource exhaustion

## 🧪 Testing

```bash
# Run tests (when available)
npm test

# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

## 📱 Mobile App Development

The backend is ready for mobile app development:

1. **Use GameClient** - Automatic WebSocket/REST fallback
2. **JWT Authentication** - Access + refresh tokens
3. **Push Notifications** - FCM support built-in
4. **REST API** - All functionality available via REST
5. **CORS Configured** - Add your app origin to .env

Example configuration:

```javascript
// React Native
const client = new GameClient({
  token: await AsyncStorage.getItem('accessToken'),
  apiBaseUrl: 'https://api.yourdomain.com',
});

// Flutter
// Implement similar GameClient in Dart
```

See [REST_FALLBACK.md](REST_FALLBACK.md) for mobile app integration guide.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

ISC License - see LICENSE file for details

## 👤 Author

**kitaroghope**

## 🙏 Acknowledgments

- Bootstrap for UI components
- Socket.io for real-time communication
- Drizzle ORM for database abstraction
- SendGrid for email delivery
- Firebase for push notifications
- Sharp for image processing

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/truth_or_dare/issues)
- **Documentation**: See docs in repository
- **Security**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## 🗺️ Roadmap

- [ ] Add more game modes
- [ ] Video/audio calling during gameplay
- [ ] Custom truth/dare decks
- [ ] Tournament mode
- [ ] Mobile apps (iOS/Android)
- [ ] i18n/Internationalization
- [ ] Social media integration
- [ ] Achievements system

## 📸 Screenshots

*Add screenshots of your application here*

## 🎉 Features Highlights

### Real-time Everything
- Instant message delivery
- Live online status
- Real-time game updates
- Push notifications

### Secure & Scalable
- Enterprise-grade security
- Multi-database support
- Rate limiting
- Horizontal scaling ready

### Developer-Friendly
- Comprehensive API
- REST fallback
- Mobile-ready
- Well-documented

### User-Friendly
- Beautiful UI
- Responsive design
- Anonymous play option
- Simple room sharing

---

Made with ❤️ by kitaroghope
