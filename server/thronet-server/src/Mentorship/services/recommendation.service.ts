// src/services/recommendation.service.ts

import CacheUtil from '@/shared/cache.util';
import { MentorWithRelations } from '@/Mentorship/interface/mentor.types';
import { logger } from '@/shared/logger.util';
import { User, UserProfile } from '@/auth/models';
import { Mentor } from '../models';
import Company from '@/company/models/Company.model';

export interface FeaturedMentorOptions {
  limit?: number;
  refresh?: boolean;
}

export interface TopRatedMentorOptions {
  limit?: number;
  minRating?: number;
  minReviews?: number;
}

export interface TrendingMentorOptions {
  limit?: number;
  daysRange?: number;
}

export class RecommendationService {
  /**
   * Get featured mentors
   */
  async getFeaturedMentors(
    options?: FeaturedMentorOptions,
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      const limit = options?.limit || 10;
      const refresh = options?.refresh || false;

      // Check cache first (unless refresh requested)
      // if (!refresh) {
      //   const cached = await CacheUtil.getCachedFeaturedMentors();
      //   if (cached && cached.length > 0) {
      //     logger.info(`Returning ${cached.length} featured mentors from cache`);
      //     return cached.slice(0, limit);
      //   }
      // }

      logger.info('Fetching featured mentors from database');

      // Fetch from database
      const mentors = await Mentor.find({
        'featured.isFeatured': true,
        'featured.featuredUntil': { $gt: new Date() },
        status: 'active',
        isDeleted: false,
      })
        .sort({ 'featured.featuredOrder': 1, 'stats.averageRating': -1 })
        .limit(limit)
        .lean()
        .exec();

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      // Cache for 30 minutes
      // await CacheUtil.cacheFeaturedMentors(enrichedMentors, 1800);

      logger.info(`Found ${enrichedMentors.length} featured mentors`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch featured mentors:', error);
      throw error;
    }
  }

  /**
   * Get top rated mentors
   */
  async getTopRatedMentors(
    options?: TopRatedMentorOptions,
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      const limit = options?.limit || 10;
      const minRating = options?.minRating || 4.5;
      const minReviews = options?.minReviews || 5;

      logger.info('Fetching top rated mentors');

      const mentors = await Mentor.find({
        status: 'active',
        isDeleted: false,
        'stats.averageRating': { $gte: minRating },
        'stats.totalReviews': { $gte: minReviews },
      })
        .sort({ 'stats.averageRating': -1, 'stats.totalReviews': -1 })
        .limit(limit)
        .lean()
        .exec();

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      logger.info(`Found ${enrichedMentors.length} top rated mentors`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch top rated mentors:', error);
      throw error;
    }
  }

  /**
   * Get trending mentors (most booked recently)
   */
  async getTrendingMentors(
    options?: TrendingMentorOptions,
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      const limit = options?.limit || 10;
      const daysRange = options?.daysRange || 30;

      logger.info(`Fetching trending mentors from last ${daysRange} days`);

      // Get mentors with recent bookings
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - daysRange);

      const mentors = await Mentor.find({
        status: 'active',
        isDeleted: false,
        'stats.totalSessions': { $gte: 5 },
        updatedAt: { $gte: dateFrom },
      })
        .sort({ 'stats.totalSessions': -1, 'stats.averageRating': -1 })
        .limit(limit)
        .lean()
        .exec();

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      logger.info(`Found ${enrichedMentors.length} trending mentors`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch trending mentors:', error);
      throw error;
    }
  }

  /**
   * Get new mentors (recently joined)
   */
  async getNewMentors(limit: number = 10, authToken?: string): Promise<MentorWithRelations[]> {
    try {
      logger.info('Fetching new mentors');

      const mentors = await Mentor.find({
        status: 'active',
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      logger.info(`Found ${enrichedMentors.length} new mentors`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch new mentors:', error);
      throw error;
    }
  }

  /**
   * Get mentors by domain
   */
  async getMentorsByDomain(
    domain: string,
    limit: number = 10,
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      logger.info(`Fetching mentors for domain: ${domain}`);

      const mentors = await Mentor.find({
        domains: domain,
        status: 'active',
        isDeleted: false,
      })
        .sort({ 'stats.averageRating': -1, 'stats.totalSessions': -1 })
        .limit(limit)
        .lean()
        .exec();

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      logger.info(`Found ${enrichedMentors.length} mentors for domain: ${domain}`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch mentors by domain:', error);
      throw error;
    }
  }

  /**
   * Get mentors by company
   */
  async getMentorsByCompany(
    companyId: string,
    limit: number = 10,
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      logger.info(`Fetching mentors for company: ${companyId}`);

      const mentors = await Mentor.find({
        companyId,
        status: 'active',
        isDeleted: false,
      })
        .sort({ 'stats.averageRating': -1, 'stats.totalSessions': -1 })
        .limit(limit)
        .lean()
        .exec();

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      logger.info(`Found ${enrichedMentors.length} mentors for company: ${companyId}`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch mentors by company:', error);
      throw error;
    }
  }

  /**
   * Get similar mentors (based on another mentor)
   */
  async getSimilarMentors(
    mentorId: string,
    limit: number = 5,
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      logger.info(`Fetching similar mentors to: ${mentorId}`);

      // Get the reference mentor
      const refMentor = await Mentor.findById(mentorId).lean().exec();

      if (!refMentor) {
        throw new Error('Reference mentor not found');
      }

      // Find mentors with similar domains and skills
      const mentors = await Mentor.find({
        _id: { $ne: mentorId }, // Exclude the reference mentor
        status: 'active',
        isDeleted: false,
        $or: [
          { domains: { $in: refMentor.domains } },
          { skills: { $in: refMentor.skills } },
          { companyId: refMentor.companyId },
        ],
      })
        .sort({ 'stats.averageRating': -1 })
        .limit(limit)
        .lean()
        .exec();

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      logger.info(`Found ${enrichedMentors.length} similar mentors`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch similar mentors:', error);
      throw error;
    }
  }

  /**
   * Get recommended mentors for user (basic recommendations without AI)
   */
  async getRecommendedForUser(
    userId: string,
    limit: number = 10,
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      logger.info(`Fetching recommended mentors for user: ${userId}`);

      // Get user profile to understand preferences
      let userProfileData: any = null;

      try {
        const profile = await UserProfile.findByUserIdCached(userId);

        if (profile) {
          userProfileData = {
            // Jo bhi fields recommendation ke liye chahiye, wo yahan daal do
            // Example suggestions based on your UserProfile schema:
            skills: [], // agar skills field nahi hai, to empty rakho ya remove kar do
            interests: [
              profile.bio,
              profile.location?.city,
              profile.location?.country,
              profile.social?.github ? 'github' : null,
              profile.social?.twitter ? 'twitter' : null,
            ].filter(Boolean),
            domains: [], // agar domains directly nahi hai to bio se keywords extract kar sakte ho later
            displayName: profile.displayName,
            username: profile.username,
          };

          logger.info('UserProfile loaded for personalized recommendations', { userId });
        } else {
          logger.info('No UserProfile found, falling back to featured mentors', { userId });
        }
      } catch (error: any) {
        logger.warn('Error fetching UserProfile, using fallback recommendations', { userId, error: error.message });
      }

      // Agar profile nahi mila ya koi useful data nahi hai → fallback to featured
      if (!userProfileData || (userProfileData.interests.length === 0 && userProfileData.skills?.length === 0)) {
        logger.info('Insufficient user data for personalization, returning featured mentors');
        return await this.getFeaturedMentors({ limit }, authToken);
      }

      // Ab userProfileData use karo query banane ke liye
      const query: any = {
        status: 'active',
        isDeleted: false,
      };

      // Bio ya location se keyword match (text search ya $in)
      if (userProfileData.interests.length > 0) {
        query.$or = [
          { skills: { $in: userProfileData.interests } },
          { domains: { $in: userProfileData.interests } },
          { bio: { $regex: userProfileData.interests.join('|'), $options: 'i' } },
        ];
      }

      const mentors = await Mentor.find(query)
        .sort({ 'stats.averageRating': -1, 'stats.totalSessions': -1 })
        .limit(limit)
        .lean()
        .exec();

      // If no mentors found with filters, return top rated mentors
      if (mentors.length === 0) {
        logger.info('No mentors found with user preferences, returning top rated');
        return await this.getTopRatedMentors({ limit }, authToken);
      }

      // Enrich with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(mentors, authToken);

      logger.info(`Found ${enrichedMentors.length} recommended mentors for user`);

      return enrichedMentors;
    } catch (error: any) {
      logger.error('Failed to fetch recommended mentors:', error);
      throw error;
    }
  }

  /**
 * Enrich mentors with user and company data
 */
  private async enrichMentorsWithRelations(
    mentors: any[],
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      logger.info(`Enriching ${mentors.length} mentors with user and company data...`);

      // Collect unique user IDs
      const userIds = [...new Set(mentors.map((m) => m.userId).filter(Boolean))];

      let userMap = new Map<string, any>();

      if (userIds.length > 0) {
        const users = await User.find({ userId: { $in: userIds } }).lean();
        userMap = new Map(users.map((u) => [u.userId, u]));
        logger.info(`Fetched ${users.length} users for enrichment`);
      }

      // Company part abhi bhi API se (kyunki company model nahi diya)
      const companyIds = [...new Set(mentors.map((m) => m.companyId).filter(Boolean))];
      let companyMap = new Map<string, any>();

      if (companyIds.length > 0) {
        try {
          const companies = await Company.getCompaniesByIds(companyIds, authToken);
          companyMap = new Map(companies.map((c: any) => [c._id, c]));
          logger.info(`Fetched ${companies.length} companies`);
        } catch (error: any) {
          logger.warn('Failed to fetch companies in bulk', { error: error.message });
        }
      }

      return mentors.map((mentor) => ({
        ...mentor,
        user: userMap.get(mentor.userId) || null,
        company: mentor.companyId ? companyMap.get(mentor.companyId) || null : undefined,
      }));
    } catch (error: any) {
      logger.error('Failed to enrich mentors with relations:', error);
      return mentors.map((mentor) => ({
        ...mentor,
        user: null,
        company: null,
      }));
    }
  }

  /**
   * Invalidate recommendation caches
   */
  async invalidateCaches(): Promise<void> {
    try {
      logger.info('Invalidating recommendation caches');
      await CacheUtil.clearByPattern('featured:*');
      await CacheUtil.clearByPattern('trending:*');
      await CacheUtil.clearByPattern('recommended:*');
      logger.info('Recommendation caches invalidated');
    } catch (error: any) {
      logger.error('Failed to invalidate caches:', error);
    }
  }
}

export default new RecommendationService();