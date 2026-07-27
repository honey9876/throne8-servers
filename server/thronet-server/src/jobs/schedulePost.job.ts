// ============================================
// FILE 2: schedulePost.job.ts (PRODUCTION READY)
// ============================================
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import logger from '@/shared/logger.util';
import { Types } from 'mongoose';
import { postService } from '@/company/services';

interface IScheduledPost {
  _id: Types.ObjectId;
  title: string;
  scheduledAt?: Date;
}


class SchedulePostJob {
  private job?: ScheduledTask;
  private readonly CRON_SCHEDULE = '*/5 * * * *'; // Every 5 minutes
  private isRunning = false;
  private publishedCount = 0;
  private failedCount = 0;

  start(): void {
    try {
      this.job = cron.schedule(this.CRON_SCHEDULE, async () => {
        if (this.isRunning) {
          logger.warn('Schedule Post Job already running, skipping...');
          return;
        }

        this.isRunning = true;
        try {
          await this.execute();
        } catch (error : any) {
          logger.error('Error in Schedule Post Job', error);
        } finally {
          this.isRunning = false;
        }
      });

      logger.info('Schedule Post Job started (runs every 5 minutes)');
    } catch (error : any) {
      logger.error('Failed to start Schedule Post Job', error);
      throw error;
    }
  }

  /**
   * STOP JOB
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      logger.info('Schedule Post Job stopped');
    }
  }

  /**
   * EXECUTE JOB
   */
  private async execute(): Promise<void> {
    const startTime = Date.now();
    logger.info('Schedule Post Job executing...');

    try {
      await this.publishScheduledPosts();

      const duration = Date.now() - startTime;
      logger.info(`Schedule Post Job completed in ${duration}ms`);
    } catch (error : any) {
      logger.error('Error executing Schedule Post Job', error);
    }
  }

  private async publishScheduledPosts(): Promise<void> {
    try {
      logger.debug('Checking for scheduled posts...');

      // Get all posts scheduled for now or earlier
      const scheduledPosts = await postService.getScheduledPosts() as IScheduledPost[];

      if (scheduledPosts.length === 0) {
        logger.debug('No scheduled posts to publish');
        return;
      }

      logger.info(`Found ${scheduledPosts.length} posts to publish`);

      // Publish each post
      const results = await Promise.allSettled(
        scheduledPosts.map(async (post) => {
          try {
            await postService.publishPost(post._id.toString());
            this.publishedCount++;
            logger.info(`Successfully published post: ${post._id} - "${post.title}"`);
            return { success: true, postId: post._id };
          } catch (error : any) {
            this.failedCount++;
            logger.error(`Failed to publish post ${post._id}:`, error);
            throw error;
          }
        })
      );

      // Log summary
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      logger.info(`Schedule Post Job summary: ${successful} published, ${failed} failed`);
    } catch (error : any) {
      logger.error('Error in publishScheduledPosts:', error);
      throw error;
    }
  }

  /**
   * MANUALLY RUN JOB (For testing/debugging)
   */
  async forceRun(): Promise<void> {
    logger.info('Manually triggering Schedule Post Job...');
    if (this.isRunning) {
      logger.warn('Job already running');
      return;
    }
    this.isRunning = true;
    try {
      await this.execute();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * GET JOB STATUS
   */
  getStatus(): Record<string, unknown> {
    return {
      running: this.isRunning,
      active: this.job ? true : false,
      nextRun: this.job ? 'Every 5 minutes' : 'Stopped',
      totalPublished: this.publishedCount,
      totalFailed: this.failedCount,
    };
  }

  /**
   * RESET COUNTERS
   */
  resetCounters(): void {
    this.publishedCount = 0;
    this.failedCount = 0;
    logger.info('Schedule Post Job counters reset');
  }
}

export default new SchedulePostJob();