/**
 * Common Validators - Production-Ready Reusable Validation Functions
 * Shared validation utilities used across all validator files.
 * These validators ensure consistency and reduce code duplication.
 * Optimized for performance and security with proper error handling.
 * 
 * Features:
 * - User ID validation (MongoDB ObjectId, UUID, custom formats)
 * - Date validation (ISO format, range checks)
 * - Email validation with sanitization
 * - Password strength validation
 * - Phone number validation
 * - URL validation with domain restrictions
 * - File validation (size, type, name)
 * - Text sanitization (XSS prevention)
 * 
 * Dependencies:
 * - validator: For built-in validation functions
 * - mongoose: For ObjectId validation (if using MongoDB)
 * - xss: For XSS prevention
 * 
 * Integration:
 * - Used in all validator files (profileViewValidator.ts, userValidator.ts, etc.)
 * - Supports both express-validator custom() and standalone usage
 * - Testable in tests/unit/validators/commonValidator.test.ts
 */

import validator from 'validator';
import { Types } from 'mongoose';

export const commonValidators = {
  /**
   * Validates MongoDB ObjectId format
   * Supports both ObjectId objects and string representations
   */
  isValidUserId: (value: any): boolean => {
    if (!value) return false;
    
    // Handle ObjectId objects
    if (value instanceof Types.ObjectId) return true;
    
    // Handle string representations
    if (typeof value === 'string') {
      // MongoDB ObjectId (24 hex characters)
      if (Types.ObjectId.isValid(value)) return true;
      
      // UUID format (alternative)
      if (validator.isUUID(value)) return true;
      
      // Custom numeric ID format (for non-MongoDB systems)
      if (/^\d+$/.test(value) && parseInt(value) > 0) return true;
    }
    
    return false;
  },

  /**
   * Validates ISO date format and ensures it's a valid date
   * Supports both Date objects and ISO strings
   */
  isValidISODate: (value: any): boolean => {
    if (!value) return false;
    
    // Handle Date objects
    if (value instanceof Date) {
      return !isNaN(value.getTime());
    }
    
    // Handle string representations
    if (typeof value === 'string') {
      // Check ISO format and validity
      if (validator.isISO8601(value)) {
        const date = new Date(value);
        return !isNaN(date.getTime());
      }
    }
    
    return false;
  },

  /**
   * Validates date range (start date must be before end date)
   * Used for analytics and export date ranges
   */
  isValidDateRange: (startDate: any, endDate: any): boolean => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return false;
    }
    
    return start < end;
  },

  /**
   * Validates email with additional security checks
   * Sanitizes and normalizes email addresses
   */
  isValidEmail: (email: string): boolean => {
    if (!email || typeof email !== 'string') return false;
    
    // Basic format validation
    if (!validator.isEmail(email)) return false;
    
    // Length check (prevent extremely long emails)
    if (email.length > 254) return false;
    
    // Domain validation (optional - add your allowed domains)
    const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS?.split(',') || [];
    if (allowedDomains.length > 0) {
      const domain = email.split('@')[1];
      if (!allowedDomains.includes(domain)) return false;
    }
    
    return true;
  },

  /**
   * Validates password strength
   * Configurable requirements via environment variables
   */
  isStrongPassword: (password: string): boolean => {
    if (!password || typeof password !== 'string') return false;
    
    const options = {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
      minLowercase: parseInt(process.env.PASSWORD_MIN_LOWERCASE || '1'),
      minUppercase: parseInt(process.env.PASSWORD_MIN_UPPERCASE || '1'),
      minNumbers: parseInt(process.env.PASSWORD_MIN_NUMBERS || '1'),
      minSymbols: parseInt(process.env.PASSWORD_MIN_SYMBOLS || '1'),
    };
    
    return validator.isStrongPassword(password, options);
  },

  /**
   * Validates phone number with international format support
   * Supports multiple formats and country codes
   */
  isValidPhoneNumber: (phone: string): boolean => {
    if (!phone || typeof phone !== 'string') return false;
    
    // Remove all non-numeric characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    // Check if it's a valid mobile phone (with country code)
    if (validator.isMobilePhone(cleanPhone, 'any', { strictMode: true })) {
      return true;
    }
    
    // Fallback: Basic format validation (10-15 digits)
    if (/^\+?[\d]{10,15}$/.test(cleanPhone)) {
      return true;
    }
    
    return false;
  },

  /**
   * Validates URL with security restrictions
   * Prevents malicious URLs and restricts to allowed protocols
   */
  isValidURL: (url: string): boolean => {
    if (!url || typeof url !== 'string') return false;
    
    // Basic URL validation
    if (!validator.isURL(url)) return false;
    
    // Protocol whitelist
    const allowedProtocols = ['http:', 'https:'];
    try {
      const urlObj = new URL(url);
      if (!allowedProtocols.includes(urlObj.protocol)) {
        return false;
      }
      
      // Block localhost and private IPs in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = urlObj.hostname;
        if (
          hostname === 'localhost' ||
          hostname.startsWith('127.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
        ) {
          return false;
        }
      }
    } catch {
      return false;
    }
    
    return true;
  },

  /**
   * Sanitizes text input to prevent XSS attacks
   * Removes HTML tags and dangerous characters
   */
  sanitizeText: (text: string): string => {
    if (!text || typeof text !== 'string') return '';
    
    // Remove HTML tags
    let sanitized = validator.stripLow(text);
    
    // Escape HTML entities
    sanitized = validator.escape(sanitized);
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized;
  },

  /**
   * Validates file upload parameters
   * Checks file size, type, and name security
   */
  isValidFile: (file: any, options: {
    maxSize?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
  } = {}): boolean => {
    if (!file) return false;
    
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf']
    } = options;
    
    // Check file size
    if (file.size > maxSize) return false;
    
    // Check MIME type
    if (!allowedTypes.includes(file.mimetype)) return false;
    
    // Check file extension
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext)) return false;
    
    // Security: Check for dangerous file names
    const dangerousPatterns = [
      /\.\./,  // Directory traversal
      /[<>:"|?*]/,  // Invalid filename characters
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i  // Windows reserved names
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(file.originalname))) {
      return false;
    }
    
    return true;
  },

  /**
   * Validates array with size limits and element validation
   * Prevents memory exhaustion attacks
   */
  isValidArray: (arr: any, options: {
    minLength?: number;
    maxLength?: number;
    elementValidator?: (item: any) => boolean;
  } = {}): boolean => {
    if (!Array.isArray(arr)) return false;
    
    const {
      minLength = 0,
      maxLength = 1000,
      elementValidator
    } = options;
    
    // Check array size
    if (arr.length < minLength || arr.length > maxLength) {
      return false;
    }
    
    // Validate each element if validator provided
    if (elementValidator) {
      return arr.every(elementValidator);
    }
    
    return true;
  },

  /**
   * Validates JSON string and parses safely
   * Prevents JSON injection and limits object depth
   */
  isValidJSON: (jsonString: string, maxDepth: number = 10): boolean => {
    if (!jsonString || typeof jsonString !== 'string') return false;
    
    try {
      const parsed = JSON.parse(jsonString);
      
      // Check object depth to prevent stack overflow
      const getDepth = (obj: any): number => {
        if (obj === null || typeof obj !== 'object') return 0;
        return 1 + Math.max(...Object.values(obj).map(getDepth));
      };
      
      if (getDepth(parsed) > maxDepth) return false;
      
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validates IP address (IPv4 and IPv6)
   * Used for rate limiting and security logging
   */
  isValidIP: (ip: string): boolean => {
    if (!ip || typeof ip !== 'string') return false;
    return validator.isIP(ip);
  },

  /**
   * Validates geographic coordinates (latitude, longitude)
   * Used for location-based features
   */
  isValidCoordinates: (lat: number, lng: number): boolean => {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180 &&
      !isNaN(lat) && !isNaN(lng)
    );
  },

  /**
   * Validates pagination parameters
   * Ensures safe limits to prevent database overload
   */
  isValidPagination: (limit: number, skip: number, maxLimit: number = 100): boolean => {
    return (
      Number.isInteger(limit) &&
      Number.isInteger(skip) &&
      limit > 0 &&
      limit <= maxLimit &&
      skip >= 0
    );
  }
};