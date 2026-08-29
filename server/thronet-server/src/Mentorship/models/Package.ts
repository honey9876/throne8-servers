import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export enum PackageType {
  STARTER      = 'starter',
  PROFESSIONAL = 'professional',
  PREMIUM      = 'premium',
  CUSTOM       = 'custom',
}

export enum PackageStatus {
  ACTIVE    = 'active',
  EXPIRED   = 'expired',
  EXHAUSTED = 'exhausted',
  CANCELLED = 'cancelled',
}

export interface IPackage extends Document {
  _id: mongoose.Types.ObjectId;
  packageId: string;
  packageType: PackageType;
  name: string;
  description: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  pricePerSession: number;
  totalPrice: number;
  discountPercentage: number;
  actualPrice: number;
  validityDays: number;
  expiresAt: Date;
  status: PackageStatus;
  features: string[];
  userId: string;
  mentorId?: string;
  payment: {
    transactionId?: string;
    paymentMethod: string;
    paidAt?: Date;
    invoiceUrl?: string;
  };
  isRecurring: boolean;
  recurringFrequency?: 'weekly' | 'biweekly' | 'monthly';
  autoRenew: boolean;
  purchasedAt: Date;
  lastUsedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  useSession(): Promise<void>;
  canUseSession(): boolean;
  isExpired(): boolean;
  getRemainingDays(): number;
  cancelPackage(reason: string): Promise<void>;
}

// Static methods interface (separate from instance)
interface PackageModel extends Model<IPackage> {
  getUserPackageSummary(userId: string): Promise<any[]>;
}

const PackageSchema = new Schema<IPackage>(
  {
    packageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
    },
    packageType: {
      type: String,
      enum: Object.values(PackageType),
      required: [true, 'Package type is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Package name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Package description is required'],
      trim: true,
    },
    totalSessions: {
      type: Number,
      required: [true, 'Total sessions is required'],
      min: [1, 'Total sessions must be at least 1'],
    },
    usedSessions:      { type: Number, default: 0, min: 0 },
    remainingSessions: { type: Number, default: 0 }, // set in pre-save
    pricePerSession: {
      type: Number,
      required: [true, 'Price per session is required'],
      min: [0, 'Price cannot be negative'],
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    actualPrice:        { type: Number, required: true },
    validityDays: {
      type: Number,
      required: [true, 'Validity days is required'],
      min: [1, 'Validity must be at least 1 day'],
      default: 180,
    },
    expiresAt: { type: Date, index: true }, // set by pre-save
    status: {
      type: String,
      enum: Object.values(PackageStatus),
      default: PackageStatus.ACTIVE,
      index: true,
    },
    features: [{ type: String, trim: true }],
    userId:   { type: String, required: [true, 'User ID is required'], index: true },
    mentorId: { type: String, index: true },
    payment: {
      transactionId: String,
      paymentMethod: { type: String, required: true },
      paidAt:        Date,
      invoiceUrl:    String,
    },
    isRecurring:        { type: Boolean, default: false },
    recurringFrequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'] },
    autoRenew:          { type: Boolean, default: false },
    purchasedAt:        { type: Date, default: Date.now },
    lastUsedAt:         Date,
    cancelledAt:        Date,
    cancellationReason: String,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret.packageId;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────
PackageSchema.index({ userId: 1, status: 1 });
PackageSchema.index({ mentorId: 1, status: 1 });
PackageSchema.index({ expiresAt: 1, status: 1 });
PackageSchema.index({ packageType: 1, status: 1 });

// ── Pre-save ─────────────────────────────────────────────────────
PackageSchema.pre('save', function (next) {
  // Set remainingSessions on new doc
  if (this.isNew) {
    this.remainingSessions = this.totalSessions;
  }
  // Set expiresAt if not provided
  if (!this.expiresAt) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + this.validityDays);
    this.expiresAt = expiry;
  }
  next();
});

// ── Instance Methods ─────────────────────────────────────────────
PackageSchema.methods.useSession = async function (): Promise<void> {
  if (!this.canUseSession()) throw new Error('Cannot use session from this package');
  this.usedSessions += 1;
  this.remainingSessions = this.totalSessions - this.usedSessions;
  this.lastUsedAt = new Date();
  if (this.remainingSessions === 0) this.status = PackageStatus.EXHAUSTED;
  await this.save();
};

PackageSchema.methods.canUseSession = function (): boolean {
  return (
    this.status === PackageStatus.ACTIVE &&
    this.remainingSessions > 0 &&
    !this.isExpired()
  );
};

PackageSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

PackageSchema.methods.getRemainingDays = function (): number {
  return Math.ceil((this.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

PackageSchema.methods.cancelPackage = async function (reason: string): Promise<void> {
  this.status = PackageStatus.CANCELLED;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  await this.save();
};

// ── Static Methods ───────────────────────────────────────────────
PackageSchema.statics.getUserPackageSummary = async function (userId: string) {
  return await this.aggregate([
    {
      $match: {
        userId,
        status: { $in: [PackageStatus.ACTIVE, PackageStatus.EXPIRED, PackageStatus.EXHAUSTED] },
      },
    },
    {
      $group: {
        _id:               '$status',
        count:             { $sum: 1 },
        totalSessions:     { $sum: '$totalSessions' },
        usedSessions:      { $sum: '$usedSessions' },
        remainingSessions: { $sum: '$remainingSessions' },
        totalSpent:        { $sum: '$totalPrice' },
      },
    },
  ]);
};

const Package = mongoose.model<IPackage, PackageModel>('Package', PackageSchema);

export default Package;