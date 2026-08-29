// validations/job.validations.ts
import Joi from 'joi';

// Custom error messages (all in English)
const customMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.uuid': '{#label} must be a valid UUID',
  'string.pattern.base': '{#label} contains invalid characters',
  'string.min': '{#label} must be at least {#limit} characters',
  'string.max': '{#label} cannot exceed {#limit} characters',
  'number.min': '{#label} must be at least {#limit}',
  'number.max': '{#label} cannot exceed {#limit}',
  'array.min': '{#label} must contain at least {#limit} items',
  'array.max': '{#label} cannot contain more than {#limit} items',
  'any.only': '{#label} must be a valid value',
  'object.salaryRangeInvalid': 'Maximum salary must be greater than minimum',
  'object.experienceRangeInvalid': 'Maximum experience must be greater than minimum',
  'string.unsafeContent': 'Input contains unsafe content (e.g., scripts)',
};

// Reusable rules
const uuidSchema = () =>
  Joi.string().uuid({ version: ['uuidv4'] }).required().messages(customMessages);

const stringRequired = (label: string, min = 1, max = 255) =>
  Joi.string().trim().min(min).max(max).required().label(label).messages(customMessages);

// 1. Normalize array fields helper (unchanged - it's good)
export const normalizeArrayFields = (data: any) => {
  const arrayFields = ['skills', 'searchKeywords', 'tags', 'diversityTags'];

  const nestedArrayFields = {
    requirements: ['certifications', 'mandatorySkills', 'preferredSkills'],
    benefits: ['others'],
  };

  // Normalize top-level arrays
  arrayFields.forEach((field) => {
    if (data[field] && typeof data[field] === 'object' && !Array.isArray(data[field])) {
      data[field] = Object.values(data[field]);
    }
  });

  // Normalize nested arrays
  Object.keys(nestedArrayFields).forEach((parent) => {
    if (data[parent]) {
      nestedArrayFields[parent].forEach((field) => {
        if (
          data[parent][field] &&
          typeof data[parent][field] === 'object' &&
          !Array.isArray(data[parent][field])
        ) {
          data[parent][field] = Object.values(data[parent][field]);
        }
      });
    }
  });

  return data;
};

// 2. Create Job Validation (POST /jobs)
export const validateCreateJobInput = (input: any) => {
  const schema = Joi.object({
    title: stringRequired('Job Title', 5, 200).pattern(/^[a-zA-Z0-9\s\-.,&()']+$/),

    companyId: uuidSchema().label('Company ID'),

    description: Joi.string()
      .trim()
      .max(10000)
      .required()
      .custom((value, helpers) => {
        if (/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(value)) {
          return helpers.error('string.unsafeContent');
        }
        return value;
      })
      .label('Job Description')
      .messages(customMessages),

    skills: Joi.array()
      .items(
        Joi.object({
          name: stringRequired('Skill Name', 2, 50).pattern(/^[a-zA-Z0-9\s\-.,+#]+$/i),
          weight: Joi.number().min(0).max(1).default(0.5).label('Skill Weight'),
          category: Joi.string()
            .valid('technical', 'soft', 'domain', 'tool', 'framework')
            .default('technical')
            .label('Skill Category'),
        })
      )
      .min(1)
      .required()
      .label('Required Skills'),

    location: Joi.object({
      city: Joi.string().trim().max(100).optional().label('City'),
      state: Joi.string().trim().max(100).optional().label('State'),
      country: Joi.string().trim().max(100).default('India').label('Country'),
      isRemote: Joi.boolean().default(false).label('Remote Option'),
      coordinates: Joi.object({
        type: Joi.string().valid('Point').default('Point'),
        coordinates: Joi.array()
          .items(Joi.number())
          .length(2)
          .custom((value, helpers) => {
            const [lng, lat] = value;
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
              return helpers.error('array.invalidCoordinates');
            }
            return value;
          })
          .optional()
          .label('Coordinates'),
      }).optional(),
    }).label('Job Location'),

    searchKeywords: Joi.array().items(Joi.string().trim().max(50)).optional().label('Search Keywords'),
    tags: Joi.array().items(Joi.string().trim().max(30)).optional().label('Job Tags'),

    createdBy: uuidSchema().label('Created By'),

    jobType: Joi.string()
      .valid('full-time', 'part-time', 'contract', 'freelance', 'internship')
      .required()
      .label('Job Type'),

    salary: Joi.object({
      min: Joi.number().integer().min(0).max(100000000).optional().label('Minimum Salary'),
      max: Joi.number().integer().min(0).max(100000000).optional().label('Maximum Salary'),
      currency: Joi.string().valid('INR', 'USD', 'EUR', 'GBP').default('INR').label('Currency'),
      isNegotiable: Joi.boolean().default(true).label('Negotiable'),
      frequency: Joi.string().valid('hourly', 'monthly', 'yearly').default('yearly').label('Pay Frequency'),
    }).custom((value, helpers) => {
      if (value.min && value.max && value.min > value.max) {
        return helpers.error('object.salaryRangeInvalid');
      }
      return value;
    }).label('Salary'),

    experience: Joi.object({
      level: Joi.string()
        .valid('entry', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive')
        .required()
        .label('Experience Level'),
      minYears: Joi.number().min(0).max(50).default(0).label('Minimum Years'),
      maxYears: Joi.number().min(0).max(50).optional().label('Maximum Years'),
    })
      .custom((value, helpers) => {
        if (value.minYears && value.maxYears && value.minYears > value.maxYears) {
          return helpers.error('object.experienceRangeInvalid');
        }
        return value;
      })
      .required()
      .label('Experience Requirements'),

    requirements: Joi.object({
      education: Joi.string().max(200).optional().label('Education'),
      certifications: Joi.array().items(Joi.string().max(100)).optional().label('Certifications'),
      mandatorySkills: Joi.array().items(Joi.string().max(50)).optional().label('Mandatory Skills'),
      preferredSkills: Joi.array().items(Joi.string().max(50)).optional().label('Preferred Skills'),
    }).optional(),

    benefits: Joi.object({
      healthInsurance: Joi.boolean().default(false),
      paidLeave: Joi.number().min(0).max(365).optional(),
      stockOptions: Joi.boolean().default(false),
      remoteWork: Joi.boolean().default(false),
      flexibleHours: Joi.boolean().default(false),
      others: Joi.array().items(Joi.string().max(100)).optional(),
    }).optional(),

    department: Joi.string().max(100).optional().label('Department'),
    industry: Joi.string()
      .valid('technology', 'healthcare', 'finance', 'education', 'manufacturing', 'retail', 'consulting', 'other')
      .optional()
      .label('Industry'),

    applicationMethod: Joi.string()
      .valid('internal', 'external', 'email', 'linkedin')
      .default('internal')
      .label('Application Method'),

    applicationUrl: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .max(500)
      .optional()
      .label('Application URL'),

    isFeatured: Joi.boolean().default(false).label('Featured Job'),
    isUrgent: Joi.boolean().default(false).label('Urgent Hiring'),

    diversityTags: Joi.array()
      .items(Joi.string().valid('women-friendly', 'lgbtq-friendly', 'disability-friendly', 'minority-friendly'))
      .optional()
      .label('Diversity Tags'),
  })
    .messages(customMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};

// 3. Update Job Validation (PATCH /jobs/:id)
export const validateUpdateJobInput = (input: any) => {
  // Same schema as create, but all fields optional
  const createSchema = validateCreateJobInput.schema; // Reuse base schema

  const updateSchema = createSchema.fork(Object.keys(createSchema.describe().keys), (field) => field.optional());

  return updateSchema
    .min(1) // At least one field must be provided for update
    .messages({
      ...customMessages,
      'object.min': 'At least one field must be provided for update',
    })
    .validate(input, { abortEarly: false, stripUnknown: true });
};

// 4. List/Filter Jobs Validation (GET /jobs)
export const validateListJobsFilters = (input: any) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1).label('Page'),
    limit: Joi.number().integer().min(1).max(100).default(20).label('Limit'),
    title: stringOptional('Job Title', 200),
    companyId: uuidSchema('Company ID').optional(),
    jobType: Joi.string()
      .valid('full-time', 'part-time', 'contract', 'freelance', 'internship')
      .optional()
      .label('Job Type'),
    location: Joi.object({
      city: stringOptional('City', 100),
      state: stringOptional('State', 100),
      country: stringOptional('Country', 100),
      isRemote: Joi.boolean().optional(),
    }).optional(),
    experience: Joi.object({
      level: Joi.string()
        .valid('entry', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive')
        .optional()
        .label('Experience Level'),
      minYears: Joi.number().min(0).max(50).optional(),
      maxYears: Joi.number().min(0).max(50).optional(),
    }).optional(),
    skills: Joi.array().items(Joi.string().trim().max(50)).optional().label('Skills'),
    industry: Joi.string()
      .valid('technology', 'healthcare', 'finance', 'education', 'manufacturing', 'retail', 'consulting', 'other')
      .optional()
      .label('Industry'),
    isFeatured: Joi.boolean().optional(),
    isUrgent: Joi.boolean().optional(),
    diversityTags: Joi.array()
      .items(Joi.string().valid('women-friendly', 'lgbtq-friendly', 'disability-friendly', 'minority-friendly'))
      .optional(),
  })
    .messages(customMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};

// 5. Save Search Validation
export const validateSaveSearchInput = (input: any) => {
  const schema = Joi.object({
    type: Joi.string()
      .valid('location', 'company', 'keyword', 'title')
      .required()
      .label('Search Type'),
    query: Joi.string().trim().min(1).max(500).required().label('Search Query'),
  }).messages(customMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};