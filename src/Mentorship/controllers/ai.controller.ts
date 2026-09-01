// src/controllers/ai.controller.ts
import { AppError } from '@/shared/errors/app.error';
import { aiService, recommendationService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { Request, Response, NextFunction } from 'express';


export class AIController {
    /**
     * @route   GET /api/v1/ai/match
     * @desc    Get AI-powered mentor matches
     * @access  Private
     */
    async getMatchedMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                throw new AppError('User ID not found', 401);
            }

            const {
                limit = 10,
                minScore = 40,
                refresh = false,
                domains,
                maxPrice,
            } = req.query;

            const options = {
                limit: parseInt(limit as string, 10),
                minScore: parseInt(minScore as string, 10),
                refresh: refresh === 'true',
                domains: domains ? (domains as string).split(',') : undefined,
                maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
            };

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`AI Match request from user: ${userId}`);

            const result = await aiService.getMatchedMentors(userId, options, authToken);

            ResponseHandler.success(
                res,
                'AI matches retrieved successfully',
                result,
                200
            );
        } catch(error : any) {
            logger.error('Get matched mentors error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/match/:mentorId
     * @desc    Get match explanation for specific mentor
     * @access  Private
     */
    async getMatchExplanation(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            const { mentorId } = req.params;

            if (!userId) {
                throw new AppError('User ID not found', 401);
            }

            if (!mentorId) {
                throw new AppError('Mentor ID is required', 400);
            }

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Match explanation request: user=${userId}, mentor=${mentorId}`);

            const matchResult = await aiService.getMatchExplanation(
                userId,
                mentorId,
                authToken
            );

            ResponseHandler.success(
                res,
                'Match explanation retrieved successfully',
                matchResult,
                200
            );
        } catch(error : any) {
            logger.error('Get match explanation error:', error);
            next(error);
        }
    }

    /**
     * @route   POST /api/v1/ai/refresh
     * @desc    Refresh AI matches (clear cache)
     * @access  Private
     */
    async refreshMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                throw new AppError('User ID not found', 401);
            }

            logger.info(`Refresh matches request from user: ${userId}`);

            await aiService.refreshMatches(userId);

            ResponseHandler.success(
                res,
                'Matches refreshed successfully. New matches will be calculated on next request.',
                { message: 'Cache cleared', userId },
                200
            );
        } catch(error : any) {
            logger.error('Refresh matches error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/featured
     * @desc    Get featured mentors
     * @access  Public
     */
    async getFeaturedMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { limit = 10, refresh = false } = req.query;

            const options = {
                limit: parseInt(limit as string, 10),
                refresh: refresh === 'true',
            };

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Featured mentors request: limit=${options.limit}`);

            const mentors = await recommendationService.getFeaturedMentors(
                options,
                authToken
            );

            ResponseHandler.success(
                res,
                'Featured mentors retrieved successfully',
                {
                    mentors,
                    total: mentors.length,
                    limit: options.limit,
                },
                200
            );
        } catch(error : any) {
            logger.error('Get featured mentors error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/top-rated
     * @desc    Get top rated mentors
     * @access  Public
     */
    async getTopRatedMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const {
                limit = 10,
                minRating = 4.5,
                minReviews = 5,
            } = req.query;

            const options = {
                limit: parseInt(limit as string, 10),
                minRating: parseFloat(minRating as string),
                minReviews: parseInt(minReviews as string, 10),
            };

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Top rated mentors request: limit=${options.limit}, minRating=${options.minRating}`);

            const mentors = await recommendationService.getTopRatedMentors(
                options,
                authToken
            );

            ResponseHandler.success(
                res,
                'Top rated mentors retrieved successfully',
                {
                    mentors,
                    total: mentors.length,
                    filters: {
                        minRating: options.minRating,
                        minReviews: options.minReviews,
                    },
                },
                200
            );
        } catch(error : any) {
            logger.error('Get top rated mentors error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/trending
     * @desc    Get trending mentors
     * @access  Public
     */
    async getTrendingMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { limit = 10, daysRange = 30 } = req.query;

            const options = {
                limit: parseInt(limit as string, 10),
                daysRange: parseInt(daysRange as string, 10),
            };

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Trending mentors request: limit=${options.limit}, days=${options.daysRange}`);

            const mentors = await recommendationService.getTrendingMentors(
                options,
                authToken
            );

            ResponseHandler.success(
                res,
                'Trending mentors retrieved successfully',
                {
                    mentors,
                    total: mentors.length,
                    daysRange: options.daysRange,
                },
                200
            );
        } catch(error : any) {
            logger.error('Get trending mentors error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/new
     * @desc    Get new mentors
     * @access  Public
     */
    async getNewMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { limit = 10 } = req.query;

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`New mentors request: limit=${limit}`);

            const mentors = await recommendationService.getNewMentors(
                parseInt(limit as string, 10),
                authToken
            );

            ResponseHandler.success(
                res,
                'New mentors retrieved successfully',
                {
                    mentors,
                    total: mentors.length,
                },
                200
            );
        } catch(error : any) {
            logger.error('Get new mentors error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/recommended
     * @desc    Get personalized recommendations
     * @access  Private
     */
    async getRecommendedMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                throw new AppError('User ID not found', 401);
            }

            const { limit = 10 } = req.query;

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Recommended mentors request from user: ${userId}`);

            const mentors = await recommendationService.getRecommendedForUser(
                userId,
                parseInt(limit as string, 10),
                authToken
            );

            ResponseHandler.success(
                res,
                'Recommended mentors retrieved successfully',
                {
                    mentors,
                    total: mentors.length,
                    userId,
                },
                200
            );
        } catch(error : any) {
            logger.error('Get recommended mentors error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/similar/:mentorId
     * @desc    Get similar mentors
     * @access  Public
     */
    async getSimilarMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { mentorId } = req.params;
            const { limit = 5 } = req.query;

            if (!mentorId) {
                throw new AppError('Mentor ID is required', 400);
            }

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Similar mentors request for mentor: ${mentorId}`);

            const mentors = await recommendationService.getSimilarMentors(
                mentorId,
                parseInt(limit as string, 10),
                authToken
            );

            ResponseHandler.success(
                res,
                'Similar mentors retrieved successfully',
                {
                    mentors,
                    total: mentors.length,
                    baseMentorId: mentorId,
                },
                200
            );
        } catch(error : any) {
            logger.error('Get similar mentors error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/domain/:domain
     * @desc    Get mentors by domain
     * @access  Public
     */
    async getMentorsByDomain(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { domain } = req.params;
            const { limit = 10 } = req.query;

            if (!domain) {
                throw new AppError('Domain is required', 400);
            }

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Mentors by domain request: ${domain}`);

            const mentors = await recommendationService.getMentorsByDomain(
                domain,
                parseInt(limit as string, 10),
                authToken
            );

            ResponseHandler.success(
                res,
                `Mentors for domain ${domain} retrieved successfully`,
                {
                    mentors,
                    total: mentors.length,
                    domain,
                },
                200
            );
        } catch(error : any) {
            logger.error('Get mentors by domain error:', error);
            next(error);
        }
    }

    /**
     * @route   GET /api/v1/ai/company/:companyId
     * @desc    Get mentors by company
     * @access  Public
     */
    async getMentorsByCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { companyId } = req.params;
            const { limit = 10 } = req.query;

            if (!companyId) {
                throw new AppError('Company ID is required', 400);
            }

            const authToken = req.headers.authorization?.replace('Bearer ', '');

            logger.info(`Mentors by company request: ${companyId}`);

            const mentors = await recommendationService.getMentorsByCompany(
                companyId,
                parseInt(limit as string, 10),
                authToken
            );

            ResponseHandler.success(
                res,
                'Mentors for company retrieved successfully',
                {
                    mentors,
                    total: mentors.length,
                    companyId,
                },
                200
            );
        } catch(error : any) {
            logger.error('Get mentors by company error:', error);
            next(error);
        }
    }
}

export default new AIController();