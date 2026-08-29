// services/seniorMentorApplication.service.ts
import seniorMentorApplicationRepository from '../repositories/seniorMentorApplication.repository';
import fileHelper from '../utils/fileHelper';
import {
  ApplicationFilters,
  ApplicationStatus,
  CreateSeniorMentorApplicationInput,
  UpdateSeniorMentorApplicationInput,
} from '../interface/seniorMentorApplication.types';
import { logger } from '@/shared/logger.util';
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from '@/shared/errors/app.error';

class SeniorMentorApplicationService {
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
        fileHelper.uploadFile(input.profilePhotoFile, {
          folder: 'senior-mentor-applications/photos',
          allowedTypes: ['image/jpeg', 'image/jpg', 'image/png'],
          maxSize: 5 * 1024 * 1024,
          generateUniqueName: true,
        }),
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

      logger.info(`📝 Senior Mentor application submitted: ${application.applicationId}`);
      return application;
    } catch (error: any) {
      logger.error(`Failed to submit senior mentor application: ${error.message}`);
      throw error;
    }
  }

  async getByApplicationId(applicationId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findByApplicationId(applicationId);
    if (!application) {
      throw new NotFoundError('Application not found');
    }
    return application;
  }

  async getByUserId(userId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findByUserId(userId);
    if (!application) {
      throw new NotFoundError('You have not applied to become a Senior Mentor yet');
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
    applicationId: string,
    userId: string,
    updates: UpdateSeniorMentorApplicationInput
  ): Promise<any> {
    const application = await seniorMentorApplicationRepository.findByApplicationId(applicationId);
    if (!application) {
      throw new NotFoundError('Application not found');
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

    const updated = await seniorMentorApplicationRepository.updateByApplicationId(
      applicationId,
      cleanUpdates
    );

    logger.info(`✏️ Senior Mentor application updated: ${applicationId}`);
    return updated;
  }

  async withdraw(applicationId: string, userId: string): Promise<void> {
    const application = await seniorMentorApplicationRepository.findByApplicationId(applicationId);
    if (!application) {
      throw new NotFoundError('Application not found');
    }
    if (application.userId !== userId) {
      throw new ForbiddenError('You can only withdraw your own application');
    }

    await seniorMentorApplicationRepository.softDeleteByApplicationId(applicationId);
    logger.info(`🗑️ Senior Mentor application withdrawn: ${applicationId}`);
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
  async approve(applicationId: string, adminUserId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findByApplicationId(applicationId);
    if (!application) {
      throw new NotFoundError('Application not found');
    }
    if (application.verificationStatus === ApplicationStatus.VERIFIED) {
      throw new BadRequestError('Application is already verified');
    }

    const updated = await seniorMentorApplicationRepository.updateByApplicationId(applicationId, {
      verificationStatus: ApplicationStatus.VERIFIED,
      verifiedAt: new Date(),
      verifiedBy: adminUserId,
      rejectionReason: undefined,
    });

    logger.info(`✅ Senior Mentor application approved: ${applicationId} by ${adminUserId}`);
    return updated;
  }

  async reject(applicationId: string, adminUserId: string, reason: string): Promise<any> {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Rejection reason is required');
    }

    const application = await seniorMentorApplicationRepository.findByApplicationId(applicationId);
    if (!application) {
      throw new NotFoundError('Application not found');
    }

    const updated = await seniorMentorApplicationRepository.updateByApplicationId(applicationId, {
      verificationStatus: ApplicationStatus.REJECTED,
      rejectionReason: reason,
      verifiedAt: undefined,
      verifiedBy: adminUserId,
    });

    logger.info(`❌ Senior Mentor application rejected: ${applicationId} by ${adminUserId}`);
    return updated;
  }

  async markUnderReview(applicationId: string, adminUserId: string): Promise<any> {
    const application = await seniorMentorApplicationRepository.findByApplicationId(applicationId);
    if (!application) {
      throw new NotFoundError('Application not found');
    }
    if (application.verificationStatus !== ApplicationStatus.PENDING) {
      throw new BadRequestError('Only pending applications can be moved to under review');
    }

    const updated = await seniorMentorApplicationRepository.updateByApplicationId(applicationId, {
      verificationStatus: ApplicationStatus.UNDER_REVIEW,
    });

    logger.info(`👀 Senior Mentor application marked under review: ${applicationId} by ${adminUserId}`);
    return updated;
  }
}

export default new SeniorMentorApplicationService();
