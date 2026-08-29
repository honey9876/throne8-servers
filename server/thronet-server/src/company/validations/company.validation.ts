import Joi from 'joi';

const PATTERNS = {
  mongoId: /^[0-9a-fA-F]{24}$/,
  phone: /^\+?1?\d{9,15}$/,
  url: /^https?:\/\/.+/i,
  name: /^[a-zA-Z0-9\s\-&.,'()]*$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
};

// =====================================================
// ENUMS (Define at TOP)
// =====================================================
const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
  'Retail', 'Construction', 'Transportation', 'Media', 'Government',
  'Non-Profit', 'Real Estate', 'Energy', 'Agriculture', 'Hospitality',
  'Consulting', 'Legal', 'Marketing', 'Telecommunications', 'Biotechnology',
  'E-commerce', 'Gaming', 'Cybersecurity', 'Other',
] as const;

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'] as const;
const COMPANY_STATUSES = ['Active', 'Inactive', 'Suspended'] as const;
const SORT_OPTIONS = ['recent', 'name', 'followers', 'oldest'] as const;

const POST_TYPES = ['Blog', 'News', 'Update', 'Achievement'] as const;
const POST_STATUSES = ['Draft', 'Published', 'Archived', 'Scheduled'] as const;
const POST_SORT_OPTIONS = ['recent', 'trending', 'engagement'] as const;
const MEDIA_TYPES = ['Image', 'Video'] as const;

const EMPLOYEE_SORT_OPTIONS = ['recent', 'name', 'advocacy'] as const;

const EVENT_TYPES = ['Conference', 'Webinar', 'Workshop', 'Meetup', 'Networking', 'Other'] as const;
const EVENT_MODES = ['Online', 'Offline', 'Hybrid'] as const;
const EVENT_STATUSES = ['Upcoming', 'Ongoing', 'Completed', 'Cancelled', 'Scheduled'] as const;
const EVENT_SORT_OPTIONS = ['upcoming', 'recent', 'popular'] as const;

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'] as const;
const EXPERIENCE_LEVELS = ['Entry', 'Mid', 'Senior', 'Lead', 'Executive'] as const;
const JOB_LOCATIONS = ['Remote', 'On-site', 'Hybrid'] as const;
const JOB_STATUSES = ['Open', 'Closed', 'On Hold'] as const;
const APPLICATION_STATUSES = ['Applied', 'Shortlisted', 'Rejected', 'Accepted'] as const;
const JOB_SORT_OPTIONS = ['recent', 'popular', 'closing-soon'] as const;

const REVIEW_TYPES = ['Current Employee', 'Former Employee', 'Contractor'] as const;
const REVIEW_SORT_OPTIONS = ['recent', 'helpful', 'rating-high', 'rating-low'] as const;

const ANALYTICS_EVENT_TYPES = [
  'page_view',
  'profile_visit',
  'post_view',
  'post_like',
  'post_comment',
  'post_share',
  'follower_gained',
  'follower_lost',
  'job_posted',
  'job_application',
  'event_hosted',
  'review_received',
] as const;

const TRAFFIC_SOURCES = ['organic', 'direct', 'referral', 'social'] as const;

// =====================================================
// COMPANY VALIDATORS
// =====================================================
export const companyValidators = {
  create: Joi.object({
    companyName: Joi.string()
      .required()
      .trim()
      .min(2)
      .max(100)
      .messages({
        'string.pattern.base': 'Company name contains invalid characters',
        'string.min': 'Company name must be at least 2 characters',
        'any.required': 'Company name is required',
      }),
    tagline: Joi.string().optional().trim().max(200),
    descriptions: Joi.object({
      short: Joi.string().optional().min(10).max(300),
      detailed: Joi.string().optional().max(2000),
      tagline: Joi.string().optional().max(150),
    }).optional(),
    email: Joi.string()
      .required()
      .email()
      .lowercase()
      .trim()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),

    phone: Joi.object({
      country: Joi.string().optional().default('+91').max(4),
      number: Joi.string().required().pattern(/^\d{10,15}$/).messages({
        'string.pattern.base': 'Invalid phone number',
      }),
    }).required().messages({
      'object.base': '"phone" must be an object with country and number fields',
    }),

    website: Joi.string().optional().pattern(PATTERNS.url).messages({
      'string.pattern.base': 'Please provide a valid website URL',
    }),
    industry: Joi.string()
      .required()
      .valid(...INDUSTRIES)
      .messages({
        'any.only': `Industry must be one of: ${INDUSTRIES.join(', ')}`,
        'any.required': 'Industry is required',
      }),
    size: Joi.string()
      .required()
      .valid(...COMPANY_SIZES)
      .messages({
        'any.only': `Company size must be one of: ${COMPANY_SIZES.join(', ')}`,
        'any.required': 'Company size is required',
      }),
    founded: Joi.number()
      .optional()
      .integer()
      .min(1800)
      .max(new Date().getFullYear())
      .messages({
        'number.min': 'Founded year must be after 1800',
        'number.max': 'Founded year cannot be in the future',
      }),

    headquarters: Joi.object({
      address: Joi.string().required().max(200),
      city: Joi.string().required().max(50),
      state: Joi.string().required().max(50),
      country: Joi.string().optional().default('India').max(50),
      pincode: Joi.string().optional().max(10),
    }).required(),

    socialMedia: Joi.object({
      linkedin: Joi.string().optional(),
      twitter: Joi.string().optional(),
      facebook: Joi.string().optional(),
      instagram: Joi.string().optional(),
      youtube: Joi.string().optional(),
      github: Joi.string().optional(),
    }).optional(),

    logo: Joi.string().optional().pattern(PATTERNS.url),
    banner: Joi.string().optional().pattern(PATTERNS.url),
    status: Joi.string().optional().valid(...COMPANY_STATUSES).default('Active'),
    isVerified: Joi.boolean().optional().default(false),
    createdBy: Joi.string().uuid().optional(),
  }).required(),

  update: Joi.object({
    name: Joi.string().optional().trim().min(2).max(100),
    companyName: Joi.string().optional().trim().min(2).max(100),
    tagline: Joi.string().optional().allow('').trim().max(200),
    description: Joi.string().optional().allow('').trim().max(5000),
    descriptions: Joi.object({
      tagline: Joi.string().optional().allow('').max(200),
      short: Joi.string().optional().allow('').max(5000),
      detailed: Joi.string().optional().allow('').max(10000),
    }).optional(),
    email: Joi.string().optional().email().lowercase().trim(),
    phone: Joi.string().optional().allow('').pattern(PATTERNS.phone),
    website: Joi.string().optional().allow(''),
    industry: Joi.string().optional().allow(''),
    size: Joi.string().optional().allow(''),
    companySize: Joi.string().optional().allow(''),
    founded: Joi.number().optional().integer().min(1800).max(new Date().getFullYear()),
    foundedYear: Joi.number().optional().integer().min(1800).max(new Date().getFullYear()),
    headquarters: Joi.object().unknown(true).optional(),
    socialMedia: Joi.object().unknown(true).optional(),
    socialLinks: Joi.object().unknown(true).optional(),
    logo: Joi.string().optional().allow(''),
    banner: Joi.string().optional().allow(''),
    status: Joi.string().optional().valid(...COMPANY_STATUSES),
    isVerified: Joi.boolean().optional(),
  }).unknown(true).min(1).required(),

  partialUpdate: Joi.object({
    name: Joi.string().optional().trim().min(2).max(100),
    companyName: Joi.string().optional().trim().min(2).max(100),
    slug: Joi.string().optional().lowercase().trim().min(2).max(100),
    companySlug: Joi.string().optional().lowercase().trim().min(2).max(100),
    tagline: Joi.string().optional().allow('').trim().max(200),
    description: Joi.string().optional().allow('').trim().max(5000),
    descriptions: Joi.object({
      tagline: Joi.string().optional().allow('').max(200),
      short: Joi.string().optional().allow('').max(5000),
      detailed: Joi.string().optional().allow('').max(10000),
    }).optional(),
    email: Joi.string().optional().email().lowercase().trim(),
    phone: Joi.string().optional().allow('').pattern(PATTERNS.phone),
    website: Joi.string().optional().allow(''),
    industry: Joi.string().optional().allow(''),
    size: Joi.string().optional().allow(''),
    companySize: Joi.string().optional().allow(''),
    founded: Joi.number().optional().integer().min(1800).max(new Date().getFullYear()),
    foundedYear: Joi.number().optional().integer().min(1800).max(new Date().getFullYear()),
    headquarters: Joi.object().unknown(true).optional(),
    socialMedia: Joi.object().unknown(true).optional(),
    socialLinks: Joi.object().unknown(true).optional(),
    logo: Joi.string().optional().allow(''),
    banner: Joi.string().optional().allow(''),
    status: Joi.string().optional().valid(...COMPANY_STATUSES),
    isVerified: Joi.boolean().optional(),
  }).unknown(true).min(1).required(),

  query: Joi.object({
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
    search: Joi.string().optional().trim().max(100),
    industry: Joi.string().optional().valid(...INDUSTRIES),
    size: Joi.string().optional().valid(...COMPANY_SIZES),
    status: Joi.string().optional().valid(...COMPANY_STATUSES),
    isVerified: Joi.boolean().optional(),
    sort: Joi.string().optional().valid(...SORT_OPTIONS).default('recent'),
  }).optional(),

  search: Joi.object({
    q: Joi.string().required().trim().min(1).max(100),
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
  }).required(),

  nearby: Joi.object({
    longitude: Joi.number().required().min(-180).max(180),
    latitude: Joi.number().required().min(-90).max(90),
    maxDistance: Joi.number().optional().integer().min(1).max(50000000).default(50000),
  }).required(),

  id: Joi.object({
    id: Joi.string()
      .required()
      .messages({
        'any.required': 'Company ID is required',
      }),
  }).required(),

  slug: Joi.object({
    slug: Joi.string().required().trim().min(1).max(200).pattern(PATTERNS.slug),
  }).required(),

  idWithLogoId: Joi.object({
    id: Joi.string().required(),
    logoId: Joi.string().required(),
  }),

  idWithCoverId: Joi.object({
    id: Joi.string().required(),
    coverId: Joi.string().required(),
  }),

  socialLinks: Joi.object({
    socialLinks: Joi.object({
      website: Joi.string().pattern(PATTERNS.url).optional(),
      linkedin: Joi.string().pattern(PATTERNS.url).optional(),
      twitter: Joi.string().pattern(PATTERNS.url).optional(),
      facebook: Joi.string().pattern(PATTERNS.url).optional(),
      instagram: Joi.string().pattern(PATTERNS.url).optional(),
      youtube: Joi.string().pattern(PATTERNS.url).optional(),
    }).min(1).required(),
  }).required(),
};
// =====================================================
// POST VALIDATORS
// =====================================================
export const postValidators = {
  create: Joi.object({
    title: Joi.string()
      .required()
      .trim()
      .min(3)
      .max(200)
      .messages({
        'string.min': 'Title must be at least 3 characters',
        'string.max': 'Title cannot exceed 200 characters',
        'any.required': 'Title is required',
      }),

    content: Joi.string()
      .optional()
      .allow('', null)
      .trim(),

    company: Joi.string()
      .optional()
      .allow('', null),

    companyId: Joi.string()
      .optional()
      .allow('', null),

    author: Joi.string()
      .optional()
      .allow('', null)
      .messages({
        'string.base': 'Author ID must be a valid string',
      }),

    authorId: Joi.string()
      .optional()
      .allow('', null),

    type: Joi.string()
      .optional()
      .valid(...POST_TYPES, 'blog', 'news', 'update', 'achievement', 'Blog', 'News', 'Update', 'Achievement')
      .default('Blog')
      .messages({
        'any.only': `Post type must be one of: ${POST_TYPES.join(', ')}`,
      }),

    postType: Joi.string()
      .optional()
      .valid(...POST_TYPES, 'blog', 'news', 'update', 'achievement', 'Blog', 'News', 'Update', 'Achievement'),

    status: Joi.string()
      .optional()
      .valid(...POST_STATUSES, 'draft', 'published', 'scheduled', 'archived', 'Draft', 'Published', 'Scheduled', 'Archived')
      .allow('', null),

    media: Joi.alternatives()
      .try(
        Joi.array()
          .items(
            Joi.object({
              url: Joi.string().required(),
              type: Joi.string().required().valid(...MEDIA_TYPES),
              caption: Joi.string().optional().allow('').trim().max(500),
            })
          )
          .max(10),
        Joi.string().custom((value, helpers) => {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) return helpers.error('any.invalid');
            return parsed;
          } catch {
            return helpers.error('any.invalid');
          }
        })
      )
      .optional(),

    existingMedia: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          url: Joi.string().required(),
          type: Joi.string().required().valid(...MEDIA_TYPES),
          caption: Joi.string().optional().allow('').trim().max(500),
        })
      ).max(10),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),

    tags: Joi.alternatives()
      .try(
        Joi.array()
          .items(Joi.string().trim().lowercase().max(50))
          .max(20),
        Joi.string().custom((value, helpers) => {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) {
              return [value.trim().toLowerCase()];
            }
            return parsed.map((t: string) => String(t).trim().toLowerCase());
          } catch {
            return value.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean);
          }
        })
      )
      .optional()
      .allow('', null),

    scheduledFor: Joi.date()
      .optional()
      .allow(null, '')
      .greater('now')
      .messages({
        'date.greater': 'Scheduled date must be in the future',
      }),

    scheduledAt: Joi.date()
      .optional()
      .allow(null, '')
      .greater('now')
      .messages({
        'date.greater': 'Scheduled date must be in the future',
      }),

    pollData: Joi.alternatives()
      .try(
        Joi.object({
          question: Joi.string()
            .max(140)
            .required()
            .messages({
              'string.max': 'Poll question cannot exceed 140 characters',
              'any.required': 'Poll question is required',
            }),
          options: Joi.array()
            .items(Joi.string().max(100).required())
            .min(2)
            .max(4)
            .required()
            .messages({
              'array.min': 'Poll must have at least 2 options',
              'array.max': 'Poll cannot have more than 4 options',
              'string.max': 'Each option cannot exceed 100 characters',
            }),
          duration: Joi.number()
            .valid(1, 3, 7, 14)
            .required()
            .messages({
              'any.only': 'Duration must be 1, 3, 7, or 14 days',
              'any.required': 'Poll duration is required',
            }),
        }),
        Joi.string().custom((value, helpers) => {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed !== 'object' || parsed === null) {
              return helpers.error('any.invalid');
            }
            if (!parsed.question || typeof parsed.question !== 'string') {
              return helpers.error('any.invalid');
            }
            if (!Array.isArray(parsed.options) || parsed.options.length < 2 || parsed.options.length > 4) {
              return helpers.error('any.invalid');
            }
            if (![1, 3, 7, 14].includes(parsed.duration)) {
              return helpers.error('any.invalid');
            }
            return parsed;
          } catch {
            return helpers.error('any.invalid');
          }
        }).messages({
          'any.invalid': 'pollData must be a valid JSON object with question, options, and duration',
        })
      )
      .optional()
      .allow(null, ''),

    documents: Joi.alternatives()
      .try(
        Joi.array()
          .items(
            Joi.object({
              url: Joi.string().optional(),
              type: Joi.string()
                .valid('PDF', 'DOC', 'DOCX', 'TXT')
                .optional(),
              name: Joi.string().optional().max(255),
              caption: Joi.string().optional().trim().max(500),
            })
          )
          .max(5),
        Joi.string().custom((value, helpers) => {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) return helpers.error('any.invalid');
            return parsed;
          } catch {
            return helpers.error('any.invalid');
          }
        })
      )
      .optional()
      .allow(null, ''),

    images: Joi.any().optional(),
    videos: Joi.any().optional(),
    attachments: Joi.any().optional(),
    visibility: Joi.string().optional().allow('', null),
    hasPoll: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
  }).unknown(true).required(),

  // ✅ SAME — standalone media validator (routes mein alag use ke liye)
  media: Joi.array()
    .optional()
    .items(
      Joi.object({
        url: Joi.string().required().pattern(PATTERNS.url),
        type: Joi.string().required().valid(...MEDIA_TYPES),
        caption: Joi.string().optional().trim().max(500),
      })
    )
    .max(10),

  // ✅ SAME — standalone pollData validator (alag routes ke liye)
  pollData: Joi.object({
    question: Joi.string().max(140).required(),
    options: Joi.array()
      .items(Joi.string().max(100).required())
      .min(2)
      .max(4)
      .required(),
    duration: Joi.number().valid(1, 3, 7, 14).required(),
  }).optional(),

  update: Joi.object({
    title: Joi.string().optional().trim().min(5).max(200),
    content: Joi.string().optional().allow('', null).trim(),
    type: Joi.string().optional().valid(...POST_TYPES),
    media: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          url: Joi.string().required(),
          type: Joi.string().required().valid(...MEDIA_TYPES),
          caption: Joi.string().optional().allow('').trim().max(500),
        })
      ).max(10),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),
    existingMedia: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          url: Joi.string().required(),
          type: Joi.string().required().valid(...MEDIA_TYPES),
          caption: Joi.string().optional().allow('').trim().max(500),
        })
      ).max(10),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),
    tags: Joi.alternatives().try(
      Joi.array().items(Joi.string().trim().lowercase().max(50)).max(20),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed.map((t: string) => t.trim().toLowerCase());
        } catch {
          return [value.trim().toLowerCase()];
        }
      })
    ).optional(),
    status: Joi.string().optional().valid(...POST_STATUSES),
  }).unknown(true).min(1).required(),

  partialUpdate: Joi.object({
    title: Joi.string().optional().trim().min(5).max(200),
    content: Joi.string().optional().allow('', null).trim(),
    type: Joi.string().optional().valid(...POST_TYPES),
    media: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          url: Joi.string().required(),
          type: Joi.string().required().valid(...MEDIA_TYPES),
          caption: Joi.string().optional().allow('').trim().max(500),
        })
      ).max(10),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),
    existingMedia: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          url: Joi.string().required(),
          type: Joi.string().required().valid(...MEDIA_TYPES),
          caption: Joi.string().optional().allow('').trim().max(500),
        })
      ).max(10),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),
    tags: Joi.alternatives().try(
      Joi.array().items(Joi.string().trim().lowercase().max(50)).max(20),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed.map((t: string) => t.trim().toLowerCase());
        } catch {
          return [value.trim().toLowerCase()];
        }
      })
    ).optional(),
    status: Joi.string().optional().valid(...POST_STATUSES),
  }).unknown(true).min(1).required(),

  query: Joi.object({
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
    company: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    author: Joi.string().optional().pattern(PATTERNS.mongoId),
    type: Joi.string().optional().valid(...POST_TYPES),
    status: Joi.string().optional().valid(...POST_STATUSES),
    search: Joi.string().optional().trim().max(100),
    tags: Joi.string().optional(),
    sort: Joi.string().optional().valid(...POST_SORT_OPTIONS).default('recent'),
  }).optional(),

  search: Joi.object({
    q: Joi.string().required().trim().min(1).max(100),
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
  }).required(),

  id: Joi.object({
    id: Joi.string()
      .required()
      .messages({
        'any.required': 'Post ID is required',
      }),
  }).required(),

  authorId: Joi.object({
    id: Joi.string()
      .required()
      .messages({
        'any.required': 'Author ID is required',
      }),
  }).required(),

  slug: Joi.object({
    slug: Joi.string().required().trim().min(1).max(200).pattern(PATTERNS.slug),
  }).required(),

  companyId: Joi.object({
    id: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
      }),
  }).required(),

  schedule: Joi.object({
    scheduledFor: Joi.date()
      .required()
      .greater('now')
      .messages({
        'date.greater': 'Scheduled date must be in the future',
        'any.required': 'Scheduled date is required',
      }),
  }).required(),
};

// =====================================================
// EMPLOYEE VALIDATORS
// =====================================================
export const employeeValidators = {
  create: Joi.object({
    firstName: Joi.string()
      .required()
      .trim()
      .min(2)
      .max(50)
      .messages({
        'string.min': 'First name must be at least 2 characters',
        'any.required': 'First name is required',
      }),
    lastName: Joi.string()
      .required()
      .trim()
      .min(2)
      .max(50)
      .messages({
        'string.min': 'Last name must be at least 2 characters',
        'any.required': 'Last name is required',
      }),
    email: Joi.string()
      .required()
      .email()
      .lowercase()
      .trim()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    company: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    designation: Joi.string()
      .required()
      .trim()
      .min(2)
      .max(100)
      .messages({
        'string.min': 'Designation must be at least 2 characters',
        'any.required': 'Designation is required',
      }),
    department: Joi.string().optional().trim().max(100),
    profileImage: Joi.string().optional().pattern(PATTERNS.url),
    bio: Joi.string().optional().trim().max(1000),
    phone: Joi.string().optional().pattern(PATTERNS.phone).messages({
      'string.pattern.base': 'Please provide a valid phone number',
    }),
    location: Joi.object({
      city: Joi.string().optional().trim().max(100),
      state: Joi.string().optional().trim().max(100),
      country: Joi.string().optional().trim().max(100),
    }).optional(),
    joinDate: Joi.date()
      .required()
      .max('now')
      .messages({
        'date.max': 'Join date cannot be in the future',
        'any.required': 'Join date is required',
      }),
    skills: Joi.array()
      .optional()
      .items(Joi.string().trim().lowercase().max(50))
      .max(30)
      .messages({
        'array.max': 'Maximum 30 skills allowed',
      }),
    socialLinks: Joi.object({
      linkedin: Joi.string().pattern(PATTERNS.url).optional(),
      twitter: Joi.string().pattern(PATTERNS.url).optional(),
      github: Joi.string().pattern(PATTERNS.url).optional(),
    }).optional(),
  }).required(),

  update: Joi.object({
    firstName: Joi.string().optional().trim().min(2).max(50),
    lastName: Joi.string().optional().trim().min(2).max(50),
    designation: Joi.string().optional().trim().min(2).max(100),
    department: Joi.string().optional().trim().max(100),
    profileImage: Joi.string().optional().pattern(PATTERNS.url),
    bio: Joi.string().optional().trim().max(1000),
    phone: Joi.string().optional().pattern(PATTERNS.phone),
    location: Joi.object({
      city: Joi.string().optional().trim().max(100),
      state: Joi.string().optional().trim().max(100),
      country: Joi.string().optional().trim().max(100),
    }).optional(),
    skills: Joi.array().optional().items(Joi.string().trim().lowercase().max(50)).max(30),
    socialLinks: Joi.object({
      linkedin: Joi.string().pattern(PATTERNS.url).optional(),
      twitter: Joi.string().pattern(PATTERNS.url).optional(),
      github: Joi.string().pattern(PATTERNS.url).optional(),
    }).optional(),
    endDate: Joi.date().optional(),
    isActive: Joi.boolean().optional(),
  }).min(1).required(),

  partialUpdate: Joi.object({
    firstName: Joi.string().optional().trim().min(2).max(50),
    lastName: Joi.string().optional().trim().min(2).max(50),
    designation: Joi.string().optional().trim().min(2).max(100),
    department: Joi.string().optional().trim().max(100),
    profileImage: Joi.string().optional().pattern(PATTERNS.url),
    bio: Joi.string().optional().trim().max(1000),
    phone: Joi.string().optional().pattern(PATTERNS.phone),
    location: Joi.object({
      city: Joi.string().optional().trim().max(100),
      state: Joi.string().optional().trim().max(100),
      country: Joi.string().optional().trim().max(100),
    }).optional(),
    skills: Joi.array().optional().items(Joi.string().trim().lowercase().max(50)),
    socialLinks: Joi.object({
      linkedin: Joi.string().pattern(PATTERNS.url).optional(),
      twitter: Joi.string().pattern(PATTERNS.url).optional(),
      github: Joi.string().pattern(PATTERNS.url).optional(),
    }).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1).required(),

  query: Joi.object({
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
    company: Joi.string().optional().uuid({ version: ['uuidv4'] }),
    department: Joi.string().optional().trim().max(100),
    designation: Joi.string().optional().trim().max(100),
    search: Joi.string().optional().trim().max(100),
    isActive: Joi.boolean().optional().truthy('true').falsy('false'),
    sort: Joi.string().optional().valid(...EMPLOYEE_SORT_OPTIONS).default('recent'),
  }).optional(),

  search: Joi.object({
    q: Joi.string().required().trim().min(1).max(100),
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
  }).required(),

  advocacyParams: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    employeeId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Employee ID must be a valid UUID v4',
        'any.required': 'Employee ID is required',
      }),
  }).required(),

  assignAdvocacyBody: Joi.object({
    isAdvocate: Joi.boolean().required().messages({
      'any.required': 'isAdvocate (true/false) is required',
      'boolean.base': 'isAdvocate must be true or false',
    }),
  }).required(),

  id: Joi.object({
    id: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Employee ID must be a valid UUID v4',
        'any.required': 'Employee ID is required',
      }),
  }).required(),

  companyId: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
  }).required(),
};

// =====================================================
// EVENT VALIDATORS
// =====================================================
export const eventValidators = {
  create: Joi.object({
    title: Joi.string()
      .required()
      .trim()
      .min(5)
      .max(200)
      .messages({
        'string.min': 'Event title must be at least 5 characters',
        'string.max': 'Event title cannot exceed 200 characters',
        'any.required': 'Event title is required',
      }),
    description: Joi.string().optional().trim().max(5000),
    companyId: Joi
      .string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    type: Joi.string()
      .optional()
      .valid(...EVENT_TYPES)
      .default('Conference'),
    startDate: Joi.date()
      .required()
      .greater('now')
      .messages({
        'date.greater': 'Event start date must be in the future',
        'any.required': 'Event start date is required',
      }),
    startTimeOfDay: Joi.string()
      .optional()
      .valid('Morning', 'Afternoon', 'Evening', 'Night'),
    endDate: Joi.date().optional().greater(Joi.ref('startDate')),
    location: Joi.alternatives().try(
      Joi.object({
        venue: Joi.string().optional().trim().max(200),
        address: Joi.string().optional().trim().max(500),
        city: Joi.string().optional().trim().max(100),
        state: Joi.string().optional().trim().max(100),
        country: Joi.string().optional().trim().max(100),
        zipCode: Joi.string().optional().trim().max(20),
      }),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed !== 'object' || parsed === null) {
            return helpers.error('any.invalid');
          }
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),

    speakers: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          name: Joi.string().required().trim().max(100),
          designation: Joi.string().optional().trim().max(100),
          company: Joi.string().optional().trim().max(100),
          bio: Joi.string().optional().trim().max(500),
          image: Joi.string().optional().pattern(PATTERNS.url),
        })
      ).max(50),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),
    mode: Joi.string()
      .optional()
      .valid(...EVENT_MODES)
      .default('Offline'),
    visibility: Joi.string()
      .optional()
      .valid('Public', 'Private')
      .default('Public'),
    eventLink: Joi.string().optional().pattern(PATTERNS.url),
    banner: Joi.string().optional().pattern(PATTERNS.url),
    capacity: Joi.number().optional().integer().min(1).max(1000000),
    agenda: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          time: Joi.string().optional().max(20),
          timeOfDay: Joi.string().optional().valid('Morning', 'Afternoon', 'Evening', 'Night'),
          title: Joi.string().required().max(200),
          description: Joi.string().optional().max(500),
          speaker: Joi.string().optional().max(100),
          duration: Joi.number().optional().integer().min(1),
        })
      ).max(50),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch {
          return helpers.error('any.invalid');
        }
      })
    ).optional(),

    status: Joi.string().optional().valid('Upcoming', 'Ongoing', 'Completed', 'Cancelled').default('Upcoming'),

    scheduledFor: Joi.date().optional().greater('now').messages({
      'date.greater': 'Scheduled date must be in the future',
    }),
  }).required(),

  companyId: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
      }),
  }).required(),

  update: Joi.object({
    title: Joi.string().optional().trim().min(5).max(200),
    description: Joi.string().optional().trim().max(5000),
    type: Joi.string().optional().valid(...EVENT_TYPES),
    startDate: Joi.date().optional().greater('now'),
    endDate: Joi.date().optional(),
    startTimeOfDay: Joi.string().optional().valid('Morning', 'Afternoon', 'Evening', 'Night'),
    endTimeOfDay: Joi.string().optional().valid('Morning', 'Afternoon', 'Evening', 'Night'),

    location: Joi.alternatives().try(    // ← fix karo
      Joi.object({
        venue: Joi.string().optional().trim().max(200),
        address: Joi.string().optional().trim().max(500),
        city: Joi.string().optional().trim().max(100),
        state: Joi.string().optional().trim().max(100),
        country: Joi.string().optional().trim().max(100),
        zipCode: Joi.string().optional().trim().max(20),
      }),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed !== 'object' || parsed === null) return helpers.error('any.invalid');
          return parsed;
        } catch { return helpers.error('any.invalid'); }
      })
    ).optional(),

    mode: Joi.string().optional().valid(...EVENT_MODES),
    visibility: Joi.string().optional().valid('Public', 'Private'),
    eventLink: Joi.string().optional().pattern(PATTERNS.url),
    banner: Joi.string().optional().pattern(PATTERNS.url),
    capacity: Joi.number().optional().integer().min(1).max(1000000),

    speakers: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          name: Joi.string().required().trim().max(100),
          designation: Joi.string().optional().trim().max(100),
          company: Joi.string().optional().trim().max(100),
          bio: Joi.string().optional().trim().max(500),
          image: Joi.string().optional().pattern(PATTERNS.url),
        })
      ).max(50),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch { return helpers.error('any.invalid'); }
      })
    ).optional(),

    agenda: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          time: Joi.string().optional().max(20),
          timeOfDay: Joi.string().optional().valid('Morning', 'Afternoon', 'Evening', 'Night'),
          title: Joi.string().required().max(200),
          description: Joi.string().optional().max(500),
          speaker: Joi.string().optional().max(100),
          duration: Joi.number().optional().integer().min(1),
        })
      ).max(50),
      Joi.string().custom((value, helpers) => {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return helpers.error('any.invalid');
          return parsed;
        } catch { return helpers.error('any.invalid'); }
      })
    ).optional(),

    status: Joi.string().optional().valid(...EVENT_STATUSES),
  }).min(1).required(),

  query: Joi.object({
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
    company: Joi.string().optional().pattern(PATTERNS.mongoId),
    type: Joi.string().optional().valid(...EVENT_TYPES),
    mode: Joi.string().optional().valid(...EVENT_MODES),
    status: Joi.string().optional().valid(...EVENT_STATUSES),
    city: Joi.string().optional().trim().max(100),
    search: Joi.string().optional().trim().max(100),
    sort: Joi.string().optional().valid(...EVENT_SORT_OPTIONS).default('upcoming'),
  }).optional(),

  search: Joi.object({
    q: Joi.string().required().trim().min(1).max(100),
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
  }).required(),

  nearby: Joi.object({
    longitude: Joi.number().required().min(-180).max(180),
    latitude: Joi.number().required().min(-90).max(90),
    maxDistance: Joi.number().optional().integer().min(1).max(50000000).default(50000),
  }).required(),

  id: Joi.object({
    id: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Event ID must be a valid UUID v4',
        'any.required': 'Event ID is required',
      }),
  }).required(),

  register: Joi.object({
    employeeId: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })  // ← mongoId se uuid karo
      .messages({
        'string.guid': 'Employee ID must be a valid UUID v4',
      }),
    email: Joi.string().required().email().lowercase().trim(),
  }).required(),

  status: Joi.object({
    status: Joi.string()
      .required()
      .valid(...EVENT_STATUSES)
      .messages({
        'any.only': `Status must be one of: ${EVENT_STATUSES.join(', ')}`,
        'any.required': 'Status is required',
      }),
  }).required(),
};

// =====================================================
// JOB VALIDATORS
// =====================================================
export const jobValidators = {
  create: Joi.object({
    title: Joi.string().required().trim().min(5).max(200),
    description: Joi.string().required().trim().min(50).max(10000),
    company: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    department: Joi.string().optional().trim().max(100),
    type: Joi.string().required().valid(...JOB_TYPES),
    experienceLevel: Joi.string().required().valid(...EXPERIENCE_LEVELS),
    salary: Joi.object({
      min: Joi.number().optional().min(0).max(10000000),
      max: Joi.number().optional().min(0).max(10000000).greater(Joi.ref('min')),
      currency: Joi.string().optional().default('USD').length(3).uppercase(),
    }).optional(),
    location: Joi.string().required().valid(...JOB_LOCATIONS),
    responsibilities: Joi.array().optional().items(Joi.string().trim().max(500)).max(20),
    requirements: Joi.array().optional().items(Joi.string().trim().max(500)).max(20),
    skills: Joi.array().optional().items(Joi.string().trim().lowercase().max(50)).max(30),
    benefits: Joi.array().optional().items(Joi.string().trim().max(200)).max(20),
    closingDate: Joi.date().optional().greater('now'),
  }).required(),

  update: Joi.object({
    title: Joi.string().optional().trim().min(5).max(200),
    description: Joi.string().optional().trim().min(50).max(10000),
    department: Joi.string().optional().trim().max(100),
    type: Joi.string().optional().valid(...JOB_TYPES),
    experienceLevel: Joi.string().optional().valid(...EXPERIENCE_LEVELS),
    salary: Joi.object({
      min: Joi.number().optional().min(0).max(10000000),
      max: Joi.number().optional().min(0).max(10000000),
      currency: Joi.string().optional().length(3).uppercase(),
    }).optional(),
    location: Joi.string().optional().valid(...JOB_LOCATIONS),
    responsibilities: Joi.array().optional().items(Joi.string().trim().max(500)).max(20),
    requirements: Joi.array().optional().items(Joi.string().trim().max(500)).max(20),
    skills: Joi.array().optional().items(Joi.string().trim().lowercase().max(50)).max(30),
    benefits: Joi.array().optional().items(Joi.string().trim().max(200)).max(20),
    status: Joi.string().optional().valid(...JOB_STATUSES),
    closingDate: Joi.date().optional().greater('now'),
  }).min(1).required(),

  query: Joi.object({
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
    company: Joi.string().optional().uuid({ version: ['uuidv4'] }),
    type: Joi.string().optional().valid(...JOB_TYPES),
    experienceLevel: Joi.string().optional().valid(...EXPERIENCE_LEVELS),
    location: Joi.string().optional().valid(...JOB_LOCATIONS),
    status: Joi.string().optional().valid(...JOB_STATUSES),
    search: Joi.string().optional().trim().max(100),
    sort: Joi.string().optional().valid(...JOB_SORT_OPTIONS).default('recent'),
  }).optional(),

  search: Joi.object({
    search: Joi.string().required().trim().min(2).max(100),
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
    type: Joi.string().optional().valid(...JOB_TYPES),
    location: Joi.string().optional().valid(...JOB_LOCATIONS),
    experienceLevel: Joi.string().optional().valid(...EXPERIENCE_LEVELS),
    skills: Joi.string().optional(),
  }).required(),

  apply: Joi.object({
    employeeId: Joi.string().required().pattern(PATTERNS.mongoId),
    resume: Joi.string().required().pattern(PATTERNS.url),
    coverLetter: Joi.string().optional().trim().max(2000),
  }).required(),

  updateApplicationStatus: Joi.object({
    status: Joi.string().required().valid(...APPLICATION_STATUSES),
  }).required(),

  updateStatus: Joi.object({
    status: Joi.string().required().valid(...JOB_STATUSES),
  }).required(),

  id: Joi.object({
    id: Joi.string().required().pattern(PATTERNS.mongoId),
  }).required(),

  companyId: Joi.object({
    companyId: Joi.string().required().pattern(PATTERNS.mongoId),
  }).required(),

  userId: Joi.object({
    userId: Joi.string().required().pattern(PATTERNS.mongoId),
  }).required(),
};

// =====================================================
// REVIEW VALIDATORS
// =====================================================
export const reviewValidators = {
  create: Joi.object({
    company: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    title: Joi.string()
      .min(10)
      .max(200)
      .required()
      .trim()
      .messages({
        'string.min': 'Title must be at least 10 characters',
        'string.max': 'Title cannot exceed 200 characters',
        'any.required': 'Review title is required',
      }),
    content: Joi.string()
      .min(20)
      .max(5000)
      .required()
      .trim()
      .messages({
        'string.min': 'Review content must be at least 20 characters',
        'string.max': 'Review content cannot exceed 5000 characters',
        'any.required': 'Review content is required',
      }),
    rating: Joi.object({
      overall: Joi.number()
        .min(1)
        .max(5)
        .required()
        .messages({
          'number.min': 'Overall rating must be at least 1',
          'number.max': 'Overall rating cannot exceed 5',
          'any.required': 'Overall rating is required',
        }),
      culture: Joi.number().min(1).max(5).optional(),
      workLifeBalance: Joi.number().min(1).max(5).optional(),
      management: Joi.number().min(1).max(5).optional(),
      compensation: Joi.number().min(1).max(5).optional(),
    }).required(),
    type: Joi.string()
      .valid(...REVIEW_TYPES)
      .required()
      .messages({
        'any.only': 'Invalid employment type',
        'any.required': 'Employment type is required',
      }),
    pros: Joi.array()
      .items(Joi.string().trim())
      .max(10)
      .optional()
      .messages({
        'array.max': 'Maximum 10 pros allowed',
      }),
    cons: Joi.array()
      .items(Joi.string().trim())
      .max(10)
      .optional()
      .messages({
        'array.max': 'Maximum 10 cons allowed',
      }),
    recommendToOthers: Joi.boolean().optional(),
  }).required(),

  update: Joi.object({
    title: Joi.string().min(10).max(200).trim().optional(),
    content: Joi.string().min(20).max(5000).trim().optional(),
    rating: Joi.object({
      overall: Joi.number().min(1).max(5).optional(),
      culture: Joi.number().min(1).max(5).optional(),
      workLifeBalance: Joi.number().min(1).max(5).optional(),
      management: Joi.number().min(1).max(5).optional(),
      compensation: Joi.number().min(1).max(5).optional(),
    }).optional(),
    pros: Joi.array().items(Joi.string().trim()).max(10).optional(),
    cons: Joi.array().items(Joi.string().trim()).max(10).optional(),
    recommendToOthers: Joi.boolean().optional(),
  }).min(1).required(),

  query: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    pageSize: Joi.number().integer().min(1).max(100).optional().default(20),
    company: Joi.string().optional().uuid({ version: ['uuidv4'] }),
    type: Joi.string().valid(...REVIEW_TYPES).optional(),
    minRating: Joi.number().min(1).max(5).optional(),
    maxRating: Joi.number().min(1).max(5).optional(),
    isVerified: Joi.boolean().optional(),
    isPublished: Joi.boolean().optional(),
    sort: Joi.string().valid(...REVIEW_SORT_OPTIONS).optional().default('recent'),
  }).optional(),

  vote: Joi.object({
    helpful: Joi.boolean()
      .required()
      .messages({
        'any.required': 'Vote type is required (helpful: true/false)',
      }),
  }).required(),

  addResponse: Joi.object({
    content: Joi.string()
      .min(10)
      .max(2000)
      .required()
      .trim()
      .messages({
        'string.min': 'Response must be at least 10 characters',
        'string.max': 'Response cannot exceed 2000 characters',
        'any.required': 'Response content is required',
      }),
  }).required(),

  moderate: Joi.object({
    publish: Joi.boolean()
      .required()
      .messages({
        'any.required': 'Publish status is required',
      }),
  }).required(),

  id: Joi.object({
    id: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Review ID must be a valid UUID v4',
        'any.required': 'Review ID is required',
      }),
  }).required(),

  companyId: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
  }).required(),
};

// =====================================================
// ANALYTICS VALIDATORS
// =====================================================
export const analyticsValidators = {
  track: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    eventType: Joi.string()
      .valid(...ANALYTICS_EVENT_TYPES)
      .required()
      .messages({
        'any.only': `Event type must be one of: ${ANALYTICS_EVENT_TYPES.join(', ')}`,
        'any.required': 'Event type is required',
      }),
    metadata: Joi.object({
      source: Joi.string().valid(...TRAFFIC_SOURCES).optional(),
      postId: Joi.string().pattern(PATTERNS.mongoId).optional(),
      userId: Joi.string().pattern(PATTERNS.mongoId).optional(),
      page: Joi.string().optional().max(500),
      referrer: Joi.string().optional().max(500),
    }).optional(),
  }).required(),

  trackUser: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required'
      }),
    eventType: Joi.string()
      .valid(
        'search_appearance',
        'page_view',
        'post_impression',
        'follower_gained',
        'follower_lost'
      )
      .required()
      .messages({
        'any.only': 'Invalid event type',
        'any.required': 'Event type is required'
      }),
    postId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .optional(),
    searchQuery: Joi.string()
      .optional()
      .max(200),
  }).required(),

  dashboardV2Query: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required(),
    days: Joi.number()
      .integer()
      .min(1)
      .max(365)
      .optional()
      .default(30),
  }).required(),

  dashboardQuery: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
  }).required(),

  dateRange: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional().greater(Joi.ref('startDate')),
  }).optional(),

  daysQuery: Joi.object({
    days: Joi.number().integer().min(1).max(365).optional().default(30),
  }).optional(),

  weeksQuery: Joi.object({
    weeks: Joi.number().integer().min(1).max(52).optional().default(12),
  }).optional(),

  monthsQuery: Joi.object({
    months: Joi.number().integer().min(1).max(24).optional().default(12),
  }).optional(),

  yearQuery: Joi.object({
    year: Joi.number()
      .integer()
      .min(2020)
      .max(new Date().getFullYear() + 1)
      .optional(),
  }).optional(),

  engagementQuery: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
      }),
    days: Joi.number().integer().min(1).max(365).optional().default(30),
  }).required(),

  trendsQuery: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    days: Joi.number().integer().min(1).max(365).optional().default(30),
  }).required(),

  topPostsQuery: Joi.object({
    companyId: Joi.string().optional().uuid({ version: ['uuidv4'] }),
    limit: Joi.number().integer().min(1).max(50).optional().default(10),
    days: Joi.number().integer().min(1).max(365).optional().default(30),
  }).optional(),

  topCompaniesQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(50).optional().default(10),
    days: Joi.number().integer().min(1).max(90).optional().default(7),
  }).optional(),

  exportQuery: Joi.object({
    companyId: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.pattern.base': 'Invalid company ID format',
        'any.required': 'Company ID is required',
      }),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional().greater(Joi.ref('startDate')),
  }).required(),

  id: Joi.object({
    id: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
  }).required(),

  postId: Joi.object({
    id: Joi.string()
      .uuid({ version: ['uuidv4'] })
      .required()
      .messages({
        'string.guid': 'Post ID must be a valid UUID v4',
        'any.required': 'Post ID is required',
      }),
  }).required(),
};

// =====================================================
// 🔥 FOLLOWER VALIDATORS (NEW)
// =====================================================
export const followerValidators = {
  follow: Joi.object({
    companyId: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
  }).required(),

  companyId: Joi.object({
    companyId: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
  }).required(),

  userId: Joi.object({
    userId: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'User ID must be a valid UUID v4',
        'any.required': 'User ID is required',
      }),
  }).required(),

  paginationQuery: Joi.object({
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
  }).optional(),

  updatePreferences: Joi.object({
    companyId: Joi.string()
      .required()
      .uuid({ version: ['uuidv4'] })
      .messages({
        'string.guid': 'Company ID must be a valid UUID v4',
        'any.required': 'Company ID is required',
      }),
    preferences: Joi.object({
      posts: Joi.boolean().optional(),
      events: Joi.boolean().optional(),
      jobs: Joi.boolean().optional(),
      updates: Joi.boolean().optional(),
    }).min(1).required(),
  }).required(),

  suggestionsQuery: Joi.object({
    limit: Joi.number().optional().integer().min(1).max(50).default(10),
  }).optional(),

  recentQuery: Joi.object({
    days: Joi.number().optional().integer().min(1).max(365).default(7),
  }).optional(),
};

// =====================================================
// ABOUT VALIDATORS — ADD THIS SECTION
// =====================================================
export const aboutValidators = {

  identity: Joi.object({
    story: Joi.string().optional().allow('').trim().max(5000),
    mission: Joi.string().optional().allow('').trim().max(1000),
    vision: Joi.string().optional().allow('').trim().max(1000),
    promises: Joi.array().optional().items(Joi.string().allow('').trim().max(500)).max(20),
    impacts: Joi.array().optional().items(
      Joi.object({
        title: Joi.string().optional().allow('').trim().max(100),
        metric: Joi.string().optional().allow('').trim().max(100),
        description: Joi.string().optional().allow('').trim().max(300),
      }).unknown(true)
    ).max(20),
  }).unknown(true),

  timeline: Joi.object({
    year: Joi.number().required().integer().min(1800).max(new Date().getFullYear() + 1),
    month: Joi.number().optional().integer().min(1).max(12),
    title: Joi.string().required().trim().min(3).max(200),
    description: Joi.string().optional().trim().max(2000),
    type: Joi.string().optional().valid(
      'Founding', 'Product Launch', 'Funding', 'Expansion',
      'Award', 'Milestone', 'Partnership', 'Other'
    ).default('Milestone'),
    icon: Joi.string().optional().trim().max(100),
    isPublished: Joi.boolean().optional().default(true),
  }).required(),

  timelineUpdate: Joi.object({
    year: Joi.number().optional().integer().min(1800).max(new Date().getFullYear() + 1),
    month: Joi.number().optional().integer().min(1).max(12),
    title: Joi.string().optional().trim().min(3).max(200),
    description: Joi.string().optional().trim().max(2000),
    type: Joi.string().optional().valid(
      'Founding', 'Product Launch', 'Funding', 'Expansion',
      'Award', 'Milestone', 'Partnership', 'Other'
    ),
    icon: Joi.string().optional().trim().max(100),
    isPublished: Joi.boolean().optional(),
  }).min(1).required(),

  update: Joi.object({
    title: Joi.string().required().trim().min(5).max(200),
    content: Joi.string().required().trim().min(10).max(10000),
    summary: Joi.string().optional().trim().max(500),
    category: Joi.string().optional().valid(
      'News', 'Press', 'Product', 'Milestone', 'Announcement'
    ).default('Announcement'),
    coverImage: Joi.string().optional().pattern(PATTERNS.url),
    tags: Joi.array().optional().items(Joi.string().lowercase().trim().max(50)).max(20),
    isPublished: Joi.boolean().optional().default(false),
    externalLink: Joi.string().optional().pattern(PATTERNS.url),
  }).required(),

  updatePartial: Joi.object({
    title: Joi.string().optional().trim().min(5).max(200),
    content: Joi.string().optional().trim().min(10).max(10000),
    summary: Joi.string().optional().trim().max(500),
    category: Joi.string().optional().valid('News', 'Press', 'Product', 'Milestone', 'Announcement'),
    coverImage: Joi.string().optional().pattern(PATTERNS.url),
    tags: Joi.array().optional().items(Joi.string().lowercase().trim().max(50)).max(20),
    isPublished: Joi.boolean().optional(),
    externalLink: Joi.string().optional().pattern(PATTERNS.url),
  }).min(1).required(),

  testimonial: Joi.object({
    authorName: Joi.string().required().trim().max(100),
    authorTitle: Joi.string().optional().trim().max(100),
    authorCompany: Joi.string().optional().trim().max(100),
    authorAvatar: Joi.string().optional().pattern(PATTERNS.url),
    message: Joi.string().required().trim().min(10).max(1000),
    rating: Joi.number().optional().min(1).max(5),
    source: Joi.string().optional().valid('Employee', 'User', 'Client', 'Partner').default('User'),
    isPublished: Joi.boolean().optional().default(false),
    isFeatured: Joi.boolean().optional().default(false),
  }).required(),

  testimonialUpdate: Joi.object({
    authorName: Joi.string().optional().trim().max(100),
    authorTitle: Joi.string().optional().trim().max(100),
    authorCompany: Joi.string().optional().trim().max(100),
    authorAvatar: Joi.string().optional().pattern(PATTERNS.url),
    message: Joi.string().optional().trim().min(10).max(1000),
    rating: Joi.number().optional().min(1).max(5),
    source: Joi.string().optional().valid('Employee', 'User', 'Client', 'Partner'),
    isPublished: Joi.boolean().optional(),
    isFeatured: Joi.boolean().optional(),
  }).min(1).required(),

  product: Joi.object({
    name: Joi.string().required().trim().max(200),
    tagline: Joi.string().optional().trim().max(300),
    description: Joi.string().optional().trim().max(5000),
    features: Joi.array().optional().items(
      Joi.object({
        title: Joi.string().required().trim().max(100),
        description: Joi.string().optional().trim().max(500),
        icon: Joi.string().optional().trim(),
        category: Joi.string().optional().valid('core', 'key', 'design', 'analytics').default('core'),
      })
    ).max(50),
    screenshots: Joi.array().optional().items(Joi.string().pattern(PATTERNS.url)).max(20),
    demoLink: Joi.string().optional().pattern(PATTERNS.url),
    isPublished: Joi.boolean().optional().default(false),
  }).required(),

  life: Joi.object({
    values: Joi.array().optional().items(
      Joi.object({
        title: Joi.string().required().trim().max(100),
        description: Joi.string().required().trim().max(500),
        icon: Joi.string().optional().trim(),
      })
    ).max(20),
    perks: Joi.array().optional().items(
      Joi.object({
        title: Joi.string().required().trim().max(100),
        description: Joi.string().required().trim().max(500),
        icon: Joi.string().optional().trim(),
        category: Joi.string().optional().trim().max(50),
      })
    ).max(30),
    teamMembers: Joi.array().optional().items(
      Joi.object({
        name: Joi.string().required().trim().max(100),
        designation: Joi.string().required().trim().max(100),
        bio: Joi.string().optional().trim().max(500),
        avatar: Joi.string().optional().pattern(PATTERNS.url),
        linkedinUrl: Joi.string().optional().pattern(PATTERNS.url),
        order: Joi.number().optional().integer().min(0),
      })
    ).max(100),
    gallery: Joi.array().optional().items(
      Joi.object({
        url: Joi.string().required().pattern(PATTERNS.url),
        caption: Joi.string().optional().trim().max(300),
        type: Joi.string().optional().valid('Office', 'Event', 'Team', 'Product', 'Other').default('Other'),
        order: Joi.number().optional().integer().min(0),
      })
    ).max(50),
  }).min(1).required(),

  // Common sub-id validators
  timelineId: Joi.object({
    id: Joi.string().uuid({ version: 'uuidv4' }).required(),
    timelineId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  }).required(),

  updateId: Joi.object({
    id: Joi.string().uuid({ version: 'uuidv4' }).required(),
    updateId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  }).required(),

  testimonialId: Joi.object({
    id: Joi.string().uuid({ version: 'uuidv4' }).required(),
    testimonialId: Joi.string().uuid({ version: 'uuidv4' }).required(),
  }).required(),

  queryPagination: Joi.object({
    page: Joi.number().optional().integer().min(1).default(1),
    pageSize: Joi.number().optional().integer().min(1).max(100).default(20),
    isPublished: Joi.boolean().optional().truthy('true').falsy('false'),
    isFeatured: Joi.boolean().optional().truthy('true').falsy('false'),
    category: Joi.string().optional().valid('News', 'Press', 'Product', 'Milestone', 'Announcement'),
  }).optional(),
};

// =====================================================
// EXPORT ALL
// =====================================================
export {
  PATTERNS,
  INDUSTRIES,
  COMPANY_SIZES,
  COMPANY_STATUSES,
  POST_TYPES,
  POST_STATUSES,
  EVENT_TYPES,
  EVENT_MODES,
  EVENT_STATUSES,
  JOB_TYPES,
  EXPERIENCE_LEVELS,
  JOB_LOCATIONS,
  JOB_STATUSES,
  APPLICATION_STATUSES,
  JOB_SORT_OPTIONS,
  REVIEW_TYPES,
  REVIEW_SORT_OPTIONS,
  ANALYTICS_EVENT_TYPES,
  TRAFFIC_SOURCES,
};

export default {
  companyValidators,
  postValidators,
  employeeValidators,
  eventValidators,
  jobValidators,
  reviewValidators,
  analyticsValidators,
  followerValidators,
};