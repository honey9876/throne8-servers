// validations/ai.validations.ts
import Joi from 'joi';

// Custom error messages helper
const customMessages = {
  'string.base': '{#label} must be a string',
  'string.empty': '{#label} cannot be empty',
  'string.uuid': '{#label} must be a valid UUID',
  'number.base': '{#label} must be a number',
  'number.min': '{#label} must be at least {#limit}',
  'array.base': '{#label} must be an array',
  'object.base': '{#label} must be an object',
  'any.required': '{#label} is required',
  'string.max': '{#label} must be at most {#limit} characters',
  'string.uri': '{#label} must be a valid URL',
  'string.hostname': '{#label} must be a valid domain name',
};

// Helper to apply common rules
const uuidField = () => Joi.string().uuid({ version: ['uuidv4'] }).required().messages(customMessages);
const stringRequired = (label: string) => Joi.string().trim().required().label(label).messages(customMessages);
const numberOptional = (label: string) => Joi.number().label(label).messages(customMessages);

export const validateResumeOptimization = (data: any) =>
  Joi.object({
    userId: uuidField().label('User ID'),
    resumeData: Joi.object().required().label('Resume Data'), // ← Changed to object (most common)
    // OR if you really want string (raw markdown/text): Joi.string().min(100).required().label('Resume Content'),
    targetJobId: uuidField().label('Target Job ID'),
  })
    .unknown(true) // Allow extra fields (safer for future)
    .messages(customMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

export const validateJobMatching = (data: any) =>
  Joi.object({
    skills: Joi.array().items(Joi.string().trim()).optional().label('Skills'),
    location: Joi.string().trim().optional().label('Location'),
    jobType: Joi.string().trim().valid('full-time', 'part-time', 'contract', 'internship', 'remote').optional().label('Job Type'),
    experienceLevel: Joi.string().trim().valid('entry', 'mid', 'senior', 'expert').optional().label('Experience Level'),
    // Add more filters as needed
  })
    .unknown(true)
    .messages(customMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

export const validateJobAnalysis = (data: any) =>
  Joi.object({
    jobId: uuidField().label('Job ID'),
    description: stringRequired('Job Description').min(50).max(8000),
  })
    .messages(customMessages)
    .validate(data, { abortEarly: false });

export const validateOpenToWork = (data: any) =>
  Joi.object({
    isOpenToWork: Joi.boolean().required().label('Open to Work Status'),
    preferences: Joi.object({
      skills: Joi.array().items(Joi.string().trim()).optional().label('Preferred Skills'),
      location: Joi.string().trim().optional().label('Preferred Location'),
      jobType: Joi.string().trim().optional().label('Preferred Job Type'),
      experienceLevel: Joi.string().trim().optional().label('Preferred Experience Level'),
    }).optional(),
  })
    .messages(customMessages)
    .validate(data, { abortEarly: false });

export const validateFeaturedApplicant = (data: any) =>
  Joi.object({
    companyId: uuidField().label('company ID'),
    applicationId: uuidField().label('Application ID'),
    jobId: uuidField().label('Job ID'),
  })
    .messages(customMessages)
    .validate(data, { abortEarly: false });

export const validateDirectMessage = (data: any) =>
  Joi.object({
    recipientId: uuidField().label('Recipient ID'),
    message: stringRequired('Message').max(2000).label('Direct Message'),
    jobId: uuidField().label('Job ID').optional(),
  })
    .messages(customMessages)
    .validate(data, { abortEarly: false });

export const validateTopApplicantJobs = (data: any) =>
  Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(10).label('Limit'),
    cursor: Joi.number().integer().min(0).optional().label('Cursor'),
  })
    .messages(customMessages)
    .validate(data, { abortEarly: false });

export const validateCompanyVerification = (data: any) =>
  Joi.object({
    companyId: uuidField().label('Company ID'),
    verificationData: Joi.object({
      domain: Joi.string().hostname().required().label('Company Domain'),
      registration: stringRequired('Registration Proof'),
      socialProof: Joi.array().items(Joi.string().uri()).optional().label('Social Proof Links'),
    }).required().label('Verification Data'),
  })
    .messages(customMessages)
    .validate(data, { abortEarly: false });

// export const validateSalaryVerification = (data: any) =>
//   Joi.object({
//     jobId: uuidField().label('Job ID'),
//     salaryData: Joi.object({
//       min: Joi.number().min(0).required().label('Minimum Salary'),
//       max: Joi.number().min(Joi.ref('min')).optional().label('Maximum Salary'),
//       currency: Joi.string().default('USD').valid('USD', 'INR', 'EUR', 'GBP').label('Currency'),
//       period: Joi.string().valid('hourly', 'monthly', 'yearly').default('yearly').label('Salary Period'),
//     }).required().label('Salary Information'),
//   })
//     .messages(customMessages)
//     .validate(data, { abortEarly: false });

export const validateApplicationDuplicate = (data: any) =>
  Joi.object({
    userId: uuidField().label('User ID'),
    jobId: uuidField().label('Job ID'),
    applicationData: Joi.string().min(50).required().label('Application Content'),
  })
    .messages(customMessages)
    .validate(data, { abortEarly: false });