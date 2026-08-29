// src/connections/models/Follow.ts

import { Schema, model, Document, Types } from 'mongoose';
// import { FollowStatus } from '../../types/follow.type';


interface IFollow extends Document {
  followerId: string;
  followingId: string;
  status: 'pending' | 'active' | 'declined';
  createdAt: Date;
  updatedAt: Date;
  notificationEnabled: boolean;
  isBlocked: boolean;
  // Removed heavy fields for better performance
}

const followSchema = new Schema<IFollow>({
  followerId: { 
    type: String, 
    required: true,
    validate: {
      // validator: (v: string) => Types.ObjectId.isValid(v),
      validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),

      message: 'Invalid follower ID'
    }
  },
  followingId: { 
    type: String, 
    required: true,
    validate: {
      // validator: (v: string) => Types.ObjectId.isValid(v),
      validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),

      message: 'Invalid following ID'
    }
  },
  status: { 
    type: String, 
    enum: ['pending', 'active', 'declined'],
    default: 'active', // Most follows are active, optimize for common case
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    required: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  notificationEnabled: { 
    type: Boolean, 
    default: true 
  },
  isBlocked: { 
    type: Boolean, 
    default: false
  }
}, { 
  timestamps: false, // Manual control for better performance
  collection: 'follows',
  // Optimize document structure
  minimize: false,
  versionKey: false
});

// HIGH-PERFORMANCE INDEXES for 1M+ scale
// Primary compound index - prevents duplicates and optimizes lookups
followSchema.index({ followerId: 1, followingId: 1 }, { 
  unique: true,
    
});

// Core performance indexes
followSchema.index({ followerId: 1, status: 1, createdAt: -1 }, {   });
followSchema.index({ followingId: 1, status: 1, createdAt: -1 }, {   });

// Status-based queries (most common)
followSchema.index({ status: 1, createdAt: -1 }, {   });

// Block functionality
followSchema.index({ followerId: 1, isBlocked: 1 }, {   });
followSchema.index({ followingId: 1, isBlocked: 1 }, {   });

// Notification queries
followSchema.index({ followingId: 1, notificationEnabled: 1, status: 1 }, {   });

// PERFORMANCE-OPTIMIZED MIDDLEWARE
followSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Prevent self-following (lightweight validation)
followSchema.pre('validate', function(next) {
  if (this.followerId === this.followingId) {
    return next(new Error('Self-follow not allowed'));
  }
  next();
});

// HIGH-PERFORMANCE STATIC METHODS
followSchema.statics.bulkFollow = async function(operations: Array<{followerId: string, followingId: string}>) {
  const bulkOps = operations.map(op => ({
    insertOne: {
      document: {
        followerId: op.followerId,
        followingId: op.followingId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        notificationEnabled: true,
        isBlocked: false
      }
    }
  }));
  
  return this.bulkWrite(bulkOps, { ordered: false });
};

// Paginated followers with lean queries
followSchema.statics.getFollowersPaginated = function(
  userId: string, 
  page = 1, 
  limit = 50
) {
  const skip = (page - 1) * limit;
  return this.find({ 
    followingId: userId, 
    status: 'active', 
    isBlocked: false 
  })
  .select('followerId createdAt') // Only essential fields
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .lean() // Returns plain JS objects - much faster
  .exec();
};

// Paginated following with lean queries
followSchema.statics.getFollowingPaginated = function(
  userId: string, 
  page = 1, 
  limit = 50
) {
  const skip = (page - 1) * limit;
  return this.find({ 
    followerId: userId, 
    status: 'active', 
    isBlocked: false 
  })
  .select('followingId createdAt')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .lean()
  .exec();
};

// Fast count queries with hints for index usage
followSchema.statics.getFollowersCount = function(userId: string) {
  return this.countDocuments({ 
    followingId: userId, 
    status: 'active', 
    isBlocked: false 
  }).hint({ followingId: 1, status: 1, createdAt: -1 });
};

followSchema.statics.getFollowingCount = function(userId: string) {
  return this.countDocuments({ 
    followerId: userId, 
    status: 'active', 
    isBlocked: false 
  }).hint({ followerId: 1, status: 1, createdAt: -1 });
};

// Ultra-fast status check
followSchema.statics.checkFollowStatus = function(followerId: string, followingId: string) {
  return this.findOne(
    { followerId, followingId }, 
    'status isBlocked'
  ).lean().exec();
};

// Batch status checks for multiple users
followSchema.statics.batchCheckFollowStatus = function(
  followerId: string, 
  followingIds: string[]
) {
  return this.find(
    { 
      followerId, 
      followingId: { $in: followingIds } 
    },
    'followingId status isBlocked'
  ).lean().exec();
};

// Optimized mutual follows using aggregation
followSchema.statics.getMutualFollowsCount = async function(userId1: string, userId2: string) {
  const result = await this.aggregate([
    {
      $facet: {
        user1Following: [
          { $match: { followerId: userId1, status: 'active', isBlocked: false } },
          { $group: { _id: null, following: { $addToSet: '$followingId' } } }
        ],
        user2Following: [
          { $match: { followerId: userId2, status: 'active', isBlocked: false } },
          { $group: { _id: null, following: { $addToSet: '$followingId' } } }
        ]
      }
    },
    
    {
      $project: {
        mutualCount: {
          $size: {
            $setIntersection: [
              { $arrayElemAt: ['$user1Following.following', 0] },
              { $arrayElemAt: ['$user2Following.following', 0] }
            ]
          }
        }
      }
    }
  ]);
  
  return result[0]?.mutualCount || 0;
};

// Bulk unfollow operation
followSchema.statics.bulkUnfollow = function(followerId: string, followingIds: string[]) {
  return this.deleteMany({
    followerId,
    followingId: { $in: followingIds }
  });
};

// Get trending users (most followed recently)
followSchema.statics.getTrendingUsers = function(days = 7, limit = 10) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        status: 'active',
        isBlocked: false,
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: '$followingId',
        followCount: { $sum: 1 },
        latestFollow: { $max: '$createdAt' }
      }
    },
    {
      $sort: { followCount: -1, latestFollow: -1 }
    },
    { $limit: limit }
  ]);
};

// Instance methods - lightweight
followSchema.methods.toggleBlock = function() {
  this.isBlocked = !this.isBlocked;
  if (this.isBlocked) this.status = 'declined';
  return this.save();
};

followSchema.methods.accept = function() {
  this.status = 'active';
  return this.save();
};

// CACHING HINTS - Add these to your application layer
/*
REDIS CACHING STRATEGY for 1M+ users:
1. Cache follower/following counts: "user:{id}:followers_count", "user:{id}:following_count"
2. Cache recent followers/following lists: "user:{id}:recent_followers", "user:{id}:recent_following"  
3. Cache mutual follow status: "mutual:{id1}:{id2}"
4. Use Redis Sets for fast follow status checks
5. TTL: 5-10 minutes for counts, 1-2 minutes for lists
*/

export const Follow = model<IFollow>('Follow', followSchema);

// ADDITIONAL PERFORMANCE TIPS:
/*
1. DATABASE LEVEL:
   - Use MongoDB sharding on followerId
   - Consider read replicas for read-heavy operations
   - Use connection pooling (min 10, max 100+ connections)

2. APPLICATION LEVEL:
   - Implement Redis caching layer
   - Use bulk operations where possible  
   - Paginate all list queries
   - Use lean() queries for read operations
   - Consider denormalizing follow counts in User model

3. MONITORING:
   - Monitor slow queries (>100ms)
   - Set up index usage monitoring
   - Track memory usage and connection pool

4. SCALING BEYOND 1M:
   - Consider separate read/write databases
   - Implement event-driven architecture
   - Use message queues for non-critical operations
   - Consider NoSQL alternatives like Cassandra for follow relationships
*/