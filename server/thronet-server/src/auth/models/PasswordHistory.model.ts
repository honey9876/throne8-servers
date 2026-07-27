import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

interface IPasswordHistory extends Document {
    historyId: string;
    userId: string;
    passwordHash: string;
    changedAt: Date;
    changedBy: 'user' | 'admin' | 'system' | 'reset';
    metadata: {
        ipAddress?: string;
        userAgent?: string;
        reason?: string;
    };
    isChangedWithinDays(days: number): boolean;
}

interface IPasswordHistoryModel extends Model<IPasswordHistory> {
    isPasswordRecentlyUsed(userId: string, newPassword: string): Promise<boolean>;
    addPasswordToHistory(
        userId: string,
        passwordHash: string,
        options?: {
            changedBy?: string;
            ipAddress?: string;
            userAgent?: string;
            reason?: string;
        }
    ): Promise<IPasswordHistory>;
    cleanupOldPasswords(userId: string): Promise<number>;
    getPasswordHistory(userId: string, limit?: number): Promise<IPasswordHistory[]>;
    getPasswordChangeCount(userId: string): Promise<number>;
    deleteUserHistory(userId: string): Promise<number>;
    getPasswordAge(userId: string): Promise<number | null>;
}

const PasswordHistorySchema = new Schema<IPasswordHistory, IPasswordHistoryModel>(
    {
        historyId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
        },
        userId: { type: String, required: true },
        passwordHash: { type: String, required: true, select: false },
        changedAt: { type: Date, default: Date.now },
        changedBy: {
            type: String,
            enum: ['user', 'admin', 'system', 'reset'],
            default: 'user',
        },
        metadata: {
            ipAddress: String,
            userAgent: String,
            reason: String,
        },
    },
    {
        timestamps: true,
        collection: 'password_history',
    }
);

PasswordHistorySchema.index({ userId: 1, changedAt: -1 });

PasswordHistorySchema.statics.isPasswordRecentlyUsed = async function (
    userId: string,
    newPassword: string
): Promise<boolean> {
    try {
        const recentPasswords = await this.find({ userId })
            .sort({ changedAt: -1 })
            .limit(5)
            .select('+passwordHash')
            .lean()
            .exec();
        if (recentPasswords.length === 0) return false;
        for (const record of recentPasswords) {
            const isMatch = await bcrypt.compare(newPassword, record.passwordHash);
            if (isMatch) return true;
        }
        return false;
    } catch (error: unknown) {
        LoggerUtil.error('Password history check failed', {
            error: (error as Error).message,
            userId,
        });
        return false;
    }
};

PasswordHistorySchema.statics.addPasswordToHistory = async function (
    userId: string,
    passwordHash: string,
    options: any = {}
): Promise<IPasswordHistory> {
    const record = await this.create({
        userId,
        passwordHash,
        changedAt: new Date(),
        changedBy: options.changedBy || 'user',
        metadata: {
            ipAddress: options.ipAddress,
            userAgent: options.userAgent,
            reason: options.reason,
        },
    });
    await this.cleanupOldPasswords(userId);
    return record;
};

PasswordHistorySchema.statics.cleanupOldPasswords = async function (userId: string): Promise<number> {
    try {
        const all = await this.find({ userId })
            .sort({ changedAt: -1 })
            .select('_id')
            .lean()
            .exec();
        if (all.length <= 5) return 0;
        const toDelete = all.slice(5).map((p: any) => p._id);
        const result = await this.deleteMany({ _id: { $in: toDelete } });
        return result.deletedCount;
    } catch {
        return 0;
    }
};

PasswordHistorySchema.statics.getPasswordHistory = async function (userId: string, limit = 5) {
    return this.find({ userId })
        .sort({ changedAt: -1 })
        .limit(limit)
        .select('historyId changedAt changedBy metadata')
        .lean()
        .exec();
};

PasswordHistorySchema.statics.getPasswordChangeCount = async function (userId: string): Promise<number> {
    return this.countDocuments({ userId });
};

PasswordHistorySchema.statics.deleteUserHistory = async function (userId: string): Promise<number> {
    const result = await this.deleteMany({ userId });
    return result.deletedCount;
};

PasswordHistorySchema.statics.getPasswordAge = async function (userId: string): Promise<number | null> {
    const latest = await this.findOne({ userId })
        .sort({ changedAt: -1 })
        .select('changedAt')
        .lean()
        .exec();
    if (!latest) return null;
    return Math.floor(
        (Date.now() - new Date((latest as any).changedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
};

PasswordHistorySchema.methods.isChangedWithinDays = function (days: number): boolean {
    const ageInDays = Math.floor(
        (Date.now() - new Date(this.changedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return ageInDays <= days;
};

const PasswordHistory = mongoose.model<IPasswordHistory, IPasswordHistoryModel>(
    'PasswordHistory',
    PasswordHistorySchema
);
export default PasswordHistory;