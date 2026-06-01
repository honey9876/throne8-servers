// src/services/notification.service.ts
import { User } from '@/auth/models';
import emailService from './email.service';
import smsService from './sms.service';
import logger from '@/config/logging/logger.config';
import { Notification } from '../models';
import { generateSecureId } from '@/shared/security';

export enum NotificationType {
  BOOKING_CONFIRMED = 'booking_confirmed',
  SESSION_REMINDER = 'session_reminder',
  SESSION_CANCELLED = 'session_cancelled',
  SESSION_RESCHEDULED = 'session_rescheduled',
  WAITLIST_JOINED = 'waitlist_joined',
  WAITLIST_AVAILABLE = 'waitlist_available',
  PACKAGE_PURCHASED = 'package_purchased',
  PACKAGE_EXPIRING = 'package_expiring',
  CREDIT_LOW = 'credit_low',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  REFUND_PROCESSED = 'refund_processed',
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
   */
  async sendNotification(input: NotificationInput): Promise<NotificationResult> {
    try {
      logger.info(`📬 Sending ${input.type} notification to user: ${input.userId}`);

      // Get user details
      const user = await User.findByUserId(input.userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Determine channels if not specified
      const channels = input.channels || this.getDefaultChannels(input.type, input.priority);

      const result: NotificationResult = {
        sent: false,
        channels: {},
      };

      // Send via each channel
      for (const channel of channels) {
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

            // ADD — IN_APP channel case mein
            case NotificationChannel.IN_APP:
              result.channels.inApp = await this.sendInAppNotification(user, input);
              break;

            default:
              logger.warn(`Unknown notification channel: ${channel}`);
          }
        } catch (error: any) {
          logger.error(`Failed to send via ${channel}:`, error);
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

  private async sendInAppNotification(user: any, input: NotificationInput): Promise<boolean> {
    try {
      // In-app notification is created in the database, so we consider it sent if creation succeeded
      await Notification.create({
        notificationId: generateSecureId(), // Generate unique ID for notification
        userId: input.userId,
        type: input.type,
        category: 'system',
        title: input.data.title || input.type,
        message: input.data.message || '',
        data: input.data,
        priority: input.priority || 'normal',
        channels: { inApp: true, email: false, sms: false, push: false },
        status: { sent: true, read: false, clicked: false, sentAt: new Date() },
      });
      return true;
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
      return [NotificationChannel.EMAIL, NotificationChannel.SMS];
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

      default:
        return [NotificationChannel.EMAIL];
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(inputs: NotificationInput[]): Promise<NotificationResult[]> {
    // const results: NotificationResult[] = [];

    // ✅ Replace with
    const results = await Promise.allSettled(
      inputs.map(input => this.sendNotification(input))
    );

    // Results map karo
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        sent: false,
        channels: {},
        error: result.reason?.message || 'Failed',
      };
    });

    // for (const input of inputs) {
    //   try {
    //     const result = await this.sendNotification(input);
    //     results.push(result);
    //   } catch (error: any) {
    //     logger.error(`Failed to send bulk notification:`, error);
    //     results.push({
    //       sent: false,
    //       channels: {},
    //       error: error instanceof Error ? error.message : 'Unknown error',
    //     });
    //   }
    // }

    // return results;
  }
}

export default new NotificationService();