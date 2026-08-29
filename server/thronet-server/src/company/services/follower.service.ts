import { Company, Employee } from '../models';
import CompanyActivity from '../models/CompanyActivity.model';
import logger from '@/shared/logger.util';
import { PaginationMeta } from '../interfaces';
import { Types } from 'mongoose';
import { IFollowerDocument } from '@/company/models/follower.model';
import CacheUtil from '@/shared/cache.util';
import followerRepository from '../repositories/follower.repository';
import companyRepository from '../repositories/company.repository';
import employeeRepository from '../repositories/employee.repository';

interface FollowResult {
  success: boolean;
  message: string;
  follower?: IFollowerDocument;
  alreadyFollowing?: boolean;
}

interface UnfollowResult {
  success: boolean;
  message: string;
  wasFollowing?: boolean;
}

interface FollowerListResult {
  followers: IFollowerDocument[];
  total: number;
  meta: PaginationMeta;
}

interface FollowingListResult {
  following: IFollowerDocument[];
  total: number;
  meta: PaginationMeta;
}

interface FollowerStats {
  totalFollowers: number;
  followersGainedToday: number;
  followersGainedThisWeek: number;
  followersGainedThisMonth: number;
  followersLostThisMonth: number;
  activeFollowers: number;
  growthRate: number;
}

interface FollowSuggestion {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  industry?: string;
  tagline?: string;
  stats: { followersCount: number; postsCount: number; employeesCount: number };
  reason: string;
  score: number;
}

class FollowerService {
  private CACHE_TTL = { SHORT: 300, MEDIUM: 1800, LONG: 3600 };

  // =====================================================
  // FOLLOW COMPANY
  // employeeUUID + companyUUID → resolve to ObjectIds
  // =====================================================
  async followCompany(
    employeeUUID: string,
    companyUUID: string
  ): Promise<FollowResult> {
    try {
      // ✅ UUID → ObjectId resolve karo
      const [company, employee] = await Promise.all([
        companyRepository.findByUUID(companyUUID),
        employeeRepository.findByUUID(employeeUUID),
      ]);

      if (!company) return { success: false, message: 'Company not found' };
      if (!employee) return { success: false, message: 'Employee not found' };

      const companyObjectId = company._id.toString();
      const employeeObjectId = employee._id.toString();

      const existing = await followerRepository.findByFollowerAndCompany(
        employeeObjectId,
        companyObjectId
      );

      // Already following — reactivate
      if (existing && existing.isActive) {
        return { success: false, message: 'Already following this company', alreadyFollowing: true };
      }

      if (existing && !existing.isActive) {
        existing.isActive = true;
        (existing as any).followedAt = new Date();
        await (existing as any).save();

        await (company as any).incrementStat('followersCount');
        await this.clearFollowerCaches(employeeObjectId, companyObjectId);

        return { success: true, message: 'Successfully followed company', follower: existing };
      }

      // New follow
      const follower = await followerRepository.create({
        follower: employeeObjectId,
        following: companyObjectId,
      });

      await (company as any).incrementStat('followersCount');
      await this.clearFollowerCaches(employeeObjectId, companyObjectId);

      // Save Activity record in DB for real persistent feed
      try {
        const followerName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'New Follower';
        const targetId = `follow-${companyUUID}-${employeeUUID}`;
        const initials = followerName.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2) || 'FL';
        await CompanyActivity.findOneAndUpdate(
          { targetId },
          {
            activityId: `act-follow-${Date.now()}`,
            companyId: companyUUID,
            type: 'follow',
            user: followerName,
            avatar: initials,
            color: 'bg-purple-500',
            action: 'started following your company',
            read: false,
            targetId,
            createdAt: new Date(),
          },
          { upsert: true, new: true }
        );
      } catch (actErr: any) {
        logger.warn('Failed to save follow activity:', actErr?.message || actErr);
      }

      logger.info(`Followed: employee ${employeeUUID} → company ${companyUUID}`);
      return { success: true, message: 'Successfully followed company', follower };
    } catch (error: any) {
      logger.error('Error following company:', error);
      throw error;
    }
  }

  // =====================================================
  // UNFOLLOW COMPANY
  // employeeUUID + companyObjectId (middleware se)
  // =====================================================
  async unfollowCompany(
    employeeUUID: string,
    companyObjectId: string  // resolveCompanyUUID middleware se
  ): Promise<UnfollowResult> {
    try {
      // Employee UUID → ObjectId resolve karo
      const employee = await employeeRepository.findByUUID(employeeUUID);
      if (!employee) return { success: false, message: 'Employee not found' };

      const employeeObjectId = employee._id.toString();

      const follower = await followerRepository.findActiveByFollowerAndCompany(
        employeeObjectId,
        companyObjectId
      );

      if (!follower) {
        return { success: false, message: 'Not following this company', wasFollowing: false };
      }

      (follower as any).isActive = false;
      await (follower as any).save();

      const company = await Company.findById(companyObjectId);
      if (company) {
        await (company as any).decrementStat('followersCount');
        try {
          await CompanyActivity.deleteOne({
            $or: [
              { targetId: `follow-${(company as any).companyId}-${employeeUUID}` },
              { targetId: `follow-${companyObjectId}-${employeeObjectId}` },
            ]
          });
        } catch (actErr: any) {
          logger.warn('Failed to delete follow activity:', actErr?.message || actErr);
        }
      }

      await this.clearFollowerCaches(employeeObjectId, companyObjectId);

      logger.info(`Unfollowed: employee ${employeeUUID} → company ObjectId ${companyObjectId}`);
      return { success: true, message: 'Successfully unfollowed company', wasFollowing: true };
    } catch (error: any) {
      logger.error('Error unfollowing company:', error);
      throw error;
    }
  }

  // =====================================================
  // GET COMPANY FOLLOWERS (companyObjectId middleware se)
  // =====================================================
  async getCompanyFollowers(
    companyObjectId: string,
    page = 1,
    pageSize = 20
  ): Promise<FollowerListResult> {
    try {
      const cacheKey = `followers:company:${companyObjectId}:${page}:${pageSize}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const skip = (page - 1) * pageSize;
      const [followers, total] = await followerRepository.getFollowers(
        companyObjectId, skip, pageSize
      );

      const totalPages = Math.ceil(total / pageSize);
      const result: FollowerListResult = {
        followers,
        total,
        meta: { page, pageSize, total, totalPages, hasMore: page < totalPages },
      };

      await CacheUtil.set(cacheKey, result, this.CACHE_TTL.MEDIUM);
      return result;
    } catch (error: any) {
      logger.error('Error getting company followers:', error);
      throw error;
    }
  }

  // =====================================================
  // GET USER FOLLOWING (employeeObjectId middleware se)
  // =====================================================
  async getUserFollowing(
    employeeObjectId: string,
    page = 1,
    pageSize = 20
  ): Promise<FollowingListResult> {
    try {
      const cacheKey = `following:user:${employeeObjectId}:${page}:${pageSize}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const skip = (page - 1) * pageSize;
      const [following, total] = await followerRepository.getFollowing(
        employeeObjectId, skip, pageSize
      );

      const totalPages = Math.ceil(total / pageSize);
      const result: FollowingListResult = {
        following,
        total,
        meta: { page, pageSize, total, totalPages, hasMore: page < totalPages },
      };

      await CacheUtil.set(cacheKey, result, this.CACHE_TTL.MEDIUM);
      return result;
    } catch (error: any) {
      logger.error('Error getting user following:', error);
      throw error;
    }
  }

  // =====================================================
  // CHECK FOLLOWING STATUS
  // employeeUUID + companyObjectId (middleware se)
  // =====================================================
  async checkFollowingStatus(
    employeeUUID: string,
    companyObjectId: string
  ): Promise<{ isFollowing: boolean; follower?: IFollowerDocument }> {
    try {
      const employee = await employeeRepository.findByUUID(employeeUUID);
      if (!employee) return { isFollowing: false };

      const employeeObjectId = employee._id.toString();
      const cacheKey = `following:status:${employeeObjectId}:${companyObjectId}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const follower = await followerRepository.findActiveByFollowerAndCompany(
        employeeObjectId,
        companyObjectId
      );

      const result = { isFollowing: !!follower, follower: follower || undefined };
      await CacheUtil.set(cacheKey, result, this.CACHE_TTL.SHORT);
      return result;
    } catch (error: any) {
      logger.error('Error checking following status:', error);
      throw error;
    }
  }

  // =====================================================
  // GET FOLLOWER STATS (companyObjectId middleware se)
  // =====================================================
  async getFollowerStats(companyObjectId: string): Promise<FollowerStats> {
    try {
      const cacheKey = `stats:followers:${companyObjectId}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const [
        totalFollowers,
        followersGainedToday,
        followersGainedThisWeek,
        followersGainedThisMonth,
        followersLostThisMonth,
      ] = await followerRepository.getFollowerStats(companyObjectId);

      const growthRate = totalFollowers > 0
        ? ((followersGainedThisMonth - followersLostThisMonth) / totalFollowers) * 100
        : 0;

      const stats: FollowerStats = {
        totalFollowers,
        followersGainedToday,
        followersGainedThisWeek,
        followersGainedThisMonth,
        followersLostThisMonth,
        activeFollowers: totalFollowers,
        growthRate: Math.round(growthRate * 100) / 100,
      };

      await CacheUtil.set(cacheKey, stats, this.CACHE_TTL.MEDIUM);
      return stats;
    } catch (error: any) {
      logger.error('Error getting follower stats:', error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE NOTIFICATION PREFERENCES
  // employeeUUID + companyUUID (body se)
  // =====================================================
  async updateNotificationPreferences(
    employeeUUID: string,
    companyUUID: string,
    preferences: Partial<IFollowerDocument['notificationPreferences']>
  ): Promise<IFollowerDocument> {
    try {
      const [company, employee] = await Promise.all([
        companyRepository.findByUUID(companyUUID),
        employeeRepository.findByUUID(employeeUUID),
      ]);

      if (!company) throw new Error('Company not found');
      if (!employee) throw new Error('Employee not found');

      const follower = await followerRepository.findActiveByFollowerAndCompany(
        employee._id.toString(),
        company._id.toString()
      );

      if (!follower) throw new Error('Not following this company');

      await (follower as any).updatePreferences(preferences);

      await CacheUtil.del(`following:status:${employee._id}:${company._id}`);
      logger.info(`Preferences updated: ${employeeUUID} → ${companyUUID}`);

      return follower;
    } catch (error: any) {
      logger.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  // =====================================================
  // GET FOLLOW SUGGESTIONS
  // employeeUUID (auth user se)
  // =====================================================
  async getFollowSuggestions(
    employeeUUID: string,
    limit = 10
  ): Promise<FollowSuggestion[]> {
    try {
      const employee = await employeeRepository.findByUUID(employeeUUID);
      if (!employee) return [];

      const employeeObjectId = employee._id.toString();
      const cacheKey = `suggestions:follow:${employeeObjectId}:${limit}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const followingIds = await followerRepository.getUserFollowingIds(
        new Types.ObjectId(employeeObjectId) as any
      );

      // Get employee's company industry for better suggestions
      let industry: string | undefined;
      if ((employee as any).company) {
        const empCompany = await Company.findById((employee as any).company);
        industry = empCompany?.industry;
      }

      const suggestions = await followerRepository.getFollowingSuggestions(
        followingIds, industry, limit * 2
      );

      const scoredSuggestions: FollowSuggestion[] = suggestions.map((company: any) => {
        let score = 0;
        let reason = 'Popular company';

        if (company.stats?.followersCount > 1000) { score += 50; reason = 'Highly followed company'; }
        else if (company.stats?.followersCount > 100) { score += 30; }
        if (company.stats?.postsCount > 50) { score += 20; reason = 'Active company'; }
        if (industry && company.industry === industry) { score += 30; reason = 'Similar industry'; }

        return {
          _id: company._id.toString(),
          name: company.companyName || '',
          slug: company.companySlug || '',
          logo: company.media?.logo,
          industry: company.industry,
          tagline: company.descriptions?.tagline,
          stats: company.stats || { followersCount: 0, postsCount: 0, employeesCount: 0 },
          reason,
          score,
        };
      });

      const topSuggestions = scoredSuggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      await CacheUtil.set(cacheKey, topSuggestions, this.CACHE_TTL.LONG);
      return topSuggestions;
    } catch (error: any) {
      logger.error('Error getting follow suggestions:', error);
      throw error;
    }
  }

  // =====================================================
  // GET MUTUAL FOLLOWERS (employeeUUID + companyObjectId)
  // =====================================================
  async getMutualFollowers(
    employeeUUID: string,
    companyObjectId: string
  ): Promise<IFollowerDocument[]> {
    try {
      const employee = await employeeRepository.findByUUID(employeeUUID);
      if (!employee) return [];

      return followerRepository.getMutualFollowers(
        employee._id.toString(),
        companyObjectId
      );
    } catch (error: any) {
      logger.error('Error getting mutual followers:', error);
      throw error;
    }
  }

  // =====================================================
  // GET RECENT FOLLOWERS (companyObjectId middleware se)
  // =====================================================
  async getRecentFollowers(
    companyObjectId: string,
    days = 7
  ): Promise<IFollowerDocument[]> {
    try {
      return followerRepository.getRecentFollowers(companyObjectId, days);
    } catch (error: any) {
      logger.error('Error getting recent followers:', error);
      throw error;
    }
  }

  // =====================================================
  // HELPER: CLEAR CACHES
  // =====================================================
  private async clearFollowerCaches(
    employeeObjectId: string,
    companyObjectId: string
  ): Promise<void> {
    try {
      await Promise.all([
        CacheUtil.clearByPattern(`followers:company:${companyObjectId}:*`),
        CacheUtil.clearByPattern(`following:user:${employeeObjectId}:*`),
        CacheUtil.del(`following:status:${employeeObjectId}:${companyObjectId}`),
        CacheUtil.del(`stats:followers:${companyObjectId}`),
        CacheUtil.clearByPattern(`suggestions:follow:${employeeObjectId}:*`),
      ]);
    } catch (error: any) {
      logger.warn('Error clearing follower caches:', error);
    }
  }
}

export default new FollowerService();