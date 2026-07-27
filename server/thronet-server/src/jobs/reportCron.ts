// src/jobs/reportCron.ts
import * as cron from 'node-cron';
import { reportService, emailService } from '@/Mentorship/services';
// import emailService from '@/Mentorslhip/services';
import { logger } from '@/shared/logger.util';

class ReportCronJob {
  /**
   * Start all report generation jobs
   */
  static startReports(): void {
    // Daily reports - Every day at 6 AM
    cron.schedule('0 6 * * *', async () => {
      await this.generateDailyReport();
    });

    // Weekly reports - Every Monday at 7 AM
    cron.schedule('0 7 * * 1', async () => {
      await this.generateWeeklyReport();
    });

    // Monthly reports - 1st of every month at 8 AM
    cron.schedule('0 8 1 * *', async () => {
      await this.generateMonthlyReport();
    });

    logger.info('📅 Report generation jobs scheduled');
  }

  /**
   * Generate and send daily report
   */
  private static async generateDailyReport(): Promise<void> {
    try {
      logger.info('📊 Generating daily report...');

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      const report = await reportService.generatePlatformReport({
        startDate: yesterday,
        endDate: endOfYesterday,
      });

      // Send to admin email
      await this.sendReportEmail('Daily Report', report, 'admin@platform.com');

      logger.info('✅ Daily report generated and sent');
    } catch(error : any) {
      logger.error('❌ Failed to generate daily report:', error);
    }
  }

  /**
   * Generate and send weekly report
   */
  private static async generateWeeklyReport(): Promise<void> {
    try {
      logger.info('📊 Generating weekly report...');

      const today = new Date();
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);

      const report = await reportService.generatePlatformReport({
        startDate: lastWeek,
        endDate: today,
      });

      const revenueReport = await reportService.generateRevenueReport({
        startDate: lastWeek,
        endDate: today,
      });

      // Send to admin email
      await this.sendReportEmail(
        'Weekly Report',
        { platform: report, revenue: revenueReport },
        'admin@platform.com'
      );

      logger.info('✅ Weekly report generated and sent');
    } catch(error : any) {
      logger.error('❌ Failed to generate weekly report:', error);
    }
  }

  /**
   * Generate and send monthly report
   */
  private static async generateMonthlyReport(): Promise<void> {
    try {
      logger.info('📊 Generating monthly report...');

      const today = new Date();
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      lastMonth.setDate(1);

      const endOfLastMonth = new Date(today);
      endOfLastMonth.setDate(0);

      const report = await reportService.generatePlatformReport({
        startDate: lastMonth,
        endDate: endOfLastMonth,
      });

      const revenueReport = await reportService.generateRevenueReport({
        startDate: lastMonth,
        endDate: endOfLastMonth,
      });

      const analyticsReport = await reportService.generateSessionAnalytics({
        startDate: lastMonth,
        endDate: endOfLastMonth,
      });

      // Send comprehensive monthly report
      await this.sendReportEmail(
        'Monthly Report',
        { platform: report, revenue: revenueReport, analytics: analyticsReport },
        'admin@platform.com'
      );

      logger.info('✅ Monthly report generated and sent');
    } catch(error : any) {
      logger.error('❌ Failed to generate monthly report:', error);
    }
  }

  /**
   * Send report via email
   */
  private static async sendReportEmail(
    subject: string,
    data: any,
    recipient: string
  ): Promise<void> {
    try {
      const html = this.formatReportHTML(subject, data);

      await emailService.sendEmail({
        to: recipient,
        subject: `Platform ${subject} - ${new Date().toLocaleDateString()}`,
        html,
      });

      logger.info(`Report sent to ${recipient}`);
    } catch(error : any) {
      logger.error('Failed to send report email:', error);
      throw error;
    }
  }

  /**
   * Format report data as HTML
   */
  private static formatReportHTML(title: string, data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          .section { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }
          .metric { margin: 10px 0; }
          .metric-label { font-weight: bold; color: #666; }
          .metric-value { font-size: 24px; color: #4CAF50; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        
        <div class="section">
          <h2>Report Data</h2>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Manual report generation
   */
  static async generateReportNow(
    type: 'daily' | 'weekly' | 'monthly'
  ): Promise<void> {
    logger.info(`🔄 Generating ${type} report manually...`);
    
    switch (type) {
      case 'daily':
        await this.generateDailyReport();
        break;
      case 'weekly':
        await this.generateWeeklyReport();
        break;
      case 'monthly':
        await this.generateMonthlyReport();
        break;
    }
    
    logger.info(`✅ ${type} report generated`);
  }
}

export default ReportCronJob;