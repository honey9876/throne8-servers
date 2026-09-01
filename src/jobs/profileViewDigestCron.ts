// src/jobs/profileViewDigestCron.ts
//
// Batches unnotified profile views into a single digest notification per user,
// every 10 minutes. Follows the same static-class cron pattern as reminderCron.ts
// (that pattern is confirmed to actually run — it's imported and .init() is called
// from Mentorship/routers/index.ts. The older jobs/notification.job.ts cron, by
// contrast, does NOT appear to be imported/started anywhere in this codebase —
// worth checking whether that one is actually running in production.)

import cron from 'node-cron';
import mongoose from 'mongoose';
import logger from '@/shared/logger.util';
import { profileViewService } from '@/connections/services/profileView.service';
import WhoViewedProfile from '@/connections/models/WhoViewedProfile';

class ProfileViewDigestCron {
  private static isRunning = false;

  static init(): void {
    // Every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
      if (this.isRunning) {
        logger.warn('Profile view digest cron skipped — previous run still in progress');
        return;
      }
      this.isRunning = true;
      try {
        if (mongoose.connection.readyState !== 1) {
          logger.warn('Profile view digest cron skipped — MongoDB not connected', {
            readyState: mongoose.connection.readyState,
          });
          return;
        }
        logger.info('Running profile view digest cron job');
        await this.runDigest();
        logger.info('Profile view digest cron job completed');
      } catch (error) {
        logger.error('Error in profile view digest cron job', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        this.isRunning = false;
      }
    });

    logger.info('Profile view digest cron job initialized');
  }

  /**
   * Finds all distinct users with unnotified profile views and processes
   * a digest notification for each.
   */
  private static async runDigest(): Promise<void> {
    const userIdsWithUnnotifiedViews = await WhoViewedProfile.distinct('viewedId', {
      isNotified: false,
    });

    if (!userIdsWithUnnotifiedViews.length) {
      logger.debug('No unnotified profile views to process');
      return;
    }

    let notifiedCount = 0;
    const BATCH_SIZE = 20; // process 20 users concurrently at a time, instead of one-by-one

    for (let i = 0; i < userIdsWithUnnotifiedViews.length; i += BATCH_SIZE) {
      const batch = userIdsWithUnnotifiedViews.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((userId) => profileViewService.processDigestForUser(userId as string))
      );

      results.forEach((res, idx) => {
        const userId = batch[idx];
        if (res.status === 'fulfilled') {
          if (res.value.notified) notifiedCount++;
        } else {
          // One user's failure shouldn't block the rest of the batch
          logger.warn('Failed to process profile view digest for user', {
            userId,
            error: res.reason instanceof Error ? res.reason.message : 'Unknown error',
          });
        }
      });
    }

    logger.info('Profile view digest processed', {
      totalUsers: userIdsWithUnnotifiedViews.length,
      notifiedCount,
    });
  }

  /** Manual trigger for testing, mirrors ReminderCron's triggerManually() convention */
  static async triggerManually(): Promise<void> {
    await this.runDigest();
  }
}

export default ProfileViewDigestCron;
