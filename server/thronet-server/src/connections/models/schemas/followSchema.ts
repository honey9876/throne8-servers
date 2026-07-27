// // src/models/schemas/followSchema.ts

// import Joi from 'joi';
// import { Types } from 'mongoose';
// import { ErrorResponse, HttpStatus } from '@/shared/response.util'; // path adjust karo

// /**
//  * Custom ObjectId validation for Joi
//  */
// // const objectIdValidator = Joi.string().custom((value, helpers) => {
// //   if (!Types.ObjectId.isValid(value)) {
// //     return helpers.error('any.invalid');
// //   }
// //   return value;
// // }, 'ObjectId validation').messages({
// //   'any.invalid': '{{#label}} must be a valid ObjectId',
// // });


// // UUID validator (aapke system ke actual userId format ke hisaab se)
// const userIdValidator = Joi.string().uuid({ version: 'uuidv4' }).messages({
//   'string.guid': '{{#label}} must be a valid user ID',
// });


// /**
//  * Follow creation schema
//  */
// export const createFollowSchema = Joi.object({
//   followingId: objectIdValidator.required().messages({
//     'any.required': 'Following user ID is required',
//   }),
//   notificationEnabled: Joi.boolean().optional().default(true),
// }).strict();

// /**
//  * Follow update schema
//  */
// export const updateFollowSchema = Joi.object({
//   notificationEnabled: Joi.boolean().optional(),
//   isBlocked: Joi.boolean().optional(),
// }).strict().min(1).messages({
//   'object.min': 'At least one field must be provided for update',
// });

// /**
//  * Follow status update schema
//  */
// export const updateFollowStatusSchema = Joi.object({
//   status: Joi.string().valid('pending', 'active', 'declined').required().messages({
//     'any.only': 'Status must be one of: pending, active, declined',
//     'any.required': 'Status is required',
//   }),
// }).strict();

// /**
//  * Bulk follow schema
//  */
// export const bulkFollowSchema = Joi.object({
//   followingIds: Joi.array()
//     .items(objectIdValidator)
//     .min(1)
//     .max(100)
//     .unique()
//     .required()
//     .messages({
//       'array.min': 'At least one user ID is required',
//       'array.max': 'Maximum 100 users can be followed at once',
//       'array.unique': 'Duplicate user IDs are not allowed',
//       'any.required': 'Following user IDs are required',
//     }),
// }).strict();

// /**
//  * Bulk unfollow schema
//  */
// export const bulkUnfollowSchema = Joi.object({
//   followingIds: Joi.array()
//     .items(objectIdValidator)
//     .min(1)
//     .max(100)
//     .unique()
//     .required()
//     .messages({
//       'array.min': 'At least one user ID is required',
//       'array.max': 'Maximum 100 users can be unfollowed at once',
//       'array.unique': 'Duplicate user IDs are not allowed',
//       'any.required': 'Following user IDs are required',
//     }),
// }).strict();

// /**
//  * Get followers/following pagination schema
//  */
// export const getFollowListSchema = Joi.object({
//   page: Joi.number().integer().min(1).optional().default(1).messages({
//     'number.base': 'Page must be a number',
//     'number.integer': 'Page must be an integer',
//     'number.min': 'Page must be at least 1',
//   }),
//   limit: Joi.number().integer().min(1).max(100).optional().default(50).messages({
//     'number.base': 'Limit must be a number',
//     'number.integer': 'Limit must be an integer',
//     'number.min': 'Limit must be at least 1',
//     'number.max': 'Limit cannot exceed 100',
//   }),
//   status: Joi.string().valid('pending', 'active', 'declined').optional().default('active').messages({
//     'any.only': 'Status must be one of: pending, active, declined',
//   }),
//   sortBy: Joi.string().valid('createdAt', 'updatedAt').optional().default('createdAt').messages({
//     'any.only': 'Sort by must be one of: createdAt, updatedAt',
//   }),
//   sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc').messages({
//     'any.only': 'Sort order must be either asc or desc',
//   }),
// }).strict();

// /**
//  * Follow status check schema
//  */
// export const checkFollowStatusSchema = Joi.object({
//   userId: objectIdValidator.required().messages({
//     'any.required': 'User ID is required',
//   }),
// }).strict();

// /**
//  * Batch follow status check schema
//  */
// export const batchCheckFollowStatusSchema = Joi.object({
//   userIds: Joi.array()
//     .items(objectIdValidator)
//     .min(1)
//     .max(50)
//     .unique()
//     .required()
//     .messages({
//       'array.min': 'At least one user ID is required',
//       'array.max': 'Maximum 50 users can be checked at once',
//       'array.unique': 'Duplicate user IDs are not allowed',
//       'any.required': 'User IDs are required',
//     }),
// }).strict();

// /**
//  * Get mutual follows schema
//  */
// export const getMutualFollowsSchema = Joi.object({
//   userId: objectIdValidator.required().messages({
//     'any.required': 'User ID is required',
//   }),
//   limit: Joi.number().integer().min(1).max(50).optional().default(10).messages({
//     'number.base': 'Limit must be a number',
//     'number.integer': 'Limit must be an integer',
//     'number.min': 'Limit must be at least 1',
//     'number.max': 'Limit cannot exceed 50',
//   }),
// }).strict();

// /**
//  * Get trending users schema
//  */
// export const getTrendingUsersSchema = Joi.object({
//   days: Joi.number().integer().min(1).max(30).optional().default(7).messages({
//     'number.base': 'Days must be a number',
//     'number.integer': 'Days must be an integer',
//     'number.min': 'Days must be at least 1',
//     'number.max': 'Days cannot exceed 30',
//   }),
//   limit: Joi.number().integer().min(1).max(50).optional().default(10).messages({
//     'number.base': 'Limit must be a number',
//     'number.integer': 'Limit must be an integer',
//     'number.min': 'Limit must be at least 1',
//     'number.max': 'Limit cannot exceed 50',
//   }),
// }).strict();

// /**
//  * Block/Unblock user schema
//  */
// export const blockUserSchema = Joi.object({
//   userId: objectIdValidator.required().messages({
//     'any.required': 'User ID is required',
//   }),
//   isBlocked: Joi.boolean().required().messages({
//     'any.required': 'Block status is required',
//   }),
// }).strict();

// /**
//  * Search followers/following schema
//  */
// export const searchFollowSchema = Joi.object({
//   query: Joi.string().trim().min(1).max(100).required().messages({
//     'string.empty': 'Search query cannot be empty',
//     'string.min': 'Search query must be at least 1 character',
//     'string.max': 'Search query cannot exceed 100 characters',
//     'any.required': 'Search query is required',
//   }),
//   type: Joi.string().valid('followers', 'following').required().messages({
//     'any.only': 'Search type must be either followers or following',
//     'any.required': 'Search type is required',
//   }),
//   page: Joi.number().integer().min(1).optional().default(1).messages({
//     'number.base': 'Page must be a number',
//     'number.integer': 'Page must be an integer',
//     'number.min': 'Page must be at least 1',
//   }),
//   limit: Joi.number().integer().min(1).max(50).optional().default(20).messages({
//     'number.base': 'Limit must be a number',
//     'number.integer': 'Limit must be an integer',
//     'number.min': 'Limit must be at least 1',
//     'number.max': 'Limit cannot exceed 50',
//   }),
// }).strict();

// /**
//  * Export settings schema
//  */
// export const exportFollowDataSchema = Joi.object({
//   format: Joi.string().valid('json', 'csv').optional().default('json').messages({
//     'any.only': 'Export format must be either json or csv',
//   }),
//   includeFollowers: Joi.boolean().optional().default(true),
//   includeFollowing: Joi.boolean().optional().default(true),
//   includeMetadata: Joi.boolean().optional().default(false),
// }).strict();

// /**
//  * Follow analytics schema
//  */
// export const getFollowAnalyticsSchema = Joi.object({
//   period: Joi.string().valid('day', 'week', 'month', 'year').optional().default('month').messages({
//     'any.only': 'Period must be one of: day, week, month, year',
//   }),
//   startDate: Joi.date().optional().messages({
//     'date.base': 'Start date must be a valid date',
//   }),
//   endDate: Joi.date().optional().min(Joi.ref('startDate')).messages({
//     'date.base': 'End date must be a valid date',
//     'date.min': 'End date must be after start date',
//   }),
// }).strict();

// /**
//  * Import schema for bulk operations
//  */
// export const importFollowDataSchema = Joi.object({
//   operations: Joi.array()
//     .items(
//       Joi.object({
//         action: Joi.string().valid('follow', 'unfollow').required(),
//         userId: objectIdValidator.required(),
//       }).strict()
//     )
//     .min(1)
//     .max(1000)
//     .required()
//     .messages({
//       'array.min': 'At least one operation is required',
//       'array.max': 'Maximum 1000 operations allowed',
//       'any.required': 'Operations are required',
//     }),
//   skipDuplicates: Joi.boolean().optional().default(true),
//   notifyUsers: Joi.boolean().optional().default(false),
// }).strict();

// /**
//  * Validation helper functions
//  */
// export const validateObjectId = (id: string): boolean => {
//   return Types.ObjectId.isValid(id);
// };

// export const validateFollowData = (data: any, schema: Joi.ObjectSchema) => {
//   const { error, value } = schema.validate(data, {
//     abortEarly: false,
//     stripUnknown: true,
//     convert: true,
//   });

//   if (error) {
//     const messages = error.details.map(detail => detail.message);
//     throw new Error(`Validation failed: ${messages.join(', ')}`, HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED');
//   }

//   return value;
// };





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
 */
export const getFollowListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(50),
  status: Joi.string().valid('pending', 'active', 'declined').optional().default('active'),
  sortBy: Joi.string().valid('createdAt', 'updatedAt').optional().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
}).strict();

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
}).strict();

/**
 * Get trending users schema
 */
export const getTrendingUsersSchema = Joi.object({
  days: Joi.number().integer().min(1).max(30).optional().default(7),
  limit: Joi.number().integer().min(1).max(50).optional().default(10),
}).strict();

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
}).strict();

/**
 * Export settings schema
 */
export const exportFollowDataSchema = Joi.object({
  format: Joi.string().valid('json', 'csv').optional().default('json'),
  includeFollowers: Joi.boolean().optional().default(true),
  includeFollowing: Joi.boolean().optional().default(true),
  includeMetadata: Joi.boolean().optional().default(false),
}).strict();

/**
 * Follow analytics schema
 */
export const getFollowAnalyticsSchema = Joi.object({
  period: Joi.string().valid('day', 'week', 'month', 'year').optional().default('month'),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional().min(Joi.ref('startDate')),
}).strict();

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