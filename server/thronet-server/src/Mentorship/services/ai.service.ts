// src/services/ai.service.ts

import { MentorWithRelations } from '@/Mentorship/interface/mentor.types';
import { logger } from '@/shared/logger.util';
import MatchingAlgorithm, { MatchResult } from '@/Mentorship/utils/matchingAlgorithm';
import mongoose from 'mongoose';
import CacheUtil from '@/shared/cache.util';
// import {  User, Company } from '@/models'; // ✅ User model added
import { MatchScore, Mentor, } from '../models';
import { User } from '@/auth/models';
import { Company } from '@/company/models';
import { Domain } from '@/shared/constants/domains';
// import { Company } from '@/models';
import { IUser } from '@/auth/models/User.model';

// ✅ UserProfile types (simplified based on your User model)
export interface UserProfile {
  userId: string;
  goals: Array<{ goal: string; priority: 'high' | 'medium' | 'low' }>;
  skills: Array<{ name: string; level: 'beginner' | 'intermediate' | 'advanced' | 'expert' }>;
  preferences: {
    preferredDomains: Domain[];
    budgetRange?: { min: number; max: number };
    preferredSessionTypes: string[];
  };
  careerHistory: {
    currentRole?: string;
    currentCompany?: string;
    yearsOfExperience: number;
    careerStage: 'student' | 'entry-level' | 'mid-level' | 'senior' | 'executive';
  };
  interests: string[];
}

export interface AIMatchOptions {
  limit?: number;
  minScore?: number;
  refresh?: boolean;
  domains?: string[];
  maxPrice?: number;
}

export interface AIMatchResponse {
  matches: Array<{
    mentor: MentorWithRelations;
    matchScore: MatchResult;
  }>;
  userProfile: Partial<UserProfile>;
  totalMatches: number;
  timestamp: Date;
}

export class AIService {
  /**
   * Get AI-powered mentor matches for a user
   */
  async getMatchedMentors(
    userId: string,
    options?: AIMatchOptions,
    authToken?: string
  ): Promise<AIMatchResponse> {
    try {
      const limit = options?.limit || 10;
      const minScore = options?.minScore || 40;
      const refresh = options?.refresh || false;

      console.log('🎯 Getting AI matches for user:', userId);
      logger.info(`Getting AI matches for user: ${userId}`);

      // Check cache first (unless refresh requested)
      if (!refresh) {
        const cached = await CacheUtil.get(userId);
        if (cached) {
          logger.info(`Returning ${cached.length} cached matches for user: ${userId}`);
          return {
            matches: cached.slice(0, limit),
            userProfile: cached[0]?.userProfile || {},
            totalMatches: cached.length,
            timestamp: new Date(),
          };
        }
      }

      // ✅ Fetch user profile from User model
      const userProfile = await this.getUserProfile(userId, authToken);
      console.log('👤 User profile loaded:', userProfile.userId);

      // Get active mentors
      const mentors = await this.getEligibleMentors(options);
      logger.info(`Found ${mentors.length} eligible mentors for matching`);

      // Calculate matches
      const matches = MatchingAlgorithm.calculateBatchMatches(userProfile, mentors, {
        budgetMax: options?.maxPrice,
      });

      // Filter by minimum score
      const filteredMatches = MatchingAlgorithm.filterByMinScore(matches, minScore);
      logger.info(`${filteredMatches.length} mentors meet minimum score of ${minScore}`);

      // Get top matches
      const topMatches = MatchingAlgorithm.getTopMatches(filteredMatches, limit);

      // Save match scores to database
      await this.saveMatchScores(userId, topMatches);

      // Enrich with mentor details
      const enrichedMatches = await this.enrichMatchesWithMentorData(
        topMatches,
        mentors,
        authToken
      );

      // Cache results for 1 hour
      await CacheUtil.set(userId, enrichedMatches, 3600);

      logger.info(`Returning ${enrichedMatches.length} AI matches for user: ${userId}`);

      return {
        matches: enrichedMatches,
        userProfile,
        totalMatches: filteredMatches.length,
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('❌ Failed to get AI matches:', error.message);
      logger.error(`Failed to get AI matches: ${error}`);
      throw error;
    }
  }

  /**
   * Get match explanation for a specific mentor
   */
  async getMatchExplanation(
    userId: string,
    mentorId: string,
    authToken?: string
  ): Promise<MatchResult> {
    try {
      logger.info(`Getting match explanation for user: ${userId}, mentor: ${mentorId}`);

      // Check if match score exists in database
      const existingMatch = await MatchScore.findOne({
        userId,
        mentorId: mentorId,
      }).exec();

      if (existingMatch) {
        const isExpired = existingMatch.expiresAt
          ? new Date(existingMatch.expiresAt) < new Date()
          : false;

        if (!isExpired) {
          logger.info('Returning existing match score from database');
          return {
            mentorId: existingMatch.mentorId.toString(),
            overallScore: existingMatch.overallScore,
            factors: existingMatch.factors,
            explanation: existingMatch.explanation,
            recommendations: existingMatch.recommendations,
            matchQuality: this.getMatchQuality(existingMatch.overallScore),
          };
        }
      }

      // Calculate fresh match
      const userProfile = await this.getUserProfile(userId, authToken);
      const mentor = await Mentor.findById(mentorId).lean().exec();

      if (!mentor) {
        throw new Error('Mentor not found');
      }

      const matchResult = MatchingAlgorithm.calculateMatch(userProfile, mentor);

      // Save to database
      await this.saveMatchScore(userId, matchResult);

      return matchResult;
    } catch (error: any) {
      logger.error(`Failed to get match explanation: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh matches for a user (invalidate cache and recalculate)
   */
  async refreshMatches(userId: string): Promise<void> {
    try {
      logger.info(`Refreshing matches for user: ${userId}`);

      // Invalidate cache
      await CacheUtil.get(userId);

      // Delete old match scores from database
      await MatchScore.deleteMany({ userId }).exec();

      logger.info(`Matches refreshed for user: ${userId}`);
    } catch (error: any) {
      logger.error(`Failed to refresh matches: ${error}`);
      throw error;
    }
  }

  /**
   * ✅ Get user profile from User model (NO API calls, NO mock data)
   */
  private async getUserProfile(userId: string, authToken?: string): Promise<UserProfile> {
    try {
      console.log('🔍 Fetching user from database:', userId);

      // ✅ Direct database query
      const user = await User.findOne({
        userId,
        'flags.isDeleted': false,
      }).lean();

      if (!user) {
        console.error('❌ User not found:', userId);
        throw new Error('USER_NOT_FOUND');
      }

      console.log('✅ User found:', {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        onboardingType: user.onboarding?.userType,
      });

      // ✅ Convert User model to UserProfile
      return this.convertUserModelToProfile(user);
    } catch (error: any) {
      console.error('❌ Failed to fetch user profile:', error.message);
      logger.error(`Failed to fetch user profile: ${error}`);
      throw error;
    }
  }

  /**
   * ✅ Convert User model to UserProfile for matching
   */
  private convertUserModelToProfile(user: IUser | any): UserProfile {
    const onboarding = user.onboarding;
    const userType = onboarding?.userType || 'fresher';

    // ✅ Determine career details based on onboarding type
    let currentRole: string | undefined;
    let currentCompany: string | undefined;
    let yearsOfExperience = 0;
    let careerStage: 'student' | 'entry-level' | 'mid-level' | 'senior' | 'executive' = 'entry-level';

    if (userType === 'working' && onboarding?.workingProfile) {
      currentRole = onboarding.workingProfile.jobTitle;
      currentCompany = onboarding.workingProfile.companyName;
      
      // Calculate years of experience
      const startDate = new Date(onboarding.workingProfile.startDate);
      const endDate = onboarding.workingProfile.endDate
        ? new Date(onboarding.workingProfile.endDate)
        : new Date();
      yearsOfExperience = Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      );

      careerStage = this.determineCareerStage(yearsOfExperience);
    } else if (userType === 'student' && onboarding?.studentProfile) {
      currentRole = 'Student';
      currentCompany = onboarding.studentProfile.collegeName;
      careerStage = 'student';
    } else if (userType === 'fresher' && onboarding?.fresherProfile) {
      currentRole = onboarding.fresherProfile.preferredRole;
      careerStage = 'entry-level';
    }

    console.log('📊 Converted profile:', {
      userId: user.userId,
      userType,
      currentRole,
      yearsOfExperience,
      careerStage,
    });

    return {
      userId: user.userId,
      goals: [
        {
          goal: currentRole ? `Advance in ${currentRole}` : 'Career Growth',
          priority: 'high',
        },
      ],
      skills: [
        // Add skills from student/fresher profile if available
        ...(onboarding?.studentProfile?.fieldOfStudy
          ? [{ name: onboarding.studentProfile.fieldOfStudy, level: 'intermediate' as const }]
          : []),
        ...(onboarding?.fresherProfile?.preferredRole
          ? [{ name: onboarding.fresherProfile.preferredRole, level: 'beginner' as const }]
          : []),
      ],
      preferences: {
        preferredDomains: [Domain.CAREER_GUIDANCE], // Default domain
        preferredSessionTypes: ['quick_call', 'career_planning'],
      },
      careerHistory: {
        currentRole,
        currentCompany,
        yearsOfExperience,
        careerStage,
      },
      interests: [currentRole || 'Career Development'].filter(Boolean),
    };
  }

  /**
   * Determine career stage based on years of experience
   */
  private determineCareerStage(
    years: number
  ): 'student' | 'entry-level' | 'mid-level' | 'senior' | 'executive' {
    if (years === 0) return 'entry-level';
    if (years <= 2) return 'entry-level';
    if (years <= 5) return 'mid-level';
    if (years <= 10) return 'senior';
    return 'executive';
  }

  /**
   * Get eligible mentors for matching
   */
  private async getEligibleMentors(options?: AIMatchOptions): Promise<any[]> {
    const query: any = {
      status: 'active',
      isDeleted: false,
      'stats.totalReviews': { $gte: 0 },
    };

    // Filter by domains if specified
    if (options?.domains && options.domains.length > 0) {
      query.domains = { $in: options.domains };
    }

    // Filter by max price if specified
    if (options?.maxPrice) {
      query.$or = [
        { 'pricing.quickCall': { $lte: options.maxPrice } },
        { 'pricing.deepDive': { $lte: options.maxPrice } },
      ];
    }

    return await Mentor.find(query).lean().exec();
  }

  /**
   * Save match scores to database
   */
  private async saveMatchScores(userId: string, matches: MatchResult[]): Promise<void> {
    try {
      const operations = matches.map((match) => ({
        updateOne: {
          filter: {
            userId,
            mentorId: match.mentorId,
          },
          update: {
            $set: {
              userId,
              mentorId: match.mentorId,
              overallScore: match.overallScore,
              factors: match.factors,
              explanation: match.explanation,
              recommendations: match.recommendations,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          },
          upsert: true,
        },
      }));

      await MatchScore.bulkWrite(operations);
      logger.info(`Saved ${matches.length} match scores to database`);
    } catch (error: any) {
      logger.error(`Failed to save match scores: ${error}`);
    }
  }

  /**
   * Save single match score
   */
  private async saveMatchScore(userId: string, match: MatchResult): Promise<void> {
    try {
      await MatchScore.findOneAndUpdate(
        {
          userId,
          mentorId: new mongoose.Types.ObjectId(match.mentorId),
        },
        {
          userId,
          mentorId: new mongoose.Types.ObjectId(match.mentorId),
          overallScore: match.overallScore,
          factors: match.factors,
          explanation: match.explanation,
          recommendations: match.recommendations,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        { upsert: true, new: true }
      );
    } catch (error: any) {
      logger.error(`Failed to save match score: ${error}`);
    }
  }

  /**
   * ✅ Enrich matches with full mentor data (users from User model)
   */
  private async enrichMatchesWithMentorData(
    matches: MatchResult[],
    mentors: any[],
    authToken?: string
  ): Promise<Array<{ mentor: MentorWithRelations; matchScore: MatchResult }>> {
    try {
      const mentorMap = new Map(mentors.map((m) => [m._id.toString(), m]));

      // Get user IDs and company IDs
      const userIds = [...new Set(mentors.map((m) => m.userId).filter(Boolean))];
      const companyIds = [...new Set(mentors.map((m) => m.companyId).filter(Boolean))];

      console.log(`🔍 Fetching ${userIds.length} users and ${companyIds.length} companies`);

      // ✅ Fetch users from User model
      const users = userIds.length > 0
        ? await User.find({
            userId: { $in: userIds },
            'flags.isDeleted': false,
          })
            .select('userId email firstName lastName location onboarding')
            .lean()
        : [];

      console.log(`✅ Found ${users.length} users`);

      // ✅ Fetch companies
      const companies = companyIds.length > 0
        ? await Company.getCompaniesByIds(companyIds, authToken).catch(() => [])
        : [];

      const userMap = new Map(users.map((u) => [u.userId, u]));
      const companyMap = new Map(companies.map((c: any) => [c._id, c]));

      // Enrich matches
      return matches.map((match) => {
        const mentor = mentorMap.get(match.mentorId);
        return {
          mentor: {
            ...mentor,
            user: userMap.get(mentor?.userId), // ✅ Real user from User model
            company: mentor?.companyId ? companyMap.get(mentor.companyId) : undefined,
          },
          matchScore: match,
        };
      });
    } catch (error: any) {
      console.error('❌ Failed to enrich matches:', error.message);
      logger.error(`Failed to enrich matches: ${error}`);
      throw error;
    }
  }

  /**
   * Get match quality label
   */
  private getMatchQuality(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }
}

export default new AIService();
// ```

// ## **Key Changes:**

// ### ✅ **Removed:**
// 1. `userServiceAPI` - Sab API calls hata di
// 2. `isTestMode()` - Test mode check removed
// 3. Mock user profiles - `getMockUserProfile()`, `getBasicUserProfile()` hataye
// 4. External UserProfile types import

// ### ✅ **Added:**
// 1. **Direct User model query** - `User.findOne({ userId })`
// 2. **Real data conversion** - `convertUserModelToProfile()`
// 3. **Onboarding-based profile** - Working/Student/Fresher data use kiya
// 4. **Console logs** - Har step track karne ke liye

// ### ✅ **Flow:**
// ```
// AI Service → User.findOne() 
//           ↓
// User model (onboarding data)
//           ↓
// convertUserModelToProfile()
//           ↓
// UserProfile for matching