// validations/sort.validations.ts
import Joi from 'joi';

// Custom error messages (all in English)
const customMessages = {
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.max': '{#label} cannot exceed {#limit} characters',
  'number.min': '{#label} must be at least {#limit}',
  'number.max': '{#label} cannot exceed {#limit}',
  'any.only': '{#label} must be a valid value',
  'array.min': '{#label} must contain at least {#limit} items',
  'array.max': '{#label} cannot contain more than {#limit} items',
};

// Reusable rules
const stringOptional = (label: string, max = 200) =>
  Joi.string()
    .trim()
    .max(max)
    .optional()
    .allow('')
    .label(label)
    .messages(customMessages);

export const validateSortInput = (input: any) => {
  const schema = Joi.object({
    // Sort Options
    sortBy: Joi.string()
      .valid(
        'relevance',
        'date',
        'salary-high',
        'salary-low',
        'company-rating',
        'applications',
        'views',
        'trending',
        'match-score',
        'distance',
        'company-size',
        'experience-match',
        'deadline',
        'alphabetical',
        'featured',
        'urgency'
      )
      .default('relevance')
      .label('Sort By')
      .messages({
        ...customMessages,
        'any.only': '{#label} must be one of the allowed sort options',
      }),

    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .label('Sort Order')
      .messages(customMessages),

    // Contextual Filters (used for sorting logic)
    query: stringOptional('Search Query', 200),

    location: stringOptional('Location', 100),

    userLat: Joi.number()
      .min(-90)
      .max(90)
      .optional()
      .label('User Latitude'),

    userLng: Joi.number()
      .min(-180)
      .max(180)
      .optional()
      .label('User Longitude'),

    userSkills: Joi.array()
      .items(Joi.string().trim().max(100))
      .max(20)
      .optional()
      .label('User Skills (for match scoring)'),

    userExperience: Joi.number()
      .min(0)
      .max(50)
      .optional()
      .label('User Experience (years)'),

    // Pagination
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

    // Additional Context
    userId: Joi.string().trim().optional().label('User ID'),

    includeExpired: Joi.boolean()
      .default(false)
      .label('Include Expired Jobs'),

    minSalary: Joi.number()
      .min(0)
      .optional()
      .label('Minimum Salary Filter'),

    maxSalary: Joi.number()
      .min(0)
      .optional()
      .label('Maximum Salary Filter'),
  })
    .custom((value, helpers) => {
      // Optional: require both lat & lng if one is provided
      if ((value.userLat !== undefined) !== (value.userLng !== undefined)) {
        return helpers.error('object.coordinatesIncomplete');
      }
      return value;
    })
    .messages({
      ...customMessages,
      'object.coordinatesIncomplete': 'Both userLat and userLng must be provided together for distance sorting',
    })
    .unknown(false) // Reject unknown fields (security)
    .messages(customMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};