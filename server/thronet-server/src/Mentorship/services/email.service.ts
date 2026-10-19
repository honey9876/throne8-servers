// server/thronet-server/src/Mentorship/services/email.service.ts

import axios from 'axios';
import emailConfig from '@/config/cache/email.confg';
import { logger } from '@/shared/logger.util';

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string | Buffer;
  }>;
  replyTo?: string;
}

interface BookingConfirmationData {
  menteeName: string;
  mentorName: string;
  sessionType: string;
  scheduledAt: string;
  duration: number;
  meetingUrl: string;
  timezone: string;
  price: number;
  transactionId?: string;
}

interface ReminderData {
  userName: string;
  mentorName: string;
  sessionType: string;
  scheduledAt: string;
  meetingUrl: string;
  timezone: string;
  hoursUntil: number;
}

interface CancellationData {
  userName: string;
  mentorName: string;
  sessionType: string;
  scheduledAt: string;
  reason?: string;
  refundAmount?: number;
  refundStatus?: string;
}

const toBrevoList = (value: string | string[]) =>
  (Array.isArray(value) ? value : [value]).map((email) => ({ email }));

class EmailService {
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const cfg = emailConfig.getConfig();

      if (cfg.service !== 'brevo-api') {
        logger.warn(
          `📧 Email service disabled - EMAIL_SERVICE must be "brevo-api" (current: ${cfg.service})`
        );
        this.isConfigured = false;
        return;
      }

      if (!emailConfig.isEnabled()) {
        logger.warn(
          '📧 Email service disabled - BREVO_API_KEY missing or is an SMTP key (xsmtpsib-). Use the REST API key (xkeysib-...)'
        );
        this.isConfigured = false;
        return;
      }

      if (!emailConfig.getFromAddress().address) {
        logger.warn('📧 Email service disabled - SMTP_FROM_ADDRESS not configured');
        this.isConfigured = false;
        return;
      }

      logger.info('✅ Email service ready (Brevo REST API)');
      this.isConfigured = true;
    } catch (error: any) {
      logger.error(`📧 Failed to initialize email service: ${error?.message || error}`);
      this.isConfigured = false;
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('📧 Email not sent - service not configured');
      return false;
    }

    try {
      const fromAddress = emailConfig.getFromAddress();
      const currentConfig = emailConfig.getConfig();
      const apiKey = currentConfig.apiKey || process.env.BREVO_API_KEY;

      const brevoPayload: Record<string, any> = {
        sender: { name: fromAddress.name, email: fromAddress.address },
        to: toBrevoList(options.to),
        subject: options.subject,
        htmlContent: options.html || options.text || '',
      };

      if (options.text) {
        brevoPayload.textContent = options.text;
      }
      if (options.cc) {
        brevoPayload.cc = toBrevoList(options.cc);
      }
      if (options.bcc) {
        brevoPayload.bcc = toBrevoList(options.bcc);
      }
      if (options.replyTo) {
        brevoPayload.replyTo = { email: options.replyTo };
      }

      // Attachments: Brevo expects base64 `content` or a public `url`
      if (options.attachments && options.attachments.length > 0) {
        const attachment = options.attachments
          .map((a) => {
            if (a.content !== undefined) {
              const buf = Buffer.isBuffer(a.content)
                ? a.content
                : Buffer.from(a.content, 'utf-8');
              return { name: a.filename, content: buf.toString('base64') };
            }
            if (a.path && /^https?:\/\//i.test(a.path)) {
              return { name: a.filename, url: a.path };
            }
            logger.warn(`📧 Attachment skipped (unsupported source): ${a.filename}`);
            return null;
          })
          .filter(Boolean);

        if (attachment.length > 0) {
          brevoPayload.attachment = attachment;
        }
      }

      const res = await axios.post('https://api.brevo.com/v3/smtp/email', brevoPayload, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      logger.info(`📧 Email sent successfully via Brevo to ${options.to}`);
      logger.debug(`Message ID: ${res.data?.messageId}`);
      return true;
    } catch (error: any) {
      const detail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || String(error);
      logger.error(`📧 Failed to send email: ${detail}`);
      return false;
    }
  }

  async sendBookingConfirmation(email: string, data: BookingConfirmationData): Promise<boolean> {
    const subject = `✅ Booking Confirmed - ${data.sessionType} with ${data.mentorName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Booking Confirmed!</h1>
          </div>
          <div class="content">
            <p>Hi ${data.menteeName},</p>
            <p>Great news! Your mentorship session has been confirmed.</p>
            
            <div class="details">
              <h3>Session Details</h3>
              <p><strong>Mentor:</strong> ${data.mentorName}</p>
              <p><strong>Session Type:</strong> ${data.sessionType}</p>
              <p><strong>Date & Time:</strong> ${data.scheduledAt} (${data.timezone})</p>
              <p><strong>Duration:</strong> ${data.duration} minutes</p>
              <p><strong>Amount Paid:</strong> ₹${data.price}</p>
              ${data.transactionId ? `<p><strong>Transaction ID:</strong> ${data.transactionId}</p>` : ''}
            </div>

            <p><strong>Meeting Link:</strong></p>
            <a href="${data.meetingUrl}" class="button">Join Session</a>

            <p>You will receive reminders 24 hours and 1 hour before the session.</p>
            
            <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
          </div>
          <div class="footer">
            <p>Mentorship Platform | Your success is our mission</p>
            <p>Need help? Contact support@mentorship.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  async sendSessionReminder(email: string, data: ReminderData): Promise<boolean> {
    const subject = `⏰ Reminder: Session with ${data.mentorName} in ${data.hoursUntil} hour(s)`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FF9800; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #FF9800; }
          .button { display: inline-block; padding: 12px 30px; background: #FF9800; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Session Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${data.userName},</p>
            <p>Your session with ${data.mentorName} is starting in ${data.hoursUntil} hour(s)!</p>
            
            <div class="details">
              <h3>Session Details</h3>
              <p><strong>Mentor:</strong> ${data.mentorName}</p>
              <p><strong>Type:</strong> ${data.sessionType}</p>
              <p><strong>Time:</strong> ${data.scheduledAt} (${data.timezone})</p>
            </div>

            <a href="${data.meetingUrl}" class="button">Join Session Now</a>

            <p><strong>Tips for a great session:</strong></p>
            <ul>
              <li>Test your audio and video before joining</li>
              <li>Have your questions ready</li>
              <li>Find a quiet place</li>
              <li>Be on time</li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  async sendCancellationConfirmation(email: string, data: CancellationData): Promise<boolean> {
    const subject = `❌ Session Cancelled - ${data.sessionType} with ${data.mentorName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #f44336; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Session Cancelled</h1>
          </div>
          <div class="content">
            <p>Hi ${data.userName},</p>
            <p>Your session has been cancelled as requested.</p>
            
            <div class="details">
              <h3>Cancelled Session</h3>
              <p><strong>Mentor:</strong> ${data.mentorName}</p>
              <p><strong>Type:</strong> ${data.sessionType}</p>
              <p><strong>Scheduled Time:</strong> ${data.scheduledAt}</p>
              ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
            </div>

            ${data.refundAmount ? `
              <div class="details">
                <h3>Refund Information</h3>
                <p><strong>Refund Amount:</strong> ₹${data.refundAmount}</p>
                <p><strong>Status:</strong> ${data.refundStatus || 'Processing'}</p>
                <p>Refund will be credited to your original payment method within 3-5 business days.</p>
              </div>
            ` : ''}

            <p>We hope to see you book another session soon!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  async sendRescheduleConfirmation(
    email: string,
    userName: string,
    mentorName: string,
    sessionType: string,
    oldTime: string,
    newTime: string,
    timezone: string,
    meetingUrl: string
  ): Promise<boolean> {
    const subject = `🔄 Session Rescheduled - ${sessionType} with ${mentorName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #2196F3; color: white; padding: 20px; text-align: center;">
            <h1>🔄 Session Rescheduled</h1>
          </div>
          <div style="background: #f9f9f9; padding: 20px;">
            <p>Hi ${userName},</p>
            <p>Your session has been successfully rescheduled.</p>
            
            <div style="background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #2196F3;">
              <p><strong>Previous Time:</strong> ${oldTime} (${timezone})</p>
              <p><strong>New Time:</strong> ${newTime} (${timezone})</p>
              <p><strong>Mentor:</strong> ${mentorName}</p>
            </div>

            <a href="${meetingUrl}" style="display: inline-block; padding: 12px 30px; background: #2196F3; color: white; text-decoration: none; border-radius: 5px;">
              View Details
            </a>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    return await this.sendEmail({
      to: email,
      subject: 'Welcome to Mentorship Platform! 🎉',
      html: `<h1>Welcome ${name}!</h1><p>We're excited to have you on board.</p>`,
    });
  }

  isServiceConfigured(): boolean {
    return this.isConfigured;
  }
}

export default new EmailService();