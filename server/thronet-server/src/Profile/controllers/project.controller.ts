/**
 * Project Controller - HTTP Request Handlers
 * 
 * @module controllers/project.controller
 * @version 1.0.0
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ProjectService } from '@/shared/services/index.service';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';

// ==================== INTERFACES ====================

interface UserPayload {
    userId: string;
    role: string;
    email: string;
}

interface CreateProjectBody {
    projectName: string;
    projectDescription: string;
    startDate: string;
    endDate?: string;
    isCurrentlyWorking?: boolean;
    projectUrl?: string;
    associatedWith?: {
        type: 'company' | 'school';
        name: string;
        organizationId?: string;
    };
    skillsUsed?: string[];
}

interface UpdateProjectBody {
    projectName?: string;
    projectDescription?: string;
    startDate?: string;
    endDate?: string;
    isCurrentlyWorking?: boolean;
    projectUrl?: string;
    associatedWith?: {
        type: 'company' | 'school';
        name: string;
        organizationId?: string;
    };
    isVisible?: boolean;
    skillsUsed?: string[];
}

interface AddTeamMemberBody {
    memberName: string;
    memberLinkedInUrl?: string;
}

// ==================== PROJECT CONTROLLER ====================

class ProjectController {

    /**
     * ✅ CREATE PROJECT
     */
    static async createProject(
        req: Request<{}, any, CreateProjectBody> & { user?: UserPayload },
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

            LoggerUtil.info('Create project request received', {
                userId,
                projectName: req.body.projectName,
                correlationId,
            });

            const project = await ProjectService.createProject({
                userId,
                ...req.body,
            });

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'PROJECT_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            projectId: project.projectId,
                            projectName: project.projectName,
                            correlationId,
                            duration: Date.now() - startTime,
                        },
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Audit event failed (non-critical)', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            const duration = Date.now() - startTime;
            LoggerUtil.info('Project created successfully', {
                userId,
                projectId: project.projectId,
                duration,
                correlationId,
            });

            ResponseUtil.created(res, { project }, 'Project created successfully');
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Project creation failed', {
                error: error.message,
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

            if (error.message === 'Maximum project limit (100) reached') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL PROJECTS
     */
    static async getAllProjects(
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

            const result = await ProjectService.getAllProjects(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Projects fetched successfully', {
                userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Projects fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all projects failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET PROJECT BY ID
     */
    static async getProjectById(
        req: Request<{ projectId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;

            if (!projectId) {
                ResponseUtil.badRequest(res, 'Project ID is required');
                return;
            }

            const project = await ProjectService.getProjectById(projectId, req.user.userId);

            ResponseUtil.success(res, { project }, 'Project fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get project by ID failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE PROJECT
     */
    static async updateProject(
        req: Request<{ projectId: string }, any, UpdateProjectBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;

            if (!projectId) {
                ResponseUtil.badRequest(res, 'Project ID is required');
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

            const project = await ProjectService.updateProject(projectId, req.user.userId, req.body);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Project updated successfully', {
                projectId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, { project }, 'Project updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Update project failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE PROJECT
     */
    static async deleteProject(
        req: Request<{ projectId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;
            const permanent = req.query.permanent === 'true';

            const result = await ProjectService.deleteProject(projectId, req.user.userId, permanent);

            ResponseUtil.success(res, result, 'Project deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete project failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE PROJECT
     */
    static async archiveProject(
        req: Request<{ projectId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;

            const result = await ProjectService.archiveProject(projectId, req.user.userId);

            ResponseUtil.success(res, result, 'Project archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive project failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            if (error.message === 'Project is already archived') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE PROJECT
     */
    static async restoreProject(
        req: Request<{ projectId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;

            const result = await ProjectService.restoreProject(projectId, req.user.userId);

            ResponseUtil.success(res, result, 'Project restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore project failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ADD TEAM MEMBER
     */
    static async addTeamMember(
        req: Request<{ projectId: string }, any, AddTeamMemberBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;

            const result = await ProjectService.addTeamMember(projectId, req.user.userId, req.body);

            ResponseUtil.created(res, result, 'Team member added successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Add team member failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            if (error.message.includes('Maximum')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REMOVE TEAM MEMBER
     */
    static async removeTeamMember(
        req: Request<{ projectId: string; memberId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId, memberId } = req.params;

            const result = await ProjectService.removeTeamMember(projectId, req.user.userId, memberId);

            ResponseUtil.success(res, result, 'Team member removed successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Remove team member failed', {
                error: error.message,
                projectId: req.params.projectId,
                memberId: req.params.memberId,
                correlationId,
            });

            if (error.message === 'Project not found' || error.message === 'Team member not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPLOAD MEDIA
     */
    static async uploadMedia(
        req: Request<{ projectId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            if (!req.file) {
                ResponseUtil.badRequest(res, 'No file uploaded');
                return;
            }

            const { projectId } = req.params;
            const { mediaType, caption } = req.body;

            const result = await ProjectService.uploadMediaAttachment(
                projectId,
                req.user.userId,
                req.file,
                { mediaType, caption }
            );

            ResponseUtil.created(res, result, 'Media uploaded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Upload media failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            if (error.message.includes('Maximum')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE MEDIA
     */
    static async deleteMedia(
        req: Request<{ projectId: string; mediaId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId, mediaId } = req.params;

            const result = await ProjectService.deleteMediaAttachment(projectId, req.user.userId, mediaId);

            ResponseUtil.success(res, result, 'Media deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete media failed', {
                error: error.message,
                projectId: req.params.projectId,
                mediaId: req.params.mediaId,
                correlationId,
            });

            if (error.message === 'Project not found' || error.message === 'Media attachment not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER PROJECTS
     */
    static async reorderProjects(
        req: Request<{}, any, { projectOrders: Array<{ projectId: string; displayOrder: number }> }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectOrders } = req.body;

            if (!projectOrders || !Array.isArray(projectOrders)) {
                ResponseUtil.validationError(res, ['Invalid project orders'], 'Validation failed');
                return;
            }

            const result = await ProjectService.reorderProjects(req.user.userId, projectOrders);

            ResponseUtil.success(res, result, 'Projects reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder projects failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ PIN PROJECT
     */
    static async pinProject(
        req: Request<{ projectId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;
            const { pinnedOrder } = req.body;

            const result = await ProjectService.pinProject(projectId, req.user.userId, pinnedOrder);

            ResponseUtil.success(res, result, 'Project pinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Pin project failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            if (error.message.includes('archived')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UNPIN PROJECT
     */
    static async unpinProject(
        req: Request<{ projectId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { projectId } = req.params;

            const result = await ProjectService.unpinProject(projectId, req.user.userId);

            ResponseUtil.success(res, result, 'Project unpinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Unpin project failed', {
                error: error.message,
                projectId: req.params.projectId,
                correlationId,
            });

            if (error.message === 'Project not found') {
                ResponseUtil.notFound(res, 'Project not found');
                return;
            }

            if (error.message === 'Project is not pinned') {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default ProjectController;