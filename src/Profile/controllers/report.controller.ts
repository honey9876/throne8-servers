/**
 * Report Controller - Handles HTTP Requests for Post Reporting
 *
 * @module controllers/report.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { ReportService } from '@/shared/services/index.service';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

interface CreateReportBody {
    postId: string;
    reason: string;
    details?: string;
    postOwnerId?: string;
}

class ReportController {
    /**
     * ✅ CREATE REPORT
     */
    static async createReport(
        req: Request<{}, any, CreateReportBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const reporterId = req.user.userId;
            const ipAddress = req.ip || 'unknown';
            const { postId, reason, details, postOwnerId } = req.body;

            if (!postId || !reason) {
                ResponseUtil.validationError(
                    res,
                    ['postId and reason are required'],
                    'Missing required fields'
                );
                return;
            }

            LoggerUtil.info('Create report request received', {
                reporterId,
                postId,
                reason,
                correlationId,
            });

            const report = await ReportService.createReport({
                postId,
                reporterId,
                reason: reason as any,
                details,
                postOwnerId,
            });

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: reporterId,
                        action: 'POST_REPORTED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            reportId: report.reportId,
                            postId,
                            reason,
                            correlationId,
                            duration: Date.now() - startTime,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed (non-critical)', {
                        error: err.message,
                        reporterId,
                    });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Report created successfully', {
                reportId: report.reportId,
                postId,
                reporterId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { report }, 'Post reported successfully');
            return;
        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Report creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            if (error.message === 'You have already reported this post') {
                ResponseUtil.conflict(res, error.message);
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Failed to submit report. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET REPORTS FOR A POST (moderation)
     */
    static async getReportsByPost(
        req: Request<{ postId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { postId } = req.params;
            if (!postId) {
                ResponseUtil.badRequest(res, 'Post ID is required');
                return;
            }

            const reports = await ReportService.getReportsByPost(postId);

            ResponseUtil.success(res, { reports }, 'Reports fetched successfully');
            return;
        } catch (error: any) {
            LoggerUtil.error('Get reports by post failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET MY SUBMITTED REPORTS
     */
    static async getMyReports(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const reports = await ReportService.getReportsByReporter(req.user.userId);

            ResponseUtil.success(res, { reports }, 'Reports fetched successfully');
            return;
        } catch (error: any) {
            LoggerUtil.error('Get my reports failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET PENDING REPORTS (admin/moderation queue)
     */
    static async getPendingReports(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            // TODO: yahan role-check add karna hoga (sirf admin/moderator access kar sake)
            const limit = req.query.limit ? Number(req.query.limit) : 50;
            const reports = await ReportService.getPendingReports(limit);

            ResponseUtil.success(res, { reports }, 'Pending reports fetched successfully');
            return;
        } catch (error: any) {
            LoggerUtil.error('Get pending reports failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE REPORT STATUS (admin/moderation action)
     */
    static async updateReportStatus(
        req: Request<{ reportId: string }, any, { status: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            // TODO: yahan bhi role-check add karna hoga (sirf admin/moderator)
            const { reportId } = req.params;
            const { status } = req.body;

            if (!['reviewed', 'action_taken', 'dismissed'].includes(status)) {
                ResponseUtil.validationError(res, ['Invalid status value'], 'Validation failed');
                return;
            }

            const report = await ReportService.updateReportStatus(
                reportId,
                status as any,
                req.user.userId
            );

            ResponseUtil.success(res, { report }, 'Report status updated successfully');
            return;
        } catch (error: any) {
            LoggerUtil.error('Update report status failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Report not found') {
                ResponseUtil.notFound(res, 'Report not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default ReportController;