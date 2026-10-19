import { User, ProfilePhoto, Education, Experience } from '@/shared/models/index.models';
import mongoose from 'mongoose';
import Company from '@/company/models/Company.model';
import { Mentor, SessionMentor, GroupSession } from '../models';
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
import { resolveUserDetails } from '@/Mentorship/utils/userPhotoHelper';

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
  async getMentorById(
    mentorId: string,
    authToken?: string,
    currentUser?: any
  ): Promise<MentorWithRelations> {
    try {
      logger.info(`Fetching mentor: ${mentorId}`);

      const mentor = await mentorRepository.findByMentorId(mentorId);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      if (mentor.status !== MentorStatus.ACTIVE) {
        const currentUserId = currentUser?.userId || currentUser?.id;
        const isOwner =
          Boolean(currentUserId) &&
          String(currentUserId) === String(mentor.userId);
        const isAdmin = currentUser?.role === 'admin';

        if (!isOwner && !isAdmin) {
          throw new ForbiddenError('Mentor profile is not available');
        }
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

      // ✅ FIX: experience aur socialProof ko bhi merge karo, warna poora subdocument overwrite ho jata hai.
      // ✅ FIX (TS18048): merged object ko ek local `const` mein nikala — pehle
      // `updates.experience = {...}` reassign karne ke baad TS agli line par
      // `updates.experience.total` access karte waqt use phir se "possibly
      // undefined" maan raha tha (optional property + object literal se
      // widen ho jana). Local const par TS ki narrowing reliably kaam karti hai.
      if (updates.experience) {
        const mergedExperience = { ...mentor.experience, ...updates.experience };
        // ✅ FIX: total change hone par level bhi recalculate karo, warna purana level hi reh jayega
        if (mergedExperience.total !== undefined) {
          mergedExperience.level = this.calculateExperienceLevel(mergedExperience.total);
        }
        updates.experience = mergedExperience;
      }
      if (updates.socialProof) {
        updates.socialProof = { ...mentor.socialProof, ...updates.socialProof };
      }
    
          if (updates.pricing) {
            const mergedPricing = { ...mentor.pricing, ...updates.pricing };
            this.validatePricing(mergedPricing);
            updates.pricing = mergedPricing;
          }

            // ✅ FIX: pehle sirf validate hota tha, merge karke wapas assign nahi hota tha
      // (pricing ki tarah) — isliye partial availability update (jaise sirf
      // { slotDuration }) poora availability object overwrite kar deta tha aur
      // daysAvailable/preferredHours jaisi existing fields wipe ho jaati thi.
      if (updates.availability) {
        const mergedAvailability = { ...mentor.availability, ...updates.availability };
        this.validateAvailability(mergedAvailability);
        updates.availability = mergedAvailability;
      }

      const updatedMentor = await mentorRepository.updateByMentorId(mentorId, updates);
      if (!updatedMentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      logger.info(`Mentor updated: ${mentorId}`);

      try {
        TrustScoreEvents.emit('ProfileUpdated', {
          mentorId,
          timestamp: new Date()
        });
      } catch (eventErr: any) {
        // Trust score listener fail ho to bhi profile update fail nahi honi chahiye
        logger.warn(`TrustScore event failed for ${mentorId}: ${eventErr?.message}`);
      }

      return await this.enrichMentorWithRelations(updatedMentor, authToken);
    } catch (error: any) {
      logger.error(`Failed to update mentor ${mentorId}: ${error?.message}`, {
        name: error?.name,
        stack: error?.stack,
        http_code: error?.http_code,
      });
      throw error;
    }
  }

   /**
   * Remove mentor profile photo (DB + Cloudinary)
   */
   async removeProfilePhoto(
    mentorId: string,
    userId: string,
    authToken?: string
  ): Promise<MentorWithRelations> {
    try {
      const mentor = await mentorRepository.findByMentorId(mentorId);
      if (!mentor) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }
      if (mentor.userId !== userId) {
        throw new ForbiddenError('Not authorized to update this profile');
      }

      // Cloudinary se delete (fail ho to bhi DB se hata denge)
      if (mentor.profilePic) {
        try {
          const match = String(mentor.profilePic).match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
          if (match?.[1]) {
            await cloudinary.uploader.destroy(match[1]);
          }
        } catch (err: any) {
          logger.warn(`Cloudinary delete failed for mentor ${mentorId}: ${err?.message}`);
        }
      }

      const updated = await mentorRepository.removeProfilePicByMentorId(mentorId);
      if (!updated) {
        throw new NotFoundError('MENTOR_NOT_FOUND');
      }

      logger.info(`Profile photo removed for mentor: ${mentorId}`);
      return await this.enrichMentorWithRelations(updated, authToken);
    } catch (error: any) {
      logger.error(`Failed to remove profile photo ${mentorId}: ${error.message}`);
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

      // Batch fetch education for all returned mentors (1 query)
      let finalMentors: any[] = enrichedMentors;
      try {
        const userIds = enrichedMentors.map((m: any) => m.userId).filter(Boolean);
        if (userIds.length > 0) {
          const eduDocs = await Education.find(
            { userId: { $in: userIds }, isDeleted: false, isArchived: false },
            { userId: 1, schoolCollegeName: 1, degree: 1, specialization: 1, startDate: 1, endDate: 1, isOngoing: 1 }
          ).lean();
          const eduByUser: Record<string, any[]> = {};
          for (const d of eduDocs) {
            (eduByUser[d.userId] ||= []).push(d);
          }
          finalMentors = enrichedMentors.map((m: any) => {
            const list = eduByUser[m.userId] || [];
            let chosenCollege = '';
            let chosenDegree = '';
            let chosenBranch = '';
            if (list.length > 0) {
              const ongoing = list.filter((e: any) => e.isOngoing || !e.endDate);
              const chosen = ongoing.length
                ? ongoing.reduce((a: any, b: any) =>
                    (b.startDate ? new Date(b.startDate).getTime() : 0) >
                    (a.startDate ? new Date(a.startDate).getTime() : 0)
                      ? b
                      : a
                  )
                : list.reduce((a: any, b: any) =>
                    (b.endDate ? new Date(b.endDate).getTime() : 0) >
                    (a.endDate ? new Date(a.endDate).getTime() : 0)
                      ? b
                      : a
                  );
              if (typeof chosen?.schoolCollegeName === 'string' && /[a-zA-Z0-9]/.test(chosen.schoolCollegeName)) {
                chosenCollege = chosen.schoolCollegeName.trim();
              }
              if (typeof chosen?.degree === 'string' && /[a-zA-Z0-9]/.test(chosen.degree)) {
                chosenDegree = chosen.degree.trim();
              }
              if (typeof chosen?.specialization === 'string' && /[a-zA-Z0-9]/.test(chosen.specialization)) {
                chosenBranch = chosen.specialization.trim();
              }
            }
            const college = (typeof m.college === 'string' && /[a-zA-Z0-9]/.test(m.college) ? m.college.trim() : '') || chosenCollege;
            const degree = (typeof m.degree === 'string' && /[a-zA-Z0-9]/.test(m.degree) ? m.degree.trim() : '') || chosenDegree;
            const branch = (typeof m.branch === 'string' && /[a-zA-Z0-9]/.test(m.branch) ? m.branch.trim() : '') || chosenBranch;
            return {
              ...m,
              ...(college ? { college } : {}),
              ...(degree ? { degree } : {}),
              ...(branch ? { branch } : {}),
            };
          });
        }
      } catch (eduErr: any) {
        logger.warn(`Failed to fetch education for mentors: ${eduErr.message}`);
      }

      // Batch fetch work experience company for all returned mentors (1 query)
      try {
        const userIds = finalMentors.map((m: any) => m.userId).filter(Boolean);
        if (userIds.length > 0) {
          const expDocs = await Experience.find(
            { userId: { $in: userIds }, isDeleted: false, isArchived: false },
            { userId: 1, companyName: 1, startDate: 1, endDate: 1, currentlyWorking: 1 }
          ).lean();
          const expByUser: Record<string, any[]> = {};
          for (const d of expDocs) {
            (expByUser[d.userId] ||= []).push(d);
          }
          finalMentors = finalMentors.map((m: any) => {
            const list = expByUser[m.userId] || [];
            let resolvedCompany = typeof m.company === 'string' && /[a-zA-Z0-9]/.test(m.company) ? m.company.trim() : '';
            if (!resolvedCompany && list.length > 0) {
              const current = list.filter((e: any) => e.currentlyWorking || !e.endDate);
              const chosen = current.length
                ? current.reduce((a: any, b: any) =>
                    (b.startDate ? new Date(b.startDate).getTime() : 0) >
                    (a.startDate ? new Date(a.startDate).getTime() : 0)
                      ? b
                      : a
                  )
                : list.reduce((a: any, b: any) =>
                    (b.startDate ? new Date(b.startDate).getTime() : 0) >
                    (a.startDate ? new Date(a.startDate).getTime() : 0)
                      ? b
                      : a
                  );
              if (typeof chosen?.companyName === 'string' && /[a-zA-Z0-9]/.test(chosen.companyName)) {
                resolvedCompany = chosen.companyName.trim();
              }
            }
            if (!resolvedCompany && typeof m.user?.company === 'string' && /[a-zA-Z0-9]/.test(m.user.company)) {
              resolvedCompany = m.user.company.trim();
            }
            return {
              ...m,
              ...(resolvedCompany ? { company: resolvedCompany } : {}),
            };
          });
        }
      } catch (expErr: any) {
        logger.warn(`Failed to fetch experience for mentors: ${expErr.message}`);
      }

      // Batch fetch company logos for all returned mentors (1 query)
      try {
        const companyIds = finalMentors.map((m: any) => m.companyId).filter(Boolean);
        const companyNames = finalMentors.map((m: any) => m.company).filter((c: any) => typeof c === 'string' && c.trim());

        if (companyIds.length > 0 || companyNames.length > 0) {
          const escapedNames = Array.from(new Set(companyNames)).map((n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          const companyDocs = await Company.find(
            {
              $or: [
                ...(companyIds.length ? [{ companyId: { $in: companyIds } }] : []),
                ...(escapedNames.length ? [{ companyName: { $in: escapedNames.map(en => new RegExp(`^${en}$`, 'i')) } }] : []),
              ],
              'audit.isDeleted': false,
            },
            { companyId: 1, companyName: 1, 'media.logo': 1 }
          ).lean();

          const compById: Record<string, any> = {};
          const compByName: Record<string, any> = {};
          for (const c of companyDocs) {
            if (c.companyId) compById[c.companyId] = c;
            if (c.companyName) compByName[c.companyName.toLowerCase().trim()] = c;
          }

          finalMentors = finalMentors.map((m: any) => {
            const matchedComp = (m.companyId && compById[m.companyId]) ||
              (typeof m.company === 'string' && compByName[m.company.toLowerCase().trim()]);

            let companyLogo: string | undefined = undefined;
            if (matchedComp?.media?.logo) {
              const { url, publicId } = matchedComp.media.logo;
              if (url && typeof url === 'string' && url.startsWith('http')) {
                companyLogo = url;
              } else if (publicId && typeof publicId === 'string') {
                companyLogo = cloudinary.url(publicId, { secure: true });
              }
            }

            return {
              ...m,
              ...(companyLogo ? { companyLogo } : {}),
            };
          });
        }
      } catch (compErr: any) {
        logger.warn(`Failed to fetch company logos for mentors: ${compErr.message}`);
      }

      const meta = PaginationHelper.calculateMeta({
        page: validPage,
        limit: validLimit,
        total,
      });

      return {
        mentors: finalMentors,
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
          .select('userId email firstName lastName fullName profilePhotoId company')
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

      // Compute real session stats from SessionMentor and GroupSession collections
      try {
        const mentorIdQuery = [mentorObj.mentorId, mentorObj.userId];

        const [oneToOneSessions, groupSessions] = await Promise.all([
          SessionMentor.find({ mentorId: { $in: mentorIdQuery } }).select('status').lean(),
          GroupSession.find({ mentorId: { $in: mentorIdQuery }, isTemplate: false }).select('status participants').lean(),
        ]);

        const totalOneToOne = oneToOneSessions.length;
        const completedOneToOne = oneToOneSessions.filter((s: any) => s.status === 'completed').length;
        const cancelledOneToOne = oneToOneSessions.filter((s: any) => s.status === 'cancelled').length;

        const totalGroup = groupSessions.length;
        const completedGroup = groupSessions.filter((g: any) => g.status === 'completed').length;
        const cancelledGroup = groupSessions.filter((g: any) => g.status === 'cancelled').length;

        const totalSessionsCount = (mentorObj.stats?.totalSessions || 0) + totalOneToOne + totalGroup;
        const completedSessionsCount = (mentorObj.stats?.completedSessions || 0) + completedOneToOne + completedGroup;
        const cancelledSessionsCount = (mentorObj.stats?.cancelledSessions || 0) + cancelledOneToOne + cancelledGroup;

        const completionRate = totalSessionsCount > 0
          ? Math.round((completedSessionsCount / totalSessionsCount) * 100)
          : (mentorObj.stats?.completionRate ?? 100);

        const attempted = completedSessionsCount + cancelledSessionsCount;
        const successRate = attempted > 0
          ? Math.round((completedSessionsCount / attempted) * 100)
          : completionRate;

        const responseTime = mentorObj.stats?.responseTime && mentorObj.stats.responseTime > 0
          ? mentorObj.stats.responseTime
          : 1;

        mentorObj.stats = {
          ...mentorObj.stats,
          totalSessions: totalSessionsCount,
          completedSessions: completedSessionsCount,
          cancelledSessions: cancelledSessionsCount,
          completionRate,
          successRate,
          responseTime,
        };
      } catch (statsErr: any) {
        logger.warn(`Failed to dynamically compute mentor stats: ${statsErr.message}`);
      }

      return {
        ...mentorObj,
        user,
        ...(company ? { company } : {}),
      };
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
          if (error || !result) {
            logger.error('Cloudinary upload failed', {
              message: error?.message,
              http_code: error?.http_code,
              name: error?.name,
            });
            return reject(
              new BadRequestError(
                `Image upload failed: ${error?.message || 'Unknown Cloudinary error'}`
              )
            );
          }
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

  /**
   * Get unified mentor dashboard overview stats and upcoming sessions
   */
  async getMentorDashboardData(mentorIdOrUserId: string, authUserId: string): Promise<any> {
    try {
      let mentor = await mentorRepository.findByMentorId(mentorIdOrUserId);
      if (!mentor) {
        mentor = await mentorRepository.findByUserId(mentorIdOrUserId);
      }
      if (!mentor) {
        throw new NotFoundError('Mentor profile not found.');
      }

      // Authorization check: Only logged-in mentor owner (or admin) can view their dashboard
      if (mentor.userId !== authUserId) {
        throw new ForbiddenError('You are not authorized to access this dashboard.');
      }

      // Fetch user details for name & profile photo
      const user = (await User.findOne({ userId: mentor.userId, 'flags.isDeleted': false }).lean()) as any;
      const firstName = user?.firstName || mentor.user?.firstName || 'Mentor';
      const lastName = user?.lastName || mentor.user?.lastName || '';
      const name = `${firstName} ${lastName}`.trim();
      // Mentor.profilePic na ho to account (ProfilePhoto) ki active photo dikhao.
      // User model me `profilePic` field nahi hai (sirf profilePhotoId), isliye
      // purana `user?.profilePic` fallback kabhi kaam nahi karta tha.
      let accountPhotoUrl: string | null = null;
      if (!mentor.profilePic) {
        try {
          const selfDetails = await resolveUserDetails([mentor.userId]);
          accountPhotoUrl = selfDetails.get(String(mentor.userId))?.photoUrl || null;
        } catch (photoErr: any) {
          logger.warn(`Account photo fallback failed for mentor ${mentor.mentorId}: ${photoErr?.message}`);
        }
      }
      const profilePic = mentor.profilePic || accountPhotoUrl;      

      const mentorIds = [mentor.mentorId, mentor.userId].filter(Boolean);

      // Stats calculations
      const completedSessionsCount = await SessionMentor.countDocuments({
        mentorId: { $in: mentorIds },
        status: 'completed',
      });

      const now = new Date();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Upcoming 1-on-1 sessions list (including active/today sessions that are not completed or cancelled)
      const upcoming1on1Docs = await SessionMentor.find({
        mentorId: { $in: mentorIds },
        $or: [
          { scheduledAt: { $gte: now } },
          { status: 'in_progress' },
          { scheduledAt: { $gte: startOfToday }, status: { $in: ['confirmed', 'in_progress', 'pending'] } },
        ],
        status: { $nin: ['cancelled', 'completed', 'no_show', 'refunded'] },
      })
        .sort({ scheduledAt: 1 })
        .limit(20)
        .lean();

      // Also find upcoming GroupSessions
      const upcomingGroupDocs = await GroupSession.find({
        mentorId: { $in: mentorIds },
        $or: [
          { scheduledAt: { $gte: now } },
          { status: 'in_progress' },
          { scheduledAt: { $gte: startOfToday }, status: { $in: ['open', 'full', 'in_progress', 'draft'] } },
        ],
        status: { $in: ['open', 'full', 'in_progress', 'draft'] },
      })
        .sort({ scheduledAt: 1 })
        .limit(10)
        .lean();

      // Collect all raw mentee IDs across 1-on-1 and group sessions for bulk resolution
      const rawMenteeIds: string[] = [];

      upcoming1on1Docs.forEach((s: any) => {
        if (Array.isArray(s.bookings)) {
          s.bookings.forEach((b: any) => {
            if (b?.menteeId) rawMenteeIds.push(String(b.menteeId));
            if (b?.bookedBy) rawMenteeIds.push(String(b.bookedBy));
          });
        }
        if (Array.isArray(s.participants)) {
          s.participants.forEach((p: any) => {
            if (p?.menteeId) rawMenteeIds.push(String(p.menteeId));
            if (p?.userId) rawMenteeIds.push(String(p.userId));
          });
        }
        if (s.menteeId) rawMenteeIds.push(String(s.menteeId));
        if (s.bookedBy) rawMenteeIds.push(String(s.bookedBy));
      });

      upcomingGroupDocs.forEach((g: any) => {
        if (Array.isArray(g.participants)) {
          g.participants.forEach((p: any) => {
            if (p?.menteeId) rawMenteeIds.push(String(p.menteeId));
            if (p?.userId) rawMenteeIds.push(String(p.userId));
          });
        }
      });

      // Bulk resolve all mentee details and photo URLs (Zero N+1)
      const userDetailsMap = await resolveUserDetails(rawMenteeIds);

      const formatted1on1 = upcoming1on1Docs.map((s: any) => {
        const rawId =
          (Array.isArray(s.bookings) && (s.bookings.find((b: any) => b?.menteeId || b?.bookedBy)?.menteeId || s.bookings[0]?.bookedBy)) ||
          (Array.isArray(s.participants) && (s.participants.find((p: any) => p?.menteeId || p?.userId)?.menteeId || s.participants[0]?.userId)) ||
          s.menteeId ||
          s.bookedBy ||
          null;

        const resolved = rawId ? userDetailsMap.get(String(rawId)) : null;

        let menteeId = resolved?.userId || (rawId ? String(rawId) : null);
        let menteeName = (resolved && resolved.name && resolved.name !== 'User')
          ? resolved.name
          : (s.bookedMenteeName || 'Student');
        let menteeProfilePhoto = resolved?.photoUrl || null;

        const durationMinutes = Number(s.duration || (Array.isArray(s.bookings) && s.bookings[0]?.slotDuration) || 60);
        const startTimeIso = s.scheduledAt ? new Date(s.scheduledAt).toISOString() : new Date().toISOString();
        const endTimeIso = s.endedAt
          ? new Date(s.endedAt).toISOString()
          : new Date(new Date(startTimeIso).getTime() + durationMinutes * 60000).toISOString();

        return {
          _id: s._id,
          sessionId: s.sessionId || String(s._id),
          menteeId,
          menteeName,
          menteeProfilePhoto,
          title: s.title || s.sessionType || '1-on-1 Session',
          sessionType: s.sessionType || '1-on-1 Session',
          scheduledAt: startTimeIso,
          startTime: startTimeIso,
          endTime: endTimeIso,
          durationMinutes,
          status: s.status || 'pending',
          isGroupSession: false,
          meetingUrl: s.meetingDetails?.meetingUrl || null,
        };
      });

      const formattedGroup = upcomingGroupDocs.map((g: any) => {
        const firstParticipant = Array.isArray(g.participants) && g.participants[0];
        const participantId = firstParticipant?.menteeId || firstParticipant?.userId || null;
        const resolved = participantId ? userDetailsMap.get(String(participantId)) : null;

        const durationMinutes = Number(g.duration || 60);
        const startTimeIso = g.scheduledAt ? new Date(g.scheduledAt).toISOString() : new Date().toISOString();
        const endTimeIso = new Date(new Date(startTimeIso).getTime() + durationMinutes * 60000).toISOString();

        let menteeName = 'Group Session';
        if (resolved && resolved.name && resolved.name !== 'User') {
          menteeName = resolved.name;
        } else if (g.participants?.length) {
          menteeName = `${g.participants.length} Participant${g.participants.length > 1 ? 's' : ''}`;
        }

        return {
          _id: g._id,
          sessionId: g.sessionId || String(g._id),
          menteeId: resolved?.userId || (participantId ? String(participantId) : null),
          menteeName,
          menteeProfilePhoto: resolved?.photoUrl || null,
          title: g.title || 'Group Session',
          sessionType: 'Group Session',
          scheduledAt: startTimeIso,
          startTime: startTimeIso,
          endTime: endTimeIso,
          durationMinutes,
          status: g.status || 'open',
          isGroupSession: true,
          enrolledCount: g.currentParticipants || g.participants?.length || 0,
          maxParticipants: g.maxParticipants || 0,
          meetingUrl: g.meetingUrl || null,
        };
      });

      const allUpcoming = [...formatted1on1, ...formattedGroup].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );

      const upcomingCount = allUpcoming.length;

      const averageRating = mentor.stats?.averageRating ?? 0;
      const totalReviews = mentor.stats?.totalReviews ?? 0;
      const trustScore = mentor.trustScore?.score ?? mentor.stats?.trustScore ?? null;
      const isVerified = Boolean(mentor.verification?.isVerified || mentor.isVerified);
      const category = (Array.isArray(mentor.domains) && mentor.domains[0]) || mentor.title || 'Web Development';

      const upcomingSessions = allUpcoming;

      return {
        mentorId: mentor.mentorId,
        userId: mentor.userId,
        user: {
          firstName,
          lastName,
          name,
        },
        profilePic,
        category,
        rating: averageRating,
        totalReviews,
        stats: {
          totalSessions: completedSessionsCount,
          upcoming: upcomingCount,
          rating: averageRating,
          trustScore,
        },
        isVerified,
        serverNow: new Date().toISOString(),
        upcomingSessions,
      };
    } catch (error: any) {
      logger.error(`Error fetching mentor dashboard data: ${error.message}`);
      throw error;
    }
  }
}

export default new MentorService();