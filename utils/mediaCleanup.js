const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db');
const { messages } = require('../db/schema');
const { eq, and, or, lt } = require('drizzle-orm');

/**
 * Delete media files older than 5 minutes
 * This function is called periodically to clean up expired media
 */
async function cleanupExpiredMedia() {
  try {
    const db = getDatabase();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    console.log(`🧹 [Media Cleanup] Running cleanup job - checking for files older than ${fiveMinutesAgo.toISOString()}`);

    // Find expired media messages (audio or file type)
    const expiredMedia = await db
      .select()
      .from(messages)
      .where(
        and(
          or(
            eq(messages.type, 'audio'),
            eq(messages.type, 'file')
          ),
          lt(messages.timestamp, fiveMinutesAgo)
        )
      );

    if (expiredMedia.length === 0) {
      console.log(`✅ [Media Cleanup] No expired media files found`);
      return { deleted: 0, failed: 0 };
    }

    console.log(`🗑️  [Media Cleanup] Found ${expiredMedia.length} expired media files to delete`);

    let deletedCount = 0;
    let failedCount = 0;

    for (const msg of expiredMedia) {
      try {
        // Only delete if content looks like a file path
        if (msg.content && msg.content.startsWith('/uploads/')) {
          const filePath = path.join(__dirname, '..', msg.content);

          // Check if file exists before trying to delete
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`   ✅ Deleted: ${msg.content}`);
          }

          // Update database - replace content with placeholder
          await db
            .update(messages)
            .set({
              content: '[File expired and deleted after 5 minutes]',
              type: 'system'
            })
            .where(eq(messages.id, msg.id));
        }
      } catch (error) {
        failedCount++;
        console.error(`   ❌ Failed to delete ${msg.content}:`, error.message);
      }
    }

    console.log(`✅ [Media Cleanup] Completed - Deleted: ${deletedCount}, Failed: ${failedCount}`);
    return { deleted: deletedCount, failed: failedCount };

  } catch (error) {
    console.error('❌ [Media Cleanup] Error during cleanup:', error);
    return { deleted: 0, failed: 0, error: error.message };
  }
}

/**
 * Start the cleanup job that runs every minute
 * @returns {NodeJS.Timeout} Interval handle
 */
function startCleanupJob() {
  console.log('🧹 [Media Cleanup] Auto-delete job started (5 min TTL, runs every 1 minute)');

  // Run immediately on start
  cleanupExpiredMedia();

  // Then run every minute
  const intervalHandle = setInterval(cleanupExpiredMedia, 60 * 1000);

  return intervalHandle;
}

/**
 * Stop the cleanup job
 * @param {NodeJS.Timeout} intervalHandle - The interval handle to clear
 */
function stopCleanupJob(intervalHandle) {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    console.log('🛑 [Media Cleanup] Auto-delete job stopped');
  }
}

module.exports = {
  cleanupExpiredMedia,
  startCleanupJob,
  stopCleanupJob
};
