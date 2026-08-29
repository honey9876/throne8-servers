// validations/search.validations.ts
import Joi from 'joi';
import mongoose from 'mongoose';

// Reusable MongoDB ObjectId validator
const objectIdSchema = (label: string) =>
  Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'MongoDB ObjectId validation')
    .required()
    .trim()
    .label(label)
    .messages({
      'any.invalid': '{#label} must be a valid MongoDB ObjectId',
      'any.required': '{#label} is required',
      'string.empty': '{#label} cannot be empty',
    });

// Common custom messages (all in English)
const commonMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.min': '{#label} must be at least {#limit} characters',
  'string.max': '{#label} cannot exceed {#limit} characters',
  'number.min': '{#label} must be at least {#limit}',
  'number.max': '{#label} cannot exceed {#limit}',
  'array.min': '{#label} must contain at least {#limit} items',
  'array.max': '{#label} cannot contain more than {#limit} items',
  'any.only': '{#label} must be a valid value',
  'any.invalid': '{#label} has an invalid format',
};

// 1. Search Input Validation (main search)
export const validateSearchInput = (input: any) => {
  const schema = Joi.object({
    query: Joi.string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .allow('')
      .label('Search Query')
      .messages(commonMessages),

    page: Joi.number()
      .integer()
      .min(1)
      .max(1000)
      .default(1)
      .label('Page'),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(50)
      .default(20)
      .label('Limit'),

    filters: Joi.string()
      .optional()
      .custom((value, helpers) => {
        const parts = value.split(',').map((p: any) => p.trim());
        if (parts.length !== 2) {
          return helpers.error('any.invalid');
        }
        return { role: parts[0], level: parts[1] };
      }, 'Convert filters string to object')
      .label('Filters')
      .messages({
        'any.invalid': 'Filters must be in the format "role,level"',
      }),

    sort: Joi.string()
      .valid('relevance', 'date', 'salary', 'company')
      .default('relevance')
      .label('Sort By')
      .messages(commonMessages),

    personalize: Joi.boolean()
      .default(true)
      .label('Personalize Results'),
  })
    .unknown(false)
    .messages(commonMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};

// 2. Skills Search Validation
export const validateSkillsSearchInput = (input: any) => {
  const schema = Joi.object({
    skills: Joi.array()
      .items(Joi.string().trim().min(1).max(50).required())
      .min(1)
      .required()
      .label('Skills')
      .messages(commonMessages),

    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .label('Page'),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .label('Limit'),
  })
    .unknown(false)
    .messages(commonMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};

// 3. Recently Viewed Jobs Validation
export const validateRecentlyViewedInput = Joi.object({
  userId: objectIdSchema('User ID'),

  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .label('Page'),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .label('Limit'),

  sortBy: Joi.string()
    .valid('createdAt', 'title', 'salary')
    .default('createdAt')
    .label('Sort By'),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .label('Sort Order'),
})
  .unknown(false)
  .messages(commonMessages);

// 4. Offline Jobs Validation
export const validateOfflineJobsInput = (input: any) => {
  const schema = Joi.object({
    userId: objectIdSchema('User ID'),

    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .label('Page'),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .label('Limit'),

    sortBy: Joi.string()
      .valid('createdAt', 'title', 'salary')
      .default('createdAt')
      .label('Sort By'),

    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .label('Sort Order'),

    jobType: Joi.string()
      .valid('full-time', 'part-time', 'contract', 'internship')
      .optional()
      .label('Job Type'),

    location: Joi.string()
      .trim()
      .max(100)
      .optional()
      .label('Location'),
  })
    .unknown(false)
    .messages(commonMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};

// 5. Push Notification Validation
export const validatePushNotificationInput = (input: any) => {
  const schema = Joi.object({
    userId: objectIdSchema('User ID'),

    message: Joi.string()
      .trim()
      .min(10)
      .max(255)
      .required()
      .label('Notification Message'),

    type: Joi.string()
      .valid('job_alert', 'application_update', 'reminder', 'system')
      .default('job_alert')
      .label('Notification Type'),

    priority: Joi.string()
      .valid('low', 'medium', 'high')
      .default('medium')
      .label('Priority'),
  })
    .unknown(false)
    .messages(commonMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};