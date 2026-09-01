// validations/filter.validations.ts
import { IUserProfile } from '@/auth/models/UserProfile.model';
import Joi from 'joi';

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

const stringOptional = (label: string, max = 200) =>
  Joi.string()
    .trim()
    .max(max)
    .optional()
    .allow('')
    .label(label)
    .messages(customMessages);

// Main comprehensive filter validation
export const validateCompleteFilterInput = (input: any) => {
  const schema = Joi.object({
    // Search Parameters
    q: stringOptional('Search Query', 200),
    title: stringOptional('Job Title', 100),
    company: stringOptional('Company Name', 100),
    skills: Joi.array()
      .items(Joi.string().trim().max(50))
      .max(10)
      .optional()
      .label('Skills'),
    keywords: stringOptional('Keywords', 300),

    // Location Filters
    location: stringOptional('Location', 100),
    city: Joi.array()
      .items(stringOptional('City', 50))
      .max(5)
      .optional()
      .label('Cities'),
    state: Joi.array()
      .items(stringOptional('State', 50))
      .max(3)
      .optional()
      .label('States'),
    country: stringOptional('Country', 50).default('India'),
    remote: Joi.boolean().optional().label('Remote Only'),
    workMode: Joi.array()
      .items(Joi.string().valid('remote', 'hybrid', 'onsite'))
      .max(3)
      .optional()
      .label('Work Mode'),
    nearMe: Joi.string()
      .pattern(/^-?\d+\.?\d*,-?\d+\.?\d*,\d+$/) // lat,lng,radius
      .optional()
      .label('Near Me (lat,lng,radius)'),

    // Salary & Compensation
    minSalary: Joi.number().min(0).max(10000000).optional().label('Minimum Salary'),
    maxSalary: Joi.number().min(0).max(10000000).optional().label('Maximum Salary'),
    salaryRange: Joi.string()
      .valid('0-3L', '3L-6L', '6L-10L', '10L-15L', '15L-25L', '25L-50L', '50L+')
      .optional()
      .label('Salary Range'),
    currency: Joi.string()
      .valid('INR', 'USD', 'EUR', 'GBP')
      .default('INR')
      .label('Currency'),
    showSalary: Joi.boolean().optional().label('Show Only Jobs with Salary'),

    // Job Type & Employment
    jobType: Joi.array()
      .items(Joi.string().valid('full-time', 'part-time', 'contract', 'internship', 'temporary', 'freelance'))
      .max(5)
      .optional()
      .label('Job Type'),
    employmentStatus: Joi.array()
      .items(Joi.string().valid('permanent', 'contract', 'temporary', 'consultant'))
      .max(4)
      .optional()
      .label('Employment Status'),

    // Experience & Seniority
    experienceLevel: Joi.array()
      .items(Joi.string().valid('fresher', 'entry-level', 'mid-level', 'senior-level', 'lead', 'manager', 'director', 'vp', 'c-level'))
      .max(5)
      .optional()
      .label('Experience Level'),
    minExperience: Joi.number().min(0).max(50).optional().label('Min Experience (years)'),
    maxExperience: Joi.number().min(0).max(50).optional().label('Max Experience (years)'),

    // Company Filters
    companyIds: Joi.array().items(uuidSchema('Company ID')).max(20).optional(),
    companySize: Joi.array()
      .items(Joi.string().valid('startup', '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'))
      .max(5)
      .optional()
      .label('Company Size'),
    companyType: Joi.array()
      .items(Joi.string().valid('startup', 'mnc', 'public', 'private', 'non-profit', 'government'))
      .max(5)
      .optional()
      .label('Company Type'),
    companyRating: Joi.number().min(1).max(5).optional().label('Min Company Rating'),
    fundingStage: Joi.array()
      .items(Joi.string().valid('pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'ipo', 'acquired'))
      .max(5)
      .optional()
      .label('Funding Stage'),

    // Industry & Function
    industry: Joi.array()
      .items(Joi.string().valid('technology', 'healthcare', 'finance', 'education', 'retail', 'manufacturing', 'consulting', 'media', 'real-estate', 'automotive'))
      .max(5)
      .optional()
      .label('Industry'),
    jobFunction: Joi.array()
      .items(Joi.string().valid('engineering', 'product', 'design', 'marketing', 'sales', 'hr', 'finance', 'operations', 'legal', 'customer-success'))
      .max(5)
      .optional()
      .label('Job Function'),
    department: Joi.array().items(stringOptional('Department', 50)).max(5).optional(),

    // Education & Skills
    education: Joi.array()
      .items(Joi.string().valid('10th', '12th', 'diploma', 'graduate', 'post-graduate', 'mba', 'phd'))
      .max(5)
      .optional()
      .label('Education'),
    degree: Joi.array()
      .items(Joi.string().valid('btech', 'mtech', 'bca', 'mca', 'bba', 'mba', 'bcom', 'mcom', 'ba', 'ma', 'bsc', 'msc'))
      .max(5)
      .optional()
      .label('Degree'),
    certifications: Joi.array().items(stringOptional('Certification', 100)).max(10).optional(),
    languages: Joi.array()
      .items(Joi.string().valid('english', 'hindi', 'bengali', 'tamil', 'telugu', 'marathi', 'gujarati', 'kannada', 'malayalam', 'punjabi'))
      .max(5)
      .optional()
      .label('Languages'),

    // Date & Time Filters
    datePosted: Joi.string()
      .valid('any', 'past-24h', 'past-week', 'past-month', 'past-3-months')
      .default('any')
      .label('Date Posted'),
    applicationDeadline: Joi.string()
      .valid('any', 'next-week', 'next-month', 'next-3-months')
      .optional()
      .label('Application Deadline'),
    startDate: Joi.string()
      .valid('immediate', 'within-month', 'within-3-months', 'flexible')
      .optional()
      .label('Start Date'),

    // Benefits & Perks
    benefits: Joi.array()
      .items(
        Joi.string().valid(
          'health-insurance', 'dental-insurance', 'life-insurance',
          'pf-esi', 'gratuity', 'bonus', 'stock-options', 'esop',
          'flexible-hours', 'work-from-home', 'hybrid-work',
          'paid-leave', 'maternity-leave', 'paternity-leave',
          'learning-budget', 'certification-support', 'conference-budget',
          'gym-membership', 'meal-allowance', 'transport-allowance',
          'mobile-allowance', 'internet-allowance', 'laptop-provided',
          'free-snacks', 'team-outings', 'flexible-vacation'
        )
      )
      .max(10)
      .optional()
      .label('Benefits'),

    // Job Features & Urgency
    jobFeatures: Joi.array()
      .items(
        Joi.string().valid(
          'easy-apply', 'quick-apply', 'actively-recruiting', 'urgent-hiring',
          'few-applicants', 'recently-posted', 'promoted-job', 'featured-job',
          'verified-company', 'background-check-required', 'reference-check-required',
          'portfolio-required', 'github-required', 'assessment-required'
        )
      )
      .max(10)
      .optional()
      .label('Job Features'),

    // Diversity & Inclusion
    diversityTags: Joi.array()
      .items(
        Joi.string().valid(
          'women-friendly', 'lgbtq-friendly', 'disability-friendly',
          'veteran-friendly', 'equal-opportunity', 'diverse-leadership',
          'women-led', 'minority-led', 'inclusive-culture'
        )
      )
      .max(5)
      .optional()
      .label('Diversity Tags'),

    // Work Environment
    workCulture: Joi.array()
      .items(Joi.string().valid('collaborative', 'independent', 'fast-paced', 'innovative', 'traditional', 'startup-culture', 'corporate-culture'))
      .max(5)
      .optional()
      .label('Work Culture'),
    teamSize: Joi.string()
      .valid('individual', '2-5', '6-10', '11-25', '25+')
      .optional()
      .label('Team Size'),

    // Application Filters
    applicationStatus: Joi.string()
      .valid('not-applied', 'applied', 'in-progress', 'rejected', 'shortlisted')
      .optional()
      .label('Application Status'),
    saveStatus: Joi.string()
      .valid('all', 'saved', 'not-saved')
      .optional()
      .label('Save Status'),

    // Advanced Filters
    postedBy: Joi.string()
      .valid('company', 'recruiter', 'hr', 'hiring-manager')
      .optional()
      .label('Posted By'),
    jobSource: Joi.array()
      .items(Joi.string().valid('direct', 'consultant', 'referral', 'job-portal'))
      .max(5)
      .optional()
      .label('Job Source'),

    // Sorting & Pagination
    sortBy: Joi.string()
      .valid('relevance', 'date', 'salary-high', 'salary-low', 'company-rating', 'experience-match', 'trending', 'urgency')
      .default('relevance')
      .label('Sort By'),
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .label('Sort Order'),
    page: Joi.number().integer().min(1).max(1000).default(1).label('Page'),
    limit: Joi.number().integer().min(1).max(50).default(20).label('Limit'),

    // Advanced Search Options
    exactPhrase: Joi.boolean().optional().label('Exact Phrase Matching'),
    excludeWords: stringOptional('Exclude Words', 200),
    includeExpired: Joi.boolean().default(false).label('Include Expired Jobs'),
  })
    .unknown(false) // Reject unknown fields (security)
    .messages(customMessages);

  return schema.validate(input, { abortEarly: false, stripUnknown: true });
};

// Your existing optimized query builder (cleaned up with comments & safety)
export const buildOptimizedQuery = (filters: any, userProfile : IUserProfile | null | undefined) => {
  const baseQuery = {
    status: 'active',
    isDeleted: false,
  };

  // Only add expiry check if not including expired jobs
  if (!filters.includeExpired) {
    baseQuery['dates.expires'] = { $gt: new Date() };
  }

  // Text search
  if (filters.q) {
    baseQuery.$text = { $search: filters.q };
  }

  // Location
  if (filters.city?.length) baseQuery['location.city'] = { $in: filters.city.map(c => new RegExp(c, 'i')) };
  if (filters.state?.length) baseQuery['location.state'] = { $in: filters.state.map(s => new RegExp(s, 'i')) };
  if (filters.country) baseQuery['location.country'] = filters.country;
  if (filters.remote !== undefined) baseQuery['location.remote'] = filters.remote;
  if (filters.workMode?.length) baseQuery['location.workMode'] = { $in: filters.workMode };

  // Salary
  if (filters.salaryRange) {
    const ranges = {
      '0-3L': [0, 300000],
      '3L-6L': [300000, 600000],
      '6L-10L': [600000, 1000000],
      '10L-15L': [1000000, 1500000],
      '15L-25L': [1500000, 2500000],
      '25L-50L': [2500000, 5000000],
      '50L+': [5000000, Infinity],
    };
    const [min, max] = ranges[filters.salaryRange];
    baseQuery['salary.min'] = { $gte: min };
    if (max !== Infinity) baseQuery['salary.max'] = { $lte: max };
  } else {
    if (filters.minSalary) baseQuery['salary.min'] = { $gte: filters.minSalary };
    if (filters.maxSalary) baseQuery['salary.max'] = { $lte: filters.maxSalary };
  }
  if (filters.showSalary) baseQuery['salary.disclosed'] = true;

  // Job Type
  if (filters.jobType?.length) baseQuery.jobType = { $in: filters.jobType };

  // Experience
  if (filters.experienceLevel?.length) baseQuery['experience.level'] = { $in: filters.experienceLevel };
  if (filters.minExperience !== undefined) baseQuery['experience.min'] = { $gte: filters.minExperience };
  if (filters.maxExperience !== undefined) baseQuery['experience.max'] = { $lte: filters.maxExperience };

  // Company Filters
  if (filters.companyIds?.length) baseQuery.companyId = { $in: filters.companyIds };
  if (filters.companySize?.length) baseQuery['company.size'] = { $in: filters.companySize };
  if (filters.companyType?.length) baseQuery['company.type'] = { $in: filters.companyType };
  if (filters.companyRating) baseQuery['company.rating'] = { $gte: filters.companyRating };
  if (filters.fundingStage?.length) baseQuery['company.fundingStage'] = { $in: filters.fundingStage };

  // Industry & Function
  if (filters.industry?.length) baseQuery.industry = { $in: filters.industry };
  if (filters.jobFunction?.length) baseQuery.jobFunction = { $in: filters.jobFunction };
  if (filters.department?.length) baseQuery.department = { $in: filters.department.map(d => new RegExp(d, 'i')) };

  // Education & Skills
  if (filters.education?.length) baseQuery['requirements.education'] = { $in: filters.education };
  if (filters.degree?.length) baseQuery['requirements.degree'] = { $in: filters.degree };
  if (filters.skills?.length) baseQuery['skills.name'] = { $in: filters.skills.map(s => new RegExp(s, 'i')) };
  if (filters.certifications?.length) baseQuery['requirements.certifications'] = { $in: filters.certifications.map(c => new RegExp(c, 'i')) };
  if (filters.languages?.length) baseQuery['requirements.languages'] = { $in: filters.languages };

  // Date Filters
  if (filters.datePosted && filters.datePosted !== 'any') {
    const now = new Date();
    const dateFilters = {
      'past-24h': new Date(now - 86400000),
      'past-week': new Date(now - 7 * 86400000),
      'past-month': new Date(now - 30 * 86400000),
      'past-3-months': new Date(now - 90 * 86400000),
    };
    baseQuery['dates.posted'] = { $gte: dateFilters[filters.datePosted] };
  }

  // Benefits & Features
  if (filters.benefits?.length) baseQuery.benefits = { $in: filters.benefits };
  if (filters.jobFeatures?.length) baseQuery.features = { $in: filters.jobFeatures };
  if (filters.diversityTags?.length) baseQuery.diversityTags = { $in: filters.diversityTags };

  // Work Environment
  if (filters.workCulture?.length) baseQuery.workCulture = { $in: filters.workCulture };
  if (filters.teamSize) baseQuery.teamSize = filters.teamSize;

  // Application Filters
  if (filters.applicationStatus) baseQuery.applicationStatus = filters.applicationStatus;
  if (filters.saveStatus) baseQuery.saveStatus = filters.saveStatus;

  // Advanced Filters
  if (filters.postedBy) baseQuery.postedBy = filters.postedBy;
  if (filters.jobSource?.length) baseQuery.source = { $in: filters.jobSource };

  // Personalization boost (optional)
  if (userProfile?.skills?.length) {
    baseQuery.$or = baseQuery.$or || [];
    baseQuery.$or.push({ 'skills.name': { $in: userProfile.skills.map(s => new RegExp(s, 'i')) } });
  }

  return baseQuery;
};

// Sorting logic (unchanged but with safety)
export const getSortOptions = (sortBy: string, sortOrder: string = 'desc') => {
  const options = {
    relevance: { score: { $meta: 'textScore' }, 'dates.posted': sortOrder === 'asc' ? 1 : -1 },
    date: { 'dates.posted': sortOrder === 'asc' ? 1 : -1 },
    'salary-high': { 'salary.max': -1, 'dates.posted': -1 },
    'salary-low': { 'salary.min': 1, 'dates.posted': -1 },
    'company-rating': { 'company.rating': -1, 'dates.posted': -1 },
    'experience-match': { 'experience.min': 1, 'dates.posted': -1 },
  };
  return options[sortBy] || options.relevance;
};