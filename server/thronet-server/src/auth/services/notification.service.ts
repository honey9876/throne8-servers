/**
 * notification.service.ts
 * Production-Level Notification Service for 1M+ Users
 * Supports Email (SMTP), Gmail/SendGrid), SMS (Twilio), and Push Notifications
 * 
 * Features:
 * - Email via Nodemailer (SMTP/Gmail) or SendGrid HTTP API
 * - SMS via Twilio
 * - Email templates with Handlebars
 * - Rate limiting per user
 * - Retry mechanism with exponential backoff
 * - Queue-based delivery (optional)
 * - Delivery tracking
 * - Fallback providers
 * - Error handling & logging
 * 
 * @module services/notification.service
 * @version 3.1.0
 */

import nodemailer, { Transporter } from 'nodemailer';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerUtil } from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';

// Get current directory for ES modules

// ==================== CONFIGURATION ====================

interface EmailConfig {
  service: string;
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    address: string;
  };
  maxRetries: number;
  retryDelay: number;
}

const emailConfig: EmailConfig = {
  service: process.env.EMAIL_SERVICE || 'gmail', // 'gmail', 'smtp', 'sendgrid'
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user:
      process.env.EMAIL_SERVICE === 'sendgrid'
        ? 'apikey'
        : process.env.SMTP_USER || process.env.EMAIL_USER || '',
    pass:
      process.env.EMAIL_SERVICE === 'sendgrid'
        ? process.env.SENDGRID_API_KEY || ''
        : process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD || '',
  },
  from: {
    name: process.env.EMAIL_FROM_NAME || 'Auth Service',
    address: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM || process.env.SMTP_USER || '',
  },
  maxRetries: 3,
  retryDelay: 2000, // ms
};

// Initialize SendGrid HTTP API client (bypasses SMTP, which Railway blocks)
if (emailConfig.service === 'sendgrid' && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// ADD THIS DEBUG LOG
console.log('EMAIL CONFIG LOADED:', {
  service: emailConfig.service,
  host: emailConfig.host,
  port: emailConfig.port,
  user: emailConfig.auth.user ? `${emailConfig.auth.user.substring(0, 5)}***` : 'MISSING',
  pass: emailConfig.auth.pass ? `***${emailConfig.auth.pass.slice(-4)}` : 'MISSING',
  hasUser: !!emailConfig.auth.user,
  hasPass: !!emailConfig.auth.pass,
});

interface SMSConfig {
  provider: string;
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  maxRetries: number;
  retryDelay: number;
}

const smsConfig: SMSConfig = {
  provider: process.env.SMS_PROVIDER || 'twilio', // 'twilio', 'aws-sns'
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },
  maxRetries: 3,
  retryDelay: 2000, // ms
};

// ==================== NOTIFICATION SERVICE CLASS ====================

interface EmailOptions {
  to: string;
  subject: string;
  template?: string;
  data?: Record<string, any>;
  html?: string;
  text?: string;
}

interface SMSSOptions {
  to: string;
  message: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  sid?: string;
  status?: string;
  to: string;
  duration: number;
}

interface ServiceStatus {
  initialized: boolean;
  email: {
    available: boolean;
    service: string;
    from: string;
  };
  sms: {
    available: boolean;
    provider: string;
    phoneNumber: string;
  };
  templates: {
    count: number;
    available: string[];
  };
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  email?: boolean;
  sms?: boolean;
  timestamp: string;
  error?: string;
}

class NotificationService {
  static emailTransporter: Transporter | null = null;
  static twilioClient: twilio.Twilio | null = null;
  static initialized: boolean = false;
  static emailTemplates: Map<string, Handlebars.TemplateDelegate> = new Map();

  // ==================== INITIALIZATION ====================

  /**
   * Initialize notification service
   * @returns {Promise<boolean>}
   */
  static async initialize(): Promise<boolean> {
    try {
      LoggerUtil.info('Initializing Notification Service...');

      // Initialize email transporter
      await this.initializeEmailTransporter();

      // Initialize SMS provider
      await this.initializeSMSProvider();

      // Load email templates
      try {
        await this.loadEmailTemplates();
      } catch (e: any) {
        LoggerUtil.warn('Templates failed, loading defaults inline', { error: e.message });
        this.loadDefaultTemplates();
      }

      this.initialized = true;
      LoggerUtil.info('Notification Service initialized successfully');

      return true;
    } catch (error: unknown) {
      LoggerUtil.warn('Notification Service initialization failed (non-critical)', {
        error: (error as Error).message,
      });

      // Don't throw - allow app to continue without notifications
      return false;
    }
  }

  /**
   * Initialize email transporter
   * @private
   */
  private static async initializeEmailTransporter(): Promise<void> {
    try {
      // DETAILED LOGGING
      LoggerUtil.info('Checking email credentials...', {
        SMTP_USER: process.env.SMTP_USER ? 'Set' : 'Missing',
        SMTP_PASSWORD: process.env.SMTP_PASSWORD ? 'Set' : 'Missing',
        EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Missing',
        EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'Set' : 'Missing',
        SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'Set' : 'Missing',
        emailConfig_user: emailConfig.auth.user ? 'Set' : 'Missing',
        emailConfig_pass: emailConfig.auth.pass ? 'Set' : 'Missing',
      });

      if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        LoggerUtil.error('Email credentials not configured', {
          user: emailConfig.auth.user,
          passLength: emailConfig.auth.pass?.length || 0,
        });

        // THROW ERROR instead of silent return
        throw new Error('Email credentials missing - Check SMTP_USER and SMTP_PASSWORD in .env');
      }

      // SendGrid uses the HTTP API (port 443), not SMTP — Railway blocks outbound SMTP ports
      if (emailConfig.service === 'sendgrid') {
        this.emailTransporter = null; // not used for sendgrid, sgMail handles sending
        LoggerUtil.info('SendGrid HTTP API mode enabled — skipping SMTP transporter/verify', {
          hasApiKey: !!process.env.SENDGRID_API_KEY,
          from: emailConfig.from.address,
        });
        return;
      }

      LoggerUtil.info('Email credentials found, creating transporter...');

      // Create transporter based on service
      if (emailConfig.service === 'gmail') {
        this.emailTransporter = nodemailer.createTransport({
          service: 'gmail',
          auth: emailConfig.auth,
        });
      } else {
        // Generic SMTP
        this.emailTransporter = nodemailer.createTransport({
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure,
          auth: emailConfig.auth,
        });
      }

      // Verify connection
      await this.emailTransporter.verify();
      LoggerUtil.info('Email transporter initialized', {
        service: emailConfig.service,
        host: emailConfig.host,
        port: emailConfig.port,
      });
    } catch (error: unknown) {
      LoggerUtil.error('Email transporter initialization failed', {
        error: (error as Error).message,
        service: emailConfig.service,
      });
      if ((error as Error).message.includes('Invalid login') || (error as any).code === 'EAUTH') {
        LoggerUtil.error('GMAIL FIX: 1. App password exact (no spaces). 2. 2FA enabled. 3. Generate new app password. 4. Check account security alerts.');
      } else if ((error as any).code === 'ECONNECTION') {
        LoggerUtil.error('SMTP FIX: HOST=smtp.gmail.com, PORT=587, SECURE=false. Firewall allow outbound 587.');
      }
      this.emailTransporter = null;
    }
  }

  /**
   * Initialize SMS provider
   * @private
   */
  private static async initializeSMSProvider(): Promise<void> {
    try {
      if (smsConfig.provider === 'twilio') {
        if (!smsConfig.twilio.accountSid || !smsConfig.twilio.authToken) {
          LoggerUtil.warn('Twilio credentials not configured - SMS service disabled');
          return;
        }

        this.twilioClient = twilio(
          smsConfig.twilio.accountSid,
          smsConfig.twilio.authToken
        );

        LoggerUtil.info('Twilio SMS client initialized', {
          phoneNumber: smsConfig.twilio.phoneNumber,
        });
      }
    } catch (error: unknown) {
      LoggerUtil.error('SMS provider initialization failed', {
        error: (error as Error).message,
        provider: smsConfig.provider,
      });
      this.twilioClient = null;
    }
  }

  /**
   * Load email templates
   * @private
   */
  private static async loadEmailTemplates(): Promise<void> {
    try {
      const templatesDir = path.resolve(process.cwd(), 'src/auth/templates/email');

      if (!fs.existsSync(templatesDir)) {
        LoggerUtil.warn('Email templates directory not found - using default templates');
        // ADD TRY-CATCH HERE
        try {
          this.loadDefaultTemplates();
        } catch (e: any) {
          LoggerUtil.error('loadDefaultTemplates failed', { error: e.message });
        }
        return;
      }

      // Load all .hbs files
      const files: string[] = fs.readdirSync(templatesDir).filter(f => f.endsWith('.hbs'));

      for (const file of files) {
        const templateName = file.replace('.hbs', '');
        const templatePath = path.join(templatesDir, file);
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        const compiled = Handlebars.compile(templateContent);
        this.emailTemplates.set(templateName, compiled);
      }

      LoggerUtil.info('Email templates loaded', {
        count: this.emailTemplates.size,
        templates: Array.from(this.emailTemplates.keys()),
      });
    } catch (error: unknown) {
      LoggerUtil.warn('Failed to load templates - using defaults', {
        error: (error as Error).message,
      });
      // ADD TRY-CATCH HERE TOO
      try {
        this.loadDefaultTemplates();
      } catch (e: any) {
        LoggerUtil.error('loadDefaultTemplates also failed', { error: e.message });
      }
    }
  }

  /**
   * Load default inline templates
   * @private
   */
  private static loadDefaultTemplates(): void {
    // ==================== EMAIL VERIFICATION TEMPLATES ====================

    // 1️⃣ Email OTP Template (for email verification)
    this.emailTemplates.set('email-otp', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email - OTP Code</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Email Verification</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello {{userName}},</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Thank you for registering! Please use the verification code below to confirm your email address:
        </p>

        <div style="text-align: center; margin: 40px 0;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px 40px; border-radius: 10px; display: inline-block;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">{{otp}}</span>
          </div>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>This code expires in {{expiryMinutes}} minutes</strong>
          </p>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          If you didn't request this verification code, please ignore this email or contact support if you have concerns.
        </p>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            This is an automated message, please do not reply to this email.
          </p>
          <p style="font-size: 12px; color: #999; text-align: center; margin: 10px 0 0 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    // ==================== WELCOME EMAIL TEMPLATE ====================
    this.emailTemplates.set('welcome', Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Throne8!</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: #e94560; margin: 0; font-size: 32px; letter-spacing: 2px;">👑 Throne8</h1>
    <p style="color: #a8b2d8; margin: 10px 0 0 0; font-size: 16px;">throne8.com</p>
  </div>

  <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <h2 style="color: #1a1a2e; font-size: 24px;">Welcome aboard, {{firstName}}! 🎉</h2>

    <p style="font-size: 16px; color: #555; margin-bottom: 25px;">
      We're thrilled to have you join the Throne8 community. Your account has been successfully created.
    </p>

    <div style="background: #f8f9ff; border-left: 4px solid #e94560; padding: 20px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; color: #1a1a2e; font-size: 15px;"><strong>Account Details:</strong></p>
      <p style="margin: 8px 0 0 0; color: #555; font-size: 14px;">
        Email: {{email}}<br>
        Name: {{firstName}} {{lastName}}<br>
        Location: {{location}}<br>
        Profile Type: {{userType}}<br>
        Joined: {{joinedAt}}
      </p>
    </div>

    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%); padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center;">
      <p style="color: #a8b2d8; margin: 0 0 15px 0; font-size: 14px;">Start your journey on Throne8</p>
      <a href="{{platformUrl}}" style="background: #e94560; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
        Visit Throne8 →
      </a>
    </div>

    <p style="font-size: 14px; color: #888; margin-top: 30px;">
      Next step: Please verify your email address to unlock all features.
    </p>

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
      <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
        © 2024 Throne8 | throne8.com | All rights reserved.
      </p>
      <p style="font-size: 12px; color: #999; text-align: center; margin: 5px 0 0 0;">
        If you didn't create this account, please contact support immediately.
      </p>
    </div>
  </div>
</body>
</html>
`));

    // 2️⃣ Email Verified Confirmation Template
    this.emailTemplates.set('email-verified-confirmation', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verified Successfully</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Email Verified!</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello {{userName}},</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Great news! Your email address has been successfully verified.
        </p>

        <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #155724; font-size: 14px;">
            <strong>✓ Verified at:</strong> {{verifiedAt}}
          </p>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          You can now access all features of your account. Thank you for verifying your email!
        </p>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    // ==================== DEVICE VERIFICATION TEMPLATES ====================

    // 3️⃣ Device Verification OTP Template
    this.emailTemplates.set('device-verification', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Device Login - Verification Required</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">New Device Login Detected</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          We detected a login attempt from a new device. To ensure your account security, please verify this device using the code below:
        </p>

        <div style="text-align: center; margin: 40px 0;">
          <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); padding: 20px 40px; border-radius: 10px; display: inline-block;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">{{otp}}</span>
          </div>
        </div>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
          <h3 style="margin-top: 0; color: #495057; font-size: 16px;">Device Information:</h3>
          <table style="width: 100%; font-size: 14px; color: #666;">
            <tr>
              <td style="padding: 8px 0;"><strong>Device Type:</strong></td>
              <td style="padding: 8px 0;">{{deviceInfo.type}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Device Name:</strong></td>
              <td style="padding: 8px 0;">{{deviceInfo.name}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Operating System:</strong></td>
              <td style="padding: 8px 0;">{{deviceInfo.os}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Browser:</strong></td>
              <td style="padding: 8px 0;">{{deviceInfo.browser}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Location:</strong></td>
              <td style="padding: 8px 0;">{{location}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Time:</strong></td>
              <td style="padding: 8px 0;">{{timestamp}}</td>
            </tr>
          </table>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>This code expires in {{expiryMinutes}} minutes</strong>
          </p>
        </div>

        <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #721c24; font-size: 14px;">
            <strong>Didn't try to login?</strong> Please change your password immediately and contact support.
          </p>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            This is an automated security message, please do not reply to this email.
          </p>
          <p style="font-size: 12px; color: #999; text-align: center; margin: 10px 0 0 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    // ==================== STEP-UP AUTHENTICATION TEMPLATES ====================

    // 4️⃣ Step-Up Authentication OTP Template
    this.emailTemplates.set('step-up-otp', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Security Verification Required</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Security Verification</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          For your security, we need to verify your identity before proceeding with this action:
        </p>

        <div style="background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #1565C0; font-size: 15px;">
            <strong>Action Requested:</strong> {{action}}
          </p>
        </div>

        <div style="text-align: center; margin: 40px 0;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 20px 40px; border-radius: 10px; display: inline-block;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">{{otp}}</span>
          </div>
        </div>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
          <h3 style="margin-top: 0; color: #495057; font-size: 16px;">Request Details:</h3>
          <table style="width: 100%; font-size: 14px; color: #666;">
            <tr>
              <td style="padding: 8px 0;"><strong>IP Address:</strong></td>
              <td style="padding: 8px 0;">{{ipAddress}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Time:</strong></td>
              <td style="padding: 8px 0;">{{timestamp}}</td>
            </tr>
          </table>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>This code expires in {{expiryMinutes}} minutes</strong>
          </p>
        </div>

        <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #721c24; font-size: 14px;">
            <strong>Didn't request this?</strong> Please secure your account immediately by changing your password.
          </p>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            This is an automated security message, please do not reply to this email.
          </p>
          <p style="font-size: 12px; color: #999; text-align: center; margin: 10px 0 0 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    // ==================== PASSWORD TEMPLATES ====================

    // 5️⃣ Password Reset Template
    this.emailTemplates.set('password-reset', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Request</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          You requested to reset your password. Use this code to proceed:
        </p>

        <div style="text-align: center; margin: 40px 0;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 20px 40px; border-radius: 10px; display: inline-block;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">{{resetCode}}</span>
          </div>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>This code expires in {{expiryMinutes}} minutes</strong>
          </p>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 30px;">
          If you didn't request this, please ignore this email or contact support if you have concerns.
        </p>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            This is an automated message, please do not reply to this email.
          </p>
          <p style="font-size: 12px; color: #999; text-align: center; margin: 10px 0 0 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    // 6️⃣ Password Changed Confirmation Template
    this.emailTemplates.set('password-changed', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Changed Successfully</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Password Changed</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Your password was successfully changed.
        </p>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
          <table style="width: 100%; font-size: 14px; color: #666;">
            <tr>
              <td style="padding: 8px 0;"><strong>Time:</strong></td>
              <td style="padding: 8px 0;">{{timestamp}}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>IP Address:</strong></td>
              <td style="padding: 8px 0;">{{ipAddress}}</td>
            </tr>
          </table>
        </div>

        <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #721c24; font-size: 14px; font-weight: bold;">
            If you didn't make this change, please contact support immediately!
          </p>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    // ==================== MFA TEMPLATES ====================

    // 7️⃣ MFA Setup Template
    this.emailTemplates.set('mfa-setup', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MFA Setup Verification</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: #333; margin: 0; font-size: 28px;">MFA Setup</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Your Multi-Factor Authentication verification code is:
        </p>

        <div style="text-align: center; margin: 40px 0;">
          <div style="background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); padding: 20px 40px; border-radius: 10px; display: inline-block;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #333; font-family: 'Courier New', monospace;">{{code}}</span>
          </div>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>This code expires in {{expiryMinutes}} minutes</strong>
          </p>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    // 8️⃣ MFA Enabled Confirmation Template
    this.emailTemplates.set('mfa-enabled', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MFA Enabled Successfully</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">MFA Enabled</h1>
      </div>

      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>

        <p style="font-size: 16px; margin-bottom: 30px;">
          Multi-Factor Authentication ({{method}}) has been successfully enabled on your account.
        </p>

        <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0; color: #155724; font-size: 14px;">
            <strong>✓ Enabled at:</strong> {{timestamp}}
          </p>
        </div>

        <p style="font-size: 14px; color: #666;">
          Your account is now more secure with an additional layer of protection!
        </p>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
            © 2024 Auth Service. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `));

    LoggerUtil.info('Default email templates loaded', {
      count: this.emailTemplates.size,
      templates: Array.from(this.emailTemplates.keys()),
    });

    // ==================== PASSWORD CHANGE OTP TEMPLATE ====================
    this.emailTemplates.set('password-change-otp', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Change Verification</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Password Change Request</h1>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hello {{userName}},</p>
        <p style="font-size: 16px;">We received a request to change your password. Please use the verification code below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="background: white; padding: 20px; border-radius: 10px; display: inline-block; border: 2px solid #f5576c;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #f5576c;">{{otp}}</span>
          </div>
        </div>
        <p style="font-size: 14px; color: #666;">This code will expire in {{expiryMinutes}} minutes.</p>
        <p style="font-size: 14px; color: #999;"><strong>Request Time:</strong> {{timestamp}}</p>
        <p style="font-size: 14px; color: #999;"><strong>IP Address:</strong> {{ipAddress}}</p>
        <p style="font-size: 14px; color: #ff6b6b; font-weight: bold;">If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">© 2024 Auth Service. All rights reserved.</p>
      </div>
    </body>
    </html>
  `));

    // ==================== PASSWORD CHANGED CONFIRMATION TEMPLATE ====================
    this.emailTemplates.set('password-changed', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Changed Successfully</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Password Changed</h1>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hello {{userName}},</p>
        <p style="font-size: 16px;">Your password was successfully changed.</p>
        <p style="font-size: 14px; color: #666;"><strong>Changed At:</strong> {{timestamp}}</p>
        <p style="font-size: 14px; color: #666;"><strong>IP Address:</strong> {{ipAddress}}</p>
        <p style="font-size: 14px; color: #666;"><strong>Device:</strong> {{userAgent}}</p>
        <p style="font-size: 14px; color: #ff6b6b; font-weight: bold;">If you didn't make this change, please contact support immediately!</p>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">For your security, all active sessions have been logged out. Please login again.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">© 2024 Auth Service. All rights reserved.</p>
      </div>
    </body>
    </html>
  `));

    // ==================== PASSWORD RESET CODE TEMPLATE ====================
    this.emailTemplates.set('password-reset', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Code</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Password Reset</h1>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hello {{userName}},</p>
        <p style="font-size: 16px;">You requested to reset your password. Use this code:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="background: white; padding: 20px; border-radius: 10px; display: inline-block; border: 2px solid #fa709a;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #fa709a;">{{resetCode}}</span>
          </div>
        </div>
        <p style="font-size: 14px; color: #666;">This code will expire in {{expiryMinutes}} minutes.</p>
        <p style="font-size: 14px; color: #999;"><strong>IP Address:</strong> {{ipAddress}}</p>
        <p style="font-size: 14px; color: #666;">If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">© 2024 Auth Service. All rights reserved.</p>
      </div>
    </body>
    </html>
  `));

    // ==================== PASSWORD RESET SUCCESS TEMPLATE ====================
    this.emailTemplates.set('password-reset-success', Handlebars.compile(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Successful</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">Password Reset Successful</h1>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hello {{userName}},</p>
        <p style="font-size: 16px;">Your password has been successfully reset. You can now login with your new password.</p>
        <p style="font-size: 14px; color: #666;"><strong>Reset At:</strong> {{timestamp}}</p>
        <p style="font-size: 14px; color: #666;"><strong>IP Address:</strong> {{ipAddress}}</p>
        <p style="font-size: 14px; color: #666;"><strong>Device:</strong> {{userAgent}}</p>
        <p style="font-size: 14px; color: #ff6b6b; font-weight: bold;">If you didn't reset your password, please contact support immediately!</p>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">For your security, all active sessions have been logged out.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">© 2024 Auth Service. All rights reserved.</p>
      </div>
    </body>
    </html>
  `));

    LoggerUtil.info('Default email templates loaded (including password templates)');

    // ==================== 1. ANNUAL IDENTITY RE-CHECK TEMPLATE ====================
    this.emailTemplates.set('annual-identity-recheck', Handlebars.compile(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Annual Identity Verification Required</title>
  </head>
  <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0;">Annual Identity Verification</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Hello {{userName}},</p>
      <p>For security and compliance, we need you to re-verify your {{verificationType}} annually.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <div style="background: white; padding: 20px; border-radius: 10px; display: inline-block; border: 2px solid #667eea;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #667eea;">{{otp}}</span>
        </div>
      </div>

      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #856404;"><strong>Expires in {{expiryMinutes}} minutes</strong></p>
      </div>

      <p style="color: #666;">This is a routine security check to ensure your account remains secure.</p>
    </div>
  </body>
  </html>
`));

    // ==================== 2. UNUSUAL ACTIVITY ALERT TEMPLATE ====================
    this.emailTemplates.set('unusual-activity-alert', Handlebars.compile(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Unusual Activity Detected</title>
  </head>
  <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0;">Unusual Activity Detected</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Hello {{userName}},</p>
      <p><strong>We detected unusual activity on your account that requires verification.</strong></p>

      <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #721c24;"><strong>Activity Details:</strong></p>
        <p style="margin: 10px 0 0 0; color: #721c24;">
          {{activityDetails.message}}<br>
          <strong>Distance:</strong> {{activityDetails.distance}}<br>
          <strong>Time:</strong> {{activityDetails.timeDiff}}<br>
          <strong>Current Location:</strong> {{activityDetails.currentLocation}}<br>
          <strong>Previous Location:</strong> {{activityDetails.previousLocation}}
        </p>
      </div>

      <p><strong>Was this you?</strong> Please verify with the code below:</p>

      <div style="text-align: center; margin: 30px 0;">
        <div style="background: white; padding: 20px; border-radius: 10px; display: inline-block; border: 2px solid #ff6b6b;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #ff6b6b;">{{otp}}</span>
        </div>
      </div>

      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #856404;"><strong>Expires in {{expiryMinutes}} minutes</strong></p>
      </div>

      <p style="color: #721c24; font-weight: bold;">If this wasn't you, change your password immediately and contact support!</p>

      <p style="color: #666; font-size: 12px;">
        <strong>IP Address:</strong> {{ipAddress}}<br>
        <strong>Time:</strong> {{timestamp}}
      </p>
    </div>
  </body>
  </html>
`));

    // ==================== 3. SUSPICIOUS LOCATION ALERT TEMPLATE ====================
    this.emailTemplates.set('suspicious-location-alert', Handlebars.compile(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title> New Location Login Detected</title>
  </head>
  <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0;"> New Location Login</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Hello {{userName}},</p>
      <p><strong>We detected a login from a new location.</strong></p>

      <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #0c5460;"><strong> Login Location:</strong></p>
        <p style="margin: 10px 0 0 0; color: #0c5460;">
          <strong>Country:</strong> {{locationDetails.country}}<br>
          <strong>City:</strong> {{locationDetails.city}}<br>
          <strong>Region:</strong> {{locationDetails.region}}
        </p>
      </div>

      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #856404;">
          <strong>IP Address:</strong> {{ipAddress}}<br>
          <strong>Time:</strong> {{timestamp}}
        </p>
      </div>

      <p><strong>Was this you?</strong> Click the button below to verify:</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="{{verificationLink}}" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
          ✓ Yes, This Was Me
        </a>
      </div>

      <p style="color: #666; font-size: 14px;">Or copy this link: {{verificationLink}}</p>

      <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #721c24; font-weight: bold;">
          If this wasn't you, change your password immediately and contact support!
        </p>
      </div>
    </div>
  </body>
  </html>
`));

    // ==================== 4. 90-DAY PASSWORD REMINDER TEMPLATE ====================
    this.emailTemplates.set('90day-password-reminder', Handlebars.compile(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Password Re-Verification Required</title>
  </head>
  <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0;">Password Re-Verification</h1>
    </div>
    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Hello {{userName}},</p>
      <p>It's been <strong>{{daysSinceChange}} days</strong> since you last changed your password.</p>

      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #856404;">
          <strong>For security compliance, please re-enter your password during your next login.</strong>
        </p>
      </div>

      <p>This is a routine security measure to ensure your account remains secure.</p>

      <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #155724;">
          <strong>Tip:</strong> Consider changing your password if it's been a while!
        </p>
      </div>

      <p style="color: #666;">Next login, you'll be asked to verify your current password.</p>
    </div>
  </body>
  </html>
`));

    // ==================== LOG AFTER ADDING TEMPLATES ====================
    LoggerUtil.info('Compliance email templates loaded', {
      count: this.emailTemplates.size,
      templates: Array.from(this.emailTemplates.keys()),
    });

    // ==================== AADHAAR VERIFICATION OTP TEMPLATE ====================
    this.emailTemplates.set('aadhaar-verification-otp', Handlebars.compile(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aadhaar Verification OTP</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
    <div style="background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Aadhaar Verification</h1>
    </div>
    <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
      <p style="font-size: 16px; margin-bottom: 10px;">
        Your Aadhaar verification OTP has been generated for Aadhaar ending in
        <strong>****{{aadhaarLast4}}</strong>.
      </p>
      <p style="font-size: 14px; color: #666; margin-bottom: 30px;">
        (Note: In production, this OTP will be sent to your Aadhaar-linked mobile number by UIDAI.)
      </p>
      <div style="text-align: center; margin: 40px 0;">
        <div style="background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%); padding: 20px 40px; border-radius: 10px; display: inline-block;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">{{otp}}</span>
        </div>
      </div>
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          <strong>This code expires in {{expiryMinutes}} minutes</strong>
        </p>
      </div>
      <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #0c5460; font-size: 13px;">
          <strong>Security Note:</strong> Never share this OTP with anyone. Government officials will never ask for your OTP.
        </p>
      </div>
      <p style="font-size: 14px; color: #666; margin-top: 30px;">
        If you did not request Aadhaar verification, please contact support immediately.
      </p>
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
          This is an automated message, please do not reply to this email.
        </p>
        <p style="font-size: 12px; color: #999; text-align: center; margin: 10px 0 0 0;">
          © 2024 Auth Service. All rights reserved.
        </p>
      </div>
    </div>
  </body>
  </html>
`));

    // ==================== COMPANY EMAIL VERIFICATION OTP TEMPLATE ====================
    this.emailTemplates.set('company-email-verification-otp', Handlebars.compile(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Company Email Verification OTP</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
    <div style="background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Professional Email Verification</h1>
      <p style="color: #a0c4d8; margin: 8px 0 0 0; font-size: 14px;">{{domain}}</p>
    </div>
    <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
      <p style="font-size: 16px; margin-bottom: 30px;">
        Please use the code below to verify your professional/company email address:<br/>
        <strong style="color: #2c5364;">{{companyEmail}}</strong>
      </p>
      <div style="text-align: center; margin: 40px 0;">
        <div style="background: linear-gradient(135deg, #0f2027 0%, #2c5364 100%); padding: 20px 40px; border-radius: 10px; display: inline-block;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">{{otp}}</span>
        </div>
      </div>
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          <strong>This code expires in {{expiryMinutes}} minutes</strong>
        </p>
      </div>
      <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #155724; font-size: 13px;">
          <strong>Why verify?</strong> Verifying your company email adds a Professional credential badge to your profile and increases trust with recruiters.
        </p>
      </div>
      <p style="font-size: 14px; color: #666; margin-top: 30px;">
        If you did not request this verification, please ignore this email.
      </p>
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
          This is an automated message, please do not reply to this email.
        </p>
        <p style="font-size: 12px; color: #999; text-align: center; margin: 10px 0 0 0;">
          © 2024 Auth Service. All rights reserved.
        </p>
      </div>
    </div>
  </body>
  </html>
`));
  }

  // ==================== EMAIL METHODS ====================

  /**
   * Send email
   * @param options - Email options
   * @returns {Promise<SendResult>} Send result
   */
  static async sendEmail(options: EmailOptions): Promise<SendResult> {
    const startTime = Date.now();

    try {
      // YE CHECK ADD KARO
      if (!this.initialized) {
        LoggerUtil.warn('NotificationService not initialized, initializing now...');
        await this.initialize();
      }

      // ==================== SENDGRID VIA HTTP API ====================
      // Railway blocks outbound SMTP ports, so SendGrid is sent over HTTPS (443) instead.
      if (emailConfig.service === 'sendgrid') {
        try {
          if (!process.env.SENDGRID_API_KEY) {
            throw new Error('SENDGRID_API_KEY not configured');
          }

          // Check rate limit
          const rateLimitKey = `email_rate:${options.to}`;
          const sent = (await CacheUtil.get(rateLimitKey)) || 0;
          if (sent >= 10) {
            LoggerUtil.warn('Email rate limit exceeded', { to: options.to });
            throw new Error('Email rate limit exceeded');
          }

          let html = options.html;
          if (options.template && this.emailTemplates.has(options.template)) {
            const template = this.emailTemplates.get(options.template);
            if (template) {
              html = template(options.data || {});
            }
          } else if (options.template) {
            LoggerUtil.warn('Template not found, using raw HTML', {
              template: options.template,
            });
          }

          const result = await sgMail.send({
            to: options.to,
            from: { email: emailConfig.from.address, name: emailConfig.from.name },
            subject: options.subject,
            html: html || options.text || '',
            text: options.text,
          });

          await CacheUtil.set(rateLimitKey, (sent as number) + 1, 3600); // 1 hour

          const duration = Date.now() - startTime;
          LoggerUtil.info('Email sent successfully via SendGrid API', {
            to: options.to,
            subject: options.subject,
            template: options.template,
            duration,
          });

          return {
            success: true,
            messageId: (result[0]?.headers?.['x-message-id'] as string) || 'sendgrid-sent',
            to: options.to,
            duration,
          };
        } catch (error: any) {
          const duration = Date.now() - startTime;
          LoggerUtil.error('SendGrid API send failed', {
            error: error.message,
            response: error.response?.body,
            to: options.to,
            subject: options.subject,
            duration,
          });
          throw error;
        }
      }
      // ==================== END SENDGRID BLOCK ====================

      if (!this.emailTransporter) {
        LoggerUtil.warn('Email transporter not available', { to: options.to });
        // Return mock success in development
        if (process.env.NODE_ENV === 'development') {
          return { success: true, messageId: 'mock-dev-id', to: options.to, duration: Date.now() - startTime };
        }
        throw new Error('Email service not configured');
      }

      // Check rate limit
      const rateLimitKey = `email_rate:${options.to}`;
      const sent = (await CacheUtil.get(rateLimitKey)) || 0;

      if (sent >= 10) {
        LoggerUtil.warn('Email rate limit exceeded', { to: options.to });
        throw new Error('Email rate limit exceeded');
      }

      // Prepare email content
      let html = options.html;
      let text = options.text;

      // Use template if specified
      if (options.template && this.emailTemplates.has(options.template)) {
        const template = this.emailTemplates.get(options.template);
        if (template) {
          html = template(options.data || {});
          console.log('Template rendered, html length:', html?.length);
        }
      } else if (options.template) {
        LoggerUtil.warn('Template not found, using raw HTML', {
          template: options.template,
        });
        console.log('Template NOT found:', options.template, 'Available:', Array.from(this.emailTemplates.keys()));
      } else {

      }

      // Send email with retry
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= emailConfig.maxRetries; attempt++) {
        try {
          const result = await this.emailTransporter.sendMail({
            from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
            to: options.to,
            subject: options.subject,
            html,
            text,
          });

          // Increment rate limit counter
          await CacheUtil.set(rateLimitKey, (sent as number) + 1, 3600); // 1 hour

          const duration = Date.now() - startTime;
          LoggerUtil.info('Email sent successfully', {
            to: options.to,
            subject: options.subject,
            template: options.template,
            messageId: result.messageId,
            attempt,
            duration,
          });

          return {
            success: true,
            messageId: result.messageId,
            to: options.to,
            duration,
          };
        } catch (error: unknown) {
          lastError = error as Error;
          LoggerUtil.warn('Email send attempt failed', {
            to: options.to,
            attempt,
            error: (error as Error).message,
          });

          // Wait before retry (exponential backoff)
          if (attempt < emailConfig.maxRetries) {
            await this.sleep(emailConfig.retryDelay * attempt);
          }
        }
      }

      // All retries failed
      throw lastError!;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      LoggerUtil.error('Email send failed', {
        error: (error as Error).message,
        to: options.to,
        subject: options.subject,
        duration,
      });

      throw error;
    }
  }

  // ==================== SMS METHODS ====================

  /**
   * Send SMS
   * @param options - SMS options
   * @returns {Promise<SendResult>} Send result
   */
  static async sendSMS(options: SMSSOptions): Promise<SendResult> {
    const startTime = Date.now();

    try {
      if (!this.twilioClient) {
        LoggerUtil.warn('SMS client not available', { to: options.to });
        // Return mock success in development
        if (process.env.NODE_ENV === 'development') {
          return { success: true, sid: 'mock-dev-sid', to: options.to, duration: Date.now() - startTime };
        }
        throw new Error('SMS service not configured');
      }

      // Check rate limit
      const rateLimitKey = `sms_rate:${options.to}`;
      const sent = (await CacheUtil.get(rateLimitKey)) || 0;

      if (sent >= 5) {
        LoggerUtil.warn('SMS rate limit exceeded', { to: options.to });
        throw new Error('SMS rate limit exceeded');
      }

      // Send SMS with retry
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= smsConfig.maxRetries; attempt++) {
        try {
          const result = await this.twilioClient.messages.create({
            body: options.message,
            from: smsConfig.twilio.phoneNumber,
            to: options.to,
          });

          // Increment rate limit counter
          await CacheUtil.set(rateLimitKey, (sent as number) + 1, 3600); // 1 hour

          const duration = Date.now() - startTime;
          LoggerUtil.info('SMS sent successfully', {
            to: options.to,
            sid: result.sid,
            status: result.status,
            attempt,
            duration,
          });

          return {
            success: true,
            sid: result.sid,
            status: result.status,
            to: options.to,
            duration,
          };
        } catch (error: unknown) {
          lastError = error as Error;
          LoggerUtil.warn('SMS send attempt failed', {
            to: options.to,
            attempt,
            error: (error as Error).message,
          });

          // Wait before retry
          if (attempt < smsConfig.maxRetries) {
            await this.sleep(smsConfig.retryDelay * attempt);
          }
        }
      }

      // All retries failed
      throw lastError!;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      LoggerUtil.error('SMS send failed', {
        error: (error as Error).message,
        to: options.to,
        duration,
      });

      throw error;
    }
  }

  // ==================== WELCOME EMAIL ====================

  /**
   * Send welcome email to newly registered user
   * @param options - User data
   */
  static async sendWelcomeEmail(options: {
    email: string;
    firstName: string;
    lastName?: string;
    location?: string;
    userType?: string;
  }): Promise<void> {
    try {
      const joinedAt = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric', month: 'long', year: 'numeric'
      });

      const userTypeLabel: Record<string, string> = {
        working: '💼 Working Professional',
        student: '🎓 Student',
        fresher: '🌟 Fresher',
      };

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Throne8</title>
</head>
<body style="margin:0;padding:0;background:#E0D8CF;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4ECE7;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:#FFFBED;border-radius:16px 16px 0 0;padding:40px 40px 30px;text-align:center;">
              <h1 style="color:#99782C;margin:0;font-size:36px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">THRONE8</h1>
              <p style="color:#4a372a;margin:6px 0 0;font-size:13px;letter-spacing:1px;">https://throne8.com · Your Professional Kingdom</p>
            </td>
          </tr>

          <!-- HERO -->
          <tr>
            <td style="background:#F4ECE7;padding:40px 40px 30px;text-align:center;">
              <h2 style="color:#4a372a;margin:0 0 12px;font-size:28px;font-weight:700;">
                Welcome To Throne8, ${options.firstName}!
              </h2>
              <p style="color:#4a372a;margin:0;font-size:16px;line-height:1.7;">
                Your Throne8 account is live and ready.<br>
                Join thousands of professionals building their career kingdom.
              </p>
            </td>
          </tr>

          <!-- ACCOUNT DETAILS -->
          <tr>
            <td style="background:#F0EAE6;padding:0 40px 30px;">
              <div style="background:#FFFFFF;border:1px solid #2a2a5a;border-radius:12px;padding:24px;">
                <p style="color:#4a372a;font-size:12px;font-weight:700;letter-spacing:2px;margin:0 0 16px;text-transform:uppercase;">Account Details</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #2a2a5a;">
                      <span style="color:#4a372a;font-size:13px;">📧 Email</span>
                    </td>
                    <td style="padding:8px 0;border-bottom:1px solid #2a2a5a;text-align:right;">
                      <span style="color:#4a372a;font-size:13px;font-weight:600;">${options.email}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #2a2a5a;">
                      <span style="color:#4a372a;font-size:13px;">Location</span>
                    </td>
                    <td style="padding:8px 0;border-bottom:1px solid #2a2a5a;text-align:right;">
                      <span style="color:#4a372a;font-size:13px;font-weight:600;">${options.location || 'Not specified'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #2a2a5a;">
                      <span style="color:#4a372a;font-size:13px;">Profile Type</span>
                    </td>
                    <td style="padding:8px 0;border-bottom:1px solid #2a2a5a;text-align:right;">
                      <span style="color:#4a372a;font-size:13px;font-weight:600;">${userTypeLabel[options.userType || ''] || 'Member'}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;">
                      <span style="color:#4a372a;font-size:13px;">📅 Joined</span>
                    </td>
                    <td style="padding:8px 0;text-align:right;">
                      <span style="color:#4a372a;font-size:13px;font-weight:600;">${joinedAt}</span>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#F4ECE7;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
              <p style="color:#3a3a5a;font-size:12px;margin:0 0 6px;">© 2024 Throne8 · throne8.com · All rights reserved.</p>
              <p style="color:#3a3a5a;font-size:11px;margin:0;">If you didn't create this account, contact support immediately.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      await this.sendEmail({
        to: options.email,
        subject: `Welcome to Throne8, ${options.firstName}!`,
        html,  // Direct HTML — no template
      });

      LoggerUtil.info('Welcome email sent successfully', { email: options.email });
    } catch (error: any) {
      LoggerUtil.error('Welcome email failed (non-critical)', {
        error: error.message,
        email: options.email,
      });
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Sleep for specified duration
   * @param ms - Milliseconds
   * @returns {Promise<void>}
   * @private
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service status
   * @returns {ServiceStatus} Service status
   */
  static getStatus(): ServiceStatus {
    return {
      initialized: this.initialized,
      email: {
        available: emailConfig.service === 'sendgrid' ? !!process.env.SENDGRID_API_KEY : !!this.emailTransporter,
        service: emailConfig.service,
        from: emailConfig.from.address,
      },
      sms: {
        available: !!this.twilioClient,
        provider: smsConfig.provider,
        phoneNumber: smsConfig.twilio.phoneNumber,
      },
      templates: {
        count: this.emailTemplates.size,
        available: Array.from(this.emailTemplates.keys()),
      },
    };
  }

  /**
   * Health check
   * @returns {Promise<HealthStatus>} Health status
   */
  static async healthCheck(): Promise<HealthStatus> {
    try {
      const status: HealthStatus = {
        status: 'healthy',
        email: false,
        sms: false,
        timestamp: new Date().toISOString(),
      };

      // Check email
      if (emailConfig.service === 'sendgrid') {
        status.email = !!process.env.SENDGRID_API_KEY;
      } else if (this.emailTransporter) {
        try {
          await this.emailTransporter.verify();
          status.email = true;
        } catch (error: unknown) {
          LoggerUtil.warn('Email health check failed', { error: (error as Error).message });
        }
      }

      // Check SMS (Twilio doesn't have a built-in verify method)
      if (this.twilioClient) {
        status.sms = true;
      }

      if (!status.email && !status.sms) {
        status.status = 'unhealthy';
      }

      return status;
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// ==================== EXPORT ====================

export default NotificationService;