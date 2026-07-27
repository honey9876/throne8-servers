import cron from 'node-cron';
import logger from '@/shared/logger.util';
import { Company, Follower, CompanyPost, Event } from '@/company/models';
import { notificationService } from '@/Mentorship/services';
import {Job} from '@/Job-Service/models';
import { PostStatus, EventStatus } from '@/company/interfaces';
import { ICompanyDocument } from '@/company/interfaces';
import { Types } from 'mongoose';

/**
 * Follower Document Interface (matching the Follower model structure)
 */
interface IFollowerDocument {
  _id: Types.ObjectId;
  follower: Types.ObjectId;
  following: Types.ObjectId;
  followedAt: Date;
  isActive: boolean;
  notificationPreferences: {
    posts: boolean;
    events: boolean;
    jobs: boolean;
    updates: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Notification Bulk Options Interface
 */
interface BulkNotificationOptions {
  userIds: string[];
  type: string;
  title: string;
  message: string;
  data: Record<string, string | number | boolean | object>;
  priority: 'low' | 'normal' | 'high';
}

/**
 * Notification Job - Background task for sending notifications
 * Handles various notification types: new posts, events, jobs, etc.
 */
class NotificationJob {
  private isRunning = false;

  /**
   * Send bulk notifications (wrapper method for notification service)
   */
  private async sendBulkNotification(options: BulkNotificationOptions): Promise<void> {
    try {
      // Since the notification service doesn't have sendBulkNotification method,
      // we'll simulate it by sending individual notifications
      logger.info(`📤 Sending bulk notification to ${options.userIds.length} users`, {
        type: options.type,
        title: options.title,
      });

      // In a real implementation, you would batch these or use a proper notification service
      // For now, we'll just log it as the service doesn't support bulk notifications yet
      logger.info('Bulk notification prepared', {
        userCount: options.userIds.length,
        type: options.type,
        priority: options.priority,
        data: options.data,
      });

      // TODO: Integrate with actual push notification service (Firebase, OneSignal, etc.)
    } catch (error : any) {
      logger.error('Error sending bulk notification', error);
      throw error;
    }
  }

  /**
   * Initialize notification jobs
   */
  start(): void {
    // Run every 10 minutes: Check for new content and send notifications
    cron.schedule('*/10 * * * *', async () => {
      if (this.isRunning) {
        logger.info('⏭️  Notification job already running, skipping...');
        return;
      }

      this.isRunning = true;
      logger.info('🔔 Starting notification job...');

      try {
        await Promise.all([
          this.sendNewPostNotifications(),
          this.sendUpcomingEventReminders(),
          this.sendJobRecommendations(),
        ]);

        logger.info('✅ Notification job completed successfully');
      } catch (error : any) {
        logger.error('❌ Notification job failed:', error);
      } finally {
        this.isRunning = false;
      }
    });

    // Run daily at 9 AM: Send digest notifications
    cron.schedule('0 9 * * *', async () => {
      await this.sendDailyDigest();
    });

    // Run weekly on Monday at 10 AM: Send weekly summary
    cron.schedule('0 10 * * 1', async () => {
      await this.sendWeeklySummary();
    });

    logger.info('📅 Notification jobs scheduled successfully');
  }

  /**
   * Send notifications for new posts from followed companies
   */
  private async sendNewPostNotifications(): Promise<void> {
    try {
      // Find posts published in last 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentPosts = await CompanyPost.find({
        status: PostStatus.PUBLISHED,
        publishedAt: { $gte: tenMinutesAgo },
        notificationSent: { $ne: true },
      }).populate('company', 'name slug logo');

      logger.info(`Found ${recentPosts.length} new posts to notify`);

      for (const post of recentPosts) {
        try {
          // Get all followers of this company with post notifications enabled
          const followers = await Follower.find({
            following: post.company,
            isActive: true,
            'notificationPreferences.posts': true,
          }).select('follower') as unknown as IFollowerDocument[];

          if (followers.length === 0) continue;

          const company = post.company as unknown as ICompanyDocument;
          const userIds = followers.map(f => f.follower.toString());

          // Send notification
          await this.sendBulkNotification({
            userIds,
            type: 'new_post',
            title: `${company.name} posted something new`,
            message: post.content.substring(0, 100) + '...',
            data: {
              postId: post._id.toString(),
              companyId: company._id.toString(),
              companyName: company.name,
              companySlug: company.slug,
            },
            priority: 'normal',
          });

          // Mark as sent
          await CompanyPost.findByIdAndUpdate(post._id, {
            notificationSent: true,
          });

          logger.info(
            `✅ Sent notification for post ${post._id} to ${userIds.length} followers`
          );
        } catch (error : any) {
          logger.error(`Failed to send notification for post ${post._id}:`, error);
        }
      }
    } catch (error : any) {
      logger.error('Error in sendNewPostNotifications:', error);
    }
  }

  /**
   * Send reminders for upcoming events
   */
  private async sendUpcomingEventReminders(): Promise<void> {
    try {
      // Find events starting in 24 hours
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const dayAfterTomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);

      const upcomingEvents = await Event.find({
        status: EventStatus.UPCOMING,
        startDate: { $gte: tomorrow, $lt: dayAfterTomorrow },
        reminderSent: { $ne: true },
      }).populate('company', 'name slug logo');

      logger.info(`Found ${upcomingEvents.length} upcoming events to remind`);

      for (const event of upcomingEvents) {
        try {
          // Get followers who have event notifications enabled
          const followers = await Follower.find({
            following: event.company,
            isActive: true,
            'notificationPreferences.events': true,
          }).select('follower') as unknown as IFollowerDocument[];

          if (followers.length === 0) continue;

          const company = event.company as unknown as ICompanyDocument;
          const userIds = followers.map(f => f.follower.toString());

          // Send reminder notification
          await this.sendBulkNotification({
            userIds,
            type: 'event_reminder',
            title: `Reminder: ${event.title} is tomorrow!`,
            message: `Don't miss ${company.name}'s event starting at ${event.startDate.toLocaleString()}`,
            data: {
              eventId: event._id.toString(),
              companyId: company._id.toString(),
              eventTitle: event.title,
            },
            priority: 'high',
          });

          // Mark reminder as sent
          await Event.findByIdAndUpdate(event._id, {
            reminderSent: true,
          });

          logger.info(
            `✅ Sent event reminder for ${event._id} to ${userIds.length} users`
          );
        } catch (error : any) {
          logger.error(`Failed to send reminder for event ${event._id}:`, error);
        }
      }
    } catch (error : any) {
      logger.error('Error in sendUpcomingEventReminders:', error);
    }
  }

  /**
   * Send job recommendations based on user interests
   */
  private async sendJobRecommendations(): Promise<void> {
    try {
      // Find recently posted jobs (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentJobs = await Job.find({
        status: 'Active',
        postedDate: { $gte: oneDayAgo },
        notificationSent: { $ne: true },
      }).populate('company', 'name slug logo industry');

      logger.info(`Found ${recentJobs.length} new jobs to recommend`);

      for (const job of recentJobs) {
        try {
          const company = job.company as unknown as ICompanyDocument;

          // Find users following companies in same industry with job notifications enabled
          const companiesInIndustry = await Company.find({
            industry: company.industry,
            status: 'Active',
          }).select('_id');

          const companyIds = companiesInIndustry.map(c => c._id);

          const interestedFollowers = await Follower.find({
            following: { $in: companyIds },
            isActive: true,
            'notificationPreferences.jobs': true,
          }).select('follower') as unknown as IFollowerDocument[];

          if (interestedFollowers.length === 0) continue;

          // Remove duplicates
          const uniqueUserIds = [...new Set(interestedFollowers.map(f => f.follower.toString()))];

          // Send job recommendation
          await this.sendBulkNotification({
            userIds: uniqueUserIds,
            type: 'job_recommendation',
            title: `New job opportunity at ${company.name}`,
            message: `${job.title} - ${job.location}`,
            data: {
              jobId: job._id.toString(),
              companyId: company._id.toString(),
              jobTitle: job.title,
              location: job.location,
            },
            priority: 'normal',
          });

          // Mark as sent
          await Job.findByIdAndUpdate(job._id, {
            notificationSent: true,
          });

          logger.info(
            `✅ Sent job recommendation for ${job._id} to ${uniqueUserIds.length} users`
          );
        } catch (error : any) {
          logger.error(`Failed to send job recommendation for ${job._id}:`, error);
        }
      }
    } catch (error : any) {
      logger.error('Error in sendJobRecommendations:', error);
    }
  }

  /**
   * Send daily digest of top content
   */
  private async sendDailyDigest(): Promise<void> {
    try {
      logger.info('📧 Sending daily digest...');

      // Find active followers with updates/digest notifications enabled
      const followers = await Follower.find({
        isActive: true,
        'notificationPreferences.updates': true,
      }).distinct('follower');

      if (followers.length === 0) {
        logger.info('No active followers for daily digest');
        return;
      }

      // Get yesterday's date range
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find top posts from yesterday
      const topPosts = await  CompanyPost.find({
        status: PostStatus.PUBLISHED,
        publishedAt: { $gte: yesterday, $lt: today },
      })
        .sort({ 'engagement.likes': -1 })
        .limit(5)
        .populate('company', 'name slug logo');

      if (topPosts.length === 0) {
        logger.info('No posts for daily digest');
        return;
      }

      const userIds = followers.map(f => f.toString());

      // Send digest notification
      await this.sendBulkNotification({
        userIds,
        type: 'daily_digest',
        title: '📰 Your Daily Digest',
        message: `Top ${topPosts.length} posts from companies you follow`,
        data: {
          posts: topPosts.map((p: any) => {
            const company = p.company as unknown as ICompanyDocument;
            return {
              id: p._id.toString(),
              content: p.content.substring(0, 100),
              companyName: company.name,
            };
          }),
        },
        priority: 'low',
      });

      logger.info(`✅ Sent daily digest to ${userIds.length} users`);
    } catch (error : any) {
      logger.error('Error in sendDailyDigest:', error);
    }
  }

  /**
   * Send weekly summary report
   */
  private async sendWeeklySummary(): Promise<void> {
    try {
      logger.info('📊 Sending weekly summary...');

      // Find active followers with updates/summary notifications enabled
      const followers = await Follower.find({
        isActive: true,
        'notificationPreferences.updates': true,
      }).distinct('follower');

      if (followers.length === 0) {
        logger.info('No active followers for weekly summary');
        return;
      }

      // Get last week's date range
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);

      // Aggregate weekly stats
      const weeklyStats = await CompanyPost.aggregate([
        {
          $match: {
            status: PostStatus.PUBLISHED,
            publishedAt: { $gte: lastWeek },
          },
        },
        {
          $group: {
            _id: null,
            totalPosts: { $sum: 1 },
            totalLikes: { $sum: '$engagement.likes' },
            totalComments: { $sum: '$engagement.comments' },
            totalShares: { $sum: '$engagement.shares' },
          },
        },
      ]);

      const stats = weeklyStats[0] || {
        totalPosts: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
      };

      const userIds = followers.map(f => f.toString());

      // Send summary notification
      await this.sendBulkNotification({
        userIds,
        type: 'weekly_summary',
        title: '📈 Your Weekly Summary',
        message: `${stats.totalPosts} posts, ${stats.totalLikes} likes this week!`,
        data: {
          totalPosts: stats.totalPosts,
          totalLikes: stats.totalLikes,
          totalComments: stats.totalComments,
          totalShares: stats.totalShares,
        },
        priority: 'low',
      });

      logger.info(`✅ Sent weekly summary to ${userIds.length} users`);
    } catch (error : any) {
      logger.error('Error in sendWeeklySummary:', error);
    }
  }
}

export default new NotificationJob();