// src/Mentorship/services/notification.service.ts

import { User } from '@/auth/models';
import { UserProfile } from '@/shared/models/index.models';
import ProfilePhoto from '@/Profile/models/ProfilePhoto.model';
import emailService from './email.service';
import smsService from './sms.service';
import logger from '@/config/logging/logger.config';
import { Notification } from '../models';
import { generateSecureId } from '@/shared/security';
// ✅ NEW — for realtime push after DB save
import { emitToUser, getIO } from '@/socket/emitter';
import { emitNotificationCount } from '@/socket/handlers/notificationHandler';
import { resolveUserDetails } from '@/Mentorship/utils/userPhotoHelper';





export enum NotificationType {
  // ✅ ADD — bookSession() needs this distinct type; was wrongly reusing
  // BOOKING_CONFIRMED for both "new request" and "confirmed" before
  NEW_BOOKING_REQUEST = 'new_booking_request',
  BOOKING_CONFIRMED = 'booking_confirmed',
  // ✅ FIX — was 'session_reminder', model enum only has 'session_starting_soon'
  SESSION_REMINDER = 'session_starting_soon',
  // ✅ ADD — startSession() needs this; model already supports it
  SESSION_STARTED = 'session_started',
  // ✅ FIX — was 'session_cancelled', model enum has 'booking_cancelled'
  SESSION_CANCELLED = 'booking_cancelled',
  // ✅ FIX — was 'session_rescheduled', model enum has 'booking_rescheduled'
  SESSION_RESCHEDULED = 'booking_rescheduled',
  WAITLIST_JOINED = 'waitlist_joined',
  // ✅ FIX — was 'waitlist_available', model enum has 'waitlist_spot_available'
  WAITLIST_AVAILABLE = 'waitlist_spot_available',
  PACKAGE_PURCHASED = 'package_purchased',
  // ✅ FIX — was 'package_expiring', model enum has 'package_expiring_soon'
  PACKAGE_EXPIRING = 'package_expiring_soon',
  CREDIT_LOW = 'credit_low',
  // ✅ FIX — was 'payment_success', model enum has 'payment_received'
  PAYMENT_SUCCESS = 'payment_received',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_PROCESSED = 'refund_processed',
  REVIEW_RECEIVED = 'review_received',
  REVIEW_REPLIED = 'review_replied',
  SESSION_COMPLETED = 'session_completed',
  // ✅ NEW: mentor ne session start nahi kiya / request par respond nahi kiya
  SESSION_MISSED = 'session_missed',
  SESSION_NO_SHOW = 'session_no_show',
  // ✅ NEW — query flow had no notification at all before this
  QUERY_RECEIVED = 'query_received',
  QUERY_ANSWERED = 'query_answered',
  PROFILE_VIEWED = 'profile_viewed',
  FORUM_REPLY = 'forum_reply',
  FORUM_MENTION = 'forum_mention',
}

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PUSH = 'push',
  IN_APP = 'in_app',
}

interface NotificationInput {
  userId: string;
  type: NotificationType;
  channels?: NotificationChannel[];
  module?: 'senior-mentor' | 'industry-mentor';
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduledAt?: Date;
  authToken?: string;
}

interface NotificationResult {
  sent: boolean;
  channels: {
    email?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
    push?: boolean;
    inApp?: boolean;
  };
  error?: string;
}

class NotificationService {
  /**
   * Send notification via multiple channels
   *
   * ✅ FIX: IN_APP notifications no longer depend on a successful User lookup.
   * Previously, `User.findByUserId(input.userId)` was called FIRST and the
   * whole method threw ('User not found') if it failed/returned null —
   * silently killing in-app notifications (e.g. booking requests) even
   * though `Notification.create()` only needs `userId`, not the full user
   * record. Now IN_APP is attempted independently; the user record is only
   * fetched when a channel that actually needs it (email/sms/whatsapp/push)
   * is requested.
   */
  async sendNotification(input: NotificationInput): Promise<NotificationResult> {
    try {
      logger.info(`📬 Sending ${input.type} notification to user: ${input.userId}`);

      const channels = input.channels || this.getDefaultChannels(input.type, input.priority);

      const result: NotificationResult = {
        sent: false,
        channels: {},
      };

      // ✅ send IN_APP first, independent of user lookup.
      // Notification.create() only needs userId/type/data — no dependency
      // on the User collection at all.
      if (channels.includes(NotificationChannel.IN_APP)) {
        try {
          result.channels.inApp = await this.sendInAppNotification(null, input);
        } catch (error: any) {
          logger.error(`Failed to send via ${NotificationChannel.IN_APP}:`, error);
        }
      }

      // Other channels (email/sms/whatsapp/push) genuinely need the user
      // record (email address, phone number) — only fetch user if needed.
      const remainingChannels = channels.filter((c) => c !== NotificationChannel.IN_APP);

      if (remainingChannels.length > 0) {
        const user = await User.findByUserId(input.userId);

        if (!user) {
          logger.warn(
            `User not found for userId: ${input.userId} — skipping email/sms/push channels (in-app already handled above)`
          );
        } else {
          for (const channel of remainingChannels) {
            try {
              switch (channel) {
                case NotificationChannel.EMAIL:
                  result.channels.email = await this.sendEmailNotification(user, input);
                  break;

                case NotificationChannel.SMS:
                  if (user.phoneNumber) {
                    result.channels.sms = await this.sendSMSNotification(user, input);
                  }
                  break;

                case NotificationChannel.WHATSAPP:
                  if (user.phoneNumber) {
                    result.channels.whatsapp = await this.sendWhatsAppNotification(user, input);
                  }
                  break;

                case NotificationChannel.PUSH:
                  result.channels.push = await this.sendPushNotification(user, input);
                  break;

                default:
                  logger.warn(`Unknown notification channel: ${channel}`);
              }
            } catch (error: any) {
              logger.error(`Failed to send via ${channel}:`, error);
            }
          }
        }
      }

      // Check if at least one channel succeeded
      result.sent = Object.values(result.channels).some((sent) => sent === true);

      logger.info(`✅ Notification sent: ${result.sent}`);
      return result;
    } catch (error: any) {
      logger.error('Failed to send notification:', error);
      return {
        sent: false,
        channels: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(user: any, input: NotificationInput): Promise<boolean> {
    try {
      const { subject, html } = this.buildEmailContent(input.type, input.data, user);

      return await emailService.sendEmail({
        to: user.email,
        subject,
        html,
      });
    } catch (error: any) {
      logger.error('Email notification failed:', error);
      return false;
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(user: any, input: NotificationInput): Promise<boolean> {
    try {
      const message = this.buildSMSContent(input.type, input.data);

      return await smsService.sendSMS({
        to: user.phoneNumber,
        message,
        priority: input.priority === 'urgent' ? 'high' : 'normal',
      });
    } catch (error: any) {
      logger.error('SMS notification failed:', error);
      return false;
    }
  }

  /**
   * Send WhatsApp notification (placeholder)
   */
  private async sendWhatsAppNotification(_user: any, _input: NotificationInput): Promise<boolean> {
    try {
      // TODO: Implement WhatsApp Business API
      logger.info('📱 WhatsApp notification (not implemented yet)');
      return false;
    } catch (error: any) {
      logger.error('WhatsApp notification failed:', error);
      return false;
    }
  }

  /**
   * Send push notification (placeholder)
   */
  private async sendPushNotification(_user: any, _input: NotificationInput): Promise<boolean> {
    try {
      // TODO: Implement FCM/APNS push notifications
      logger.info('🔔 Push notification (not implemented yet)');
      return false;
    } catch (error: any) {
      logger.error('Push notification failed:', error);
      return false;
    }
  }

  /**
   * Helper to resolve actor's name and photo URL safely across User, ProfilePhoto, and UserProfile.
   */
  public async resolveActorDisplay(userId: string): Promise<{ name: string; photoUrl: string | null }> {
    try {
      if (!userId) return { name: 'User', photoUrl: null };
      const detailsMap = await resolveUserDetails([userId]);
      const resolved = detailsMap.get(String(userId));
      if (resolved) {
        return { name: resolved.name, photoUrl: resolved.photoUrl };
      }
      return { name: 'User', photoUrl: null };
    } catch (err: any) {
      logger.warn(`resolveActorDisplay failed for ${userId}: ${err?.message}`);
      return { name: 'User', photoUrl: null };
    }
  }

  /**
   * Create in-app (DB) notification.
   */
  private async sendInAppNotification(_user: any, input: NotificationInput): Promise<boolean> {
    try {
      const notificationId = generateSecureId();

      // ✅ Auto-enrich actor/mentee details if menteeId, viewerId, replierId or actorId is provided in data
      const actorUserId = input.data?.menteeId || input.data?.viewerId || input.data?.replierId || input.data?.actorId;
      if (input.data && actorUserId) {
        try {
          if (!input.data.menteeId) input.data.menteeId = actorUserId;
          const { name, photoUrl } = await this.resolveActorDisplay(actorUserId);

          const currentName = input.data.menteeName || input.data.actorName || input.data.viewerName || input.data.replierName;
          const currentPhoto = input.data.menteePhoto || input.data.actorPhoto || input.data.viewerPhoto || input.data.replierPhoto;

          if (!currentName) {
            input.data.menteeName = name;
            input.data.actorName = name;
          } else if (!input.data.menteeName) {
            input.data.menteeName = currentName;
          }

          if (!currentPhoto) {
            input.data.menteePhoto = photoUrl;
            input.data.actorPhoto = photoUrl;
          } else if (!input.data.menteePhoto) {
            input.data.menteePhoto = currentPhoto;
          }
        } catch (enrichErr: any) {
          logger.warn(`Actor enrichment skipped silently: ${enrichErr.message}`);
        }
      }

      const notifModule = input.module || 'industry-mentor';
      const title = input.data.title || input.type;
      const message = input.data.message || '';

           // ✅ FIX: model's Notification schema only allows
      // 'low' | 'medium' | 'high' | 'urgent' — 'normal' was never valid,
      // so Notification.create() was silently failing schema validation
      // for every call that didn't explicitly pass a matching priority.
      const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
        low: 'low',
        normal: 'medium',
        medium: 'medium',
        high: 'high',
        urgent: 'urgent',
      };

      let dbSaved = false;
      try {
        await Notification.create({
          notificationId,
          userId: input.userId,
          module: notifModule,
          type: input.type,
          category: 'system',
          title,
          message,
          data: input.data,
          priority: priorityMap[input.priority || 'normal'] || 'medium',
          channels: { inApp: true, email: false, sms: false, push: false },
          status: { sent: true, read: false, clicked: false, sentAt: new Date() },
        });
        dbSaved = true;
      } catch (dbErr: any) {
        logger.error('Notification DB save failed (will still attempt realtime push):', dbErr.message);
      }

      // ✅ Realtime push now runs INDEPENDENTLY of the DB save above —
      // mentee still gets the live socket event even if the DB write fails,
      // instead of both being silently blocked by one shared try/catch.
            try {
        const payload = {
          notificationId,
          type: input.type,
          module: notifModule,
          title,
          message,
          data: input.data,
          isRead: false,
          createdAt: new Date().toISOString(),
        };

        try {
          getIO().to(`user:${input.userId}:${notifModule}`).emit('notification:new', payload);
        } catch (_) {
          emitToUser(input.userId, 'notification:new', payload);
        }

        try {
          const unreadCount = await Notification.countDocuments({
            userId: input.userId,
            module: notifModule,
            'status.read': false,
          });
          emitNotificationCount(getIO(), input.userId, unreadCount, notifModule);
        } catch (_) {}
      } catch (socketErr: any) {
        logger.warn('Socket emit failed for mentorship notification:', socketErr.message);
      }

      return dbSaved;
    } catch (error: any) {
      logger.error('In-app notification failed:', error);
      return false;
    }
  }




  /**
   * Build email content based on notification type
   */
  private buildEmailContent(
    type: NotificationType,
    data: Record<string, any>,
    user: any
  ): { subject: string; html: string } {
    const userName = user.name || user.email;

    switch (type) {
      case NotificationType.PACKAGE_PURCHASED:
        return {
          subject: '🎉 Package Purchased Successfully',
          html: `
            <h2>Package Purchase Confirmed!</h2>
            <p>Hi ${userName},</p>
            <p>Your <strong>${data.packageName}</strong> has been purchased successfully!</p>
            <p><strong>Details:</strong></p>
            <ul>
              <li>Sessions: ${data.totalSessions}</li>
              <li>Amount Paid: ₹${data.totalPrice}</li>
              <li>Valid Until: ${data.expiresAt}</li>
            </ul>
            <p>You can start booking sessions now!</p>
          `,
        };

      case NotificationType.PACKAGE_EXPIRING:
        return {
          subject: '⚠️ Package Expiring Soon',
          html: `
            <h2>Your Package is Expiring Soon</h2>
            <p>Hi ${userName},</p>
            <p>Your <strong>${data.packageName}</strong> will expire in ${data.daysRemaining} days.</p>
            <p>You still have <strong>${data.remainingSessions}</strong> sessions left.</p>
            <p>Book them before they expire!</p>
          `,
        };

      case NotificationType.CREDIT_LOW:
        return {
          subject: '💳 Package Credits Running Low',
          html: `
            <h2>Credits Running Low</h2>
            <p>Hi ${userName},</p>
            <p>You have only <strong>${data.remainingSessions}</strong> sessions left in your package.</p>
            <p>Consider purchasing a new package to continue your mentorship journey!</p>
          `,
        };

      case NotificationType.WAITLIST_AVAILABLE:
        return {
          subject: '🎉 Slot Available - Book Now!',
          html: `
            <h2>Great News! A Slot is Available</h2>
            <p>Hi ${userName},</p>
            <p>A slot has opened up with <strong>${data.mentorName}</strong>!</p>
            <p>You have 48 hours to book before it's offered to the next person.</p>
            <p><strong>Session Type:</strong> ${data.sessionType}</p>
            <p>Book now!</p>
          `,
        };

      case NotificationType.PAYMENT_SUCCESS:
        return {
          subject: '✅ Payment Successful',
          html: `
            <h2>Payment Confirmed</h2>
            <p>Hi ${userName},</p>
            <p>Your payment of <strong>₹${data.amount}</strong> has been processed successfully.</p>
            <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
          `,
        };

      case NotificationType.REFUND_PROCESSED:
        return {
          subject: '💰 Refund Processed',
          html: `
            <h2>Refund Initiated</h2>
            <p>Hi ${userName},</p>
            <p>A refund of <strong>₹${data.refundAmount}</strong> has been initiated.</p>
            <p>It will be credited to your account within 3-5 business days.</p>
          `,
        };

        case NotificationType.SESSION_MISSED:
          return {
            subject: '⚠️ Your session did not take place',
            html: `
              <h2>Your session was missed</h2>
              <p>Hi ${userName},</p>
              <p>${data.message || 'Your mentor did not start the session.'}</p>
              <p>${
                data.canRefund
                  ? 'You can get a <strong>full refund</strong> or <strong>reschedule</strong> from My Bookings → Missed.'
                  : 'You can <strong>reschedule</strong> from My Bookings → Missed.'
              }</p>
            `,
          };
  
        case NotificationType.QUERY_RECEIVED:
          return {
            subject: '❓ New Query Received',
          html: `
            <h2>You've Received a New Query</h2>
            <p>Hi ${userName},</p>
            <p><strong>${data.menteeName || 'A mentee'}</strong> has asked you a query.</p>
            <p>${data.question ? `<em>"${data.question}"</em>` : ''}</p>
            <p>Log in to your dashboard to respond.</p>
          `,
        };

      case NotificationType.QUERY_ANSWERED:
        return {
          subject: '✅ Your Query Has Been Answered',
          html: `
            <h2>Your Mentor Replied</h2>
            <p>Hi ${userName},</p>
            <p><strong>${data.mentorName || 'Your mentor'}</strong> has answered your query.</p>
            <p>Log in to your dashboard to view the response.</p>
          `,
        };

      case NotificationType.FORUM_REPLY: {
        const isCommentReply = Boolean(data.isReplyToComment || data.isReplyToReply);
        const heading = isCommentReply ? 'New Reply to Your Comment' : 'New Reply on Your Thread';
        const actionText = isCommentReply ? 'replied to your comment in' : 'replied to your thread:';
        return {
          subject: `💬 New Reply on "${data.threadTopic || 'Forum Thread'}"`,
          html: `
            <h2>${heading}</h2>
            <p>Hi ${userName},</p>
            <p><strong>${data.replierName || 'Someone'}</strong> ${actionText} <em>"${data.threadTopic || ''}"</em>.</p>
            <p>Log in to view the reply.</p>
          `,
        };
      }

      case NotificationType.FORUM_MENTION:
        return {
          subject: `💬 You Were Mentioned in "${data.threadTopic || 'Forum Thread'}"`,
          html: `
            <h2>You Were Mentioned in a Forum Reply</h2>
            <p>Hi ${userName},</p>
            <p><strong>${data.replierName || 'Someone'}</strong> mentioned you in a reply to: <em>"${data.threadTopic || ''}"</em>.</p>
            <p>Log in to join the conversation.</p>
          `,
        };

      default:
        return {
          subject: 'Notification from Mentorship Platform',
          html: `<p>Hi ${userName},</p><p>You have a new notification.</p>`,
        };
    }
  }

  /**
   * Build SMS content based on notification type
   */
  private buildSMSContent(type: NotificationType, data: Record<string, any>): string {
    switch (type) {
      case NotificationType.PACKAGE_PURCHASED:
        return `🎉 Package purchased! ${data.totalSessions} sessions. Valid until ${data.expiresAt}. Start booking now!`;

      case NotificationType.PACKAGE_EXPIRING:
        return `⚠️ Your package expires in ${data.daysRemaining} days. ${data.remainingSessions} sessions left. Book now!`;

      case NotificationType.CREDIT_LOW:
        return `💳 Only ${data.remainingSessions} sessions left in your package. Purchase more to continue!`;

      case NotificationType.WAITLIST_AVAILABLE:
        return `🎉 Slot available with ${data.mentorName}! Book within 48h. Don't miss it!`;

      case NotificationType.PAYMENT_SUCCESS:
        return `✅ Payment of ₹${data.amount} successful. Transaction ID: ${data.transactionId}`;

      case NotificationType.REFUND_PROCESSED:
        return `💰 Refund of ₹${data.refundAmount} initiated. Will be credited in 3-5 days.`;

      case NotificationType.QUERY_RECEIVED:
        return `❓ New query from ${data.menteeName || 'a mentee'}. Check your dashboard to respond.`;

      case NotificationType.QUERY_ANSWERED:
        return `✅ ${data.mentorName || 'Your mentor'} answered your query. Check your dashboard.`;

      case NotificationType.FORUM_REPLY: {
        const isCommentReply = Boolean(data.isReplyToComment || data.isReplyToReply);
        const target = isCommentReply ? 'your comment in' : 'your thread';
        return `💬 ${data.replierName || 'Someone'} replied to ${target} "${data.threadTopic || ''}". Check it out!`;
      }

      case NotificationType.FORUM_MENTION:
        return `💬 ${data.replierName || 'Someone'} mentioned you in thread "${data.threadTopic || ''}". Check it out!`;

      default:
        return 'You have a new notification from Mentorship Platform';
    }
  }

  /**
   * Get default notification channels based on type and priority
   */
  private getDefaultChannels(
    type: NotificationType,
    priority: NotificationInput['priority'] = 'normal'
  ): NotificationChannel[] {
    // High priority - send via all channels
    if (priority === 'urgent' || priority === 'high') {
      return [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.SMS];
    }

    // Type-specific defaults
    switch (type) {
      case NotificationType.SESSION_REMINDER:
      case NotificationType.WAITLIST_AVAILABLE:
        return [NotificationChannel.EMAIL, NotificationChannel.SMS];

      case NotificationType.PACKAGE_PURCHASED:
      case NotificationType.PAYMENT_SUCCESS:
      case NotificationType.REFUND_PROCESSED:
        return [NotificationChannel.EMAIL];

      case NotificationType.PACKAGE_EXPIRING:
      case NotificationType.CREDIT_LOW:
        return [NotificationChannel.EMAIL];

      // ✅ NEW — queries default to in-app only (no email/SMS noise for a
      // simple text question). Callers can still pass explicit channels.
      case NotificationType.QUERY_RECEIVED:
      case NotificationType.QUERY_ANSWERED:
      case NotificationType.FORUM_REPLY:
      case NotificationType.FORUM_MENTION:
        return [NotificationChannel.IN_APP];

      default:
        return [NotificationChannel.EMAIL];
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(inputs: NotificationInput[]): Promise<NotificationResult[]> {
    const results = await Promise.allSettled(
      inputs.map((input) => this.sendNotification(input))
    );

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        sent: false,
        channels: {},
        error: result.reason?.message || 'Failed',
      };
    });
  }
}

export default new NotificationService();