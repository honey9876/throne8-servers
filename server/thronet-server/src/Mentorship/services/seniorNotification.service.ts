// src/Mentorship/services/seniorNotification.service.ts

import { ISeniorSession, ISeniorSessionBooking } from '../interface/seniorSession.types';
export type SeniorApplicationNotificationTarget =
  | string
  | {
      userId: string;
      seniorMentorId?: string;
      id?: string;
    };
import NotificationService, {
  NotificationType,
  NotificationChannel,
} from './notification.service';
import { emitToUser } from '@/socket/emitter';
import { User } from '@/auth/models';
import logger from '@/shared/logger.util';

class SeniorNotificationService {
  /**
   * Helper to retrieve user profile display details safely.
   */
  private async resolveUserDisplay(userId: string): Promise<{
    fullName: string;
    profilePhotoUrl: string | null;
  }> {
    try {
      if (!userId) return { fullName: 'User', profilePhotoUrl: null };
      const userDoc: any = await User.findByUserId(userId);
      if (!userDoc) return { fullName: 'User', profilePhotoUrl: null };

      const fullName =
        userDoc.fullName ||
        `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() ||
        userDoc.email ||
        'User';

      const profilePhotoUrl =
        userDoc.profilePhotoUrl ||
        userDoc.profilePhoto ||
        userDoc.avatar ||
        null;

      return { fullName, profilePhotoUrl };
    } catch (err: any) {
      logger.warn(`Failed to resolve user display for ${userId}: ${err.message}`);
      return { fullName: 'User', profilePhotoUrl: null };
    }
  }

  /**
   * 1. Booking Created
   * Triggered when a mentee books a Senior Session slot.
   * Notifies Senior Mentor about the new request.
   * Sends confirmation / request notice to the mentee.
   */
  async notifyBookingCreated(
    session: ISeniorSession,
    booking: ISeniorSessionBooking
  ): Promise<void> {
    try {
      const mentorUserId = session.mentorId;
      const menteeUserId = booking.menteeId || booking.bookedBy;

      if (!mentorUserId || !menteeUserId) {
        logger.warn('notifyBookingCreated skipped: missing mentorId or menteeId', {
          sessionId: session.sessionId,
          mentorUserId,
          menteeUserId,
        });
        return;
      }

      const menteeDisplay = await this.resolveUserDisplay(menteeUserId);
      const bookingId = (booking as any)._id?.toString() || '';
      const sessionTitle = session.title || 'Senior Mentorship Session';

      // 1) In-App Notification to Senior Mentor
      await NotificationService.sendNotification({
        userId: mentorUserId,
        module: 'senior-mentor',
        type: NotificationType.NEW_BOOKING_REQUEST,
        channels: [NotificationChannel.IN_APP],
        priority: 'high',
        data: {
          sessionId: session.sessionId,
          bookingId,
          menteeId: menteeUserId,
          menteeName: menteeDisplay.fullName,
          menteePhoto: menteeDisplay.profilePhotoUrl,
          actorId: menteeUserId,
          actorName: menteeDisplay.fullName,
          actorPhoto: menteeDisplay.profilePhotoUrl,
          scheduledAt: booking.scheduledAt || session.scheduledAt,
          slotTime: booking.slotTime,
          actionUrl: '/senior-mentor/bookings',
          title: 'New Booking Request',
          message: `${menteeDisplay.fullName} requested a session: "${sessionTitle}".`,
        },
      }).catch((e) => logger.error('SeniorNotification failed (created -> mentor):', e));

      // 2) In-App Notification to Mentee
      const isPending = booking.status === 'pending';
      await NotificationService.sendNotification({
        userId: menteeUserId,
        module: 'senior-mentor',
        type: NotificationType.BOOKING_CONFIRMED,
        channels: [NotificationChannel.IN_APP],
        priority: 'normal',
        data: {
          sessionId: session.sessionId,
          bookingId,
          mentorId: mentorUserId,
          scheduledAt: booking.scheduledAt || session.scheduledAt,
          slotTime: booking.slotTime,
          actionUrl: '/mentorship/user-dashboard?page=upcoming-sessions',
          title: isPending ? 'Booking Request Submitted' : 'Booking Confirmed',
          message: isPending
            ? `Your booking request for "${sessionTitle}" has been sent to the mentor.`
            : `Your booking for "${sessionTitle}" is confirmed.`,
        },
      }).catch((e) => logger.error('SeniorNotification failed (created -> mentee):', e));
    } catch (err: any) {
      logger.error('SeniorNotificationService.notifyBookingCreated error:', err);
    }
  }

  /**
   * 2. Booking Confirmed
   * Triggered when Senior Mentor accepts / confirms a pending booking.
   * Notifies the Mentee.
   */
  async notifyBookingConfirmed(
    session: ISeniorSession,
    booking: ISeniorSessionBooking
  ): Promise<void> {
    try {
      const menteeUserId = booking.menteeId || booking.bookedBy;
      if (!menteeUserId) {
        logger.warn('notifyBookingConfirmed skipped: missing menteeUserId', {
          sessionId: session.sessionId,
        });
        return;
      }

      const mentorUserId = session.mentorId;
      const mentorDisplay = await this.resolveUserDisplay(mentorUserId);
      const bookingId = (booking as any)._id?.toString() || '';
      const sessionTitle = session.title || 'Senior Mentorship Session';

      await NotificationService.sendNotification({
        userId: menteeUserId,
        module: 'senior-mentor',
        type: NotificationType.BOOKING_CONFIRMED,
        channels: [NotificationChannel.IN_APP],
        priority: 'high',
        data: {
          sessionId: session.sessionId,
          bookingId,
          mentorId: mentorUserId,
          mentorName: mentorDisplay.fullName,
          actorId: mentorUserId,
          actorName: mentorDisplay.fullName,
          actorPhoto: mentorDisplay.profilePhotoUrl,
          scheduledAt: booking.scheduledAt || session.scheduledAt,
          slotTime: booking.slotTime,
          actionUrl: '/mentorship/user-dashboard?page=upcoming-sessions',
          title: 'Booking Confirmed',
          message: `Your session "${sessionTitle}" has been confirmed by your mentor.`,
        },
      });

      // Real-time socket event for immediate frontend dashboard synchronization
      emitToUser(menteeUserId, 'booking:confirmed', {
        sessionId: session.sessionId,
        bookingId,
        title: sessionTitle,
        scheduledAt: booking.scheduledAt || session.scheduledAt,
        slotTime: booking.slotTime,
      });
    } catch (err: any) {
      logger.error('SeniorNotificationService.notifyBookingConfirmed error:', err);
    }
  }

  /**
   * 3. Booking Cancelled or Rejected
   * Triggered when a booking is cancelled by mentor or mentee.
   * Notifies the other participant.
   */
  async notifyBookingCancelled(
    session: ISeniorSession,
    booking: ISeniorSessionBooking,
    cancelledByUserId: string,
    reason?: string
  ): Promise<void> {
    try {
      const mentorUserId = session.mentorId;
      const menteeUserId = booking.menteeId || booking.bookedBy;

      const isCancelledByMentor = cancelledByUserId === mentorUserId;
      const targetUserId = isCancelledByMentor ? menteeUserId : mentorUserId;

      if (!targetUserId) {
        logger.warn('notifyBookingCancelled skipped: targetUserId could not be resolved', {
          sessionId: session.sessionId,
          cancelledByUserId,
        });
        return;
      }

      const cancellerDisplay = await this.resolveUserDisplay(cancelledByUserId);
      const bookingId = (booking as any)._id?.toString() || '';
      const sessionTitle = session.title || 'Senior Mentorship Session';
      const cleanReason = reason && reason.trim() ? reason.trim() : 'No reason provided';

      await NotificationService.sendNotification({
        userId: targetUserId,
        module: 'senior-mentor',
        type: NotificationType.SESSION_CANCELLED,
        channels: [NotificationChannel.IN_APP],
        priority: 'high',
        data: {
          sessionId: session.sessionId,
          bookingId,
          cancelledBy: cancelledByUserId,
          actorId: cancelledByUserId,
          actorName: cancellerDisplay.fullName,
          actorPhoto: cancellerDisplay.profilePhotoUrl,
          reason: cleanReason,
          actionUrl: isCancelledByMentor
            ? '/mentorship/user-dashboard?page=upcoming-sessions'
            : '/senior-mentor/bookings',
          title: 'Session Cancelled',
          message: `Session "${sessionTitle}" has been cancelled. Reason: ${cleanReason}`,
        },
      });

      emitToUser(targetUserId, 'booking:cancelled', {
        sessionId: session.sessionId,
        bookingId,
        title: sessionTitle,
        reason: cleanReason,
      });
    } catch (err: any) {
      logger.error('SeniorNotificationService.notifyBookingCancelled error:', err);
    }
  }

  /**
   * 4. Booking Rescheduled
   * Triggered when a booking time is updated.
   * Notifies the other participant.
   */
  async notifyBookingRescheduled(
    session: ISeniorSession,
    booking: ISeniorSessionBooking,
    rescheduledByUserId: string,
    newScheduledAt: Date,
    reason?: string
  ): Promise<void> {
    try {
      const mentorUserId = session.mentorId;
      const menteeUserId = booking.menteeId || booking.bookedBy;

      const isRescheduledByMentor = rescheduledByUserId === mentorUserId;
      const targetUserId = isRescheduledByMentor ? menteeUserId : mentorUserId;

      if (!targetUserId) {
        logger.warn('notifyBookingRescheduled skipped: targetUserId could not be resolved', {
          sessionId: session.sessionId,
          rescheduledByUserId,
        });
        return;
      }

      const reschedulerDisplay = await this.resolveUserDisplay(rescheduledByUserId);
      const bookingId = (booking as any)._id?.toString() || '';
      const sessionTitle = session.title || 'Senior Mentorship Session';
      const formattedDate = new Date(newScheduledAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      await NotificationService.sendNotification({
        userId: targetUserId,
        module: 'senior-mentor',
        type: NotificationType.SESSION_RESCHEDULED,
        channels: [NotificationChannel.IN_APP],
        priority: 'high',
        data: {
          sessionId: session.sessionId,
          bookingId,
          rescheduledBy: rescheduledByUserId,
          actorId: rescheduledByUserId,
          actorName: reschedulerDisplay.fullName,
          actorPhoto: reschedulerDisplay.profilePhotoUrl,
          scheduledAt: newScheduledAt,
          reason: reason || undefined,
          actionUrl: isRescheduledByMentor
            ? '/mentorship/user-dashboard?page=upcoming-sessions'
            : '/senior-mentor/bookings',
          title: 'Session Rescheduled',
          message: `Session "${sessionTitle}" has been rescheduled to ${formattedDate}.${
            reason ? ` Reason: ${reason}` : ''
          }`,
        },
      });

      emitToUser(targetUserId, 'booking:rescheduled', {
        sessionId: session.sessionId,
        bookingId,
        title: sessionTitle,
        scheduledAt: newScheduledAt,
      });
    } catch (err: any) {
      logger.error('SeniorNotificationService.notifyBookingRescheduled error:', err);
    }
  }

  /**
   * 5. Session Started
   * Triggered when Senior Mentor starts the session.
   * Persists notification and emits real-time 'session:started' and 'mentorship:session:started'
   * for the mentee to see the join banner and live room link.
   */
  async notifySessionStarted(
    session: ISeniorSession,
    booking: ISeniorSessionBooking
  ): Promise<void> {
    try {
      const menteeUserId = booking.menteeId || booking.bookedBy;
      if (!menteeUserId) {
        logger.warn('notifySessionStarted skipped: missing menteeUserId', {
          sessionId: session.sessionId,
        });
        return;
      }

      const mentorUserId = session.mentorId;
      const mentorDisplay = await this.resolveUserDisplay(mentorUserId);
      const bookingId = (booking as any)._id?.toString() || '';
      const sessionTitle = session.title || 'Senior Mentorship Session';
      const actionUrl = `/mentorship/session-room/${session.sessionId}?bookingId=${bookingId}`;

      // 1) Persistent In-App Notification
      await NotificationService.sendNotification({
        userId: menteeUserId,
        module: 'senior-mentor',
        type: NotificationType.SESSION_STARTED,
        channels: [NotificationChannel.IN_APP],
        priority: 'urgent',
        data: {
          sessionId: session.sessionId,
          bookingId,
          mentorId: mentorUserId,
          mentorName: mentorDisplay.fullName,
          actorId: mentorUserId,
          actorName: mentorDisplay.fullName,
          actorPhoto: mentorDisplay.profilePhotoUrl,
          actionUrl,
          title: 'Session Started',
          message: `Your mentor has started the session "${sessionTitle}". Join now!`,
        },
      });

      // 2) Real-time socket events for live banner
      const socketPayload = {
        sessionId: session.sessionId,
        bookingId,
        roomId: bookingId,
        title: sessionTitle,
        startedAt: new Date().toISOString(),
        scheduledAt: booking.scheduledAt || session.scheduledAt,
        meetingUrl: actionUrl,
      };

      try {
        emitToUser(menteeUserId, 'session:started', socketPayload);
        emitToUser(menteeUserId, 'mentorship:session:started', socketPayload);
      } catch (socketErr: any) {
        logger.error('Socket emit failed for session:started:', socketErr);
      }
    } catch (err: any) {
      logger.error('SeniorNotificationService.notifySessionStarted error:', err);
    }
  }

  /**
   * 6. Session Completed
   * Triggered when Senior Mentor completes the session.
   * Notifies mentee to leave a review and view history.
   */
  async notifySessionCompleted(
    session: ISeniorSession,
    booking: ISeniorSessionBooking
  ): Promise<void> {
    try {
      const menteeUserId = booking.menteeId || booking.bookedBy;
      if (!menteeUserId) {
        logger.warn('notifySessionCompleted skipped: missing menteeUserId', {
          sessionId: session.sessionId,
        });
        return;
      }

      const mentorUserId = session.mentorId;
      const mentorDisplay = await this.resolveUserDisplay(mentorUserId);
      const bookingId = (booking as any)._id?.toString() || '';
      const sessionTitle = session.title || 'Senior Mentorship Session';

      await NotificationService.sendNotification({
        userId: menteeUserId,
        module: 'senior-mentor',
        type: NotificationType.SESSION_COMPLETED,
        channels: [NotificationChannel.IN_APP],
        priority: 'normal',
        data: {
          sessionId: session.sessionId,
          bookingId,
          mentorId: mentorUserId,
          actorId: mentorUserId,
          actorName: mentorDisplay.fullName,
          actorPhoto: mentorDisplay.profilePhotoUrl,
          actionUrl: '/mentorship/user-dashboard?page=past-sessions',
          title: 'Session Completed',
          message: `Your session "${sessionTitle}" is complete. Thank you for participating!`,
        },
      });

      emitToUser(menteeUserId, 'session:ended', {
        sessionId: session.sessionId,
        bookingId,
        title: sessionTitle,
      });
    } catch (err: any) {
      logger.error('SeniorNotificationService.notifySessionCompleted error:', err);
    }
  }

  /**
   * 7. Senior Mentor Application Status
   * Triggered on Admin approval / rejection of an application.
   * Supports either a recipient userId string or an application object.
   */
  async notifyApplicationStatus(
    applicationOrUserId: SeniorApplicationNotificationTarget,
    status: 'verified' | 'rejected' | string,
    reason?: string
  ): Promise<void> {
    try {
      const isString = typeof applicationOrUserId === 'string';
      const targetUserId = isString
        ? applicationOrUserId
        : applicationOrUserId.userId;

      if (!targetUserId) {
        logger.warn('notifyApplicationStatus skipped: missing application.userId');
        return;
      }

      const applicationId = !isString
        ? applicationOrUserId.seniorMentorId || applicationOrUserId.id
        : undefined;

      const isVerified = status === 'verified';
      const title = isVerified
        ? 'Senior Mentor Application Approved'
        : 'Senior Mentor Application Status Update';

      const message = isVerified
        ? 'Congratulations! Your Senior Mentor application has been approved. You can now host Senior Mentor sessions.'
        : `Your Senior Mentor application was not approved.${reason ? ` Reason: ${reason}` : ''}`;

      const actionUrl = isVerified
        ? '/senior-mentor/dashboard'
        : '/senior-mentor/apply';

      await NotificationService.sendNotification({
        userId: targetUserId,
        module: 'senior-mentor',
        type: NotificationType.BOOKING_CONFIRMED, // Fallback safe type mapped in frontend notification bell
        channels: [NotificationChannel.IN_APP],
        priority: 'high',
        data: {
          applicationId,
          status,
          reason,
          actionUrl,
          title,
          message,
        },
      });
    } catch (err: any) {
      logger.error('SeniorNotificationService.notifyApplicationStatus error:', err);
    }
  }
}

export default new SeniorNotificationService();
