import emailService from './email.service';
import smsService from './sms.service';
import { logger } from '@/shared/logger.util';
import notificationService, { NotificationType, NotificationChannel } from './notification.service';
import { Mentor, Waitlist } from '../models';
import { User } from '@/auth/models';
import { BadRequestError, ConflictError, NotFoundError } from '@/shared/errors/app.error';
import { IWaitlist, WaitlistStatus } from '../models/Waitlist';
import { generateSecureId } from '@/shared/security';
import waitlistRepository from '../repositories/waitlist.repository';

interface JoinWaitlistInput {
  userId: string;
  mentorId: string;
  serviceId?: string;
  serviceTitle?: string;
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
  // ───────────────────────── helpers ─────────────────────────

  /** Frontend may send Mentor.mentorId or Mentor.userId — accept both. */
  private async resolveMentor(idOrUserId: string): Promise<any | null> {
    return Mentor.findOne({ $or: [{ mentorId: idOrUserId }, { userId: idOrUserId }] });
  }

  /** Throws unless requester is the mentor who owns this waitlist. */
  private async assertMentorOwner(mentorIdOrUserId: string, requesterUserId?: string): Promise<any> {
    const mentor = await this.resolveMentor(mentorIdOrUserId);
    if (!mentor) throw new NotFoundError('Mentor not found');
    if (requesterUserId && mentor.userId !== requesterUserId) {
      throw new BadRequestError('Not authorized to manage this waitlist');
    }
    return mentor;
  }

  private async safeUser(userId?: string): Promise<any | null> {
    if (!userId) return null;
    try {
      return await User.findByUserId(userId);
    } catch {
      return null;
    }
  }

  /** Real position in queue (per service if serviceId exists). Only meaningful for ACTIVE entries. */
  private async computeQueuePosition(entry: any): Promise<number> {
    const filter: any = { mentorId: entry.mentorId, status: WaitlistStatus.ACTIVE };
    if (entry.serviceId) filter.serviceId = entry.serviceId;

    const ahead = await Waitlist.countDocuments({
      ...filter,
      $or: [
        { priority: { $gt: entry.priority } },
        { priority: entry.priority, position: { $lt: entry.position } },
      ],
    });
    return ahead + 1;
  }

  private async sendSlotAvailableNotification(entry: any, mentor: any): Promise<void> {
    try {
      const [user, mentorUser] = await Promise.all([
        this.safeUser(entry.userId),
        this.safeUser(mentor?.userId),
      ]);
      if (!user) return;

      const mentorName = mentorUser?.fullName || mentorUser?.email || 'your mentor';
      const what = entry.serviceTitle || entry.sessionType;

      // ✅ In-app notification for slot available
      try {
        await notificationService.sendNotification({
          userId: user.userId,
        module: 'industry-mentor',
          type: NotificationType.WAITLIST_AVAILABLE,
          channels: [NotificationChannel.IN_APP],
          priority: 'high',
          data: {
            title: 'Slot Available!',
            message: `A spot with ${mentorName} just opened up. Book within 24h.`,
            mentorName,
            serviceTitle: entry.serviceTitle,
            sessionType: entry.sessionType,
            waitlistId: entry.waitlistId,
          },
        });
      } catch (inAppErr: any) {
        logger.warn(`Failed to send in-app waitlist notification: ${inAppErr.message}`);
      }

      await emailService.sendEmail({
        to: user.email,
        subject: '🎉 Slot Available — Book Now!',
        html: `
          <h2>Great news! A slot is now available</h2>
          <p>Hi ${user.fullName || user.email},</p>
          <p>A slot has opened up with <strong>${mentorName}</strong> for <strong>${what}</strong>.</p>
                    <p><strong>You have 24 hours to book.</strong> After that it goes to the next person in line.</p>
        `,
      });

      if (user.phoneNumber) {
        await smsService.sendSMS({
          to: user.phoneNumber,
          message: `🎉 Slot available with ${mentorName} (${what})! Book within 24h.`,
        });
      }
    } catch (error: any) {
      logger.warn(`Failed to send waitlist notification: ${error.message}`);
    }
  }

  // ───────────────────────── user side ─────────────────────────

  async joinWaitlist(input: JoinWaitlistInput, _authToken?: string): Promise<any> {
    try {
      logger.info(`📋 User ${input.userId} joining waitlist for mentor ${input.mentorId}`);

      const mentor = await this.resolveMentor(input.mentorId);
      if (!mentor) throw new NotFoundError('Mentor not found');
      if (mentor.userId === input.userId) {
        throw new BadRequestError('You cannot join your own waitlist');
      }

      // Canonical key stored on the waitlist entry
      const mentorKey: string = mentor.mentorId || mentor.userId;

      const existing = await Waitlist.findOne({
        userId: input.userId,
        mentorId: mentorKey,
        ...(input.serviceId ? { serviceId: input.serviceId } : {}),
        status: { $in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED] },
      });
      if (existing) {
        throw new ConflictError(
          input.serviceId
            ? 'You are already on the waitlist for this service'
            : 'You are already on the waitlist for this mentor'
        );
      }

      // Atomic counter → no duplicate positions on simultaneous joins
      const updatedMentor: any = await Mentor.findOneAndUpdate(
        { _id: mentor._id },
        { $inc: { waitlistCounter: 1 } },
        { new: true }
      );
      const position = updatedMentor?.waitlistCounter || 1;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const waitlistEntry = new Waitlist({
        waitlistId: generateSecureId(),
        userId: input.userId,
        mentorId: mentorKey,
        serviceId: input.serviceId,
        serviceTitle: input.serviceTitle,
        preferredDates: input.preferredDates,
        preferredTimeSlots: input.preferredTimeSlots,
        sessionType: input.sessionType,
        timezone: input.timezone,
        position,
        status: WaitlistStatus.ACTIVE,
        priority: 0,
        notes: input.notes,
        expiresAt,
      });
      await waitlistEntry.save();

      // ✅ NEW: Notify the mentor that someone joined their waitlist
      try {
        const student = await this.safeUser(input.userId);
        await notificationService.sendNotification({
          userId: mentor.userId,
        module: 'industry-mentor',
          type: NotificationType.WAITLIST_JOINED,
          channels: [NotificationChannel.IN_APP],
          data: {
            menteeId: input.userId,
            title: 'New Waitlist Join',
            message: `${student?.fullName || student?.email || 'A student'} joined the waitlist for ${input.serviceTitle || input.sessionType}`,
            menteeName: student?.fullName || student?.email,
            serviceTitle: input.serviceTitle,
            sessionType: input.sessionType,
            waitlistId: waitlistEntry.waitlistId,
          },
          priority: 'normal',
        });
      } catch (error: any) {
        logger.warn(`Failed to notify mentor of new waitlist join: ${error.message}`);
      }

      // Confirmation email (non-critical)
      try {
        const [user, mentorUser] = await Promise.all([
          this.safeUser(input.userId),
          this.safeUser(mentor.userId),
        ]);
        if (user) {
          await emailService.sendEmail({
            to: user.email,
            subject: '✅ Added to Waitlist',
            html: `
              <h2>You've been added to the waitlist!</h2>
              <p>Hi ${user.fullName || user.email},</p>
              <p>You're on the waitlist for <strong>${input.serviceTitle || input.sessionType}</strong>
                 with <strong>${mentorUser?.fullName || mentorUser?.email || 'your mentor'}</strong>.</p>
              <p>We'll notify you as soon as a slot opens up.</p>
            `,
          });
        }
      } catch (error: any) {
        logger.warn(`Failed to send waitlist confirmation email: ${error.message}`);
      }

      const queuePosition = await this.computeQueuePosition(waitlistEntry);
      logger.info(`✅ Waitlist entry created (#${queuePosition}): ${waitlistEntry.waitlistId}`);

      return { ...waitlistEntry.toJSON(), queuePosition };
    } catch (error: any) {
      logger.error(`Failed to join waitlist: ${error.message}`);
      throw error;
    }
  }

  async getUserPosition(userId: string, mentorId: string): Promise<WaitlistPosition | null> {
    try {
      const result = await (Waitlist as any).getUserPosition(userId, mentorId);
      if (!result) return null;
      const totalInLine = await waitlistRepository.countActive(mentorId);
      return {
        position: result.position,
        totalInLine,
        estimatedWaitTime: this.estimateWaitTime(result.position),
        waitlistEntry: result.waitlistEntry,
      };
    } catch (error: any) {
      logger.error(`Failed to get user waitlist position: ${error.message}`);
      throw error;
    }
  }

  /** "My Waitlist": entries + mentor name + real position. */
  async getUserWaitlists(userId: string): Promise<any[]> {
    try {
      const entries = await waitlistRepository.findByUserId(userId);
      return await Promise.all(
        entries.map(async (entry: any) => {
          const mentor = await this.resolveMentor(entry.mentorId);
          const mentorUser = await this.safeUser(mentor?.userId);
          return {
            ...entry,
            mentorName: mentorUser?.fullName || mentorUser?.email || 'Mentor',
            queuePosition:
              entry.status === WaitlistStatus.ACTIVE ? await this.computeQueuePosition(entry) : null,
          };
        })
      );
    } catch (error: any) {
      logger.error(`Failed to get user waitlists: ${error.message}`);
      throw error;
    }
  }

  async markAsBooked(waitlistId: string, sessionId: string, userId: string): Promise<IWaitlist> {
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

  /** Works for both: the user leaving, or the mentor removing someone. */
  async removeFromWaitlist(waitlistId: string, requesterUserId: string, reason: string): Promise<void> {
    try {
      const entry = await waitlistRepository.findByWaitlistId(waitlistId);
      if (!entry) throw new NotFoundError('Waitlist entry not found');

      if (entry.userId !== requesterUserId) {
        await this.assertMentorOwner(entry.mentorId, requesterUserId); // throws if not the mentor
      }

      const wasNotified = entry.status === WaitlistStatus.NOTIFIED;

      await entry.cancel(reason);
      await (Waitlist as any).reorderPositions(entry.mentorId);

      // A person who was offered the slot declined → offer it to the next one
      if (wasNotified) {
        await this.notifyNextInLine(entry.mentorId, undefined, { serviceId: entry.serviceId }).catch(
          (e: any) => logger.warn(`Cascade notify failed: ${e.message}`)
        );
      }

      logger.info(`✅ Removed from waitlist: ${waitlistId}`);
    } catch (error: any) {
      logger.error(`Failed to remove from waitlist: ${error.message}`);
      throw error;
    }
  }

  // ───────────────────────── mentor side ─────────────────────────

  async getMentorWaitlist(
    mentorId: string,
    status?: WaitlistStatus,
    requesterUserId?: string
  ): Promise<any[]> {
    try {
      const mentor = await this.assertMentorOwner(mentorId, requesterUserId);
      const entries = await waitlistRepository.findByMentorId(mentor.mentorId || mentor.userId, status);

      const userCache = new Map<string, Promise<any>>();
      return await Promise.all(
        entries.map(async (entry: any) => {
          if (!userCache.has(entry.userId)) userCache.set(entry.userId, this.safeUser(entry.userId));
          const u = await userCache.get(entry.userId);
          return {
            ...entry,
            menteeName: u?.fullName || u?.email || 'Student',
            queuePosition:
              entry.status === WaitlistStatus.ACTIVE ? await this.computeQueuePosition(entry) : null,
          };
        })
      );
    } catch (error: any) {
      logger.error(`Failed to get mentor waitlist: ${error.message}`);
      throw error;
    }
  }

  /** Notify the next ACTIVE person (optionally only for one service). */
  async notifyNextInLine(
    mentorId: string,
    _authToken?: string,
    opts?: { requesterUserId?: string; serviceId?: string }
  ): Promise<IWaitlist | null> {
    try {
      const mentor = await this.assertMentorOwner(mentorId, opts?.requesterUserId);
      const mentorKey = mentor.mentorId || mentor.userId;

      const next: any = await Waitlist.findOne({
        mentorId: mentorKey,
        status: WaitlistStatus.ACTIVE,
        expiresAt: { $gt: new Date() },
        ...(opts?.serviceId ? { serviceId: opts.serviceId } : {}),
      }).sort({ priority: -1, position: 1 });

      if (!next) {
        logger.info('No one in waitlist');
        return null;
      }

      await next.notify();
      await this.sendSlotAvailableNotification(next, mentor);

      logger.info(`✅ Notified user: ${next.userId}`);
      return next;
    } catch (error: any) {
      logger.error(`Failed to notify waitlist: ${error.message}`);
      throw error;
    }
  }

  /** Mentor approves one specific waiting entry (status → notified, 48h window). */
  async approveEntry(waitlistId: string, requesterUserId: string): Promise<IWaitlist> {
    try {
      const entry = await waitlistRepository.findByWaitlistId(waitlistId);
      if (!entry) throw new NotFoundError('Waitlist entry not found');

      const mentor = await this.assertMentorOwner(entry.mentorId, requesterUserId);
      if (entry.status !== WaitlistStatus.ACTIVE) {
        throw new BadRequestError('Only waiting entries can be approved');
      }

      await entry.notify();
      await this.sendSlotAvailableNotification(entry, mentor);
      return entry;
    } catch (error: any) {
      logger.error(`Failed to approve waitlist entry: ${error.message}`);
      throw error;
    }
  }

  async getWaitlistStats(mentorId: string, requesterUserId?: string): Promise<any> {
    try {
      const mentor = await this.assertMentorOwner(mentorId, requesterUserId);
      return await waitlistRepository.getStats(mentor.mentorId || mentor.userId);
    } catch (error: any) {
      logger.error(`Failed to get waitlist stats: ${error.message}`);
      throw error;
    }
  }

  // ───────────────────────── cron ─────────────────────────

  /**
   * Called by cron. Lapsed NOTIFIED entries (48h window over) are expired
   * AND the next person in line is offered the slot.
   */
  async expireOldEntries(): Promise<{ expiredByDate: number; expiredByWindow: number }> {
    try {
      const lapsed: any[] = await Waitlist.find({
        status: WaitlistStatus.NOTIFIED,
        bookingWindowExpiresAt: { $lt: new Date() },
      });

      for (const entry of lapsed) {
        await entry.markAsExpired();
        await this.notifyNextInLine(entry.mentorId, undefined, { serviceId: entry.serviceId }).catch(
          (e: any) => logger.warn(`Cascade notify failed: ${e.message}`)
        );
      }

      const result = await (Waitlist as any).expireOldEntries();
      const summary = {
        expiredByDate: result.expiredByDate,
        expiredByWindow: result.expiredByWindow + lapsed.length,
      };
      logger.info(`⏰ Expired ${summary.expiredByDate + summary.expiredByWindow} waitlist entries`);
      return summary;
    } catch (error: any) {
      logger.error(`Failed to expire waitlist entries: ${error.message}`);
      throw error;
    }
  }

  // ───────────────────────── core process waitlist & claim flow ─────────────────────────

  /**
   * Called when availability changes or a session is cancelled/rescheduled.
   * Finds the first waiting candidate (FIFO) and offers the slot if auto-offer is ON.
   */
  async processWaitlist(
    mentorId: string,
    serviceId?: string,
    slot?: { date?: Date; startTime?: string; endTime?: string; slotId?: string }
  ): Promise<IWaitlist | null> {
    try {
      const mentor = await this.resolveMentor(mentorId);
      if (!mentor) return null;

      // Check mentor auto-offer setting (default true)
      if (mentor.autoOfferWaitlist === false) {
        logger.info(`Auto-offer is disabled for mentor ${mentor.mentorId}`);
        return null;
      }

      const mentorKey = mentor.mentorId || mentor.userId;

      // Find top waiting entry (FIFO: highest priority first, then earliest created)
      const queryFilter: any = {
        mentorId: mentorKey,
        status: { $in: [WaitlistStatus.WAITING, WaitlistStatus.ACTIVE] },
        expiresAt: { $gt: new Date() },
      };
      if (serviceId) {
        queryFilter.serviceId = serviceId;
      }

      // Atomic lock via findOneAndUpdate
      const nextEntry = await Waitlist.findOneAndUpdate(
        queryFilter,
        {
          $set: {
            status: WaitlistStatus.NOTIFIED,
            notifiedAt: new Date(),
            notificationSent: true,
            offeredSlot: slot || {},
            bookingWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h window
          },
        },
        { sort: { priority: -1, position: 1, createdAt: 1 }, new: true }
      );

      if (!nextEntry) {
        logger.info(`No waiting entries found for mentor ${mentorKey}`);
        return null;
      }

      await this.sendSlotAvailableNotification(nextEntry, mentor);
      logger.info(`✅ Offered slot to waitlisted user: ${nextEntry.userId} for service ${serviceId || 'all'}`);
      return nextEntry;
    } catch (error: any) {
      logger.error(`Failed in processWaitlist: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mentee claims an offered waitlist slot within the 24h window.
   */
  async claimWaitlistSlot(waitlistId: string, userId: string, sessionId?: string): Promise<IWaitlist> {
    try {
      const entry = await waitlistRepository.findByWaitlistId(waitlistId);
      if (!entry) throw new NotFoundError('Waitlist entry not found');

      if (entry.userId !== userId) {
        throw new BadRequestError('Not authorized to claim this waitlist offer');
      }

      if (entry.status !== WaitlistStatus.NOTIFIED) {
        throw new BadRequestError(`Cannot claim waitlist entry with status '${entry.status}'`);
      }

      if (entry.bookingWindowExpiresAt && new Date() > entry.bookingWindowExpiresAt) {
        entry.status = WaitlistStatus.EXPIRED;
        await entry.save();
        // Trigger auto-offer to next in line
        this.processWaitlist(entry.mentorId, entry.serviceId).catch((e: any) =>
          logger.warn(`Cascade processWaitlist failed after expiry: ${e.message}`)
        );
        throw new BadRequestError('The claim window for this offer has expired.');
      }

           // Atomic claim: only one concurrent request can flip NOTIFIED -> CONVERTED
           const claimed = await Waitlist.findOneAndUpdate(
            {
              waitlistId,
              userId,
              status: WaitlistStatus.NOTIFIED,
              bookingWindowExpiresAt: { $gt: new Date() },
            },
            {
              $set: {
                status: WaitlistStatus.CONVERTED,
                bookedAt: new Date(),
                ...(sessionId ? { sessionId } : {}),
              },
            },
            { new: true }
          );
          if (!claimed) {
            throw new BadRequestError('Offer is no longer claimable');
          }
          entry.status = claimed.status;
          entry.bookedAt = claimed.bookedAt;
          entry.sessionId = claimed.sessionId;

      // Notify mentor that waitlist offer was claimed
      try {
        const mentor = await this.resolveMentor(entry.mentorId);
        const mentee = await this.safeUser(userId);
        if (mentor) {
          await notificationService.sendNotification({
            userId: mentor.userId,
        module: 'industry-mentor',
            type: NotificationType.WAITLIST_AVAILABLE,
            channels: [NotificationChannel.IN_APP],
            priority: 'normal',
            data: {
              title: 'Waitlist Slot Claimed!',
              message: `${mentee?.fullName || mentee?.email || 'A student'} claimed their offered waitlist slot.`,
              waitlistId: entry.waitlistId,
            },
          });
        }
      } catch (e: any) {
        logger.warn(`Failed to notify mentor of claimed slot: ${e.message}`);
      }

      logger.info(`🎉 Waitlist entry successfully claimed & converted: ${waitlistId}`);
      return entry;
    } catch (error: any) {
      logger.error(`Failed to claim waitlist slot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mentee declines an offered waitlist slot.
   */
  async declineWaitlistSlot(waitlistId: string, userId: string, reason?: string): Promise<IWaitlist> {
    try {
      const entry = await waitlistRepository.findByWaitlistId(waitlistId);
      if (!entry) throw new NotFoundError('Waitlist entry not found');

      if (entry.userId !== userId) {
        throw new BadRequestError('Not authorized to decline this waitlist offer');
      }

      if (entry.status !== WaitlistStatus.NOTIFIED) {
        throw new BadRequestError(`Cannot decline entry with status '${entry.status}'`);
      }

      entry.status = WaitlistStatus.DECLINED;
      entry.cancelReason = reason || 'Declined by mentee';
      await entry.save();

      await (Waitlist as any).reorderPositions(entry.mentorId);

      // Trigger offer to next candidate in queue
      this.processWaitlist(entry.mentorId, entry.serviceId).catch((e: any) =>
        logger.warn(`Cascade processWaitlist failed after decline: ${e.message}`)
      );

      logger.info(`Waitlist slot declined by user ${userId}, entry: ${waitlistId}`);
      return entry;
    } catch (error: any) {
      logger.error(`Failed to decline waitlist slot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mentor updates priority of a waitlist entry.
   */
  async updatePriority(waitlistId: string, requesterUserId: string, priorityDelta: number): Promise<IWaitlist> {
    try {
      const entry = await waitlistRepository.findByWaitlistId(waitlistId);
      if (!entry) throw new NotFoundError('Waitlist entry not found');

      await this.assertMentorOwner(entry.mentorId, requesterUserId);

      entry.priority = (entry.priority || 0) + priorityDelta;
      await entry.save();

      await (Waitlist as any).reorderPositions(entry.mentorId);

      return entry;
    } catch (error: any) {
      logger.error(`Failed to update waitlist priority: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mentor toggles auto-offer setting.
   */
  async toggleAutoOffer(requesterUserId: string, enabled: boolean): Promise<{ autoOfferWaitlist: boolean }> {
    try {
      const mentor = await Mentor.findOne({ userId: requesterUserId });
      if (!mentor) throw new NotFoundError('Mentor profile not found');

      mentor.autoOfferWaitlist = enabled;
      await mentor.save();

      return { autoOfferWaitlist: mentor.autoOfferWaitlist };
    } catch (error: any) {
      logger.error(`Failed to toggle auto offer: ${error.message}`);
      throw error;
    }
  }

  private estimateWaitTime(position: number): string {
    const weeks = Math.ceil(position * 1);
    if (weeks === 1) return '1 week';
    if (weeks < 4) return `${weeks} weeks`;
    if (weeks === 4) return '1 month';
    return `${Math.ceil(weeks / 4)} months`;
  }
}

export default new WaitlistService();