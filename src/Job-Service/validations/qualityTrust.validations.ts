// validations/jobQuality.validations.ts
import Joi from 'joi';
import mongoose from 'mongoose';

// Reusable MongoDB ObjectId validator with nice error message
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

// Base common messages
const commonMessages = {
  'any.required': '{#label} is required',
  'number.min': '{#label} cannot be negative',
  'string.pattern.base': '{#label} must be a valid 3-letter ISO 4217 code (e.g., USD, EUR)',
  'any.only': '{#label} must be one of: hourly, monthly, yearly',
};

// 1. Company Verification
export const validateCompanyIDVerification = (data: any) =>
  Joi.object({
    companyId: objectIdSchema('Company ID'),
  })
    .unknown(false)
    .messages(commonMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

// 2. Job Spam Check
export const validateJobSpamCheck = (data: any) =>
  Joi.object({
    jobId: objectIdSchema('Job ID'),
  })
    .unknown(false)
    .messages(commonMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

// 3. Salary Verification (most comprehensive)
export const validateSalaryVerification = (data: any) =>
  Joi.object({
    jobId: objectIdSchema('Job ID'),

    salaryData: Joi.object({
      amount: Joi.number()
        .min(0)
        .required()
        .label('Salary Amount')
        .messages(commonMessages),

      currency: Joi.string()
        .pattern(/^[A-Z]{3}$/)
        .default('USD')
        .label('Currency')
        .messages(commonMessages),

      period: Joi.string()
        .valid('hourly', 'monthly', 'yearly')
        .required()
        .label('Salary Period')
        .messages(commonMessages),

      // Optional extra fields you might want to allow
      disclosed: Joi.boolean().optional().label('Salary Disclosed'),
      negotiable: Joi.boolean().optional().label('Negotiable'),
    })
      .required()
      .label('Salary Data')
      .messages(commonMessages),
  })
    .unknown(false)
    .messages(commonMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

// 4. Duplicate Application Check
export const validateDuplicateApplication = (data: any) =>
  Joi.object({
    jobId: objectIdSchema('Job ID'),
    // Optional: you could add userId check here too
    // userId: objectIdSchema('User ID'),
  })
    .unknown(false)
    .messages(commonMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

// 5. Job Quality / Trust Score Check
export const validateJobQuality = (data: any) =>
  Joi.object({
    jobId: objectIdSchema('Job ID'),
  })
    .unknown(false)
    .messages(commonMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });