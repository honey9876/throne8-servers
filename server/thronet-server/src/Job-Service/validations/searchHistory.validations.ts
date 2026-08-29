// validations/searchHistory.validations.ts
import Joi from 'joi';

// Custom error messages (all in English)
const customMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.min': '{#label} must be at least {#limit} characters',
  'string.max': '{#label} cannot exceed {#limit} characters',
  'array.min': '{#label} must contain at least {#limit} items',
  'array.max': '{#label} cannot contain more than {#limit} items',
  'any.only': '{#label} must be a valid value',
  'string.pattern.base': '{#label} contains invalid characters',
  'number.min': '{#label} must be at least {#limit}',
};

// Reusable common rules
const stringRequired = (label: string, min = 1, max = 255) =>
  Joi.string()
    .trim()
    .min(min)
    .max(max)
    .required()
    .label(label)
    .messages(customMessages);

const stringOptional = (label: string, max = 500) =>
  Joi.string()
    .trim()
    .max(max)
    .optional()
    .allow('')
    .label(label)
    .messages(customMessages);

// Shared filters schema (reusable for both create & update)
const filtersSchema = Joi.object({
  skills: Joi.array()
    .items(
      Joi.object({
        name: Joi.string()
          .trim()
          .max(50)
          .pattern(/^[a-zA-Z0-9\s\-.,+#@]+$/) // Allow common skill chars
          .required()
          .label('Skill Name'),
        weight: Joi.number()
          .min(0)
          .max(1)
          .default(0.5)
          .label('Skill Weight'),
      })
    )
    .max(15)
    .optional()
    .label('Skills'),

  locations: Joi.array()
    .items(
      Joi.object({
        city: Joi.string().trim().max(100).pattern(/^[a-zA-Z\s\-.,']+$/).optional().allow('').label('City'),
        state: Joi.string().trim().max(50).pattern(/^[a-zA-Z\s\-.,']+$/).optional().allow('').label('State'),
        country: Joi.string()
          .trim()
          .max(50)
          .pattern(/^[a-zA-Z\s\-.,']+$/)
          .default('India')
          .label('Country'),
      })
    )
    .max(10)
    .optional()
    .label('Locations'),

  excludeKeywords: Joi.array()
    .items(Joi.string().trim().max(50).pattern(/^[a-zA-Z0-9\s\-.,+#@]+$/))
    .max(20)
    .optional()
    .label('Exclude Keywords'),

  jobTypes: Joi.array()
    .items(Joi.string().valid('full-time', 'part-time', 'contract', 'freelance', 'internship', 'remote'))
    .max(5)
    .optional()
    .label('Job Types'),

  experienceLevels: Joi.array()
    .items(Joi.string().valid('entry', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive'))
    .max(5)
    .optional()
    .label('Experience Levels'),
})
  .unknown(false)
  .messages(customMessages);

// 1. Create Search History (POST)
export const createSearchHistorySchema = Joi.object({
  query: stringRequired('Search Query', 1, 500),

  type: Joi.string()
    .valid('location', 'company', 'keyword', 'title', 'natural', 'skills', 'salary')
    .required()
    .label('Search Type'),

  filters: filtersSchema.optional(),

  ip: Joi.string()
    .max(45)
    .pattern(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/)
    .optional()
    .label('IP Address'),

  userAgent: Joi.string().trim().max(500).optional().label('User Agent'),

  resultCount: Joi.number().integer().min(0).optional().label('Result Count'),

  executionTime: Joi.number().integer().min(0).optional().label('Execution Time (ms)'),
})
  .unknown(false)
  .messages(customMessages);

// 2. Update Search History (PATCH)
export const updateSearchHistorySchema = Joi.object({
  query: stringOptional('Search Query', 500),

  type: Joi.string()
    .valid('location', 'company', 'keyword', 'title', 'natural', 'skills', 'salary')
    .optional()
    .label('Search Type'),

  filters: filtersSchema.optional(),

  ip: Joi.string()
    .max(45)
    .pattern(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/)
    .optional()
    .label('IP Address'),

  userAgent: Joi.string().trim().max(500).optional().label('User Agent'),

  resultCount: Joi.number().integer().min(0).optional().label('Result Count'),

  executionTime: Joi.number().integer().min(0).optional().label('Execution Time (ms)'),
})
  .unknown(false)
  .min(1) // At least one field must be provided for update
  .messages({
    ...customMessages,
    'object.min': 'At least one field must be provided for update',
  });