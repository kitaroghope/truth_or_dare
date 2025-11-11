const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { users, user_stats } = require('../db/schema');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { eq, like, or, and, ne, sql } = require('drizzle-orm');

const router = express.Router();

// Configure multer for avatar upload (temporary storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  },
});

/**
 * GET /api/users/profile/:userId
 * Get user profile by ID (public info only)
 */
router.get('/profile/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = getDatabase();

    // Get user
    const userResult = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        avatar_url: users.avatar_url,
        bio: users.bio,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found',
      });
    }

    const user = userResult[0];

    // Get stats
    const statsResult = await db
      .select()
      .from(user_stats)
      .where(eq(user_stats.user_id, userId))
      .limit(1);

    const stats = statsResult.length > 0 ? statsResult[0] : null;

    // Hide email unless it's the user's own profile
    const isOwnProfile = req.user && req.user.id === userId;

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: isOwnProfile ? user.email : undefined,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        memberSince: user.created_at,
      },
      stats: stats
        ? {
            gamesPlayed: stats.games_played,
            gamesWon: stats.games_won,
            gamesLost: stats.games_lost,
            truthsCompleted: stats.truths_completed,
            daresCompleted: stats.dares_completed,
            winRate: stats.games_played > 0
              ? Math.round((stats.games_won / stats.games_played) * 100)
              : 0,
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
 * PATCH /api/users/profile
 * Update own user profile
 */
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, bio } = req.body;
    const db = getDatabase();

    const updates = {};

    // Validate and add username if provided
    if (username !== undefined) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Username must be 3-20 characters (letters, numbers, underscore only)',
        });
      }

      // Check if username is already taken by another user
      const existingUser = await db
        .select()
        .from(users)
        .where(and(eq(users.username, username), ne(users.id, userId)))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(409).json({
          error: 'Validation error',
          message: 'Username already taken',
        });
      }

      updates.username = username;
    }

    // Validate and add bio if provided
    if (bio !== undefined) {
      if (bio.length > 500) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Bio must be 500 characters or less',
        });
      }
      updates.bio = bio;
    }

    // Update user
    if (Object.keys(updates).length > 0) {
      await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId));
    }

    // Get updated user
    const userResult = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        avatar_url: users.avatar_url,
        bio: users.bio,
        email_verified: users.email_verified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: userResult[0].id,
        username: userResult[0].username,
        email: userResult[0].email,
        avatarUrl: userResult[0].avatar_url,
        bio: userResult[0].bio,
        emailVerified: userResult[0].email_verified,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update profile',
    });
  }
});

/**
 * POST /api/users/avatar
 * Upload and update user avatar
 */
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No image file provided',
      });
    }

    const userId = req.user.id;
    const db = getDatabase();

    // Get old avatar to delete it later
    const userResult = await db
      .select({ avatar_url: users.avatar_url })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const oldAvatarUrl = userResult[0]?.avatar_url;

    // Generate unique filename
    const filename = `${userId}-${Date.now()}.webp`;
    const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
    const avatarPath = path.join(avatarDir, filename);

    // Ensure avatars directory exists
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }

    // Process image with sharp (resize, optimize, convert to WebP)
    await sharp(req.file.buffer)
      .resize(512, 512, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 85 })
      .toFile(avatarPath);

    // Update user avatar URL
    const avatarUrl = `/uploads/avatars/${filename}`;
    await db
      .update(users)
      .set({ avatar_url: avatarUrl })
      .where(eq(users.id, userId));

    // Delete old avatar file if it exists
    if (oldAvatarUrl) {
      const oldAvatarPath = path.join(__dirname, '..', 'public', oldAvatarUrl);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    res.status(200).json({
      message: 'Avatar uploaded successfully',
      avatarUrl,
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload avatar',
    });
  }
});

/**
 * DELETE /api/users/avatar
 * Delete user avatar
 */
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    // Get current avatar
    const userResult = await db
      .select({ avatar_url: users.avatar_url })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const avatarUrl = userResult[0]?.avatar_url;

    if (!avatarUrl) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No avatar to delete',
      });
    }

    // Remove avatar URL from database
    await db
      .update(users)
      .set({ avatar_url: null })
      .where(eq(users.id, userId));

    // Delete avatar file
    const avatarPath = path.join(__dirname, '..', 'public', avatarUrl);
    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }

    res.status(200).json({
      message: 'Avatar deleted successfully',
    });
  } catch (error) {
    console.error('Delete avatar error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete avatar',
    });
  }
});

/**
 * GET /api/users/search
 * Search users by username
 */
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Search query must be at least 2 characters',
      });
    }

    const searchLimit = Math.min(parseInt(limit), 50); // Max 50 results
    const db = getDatabase();

    // Search users by username
    const searchPattern = `%${q.trim()}%`;
    const results = await db
      .select({
        id: users.id,
        username: users.username,
        avatar_url: users.avatar_url,
        bio: users.bio,
      })
      .from(users)
      .where(like(users.username, searchPattern))
      .limit(searchLimit);

    res.status(200).json({
      users: results.map(user => ({
        id: user.id,
        username: user.username,
        avatarUrl: user.avatar_url,
        bio: user.bio,
      })),
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to search users',
    });
  }
});

/**
 * GET /api/users/stats/leaderboard
 * Get top players leaderboard
 */
router.get('/stats/leaderboard', async (req, res) => {
  try {
    const { limit = 10, sortBy = 'wins' } = req.query;
    const leaderboardLimit = Math.min(parseInt(limit), 100);
    const db = getDatabase();

    let orderByField;
    switch (sortBy) {
      case 'wins':
        orderByField = sql`${user_stats.games_won}`;
        break;
      case 'winRate':
        orderByField = sql`CAST(${user_stats.games_won} AS REAL) / NULLIF(${user_stats.games_played}, 0)`;
        break;
      case 'gamesPlayed':
        orderByField = sql`${user_stats.games_played}`;
        break;
      case 'truths':
        orderByField = sql`${user_stats.truths_completed}`;
        break;
      case 'dares':
        orderByField = sql`${user_stats.dares_completed}`;
        break;
      default:
        orderByField = sql`${user_stats.games_won}`;
    }

    // Get leaderboard
    const results = await db
      .select({
        userId: users.id,
        username: users.username,
        avatarUrl: users.avatar_url,
        gamesPlayed: user_stats.games_played,
        gamesWon: user_stats.games_won,
        gamesLost: user_stats.games_lost,
        truthsCompleted: user_stats.truths_completed,
        daresCompleted: user_stats.dares_completed,
      })
      .from(user_stats)
      .innerJoin(users, eq(users.id, user_stats.user_id))
      .where(sql`${user_stats.games_played} > 0`)
      .orderBy(sql`${orderByField} DESC`)
      .limit(leaderboardLimit);

    res.status(200).json({
      leaderboard: results.map((player, index) => ({
        rank: index + 1,
        userId: player.userId,
        username: player.username,
        avatarUrl: player.avatarUrl,
        stats: {
          gamesPlayed: player.gamesPlayed,
          gamesWon: player.gamesWon,
          gamesLost: player.gamesLost,
          truthsCompleted: player.truthsCompleted,
          daresCompleted: player.daresCompleted,
          winRate: player.gamesPlayed > 0
            ? Math.round((player.gamesWon / player.gamesPlayed) * 100)
            : 0,
        },
      })),
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch leaderboard',
    });
  }
});

module.exports = router;
