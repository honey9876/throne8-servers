/**
 * ====================================
 * CRON SERVICE - CENTRALIZED SCHEDULER
 * ====================================
 * Manages all cron jobs in the application
 * 
 * Usage:
 * import cronService from './services/cron.service';
 * cronService.initializeAllJobs();
 */

import { LoggerUtil } from '@/shared/logger.util';
import { scheduleStreakCheckJob, scheduleRankingUpdateJob, scheduleAttendanceJobs, scheduleDataCleanupJob, scheduleReportGenerationJob, scheduleGoalReminderJobs } from '../jobs';

/**
 * Cron Service Class
 */
class CronService {
  private isInitialized: boolean = false;
  private enabledJobs: Set<string> = new Set();

  /**
   * Initialize all cron jobs
   */
  initializeAllJobs(): void {
    if (this.isInitialized) {
      LoggerUtil.warn('Cron jobs already initialized');
      return;
    }

    try {
      LoggerUtil.info('🚀 Initializing cron jobs...');

      // Initialize each job
      this.initializeStreakCheck();
      this.initializeRankingUpdate();
      this.initializeGoalReminders();
      this.initializeAttendance();
      this.initializeDataCleanup();
      this.initializeReportGeneration();

      this.isInitialized = true;

      LoggerUtil.info(
        `✅ All cron jobs initialized successfully. Active jobs: ${this.enabledJobs.size}`
      );
      this.logActiveJobs();
    } catch (error: any) {
      LoggerUtil.error('❌ Failed to initialize cron jobs:', error);
      throw error;
    }
  }

  /**
   * Initialize Streak Check Job
   */
  private initializeStreakCheck(): void {
    try {
      scheduleStreakCheckJob();
      this.enabledJobs.add('streak-check');
      LoggerUtil.info('✅ Streak check job initialized');
    } catch (error: any) {
      LoggerUtil.error('❌ Failed to initialize streak check job:', error);
    }
  }

  /**
   * Initialize Ranking Update Job
   */
  private initializeRankingUpdate(): void {
    try {
      scheduleRankingUpdateJob();
      this.enabledJobs.add('ranking-update');
      LoggerUtil.info('✅ Ranking update job initialized');
    } catch (error: any) {
      LoggerUtil.error('❌ Failed to initialize ranking update job:', error);
    }
  }

  /**
   * Initialize Goal Reminder Jobs
   */
  private initializeGoalReminders(): void {
    try {
      scheduleGoalReminderJobs();
      this.enabledJobs.add('goal-reminders');
      LoggerUtil.info('✅ Goal reminder jobs initialized');
    } catch (error: any) {
      LoggerUtil.error('❌ Failed to initialize goal reminder jobs:', error);
    }
  }

  /**
   * Initialize Attendance Jobs
   */
  private initializeAttendance(): void {
    try {
      scheduleAttendanceJobs();
      this.enabledJobs.add('attendance');
      LoggerUtil.info('✅ Attendance jobs initialized');
    } catch (error: any) {
      LoggerUtil.error('❌ Failed to initialize attendance jobs:', error);
    }
  }

  /**
   * Initialize Data Cleanup Job
   */
  private initializeDataCleanup(): void {
    try {
      scheduleDataCleanupJob();
      this.enabledJobs.add('data-cleanup');
      LoggerUtil.info('✅ Data cleanup job initialized');
    } catch (error: any) {
      LoggerUtil.error('❌ Failed to initialize data cleanup job:', error);
    }
  }

  /**
   * Initialize Report Generation Job
   */
  private initializeReportGeneration(): void {
    try {
      scheduleReportGenerationJob();
      this.enabledJobs.add('report-generation');
      LoggerUtil.info('✅ Report generation job initialized');
    } catch (error: any) {
      LoggerUtil.error('❌ Failed to initialize report generation job:', error);
    }
  }

  /**
   * Log all active jobs
   */
  private logActiveJobs(): void {
    LoggerUtil.info('📋 Active Cron Jobs:');
    this.enabledJobs.forEach((job) => {
      LoggerUtil.info(`  - ${job}`);
    });
  }

  /**
   * Get status of all jobs
   */
  getJobStatus(): {
    isInitialized: boolean;
    enabledJobs: string[];
    totalJobs: number;
  } {
    return {
      isInitialized: this.isInitialized,
      enabledJobs: Array.from(this.enabledJobs),
      totalJobs: this.enabledJobs.size,
    };
  }

  /**
   * Check if a specific job is enabled
   */
  isJobEnabled(jobName: string): boolean {
    return this.enabledJobs.has(jobName);
  }

  /**
   * Shutdown all jobs (for graceful shutdown)
   */
  async shutdown(): Promise<void> {
    LoggerUtil.info('🛑 Shutting down cron jobs...');
    
    // Note: node-cron doesn't have a global stop method
    // Jobs will stop when the process exits
    
    this.isInitialized = false;
    this.enabledJobs.clear();
    
    LoggerUtil.info('✅ Cron jobs shutdown complete');
  }
}

// Export singleton instance
export default new CronService();