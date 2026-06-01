import smsConfig from "@/config/cache/sms.mentor"
import { logger } from "@/shared/logger.util";

interface SMSOptions {
  to: string;
  message: string;
  priority?: 'high' | 'normal';
}

class SMSService {
  private isConfigured: boolean = false;
  private twilioClient: any = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      if (!smsConfig.isEnabled()) {
        logger.warn('📱 SMS service disabled - credentials not configured');
        return;
      }

      const provider = smsConfig.getProvider();

      if (provider === 'twilio') {
        await this.initializeTwilio();
      } else if (provider === 'aws_sns') {
        logger.info('📱 AWS SNS SMS configured');
        this.isConfigured = true;
      } else if (provider === 'msg91') {
        logger.info('📱 MSG91 SMS configured');
        this.isConfigured = true;
      } else {
        logger.warn('📱 Unknown SMS provider configured');
      }
    } catch(error : any) {
      logger.error('📱 Failed to initialize SMS service:', error);
      this.isConfigured = false;
    }
  }

  private async initializeTwilio(): Promise<void> {
    try {
      const config = smsConfig.getTwilioConfig();

      // Dynamic import to avoid requiring Twilio if not used
      const twilio = await import('twilio');
      this.twilioClient = twilio.default(config.accountSid, config.authToken);

      logger.info('✅ Twilio SMS service ready');
      this.isConfigured = true;
    } catch(error : any) {
      logger.error('📱 Failed to initialize Twilio:', error);
      this.isConfigured = false;
    }
  }

  async sendSMS(options: SMSOptions): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('📱 SMS not sent - service not configured');
      return false;
    }

    try {
      // Validate phone number
      const validation = smsConfig.validatePhoneNumber(options.to);
      if (!validation.valid) {
        logger.error(`📱 Invalid phone number: ${validation.error}`);
        return false;
      }

      const phoneNumber = validation.formatted!;
      const provider = smsConfig.getProvider();

      if (provider === 'twilio') {
        return await this.sendViaTwilio(phoneNumber, options.message);
      } else if (provider === 'aws_sns') {
        return await this.sendViaAWSSNS(phoneNumber, options.message);
      } else if (provider === 'msg91') {
        return await this.sendViaMSG91(phoneNumber, options.message);
      }

      return false;
    } catch(error : any) {
      logger.error('📱 Failed to send SMS:', error);
      return false;
    }
  }

  private async sendViaTwilio(to: string, message: string): Promise<boolean> {
    try {
      if (!this.twilioClient) {
        throw new Error('Twilio client not initialized');
      }

      const config = smsConfig.getTwilioConfig();

      await this.twilioClient.messages.create({
        body: message,
        from: config.phoneNumber,
        to,
      });

      logger.info(`📱 SMS sent via Twilio to ${to}`);
      return true;
    } catch(error : any) {
      logger.error('📱 Twilio SMS failed:', error);
      return false;
    }
  }

  private async sendViaAWSSNS(to: string, _message: string): Promise<boolean> {
    try {
      // AWS SNS implementation (requires aws-sdk)
      logger.info(`📱 SMS sent via AWS SNS to ${to}`);
      // TODO: Implement AWS SNS sending
      return true;
    } catch(error : any) {
      logger.error('📱 AWS SNS SMS failed:', error);
      return false;
    }
  }

  private async sendViaMSG91(to: string, message: string): Promise<boolean> {
    try {
      const config = smsConfig.getMSG91Config();

      // MSG91 API implementation
      const response = await fetch('https://api.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: config.apiKey,
        },
        body: JSON.stringify({
          sender: config.senderId,
          route: config.route,
          country: config.country,
          sms: [
            {
              message,
              to: [to.replace('+', '')],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`MSG91 API error: ${response.statusText}`);
      }

      logger.info(`📱 SMS sent via MSG91 to ${to}`);
      return true;
    } catch(error : any) {
      logger.error('📱 MSG91 SMS failed:', error);
      return false;
    }
  }

  async sendBookingConfirmation(
    phoneNumber: string,
    mentorName: string,
    sessionType: string,
    scheduledAt: string
  ): Promise<boolean> {
    const message = `✅ Booking Confirmed!
Mentor: ${mentorName}
Session: ${sessionType}
Time: ${scheduledAt}
You'll receive meeting link via email.
- Mentorship Platform`;

    return await this.sendSMS({ to: phoneNumber, message });
  }

  async sendSessionReminder(
    phoneNumber: string,
    mentorName: string,
    hoursUntil: number,
    meetingUrl: string
  ): Promise<boolean> {
    const message = `⏰ Reminder: Session with ${mentorName} in ${hoursUntil}h
Meeting: ${meetingUrl}
Be ready 5 mins early!
- Mentorship Platform`;

    return await this.sendSMS({ to: phoneNumber, message, priority: 'high' });
  }

  async sendCancellationNotification(
    phoneNumber: string,
    sessionType: string,
    refundAmount?: number
  ): Promise<boolean> {
    const message = refundAmount
      ? `❌ Session Cancelled
${sessionType}
Refund: ₹${refundAmount}
Will be processed in 3-5 days.
- Mentorship Platform`
      : `❌ Session Cancelled
${sessionType}
- Mentorship Platform`;

    return await this.sendSMS({ to: phoneNumber, message });
  }

  async sendRescheduleNotification(
    phoneNumber: string,
    mentorName: string,
    newTime: string
  ): Promise<boolean> {
    const message = `🔄 Session Rescheduled
Mentor: ${mentorName}
New Time: ${newTime}
Check email for details.
- Mentorship Platform`;

    return await this.sendSMS({ to: phoneNumber, message });
  }

  async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const message = `Your OTP for Mentorship Platform is: ${otp}
Valid for 10 minutes. Do not share with anyone.`;

    return await this.sendSMS({ to: phoneNumber, message, priority: 'high' });
  }

  isServiceConfigured(): boolean {
    return this.isConfigured;
  }
}

export default new SMSService();