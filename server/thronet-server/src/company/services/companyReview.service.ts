import { Company } from '../models';
import logger from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';
import reviewRepository from '../repositories/review.repository';
import companyRepository from '../repositories/company.repository';
import {
  CreateReviewDTO,
  UpdateReviewDTO,
  ReviewFilterQuery,
  ReviewListResponse,
  VoteReviewDTO,
} from '../interfaces';
import { ICompanyReviewDocument } from '../models/CompanyReview.model';
import mongoose from 'mongoose';

export class CompanyReviewService {

  private static getCacheKey = {
    review: (id: string) => `review:${id}`,
    companyReviews: (companyId: string, page: number, filters: string) =>
      `company:${companyId}:reviews:${page}:${filters}`,
    companyStats: (companyId: string) => `company:${companyId}:stats`,
    allReviews: (page: number, filters: string) => `reviews:all:${page}:${filters}`,
  };

  // =====================================================
  // CREATE REVIEW — company UUID resolve karo
  // =====================================================
  async createReview(data: CreateReviewDTO): Promise<ICompanyReviewDocument> {
    try {
      // ✅ company UUID → ObjectId resolve karo
      const company = await companyRepository.findByUUID(data.company);
      if (!company) throw new Error('Company not found');

      // duplicate check
      const existing = await reviewRepository.findByCompanyAndReviewer(
        company._id.toString(),
        data.reviewer  // UUID string
      );
      if (existing) throw new Error('You have already reviewed this company');

      const review = await reviewRepository.create({
        ...data,
        company: company._id,   // UUID → ObjectId ✅
        reviewer: data.reviewer, // UUID as string ✅ — ObjectId mat banao
      });

      // populate hata do — reviewer ab ObjectId nahi hai
      logger.info(`Review created: ${review._id}`);
      await this.clearCompanyCache(company._id.toString());

      return review;
    } catch (error: any) {
      logger.error('Error creating review:', error);
      throw error;
    }
  }

  // =====================================================
  // GET ALL REVIEWS WITH FILTERS
  // =====================================================
  async getAllReviews(filters: ReviewFilterQuery): Promise<ReviewListResponse> {
    try {
      const {
        page = 1, pageSize = 20,
        company, type, minRating, maxRating,
        isVerified, isPublished = true, sort = 'recent',
      } = filters;

      const filterString = JSON.stringify({ company, type, minRating, maxRating, isVerified, isPublished, sort });
      const cacheKey = CompanyReviewService.getCacheKey.allReviews(page, filterString);

      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      // Build query
      const query: Record<string, unknown> = {};
      if (company) query.company = company;
      if (type) query.type = type;
      if (isVerified !== undefined) query.isVerified = isVerified;
      if (isPublished !== undefined) query.isPublished = isPublished;
      if (minRating || maxRating) {
        query['rating.overall'] = {};
        if (minRating) (query['rating.overall'] as any).$gte = minRating;
        if (maxRating) (query['rating.overall'] as any).$lte = maxRating;
      }

      // Build sort
      const sortMap: Record<string, Record<string, 1 | -1>> = {
        recent: { createdAt: -1 },
        helpful: { helpfulCount: -1, createdAt: -1 },
        'rating-high': { 'rating.overall': -1, createdAt: -1 },
        'rating-low': { 'rating.overall': 1, createdAt: -1 },
      };
      const sortQuery = sortMap[sort] || sortMap.recent;

      const skip = (page - 1) * pageSize;
      const [reviews, total] = await reviewRepository.findWithFilters(
        query, sortQuery, skip, pageSize
      );

      let averageRating: number | undefined;
      if (company) {
        const stats = await reviewRepository.getCompanyStats(company);
        averageRating = stats.averageRating;
      }

      const totalPages = Math.ceil(total / pageSize);
      const response: ReviewListResponse = {
        reviews: reviews as unknown as ReviewListResponse['reviews'],
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
        averageRating,
      };

      await CacheUtil.set(cacheKey, response, 300);
      return response;
    } catch (error: any) {
      logger.error('Error fetching reviews:', error);
      throw error;
    }
  }

  // =====================================================
  // GET REVIEW BY ID (ObjectId aayega middleware se)
  // =====================================================
  async getReviewById(objectId: string): Promise<ICompanyReviewDocument | null> {
    try {
      const cacheKey = CompanyReviewService.getCacheKey.review(objectId);
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const review = await reviewRepository.findByObjectId(objectId);
      if (review) await CacheUtil.set(cacheKey, review, 3600);

      return review;
    } catch (error: any) {
      logger.error(`Error fetching review ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE REVIEW (ObjectId aayega middleware se)
  // =====================================================
  async updateReview(
    objectId: string,
    data: UpdateReviewDTO
  ): Promise<ICompanyReviewDocument | null> {
    try {
      const existing = await reviewRepository.findByObjectId(objectId);
      if (!existing) throw new Error('Review not found');

      const updated = await reviewRepository.updateByObjectId(objectId, data as any);
      if (!updated) throw new Error('Review not found');

      logger.info(`Review updated: ${objectId}`);
      await this.clearReviewCache(objectId);
      await this.clearCompanyCache(existing.company.toString());

      return updated;
    } catch (error: any) {
      logger.error(`Error updating review ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // DELETE REVIEW (ObjectId aayega middleware se)
  // =====================================================
  async deleteReview(objectId: string): Promise<boolean> {
    try {
      const existing = await reviewRepository.findByObjectId(objectId);
      if (!existing) throw new Error('Review not found');

      const companyId = existing.company.toString();
      const deleted = await reviewRepository.deleteByObjectId(objectId);

      logger.info(`Review deleted: ${objectId}`);
      await this.clearReviewCache(objectId);
      await this.clearCompanyCache(companyId);

      return deleted;
    } catch (error: any) {
      logger.error(`Error deleting review ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // VOTE ON REVIEW (ObjectId aayega middleware se)
  // =====================================================
  async voteReview(data: VoteReviewDTO): Promise<ICompanyReviewDocument> {
    try {
      // data.reviewId = ObjectId (middleware se resolve ho chuka)
      const review = await reviewRepository.incrementVote(data.reviewId, data.helpful);
      if (!review) throw new Error('Review not found');

      logger.info(`Vote recorded: ${data.reviewId}`);
      await this.clearReviewCache(data.reviewId);

      return review;
    } catch (error: any) {
      logger.error('Error voting on review:', error);
      throw error;
    }
  }

  // =====================================================
  // ADD COMPANY RESPONSE (ObjectId aayega middleware se)
  // =====================================================
  async addCompanyResponse(
    objectId: string,
    respondentId: string,
    content: string
  ): Promise<ICompanyReviewDocument> {
    try {
      const review = await reviewRepository.addResponse(objectId, respondentId, content);
      if (!review) throw new Error('Review not found');

      logger.info(`Company response added: ${objectId}`);
      await this.clearReviewCache(objectId);

      return review;
    } catch (error: any) {
      logger.error('Error adding company response:', error);
      throw error;
    }
  }

  // =====================================================
  // GET COMPANY REVIEWS (companyObjectId middleware se)
  // =====================================================
  async getCompanyReviews(
    companyObjectId: string,
    filters: ReviewFilterQuery
  ): Promise<ReviewListResponse> {
    try {
      return this.getAllReviews({ ...filters, company: companyObjectId });
    } catch (error: any) {
      logger.error('Error fetching company reviews:', error);
      throw error;
    }
  }

  // =====================================================
  // GET COMPANY STATS
  // =====================================================
  async getCompanyStats(companyObjectId: string): Promise<any> {
    try {
      const cacheKey = CompanyReviewService.getCacheKey.companyStats(companyObjectId);
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const stats = await reviewRepository.getCompanyStats(companyObjectId);
      await CacheUtil.set(cacheKey, stats, 1800);

      return stats;
    } catch (error: any) {
      logger.error('Error calculating company stats:', error);
      throw error;
    }
  }

  // =====================================================
  // MODERATE REVIEW (ObjectId aayega middleware se)
  // =====================================================
  async moderateReview(
    objectId: string,
    publish: boolean
  ): Promise<ICompanyReviewDocument> {
    try {
      const existing = await reviewRepository.findByObjectId(objectId);
      if (!existing) throw new Error('Review not found');

      const updated = await reviewRepository.setPublished(objectId, publish);
      if (!updated) throw new Error('Review not found');

      // company reviewsCount update
      const companyId = existing.company.toString();
      await Company.findByIdAndUpdate(companyId, {
        $inc: { 'stats.reviewsCount': publish ? 1 : -1 },
      });

      logger.info(`Review moderated: ${objectId} → published: ${publish}`);
      await this.clearReviewCache(objectId);
      await this.clearCompanyCache(companyId);

      return updated;
    } catch (error: any) {
      logger.error('Error moderating review:', error);
      throw error;
    }
  }

  // =====================================================
  // VERIFY REVIEW (ObjectId aayega middleware se)
  // =====================================================
  async verifyReview(objectId: string): Promise<ICompanyReviewDocument> {
    try {
      const updated = await reviewRepository.setVerified(objectId);
      if (!updated) throw new Error('Review not found');

      await this.clearReviewCache(objectId);
      return updated;
    } catch (error: any) {
      logger.error('Error verifying review:', error);
      throw error;
    }
  }

  // =====================================================
  // CACHE HELPERS
  // =====================================================
  private async clearReviewCache(objectId: string): Promise<void> {
    await CacheUtil.del(CompanyReviewService.getCacheKey.review(objectId));
  }

  private async clearCompanyCache(companyId: string): Promise<void> {
    await CacheUtil.clearByPattern(`company:${companyId}:*`);
    await CacheUtil.clearByPattern('reviews:all:*');
  }
}

export default new CompanyReviewService();