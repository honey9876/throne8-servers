// src/models/Coupon.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number;
  maxDiscount?: number;
  minPurchase?: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number;
  usageCount: number;
  perUserLimit?: number;
  isActive: boolean;
  applicableTo: {
    sessionTypes?: string[];
    mentors?: string[];
    packages?: string[];
    users?: string[];
    allSessions?: boolean;
  };
  restrictions?: {
    firstTimeUsersOnly?: boolean;
    newUsersOnly?: boolean;
    verifiedUsersOnly?: boolean;
    excludedUsers?: string[];
    excludedMentors?: string[];
  };
  metadata?: {
    campaignId?: string;
    source?: string;
    createdBy?: string;
    notes?: string;
  };
  usageHistory: Array<{
    userId: string;
    sessionId?: string;
    discountAmount: number;
    usedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    maxDiscount: {
      type: Number,
      min: 0,
    },
    minPurchase: {
      type: Number,
      min: 0,
      default: 0,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    usageLimit: {
      type: Number,
      min: 1,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    perUserLimit: {
      type: Number,
      min: 1,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    applicableTo: {
      sessionTypes: [String],
      mentors: [String],
      packages: [String],
      users: [String],
      allSessions: {
        type: Boolean,
        default: true,
      },
    },
    restrictions: {
      firstTimeUsersOnly: Boolean,
      newUsersOnly: Boolean,
      verifiedUsersOnly: Boolean,
      excludedUsers: [String],
      excludedMentors: [String],
    },
    metadata: {
      campaignId: String,
      source: String,
      createdBy: String,
      notes: String,
    },
    usageHistory: [
      {
        userId: {
          type: String,
          required: true,
        },
        sessionId: String,
        discountAmount: {
          type: Number,
          required: true,
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
CouponSchema.index({ code: 1, isActive: 1 });
CouponSchema.index({ validFrom: 1, validUntil: 1 });
CouponSchema.index({ 'metadata.campaignId': 1 });

// Method to check if coupon is valid
CouponSchema.methods.isValid = function (): boolean {
  const now = new Date();
  return (
    this.isActive &&
    now >= this.validFrom &&
    now <= this.validUntil &&
    (!this.usageLimit || this.usageCount < this.usageLimit)
  );
};

// Method to check if user can use coupon
CouponSchema.methods.canUserUse = function (userId: string): boolean {
  if (!this.isValid()) return false;

  // Check per-user limit
  if (this.perUserLimit) {
    const userUsageCount = this.usageHistory.filter(
      (usage: { userId: string; sessionId?: string; discountAmount: number; usedAt: Date }) => usage.userId === userId
    ).length;

    if (userUsageCount >= this.perUserLimit) {
      return false;
    }
  }

  // Check if user is excluded
  if (this.restrictions?.excludedUsers?.includes(userId)) {
    return false;
  }

  return true;
};

// Method to calculate discount
CouponSchema.methods.calculateDiscount = function (amount: number): number {
  if (!this.isValid()) return 0;

  // Check minimum purchase
  if (this.minPurchase && amount < this.minPurchase) {
    return 0;
  }

  let discount = 0;

  if (this.type === 'percentage') {
    discount = (amount * this.value) / 100;
    
    // Apply max discount limit
    if (this.maxDiscount && discount > this.maxDiscount) {
      discount = this.maxDiscount;
    }
  } else if (this.type === 'fixed') {
    discount = Math.min(this.value, amount);
  }

  return Math.round(discount * 100) / 100; // Round to 2 decimals
};

// Method to use coupon
CouponSchema.methods.useCoupon = async function (
  userId: string,
  discountAmount: number,
  sessionId?: string
): Promise<void> {
  this.usageCount += 1;
  this.usageHistory.push({
    userId,
    sessionId,
    discountAmount,
    usedAt: new Date(),
  });

  await this.save();
};

// Static method to find valid coupon
CouponSchema.statics.findValidCoupon = async function (code: string) {
  const coupon = await this.findOne({
    code: code.toUpperCase(),
    isActive: true,
  });

  if (!coupon || !coupon.isValid()) {
    return null;
  }

  return coupon;
};

// Static method to get active coupons
CouponSchema.statics.getActiveCoupons = async function () {
  const now = new Date();
  return this.find({
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  }).lean();
};

// Static method to deactivate expired coupons
CouponSchema.statics.deactivateExpired = async function () {
  const now = new Date();
  const result = await this.updateMany(
    {
      isActive: true,
      validUntil: { $lt: now },
    },
    {
      $set: { isActive: false },
    }
  );

  return result.modifiedCount;
};

const Coupon = mongoose.model<ICoupon>('Coupon', CouponSchema);

export default Coupon;