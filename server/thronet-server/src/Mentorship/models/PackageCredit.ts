// src/models/PackageCredit.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Credit Status
 */
export enum CreditStatus {
  AVAILABLE = 'available',
  USED = 'used',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}

/**
 * PackageCredit Interface
 */
export interface IPackageCredit extends Document {
  _id: mongoose.Types.ObjectId;
  
  // References
  packageId: string; // Reference to Package
  userId: string;
  sessionId?: string; // Set when credit is used
  mentorId?: string;
  
  // Credit details
  creditNumber: number; // Which credit in the package (1, 2, 3, etc.)
  status: CreditStatus;
  
  // Usage tracking
  usedAt?: Date;
  expiresAt: Date;
  
  // Session details (when used)
  sessionType?: string;
  sessionDate?: Date;
  sessionDuration?: number;
  
  // Metadata
  notes?: string;
  refundReason?: string;
  refundedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  markAsUsed(sessionId: string, sessionType: string, sessionDate: Date): Promise<void>;
  markAsExpired(): Promise<void>;
  markAsRefunded(reason: string): Promise<void>;
  isExpired(): boolean;
}

/**
 * PackageCredit Schema
 */
const PackageCreditSchema = new Schema<IPackageCredit>(
  {
    packageId: {
      type: String,
      ref: 'Package',
      required: [true, 'Package ID is required'],
      index: true,
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    sessionId: {
      type: String,
      ref: 'Session',

      index: true,
    },
    mentorId: {
      type: String,
      index: true,
    },
    creditNumber: {
      type: Number,
      required: [true, 'Credit number is required'],
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(CreditStatus),
      default: CreditStatus.AVAILABLE,
      index: true,
    },
    usedAt: Date,
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
      index: true,
    },
    sessionType: String,
    sessionDate: Date,
    sessionDuration: Number,
    notes: String,
    refundReason: String,
    refundedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Compound Indexes
 */
PackageCreditSchema.index({ packageId: 1, creditNumber: 1 }, { unique: true });
PackageCreditSchema.index({ userId: 1, status: 1 });
PackageCreditSchema.index({ packageId: 1, status: 1 });
PackageCreditSchema.index({ expiresAt: 1, status: 1 });

/**
 * Method: Mark credit as used
 */
PackageCreditSchema.methods.markAsUsed = async function (
  sessionId: string,
  sessionType: string,
  sessionDate: Date
): Promise<void> {
  if (this.status !== CreditStatus.AVAILABLE) {
    throw new Error('Credit is not available for use');
  }

  if (this.isExpired()) {
    throw new Error('Credit has expired');
  }

  this.status = CreditStatus.USED;
  this.sessionId = sessionId;
  this.sessionType = sessionType;
  this.sessionDate = sessionDate;
  this.usedAt = new Date();

  await this.save();
};

/**
 * Method: Mark credit as expired
 */
PackageCreditSchema.methods.markAsExpired = async function (): Promise<void> {
  if (this.status !== CreditStatus.AVAILABLE) {
    return;
  }

  this.status = CreditStatus.EXPIRED;
  await this.save();
};

/**
 * Method: Mark credit as refunded
 */
PackageCreditSchema.methods.markAsRefunded = async function (reason: string): Promise<void> {
  this.status = CreditStatus.REFUNDED;
  this.refundReason = reason;
  this.refundedAt = new Date();
  await this.save();
};

/**
 * Method: Check if credit is expired
 */
PackageCreditSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

/**
 * Virtual: Package reference
 */
PackageCreditSchema.virtual('package', {
  ref: 'Package',
  localField: 'packageId',
  foreignField: '_id',
  justOne: true,
});

/**
 * Virtual: Session reference
 */
PackageCreditSchema.virtual('session', {
  ref: 'Session',
  localField: 'sessionId',
  foreignField: '_id',
  justOne: true,
});

/**
 * Static: Get available credits for user
 */
PackageCreditSchema.statics.getAvailableCredits = async function (
  userId: string,
  packageId?: string
) {
  const query: any = {
    userId,
    status: CreditStatus.AVAILABLE,
    expiresAt: { $gt: new Date() },
  };

  if (packageId) {
    query.packageId = packageId;
  }

  return await this.find(query).sort({ expiresAt: 1 });
};

/**
 * Static: Get credit usage summary
 */
PackageCreditSchema.statics.getCreditSummary = async function (
  userId: string,
  packageId?: string
) {
  const match: any = { userId };
  if (packageId) {
    match.packageId = packageId;
  }

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
};

/**
 * Static: Create credits for package
 */
PackageCreditSchema.statics.createCreditsForPackage = async function (
  packageId: string,
  userId: string,
  totalCredits: number,
  expiresAt: Date,
  mentorId?: string
) {
  const credits = [];

  for (let i = 1; i <= totalCredits; i++) {
    credits.push({
      packageId,
      userId,
      mentorId,
      creditNumber: i,
      status: CreditStatus.AVAILABLE,
      expiresAt,
    });
  }

  return await this.insertMany(credits);
};

/**
 * Create and export model
 */
const PackageCredit: Model<IPackageCredit> = mongoose.model<IPackageCredit>(
  'PackageCredit',
  PackageCreditSchema
);

export default PackageCredit;