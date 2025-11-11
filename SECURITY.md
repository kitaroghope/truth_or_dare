# Security Implementation Guide

This document outlines all security measures implemented in the Truth or Dare application.

## Table of Contents

1. [Rate Limiting](#rate-limiting)
2. [Input Validation & Sanitization](#input-validation--sanitization)
3. [Authentication & Authorization](#authentication--authorization)
4. [Security Headers](#security-headers)
5. [CORS Configuration](#cors-configuration)
6. [Database Security](#database-security)
7. [File Upload Security](#file-upload-security)
8. [Best Practices](#best-practices)

## Rate Limiting

### Implementation

Rate limiting is implemented using `express-rate-limit` middleware to protect against:
- Brute force attacks
- API abuse
- DDoS attacks
- Resource exhaustion

### Rate Limit Configurations

| Endpoint Type | Window | Max Requests | Purpose |
|--------------|--------|--------------|---------|
| **Authentication** | 15 minutes | 5 | Prevent brute force on login/signup |
| **Password Reset** | 1 hour | 3 | Prevent password reset abuse |
| **Email Verification** | 1 hour | 3 | Prevent email spam |
| **General API** | 15 minutes | 100 | Protect API from abuse |
| **File Uploads** | 15 minutes | 10 | Prevent upload spam |
| **Friend Requests** | 1 hour | 20 | Prevent friend request spam |
| **Email Invitations** | 1 hour | 10 | Prevent invitation spam |
| **Search** | 1 minute | 30 | Allow frequent searches, prevent abuse |

### Usage

```javascript
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');

// Apply to specific routes
router.post('/login', authLimiter, handleLogin);

// Apply to all API routes
app.use('/api/', apiLimiter);
```

### Customization

Create custom rate limiters:

```javascript
const { createRateLimiter } = require('./middleware/rateLimiter');

const customLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    error: 'Too many requests',
    message: 'Custom rate limit message',
  },
});
```

## Input Validation & Sanitization

### Sanitization

All user input is sanitized to prevent:
- XSS (Cross-Site Scripting) attacks
- SQL Injection
- HTML injection
- Script injection

**What's Sanitized:**
- HTML tags removed
- Script tags removed
- Event handlers removed
- Whitespace trimmed
- Query parameters cleaned

### Validation Rules

#### Username
- 3-30 characters
- Alphanumeric and underscores only
- Regex: `/^[a-zA-Z0-9_]{3,30}$/`

#### Email
- Standard email format
- Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

#### Password
- Minimum 8 characters
- No maximum (bcrypt handles long passwords)

#### Room Code
- 3-50 characters
- Alphanumeric, hyphens, underscores
- Regex: `/^[a-zA-Z0-9_-]{3,50}$/`

#### Game Move
- Must be: `rock`, `paper`, or `scissors`

#### Truth or Dare
- Must be: `Truth`, `Dare`, `truth`, or `dare`

#### UUID
- Standard UUID v4 format
- Regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`

### Usage

```javascript
const {
  validateRegistration,
  validateLogin,
  sanitizeBody,
} = require('./middleware/validation');

// Apply sanitization to all routes
router.use(sanitizeBody);

// Apply specific validation
router.post('/register', validateRegistration, handleRegister);
router.post('/login', validateLogin, handleLogin);
```

## Authentication & Authorization

### JWT Tokens

**Access Tokens:**
- Expiry: 24 hours
- Used for API authentication
- Stored in localStorage (web) or secure storage (mobile)

**Refresh Tokens:**
- Expiry: 90 days
- Used to obtain new access tokens
- Hashed before storage in database
- Single-use (rotation on refresh)

### Password Security

- Hashed using bcrypt with 10 salt rounds
- Never stored in plain text
- Compared using timing-safe bcrypt.compare()

### Token Rotation

Refresh tokens are rotated on use:
1. Client sends refresh token
2. Server verifies and invalidates old token
3. Server issues new access + refresh token pair
4. Old refresh token can no longer be used

### Authorization Middleware

```javascript
const { requireAuth, optionalAuth } = require('./middleware/auth');

// Require authentication
router.get('/profile', requireAuth, getProfile);

// Optional authentication (supports anonymous users)
router.post('/games/create', optionalAuth, createGame);
```

## Security Headers

### Implemented Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | Enable XSS protection |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer information |
| `Content-Security-Policy` | (see below) | Restrict resource loading |

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
img-src 'self' data: https:;
connect-src 'self' ws: wss:;
```

**Explanation:**
- Scripts only from same origin + CDN
- Styles only from same origin + CDN
- Images from same origin + data URIs + HTTPS
- WebSocket connections allowed (for Socket.io)

### Usage

Applied globally in app.js:

```javascript
const { securityHeaders } = require('./middleware/validation');
app.use(securityHeaders);
```

## CORS Configuration

### Setup

```javascript
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
```

### Environment Configuration

Add allowed origins to `.env`:

```bash
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com,https://app.yourdomain.com
```

### Mobile App CORS

For mobile apps, add the app origin:

```bash
# React Native
CORS_ORIGINS=http://localhost:3000,http://localhost:8081

# Flutter (Android emulator)
CORS_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
```

### Socket.io CORS

Socket.io is configured with the same CORS origins:

```javascript
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});
```

## Database Security

### SQL Injection Prevention

Using Drizzle ORM with parameterized queries:

```javascript
// ✅ Safe - parameterized query
await db
  .select()
  .from(users)
  .where(eq(users.email, userEmail));

// ❌ Never do this - vulnerable to SQL injection
await db.execute(sql`SELECT * FROM users WHERE email = '${userEmail}'`);
```

### Password Storage

```javascript
// Hash password before storage
const passwordHash = await bcrypt.hash(password, 10);

// Verify password
const isValid = await bcrypt.compare(password, user.password_hash);
```

### Token Storage

```javascript
// Hash refresh tokens before storage
const tokenHash = hashToken(refreshToken);

// Store only the hash
await db.insert(refresh_tokens).values({
  token_hash: tokenHash,
  user_id: userId,
});
```

### Connection Security

- Use SSL/TLS for database connections in production
- Store credentials in environment variables
- Never commit `.env` files to version control

```bash
# PostgreSQL with SSL
DATABASE_URL=postgresql://user:password@host:5432/db?sslmode=require

# Neon (always SSL)
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/db?sslmode=require
```

## File Upload Security

### Implemented Protections

1. **File Type Validation**
   - Whitelist allowed MIME types
   - Check file extension

2. **File Size Limits**
   - Default: 5MB maximum
   - Configurable per endpoint

3. **File Name Sanitization**
   - Generate UUID filenames
   - Preserve extension only

4. **Image Processing**
   - Resize uploaded images (512x512)
   - Convert to WebP format
   - Strip EXIF data

### Usage

```javascript
const { validateFileUpload } = require('./middleware/validation');

router.post(
  '/avatar',
  upload.single('avatar'),
  validateFileUpload(['image/jpeg', 'image/png', 'image/webp'], 5 * 1024 * 1024),
  handleAvatarUpload
);
```

### Avatar Upload Security

```javascript
// Resize and convert
await sharp(req.file.buffer)
  .resize(512, 512, { fit: 'cover', position: 'center' })
  .webp({ quality: 85 })
  .toFile(avatarPath);
```

## Best Practices

### Environment Variables

**Required Variables:**
```bash
# JWT Secrets (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Database
DATABASE_TYPE=sqlite
DATABASE_URL=./chat.db

# Email (SendGrid)
SENDGRID_API_KEY=your_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Firebase (for push notifications)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong_password_here

# CORS
CORS_ORIGINS=http://localhost:3000

# Server
PORT=3000
BASE_URL=http://localhost:3000
```

### Production Checklist

- [ ] Change default admin credentials
- [ ] Generate strong JWT secrets (64+ characters)
- [ ] Enable HTTPS/SSL
- [ ] Set secure CORS origins
- [ ] Configure production database with SSL
- [ ] Set up Firebase for push notifications
- [ ] Configure SendGrid for emails
- [ ] Set appropriate rate limits for your traffic
- [ ] Enable database backups
- [ ] Set up error monitoring (e.g., Sentry)
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set up firewall rules
- [ ] Enable database query logging (for auditing)

### Security Monitoring

**Log Security Events:**
- Failed login attempts
- Rate limit violations
- Invalid tokens
- Suspicious activity patterns

```javascript
// Example: Log failed login
console.warn(`⚠️  Failed login attempt for ${email} from IP ${req.ip}`);
```

### Regular Updates

Keep dependencies updated:

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

### Password Policy

**Recommended Requirements:**
- Minimum 8 characters (current)
- Consider adding:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character

### Session Management

**Current Implementation:**
- Access tokens expire after 24 hours
- Refresh tokens expire after 90 days
- Tokens are rotated on refresh

**Best Practices:**
- Implement token revocation for logout
- Clear tokens on password change
- Implement "logout all devices" functionality

### Secure Communication

**Development:**
- HTTP is acceptable for localhost

**Production:**
- Always use HTTPS
- Redirect HTTP to HTTPS
- Use HSTS header

```javascript
// Add HSTS header (production only)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}
```

## Vulnerability Reporting

If you discover a security vulnerability, please email: security@yourdomain.com

**Do not:**
- Create public GitHub issues for security vulnerabilities
- Exploit the vulnerability beyond verification

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

## Security Audit Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-XX | 1.0.0 | Initial security implementation |
| | | - Rate limiting added |
| | | - Input validation implemented |
| | | - Security headers configured |
| | | - JWT authentication |
| | | - Password hashing with bcrypt |

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [bcrypt](https://www.npmjs.com/package/bcrypt)
- [express-rate-limit](https://www.npmjs.com/package/express-rate-limit)
