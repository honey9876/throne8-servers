import { v4 as uuidv4 } from 'uuid';
import Follow, { ICompanyFollow } from '../models/companyFollow';
import { ErrorResponse } from '@/shared/response.util';
import { logger, LogCategory } from '@/shared/logger.util';
import redisService from '@/services/redis.service';
import environmentConfig from '@/config/environment/environment';

class companyfollowService {

    static async followCompany(userId: string, companyId: string): Promise<void> {
        if (userId === companyId) {
            throw new ErrorResponse('Invalid operation', 400);
        }

        const alreadyFollowing = await Follow.isFollowing(userId, companyId);
        if (alreadyFollowing) {
            throw new ErrorResponse('Already following this company', 409);
        }

        await Follow.create({
            followId: uuidv4(),
            userId,
            companyId,
            status: 'active',
            region: 'global',
        });

        await companyfollowService.invalidateFollowCache(userId, companyId);

        logger.info('User followed company', {
            category: LogCategory.CONNECTION,
            data: { userId, companyId },
            responseTimeMs: 0,
        });
    }

    static async unfollowCompany(userId: string, companyId: string): Promise<void> {
        const follow = await Follow.findOne({ userId, companyId, status: 'active' });
        if (!follow) {
            throw new ErrorResponse('Not following this company', 404);
        }

        // Soft delete — keeps history
        follow.status = 'unfollowed';
        follow.cacheVersion += 1;
        await follow.save();

        await companyfollowService.invalidateFollowCache(userId, companyId);

        logger.info('User unfollowed company', {
            category: LogCategory.CONNECTION,
            data: { userId, companyId },
            responseTimeMs: 0,
        });
    }

    static async getFollowerCount(companyId: string): Promise<number> {
        const cacheKey = `follow:count:${companyId}`;
        try {
            const cached = await redisService.get(cacheKey);
            if (cached) return parseInt(cached);
        } catch (_) { }

        const count = await Follow.getFollowerCount(companyId);

        try {
            await redisService.set(cacheKey, String(count), { ttl: environmentConfig.CONNECTION_LIST_CACHE_TTL });
        } catch (_) { }

        return count;
    }

    static async getFollowers(companyId: string, page: number, limit: number) {
        return Follow.getFollowerIds(companyId, page, limit);
    }

    static async getFollowedCompanies(userId: string, page: number, limit: number) {
        return Follow.getFollowedCompanies(userId, page, limit);
    }

    static async isFollowing(userId: string, companyId: string): Promise<boolean> {
        return Follow.isFollowing(userId, companyId);
    }

    private static async invalidateFollowCache(userId: string, companyId: string): Promise<void> {
        try {
            await Promise.all([
                redisService.delete(`follow:count:${companyId}`),
                redisService.delete(`follow:companies:${userId}`),
            ]);
        } catch (_) { }
    }
}

export default companyfollowService;