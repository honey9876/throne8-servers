// src/models/company.model.ts
import { v4 as uuidv4 } from 'uuid';
import mongoose, { Schema, Document, Model, Query } from 'mongoose';
import { logger } from '@/shared/logger.util';
import NodeGeocoder from 'node-geocoder';
import CacheUtil from '@/shared/cache.util.js';
import { sanitizeUserId, validId } from '@/shared/security.js';
import { CompanyStatus } from '../interfaces';
import config from "@/config/env/env";
import { ApiResponse } from "@/Mentorship/interface/common.types";
import { CompanyProfile } from "@/Mentorship/interface/company.types";
import ApiClient from '@/shared/utils/mentorship/apiClient';

// ==================== GEOCODER SETUP ====================
const geocoder = NodeGeocoder({ provider: 'openstreetmap' });

// ==================== ENUMS ====================
export enum IndustryType {
  TECHNOLOGY = 'Technology',
  HEALTHCARE = 'Healthcare',
  FINANCE = 'Finance',
  EDUCATION = 'Education',
  MANUFACTURING = 'Manufacturing',
  RETAIL = 'Retail',
  CONSTRUCTION = 'Construction',
  TRANSPORTATION = 'Transportation',
  MEDIA = 'Media',
  GOVERNMENT = 'Government',
  NON_PROFIT = 'Non-Profit',
  REAL_ESTATE = 'Real Estate',
  ENERGY = 'Energy',
  AGRICULTURE = 'Agriculture',
  HOSPITALITY = 'Hospitality',
  CONSULTING = 'Consulting',
  LEGAL = 'Legal',
  MARKETING = 'Marketing',
  TELECOMMUNICATIONS = 'Telecommunications',
  BIOTECHNOLOGY = 'Biotechnology',
  E_COMMERCE = 'E-commerce',
  GAMING = 'Gaming',
  CYBERSECURITY = 'Cybersecurity',
  OTHER = 'Other',
}

export enum CompanyType {
  STARTUP = 'Startup',
  SME = 'SME',
  LARGE_ENTERPRISE = 'Large Enterprise',
  MNC = 'MNC',
  GOVERNMENT = 'Government',
  NON_PROFIT = 'Non-Profit',
}

export enum OrganizationType {
  PRIVATE = 'Private',
  PUBLIC = 'Public',
  NON_PROFIT = 'Non-Profit',
  GOVERNMENT = 'Government',
  PARTNERSHIP = 'Partnership',
  SOLE_PROPRIETORSHIP = 'Sole Proprietorship',
  OTHER = 'Other',
}

export enum OperatingStatus {
  OPERATING = 'Operating',
  CLOSED = 'Closed',
  ACQUIRED = 'Acquired',
  BANKRUPT = 'Bankrupt',
}

export enum CompanySize {
  TINY = '1-10',
  SMALL = '11-50',
  MEDIUM = '51-200',
  LARGE = '201-500',
  XLARGE = '501-1000',
  XXLARGE = '1001-5000',
  ENTERPRISE = '5000+',
}

export enum SubscriptionPlan {
  FREE = 'Free',
  BASIC = 'Basic',
  PROFESSIONAL = 'Professional',
  ENTERPRISE = 'Enterprise',
}

export enum AccountStatus {
  ACTIVE = 'Active',
  SUSPENDED = 'Suspended',
  PENDING = 'Pending',
  REJECTED = 'Rejected',
}

export enum VerificationMethod {
  EMAIL = 'Email',
  PHONE = 'Phone',
  DOCUMENT = 'Document',
  MANUAL = 'Manual',
}

export enum ExperienceLevel {
  FRESHER = 'Fresher',
  ENTRY_LEVEL = 'Entry Level',
  MID_LEVEL = 'Mid Level',
  SENIOR_LEVEL = 'Senior Level',
  EXECUTIVE = 'Executive',
}

export enum WorkType {
  FULL_TIME = 'Full-time',
  PART_TIME = 'Part-time',
  CONTRACT = 'Contract',
  INTERNSHIP = 'Internship',
  FREELANCE = 'Freelance',
}

export enum RemoteWorkType {
  ON_SITE = 'On-site',
  REMOTE = 'Remote',
  HYBRID = 'Hybrid',
}

// ==================== INTERFACES ====================
interface IPhone {
  country: string;
  number: string;
}

interface ICoordinates {
  type: string;
  coordinates: number[];
}

interface IHeadquarters {
  address: string;
  city: string;
  state: string;
  country: string;
  pincode?: string;
  coordinates: ICoordinates;
}

interface IDescriptions {
  short?: string;
  detailed?: string;
  tagline?: string;
}

interface IMedia {
  logo?: {
    url?: string;
    publicId?: string;
    uploadedAt?: Date;
  };
  coverImage?: {
    url?: string;
    publicId?: string;
    uploadedAt?: Date;
  };
}

interface ISocialMedia {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
  github?: string;
}

interface ISubscriptionLimits {
  jobPosts: number;
  featuredJobs: number;
  resumeViews: number;
}

interface ISubscription {
  plan: SubscriptionPlan;
  planId: string;
  isActive: boolean;
  startDate?: Date;
  endDate?: Date;
  limits: ISubscriptionLimits;
}

interface IAccount {
  status: AccountStatus;
  isVerified: boolean;
  verifiedAt?: Date;
  verificationMethod?: VerificationMethod;
}

interface IStats {
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  successfulHires: number;
  profileViews: number;
  lastJobPosted?: Date;
  successRate: number;
  followersCount: number;
  postsCount: number;
  employeesCount: number;
}

interface IPreferences {
  jobCategories?: string[];
  skillsets?: string[];
  experienceLevels?: ExperienceLevel[];
  workTypes?: WorkType[];
  remoteWork: RemoteWorkType;
}

interface ISEO {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  slug?: string;
}

interface IFeatures {
  isFeatured: boolean;
  isPremium: boolean;
  allowDirectContact: boolean;
  showSalaryRange: boolean;
  autoPostToSocial: boolean;
}

interface IAnalytics {
  viewCount: number;
  applicationCount: number;
  engagementScore: number;
  lastCalculated: Date;
}

interface IAudit {
  createdBy: string;
  updatedBy?: string;
  version: number;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
}

interface IRelationships {
  activeJobsCount: number;
  totalReviewsCount: number;
  averageRating: number;
}

interface IGrowthMetrics {
  employeeGrowthRate?: number;
  revenueGrowth?: number;
  fundingRaised?: number;
  lastFundingRound?: {
    amount: number;
    date: Date;
    stage: string;
  };
  yearOverYearGrowth?: number;
  marketShare?: number;
}

export interface ICompany extends Document {
  companyId: string;
  companyName: string;
  companySlug: string;
  displayName?: string;
  industry: IndustryType;
  subIndustry?: string;
  companyType: CompanyType;
  companySize?: CompanySize;
  foundedYear?: number;
  email: string;
  phone: IPhone;
  website?: string;
  headquarters: IHeadquarters;
  descriptions: IDescriptions;
  media: IMedia;
  socialMedia: ISocialMedia;
  subscription: ISubscription;
  account: IAccount;
  stats: IStats;
  preferences: IPreferences;
  seo: ISEO;
  growthMetrics: IGrowthMetrics;
  features: IFeatures;
  analytics: IAnalytics;
  audit: IAudit;
  relationships: IRelationships;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICompanySearchFilters {
  industry?: IndustryType;
  companyType?: CompanyType;
  companySize?: CompanySize;
  'headquarters.city'?: string;
  'features.isFeatured'?: boolean;
  'subscription.plan'?: SubscriptionPlan;
  [key: string]: any;
}

export interface ISearchOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

export interface IStatsUpdate {
  companyId: string;
  stats: Partial<IStats>;
}

interface ICompanyMethods {
  softDelete(): Promise<Document & ICompany>;
  incrementStat(field: 'followersCount' | 'postsCount' | 'employeesCount'): Promise<Document & ICompany>;
  decrementStat(field: 'followersCount' | 'postsCount' | 'employeesCount'): Promise<Document & ICompany>;
}

interface ICompanyModel extends Model<ICompany, Record<string, never>, ICompanyMethods> {
  findForListing(filters?: ICompanySearchFilters, options?: ISearchOptions): Promise<ICompany[]>;
  findProfile(identifier: string): Promise<ICompany | null>;
  searchCompanies(searchQuery: string, filters?: ICompanySearchFilters, options?: ISearchOptions): Promise<ICompany[]>;
  bulkUpdateStats(updates: IStatsUpdate[]): Promise<any>;
  findActive(): Query<ICompany[], ICompany>;
  findVerified(): Query<ICompany[], ICompany>;
  searchByText(searchTerm: string): Query<ICompany[], ICompany>;
  findNearby(longitude: number, latitude: number, maxDistance?: number): Query<ICompany[], ICompany>;
  getCompanyById(companyId: string, authToken?: string): Promise<ICompany>;
  getCompaniesByIds(companyIds: string[], authToken?: string): Promise<ICompany[]>;
  getCompanyProfile(companyId: string, authToken?: string): Promise<CompanyProfile>;
  verifyCompanyExists(companyId: string): Promise<boolean>;
  getCompanyBySlug(slug: string, authToken?: string): Promise<ICompany | null>;
  getAllCompanies(page?: number, limit?: number, filters?: Record<string, any>, authToken?: string): Promise<{ companies: ICompany[]; total: number }>;
  getTopCompanies(limit?: number, authToken?: string): Promise<ICompany[]>;
  clearCache(companyId?: string): void;
  clearExpiredCache(): void;
}

// ==================== GEOJSON POINT SCHEMA ====================
const pointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (v: number[]) {
          return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && !isNaN(v[0]) && !isNaN(v[1]) && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
        },
        message: 'Coordinates must be an array of [longitude, latitude]',
      },
    },
  },
  { _id: false }
);

// ==================== SCHEMA DEFINITION ====================
const companySchema = new Schema<ICompany, ICompanyModel>(
  {
    companyId: {
      type: String,
      required: true,
      unique: true,
      maxlength: 36,
      default: uuidv4,
      validate: {
        validator: (v: string) => validId(v),
        message: 'Invalid UUID format'
      },
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    companySlug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      required: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
      validate: {
        validator: (v: string) => !v || /^[a-zA-Z0-9\s\-'&.,]+$/.test(v),
        message: 'Display name contains invalid characters',
      },
    },
    industry: {
      type: String,
      required: true,
      enum: Object.values(IndustryType),
    },
    subIndustry: {
      type: String,
      maxlength: 100,
    },
    companySize: {
      type: String,
      required: true,
      enum: Object.values(CompanySize),
    },
    organizationType: {
      type: String,
      enum: Object.values(OrganizationType),
      default: OrganizationType.PRIVATE,
    },
    operatingStatus: {
      type: String,
      enum: Object.values(OperatingStatus),
      default: OperatingStatus.OPERATING,
    },
    foundedYear: {
      type: Number,
      min: [1800, 'Founded year cannot be before 1800'],
      max: [new Date().getFullYear(), 'Founded year cannot be in the future'],
      validate: {
        validator: Number.isInteger,
        message: 'Founded year must be an integer',
      },
    },
    contact: {
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        validate: {
          validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
          message: 'Invalid email format',
        },
      },
      phone: {
        countryCode: { type: String, default: '+91', maxlength: 5 },
        number: {
          type: String,
          required: true,
          validate: {
            validator: (v: string) => /^\d{7,15}$/.test(v),
            message: 'Phone number must be between 7 and 15 digits',
          },
        },
      },
      website: {
        type: String,
        trim: true,
        validate: {
          validator: (v: string) => !v || /^https?:\/\/.+\..+/.test(v),
          message: 'Invalid website URL',
        },
      },
    },
    headquarters: {
      address: { type: String, required: true, maxlength: 200 },
      city: { type: String, required: true, maxlength: 50 },
      state: { type: String, required: true, maxlength: 50 },
      country: { type: String, default: 'India', maxlength: 50 },
      pincode: { type: String, maxlength: 10 },
      coordinates: {
        type: pointSchema,
        required: false,
        default: undefined,
      },
    },
    growthMetrics: {
      employeeGrowthRate: { type: Number, min: -100, max: 1000, default: 0 },
      revenueGrowth: { type: Number, min: -100, max: 1000 },
      fundingRaised: { type: Number, min: 0 },
      lastFundingRound: {
        amount: { type: Number, min: 0 },
        date: Date,
        stage: {
          type: String,
          enum: ['Seed', 'Series A', 'Series B', 'Series C', 'Series D+', 'IPO', 'Acquired', 'Bootstrap'],
        },
      },
      yearOverYearGrowth: { type: Number, min: -100, max: 1000 },
      marketShare: { type: Number, min: 0, max: 100 },
    },
    descriptions: {
      short: {
        type: String,
        maxlength: 300,
        validate: {
          validator: (v: string) =>
            !v || (v.length >= 10 && !/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(v)),
          message: 'Short description must be at least 10 characters and safe',
        },
      },
      detailed: {
        type: String,
        maxlength: 2000,
        validate: {
          validator: (v: string) =>
            !v || !/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(v),
          message: 'Description contains unsafe content',
        },
      },
      tagline: {
        type: String,
        maxlength: 150,
        validate: {
          validator: (v: string) =>
            !v || !/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(v),
          message: 'Tagline contains unsafe content',
        },
      },
    },
    media: {
      logo: { url: String, publicId: String, uploadedAt: Date },
      coverImage: { url: String, publicId: String, uploadedAt: Date },
    },
    socialMedia: {
      linkedin: String,
      twitter: String,
      facebook: String,
      instagram: String,
      youtube: String,
      github: String,
    },
    subscription: {
      plan: {
        type: String,
        enum: Object.values(SubscriptionPlan),
        default: SubscriptionPlan.FREE,
      },
      planId: {
        type: String,
        default: uuidv4,
        validate: { validator: validId, message: 'Invalid plan UUID' },
      },
      isActive: { type: Boolean, default: true },
      startDate: Date,
      endDate: Date,
      limits: {
        jobPosts: { type: Number, default: 5 },
        featuredJobs: { type: Number, default: 0 },
        resumeViews: { type: Number, default: 10 },
      },
    },
    account: {
      status: {
        type: String,
        enum: Object.values(AccountStatus),
        default: AccountStatus.PENDING,
      },
      isVerified: { type: Boolean, default: false },
      verifiedAt: Date,
      verificationMethod: {
        type: String,
        enum: Object.values(VerificationMethod),
      },
    },
    stats: {
      totalJobs: { type: Number, default: 0, min: 0 },
      activeJobs: { type: Number, default: 0, min: 0 },
      totalApplications: { type: Number, default: 0, min: 0 },
      successfulHires: { type: Number, default: 0, min: 0 },
      profileViews: { type: Number, default: 0, min: 0 },
      lastJobPosted: Date,
      successRate: { type: Number, default: 0, min: 0, max: 100 },
      followersCount: { type: Number, default: 0, min: 0 },
      postsCount: { type: Number, default: 0, min: 0 },
      employeesCount: { type: Number, default: 0, min: 0 },
    },
    preferences: {
      jobCategories: [{ type: String, maxlength: 50 }],
      skillsets: [{ type: String, maxlength: 50, index: 'text' }],
      experienceLevels: [{ type: String, enum: Object.values(ExperienceLevel) }],
      workTypes: [{ type: String, enum: Object.values(WorkType) }],
      remoteWork: {
        type: String,
        enum: Object.values(RemoteWorkType),
        default: RemoteWorkType.ON_SITE,
      },
    },
    seo: {
      metaTitle: { type: String, maxlength: 60 },
      metaDescription: { type: String, maxlength: 160 },
      keywords: [{ type: String, maxlength: 30 }],
      slug: { type: String, unique: true, sparse: true },
    },
    features: {
      isFeatured: { type: Boolean, default: false },
      isPremium: { type: Boolean, default: false },
      allowDirectContact: { type: Boolean, default: true },
      showSalaryRange: { type: Boolean, default: false },
      autoPostToSocial: { type: Boolean, default: false },
    },
    analytics: {
      viewCount: { type: Number, default: 0, min: 0 },
      applicationCount: { type: Number, default: 0, min: 0 },
      engagementScore: { type: Number, default: 0, min: 0, max: 100 },
      lastCalculated: { type: Date, default: Date.now },
    },
    audit: {
      createdBy: {
        type: String,
        required: true,
        validate: { validator: validId, message: 'Invalid creator UUID' },
      },
      updatedBy: {
        type: String,
        validate: { validator: validId, message: 'Invalid updater UUID' },
      },
      version: { type: Number, default: 1, min: 1 },
      isDeleted: { type: Boolean, default: false },
      deletedAt: Date,
      deletedBy: String,
    },
    relationships: {
      activeJobsCount: { type: Number, default: 0, min: 0 },
      totalReviewsCount: { type: Number, default: 0, min: 0 },
      averageRating: { type: Number, default: 0, min: 0, max: 5 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'companies',
    minimize: false,
    strict: true,
  }
);

// ==================== OPTIMIZED INDEXES ====================
// ✅ companyId, companySlug, companyName ke indexes REMOVE kiye
// Kyunki field definition mein  already hai — duplicate tha
// ❌ companySchema.index({ companyId: 1 });    REMOVED
// ❌ companySchema.index({ companySlug: 1 });  REMOVED
// ❌ companySchema.index({ companyName: 1 });  REMOVED

// ✅ Sirf compound indexes yahan hain
companySchema.index({ 'account.status': 1, 'account.isVerified': 1, industry: 1, 'audit.isDeleted': 1 });
companySchema.index({ 'headquarters.coordinates': '2dsphere' }, { sparse: true });
companySchema.index({ 'headquarters.city': 1, industry: 1, 'audit.isDeleted': 1 });
companySchema.index({ 'stats.profileViews': -1, createdAt: -1 });
companySchema.index({ 'features.isFeatured': 1, 'account.status': 1, 'audit.isDeleted': 1 });
companySchema.index(
  { companyName: 'text', 'descriptions.short': 'text', 'descriptions.detailed': 'text', 'preferences.skillsets': 'text' },
  { name: 'company_search_index', weights: { companyName: 10, 'descriptions.short': 5, 'descriptions.detailed': 3, 'preferences.skillsets': 1 } }
);
companySchema.index({ 'subscription.plan': 1, 'subscription.isActive': 1 });
companySchema.index(
  { 'audit.deletedAt': 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { 'audit.isDeleted': true } }
);
companySchema.index({ createdAt: -1 });
companySchema.index({ isVerified: 1, status: 1 });
companySchema.index({ industry: 1, companySize: 1 });

// ==================== PRE-VALIDATE MIDDLEWARE ====================
companySchema.pre('validate', function (next) {
  if (this.headquarters) {
    const coords = (this.headquarters as any)?.coordinates?.coordinates;
    const isValid = Array.isArray(coords) &&
      coords.length === 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number' &&
      !isNaN(coords[0]) &&
      !isNaN(coords[1]);
    if (!isValid) {
      (this.headquarters as any).coordinates = undefined;
    } else {
      (this.headquarters as any).coordinates.type = 'Point';
    }
  }
  next();
});

// ==================== PRE-SAVE MIDDLEWARE ====================
companySchema.pre('save', async function (next) {
  try {
    if (!this.companySlug && this.companyName) {
      this.companySlug = this.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    if (this.isModified('headquarters') && (!this.headquarters.coordinates?.coordinates?.length)) {
      const address = `${this.headquarters.address || ''}, ${this.headquarters.city}, ${this.headquarters.state}, ${this.headquarters.country}`;
      try {
        const result = await geocoder.geocode(address);
        if (result.length > 0 && result[0].longitude && result[0].latitude) {
          this.headquarters.coordinates = {
            type: 'Point',
            coordinates: [result[0].longitude, result[0].latitude],
          };
        }
      } catch (geoError) {
        logger.error('Geocoding error', { companyId: this.companyId, error: geoError });
      }
    }

    // Clean up coordinates if invalid GeoJSON
    if (this.headquarters) {
      const coords = this.headquarters.coordinates?.coordinates;
      if (Array.isArray(coords) && coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        this.headquarters.coordinates.type = 'Point';
      } else {
        this.headquarters.coordinates = undefined;
      }
    }

    if (this.audit?.updatedBy) {
      this.audit.updatedBy = sanitizeUserId(this.audit.updatedBy);
    }

    next();
  } catch (error: any) {
    logger.error('Pre-save middleware failed', { companyId: this.companyId, error });
    next(error as Error);
  }
});

// ==================== POST-SAVE MIDDLEWARE ====================
companySchema.post('save', async function (doc) {
  try {
    await Promise.all([
      CacheUtil.del(`company:${doc.companyId}`),
      CacheUtil.del(`company:slug:${doc.companySlug}`),
    ]);
    logger.info('Document saved', { companyId: doc.companyId });
  } catch (error: any) {
    logger.error('Post-save cache invalidation failed', { companyId: doc.companyId, error });
  }
});

// ==================== INSTANCE METHODS ====================
companySchema.methods.softDelete = async function (): Promise<Document & ICompany> {
  this.audit.isDeleted = true;
  this.audit.deletedAt = new Date();
  return await this.save();
};

companySchema.methods.incrementStat = async function (
  field: 'followersCount' | 'postsCount' | 'employeesCount'
): Promise<Document & ICompany> {
  const CompanyModel = this.constructor as any;
  const updated = await CompanyModel.findByIdAndUpdate(
    this._id,
    { $inc: { [`stats.${field}`]: 1 } },
    { new: true }
  );
  if (updated) {
    this.stats = updated.stats;
  }
  return this;
};

companySchema.methods.decrementStat = async function (
  field: 'followersCount' | 'postsCount' | 'employeesCount'
): Promise<Document & ICompany> {
  const CompanyModel = this.constructor as any;
  const updated = await CompanyModel.findByIdAndUpdate(
    this._id,
    { $inc: { [`stats.${field}`]: -1 } },
    { new: true }
  );
  if (updated) {
    this.stats = updated.stats;
  }
  return this;
};

// ==================== STATIC METHODS ====================
companySchema.statics.findForListing = function (
  filters: ICompanySearchFilters = {},
  options: ISearchOptions = {}
) {
  const {
    page = 1,
    limit = 20,
    sort = { 'stats.profileViews': -1, createdAt: -1 },
  } = options;

  const query = {
    'account.status': AccountStatus.ACTIVE,
    'audit.isDeleted': false,
    ...filters,
  };

  return this.find(query, {
    companyId: 1,
    companyName: 1,
    companySlug: 1,
    industry: 1,
    companySize: 1,
    'headquarters.city': 1,
    'headquarters.state': 1,
    'media.logo': 1,
    'descriptions.tagline': 1,
    'stats.profileViews': 1,
    'features.isFeatured': 1,
    'features.isPremium': 1,
    'relationships.averageRating': 1,
    createdAt: 1,
  })
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
};

companySchema.statics.findProfile = function (identifier: string) {
  const query =
    typeof identifier === 'string' && identifier.includes('-')
      ? { companySlug: identifier }
      : { companyId: identifier };

  return this.findOne({ ...query, 'audit.isDeleted': false })
    .select('-audit -__v')
    .lean();
};

companySchema.statics.searchCompanies = async function (
  searchQuery: string,
  filters: ICompanySearchFilters = {},
  options: ISearchOptions = {}
) {
  const cacheKey = `search:${Buffer.from(JSON.stringify({ searchQuery, filters, options })).toString('base64')}`;

  try {
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.debug('✅ [COMPANY] Search cache hit', { cacheKey });
      return JSON.parse(cached);
    }
  } catch (error: any) {
    logger.warn('⚠️ [COMPANY] Cache retrieval failed', { error: error instanceof Error ? error.message : String(error) });
  }

  const query = {
    $text: { $search: searchQuery },
    'account.status': AccountStatus.ACTIVE,
    'audit.isDeleted': false,
    ...filters,
  };

  const results = await this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, 'stats.profileViews': -1 })
    .limit(options.limit || 50)
    .lean();

  try {
    await CacheUtil.set(cacheKey, JSON.stringify(results), 300);
    logger.debug('✅ [COMPANY] Search results cached', { cacheKey });
  } catch (error: any) {
    logger.warn('⚠️ [COMPANY] Cache storage failed', { error: error instanceof Error ? error.message : String(error) });
  }

  return results;
};

companySchema.statics.bulkUpdateStats = async function (updates: IStatsUpdate[]) {
  const bulkOps = updates.map(({ companyId, stats }) => {
    const updateFields: Record<string, any> = {
      'analytics.lastCalculated': new Date(),
      updatedAt: new Date(),
    };

    if (stats.totalJobs !== undefined) updateFields['stats.totalJobs'] = stats.totalJobs;
    if (stats.activeJobs !== undefined) updateFields['stats.activeJobs'] = stats.activeJobs;
    if (stats.totalApplications !== undefined) updateFields['stats.totalApplications'] = stats.totalApplications;
    if (stats.successfulHires !== undefined) updateFields['stats.successfulHires'] = stats.successfulHires;
    if (stats.profileViews !== undefined) updateFields['stats.profileViews'] = stats.profileViews;
    if (stats.lastJobPosted !== undefined) updateFields['stats.lastJobPosted'] = stats.lastJobPosted;
    if (stats.successRate !== undefined) updateFields['stats.successRate'] = stats.successRate;
    if (stats.followersCount !== undefined) updateFields['stats.followersCount'] = stats.followersCount;
    if (stats.postsCount !== undefined) updateFields['stats.postsCount'] = stats.postsCount;
    if (stats.employeesCount !== undefined) updateFields['stats.employeesCount'] = stats.employeesCount;

    return {
      updateOne: {
        filter: { companyId, 'audit.isDeleted': false },
        update: {
          $set: updateFields,
          $inc: { 'audit.version': 1 },
        },
      },
    };
  });

  return this.bulkWrite(bulkOps, { ordered: false });
};

companySchema.statics.findActive = function () {
  return this.find({ 'account.status': AccountStatus.ACTIVE });
};

companySchema.statics.findVerified = function () {
  return this.find({ 'account.isVerified': true, 'account.status': AccountStatus.ACTIVE });
};

companySchema.statics.searchByText = function (searchTerm: string) {
  return this.find({
    $text: { $search: searchTerm },
    'account.status': AccountStatus.ACTIVE
  }).sort({ score: { $meta: 'textScore' } });
};

companySchema.statics.findNearby = function (longitude: number, latitude: number, maxDistance = 50000) {
  return this.find({
    'headquarters.coordinates': {
      $near: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
        $maxDistance: maxDistance
      }
    },
    'account.status': AccountStatus.ACTIVE
  });
};

// ==================== API CLIENT METHODS ====================
let apiCache: Map<string, { data: any; timestamp: number }> = new Map();
let apiClient: ApiClient;
const CACHE_TTL = 5 * 60 * 1000;

if (!config.COMPANY_SERVICE_URL) {
  logger.warn('COMPANY_SERVICE_URL not configured. Company service integration disabled.');
}

apiClient = new ApiClient(
  { baseURL: config.COMPANY_SERVICE_URL || 'http://localhost:4001', timeout: 15000 },
  'Company Service'
);

companySchema.statics.getCompanyById = async function (companyId: string, authToken?: string): Promise<ICompany> {
  try {
    const cached = apiCache.get(companyId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    if (authToken) apiClient.setAuthToken(authToken);
    const response = await apiClient.get<ApiResponse<ICompany>>(`/api/companies/${companyId}`);
    if (!response.success || !response.data) throw new Error('Company not found');
    apiCache.set(companyId, { data: response.data, timestamp: Date.now() });
    return response.data;
  } catch (error: any) {
    logger.error(`Failed to fetch company: ${error}`);
    throw error;
  }
};

companySchema.statics.getCompaniesByIds = async function (companyIds: string[], authToken?: string): Promise<ICompany[]> {
  try {
    if (authToken) apiClient.setAuthToken(authToken);
    const response = await apiClient.post<ApiResponse<ICompany[]>>('/api/companies/bulk', { companyIds });
    if (!response.success || !response.data) throw new Error('Failed to fetch companies');
    response.data.forEach((company) => {
      apiCache.set(company.companyId, { data: company, timestamp: Date.now() });
    });
    return response.data;
  } catch (error: any) {
    logger.error(`Failed to fetch companies: ${error}`);
    throw error;
  }
};

companySchema.statics.getCompanyProfile = async function (companyId: string, authToken?: string): Promise<CompanyProfile> {
  try {
    if (authToken) apiClient.setAuthToken(authToken);
    const response = await apiClient.get<ApiResponse<CompanyProfile>>(`/api/companies/${companyId}/profile`);
    if (!response.success || !response.data) throw new Error('Company profile not found');
    return response.data;
  } catch (error: any) {
    logger.error(`Failed to fetch company profile: ${error}`);
    throw error;
  }
};

companySchema.statics.verifyCompanyExists = async function (companyId: string): Promise<boolean> {
  try {
    await this.getCompanyById(companyId);
    return true;
  } catch {
    return false;
  }
};

companySchema.statics.getCompanyBySlug = async function (slug: string, authToken?: string): Promise<ICompany | null> {
  try {
    if (authToken) apiClient.setAuthToken(authToken);
    const response = await apiClient.get<ApiResponse<ICompany>>(`/api/companies/slug/${slug}`);
    return response.success && response.data ? response.data : null;
  } catch (error: any) {
    logger.error(`Failed to fetch company by slug: ${error}`);
    return null;
  }
};

companySchema.statics.getAllCompanies = async function (
  page: number = 1,
  limit: number = 20,
  filters?: Record<string, any>,
  authToken?: string
): Promise<{ companies: ICompany[]; total: number }> {
  try {
    if (authToken) apiClient.setAuthToken(authToken);
    const response = await apiClient.get<ApiResponse<ICompany[]>>('/api/companies', { params: { page, limit, ...filters } });
    if (!response.success) throw new Error('Failed to fetch companies');
    return { companies: response.data || [], total: response.meta?.total || 0 };
  } catch (error: any) {
    logger.error(`Failed to fetch all companies: ${error}`);
    return { companies: [], total: 0 };
  }
};

companySchema.statics.getTopCompanies = async function (limit: number = 10, authToken?: string): Promise<ICompany[]> {
  try {
    if (authToken) apiClient.setAuthToken(authToken);
    const response = await apiClient.get<ApiResponse<ICompany[]>>('/api/companies/top', { params: { limit } });
    return response.success && response.data ? response.data : [];
  } catch (error: any) {
    logger.error(`Failed to fetch top companies: ${error}`);
    return [];
  }
};

companySchema.statics.clearCache = function (companyId?: string): void {
  if (companyId) {
    apiCache.delete(companyId);
  } else {
    apiCache.clear();
  }
};

companySchema.statics.clearExpiredCache = function (): void {
  const now = Date.now();
  let cleared = 0;
  apiCache.forEach((value, key) => {
    if (now - value.timestamp >= CACHE_TTL) {
      apiCache.delete(key);
      cleared++;
    }
  });
  if (cleared > 0) logger.debug(`Cleared ${cleared} expired cache entries`);
};

mongoose.set('maxTimeMS', 30000);
mongoose.set('bufferCommands', true);

// ==================== SERVICES ====================
export class CompanyStatsService {
  static async updateAnalytics(companyId: string): Promise<void> {
    try {
      const stats = await this.calculateStats(companyId);
      await Company.updateOne(
        { companyId },
        { $set: { analytics: stats, 'analytics.lastCalculated': new Date() } }
      );
      await CacheUtil.del(`company:${companyId}`);
      logger.info('✅ [COMPANY] Analytics updated', { companyId });
    } catch (error: any) {
      logger.error('❌ [COMPANY] Stats update failed', { companyId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  static async calculateStats(companyId: string): Promise<IAnalytics> {
    return { viewCount: 0, applicationCount: 0, engagementScore: 0, lastCalculated: new Date() };
  }
}

export class CompanyEventService {
  static async logEvent(companyId: string, eventType: string, data: Record<string, any> = {}): Promise<void> {
    try {
      logger.info('📊 [COMPANY EVENT]', { companyId, eventType, data, timestamp: new Date() });
    } catch (error: any) {
      logger.error('❌ [COMPANY] Event logging failed', { companyId, eventType, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export class CompanyIndexMonitoringService {
  static async monitorIndexUsage(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) { logger.warn('⚠️ [COMPANY] Database not connected'); return; }
      const stats = await db.collection('companies').aggregate([{ $indexStats: {} }]).toArray();
      logger.info('📊 [COMPANY] Index usage stats', { stats });
      stats.forEach((index: any) => {
        if (index.accesses.ops < 100 && index.name !== '_id_') {
          logger.warn('⚠️ [COMPANY] Low index usage detected', { index: index.name, usage: index.accesses.ops });
        }
      });
    } catch (error: any) {
      logger.error('❌ [COMPANY] Index monitoring failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export class CompanyMaintenanceService {
  static async cleanupDeletedRecords(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await Company.deleteMany({
        'audit.isDeleted': true,
        'audit.deletedAt': { $lt: thirtyDaysAgo },
      });
      logger.info('✅ [COMPANY] Cleanup completed', { deletedCount: result.deletedCount });
    } catch (error: any) {
      logger.error('❌ [COMPANY] Cleanup failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  static async optimizeIndexes(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) throw new Error('Database not connected');
      const collection = db.collection('companies');
      await collection.dropIndexes();
      logger.info('✅ [COMPANY] Index optimization completed');
    } catch (error: any) {
      logger.error('❌ [COMPANY] Index optimization failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

// ==================== MODEL EXPORT ====================
const Company = mongoose.model<ICompany, ICompanyModel>('Company', companySchema);
export default Company;