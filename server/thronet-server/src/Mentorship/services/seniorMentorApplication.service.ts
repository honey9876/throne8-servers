// services/seniorMentorApplication.service.ts
import seniorMentorApplicationRepository from '../repositories/seniorMentorApplication.repository';
import fileHelper from '../utils/fileHelper';
import {
  ApplicationFilters,
  ApplicationStatus,
  CreateSeniorMentorApplicationInput,
  ISeniorMentorApplication,
  UpdateSeniorMentorApplicationInput,
} from '../interface/seniorMentorApplication.types';
import { logger } from '@/shared/logger.util';
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from '@/shared/errors/app.error';
import seniorNotificationService from './seniorNotification.service';
import SeniorMentorApplication from '../models/SeniorMentorApplication';
import SeniorSession from '../models/SeniorSession';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';


export interface PublicSeniorMentor {
  id: string;
  displayName: string;
  profilePic?: string;
  college: string;
  degree: string;
  fieldOfStudy: string;
  skills: string[];
  sessionsCount: number;
  sessionId: string | null;
}

const APPROVED_ACTIVE_SENIOR_MENTOR_FILTER = {
  verificationStatus: { $in: [ApplicationStatus.VERIFIED, 'active'] },
  isActive: true,
  isDeleted: false,
  mentorRole: 'senior_mentor',
};

export function isApprovedActiveSeniorMentorApplication(application: {
  verificationStatus: string;
  isActive: boolean;
  isDeleted: boolean;
  mentorRole: string;
}): boolean {
  return (
    APPROVED_ACTIVE_SENIOR_MENTOR_FILTER.verificationStatus.$in.includes(
      application.verificationStatus
    ) &&
    application.isActive === APPROVED_ACTIVE_SENIOR_MENTOR_FILTER.isActive &&
    application.isDeleted === APPROVED_ACTIVE_SENIOR_MENTOR_FILTER.isDeleted &&
    application.mentorRole === APPROVED_ACTIVE_SENIOR_MENTOR_FILTER.mentorRole
  );
}

/**
 * NOTE: NotFoundError appends " not found" to the message itself, so pass only
 * the resource name here (e.g. "Application" -> "Application not found").
 */
class SeniorMentorApplicationService {
  private async uploadPhotoToCloudinary(
    file: Express.Multer.File
  ): Promise<{ url: string; key: string }> {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!file || !allowed.includes(file.mimetype)) {
      throw new BadRequestError('Profile photo must be a JPG or PNG image');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestError('Profile photo must be 5MB or smaller');
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'senior-mentor-applications/photos',
          resource_type: 'image',
          transformation: [{ width: 800, height: 800, crop: 'limit' }, { quality: 'auto:good' }],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
          resolve({ url: result.secure_url, key: result.public_id });
        }
      );
      stream.end(file.buffer);
    });
  }

  private async getPublicSessionMetadata(userIds: string[]): Promise<{

    countsByUserId: Map<string, number>;
    sessionIdByUserId: Map<string, string>;
  }> {
    if (userIds.length === 0) {
      return {
        countsByUserId: new Map(),
        sessionIdByUserId: new Map(),
      };
    }

    const sessionData = await SeniorSession.aggregate<{
      sessionCounts: { _id: string; sessionsCount: number }[];
      bookableSessions: { _id: string; sessionId: string }[];
    }>([
      { $match: { mentorId: { $in: userIds } } },
      {
        $facet: {
          sessionCounts: [
            {
              $group: {
                _id: '$mentorId',
                sessionsCount: {
                  $sum: {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$bookings', []] },
                        as: 'booking',
                        cond: { $eq: ['$$booking.status', 'completed'] },
                      },
                    },
                  },
                },
              },
            },
          ],
          bookableSessions: [
            {
              $match: {
                sessionType: 'one_to_one',
                status: { $ne: 'cancelled' },
              },
            },
            { $sort: { createdAt: 1, sessionId: 1 } },
            {
              $group: {
                _id: '$mentorId',
                sessionId: { $first: '$sessionId' },
              },
            },
          ],
        },
      },
    ]);

    return {
      countsByUserId: new Map(
        (sessionData[0]?.sessionCounts ?? []).map(({ _id, sessionsCount }) => [
          _id,
          sessionsCount,
        ])
      ),
      sessionIdByUserId: new Map(
        (sessionData[0]?.bookableSessions ?? []).map(({ _id, sessionId }) => [
          _id,
          sessionId,
        ])
      ),
    };
  }

  private mapPublicSeniorMentor(
    application: Pick<
      ISeniorMentorApplication,
      | 'userId'
      | 'fullName'
      | 'profilePhoto'
      | 'college'
      | 'degree'
      | 'fieldOfStudy'
      | 'primaryExpertise'
      | 'otherSkills'
      | 'technologies'
    >,
    countsByUserId: Map<string, number>,
    sessionIdByUserId: Map<string, string>
  ): PublicSeniorMentor {
    const skills = [
      application.primaryExpertise,
      ...(application.otherSkills ?? []),
      ...(application.technologies ?? []),
    ]
      .filter((skill): skill is string => typeof skill === 'string' && skill.length > 0)
      .filter((skill, index, values) => values.indexOf(skill) === index)
      .slice(0, 6);

    return {
      id: application.userId,
      displayName: application.fullName,
      ...(application.profilePhoto ? { profilePic: application.profilePhoto } : {}),
      college: application.college,
      degree: application.degree,
      fieldOfStudy: application.fieldOfStudy,
      skills,
      sessionsCount: countsByUserId.get(application.userId) ?? 0,
      sessionId: sessionIdByUserId.get(application.userId) ?? null,
    };
  }

  async listPublicSeniorMentors(
    page: number,
    limit: number
  ): Promise<{ mentors: PublicSeniorMentor[]; total: number }> {
    const query = APPROVED_ACTIVE_SENIOR_MENTOR_FILTER;
    const skip = (page - 1) * limit;
    const [applications, total] = await Promise.all([
      SeniorMentorApplication.find(query)
        .select('userId fullName profilePhoto college degree fieldOfStudy primaryExpertise otherSkills technologies -_id')
        .sort({ createdAt: 1, userId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SeniorMentorApplication.countDocuments(query),
    ]);

    const userIds = applications.map((application) => application.userId);
    const { countsByUserId, sessionIdByUserId } = await this.getPublicSessionMetadata(userIds);
    const mentors = applications.map((application) =>
      this.mapPublicSeniorMentor(application, countsByUserId, sessionIdByUserId)
    );

    return { mentors, total };
  }

  async getPublicSeniorMentorByUserId(userId: string): Promise<PublicSeniorMentor> {
    const application = await SeniorMentorApplication.findOne({
      ...APPROVED_ACTIVE_SENIOR_MENTOR_FILTER,
      userId,
    })
      .select('userId fullName profilePhoto college degree fieldOfStudy primaryExpertise otherSkills technologies -_id')
      .lean();

    if (!application) {
      throw new NotFoundError('Senior mentor');
    }

    const { countsByUserId, sessionIdByUserId } = await this.getPublicSessionMetadata([
      application.userId,
    ]);
    return this.mapPublicSeniorMentor(application, countsByUserId, sessionIdByUserId);
  }

  /**
   * Submit a new "Become Senior Mentor" application.
   * One active (non-deleted) application per user — enforced both here
   * (fast, friendly error) and at the DB level (partial unique index).
   */
  async apply(input: CreateSeniorMentorApplicationInput): Promise<any> {
    try {
      const existing = await seniorMentorApplicationRepository.findByUserId(input.userId);
      if (existing) {
        throw new ConflictError(
          existing.verificationStatus === ApplicationStatus.REJECTED
            ? 'Your previous application was rejected. Please update and resubmit it instead of applying again.'
            : 'You already have a Senior Mentor application in progress.'
        );
      }

      const [profilePhoto, resume, proofDocument] = await Promise.all([
        this.uploadPhotoToCloudinary(input.profilePhotoFile),
        fileHelper.uploadFile(input.resumeFile, {
          folder: 'senior-mentor-applications/resumes',
          allowedTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ],
          maxSize: 5 * 1024 * 1024,
          generateUniqueName: true,
        }),
        fileHelper.uploadFile(input.proofDocumentFile, {
          folder: 'senior-mentor-applications/proofs',
          allowedTypes: [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png',
          ],
          maxSize: 5 * 1024 * 1024,
          generateUniqueName: true,
        }),
      ]);

      const application = await seniorMentorApplicationRepository.create({
        userId: input.userId,
        mentorRole: input.mentorRole,
        fullName: input.fullName,
        profilePhoto: profilePhoto.url,
        profilePhotoKey: profilePhoto.key,
        college: input.college,
        degree: input.degree,
        fieldOfStudy: input.fieldOfStudy,
        graduationYear: input.graduationYear,
        currentRole: input.currentRole,
        currentCompany: input.currentCompany,
        shortBio: input.shortBio,

        linkedinUrl: input.linkedinUrl,
        githubUrl: input.githubUrl,
        portfolioUrl: input.portfolioUrl,
        yearsOfExperience: input.yearsOfExperience,
        experienceLevel: input.experienceLevel,
        primaryExpertise: input.primaryExpertise,
        otherSkills: input.otherSkills || [],
        technologies: input.technologies || [],
        achievements: input.achievements || [],
        certifications: input.certifications || [],

        helpAreas: input.helpAreas,

        motivation: input.motivation,
        adviceToJuniorSelf: input.adviceToJuniorSelf,

        resumeUrl: resume.url,
        resumeKey: resume.key,
        proofDocumentUrl: proofDocument.url,
        proofDocumentKey: proofDocument.key,
        verificationStatus: ApplicationStatus.PENDING,
        isActive: true,
      });

      logger.info(`📝 Senior Mentor application submitted: ${application.seniorMentorId}`);
      return application;
    } catch (error: any) {
      logger.error(`Failed to submit senior mentor application: ${error.message}`);
      throw error;
    }
  }

  async getBySeniorMentorId(seniorMentorId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findBySeniorMentorId(seniorMentorId);
    if (!application) {
      throw new NotFoundError('Application');
    }
    return application;
  }

  async getByUserId(userId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findByUserId(userId);
    if (!application) {
      throw new NotFoundError('Senior Mentor application');
    }
    return application;
  }

  async hasApplied(userId: string): Promise<boolean> {
    const application = await seniorMentorApplicationRepository.findByUserId(userId);
    return !!application;
  }

  /**
   * Owner-only update. Applications can only be edited while pending,
   * under review, or rejected — a verified application is locked.
   */
  async update(
    seniorMentorId: string,
    userId: string,
    updates: UpdateSeniorMentorApplicationInput
  ): Promise<any> {
    const application = await seniorMentorApplicationRepository.findBySeniorMentorId(seniorMentorId);
    if (!application) {
      throw new NotFoundError('Application');
    }
    if (application.userId !== userId) {
      throw new ForbiddenError('You can only edit your own application');
    }
    if (application.verificationStatus === ApplicationStatus.VERIFIED) {
      throw new BadRequestError('A verified application cannot be edited');
    }

    const cleanUpdates: Record<string, any> = { ...updates };
    (Object.keys(cleanUpdates) as (keyof UpdateSeniorMentorApplicationInput)[]).forEach((key) => {
      if (cleanUpdates[key] === undefined) delete cleanUpdates[key];
    });

    const updated = await seniorMentorApplicationRepository.updateBySeniorMentorId(
      seniorMentorId,
      cleanUpdates
    );

    logger.info(`✏️ Senior Mentor application updated: ${seniorMentorId}`);
    return updated;
  }

  async withdraw(seniorMentorId: string, userId: string): Promise<void> {
    const application = await seniorMentorApplicationRepository.findBySeniorMentorId(seniorMentorId);
    if (!application) {
      throw new NotFoundError('Application');
    }
    if (application.userId !== userId) {
      throw new ForbiddenError('You can only withdraw your own application');
    }

    await seniorMentorApplicationRepository.softDeleteBySeniorMentorId(seniorMentorId);
    logger.info(`🗑️ Senior Mentor application withdrawn: ${seniorMentorId}`);
  }

  async list(
    filters: ApplicationFilters,
    page: number,
    limit: number,
    skip: number
  ): Promise<{ applications: any[]; total: number }> {
    const [applications, total] = await Promise.all([
      seniorMentorApplicationRepository.findAll(filters, { createdAt: -1 }, skip, limit),
      seniorMentorApplicationRepository.count(filters),
    ]);
    return { applications, total };
  }

  /**
   * Admin: approve an application.
   * NOTE: This only flips the application's verification status.
   * Provisioning the actual `Mentor` profile from an approved application
   * is a separate, deliberate step (see mentor.service.createMentor) so
   * that admins can review pricing/availability before the mentor goes live.
   */
  async approve(seniorMentorId: string, adminUserId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findBySeniorMentorId(seniorMentorId);
    if (!application) {
      throw new NotFoundError('Application');
    }
    if (application.verificationStatus === ApplicationStatus.VERIFIED) {
      throw new BadRequestError('Application is already verified');
    }

    const updated = await seniorMentorApplicationRepository.updateBySeniorMentorId(seniorMentorId, {
      verificationStatus: ApplicationStatus.VERIFIED,
      verifiedAt: new Date(),
      verifiedBy: adminUserId,
      rejectionReason: undefined,
    });

    logger.info(`✅ Senior Mentor application approved: ${seniorMentorId} by ${adminUserId}`);

    seniorNotificationService.notifyApplicationStatus(
      updated || application,
      ApplicationStatus.VERIFIED
    ).catch((err) => console.error('Error notifying application verified:', err));

    return updated;
  }

  async reject(seniorMentorId: string, adminUserId: string, reason: string): Promise<any> {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Rejection reason is required');
    }

    const application = await seniorMentorApplicationRepository.findBySeniorMentorId(seniorMentorId);
    if (!application) {
      throw new NotFoundError('Application');
    }

    const updated = await seniorMentorApplicationRepository.updateBySeniorMentorId(seniorMentorId, {
      verificationStatus: ApplicationStatus.REJECTED,
      rejectionReason: reason,
      verifiedAt: undefined,
      verifiedBy: adminUserId,
    });

    logger.info(`❌ Senior Mentor application rejected: ${seniorMentorId} by ${adminUserId}`);

    seniorNotificationService.notifyApplicationStatus(
      updated || application,
      ApplicationStatus.REJECTED,
      reason
    ).catch((err) => console.error('Error notifying application rejected:', err));

    return updated;
  }

  async markUnderReview(seniorMentorId: string, adminUserId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findBySeniorMentorId(seniorMentorId);
    if (!application) {
      throw new NotFoundError('Application');
    }
    if (application.verificationStatus !== ApplicationStatus.PENDING) {
      throw new BadRequestError('Only pending applications can be moved to under review');
    }

    const updated = await seniorMentorApplicationRepository.updateBySeniorMentorId(seniorMentorId, {
      verificationStatus: ApplicationStatus.UNDER_REVIEW,
    });

    logger.info(`👀 Senior Mentor application marked under review: ${seniorMentorId} by ${adminUserId}`);
    return updated;
  }
}

export default new SeniorMentorApplicationService();