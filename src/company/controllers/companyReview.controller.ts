import { Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { companyReviewService } from '../services';
import logger from '@/shared/logger.util';
import { CreateReviewDTO, UpdateReviewDTO, ReviewFilterQuery, VoteReviewDTO } from '../interfaces';
import ResponseUtil from '@/shared/response.util';

class CompanyReviewController {

  // =====================================================
  // CREATE REVIEW — NO CHANGE (body se data aata hai)
  // =====================================================
  async createReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const data: CreateReviewDTO = req.body;
      data.reviewer = req.user!.userId;

      const review = await companyReviewService.createReview(data);
      ResponseUtil.created(res, review, 'Review created successfully');
    } catch (error: any) {
      logger.error('Error in createReview:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to create review');
    }
  }

  // =====================================================
  // GET ALL REVIEWS — NO CHANGE
  // =====================================================
  async getAllReviews(req: AuthRequest, res: Response): Promise<void> {
    try {
      const filters: ReviewFilterQuery = {
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 20,
        company: req.query.company as string,
        type: req.query.type as ReviewFilterQuery['type'],
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        maxRating: req.query.maxRating ? parseFloat(req.query.maxRating as string) : undefined,
        isVerified: req.query.isVerified === 'true',
        isPublished: req.query.isPublished !== 'false',
        sort: (req.query.sort as ReviewFilterQuery['sort']) || 'recent',
      };

      const result = await companyReviewService.getAllReviews(filters);
      ResponseUtil.success(res, {
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        total: result.total,
        hasMore: result.hasMore,
        result: result.reviews,
      }, 'Reviews fetched successfully');
    } catch (error: any) {
      logger.error('Error in getAllReviews:', error);
      ResponseUtil.error(res, 'Failed to fetch reviews');
    }
  }

  // =====================================================
  // GET REVIEW BY ID ✅ resolvedObjectId use karo
  // =====================================================
  async getReviewById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;

      const review = await companyReviewService.getReviewById(objectId);
      if (!review) {
        ResponseUtil.notFound(res, 'Review not found');
        return;
      }

      ResponseUtil.success(res, review, 'Review fetched successfully');
    } catch (error: any) {
      logger.error('Error in getReviewById:', error);
      ResponseUtil.error(res, 'Failed to fetch review');
    }
  }

  // =====================================================
  // UPDATE REVIEW ✅ resolvedObjectId use karo
  // =====================================================
  async updateReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const data: UpdateReviewDTO = req.body;

      const review = await companyReviewService.updateReview(objectId, data);
      if (!review) {
        ResponseUtil.notFound(res, 'Review not found');
        return;
      }

      ResponseUtil.success(res, review, 'Review updated successfully');
    } catch (error: any) {
      logger.error('Error in updateReview:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to update review');
    }
  }

  // =====================================================
  // DELETE REVIEW ✅ resolvedObjectId use karo
  // =====================================================
  async deleteReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;

      const deleted = await companyReviewService.deleteReview(objectId);
      if (!deleted) {
        ResponseUtil.notFound(res, 'Review not found');
        return;
      }

      ResponseUtil.success(res, null, 'Review deleted successfully');
    } catch (error: any) {
      logger.error('Error in deleteReview:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to delete review');
    }
  }

  // =====================================================
  // GET COMPANY REVIEWS ✅ resolvedObjectId use karo
  // =====================================================
  async getCompanyReviews(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyObjectId = (req as any).resolvedObjectId;
      if (!companyObjectId) {
        ResponseUtil.badRequest(res, 'Company not found');
        return;
      }

      const filters: ReviewFilterQuery = {
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 20,
        type: req.query.type as ReviewFilterQuery['type'],
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        maxRating: req.query.maxRating ? parseFloat(req.query.maxRating as string) : undefined,
        isVerified: req.query.isVerified === 'true',
        isPublished: req.query.isPublished !== 'false',
        sort: (req.query.sort as ReviewFilterQuery['sort']) || 'recent',
      };

      const result = await companyReviewService.getCompanyReviews(companyObjectId, filters);
      ResponseUtil.success(res, {
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        total: result.total,
        hasMore: result.hasMore,
        result: result.reviews,
      }, 'Company reviews fetched successfully');
    } catch (error: any) {
      logger.error('Error in getCompanyReviews:', error);
      ResponseUtil.error(res, 'Failed to fetch company reviews');
    }
  }

  // =====================================================
  // GET COMPANY STATS ✅ resolvedObjectId use karo
  // =====================================================
  async getCompanyStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyObjectId = (req as any).resolvedObjectId;

      const stats = await companyReviewService.getCompanyStats(companyObjectId);
      ResponseUtil.success(res, stats, 'Company stats fetched successfully');
    } catch (error: any) {
      logger.error('Error in getCompanyStats:', error);
      ResponseUtil.error(res, 'Failed to fetch company stats');
    }
  }

  // =====================================================
  // VOTE ON REVIEW ✅ resolvedObjectId use karo
  // =====================================================
  async voteReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { helpful } = req.body;

      const data: VoteReviewDTO = { reviewId: objectId, helpful };
      const review = await companyReviewService.voteReview(data);

      ResponseUtil.success(res, review, 'Vote recorded successfully');
    } catch (error: any) {
      logger.error('Error in voteReview:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to record vote');
    }
  }

  // =====================================================
  // ADD COMPANY RESPONSE ✅ resolvedObjectId use karo
  // =====================================================
  async addCompanyResponse(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { content } = req.body;
      const respondentId = req.user!.userId;

      const review = await companyReviewService.addCompanyResponse(objectId, respondentId, content);
      ResponseUtil.success(res, review, 'Company response added successfully');
    } catch (error: any) {
      logger.error('Error in addCompanyResponse:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to add response');
    }
  }

  // =====================================================
  // MODERATE REVIEW ✅ resolvedObjectId use karo
  // =====================================================
  async moderateReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { publish } = req.body;

      const review = await companyReviewService.moderateReview(objectId, publish);
      ResponseUtil.success(res, review, publish ? 'Review published' : 'Review unpublished');
    } catch (error: any) {
      logger.error('Error in moderateReview:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to moderate review');
    }
  }
}
 
export const companyReviewController = new CompanyReviewController();