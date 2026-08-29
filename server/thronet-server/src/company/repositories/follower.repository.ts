import mongoose from 'mongoose';
import { Follower, Company, Employee } from '../models';
import { IFollowerDocument } from '../models/follower.model';

class FollowerRepository {

    async findByFollowerAndCompany(
        followerObjectId: string,
        companyObjectId: string
    ): Promise<IFollowerDocument | null> {
        return Follower.findOne({
            follower: followerObjectId,
            following: companyObjectId,
        }).exec() as unknown as IFollowerDocument;
    }

    async findActiveByFollowerAndCompany(
        followerObjectId: string,
        companyObjectId: string
    ): Promise<IFollowerDocument | null> {
        return Follower.findOne({
            follower: followerObjectId,
            following: companyObjectId,
            isActive: true,
        }).exec() as unknown as IFollowerDocument;
    }

    async create(data: {
        follower: string;
        following: string;
    }): Promise<IFollowerDocument> {
        return Follower.create({
            follower: data.follower,
            following: data.following,
            followedAt: new Date(),
            isActive: true,
            notificationPreferences: {
                posts: true,
                events: true,
                jobs: true,
                updates: true,
            },
        }) as unknown as IFollowerDocument;
    }

    async getFollowers(
        companyObjectId: string,
        skip: number,
        limit: number
    ): Promise<[IFollowerDocument[], number]> {
        return Promise.all([
            Follower.getFollowers(companyObjectId, { skip, limit }),
            Follower.getFollowerCount(companyObjectId),
        ]);
    }

    async getFollowing(
        employeeObjectId: string,
        skip: number,
        limit: number
    ): Promise<[IFollowerDocument[], number]> {
        return Promise.all([
            Follower.getFollowing(employeeObjectId, { skip, limit }),
            Follower.getFollowingCount(employeeObjectId),
        ]);
    }

    async getFollowerStats(companyObjectId: string) {
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);

        return Promise.all([
            Follower.countDocuments({ following: companyObjectId, isActive: true }),
            Follower.countDocuments({ following: companyObjectId, isActive: true, followedAt: { $gte: today } }),
            Follower.countDocuments({ following: companyObjectId, isActive: true, followedAt: { $gte: weekAgo } }),
            Follower.countDocuments({ following: companyObjectId, isActive: true, followedAt: { $gte: monthAgo } }),
            Follower.countDocuments({ following: companyObjectId, isActive: false, updatedAt: { $gte: monthAgo } }),
        ]);
    }

    async getMutualFollowers(
        employeeObjectId: string,
        companyObjectId: string
    ): Promise<IFollowerDocument[]> {
        return Follower.getMutualFollowers(employeeObjectId, companyObjectId);
    }

    async getRecentFollowers(
        companyObjectId: string,
        days: number
    ): Promise<IFollowerDocument[]> {
        return Follower.getRecentFollowers(companyObjectId, days);
    }

    async getFollowingSuggestions(
        excludeIds: mongoose.Types.ObjectId[],
        industry?: string,
        limit = 20
    ): Promise<any[]> {
        const query: any = {
            _id: { $nin: excludeIds },
            status: 'Active',
        };
        if (industry) query.industry = industry;

        return Company.find(query)
            .sort({ 'stats.followersCount': -1, createdAt: -1 })
            .limit(limit)
            .select('companyName companySlug media industry descriptions stats')
            .lean();
    }

    async getUserFollowingIds(employeeObjectId: string): Promise<mongoose.Types.ObjectId[]> {
        const following = await Follower.find({
            follower: employeeObjectId,
            isActive: true,
        }).select('following').lean();

        return following.map((f: any) =>
            typeof f.following === 'string'
                ? new mongoose.Types.ObjectId(f.following)
                : f.following
        );
    }
}

export default new FollowerRepository();