const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware
 * Protects against brute force attacks and API abuse
 */

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks on login/signup
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count all requests
  skipFailedRequests: false,
});

/**
 * Medium rate limiter for password reset
 * Prevents abuse of password reset functionality
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: {
    error: 'Too many password reset attempts',
    message: 'Too many password reset requests from this IP, please try again after an hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API rate limiter
 * Protects general API endpoints from abuse
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Strict limiter for file uploads
 * Prevents abuse of upload functionality
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per window
  message: {
    error: 'Too many uploads',
    message: 'Too many file uploads from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Moderate limiter for friend requests
 * Prevents spam friend requests
 */
const friendRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 friend requests per hour
  message: {
    error: 'Too many friend requests',
    message: 'Too many friend requests sent, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limiter for game invitations via email
 * Prevents spam invitations
 */
const emailInviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 invitations per hour
  message: {
    error: 'Too many invitations',
    message: 'Too many email invitations sent, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict limiter for email verification resend
 * Prevents abuse of email sending
 */
const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 verification emails per hour
  message: {
    error: 'Too many verification requests',
    message: 'Too many verification email requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Lenient limiter for search functionality
 * Allows frequent searches but prevents abuse
 */
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: {
    error: 'Too many searches',
    message: 'Too many search requests, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Create a custom rate limiter
 * @param {Object} options - Rate limit options
 * @returns {Function} Rate limit middleware
 */
function createRateLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
}

module.exports = {
  authLimiter,
  passwordResetLimiter,
  apiLimiter,
  uploadLimiter,
  friendRequestLimiter,
  emailInviteLimiter,
  emailVerificationLimiter,
  searchLimiter,
  createRateLimiter,
};
