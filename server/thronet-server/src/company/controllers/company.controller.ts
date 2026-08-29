import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import { companyService } from '../services';
import ResponseUtil from '@/shared/response.util';
import { CreateCompanyDTO, UpdateCompanyDTO, CompanyFilterQuery } from '../interfaces';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateSecureId, sanitizeInput } from '@/shared/security.js';
import { withLock } from '@/shared/utils/withLocks';
import logger from '@/shared/logger.util';
import constants from '@/shared/constants.util';
import {
  ValidationError,
  NotFoundError,
  TooManyRequestsError,
} from '@/shared/errors/app.error';
import { Company, CompanyReview } from '../models';
import CacheUtil from '@/shared/cache.util';
import { validatePaginationParams, validateCompanyId, validateReviewInput } from '@/Job-Service/validations';
import { UserInteractionModel } from '@/Job-Service/models';
import { User } from '@/auth/models';

const RATE_LIMITS = {
  POST_REVIEW: {
    windowMs: 86400000, // 24 hours
  },
};

// ============================================================
// HELPER: Get resolved ObjectId from request
// Set by resolveCompanyUUID middleware
// ============================================================
const getObjectId = (req: Request): string => {
  const objectId = (req as any).resolvedObjectId;
  if (!objectId) {
    throw new Error('resolvedObjectId missing — resolveCompanyUUID middleware not applied');
  }
  return objectId;
};

// ============================================================
// Request context + timing helper
// ============================================================
const withCompanyContext = (handler: (req: Request, res: Response) => Promise<void | any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 800) {
        logger.warn(`[${requestId}] Slow company operation`, { duration, path: req.path });
      }
    }
  };

// ============================================================
// STANDALONE CONTROLLERS (non-class based)
// These use companyId (UUID) directly, not ObjectId
// ============================================================

// GET /companies/:companyId  (Job-Service route — uses companyId UUID directly)
export const getCompanyPageController = withCompanyContext(async (req: Request, res: Response) => {
  const { error } = validateCompanyId(req.params);
  if (error) throw new ValidationError('Invalid company ID', [error.message]);

  const { companyId } = req.params;
  const sanitizedCompanyId = sanitizeInput(companyId);
  const cacheKey = `company_page:${sanitizedCompanyId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    return ResponseUtil.success(res, { ...parsed, cached: true }, 'DATA_RETRIEVED');
  }

  const company = await Company.findOne({ companyId: sanitizedCompanyId, 'audit.isDeleted': false });
  if (!company) throw new NotFoundError('Company');

  const [jobCountResult] = await Promise.all([
    Company.aggregate([
      { $match: { companyId: sanitizedCompanyId } },
      { $lookup: { from: 'jobs', localField: 'companyId', foreignField: 'companyId', as: 'jobs' } },
      { $project: { jobCount: { $size: '$jobs' } } },
    ]),
  ]);

  const jobCount = jobCountResult[0]?.jobCount || 0;
  const similarCompanies: [] = [];

  const responseData = {
    companyId: company.companyId,
    companyName: company.companyName,
    displayName: company.displayName,
    description: company.descriptions.detailed,
    shortDescription: company.descriptions.short,
    tagline: company.descriptions.tagline,
    industry: company.industry,
    subIndustry: company.subIndustry,
    companyType: company.companyType,
    companySize: company.companySize,
    foundedYear: company.foundedYear,
    growthMetrics: company.growthMetrics,
    website: company.website,
    email: company.email,
    phone: company.phone,
    headquarters: company.headquarters,
    socialLinks: company.socialMedia,
    jobCount,
    similarCompanies: similarCompanies.map((c: any) => ({
      companyId: c.metadata.companyId,
      companyName: c.metadata.companyName,
      similarityScore: c.score,
    })),
    analytics: {
      viewCount: company.analytics?.viewCount || 0,
      applicationCount: company.analytics?.applicationCount || 0,
      engagementScore: company.analytics?.engagementScore || 0,
      totalReviews: company.relationships?.totalReviewsCount || 0,
      averageRating: company.relationships?.averageRating || 0,
    },
  };

  await CacheUtil.set(cacheKey, JSON.stringify(responseData), Number(constants.CACHE_TTLS.COMPANY_PAGE));

  setImmediate(async () => {
    try {
      await UserInteractionModel.create({
        activityId: generateSecureId(),
        userId: (req as any).user?.id || 'anonymous',
        activityType: 'COMPANY_PAGE_VIEW',
        metadata: { companyId: sanitizedCompanyId },
        timestamp: new Date(),
      });
    } catch (bgErr) {
      logger.error('Background company view analytics failed', { error: bgErr });
    }
  });

  ResponseUtil.success(res, responseData, 'DATA_RETRIEVED');
});

// POST/GET /companies/:companyId/reviews
export const employeeReviewsController = withCompanyContext(async (req: Request, res: Response): Promise<any> => {
  const { error: idError } = validateCompanyId(req.params);
  if (idError) throw new ValidationError('Invalid company ID', [idError.message]);

  const { companyId } = req.params;
  const sanitizedCompanyId = sanitizeInput(companyId);

  if (req.method === 'POST') {
    const { error: reviewError } = validateReviewInput(req.body);
    if (reviewError) throw new ValidationError('Invalid review input', reviewError.details);

    const { userId, rating, comment, role, tenure } = req.body;
    const reviewKey = `review:${sanitizedCompanyId}:${userId}`;

    await withLock(reviewKey, 5000, async () => {
      const existing = await CacheUtil.get(reviewKey);
      if (existing) {
        throw new TooManyRequestsError('You have already submitted a review for this company');
      }

      const reviewId = generateSecureId();
      const sanitizedReview = {
        reviewId,
        userId: sanitizeInput(userId),
        rating: parseInt(rating),
        comment: sanitizeInput(comment),
        role: sanitizeInput(role),
        tenure: sanitizeInput(tenure),
        createdAt: new Date(),
      };

      await Company.updateOne(
        { companyId: sanitizedCompanyId },
        {
          $push: { reviews: sanitizedReview },
          $inc: {
            'analytics.reviewCount': 1,
            'analytics.averageRating': sanitizedReview.rating,
          },
        }
      );

      await CacheUtil.set(
        reviewKey,
        JSON.stringify({ reviewId, submittedAt: Date.now() }),
        RATE_LIMITS.POST_REVIEW.windowMs / 1000
      );

      setImmediate(async () => {
        try {
          await UserInteractionModel.create({
            activityId: generateSecureId(),
            userId: sanitizedReview.userId,
            activityType: 'EMPLOYEE_REVIEW_SUBMITTED',
            metadata: { companyId: sanitizedCompanyId, rating: sanitizedReview.rating },
          });
        } catch (err) {
          logger.error('Background review analytics failed', { error: err });
        }
      });

      ResponseUtil.created(
        res,
        { reviewId, companyId: sanitizedCompanyId, rating: sanitizedReview.rating, comment: sanitizedReview.comment },
        'Review submitted successfully'
      );
    });
  } else {
    const { error: pagError } = validatePaginationParams(req.query);
    if (pagError) throw new ValidationError('Invalid pagination parameters', pagError.details);

    const { cursor = '0', limit = '20' } = req.query;
    const cacheKey = `employee_reviews:${sanitizedCompanyId}:${cursor}:${limit}`;

    const cached = await CacheUtil.get(cacheKey);
    if (cached) return ResponseUtil.success(res, JSON.parse(cached));

    const company = await Company.findOne({ companyId: sanitizedCompanyId, 'audit.isDeleted': false });
    if (!company) throw new NotFoundError('Company');

    const allReviews = await CompanyReview.findByCompany(company._id.toString());
    const start = parseInt(cursor as string);
    const paginatedReviews = allReviews.slice(start, start + parseInt(limit as string));
    const companyStats = await CompanyReview.getCompanyStats(company._id.toString());

    const responseData = {
      companyId: sanitizedCompanyId,
      reviews: paginatedReviews.map((r: any) => ({
        reviewId: r._id?.toString(),
        title: r.title,
        content: r.content,
        rating: r.rating,
        type: r.type,
        pros: r.pros || [],
        cons: r.cons || [],
        recommendToOthers: r.recommendToOthers,
        helpfulCount: r.helpfulCount,
        notHelpfulCount: r.notHelpfulCount,
        helpfulnessScore: r.helpfulnessScore,
        isVerified: r.isVerified,
        createdAt: r.createdAt,
      })),
      pagination: {
        nextCursor:
          paginatedReviews.length === parseInt(limit as string)
            ? start + parseInt(limit as string)
            : null,
        totalReviews: allReviews.length,
        limit: parseInt(limit as string),
      },
      analytics: {
        averageRating: companyStats.averageRating,
        totalReviews: companyStats.totalReviews,
        categoryAverages: companyStats.categoryAverages,
        recommendationRate: companyStats.recommendationRate,
        ratingDistribution: companyStats.ratingDistribution,
      },
    };

    await CacheUtil.set(cacheKey, JSON.stringify(responseData), Number(constants.CACHE_TTLS.EMPLOYEE_REVIEWS));
    ResponseUtil.success(res, responseData, 'DATA_RETRIEVED');
  }
});

export const getCompanyCultureInfoController = withCompanyContext(async (req: Request, res: Response): Promise<any> => {
  const { error } = validateCompanyId(req.params);
  if (error) throw new ValidationError('Invalid company ID', [error.message]);

  const { companyId } = req.params;
  const sanitizedCompanyId = sanitizeInput(companyId);
  const cacheKey = `company_culture:${sanitizedCompanyId}`;

  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ResponseUtil.success(res, { ...JSON.parse(cached), cached: true }, 'DATA_RETRIEVED');
  }

  const company = await Company.findOne({ companyId: sanitizedCompanyId, 'audit.isDeleted': false });
  if (!company) throw new NotFoundError('Company');

  const companyReviews = await CompanyReview.findByCompany(company._id.toString()).limit(5);
  const companyStats = await CompanyReview.getCompanyStats(company._id.toString());

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const cultureData = {
    description: company.descriptions.detailed || company.descriptions.short || '',
    reviews: companyReviews.map((r: any) => r.content).join(' ') || '',
    tagline: company.descriptions.tagline || '',
    industry: company.industry || 'unknown',
  };

  const prompt = `Generate a concise company culture summary (100-150 words) for a company in the ${cultureData.industry} industry. Use the following details: Description: ${cultureData.description}, Recent Reviews: ${cultureData.reviews}, Tagline: ${cultureData.tagline}. Highlight key cultural aspects such as values, work environment, and employee engagement. Ensure a professional tone.`;

  const result = await model.generateContent(prompt);
  const cultureSummary = result.response.text();

  const responseData = {
    companyId: sanitizedCompanyId,
    cultureSummary,
    employeeFeedback: companyReviews.slice(0, 3).map((r: any) => ({
      reviewId: r._id?.toString(),
      title: r.title,
      content: r.content,
      rating: r.rating.overall,
      type: r.type,
      pros: r.pros || [],
      cons: r.cons || [],
      recommendToOthers: r.recommendToOthers,
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt,
    })),
    analytics: {
      engagementScore: company.analytics?.engagementScore || 0,
      totalReviews: companyStats.totalReviews,
      averageRating: companyStats.averageRating,
      categoryAverages: companyStats.categoryAverages,
      recommendationRate: companyStats.recommendationRate,
      ratingDistribution: companyStats.ratingDistribution,
    },
  };

  await CacheUtil.set(cacheKey, JSON.stringify(responseData), Number(constants.CACHE_TTLS.COMPANY_CULTURE));

  setImmediate(async () => {
    try {
      await UserInteractionModel.create({
        activityId: generateSecureId(),
        userId: (req as any).user?.id || 'anonymous',
        activityType: 'CULTURE_INFO_VIEW',
        metadata: { companyId: sanitizedCompanyId },
      });
    } catch (err) {
      logger.error('Background culture view analytics failed', { error: err });
    }
  });

  ResponseUtil.success(res, responseData, 'DATA_RETRIEVED');
});

// ============================================================
// CLASS-BASED CONTROLLER
// All /:id methods use getObjectId(req) → req.resolvedObjectId
// Set by resolveCompanyUUID middleware before reaching controller
// ============================================================

class CompanyController {
  /**
   * Create a new company
   * POST /api/companies
   * No UUID resolution needed — no /:id param
   */
  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const body = req.body;
      const createdBy = body.createdBy || req.user?.id || req.user?.userId || 'system';

      console.log('Creating company with data:', body, 'Created by user ID:', createdBy);
      // Schema size values → Model CompanySize enum mapping
      const sizeMap: Record<string, string> = {
        '1-10': '1-10',
        '11-50': '11-50',
        '51-200': '51-200',
        '201-500': '201-500',
        '501-1000': '501-1000',
        '1001-5000': '1001-5000',
        '5000+': '5000+',
      };

      const data = {
        companyName: body.companyName,
        email: body.email,
        phone: body.phone,
        website: body.website,
        industry: body.industry,
        companyType: body.companyType || 'SME',
        companySize: sizeMap[body.size] || body.size,
        foundedYear: body.founded,
        headquarters: body.headquarters,
        descriptions: body.descriptions,
        socialMedia: body.socialMedia,
        displayName: body.displayName,
        logo: body.logo,
        banner: body.banner,
        audit: {
          createdBy: createdBy,
          version: 1,
          isDeleted: false,
        },
        account: {
          status: 'Active',
          isVerified: false,
        },
      };

      const company = await companyService.create(data as any, createdBy);
      try {
        await User.findOneAndUpdate(
          { userId: createdBy },
          { $set: { companyId: company.companyId } }
        );
        logger.info(`CompanyId ${company.companyId} saved to user ${createdBy}`);
      } catch (userUpdateErr) {
        logger.warn(`Failed to save companyId to user: ${userUpdateErr}`);
        // Non-blocking — company already created, sirf log karo
      }
      logger.info(`Company created: ${company._id} by user: ${createdBy}`);
      ResponseUtil.created(res, company, 'Company created successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error creating company: ${err.message}`, { error, userId: req.user?.id });

      if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 11000) {
        ResponseUtil.conflict(res, 'Company with this name or slug already exists');
        return;
      }

      ResponseUtil.error(res, err.message || 'Failed to create company', 500);
    }
  }

  /**
   * Get all companies with filters
   * GET /api/companies
   * No /:id param — no UUID resolution needed
   */
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const query: CompanyFilterQuery = req.query;
      const result = await companyService.getAll(query);
      logger.info(`Fetched companies: page ${result.page}, total ${result.total}`);

      ResponseUtil.success(
        res,
        {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
          hasMore: result.hasMore,
          response: result.companies,
        },
        'Companies fetched successfully'
      );
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching companies: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch companies', 500);
    }
  }

  /**
   * Get company by ID
   * GET /api/companies/:id  (UUID in params, ObjectId resolved by middleware)
   */
  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      // resolveCompanyUUID middleware already validated UUID + found company
      // ObjectId is attached here
      const objectId = getObjectId(req);

      const company = await companyService.getById(objectId);

      if (!company) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Fetched company by UUID: ${req.params.id} → ObjectId: ${objectId}`);
      ResponseUtil.success(res, company, 'Company fetched successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching company by UUID ${req.params.id}: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch company', 500);
    }
  }

  /**
   * Get company by slug
   * GET /api/companies/:slug/slug
   * Uses slug param — no UUID resolution needed
   */
  async getBySlug(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { slug } = req.params;

      if (!slug || typeof slug !== 'string') {
        ResponseUtil.badRequest(res, 'Valid company slug is required');
        return;
      }

      const company = await companyService.getBySlug(slug);

      if (!company) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Fetched company by slug: ${slug}`);
      ResponseUtil.success(res, company, 'Company fetched successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching company by slug ${req.params.slug}: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch company', 500);
    }
  }

  /**
   * Update company
   * PUT /api/companies/:id  (UUID → ObjectId via middleware)
   */
  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);
      const data: UpdateCompanyDTO = req.body;
      const updatedBy = req.body.updatedBy || req.user?.id || req.user?.userId || 'system';

      const company = await companyService.update(objectId, data, updatedBy);

      if (!company) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Company updated: UUID ${req.params.id} → ObjectId ${objectId} by user: ${updatedBy}`);
      ResponseUtil.success(res, company, 'Company updated successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error updating company ${req.params.id}: ${err.message}`, { error, userId: req.user?.id });
      ResponseUtil.error(res, err.message || 'Failed to update company', 500);
    }
  }

  /**
   * Partial update company
   * PATCH /api/companies/:id  (UUID → ObjectId via middleware)
   */
  async partialUpdate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);
      const data: Partial<UpdateCompanyDTO> = req.body;
      const updatedBy = req.body.updatedBy || req.user?.id || req.user?.userId || 'system';

      const company = await companyService.partialUpdate(objectId, data, updatedBy);

      if (!company) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Company partially updated: UUID ${req.params.id} → ObjectId ${objectId} by user: ${updatedBy}`);
      ResponseUtil.success(res, company, 'Company updated successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error partially updating company ${req.params.id}: ${err.message}`, { error, userId: req.user?.id });
      ResponseUtil.error(res, err.message || 'Failed to update company', 500);
    }
  }

  /**
   * Soft delete company
   * DELETE /api/companies/:id  (UUID → ObjectId via middleware)
   */
  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);
      const updatedBy = req.user?.id || req.user?.userId || 'system';

      const company = await companyService.softDelete(objectId);

      if (!company) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Company soft deleted: UUID ${req.params.id} → ObjectId ${objectId} by user: ${updatedBy}`);
      ResponseUtil.success(res, company, 'Company deleted successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error deleting company ${req.params.id}: ${err.message}`, { error, userId: req.user?.id });
      ResponseUtil.error(res, err.message || 'Failed to delete company', 500);
    }
  }

  /**
   * Search companies by text
   * GET /api/companies/search — no /:id, no UUID resolution
   */
  async search(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { q, page = '1', pageSize = '20' } = req.query;

      if (!q || typeof q !== 'string') {
        ResponseUtil.badRequest(res, 'Search query (q) is required');
        return;
      }

      const result = await companyService.search(q, Number(page), Number(pageSize));

      logger.info(`Search completed: "${q}", page ${result.page}, total ${result.total}`);
      ResponseUtil.success(
        res,
        {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
          hasMore: result.hasMore,
          result: result.companies,
        },
        'Search completed successfully'
      );
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error searching companies: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Search failed', 500);
    }
  }

  /**
   * Get popular companies
   * GET /api/companies/popular — no /:id, no UUID resolution
   */
  async getPopular(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { limit = '10' } = req.query;
      const companies = await companyService.getPopular(Number(limit));

      logger.info(`Fetched popular companies: limit ${limit}`);
      ResponseUtil.success(res, companies, 'Popular companies fetched successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching popular companies: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch popular companies', 500);
    }
  }

  /**
   * Get nearby companies
   * GET /api/companies/nearby — no /:id, no UUID resolution
   */
  async getNearby(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { longitude, latitude, maxDistance = '50000' } = req.query;

      if (!longitude || !latitude || isNaN(Number(longitude)) || isNaN(Number(latitude))) {
        ResponseUtil.badRequest(res, 'Valid longitude and latitude are required');
        return;
      }

      const companies = await companyService.getNearby(
        Number(longitude),
        Number(latitude),
        Number(maxDistance)
      );

      logger.info(`Fetched nearby companies: lat ${latitude}, lng ${longitude}`);
      ResponseUtil.success(res, companies, 'Nearby companies fetched successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching nearby companies: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch nearby companies', 500);
    }
  }

  /**
   * Verify company
   * PATCH /api/companies/:id/verify  (UUID → ObjectId via middleware)
   */
  async verify(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);
      const updatedBy = req.user?.id || req.user?.userId || 'system';

      const company = await companyService.verify(objectId);

      if (!company) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Company verified: UUID ${req.params.id} → ObjectId ${objectId} by user: ${updatedBy}`);
      ResponseUtil.success(res, company, 'Company verified successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error verifying company ${req.params.id}: ${err.message}`, { error, userId: req.user?.id });
      ResponseUtil.error(res, err.message || 'Failed to verify company', 500);
    }
  }

  /**
   * Update social links
   * PATCH /api/companies/:id/social  (UUID → ObjectId via middleware)
   */
  async updateSocialLinks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);
      const { socialLinks } = req.body;
      const updatedBy = req.user?.id || req.user?.userId || 'system';

      if (!socialLinks || typeof socialLinks !== 'object') {
        ResponseUtil.badRequest(res, 'Valid social links object is required');
        return;
      }

      const company = await companyService.updateSocialLinks(objectId, socialLinks);

      if (!company) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Social links updated: UUID ${req.params.id} → ObjectId ${objectId} by user: ${updatedBy}`);
      ResponseUtil.success(res, company, 'Social links updated successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error updating social links for company ${req.params.id}: ${err.message}`, { error, userId: req.user?.id });
      ResponseUtil.error(res, err.message || 'Failed to update social links', 500);
    }
  }

  /**
   * Get company statistics
   * GET /api/companies/:id/stats  (UUID → ObjectId via middleware)
   */
  async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);

      const stats = await companyService.getStats(objectId);

      if (!stats) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Fetched stats for UUID: ${req.params.id} → ObjectId: ${objectId}`);
      ResponseUtil.success(res, stats, 'Company stats fetched successfully');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching stats for company ${req.params.id}: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch company stats', 500);
    }
  }

  /**
   * Get company posts
   * GET /api/companies/:id/posts  (UUID → ObjectId via middleware)
   */
  async getPosts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);

      // exists() uses ObjectId internally
      const exists = await companyService.exists(objectId);

      if (!exists) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Placeholder: Fetching posts for UUID ${req.params.id} → ObjectId ${objectId}`);
      ResponseUtil.success(res, [], 'Company posts will be available after Post Service integration');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching posts for company ${req.params.id}: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch company posts', 500);
    }
  }

  /**
   * Get company followers
   * GET /api/companies/:id/followers  (UUID → ObjectId via middleware)
   */
  async getFollowers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const objectId = getObjectId(req);

      const exists = await companyService.exists(objectId);

      if (!exists) {
        ResponseUtil.notFound(res, 'Company not found');
        return;
      }

      logger.info(`Placeholder: Fetching followers for UUID ${req.params.id} → ObjectId ${objectId}`);
      ResponseUtil.success(res, [], 'Company followers will be available after Follower Service integration');
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error fetching followers for company ${req.params.id}: ${err.message}`);
      ResponseUtil.error(res, err.message || 'Failed to fetch company followers', 500);
    }
  }
}

export default new CompanyController();