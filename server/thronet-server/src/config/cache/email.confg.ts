import config from '../env/env';
import { logger } from '@/shared/logger.util';

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
    email: string;
  };
  templates: {
    enabled: boolean;
    path: string;
  };
}

/**
 * Email Service Configuration
 * Supports: Gmail, SendGrid, AWS SES, Custom SMTP
 */
class EmailConfiguration {
  private config: EmailConfig;

  constructor() {
    this.config = this.initializeConfig();
    this.validateConfig();
  }

  private initializeConfig(): EmailConfig {
    const emailService = config.EMAIL_SERVICE || 'gmail';

    // Gmail Configuration
    if (emailService === 'gmail') {
      return {
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: config.EMAIL_USER || '',
          pass: config.EMAIL_PASSWORD || '',
        },
        from: {
          name: config.EMAIL_FROM_NAME || 'Mentorship Platform',
          email: config.EMAIL_FROM || config.EMAIL_USER || '',
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // SendGrid Configuration
    if (emailService === 'sendgrid') {
      return {
        service: 'sendgrid',
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: config.SENDGRID_API_KEY || '',
        },
        from: {
          name: config.EMAIL_FROM_NAME || 'Mentorship Platform',
          email: config.EMAIL_FROM || '',
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // AWS SES Configuration
    if (emailService === 'ses') {
      return {
        service: 'ses',
        host: `email-smtp.${config.AWS_REGION || 'us-east-1'}.amazonaws.com`,
        port: 587,
        secure: false,
        auth: {
          user: config.SES_SMTP_USERNAME || '',
          pass: config.SES_SMTP_PASSWORD || '',
        },
        from: {
          name: config.EMAIL_FROM_NAME || 'Mentorship Platform',
          email: config.EMAIL_FROM || '',
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // Custom SMTP Configuration
    return {
      service: 'custom',
      host: config.SMTP_HOST || 'smtp.example.com',
      port: parseInt(config.SMTP_PORT || '587', 10),
      secure: config.SMTP_SECURE === 'true',
      auth: {
        user: config.SMTP_USER || '',
        pass: config.SMTP_PASSWORD || '',
      },
      from: {
        name: config.EMAIL_FROM_NAME || 'Mentorship Platform',
        email: config.EMAIL_FROM || '',
      },
      templates: {
        enabled: true,
        path: './src/utils/emailTemplates',
      },
    };
  }

  private validateConfig(): void {
    const { auth, from } = this.config;

    if (!auth.user || !auth.pass) {
      logger.warn('⚠️  Email credentials not configured. Email service will be disabled.');
    }

    if (!from.email) {
      logger.warn('⚠️  Email "from" address not configured.');
    }

    logger.info(`📧 Email service configured: ${this.config.service}`);
    logger.info(`📤 Sending emails from: ${from.name} <${from.email}>`);
  }

  /**
   * Get email configuration
   */
  getConfig(): EmailConfig {
    return { ...this.config };
  }

  /**
   * Check if email service is enabled
   */
  isEnabled(): boolean {
    return !!(this.config.auth.user && this.config.auth.pass);
  }

  /**
   * Get transporter options for nodemailer
   */
  getTransporterOptions() {
    return {
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: {
        user: this.config.auth.user,
        pass: this.config.auth.pass,
      },
      // Connection timeout
      connectionTimeout: 10000,
      // Greeting timeout
      greetingTimeout: 10000,
      // Socket timeout
      socketTimeout: 10000,
    };
  }

  /**
   * Get default "from" address
   */
  getFromAddress(): { name: string; address: string } {
    return {
      name: this.config.from.name,
      address: this.config.from.email,
    };
  }

  /**
   * Get templates configuration
   */
  getTemplatesConfig() {
    return { ...this.config.templates };
  }
}

// Export singleton instance
const emailConfig = new EmailConfiguration();

export default emailConfig;
export { EmailConfig };