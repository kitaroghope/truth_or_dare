const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { users, user_stats, refresh_tokens, email_verification_tokens, password_reset_tokens } = require('../db/schema');
const { generateTokenPair, verifyRefreshToken, hashToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { eq, and, lt } = require('drizzle-orm');
const { authLimiter, passwordResetLimiter, emailVerificationLimiter } = require('../middleware/rateLimiter');
const { validateRegistration, validateLogin, validateEmail, sanitizeBody } = require('../middleware/validation');

const router = express.Router();

// Apply sanitization to all routes
router.use(sanitizeBody);

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', authLimiter, validateRegistration, async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const db = getDatabase();

    // Check if email already exists
    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingEmail.length > 0) {
      return res.status(409).json({
        error: 'Registration failed',
        message: 'Email already registered',
      });
    }

    // Check if username already exists
    const existingUsername = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUsername.length > 0) {
      return res.status(409).json({
        error: 'Registration failed',
        message: 'Username already taken',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    const now = new Date();

    await db.insert(users).values({
      id: userId,
      email: email.toLowerCase(),
      username: username,
      password_hash: passwordHash,
      email_verified: false,
      created_at: now,
      last_seen: now,
    });

    // Create user stats record
    await db.insert(user_stats).values({
      id: uuidv4(),
      user_id: userId,
      games_played: 0,
      games_won: 0,
      games_lost: 0,
      truths_completed: 0,
      dares_completed: 0,
      created_at: now,
    });

    // Generate tokens
    const tokens = generateTokenPair({
      id: userId,
      email: email.toLowerCase(),
      username: username,
    });

    // Store refresh token hash
    const tokenHash = hashToken(tokens.refreshToken);
    const refreshExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await db.insert(refresh_tokens).values({
      id: uuidv4(),
      token_hash: tokenHash,
      user_id: userId,
      device_info: req.headers['user-agent'] || 'Unknown',
      expires_at: refreshExpiry,
      created_at: now,
    });

    // Return success
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: userId,
        email: email.toLowerCase(),
        username: username,
        emailVerified: false,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Registration failed',
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email and password are required',
      });
    }

    const db = getDatabase();

    // Find user by email
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
      });
    }

    const user = userResult[0];

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
      });
    }

    // Generate tokens
    const tokens = generateTokenPair({
      id: user.id,
      email: user.email,
      username: user.username,
    });

    // Store refresh token hash
    const tokenHash = hashToken(tokens.refreshToken);
    const now = new Date();
    const refreshExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await db.insert(refresh_tokens).values({
      id: uuidv4(),
      token_hash: tokenHash,
      user_id: user.id,
      device_info: req.headers['user-agent'] || 'Unknown',
      expires_at: refreshExpiry,
      created_at: now,
    });

    // Update last seen
    await db
      .update(users)
      .set({ last_seen: now })
      .where(eq(users.id, user.id));

    // Return success
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerified: user.email_verified,
        avatarUrl: user.avatar_url,
        bio: user.bio,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Login failed',
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Refresh token is required',
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: error.message,
      });
    }

    const db = getDatabase();

    // Check if refresh token exists in database
    const tokenHash = hashToken(refreshToken);
    const tokenResult = await db
      .select()
      .from(refresh_tokens)
      .where(
        and(
          eq(refresh_tokens.token_hash, tokenHash),
          eq(refresh_tokens.user_id, decoded.userId)
        )
      )
      .limit(1);

    if (tokenResult.length === 0) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid refresh token',
      });
    }

    const storedToken = tokenResult[0];

    // Check if token is expired
    if (new Date(storedToken.expires_at) < new Date()) {
      // Delete expired token
      await db
        .delete(refresh_tokens)
        .where(eq(refresh_tokens.id, storedToken.id));

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Refresh token expired',
      });
    }

    // Get user data
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User not found',
      });
    }

    const user = userResult[0];

    // Generate new token pair (token rotation)
    const newTokens = generateTokenPair({
      id: user.id,
      email: user.email,
      username: user.username,
    });

    // Delete old refresh token
    await db
      .delete(refresh_tokens)
      .where(eq(refresh_tokens.id, storedToken.id));

    // Store new refresh token hash
    const newTokenHash = hashToken(newTokens.refreshToken);
    const now = new Date();
    const refreshExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await db.insert(refresh_tokens).values({
      id: uuidv4(),
      token_hash: newTokenHash,
      user_id: user.id,
      device_info: req.headers['user-agent'] || 'Unknown',
      expires_at: refreshExpiry,
      created_at: now,
    });

    // Return new tokens
    res.status(200).json({
      message: 'Token refreshed successfully',
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Token refresh failed',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout and invalidate refresh token
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Refresh token is required',
      });
    }

    const db = getDatabase();
    const tokenHash = hashToken(refreshToken);

    // Delete refresh token
    await db
      .delete(refresh_tokens)
      .where(
        and(
          eq(refresh_tokens.token_hash, tokenHash),
          eq(refresh_tokens.user_id, req.user.id)
        )
      );

    res.status(200).json({
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Logout failed',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const db = getDatabase();

    // Get user stats
    const statsResult = await db
      .select()
      .from(user_stats)
      .where(eq(user_stats.user_id, req.user.id))
      .limit(1);

    const stats = statsResult.length > 0 ? statsResult[0] : null;

    res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        emailVerified: req.user.emailVerified,
        avatarUrl: req.user.avatarUrl,
        bio: req.user.bio,
      },
      stats: stats
        ? {
            gamesPlayed: stats.games_played,
            gamesWon: stats.games_won,
            gamesLost: stats.games_lost,
            truthsCompleted: stats.truths_completed,
            daresCompleted: stats.dares_completed,
          }
        : null,
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch user profile',
    });
  }
});

/**
 * POST /api/auth/send-verification
 * Send or resend email verification
 */
router.post('/send-verification', emailVerificationLimiter, requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    // Check if already verified
    if (req.user.emailVerified) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email already verified',
      });
    }

    // Delete any existing verification tokens for this user
    await db
      .delete(email_verification_tokens)
      .where(eq(email_verification_tokens.user_id, userId));

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token
    await db.insert(email_verification_tokens).values({
      id: uuidv4(),
      token,
      user_id: userId,
      expires_at: expiresAt,
      created_at: now,
    });

    // Send email
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await sendVerificationEmail(user[0], token);

    res.status(200).json({
      message: 'Verification email sent',
    });
  } catch (error) {
    console.error('Send verification email error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send verification email',
    });
  }
});

/**
 * GET /api/auth/verify-email/:token
 * Verify email address with token
 */
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const db = getDatabase();

    // Find token
    const tokenResult = await db
      .select()
      .from(email_verification_tokens)
      .where(eq(email_verification_tokens.token, token))
      .limit(1);

    if (tokenResult.length === 0) {
      return res.status(400).json({
        error: 'Verification failed',
        message: 'Invalid or expired verification token',
      });
    }

    const verificationToken = tokenResult[0];

    // Check if expired
    if (new Date(verificationToken.expires_at) < new Date()) {
      // Delete expired token
      await db
        .delete(email_verification_tokens)
        .where(eq(email_verification_tokens.id, verificationToken.id));

      return res.status(400).json({
        error: 'Verification failed',
        message: 'Verification token has expired',
      });
    }

    // Update user email_verified status
    await db
      .update(users)
      .set({ email_verified: true })
      .where(eq(users.id, verificationToken.user_id));

    // Delete used token
    await db
      .delete(email_verification_tokens)
      .where(eq(email_verification_tokens.id, verificationToken.id));

    res.status(200).json({
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Email verification failed',
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post('/forgot-password', passwordResetLimiter, validateEmail, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email is required',
      });
    }

    const db = getDatabase();

    // Find user by email
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Always return success to prevent email enumeration
    if (userResult.length === 0) {
      return res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent',
      });
    }

    const user = userResult[0];

    // Delete any existing password reset tokens for this user
    await db
      .delete(password_reset_tokens)
      .where(eq(password_reset_tokens.user_id, user.id));

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    // Store token
    await db.insert(password_reset_tokens).values({
      id: uuidv4(),
      token,
      user_id: user.id,
      expires_at: expiresAt,
      created_at: now,
    });

    // Send email
    await sendPasswordResetEmail(user, token);

    res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process password reset request',
    });
  }
});

/**
 * POST /api/auth/reset-password/:token
 * Reset password with token
 */
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Validation
    if (!password) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Password is required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Password must be at least 8 characters long',
      });
    }

    const db = getDatabase();

    // Find token
    const tokenResult = await db
      .select()
      .from(password_reset_tokens)
      .where(eq(password_reset_tokens.token, token))
      .limit(1);

    if (tokenResult.length === 0) {
      return res.status(400).json({
        error: 'Reset failed',
        message: 'Invalid or expired reset token',
      });
    }

    const resetToken = tokenResult[0];

    // Check if expired
    if (new Date(resetToken.expires_at) < new Date()) {
      // Delete expired token
      await db
        .delete(password_reset_tokens)
        .where(eq(password_reset_tokens.id, resetToken.id));

      return res.status(400).json({
        error: 'Reset failed',
        message: 'Reset token has expired',
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password
    await db
      .update(users)
      .set({ password_hash: passwordHash })
      .where(eq(users.id, resetToken.user_id));

    // Delete used token
    await db
      .delete(password_reset_tokens)
      .where(eq(password_reset_tokens.id, resetToken.id));

    // Invalidate all refresh tokens for security
    await db
      .delete(refresh_tokens)
      .where(eq(refresh_tokens.user_id, resetToken.user_id));

    res.status(200).json({
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Password reset failed',
    });
  }
});

module.exports = router;
