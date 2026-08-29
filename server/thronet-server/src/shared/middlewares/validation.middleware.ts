import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import Joi from 'joi';
import ResponseHandler from '../utils/mentorship/responseHandler';
import { logger, LoggerUtil } from '@/shared/logger.util';
import { AuditLog } from '@/shared/models/index.models';
import ResponseUtil from '@/shared/response.util';
import ValidationUtil from '@/shared/validation.util';
import ValidatorUtil from '../utils/validator.util';
import { Schema } from 'joi';
import { ValidationError } from '../errors/app.error';


/**
 * Validate request data against Joi schema
 * @param schema - Joi validation schema
 * @param property - Request property to validate ('body', 'params', 'query')
 */
export const validation = (schema: Schema, property: string = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const dataToValidate = req[property as keyof Request];

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true, // Remove unknown fields
      convert: true, // Convert values to correct types
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      logger.warn('Validation failed', {
        property,
        errors,
        path: req.path
      });

      throw new ValidationError('Validation failed', errors);
    }

    // Replace request property with validated value
    (req as any)[property] = value;

    next();
  };
};

/**
 * Middleware to validate request using express-validator
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    // Format errors
    const formattedErrors = errors.array().map((error: any) => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));

    logger.warn('Validation failed:', {
      url: req.url,
      method: req.method,
      errors: formattedErrors,
    });

    ResponseHandler.badRequest(res, 'Validation failed', formattedErrors);
    return;
  };
};

/**
 * ✅ NEW: Joi validation middleware
 */
export const validateJoi = (schema: Joi.ObjectSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // ✅ FIX: req.body undefined/null hone par empty object use karo
      const bodyToValidate = req.body && Object.keys(req.body).length > 0
        ? req.body
        : {};

      // ✅ DEBUG: temporarily log karo
      console.log('validateJoi - req.body:', bodyToValidate);
      console.log('validateJoi - req.files:', req.files);

      const { error, value } = schema.validate(bodyToValidate, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
        allowUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join('.') || 'root',
          message: detail.message,
        }));

        logger.warn('Joi validation failed:', errors);
        ResponseHandler.badRequest(res, 'Validation failed', errors);
        return;
      }

      req.body = value;
      next();
    } catch (err: any) {
      logger.error('Joi validation error:', err);
      ResponseHandler.serverError(res, 'Validation error');
    }
  };
};

/**
 * ✅ NEW: Validate query parameters with Joi
 */
// export const validateQueryJoi = (schema: Joi.ObjectSchema) => {
//   return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
//     try {
//       const { error, value } = schema.validate(req.query, {
//         abortEarly: false,
//         stripUnknown: true,
//       });

//       if (error) {
//         const errors = error.details.map((detail) => ({
//           field: detail.path.join('.'),
//           message: detail.message,
//         }));
//         console.log('validation error in query params:', error);
//         logger.warn('Query validation failed:', errors);
//         ResponseHandler.badRequest(res, 'Query validation failed', errors);
//         return;
//       }

//       req.query = value;
//       next();
//     } catch (err: any) {
//       logger.error('Query validation error:', err);
//       ResponseHandler.serverError(res, 'Validation error');
//     }
//   };
// };

export const validateQueryJoi = (schema: Joi.ObjectSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // ADD YE LINE
      console.log('=== QUERY DEBUG ===', req.query);
      console.log('=== SCHEMA TYPE ===', typeof schema, schema);

      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
        allowUnknown: false,
      });

      // ADD YE LINE
      console.log('=== VALIDATION RESULT ===', { error: error?.message, value });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        console.log('validation error in query params:', errors);
        ResponseHandler.badRequest(res, 'Query validation failed', errors);
        return;
      }

      Object.assign(req.query, value);
      next();
    } catch (err: any) {
      // ADD YE LINE
      console.log('=== CATCH ERROR ===', err);
      logger.error('Query validation error:', err);
      ResponseHandler.serverError(res, 'Validation error');
    }
  };
};

/**
 * ✅ NEW: Validate path parameters with Joi
 */
export const validateParamsJoi = (schema: Joi.ObjectSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));

        logger.warn('Params validation failed:', errors);
        ResponseHandler.badRequest(res, 'Parameter validation failed', errors);
        return;
      }

      req.params = value;
      next();
    } catch (err: any) {
      logger.error('Params validation error:', err);
      ResponseHandler.serverError(res, 'Validation error');
    }
  };
};

/**
 * Validate MongoDB ObjectId
 */
export const validateObjectId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { id } = req.params;

  if (!id) {
    ResponseHandler.badRequest(res, 'ID is required');
    return;
  }

  const objectIdPattern = /^[0-9a-fA-F]{24}$/;

  if (!objectIdPattern.test(id)) {
    ResponseHandler.badRequest(res, 'Invalid ID format');
    return;
  }

  next();
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { page, limit } = req.query;

  if (page) {
    const pageNum = parseInt(page as string, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      ResponseHandler.badRequest(res, 'Page must be a positive integer');
      return;
    }
    req.query.page = pageNum.toString();
  } else {
    req.query.page = '1';
  }

  if (limit) {
    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      ResponseHandler.badRequest(res, 'Limit must be between 1 and 100');
      return;
    }
    req.query.limit = limitNum.toString();
  } else {
    req.query.limit = '10';
  }

  next();
};

/**
 * Sanitize query parameters
 */
export const sanitizeQuery = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (
        req.query[key] === '' ||
        req.query[key] === 'undefined' ||
        req.query[key] === 'null'
      ) {
        delete req.query[key];
      }
    });
  }

  next();
};

/**
 * Validate sort parameters
 */
export const validateSort = (allowedFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { sort, order } = req.query;

    if (sort && !allowedFields.includes(sort as string)) {
      ResponseHandler.badRequest(
        res,
        `Sort field must be one of: ${allowedFields.join(', ')}`
      );
      return;
    }

    if (order && !['asc', 'desc'].includes(order as string)) {
      ResponseHandler.badRequest(res, 'Order must be "asc" or "desc"');
      return;
    }

    next();
  };
};

/**
 * Validate date range
 */
export const validateDateRange = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { startDate, endDate } = req.query;

  if (startDate && isNaN(Date.parse(startDate as string))) {
    ResponseHandler.badRequest(res, 'Invalid start date format');
    return;
  }

  if (endDate && isNaN(Date.parse(endDate as string))) {
    ResponseHandler.badRequest(res, 'Invalid end date format');
    return;
  }

  if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (start > end) {
      ResponseHandler.badRequest(res, 'Start date must be before end date');
      return;
    }
  }

  next();
};

/**
 * Validate file upload
 */
export const validateFileUpload = (
  allowedTypes: string[],
  maxSize: number
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file) {
      ResponseHandler.badRequest(res, 'No file uploaded');
      return;
    }

    if (!allowedTypes.includes(req.file.mimetype)) {
      ResponseHandler.badRequest(
        res,
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
      );
      return;
    }

    if (req.file.size > maxSize) {
      ResponseHandler.badRequest(
        res,
        `File size exceeds ${maxSize / (1024 * 1024)}MB limit`
      );
      return;
    }

    next();
  };
};

/**
 * Validate body is not empty
 */
export const validateBodyNotEmpty = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.body || Object.keys(req.body).length === 0) {
    ResponseHandler.badRequest(res, 'Request body cannot be empty');
    return;
  }
  next();
};

/**
 * Validate required fields in body
 */
export const validateRequiredFields = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingFields = fields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      ResponseHandler.badRequest(
        res,
        `Missing required fields: ${missingFields.join(', ')}`
      );
      return;
    }

    next();
  };
};

/**
 * Validate required params
 */
export const validateRequiredParams = (params: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingParams = params.filter(param => !req.params[param]);

    if (missingParams.length > 0) {
      ResponseHandler.badRequest(
        res,
        `Missing required parameters: ${missingParams.join(', ')}`
      );
      return;
    }

    next();
  };
};

/**
 * Validate required query params
 */
export const validateRequiredQuery = (queries: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingQuery = queries.filter(query => !req.query[query]);

    if (missingQuery.length > 0) {
      ResponseHandler.badRequest(
        res,
        `Missing required query parameters: ${missingQuery.join(', ')}`
      );
      return;
    }

    next();
  };
};



// ../src/middleware/validation.middleware.ts
/**
 * validation.middleware.ts
 * Professional-level input validation middleware for auth-service-phase3-kafka
 * Validates request inputs using validator.util.ts
 * Compliant with NIST 800-63B and OWASP guidelines
 */



interface ValidationSchema {
  [key: string]: {
    type: string;
    required: boolean;
    format?: string;
    minLength?: number;
    maxLength?: number;
    transform?: (value: any) => any;
    validate: (value: any) => boolean;
    error: string;
  };
}

const validationMiddleware = (schema: any, target: string = 'body') => async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).session?.userId || null;
  const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

  try {
    const data = (req as any)[target] || {};
    const validation = await ValidatorUtil.validate(data, schema, userId, ipAddress);

    if (!validation.isValid) {
      // Safe audit with valid enum values
      try {
        await AuditLog.logAction({
          userId: String(null),
          action: 'LOGIN_FAILED',     // Valid in schema
          status: 'FAILURE',          // Valid: SUCCESS | FAILURE | WARNING
          severity: 'MEDIUM',
          ipAddress,
          userAgent: req.headers['user-agent'] || 'unknown',
          metadata: new Map([
            ['errors', JSON.stringify(validation.errors)],
            ['reason', 'validation_failed'],
            ['path', req.path],
            ['correlationId', correlationId]
          ])
        });
      } catch (auditError: any) {
        LoggerUtil.error('Audit log failed in middleware', { error: auditError.message });
      }

      // Use your existing ResponseUtil method correctly
      return ResponseUtil.validationError(res, validation.errors, 'Validation failed');
    }

    LoggerUtil.info('Input validation successful', { userId, ipAddress, path: req.path, correlationId });
    next();

  } catch (error: any) {
    LoggerUtil.error('Validation middleware error', { error: error.message, userId, ipAddress, correlationId });

    try {
      await AuditLog.logAction({
        userId: String(null),
        action: 'LOGIN_FAILED',
        status: 'FAILURE',
        severity: 'HIGH',
        ipAddress,
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: new Map([
          ['error', error.message],
          ['reason', 'validation_exception'],
          ['path', req.path],
          ['correlationId', correlationId]
        ])
      });
    } catch (auditError: any) {
      LoggerUtil.error('Failed to log middleware exception', { error: auditError.message });
    }

    return ResponseUtil.error(res, 'Internal validation error', correlationId);
  }
};

// 📌 SCHEMAS

/**
 * Email Verification Token Schema (Joi)
 */
const emailVerificationTokenSchemaJoi = Joi.object({
  token: Joi.string()
    .length(64)
    .pattern(/^[0-9a-fA-F]{64}$/)
    .required()
    .messages({
      'string.length': 'Token must be exactly 64 characters',
      'string.pattern.base': 'Token must be hexadecimal',
      'any.required': 'Verification token is required',
    }),
});

/**
 * Email Verification OTP Schema (Joi)
 */
const emailVerificationOTPSchemaJoi = Joi.object({
  otp: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.length': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must contain only numbers',
      'any.required': 'OTP is required',
    }),
});

/**
 * Resend Email Verification Schema (Joi)
 */
const resendEmailVerificationSchemaJoi = Joi.object({
  type: Joi.string()
    .valid('link', 'otp')
    .default('link')
    .messages({
      'any.only': 'Type must be either "link" or "otp"',
    }),
});

const loginSchema: ValidationSchema = {
  email: {
    type: 'string',
    required: true,
    format: 'email',
    minLength: 5,
    maxLength: 255,
    transform: (value: string) => value.toLowerCase().trim(),
    validate: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    error: 'Valid email is required',
  },
  password: {
    type: 'string',
    required: true,
    minLength: 8,
    maxLength: 128,
    validate: (value: string) =>
      /[A-Z]/.test(value) &&
      /[a-z]/.test(value) &&
      /[0-9]/.test(value) &&
      /[!@#$%^&*()_+\-=\[\]{}|;':"\\,.<>?]/.test(value),
    error: 'Password must be 8-128 characters with uppercase, lowercase, number, and special character',
  },
};

const oauthLoginSchema: ValidationSchema = {
  provider: {
    type: 'string',
    required: true,
    validate: (value: string) => ['google', 'facebook', 'github'].includes(value.toLowerCase()),
    transform: (value: string) => value.toLowerCase().trim(),
    error: 'Provider must be one of: google, facebook, github',
  },
  accessToken: {
    type: 'string',
    required: true,
    minLength: 10,
    maxLength: 4096,
    validate: (value: string) => /^[A-Za-z0-9\-_=+/]+\.?[A-Za-z0-9\-_=+/]*\.?[A-Za-z0-9\-_=+/]*$/.test(value),
    error: 'Valid access token is required',
  },
  redirectUri: {
    type: 'string',
    required: true,
    format: 'uri',
    minLength: 1,
    maxLength: 2048,
    validate: (value: string) => {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
      } catch {
        return false;
      }
    },
    error: 'Valid redirect URI is required',
  },
};

const tokenRefreshSchema: ValidationSchema = {
  refreshToken: {
    type: 'string',
    required: true,
    format: 'uuid',
    validate: (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    error: 'Valid UUID refresh token is required',
  },
  ipAddress: {
    type: 'string',
    required: false,
    format: 'ip',
    validate: (value: string) => {
      const ipv4 = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){2}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
      const ipv6 = /([a-fA-F\d]{1,4}:){7}[a-fA-F\d]{1,4}/;
      return ipv4.test(value) || ipv6.test(value);
    },
    error: 'Valid IP address is required',
  },
};

const tokenRevokeSchema: ValidationSchema = {
  token: {
    type: 'string',
    required: true,
    minLength: 10,
    maxLength: 4096,
    validate: (value: string) => /^[A-Za-z0-9\-_=+/]+\.?[A-Za-z0-9\-_=+/]*\.?[A-Za-z0-9\-_=+/]*$/.test(value),
    error: 'Valid token is required',
  },
};

const userUpdateSchema: ValidationSchema = {
  username: {
    type: 'string',
    required: false,
    minLength: 3,
    maxLength: 50,
    validate: (v: string) => /^[a-zA-Z0-9_]+$/.test(v),
    error: 'Username must be 3-50 characters and alphanumeric',
  },
  bio: {
    type: 'string',
    required: false,
    maxLength: 200,
    validate: () => true,
    error: 'Bio must be under 200 characters',
  },
  avatarUrl: {
    type: 'string',
    required: false,
    validate: (v: string) => v.startsWith('http://') || v.startsWith('https://'),
    error: 'Avatar URL must be a valid link',
  },
};

const userDeleteSchema: ValidationSchema = {
  userId: {
    type: 'string',
    required: true,
    format: 'uuid',
    validate: (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    error: 'Valid user ID (UUID) is required',
  },
};

// ✅ NEW: Admin Action Schema
const adminActionSchema: ValidationSchema = {
  adminId: {
    type: 'string',
    required: true,
    format: 'uuid',
    validate: (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    error: 'Valid admin ID is required',
  },
  targetUserId: {
    type: 'string',
    required: true,
    format: 'uuid',
    validate: (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    error: 'Valid target user ID is required',
  },
  actionType: {
    type: 'string',
    required: true,
    validate: (value: string) => ['ban', 'promote', 'demote', 'warn'].includes(value.toLowerCase()),
    transform: (value: string) => value.toLowerCase().trim(),
    error: 'Action type must be one of: ban, promote, demote, warn',
  },
  reason: {
    type: 'string',
    required: true,
    minLength: 5,
    maxLength: 500,
    validate: () => true,
    error: 'Reason must be 5–500 characters long',
  },
};

// ✅ NEW: Analytics Query Schema
const analyticsQuerySchema: ValidationSchema = {
  startDate: {
    type: 'string',
    required: false,
    format: 'date',
    validate: (value: string) => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime()) && date <= new Date();
    },
    transform: (value: string) => value ? new Date(value).toISOString() : undefined,
    error: 'Start date must be a valid date in the past',
  },
  endDate: {
    type: 'string',
    required: false,
    format: 'date',
    validate: (value: string) => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime()) && date <= new Date();
    },
    transform: (value: string) => value ? new Date(value).toISOString() : undefined,
    error: 'End date must be a valid date in the past',
  },
};

// 📦 EXPORTS
export const validateLogin = validationMiddleware(ValidationUtil.loginSchema);


/**
 * ✅ FIXED: validateLogout Middleware
 * Validates logout request - checks for active session and valid user
 */

export const validateLogout = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).user?.userId || null; // ✅ From AuthMiddleware
  const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

  try {
    // ✅ Check if user is authenticated (from AuthMiddleware)
    if (!(req as any).user || !(req as any).user.userId) {
      LoggerUtil.warn('Logout validation failed - No authenticated user', {
        ipAddress,
        path: req.path,
        correlationId
      });

      try {
        await AuditLog.logAction({
          userId: String(null),
          action: 'LOGOUT_FAILED',
          status: 'FAILURE',
          severity: 'MEDIUM',
          ipAddress,
          userAgent: req.headers['user-agent'] || 'unknown',
          metadata: new Map([
            ['error', 'No authenticated user'],
            ['reason', 'no_authenticated_user'],
            ['path', req.path],
            ['correlationId', correlationId]
          ])
        });
      } catch (auditError: any) {
        LoggerUtil.error('Audit log failed', { error: auditError.message });
      }

      // ✅ FIXED: Direct ResponseUtil call (no res.status().json())
      return ResponseUtil.unauthorized(res, 'Authentication required');
    }

    LoggerUtil.info('Logout validation successful', {
      userId,
      ipAddress,
      path: req.path,
      correlationId
    });

    next();
  } catch (error: any) {
    LoggerUtil.error('Logout validation failed', {
      error: error.message,
      stack: error.stack,
      userId,
      ipAddress,
      correlationId
    });

    try {
      await AuditLog.logAction({
        userId: String(null),
        action: 'LOGOUT_FAILED',
        status: 'FAILURE',
        severity: 'HIGH',
        ipAddress,
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: new Map([
          ['error', error.message],
          ['reason', 'logout_validation_exception'],
          ['path', req.path],
          ['correlationId', correlationId]
        ])
      });
    } catch (auditError: any) {
      LoggerUtil.error('Audit log failed', { error: auditError.message });
    }

    // ✅ FIXED: Direct ResponseUtil call (no res.status().json())
    return ResponseUtil.internalError(res, 'Internal server error');
  }
};


export const validateOAuthLogin = validationMiddleware(oauthLoginSchema, 'body');
export const validateTokenRefresh = validationMiddleware(tokenRefreshSchema, 'body');
export const validateTokenRevoke = validationMiddleware(tokenRevokeSchema, 'body');
export const validateUserUpdate = validationMiddleware(userUpdateSchema, 'body');
export const validateUserDelete = validationMiddleware(userDeleteSchema, 'body');
export const validateAdminAction = validationMiddleware(adminActionSchema, 'body');
export const validateAnalyticsQuery = validationMiddleware(analyticsQuerySchema, 'query');



// ==================== EMAIL VERIFICATION MIDDLEWARES ====================

/**
 * ✅ Validate Email Verification Token (Query Param)
 * Used for: GET /api/v1/auth/email/verify?token=xxx
 */
export const validateEmailVerificationToken = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

  try {
    const data = req.query || {};

    // ✅ Use your existing ValidatorUtil.validate() method
    const validation = await ValidatorUtil.validate(
      data,
      emailVerificationTokenSchemaJoi,
      null,
      ipAddress
    );

    if (!validation.isValid) {
      LoggerUtil.warn('Email verification token validation failed', {
        errors: validation.errors,
        token: (req.query.token as string)?.substring(0, 16),
        ipAddress,
        path: req.path,
        correlationId,
      });

      try {
        await AuditLog.logAction({
          userId: String(null),
          action: 'LOGIN_FAILED',
          status: 'FAILURE',
          severity: 'MEDIUM',
          ipAddress,
          userAgent: req.headers['user-agent'] || 'unknown',
          metadata: new Map([
            ['errors', JSON.stringify(validation.errors)],
            ['reason', 'invalid_verification_token'],
            ['path', req.path],
            ['correlationId', correlationId]
          ])
        });
      } catch (auditError: any) {
        LoggerUtil.error('Audit log failed', { error: auditError.message });
      }

      return ResponseUtil.validationError(res, validation.errors, 'Invalid verification token');
    }

    LoggerUtil.info('Email verification token validation successful', {
      ipAddress,
      path: req.path,
      correlationId,
    });

    (req as any).validatedQuery = validation.data;
    next();
  } catch (error: any) {
    LoggerUtil.error('Email verification token validation error', {
      error: error.message,
      stack: error.stack,
      ipAddress,
      correlationId,
    });

    try {
      await AuditLog.logAction({
        userId: String(null),
        action: 'LOGIN_FAILED',
        status: 'FAILURE',
        severity: 'HIGH',
        ipAddress,
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: new Map([
          ['error', error.message],
          ['path', req.path],
          ['correlationId', correlationId],
          ['reason', 'token_validation_exception'],
        ]),
      });
    } catch (auditError: any) {
      LoggerUtil.error('Failed to log token validation exception', { error: auditError.message });
    }

    return ResponseUtil.internalError(res, 'Token validation failed');
  }
};

/**
 * ✅ Validate Email Verification OTP (Request Body)
 * Used for: POST /api/v1/auth/email/verify-otp
 */
export const validateEmailVerificationOTP = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).user?.userId || null;
  const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

  try {
    // Check authentication first
    if (!(req as any).user || !(req as any).user.userId) {
      LoggerUtil.warn('OTP validation failed - No authenticated user', {
        ipAddress,
        path: req.path,
        correlationId,
      });

      return ResponseUtil.unauthorized(res, 'Authentication required');
    }

    const data = req.body || {};

    // ✅ Use your existing ValidatorUtil.validate() method
    const validation = await ValidatorUtil.validate(
      data,
      emailVerificationOTPSchemaJoi,
      userId,
      ipAddress
    );

    if (!validation.isValid) {
      LoggerUtil.warn('Email OTP validation failed', {
        errors: validation.errors,
        userId,
        ipAddress,
        path: req.path,
        correlationId,
      });

      try {
        await AuditLog.logAction({
          userId: String(null),
          action: 'LOGIN_FAILED',
          status: 'FAILURE',
          severity: 'MEDIUM',
          ipAddress,
          userAgent: req.headers['user-agent'] || 'unknown',
          metadata: new Map([
            ['errors', JSON.stringify(validation.errors)],
            ['reason', 'invalid_otp_format'],
            ['path', req.path],
            ['correlationId', correlationId]
          ])
        });
      } catch (auditError: any) {
        LoggerUtil.error('Audit log failed', { error: auditError.message });
      }

      return ResponseUtil.validationError(res, validation.errors, 'Invalid OTP format');
    }

    LoggerUtil.info('Email OTP validation successful', {
      userId,
      ipAddress,
      path: req.path,
      correlationId,
    });

    (req as any).validatedBody = validation.data;
    next();
  } catch (error: any) {
    LoggerUtil.error('Email OTP validation error', {
      error: error.message,
      stack: error.stack,
      userId,
      ipAddress,
      correlationId,
    });

    try {
      await AuditLog.logAction({
        userId: String(null),
        action: 'LOGIN_FAILED',
        status: 'FAILURE',
        severity: 'HIGH',
        ipAddress,
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: new Map([
          ['error', error.message],
          ['reason', 'otp_validation_exception'],
          ['path', req.path],
          ['correlationId', correlationId]
        ])
      });
    } catch (auditError: any) {
      LoggerUtil.error('Failed to log OTP validation exception', { error: auditError.message });
    }

    return ResponseUtil.internalError(res, 'OTP validation failed');
  }
};

/**
 * ✅ Validate Resend Email Verification (Request Body)
 * Used for: POST /api/v1/auth/email/resend
 */
export const validateResendEmailVerification = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).user?.userId || null;
  const correlationId = (req as any).correlationId || req.headers['x-correlation-id'] || 'unknown';

  try {
    // Check authentication first
    if (!(req as any).user || !(req as any).user.userId) {
      LoggerUtil.warn('Resend validation failed - No authenticated user', {
        ipAddress,
        path: req.path,
        correlationId,
      });

      return ResponseUtil.unauthorized(res, 'Authentication required');
    }

    const data = req.body || {};

    // ✅ Use your existing ValidatorUtil.validate() method
    const validation = await ValidatorUtil.validate(
      data,
      resendEmailVerificationSchemaJoi,
      userId,
      ipAddress
    );

    if (!validation.isValid) {
      LoggerUtil.warn('Resend email verification validation failed', {
        errors: validation.errors,
        userId,
        ipAddress,
        path: req.path,
        correlationId,
      });

      try {
        await AuditLog.logAction({
          userId: String(null),
          action: 'LOGIN_FAILED',
          status: 'FAILURE',
          severity: 'MEDIUM',
          ipAddress,
          userAgent: req.headers['user-agent'] || 'unknown',
          metadata: new Map([
            ['errors', JSON.stringify(validation.errors)],
            ['reason', 'invalid_verification_token'],
            ['path', req.path],
            ['correlationId', correlationId]
          ])
        });
      } catch (auditError: any) {
        LoggerUtil.error('Audit log failed', { error: auditError.message });
      }

      return ResponseUtil.validationError(res, validation.errors, 'Invalid resend request');
    }

    LoggerUtil.info('Resend email verification validation successful', {
      userId,
      ipAddress,
      path: req.path,
      type: validation.data.type || 'link',
      correlationId,
    });

    (req as any).validatedBody = validation.data;
    next();
  } catch (error: any) {
    LoggerUtil.error('Resend email verification validation error', {
      error: error.message,
      stack: error.stack,
      userId,
      ipAddress,
      correlationId,
    });

    try {
      await AuditLog.logAction({
        userId: String(null),
        action: 'LOGIN_FAILED',
        status: 'FAILURE',
        severity: 'HIGH',
        ipAddress,
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: new Map([
          ['error', error.message],
          ['reason', 'token_validation_exception'],
          ['path', req.path],
          ['correlationId', correlationId]
        ])
      });
    } catch (auditError: any) {
      LoggerUtil.error('Failed to log resend validation exception', { error: auditError.message });
    }

    return ResponseUtil.internalError(res, 'Resend validation failed');
  }
};

// ==================== EXPORT ALIASES ====================
// These aliases match the import names used in routes

/**
 * Alias for validateEmailVerificationOTP, validateResendEmailVerification
 * Used in routes as: validateOTPMiddleware, validateResendMiddleware
 */
export const validateOTPMiddleware = validateEmailVerificationOTP;
export const validateResendMiddleware = validateResendEmailVerification;


export default {
  validationMiddleware,


  validate,
  validateJoi, // ✅ NEW
  validateQueryJoi, // ✅ NEW
  validateParamsJoi, // ✅ NEW
  validateObjectId,
  validatePagination,
  sanitizeQuery,
  validateSort,
  validateDateRange,
  validateFileUpload,
  validateBodyNotEmpty,
  validateRequiredFields,
  validateRequiredParams,
  validateRequiredQuery,

};
