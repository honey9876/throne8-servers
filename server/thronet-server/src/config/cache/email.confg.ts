//server/thronet-server/src/config/cache/email.confg.ts
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
  apiKey?: string;
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
    const rawService = (config.EMAIL_SERVICE || 'gmail').toLowerCase().trim();
    const fromName = config.EMAIL_FROM_NAME || 'Throne8';
    const fromEmail = config.SMTP_FROM_ADDRESS || config.EMAIL_FROM || '';

    const rawApiKey = (config.BREVO_API_KEY || process.env.BREVO_API_KEY || '').trim();
    const isSmtpKeyInApiField = rawApiKey.startsWith('xsmtpsib-');

    // ── 1. Explicit Brevo SMTP ──────────────────────────────────────────
    if (rawService === 'brevo-smtp' || rawService === 'brevo_smtp') {
      return {
        service: 'brevo-smtp',
        host: config.SMTP_HOST || 'smtp-relay.brevo.com',
        port: parseInt(config.SMTP_PORT || '587', 10),
        secure: config.SMTP_SECURE === 'true',
        auth: {
          user: config.SMTP_USER || '',
          pass: config.SMTP_PASSWORD || (isSmtpKeyInApiField ? rawApiKey : ''),
        },
        apiKey: undefined,
        from: {
          name: fromName,
          email: fromEmail,
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // ── 2. Explicit Brevo REST API ──────────────────────────────────────
    if (rawService === 'brevo-api' || rawService === 'brevo_api') {
      return {
        service: 'brevo-api',
        host: '',
        port: 0,
        secure: true,
        auth: {
          user: '',
          pass: '',
        },
        apiKey: config.BREVO_API_KEY || process.env.BREVO_API_KEY || '',
        from: {
          name: fromName,
          email: fromEmail,
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // ── 3. EMAIL_SERVICE=brevo (smart detection) ────────────────────────
    // If SMTP credentials are provided, or if the BREVO_API_KEY starts with
    // 'xsmtpsib-' (which is Brevo's SMTP key prefix, NOT a REST API key),
    // automatically select Brevo SMTP over Nodemailer.
    if (rawService === 'brevo') {
      const rawApiKey = config.BREVO_API_KEY || process.env.BREVO_API_KEY || '';
      const isSmtpKeyInApiField = rawApiKey.startsWith('xsmtpsib-');
      const hasSmtpCreds = !!(config.SMTP_USER && config.SMTP_PASSWORD);

      if (hasSmtpCreds || isSmtpKeyInApiField) {
        return {
          service: 'brevo-smtp',
          host: config.SMTP_HOST || 'smtp-relay.brevo.com',
          port: parseInt(config.SMTP_PORT || '587', 10),
          secure: config.SMTP_SECURE === 'true',
          auth: {
            user: config.SMTP_USER || '',
            pass: config.SMTP_PASSWORD || (isSmtpKeyInApiField ? rawApiKey : ''),
          },
          apiKey: undefined,
          from: {
            name: fromName,
            email: fromEmail,
          },
          templates: {
            enabled: true,
            path: './src/utils/emailTemplates',
          },
        };
      }

      // Default to Brevo REST API when genuine API key (xkeysib-...) is present
      return {
        service: 'brevo-api',
        host: '',
        port: 0,
        secure: true,
        auth: {
          user: '',
          pass: '',
        },
        apiKey: rawApiKey,
        from: {
          name: fromName,
          email: fromEmail,
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // ── 4. Gmail Configuration ──────────────────────────────────────────
    if (rawService === 'gmail') {
      return {
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: config.EMAIL_USER || config.SMTP_USER || '',
          pass: config.EMAIL_PASSWORD || config.SMTP_PASSWORD || '',
        },
        from: {
          name: fromName,
          email: config.EMAIL_FROM || config.SMTP_FROM_ADDRESS || config.EMAIL_USER || config.SMTP_USER || '',
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // ── 5. SendGrid Configuration ───────────────────────────────────────
    if (rawService === 'sendgrid') {
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
          name: fromName,
          email: fromEmail,
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // ── 6. AWS SES Configuration ────────────────────────────────────────
    if (rawService === 'ses') {
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
          name: fromName,
          email: fromEmail,
        },
        templates: {
          enabled: true,
          path: './src/utils/emailTemplates',
        },
      };
    }

    // ── 7. Custom SMTP Configuration (default) ──────────────────────────
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
        name: fromName,
        email: fromEmail,
      },
      templates: {
        enabled: true,
        path: './src/utils/emailTemplates',
      },
    };
  }

  private validateConfig(): void {
    const { auth, from, service, apiKey } = this.config;

    if (service === 'brevo-api') {
      if (!apiKey) {
        logger.warn('⚠️  Brevo API key not configured. Email service will be disabled.');
      } else if (apiKey.startsWith('xsmtpsib-')) {
        logger.warn('⚠️  BREVO_API_KEY contains an SMTP key ("xsmtpsib-..."). For SMTP, use EMAIL_SERVICE=brevo-smtp with SMTP_USER and SMTP_PASSWORD.');
      }
    } else if (!auth.user || !auth.pass) {
      logger.warn(`⚠️  Email credentials not configured for ${service}. Email service will be disabled.`);
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
    if (this.config.service === 'brevo-api') {
      return !!this.config.apiKey && !this.config.apiKey.startsWith('xsmtpsib-');
    }
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