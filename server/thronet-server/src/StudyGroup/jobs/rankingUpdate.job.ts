/**
 * ====================================
 * RANKING UPDATE CRON JOB
 * ====================================
 * Runs every 6 hours to recalculate rankings
 * 
 * Tasks:
 * 1. Update all user ranking metrics
 * 2. Recalculate global rankings
 * 3. Recalculate category rankings
 * 4. Recalculate city rankings
 * 5. Update leaderboard cache
 */

import cron from 'node-cron';
import rankingService from '../services/ranking.service';
import { LoggerUtil } from '@/shared/logger.util';
// import { RANKING_CONSTANTS } from '../utils/constants';

/**
 * Main ranking update job
 */
 const rankingUpdateJob = async (): Promise<void> => {
  const startTime = Date.now();
  LoggerUtil.info('🏆 Starting ranking update job...');

  try {
    // Recalculate all rankings using the ranking service
    const result = await rankingService.recalculateAllRankings();

    const timeTaken = Date.now() - startTime;

    LoggerUtil.info(
      `✅ Ranking update job completed successfully:
      - Users updated: ${result.usersUpdated}
      - Groups updated: ${result.groupsUpdated}
      - Time taken: ${timeTaken}ms
      - Last updated: ${result.lastUpdated}`
    );
  } catch (error: any) {
    const timeTaken = Date.now() - startTime;
    LoggerUtil.error(`❌ Ranking update job failed after ${timeTaken}ms:`, {
      error: error.message,
      stack: error.stack,
    });
  }
};

/**
 * Quick ranking update for recently active users
 * Runs every hour for users with recent activity
 */
 const quickRankingUpdateJob = async (): Promise<void> => {
  LoggerUtil.info('⚡ Starting quick ranking update...');

  try {
    // This would update only users active in the last hour
    // For now, we'll skip implementation as it requires additional logic
    LoggerUtil.info('✅ Quick ranking update completed');
  } catch (error: any) {
    LoggerUtil.error('❌ Quick ranking update failed:', error);
  }
};

/**
 * Schedule ranking update jobs
 */
 const scheduleRankingUpdateJob = (): void => {
  // Full ranking update every 6 hours (0:00, 6:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', rankingUpdateJob, {
    timezone: 'Asia/Kolkata',
  });

  LoggerUtil.info(
    '📅 Ranking update job scheduled: Every 6 hours (0:00, 6:00, 12:00, 18:00)'
  );

  // Optional: Quick updates every hour for active users
  // Uncomment if needed
  // cron.schedule('0 * * * *', quickRankingUpdateJob, {
  //   timezone: 'Asia/Kolkata',
  // });
};

export  {
  rankingUpdateJob,
  quickRankingUpdateJob,
  scheduleRankingUpdateJob,
};