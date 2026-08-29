// src/connections/models/ConnectionRequest.ts

import { Schema, model, Document, Model, Types, Query, QueryOptions } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import logger, { LogCategory, PublicLogMetadata } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';
import { ErrorResponse } from '@/shared/response.util'; // ✅ FIX: needed for statusCode-aware errors below

/**
* ConnectionRequest Model - Optimized for 1M+ Users
* Enhanced with performance optimizations, better indexing, and efficient queries
*/

export interface IConnectionRequest extends Document {
  requestId: string;
  fromUserId: string;
  toUserId: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  priority: 'low' | 'medium' | 'high';
  templateId?: string;
  isRead: boolean;
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
    options: QueryOptions<IConnectionRequest>;
  };
  duration: number;
  timestamp: Date;
  collection: string;
  index: string | Record<string, any>;
}

// Custom Query interface that extends mongoose Query
interface IConnectionRequestQuery<T> extends Query<T, IConnectionRequest> {
  startTime?: number;
}

interface IConnectionRequestModel extends Model<IConnectionRequest> {
  findByRequestId(requestId: string, projection?: string): Promise<IConnectionRequest | null>;
  checkActiveRequestExists(fromUserId: string, toUserId: string, region?: string): Promise<boolean>;
  findUserRequestsPaginated(
    userId: string,
    options?: { page?: number; limit?: number; status?: string; projection?: string; useEstimatedCount?: boolean; region?: string }
  ): Promise<IPaginationResult<IConnectionRequest>>;
  findIncomingRequestsPaginated(
    userId: string,
    options?: { page?: number; limit?: number; status?: string; projection?: string; useEstimatedCount?: boolean; region?: string }
  ): Promise<IPaginationResult<IConnectionRequest>>;
  findOutgoingRequestsPaginated(
    userId: string,
    options?: { page?: number; limit?: number; status?: string; projection?: string; useEstimatedCount?: boolean; region?: string }
  ): Promise<IPaginationResult<IConnectionRequest>>;
  bulkUpdateStatus(requestIds: string[], status: string, userId?: string): Promise<any>;
  bulkMarkAsRead(requestIds: string[], userId: string): Promise<any>;
  getUserConnectionStats(userId: string, useCache?: boolean): Promise<any>;
  getSystemStats(region?: string): Promise<any>;
  archiveOldRequests(daysOld?: number, batchSize?: number): Promise<number>;
  cleanupExpiredRequests(batchSize?: number): Promise<number>;
  getSlowQueries(): IQueryPerformance[];
}

const ConnectionRequestSchema: Schema<IConnectionRequest> = new Schema<IConnectionRequest>(
  {
    requestId: {
      type: String,
      required: [true, 'Request ID is required'],
      unique: true,
      default: () => uuidv4(),
    },
    fromUserId: {
      type: String,
      required: [true, 'From user ID is required'],
      validate: {
        validator: function (v: string) {
          return typeof v === 'string' && v.trim().length > 0;
        },
        message: 'Invalid fromUserId'
      }
    },
    toUserId: {
      type: String,
      required: [true, 'To user ID is required'],
      validate: {
        validator: function (v: string) {
          return typeof v === 'string' && v.trim().length > 0;
        },
        message: 'Invalid toUserId'
      }
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'accepted', 'declined', 'cancelled'],
        message: '{VALUE} is not a valid status',
      },
      required: [true, 'Status is required'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + environmentConfig.CONNECTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high'],
        message: '{VALUE} is not a valid priority',
      },
      default: 'medium',
    },
    templateId: {
      type: String,
      trim: true,
      match: [/^[a-zA-Z0-9-]+$/, 'Invalid templateId format'],
      default: null,
      index: { sparse: true },
    },
    isRead: {
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
      default: function (this: IConnectionRequest) {
        const userIds = [this.fromUserId?.toString(), this.toUserId?.toString()].sort();
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

// OPTIMIZED INDEXING STRATEGY - Simplified and focused
ConnectionRequestSchema.index(
  { shardKey: 1, status: 1 },
  { name: 'shard_status_lookup' }
);

ConnectionRequestSchema.index(
  { toUserId: 1, status: 1, createdAt: -1 },
  { name: 'incoming_requests' }
);

ConnectionRequestSchema.index(
  { fromUserId: 1, status: 1, createdAt: -1 },
  { name: 'outgoing_requests' }
);

ConnectionRequestSchema.index(
  { status: 1, expiresAt: 1 },
  { name: 'cleanup_expired' }
);

ConnectionRequestSchema.index(
  { fromUserId: 1, createdAt: -1, region: 1 },
  { name: 'rate_limiting' }
);

ConnectionRequestSchema.index(
  { templateId: 1, status: 1 },
  { sparse: true, name: 'template_requests' }
);

ConnectionRequestSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'ttl_cleanup' }
);

// Performance Monitoring - Optimized
const slowQueries: IQueryPerformance[] = [];
const MAX_SLOW_QUERIES = 100;
const SLOW_QUERY_THRESHOLD = 300;

ConnectionRequestSchema.pre(/^find/, function (this: IConnectionRequestQuery<any>) {
  this.startTime = Date.now();

  // Smart index hinting based on query
  if (!this.getOptions().hint) {
    const filter = this.getQuery();

    if (filter.shardKey && filter.status) {
      // this/* .hint(...) */;
    } else if (filter.toUserId && filter.status) {
      // this/* .hint(...) */;
    } else if (filter.fromUserId && filter.status) {
      // this/* .hint(...) */;
    } else if (filter.fromUserId && filter.createdAt) {
      // this/* .hint(...) */;
    }
  }

  // Enable disk use for aggregations
  // @ts-ignore
  if (typeof this.allowDiskUse === 'function') {
    // @ts-ignore
    this.allowDiskUse(true);
  }
});

ConnectionRequestSchema.post(/^find/, function (this: IConnectionRequestQuery<any>) {
  const duration = this.startTime ? Date.now() - this.startTime : 0;

  if (duration > SLOW_QUERY_THRESHOLD) {
    const hintValue = this.getOptions().hint;
    const indexName = typeof hintValue === 'string' ? hintValue :
      typeof hintValue === 'object' ? JSON.stringify(hintValue) : 'unknown';

    const queryInfo: IQueryPerformance = {
      query: {
        op: 'find',
        filter: this.getQuery(),
        options: this.getOptions()
      },
      duration,
      timestamp: new Date(),
      collection: 'connectionrequests',
      index: indexName,
    };

    // Fixed logging - ensure proper typing
    logger.warn('Slow query detected in ConnectionRequest model', {
      data: {
        ...queryInfo,
        durationMs: duration, // Use number instead of string
      },
      category: LogCategory.PERFORMANCE,
    } as unknown as PublicLogMetadata);

    slowQueries.push(queryInfo);
    if (slowQueries.length > MAX_SLOW_QUERIES) {
      slowQueries.shift();
    }
  }
});

// Validation Hooks - Simplified
ConnectionRequestSchema.pre('validate', function (next) {
  if (this.fromUserId === this.toUserId) {  // ✅ String comparison
    next(new Error('Users cannot send connection requests to themselves'));
    return;
  }

  if (!this.shardKey && this.fromUserId && this.toUserId) {
    const userIds = [this.fromUserId, this.toUserId].sort();  // ✅ No .toString()
    this.shardKey = `${userIds[0]}_${userIds[1]}_${this.region || 'global'}`;
  }

  next();
});

ConnectionRequestSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified()) {
    this.cacheVersion += 1;
  }

  if (this.isNew) {
    logger.info('Creating new connection request', {
      data: {
        requestId: this.requestId,
        fromUserId: this.fromUserId,
        toUserId: this.toUserId,
        status: this.status,
        region: this.region,
      },
      category: LogCategory.DATABASE, // Use valid LogCategory
    } as unknown as PublicLogMetadata);
  } else {
    logger.debug('Updating connection request', {
      data: {
        requestId: this.requestId,
        modifiedPaths: this.modifiedPaths(),
      },
      category: LogCategory.DATABASE,
    } as unknown as PublicLogMetadata);
  }

  next();
});

// OPTIMIZED STATIC METHODS

ConnectionRequestSchema.statics.findByRequestId = async function (
  requestId: string,
  projection: string = ''
): Promise<IConnectionRequest | null> {
  const query = this.findOne({ requestId })/* .hint(...) */.lean();
  if (projection) query.select(projection);
  return query.exec();
};

// HIGHLY OPTIMIZED - Most critical method
ConnectionRequestSchema.statics.checkActiveRequestExists = async function (
  fromUserId: string,
  toUserId: string,
  region: string = 'global'
): Promise<boolean> {
  const sortedIds = [fromUserId, toUserId].sort();
  const shardKey = `${sortedIds[0]}_${sortedIds[1]}_${region}`;

  // Single findOne with exact shard key match - much faster than regex
  const request = await this.findOne({
    shardKey,
    status: 'pending'
  }).lean().select('_id')/* .hint(...) */;

  return !!request;
};

// Optimized pagination helper
async function paginateQuery<T>(
  query: any,
  page: number = 1,
  limit: number = environmentConfig.PAGINATION_DEFAULT_LIMIT,
  useEstimatedCount: boolean = false
): Promise<IPaginationResult<T>> {
  const skip = Math.max(0, (page - 1) * limit);
  const maxLimit = Math.min(limit, environmentConfig.PAGINATION_MAX_LIMIT);

  // Parallel execution of count and data
  const [totalCount, data] = await Promise.all([
    useEstimatedCount && page === 1 ?
      query.clone().estimatedDocumentCount() :
      query.clone().countDocuments(),
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

ConnectionRequestSchema.statics.findUserRequestsPaginated = async function (
  userId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
    projection?: string;
    useEstimatedCount?: boolean;
    region?: string
  } = {}
): Promise<IPaginationResult<IConnectionRequest>> {
  const {
    page = 1,
    limit = environmentConfig.PAGINATION_DEFAULT_LIMIT,
    status,
    projection,
    useEstimatedCount = false,
    region = 'global'
  } = options;

  let filter: any = {
    $or: [{ fromUserId: userId }, { toUserId: userId }],
    region,
  };

  if (status) filter.status = status;

  let query = this.find(filter).sort({ createdAt: -1 });

  // Smart index hinting
  if (filter.toUserId === userId && status) {
    query = query/* .hint(...) */;
  } else if (filter.fromUserId === userId && status) {
    query = query/* .hint(...) */;
  }

  if (projection) query = query.select(projection);

  return paginateQuery(query, page, limit, useEstimatedCount);
};

ConnectionRequestSchema.statics.findIncomingRequestsPaginated = async function (
  userId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
    projection?: string;
    useEstimatedCount?: boolean;
    region?: string
  } = {}
): Promise<IPaginationResult<IConnectionRequest>> {
  const {
    page = 1,
    limit = environmentConfig.PAGINATION_DEFAULT_LIMIT,
    status = 'pending',
    projection,
    useEstimatedCount = false,
    region = 'global'
  } = options;

  let query = this.find({
    toUserId: userId,
    status,
    region
  }).sort({ createdAt: -1 })/* .hint(...) */;

  if (projection) query = query.select(projection);

  return paginateQuery(query, page, limit, useEstimatedCount);
};

ConnectionRequestSchema.statics.findOutgoingRequestsPaginated = async function (
  userId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
    projection?: string;
    useEstimatedCount?: boolean;
    region?: string
  } = {}
): Promise<IPaginationResult<IConnectionRequest>> {
  const {
    page = 1,
    limit = environmentConfig.PAGINATION_DEFAULT_LIMIT,
    status,
    projection,
    useEstimatedCount = false,
    region = 'global'
  } = options;

  let filter: any = { fromUserId: userId, region };
  if (status) filter.status = status;

  let query = this.find(filter).sort({ createdAt: -1 })/* .hint(...) */;
  if (projection) query = query.select(projection);

  return paginateQuery(query, page, limit, useEstimatedCount);
};

ConnectionRequestSchema.statics.bulkUpdateStatus = async function (
  requestIds: string[],
  status: string,
  userId?: string
): Promise<any> {
  if (!['accepted', 'declined', 'cancelled'].includes(status)) {
    throw new Error('Invalid status for bulk update');
  }

  let filter: any = { requestId: { $in: requestIds } };

  if (userId) {
    filter.$or = [{ fromUserId: userId }, { toUserId: userId }];
  }

  const updateDoc: any = {
    $set: {
      status,
      updatedAt: new Date()
    },
    $inc: { cacheVersion: 1 },
  };

  // Mark as read if accepted
  if (status === 'accepted') {
    updateDoc.$set.isRead = true;
  }

  const result = await this.updateMany(
    filter,
    updateDoc,
    { writeConcern: { w: 'majority' } }
  );

  logger.info('Bulk request status update completed', {
    data: {
      requestIds: requestIds.length,
      status,
      userId,
      modifiedCount: result.modifiedCount,
    },
    category: LogCategory.DATABASE, // Use valid LogCategory
  } as unknown as PublicLogMetadata);

  return result;
};

ConnectionRequestSchema.statics.bulkMarkAsRead = async function (
  requestIds: string[],
  userId: string
): Promise<any> {
  const result = await this.updateMany(
    {
      requestId: { $in: requestIds },
      toUserId: userId,
      isRead: false,
    },
    {
      $set: { isRead: true, updatedAt: new Date() },
      $inc: { cacheVersion: 1 },
    },
    { writeConcern: { w: 'majority' } }
  );

  logger.debug('Bulk mark as read completed', {
    data: {
      requestIds: requestIds.length,
      userId,
      modifiedCount: result.modifiedCount,
    },
    category: LogCategory.DATABASE, // Use valid LogCategory
  } as unknown as PublicLogMetadata);

  return result;
};

// OPTIMIZED USER STATS with better aggregation
ConnectionRequestSchema.statics.getUserConnectionStats = async function (
  userId: string,
  _useCache: boolean = true
): Promise<any> {
  // Use more efficient aggregation pipeline
  const pipeline = [
    {
      $match: {
        $or: [
          { fromUserId: userId },
          { toUserId: userId }
        ],
      },
    },
    {
      $group: {
        _id: {
          status: '$status',
          direction: {
            $cond: [
              { $eq: ['$toUserId', userId] },  // ✅ Direct string comparison
              'incoming',
              'outgoing'
            ]
          }
        },
        count: { $sum: 1 },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$isRead', false] },
                  { $eq: ['$toUserId', userId] }  // ✅ Direct string comparison
                ]
              },
              1,
              0
            ]
          }
        },
      },
    },
    {
      $group: {
        _id: '$_id.status',
        totalCount: { $sum: '$count' },
        incomingCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.direction', 'incoming'] }, '$count', 0]
          }
        },
        outgoingCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.direction', 'outgoing'] }, '$count', 0]
          }
        },
        unreadCount: { $sum: '$unreadCount' },
      },
    },
  ];

  const stats = await this.aggregate(pipeline).allowDiskUse(true);

  const result = {
    pending: { total: 0, incoming: 0, outgoing: 0, unread: 0 },
    accepted: { total: 0, incoming: 0, outgoing: 0, unread: 0 },
    declined: { total: 0, incoming: 0, outgoing: 0, unread: 0 },
    cancelled: { total: 0, incoming: 0, outgoing: 0, unread: 0 },
    totalRequests: 0,
    totalUnread: 0,
  };

  stats.forEach((stat) => {
    const status = stat._id;
    if (result[status as keyof typeof result]) {
      (result[status as keyof typeof result] as any).total = stat.totalCount;
      (result[status as keyof typeof result] as any).incoming = stat.incomingCount;
      (result[status as keyof typeof result] as any).outgoing = stat.outgoingCount;
      (result[status as keyof typeof result] as any).unread = stat.unreadCount;
      result.totalRequests += stat.totalCount;
      result.totalUnread += stat.unreadCount;
    }
  });

  return result;
};

ConnectionRequestSchema.statics.getSystemStats = async function (region?: string): Promise<any> {
  const matchStage = region ? { region } : {};

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        unreadCount: {
          $sum: {
            $cond: [{ $eq: ['$isRead', false] }, 1, 0]
          }
        },
        avgPriority: {
          $avg: {
            $switch: {
              branches: [
                { case: { $eq: ['$priority', 'low'] }, then: 1 },
                { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                { case: { $eq: ['$priority', 'high'] }, then: 3 },
              ],
              default: 2
            }
          }
        },
        regions: { $addToSet: '$region' },
      },
    },
  ];

  const [stats, totalRequests, recentRequests] = await Promise.all([
    this.aggregate(pipeline).allowDiskUse(true),
    this.estimatedDocumentCount(),
    this.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      ...(region && { region }),
    }),
  ]);

  return {
    byStatus: stats,
    totalRequests,
    recentRequests,
    region: region || 'all',
    timestamp: new Date(),
  };
};

// OPTIMIZED ARCHIVE with better batching
ConnectionRequestSchema.statics.archiveOldRequests = async function (
  daysOld: number = environmentConfig.DATA_RETENTION_DAYS,
  batchSize: number = environmentConfig.BULK_OPERATION_BATCH_SIZE
): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  let totalArchived = 0;

  // Use more efficient deletion strategy
  while (true) {
    const result = await this.deleteMany(
      {
        createdAt: { $lt: cutoffDate },
        status: { $in: ['declined', 'cancelled'] },
      },
      {
        hint: 'cleanup_expired' // Use our cleanup index
      }
    );

    totalArchived += result.deletedCount;

    if (result.deletedCount < batchSize) break;

    // Small delay to prevent overwhelming the database
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  logger.info('Archived old connection requests in batches', {
    data: {
      cutoffDate,
      totalArchived,
      batchSize,
    },
    category: LogCategory.DATABASE, // Use valid LogCategory
  } as unknown as PublicLogMetadata);

  return totalArchived;
};

ConnectionRequestSchema.statics.cleanupExpiredRequests = async function (
  batchSize: number = environmentConfig.BULK_OPERATION_BATCH_SIZE
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const result = await this.deleteMany(
      {
        expiresAt: { $lt: new Date() },
        status: 'pending',
      },
      {
        hint: 'cleanup_expired'
      }
    );

    totalDeleted += result.deletedCount;

    if (result.deletedCount < batchSize) break;

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  logger.info('Cleaned up expired connection requests', {
    data: {
      totalDeleted,
      batchSize,
    },
    category: LogCategory.DATABASE,
  } as unknown as PublicLogMetadata);

  return totalDeleted;
};

ConnectionRequestSchema.statics.getSlowQueries = function (): IQueryPerformance[] {
  return [...slowQueries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

// ✅ FIXED ERROR HANDLING — now attaches proper statusCode via ErrorResponse
// instead of throwing plain Error objects. Previously these all silently
// became 500 responses because the global error middleware only checks
// `err instanceof ErrorResponse` to read the statusCode; a plain Error
// always fell through to the 500 default, even for validation/duplicate
// errors that should have been 400/409.
ConnectionRequestSchema.post('save', function (error: any, doc: IConnectionRequest, next: any) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    logger.error('Duplicate connection request error', {
      data: {
        error: error.message,
        requestId: doc?.requestId,
        shardKey: doc?.shardKey,
      },
      category: LogCategory.ERROR,
    } as unknown as PublicLogMetadata);
    next(new ErrorResponse('A pending or accepted connection request already exists between these users', 409));
  } else if (error.name === 'ValidationError') {
    logger.error('Connection request validation failed', {
      data: {
        error: error.message,
        requestId: doc?.requestId,
        fields: Object.keys(error.errors || {}),
      },
      category: LogCategory.ERROR,
    } as unknown as PublicLogMetadata);
    next(new ErrorResponse(`Validation failed: ${error.message}`, 400));
  } else if (error.name === 'CastError') {
    logger.error('Connection request cast error', {
      data: {
        error: error.message,
        requestId: doc?.requestId,
        path: error.path,
      },
      category: LogCategory.ERROR,
    } as unknown as PublicLogMetadata);
    next(new ErrorResponse('Invalid data type provided', 400));
  } else {
    logger.error('Connection request save error', {
      data: {
        error: error.message,
        requestId: doc?.requestId,
        name: error.name,
      },
      category: LogCategory.ERROR,
    } as unknown as PublicLogMetadata);
    next(error); // Unknown/unexpected errors: let them stay 500, that's correct
  }
});

interface ToObjectOptionsWithUserId {
  userId?: string;
  [key: string]: any;
}

// OPTIMIZED JSON TRANSFORMATION
ConnectionRequestSchema.set('toJSON', {
  transform: (doc, ret: any, options: ToObjectOptionsWithUserId) => {
    // Remove unwanted fields
    delete ret.__v;
    delete ret.cacheVersion;

    // Add computed fields if userId is available in context (from options or elsewhere)
    const userId = options?.userId;
    if (userId) {
      ret.isIncoming = doc.toUserId?.toString() === userId.toString();
      ret.isOutgoing = doc.fromUserId?.toString() === userId.toString();
    }

    ret.isExpired = ret.expiresAt && new Date(ret.expiresAt) < new Date();

    return ret;
  },
});

const ConnectionRequest: IConnectionRequestModel = model<IConnectionRequest, IConnectionRequestModel>(
  'ConnectionRequest',
  ConnectionRequestSchema
);

export default ConnectionRequest;