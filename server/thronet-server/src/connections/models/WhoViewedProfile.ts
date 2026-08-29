// src/models/mongodb/WhoViewedProfile.ts
import { Schema, model, Document, Model, Types, Query, QueryOptions,  } from 'mongoose';  //ToObjectOptions
import { v4 as uuidv4 } from 'uuid';
import logger, { LogCategory, PublicLogMetadata } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';

/**
 * WhoViewedProfile Model - Optimized for 1M+ Users
 * Tracks profile views with performance optimizations for scalability.
 * 
 * Features (4 total):
 * 1. Record profile views with viewerId, viewedId, and visibility
 * 2. Paginated view retrieval for users
 * 3. Bulk notification updates
 * 4. View statistics aggregation
 * 
 * Optimizations:
 * - Sharding-ready with shardKey
 * - Efficient indexing for view queries
 * - Performance monitoring for slow queries
 * - TTL for data lifecycle management
 * - Cache versioning for Redis integration
 * 
 * Dependencies:
 * - mongoose: For MongoDB schema and model
 * - uuid: For unique viewId generation
 * - logger.ts: For request logging
 * - environment.ts: For configuration (e.g., DATA_RETENTION_DAYS)
 */

export interface IWhoViewedProfile extends Document {
  viewId: string;
  viewerId: string; // UUID — matches User.userId convention used across the app
  viewedId: string; // UUID — matches User.userId convention used across the app
  timestamp: Date;
  visibility: 'public' | 'connections' | 'private';
  isNotified: boolean;
  metadata?: Record<string, any>;
  region: string;
  shardKey: string;
  cacheVersion: number;
}

export interface IPaginationResult<T> {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  estimatedTotal?: number;
}

export interface IQueryPerformance {
  query: {
    op: string;
    filter: any;
    options: QueryOptions<IWhoViewedProfile>;
  };
  duration: number;
  timestamp: Date;
  collection: string;
  index: string | Record<string, any>;
}

interface ExtendedQuery<ResultType, DocType> extends Query<ResultType, DocType> {
  startTime?: number;
}

interface IWhoViewedProfileModel extends Model<IWhoViewedProfile> {
  findByViewId(viewId: string, projection?: string): Promise<IWhoViewedProfile | null>;
  findUserViewsPaginated(
    userId: string,
    options?: { page?: number; limit?: number; projection?: string; useEstimatedCount?: boolean; region?: string }
  ): Promise<IPaginationResult<IWhoViewedProfile>>;
  bulkMarkAsNotified(viewIds: string[], userId: string): Promise<any>;
  getViewStats(userId: string): Promise<any>;
  getSystemViewStats(region?: string): Promise<any>;
  cleanupOldViews(daysOld?: number, batchSize?: number): Promise<number>;
  getSlowQueries(): IQueryPerformance[];
}

const WhoViewedProfileSchema = new Schema<IWhoViewedProfile, IWhoViewedProfileModel>(
  {
    viewId: {
      type: String,
      required: [true, 'View ID is required'],
      unique: true,
      default: () => uuidv4(),
    },
    viewerId: {
      type: String,
      required: [true, 'Viewer ID is required'],
    },
    viewedId: {
      type: String,
      required: [true, 'Viewed ID is required'],
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    visibility: {
      type: String,
      enum: {
        values: ['public', 'connections', 'private'] as const,
        message: '{VALUE} is not a valid visibility',
      },
      default: environmentConfig.DEFAULT_PROFILE_VISIBILITY as 'public' | 'connections' | 'private',
    },
    isNotified: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    region: {
      type: String,
      default: 'global',
      maxlength: [50, 'Region cannot exceed 50 characters'],
    },
    shardKey: {
      type: String,
      required: true,
      default: function (this: IWhoViewedProfile) {
        const userIds = [this.viewerId, this.viewedId].sort();
        return `${userIds[0]}_${userIds[1]}_${this.region || 'global'}`;
      },
    },
    cacheVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    read: 'secondaryPreferred',
    writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  }
);

// Optimized Indexing Strategy
WhoViewedProfileSchema.index({ shardKey: 1, timestamp: -1 }, { name: 'shard_timestamp_lookup' });
WhoViewedProfileSchema.index({ viewedId: 1, timestamp: -1, isNotified: 1 }, { name: 'user_views' });
WhoViewedProfileSchema.index({ viewerId: 1, timestamp: -1 }, { name: 'viewer_activity' });
WhoViewedProfileSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: (environmentConfig.DATA_RETENTION_DAYS || 365) * 24 * 60 * 60, name: 'ttl_cleanup' }
);

// Performance Monitoring
const slowQueries: IQueryPerformance[] = [];
const MAX_SLOW_QUERIES = 100;
const SLOW_QUERY_THRESHOLD = 300;

WhoViewedProfileSchema.pre(/^find/, function (this: ExtendedQuery<any, IWhoViewedProfile>) {
  this.startTime = Date.now();
  if (!this.getOptions().hint) {
    const filter = this.getQuery();
    if (filter.shardKey) {
      this.hint('shard_timestamp_lookup');
    } else if (filter.viewedId) {
      this.hint('user_views');
    } else if (filter.viewerId) {
      this.hint('viewer_activity');
    }
  }
  if (this.getOptions().op === 'aggregate') {
    this.allowDiskUse(true);
  }
});

WhoViewedProfileSchema.post(/^find/, function (this: ExtendedQuery<any, IWhoViewedProfile>) {
  const duration = this.startTime ? Date.now() - this.startTime : 0;
  if (duration > SLOW_QUERY_THRESHOLD) {
    const hintValue = this.getOptions().hint;
    const indexName = typeof hintValue === 'string' ? hintValue : 
                     typeof hintValue === 'object' ? JSON.stringify(hintValue) : 'unknown';
    const queryInfo: IQueryPerformance = {
      query: { 
        op: this.getOptions().op || 'find', // Fixed: Use getOptions().op
        filter: this.getQuery(), 
        options: this.getOptions() 
      },
      duration,
      timestamp: new Date(),
      collection: 'whoviewedprofiles',
      index: indexName,
    };
    logger.warn('Slow query detected in WhoViewedProfile model', {
      category: LogCategory.DATABASE,
      data: queryInfo
    } as unknown as PublicLogMetadata);
    slowQueries.push(queryInfo);
    if (slowQueries.length > MAX_SLOW_QUERIES) {
      slowQueries.shift();
    }
  }
});

WhoViewedProfileSchema.pre('validate', function (next) {
  if (this.viewerId === this.viewedId) {
    logger.error('Validation failed: Users cannot view their own profile', {
      category: LogCategory.CONNECTION,
      data: { viewId: this.viewId, viewerId: this.viewerId }
    } as unknown as PublicLogMetadata);
    next(new Error('Users cannot view their own profile'));
    return;
  }
  if (!this.shardKey && this.viewerId && this.viewedId) {
    const userIds = [this.viewerId, this.viewedId].sort();
    this.shardKey = `${userIds[0]}_${userIds[1]}_${this.region || 'global'}`;
  }
  next();
});

WhoViewedProfileSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified()) {
    this.cacheVersion += 1;
  }
  if (this.isNew) {
    logger.info('Creating new profile view record', {
      category: LogCategory.CONNECTION,
      viewId: this.viewId,
      viewerId: this.viewerId?.toString(),
      viewedId: this.viewedId?.toString(),
      region: this.region
    } as unknown as PublicLogMetadata);
  } else {
    logger.debug('Updating profile view record', {
      category: LogCategory.CONNECTION,
      data: { viewId: this.viewId, modifiedPaths: this.modifiedPaths?.() }
    } as unknown as PublicLogMetadata);
  }
  next();
});

WhoViewedProfileSchema.post('save', function (error: any, doc: IWhoViewedProfile, next: any) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    logger.error('Duplicate profile view error', {
      category: LogCategory.CONNECTION,
      data: { error: error.message, viewId: doc?.viewId, shardKey: doc?.shardKey }
    } as unknown as PublicLogMetadata);
    next(new Error('A profile view record already exists for this view'));
  } else if (error.name === 'ValidationError') {
    logger.error('Profile view validation failed', {
      category: LogCategory.CONNECTION,
      data: { error: error.message, viewId: doc?.viewId, fields: Object.keys(error.errors || {}) }
    } as unknown as PublicLogMetadata);
    next(new Error(`Validation failed: ${error.message}`));
  } else if (error.name === 'CastError') {
    logger.error('Profile view cast error', {
      category: LogCategory.CONNECTION,
      data: { error: error.message, viewId: doc?.viewId, path: error.path }
    } as unknown as PublicLogMetadata);
    next(new Error('Invalid data type provided'));
  } else {
    logger.error('Profile view save error', {
      category: LogCategory.CONNECTION,
      data: { error: error.message, viewId: doc?.viewId, name: error.name }
    } as unknown as PublicLogMetadata);
    next(error);
  }
});

WhoViewedProfileSchema.statics.findByViewId = async function (
  viewId: string,
  projection: string = ''
): Promise<IWhoViewedProfile | null> {
  const query = this.findOne({ viewId }).hint({ viewId: 1 }).lean();
  if (projection) query.select(projection);
  return query.exec();
};

WhoViewedProfileSchema.statics.findUserViewsPaginated = async function (
  userId: string,
  options: { page?: number; limit?: number; projection?: string; useEstimatedCount?: boolean; region?: string } = {}
): Promise<IPaginationResult<IWhoViewedProfile>> {
  const { page = 1, limit = environmentConfig.PAGINATION_DEFAULT_LIMIT || 20, projection, useEstimatedCount = false, region = 'global' } = options;
  let query = this.find({ viewedId: userId, region }).sort({ timestamp: -1 }).hint('user_views');
  if (projection) query = query.select(projection);
  return paginateQuery(query, page, limit, useEstimatedCount);
};

WhoViewedProfileSchema.statics.bulkMarkAsNotified = async function (
  viewIds: string[],
  userId: string
): Promise<any> {
  const result = await this.updateMany(
    { viewId: { $in: viewIds }, viewedId: userId, isNotified: false },
    { $set: { isNotified: true, updatedAt: new Date() }, $inc: { cacheVersion: 1 } },
    { writeConcern: { w: 'majority' } }
  );
  logger.info('Bulk mark as notified completed', {
    category: LogCategory.CONNECTION,
    userId,
    data: { modifiedCount: result.modifiedCount, viewCount: viewIds.length }
  } as unknown as PublicLogMetadata);
  return result;
};

WhoViewedProfileSchema.statics.getViewStats = async function (userId: string): Promise<any> {
  const pipeline = [
    { $match: { viewedId: userId } },
    {
      $group: {
        _id: '$isNotified',
        count: { $sum: 1 }
      }
    }
  ];
  const stats = await this.aggregate(pipeline).allowDiskUse(true);
  const result = { totalViews: 0, notifiedViews: 0, unnotifiedViews: 0 };
  stats.forEach(stat => {
    if (stat._id === true) result.notifiedViews = stat.count;
    if (stat._id === false) result.unnotifiedViews = stat.count;
    result.totalViews += stat.count;
  });
  logger.info('View stats retrieved', {
    category: LogCategory.CONNECTION,
    userId,
    data: result
  } as unknown as PublicLogMetadata);
  return result;
};

WhoViewedProfileSchema.statics.getSystemViewStats = async function (region?: string): Promise<any> {
  const matchStage = region ? { region } : {};
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: '$isNotified',
        count: { $sum: 1 },
        regions: { $addToSet: '$region' }
      }
    }
  ];
  const [stats, totalViews, recentViews] = await Promise.all([
    this.aggregate(pipeline).allowDiskUse(true),
    this.estimatedDocumentCount(),
    this.countDocuments({
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      ...(region && { region })
    })
  ]);
  logger.info('System view stats retrieved', {
    category: LogCategory.DATABASE,
    data: { region: region || 'all', totalViews, recentViews }
  } as unknown as PublicLogMetadata);
  return {
    byNotified: stats,
    totalViews,
    recentViews,
    region: region || 'all',
    timestamp: new Date()
  };
};

WhoViewedProfileSchema.statics.cleanupOldViews = async function (
  daysOld: number = environmentConfig.DATA_RETENTION_DAYS || 365,
  batchSize: number = environmentConfig.BULK_OPERATION_BATCH_SIZE || 1000
): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  while (true) {
    const result = await this.deleteMany(
      { timestamp: { $lt: cutoffDate } },
      { hint: 'ttl_cleanup' }
    );
    totalDeleted += result.deletedCount;
    if (result.deletedCount < batchSize) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  logger.info('Cleaned up old profile views', {
    category: LogCategory.CONNECTION,
    data: { totalDeleted, cutoffDate, batchSize }
  } as unknown as PublicLogMetadata);
  return totalDeleted;
};

WhoViewedProfileSchema.statics.getSlowQueries = function (): IQueryPerformance[] {
  return [...slowQueries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

WhoViewedProfileSchema.set('toJSON', {
  // transform: (doc: IWhoViewedProfile, ret: any, options: ToObjectOptions) => {
  transform: (doc: any, ret: any, options: any) => {
    delete ret.__v;
    delete ret.cacheVersion;
    if ((options as { userId?: string }).userId) {
      ret.isViewer = doc.viewerId?.toString() === (options as { userId?: string }).userId;
      ret.isViewed = doc.viewedId?.toString() === (options as { userId?: string }).userId;
    }
    return ret;
  }
});

async function paginateQuery<T>(
  query: any,
  page: number = 1,
  limit: number = environmentConfig.PAGINATION_DEFAULT_LIMIT || 20,
  useEstimatedCount: boolean = false
): Promise<IPaginationResult<T>> {
  const skip = Math.max(0, (page - 1) * limit);
  const maxLimit = Math.min(limit, environmentConfig.PAGINATION_MAX_LIMIT || 100);
  const [totalCount, data] = await Promise.all([
    useEstimatedCount && page === 1 ? query.clone().estimatedDocumentCount() : query.clone().countDocuments(),
    query.clone().skip(skip).limit(maxLimit).lean()
  ]);
  const totalPages = Math.ceil(totalCount / maxLimit);
  return {
    data,
    totalCount,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    ...(useEstimatedCount && { estimatedTotal: totalCount }),
  };
}

const WhoViewedProfile = model<IWhoViewedProfile, IWhoViewedProfileModel>('WhoViewedProfile', WhoViewedProfileSchema);

export default WhoViewedProfile;