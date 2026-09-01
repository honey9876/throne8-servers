// src/validators/followValidator.ts

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { Types } from 'mongoose';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import { LogCategory, logger } from '@/shared/logger.util';
import constants from '@/shared/constants.util';

const ERROR_CODES = constants.ERROR_CODES;

/**
 * FOLLOW VALIDATOR - INPUT VALIDATION MIDDLEWARE
 * 
 * Features: 15+ validation functions
 * - Parameter validation (userId, followingId)
 * - Request body validation
 * - Query parameter validation  
 * - Custom ObjectId validation
 * - Array validation for bulk operations
 * - Sanitization and transformation
 * - Detailed error messages
 * 
 * Validations:
 * - ObjectId format validation
 * - Required field checks
 * - Array length limits (bulk operations)
 * - Pagination parameter validation
 * - Status enum validation
 * - Self-operation prevention
 * - Input sanitization
 */

// Custom ObjectId validation
const objectIdValidator = Joi.string().custom((value, helpers) => {
  if (!Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'ObjectId validation').messages({
  'any.invalid': 'Must be a valid ObjectId',
});

/**
 * VALIDATION SCHEMAS
 */

// Follow user request validation
const followUserSchema = Joi.object({
  followingId: objectIdValidator.required().messages({
    'any.required': 'Following user ID is required',
  }),
  notificationEnabled: Joi.boolean().optional().default(true),
}).strict();

// Update follow status validation
const updateFollowStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'active', 'declined').required().messages({
    'any.only': 'Status must be one of: pending, active, declined',
    'any.required': 'Status is required',
  }),
}).strict();

// Bulk follow validation
const bulkFollowSchema = Joi.object({
  followingIds: Joi.array()
    .items(objectIdValidator)
    .min(1)
    .max(100)
    .unique()
    .required()
    .messages({
      'array.min': 'At least one user ID is required',
      'array.max': 'Maximum 100 users can be followed at once',
      'array.unique': 'Duplicate user IDs are not allowed',
      'any.required': 'Following user IDs are required',
    }),
}).strict();

// Batch status check validation
const batchStatusCheckSchema = Joi.object({
  userIds: Joi.array()
    .items(objectIdValidator)
    .min(1)
    .max(50)
    .unique()
    .required()
    .messages({
      'array.min': 'At least one user ID is required',
      'array.max': 'Maximum 50 users can be checked at once',
      'array.unique': 'Duplicate user IDs are not allowed',
      'any.required': 'User IDs are required',
    }),
}).strict();

// Query parameters validation for lists
const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    'number.base': 'Page must be a number',
    'number.integer': 'Page must be an integer',
    'number.min': 'Page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(100).optional().default(50).messages({
    'number.base': 'Limit must be a number',
    'number.integer': 'Limit must be an integer',
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100',
  }),
  status: Joi.string().valid('pending', 'active', 'declined').optional().default('active').messages({
    'any.only': 'Status must be one of: pending, active, declined',
  }),
  sortBy: Joi.string().valid('createdAt', 'updatedAt').optional().default('createdAt').messages({
    'any.only': 'Sort by must be one of: createdAt, updatedAt',
  }),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc').messages({
    'any.only': 'Sort order must be either asc or desc',
  }),
}).unknown(false);

/**
 * VALIDATION MIDDLEWARE FUNCTIONS
 */

/**
 * Validate ObjectId parameter
 */
export const validateObjectIdParam = (paramName: string) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const paramValue = req.params[paramName];
      
      if (!paramValue) {
        return next(new ErrorResponse(`${paramName} parameter is required`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
      }

      if (!Types.ObjectId.isValid(paramValue)) {
        return next(new ErrorResponse(`Invalid ${paramName} format`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
      }

      next();
    } catch (error : any) {
      logger.error('ObjectId parameter validation failed', {
        category: LogCategory.VALIDATION,
        paramName,
        paramValue: req.params[paramName],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(new ErrorResponse('Parameter validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }
  };
};

/**
 * Validate follow user request
 */
export const validateFollowUser = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { error, value } = followUserSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(detail => detail.message).join(', ');
      return next(new ErrorResponse(`Validation failed: ${messages}`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }

    // Prevent self-follow
    const currentUserId = (req as any).user?.id;
    if (currentUserId && value.followingId === currentUserId) {
      return next(new ErrorResponse('Cannot follow yourself', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }

    req.body = value;
    next();
  } catch (error : any) {
    logger.error('Follow user validation failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Request validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * Validate update follow status request
 */
export const validateUpdateFollowStatus = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { error, value } = updateFollowStatusSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(detail => detail.message).join(', ');
      return next(new ErrorResponse(`Validation failed: ${messages}`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }

    req.body = value;
    next();
  } catch (error : any) {
    logger.error('Update follow status validation failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Request validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * Validate bulk follow request
 */
export const validateBulkFollow = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { error, value } = bulkFollowSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(detail => detail.message).join(', ');
      return next(new ErrorResponse(`Validation failed: ${messages}`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }

    // Remove self from bulk follow list
    const currentUserId = (req as any).user?.id;
    if (currentUserId) {
      value.followingIds = value.followingIds.filter((id: string) => id !== currentUserId);
      
      if (value.followingIds.length === 0) {
        return next(new ErrorResponse('No valid users to follow after removing self-references', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
      }
    }

    req.body = value;
    next();
  } catch (error : any) {
    logger.error('Bulk follow validation failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Request validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * Validate bulk unfollow request
 */
export const validateBulkUnfollow = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { error, value } = bulkFollowSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(detail => detail.message).join(', ');
      return next(new ErrorResponse(`Validation failed: ${messages}`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }

    // Rename followingIds to match unfollow schema
    value.followingIds = value.followingIds || value.userIds;

    req.body = value;
    next();
  } catch (error : any) {
    logger.error('Bulk unfollow validation failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Request validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * Validate batch status check request
 */
export const validateBatchStatusCheck = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { error, value } = batchStatusCheckSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(detail => detail.message).join(', ');
      return next(new ErrorResponse(`Validation failed: ${messages}`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }

    req.body = value;
    next();
  } catch (error : any) {
    logger.error('Batch status check validation failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Request validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * Validate list query parameters
 */
export const validateListQuery = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { error, value } = listQuerySchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true, // Convert strings to numbers
    });

    if (error) {
      const messages = error.details.map(detail => detail.message).join(', ');
      return next(new ErrorResponse(`Query validation failed: ${messages}`, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
    }

    req.query = value;
    next();
  } catch (error : any) {
    logger.error('List query validation failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Query validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * Validate authenticated user
 */
export const validateAuthenticatedUser = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return next(new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED));
    }

    if (!Types.ObjectId.isValid(userId)) {
      return next(new ErrorResponse('Invalid user session', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED));
    }

    next();
  } catch (error : any) {
    logger.error('User authentication validation failed', {
      category: LogCategory.AUTH,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Authentication validation failed', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED));
  }
};

/**
 * Sanitize and validate user input
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  try {
    // Sanitize strings in body
    if (req.body && typeof req.body === 'object') {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          req.body[key] = req.body[key].trim();
        }
      });
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = (req.query[key] as string).trim();
        }
      });
    }

    next();
  } catch (error : any) {
    logger.error('Input sanitization failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Input processing failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * Validate request size limits
 */
export const validateRequestSize = (req: Request, _res: Response, next: NextFunction) => {
  try {
    // Check body size for bulk operations
    if (req.body && Array.isArray(req.body.followingIds)) {
      if (req.body.followingIds.length > 100) {
        return next(new ErrorResponse('Too many IDs in bulk operation', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
      }
    }

    if (req.body && Array.isArray(req.body.userIds)) {
      if (req.body.userIds.length > 50) {
        return next(new ErrorResponse('Too many IDs in batch operation', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
      }
    }

    next();
  } catch (error : any) {
    logger.error('Request size validation failed', {
      category: LogCategory.VALIDATION,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(new ErrorResponse('Request size validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
  }
};

/**
 * UTILITY FUNCTIONS
 */

/**
 * Check if value is valid ObjectId
 */
export const isValidObjectId = (value: string): boolean => {
  return Types.ObjectId.isValid(value);
};

/**
 * Validate and sanitize ObjectId array
 */
export const validateObjectIdArray = (ids: string[], maxLength: number = 100): string[] => {
  if (!Array.isArray(ids)) {
    throw new Error('IDs must be an array');
  }

  if (ids.length === 0) {
    throw new Error('At least one ID is required');
  }

  if (ids.length > maxLength) {
    throw new Error(`Too many IDs, maximum ${maxLength} allowed`);
  }

  const validIds = ids.filter(id => Types.ObjectId.isValid(id));
  
  if (validIds.length !== ids.length) {
    throw new Error('All IDs must be valid ObjectIds');
  }

  // Remove duplicates
  return [...new Set(validIds)];
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (page?: number, limit?: number) => {
  const validatedPage = Math.max(1, Math.floor(page || 1));
  const validatedLimit = Math.min(100, Math.max(1, Math.floor(limit || 50)));
  
  return {
    page: validatedPage,
    limit: validatedLimit,
    skip: (validatedPage - 1) * validatedLimit
  };
};

export default {
  validateObjectIdParam,
  validateFollowUser,
  validateUpdateFollowStatus,
  validateBulkFollow,
  validateBulkUnfollow,
  validateBatchStatusCheck,
  validateListQuery,
  validateAuthenticatedUser,
  sanitizeInput,
  validateRequestSize,
  isValidObjectId,
  validateObjectIdArray,
  validatePagination,
};