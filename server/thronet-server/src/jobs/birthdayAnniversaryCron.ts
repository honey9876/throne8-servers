// src/jobs/birthdayAnniversaryCron.ts
//
// Once a day, finds users whose birthday or work anniversary falls on today's
// date and notifies each of their active connections. Follows the same
// static-class cron pattern as profileViewDigestCron.ts (registered the same
// way, from connections/routes/index.ts).

import cron from 'node-cron';
import logger from '@/shared/logger.util';
import User from '@/auth/models/User.model';
import Connection from '@/connections/models/Connection';
import NotificationService from '@/notifications/services/notification.service';

class BirthdayAnniversaryCron {
  private static isRunning = false;

  static init(): void {
    // Once a day, 8:00 AM server time
    cron.schedule('0 8 * * *', async () => {
      if (this.isRunning) {
        logger.warn('Birthday/anniversary cron skipped — previous run still in progress');
        return;
      }
      this.isRunning = true;
      try {
        logger.info('Running birthday/work-anniversary cron job');
        await this.runDigest();
        logger.info('Birthday/work-anniversary cron job completed');
      } catch (error) {
        logger.error('Error in birthday/work-anniversary cron job', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        this.isRunning = false;
      }
    });

    logger.info('Birthday/work-anniversary cron job initialized');
  }

  /**
   * Finds today's celebrants (by month/day, ignoring year) and notifies
   * each of their active, non-archived connections.
   */
  private static async runDigest(): Promise<void> {
    const now = new Date();
    const todayMonth = now.getMonth() + 1; // Mongo $month is 1-indexed
    const todayDay = now.getDate();

    const [birthdayUsers, anniversaryUsers] = await Promise.all([
      User.aggregate([
        {
          $match: {
            dateOfBirth: { $ne: null },
            status: 'active',
            'flags.isDeleted': false,
          },
        },
        {
          $match: {
            $expr: {
              $and: [
                { $eq: [{ $month: '$dateOfBirth' }, todayMonth] },
                { $eq: [{ $dayOfMonth: '$dateOfBirth' }, todayDay] },
              ],
            },
          },
        },
        { $project: { userId: 1 } },
      ]),

      // Work anniversary: still-current role (no endDate) that started on
      // this month/day in a previous year.
      User.aggregate([
        {
          $match: {
            'onboarding.workingProfile.startDate': { $ne: null },
            'onboarding.workingProfile.endDate': null,
            status: 'active',
            'flags.isDeleted': false,
          },
        },
        {
          $match: {
            $expr: {
              $and: [
                { $eq: [{ $month: '$onboarding.workingProfile.startDate' }, todayMonth] },
                { $eq: [{ $dayOfMonth: '$onboarding.workingProfile.startDate' }, todayDay] },
                { $lt: [{ $year: '$onboarding.workingProfile.startDate' }, now.getFullYear()] },
              ],
            },
          },
        },
        { $project: { userId: 1 } },
      ]),
    ]);

    logger.info('Birthday/anniversary celebrants found', {
      birthdayCount: birthdayUsers.length,
      anniversaryCount: anniversaryUsers.length,
    });

    await Promise.all([
      this.notifyCelebrants(birthdayUsers.map((u) => u.userId), 'birthday'),
      this.notifyCelebrants(anniversaryUsers.map((u) => u.userId), 'work_anniversary'),
    ]);
  }

  private static async notifyCelebrants(
    celebrantIds: string[],
    occasion: 'birthday' | 'work_anniversary'
  ): Promise<void> {
    for (const celebrantId of celebrantIds) {
      try {
        const connections = await Connection.find({
          $or: [{ fromUserId: celebrantId }, { toUserId: celebrantId }],
          status: 'active',
          isArchived: false,
        }).select('fromUserId toUserId').lean();

        const recipientIds = [
          ...new Set(
            connections.map((c: any) =>
              c.fromUserId === celebrantId ? c.toUserId : c.fromUserId
            )
          ),
        ];

        if (!recipientIds.length) continue;

        await NotificationService.notifyBirthdayOrAnniversary(celebrantId, occasion, recipientIds);
      } catch (userError) {
        // One user's failure shouldn't block the rest of the batch
        logger.warn(`Failed to process ${occasion} notifications for user`, {
          celebrantId,
          error: userError instanceof Error ? userError.message : 'Unknown error',
        });
      }
    }
  }

  /** Manual trigger for testing, mirrors ProfileViewDigestCron's triggerManually() convention */
  static async triggerManually(): Promise<void> {
    await this.runDigest();
  }
}

export default BirthdayAnniversaryCron;
