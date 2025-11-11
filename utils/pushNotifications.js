const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;

let firebaseInitialized = false;

if (FIREBASE_PROJECT_ID && FIREBASE_PRIVATE_KEY && FIREBASE_CLIENT_EMAIL) {
  try {
    // Parse private key (it may be escaped in .env)
    const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: FIREBASE_CLIENT_EMAIL,
      }),
    });

    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
  }
} else {
  console.warn('⚠️  Firebase credentials not configured. Push notifications will be disabled.');
}

/**
 * Send push notification to a device
 * @param {string} fcmToken - FCM device token
 * @param {Object} notification - Notification object
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body
 * @param {Object} notification.data - Additional data payload
 */
async function sendPushNotification(fcmToken, notification) {
  if (!firebaseInitialized) {
    console.warn('⚠️  Cannot send push notification: Firebase not initialized');
    console.log(`Would send notification to ${fcmToken}: ${notification.title}`);
    return { success: false, error: 'Firebase not configured' };
  }

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      token: fcmToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Push notification sent successfully:`, response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Push notification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM device tokens
 * @param {Object} notification - Notification object
 */
async function sendMulticastPushNotification(fcmTokens, notification) {
  if (!firebaseInitialized) {
    console.warn('⚠️  Cannot send push notifications: Firebase not initialized');
    return { success: false, error: 'Firebase not configured' };
  }

  if (!fcmTokens || fcmTokens.length === 0) {
    return { success: false, error: 'No tokens provided' };
  }

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      tokens: fcmTokens,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Multicast notification sent: ${response.successCount} succeeded, ${response.failureCount} failed`);
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error) {
    console.error('❌ Multicast push notification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validate FCM token
 * @param {string} token - FCM token to validate
 * @returns {boolean}
 */
function isValidFcmToken(token) {
  // Basic validation: FCM tokens are typically 152+ characters
  return typeof token === 'string' && token.length > 100;
}

/**
 * Send notification based on type
 * @param {string} fcmToken - FCM device token
 * @param {string} type - Notification type
 * @param {Object} data - Notification data
 */
async function sendNotificationByType(fcmToken, type, data) {
  const notifications = {
    friend_request: {
      title: 'New Friend Request',
      body: `${data.senderUsername} sent you a friend request`,
      data: {
        type: 'friend_request',
        friendshipId: data.friendshipId,
        senderId: data.senderId,
      },
    },
    friend_accepted: {
      title: 'Friend Request Accepted',
      body: `${data.accepterUsername} accepted your friend request`,
      data: {
        type: 'friend_accepted',
        userId: data.accepterId,
      },
    },
    game_invite: {
      title: 'Game Invitation',
      body: `${data.inviterName} invited you to play!`,
      data: {
        type: 'game_invite',
        gameId: data.gameId,
        roomCode: data.roomCode,
      },
    },
    game_joined: {
      title: 'Someone joined your game!',
      body: `A player has joined your game ${data.roomCode}`,
      data: {
        type: 'game_joined',
        gameId: data.gameId,
        roomCode: data.roomCode,
      },
    },
    game_round_result: {
      title: 'Round Complete!',
      body: data.message,
      data: {
        type: 'game_round_result',
        gameId: data.gameId,
        roomCode: data.roomCode,
      },
    },
    your_turn: {
      title: "It's Your Turn!",
      body: `Make your move in game ${data.roomCode}`,
      data: {
        type: 'your_turn',
        gameId: data.gameId,
        roomCode: data.roomCode,
      },
    },
  };

  const notification = notifications[type];
  if (!notification) {
    console.error(`Unknown notification type: ${type}`);
    return { success: false, error: 'Unknown notification type' };
  }

  return await sendPushNotification(fcmToken, notification);
}

module.exports = {
  sendPushNotification,
  sendMulticastPushNotification,
  isValidFcmToken,
  sendNotificationByType,
};
