import { logger } from "@/shared/logger.util";
import config from "../env/env";

interface SMSConfig {
  provider: 'twilio' | 'aws_sns' | 'msg91' | 'custom';
  enabled: boolean;
  credentials: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
    apiKey?: string;
    senderId?: string;
  };
  options: {
    retryAttempts: number;
    timeout: number;
    fallbackProvider?: string;
  };
}

/**
 * SMS Service Configuration
 * Supports: Twilio, AWS SNS, MSG91, Custom
 */
class SMSConfiguration {
  private config: SMSConfig;

  constructor() {
    this.config = this.initializeConfig();
    this.validateConfig();
  }

  private initializeConfig(): SMSConfig {
    const provider = (config.SMS_PROVIDER || 'twilio').toLowerCase() as SMSConfig['provider'];

    const baseConfig: SMSConfig = {
      provider,
      enabled: false,
      credentials: {},
      options: {
        retryAttempts: 3,
        timeout: 10000,
        fallbackProvider: config.SMS_FALLBACK_PROVIDER,
      },
    };

    // Twilio Configuration
    if (provider === 'twilio') {
      baseConfig.credentials = {
        accountSid: config.TWILIO_ACCOUNT_SID,
        authToken: config.TWILIO_AUTH_TOKEN,
        phoneNumber: config.TWILIO_PHONE_NUMBER,
      };
      baseConfig.enabled = !!(
        config.TWILIO_ACCOUNT_SID &&
        config.TWILIO_AUTH_TOKEN &&
        config.TWILIO_PHONE_NUMBER
      );
    }

    // AWS SNS Configuration
    else if (provider === 'aws_sns') {
      baseConfig.credentials = {
        apiKey: config.AWS_SNS_ACCESS_KEY,
        senderId: config.AWS_SNS_SENDER_ID,
      };
      baseConfig.enabled = !!(config.AWS_SNS_ACCESS_KEY && config.AWS_SNS_SENDER_ID);
    }

    // MSG91 Configuration (Indian SMS Provider)
    else if (provider === 'msg91') {
      baseConfig.credentials = {
        apiKey: config.MSG91_API_KEY,
        senderId: config.MSG91_SENDER_ID,
      };
      baseConfig.enabled = !!(config.MSG91_API_KEY && config.MSG91_SENDER_ID);
    }

    // Custom Provider
    else {
      baseConfig.credentials = {
        apiKey: config.CUSTOM_SMS_API_KEY,
        senderId: config.CUSTOM_SMS_SENDER_ID,
      };
      baseConfig.enabled = !!(config.CUSTOM_SMS_API_KEY && config.CUSTOM_SMS_SENDER_ID);
    }

    return baseConfig;
  }

  private validateConfig(): void {
    if (!this.config.enabled) {
      logger.warn('⚠️  SMS service not configured or disabled');
      return;
    }

    logger.info(`📱 SMS service configured: ${this.config.provider}`);

    if (this.config.provider === 'twilio') {
      logger.info(`📤 Sending SMS from: ${this.config.credentials.phoneNumber}`);
    } else {
      logger.info(`📤 Sending SMS with sender ID: ${this.config.credentials.senderId}`);
    }
  }

  /**
   * Get SMS configuration
   */
  getConfig(): SMSConfig {
    return { ...this.config };
  }

  /**
   * Check if SMS service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get provider name
   */
  getProvider(): string {
    return this.config.provider;
  }

  /**
   * Get credentials
   */
  getCredentials() {
    return { ...this.config.credentials };
  }

  /**
   * Get Twilio client config
   */
  getTwilioConfig() {
    if (this.config.provider !== 'twilio') {
      throw new Error('SMS provider is not Twilio');
    }

    return {
      accountSid: this.config.credentials.accountSid!,
      authToken: this.config.credentials.authToken!,
      phoneNumber: this.config.credentials.phoneNumber!,
    };
  }

  /**
   * Get AWS SNS config
   */
  getAWSSNSConfig() {
    if (this.config.provider !== 'aws_sns') {
      throw new Error('SMS provider is not AWS SNS');
    }

    return {
      region: config.AWS_REGION || 'us-east-1',
      accessKeyId: this.config.credentials.apiKey!,
      secretAccessKey: config.AWS_SNS_SECRET_KEY!,
      senderId: this.config.credentials.senderId!,
    };
  }

  /**
   * Get MSG91 config
   */
  getMSG91Config() {
    if (this.config.provider !== 'msg91') {
      throw new Error('SMS provider is not MSG91');
    }

    return {
      apiKey: this.config.credentials.apiKey!,
      senderId: this.config.credentials.senderId!,
      route: config.MSG91_ROUTE || '4', // 4 = Transactional
      country: config.MSG91_COUNTRY || '91', // India
    };
  }

  /**
   * Get retry options
   */
  getRetryOptions() {
    return {
      retries: this.config.options.retryAttempts,
      timeout: this.config.options.timeout,
      fallback: this.config.options.fallbackProvider,
    };
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phoneNumber: string): { valid: boolean; formatted?: string; error?: string } {
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Check minimum length
    if (cleaned.length < 10) {
      return { valid: false, error: 'Phone number too short' };
    }

    // Check maximum length
    if (cleaned.length > 15) {
      return { valid: false, error: 'Phone number too long' };
    }

    // Add country code if not present (default to India +91)
    let formatted = cleaned;
    if (cleaned.length === 10) {
      formatted = `91${cleaned}`; // India
    } else if (!cleaned.startsWith('91') && cleaned.length === 10) {
      formatted = `91${cleaned}`;
    }

    // Format with + prefix
    formatted = `+${formatted}`;

    return { valid: true, formatted };
  }

  /**
   * Get supported countries
   */
  getSupportedCountries(): Array<{ code: string; name: string; dialCode: string }> {
    return [
      { code: 'IN', name: 'India', dialCode: '+91' },
      { code: 'US', name: 'United States', dialCode: '+1' },
      { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
      { code: 'AE', name: 'United Arab Emirates', dialCode: '+971' },
      { code: 'SG', name: 'Singapore', dialCode: '+65' },
      { code: 'AU', name: 'Australia', dialCode: '+61' },
      { code: 'CA', name: 'Canada', dialCode: '+1' },
    ];
  }
}

// Export singleton instance
const smsConfig = new SMSConfiguration();

export default smsConfig;
export { SMSConfig };