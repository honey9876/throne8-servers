// validations/jobApplication.validations.ts
import Joi from 'joi';
import { JobApplication } from '../models';
// import { HTTP_STATUS } from '../constants/messages.js';
import { ValidationError } from '@/shared/errors/app.error';// ← assuming you have this

// Custom error messages (makes them human-readable)
const customMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.uuid': '{#label} must be a valid UUID',
  'string.pattern.base': '{#label} has invalid format',
  'string.max': '{#label} cannot exceed {#limit} characters',
  'string.min': '{#label} must be at least {#limit} characters',
  'array.base': '{#label} must be an array',
  'object.base': '{#label} must be an object',
};

// Common reusable schemas
const uuidSchema = () => Joi.string().uuid({ version: ['uuidv4'] }).required().messages(customMessages);
const objectIdSchema = () => Joi.string().regex(/^[0-9a-fA-F]{24}$/).messages(customMessages);

// Helper: Async check if application exists and belongs to user
export const validateApplicationOwnership = async (applicationId: string, userId: string) => {
  const application = await JobApplication.findOne({ _id: applicationId, userId });
  if (!application) {
    throw new ValidationError('Application not found or you do not have permission');
  }
  return application;
};

// 1. Apply to Job (POST /jobs/:jobId/apply)
export const validateApplyJobInput = Joi.object({
  jobId: uuidSchema().label('Job ID'),
  userId: uuidSchema().label('User ID'),
  companyId: uuidSchema().label('Company ID'),
  resumeVersion: uuidSchema().label('Resume Version').optional().allow(''),
  coverLetter: Joi.string()
    .trim()
    .min(50)
    .max(5000)
    .optional()
    .allow('')
    .label('Cover Letter')
    .messages(customMessages),
  source: Joi.string()
    .valid('direct', 'linkedin', 'referral', 'job-board')
    .default('direct')
    .label('Application Source')
    .messages(customMessages),
})
  .unknown(false) // ← reject unknown fields (security)
  .messages(customMessages);

// 2. Update Application Status (PATCH /applications/:applicationId/status)
export const validateUpdateApplicationStatus = Joi.object({
  status: Joi.string()
    .valid('submitted', 'reviewed', 'shortlisted', 'interviewed', 'rejected', 'hired', 'withdrawn')
    .required()
    .label('Application Status')
    .messages(customMessages),
  notes: Joi.string().max(1000).optional().label('Status Notes').messages(customMessages),
})
  .unknown(false)
  .messages(customMessages);

// 3. Resume Selection (for existing application)
export const validateResumeSelectionInput = Joi.object({
    userId: uuidSchema().label('User ID'),
    applicationId: objectIdSchema().required().label('Application ID'),
    resumeUrl: Joi.string()
      .uri({ scheme: ['http', 'https', 's3'] })
      .max(2000)
      .required()
      .label('Resume URL')
      .messages(customMessages),
  })
    .unknown(false)
    .messages(customMessages);



  // const { error, value } = schema.validate(input, { abortEarly: false, stripUnknown: true });

  // if (error) {
  //   throw new ValidationError('Invalid resume selection input', error.details);
  // }

  // // Async ownership check
  // await validateApplicationOwnership(value.applicationId, value.userId);

  // return value

// 4. Cover Letter for Application
export const validateCoverLetterInput = Joi.object({
    userId: uuidSchema().label('User ID'),
    applicationId: objectIdSchema().required().label('Application ID'),
    coverLetter: Joi.string()
      .trim()
      .min(50)
      .max(5000)
      .required()
      .label('Cover Letter')
      .messages(customMessages),
  })
    .unknown(false)
    .messages(customMessages);

  // const { error, value } = schema.validate(input, { abortEarly: false, stripUnknown: true });

  // if (error) {
  //   throw new ValidationError('Invalid cover letter input', error.details);
  // }

  // // Async ownership check
  // await validateApplicationOwnership(value.applicationId, value.userId);

  // return value;
// };

// Agar aapko ownership validation bhi chahiye to ye separate async function banao
export const validateResumeSelectionWithOwnership = async (input: any) => {
  const { error, value } = validateResumeSelectionInput.validate(input, { 
    abortEarly: false, 
    stripUnknown: true 
  });

  if (error) {
    throw new ValidationError('Invalid resume selection input', error.details);
  }

  // Async ownership check
  await validateApplicationOwnership(value.applicationId, value.userId);

  return value;
};