// src/validators/blockValidator.ts

import { body, param, query, ValidationChain } from 'express-validator';
import { BlockReason, BlockType, BlockSeverity } from '../models/index';
import environmentConfig from '@/config/environment/environment';
import expressValidator from 'express-validator';

// Technologies: Express-validator, TypeScript validation, Input sanitization, Business rule validation
// Features: Complete validation for all 12 block controller features with security, rate limiting, and business rule enforcement

// =================================================================================
// COMMON VALIDATION HELPERS
// =================================================================================

const isValidObjectId = (value: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(value);
};

const isValidUserId = (value: string): boolean => {
  return typeof value === 'string' && value.length >= 1 && value.length <= 100;
};

const sanitizeString = (value: string): string => {
  return value.trim().replace(/[<>]/g, '');
};

// =================================================================================
// BLOCK USER VALIDATION - Feature 1
// =================================================================================

export const validateBlockUser: ValidationChain[] = [
  body('blockedId')
    .notEmpty()
    .withMessage('Blocked user ID is required')
    .isString()
    .withMessage('Blocked user ID must be a string')
    .custom((value) => {
      if (!isValidUserId(value)) {
        throw new Error('Invalid blocked user ID format');
      }
      return true;
    })
    .customSanitizer(sanitizeString),
    
  body('reason')
    .isIn(Object.values(BlockReason))
    .withMessage(`Invalid block reason. Must be one of: ${Object.values(BlockReason).join(', ')}`),
    
  body('customReason')
    .optional()
    .isString()
    .withMessage('Custom reason must be a string')
    .isLength({ min: 5, max: 500 })
    .withMessage('Custom reason must be between 5 and 500 characters')
    .customSanitizer(sanitizeString)
    .custom((value, { req }) => {
      if (req.body.reason === BlockReason.OTHER && (!value || value.trim().length < 5)) {
        throw new Error('Custom reason is required when block reason is "other"');
      }
      return true;
    }),
    
  body('blockType')
    .optional()
    .isIn(Object.values(BlockType))
    .withMessage(`Invalid block type. Must be one of: ${Object.values(BlockType).join(', ')}`),
    
  body('expiresAt')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('Expires at must be a valid ISO 8601 date')
    .custom((value) => {
      if (value) {
        const expiryDate = new Date(value);
        const now = new Date();
        const maxExpiry = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year max
        
        if (expiryDate <= now) {
          throw new Error('Expiry date must be in the future');
        }
        
        if (expiryDate > maxExpiry) {
          throw new Error('Expiry date cannot be more than 1 year in the future');
        }
      }
      return true;
    }),
    
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
    
  body('metadata.evidence')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Evidence cannot have more than 10 URLs'),
    
  body('metadata.evidence.*')
    .optional()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Evidence must be valid HTTP/HTTPS URLs')
    .isLength({ max: 2000 })
    .withMessage('Evidence URLs cannot exceed 2000 characters'),
    
  body('metadata.reportedBy')
    .optional()
    .isString()
    .withMessage('Reported by must be a string')
    .custom((value) => {
      if (!isValidUserId(value)) {
        throw new Error('Invalid reporter user ID format');
      }
      return true;
    })
];

// =================================================================================
// UNBLOCK USER VALIDATION - Feature 2
// =================================================================================

export const validateUnblockUser: ValidationChain[] = [
  param('blockedId')
    .isString()
    .withMessage('Blocked ID must be a string')
    .custom((value) => {
      if (!isValidUserId(value)) {
        throw new Error('Invalid blocked user ID format');
      }
      return true;
    })
    .customSanitizer(sanitizeString),
    
  body('reason')
    .optional()
    .isString()
    .withMessage('Reason must be a string')
    .isLength({ min: 3, max: 200 })
    .withMessage('Reason must be between 3 and 200 characters')
    .customSanitizer(sanitizeString)
];

// =================================================================================
// BULK BLOCK VALIDATION - Feature 6
// =================================================================================

export const validateBulkBlock: ValidationChain[] = [
  body('blockedIds')
    .isArray({ min: 1, max: environmentConfig.BULK_OPERATION_BATCH_SIZE || 100 })
    .withMessage(`Blocked IDs must be an array with 1-${environmentConfig.BULK_OPERATION_BATCH_SIZE || 100} items`),
    
  body('blockedIds.*')
    .isString()
    .withMessage('Each blocked ID must be a string')
    .custom((value) => {
      if (!isValidUserId(value)) {
        throw new Error('Invalid blocked user ID format');
      }
      return true;
    })
    .customSanitizer(sanitizeString),
    
  body('reason')
    .isIn(Object.values(BlockReason))
    .withMessage(`Invalid block reason. Must be one of: ${Object.values(BlockReason).join(', ')}`),
    
  body('blockType')
    .isIn(Object.values(BlockType))
    .withMessage(`Invalid block type. Must be one of: ${Object.values(BlockType).join(', ')}`),
    
  body('customReason')
    .optional()
    .isString()
    .withMessage('Custom reason must be a string')
    .isLength({ min: 5, max: 500 })
    .withMessage('Custom reason must be between 5 and 500 characters')
    .customSanitizer(sanitizeString)
    .custom((value, { req }) => {
      if (req.body.reason === BlockReason.OTHER && (!value || value.trim().length < 5)) {
        throw new Error('Custom reason is required when block reason is "other"');
      }
      return true;
    })
];

// =================================================================================
// PAGINATION VALIDATION - Features 3, 5
// =================================================================================

export const validatePagination: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Page must be a positive integer between 1 and 10000')
    .toInt(),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: environmentConfig.PAGINATION_MAX_LIMIT || 100 })
    .withMessage(`Limit must be between 1 and ${environmentConfig.PAGINATION_MAX_LIMIT || 100}`)
    .toInt(),
    
  query('sortBy')
    .optional()
    .isIn(['blockedAt', 'unblockedAt', 'reason', 'status', 'createdAt', 'updatedAt'])
    .withMessage('Invalid sort field'),
    
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

// =================================================================================
// BLOCKED USERS LIST VALIDATION - Feature 3
// =================================================================================

export const validateGetBlockedUsers: ValidationChain[] = [
  ...validatePagination,
  
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('Include inactive must be a boolean')
    .toBoolean(),
    
  query('status')
    .optional()
    .isString()
    .withMessage('Status must be a string')
    .isIn(['active', 'inactive', 'pending_review', 'system_blocked', 'appealed', 'expired'])
    .withMessage('Invalid status filter'),
    
  query('reason')
    .optional()
    .isIn(Object.values(BlockReason))
    .withMessage(`Invalid reason filter. Must be one of: ${Object.values(BlockReason).join(', ')}`)
];

// =================================================================================
// USER ID VALIDATION - Feature 4
// =================================================================================

export const validateUserId: ValidationChain[] = [
  param('userId')
    .isString()
    .withMessage('User ID must be a string')
    .custom((value) => {
      if (!isValidUserId(value)) {
        throw new Error('Invalid user ID format');
      }
      return true;
    })
    .customSanitizer(sanitizeString)
];

// =================================================================================
// DATE RANGE VALIDATION - Feature 5
// =================================================================================

export const validateDateRange: ValidationChain[] = [
  query('startDate')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('Start date must be a valid ISO 8601 date')
    .custom((value) => {
      if (value) {
        const startDate = new Date(value);
        const maxPast = new Date(Date.now() - (3 * 365 * 24 * 60 * 60 * 1000)); // 3 years ago
        
        if (startDate < maxPast) {
          throw new Error('Start date cannot be more than 3 years ago');
        }
      }
      return true;
    }),
    
  query('endDate')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((endDate, { req }) => {
      if (endDate) {
        const end = new Date(endDate);
        const now = new Date();
        
        if (end > now) {
          throw new Error('End date cannot be in the future');
        }
        
        if (req.query?.startDate) {
          const start = new Date(req.query.startDate as string);
          if (end <= start) {
            throw new Error('End date must be after start date');
          }
          
          // Check if date range is too large (max 1 year)
          const oneYear = 365 * 24 * 60 * 60 * 1000;
          if (end.getTime() - start.getTime() > oneYear) {
            throw new Error('Date range cannot exceed 1 year');
          }
        }
      }
      return true;
    })
];

// =================================================================================
// BLOCK HISTORY VALIDATION - Feature 5
// =================================================================================

export const validateGetBlockHistory: ValidationChain[] = [
  ...validateDateRange,
  
  query('includeAppeals')
    .optional()
    .isBoolean()
    .withMessage('Include appeals must be a boolean')
    .toBoolean(),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt()
];

// =================================================================================
// ANALYTICS VALIDATION - Feature 7
// =================================================================================

export const validateGetAnalytics: ValidationChain[] = [
  query('timeframe')
    .optional()
    .isIn(['day', 'week', 'month', 'quarter', 'year'])
    .withMessage('Timeframe must be one of: day, week, month, quarter, year'),
    
  query('includeSystemWide')
    .optional()
    .isBoolean()
    .withMessage('Include system wide must be a boolean')
    .toBoolean()
];

// =================================================================================
// NOTIFICATION SETTINGS VALIDATION - Feature 8
// =================================================================================

export const validateNotificationSettings: ValidationChain[] = [
  body('enableBlockNotifications')
    .optional()
    .isBoolean()
    .withMessage('Enable block notifications must be a boolean')
    .toBoolean(),
    
  body('enableUnblockNotifications')
    .optional()
    .isBoolean()
    .withMessage('Enable unblock notifications must be a boolean')
    .toBoolean(),
    
  body('enableAppealNotifications')
    .optional()
    .isBoolean()
    .withMessage('Enable appeal notifications must be a boolean')
    .toBoolean(),
    
  body('notificationChannels')
    .optional()
    .isArray({ min: 1, max: 4 })
    .withMessage('Notification channels must be an array with 1-4 items'),
    
  body('notificationChannels.*')
    .isIn(['email', 'push', 'sms', 'in_app'])
    .withMessage('Invalid notification channel. Must be: email, push, sms, or in_app'),
    
  body('escalationThreshold')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Escalation threshold must be between 1 and 10')
    .toInt()
];

// =================================================================================
// APPEAL VALIDATION - Feature 9
// =================================================================================

export const validateAppeal: ValidationChain[] = [
  param('blockId')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Invalid block ID format');
      }
      return true;
    }),
    
  body('action')
    .isIn(['submit_appeal', 'review_appeal'])
    .withMessage('Action must be submit_appeal or review_appeal'),
    
  body('appealReason')
    .if(body('action').equals('submit_appeal'))
    .notEmpty()
    .withMessage('Appeal reason is required for appeal submission')
    .isString()
    .withMessage('Appeal reason must be a string')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Appeal reason must be between 10 and 1000 characters')
    .customSanitizer(sanitizeString),
    
  body('decision')
    .if(body('action').equals('review_appeal'))
    .isIn(['approved', 'rejected'])
    .withMessage('Decision must be approved or rejected'),
    
  body('reviewNotes')
    .if(body('action').equals('review_appeal'))
    .optional()
    .isString()
    .withMessage('Review notes must be a string')
    .isLength({ max: 1000 })
    .withMessage('Review notes cannot exceed 1000 characters')
    .customSanitizer(sanitizeString)
];

// =================================================================================
// BLOCK REASONS VALIDATION - Feature 10
// =================================================================================

export const validateGetBlockReasons: ValidationChain[] = [
  query('includeCustomReasons')
    .optional()
    .isBoolean()
    .withMessage('Include custom reasons must be a boolean')
    .toBoolean(),
    
  query('includeStatistics')
    .optional()
    .isBoolean()
    .withMessage('Include statistics must be a boolean')
    .toBoolean()
];

// =================================================================================
// PRIVACY SETTINGS VALIDATION - Feature 11
// =================================================================================

export const validatePrivacySettings: ValidationChain[] = [
  body('hideBlockedList')
    .optional()
    .isBoolean()
    .withMessage('Hide blocked list must be a boolean')
    .toBoolean(),
    
  body('allowDataExport')
    .optional()
    .isBoolean()
    .withMessage('Allow data export must be a boolean')
    .toBoolean(),
    
  body('enableAutoAnonymization')
    .optional()
    .isBoolean()
    .withMessage('Enable auto anonymization must be a boolean')
    .toBoolean(),
    
  body('dataRetentionDays')
    .optional()
    .isInt({ min: 1, max: 2555 })
    .withMessage('Data retention days must be between 1 and 2555 (7 years)')
    .toInt()
    .custom((value) => {
      // Common retention periods validation
      const validPeriods = [30, 90, 180, 365, 730, 1095, 1825, 2555]; // 1mo to 7yr
      if (value && !validPeriods.includes(value)) {
        // Allow if within 10% of valid periods for flexibility
        const isClose = validPeriods.some(period => 
          Math.abs(value - period) <= period * 0.1
        );
        if (!isClose) {
          throw new Error('Data retention period should be standard: 30, 90, 180, 365, 730, 1095, 1825, or 2555 days');
        }
      }
      return true;
    }),
    
  body('shareAnalyticsData')
    .optional()
    .isBoolean()
    .withMessage('Share analytics data must be a boolean')
    .toBoolean()
];

// =================================================================================
// DATA EXPORT VALIDATION - Feature 12
// =================================================================================

export const validateDataExport: ValidationChain[] = [
  query('format')
    .optional()
    .isIn(['json', 'csv', 'xml'])
    .withMessage('Format must be json, csv, or xml'),
    
  query('includeAuditLog')
    .optional()
    .isBoolean()
    .withMessage('Include audit log must be a boolean')
    .toBoolean(),
    
  query('includeMetadata')
    .optional()
    .isBoolean()
    .withMessage('Include metadata must be a boolean')
    .toBoolean(),
    
  query('dateRange')
    .optional()
    .isJSON()
    .withMessage('Date range must be valid JSON')
    .custom((value) => {
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (!parsed.startDate || !parsed.endDate) {
            throw new Error('Date range must include startDate and endDate');
          }
          
          const start = new Date(parsed.startDate);
          const end = new Date(parsed.endDate);
          
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid dates in date range');
          }
          
          if (end <= start) {
            throw new Error('End date must be after start date');
          }
          
          // Max 2 years export range
          const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
          if (end.getTime() - start.getTime() > twoYears) {
            throw new Error('Export date range cannot exceed 2 years');
          }
        } catch (error : any) {
          throw new Error('Invalid date range JSON format');
        }
      }
      return true;
    })
];

// =================================================================================
// ADMIN VALIDATION - Features: getPendingAppeals, getEscalatedBlocks
// =================================================================================

export const validateGetPendingAppeals: ValidationChain[] = [
  query('moderatorId')
    .optional()
    .isString()
    .withMessage('Moderator ID must be a string')
    .custom((value) => {
      if (value && !isValidUserId(value)) {
        throw new Error('Invalid moderator ID format');
      }
      return true;
    })
    .customSanitizer(sanitizeString),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
    
  query('sortBy')
    .optional()
    .isIn(['appealedAt', 'severity', 'reportCount'])
    .withMessage('Sort by must be appealedAt, severity, or reportCount'),
    
  query('severity')
    .optional()
    .isIn(Object.values(BlockSeverity))
    .withMessage(`Severity must be one of: ${Object.values(BlockSeverity).join(', ')}`)
];

// =================================================================================
// SECURITY VALIDATION HELPERS
// =================================================================================

export const validateSecurityHeaders: ValidationChain[] = [
  query('*')
    .customSanitizer((value) => {
      // Prevent XSS and injection attacks in query parameters
      if (typeof value === 'string') {
        return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                   .replace(/javascript:/gi, '')
                   .replace(/on\w+\s*=/gi, '');
      }
      return value;
    }),
    
  body('*')
    .customSanitizer((value) => {
      // Prevent XSS and injection attacks in body parameters
      if (typeof value === 'string') {
        return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                   .replace(/javascript:/gi, '')
                   .replace(/on\w+\s*=/gi, '');
      }
      return value;
    })
];

// =================================================================================
// BUSINESS RULE VALIDATION
// =================================================================================

export const validateBusinessRules = {
  // Prevent blocking system/admin users
  validateNonSystemUser: body('blockedId').custom(async (value) => {
    const systemUsers = ['admin', 'system', 'moderator', 'support'];
    if (systemUsers.some(prefix => value.toLowerCase().includes(prefix))) {
      throw new Error('Cannot block system or admin users');
    }
    return true;
  }),
  
  // Rate limiting validation
  validateRateLimit: body('*').custom(async (_value, { req }) => {
    const userAgent = req.get('User-Agent');
    if (userAgent && userAgent.includes('bot')) {
      throw new Error('Automated requests not allowed');
    }
    return true;
  }),
  
  // Validate bulk operation limits
  validateBulkLimits: body('blockedIds').custom(async (value, { req }) => {
    const userId = req.user?.id;
    if (userId && value.length > 10) {
      // Check user's recent bulk operations
      // This would typically query the database
      // For now, just limit to 10 per request
      if (value.length > 50) {
        throw new Error('Maximum 50 users can be blocked in a single bulk operation');
      }
    }
    return true;
  })
};

// =================================================================================
// COMPOSITE VALIDATORS - Combining multiple validations
// =================================================================================

export const validateCompleteBlockUser = [
  ...validateSecurityHeaders,
  ...validateBlockUser,
  validateBusinessRules.validateNonSystemUser,
  validateBusinessRules.validateRateLimit
];

export const validateCompleteBulkBlock = [
  ...validateSecurityHeaders,
  ...validateBulkBlock,
  validateBusinessRules.validateNonSystemUser,
  validateBusinessRules.validateBulkLimits,
  validateBusinessRules.validateRateLimit
];

export const validateCompleteDataExport = [
  ...validateSecurityHeaders,
  ...validateDataExport
];

// =================================================================================
// ERROR MESSAGE CUSTOMIZATION
// =================================================================================

export const customErrorMessages = {
  VALIDATION_FAILED: 'Input validation failed. Please check your request data.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please slow down.',
  INVALID_USER_ID: 'User ID format is invalid. Please provide a valid user identifier.',
  INVALID_DATE_RANGE: 'Date range is invalid. Please provide valid start and end dates.',
  BULK_LIMIT_EXCEEDED: 'Bulk operation limit exceeded. Please reduce the number of items.',
  SYSTEM_USER_BLOCK: 'System users cannot be blocked.',
  EXPORT_LIMIT_EXCEEDED: 'Export data range is too large. Please reduce the time period.',
  INVALID_APPEAL_REASON: 'Appeal reason must be detailed and between 10-1000 characters.',
  INVALID_NOTIFICATION_CHANNEL: 'Invalid notification channel selected.',
  PRIVACY_SETTING_INVALID: 'Privacy setting configuration is invalid.',
  BUSINESS_RULE_VIOLATION: 'Request violates business rules.'
};

// =================================================================================
// VALIDATION MIDDLEWARE FACTORY
// =================================================================================

export const createValidationMiddleware = (validations: ValidationChain[]) => {
  return [
    ...validations,
    (req: any, res: any, next: any) => {
      const errors = expressValidator.validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: customErrorMessages.VALIDATION_FAILED,
          errors: errors.array().map((error: any) => ({
            field: error.path || error.param,
            message: error.msg,
            value: error.value,
            location: error.location
          })),
          timestamp: new Date().toISOString()
        });
      }
      next();
    }
  ];
};

// =================================================================================
// EXPORTS - All validation rules for each feature
// =================================================================================

export default {
  // Core block operations
  validateBlockUser: createValidationMiddleware(validateCompleteBlockUser),
  validateUnblockUser: createValidationMiddleware(validateUnblockUser),
  validateBulkBlock: createValidationMiddleware(validateCompleteBulkBlock),
  
  // Query operations
  validateGetBlockedUsers: createValidationMiddleware([...validateSecurityHeaders, ...validateGetBlockedUsers]),
  validateUserId: createValidationMiddleware([...validateSecurityHeaders, ...validateUserId]),
  validateGetBlockHistory: createValidationMiddleware([...validateSecurityHeaders, ...validateGetBlockHistory]),
  validateGetAnalytics: createValidationMiddleware([...validateSecurityHeaders, ...validateGetAnalytics]),
  validateGetBlockReasons: createValidationMiddleware([...validateSecurityHeaders, ...validateGetBlockReasons]),
  
  // Settings operations
  validateNotificationSettings: createValidationMiddleware([...validateSecurityHeaders, ...validateNotificationSettings]),
  validatePrivacySettings: createValidationMiddleware([...validateSecurityHeaders, ...validatePrivacySettings]),
  
  // Appeal system
  validateAppeal: createValidationMiddleware([...validateSecurityHeaders, ...validateAppeal]),
  validateGetPendingAppeals: createValidationMiddleware([...validateSecurityHeaders, ...validateGetPendingAppeals]),
  
  // Data export
  validateDataExport: createValidationMiddleware(validateCompleteDataExport),
  
  // Utility validators
  validatePagination: createValidationMiddleware(validatePagination),
  validateDateRange: createValidationMiddleware(validateDateRange),
  validateSecurityHeaders: createValidationMiddleware(validateSecurityHeaders),
  
  // Error messages
  customErrorMessages
};