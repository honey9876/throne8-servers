import { User } from '@/shared/models/index.models';
import Company from '@/company/models/Company.model';
import { Mentor } from '../models';
import {
  CreateMentorInput,
  ExperienceLevel,
  IMentor,
  MentorFilters,
  MentorSortOptions,
  MentorStatus,
  MentorWithRelations,
  UpdateMentorInput,
} from '@/Mentorship/interface/mentor.types';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/shared/errors/app.error';
import { logger } from '@/shared/logger.util';
import PaginationHelper from '@/Mentorship/utils/pagination';
import { ICompany } from '@/Mentorship/interface/company.types';
import mentorRepository from '../repositories/mentor.repository';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import { TrustScoreEvents } from '../events/trustScore.events';

class MentorService {
  /**
   * Create a new mentor profile
   */
  async createMentor(
    input: CreateMentorInput,
    authToken?: string
  ): Promise<MentorWithRelations> {
    try {
      logger.info(`Creating mentor profile for user: ${input.userId}`);

      // 1. Check duplicate mentor
      const existingMentor = await mentorRepository.findByUserId(input.userId);
      if (existingMentor) {
        throw new ConflictError('MENTOR_ALREADY_EXISTS');
      }

      // 2. Verify user from User model
      const user = await User.findOne({
        userId: input.userId,
        'flags.isDeleted': false,
      });

      if (!user) {
        throw new NotFoundError('USER_NOT_FOUND');
      }

      logger.info(`✅ User verified: ${input.userId}`);

      // 3. Pricing — default to 0 if not provided, validate if provided
      const pricing = {
        quickCall: 0,
        deepDive: 0,
        resumeReview: 0,
        mockInterview: 0,
        careerPlanning: 0,
        portfolioReview: 0,
        askQuery: 0,
        groupSession: 0,
        ...input.pricing,
      };
      if (input.pricing) {
        this.validatePricing(pricing);
      }

      // 4. Availability — validate only if provided
      if (input.availability?.daysAvailable?.length) {
        this.validateAvailability(input.availability as IMentor['availability']);
      }

      // 5. Auto-calculate experience level from years
      const experienceLevel = this.calculateExperienceLevel(input.experience.total);

      // 6. Profile picture — required for mentor creation
      if (!input.profilePicFile) {
        throw new BadRequestError('Profile picture is required');
      }
      const profilePicUrl = await this.uploadImageToCloudinary(
        input.profilePicFile.buffer,
        input.userId
      );

      // 7. Preferences with defaults
      const preferences = {
        acceptGroupSessions: true,
        maxGroupSize: 10,
        acceptQueries: true,
        maxQueriesPerWeek: 10,
        notificationPreferences: {
          email: true,
          sms: false,
          push: true,
        },
        ...input.preferences,
      };

      // 8. Create mentor
      const mentorData = {
        ...input,
        experience: {
          ...input.experience,
          level: experienceLevel,
        },
        pricing,
        preferences,
        profilePic: profilePicUrl,
        status: MentorStatus.PENDING_APPROVAL,
      };

      const mentor = await mentorRepository.create(mentorData);
      logger.info(`✅ Mentor created: ${mentor.mentorId}`);

      return await this.enrichMentorWithRelations(mentor, authToken);
    } catch (error: any) {
      logger.error(`Failed to create mentor: ${error.message}`);
      throw error;
    }
  }

  /**
   * Auto-calculate experience level from years of experience
   */
  private calculateExperienceLevel(years: number): ExperienceLevel {
    if (years <= 1)  return ExperienceLevel.JUNIOR;
    if (years <= 3)  return ExperienceLevel.MID;
    if (years <= 6)  return ExperienceLevel.SENIOR;
    if (years <= 10) return ExperienceLevel.LEAD;
    if (years <= 15) return ExperienceLevel.PRINCIPAL;
    return ExperienceLevel.ARCHITECT;
  }

  /**
   * Get mentor by mentorId (UUID) with relations
   */
  async getMentorById(mentorId: string, authToken?: string): Promise<MentorWithRelations> {
    try {
      logger.info(`Fetching mentor: ${mentorId}`);

      const mentor = await mentorRepository.findByMentorId(mentorId);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      if (mentor.status !== MentorStatus.ACTIVE && !authToken) {
        throw new ForbiddenError('Mentor profile is not available');
      }

      return await this.enrichMentorWithRelations(mentor, authToken);
    } catch (error: any) {
      logger.error(`Failed to fetch mentor ${mentorId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get mentor by userId (UUID)
   */
  async getMentorByUserId(userId: string, authToken?: string): Promise<MentorWithRelations> {
    try {
      logger.info(`Fetching mentor by user ID: ${userId}`);

      const mentor = await mentorRepository.findByUserId(userId);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      return await this.enrichMentorWithRelations(mentor, authToken);
    } catch (error: any) {
      logger.error(`Failed to fetch mentor by userId ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update mentor profile
   */
  async updateMentor(
    mentorId: string,
    updates: UpdateMentorInput & { profilePic?: string; bannerImage?: string },
    userId: string,
    authToken?: string,
    profilePicFile?: Express.Multer.File,
    bannerImageFile?: Express.Multer.File
  ): Promise<MentorWithRelations> {
    try {
      logger.info(`Updating mentor: ${mentorId}`);

      const mentor = await mentorRepository.findByMentorId(mentorId);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      if (mentor.userId !== userId) {
        throw new ForbiddenError('Not authorized to update this profile');
      }

      // Handle image uploads if present
      if (profilePicFile) {
        const profilePicUrl = await this.uploadImageToCloudinary(profilePicFile.buffer, userId);
        updates.profilePic = profilePicUrl;
      }

      if (bannerImageFile) {
        const bannerImageUrl = await this.uploadImageToCloudinary(bannerImageFile.buffer, userId);
        updates.bannerImage = bannerImageUrl;
      }

      if (updates.pricing) {
        const mergedPricing = { ...mentor.pricing, ...updates.pricing };
        this.validatePricing(mergedPricing);
        updates.pricing = mergedPricing;
      }

      if (updates.availability) {
        this.validateAvailability({ ...mentor.availability, ...updates.availability });
      }

      const updatedMentor = await mentorRepository.updateByMentorId(mentorId, updates);
      if (!updatedMentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      logger.info(`Mentor updated: ${mentorId}`);

      TrustScoreEvents.emit('ProfileUpdated', {
        mentorId,
        timestamp: new Date()
      });

      return await this.enrichMentorWithRelations(updatedMentor, authToken);
    } catch (error: any) {
      logger.error(`Failed to update mentor ${mentorId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Soft delete mentor profile
   */
  async deleteMentor(mentorId: string, userId: string, _authToken?: string): Promise<void> {
    try {
      logger.info(`Deleting mentor: ${mentorId}`);

      const mentor = await mentorRepository.findByMentorId(mentorId);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      if (mentor.userId !== userId) {
        throw new ForbiddenError('Not authorized to delete this profile');
      }

      const deleted = await mentorRepository.softDeleteByMentorId(mentorId);
      if (!deleted) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      logger.info(`Mentor deleted: ${mentorId}`);
    } catch (error: any) {
      logger.error(`Failed to delete mentor ${mentorId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get mentor stats
   */
  async getMentorStats(mentorId: string): Promise<IMentor['stats']> {
    try {
      const stats = await mentorRepository.getStatsByMentorId(mentorId);
      if (!stats) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }
      return stats;
    } catch (error: any) {
      logger.error(`Failed to fetch mentor stats ${mentorId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all mentors with pagination and filters
   */
  async getAllMentors(
    page: number = 1,
    limit: number = 10,
    filters?: MentorFilters,
    sort?: MentorSortOptions,
    authToken?: string
  ): Promise<{
    mentors: MentorWithRelations[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      logger.info('Fetching all mentors with filters');

      const { page: validPage, limit: validLimit } =
        PaginationHelper.validateParams(page, limit);

      const query    = this.buildMentorQuery(filters);
      const sortQuery = this.buildSortQuery(sort);
      const skip     = PaginationHelper.getSkip(validPage, validLimit);

      const [mentors, total] = await Promise.all([
        mentorRepository.findAll(query, sortQuery, skip, validLimit),
        mentorRepository.count(query),
      ]);

      const enrichedMentors = await Promise.all(
        mentors.map((mentor: any) => this.enrichMentorWithRelations(mentor, authToken))
      );

      const meta = PaginationHelper.calculateMeta({
        page: validPage,
        limit: validLimit,
        total,
      });

      return {
        mentors: enrichedMentors,
        total: meta.total,
        page: meta.page,
        limit: meta.limit,
        totalPages: meta.totalPages,
      };
    } catch (error: any) {
      logger.error(`Failed to fetch mentors: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enrich mentor with user and company data
   */
  private async enrichMentorWithRelations(
    mentor: any,
    authToken?: string
  ): Promise<MentorWithRelations> {
    try {
      const mentorObj = mentor.toObject ? mentor.toObject() : mentor;

      let user: any = null;
      try {
        user = await User.findOne({
          userId: mentorObj.userId,
          'flags.isDeleted': false,
        })
          .select('userId email firstName lastName fullName profilePhotoId')
          .lean();
      } catch (error: any) {
        logger.error(`Failed to fetch user for mentor enrichment: ${error.message}`, {
          userId: mentorObj.userId,
        });
      }

      let company: any = undefined;
      if (mentorObj.companyId) {
        try {
          company = await Company.getCompanyById(mentorObj.companyId, authToken);
        } catch (error: any) {
          logger.warn(`Failed to fetch company ${mentorObj.companyId}: ${error.message}`);
        }
      }

      return { ...mentorObj, user, company };
    } catch (error: any) {
      logger.error(`Failed to enrich mentor: ${error.message}`);
      return mentor.toObject ? mentor.toObject() : mentor;
    }
  }

  /**
   * Validate pricing — no negative prices allowed
   */
  private validatePricing(pricing: IMentor['pricing']): void {
    if (!pricing) return;

    const sessionTypes = [
      'quickCall',
      'deepDive',
      'resumeReview',
      'mockInterview',
      'careerPlanning',
      'portfolioReview',
      'askQuery',
      'groupSession',
    ] as const;

    for (const sessionType of sessionTypes) {
      if (pricing[sessionType]! < 0) {
        throw new BadRequestError(`${sessionType} price cannot be negative`);
      }
    }
  }

  /**
   * Validate availability days
   */
  private validateAvailability(availability: Partial<IMentor['availability']>): void {
    if (!availability?.timezone) return;

    if (availability.daysAvailable?.length) {
      const validDays = [
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      ];
      for (const day of availability.daysAvailable) {
        if (!validDays.includes(day.toLowerCase())) {
          throw new BadRequestError(`Invalid day: ${day}`);
        }
      }
    }
  }

  /**
   * Build MongoDB query from filters.
   *
   * ✅ FIX: Replaced unsafe non-null assertions (filters!) with optional chaining (filters?.).
   * Previously `filters!.domains` would throw if filters was undefined.
   */
  private buildMentorQuery(filters?: MentorFilters): any {
    const query: any = {
      isDeleted: false,
      status: MentorStatus.ACTIVE,
    };

    if (filters?.domains?.length) {
      query.domains = { $in: filters.domains };
    }

    if (filters?.companyIds?.length) {
      query.companyId = { $in: filters.companyIds };
    }

    if (filters?.minPrice !== undefined || filters?.maxPrice !== undefined) {
      query.$or = [
        {
          'pricing.quickCall': {
            ...(filters?.minPrice !== undefined && { $gte: filters.minPrice }),
            ...(filters?.maxPrice !== undefined && { $lte: filters.maxPrice }),
          },
        },
        {
          'pricing.deepDive': {
            ...(filters?.minPrice !== undefined && { $gte: filters.minPrice }),
            ...(filters?.maxPrice !== undefined && { $lte: filters.maxPrice }),
          },
        },
      ];
    }

    if (filters?.minRating) {
      query['stats.averageRating'] = { $gte: filters.minRating };
    }

    if (filters?.minExperience) {
      query['experience.total'] = { $gte: filters.minExperience };
    }

    if (filters?.experienceLevel?.length) {
      query['experience.level'] = { $in: filters.experienceLevel };
    }

    if (filters?.languages?.length) {
      query.languages = { $in: filters.languages };
    }

    if (filters?.skills?.length) {
      query.skills = { $in: filters.skills };
    }

    if (filters?.featured !== undefined) {
      query['featured.isFeatured'] = filters.featured;
      if (filters.featured) {
        query['featured.featuredUntil'] = { $gt: new Date() };
      }
    }

    // ✅ Note: filters.status overrides the default 'active' status in query
    if (filters?.status) {
      query.status = filters.status;
    }

    return query;
  }

  /**
   * Build sort query
   */
  private buildSortQuery(sort?: MentorSortOptions): any {
    if (!sort) return { createdAt: -1 };

    const sortMap: Record<string, string> = {
      rating:    'stats.averageRating',
      experience:'experience.total',
      price:     'pricing.quickCall',
      sessions:  'stats.totalSessions',
      createdAt: 'createdAt',
    };

    const sortField = sortMap[sort.field] || 'createdAt';
    const sortOrder = sort.order === 'asc' ? 1 : -1;

    return { [sortField]: sortOrder };
  }

  /**
   * Upload profile picture to Cloudinary.
   * Resizes to max 1200x1200, auto-quality compression.
   * Returns secure_url (string), not the full Cloudinary result object.
   */
  private async uploadImageToCloudinary(buffer: Buffer, userId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'mentor-profiles',
          public_id: `mentor_${userId}_${Date.now()}`,
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto:good' },
          ],
          overwrite: true,
        },
        (error: any, result: any) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  /**
   * Admin: Approve mentor account.
   *
   * Validates all verifications are complete, then sets status → ACTIVE.
   *
   * ✅ FIX: adminUserId is now included in the log for full audit trail.
   * Previously it was only in the function signature but never persisted.
   */
  async approveMentor(
    mentorId: string,
    adminUserId: string
  ): Promise<MentorWithRelations> {
    try {
      logger.info(`Processing mentor approval: ${mentorId}`, { adminUserId });

      const mentor = await mentorRepository.findByMentorId(mentorId);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      if (mentor.status === MentorStatus.ACTIVE) {
        throw new BadRequestError('Mentor account is already active and approved.');
      }

      if (mentor.status === MentorStatus.SUSPENDED) {
        throw new BadRequestError(
          'Suspended mentor accounts cannot be approved directly. Please unsuspend first.'
        );
      }

      const user = await User.findOne({
        userId: mentor.userId,
        'flags.isDeleted': false,
      }).select(
        'emailVerified phoneVerified aadhaarVerified companyEmailVerified firstName lastName email'
      );

      if (!user) {
        throw new NotFoundError('Associated user account not found.');
      }

      const verificationChecks = {
        emailVerified:        user.emailVerified === true,
        phoneVerified:        user.phoneVerified === true,
        aadhaarVerified:      user.aadhaarVerified === true,
        companyEmailVerified: user.companyEmailVerified === true,
      };

      const failedChecks = Object.entries(verificationChecks)
        .filter(([, isVerified]) => !isVerified)
        .map(([field]) => field);

      if (failedChecks.length > 0) {
        const failedLabels: Record<string, string> = {
          emailVerified:        'Email Verification',
          phoneVerified:        'Phone Verification',
          aadhaarVerified:      'Identity (Aadhaar) Verification',
          companyEmailVerified: 'Professional Credentials Verification',
        };

        const readableFields = failedChecks.map((f) => failedLabels[f] || f).join(', ');
        throw new BadRequestError(
          `Mentor approval failed. Incomplete verifications: ${readableFields}. All must be complete before approval.`
        );
      }

      const updatedMentor = await mentorRepository.updateByMentorId(mentorId, {
        status: MentorStatus.ACTIVE,
      } as any);

      if (!updatedMentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      // ✅ FIX: adminUserId now in log — full audit trail
      logger.info(`Mentor approved and set to ACTIVE: ${mentorId}`, {
        adminUserId,
        mentorUserId: mentor.userId,
      });

      return await this.enrichMentorWithRelations(updatedMentor);
    } catch (error: any) {
      logger.error(`Mentor approval failed ${mentorId}: ${error.message}`);
      throw error;
    }
  }
}

export default new MentorService();