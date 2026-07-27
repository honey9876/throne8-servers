import headlineEmitter from '@/shared/events/emitters/headline.emitter';
import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const logger = LoggerUtil;

// ==================== INTERFACES ====================

export interface IHeadline extends Document {
    headlineId: string;
    type: 'login_success' | 'dashboard' | 'notification' | 'alert' | 'announcement' | 'welcome';
    title: string;
    message: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED';
    audience: {
        type: 'ALL' | 'PRIVATE' | 'SPECIFIC_USERS' | 'ROLE_BASED' | 'LOCATION_BASED';
        userIds?: string[];
        roles?: string[];
        locations?: string[];
    };
    scheduling: {
        publishAt?: Date;
        expiresAt?: Date;
        timezone: string;
        isRecurring: boolean;
        recurringPattern?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    };
    styling: {
        backgroundColor?: string;
        textColor?: string;
        icon?: string;
        iconColor?: string;
        borderColor?: string;
        fontWeight?: 'normal' | 'bold' | 'semibold';
    };
    actions?: {
        label: string;
        type: 'LINK' | 'BUTTON' | 'DISMISS';
        url?: string;
        action?: string;
    }[];
    metadata: {
        createdBy: string;
        createdByName: string;
        lastModifiedBy?: string;
        lastModifiedByName?: string;
        version: number;
        viewCount: number;
        clickCount: number;
        dismissCount: number;
    };
    analytics: {
        impressions: number;
        clicks: number;
        dismissals: number;
        averageViewTime: number;
        lastViewedAt?: Date;
    };
    flags: {
        isDismissible: boolean;
        isSticky: boolean;
        requiresAction: boolean;
        isDeleted: boolean;
        deletedAt?: Date;
        deletedBy?: string;
    };
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
    isExpired: boolean;
    isScheduled: boolean;
    softDelete(deletedBy: string): Promise<IHeadline>;
    incrementView(): Promise<void>;
    incrementClick(): Promise<void>;
    incrementDismiss(): Promise<void>;
    publish(): Promise<IHeadline>;
    expire(): Promise<IHeadline>;
}

export interface IHeadlineModel extends Model<IHeadline> {
    findActiveHeadlines(filters?: {
        type?: string;
        userId?: string;
        userRole?: string;
        userLocation?: string;
    }): Promise<IHeadline[]>;
    findByHeadlineId(headlineId: string): Promise<IHeadline | null>;
    getHeadlinesByType(type: string): Promise<IHeadline[]>;
    expireOldHeadlines(): Promise<number>;
    getAnalytics(headlineId: string): Promise<any>;
}

// ==================== SCHEMA ====================

const HeadlineSchema = new Schema<IHeadline, IHeadlineModel>(
    {
        headlineId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        type: {
            type: String,
            enum: ['login_success', 'dashboard', 'notification', 'alert', 'announcement', 'welcome'],
        },
        title: {
            type: String,
            required: true,
            trim: true,
            minlength: [3, 'Title must be at least 3 characters'],
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        message: {
            type: String,
            required: true,
            trim: true,
            minlength: [10, 'Message must be at least 10 characters'],
            maxlength: [500, 'Message cannot exceed 500 characters'],
        },
        priority: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
            default: 'MEDIUM',
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE', 'SCHEDULED', 'EXPIRED'],
            default: 'ACTIVE',
        },
        audience: {
            type: {
                type: String,
                enum: ['ALL', 'PRIVATE'],
                default: 'ALL',
            },
            userIds: {
                type: [String],
                default: [],
            },
            roles: {
                type: [String],
                default: [],
            },
            locations: {
                type: [String],
                default: [],
            },
        },
        scheduling: {
            publishAt: {
                type: Date,
            },
            expiresAt: {
                type: Date,
            },
            timezone: {
                type: String,
                default: 'UTC',
            },
            isRecurring: {
                type: Boolean,
                default: false,
            },
            recurringPattern: {
                type: String,
                enum: ['DAILY', 'WEEKLY', 'MONTHLY'],
            },
        },
        styling: {
            backgroundColor: {
                type: String,
                default: '#3B82F6',
                validate: {
                    validator: (v: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v),
                    message: 'Invalid color format. Use hex format (#RRGGBB)',
                },
            },
            textColor: {
                type: String,
                default: '#FFFFFF',
            },
            icon: String,
            iconColor: String,
            borderColor: String,
            fontWeight: {
                type: String,
                enum: ['normal', 'bold', 'semibold'],
                default: 'normal',
            },
        },
        actions: [
            {
                label: {
                    type: String,
                    required: true,
                    trim: true,
                },
                type: {
                    type: String,
                    enum: ['LINK', 'BUTTON', 'DISMISS'],
                    required: true,
                },
                url: String,
                action: String,
            },
        ],
        metadata: {
            createdBy: {
                type: String,
                required: true,
            },
            createdByName: {
                type: String,
                required: true,
            },
            lastModifiedBy: String,
            lastModifiedByName: String,
            version: {
                type: Number,
                default: 1,
            },
            viewCount: {
                type: Number,
                default: 0,
            },
            clickCount: {
                type: Number,
                default: 0,
            },
            dismissCount: {
                type: Number,
                default: 0,
            },
        },
        analytics: {
            impressions: { type: Number, default: 0 },
            clicks: { type: Number, default: 0 },
            dismissals: { type: Number, default: 0 },
            averageViewTime: { type: Number, default: 0 },
            lastViewedAt: Date,
        },
        flags: {
            isDismissible: { type: Boolean, default: true },
            isSticky: { type: Boolean, default: false },
            requiresAction: { type: Boolean, default: false },
            isDeleted: { type: Boolean, default: false },
            deletedAt: Date,
            deletedBy: String,
        },
    },
    {
        timestamps: true,
        collection: 'headlines',
        shardKey: { headlineId: 'hashed' },
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret) {
                delete (ret as any).__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// ==================== INDEXES ====================
HeadlineSchema.index({ 'audience.type': 1 });
HeadlineSchema.index({ createdAt: -1 });
HeadlineSchema.index({ 'metadata.createdBy': 1, createdAt: -1 });

HeadlineSchema.index({
    type: 1,
    status: 1,
    'scheduling.expiresAt': 1,
    'flags.isDeleted': 1,
});

HeadlineSchema.index({
    'audience.userIds': 1,
    status: 1,
    'flags.isDeleted': 1,
});

// ==================== VIRTUALS ====================

HeadlineSchema.virtual('isActive').get(function (this: IHeadline) {
    return this.status === 'ACTIVE' && !this.flags.isDeleted;
});

HeadlineSchema.virtual('isExpired').get(function (this: IHeadline) {
    if (!this.scheduling.expiresAt) return false;
    return new Date() > this.scheduling.expiresAt;
});

HeadlineSchema.virtual('isScheduled').get(function (this: IHeadline) {
    if (!this.scheduling.publishAt) return false;
    return new Date() < this.scheduling.publishAt;
});

// ==================== PRE-SAVE HOOK ====================

HeadlineSchema.pre('save', async function (next) {
    try {
        if (this.scheduling.publishAt && new Date() < this.scheduling.publishAt) {
            this.status = 'SCHEDULED';
        }
        if (this.scheduling.expiresAt && new Date() > this.scheduling.expiresAt) {
            this.status = 'EXPIRED';
        }
        if (this.isModified() && !this.isNew) {
            this.metadata.version += 1;
        }
        next();
    } catch (error: any) {
        next(error as Error);
    }
});

// ==================== STATIC METHODS ====================

HeadlineSchema.statics.findActiveHeadlines = async function (filters = {}): Promise<IHeadline[]> {
    const { type, userId, userRole, userLocation } = filters;

    const query: any = {
        status: 'ACTIVE',
        'flags.isDeleted': false,
        $or: [
            { 'scheduling.expiresAt': { $exists: false } },
            { 'scheduling.expiresAt': { $gt: new Date() } },
        ],
        $and: [
            {
                $or: [
                    { 'scheduling.publishAt': { $exists: false } },
                    { 'scheduling.publishAt': { $lte: new Date() } },
                ],
            },
        ],
    };

    if (type) query.type = type;

    if (userId || userRole || userLocation) {
        query.$or = [{ 'audience.type': 'ALL' }];
        if (userId) query.$or.push({ 'audience.userIds': userId });
        if (userRole) query.$or.push({ 'audience.roles': userRole });
        if (userLocation) query.$or.push({ 'audience.locations': userLocation });
    }

    const headlines = await this.find(query)
        .sort({ priority: -1, createdAt: -1 })
        .lean() as unknown as IHeadline[];

    logger.debug('Active headlines fetched', { count: headlines.length, filters });
    return headlines;
};

HeadlineSchema.statics.findByHeadlineId = async function (headlineId: string): Promise<IHeadline | null> {
    return this.findOne({ headlineId, 'flags.isDeleted': false });
};

HeadlineSchema.statics.getHeadlinesByType = async function (type: string): Promise<IHeadline[]> {
    return this.find({ type, status: 'ACTIVE', 'flags.isDeleted': false }).sort({ priority: -1, createdAt: -1 });
};

HeadlineSchema.statics.expireOldHeadlines = async function (): Promise<number> {
    const result = await this.updateMany(
        { status: 'ACTIVE', 'scheduling.expiresAt': { $lte: new Date() }, 'flags.isDeleted': false },
        { $set: { status: 'EXPIRED' } }
    );
    logger.info('Old headlines expired', { count: result.modifiedCount });
    return result.modifiedCount;
};

HeadlineSchema.statics.getAnalytics = async function (headlineId: string): Promise<any> {
    const headline = await this.findOne({ headlineId });
    if (!headline) throw new Error('Headline not found');
    return {
        headlineId: headline.headlineId,
        type: headline.type,
        title: headline.title,
        analytics: headline.analytics,
        metadata: {
            viewCount: headline.metadata.viewCount,
            clickCount: headline.metadata.clickCount,
            dismissCount: headline.metadata.dismissCount,
        },
        performance: {
            clickThroughRate: headline.analytics.impressions > 0
                ? (headline.analytics.clicks / headline.analytics.impressions) * 100
                : 0,
            dismissalRate: headline.analytics.impressions > 0
                ? (headline.analytics.dismissals / headline.analytics.impressions) * 100
                : 0,
        },
    };
};

// ==================== INSTANCE METHODS ====================

HeadlineSchema.methods.softDelete = async function (this: IHeadline, deletedBy: string): Promise<IHeadline> {
    this.flags.isDeleted = true;
    this.flags.deletedAt = new Date();
    this.flags.deletedBy = deletedBy;
    this.status = 'INACTIVE';
    await this.save();
    headlineEmitter.emit('headline:deleted', { headlineId: this.headlineId, deletedBy, timestamp: new Date() });
    logger.info('Headline soft deleted', { headlineId: this.headlineId, deletedBy });
    return this;
};

HeadlineSchema.methods.incrementView = async function (this: IHeadline): Promise<void> {
    this.metadata.viewCount += 1;
    this.analytics.impressions += 1;
    this.analytics.lastViewedAt = new Date();
    await this.save();
};

HeadlineSchema.methods.incrementClick = async function (this: IHeadline): Promise<void> {
    this.metadata.clickCount += 1;
    this.analytics.clicks += 1;
    await this.save();
};

HeadlineSchema.methods.incrementDismiss = async function (this: IHeadline): Promise<void> {
    this.metadata.dismissCount += 1;
    this.analytics.dismissals += 1;
    await this.save();
};

HeadlineSchema.methods.publish = async function (this: IHeadline): Promise<IHeadline> {
    this.status = 'ACTIVE';
    this.scheduling.publishAt = new Date();
    await this.save();
    headlineEmitter.emit('headline:published', { headlineId: this.headlineId, timestamp: new Date() });
    logger.info('Headline published', { headlineId: this.headlineId });
    return this;
};

HeadlineSchema.methods.expire = async function (this: IHeadline): Promise<IHeadline> {
    this.status = 'EXPIRED';
    this.scheduling.expiresAt = new Date();
    await this.save();
    headlineEmitter.emit('headline:expired', { headlineId: this.headlineId, timestamp: new Date() });
    logger.info('Headline expired', { headlineId: this.headlineId });
    return this;
};

// ==================== EXPORT ====================

const Headline = mongoose.model<IHeadline, IHeadlineModel>('Headline', HeadlineSchema);
export default Headline;