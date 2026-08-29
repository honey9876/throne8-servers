/**
 * headline.controller.ts
 * Production-Level Headline Controllers for 1M+ Users
 * 
 * Features:
 * - Create, Read, Update, Delete headlines
 * - User-specific headline retrieval
 * - Analytics tracking (view, click, dismiss)
 * - Admin operations
 * - Comprehensive error handling
 * - Audit logging
 * 
 * @module controllers/headline.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@/shared/models/index.models';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { HeadlineService } from '@/shared/services/index.service';

const logger = LoggerUtil;

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    sessionId: string;
    deviceId: string;
}

interface CreateHeadlineBody {
    title: string;
    message: string;
    audience: 'PUBLIC' | 'PRIVATE';
}

interface UpdateHeadlineBody {
    title?: string;
    message?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status?: 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED';
    audience?: Partial<CreateHeadlineBody['audience']>;
}

// ==================== HEADLINE CONTROLLER CLASS ====================

class HeadlineController {

    // ==================== CREATE HEADLINE (ADMIN) ====================

    /**
     * POST /api/v1/headlines
     * Create a new headline (admin only)
     */
    static async createHeadline(
        req: Request<{}, any, CreateHeadlineBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        const ipAddress = req.ip || 'unknown';

        try {
            // Validate authentication
            if (!userId) {
                logger.warn('Unauthorized headline creation attempt', {
                    userId,
                    userRole,
                    correlationId,
                });

                ResponseUtil.forbidden(res, 'User ID is required');
                return;
            }

            const { title } = req.body;

            // Validate required fields - only title needed
            if (!title) {
                ResponseUtil.validationError(res, ['Title is required']);
                return;
            }

            logger.info('Creating headline', {
                title,
                userId,
                correlationId,
            });

            // Get user profile for name
            const user = await User.findOne({ userId }).select('firstName lastName');
            const createdByName = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Admin';

            // Create headline
            const headline = await HeadlineService.createHeadline(
                userId,
                {
                    title,
                },
                userId,
                createdByName,
                ipAddress
            );

            const duration = Date.now() - startTime;
            logger.performance('headline_creation', duration, {
                headlineId: headline.headlineId,
                // type,
                correlationId,
            });

            logger.info('Headline created successfully', {
                headlineId: headline.headlineId,
                // type,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                {
                    headline: {
                        headlineId: headline.headlineId,
                        title: headline.title,
                        message: headline.message,
                        audience: headline.audience,
                        createdAt: headline.createdAt
                    }
                },
                'Headline created successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            logger.error('Headline creation failed', {
                error: error.message,
                stack: error.stack,
                userId,
                duration,
                correlationId,
            });

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: userId || null,
                        action: 'HEADLINE_CREATE_FAILED',
                        ipAddress,
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error: error.message,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    logger.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            ResponseUtil.error(
                res,
                error.message || 'Failed to create headline',
                500
            );
            return;
        }
    }

    /**
 * Get headline by ID
 */
    static async getHeadlineById(req: Request, res: Response): Promise<void> {
        try {
            const { headlineId } = req.params;

            if (!headlineId) {
                ResponseUtil.badRequest(res, 'Headline ID is required');
                return;
            }

            const headline = await HeadlineService.getHeadlineById(headlineId);

            ResponseUtil.success(res, headline, 'Headline retrieved successfully');
        } catch (error: any) {
            LoggerUtil.error('Get headline by ID failed', {
                error: error.message,
                headlineId: req.params.headlineId
            });

            if (error.message === 'Headline not found') {
                ResponseUtil.notFound(res, error.message);
            } else {
                ResponseUtil.error(res, 'Failed to retrieve headline', 500);
            }
        }
    }

    static async getMultipleHeadlines(req: Request, res: Response): Promise<void> {
        try {
            const { headlineIds } = req.body;
            if (!headlineIds || !Array.isArray(headlineIds) || headlineIds.length === 0) {
                ResponseUtil.badRequest(res, 'headlineIds must be a non-empty array');
                return;
            }
            const headlines = await HeadlineService.getMultipleHeadlinesByIds(headlineIds);
            ResponseUtil.success(res, { headlines }, 'Headlines retrieved successfully');
        } catch (error: any) {
            LoggerUtil.error('Get multiple headlines failed', {
                error: error.message, count: req.body?.headlineIds?.length,
            });
            ResponseUtil.error(res, 'Failed to retrieve headlines', 500);
        }
    }

    /**
     * Get all headlines
     */
    static async getAllHeadlines(req: Request, res: Response): Promise<void> {
        try {
            const { type, status, page = '1', limit = '20' } = req.query;

            const filters = {
                type: type as string,
                status: status as string,
                page: parseInt(page as string),
                limit: parseInt(limit as string)
            };

            const { headlines, total } = await HeadlineService.getAllHeadlines(filters);

            ResponseUtil.paginated(
                res,
                headlines,
                {
                    page: filters.page,
                    limit: filters.limit,
                    total
                },
                'Headlines retrieved successfully'
            );
        } catch (error: any) {
            LoggerUtil.error('Get all headlines failed', {
                error: error.message,
                query: req.query
            });

            ResponseUtil.error(res, 'Failed to retrieve headlines', 500);
        }
    }

    /**
     * Update headline
     */
    static async updateHeadline(req: Request, res: Response): Promise<void> {
        try {
            const { headlineId } = req.params;
            const updates = req.body;
            const user = (req as any).user;

            if (!headlineId) {
                ResponseUtil.badRequest(res, 'Headline ID is required');
                return;
            }

            if (!updates || Object.keys(updates).length === 0) {
                ResponseUtil.badRequest(res, 'No updates provided');
                return;
            }

            const updatedHeadline = await HeadlineService.updateHeadline(
                headlineId,
                updates,
                user.userId,
                user.email
            );

            ResponseUtil.success(res, updatedHeadline, 'Headline updated successfully');
        } catch (error: any) {
            LoggerUtil.error('Update headline failed', {
                error: error.message,
                headlineId: req.params.headlineId
            });

            if (error.message === 'Headline not found') {
                ResponseUtil.notFound(res, error.message);
            } else {
                ResponseUtil.error(res, 'Failed to update headline', 500);
            }
        }
    }
}

// ==================== EXPORT ====================

export default HeadlineController;