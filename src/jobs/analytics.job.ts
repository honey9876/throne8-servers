import cron from 'node-cron';
import mongoose from 'mongoose';
import Analytics from '../company/models/CompanyAnalytics.model';
import { Company, CompanyPost } from '@/company/models';
import logger from '@/shared/logger.util';

interface CompanyDoc {
  _id: {
    toString(): string;
  };
}

interface PostDoc {
  _id: mongoose.Types.ObjectId;
  engagementMetrics: {
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
  };
}

export class AnalyticsJob {
  // =====================================================
  // DAILY AGGREGATION JOB
  // Runs every day at 1:00 AM
  // =====================================================
  static startDailyAggregation(): void {
    // Run at 1:00 AM every day
    cron.schedule('0 1 * * *', async () => {
      logger.info('🔄 Starting daily analytics aggregation...');
      await this.aggregateDailyAnalytics();
    });

    logger.info('✅ Daily analytics aggregation job scheduled (1:00 AM daily)');
  }

  // =====================================================
  // AGGREGATE DAILY ANALYTICS
  // =====================================================
  static async aggregateDailyAnalytics(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      logger.info(`Aggregating analytics for ${yesterday.toISOString()}`);

      // Get all active companies
      const companies = await Company.find({ status: 'Active' }).select('_id').lean();

      logger.info(`Found ${companies.length} active companies to process`);

      let processed = 0;
      let errors = 0;

      // Process each company
      for (const company of companies as CompanyDoc[]) {
        try {
          await this.aggregateCompanyAnalytics(company._id.toString(), yesterday);
          processed++;
        } catch (error : any) {
          errors++;
          logger.error(`Error aggregating analytics for company ${company._id}:`, error);
        }
      }

      logger.info(
        `✅ Daily analytics aggregation completed. Processed: ${processed}, Errors: ${errors}`
      );
    } catch (error : any) {
      logger.error('❌ Fatal error in daily analytics aggregation:', error);
    }
  }

  // =====================================================
  // AGGREGATE COMPANY ANALYTICS
  // =====================================================
  static async aggregateCompanyAnalytics(companyId: string, date: Date): Promise<void> {
    try {
      // Find or create analytics record for the date
      let analytics = await Analytics.findOne({
        company: companyId,
        date,
      });

      if (!analytics) {
        analytics = new Analytics({
          company: companyId,
          date,
        });
      }

      // Get posts published on this date
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const postsPublished = await CompanyPost.countDocuments({
        company: companyId,
        publishedAt: { $gte: date, $lt: nextDay },
        isPublished: true,
      });

      // Update posts published count
      analytics.metrics.postsPublished = postsPublished;

      // Get top posts for the day (by views and engagement)
      const topPosts = await CompanyPost.find({
        company: companyId,
        isPublished: true,
      })
        .sort({
          'engagementMetrics.viewsCount': -1,
          'engagementMetrics.likesCount': -1,
        })
        .limit(5)
        .select('_id engagementMetrics')
        .lean();

      // ✅ FIXED: Proper type casting for ObjectId
      analytics.topPosts = (topPosts as PostDoc[]).map((post) => ({
        post: new mongoose.Types.ObjectId(post._id),
        views: post.engagementMetrics.viewsCount,
        engagement:
          post.engagementMetrics.likesCount +
          post.engagementMetrics.commentsCount +
          post.engagementMetrics.sharesCount,
      }));

      await analytics.save();

      logger.debug(`Analytics aggregated for company ${companyId} on ${date.toISOString()}`);
    } catch (error : any) {
      logger.error(`Error aggregating company analytics for ${companyId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // CLEANUP OLD ANALYTICS (Optional)
  // Runs once a week on Sunday at 2:00 AM
  // =====================================================
  static startWeeklyCleanup(): void {
    // Run at 2:00 AM every Sunday
    cron.schedule('0 2 * * 0', async () => {
      logger.info('🧹 Starting weekly analytics cleanup...');
      await this.cleanupOldAnalytics();
    });

    logger.info('✅ Weekly analytics cleanup job scheduled (2:00 AM every Sunday)');
  }

  // =====================================================
  // CLEANUP OLD ANALYTICS DATA
  // Removes analytics older than 2 years
  // =====================================================
  static async cleanupOldAnalytics(): Promise<void> {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const result = await Analytics.deleteMany({
        date: { $lt: twoYearsAgo },
      });

      logger.info(`✅ Cleaned up ${result.deletedCount} old analytics records (older than 2 years)`);
    } catch (error : any) {
      logger.error('❌ Error in analytics cleanup:', error);
    }
  }

  // =====================================================
  // START ALL JOBS
  // =====================================================
  static startAllJobs(): void {
    this.startDailyAggregation();
    this.startWeeklyCleanup();
    logger.info('🚀 All analytics jobs started successfully');
  }

  // =====================================================
  // MANUAL TRIGGER (for testing)
  // =====================================================
  static async runManually(date?: Date): Promise<void> {
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);

    logger.info(`🔧 Manually triggering analytics aggregation for ${targetDate.toISOString()}`);
    await this.aggregateDailyAnalytics();
  }
}

export default AnalyticsJob;