import crypto from 'crypto';
import { Request } from 'express';
import validator from 'validator';
import { logger } from '@/shared/logger.util';

class SecurityHelper {
  sanitizeInput(input: string): string {
    if (!input) return '';
    let sanitized = validator.stripLow(input);
    sanitized = validator.escape(sanitized);
    sanitized = sanitized.replace(/[<>]/g, '');
    return sanitized.trim();
  }

  sanitizeEmail(email: string): string | null {
    if (!email) return null;
    const normalized = validator.normalizeEmail(email, {
      all_lowercase: true,
      gmail_remove_dots: false,
    });
    if (!normalized || !validator.isEmail(normalized)) return null;
    return normalized;
  }

  isValidPhoneNumber(phone: string): boolean {
    if (!phone) return false;
    const cleaned = phone.replace(/[\s()-]/g, '');
    return /^\+?[1-9]\d{9,14}$/.test(cleaned);
  }

  sanitizeURL(url: string): string | null {
    if (!url) return null;
    if (!validator.isURL(url, { require_protocol: true })) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
    return url;
  }

  hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  generateSecureString(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }
    return result;
  }

  encryptData(data: string, key?: string): string {
    const encryptionKey = key || process.env['ENCRYPTION_KEY'] || 'default-key';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.hashData(encryptionKey).slice(0, 32)),
      iv
    );
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decryptData(encryptedData: string, key?: string): string {
    const encryptionKey = key || process.env['ENCRYPTION_KEY'] || 'default-key';
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.hashData(encryptionKey).slice(0, 32)),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (!data || data.length <= visibleChars) return '***';
    return '*'.repeat(data.length - visibleChars) + data.slice(-visibleChars);
  }

  maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***@***.com';
    const [username, domain] = email.split('@');
    const maskedUsername = this.maskSensitiveData(username, 2);
    const dotIndex = domain.lastIndexOf('.');
    const domainName = domain.slice(0, dotIndex);
    const tld = domain.slice(dotIndex + 1);
    const maskedDomain = this.maskSensitiveData(domainName, 1);
    return `${maskedUsername}@${maskedDomain}.${tld}`;
  }

  maskPhoneNumber(phone: string): string {
    if (!phone || phone.length < 10) return '***-***-****';
    return this.maskSensitiveData(phone, 4);
  }

  validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
  } {
    const errors: string[] = [];

    if (password.length < 8) errors.push('Password must be at least 8 characters long');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password))
      errors.push('Password must contain at least one special character');

    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    if (errors.length === 0) {
      strength = password.length >= 12 ? 'strong' : 'medium';
    }

    return { isValid: errors.length === 0, errors, strength };
  }

  hasSQLInjectionPattern(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
      /(--|\bOR\b.*=.*|'.*=.*'|".*=.*")/gi,
      /(\bUNION\b.*\bSELECT\b)/gi,
      /(;|\||&&)/g,
    ];
    return sqlPatterns.some((pattern) => pattern.test(input));
  }

  hasXSSPattern(input: string): boolean {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<embed[^>]*>/gi,
      /<object[^>]*>/gi,
    ];
    return xssPatterns.some((pattern) => pattern.test(input));
  }

  sanitizeObjectKeys(obj: any): any {
    if (typeof obj !== 'object' || obj === null) return obj;
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    if (Array.isArray(obj)) return obj.map((item) => this.sanitizeObjectKeys(item));
    const sanitized: any = {};
    for (const key of Object.keys(obj)) {
      if (!dangerousKeys.includes(key)) {
        sanitized[key] = this.sanitizeObjectKeys(obj[key]);
      }
    }
    return sanitized;
  }

  getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    return forwarded
      ? typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : forwarded[0]
      : req.socket.remoteAddress || 'unknown';
  }

  getUserAgent(req: Request): string {
    return req.headers['user-agent'] || 'unknown';
  }

  logSecurityEvent(event: string, req: Request, additionalData?: any): void {
    logger.warn('Security Event', {
      event,
      ip: this.getClientIP(req),
      userAgent: this.getUserAgent(req),
      timestamp: new Date().toISOString(),
      userId: (req as any).user?.id || 'anonymous',
      ...additionalData,
    });
  }

  validateCSRFToken(token: string, expectedToken: string): boolean {
    if (!token || !expectedToken) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
    } catch {
      return false;
    }
  }

  generateCSRFToken(): string {
    return this.generateToken(32);
  }

  generateRateLimitKey(req: Request, identifier: string): string {
    return `ratelimit:${identifier}:${this.getClientIP(req)}`;
  }

  isValidFileExtension(filename: string, allowedExtensions: string[]): boolean {
    if (!filename) return false;
    const ext = filename.toLowerCase().split('.').pop();
    return ext ? allowedExtensions.includes(ext) : false;
  }

  isValidMimeType(mimeType: string, allowedMimeTypes: string[]): boolean {
    return allowedMimeTypes.includes(mimeType);
  }

  sanitizeFilename(filename: string): string {
    return filename.replace(/\.\./g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  generateSessionId(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }
}

export default new SecurityHelper();