import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { schemaOperationLatency, schemaOperationErrors } from '@/shared/metrics';
// import { constants.CACHE_TTLS '../constants/cache';
import { generateSecureId } from '@/shared/security';
import constants from '@/shared/constants.util';

// Enums
export enum VerificationType {
  COMPANY_VERIFICATION = 'company_verification',
  SPAM_CHECK = 'spam_check',
  SALARY_VERIFICATION = 'salary_verification',
  DUPLICATE_CHECK = 'duplicate_check',
  QUALITY_ASSESSMENT = 'quality_assessment'
}

export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

export enum SalaryPeriod {
  HOURLY = 'hourly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly'
}

export enum VerificationMethod {
  VERIFIED = 'verified',
  PENDING = 'pending',
  FAILED = 'failed'
}

// Interfaces
interface IProvidedSalary {
  amount?: number;
  currency?: string;
  period?: SalaryPeriod;
  verified?: boolean;
}

interface IMarketData {
  minSalary?: number;
  maxSalary?: number;
  medianSalary?: number;
  dataSource?: string;
  confidence?: number;
}

interface IVerification {
  status?: VerificationMethod;
  method?: string;
  confidence?: number;
  notes?: string;
}

interface IMetrics {
  completeness?: number;
  accuracy?: number;
  relevance?: number;
  freshness?: number;
  reliability?: number;
}

interface IMetadata {
  source?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
}

export interface IQualityTrust extends Document {
  _id: mongoose.Types.ObjectId;
  type: VerificationType;
  companyId?: string;
  jobId?: string;
  userId?: string;
  verifiedBy?: string;
  verificationChecks?: any;
  spamScore?: number;
  isSpam: boolean;
  checks?: any;
  providedSalary?: IProvidedSalary;
  marketData?: IMarketData;
  verification?: IVerification;
  isDuplicate: boolean;
  hasSimilarRecent: boolean;
  existingApplications?: mongoose.Types.ObjectId[];
  similarApplications?: mongoose.Types.ObjectId[];
  metrics?: IMetrics;
  overallScore?: number;
  status: VerificationStatus;
  verifiedAt?: Date;
  checkedAt?: Date;
  assessedAt?: Date;
  expiresAt?: Date;
  schemaVersion: number;
  metadata?: IMetadata;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  markAsSpam(score?: number): Promise<IQualityTrust>;
  markAsVerified(verifiedBy: string): Promise<IQualityTrust>;
  updateScore(newScore: number): Promise<IQualityTrust>;
}

// Static methods interface
interface IQualityTrustModel extends Model<IQualityTrust> {
  findByCompanyAndType(
    companyId: string,
    type: VerificationType,
    limit?: number,
    skip?: number
  ): Promise<IQualityTrust[]>;
  findSpamRecords(
    threshold?: number,
    limit?: number,
    skip?: number
  ): Promise<IQualityTrust[]>;
  getQualityStats(userId: string): Promise<any[]>;
}

// Schema definition
const qualityTrustSchema = new Schema<IQualityTrust>(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => generateSecureId(),
    },
    type: {
      type: String,
      enum: {
        values: Object.values(VerificationType),
        message: 'Invalid verification type',
      },
      required: [true, 'Verification type is required'],
    },
    companyId: {
      type: String,
      ref: 'Company',
      index: { sparse: true },
      default: uuidv4,
      validate: {
        validator: function (v: string) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        },
        message: 'Invalid companyId',
      },
    },
    jobId: {
      type: String,
      ref: 'Job',
      index: { sparse: true },
      default: uuidv4,
      validate: {
        validator: function (v: string) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        },
        message: 'Invalid jobId',
      },
    },
    userId: {
      type: String,
      ref: 'User',
      index: { sparse: true },
      default: uuidv4,
      validate: {
        validator: function (v: string) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        },
        message: 'Invalid userId',
      },
    },
    verifiedBy: {
      type: String,
      ref: 'User',
      validate: {
        validator: function (v: string | undefined) {
          return !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        },
        message: 'Invalid verifiedBy',
      },
    },
    verificationChecks: {
      type: Schema.Types.Mixed,
      validate: {
        validator: function (v: any) {
          return !v || (typeof v === 'object' && JSON.stringify(v).length < 10000);
        },
        message: 'VerificationChecks data too large (max 10KB)',
      },
    },
    spamScore: {
      type: Number,
      min: [0, 'Spam score cannot be negative'],
      max: [100, 'Spam score cannot exceed 100'],
      index: { sparse: true },
    },
    isSpam: {
      type: Boolean,
      index: { sparse: true },
      default: false,
    },
    checks: {
      type: Schema.Types.Mixed,
      validate: {
        validator: function (v: any) {
          return !v || (typeof v === 'object' && JSON.stringify(v).length < 5000);
        },
        message: 'Checks data too large (max 5KB)',
      },
    },
    providedSalary: {
      amount: { type: Number, min: 0 },
      currency: {
        type: String,
        maxlength: 3,
        validate: {
          validator: function (v: string | undefined) {
            return !v || /^[A-Z]{3}$/.test(v);
          },
          message: 'Currency must be a valid ISO 4217 code (e.g., USD, EUR)',
        },
      },
      period: { type: String, enum: Object.values(SalaryPeriod) },
      verified: { type: Boolean, default: false },
    },
    marketData: {
      minSalary: { type: Number, min: 0 },
      maxSalary: { type: Number, min: 0 },
      medianSalary: { type: Number, min: 0 },
      dataSource: { type: String, maxlength: 100 },
      confidence: { type: Number, min: 0, max: 100 },
    },
    verification: {
      status: { type: String, enum: Object.values(VerificationMethod) },
      method: { type: String, maxlength: 50 },
      confidence: { type: Number, min: 0, max: 100 },
      notes: { type: String, maxlength: 500 },
    },
    isDuplicate: {
      type: Boolean,
      default: false,
      index: { sparse: true },
    },
    hasSimilarRecent: {
      type: Boolean,
      default: false,
      index: { sparse: true },
    },
    existingApplications: {
      type: [Schema.Types.ObjectId],
      ref: 'Application',
      validate: {
        validator: function (v: mongoose.Types.ObjectId[] | undefined) {
          return !v || v.length <= 100;
        },
        message: 'Too many existing applications (max 100)',
      },
    },
    similarApplications: {
      type: [Schema.Types.ObjectId],
      ref: 'Application',
      validate: {
        validator: function (v: mongoose.Types.ObjectId[] | undefined) {
          return !v || v.length <= 50;
        },
        message: 'Too many similar applications (max 50)',
      },
    },
    metrics: {
      completeness: { type: Number, min: 0, max: 100, default: 0 },
      accuracy: { type: Number, min: 0, max: 100, default: 0 },
      relevance: { type: Number, min: 0, max: 100, default: 0 },
      freshness: { type: Number, min: 0, max: 100, default: 0 },
      reliability: { type: Number, min: 0, max: 100, default: 0 },
    },
    overallScore: {
      type: Number,
      min: [0, 'Overall score cannot be negative'],
      max: [100, 'Overall score cannot exceed 100'],
      index: { sparse: true },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(VerificationStatus),
        message: 'Invalid status',
      },
      default: VerificationStatus.PENDING,
    },
    verifiedAt: {
      type: Date,
      index: { sparse: true },
    },
    checkedAt: {
      type: Date,
      index: { sparse: true },
    },
    assessedAt: {
      type: Date,
      index: { sparse: true },
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 },
    },
    schemaVersion: {
      type: Number,
      default: 2,
    },
    metadata: {
      source: { type: String, maxlength: 50 },
      ipAddress: { type: String, maxlength: 45 },
      userAgent: { type: String, maxlength: 500 },
      sessionId: { type: String, maxlength: 100 },
      requestId: { type: String, maxlength: 100 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
    strict: true,
    validateBeforeSave: true,
    collection: 'quality_trust',
    toJSON: {
      transform: (doc, ret) => {
        delete ret.metadata?.ipAddress;
        delete ret.metadata?.userAgent;
        return ret;
      },
    },
  }
);

// Optimized compound indexes for 1M+ users
qualityTrustSchema.index({ companyId: 1, type: 1, status: 1 }, { sparse: true });
qualityTrustSchema.index({ jobId: 1, type: 1, createdAt: -1 }, { sparse: true });
qualityTrustSchema.index({ userId: 1, jobId: 1, type: 1 }, { sparse: true });
qualityTrustSchema.index({ type: 1, status: 1, createdAt: -1 });
qualityTrustSchema.index({ isSpam: 1, spamScore: -1 }, { sparse: true });
qualityTrustSchema.index({ isDuplicate: 1, hasSimilarRecent: 1 }, { sparse: true });
qualityTrustSchema.index({ overallScore: -1, status: 1 }, { sparse: true });
qualityTrustSchema.index({ type: 1, createdAt: 1 }, { unique: false }); // Candidate shard key

// Pre-save middleware
qualityTrustSchema.pre<IQualityTrust>('save', function (next) {
  const operation = 'save';
  try {
    const latency = schemaOperationLatency.startTimer({ operation });

    // Set dynamic TTL based on type
    if (!this.expiresAt && this.type) {
      this.expiresAt = new Date(Date.now() + ((constants.CACHE_TTLS)[this.type] || 86400) * 1000);
    }

    // Set timestamps
    if (this.isModified('status')) {
      if (this.status === VerificationStatus.VERIFIED && !this.verifiedAt) {
        this.verifiedAt = new Date();
      } else if (this.status === VerificationStatus.REJECTED) {
        this.checkedAt = new Date();
      }
    }

    // Validate salary consistency
    if (this.providedSalary?.amount && this.marketData?.minSalary) {
      if (this.providedSalary.amount < this.marketData.minSalary * 0.5) {
        this.verification = this.verification || {};
        this.verification.status = VerificationMethod.FAILED;
        this.verification.notes = 'Salary significantly below market range';
      }
    }

    latency();
    next();
  } catch (error : any) {
    schemaOperationErrors.inc({ operation });
    next(error as Error);
  }
});

// Instance methods
qualityTrustSchema.methods.markAsSpam = async function (score: number = 100): Promise<IQualityTrust> {
  const operation = 'markAsSpam';
  try {
    const latency = schemaOperationLatency.startTimer({ operation });
    this.isSpam = true;
    this.spamScore = Math.min(score, 100);
    this.status = VerificationStatus.REJECTED;
    this.checkedAt = new Date();
    const result = await this.save();
    latency();
    return result;
  } catch (error : any) {
    schemaOperationErrors.inc({ operation });
    throw error;
  }
};

qualityTrustSchema.methods.markAsVerified = async function (verifiedBy: string): Promise<IQualityTrust> {
  const operation = 'markAsVerified';
  try {
    const latency = schemaOperationLatency.startTimer({ operation });
    this.status = VerificationStatus.VERIFIED;
    this.verifiedBy = verifiedBy;
    this.verifiedAt = new Date();
    const result = await this.save();
    latency();
    return result;
  } catch (error : any) {
    schemaOperationErrors.inc({ operation });
    throw error;
  }
};

qualityTrustSchema.methods.updateScore = async function (newScore: number): Promise<IQualityTrust> {
  const operation = 'updateScore';
  try {
    const latency = schemaOperationLatency.startTimer({ operation });
    this.overallScore = Math.max(0, Math.min(100, newScore));
    this.assessedAt = new Date();
    const result = await this.save();
    latency();
    return result;
  } catch (error : any) {
    schemaOperationErrors.inc({ operation });
    throw error;
  }
};

// Static methods
qualityTrustSchema.statics.findByCompanyAndType = async function (
  companyId: string,
  type: VerificationType,
  limit: number = 100,
  skip: number = 0
): Promise<IQualityTrust[]> {
  const operation = 'findByCompanyAndType';
  try {
    const latency = schemaOperationLatency.startTimer({ operation });
    const result = await this.find({ companyId, type })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    latency();
    return result;
  } catch (error : any) {
    schemaOperationErrors.inc({ operation });
    throw error;
  }
};

qualityTrustSchema.statics.findSpamRecords = async function (
  threshold: number = 80,
  limit: number = 100,
  skip: number = 0
): Promise<IQualityTrust[]> {
  const operation = 'findSpamRecords';
  try {
    const latency = schemaOperationLatency.startTimer({ operation });
    const result = await this.find({
      $or: [{ isSpam: true }, { spamScore: { $gte: threshold } }],
    })
      .sort({ spamScore: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    latency();
    return result;
  } catch (error : any) {
    schemaOperationErrors.inc({ operation });
    throw error;
  }
};

qualityTrustSchema.statics.getQualityStats = async function (userId: string): Promise<any[]> {
  const operation = 'getQualityStats';
  try {
    const latency = schemaOperationLatency.startTimer({ operation });
    const result = await this.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$type',
          avgScore: { $avg: '$overallScore' },
          totalRecords: { $sum: 1 },
          verifiedCount: { $sum: { $cond: [{ $eq: ['$status', VerificationStatus.VERIFIED] }, 1, 0] } },
          spamCount: { $sum: { $cond: ['$isSpam', 1, 0] } },
        },
      },
    ]);
    latency();
    return result;
  } catch (error : any) {
    schemaOperationErrors.inc({ operation });
    throw error;
  }
};

// Create model
const QualityTrust = mongoose.model<IQualityTrust, IQualityTrustModel>('QualityTrust', qualityTrustSchema);

// Utility methods
export const QualityTrustUtils = {
  async bulkCreateRecords(records: Partial<IQualityTrust>[]): Promise</*IQualityTrust[] */ any> {
    // const operation = 'bulkCreateRecords';
    // try {
    //   const latency = schemaOperationLatency.startTimer({ operation });
    //   const result = await QualityTrust.insertMany(records, {
    //     ordered: false,
    //     writeConcern: { w: 1 },
    //     lean: true,
    //   });
    //   latency();
    //   return result;
    // } catch (error: any) {
    //   schemaOperationErrors.inc({ operation });
    //   throw new Error(`Bulk create failed: ${error.message}`);
    // }
  },

  async cleanupExpiredRecords(): Promise<any> {
    const operation = 'cleanupExpiredRecords';
    try {
      const latency = schemaOperationLatency.startTimer({ operation });
      const result = await QualityTrust.deleteMany({
        expiresAt: { $lte: new Date() },
      });
      latency();
      return result;
    } catch (error: any) {
      schemaOperationErrors.inc({ operation });
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  },

  async getCollectionStats(): Promise<any> {
    const operation = 'getCollectionStats';
    // try {
    //   const latency = schemaOperationLatency.startTimer({ operation });
    //   const result = await QualityTrust.collection.stats();
    //   latency();
    //   return result;
    // } catch (error: any) {
    //   schemaOperationErrors.inc({ operation });
    //   throw new Error(`Stats retrieval failed: ${error.message}`);
    // }
  },

  async ensureIndexes(): Promise<any> {
    const operation = 'ensureIndexes';
    try {
      const latency = schemaOperationLatency.startTimer({ operation });
      const result = await QualityTrust.createIndexes();
      latency();
      return result;
    } catch (error: any) {
      schemaOperationErrors.inc({ operation });
      throw new Error(`Index creation failed: ${error.message}`);
    }
  },

  async migrateSchema(oldVersion: number, newVersion: number): Promise<{ success: boolean; migratedRecords: number }> {
    const operation = 'migrateSchema';
    try {
      const latency = schemaOperationLatency.startTimer({ operation });
      if (oldVersion === 1 && newVersion === 2) {
        await QualityTrust.updateMany(
          { schemaVersion: 1 },
          {
            $set: {
              schemaVersion: 2,
              expiresAt: {
                $cond: [
                  { $eq: ['$type', VerificationType.COMPANY_VERIFICATION] },
                  new Date(Date.now() + (constants.CACHE_TTLS.company_verification) * 1000),
                  {
                    $cond: [
                      { $eq: ['$type', VerificationType.SPAM_CHECK] },
                      new Date(Date.now() + (constants.CACHE_TTLS.spam_check) * 1000),
                      {
                        $cond: [
                          { $eq: ['$type', VerificationType.SALARY_VERIFICATION] },
                          new Date(Date.now() + (constants.CACHE_TTLS.salary_verification) * 1000),
                          {
                            $cond: [
                              { $eq: ['$type', VerificationType.DUPLICATE_CHECK] },
                              new Date(Date.now() + (constants.CACHE_TTLS.duplicate_check) * 1000),
                              new Date(Date.now() + (constants.CACHE_TTLS.quality_assessment) * 1000),
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          }
        );
      }
      latency();
      const migratedRecords = await QualityTrust.countDocuments({ schemaVersion: newVersion });
      return { success: true, migratedRecords };
    } catch (error: any) {
      schemaOperationErrors.inc({ operation });
      throw new Error(`Schema migration failed: ${error.message}`);
    }
  },
};

export const QualityTrustTypes = {
  VERIFICATION_TYPES: Object.values(VerificationType),
  STATUS_TYPES: Object.values(VerificationStatus),
  SALARY_PERIODS: Object.values(SalaryPeriod),
};

export default QualityTrust;