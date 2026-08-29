// src/Job-Service/models/Job.model.ts
import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import Insights from './Insights.model.js';
import { sanitizeUserId, validId } from '@/shared/security.js';
import logger from '@/shared/logger.util.js';
import CacheUtil from '@/shared/cache.util.js';
import { JobFilterQuery } from '@/company/interfaces/job.types.js';

// ==================== ENUMS ====================
export enum JobType {
  FULL_TIME = 'full-time',
  PART_TIME = 'part-time',
  CONTRACT = 'contract',
  FREELANCE = 'freelance',
  INTERNSHIP = 'internship',
}

export enum ExperienceLevel {
  ENTRY = 'entry',
  JUNIOR = 'junior',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
  PRINCIPAL = 'principal',
  EXECUTIVE = 'executive',
}

export enum JobStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  EXPIRED = 'expired',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  CLOSED = 'closed',
  OPEN = 'open',
}

export enum ApplicationStatus {
  APPLIED = 'applied',
  REVIEWED = 'reviewed',
  SHORTLISTED = 'shortlisted',
  REJECTED = 'rejected',
  OFFERED = 'offered',
  ACCEPTED = 'accepted',
}

export enum Currency {
  INR = 'INR',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
}

export enum SalaryFrequency {
  HOURLY = 'hourly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum SkillCategory {
  TECHNICAL = 'technical',
  SOFT = 'soft',
  DOMAIN = 'domain',
  TOOL = 'tool',
  FRAMEWORK = 'framework',
}

export enum Industry {
  TECHNOLOGY = 'technology',
  HEALTHCARE = 'healthcare',
  FINANCE = 'finance',
  EDUCATION = 'education',
  MANUFACTURING = 'manufacturing',
  RETAIL = 'retail',
  CONSULTING = 'consulting',
  OTHER = 'other',
}

export enum ApplicationMethod {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
  EMAIL = 'email',
  LINKEDIN = 'linkedin',
}

export enum DiversityTag {
  WOMEN_FRIENDLY = 'women-friendly',
  LGBTQ_FRIENDLY = 'lgbtq-friendly',
  DISABILITY_FRIENDLY = 'disability-friendly',
  MINORITY_FRIENDLY = 'minority-friendly',
}

// ==================== DTO INTERFACES ====================
export interface CreateJobDTO {
  title: string;
  description: string;
  companyId: string;
}

export interface UpdateJobDTO {
  title?: string;
  description?: string;
}

export interface ApplyJobDTO {
  jobId: string;
  employeeId: string;
  resume: string;
  coverLetter?: string;
}

// ==================== INTERFACES ====================
interface ISkill {
  name: string;
  weight: number;
  category: SkillCategory;
}

interface ICoordinates {
  type: string;
  coordinates: number[];
}

interface ILocation {
  city?: string;
  state?: string;
  country: string;
  isRemote: boolean;
  coordinates: ICoordinates;
}

interface ISalary {
  min?: number;
  max?: number;
  currency: Currency;
  isNegotiable: boolean;
  frequency: SalaryFrequency;
}

interface IExperience {
  level: ExperienceLevel;
  minYears: number;
  maxYears?: number;
}

interface IDates {
  posted: Date;
  expires?: Date;
  lastUpdated: Date;
}

interface IStats {
  views: number;
  applications: number;
  saves: number;
  shares: number;
  clickThroughRate: number;
  conversionRate: number;
  applicationsCount: number;
}

interface IApplication {
  employee: Types.ObjectId;
  appliedAt: Date;
  status: ApplicationStatus;
  resume: string;
  coverLetter?: string;
}

interface IRequirements {
  education?: string;
  certifications?: string[];
  mandatorySkills?: string[];
  preferredSkills?: string[];
}

interface IBenefits {
  healthInsurance: boolean;
  paidLeave?: number;
  stockOptions: boolean;
  remoteWork: boolean;
  flexibleHours: boolean;
  others?: string[];
}

export interface IJob extends Document {
  // ✅ FIX: slug field schema mein add kiya — pre-save mein use ho raha tha par field missing tha
  slug?: string;
  jobId: string;
  title: string;
  companyId: string;
  description: string;
  skills: ISkill[];
  location: ILocation;
  jobType: JobType;
  salary: ISalary;
  experience: IExperience;
  dates: IDates;
  status: JobStatus;
  isActive: boolean;
  stats: IStats;
  applications: IApplication[];
  requirements: IRequirements;
  benefits: IBenefits;
  department?: string;
  industry?: Industry;
  searchKeywords: string[];
  tags: string[];
  isFeatured: boolean;
  isUrgent: boolean;
  diversityTags?: DiversityTag[];
  applicationMethod: ApplicationMethod;
  applicationUrl?: string;
  createdBy: string;
  updatedBy?: string;
  version: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJobFilters {
  status?: JobStatus;
  companyId?: string;
  jobType?: JobType;
  'experience.level'?: ExperienceLevel;
  industry?: Industry;
  isFeatured?: boolean;
  isDeleted?: boolean;
  'dates.expires'?: { $gt: Date };
  [key: string]: any;
}

export interface IPagination {
  page?: number;
  limit?: number;
}

interface IJobMethods {
  close(): Promise<Document & IJob>;
  reopen(): Promise<Document & IJob>;
  incrementApplications(): Promise<Document & IJob>;
  isExpired(): boolean;
  getDaysRemaining(): number;
}

interface IJobModel extends Model<IJob, Record<string, never>, IJobMethods> {
  findActiveJobs(filters?: IJobFilters, pagination?: IPagination): Promise<IJob[]>;
  findJobsByCompany(companyId: string, filters?: JobFilterQuery): Promise<IJob[]>;
  updateJob(id: string, data: UpdateJobDTO): Promise<IJob | null>;
  deleteJob(id: string): Promise<IJob | null>;
  searchJobs(filters: JobFilterQuery): Promise<IJob[]>;
  getOpenJobs(filters?: JobFilterQuery): Promise<IJob[]>;
  getClosedJobs(filters?: JobFilterQuery): Promise<IJob[]>;
  applyToJob(data: ApplyJobDTO): Promise<IJob | null>;
  getApplications(jobId: string): Promise<IJob | null>;
  updateApplicationStatus(jobId: string, applicationId: string, status: ApplicationStatus): Promise<IJob | null>;
  getUserApplications(employeeId: string): Promise<IJob[]>;
  getExpiringJobs(days: number): Promise<IJob[]>;
}

// ==================== SCHEMA DEFINITION ====================
const jobSchema = new Schema<IJob, IJobModel>(
  {
    // ✅ FIX: slug field ab schema mein hai
    slug: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    jobId: {
      type: String,
      required: true,
      unique: true,
      maxlength: 36,
      validate: {
        validator: validId,
        message: 'Invalid jobId UUID format',
      },
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      validate: {
        validator: (v: string) => /^[a-zA-Z0-9\s\-\.,&()]+$/.test(v),
        message: 'Title contains invalid characters',
      },
    },
    companyId: {
      type: String,
      required: true,
      maxlength: 36,
      validate: {
        validator: validId,
        message: 'Invalid company ID format',
      },
    },
    description: {
      type: String,
      required: true,
      maxlength: 5000,
      validate: {
        validator: (v: string) =>
          !/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(v),
        message: 'Description contains unsafe content',
      },
    },
    skills: [
      {
        name: {
          type: String,
          maxlength: 50,
          lowercase: true,
          trim: true,
          required: true,
          validate: {
            validator: (v: string) => /^[a-zA-Z0-9\s\-\.+#]+$/.test(v),
            message: 'Skill name contains invalid characters',
          },
        },
        weight: { type: Number, min: 0, max: 1, default: 0.5 },
        category: {
          type: String,
          enum: Object.values(SkillCategory),
          default: SkillCategory.TECHNICAL,
        },
      },
    ],
    location: {
      city: {
        type: String,
        maxlength: 100,
        trim: true,
        validate: {
          validator: (v: string) => !v || /^[a-zA-Z\s\-'\.]+$/.test(v),
          message: 'City name contains invalid characters',
        },
      },
      state: {
        type: String,
        maxlength: 50,
        trim: true,
        validate: {
          validator: (v: string) => !v || /^[a-zA-Z\s\-'\.]+$/.test(v),
          message: 'State name contains invalid characters',
        },
      },
      country: {
        type: String,
        maxlength: 50,
        trim: true,
        default: 'India',
        validate: {
          validator: (v: string) => /^[a-zA-Z\s\-'\.]+$/.test(v),
          message: 'Country name contains invalid characters',
        },
      },
      isRemote: { type: Boolean, default: false },
      coordinates: {
        // ✅ FIX: index: '2dsphere' HATAYA field se
        // Neeche jobSchema.index({ 'location.coordinates': '2dsphere' }) se handle hoga
        // Dono saath hone se DUPLICATE tha
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: {
          type: [Number],
          validate: {
            validator: (v: number[]) =>
              v.length === 2 &&
              v[0] >= -180 && v[0] <= 180 &&
              v[1] >= -90 && v[1] <= 90,
            message: 'Invalid coordinates format',
          },
        },
      },
    },
    jobType: {
      type: String,
      required: true,
      enum: Object.values(JobType),
    },
    salary: {
      min: {
        type: Number,
        min: 0,
        max: 100000000,
        validate: {
          validator: (v: number) => !v || (Number.isInteger(v) && v >= 0),
          message: 'Salary must be a valid positive integer',
        },
      },
      max: {
        type: Number,
        min: 0,
        max: 100000000,
        validate: {
          validator: (v: number) => !v || (Number.isInteger(v) && v >= 0),
          message: 'Salary must be a valid positive integer',
        },
      },
      currency: { type: String, enum: Object.values(Currency), default: Currency.INR },
      isNegotiable: { type: Boolean, default: true },
      frequency: {
        type: String,
        enum: Object.values(SalaryFrequency),
        default: SalaryFrequency.YEARLY,
      },
    },
    experience: {
      level: {
        type: String,
        enum: Object.values(ExperienceLevel),
        required: true,
      },
      minYears: { type: Number, min: 0, max: 50, default: 0 },
      maxYears: { type: Number, min: 0, max: 50 },
    },
    dates: {
      posted: { type: Date, default: Date.now },
      expires: { type: Date },
      lastUpdated: { type: Date, default: Date.now },
    },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.ACTIVE,
    },
    isActive: { type: Boolean, default: true },
    stats: {
      views: { type: Number, default: 0, min: 0 },
      applications: { type: Number, default: 0, min: 0 },
      saves: { type: Number, default: 0, min: 0 },
      shares: { type: Number, default: 0, min: 0 },
      clickThroughRate: { type: Number, default: 0, min: 0, max: 1 },
      conversionRate: { type: Number, default: 0, min: 0, max: 1 },
      applicationsCount: { type: Number, default: 0, min: 0 },
    },
    applications: [
      {
        employee: { type: Schema.Types.ObjectId, ref: 'User' },
        appliedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: Object.values(ApplicationStatus),
          default: ApplicationStatus.APPLIED,
        },
        resume: { type: String, required: true },
        coverLetter: String,
      },
    ],
    requirements: {
      education: {
        type: String,
        maxlength: 200,
        validate: {
          validator: (v: string) => !v || !/[<>]/.test(v),
          message: 'Education field contains unsafe characters',
        },
      },
      certifications: [{
        type: String,
        maxlength: 100,
        validate: {
          validator: (v: string) => /^[a-zA-Z0-9\s\-\.,()]+$/.test(v),
          message: 'Certification name contains invalid characters',
        },
      }],
      mandatorySkills: [{
        type: String,
        maxlength: 50,
        validate: {
          validator: (v: string) => /^[a-zA-Z0-9\s\-\.+#]+$/.test(v),
          message: 'Skill name contains invalid characters',
        },
      }],
      preferredSkills: [{
        type: String,
        maxlength: 50,
        validate: {
          validator: (v: string) => /^[a-zA-Z0-9\s\-\.+#]+$/.test(v),
          message: 'Skill name contains invalid characters',
        },
      }],
    },
    benefits: {
      healthInsurance: { type: Boolean, default: false },
      paidLeave: { type: Number, min: 0, max: 365 },
      stockOptions: { type: Boolean, default: false },
      remoteWork: { type: Boolean, default: false },
      flexibleHours: { type: Boolean, default: false },
      others: [{
        type: String,
        maxlength: 100,
        validate: {
          validator: (v: string) => /^[a-zA-Z0-9\s\-\.,()]+$/.test(v),
          message: 'Benefit description contains invalid characters',
        },
      }],
    },
    department: {
      type: String,
      maxlength: 100,
      validate: {
        validator: (v: string) => !v || /^[a-zA-Z0-9\s\-&]+$/.test(v),
        message: 'Department name contains invalid characters',
      },
    },
    industry: {
      type: String,
      enum: Object.values(Industry),
    },
    searchKeywords: [{
      type: String,
      maxlength: 50,
      lowercase: true,
      validate: {
        validator: (v: string) => /^[a-zA-Z0-9\s\-\.]+$/.test(v),
        message: 'Search keyword contains invalid characters',
      },
    }],
    tags: [{
      type: String,
      maxlength: 30,
      lowercase: true,
      validate: {
        validator: (v: string) => /^[a-zA-Z0-9\-]+$/.test(v),
        message: 'Tag contains invalid characters',
      },
    }],
    isFeatured: { type: Boolean, default: false },
    isUrgent: { type: Boolean, default: false },
    diversityTags: [{ type: String, enum: Object.values(DiversityTag) }],
    applicationMethod: {
      type: String,
      enum: Object.values(ApplicationMethod),
      default: ApplicationMethod.INTERNAL,
    },
    applicationUrl: {
      type: String,
      maxlength: 500,
      validate: {
        validator: (v: string) => {
          if (!v) return true;
          return /^https:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/.test(v);
        },
        message: 'Application URL must be a valid HTTPS URL',
      },
    },
    createdBy: {
      type: String,
      required: true,
      validate: { validator: validId, message: 'createdBy must be a valid user ID' },
    },
    updatedBy: {
      type: String,
      validate: {
        validator: (v: string) => !v || validId(v),
        message: 'updatedBy must be a valid user ID',
      },
    },
    version: { type: Number, default: 1, min: 1 },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'jobs',
  }
);

// ==================== OPTIMIZED INDEXES ====================
// ✅ FIX: 'location.coordinates' 2dsphere index sirf yahan hai
// Field definition se index: '2dsphere' hataya gaya — DUPLICATE tha
jobSchema.index({ 'location.coordinates': '2dsphere' });

// ✅ FIX: text index sirf yahan hai
// title field se  to rehne do (normal index), but text index sirf yahan
// ❌ PEHLE: title field mein bhi index tha AUR yahan bhi text index tha — DUPLICATE tha
jobSchema.index(
  { title: 'text', description: 'text', searchKeywords: 'text' },
  { name: 'job_search_index', weights: { title: 10, searchKeywords: 5, description: 3 } }
);

// ✅ Compound indexes
jobSchema.index({ status: 1, 'dates.posted': -1 });
jobSchema.index({ companyId: 1, status: 1, isActive: 1 });
jobSchema.index({ 'skills.name': 1, status: 1 });
jobSchema.index({ jobType: 1, 'experience.level': 1, status: 1 });
jobSchema.index({ isFeatured: 1, status: 1, 'dates.posted': -1 });
jobSchema.index({ 'applications.employee': 1 });
jobSchema.index({ 'stats.applicationsCount': -1, 'dates.posted': -1 });
jobSchema.index({ 'dates.expires': 1 }, { expireAfterSeconds: 86400 });

// ==================== PRE-SAVE MIDDLEWARE ====================
jobSchema.pre('save', async function (next) {
  const JobModel = this.constructor as Model<IJob>;
  try {
    // 1. Auto-generate slug
    if (this.isModified('title') && !this.slug) {
      const baseSlug = this.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      let slug = baseSlug;
      let counter = 1;

      while (await JobModel.findOne({ slug, _id: { $ne: this._id } })) {
        slug = `${baseSlug}-${counter++}`;
      }

      this.slug = slug;
    }

    // 2. Update timestamps
    this.dates.lastUpdated = new Date();
    this.updatedAt = new Date();

    // 3. Version increment
    if (!this.isNew) {
      this.version += 1;
    }

    // 4. Sanitize audit fields
    if (this.createdBy) this.createdBy = sanitizeUserId(this.createdBy);
    if (this.updatedBy) this.updatedBy = sanitizeUserId(this.updatedBy);

    // 5. Validation
    if (this.salary?.min && this.salary?.max && this.salary.min > this.salary.max) {
      throw new Error('Invalid salary range: min cannot be greater than max');
    }
    if (this.experience?.minYears && this.experience?.maxYears && this.experience.minYears > this.experience.maxYears) {
      throw new Error('Invalid experience range: min cannot be greater than max');
    }

    // 6. Auto-set expires (90 days)
    if (!this.dates.expires) {
      this.dates.expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    }

    // 7. Auto-generate search keywords
    const keywords = new Set<string>();
    this.title.toLowerCase().split(/\s+/).forEach(k => keywords.add(k));
    this.skills.forEach(s => keywords.add(s.name.toLowerCase()));
    keywords.add(this.jobType);
    keywords.add(this.experience.level);
    if (this.industry) keywords.add(this.industry);
    if (this.department) keywords.add(this.department);
    this.searchKeywords = Array.from(keywords).filter(Boolean);

    // 8. Logging
    logger.info(this.isNew ? 'New job created' : 'Job updated', {
      jobId: this.jobId,
      companyId: this.companyId,
      title: this.title,
      operation: this.isNew ? 'create' : 'update',
      changes: this.isNew ? undefined : this.modifiedPaths(),
    });

    next();
  } catch (error: any) {
    logger.error('Pre-save middleware failed', {
      jobId: this.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    next(error as Error);
  }
});

// ==================== INSTANCE METHODS ====================
jobSchema.methods.close = async function () {
  this.status = JobStatus.CLOSED;
  this.isActive = false;
  return this.save();
};

jobSchema.methods.reopen = async function () {
  this.status = JobStatus.ACTIVE;
  this.isActive = true;
  return this.save();
};

jobSchema.methods.incrementApplications = async function () {
  this.stats.applicationsCount += 1;
  return this.save();
};

jobSchema.methods.isExpired = function () {
  return this.dates.expires && new Date() > new Date(this.dates.expires);
};

jobSchema.methods.getDaysRemaining = function () {
  if (!this.dates.expires) return -1;
  const diff = new Date(this.dates.expires).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// ==================== VIRTUALS ====================
jobSchema.virtual('isOpen').get(function () {
  return this.status === JobStatus.ACTIVE && this.isActive;
});

jobSchema.virtual('isClosed').get(function () {
  return this.status === JobStatus.CLOSED || !this.isActive;
});

jobSchema.virtual('applicationCount').get(function () {
  return this.applications.length;
});

// ==================== STATIC METHODS ====================
jobSchema.statics.createJob = async function (data: any) {
  const job = new this(data);
  return job.save();
};

jobSchema.statics.findJobById = async function (id: string) {
  return this.findById(id).populate('company', 'name logo').exec();
};

jobSchema.statics.findActiveJobs = function (
  filters: IJobFilters = {},
  pagination: IPagination = {}
) {
  const { page = 1, limit = 20 } = pagination;
  return this.find({
    status: JobStatus.ACTIVE,
    isDeleted: false,
    'dates.expires': { $gt: new Date() },
    ...filters,
  })
    .sort({ isFeatured: -1, 'dates.posted': -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
};

jobSchema.statics.findJobsByCompany = async function (
  companyId: string,
  filters?: JobFilterQuery
): Promise<IJob[]> {
  const query: Record<string, unknown> = { company: companyId };
  if (filters?.status) query.status = filters.status;
  if (filters?.type) query.type = filters.type;
  if (filters?.location) query.location = filters.location;
  return this.find(query).sort({ postedDate: -1 }).exec();
};

jobSchema.statics.updateJob = async function (
  id: string,
  data: UpdateJobDTO
): Promise<IJob | null> {
  return this.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
};

jobSchema.statics.deleteJob = async function (id: string): Promise<IJob | null> {
  return this.findByIdAndUpdate(
    id,
    { status: JobStatus.CLOSED, isActive: false },
    { new: true }
  ).exec();
};

jobSchema.statics.searchJobs = async function (filters: JobFilterQuery): Promise<IJob[]> {
  const query: Record<string, unknown> = { isActive: true };
  if (filters.search) query.$text = { $search: filters.search };
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.experienceLevel) query.experienceLevel = filters.experienceLevel;
  if (filters.location) query.location = filters.location;
  if (filters.skills && filters.skills.length > 0) query.skills = { $in: filters.skills };
  if (filters.company) query.company = filters.company;

  let sort: Record<string, number> = { postedDate: -1 };
  if (filters.sort === 'recent') sort = { postedDate: -1 };
  else if (filters.sort === 'popular') sort = { applicationsCount: -1 };
  else if (filters.sort === 'closing-soon') sort = { closingDate: 1 };

  return this.find(query).populate('company', 'name logo').sort(sort as any).exec();
};

jobSchema.statics.getOpenJobs = async function (filters?: JobFilterQuery): Promise<IJob[]> {
  const query: Record<string, unknown> = { status: JobStatus.OPEN, isActive: true };
  if (filters?.type) query.type = filters.type;
  if (filters?.location) query.location = filters.location;
  if (filters?.company) query.company = filters.company;
  return this.find(query).populate('company', 'name logo').sort({ postedDate: -1 }).exec();
};

jobSchema.statics.getClosedJobs = async function (filters?: JobFilterQuery): Promise<IJob[]> {
  const query: Record<string, unknown> = { status: JobStatus.CLOSED };
  if (filters?.company) query.company = filters.company;
  return this.find(query).populate('company', 'name logo').sort({ postedDate: -1 }).exec();
};

jobSchema.statics.applyToJob = async function (data: ApplyJobDTO): Promise<IJob | null> {
  const job = await this.findById(data.jobId);
  if (!job) return null;

  const alreadyApplied = job.applications.some(
    (app: { employee: mongoose.Types.ObjectId }) =>
      app.employee.toString() === data.employeeId
  );
  if (alreadyApplied) throw new Error('Already applied to this job');

  job.applications.push({
    employee: new mongoose.Types.ObjectId(data.employeeId),
    appliedAt: new Date(),
    status: ApplicationStatus.APPLIED,
    resume: data.resume,
    coverLetter: data.coverLetter,
  });
  job.stats.applicationsCount += 1;
  return job.save();
};

jobSchema.statics.getApplications = async function (jobId: string): Promise<IJob | null> {
  return this.findById(jobId)
    .populate('applications.employee', 'firstName lastName email profileImage')
    .exec();
};

jobSchema.statics.updateApplicationStatus = async function (
  jobId: string,
  applicationId: string,
  status: ApplicationStatus
): Promise<IJob | null> {
  return this.findOneAndUpdate(
    { _id: jobId, 'applications._id': applicationId },
    { $set: { 'applications.$.status': status } },
    { new: true }
  )
    .populate('applications.employee', 'firstName lastName email')
    .exec();
};

jobSchema.statics.getUserApplications = async function (employeeId: string): Promise<IJob[]> {
  return this.find({ 'applications.employee': employeeId })
    .populate('company', 'name logo')
    .sort({ 'applications.appliedAt': -1 })
    .exec();
};

jobSchema.statics.getExpiringJobs = async function (days: number): Promise<IJob[]> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);
  return this.find({
    status: JobStatus.OPEN,
    isActive: true,
    closingDate: { $lte: targetDate, $gte: new Date() },
  })
    .populate('company', 'name email')
    .exec();
};

// ==================== STATS SERVICE ====================
class StatsService {
  static async incrementJobStats(jobId: string, statType: string, count = 1): Promise<void> {
    try {
      const redisKey = `job:stats:${jobId}:${statType}`;
      await CacheUtil.incr(redisKey, count);
      await CacheUtil.set(redisKey, count.toString(), 7 * 24 * 60 * 60);
      logger.debug('✅ [STATS] Redis increment', { jobId, statType, count });
      await this.scheduleBatchFlush(jobId);
    } catch (error: any) {
      logger.error('❌ [STATS] Redis increment failed, using DB fallback', {
        jobId, statType, error: error instanceof Error ? error.message : String(error),
      });
      await Job.updateOne({ jobId }, { $inc: { [`stats.${statType}`]: count } });
    }
  }

  static async scheduleBatchFlush(jobId: string): Promise<void> {
    try {
      await CacheUtil.add('stats:flush:queue', jobId);
      await CacheUtil.set(`stats:flush:scheduled:${jobId}`, '1', 300);
    } catch (error: any) {
      logger.error('❌ [STATS] Failed to schedule batch flush', {
        jobId, error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async batchFlushStats(): Promise<void> {
    try {
      const jobIds = await CacheUtil.getAll('stats:flush:queue');
      if (jobIds.length === 0) { logger.debug('🔄 [STATS] No jobs to flush'); return; }

      logger.info('🔄 [STATS] Starting batch flush', { jobCount: jobIds.length });

      for (const jobId of jobIds) {
        const stats: Record<string, number> = {};
        const pattern = `job:stats:${jobId}:*`;
        const keys: string[] = [];
        let cursor = '0';

        do {
          const [newCursor, foundKeys] = await CacheUtil.scan(cursor, pattern, 100);
          cursor = newCursor;
          keys.push(...foundKeys);
        } while (cursor !== '0');

        for (const key of keys) {
          const statType = key.split(':').pop();
          if (!statType) continue;
          const count = await CacheUtil.get(key);
          if (count && parseInt(count) > 0) stats[`stats.${statType}`] = parseInt(count);
        }

        if (Object.keys(stats).length > 0) {
          await Job.updateOne({ jobId }, { $inc: stats });
          for (const key of keys) await CacheUtil.del(key);
          logger.debug('✅ [STATS] Flushed stats', { jobId, stats });
        }

        await CacheUtil.remove('stats:flush:queue', jobId);
      }

      logger.info('✅ [STATS] Batch flush completed', { flushedCount: jobIds.length });
    } catch (error: any) {
      logger.error('❌ [STATS] Batch flush failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ==================== EVENT HANDLER ====================
class JobEventHandler {
  static async handleJobView(data: { jobId: string; userId?: string; metadata?: any }): Promise<void> {
    try {
      logger.info('👁️ [JOB] Job viewed', { jobId: data.jobId, userId: data.userId });
      await StatsService.incrementJobStats(data.jobId, 'views');
      await Insights.updateJobMetrics(data.userId || 'anonymous', data.jobId, { views: 1 });
    } catch (error: any) {
      logger.error('❌ [JOB] Failed to handle job view', {
        jobId: data.jobId, error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async handleJobApplication(data: { jobId: string; userId: string; metadata?: any }): Promise<void> {
    try {
      logger.info('📋 [JOB] Job application submitted', { jobId: data.jobId, userId: data.userId });
      await StatsService.incrementJobStats(data.jobId, 'applications');
      await Insights.updateJobMetrics(data.userId, data.jobId, { applications: 1 });
    } catch (error: any) {
      logger.error('❌ [JOB] Failed to handle job application', {
        jobId: data.jobId, error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async handleJobSave(data: { jobId: string; userId: string }): Promise<void> {
    try {
      logger.info('💾 [JOB] Job saved', { jobId: data.jobId, userId: data.userId });
      await StatsService.incrementJobStats(data.jobId, 'saves');
      await Insights.updateJobMetrics(data.userId, data.jobId, { saves: 1 });
    } catch (error: any) {
      logger.error('❌ [JOB] Failed to handle job save', {
        jobId: data.jobId, error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ==================== INDEX MONITORING SERVICE ====================
class IndexMonitoringService {
  static async analyzeIndexUsage(): Promise<any[]> {
    try {
      const db = mongoose.connection.db;
      if (!db) throw new Error('Database not connected');
      const indexStats = await db.collection('jobs').aggregate([{ $indexStats: {} }]).toArray();
      logger.info('📊 [JOB] Index usage stats', { totalIndexes: indexStats.length });
      indexStats.forEach((stat: any) => {
        logger.info(`📊 [INDEX] ${stat.name}: ${stat.accesses.ops} uses`);
        if (stat.accesses.ops < 100 && stat.name !== '_id_') {
          logger.warn('⚠️ [INDEX] Low usage detected', { index: stat.name, usage: stat.accesses.ops });
        }
      });
      return indexStats;
    } catch (error: any) {
      logger.error('❌ [JOB] Failed to analyze index usage', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  static async dropUnusedIndexes(dryRun = true): Promise<any[]> {
    try {
      const stats = await this.analyzeIndexUsage();
      const unusedIndexes = stats.filter(
        (stat) => stat.accesses.ops < 100 && stat.name !== '_id_' && !stat.name.includes('text')
      );

      if (dryRun) {
        logger.info('🔍 [INDEX] Dry run - would drop these indexes', {
          indexes: unusedIndexes.map((i) => i.name),
        });
        return unusedIndexes;
      }

      const db = mongoose.connection.db;
      if (!db) throw new Error('Database not connected');
      for (const indexStat of unusedIndexes) {
        await db.collection('jobs').dropIndex(indexStat.name);
        logger.info('✅ [INDEX] Dropped unused index', { index: indexStat.name });
      }
      return unusedIndexes;
    } catch (error: any) {
      logger.error('❌ [JOB] Failed to drop unused indexes', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

// ==================== MAINTENANCE SERVICE ====================
class JobMaintenanceService {
  static async flushStatsToMongo(): Promise<void> {
    await StatsService.batchFlushStats();
  }

  static async analyzeIndexes(): Promise<void> {
    await IndexMonitoringService.analyzeIndexUsage();
  }

  static async cleanupExpiredJobs(): Promise<void> {
    try {
      const result = await Job.updateMany(
        { 'dates.expires': { $lt: new Date() }, status: JobStatus.ACTIVE },
        { status: JobStatus.EXPIRED, 'dates.lastUpdated': new Date() }
      );
      logger.info('✅ [JOB] Expired jobs cleaned up', { count: result.modifiedCount });
    } catch (error: any) {
      logger.error('❌ [JOB] Failed to cleanup expired jobs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static async archiveOldAnalytics(): Promise<void> {
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const cutoffDate = threeMonthsAgo.toISOString().split('T')[0];
      const db = mongoose.connection.db;
      if (!db) throw new Error('Database not connected');

      const oldAnalytics = await Insights.find({
        'jobAnalytics.createdAt': { $lt: new Date(cutoffDate) },
      }).lean();

      if (oldAnalytics.length > 0) {
        await db.collection('job_analytics_archive').insertMany(oldAnalytics);
        await Insights.deleteMany({ 'jobAnalytics.createdAt': { $lt: new Date(cutoffDate) } });
        logger.info('✅ [JOB] Old analytics archived', { count: oldAnalytics.length });
      }
    } catch (error: any) {
      logger.error('❌ [JOB] Failed to archive old analytics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ==================== MODEL EXPORT ====================
export const Job = mongoose.model<IJob, IJobModel>('Job', jobSchema);
export type { IApplication, IBenefits, IDates, IExperience, ILocation, IRequirements, ISalary, ISkill, IStats };
export { StatsService, JobEventHandler, IndexMonitoringService, JobMaintenanceService };
export default Job;