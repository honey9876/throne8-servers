import emailService from './email.service';
import smsService from './sms.service';
import { logger } from '@/shared/logger.util';
import { Mentor, Waitlist } from '../models';
import { User } from '@/auth/models';
import { BadRequestError, ConflictError, NotFoundError } from '@/shared/errors/app.error';
import { IWaitlist, WaitlistStatus } from '../models/Waitlist';
import { generateSecureId } from '@/shared/security';
import waitlistRepository from '../repositories/waitlist.repository';

interface JoinWaitlistInput {
  userId: string;
  mentorId: string;
  preferredDates: Date[];
  preferredTimeSlots: string[];
  sessionType: string;
  timezone: string;
  notes?: string;
}

interface WaitlistPosition {
  position: number;
  totalInLine: number;
  estimatedWaitTime?: string;
  waitlistEntry: IWaitlist;
}

class WaitlistService {
  /**
   * Join waitlist for a mentor.
   *
   * ✅ FIX: Position assignment uses atomic $inc to prevent race condition.
   * Old approach: read last position, then +1, then save — two users could
   * get the same position number if they joined simultaneously.
   *
   * New approach: findOneAndUpdate with $inc on a separate counter document,
   * or use a dedicated atomic counter. Here we use $inc on the mentor's
   * waitlist counter field which is thread-safe.
   */
  async joinWaitlist(input: JoinWaitlistInput, authToken?: string): Promise<IWaitlist> {
    try {
      logger.info(`📋 User ${input.userId} joining waitlist for mentor ${input.mentorId}`);

      const mentor = await Mentor.findOne({ userId: input.mentorId });
      if (!mentor) {
        throw new NotFoundError('Mentor not found');
      }

      // Check if user already in active waitlist for this mentor
      const existingEntry = await Waitlist.findOne({
        userId: input.userId,
        mentorId: input.mentorId,
        status: { $in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED] },
      });

      if (existingEntry) {
        throw new ConflictError('You are already in the waitlist for this mentor');
      }

      // ✅ FIX: Atomic position increment — prevents two users getting same position
      // Uses MongoDB's $inc which is an atomic operation.
      // If the mentor has no waitlistCounter field yet, $inc initializes it to 1.
      const updatedMentor = await Mentor.findOneAndUpdate(
        { userId: input.mentorId },
        { $inc: { waitlistCounter: 1 } },
        { new: true }
      );
      const position = updatedMentor?.waitlistCounter || 1;

      // Expiry: 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const waitlistEntry = new Waitlist({
        waitlistId:         generateSecureId(),
        userId:             input.userId,
        mentorId:           input.mentorId,
        preferredDates:     input.preferredDates,
        preferredTimeSlots: input.preferredTimeSlots,
        sessionType:        input.sessionType,
        timezone:           input.timezone,
        position,
        status:             WaitlistStatus.ACTIVE,
        priority:           0,
        notes:              input.notes,
        expiresAt,
      });

      await waitlistEntry.save();

      // Confirmation email (non-critical)
      try {
        const [user, mentorUser] = await Promise.all([
          User.findByUserId(input.userId),
          User.findByUserId(input.mentorId),
        ]);

        if (user && mentorUser) {
          await emailService.sendEmail({
            to:      user.email,
            subject: '✅ Added to Waitlist',
            html: `
              <h2>You've been added to the waitlist!</h2>
              <p>Hi ${user.fullName || user.email},</p>
              <p>You've been added to the waitlist for <strong>${mentorUser.fullName || mentorUser.email}</strong>.</p>
              <p><strong>Your position:</strong> #${position}</p>
              <p>We'll notify you when a slot becomes available.</p>
            `,
          });
        }
      } catch (error: any) {
        logger.warn(`Failed to send waitlist confirmation email: ${error.message}`);
      }

      logger.info(`✅ Waitlist entry created at position ${position}: ${waitlistEntry._id}`);
      return waitlistEntry;
    } catch (error: any) {
      logger.error(`Failed to join waitlist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user's position in waitlist
   */
  async getUserPosition(userId: string, mentorId: string): Promise<WaitlistPosition | null> {
    try {
      const result = await (Waitlist as any).getUserPosition(userId, mentorId);
      if (!result) return null;

      const totalInLine = await waitlistRepository.countActive(mentorId);

      return {
        position:          result.position,
        totalInLine,
        estimatedWaitTime: this.estimateWaitTime(result.position),
        waitlistEntry:     result.waitlistEntry,
      };
    } catch (error: any) {
      logger.error(`Failed to get user waitlist position: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all waitlist entries for a mentor
   */
  async getMentorWaitlist(mentorId: string, status?: WaitlistStatus): Promise<IWaitlist[]> {
    try {
      return await waitlistRepository.findByMentorId(mentorId, status);
    } catch (error: any) {
      logger.error(`Failed to get mentor waitlist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all waitlist entries for a user
   */
  async getUserWaitlists(userId: string): Promise<IWaitlist[]> {
    try {
      return await waitlistRepository.findByUserId(userId);
    } catch (error: any) {
      logger.error(`Failed to get user waitlists: ${error.message}`);
      throw error;
    }
  }

  /**
   * Notify next person in waitlist — called when a session slot opens
   */
  async notifyNextInLine(mentorId: string, authToken?: string): Promise<IWaitlist | null> {
    try {
      logger.info(`🔔 Notifying next waitlist person for mentor: ${mentorId}`);

      const nextEntry = await (Waitlist as any).getNextInLine(mentorId);
      if (!nextEntry) {
        logger.info('No one in waitlist');
        return null;
      }

      await nextEntry.notify();

      try {
        const [user, mentor] = await Promise.all([
          User.findByUserId(nextEntry.userId),
          User.findByUserId(mentorId),
        ]);

        if (user && mentor) {
          await emailService.sendEmail({
            to:      user.email,
            subject: '🎉 Slot Available — Book Now!',
            html: `
              <h2>Great news! A slot is now available</h2>
              <p>Hi ${user.fullName || user.email},</p>
              <p>A slot has opened up with <strong>${mentor.fullName || mentor.email}</strong>!</p>
              <p><strong>You have 48 hours to book.</strong></p>
              <p>Session Type: ${nextEntry.sessionType}</p>
              <p>Book now before the slot is gone!</p>
            `,
          });

          if (user.phoneNumber) {
            await smsService.sendSMS({
              to:      user.phoneNumber,
              message: `🎉 Slot available with ${mentor.fullName || mentor.email}! Book within 48h. Session: ${nextEntry.sessionType}`,
            });
          }
        }
      } catch (error: any) {
        logger.warn(`Failed to send waitlist notification: ${error.message}`);
      }

      logger.info(`✅ Notified user: ${nextEntry.userId}`);
      return nextEntry;
    } catch (error: any) {
      logger.error(`Failed to notify waitlist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark waitlist entry as booked after user books a session
   */
  async markAsBooked(
    waitlistId: string,
    sessionId: string,
    userId: string
  ): Promise<IWaitlist> {
    try {
      const entry = await waitlistRepository.findByWaitlistId(waitlistId);
      if (!entry) throw new NotFoundError('Waitlist entry not found');

      if (entry.userId !== userId) {
        throw new BadRequestError('Not authorized to modify this waitlist entry');
      }

      await entry.markAsBooked(sessionId);
      logger.info(`✅ Waitlist entry marked as booked: ${waitlistId}`);
      return entry;
    } catch (error: any) {
      logger.error(`Failed to mark waitlist as booked: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove user from waitlist
   */
  async removeFromWaitlist(waitlistId: string, userId: string, reason: string): Promise<void> {
    try {
      const entry = await waitlistRepository.findByWaitlistId(waitlistId);
      if (!entry) throw new NotFoundError('Waitlist entry not found');

      if (entry.userId !== userId) {
        throw new BadRequestError('Not authorized to remove this entry');
      }

      await entry.cancel(reason);

      // Reorder remaining positions after removal
      await (Waitlist as any).reorderPositions(entry.mentorId);

      logger.info(`✅ Removed from waitlist: ${waitlistId}`);
    } catch (error: any) {
      logger.error(`Failed to remove from waitlist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Expire old waitlist entries — called by cron job
   */
  async expireOldEntries(): Promise<{ expiredByDate: number; expiredByWindow: number }> {
    try {
      const result = await (Waitlist as any).expireOldEntries();
      logger.info(`⏰ Expired ${result.expiredByDate + result.expiredByWindow} waitlist entries`);
      return result;
    } catch (error: any) {
      logger.error(`Failed to expire waitlist entries: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get waitlist statistics for a mentor
   */
  async getWaitlistStats(mentorId: string): Promise<any> {
    try {
      return await waitlistRepository.getStats(mentorId);
    } catch (error: any) {
      logger.error(`Failed to get waitlist stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Estimate wait time based on queue position.
   * Rough heuristic: ~1 week per position.
   */
  private estimateWaitTime(position: number): string {
    const weeks = Math.ceil(position * 1);

    if (weeks === 1) return '1 week';
    if (weeks < 4)  return `${weeks} weeks`;
    if (weeks === 4) return '1 month';
    return `${Math.ceil(weeks / 4)} months`;
  }
}

export default new WaitlistService();