// ============================================
// FILE 4: notification.service.ts (NO CHANGES NEEDED)
// ============================================
import { logger } from "@/shared/logger.util";

interface IEventDocument {
  _id: string;
  title: string;
  slug: string;
  company: {
    name: string;
    email: string;
  };
  startDate: Date;
  endDate?: Date;
  eventLink?: string;
  mode: string;
  type?: string;
  location?: {
    venue?: string;
    city?: string;
  };
  registrations?: Array<{
    email?: string;
    phone?: string;
  }>;
}

interface EmailPayload {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

interface SMSPayload {
  phone: string;
  message: string;
}

class NotificationService {
  private emailQueue: EmailPayload[] = [];
  private smsQueue: SMSPayload[] = [];
  private MAX_RETRIES = 3;

  async sendEventCreated(event: IEventDocument): Promise<void> {
    try {
      logger.info('Sending event created notification', { eventId: event._id });

      const payload: EmailPayload = {
        to: event.company.email,
        subject: `New Event Created: ${event.title}`,
        template: 'event-created',
        data: {
          companyName: event.company.name,
          eventTitle: event.title,
          eventDate: event.startDate,
          eventType: event.type,
          eventLink: `${process.env.APP_URL}/events/${event.slug}`,
        },
      };

      await this.sendEmail(payload);
      logger.info('Event created notification sent', { eventId: event._id });
    } catch (error: any) {
      logger.error('Error sending event created notification', { eventId: event._id, error });
    }
  }

  async sendRegistrationConfirmation(event: IEventDocument, email: string): Promise<void> {
    try {
      logger.info('Sending registration confirmation', { eventId: event._id, email });

      const payload: EmailPayload = {
        to: email,
        subject: `Confirmed: You're Registered for ${event.title}`,
        template: 'registration-confirmed',
        data: {
          eventTitle: event.title,
          eventDate: event.startDate,
          eventTime: event.startDate.toLocaleTimeString(),
          eventLocation: event.location?.venue || event.mode,
          eventLink: `${process.env.APP_URL}/events/${event.slug}`,
          eventMode: event.mode,
          confirmationId: `EVT-${event._id}`,
        },
      };

      await this.sendEmail(payload);
      logger.info('Registration confirmation sent', { eventId: event._id });
    } catch (error: any) {
      logger.error('Error sending registration confirmation', {
        eventId: event._id, error
      }
      );
    }
  }

  async sendEventReminder1Day(event: IEventDocument): Promise<void> {
    try {
      logger.info('Sending 1-day reminder', { eventId: event._id });

      const registrations = event.registrations || [];

      for (const registration of registrations) {
        if (!registration.email) continue;

        const payload: EmailPayload = {
          to: registration.email,
          subject: `Reminder: ${event.title} is tomorrow!`,
          template: 'event-reminder-1day',
          data: {
            eventTitle: event.title,
            eventDate: event.startDate,
            eventTime: event.startDate.toLocaleTimeString(),
            eventLocation: event.location?.venue || 'Online',
            eventLink: `${process.env.APP_URL}/events/${event.slug}`,
            daysUntil: 1,
          },
        };

        await this.sendEmail(payload);
      }

      logger.info('1-day reminders sent', { eventId: event._id, count: registrations.length });
    } catch (error: any) {
      logger.error('Error sending 1-day reminders', { eventId: event._id, error });
    }
  }

  async sendEventReminder1Hour(event: IEventDocument): Promise<void> {
    try {
      logger.info('Sending 1-hour reminder', { eventId: event._id });

      const registrations = event.registrations || [];

      for (const registration of registrations) {
        if (!registration.email) continue;

        const smsPayload: SMSPayload | null = registration.phone
          ? {
            phone: registration.phone,
            message: `📢 ${event.title} starts in 1 hour! Join us: ${process.env.APP_URL}/events/${event.slug}`,
          }
          : null;

        const emailPayload: EmailPayload = {
          to: registration.email,
          subject: `⏰ Last Minute Reminder: ${event.title} in 1 hour!`,
          template: 'event-reminder-1hour',
          data: {
            eventTitle: event.title,
            eventTime: event.startDate.toLocaleTimeString(),
            eventLink: `${process.env.APP_URL}/events/${event.slug}`,
            eventMode: event.mode,
          },
        };

        const promises = [this.sendEmail(emailPayload)];
        if (smsPayload) {
          promises.push(this.sendSMS(smsPayload));
        }

        await Promise.all(promises);
      }

      logger.info('1-hour reminders sent', { eventId: event._id, count: registrations.length });
    } catch (error: any) {
      logger.error('Error sending 1-hour reminders', { eventId: event._id, error });
    }
  }

  async sendEventCancellation(event: IEventDocument): Promise<void> {
    try {
      logger.info('Sending event cancellation notification', { eventId: event._id });

      const registrations = event.registrations || [];

      for (const registration of registrations) {
        if (!registration.email) continue;

        const payload: EmailPayload = {
          to: registration.email,
          subject: `Cancelled: ${event.title} has been cancelled`,
          template: 'event-cancelled',
          data: {
            eventTitle: event.title,
            eventDate: event.startDate,
            reason: 'Event has been cancelled',
            refundInfo: 'Full refund will be processed within 3-5 business days',
            supportLink: `${process.env.APP_URL}/support`,
          },
        };

        await this.sendEmail(payload);
      }

      logger.info('Cancellation notifications sent', { eventId: event._id, count: registrations.length });
    } catch (error: any) {
      logger.error('Error sending cancellation notifications', { eventId: event._id, error });
    }
  }

  async sendEventFeedback(event: IEventDocument): Promise<void> {
    try {
      logger.info('Sending event feedback email', { eventId: event._id });

      const registrations = event.registrations || [];

      for (const registration of registrations) {
        if (!registration.email) continue;

        const payload: EmailPayload = {
          to: registration.email,
          subject: `We'd love your feedback on ${event.title}`,
          template: 'event-feedback',
          data: {
            eventTitle: event.title,
            feedbackLink: `${process.env.APP_URL}/events/${event.slug}/feedback`,
            companyName: event.company.name,
          },
        };

        await this.sendEmail(payload);
      }

      logger.info('Feedback emails sent', { eventId: event._id, count: registrations.length });
    } catch (error: any) {
      logger.error('Error sending feedback emails', { eventId: event._id, error });
    }
  }

  private async sendEmail(payload: EmailPayload, attempt = 1): Promise<void> {
    try {
      this.emailQueue.push(payload);

      if (this.emailQueue.length >= 100) {
        await this.processEmailQueue();
      }

      logger.debug('Email queued', { to: payload.to, template: payload.template });
    } catch (error: any) {
      if (attempt < this.MAX_RETRIES) {
        logger.warn('Retrying email send', { attempt, maxRetries: this.MAX_RETRIES });
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        return this.sendEmail(payload, attempt + 1);
      }

      logger.error('Failed to send email after retries', { to: payload.to, error });
    }
  }

  private async sendSMS(payload: SMSPayload): Promise<void> {
    try {
      this.smsQueue.push(payload);

      if (this.smsQueue.length >= 50) {
        await this.processSMSQueue();
      }

      logger.debug('SMS queued', { phone: payload.phone });
    } catch (error: any) {
      logger.error('Error queueing SMS', error);
    }
  }

  private async processEmailQueue(): Promise<void> {
    if (this.emailQueue.length === 0) return;

    const queue = [...this.emailQueue];
    this.emailQueue = [];

    try {
      logger.info('Processing email queue', { count: queue.length });

      for (const email of queue) {
        logger.info('Email would be sent', {
          to: email.to,
          subject: email.subject,
          template: email.template,
        });
      }

      logger.info('Email queue processed', { count: queue.length });
    } catch (error: any) {
      logger.error('Error processing email queue', { count: queue.length, error });
      this.emailQueue = [...queue, ...this.emailQueue];
    }
  }

  private async processSMSQueue(): Promise<void> {
    if (this.smsQueue.length === 0) return;

    const queue = [...this.smsQueue];
    this.smsQueue = [];

    try {
      logger.info('Processing SMS queue', { count: queue.length });

      for (const sms of queue) {
        logger.info('SMS would be sent', { phone: sms.phone });
      }

      logger.info('SMS queue processed', { count: queue.length });
    } catch (error: any) {
      logger.error('Error processing SMS queue', { count: queue.length, error });
      this.smsQueue = [...queue, ...this.smsQueue];
    }
  }

  async flushQueues(): Promise<void> {
    logger.info('Flushing notification queues');
    await Promise.all([this.processEmailQueue(), this.processSMSQueue()]);
    logger.info('Notification queues flushed');
  }

  getQueueStats(): Record<string, number> {
    return {
      emailQueue: this.emailQueue.length,
      smsQueue: this.smsQueue.length,
    };
  }
}

export default new NotificationService();
