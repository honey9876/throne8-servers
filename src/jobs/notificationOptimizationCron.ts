// src/jobs/notificationOptimizationCron.ts
import cron from 'node-cron';
import { UserInteractionModel } from '@/Job-Service/models';
import { logger } from '@/shared/logger.util';
import { AppError } from '@/shared/errors/app.error';

// Placeholder: Real engagement data analysis logic (from user activity logs)
async function analyzeUserEngagement(userId: string): Promise<any> {
  // Mock data - real mein DB/activity logs se calculate karo
  return {
    bestHour: 14,
    bestDay: 'tuesday',
    engagementScore: 78,
    avgResponseTime: 45,
  };
}

class NotificationOptimizationCron {
  static init(): void {
    // Har din subah 4 baje (low traffic time)
    cron.schedule('0 4 * * *', async () => {
      try {
        logger.info('🔔 Running Notification Optimization cron job');

        await this.optimizeUserNotificationTiming();

        logger.info('✅ Notification Optimization cron completed');
      } catch (error: any) {
        logger.error('❌ Error in notification optimization cron:', error);
      }
    }, {
      timezone: "Asia/Kolkata"
    });

    logger.info('🔔 Notification Optimization cron initialized');
  }

  private static async optimizeUserNotificationTiming(): Promise<void> {
    // Find users with smartOptimization enabled
    const users = await UserInteractionModel.find({
      'notificationSettings.smartTiming.smartOptimization': true
    }).lean();

    logger.info(`Optimizing notification timing for ${users.length} users`);

    for (const userDoc of users) {
      try {
        const userId = userDoc.userId;

        const engagement = await analyzeUserEngagement(userId);

        const optimizedTiming = {
          bestHour: engagement.bestHour,
          bestDay: engagement.bestDay,
          confidence: engagement.engagementScore,
          lastOptimized: new Date(),
        };

        await UserInteractionModel.updateOne(
          { userId },
          {
            $set: {
              'notificationSettings.smartTiming.optimized': optimizedTiming,
              updatedAt: new Date()
            }
          }
        );

        // Optional: Cache clear
        // await redisClient.del(`optimal_time:${userId}`);

        logger.info(`Optimized timing updated for user ${userId} - Best hour: ${optimizedTiming.bestHour}`);
      } catch (err: any) {
        logger.error(`Failed to optimize timing for user ${userDoc.userId}:`, err);
      }
    }
  }

  static async triggerManually(): Promise<void> {
    logger.info('🔔 Manually triggering notification optimization cron');
    await this.optimizeUserNotificationTiming();
  }
}

export default NotificationOptimizationCron;