const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { friendships, users, notifications } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { eq, and, or, sql } = require('drizzle-orm');

const router = express.Router();

/**
 * Helper function to create notification
 */
async function createNotification(db, userId, type, title, body, data = {}) {
  try {
    await db.insert(notifications).values({
      id: uuidv4(),
      user_id: userId,
      type,
      title,
      body,
      data: JSON.stringify(data),
      read: false,
      created_at: new Date(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

/**
 * GET /api/friends
 * Get list of friends (accepted friendships)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    // Get all accepted friendships where user is either user_id_1 or user_id_2
    const friendshipsResult = await db
      .select()
      .from(friendships)
      .where(
        and(
          or(
            eq(friendships.user_id_1, userId),
            eq(friendships.user_id_2, userId)
          ),
          eq(friendships.status, 'accepted')
        )
      );

    // Get friend user IDs
    const friendUserIds = friendshipsResult.map(friendship =>
      friendship.user_id_1 === userId ? friendship.user_id_2 : friendship.user_id_1
    );

    if (friendUserIds.length === 0) {
      return res.status(200).json({ friends: [] });
    }

    // Get friend details
    const friendsData = await db
      .select({
        id: users.id,
        username: users.username,
        avatar_url: users.avatar_url,
        bio: users.bio,
        last_seen: users.last_seen,
      })
      .from(users)
      .where(sql`${users.id} IN ${sql.raw(`(${friendUserIds.map(() => '?').join(',')})`, friendUserIds)}`);

    res.status(200).json({
      friends: friendsData.map(friend => ({
        id: friend.id,
        username: friend.username,
        avatarUrl: friend.avatar_url,
        bio: friend.bio,
        lastSeen: friend.last_seen,
        isOnline: friend.last_seen && (new Date() - new Date(friend.last_seen)) < 5 * 60 * 1000, // Online if seen in last 5 minutes
      })),
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch friends',
    });
  }
});

/**
 * POST /api/friends/request/:userId
 * Send friend request
 */
router.post('/request/:userId', requireAuth, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { userId: receiverId } = req.params;

    if (senderId === receiverId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Cannot send friend request to yourself',
      });
    }

    const db = getDatabase();

    // Check if receiver exists
    const receiverResult = await db
      .select()
      .from(users)
      .where(eq(users.id, receiverId))
      .limit(1);

    if (receiverResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found',
      });
    }

    // Check if friendship already exists
    const existingFriendship = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.user_id_1, senderId), eq(friendships.user_id_2, receiverId)),
          and(eq(friendships.user_id_1, receiverId), eq(friendships.user_id_2, senderId))
        )
      )
      .limit(1);

    if (existingFriendship.length > 0) {
      const status = existingFriendship[0].status;
      if (status === 'accepted') {
        return res.status(409).json({
          error: 'Validation error',
          message: 'Already friends',
        });
      } else if (status === 'pending') {
        return res.status(409).json({
          error: 'Validation error',
          message: 'Friend request already sent',
        });
      }
    }

    // Create friendship request
    const friendshipId = uuidv4();
    await db.insert(friendships).values({
      id: friendshipId,
      user_id_1: senderId,
      user_id_2: receiverId,
      status: 'pending',
      created_at: new Date(),
    });

    // Create notification for receiver
    await createNotification(
      db,
      receiverId,
      'friend_request',
      'New Friend Request',
      `${req.user.username} sent you a friend request`,
      { friendshipId, senderId, senderUsername: req.user.username }
    );

    res.status(201).json({
      message: 'Friend request sent',
      friendshipId,
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send friend request',
    });
  }
});

/**
 * GET /api/friends/requests
 * Get pending friend requests (received)
 */
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    // Get pending requests where current user is user_id_2 (receiver)
    const requestsResult = await db
      .select({
        friendshipId: friendships.id,
        senderId: friendships.user_id_1,
        createdAt: friendships.created_at,
      })
      .from(friendships)
      .where(
        and(
          eq(friendships.user_id_2, userId),
          eq(friendships.status, 'pending')
        )
      );

    if (requestsResult.length === 0) {
      return res.status(200).json({ requests: [] });
    }

    // Get sender details
    const senderIds = requestsResult.map(req => req.senderId);
    const sendersData = await db
      .select({
        id: users.id,
        username: users.username,
        avatar_url: users.avatar_url,
        bio: users.bio,
      })
      .from(users)
      .where(sql`${users.id} IN ${sql.raw(`(${senderIds.map(() => '?').join(',')})`, senderIds)}`);

    // Combine data
    const requests = requestsResult.map(request => {
      const sender = sendersData.find(s => s.id === request.senderId);
      return {
        friendshipId: request.friendshipId,
        sender: {
          id: sender.id,
          username: sender.username,
          avatarUrl: sender.avatar_url,
          bio: sender.bio,
        },
        createdAt: request.createdAt,
      };
    });

    res.status(200).json({ requests });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch friend requests',
    });
  }
});

/**
 * POST /api/friends/accept/:friendshipId
 * Accept friend request
 */
router.post('/accept/:friendshipId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendshipId } = req.params;
    const db = getDatabase();

    // Get friendship
    const friendshipResult = await db
      .select()
      .from(friendships)
      .where(eq(friendships.id, friendshipId))
      .limit(1);

    if (friendshipResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Friend request not found',
      });
    }

    const friendship = friendshipResult[0];

    // Verify current user is the receiver
    if (friendship.user_id_2 !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only accept friend requests sent to you',
      });
    }

    // Verify status is pending
    if (friendship.status !== 'pending') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Friend request already processed',
      });
    }

    // Accept friendship
    await db
      .update(friendships)
      .set({ status: 'accepted' })
      .where(eq(friendships.id, friendshipId));

    // Create notification for sender
    await createNotification(
      db,
      friendship.user_id_1,
      'friend_accepted',
      'Friend Request Accepted',
      `${req.user.username} accepted your friend request`,
      { friendshipId, accepterId: userId, accepterUsername: req.user.username }
    );

    res.status(200).json({
      message: 'Friend request accepted',
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to accept friend request',
    });
  }
});

/**
 * POST /api/friends/reject/:friendshipId
 * Reject friend request
 */
router.post('/reject/:friendshipId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendshipId } = req.params;
    const db = getDatabase();

    // Get friendship
    const friendshipResult = await db
      .select()
      .from(friendships)
      .where(eq(friendships.id, friendshipId))
      .limit(1);

    if (friendshipResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Friend request not found',
      });
    }

    const friendship = friendshipResult[0];

    // Verify current user is the receiver
    if (friendship.user_id_2 !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only reject friend requests sent to you',
      });
    }

    // Delete friendship
    await db
      .delete(friendships)
      .where(eq(friendships.id, friendshipId));

    res.status(200).json({
      message: 'Friend request rejected',
    });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to reject friend request',
    });
  }
});

/**
 * DELETE /api/friends/:friendshipId
 * Remove friend (unfriend)
 */
router.delete('/:friendshipId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendshipId } = req.params;
    const db = getDatabase();

    // Get friendship
    const friendshipResult = await db
      .select()
      .from(friendships)
      .where(eq(friendships.id, friendshipId))
      .limit(1);

    if (friendshipResult.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Friendship not found',
      });
    }

    const friendship = friendshipResult[0];

    // Verify current user is part of the friendship
    if (friendship.user_id_1 !== userId && friendship.user_id_2 !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only remove your own friends',
      });
    }

    // Delete friendship
    await db
      .delete(friendships)
      .where(eq(friendships.id, friendshipId));

    res.status(200).json({
      message: 'Friend removed',
    });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to remove friend',
    });
  }
});

/**
 * GET /api/friends/online
 * Get online friends (last seen within 5 minutes)
 */
router.get('/online', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    // Get accepted friendships
    const friendshipsResult = await db
      .select()
      .from(friendships)
      .where(
        and(
          or(
            eq(friendships.user_id_1, userId),
            eq(friendships.user_id_2, userId)
          ),
          eq(friendships.status, 'accepted')
        )
      );

    // Get friend user IDs
    const friendUserIds = friendshipsResult.map(friendship =>
      friendship.user_id_1 === userId ? friendship.user_id_2 : friendship.user_id_1
    );

    if (friendUserIds.length === 0) {
      return res.status(200).json({ onlineFriends: [] });
    }

    // Get online friends (seen in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const onlineFriendsData = await db
      .select({
        id: users.id,
        username: users.username,
        avatar_url: users.avatar_url,
        last_seen: users.last_seen,
      })
      .from(users)
      .where(
        and(
          sql`${users.id} IN ${sql.raw(`(${friendUserIds.map(() => '?').join(',')})`, friendUserIds)}`,
          sql`${users.last_seen} >= ${fiveMinutesAgo.toISOString()}`
        )
      );

    res.status(200).json({
      onlineFriends: onlineFriendsData.map(friend => ({
        id: friend.id,
        username: friend.username,
        avatarUrl: friend.avatar_url,
        lastSeen: friend.last_seen,
      })),
    });
  } catch (error) {
    console.error('Get online friends error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch online friends',
    });
  }
});

module.exports = router;
