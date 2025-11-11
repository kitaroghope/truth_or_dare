const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { notifications, fcm_tokens } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { eq, and, desc } = require('drizzle-orm');
const { isValidFcmToken, sendNotificationByType } = require('../utils/pushNotifications');

const router = express.Router();

/**
 * GET /api/notifications
 * Get user notifications (paginated)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, unreadOnly = false } = req.query;
    const db = getDatabase();

    // Build query
    let query = db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    // Filter by unread if requested
    if (unreadOnly === 'true') {
      query = db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.user_id, userId),
            eq(notifications.read, false)
          )
        )
        .orderBy(desc(notifications.created_at))
        .limit(parseInt(limit))
        .offset(parseInt(offset));
    }

    const notificationsResult = await query;

    // Parse data field
    const formattedNotifications = notificationsResult.map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: typeof notification.data === 'string'
        ? JSON.parse(notification.data)
        : notification.data,
      read: notification.read,
      createdAt: notification.created_at,
    }));

    res.status(200).json({
      notifications: formattedNotifications,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch notifications',
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    const unreadNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, userId),
          eq(notifications.read, false)
        )
      );

    res.status(200).json({
      count: unreadNotifications.length,
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get unread count',
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read
 */
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const db = getDatabase();

    // Verify notification belongs to user
    const notificationResult = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);

    if (notificationResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Notification not found',
      });
    }

    const notification = notificationResult[0];

    if (notification.user_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot access this notification',
      });
    }

    // Mark as read
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));

    res.status(200).json({
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to mark notification as read',
    });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 */
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.user_id, userId),
          eq(notifications.read, false)
        )
      );

    res.status(200).json({
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to mark all notifications as read',
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete notification
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const db = getDatabase();

    // Verify notification belongs to user
    const notificationResult = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);

    if (notificationResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Notification not found',
      });
    }

    const notification = notificationResult[0];

    if (notification.user_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete this notification',
      });
    }

    // Delete notification
    await db
      .delete(notifications)
      .where(eq(notifications.id, id));

    res.status(200).json({
      message: 'Notification deleted',
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete notification',
    });
  }
});

/**
 * POST /api/notifications/fcm-token
 * Register FCM token for push notifications
 */
router.post('/fcm-token', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, deviceType } = req.body;
    const db = getDatabase();

    // Validate token
    if (!token) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'FCM token is required',
      });
    }

    if (!isValidFcmToken(token)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid FCM token format',
      });
    }

    // Validate device type
    const validDeviceTypes = ['ios', 'android', 'web'];
    if (deviceType && !validDeviceTypes.includes(deviceType)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Device type must be ios, android, or web',
      });
    }

    // Check if token already exists
    const existingToken = await db
      .select()
      .from(fcm_tokens)
      .where(eq(fcm_tokens.token, token))
      .limit(1);

    if (existingToken.length > 0) {
      // Update existing token
      await db
        .update(fcm_tokens)
        .set({
          user_id: userId,
          device_type: deviceType || existingToken[0].device_type,
          updated_at: new Date(),
        })
        .where(eq(fcm_tokens.token, token));

      return res.status(200).json({
        message: 'FCM token updated',
      });
    }

    // Insert new token
    await db.insert(fcm_tokens).values({
      id: uuidv4(),
      user_id: userId,
      token,
      device_type: deviceType || 'unknown',
      updated_at: new Date(),
    });

    res.status(201).json({
      message: 'FCM token registered',
    });
  } catch (error) {
    console.error('Register FCM token error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register FCM token',
    });
  }
});

/**
 * DELETE /api/notifications/fcm-token
 * Unregister FCM token
 */
router.delete('/fcm-token', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    const db = getDatabase();

    if (!token) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'FCM token is required',
      });
    }

    // Delete token
    await db
      .delete(fcm_tokens)
      .where(
        and(
          eq(fcm_tokens.token, token),
          eq(fcm_tokens.user_id, userId)
        )
      );

    res.status(200).json({
      message: 'FCM token unregistered',
    });
  } catch (error) {
    console.error('Unregister FCM token error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to unregister FCM token',
    });
  }
});

/**
 * POST /api/notifications/test
 * Send test push notification (development only)
 */
router.post('/test', requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Test notifications not available in production',
    });
  }

  try {
    const userId = req.user.id;
    const db = getDatabase();

    // Get user's FCM tokens
    const userTokens = await db
      .select()
      .from(fcm_tokens)
      .where(eq(fcm_tokens.user_id, userId));

    if (userTokens.length === 0) {
      return res.status(400).json({
        error: 'No tokens',
        message: 'No FCM tokens registered for this user',
      });
    }

    // Send test notification to first token
    const result = await sendNotificationByType(
      userTokens[0].token,
      'game_invite',
      {
        inviterName: 'Test User',
        gameId: 'test-game-id',
        roomCode: 'TEST123',
      }
    );

    res.status(200).json({
      message: 'Test notification sent',
      result,
    });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send test notification',
    });
  }
});

module.exports = router;
