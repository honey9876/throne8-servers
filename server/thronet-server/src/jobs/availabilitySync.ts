// src/jobs/availabilitySync.ts

import { Availability, SessionMentor } from '@/Mentorship/models';
import { logger } from '@/shared/logger.util';
import { schedule } from 'node-cron';

class AvailabilitySyncJob {
  /**
   * Sync availability with booked sessions
   * Runs every hour
   */
  static startSync(): void {
    schedule('0 * * * *', async () => {
      logger.info('🔄 Starting availability sync job...');
      
      try {
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Get all confirmed sessions in the next week
        const sessions = await SessionMentor.find({
          scheduledAt: { $gte: now, $lte: nextWeek },
          status: { $in: ['confirmed', 'pending'] },
        }).lean();

        logger.info(`Found ${sessions.length} upcoming sessions to sync`);

        // Group sessions by mentor
        const sessionsByMentor = sessions.reduce((acc: any, session) => {
          if (!acc[session.mentorId]) {
            acc[session.mentorId] = [];
          }
          acc[session.mentorId].push(session);
          return acc;
        }, {});

        // Update availability for each mentor
        for (const [mentorId, mentorSessions] of Object.entries(sessionsByMentor)) {
          try {
            await this.syncMentorAvailability(mentorId, mentorSessions as any[]);
          } catch(error : any) {
            logger.error(`Failed to sync availability for mentor ${mentorId}: ${error}`);
          }
        }

        logger.info('✅ Availability sync completed');
      } catch(error : any) {
        logger.error(`❌ Availability sync failed: ${error}`);
      }
    });

    logger.info('📅 Availability sync job scheduled (runs every hour)');
  }

  /**
   * Sync availability for a specific mentor
   */
  private static async syncMentorAvailability(
    mentorId: string,
    sessions: any[]
  ): Promise<void> {
    const availability = await Availability.findOne({ mentorId });

    if (!availability) {
      logger.warn(`No availability found for mentor ${mentorId}`);
      return;
    }

    // Mark booked slots
    for (const session of sessions) {
      const sessionDate = new Date(session.scheduledAt);
      
      // Get day of week (0 = Sunday, 1 = Monday, etc.)
      const dayOfWeekNum = sessionDate.getDay();
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = daysOfWeek[dayOfWeekNum];
      
      const startTime = sessionDate.toTimeString().slice(0, 5);

      // Update weekly schedule - using proper type access
      const schedule = (availability as any).schedule;
      if (schedule && schedule[dayOfWeek]) {
        const daySchedule = schedule[dayOfWeek];
        if (daySchedule && daySchedule.slots) {
          const slot = daySchedule.slots.find((s: any) => s.startTime === startTime);
          if (slot) {
            slot.isBooked = true;
            slot.sessionId = session._id.toString();
          }
        }
      }
    }

    await availability.save();
    logger.info(`Synced availability for mentor ${mentorId}`);
  }

  /**
   * Manual sync for a specific mentor
   */
  static async syncMentor(mentorId: string): Promise<void> {
    logger.info(`🔄 Manual sync for mentor ${mentorId}`);
    
    const now = new Date();
    const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const sessions = await SessionMentor.find({
      mentorId,
      scheduledAt: { $gte: now, $lte: nextMonth },
      status: { $in: ['confirmed', 'pending'] },
    }).lean();

    await this.syncMentorAvailability(mentorId, sessions);
    
    logger.info(`✅ Manual sync completed for mentor ${mentorId}`);
  }
}

export default AvailabilitySyncJob;