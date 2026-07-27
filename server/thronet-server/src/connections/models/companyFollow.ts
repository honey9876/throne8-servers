// src/connections/models/Follow.ts

import { Schema, model, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IFollow } from '../types/follow.type';

export interface ICompanyFollow extends Document {
    followId: string;
    userId: string;       // who is following
    companyId: string;    // who is being followed
    followedAt: Date;
    status: 'active' | 'unfollowed';
    region: string;
    cacheVersion: number;
}

interface ICompanyFollowModel extends Model<ICompanyFollow> {
    isFollowing(userId: string, companyId: string): Promise<boolean>;
    getFollowerCount(companyId: string): Promise<number>;
    getFollowerIds(companyId: string, page: number, limit: number): Promise<{ data: ICompanyFollow[]; total: number }>;
    getFollowedCompanies(userId: string, page: number, limit: number): Promise<{ data: ICompanyFollow[]; total: number }>;
}

const FollowSchema = new Schema<ICompanyFollow, ICompanyFollowModel>(
    {
        followId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
        },
        userId: {
            type: String,
            required: true,
        },
        companyId: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'unfollowed'],
            default: 'active',
        },
        region: {
            type: String,
            default: 'global',
        },
        cacheVersion: {
            type: Number,
            default: 1,
        },
    },
    {
        timestamps: true,
        collection: 'companyfollows',
    }
);

// Prevent duplicate follows
FollowSchema.index(
    { userId: 1, companyId: 1 },
    { unique: true, partialFilterExpression: { status: 'active' }, name: 'unique_active_follow' }
);

FollowSchema.index({ companyId: 1, status: 1, followedAt: -1 }, { name: 'company_followers' });
FollowSchema.index({ userId: 1, status: 1, followedAt: -1 }, { name: 'user_following' });

FollowSchema.statics.isFollowing = async function (userId: string, companyId: string): Promise<boolean> {
    const count = await this.countDocuments({ userId, companyId, status: 'active' });
    return count > 0;
};

FollowSchema.statics.getFollowerCount = async function (companyId: string): Promise<number> {
    return this.countDocuments({ companyId, status: 'active' });
};

FollowSchema.statics.getFollowerIds = async function (companyId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        this.find({ companyId, status: 'active' }).sort({ followedAt: -1 }).skip(skip).limit(limit).lean(),
        this.countDocuments({ companyId, status: 'active' }),
    ]);
    return { data, total };
};

FollowSchema.statics.getFollowedCompanies = async function (userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
        this.find({ userId, status: 'active' }).sort({ followedAt: -1 }).skip(skip).limit(limit).lean(),
        this.countDocuments({ userId, status: 'active' }),
    ]);
    return { data, total };
};

const CompanyFollow = model<ICompanyFollow, ICompanyFollowModel>('CompanyFollow', FollowSchema);
export default CompanyFollow;