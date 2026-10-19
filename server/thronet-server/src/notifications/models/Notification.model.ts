import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface INotification extends Document {
    notificationId: string;
    recipientId: string;       // who receives it
    senderId: string;          // who triggered it
    senderName: string;
    senderPhoto?: string;
    type: 'post_created' | 'post_liked' | 'post_commented' | 'post_reposted' | 'connection_request' | 'connection_accepted' | 'mentioned' | 'new_follower' | 'profile_viewed' | 'birthday' | 'connection_birthday' | 'work_anniversary' | 'pymk_suggestion' | 'comment_liked' | 'comment_replied' | 'application_submitted' | 'application_status_updated' | 'job_recommendation' | 'new_job_posted';
    entityId: string;         
    entityIds?: string[];
    entityType: 'post' | 'connection' | 'comment' | 'user' | 'job';
    message: string;
    isRead: boolean;
    idempotencyKey?: string;
    createdAt: Date;
}

export interface INotificationModel extends Model<INotification> { }

const NotificationSchema = new Schema<INotification, INotificationModel>(
    {
        notificationId: { type: String, default: () => uuidv4(), unique: true },
        recipientId: { type: String, required: true },
        senderId: { type: String, required: true },
        senderName: { type: String, required: true },
        senderPhoto: { type: String, default: null },
        type: {
            type: String,
            enum: [
                // Social notifications
                'post_created', 'post_liked', 'post_commented', 'post_reposted',
                'connection_request', 'connection_accepted', 'mentioned', 'new_follower',
                'profile_viewed', 'birthday', 'connection_birthday', 'work_anniversary',
                'pymk_suggestion', 'comment_liked', 'comment_replied',
                // Job-Service notifications
                'application_submitted', 'application_status_updated',
                'job_recommendation', 'new_job_posted',
            ],
            required: true,
        },
        entityId: { type: String, required: true },
        entityIds: { type: [String], default: [] },
        entityType: { type: String, enum: ['post', 'connection', 'comment', 'user', 'job'], required: true },
        message: { type: String, required: true },
        isRead: { type: Boolean, default: false },
        idempotencyKey: { type: String, default: null },
    },
    { timestamps: true, collection: 'notifications-service' }
);

NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index(
    { idempotencyKey: 1 },
    {
        unique: true,
        partialFilterExpression: {
            idempotencyKey: { $type: 'string' },
        },
    }
);

// ── Cache Invalidation Hooks ─────────────────────────────────
// Dynamically imported / invoked to avoid circular module dependencies
NotificationSchema.post('save', async function (doc: any) {
    if (doc && doc.recipientId) {
        try {
            const { NotificationCacheRepository } = await import('@/shared/cache/notificationCache');
            await NotificationCacheRepository.invalidateUser(doc.recipientId);
        } catch {
            // fail-safe
        }
    }
});

NotificationSchema.post('insertMany', async function (docs: any) {
    if (Array.isArray(docs)) {
        const recipientIds = [...new Set(docs.map((d: any) => d.recipientId).filter(Boolean))];
        if (recipientIds.length > 0) {
            try {
                const { NotificationCacheRepository } = await import('@/shared/cache/notificationCache');
                await NotificationCacheRepository.invalidateUser(recipientIds);
            } catch {
                // fail-safe
            }
        }
    }
});

const NOTIF_MUTATION_METHODS = [
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'findOneAndUpdate',
    'findOneAndDelete',
    'replaceOne',
    'findOneAndReplace',
] as const;

NotificationSchema.pre(NOTIF_MUTATION_METHODS as any, async function (this: any) {
    try {
        const filter = this.getFilter() || {};
        if (filter.recipientId && typeof filter.recipientId === 'string') {
            this._preUpdateRecipientIds = [filter.recipientId];
            return;
        }
        if (filter.recipientId && typeof filter.recipientId === 'object' && Array.isArray(filter.recipientId.$in)) {
            this._preUpdateRecipientIds = filter.recipientId.$in.map(String);
            return;
        }
        const affectedDocs = await this.model
            .find(filter)
            .select('recipientId')
            .limit(501)
            .lean()
            .exec();
        this._preUpdateRecipientIds = [...new Set(affectedDocs.map((d: any) => d.recipientId).filter(Boolean))];
    } catch {
        this._preUpdateRecipientIds = [];
    }
});

NotificationSchema.post(NOTIF_MUTATION_METHODS as any, async function (this: any) {
    try {
        const ids: string[] = this._preUpdateRecipientIds || [];
        if (ids.length > 0) {
            const { NotificationCacheRepository } = await import('@/shared/cache/notificationCache');
            await NotificationCacheRepository.invalidateUser(ids);
        }
    } catch {
        // fail-safe
    }
});

NotificationSchema.post('save', async function (doc: any) {
    try {
        if (doc?.recipientId) {
            const { NotificationCacheRepository } = await import('@/shared/cache/notificationCache');
            await NotificationCacheRepository.invalidateUser(String(doc.recipientId));
        }
    } catch {
        // fail-safe
    }
});

NotificationSchema.post('insertMany', async function (docs: any) {
    try {
        const arr = Array.isArray(docs) ? docs : [docs];
        const recipientIds = [...new Set(arr.map((d: any) => d?.recipientId).filter(Boolean))];
        if (recipientIds.length > 0) {
            const { NotificationCacheRepository } = await import('@/shared/cache/notificationCache');
            await NotificationCacheRepository.invalidateUser(recipientIds);
        }
    } catch {
        // fail-safe
    }
});

const Notification = mongoose.model<INotification, INotificationModel>('Notification-service', NotificationSchema);
export default Notification;