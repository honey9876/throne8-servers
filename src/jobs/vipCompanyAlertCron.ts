// src/jobs/vipCompanyAlertCron.ts
import cron from 'node-cron';
import { UserInteractionModel } from '@/Job-Service/models';
import { logger } from '@/shared/logger.util';
import { emailService } from '@/Mentorship/services';
import { AppError } from '@/shared/errors/app.error';
import { User } from '@/auth/models';

// Mock/Placeholder: Real mein yeh company job updates fetch karne ka logic hoga
// Example: external API call ya DB se new jobs fetch
async function fetchNewCompanyJobs(companyId: string): Promise<any[]> {
  // Placeholder - real implementation mein company ke recent jobs fetch karo
  return [
    { title: 'Senior Software Engineer', postedAt: new Date() },
    // more jobs...
  ];
}

class VipCompanyAlertCron {
  static init(): void {
    // Har 30 minute mein chalega (adjust as per need)
    cron.schedule('*/30 * * * *', async () => {
      try {
        logger.info('🔔 Running VIP Company Alert cron job');

        await this.checkAndSendVipAlerts();

        logger.info('✅ VIP Company Alert cron completed');
      } catch (error: any) {
        logger.error('❌ Error in VIP company alert cron:', error);
      }
    }, {
      timezone: "Asia/Kolkata"
    });

    logger.info('🔔 VIP Company Alert cron initialized');
  }

  private static async checkAndSendVipAlerts(): Promise<void> {
    // Find all users who have VIP companies set
    const users = await UserInteractionModel.find({
      'notificationSettings.vipCompanies': { $exists: true, $ne: [] }
    }).lean();

    logger.info(`Checking alerts for ${users.length} users with VIP companies`);

    for (const userDoc of users) {
      try {
        const vipCompanies = userDoc.notificationSettings?.vipCompanies || [];

        for (const vip of vipCompanies) {
          const { companyId, alertTypes = [], priority = 'medium', instantNotifications = false } = vip;

          // Fetch new jobs/updates for this company (real logic replace karo)
          const newJobs = await fetchNewCompanyJobs(companyId);

          if (newJobs.length === 0) continue;

          // Filter based on user preferences (alertTypes, priority etc)
          const relevantJobs = newJobs.filter(job => {
            // Example filtering - customize as per your alertTypes
            return alertTypes.includes('new_jobs') || priority === 'high';
          });

          if (relevantJobs.length === 0) continue;

          // Then in the loop (around line 71):
          const user = await User.findOne({ userId: userDoc.userId }).select('email').lean();
          if (!user?.email) continue;


          // Send email alert
          await emailService.sendEmail({
            to: user.email || 'user@example.com', // add email if not present
            subject: `🚨 New Opportunity from VIP Company: ${companyId}`,
            html: `
              <h2>New Jobs from your VIP Company!</h2>
              <p>Hi,</p>
              <p><strong>${companyId}</strong> just posted new opportunities that match your preferences.</p>
              <ul>
                ${relevantJobs.map(j => `<li>${j.title} - Posted: ${j.postedAt.toLocaleString()}</li>`).join('')}
              </ul>
              <p>Check them out quickly!</p>
              <p>Best regards,<br>Your Job Platform</p>
            `,
          });

          // Optional: Update lastAlertSent
          await UserInteractionModel.updateOne(
            { _id: userDoc._id, 'notificationSettings.vipCompanies.companyId': companyId },
            { $set: { 'notificationSettings.vipCompanies.$.lastAlertSent': new Date() } }
          );

          logger.info(`VIP alert sent to user ${userDoc.userId} for company ${companyId}`);
        }
      } catch (err: any) {
        logger.error(`Failed to process VIP alerts for user ${userDoc.userId}:`, err);
      }
    }
  }

  static async triggerManually(): Promise<void> {
    logger.info('🔔 Manually triggering VIP company alert cron');
    await this.checkAndSendVipAlerts();
  }
}

export default VipCompanyAlertCron;