/**
 * ====================================
 * BADGE MODEL
 * ====================================
 * Gamification badges for user achievements
 */

import mongoose, { Schema, Model } from 'mongoose';
import { IBadge } from '../interfaces/IBadge';

/**
 * Badge Schema
 */
const badgeSchema = new Schema<IBadge>(
  {
    name: {
      type: String,
      required: [true, 'Badge name is required'],
      trim: true,
      minlength: [3, 'Badge name must be at least 3 characters'],
      maxlength: [50, 'Badge name cannot exceed 50 characters'],
    },

    description: {
      type: String,
      required: [true, 'Badge description is required'],
      trim: true,
      maxlength: [200, 'Badge description cannot exceed 200 characters'],
    },

    icon: {
      type: String,
      required: [true, 'Badge icon is required'],
      default: '🏆',
    },

    category: {
      type: String,
      enum: ['streak', 'hours', 'task', 'goal', 'doubt', 'other'],
      required: [true, 'Badge category is required'],
    },

    requirement: {
      type: Number,
      required: [true, 'Badge requirement is required'],
      min: [1, 'Requirement must be at least 1'],
    },

    requirementType: {
      type: String,
      enum: ['days', 'hours', 'count'],
      required: [true, 'Requirement type is required'],
    },

    tier: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum'],
      required: [true, 'Badge tier is required'],
      default: 'bronze',
    },

    points: {
      type: Number,
      required: [true, 'Badge points are required'],
      min: [0, 'Points cannot be negative'],
      default: 10,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    order: {
      type: Number,
      default: 0,
      min: [0, 'Order cannot be negative'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Indexes for better query performance
 */
badgeSchema.index({ category: 1, tier: 1 });
badgeSchema.index({ isActive: 1, order: 1 });
badgeSchema.index({ requirement: 1, requirementType: 1 });

/**
 * Static Method Interfaces
 */
interface IBadgeStatics {
  getActiveBadges(): Promise<IBadge[]>;
  getBadgesByCategory(category: string): Promise<IBadge[]>;
  getBadgesByTier(tier: string): Promise<IBadge[]>;
}

type BadgeModel = Model<IBadge, {}, {}, {}, any> & IBadgeStatics;

/**
 * Static Methods
 */
badgeSchema.statics.getActiveBadges = async function (): Promise<IBadge[]> {
  return this.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
};

badgeSchema.statics.getBadgesByCategory = async function (
  category: string
): Promise<IBadge[]> {
  return this.find({ category, isActive: true }).sort({ tier: 1, requirement: 1 });
};

badgeSchema.statics.getBadgesByTier = async function (
  tier: string
): Promise<IBadge[]> {
  return this.find({ tier, isActive: true }).sort({ category: 1, order: 1 });
};

/**
 * Instance Methods
 */
badgeSchema.methods.getTierColor = function (): string {
  const tierColors: Record<string, string> = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platinum: '#E5E4E2',
  };
  return tierColors[this.tier] || '#808080';
};

badgeSchema.methods.getTierEmoji = function (): string {
  const tierEmojis: Record<string, string> = {
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇',
    platinum: '💎',
  };
  return tierEmojis[this.tier] || '🏅';
};

/**
 * Pre-save hook
 */
badgeSchema.pre('save', function (next) {
  // Auto-calculate points based on tier if not set
  if (!this.points || this.points === 10) {
    const tierPoints: Record<string, number> = {
      bronze: 10,
      silver: 25,
      gold: 50,
      platinum: 100,
    };
    const tier = this.tier as string;
    this.points = tierPoints[tier] || 10;
  }
  next();
});

/**
 * Create and export model
 */
const Badge = mongoose.model<IBadge, BadgeModel>('StudyGroup_Badge', badgeSchema);

export default Badge;