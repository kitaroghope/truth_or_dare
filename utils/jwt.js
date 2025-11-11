const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generate JWT access token
 * @param {Object} payload - User data to encode in token
 * @param {string} payload.userId - User ID
 * @param {string} payload.email - User email
 * @param {string} payload.username - Username
 * @returns {string} JWT access token (expires in 24 hours)
 */
function generateAccessToken(payload) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_ACCESS_EXPIRY || '24h';

  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      username: payload.username,
      type: 'access',
    },
    secret,
    { expiresIn }
  );
}

/**
 * Generate JWT refresh token
 * @param {Object} payload - User data to encode in token
 * @param {string} payload.userId - User ID
 * @returns {string} JWT refresh token (expires in 90 days)
 */
function generateRefreshToken(payload) {
  const secret = process.env.JWT_REFRESH_SECRET;
  const expiresIn = process.env.JWT_REFRESH_EXPIRY || '90d';

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
  }

  return jwt.sign(
    {
      userId: payload.userId,
      type: 'refresh',
      jti: crypto.randomBytes(16).toString('hex'), // Unique token ID for rotation
    },
    secret,
    { expiresIn }
  );
}

/**
 * Verify JWT access token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  try {
    const decoded = jwt.verify(token, secret);

    // Verify token type
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token');
    }
    throw error;
  }
}

/**
 * Verify JWT refresh token
 * @param {string} token - JWT refresh token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
  }

  try {
    const decoded = jwt.verify(token, secret);

    // Verify token type
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
}

/**
 * Generate token pair (access + refresh)
 * @param {Object} user - User object
 * @param {string} user.id - User ID
 * @param {string} user.email - User email
 * @param {string} user.username - Username
 * @returns {Object} Object containing accessToken and refreshToken
 */
function generateTokenPair(user) {
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    username: user.username,
  });

  const refreshToken = generateRefreshToken({
    userId: user.id,
  });

  return { accessToken, refreshToken };
}

/**
 * Hash refresh token for storage
 * Tokens should never be stored in plain text
 * @param {string} token - Refresh token to hash
 * @returns {string} SHA256 hash of token
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Decode token without verification (for debugging)
 * WARNING: Do not use for authentication, only for debugging
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
function decodeToken(token) {
  return jwt.decode(token);
}

/**
 * Get token expiration date
 * @param {string} token - JWT token
 * @returns {Date} Expiration date
 */
function getTokenExpiration(token) {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.exp) {
    return null;
  }
  return new Date(decoded.exp * 1000);
}

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} True if expired
 */
function isTokenExpired(token) {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true;
  }
  return expiration < new Date();
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
  hashToken,
  decodeToken,
  getTokenExpiration,
  isTokenExpired,
};
