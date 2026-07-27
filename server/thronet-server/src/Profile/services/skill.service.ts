/**
 * Skill Service - Business Logic for Skills Management
 * Handles skill CRUD, endorsements, pinning, and advanced features
 * 
 * @module services/skill.service
 * @version 1.0.0
 */

import { Skill, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface CreateSkillData {
    userId: string;
    skillName: string;
    category?: string;
    skillStrength?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
    lastUsed?: string;
}

interface UpdateSkillData {
    skillName?: string;
    category?: string;
    skillStrength?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
    lastUsed?: string;
    isVisible?: boolean;
}

// ==================== SKILL SERVICE CLASS ====================

class SkillService {

    /**
     * ✅ Create new skill
     */
    static async createSkill(data: CreateSkillData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new skill', {
                userId: data.userId,
                skillName: data.skillName,
                correlationId,
            });

            // Step 1: Validate user exists
            const user = await User.findOne({ userId: data.userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Step 2: Check skill limit (50 skills max)
            const skillCount = await Skill.getUserSkillCount(data.userId);
            if (skillCount >= 50) {
                throw new Error('Maximum skill limit (50) reached');
            }

            // Step 3: Check duplicate skill name
            const existingSkill = await Skill.findOne({
                userId: data.userId,
                skillName: { $regex: new RegExp(`^${data.skillName}$`, 'i') },
                isDeleted: false,
            });

            if (existingSkill) {
                throw new Error('Skill already exists');
            }

            // Step 4: Parse lastUsed date
            const lastUsed = data.lastUsed ? new Date(data.lastUsed) : undefined;

            // Step 5: Create skill document
            const skill = new Skill({
                skillId: uuidv4(),
                userId: data.userId,
                skillName: data.skillName.trim(),
                category: data.category?.trim(),
                skillStrength: data.skillStrength,
                yearsOfExperience: data.yearsOfExperience,
                lastUsed,
                isPinned: false,
                isVisible: true,
                endorsements: [],
                endorsementCount: 0,
            });

            // Update user's addSkillsIds array
            await User.findOneAndUpdate(
                { userId: data.userId },
                { $addToSet: { addSkillsIds: skill.skillId } },
                { new: true }
            );

            await skill.save();

            LoggerUtil.info('Skill created successfully', {
                skillId: skill.skillId,
                userId: data.userId,
                skillName: data.skillName,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                userId: skill.userId,
                skillName: skill.skillName,
                category: skill.category,
                skillStrength: skill.skillStrength,
                yearsOfExperience: skill.yearsOfExperience,
                lastUsed: skill.lastUsed,
                isPinned: skill.isPinned,
                endorsementCount: skill.endorsementCount,
                isVisible: skill.isVisible,
                createdAt: skill.createdAt,
                updatedAt: skill.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Skill creation failed', {
                error: error.message,
                stack: error.stack,
                userId: data.userId,
                correlationId,
            });

            throw error;
        }
    }

    /**
     * ✅ Get all skills for user
     */
    static async getAllSkills(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all skills', {
                userId,
                includeArchived,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            // Get all skills
            const skillsList = await Skill.findByUserId(userId, includeArchived);

            // Separate pinned and regular skills
            const pinnedSkills = skillsList.filter(s => s.isPinned);
            const regularSkills = skillsList.filter(s => !s.isPinned);

            LoggerUtil.info('Skills fetched successfully', {
                userId,
                total: skillsList.length,
                pinned: pinnedSkills.length,
                correlationId,
            });

            return {
                skillsList,
                total: skillsList.length,
                pinnedSkills,
                regularSkills,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all skills failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single skill by ID
     */
    static async getSkillById(skillId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching skill by ID', {
                skillId,
                userId,
                correlationId,
            });

            // Find skill
            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            LoggerUtil.info('Skill fetched successfully', {
                skillId,
                userId,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                userId: skill.userId,
                skillName: skill.skillName,
                category: skill.category,
                skillStrength: skill.skillStrength,
                yearsOfExperience: skill.yearsOfExperience,
                lastUsed: skill.lastUsed,
                isPinned: skill.isPinned,
                pinnedOrder: skill.pinnedOrder,
                endorsements: skill.endorsements,
                endorsementCount: skill.endorsementCount,
                isVisible: skill.isVisible,
                isArchived: skill.isArchived,
                archivedAt: skill.archivedAt,
                createdAt: skill.createdAt,
                updatedAt: skill.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get skill by ID failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update skill
     */
    static async updateSkill(
        skillId: string,
        userId: string,
        updates: UpdateSkillData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating skill', {
                skillId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            // Find skill
            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            // Apply updates
            if (updates.skillName !== undefined) {
                // Check duplicate
                const existing = await Skill.findOne({
                    userId,
                    skillName: { $regex: new RegExp(`^${updates.skillName}$`, 'i') },
                    skillId: { $ne: skillId },
                    isDeleted: false,
                });

                if (existing) {
                    throw new Error('Skill name already exists');
                }

                skill.skillName = updates.skillName.trim();
            }
            if (updates.category !== undefined) {
                skill.category = updates.category ? updates.category.trim() : undefined;
            }
            if (updates.skillStrength !== undefined) {
                skill.skillStrength = updates.skillStrength;
            }
            if (updates.yearsOfExperience !== undefined) {
                skill.yearsOfExperience = updates.yearsOfExperience;
            }
            if (updates.lastUsed !== undefined) {
                skill.lastUsed = updates.lastUsed ? new Date(updates.lastUsed) : undefined;
            }
            if (updates.isVisible !== undefined) {
                skill.isVisible = updates.isVisible;
            }

            await skill.save();

            LoggerUtil.info('Skill updated successfully', {
                skillId,
                userId,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                userId: skill.userId,
                skillName: skill.skillName,
                category: skill.category,
                skillStrength: skill.skillStrength,
                yearsOfExperience: skill.yearsOfExperience,
                lastUsed: skill.lastUsed,
                isPinned: skill.isPinned,
                endorsementCount: skill.endorsementCount,
                isVisible: skill.isVisible,
                createdAt: skill.createdAt,
                updatedAt: skill.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update skill failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete skill (soft delete)
     */
    static async deleteSkill(skillId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting skill', {
                skillId,
                userId,
                correlationId,
            });

            // Find skill
            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            // Soft delete
            skill.isDeleted = true;
            skill.deletedAt = new Date();
            skill.isPinned = false;  // Unpin if deleted
            skill.pinnedOrder = undefined;

            // Remove from user's addSkillsIds array
            await User.findOneAndUpdate(
                { userId },
                { $pull: { addSkillsIds: skillId } },
                { new: true }
            );
            
            await skill.save();

            LoggerUtil.info('Skill deleted successfully', {
                skillId,
                userId,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                deletedAt: skill.deletedAt,
                message: 'Skill deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete skill failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive skill
     */
    static async archiveSkill(skillId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving skill', {
                skillId,
                userId,
                correlationId,
            });

            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            if (skill.isArchived) {
                throw new Error('Skill is already archived');
            }

            skill.isArchived = true;
            skill.archivedAt = new Date();
            skill.isPinned = false;  // Unpin if archived
            skill.pinnedOrder = undefined;
            await skill.save();

            LoggerUtil.info('Skill archived successfully', {
                skillId,
                userId,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                isArchived: skill.isArchived,
                archivedAt: skill.archivedAt,
                message: 'Skill archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive skill failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived skill
     */
    static async restoreSkill(skillId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring skill', {
                skillId,
                userId,
                correlationId,
            });

            const skill = await Skill.findOne({
                skillId,
                userId,
                isDeleted: false,
            });

            if (!skill) {
                throw new Error('Skill not found');
            }

            if (!skill.isArchived) {
                throw new Error('Skill is not archived');
            }

            skill.isArchived = false;
            skill.archivedAt = undefined;
            await skill.save();

            LoggerUtil.info('Skill restored successfully', {
                skillId,
                userId,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                isArchived: skill.isArchived,
                message: 'Skill restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore skill failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Pin skill (top 3 featured)
     */
    static async pinSkill(skillId: string, userId: string, pinnedOrder: number): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Pinning skill', {
                skillId,
                userId,
                pinnedOrder,
                correlationId,
            });

            // Validate pinnedOrder (1, 2, or 3)
            if (![1, 2, 3].includes(pinnedOrder)) {
                throw new Error('Pinned order must be 1, 2, or 3');
            }

            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            if (skill.isArchived) {
                throw new Error('Cannot pin archived skill');
            }

            // Unpin existing skill at this position
            const existing = await Skill.findOne({
                userId,
                isPinned: true,
                pinnedOrder,
                skillId: { $ne: skillId },
                isDeleted: false,
            });

            if (existing) {
                existing.isPinned = false;
                existing.pinnedOrder = undefined;
                existing.pinnedAt = undefined;
                await existing.save();
            }

            // Pin new skill
            skill.isPinned = true;
            skill.pinnedOrder = pinnedOrder;
            skill.pinnedAt = new Date();
            await skill.save();

            LoggerUtil.info('Skill pinned successfully', {
                skillId,
                userId,
                pinnedOrder,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                isPinned: skill.isPinned,
                pinnedOrder: skill.pinnedOrder,
                pinnedAt: skill.pinnedAt,
                message: 'Skill pinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Pin skill failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Unpin skill
     */
    static async unpinSkill(skillId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Unpinning skill', {
                skillId,
                userId,
                correlationId,
            });

            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            if (!skill.isPinned) {
                throw new Error('Skill is not pinned');
            }

            skill.isPinned = false;
            skill.pinnedOrder = undefined;
            skill.pinnedAt = undefined;
            await skill.save();

            LoggerUtil.info('Skill unpinned successfully', {
                skillId,
                userId,
                correlationId,
            });

            return {
                skillId: skill.skillId,
                isPinned: skill.isPinned,
                message: 'Skill unpinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Unpin skill failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
 * ✅ Request Endorsement
 */
    static async requestEndorsement(skillId: string, userId: string, requestToUserId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Requesting endorsement', {
                skillId,
                userId,
                requestToUserId,
                correlationId,
            });

            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            // TODO: Send notification/email to requestToUserId
            // This would integrate with your notification system

            return {
                skillId: skill.skillId,
                requestedTo: requestToUserId,
                message: 'Endorsement request sent successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Request endorsement failed', {
                error: error.message,
                skillId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Toggle Endorsement Visibility
     */
    static async toggleEndorsementVisibility(skillId: string, userId: string, showEndorsements: boolean): Promise<any> {
        const correlationId = uuidv4();

        try {
            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            skill.showEndorsements = showEndorsements;
            await skill.save();

            return {
                skillId: skill.skillId,
                showEndorsements: skill.showEndorsements,
                message: `Endorsements ${showEndorsements ? 'shown' : 'hidden'} successfully`,
            };

        } catch (error: any) {
            LoggerUtil.error('Toggle endorsement visibility failed', {
                error: error.message,
                skillId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder Skills
     */
    static async reorderSkills(userId: string, skillIds: string[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Reordering skills', {
                userId,
                count: skillIds.length,
                correlationId,
            });

            await Skill.reorderSkills(userId, skillIds);

            return {
                userId,
                reorderedCount: skillIds.length,
                message: 'Skills reordered successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder skills failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Export Skills (PDF/CSV)
     */
    static async exportSkills(userId: string, format: 'pdf' | 'csv'): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Exporting skills', {
                userId,
                format,
                correlationId,
            });

            const skills = await Skill.findByUserId(userId, false);

            // Update lastExportedAt
            await Skill.updateMany(
                { userId, isDeleted: false },
                { $set: { lastExportedAt: new Date() } }
            );

            // Format data for export
            const exportData = skills.map(s => ({
                skillName: s.skillName,
                category: s.category || 'N/A',
                skillLevel: s.skillLevel || 'N/A',
                yearsOfExperience: s.yearsOfExperience || 0,
                endorsementCount: s.endorsementCount,
                isPinned: s.isPinned,
                createdAt: s.createdAt,
            }));

            // TODO: Generate actual PDF/CSV file
            // This would use libraries like 'pdfkit' or 'json2csv'

            return {
                format,
                count: exportData.length,
                data: exportData,
                message: `Skills exported as ${format.toUpperCase()} successfully`,
            };

        } catch (error: any) {
            LoggerUtil.error('Export skills failed', {
                error: error.message,
                userId,
                format,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get Skill Suggestions (System-recommended)
     */
    static async getSkillSuggestions(userId: string, industry?: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Getting skill suggestions', {
                userId,
                industry,
                correlationId,
            });

            // Get user's existing skills
            const existingSkills = await Skill.findByUserId(userId, false);
            const existingSkillNames = existingSkills.map(s => s.skillName.toLowerCase());

            // TODO: Implement AI/ML-based skill suggestions
            // For now, return industry-specific suggestions
            const suggestions = [
                { skillName: 'JavaScript', category: 'Programming', industry: 'Technology' },
                { skillName: 'React', category: 'Framework', industry: 'Technology' },
                { skillName: 'Node.js', category: 'Backend', industry: 'Technology' },
                { skillName: 'TypeScript', category: 'Programming', industry: 'Technology' },
                { skillName: 'MongoDB', category: 'Database', industry: 'Technology' },
            ].filter(s => !existingSkillNames.includes(s.skillName.toLowerCase()));

            return {
                suggestions,
                count: suggestions.length,
                message: 'Skill suggestions fetched successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Get skill suggestions failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Take Skill Assessment/Quiz
     */
    static async takeSkillAssessment(skillId: string, userId: string, score: number): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Recording skill assessment', {
                skillId,
                userId,
                score,
                correlationId,
            });

            const skill = await Skill.findActiveById(skillId, userId);

            if (!skill) {
                throw new Error('Skill not found');
            }

            const passed = score >= 70; // Pass threshold

            skill.hasAssessment = true;
            skill.assessmentPassed = passed;
            skill.assessmentScore = score;
            skill.assessmentDate = new Date();

            if (passed) {
                skill.skillBadge = `${skill.skillName} Certified`;
            }

            await skill.save();

            return {
                skillId: skill.skillId,
                score,
                passed,
                badge: skill.skillBadge,
                message: passed ? 'Congratulations! You passed the assessment.' : 'Keep practicing and try again.',
            };

        } catch (error: any) {
            LoggerUtil.error('Skill assessment failed', {
                error: error.message,
                skillId,
                correlationId,
            });
            throw error;
        }
    }
}

export default SkillService;