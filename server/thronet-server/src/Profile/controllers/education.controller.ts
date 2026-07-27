/**
 * Education Controller - Handles HTTP Requests for Educational Background
 * 
 * @module controllers/education.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { EducationService } from '@/shared/services/index.service';
import { LoggerUtil } from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
    sessionId?: string;
    deviceId?: string;
}

interface CreateEducationBody {
    schoolCollegeName: string;
    degree: string;
    degreeType: "High School" | "Diploma" | "Bachelor's" | "Master's" | "Doctorate" | "Certificate" | "Other";
    specialization?: string;
    startDate: string;
    endDate?: string | null;
    description?: string;
    educationType?: 'full-time' | 'part-time' | 'distance' | 'online';
    gradeType?: 'percentage' | 'cgpa' | 'gpa' | 'grade';
    gradeValue?: string;
    location?: string;
}

interface UpdateEducationBody {
    schoolCollegeName?: string;
    degree?: string;
    specialization?: string;
    startDate?: string;
    endDate?: string | null;
    description?: string;
    educationType?: 'full-time' | 'part-time' | 'distance' | 'online';
    gradeType?: 'percentage' | 'cgpa' | 'gpa' | 'grade';
    gradeValue?: string;
    location?: string;
}

// ==================== EDUCATION CONTROLLER CLASS ====================

class EducationController {

    /**
     * ✅ CREATE NEW EDUCATION
     * POST /api/v1/education
     * @access Private (requires authentication)
     */
    static async createEducation(
        req: Request<{}, any, CreateEducationBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                LoggerUtil.warn('Create education failed - No userId', {
                    correlationId,
                });
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const ipAddress = req.ip || 'unknown';

            LoggerUtil.info('Create education request received', {
                userId,
                schoolCollegeName: req.body.schoolCollegeName,
                degree: req.body.degree,
                correlationId,
            });

            const {
                schoolCollegeName,
                degree,
                specialization,
                startDate,
                endDate,
                degreeType,
                description,
                educationType,
                gradeType,
                gradeValue,
                location,
            } = req.body;

            if (!schoolCollegeName) {
                ResponseUtil.validationError(
                    res,
                    ['School/College name is required'],
                    'Missing required fields'
                );
                return;
            }

            if (!degree) {
                ResponseUtil.validationError(
                    res,
                    ['Degree is required'],
                    'Missing required fields'
                );
                return;
            }

            if (!degreeType) {
                ResponseUtil.validationError(
                    res,
                    ['Degree type is required'],
                    'Missing required fields'
                );
                return;
            }

            if (!startDate) {
                ResponseUtil.validationError(
                    res,
                    ['Start date is required'],
                    'Missing required fields'
                );
                return;
            }

            const education = await EducationService.createEducation({
                userId,
                schoolCollegeName,
                degree,
                degreeType,
                specialization,
                startDate,
                endDate: endDate || null,
                description,
                educationType,
                gradeType,
                gradeValue,
                location,
            });

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'EDUCATION_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            educationId: education.educationId,
                            degree: education.degree,
                            schoolCollegeName: education.schoolCollegeName,
                            isOngoing: education.isOngoing,
                            correlationId,
                            duration: Date.now() - startTime,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed (non-critical)', {
                        error: err.message,
                        userId,
                    });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.performance('education_creation', duration, {
                userId,
                educationId: education.educationId,
                correlationId,
            });

            LoggerUtil.info('Education created successfully', {
                userId,
                educationId: education.educationId,
                degree: education.degree,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                {
                    education,
                },
                'Education created successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Education creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: req.user?.userId || null,
                        action: 'EDUCATION_CREATE_FAILED',
                        ipAddress: req.ip || 'unknown',
                        status: 'FAILURE',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            error: error.message,
                            degree: req.body.degree,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', {
                        error: err.message,
                    });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message === 'User account is not active') {
                ResponseUtil.forbidden(res, 'User account is not active');
                return;
            }

            if (error.message.includes('required') ||
                error.message.includes('must be') ||
                error.message.includes('cannot') ||
                error.message.includes('invalid')) {
                ResponseUtil.validationError(
                    res,
                    [error.message],
                    'Validation failed'
                );
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Education creation failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL EDUCATION
     * GET /api/v1/education
     * @access Private
     */
    static async getAllEducation(
        req: Request & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const includeArchived = req.query.includeArchived === 'true';

            LoggerUtil.info('Get all education request', {
                userId,
                includeArchived,
                correlationId,
            });

            const result = await EducationService.getAllEducation(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Education list fetched', {
                userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Education records fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all education failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL EDUCATION BY USER ID (PUBLIC)
     * GET /api/v1/education/get-all-education/:userId
     * @access Public
     */
    static async getAllEducationByUserId(
        req: Request<{ userId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            const { userId } = req.params;

            if (!userId) {
                ResponseUtil.badRequest(res, 'User ID is required');
                return;
            }

            const includeArchived = req.query.includeArchived === 'true';

            LoggerUtil.info('Get all education by userId request (public)', {
                userId,
                includeArchived,
                correlationId,
            });

            const result = await EducationService.getAllEducation(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Education list fetched (public)', {
                userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Education records fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all education by userId failed', {
                error: error.message,
                userId: req.params.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SINGLE EDUCATION
     * GET /api/v1/education/:educationId
     * @access Private
     */
    static async getEducationById(
        req: Request<{ educationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { educationId } = req.params;

            if (!educationId) {
                ResponseUtil.badRequest(res, 'Education ID is required');
                return;
            }

            LoggerUtil.info('Get education by ID request', {
                userId,
                educationId,
                correlationId,
            });

            const education = await EducationService.getEducationById(educationId, userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Education fetched', {
                userId,
                educationId,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { education },
                'Education fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get education by ID failed', {
                error: error.message,
                educationId: req.params.educationId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Education not found') {
                ResponseUtil.notFound(res, 'Education not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE EDUCATION
     * PUT /api/v1/education/:educationId
     * @access Private
     */
    static async updateEducation(
        req: Request<{ educationId: string }, any, UpdateEducationBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { educationId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!educationId) {
                ResponseUtil.badRequest(res, 'Education ID is required');
                return;
            }

            if (Object.keys(req.body).length === 0) {
                ResponseUtil.validationError(
                    res,
                    ['At least one field must be provided'],
                    'No fields to update'
                );
                return;
            }

            LoggerUtil.info('Update education request', {
                userId,
                educationId,
                updates: Object.keys(req.body),
                correlationId,
            });

            const education = await EducationService.updateEducation(
                educationId,
                userId,
                req.body
            );

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'EDUCATION_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            educationId,
                            updatedFields: Object.keys(req.body),
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Education updated', {
                userId,
                educationId,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { education },
                'Education updated successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Update education failed', {
                error: error.message,
                educationId: req.params.educationId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Education not found') {
                ResponseUtil.notFound(res, 'Education not found');
                return;
            }

            if (error.message.includes('required') || error.message.includes('must be')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE EDUCATION
     * DELETE /api/v1/education/:educationId
     * @access Private
     */
    static async deleteEducation(
        req: Request<{ educationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { educationId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!educationId) {
                ResponseUtil.badRequest(res, 'Education ID is required');
                return;
            }

            LoggerUtil.info('Delete education request', {
                userId,
                educationId,
                correlationId,
            });

            const result = await EducationService.deleteEducation(educationId, userId);

            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'EDUCATION_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            educationId,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Education deleted', {
                userId,
                educationId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Education deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete education failed', {
                error: error.message,
                educationId: req.params.educationId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Education not found') {
                ResponseUtil.notFound(res, 'Education not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE EDUCATION
     * POST /api/v1/education/:educationId/archive
     * @access Private
     */
    static async archiveEducation(
        req: Request<{ educationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { educationId } = req.params;

            const result = await EducationService.archiveEducation(educationId, userId);

            LoggerUtil.info('Education archived', {
                userId,
                educationId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Education archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive education failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Education not found') {
                ResponseUtil.notFound(res, 'Education not found');
                return;
            }

            if (error.message === 'Education is already archived') {
                ResponseUtil.badRequest(res, 'Education is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE EDUCATION
     * POST /api/v1/education/:educationId/restore
     * @access Private
     */
    static async restoreEducation(
        req: Request<{ educationId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { educationId } = req.params;

            const result = await EducationService.restoreEducation(educationId, userId);

            LoggerUtil.info('Education restored', {
                userId,
                educationId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Education restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore education failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Education not found') {
                ResponseUtil.notFound(res, 'Education not found');
                return;
            }

            if (error.message === 'Education is not archived') {
                ResponseUtil.badRequest(res, 'Education is not archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default EducationController;