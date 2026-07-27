// maintenance.service.ts
import {Job, Insights} from '@/Job-Service/models';
import mongoose from 'mongoose';

export class JobMaintenanceService {
  /**
   * Daily cron - 2-3 AM IST (low traffic time)
   * Expired jobs ko status update karo
   */
  static async cleanupExpiredJobs() {
    try {
      const result = await Job.updateMany(
        {
          status: 'active',
          isDeleted: false,
          $or: [
            { 'dates.expires': { $lt: new Date() } },
            { 'dates.expires': null } // safety
          ]
        },
        {
          $set: {
            status: 'expired',
            'dates.lastUpdated': new Date()
          }
        }
      );

      console.log(`Expired jobs cleanup: ${result.modifiedCount} jobs updated to expired`);
    } catch (error : any) {
      console.error('Failed to cleanup expired jobs:', error);
    }
  }

  /**
   * Weekly/Monthly cron - old analytics archive (optional)
   * Agar analytics volume bahut zyada ho raha hai
   */
  static async archiveOldAnalytics(monthsOld = 3) {
    try {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsOld);

      // Assuming Insights is date-based collection
      const oldRecords = await Insights.find({
        date: { $lt: cutoff.toISOString().split('T')[0] }
      }).lean();

      if (oldRecords.length === 0) return;

      await mongoose.connection.db.collection('job_analytics_archive').insertMany(oldRecords);
      await Insights.deleteMany({ date: { $lt: cutoff.toISOString().split('T')[0] } });

      console.log(`Archived ${oldRecords.length} old analytics records`);
    } catch (error : any) {
      console.error('Analytics archive failed:', error);
    }
  }
}