const { verifyAccessToken } = require('../utils/jwt');
const { getDatabase } = require('../db');
const { users } = require('../db/schema');
const { eq } = require('drizzle-orm');

/**
 * Authentication middleware - Requires valid JWT token
 * Attaches user object to req.user
 * Returns 401 if token is missing or invalid
 */
async function requireAuth(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: error.message,
      });
    }

    // Fetch user from database
    const db = getDatabase();
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

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url,
      bio: user.bio,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication processing failed',
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user to req.user if valid token is provided
 * Allows request to continue even without token (for anonymous users)
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // No token provided - continue as anonymous
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    // Try to verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      // Invalid token - continue as anonymous
      req.user = null;
      return next();
    }

    // Fetch user from database
    const db = getDatabase();
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (userResult.length === 0) {
      req.user = null;
      return next();
    }

    const user = userResult[0];

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url,
      bio: user.bio,
    };

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // On error, continue as anonymous
    req.user = null;
    next();
  }
}

/**
 * Require email verification middleware
 * Must be used after requireAuth
 * Returns 403 if user's email is not verified
 */
function requireEmailVerified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'No user authenticated',
    });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({
      error: 'Email verification required',
      message: 'Please verify your email address to access this resource',
    });
  }

  next();
}

/**
 * Admin authentication middleware
 * For existing admin token system (backward compatibility)
 */
function requireAdmin(req, res, next) {
  const token = req.headers['admin-token'];

  if (!token) {
    return res.status(401).json({
      error: 'Admin authentication required',
      message: 'No admin token provided',
    });
  }

  // Check if token exists in adminSessions (from app.js)
  // This will be accessed via req.app.get('adminSessions')
  const adminSessions = req.app.get('adminSessions');

  if (!adminSessions || !adminSessions.has(token)) {
    return res.status(401).json({
      error: 'Admin authentication failed',
      message: 'Invalid or expired admin token',
    });
  }

  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireEmailVerified,
  requireAdmin,
};
