// src/models/mongodb/Connection.ts

import { Schema, model, Document, Model, Types, Query } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@/shared/models/index.models';
import { logger, LogCategory, PublicLogMetadata } from '@/shared/logger.util';
import environmentConfig from '@/config/environment/environment';

/**
 * Connection Model - Optimized for 1M+ Users
 * Represents established connections between users in the Connection Service.
 * Enhanced with advanced indexing, sharding support, and performance optimizations.
 */

interface IConnection extends Document {
    connectionId: string;
    fromUserId: string;
    toUserId: string;
    connectionType: 'professional' | 'personal' | 'other';
    status: 'active' | 'pending' | 'removed' | 'blocked';
    createdAt: Date;
    updatedAt: Date;
    strength: number;
    priority: 'low' | 'medium' | 'high';
    tags: string[];
    notes?: string;
    visibility: 'public' | 'connections' | 'private';
    isArchived: boolean;
    lastInteraction?: Date;
    metadata?: Record<string, any>;
    region?: string;
    interactionCount: number;
    shardKey: string;
    cacheVersion: number;
    searchVector?: number[];
    isMutual?: boolean;
    strengthCategory?: string;
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

interface IConnectionStats {
    active: number;
    pending: number;
    removed: number;
    blocked: number;
    total: number;
    avgStrength: number;
    topTags: Array<{ tag: string; count: number }>;
    regionDistribution?: Record<string, number>;
    growthRate?: number;
}

interface IQueryPerformance {
    query: {
        op: any;
        filter: any;
        options: any;
        collection: string;
    };
    duration: number;
    timestamp: Date;
    index: string;
}

interface IConnectionModel extends Model<IConnection> {
    findByConnectionId(connectionId: string, projection?: string): Promise<IConnection | null>;
    checkConnectionExists(fromUserId: string, toUserId: string): Promise<boolean>;
    findUserConnectionsPaginated(
        userId: string,
        options?: {
            page?: number;
            limit?: number;
            status?: string;
            tag?: string;
            projection?: string;
            useEstimatedCount?: boolean;
            region?: string;
        }
    ): Promise<IPaginationResult<IConnection>>;
    bulkCreateConnections(connections: Partial<IConnection>[]): Promise<any>;
    bulkUpdateStatus(connectionIds: string[], status: string, userId?: string): Promise<any>;
    bulkArchiveConnections(connectionIds: string[], userId: string): Promise<any>;
    getUserConnectionStats(userId: string, useCache?: boolean): Promise<IConnectionStats>;
    getSystemStats(region?: string): Promise<any>;
    archiveOldConnections(daysOld?: number, batchSize?: number): Promise<number>;
    findMutualConnections(userId1: string, userId2: string, limit?: number): Promise<IConnection[]>;
    countMutualConnections(userId1: string, userId2: string): Promise<number>;
    getConnectionRecommendations(userId: string, limit?: number): Promise<string[]>;
    calculateConnectionStrength(connectionId: string): Promise<number>;
    updateConnectionStrengthBatch(batchSize?: number): Promise<number>;
    getConnectionGraph(userId: string, depth?: number): Promise<any>;
    findInfluencers(region?: string, limit?: number): Promise<any[]>;
    getNetworkAnalytics(userId: string): Promise<any>;
    migrateToRegion(userId: string, newRegion: string): Promise<boolean>;
    cleanupInactiveConnections(inactiveDays?: number): Promise<number>;
    getSlowQueries(): IQueryPerformance[];
}

const ConnectionSchema: Schema<IConnection, IConnectionModel> = new Schema<IConnection, IConnectionModel>(
    {
        connectionId: {
            type: String,
            required: [true, 'Connection ID is required'],
            unique: true,
            default: () => uuidv4(),
        },
        fromUserId: {
            type: String,
            ref: 'User',
            required: [true, 'From user ID is required'],
            validate: {
                validator: async function (value: string): Promise<boolean> {
                    if (this.isModified('fromUserId') && !this.$locals?.skipValidation) {
                        const user = await User.findOne({ userId: value }).lean().select('userId');
                        return !!user;
                    }
                    return true;
                },
                message: 'Invalid fromUserId: User does not exist',
            },
        },
        toUserId: {
            type: String,
            ref: 'User',
            required: [true, 'To user ID is required'],
            validate: {
                validator: async function (value: string): Promise<boolean> {
                    if (this.isModified('toUserId') && !this.$locals?.skipValidation) {
                        const user = await User.findOne({ userId: value }).lean().select('userId');
                        return !!user;
                    }
                    return true;
                },
                message: 'Invalid toUserId: User does not exist',
            },
        },
        connectionType: {
            type: String,
            enum: {
                values: ['professional', 'personal', 'other'],
                message: '{VALUE} is not a valid connection type',
            },
            required: [true, 'Connection type is required'],
            default: 'professional',
        },
        status: {
            type: String,
            enum: {
                values: ['active', 'pending', 'removed', 'blocked'],
                message: '{VALUE} is not a valid status',
            },
            required: [true, 'Status is required'],
            default: 'active',
        },
        strength: {
            type: Number,
            min: [0, 'Connection strength cannot be less than 0'],
            max: [100, 'Connection strength cannot be more than 100'],
            default: 0,
        },
        priority: {
            type: String,
            enum: {
                values: ['low', 'medium', 'high'],
                message: '{VALUE} is not a valid priority',
            },
            default: 'medium',
        },
        tags: {
            type: [String],
            default: [],
            validate: {
                validator: (tags: string[]) => tags.length <= 20 && tags.every((tag) => typeof tag === 'string' && tag.length <= 50),
                message: 'Maximum 20 tags allowed, each with max length 50',
            },
        },
        notes: {
            type: String,
            trim: true,
            maxlength: [2000, 'Notes cannot exceed 2000 characters'],
            default: '',
        },
        visibility: {
            type: String,
            enum: {
                values: ['public', 'connections', 'private'],
                message: '{VALUE} is not a valid visibility',
            },
            default: environmentConfig.DEFAULT_PROFILE_VISIBILITY as 'public' | 'connections' | 'private',
        },
        isArchived: {
            type: Boolean,
            default: false,
        },
        lastInteraction: {
            type: Date,
            default: Date.now,
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
        interactionCount: {
            type: Number,
            default: 0,
            min: [0, 'Interaction count cannot be negative'],
        },
        shardKey: {
            type: String,
            required: true,
            default: function () {
                const userIds = [this.fromUserId?.toString(), this.toUserId?.toString()].sort();
                return `${userIds[0]}_${userIds[1]}_${this.region || 'global'}`;
            },
        },
        cacheVersion: {
            type: Number,
            default: 1,
        },
        searchVector: {
            type: [Number],
            default: [],
            validate: {
                validator: (vector: number[]) => vector.length <= 50,
                message: 'Search vector cannot exceed 50 dimensions',
            },
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

// Enhanced Indexing Strategy
ConnectionSchema.index({ shardKey: 1, status: 1 }, { name: 'shard_status_primary' });
ConnectionSchema.index({ fromUserId: 1, status: 1, region: 1, createdAt: -1 }, { name: 'user_connections_regional' });
ConnectionSchema.index({ toUserId: 1, status: 1, region: 1, createdAt: -1 }, { name: 'recipient_connections_regional' });
ConnectionSchema.index(
    { fromUserId: 1, toUserId: 1, region: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: 'removed' } }, name: 'unique_connection_regional' }
);
ConnectionSchema.index({ connectionType: 1, status: 1, strength: -1 }, { name: 'analytics_type_strength' });
ConnectionSchema.index({ tags: 1, status: 1, region: 1 }, { name: 'tag_search_regional' });
ConnectionSchema.index({ lastInteraction: -1, status: 1 }, { name: 'recent_interactions_status' });
ConnectionSchema.index({ strength: -1, status: 1, visibility: 1 }, { name: 'strength_recommendations' });
ConnectionSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 31536000, partialFilterExpression: { isArchived: true }, name: 'auto_archive_ttl' }
);

// Performance Monitoring
const slowQueries: IQueryPerformance[] = [];
const MAX_SLOW_QUERIES = 1000;
const SLOW_QUERY_THRESHOLD = 500;

ConnectionSchema.pre(/^find/, function (this: Query<any, any>) {
    (this as any).startTime = Date.now();
    if (typeof this.getOptions === 'function') {
        if (!this.getOptions().hint) {
            const filter = this.getQuery();
            if (filter.fromUserId || filter.toUserId) {
                // hint logic placeholder
            } else if (filter.shardKey) {
                // hint logic placeholder
            }
        }
    }
    if ((this as any).op === 'aggregate' && typeof this.allowDiskUse === 'function') {
        this.allowDiskUse(true);
    }
});

ConnectionSchema.post(/^find/, function (this: Query<any, any>, _result: any) {
    const duration = Date.now() - (this as any).startTime;
    if (duration > SLOW_QUERY_THRESHOLD) {
        const queryInfo: IQueryPerformance = {
            query: {
                op: (this as any).op,
                filter: this.getQuery(),
                options: this.getOptions(),
                collection: 'connections'
            },
            duration,
            timestamp: new Date(),
            index: (this.getOptions().hint as string) || 'unknown'
        };
        if (slowQueries.length >= MAX_SLOW_QUERIES) {
            slowQueries.shift();
        }
        slowQueries.push(queryInfo);
        logger.warn(
            `Slow query detected: ${JSON.stringify(queryInfo.query)} took ${duration}ms (index: ${queryInfo.index})`,
            { category: LogCategory.DATABASE } as unknown as PublicLogMetadata
        );
    }
});

ConnectionSchema.pre('validate', function (next) {
    if (this.fromUserId === this.toUserId) {
        next(new Error('Users cannot connect with themselves'));
        return;
    }
    if (!this.shardKey && this.fromUserId && this.toUserId) {
        const userIds = [this.fromUserId, this.toUserId].sort();
        this.shardKey = `${userIds[0]}_${userIds[1]}_${this.region || 'global'}`;
    }
    next();
});

ConnectionSchema.pre('save', function (next) {
    if (!this.isNew && this.isModified()) {
        this.cacheVersion += 1;
    }
    if (this.isModified('status') && this.status === 'active') {
        this.lastInteraction = new Date();
    }
    if (this.isNew) {
        logger.info(`Creating new connection: ${this.connectionId} from ${this.fromUserId} to ${this.toUserId} in ${this.region}`, {
            category: LogCategory.CONNECTION,
            connectionId: this.connectionId,
            userId: this.fromUserId
        } as unknown as PublicLogMetadata);
    }
    next();
});

ConnectionSchema.statics.findByConnectionId = async function (
    connectionId: string,
    projection: string = ''
): Promise<IConnection | null> {
    const query = this.findOne({ connectionId }).lean();
    if (projection) {
        query.select(projection);
    }
    const result = await query.exec();
    return result as IConnection | null;
};

ConnectionSchema.statics.checkConnectionExists = async function (
    fromUserId: string,
    toUserId: string
): Promise<boolean> {
    const userIds = [fromUserId, toUserId].sort();
    const count = await this.countDocuments({
        $or: [
            { fromUserId, toUserId, status: { $ne: 'removed' } },
            { fromUserId: toUserId, toUserId: fromUserId, status: { $ne: 'removed' } },
        ],
        shardKey: { $regex: `^${userIds[0]}_${userIds[1]}` }
    });
    return count > 0;
};

async function paginateQuery<T>(
    query: any,
    page: number = 1,
    limit: number = environmentConfig.PAGINATION_DEFAULT_LIMIT,
    useEstimatedCount: boolean = false
): Promise<IPaginationResult<T>> {
    const skip = Math.max(0, (page - 1) * limit);
    const maxLimit = Math.min(limit, environmentConfig.PAGINATION_MAX_LIMIT);
    let totalCount: number;
    if (useEstimatedCount && page === 1) {
        totalCount = await query.clone().estimatedDocumentCount();
    } else {
        totalCount = await query.clone().countDocuments();
    }
    const data = await query.clone().skip(skip).limit(maxLimit).lean();
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

ConnectionSchema.statics.findUserConnectionsPaginated = async function (
    userId: string,
    options: {
        page?: number;
        limit?: number;
        status?: string;
        tag?: string;
        projection?: string;
        useEstimatedCount?: boolean;
        region?: string;
    } = {}
): Promise<IPaginationResult<IConnection>> {
    const {
        page = 1,
        limit = environmentConfig.PAGINATION_DEFAULT_LIMIT,
        status,
        tag,
        projection,
        useEstimatedCount = false,
        region = 'global'
    } = options;
    let filter: any = {
        $or: [{ fromUserId: userId }, { toUserId: userId }],
        isArchived: false,
        region,
    };
    if (status) filter.status = status;
    if (tag) filter.tags = tag;
    let query = this.find(filter).sort({ createdAt: -1 });
    if (projection) {
        query = query.select(projection);
    }
    return paginateQuery(query, page, limit, useEstimatedCount);
};

ConnectionSchema.statics.bulkCreateConnections = async function (
    connections: Partial<IConnection>[]
): Promise<any> {
    const connectionsWithFlags = connections.map(conn => ({
        ...conn,
        $locals: { skipValidation: true }
    }));
    const result = await this.insertMany(connectionsWithFlags, {
        ordered: false,
        rawResult: true
    });
    logger.info(`Bulk connections created: ${result.insertedCount} of ${connections.length} requested`, {
        category: LogCategory.CONNECTION,
        data: { insertedCount: result.insertedCount }
    } as unknown as PublicLogMetadata);
    return result;
};

ConnectionSchema.statics.bulkUpdateStatus = async function (
    connectionIds: string[],
    status: string,
    userId?: string
): Promise<any> {
    if (!['active', 'pending', 'removed', 'blocked'].includes(status)) {
        throw new Error('Invalid status for bulk update');
    }
    let filter: any = { connectionId: { $in: connectionIds } };
    if (userId) {
        filter.$or = [{ fromUserId: userId }, { toUserId: userId }];
    }
    const result = await this.updateMany(filter, {
        $set: {
            status,
            updatedAt: new Date(),
        },
        $inc: { cacheVersion: 1 }
    });
    logger.info(`Bulk connection status update completed: ${result.modifiedCount} of ${connectionIds.length} connections updated to ${status} for user ${userId || 'system'}`, {
        category: LogCategory.CONNECTION,
        userId,
        data: { modifiedCount: result.modifiedCount, status }
    } as unknown as PublicLogMetadata);
    return result;
};

ConnectionSchema.statics.bulkArchiveConnections = async function (
    connectionIds: string[],
    userId: string
): Promise<any> {
    const filter: any = {
        connectionId: { $in: connectionIds },
        $or: [{ fromUserId: userId }, { toUserId: userId }]
    };
    const result = await this.updateMany(filter, {
        $set: {
            isArchived: true,
            updatedAt: new Date(),
        },
        $inc: { cacheVersion: 1 }
    });
    logger.info(`Bulk connection archive completed: ${result.modifiedCount} of ${connectionIds.length} connections archived for user ${userId}`, {
        category: LogCategory.CONNECTION,
        userId,
        data: { modifiedCount: result.modifiedCount }
    } as unknown as PublicLogMetadata);
    return result;
};

ConnectionSchema.statics.getUserConnectionStats = async function (
    userId: string,
    _useCache: boolean = true
): Promise<IConnectionStats> {
    const pipeline = [
        {
            $match: {
                $or: [
                    { fromUserId: userId },
                    { toUserId: userId }
                ],
                isArchived: false
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgStrength: { $avg: '$strength' },
                tags: { $push: '$tags' }
            }
        },
        {
            $unwind: {
                path: '$tags',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $unwind: {
                path: '$tags',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $group: {
                _id: {
                    status: '$_id',
                    tag: '$tags'
                },
                count: { $first: '$count' },
                avgStrength: { $first: '$avgStrength' },
                tagCount: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.status',
                count: { $first: '$count' },
                avgStrength: { $first: '$avgStrength' },
                topTags: {
                    $push: {
                        $cond: [
                            { $ne: ['$_id.tag', null] },
                            { tag: '$_id.tag', count: '$tagCount' },
                            null
                        ]
                    }
                }
            }
        }
    ];
    const results = await this.aggregate(pipeline);
    const stats: IConnectionStats = {
        active: 0,
        pending: 0,
        removed: 0,
        blocked: 0,
        total: 0,
        avgStrength: 0,
        topTags: []
    };
    results.forEach(result => {
        if (result._id) {
            const statusKey = result._id as 'active' | 'pending' | 'removed' | 'blocked';
            stats[statusKey] = result.count;
            stats.total += result.count;
            stats.avgStrength += result.avgStrength * result.count;
            if (result.topTags) {
                stats.topTags.push(...result.topTags.filter((tag: any) => tag !== null));
            }
        }
    });
    if (stats.total > 0) {
        stats.avgStrength = stats.avgStrength / stats.total;
    }
    stats.topTags = stats.topTags.sort((a, b) => b.count - a.count).slice(0, 10);
    return stats;
};

ConnectionSchema.statics.findMutualConnections = async function (
    userId1: string,
    userId2: string,
    limit: number = 10
): Promise<IConnection[]> {
    const pipeline = [
        {
            $match: {
                $or: [
                    { fromUserId: userId1 },
                    { toUserId: userId1 }
                ],
                status: 'active',
                isArchived: false
            }
        },
        {
            $lookup: {
                from: 'connections',
                let: {
                    connectedUserId: {
                        $cond: [
                            { $eq: ['$fromUserId', userId1] },
                            '$toUserId',
                            '$fromUserId'
                        ]
                    }
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {
                                        $or: [
                                            { $eq: ['$fromUserId', userId2] },
                                            { $eq: ['$toUserId', userId2] }
                                        ]
                                    },
                                    {
                                        $or: [
                                            { $eq: ['$fromUserId', '$$connectedUserId'] },
                                            { $eq: ['$toUserId', '$$connectedUserId'] }
                                        ]
                                    }
                                ]
                            },
                            status: 'active',
                            isArchived: false
                        }
                    }
                ],
                as: 'mutualConnection'
            }
        },
        {
            $match: { 'mutualConnection.0': { $exists: true } }
        },
        {
            $limit: limit
        }
    ];
    return this.aggregate(pipeline);
};

// ✅ NEW — Efficient count-only version (no full documents pulled back)
ConnectionSchema.statics.countMutualConnections = async function (
    userId1: string,
    userId2: string
): Promise<number> {
    const pipeline = [
        {
            $match: {
                $or: [
                    { fromUserId: userId1 },
                    { toUserId: userId1 }
                ],
                status: 'active',
                isArchived: false
            }
        },
        {
            $lookup: {
                from: 'connections',
                let: {
                    connectedUserId: {
                        $cond: [
                            { $eq: ['$fromUserId', userId1] },
                            '$toUserId',
                            '$fromUserId'
                        ]
                    }
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {
                                        $or: [
                                            { $eq: ['$fromUserId', userId2] },
                                            { $eq: ['$toUserId', userId2] }
                                        ]
                                    },
                                    {
                                        $or: [
                                            { $eq: ['$fromUserId', '$$connectedUserId'] },
                                            { $eq: ['$toUserId', '$$connectedUserId'] }
                                        ]
                                    }
                                ]
                            },
                            status: 'active',
                            isArchived: false
                        }
                    },
                    { $limit: 1 },
                    { $project: { _id: 1 } }
                ],
                as: 'mutualConnection'
            }
        },
        {
            $match: { 'mutualConnection.0': { $exists: true } }
        },
        { $count: 'total' }
    ];
    const result = await this.aggregate(pipeline);
    return result[0]?.total || 0;
};

ConnectionSchema.statics.calculateConnectionStrength = async function (
    connectionId: string
): Promise<number> {
    const connection = await this.findOne({ connectionId });
    if (!connection) return 0;
    let strength = 0;
    const ageInDays = (Date.now() - connection.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    strength += Math.min(ageInDays / 365 * 20, 20);
    strength += Math.min(connection.interactionCount * 2, 30);
    const typeBonus: Record<string, number> = { professional: 15, personal: 25, other: 10 };
    strength += typeBonus[connection.connectionType] || 0;
    strength += Math.min(connection.tags.length * 2, 10);
    const priorityBonus: Record<string, number> = { low: 0, medium: 5, high: 15 };
    strength += priorityBonus[connection.priority] || 0;
    const finalStrength = Math.min(Math.round(strength), 100);
    await this.updateOne(
        { connectionId },
        {
            $set: { strength: finalStrength },
            $inc: { cacheVersion: 1 }
        }
    );
    return finalStrength;
};

ConnectionSchema.statics.updateConnectionStrengthBatch = async function (
    batchSize: number = 1000
): Promise<number> {
    let updated = 0;
    let skip = 0;
    while (true) {
        const connections = await this.find({ status: 'active' })
            .select('connectionId')
            .skip(skip)
            .limit(batchSize)
            .lean();
        if (connections.length === 0) break;
        const updatePromises = connections.map((conn: { connectionId: string }) =>
            Connection.calculateConnectionStrength(conn.connectionId)
        );
        await Promise.all(updatePromises);
        updated += connections.length;
        skip += batchSize;
        if (updated % 10000 === 0) {
            logger.info(`Connection strength update progress: ${updated} connections updated`, {
                category: LogCategory.CONNECTION,
                data: { updated }
            } as unknown as PublicLogMetadata);
        }
    }
    logger.info(`Connection strength batch update completed: ${updated} total connections updated`, {
        category: LogCategory.CONNECTION,
        data: { updated }
    } as unknown as PublicLogMetadata);
    return updated;
};

ConnectionSchema.statics.getSystemStats = async function (region?: string) {
    const matchStage = region ? { region, isArchived: false } : { isArchived: false };
    const pipeline = [
        { $match: matchStage },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgStrength: { $avg: '$strength' },
                regions: { $addToSet: '$region' }
            }
        }
    ];
    const [stats, totalConnections, recentConnections] = await Promise.all([
        this.aggregate(pipeline),
        this.estimatedDocumentCount(),
        this.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
            ...(region && { region })
        })
    ]);
    return {
        byStatus: stats,
        totalConnections,
        recentConnections,
        region: region || 'all'
    };
};

ConnectionSchema.statics.archiveOldConnections = async function (
    daysOld: number = 365,
    batchSize: number = 1000
): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    let totalArchived = 0;
    while (true) {
        const result = await this.updateMany(
            {
                createdAt: { $lt: cutoffDate },
                status: 'removed',
                isArchived: false,
            },
            {
                $set: { isArchived: true },
                $inc: { cacheVersion: 1 }
            }
        );
        totalArchived += result.modifiedCount;
        if (result.modifiedCount < batchSize) {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    logger.info(`Archived old connections in batches: ${totalArchived} connections archived with cutoff ${cutoffDate.toISOString()} using batch size ${batchSize}`, {
        category: LogCategory.CONNECTION,
        data: { totalArchived, cutoffDate, batchSize }
    } as unknown as PublicLogMetadata);
    return totalArchived;
};

ConnectionSchema.statics.getSlowQueries = function (): IQueryPerformance[] {
    return [...slowQueries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

ConnectionSchema.post('save', function (error: any, doc: IConnection, next: any) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
        logger.error(`Duplicate connection error: ${error.message} for connection ${doc?.connectionId} with shard key ${doc?.shardKey}`, {
            category: LogCategory.CONNECTION,
            connectionId: doc?.connectionId
        } as unknown as PublicLogMetadata);
        next(new Error('A connection already exists between these users'));
    } else if (error.name === 'ValidationError') {
        logger.error(`Connection validation failed: ${error.message} for connection ${doc?.connectionId} in fields: ${Object.keys(error.errors || {}).join(', ')}`, {
            category: LogCategory.CONNECTION,
            connectionId: doc?.connectionId
        } as unknown as PublicLogMetadata);
        next(new Error(`Validation failed: ${error.message}`));
    } else if (error.name === 'CastError') {
        logger.error(`Connection cast error: ${error.message} for connection ${doc?.connectionId} at path ${error.path}`, {
            category: LogCategory.CONNECTION,
            connectionId: doc?.connectionId
        } as unknown as PublicLogMetadata);
        next(new Error('Invalid data type provided'));
    } else {
        logger.error(`Connection save error: ${error.message} for connection ${doc?.connectionId} (${error.name})`, {
            category: LogCategory.CONNECTION,
            connectionId: doc?.connectionId
        } as unknown as PublicLogMetadata);
        next(error);
    }
});

ConnectionSchema.set('toJSON', {
    transform: (doc: IConnection, ret: any) => {
        delete ret.__v;
        delete ret.searchVector;
        delete ret.cacheVersion;
        ret.isMutual = doc.fromUserId !== doc.toUserId;
        ret.strengthCategory = ret.strength >= 70 ? 'strong' :
            ret.strength >= 40 ? 'medium' : 'weak';
        return ret;
    },
});

ConnectionSchema.statics.getConnectionRecommendations = async function (
    userId: string,
    limit: number = 10
): Promise<string[]> {
    const pipeline = [
        {
            $match: {
                $or: [
                    { fromUserId: userId },
                    { toUserId: userId }
                ],
                status: 'active',
                strength: { $gte: 50 }
            }
        },
        {
            $sample: { size: limit }
        },
        {
            $project: {
                recommendedUserId: {
                    $cond: [
                        { $eq: ['$fromUserId', userId] },
                        '$toUserId',
                        '$fromUserId'
                    ]
                }
            }
        }
    ];
    const results = await this.aggregate(pipeline);
    return results.map(r => r.recommendedUserId);
};

ConnectionSchema.statics.getConnectionGraph = async function (
    userId: string,
    depth: number = 2
): Promise<any> {
    const connections = await this.find({
        $or: [
            { fromUserId: userId },
            { toUserId: userId }
        ],
        status: 'active'
    }).lean();
    return {
        userId,
        connections: connections.map((conn: any) => ({
            connectionId: conn.connectionId,
            connectedUserId: conn.fromUserId === userId ?
                conn.toUserId :
                conn.fromUserId,
            strength: conn.strength,
            type: conn.connectionType
        })),
        depth
    };
};

ConnectionSchema.statics.findInfluencers = async function (
    region?: string,
    limit: number = 50
): Promise<any[]> {
    const matchStage: any = {
        status: 'active',
        strength: { $gte: 70 }
    };
    if (region) {
        matchStage.region = region;
    }
    const pipeline = [
        { $match: matchStage },
        {
            $group: {
                _id: '$fromUserId',
                connectionCount: { $sum: 1 },
                avgStrength: { $avg: '$strength' },
                totalStrength: { $sum: '$strength' }
            }
        },
        {
            $sort: { totalStrength: -1 as const, connectionCount: -1 as const }
        },
        {
            $limit: limit
        }
    ];
    return this.aggregate(pipeline);
};

ConnectionSchema.statics.getNetworkAnalytics = async function (
    userId: string
): Promise<any> {
    const stats = await Connection.getUserConnectionStats(userId);
    const mutualConnections = await Connection.findMutualConnections(userId, userId, 5);
    return {
        ...stats,
        networkSize: stats.total,
        mutualConnectionsCount: mutualConnections.length,
        networkDensity: stats.total > 0 ? (stats.avgStrength / 100) : 0
    };
};

ConnectionSchema.statics.migrateToRegion = async function (
    userId: string,
    newRegion: string
): Promise<boolean> {
    try {
        const result = await this.updateMany(
            {
                $or: [
                    { fromUserId: userId },
                    { toUserId: userId }
                ]
            },
            {
                $set: { region: newRegion },
                $inc: { cacheVersion: 1 }
            }
        );
        logger.info(`User ${userId} connections migrated to region ${newRegion}: ${result.modifiedCount} connections updated`, {
            category: LogCategory.CONNECTION,
            userId,
            data: { modifiedCount: result.modifiedCount, newRegion }
        } as unknown as PublicLogMetadata);
        return result.modifiedCount > 0;
    } catch (error: any) {
        logger.error(`Failed to migrate user ${userId} to region ${newRegion}`, {
            category: LogCategory.CONNECTION,
            userId,
            data: { error: error instanceof Error ? error.message : String(error) }
        } as unknown as PublicLogMetadata);
        return false;
    }
};

ConnectionSchema.statics.cleanupInactiveConnections = async function (
    inactiveDays: number = 180
): Promise<number> {
    const cutoffDate = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    const result = await this.updateMany(
        {
            lastInteraction: { $lt: cutoffDate },
            status: 'active',
            interactionCount: { $lt: 5 }
        },
        {
            $set: {
                status: 'removed',
                isArchived: true
            },
            $inc: { cacheVersion: 1 }
        }
    );
    logger.info(`Cleaned up inactive connections: ${result.modifiedCount} connections marked as removed`, {
        category: LogCategory.CONNECTION,
        data: { modifiedCount: result.modifiedCount, cutoffDate }
    } as unknown as PublicLogMetadata);
    return result.modifiedCount;
};

const Connection: IConnectionModel = model<IConnection, IConnectionModel>('Connection', ConnectionSchema);

export {
    IConnection,
    IConnectionModel,
    IConnectionStats,
    IQueryPerformance
}
export default Connection;