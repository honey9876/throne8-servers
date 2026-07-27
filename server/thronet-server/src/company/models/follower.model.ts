import mongoose, { Model, Document, Schema } from 'mongoose';

// =====================================================
// INTERFACES
// =====================================================
export interface IFollowerDocument extends Document {
  _id: mongoose.Types.ObjectId;
  follower: string | mongoose.Types.ObjectId;
  following: string | mongoose.Types.ObjectId;
  followedAt: Date;
  isActive: boolean;
  notificationPreferences: {
    posts: boolean;
    events: boolean;
    jobs: boolean;
    updates: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ✅ NEW: Employee interface for populated data
interface IPopulatedEmployee {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  profileImage?: string;
}

// ✅ NEW: Company interface for populated data
interface IPopulatedCompany {
  _id: string;
  name?: string;
  logo?: string;
  slug?: string;
  industry?: string;
  stats?: {
    followersCount: number;
    postsCount: number;
    employeesCount: number;
  };
}

// Instance methods interface
interface IFollowerMethods {
  updatePreferences(preferences: Partial<IFollowerDocument['notificationPreferences']>): Promise<IFollowerDocument>;
  deactivate(): Promise<IFollowerDocument>;
  activate(): Promise<IFollowerDocument>;
}

// Static methods interface
interface IFollowerModel extends Model<IFollowerDocument, Record<string, never>, IFollowerMethods> {
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  getFollowerCount(companyId: string): Promise<number>;
  getFollowingCount(employeeId: string): Promise<number>;
  getFollowers(companyId: string, options?: { skip?: number; limit?: number }): Promise<IFollowerDocument[]>;
  getFollowing(employeeId: string, options?: { skip?: number; limit?: number }): Promise<IFollowerDocument[]>;
  getRecentFollowers(companyId: string, days?: number): Promise<IFollowerDocument[]>;
  getMutualFollowers(employeeId: string, companyId: string): Promise<IFollowerDocument[]>;
  bulkFollow(followerId: string, companyIds: string[]): Promise<number>;
}


// =====================================================
// schema
// =====================================================


export const FollowerSchema = new Schema(
  {
    follower: {
      type: String,      // userId string hai tumhare system mein
      ref: 'User',       // ✅ User model
      required: true,
    },
    following: {
      type: String,       // companyId UUID string hai
      ref: 'Company',
      required: true,
    },
    followedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notificationPreferences: {
      posts: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      jobs: { type: Boolean, default: true },
      updates: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    collection: 'followers',
    versionKey: false,
  }
);

// Compound unique index - prevent duplicate follows
FollowerSchema.index({ follower: 1, following: 1 }, { unique: true });

// Index for queries
FollowerSchema.index({ following: 1, isActive: 1 });
FollowerSchema.index({ follower: 1, isActive: 1 });

// =====================================================
// INSTANCE METHODS
// =====================================================

FollowerSchema.methods.updatePreferences = async function (
  this: IFollowerDocument,
  preferences: Partial<IFollowerDocument['notificationPreferences']>
): Promise<IFollowerDocument> {
  Object.assign(this.notificationPreferences, preferences);
  return this.save();
};

FollowerSchema.methods.deactivate = async function (this: IFollowerDocument): Promise<IFollowerDocument> {
  this.isActive = false;
  return this.save();
};

FollowerSchema.methods.activate = async function (this: IFollowerDocument): Promise<IFollowerDocument> {
  this.isActive = true;
  return this.save();
};

// =====================================================
// STATIC METHODS
// =====================================================

FollowerSchema.statics.isFollowing = async function (
  followerId: string,
  followingId: string
): Promise<boolean> {
  const follower = await this.findOne({
    follower: followerId,
    following: followingId,
    isActive: true,
  });
  return !!follower;
};

FollowerSchema.statics.getFollowerCount = async function (companyId: string): Promise<number> {
  return this.countDocuments({
    following: companyId,
    isActive: true,
  });
};

FollowerSchema.statics.getFollowingCount = async function (employeeId: string): Promise<number> {
  return this.countDocuments({
    follower: employeeId,
    isActive: true,
  });
};

FollowerSchema.statics.getFollowers = async function (
  companyId: string,
  options: { skip?: number; limit?: number } = {}
): Promise<IFollowerDocument[]> {
  const { skip = 0, limit = 20 } = options;

  return this.find({
    following: companyId,
    isActive: true,
  })
    .populate('follower', 'firstName lastName email profilePhotoId userId')
    .sort({ followedAt: -1 })
    .skip(skip)
    .limit(limit);
};

FollowerSchema.statics.getFollowing = async function (
  employeeId: string,
  options: { skip?: number; limit?: number } = {}
): Promise<IFollowerDocument[]> {
  const { skip = 0, limit = 20 } = options;

  return this.find({
    follower: employeeId,
    isActive: true,
  })
    .populate('following', 'name slug logo industry stats')
    .sort({ followedAt: -1 })
    .skip(skip)
    .limit(limit);
};

FollowerSchema.statics.getRecentFollowers = async function (
  companyId: string,
  days = 30
): Promise<IFollowerDocument[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.find({
    following: companyId,
    isActive: true,
    followedAt: { $gte: startDate },
  })
    .populate('follower', 'firstName lastName email profileImage')
    .sort({ followedAt: -1 });
};

FollowerSchema.statics.getMutualFollowers = async function (
  employeeId: string,
  companyId: string
): Promise<IFollowerDocument[]> {
  const userFollowing = await this.find({
    follower: employeeId,
    isActive: true,
  }).select('following');

  const followingIds = userFollowing.map((f: IFollowerDocument) => f.following);

  return this.find({
    following: companyId,
    follower: { $in: followingIds },
    isActive: true,
  })
    .populate('follower', 'firstName lastName email profileImage')
    .sort({ followedAt: -1 });
};

FollowerSchema.statics.bulkFollow = async function (
  followerId: string,
  companyIds: string[]
): Promise<number> {
  const operations = companyIds.map((companyId) => ({
    updateOne: {
      filter: { follower: followerId, following: companyId },
      update: {
        $setOnInsert: {
          follower: followerId,
          following: companyId,
          followedAt: new Date(),
        },
        $set: { isActive: true },
      },
      upsert: true,
    },
  }));

  const result = await this.bulkWrite(operations);
  return result.upsertedCount + result.modifiedCount;
};

// =====================================================
// VIRTUALS (✅ FIXED)
// =====================================================

FollowerSchema.virtual('followerName').get(function (this: IFollowerDocument) {
  // ✅ FIXED: Proper type guard
  if (this.follower && typeof this.follower === 'object' && 'firstName' in this.follower) {
    const employee = this.follower as unknown as IPopulatedEmployee;
    return `${employee.firstName} ${employee.lastName}`;
  }
  return null;
});

FollowerSchema.virtual('companyName').get(function (this: IFollowerDocument) {
  // ✅ FIXED: Proper type guard
  if (this.following && typeof this.following === 'object' && 'name' in this.following) {
    const company = this.following as unknown as IPopulatedCompany;
    return company.name;
  }
  return null;
});

// =====================================================
// JSON TRANSFORMATION
// =====================================================

FollowerSchema.set('toJSON', {
  virtuals: true,
  transform: function (_doc, ret) {
    // delete ret.__v;
    return ret;
  },
});

FollowerSchema.set('toObject', { virtuals: true });

// =====================================================
// EXPORT MODEL
// =====================================================

const Follower = mongoose.model<IFollowerDocument, IFollowerModel>('Follower', FollowerSchema);

export default Follower;