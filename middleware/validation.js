/**
 * Input Validation and Sanitization Middleware
 * Protects against XSS, SQL injection, and invalid input
 */

/**
 * Sanitize string input
 * Removes potentially dangerous characters
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;

  // Remove HTML tags
  str = str.replace(/<[^>]*>/g, '');

  // Remove script tags and event handlers
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  str = str.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Trim whitespace
  str = str.trim();

  return str;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * At least 8 characters
 */
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

/**
 * Validate username
 * 3-30 characters, alphanumeric and underscores only
 */
function isValidUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate room code
 * 3-50 alphanumeric characters, hyphens, underscores allowed
 */
function isValidRoomCode(roomCode) {
  const roomCodeRegex = /^[a-zA-Z0-9_-]{3,50}$/;
  return roomCodeRegex.test(roomCode);
}

/**
 * Validate game move (rock, paper, scissors)
 */
function isValidGameMove(move) {
  return ['rock', 'paper', 'scissors'].includes(move);
}

/**
 * Validate truth or dare selection
 */
function isValidTruthDare(selection) {
  return ['Truth', 'Dare', 'truth', 'dare'].includes(selection);
}

/**
 * Sanitize request body recursively
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Middleware: Sanitize request body
 */
function sanitizeBody(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
}

/**
 * Middleware: Validate registration input
 */
function validateRegistration(req, res, next) {
  const { username, email, password } = req.body;

  if (!username || !isValidUsername(username)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores',
    });
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid email format',
    });
  }

  if (!password || !isValidPassword(password)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password must be at least 8 characters long',
    });
  }

  next();
}

/**
 * Middleware: Validate login input
 */
function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid email format',
    });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Password is required',
    });
  }

  next();
}

/**
 * Middleware: Validate email input
 */
function validateEmail(req, res, next) {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid email format',
    });
  }

  next();
}

/**
 * Middleware: Validate game move
 */
function validateGameMove(req, res, next) {
  const { move } = req.body;

  if (!move || !isValidGameMove(move)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Move must be rock, paper, or scissors',
    });
  }

  next();
}

/**
 * Middleware: Validate truth or dare selection
 */
function validateTruthDare(req, res, next) {
  const { selection } = req.body;

  if (!selection || !isValidTruthDare(selection)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Selection must be Truth or Dare',
    });
  }

  next();
}

/**
 * Middleware: Validate UUID parameter
 */
function validateUUIDParam(paramName) {
  return (req, res, next) => {
    const uuid = req.params[paramName];

    if (!uuid || !isValidUUID(uuid)) {
      return res.status(400).json({
        error: 'Validation error',
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
}

/**
 * Middleware: Validate room code parameter
 */
function validateRoomCodeParam(req, res, next) {
  const roomCode = req.params.roomCode;

  if (!roomCode || !isValidRoomCode(roomCode)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Invalid room code format',
    });
  }

  next();
}

/**
 * Middleware: Validate pagination parameters
 */
function validatePagination(req, res, next) {
  const { limit, offset } = req.query;

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Limit must be between 1 and 100',
      });
    }
    req.query.limit = limitNum;
  }

  if (offset !== undefined) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Offset must be a non-negative number',
      });
    }
    req.query.offset = offsetNum;
  }

  next();
}

/**
 * Middleware: Validate search query
 */
function validateSearchQuery(req, res, next) {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Search query must be at least 2 characters',
    });
  }

  if (q.length > 100) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Search query must be less than 100 characters',
    });
  }

  // Sanitize search query
  req.query.q = sanitizeString(q);

  next();
}

/**
 * Middleware: Validate profile update
 */
function validateProfileUpdate(req, res, next) {
  const { username, bio } = req.body;

  if (username !== undefined && !isValidUsername(username)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores',
    });
  }

  if (bio !== undefined) {
    if (typeof bio !== 'string') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Bio must be a string',
      });
    }

    if (bio.length > 500) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Bio must be less than 500 characters',
      });
    }
  }

  next();
}

/**
 * Middleware: Validate file upload
 */
function validateFileUpload(allowedTypes, maxSize = 5 * 1024 * 1024) {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No file uploaded',
      });
    }

    // Check file type
    if (allowedTypes && !allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Validation error',
        message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      });
    }

    // Check file size
    if (req.file.size > maxSize) {
      return res.status(400).json({
        error: 'Validation error',
        message: `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`,
      });
    }

    next();
  };
}

/**
 * Middleware: Sanitize query parameters
 */
function sanitizeQueryParams(req, res, next) {
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        req.query[key] = sanitizeString(value);
      }
    }
  }
  next();
}

/**
 * Security headers middleware
 */
function securityHeaders(req, res, next) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self' ws: wss:;"
  );

  next();
}

module.exports = {
  // Sanitization
  sanitizeString,
  sanitizeObject,
  sanitizeBody,
  sanitizeQueryParams,

  // Validation helpers
  isValidEmail,
  isValidPassword,
  isValidUsername,
  isValidUUID,
  isValidRoomCode,
  isValidGameMove,
  isValidTruthDare,

  // Validation middleware
  validateRegistration,
  validateLogin,
  validateEmail,
  validateGameMove,
  validateTruthDare,
  validateUUIDParam,
  validateRoomCodeParam,
  validatePagination,
  validateSearchQuery,
  validateProfileUpdate,
  validateFileUpload,

  // Security
  securityHeaders,
};
