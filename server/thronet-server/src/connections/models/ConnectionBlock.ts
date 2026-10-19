// thronet-server/src/connections/models/ConnectionBlock.ts
import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export enum BlockReason {
    SPAM = 'spam',
    HARASSMENT = 'harassment',
    INAPPROPRIATE_CONTENT = 'inappropriate_content',
    FAKE_PROFILE = 'fake_profile',
    PRIVACY_VIOLATION = 'privacy_violation',
    COMMERCIAL_ABUSE = 'commercial_abuse',
    IMPERSONATION = 'impersonation',
    HATE_SPEECH = 'hate_speech',
    VIOLENT_CONTENT = 'violent_content',
    SCAM_FRAUD = 'scam_fraud',
    COPYRIGHT_VIOLATION = 'copyright_violation',
    OTHER = 'other',
}

export enum BlockType {
    FULL = 'full',
    PROFILE_ONLY = 'profile_only',
    MESSAGING_ONLY = 'messaging_only',
}

export enum BlockSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical',
}

export enum BlockStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    EXPIRED = 'expired',
}

export interface IConnectionBlock extends Document {
    _id: Types.ObjectId;
    blockerId: string;
    blockedId: string;
    reason: BlockReason;
    customReason?: string;
    isActive: boolean;
    blockedAt: Date;
    unblockedAt?: Date;
    unblock(): Promise<IConnectionBlock>;
}

export interface IConnectionBlockModel extends Model<IConnectionBlock> {
    isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
}

const ConnectionBlockSchema = new Schema<IConnectionBlock>(
    {
        blockerId: { type: String, required: true, trim: true },
        blockedId: { type: String, required: true, trim: true },
        reason: { type: String, enum: Object.values(BlockReason), required: true, default: BlockReason.OTHER },
        customReason: { type: String, trim: true, maxlength: 500, default: null },
        isActive: { type: Boolean, required: true, default: true },
        blockedAt: { type: Date, required: true, default: Date.now },
        unblockedAt: { type: Date, default: null },
    },
    { timestamps: true, collection: 'connection_blocks' }
);

// ✅ Ek active block per (blocker, blocked) pair — dobara block karne se duplicate na bane
ConnectionBlockSchema.index(
    { blockerId: 1, blockedId: 1 },
    { unique: true, partialFilterExpression: { isActive: true } }
);
ConnectionBlockSchema.index({ blockerId: 1, isActive: 1 });

ConnectionBlockSchema.methods.unblock = function (this: IConnectionBlock) {
    this.isActive = false;
    this.unblockedAt = new Date();
    return this.save();
};

ConnectionBlockSchema.statics.isBlocked = function (blockerId: string, blockedId: string) {
    return this.exists({ blockerId, blockedId, isActive: true }).then((r: any) => !!r);
};

// ── Cache Sync Hook on Block ──────────────────────────────────
import { ConnectionCacheRepository } from '@/shared/cache/connectionCache';
ConnectionBlockSchema.post('save', async function (doc: any) {
    try {
        if (doc?.blockerId && doc?.blockedId) {
            if (doc.isActive) {
                await ConnectionCacheRepository.handleUserBlock(String(doc.blockerId), String(doc.blockedId));
            } else {
                await ConnectionCacheRepository.handleUserUnblock(String(doc.blockerId), String(doc.blockedId));
            }
        }
    } catch {
        // fail-safe
    }
});

ConnectionBlockSchema.post(['deleteOne', 'deleteMany', 'findOneAndDelete'] as any, async function (this: any) {
    try {
        const filter = this.getFilter() || {};
        if (filter.blockerId && filter.blockedId) {
            await ConnectionCacheRepository.handleUserUnblock(String(filter.blockerId), String(filter.blockedId));
        }
    } catch {
        // fail-safe
    }
});

const ConnectionBlock = mongoose.model<IConnectionBlock, IConnectionBlockModel>(
    'ConnectionBlock',
    ConnectionBlockSchema
);

export default ConnectionBlock;