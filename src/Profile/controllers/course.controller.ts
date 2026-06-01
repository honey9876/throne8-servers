/**
 * Course Controller - HTTP Request Handlers for Courses Management
 * 
 * @module controllers/course.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CourseService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreateCourseBody {
    courseName: string;
    courseNumber?: string;
    associatedSchool: string;
    completionDate: {
        month: number;
        year: number;
    };
    description?: string;
    skillsLearned?: string[];
}

interface UpdateCourseBody {
    courseName?: string;
    courseNumber?: string;
    associatedSchool?: string;
    completionDate?: {
        month: number;
        year: number;
    };
    description?: string;
    skillsLearned?: string[];
}

interface ReorderCoursesBody {
    courseIds: string[];
}

// ==================== COURSE CONTROLLER CLASS ====================

class CourseController {

    /**
     * ✅ CREATE COURSE
     */
    static async createCourse(
        req: Request<{}, any, CreateCourseBody> & { user?: UserPayload },
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
            const ipAddress = req.ip || 'unknown';

            LoggerUtil.info('Create course request received', {
                userId,
                courseName: req.body.courseName,
                correlationId,
            });

            const {
                courseName,
                courseNumber,
                associatedSchool,
                completionDate,
                description,
                skillsLearned,
            } = req.body;

            if (!courseName || !associatedSchool || !completionDate) {
                ResponseUtil.validationError(
                    res,
                    ['Course name, associated school, and completion date are required'],
                    'Missing required fields'
                );
                return;
            }

            const course = await CourseService.createCourse({
                userId,
                courseName,
                courseNumber,
                associatedSchool,
                completionDate,
                description,
                skillsLearned,
            });

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COURSE_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            courseId: course.courseId,
                            courseName: course.courseName,
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
            LoggerUtil.performance('course_creation', duration, {
                userId,
                courseId: course.courseId,
                correlationId,
            });

            LoggerUtil.info('Course created successfully', {
                userId,
                courseId: course.courseId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { course }, 'Course created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Course creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message === 'User account is not active') {
                ResponseUtil.forbidden(res, 'User account is not active');
                return;
            }

            if (error.message === 'Maximum course limit (50) reached') {
                ResponseUtil.badRequest(res, 'Maximum course limit (50) reached');
                return;
            }

            if (error.message.includes('skill IDs are invalid')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production'
                    ? 'Course creation failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ UPLOAD CERTIFICATE
     */
    static async uploadCertificate(
        req: Request<{ courseId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            if (!req.file) {
                ResponseUtil.badRequest(res, 'No certificate file uploaded');
                return;
            }

            const { courseId } = req.params;

            const result = await CourseService.uploadCertificate(courseId, req.user.userId, req.file);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Certificate uploaded successfully', {
                courseId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Certificate uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Certificate upload failed', {
                error: error.message,
                courseId: req.params.courseId,
                correlationId,
            });

            if (error.message === 'Course not found') {
                ResponseUtil.notFound(res, 'Course not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPLOAD PROVIDER LOGO
     */
    static async uploadProviderLogo(
        req: Request<{ courseId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            if (!req.file) {
                ResponseUtil.badRequest(res, 'No logo file uploaded');
                return;
            }

            const { courseId } = req.params;

            const result = await CourseService.uploadProviderLogo(courseId, req.user.userId, req.file);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Provider logo uploaded successfully', {
                courseId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Provider logo uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Provider logo upload failed', {
                error: error.message,
                courseId: req.params.courseId,
                correlationId,
            });

            if (error.message === 'Course not found') {
                ResponseUtil.notFound(res, 'Course not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL COURSES
     */
    static async getAllCourses(
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

            LoggerUtil.info('Get all courses request', {
                userId,
                includeArchived,
                correlationId,
            });

            const result = await CourseService.getAllCourses(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Courses fetched successfully', {
                userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Courses fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all courses failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET COURSE BY ID
     */
    static async getCourseById(
        req: Request<{ courseId: string }> & { user?: UserPayload },
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
            const { courseId } = req.params;

            if (!courseId) {
                ResponseUtil.badRequest(res, 'Course ID is required');
                return;
            }

            LoggerUtil.info('Get course by ID request', {
                userId,
                courseId,
                correlationId,
            });

            const course = await CourseService.getCourseById(courseId, userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Course fetched successfully', {
                userId,
                courseId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { course }, 'Course fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get course by ID failed', {
                error: error.message,
                courseId: req.params.courseId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Course not found') {
                ResponseUtil.notFound(res, 'Course not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE COURSE
     */
    static async updateCourse(
        req: Request<{ courseId: string }, any, UpdateCourseBody> & { user?: UserPayload },
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
            const { courseId } = req.params;

            if (!courseId) {
                ResponseUtil.badRequest(res, 'Course ID is required');
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

            LoggerUtil.info('Update course request', {
                userId,
                courseId,
                updates: Object.keys(req.body),
                correlationId,
            });

            const course = await CourseService.updateCourse(courseId, userId, req.body);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'COURSE_UPDATED',
                        ipAddress: req.ip || 'unknown',
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            courseId,
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
            LoggerUtil.info('Course updated successfully', {
                userId,
                courseId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { course }, 'Course updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update course failed', {
                error: error.message,
                courseId: req.params.courseId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Course not found') {
                ResponseUtil.notFound(res, 'Course not found');
                return;
            }

            if (error.message.includes('skill IDs are invalid')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE COURSE
     */
    static async deleteCourse(
        req: Request<{ courseId: string }> & { user?: UserPayload },
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
            const { courseId } = req.params;
            const permanent = req.query.permanent === 'true';

            if (!courseId) {
                ResponseUtil.badRequest(res, 'Course ID is required');
                return;
            }

            LoggerUtil.info('Delete course request', {
                userId,
                courseId,
                permanent,
                correlationId,
            });

            const result = await CourseService.deleteCourse(courseId, userId, permanent);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: permanent ? 'COURSE_DELETED_PERMANENT' : 'COURSE_DELETED',
                        ipAddress: req.ip || 'unknown',
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: { courseId, permanent, correlationId },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Course deleted successfully', {
                userId,
                courseId,
                permanent,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Course deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete course failed', {
                error: error.message,
                courseId: req.params.courseId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Course not found') {
                ResponseUtil.notFound(res, 'Course not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE COURSE
     */
    static async archiveCourse(
        req: Request<{ courseId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { courseId } = req.params;

            const result = await CourseService.archiveCourse(courseId, userId);

            LoggerUtil.info('Course archived successfully', {
                userId,
                courseId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Course archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive course failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Course not found') {
                ResponseUtil.notFound(res, 'Course not found');
                return;
            }

            if (error.message === 'Course is already archived') {
                ResponseUtil.badRequest(res, 'Course is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE COURSE
     */
    static async restoreCourse(
        req: Request<{ courseId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { courseId } = req.params;

            const result = await CourseService.restoreCourse(courseId, userId);

            LoggerUtil.info('Course restored successfully', {
                userId,
                courseId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Course restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore course failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Course not found') {
                ResponseUtil.notFound(res, 'Course not found');
                return;
            }

            if (error.message === 'Course is not archived or deleted') {
                ResponseUtil.badRequest(res, 'Course is not archived or deleted');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER COURSES
     */
    static async reorderCourses(
        req: Request<{}, any, ReorderCoursesBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { courseIds } = req.body;

            if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
                ResponseUtil.validationError(
                    res,
                    ['Course IDs array is required'],
                    'Validation failed'
                );
                return;
            }

            const result = await CourseService.reorderCourses(userId, courseIds);

            LoggerUtil.info('Courses reordered successfully', {
                userId,
                count: courseIds.length,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Courses reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder courses failed', {
                error: error.message,
                correlationId,
            });

            if (error.message.includes('course IDs are invalid')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default CourseController;