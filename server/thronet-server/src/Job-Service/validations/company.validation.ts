// validations/company.validation.ts
import Joi from 'joi';
import NodeCache from 'node-cache';

const schemaCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Custom error messages (all in English)
const customMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.uuid': '{#label} must be a valid UUID',
  'string.pattern.base': '{#label} has an invalid format',
  'string.min': '{#label} must be at least {#limit} characters',
  'string.max': '{#label} cannot exceed {#limit} characters',
  'number.min': '{#label} must be at least {#limit}',
  'number.max': '{#label} cannot exceed {#limit}',
  'array.min': '{#label} must contain at least {#limit} items',
  'array.max': '{#label} cannot contain more than {#limit} items',
  'any.only': '{#label} must be a valid value',
};

// Reusable common rules
const uuidSchema = (label: string) =>
  Joi.string()
    .uuid({ version: ['uuidv4'] })
    .required()
    .label(label)
    .messages(customMessages);

const stringRequired = (label: string, min = 1, max = 255) =>
  Joi.string()
    .trim()
    .min(min)
    .max(max)
    .required()
    .label(label)
    .messages(customMessages);

// 1. Company ID validation (simple & reusable)
export const validateCompanyId = (data: any) =>
  Joi.object({
    companyId: uuidSchema('Company ID'),
  })
    .unknown(false)
    .messages(customMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

// 2. Review submission validation
export const validateReviewInput = (data: any) =>
  Joi.object({
    userId: uuidSchema('User ID'),
    rating: Joi.number()
      .min(1)
      .max(5)
      .required()
      .label('Rating')
      .messages(customMessages),
    comment: stringRequired('Comment', 10, 1000),
    role: stringRequired('Role', 2, 100),
    tenure: stringRequired('Tenure', 2, 50),
  })
    .unknown(false)
    .messages(customMessages)
    .validate(data, { abortEarly: false, stripUnknown: true });

// 3. User Profile validation
export const validateUserProfile = (data: any) => {
  const schema = Joi.object({
    userId: uuidSchema('User ID'),

    firstName: stringRequired('First Name', 2, 50).pattern(/^[a-zA-Z\s]+$/),
    lastName: stringRequired('Last Name', 2, 50).pattern(/^[a-zA-Z\s]+$/),

    email: Joi.string()
      .email({ tlds: { allow: false } })
      .lowercase()
      .max(100)
      .required()
      .label('Email')
      .messages(customMessages),

    phone: Joi.string()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .max(16)
      .optional()
      .label('Phone')
      .messages(customMessages),

    headline: stringRequired('Headline', 10, 200),
    summary: Joi.string().trim().min(50).max(1000).optional().label('Summary').messages(customMessages),

    location: Joi.object({
      city: stringRequired('City', 2, 50),
      state: Joi.string().trim().max(50).optional().label('State'),
      country: stringRequired('Country', 2, 50),
      zipCode: Joi.string().pattern(/^[0-9]{5,10}$/).optional().label('Zip Code'),
    }).required().label('Location'),

    experience: Joi.array()
      .items(
        Joi.object({
          experienceId: uuidSchema('Experience ID'),
          title: stringRequired('Job Title', 2, 100),
          company: stringRequired('Company', 2, 100),
          location: Joi.string().max(100).optional().label('Location'),
          startDate: Joi.date().max('now').required().label('Start Date'),
          endDate: Joi.date().greater(Joi.ref('startDate')).optional().label('End Date'),
          current: Joi.boolean().default(false).label('Current Job'),
          description: Joi.string().max(1000).optional().label('Description'),
          skills: Joi.array().items(Joi.string().min(2).max(50)).max(15).optional().label('Skills'),
        })
      )
      .min(1)
      .max(10)
      .required()
      .label('Experience'),

    education: Joi.array()
      .items(
        Joi.object({
          educationId: uuidSchema('Education ID'),
          institution: stringRequired('Institution', 2, 100),
          degree: stringRequired('Degree', 2, 100),
          fieldOfStudy: Joi.string().max(100).optional().label('Field of Study'),
          startDate: Joi.date().required().label('Start Date'),
          endDate: Joi.date().greater(Joi.ref('startDate')).optional().label('End Date'),
          gpa: Joi.number().min(0).max(10).precision(2).optional().label('GPA'),
          description: Joi.string().max(500).optional().label('Description'),
        })
      )
      .min(0)
      .max(8)
      .label('Education'),

    skills: Joi.array()
      .items(
        Joi.object({
          skillId: uuidSchema('Skill ID'),
          name: stringRequired('Skill Name', 2, 50),
          level: Joi.string()
            .valid('Beginner', 'Intermediate', 'Advanced', 'Expert')
            .default('Intermediate')
            .label('Skill Level'),
          endorsed: Joi.boolean().default(false).label('Endorsed'),
          yearsOfExperience: Joi.number().min(0).max(50).optional().label('Years of Experience'),
        })
      )
      .min(3)
      .max(30)
      .required()
      .label('Skills'),

    jobPreferences: Joi.object({
      jobTypes: Joi.array()
        .items(Joi.string().valid('Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Remote'))
        .min(1)
        .required()
        .label('Job Types'),
      salaryRange: Joi.object({
        min: Joi.number().min(0).required().label('Minimum Salary'),
        max: Joi.number().greater(Joi.ref('min')).optional().label('Maximum Salary'),
        currency: Joi.string().valid('USD', 'INR', 'EUR', 'GBP').default('USD').label('Currency'),
        period: Joi.string().valid('hourly', 'monthly', 'yearly').default('yearly').label('Period'),
      }).optional(),
      remoteWork: Joi.boolean().default(false).label('Remote Work'),
      willingToRelocate: Joi.boolean().default(false).label('Willing to Relocate'),
      preferredLocations: Joi.array().items(stringRequired('Location', 2, 100)).max(10).optional(),
      industries: Joi.array().items(stringRequired('Industry', 2, 100)).max(8).optional(),
    }).required().label('Job Preferences'),

    socialLinks: Joi.object({
      linkedIn: Joi.string().uri().max(500).optional().label('LinkedIn'),
      github: Joi.string().uri().max(500).optional().label('GitHub'),
      portfolio: Joi.string().uri().max(500).optional().label('Portfolio'),
      twitter: Joi.string().uri().max(500).optional().label('Twitter'),
    }).optional(),

    privacy: Joi.object({
      profileVisible: Joi.boolean().default(true).label('Profile Visible'),
      contactInfoVisible: Joi.boolean().default(false).label('Contact Info Visible'),
      openToOpportunities: Joi.boolean().default(true).label('Open to Opportunities'),
    }).default({}).label('Privacy Settings'),
  })
    .unknown(false)
    .messages(customMessages);

  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};

// 4. Pagination validation (reusable across the app)
export const validatePaginationParams = (data: any) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).max(1000).default(1).label('Page'),
    cursor: Joi.string().optional().label('Cursor'),
    limit: Joi.number().integer().min(1).max(100).default(20).label('Limit'),
    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt', 'name', 'relevance', 'salary', 'experience', 'views', 'applications')
      .default('createdAt')
      .label('Sort By'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc').label('Sort Order'),
    search: Joi.string().trim().min(1).max(200).optional().label('Search Term'),
    filters: Joi.object().optional().label('Filters'),
  })
    .unknown(true) // Allow custom filters
    .messages(customMessages);

  return schema.validate(data, { abortEarly: false, stripUnknown: false });
};

// 5. Matching params validation (large but structured)
export const validateMatchingParams = (data: any) => {
  const schema = Joi.object({
    userId: uuidSchema('User ID'),
    jobTitle: stringRequired('Job Title', 2, 100).optional(),
    keywords: Joi.array().items(Joi.string().trim().min(2).max(50)).min(1).max(15).optional().label('Keywords'),
    location: Joi.object({
      city: Joi.string().max(100).optional(),
      state: Joi.string().max(100).optional(),
      country: Joi.string().max(100).optional(),
      radius: Joi.number().min(0).max(500).default(50).optional(),
      remote: Joi.boolean().default(false),
    }).optional(),
    jobType: Joi.array()
      .items(Joi.string().valid('Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Remote'))
      .max(5)
      .optional(),
    experienceLevel: Joi.array()
      .items(Joi.string().valid('Entry-level', 'Mid-level', 'Senior-level', 'Executive', 'Internship'))
      .max(5)
      .optional(),
    salaryRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().greater(Joi.ref('min')).optional(),
      currency: Joi.string().valid('USD', 'INR', 'EUR', 'GBP').default('USD'),
      period: Joi.string().valid('hourly', 'monthly', 'yearly').default('yearly'),
    }).optional(),
    industries: Joi.array().items(stringRequired('Industry', 2, 100)).max(10).optional(),
    companySize: Joi.array()
      .items(Joi.string().valid('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'))
      .max(5)
      .optional(),
    matchingCriteria: Joi.object({
      skillsWeight: Joi.number().min(0).max(1).default(0.4),
      experienceWeight: Joi.number().min(0).max(1).default(0.3),
      locationWeight: Joi.number().min(0).max(1).default(0.2),
      salaryWeight: Joi.number().min(0).max(1).default(0.1),
      minimumMatchScore: Joi.number().min(0).max(100).default(70),
    }).default({}),
    requiredSkills: Joi.array().items(Joi.string().min(2).max(50)).max(10).optional(),
    preferredSkills: Joi.array().items(Joi.string().min(2).max(50)).max(15).optional(),
    excludedCompanies: Joi.array().items(uuidSchema('Excluded Company ID')).max(20).optional(),
    datePosted: Joi.string()
      .valid('today', 'last-3-days', 'last-week', 'last-month', 'any-time')
      .default('any-time'),
    booleanQuery: Joi.string().max(500).optional(),
  })
    .unknown(false)
    .messages(customMessages);

  return schema.validate(data, { abortEarly: false, stripUnknown: true });
};