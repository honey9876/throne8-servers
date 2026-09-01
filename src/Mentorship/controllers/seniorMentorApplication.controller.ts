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

      logger.info(`Senior Mentor application created: ${application.applicationId}`);
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
   */
  async getMyApplication(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await seniorMentorApplicationService.getByUserId(req.user!.id);
      ResponseHandler.success(res, 'Application fetched successfully', application);
    } catch (error: any) {
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
        existing.applicationId,
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
      await seniorMentorApplicationService.withdraw(existing.applicationId, req.user!.id);

      ResponseHandler.success(res, 'Application withdrawn successfully');
    } catch (error: any) {
      logger.error('Error withdrawing senior mentor application:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/senior-mentor-applications/:id
   * @access  Private (Admin)
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await seniorMentorApplicationService.getByApplicationId(req.params.id);
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
