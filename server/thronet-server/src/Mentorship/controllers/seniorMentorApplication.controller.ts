// controllers/seniorMentorApplication.controller.ts
import { Response, NextFunction } from 'express';
import seniorMentorApplicationService from '../services/seniorMentorApplication.service';
import {
  ApplicationFilters,
  ApplicationStatus,
  CreateSeniorMentorApplicationInput,
  UpdateSeniorMentorApplicationInput,
} from '@/Mentorship/interface/seniorMentorApplication.types';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import PaginationHelper from '@/Mentorship/utils/pagination';
import { Domain } from '@/shared/constants/domains';

/**
 * True when the error is the service's "not found" error.
 * Checks name and statusCode so it works regardless of how NotFoundError is defined.
 */
function isNotFoundError(error: any): boolean {
  return (
    error?.name === 'NotFoundError' ||
    error?.statusCode === 404 ||
    error?.status === 404
  );
}

class SeniorMentorApplicationController {
  /**
   * @route   POST /api/v1/mentorship/senior-mentor-applications/apply
   * @access  Private
   */
  async apply(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const profilePhotoFile = files?.['profilePhoto']?.[0];
      const resumeFile = files?.['resume']?.[0];
      const proofDocumentFile = files?.['proofDocument']?.[0];

      if (!profilePhotoFile || !resumeFile || !proofDocumentFile) {
        ResponseHandler.badRequest(
          res,
          'Profile photo, resume, and proof of experience/achievement are all required'
        );
        return;
      }

      const input: CreateSeniorMentorApplicationInput = {
        userId: req.user!.id,
        mentorRole: req.body.mentorRole,
        fullName: req.body.fullName,
        college: req.body.college,
        degree: req.body.degree,
        fieldOfStudy: req.body.fieldOfStudy,
        graduationYear: Number(req.body.graduationYear),
        currentRole: req.body.currentRole,
        currentCompany: req.body.currentCompany,
        shortBio: req.body.shortBio,

        linkedinUrl: req.body.linkedinUrl,
        githubUrl: req.body.githubUrl,
        portfolioUrl: req.body.portfolioUrl,
        yearsOfExperience: Number(req.body.yearsOfExperience),
        experienceLevel: req.body.experienceLevel,
        primaryExpertise: req.body.primaryExpertise as Domain,
        otherSkills: req.body.otherSkills,
        technologies: req.body.technologies,
        achievements: req.body.achievements,
        certifications: req.body.certifications,

        helpAreas: req.body.helpAreas,

        motivation: req.body.motivation,
        adviceToJuniorSelf: req.body.adviceToJuniorSelf,

        profilePhotoFile,
        resumeFile,
        proofDocumentFile,
      };

      const application = await seniorMentorApplicationService.apply(input);

      logger.info(`Senior Mentor application created: ${application.seniorMentorId}`);
      ResponseHandler.created(
        res,
        'Application submitted successfully. Our team will review it shortly.',
        application
      );
    } catch (error: any) {
      logger.error('Error submitting senior mentor application:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/senior-mentor-applications/me
   * @access  Private
   *
   * A user who has not applied yet is a normal state, not an error:
   * respond 200 with `data: null` so the client can branch on it and the
   * server does not log a stack trace for every first-time visitor.
   */
  async getMyApplication(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await seniorMentorApplicationService.getByUserId(req.user!.id);
      ResponseHandler.success(res, 'Application fetched successfully', application);
    } catch (error: any) {
      if (isNotFoundError(error)) {
        logger.info(`No senior mentor application found for user ${req.user?.id}`);
        ResponseHandler.success(res, 'No application found', null);
        return;
      }
      logger.error('Error fetching own senior mentor application:', error);
      next(error);
    }
  }

  /**
   * @route   PUT /api/v1/mentorship/senior-mentor-applications/me
   * @access  Private (application owner only)
   */
  async updateMyApplication(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await seniorMentorApplicationService.getByUserId(req.user!.id);

      const updates: UpdateSeniorMentorApplicationInput = { ...req.body };
      (Object.keys(updates) as (keyof UpdateSeniorMentorApplicationInput)[]).forEach((key) => {
        if (updates[key] === undefined) delete updates[key];
      });

      const application = await seniorMentorApplicationService.update(
        existing.seniorMentorId,
        req.user!.id,
        updates
      );

      ResponseHandler.success(res, 'Application updated successfully', application);
    } catch (error: any) {
      logger.error('Error updating senior mentor application:', error);
      next(error);
    }
  }

  /**
   * @route   DELETE /api/v1/mentorship/senior-mentor-applications/me
   * @access  Private (application owner only)
   */
  async withdrawMyApplication(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await seniorMentorApplicationService.getByUserId(req.user!.id);
      await seniorMentorApplicationService.withdraw(existing.seniorMentorId, req.user!.id);

      ResponseHandler.success(res, 'Application withdrawn successfully');
    } catch (error: any) {
      logger.error('Error withdrawing senior mentor application:', error);
      next(error);
    }
  }

  /**
   * @route   PUT /api/v1/mentorship/senior-mentor-applications/me/profile-photo
   * @access  Private (application owner only)
   *
   * Application na ho to 404 deta hai; frontend isko "user senior mentor
   * nahi hai" maan kar chup-chaap skip karta hai.
   */
  async updateMyProfilePhoto(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        ResponseHandler.badRequest(res, 'Profile photo is required');
        return;
      }

      const application = await seniorMentorApplicationService.updateProfilePhoto(
        req.user!.id,
        req.file
      );
      ResponseHandler.success(res, 'Profile photo updated successfully', application);
    } catch (error: any) {
      if (isNotFoundError(error)) {
        res.status(404).json({ success: false, message: 'No senior mentor application found' });
        return;
      }
      logger.error('Error updating senior mentor profile photo:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/senior-mentor-applications/:id/profile
   * @access  Private
   */
  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      logger.info(`Entering getProfile for User ID: ${userId}`);

      const application = await seniorMentorApplicationService.getByUserId(userId);

      if (!application) {
        res.status(404).json({ success: false, message: 'Application profile not found' });
        return;
      }

      if (String(application.userId) !== String(req.user!.id)) {
        logger.warn(`403 Forbidden: DB userId (${application.userId}) !== req.user.id (${req.user?.id})`);
        res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have permission to view this application profile.',
        });
        return;
      }

      logger.info(`Proceeding to return app completely`);
      ResponseHandler.success(res, 'Application profile fetched successfully', application);
    } catch (error: any) {
      logger.error('Error fetching senior mentor application profile:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/senior-mentors
   * @access  Public
   */
  async listPublicSeniorMentors(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit: requestedLimit } = PaginationHelper.validateParams(
        Number(req.query.page),
        Number(req.query.limit)
      );
      const limit = Math.min(50, requestedLimit);
      const { mentors, total } = await seniorMentorApplicationService.listPublicSeniorMentors(
        page,
        limit
      );

      ResponseHandler.paginated(
        res,
        'Senior mentors retrieved successfully',
        mentors,
        page,
        limit,
        total
      );
    } catch (error: any) {
      logger.error('Error listing public senior mentors:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/senior-mentors/:id
   * @access  Public
   */
  async getPublicSeniorMentorById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const mentor = await seniorMentorApplicationService.getPublicSeniorMentorByUserId(
        req.params.id
      );
      ResponseHandler.success(res, 'Senior mentor retrieved successfully', mentor);
    } catch (error: any) {
      logger.error('Error retrieving public senior mentor:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/senior-mentor-applications/:id
   * @access  Private (Admin)
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await seniorMentorApplicationService.getBySeniorMentorId(req.params.id);
      ResponseHandler.success(res, 'Application fetched successfully', application);
    } catch (error: any) {
      logger.error('Error fetching senior mentor application:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/senior-mentor-applications
   * @access  Private (Admin)
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, status, primaryExpertise, search } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const filters: ApplicationFilters = {
        verificationStatus: status as ApplicationStatus | undefined,
        primaryExpertise: primaryExpertise as Domain | undefined,
        search: search as string | undefined,
      };

      const { applications, total } = await seniorMentorApplicationService.list(
        filters,
        validPage,
        validLimit,
        PaginationHelper.getSkip(validPage, validLimit)
      );

      ResponseHandler.paginated(
        res,
        'Applications retrieved successfully',
        applications,
        validPage,
        validLimit,
        total
      );
    } catch (error: any) {
      logger.error('Error listing senior mentor applications:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/senior-mentor-applications/:id/under-review
   * @access  Private (Admin)
   */
  async markUnderReview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await seniorMentorApplicationService.markUnderReview(
        req.params.id,
        req.user!.id
      );
      ResponseHandler.success(res, 'Application marked as under review', application);
    } catch (error: any) {
      logger.error('Error updating review status:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/senior-mentor-applications/:id/approve
   * @access  Private (Admin)
   */
  async approve(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await seniorMentorApplicationService.approve(
        req.params.id,
        req.user!.id
      );
      ResponseHandler.success(res, 'Application approved successfully', application);
    } catch (error: any) {
      logger.error('Error approving senior mentor application:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/senior-mentor-applications/:id/reject
   * @access  Private (Admin)
   */
  async reject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.body.reason) {
        ResponseHandler.badRequest(res, 'Rejection reason is required');
        return;
      }

      const application = await seniorMentorApplicationService.reject(
        req.params.id,
        req.user!.id,
        req.body.reason
      );
      ResponseHandler.success(res, 'Application rejected', application);
    } catch (error: any) {
      logger.error('Error rejecting senior mentor application:', error);
      next(error);
    }
  }
}

export default new SeniorMentorApplicationController();