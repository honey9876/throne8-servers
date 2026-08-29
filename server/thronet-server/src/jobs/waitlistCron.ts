// import cron from 'node-cron';
// import {Waitlist, SessionMentor, Mentor, User} from '@/models';
// import { smsService, emailService } from '@/services';
// import LoggerUtilProxy, { logger } from '@/shared/logger.util';
// import { BookingStatus } from '../constants/bookingStatus';
// import TimezoneUtils from '@/Mentorship/utils/timezone';

class WaitlistCron {
//   private isRunning = false;

//   /**
//    * Initialize all waitlist-related cron jobs
//    */
//   init(): void {
//     logger.info('🔄 Initializing waitlist cron jobs...');

//     // Run every 5 minutes to check for cancellations and notify waitlist
//     this.scheduleWaitlistNotifications();

//     // Run every hour to clean up expired waitlist entries
//     this.scheduleWaitlistCleanup();

//     logger.info('✅ Waitlist cron jobs initialized');
//   }

//   /**
//    * Schedule waitlist notifications (every 5 minutes)
//    * Notifies waitlist users when a slot becomes available due to cancellation
//    */
//   private scheduleWaitlistNotifications(): void {
//     // Run every 5 minutes
//     cron.schedule('*/5 * * * *', async () => {
//       if (this.isRunning) {
//         logger.debug('⏭️  Waitlist notification job already running, skipping...');
//         return;
//       }

//       this.isRunning = true;
//       try {
//         await this.notifyWaitlistOnCancellation();
//       } catch(error : any) {
//         logger.error('❌ Waitlist notification job failed:', error);
//       } finally {
//         this.isRunning = false;
//       }
//     });

//     logger.info('✅ Waitlist notification job scheduled (every 5 minutes)');
//   }

//   /**
//    * Schedule waitlist cleanup (every hour)
//    * Removes expired waitlist entries
//    */
//   private scheduleWaitlistCleanup(): void {
//     // Run every hour at minute 0
//     cron.schedule('0 * * * *', async () => {
//       try {
//         await this.cleanupExpiredWaitlist();
//       } catch(error : any) {
//         logger.error('❌ Waitlist cleanup job failed:', error);
//       }
//     });

//     logger.info('✅ Waitlist cleanup job scheduled (every hour)');
//   }

//   /**
//    * Notify waitlist users when a slot becomes available
//    */
//   private async notifyWaitlistOnCancellation(): Promise<void> {
//     try {
//       logger.info('🔍 Checking for cancelled sessions with waitlist...');

//       // Find recently cancelled sessions (last 10 minutes)
//       const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
//       const cancelledSessions = await SessionMentor.find({
//         status: BookingStatus.CANCELLED,
//         'cancellation.cancelledAt': { $gte: tenMinutesAgo },
//       }).select('_id mentorId scheduledAt sessionType timezone');

//       if (cancelledSessions.length === 0) {
//         logger.debug('No recently cancelled sessions found');
//         return;
//       }

//       logger.info(`📋 Found ${cancelledSessions.length} cancelled sessions`);

//       for (const session of cancelledSessions) {
//         await this.processWaitlistForSession(session);
//       }
//     } catch(error : any) {
//       logger.error('❌ Failed to notify waitlist:', error);
//     }
//   }

//   /**
//    * Process waitlist for a specific cancelled session
//    */
//   private async processWaitlistForSession(session: any): Promise<void> {
//     try {
//       // Find active waitlist entries for this mentor and date range
//       const waitlistEntries = await Waitlist.find({
//         mentorId: session.mentorId,
//         status: 'ACTIVE',
//         $or: [
//           {
//             preferredDateStart: { $lte: session.scheduledAt },
//             preferredDateEnd: { $gte: session.scheduledAt },
//           },
//           {
//             preferredDateStart: { $exists: false },
//           },
//         ],
//       })
//         .sort({ createdAt: 1 }) // FIFO - First in, first out
//         .limit(5); // Notify top 5 in waitlist

//       if (waitlistEntries.length === 0) {
//         logger.debug(`No waitlist entries for mentor ${session.mentorId}`);
//         return;
//       }

//       logger.info(
//         `📢 Notifying ${waitlistEntries.length} users from waitlist for mentor ${session.mentorId}`
//       );

//       // Get mentor details
//       const mentor = await Mentor.findOne({ mentorId: session.mentorId });
//       if (!mentor) {
//         logger.warn(`Mentor not found: ${session.mentorId}`);
//         return;
//       }

//       // Notify each user in waitlist
//       for (const entry of waitlistEntries) {
//         await this.notifyWaitlistUser(entry, session, mentor);
//       }
//     } catch(error : any) {
//       logger.error('❌ Failed to process waitlist for session:', error);
//     }
//   }

//   /**
//    * Send notification to waitlist user
//    */
//   private async notifyWaitlistUser(
//     waitlistEntry: any,
//     session: any,
//     mentor: any
//   ): Promise<void> {
//     try {
//       // Get user details
//       const user = await User.findByUserId(waitlistEntry.userId);
//       if (!user) {
//         logger.warn(`User not found: ${waitlistEntry.userId}`);
//         return;
//       }

//       const scheduledAtFormatted = TimezoneUtils.formatInTimezone(
//         session.scheduledAt,
//         session.timezone || 'UTC',
//         'MMMM dd, yyyy hh:mm a'
//       );

//       // Send email notification
//       const emailSent = await emailService.sendEmail({
//         to: user.email,
//         subject: `🎉 Slot Available - ${mentor.name || 'Mentor'} is now free!`,
//         html: this.getWaitlistNotificationEmailHTML(
//           user.fullName || user.email,
//           mentor.name || 'Mentor',
//           session.sessionType,
//           scheduledAtFormatted,
//           session.timezone || 'UTC',
//           waitlistEntry._id.toString()
//         ),
//       });

//       // Send SMS notification (if phone available)
//       let smsSent = false;
//       if (user.phoneNumber) {
//         smsSent = await smsService.sendSMS({
//           to: user.phoneNumber,
//           message: `🎉 Slot Available! ${mentor.name || 'Mentor'} is free on ${scheduledAtFormatted}. Book now before it's gone! - Mentorship Platform`,
//         });
//       }

//       // Update waitlist entry status
//       waitlistEntry.notificationsSent = (waitlistEntry.notificationsSent || 0) + 1;
//       waitlistEntry.lastNotifiedAt = new Date();
//       await waitlistEntry.save();

//       logger.info(
//         `✅ Waitlist notification sent to ${user.email} (Email: ${emailSent}, SMS: ${smsSent})`
//       );
//     } catch(error : any) {
//       logger.error('❌ Failed to notify waitlist user:', error);
//     }
//   }

//   /**
//    * Generate waitlist notification email HTML
//    */
//   private getWaitlistNotificationEmailHTML(
//     userName: string,
//     mentorName: string,
//     sessionType: string,
//     scheduledAt: string,
//     timezone: string,
//     waitlistId: string
//   ): string {
//     return `
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <style>
//           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
//           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//           .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
//           .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
//           .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
//           .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
//           .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
//           .urgent { color: #ff5722; font-weight: bold; }
//         </style>
//       </head>
//       <body>
//         <div class="container">
//           <div class="header">
//             <h1>🎉 Great News - Slot Available!</h1>
//           </div>
//           <div class="content">
//             <p>Hi ${userName},</p>
//             <p class="urgent">A slot just opened up with your preferred mentor!</p>
            
//             <div class="details">
//               <h3>📅 Available Slot Details</h3>
//               <p><strong>Mentor:</strong> ${mentorName}</p>
//               <p><strong>Session Type:</strong> ${sessionType}</p>
//               <p><strong>Date & Time:</strong> ${scheduledAt} (${timezone})</p>
//             </div>

//             <p><strong>⏰ Book now before someone else does!</strong></p>
//             <p>This slot won't last long. Click below to book immediately:</p>

//             <a href="https://mentorship.com/book/${waitlistId}" class="button">
//               Book This Slot Now
//             </a>

//             <p>You have <strong>48 hours</strong> to book this slot before we notify the next person in the waitlist.</p>

//             <p>If this time doesn't work for you, you'll remain on the waitlist for future openings.</p>
//           </div>
//           <div class="footer">
//             <p>Mentorship Platform | Don't miss this opportunity!</p>
//             <p>To remove yourself from waitlist, <a href="https://mentorship.com/waitlist/remove/${waitlistId}">click here</a></p>
//           </div>
//         </div>
//       </body>
//       </html>
//     `;
//   }

//   /**
//    * Clean up expired waitlist entries
//    */
//   private async cleanupExpiredWaitlist(): Promise<void> {
//     try {
//       logger.info('🧹 Cleaning up expired waitlist entries...');

//       const now = new Date();

//       // Remove entries that:
//       // 1. Have expired preferred date ranges
//       // 2. Have been notified 3+ times with no booking (48 hours each = 6 days)
//       // 3. Have been inactive for 30+ days

//       const result = await Waitlist.updateMany(
//         {
//           status: 'ACTIVE',
//           $or: [
//             // Expired date range
//             { preferredDateEnd: { $lt: now } },
//             // Notified 3+ times without booking
//             {
//               notificationsSent: { $gte: 3 },
//               lastNotifiedAt: { $lt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000) },
//             },
//             // Inactive for 30+ days
//             {
//               createdAt: { $lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
//               notificationsSent: 0,
//             },
//           ],
//         },
//         {
//           $set: {
//             status: 'EXPIRED',
//             updatedAt: now,
//           },
//         }
//       );

//       logger.info(`✅ Expired ${result.modifiedCount} waitlist entries`);

//       // Delete very old expired entries (90+ days old)
//       const deleteResult = await Waitlist.deleteMany({
//         status: 'EXPIRED',
//         updatedAt: { $lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
//       });

//       if (deleteResult.deletedCount > 0) {
//         logger.info(`🗑️  Deleted ${deleteResult.deletedCount} old expired entries`);
//       }
//     } catch(error : any) {
//       logger.error('❌ Failed to cleanup waitlist:', error);
//     }
//   }

//   /**
//    * Manually trigger waitlist notification for a specific session
//    * (Can be called from cancellation flow)
//    */
  async notifyWaitlistForSession(sessionId: string): Promise<number> {
//     try {
//       logger.info(`📢 Manually notifying waitlist for session: ${sessionId}`);

//       const session = await SessionMentor.findById(sessionId);
//       if (!session) {
//         logger.warn(`Session not found: ${sessionId}`);
//         return 0;
//       }

//       await this.processWaitlistForSession(session);

//       // Return count of notified users
//       const waitlistCount = await Waitlist.countDocuments({
//         mentorId: session.mentorId,
//         status: 'ACTIVE',
//         lastNotifiedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
//       });

//       return waitlistCount;
//     } catch(error : any) {
//       logger.error('❌ Failed to manually notify waitlist:', error);
      return 0;
    }
//   }

//   /**
//    * Get waitlist statistics
//    */
//   async getWaitlistStats(): Promise<any> {
//     try {
//       const stats = await Waitlist.aggregate([
//         {
//           $group: {
//             _id: '$status',
//             count: { $sum: 1 },
//           },
//         },
//       ]);

//       const statsMap: any = {};
//       stats.forEach((stat) => {
//         statsMap[stat._id] = stat.count;
//       });

//       return {
//         active: statsMap.ACTIVE || 0,
//         notified: statsMap.NOTIFIED || 0,
//         expired: statsMap.EXPIRED || 0,
//         total: Object.values(statsMap).reduce((a: any, b: any) => a + b, 0),
//       };
//     } catch(error : any) {
//       logger.error('❌ Failed to get waitlist stats:', error);
//       return { active: 0, notified: 0, expired: 0, total: 0 };
//     }
//   }
}

export default new WaitlistCron();