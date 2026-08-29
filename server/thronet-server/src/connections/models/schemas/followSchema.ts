// src/models/schemas/followSchema.ts

import Joi from 'joi';
import { Types } from 'mongoose';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';

/**
 * UUID validator (system ka actual userId format)
 */
const userIdValidator = Joi.string().uuid({ version: 'uuidv4' }).messages({
  'string.guid': '{{#label}} must be a valid user ID',
});

/**
 * Follow creation schema
 * (body validation — JSON body already sahi types mein aata hai, isliye
 * .strict() yahan sahi hai)
 */
export const createFollowSchema = Joi.object({
  followingId: userIdValidator.required().messages({
    'any.required': 'Following user ID is required',
  }),
  notificationEnabled: Joi.boolean().optional().default(true),
}).strict();

/**
 * Follow update schema
 */
export const updateFollowSchema = Joi.object({
  notificationEnabled: Joi.boolean().optional(),
  isBlocked: Joi.boolean().optional(),
}).strict().min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

/**
 * Follow status update schema
 */
export const updateFollowStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'active', 'declined').required().messages({
    'any.only': 'Status must be one of: pending, active, declined',
    'any.required': 'Status is required',
  }),
}).strict();

/**
 * Bulk follow schema
 */
export const bulkFollowSchema = Joi.object({
  followingIds: Joi.array()
    .items(userIdValidator)
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

/**
 * Bulk unfollow schema
 */
export const bulkUnfollowSchema = Joi.object({
  followingIds: Joi.array()
    .items(userIdValidator)
    .min(1)
    .max(100)
    .unique()
    .required()
    .messages({
      'array.min': 'At least one user ID is required',
      'array.max': 'Maximum 100 users can be unfollowed at once',
      'array.unique': 'Duplicate user IDs are not allowed',
      'any.required': 'Following user IDs are required',
    }),
}).strict();

/**
 * Get followers/following pagination schema
 *
 * ⚠️ FIX: `.strict()` YAHAN SE HATA DIYA GAYA HAI.
 *
 * Root cause: Express mein `req.query.*` HAMESHA string hota hai
 * (e.g. `?limit=100` → req.query.limit === "100", number 100 nahi).
 * Joi ka `.strict()` schema-level preference hai jo `convert: false`
 * FORCE karta hai — aur yeh `validateFollowData()` mein diye gaye
 * `convert: true` option se bhi priority leta hai (schema-level
 * preference > call-level option).
 *
 * Isliye `getFollowers` / `getFollowing` endpoints pe jab bhi
 * `?limit=100&page=1` jaisa query string aata tha, Joi validation
 * FAIL ho jaata tha (kyunki "100" string hai, number nahi expected
 * type ke hisaab se) — aur controller 400 error return karta tha.
 *
 * Frontend (`follow.service.ts`) is error ko silently catch karke
 * `null` return karta tha, aur `useFollowListsData.ts` usse empty
 * array [] treat kar leta tha — isliye UI pe hamesha "Followers (0)"
 * "Following (0)" dikhta tha, jabki `/follow/counts/:userId` (jisme
 * koi Joi validation hi nahi hoti) sahi count dikhata tha.
 *
 * `.strict()` hatane ke baad Joi ab `convert: true` ke through
 * "100" string ko number 100 mein safely convert kar lega, jaisa
 * ki query-param schemas ke liye hona chahiye.
 */
export const getFollowListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(50),
  status: Joi.string().valid('pending', 'active', 'declined').optional().default('active'),
  sortBy: Joi.string().valid('createdAt', 'updatedAt').optional().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
});

/**
 * Follow status check schema
 */
export const checkFollowStatusSchema = Joi.object({
  userId: userIdValidator.required().messages({
    'any.required': 'User ID is required',
  }),
}).strict();

/**
 * Batch follow status check schema
 */
export const batchCheckFollowStatusSchema = Joi.object({
  userIds: Joi.array()
    .items(userIdValidator)
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

/**
 * Get mutual follows schema
 */
export const getMutualFollowsSchema = Joi.object({
  userId: userIdValidator.required().messages({
    'any.required': 'User ID is required',
  }),
  limit: Joi.number().integer().min(1).max(50).optional().default(10),
});

/**
 * Get trending users schema
 */
export const getTrendingUsersSchema = Joi.object({
  days: Joi.number().integer().min(1).max(30).optional().default(7),
  limit: Joi.number().integer().min(1).max(50).optional().default(10),
});

/**
 * Block/Unblock user schema
 */
export const blockUserSchema = Joi.object({
  userId: userIdValidator.required().messages({
    'any.required': 'User ID is required',
  }),
  isBlocked: Joi.boolean().required().messages({
    'any.required': 'Block status is required',
  }),
}).strict();

/**
 * Search followers/following schema
 */
export const searchFollowSchema = Joi.object({
  query: Joi.string().trim().min(1).max(100).required(),
  type: Joi.string().valid('followers', 'following').required(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(50).optional().default(20),
});

/**
 * Export settings schema
 */
export const exportFollowDataSchema = Joi.object({
  format: Joi.string().valid('json', 'csv').optional().default('json'),
  includeFollowers: Joi.boolean().optional().default(true),
  includeFollowing: Joi.boolean().optional().default(true),
  includeMetadata: Joi.boolean().optional().default(false),
});

/**
 * Follow analytics schema
 */
export const getFollowAnalyticsSchema = Joi.object({
  period: Joi.string().valid('day', 'week', 'month', 'year').optional().default('month'),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional().min(Joi.ref('startDate')),
});

/**
 * Import schema for bulk operations
 */
export const importFollowDataSchema = Joi.object({
  operations: Joi.array()
    .items(
      Joi.object({
        action: Joi.string().valid('follow', 'unfollow').required(),
        userId: userIdValidator.required(),
      }).strict()
    )
    .min(1)
    .max(1000)
    .required(),
  skipDuplicates: Joi.boolean().optional().default(true),
  notifyUsers: Joi.boolean().optional().default(false),
}).strict();

/**
 * Validation helper functions
 */
export const validateObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id);
};

export const validateFollowData = (data: any, schema: Joi.ObjectSchema) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    const messages = error.details.map(detail => detail.message);
    throw new ErrorResponse(
      `Validation failed: ${messages.join(', ')}`,
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED'
    );
  }

  return value;
};