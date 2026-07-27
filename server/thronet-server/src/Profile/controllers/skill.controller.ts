/**
 * Skill Controller - Handles HTTP Requests for Skills Management
 * 
 * @module controllers/skill.controller
 * @version 1.0.0
 */

import AuditProducer from '@/shared/kafka/producers/audit.producer';
import { SkillService } from '@/shared/services/index.service';
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

interface CreateSkillBody {
    skillName: string;
    category?: string;
    skillStrength?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
    lastUsed?: string;
}

interface UpdateSkillBody {
    skillName?: string;
    category?: string;
    skillStrength?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
    lastUsed?: string;
    isVisible?: boolean;
}

interface PinSkillBody {
    pinnedOrder: number;  // 1, 2, or 3
}

// ==================== SKILL CONTROLLER CLASS ====================

class SkillController {

    /**
     * ✅ CREATE NEW SKILL
     */
    static async createSkill(
        req: Request<{}, any, CreateSkillBody> & { user?: UserPayload },
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

            LoggerUtil.info('Create skill request received', {
                userId,
                skillName: req.body.skillName,
                correlationId,
            });

            const {
                skillName,
                category,
                skillStrength,
                yearsOfExperience,
                lastUsed,
            } = req.body;

            if (!skillName) {
                ResponseUtil.validationError(
                    res,
                    ['Skill name is required'],
                    'Missing required fields'
                );
                return;
            }

            const skill = await SkillService.createSkill({
                userId,
                skillName,
                category,
                skillStrength,
                yearsOfExperience,
                lastUsed,
            });

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'SKILL_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            skillId: skill.skillId,
                            skillName: skill.skillName,
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
            LoggerUtil.performance('skill_creation', duration, {
                userId,
                skillId: skill.skillId,
                correlationId,
            });

            LoggerUtil.info('Skill created successfully', {
                userId,
                skillId: skill.skillId,
                skillName: skill.skillName,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                { skill },
                'Skill created successfully'
            );
            return;

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Skill creation failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId,
                duration,
                correlationId,
            });

            // Handle specific errors
            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            if (error.message === 'User account is not active') {
                ResponseUtil.forbidden(res, 'User account is not active');
                return;
            }

            if (error.message === 'Maximum skill limit (50) reached') {
                ResponseUtil.badRequest(res, 'Maximum skill limit (50) reached');
                return;
            }

            if (error.message === 'Skill already exists') {
                ResponseUtil.conflict(res, 'Skill already exists');
                return;
            }

            if (error.message.includes('required') || error.message.includes('must be')) {
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
                    ? 'Skill creation failed. Please try again.'
                    : error.message,
                error
            );
            return;
        }
    }

    /**
     * ✅ GET ALL SKILLS
     */
    static async getAllSkills(
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

            LoggerUtil.info('Get all skills request', {
                userId,
                includeArchived,
                correlationId,
            });

            const result = await SkillService.getAllSkills(userId, includeArchived);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Skills list fetched', {
                userId,
                count: result.total,
                pinned: result.pinnedSkills.length,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Skills fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get all skills failed', {
                error: error.message,
                userId: req.user?.userId,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SINGLE SKILL
     */
    static async getSkillById(
        req: Request<{ skillId: string }> & { user?: UserPayload },
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
            const { skillId } = req.params;

            if (!skillId) {
                ResponseUtil.badRequest(res, 'Skill ID is required');
                return;
            }

            LoggerUtil.info('Get skill by ID request', {
                userId,
                skillId,
                correlationId,
            });

            const skill = await SkillService.getSkillById(skillId, userId);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Skill fetched', {
                userId,
                skillId,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { skill },
                'Skill fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get skill by ID failed', {
                error: error.message,
                skillId: req.params.skillId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET ALL SKILLS BY USER ID (Public Profile View)
     */
    static async getSkillsByUserId(
        req: Request<{ userId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { userId } = req.params;

            if (!userId) {
                ResponseUtil.badRequest(res, 'User ID is required');
                return;
            }

            LoggerUtil.info('Get skills by user ID request', {
                targetUserId: userId,
                requestedBy: req.user.userId,
                correlationId,
            });

            const result = await SkillService.getAllSkills(userId, false);

            const duration = Date.now() - startTime;
            LoggerUtil.info('Skills list fetched for user', {
                targetUserId: userId,
                count: result.total,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                result,
                'Skills fetched successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Get skills by user ID failed', {
                error: error.message,
                targetUserId: req.params.userId,
                correlationId,
            });

            if (error.message === 'User not found') {
                ResponseUtil.notFound(res, 'User not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UPDATE SKILL
     */
    static async updateSkill(
        req: Request<{ skillId: string }, any, UpdateSkillBody> & { user?: UserPayload },
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
            const { skillId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!skillId) {
                ResponseUtil.badRequest(res, 'Skill ID is required');
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

            LoggerUtil.info('Update skill request', {
                userId,
                skillId,
                updates: Object.keys(req.body),
                correlationId,
            });

            const skill = await SkillService.updateSkill(
                skillId,
                userId,
                req.body
            );

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'SKILL_UPDATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            skillId,
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
            LoggerUtil.info('Skill updated', {
                userId,
                skillId,
                duration,
                correlationId,
            });

            ResponseUtil.success(
                res,
                { skill },
                'Skill updated successfully'
            );
            return;

        } catch (error: any) {
            LoggerUtil.error('Update skill failed', {
                error: error.message,
                skillId: req.params.skillId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            if (error.message === 'Skill name already exists') {
                ResponseUtil.conflict(res, 'Skill name already exists');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ DELETE SKILL
     */
    static async deleteSkill(
        req: Request<{ skillId: string }> & { user?: UserPayload },
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
            const { skillId } = req.params;
            const ipAddress = req.ip || 'unknown';

            if (!skillId) {
                ResponseUtil.badRequest(res, 'Skill ID is required');
                return;
            }

            LoggerUtil.info('Delete skill request', {
                userId,
                skillId,
                correlationId,
            });

            const result = await SkillService.deleteSkill(skillId, userId);

            // Audit log
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId,
                        action: 'SKILL_DELETED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'MEDIUM',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            skillId,
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
            LoggerUtil.info('Skill deleted', {
                userId,
                skillId,
                duration,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Skill deleted successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Delete skill failed', {
                error: error.message,
                skillId: req.params.skillId,
                userId: req.user?.userId,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ ARCHIVE SKILL
     */
    static async archiveSkill(
        req: Request<{ skillId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { skillId } = req.params;

            const result = await SkillService.archiveSkill(skillId, userId);

            LoggerUtil.info('Skill archived', {
                userId,
                skillId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Skill archived successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Archive skill failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            if (error.message === 'Skill is already archived') {
                ResponseUtil.badRequest(res, 'Skill is already archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ RESTORE SKILL
     */
    static async restoreSkill(
        req: Request<{ skillId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { skillId } = req.params;

            const result = await SkillService.restoreSkill(skillId, userId);

            LoggerUtil.info('Skill restored', {
                userId,
                skillId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Skill restored successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Restore skill failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            if (error.message === 'Skill is not archived') {
                ResponseUtil.badRequest(res, 'Skill is not archived');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ PIN SKILL (TOP 3)
     */
    static async pinSkill(
        req: Request<{ skillId: string }, any, PinSkillBody> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { skillId } = req.params;
            const { pinnedOrder } = req.body;

            if (!pinnedOrder) {
                ResponseUtil.validationError(
                    res,
                    ['Pinned order is required'],
                    'Missing required fields'
                );
                return;
            }

            const result = await SkillService.pinSkill(skillId, userId, pinnedOrder);

            LoggerUtil.info('Skill pinned', {
                userId,
                skillId,
                pinnedOrder,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Skill pinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Pin skill failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            if (error.message.includes('Pinned order')) {
                ResponseUtil.validationError(res, [error.message], 'Validation failed');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ UNPIN SKILL
     */
    static async unpinSkill(
        req: Request<{ skillId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const userId = req.user.userId;
            const { skillId } = req.params;

            const result = await SkillService.unpinSkill(skillId, userId);

            LoggerUtil.info('Skill unpinned', {
                userId,
                skillId,
                correlationId,
            });

            ResponseUtil.success(res, result, 'Skill unpinned successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Unpin skill failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            if (error.message === 'Skill is not pinned') {
                ResponseUtil.badRequest(res, 'Skill is not pinned');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
 * ✅ REQUEST ENDORSEMENT
 */
    static async requestEndorsement(
        req: Request<{ skillId: string }, any, { requestToUserId: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { skillId } = req.params;
            const { requestToUserId } = req.body;

            if (!requestToUserId) {
                ResponseUtil.validationError(res, ['User ID is required'], 'Validation failed');
                return;
            }

            const result = await SkillService.requestEndorsement(skillId, req.user.userId, requestToUserId);

            ResponseUtil.success(res, result, 'Endorsement request sent successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Request endorsement failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ TOGGLE ENDORSEMENT VISIBILITY
     */
    static async toggleEndorsementVisibility(
        req: Request<{ skillId: string }, any, { showEndorsements: boolean }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { skillId } = req.params;
            const { showEndorsements } = req.body;

            if (typeof showEndorsements !== 'boolean') {
                ResponseUtil.validationError(res, ['showEndorsements must be a boolean'], 'Validation failed');
                return;
            }

            const result = await SkillService.toggleEndorsementVisibility(skillId, req.user.userId, showEndorsements);

            ResponseUtil.success(res, result, 'Endorsement visibility updated successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Toggle endorsement visibility failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ REORDER SKILLS
     */
    static async reorderSkills(
        req: Request<{}, any, { skillIds: string[] }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { skillIds } = req.body;

            if (!Array.isArray(skillIds) || skillIds.length === 0) {
                ResponseUtil.validationError(res, ['Skill IDs array is required'], 'Validation failed');
                return;
            }

            const result = await SkillService.reorderSkills(req.user.userId, skillIds);

            ResponseUtil.success(res, result, 'Skills reordered successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Reorder skills failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ EXPORT SKILLS
     */
    static async exportSkills(
        req: Request<{}, any, {}, { format: 'pdf' | 'csv' }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const format = req.query.format || 'csv';

            if (!['pdf', 'csv'].includes(format)) {
                ResponseUtil.validationError(res, ['Format must be pdf or csv'], 'Validation failed');
                return;
            }

            const result = await SkillService.exportSkills(req.user.userId, format as 'pdf' | 'csv');

            ResponseUtil.success(res, result, 'Skills exported successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Export skills failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ GET SKILL SUGGESTIONS
     */
    static async getSkillSuggestions(
        req: Request<{}, any, {}, { industry?: string }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const industry = req.query.industry;

            const result = await SkillService.getSkillSuggestions(req.user.userId, industry);

            ResponseUtil.success(res, result, 'Skill suggestions fetched successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Get skill suggestions failed', {
                error: error.message,
                correlationId,
            });

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }

    /**
     * ✅ TAKE SKILL ASSESSMENT
     */
    static async takeSkillAssessment(
        req: Request<{ skillId: string }, any, { score: number }> & { user?: UserPayload },
        res: Response
    ): Promise<void> {
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const { skillId } = req.params;
            const { score } = req.body;

            if (typeof score !== 'number' || score < 0 || score > 100) {
                ResponseUtil.validationError(res, ['Score must be between 0 and 100'], 'Validation failed');
                return;
            }

            const result = await SkillService.takeSkillAssessment(skillId, req.user.userId, score);

            ResponseUtil.success(res, result, 'Assessment recorded successfully');
            return;

        } catch (error: any) {
            LoggerUtil.error('Take skill assessment failed', {
                error: error.message,
                correlationId,
            });

            if (error.message === 'Skill not found') {
                ResponseUtil.notFound(res, 'Skill not found');
                return;
            }

            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }
}

export default SkillController;