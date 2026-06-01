/**
 * Experience Service - Business Logic for Professional Experience
 * Handles CRUD operations with validation
 * 
 * @module services/experience.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { Experience, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';

const logger = LoggerUtil;

// ==================== INTERFACES ====================

interface CreateExperienceData {
    currentPosition: string;
    companyName: string;
    description: string;
    startDate: string | Date;
    endDate?: string | Date;
    currentlyWorking: boolean;
    keyAchievements?: string[];
}

interface UpdateExperienceData {
    currentPosition?: string;
    companyName?: string;
    description?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    currentlyWorking?: boolean;
    keyAchievements?: string[];
}

// ==================== EXPERIENCE SERVICE ====================

class ExperienceService {

    /**
     * ✅ CREATE EXPERIENCE
     */
    static async createExperience(
        userId: string,
        data: CreateExperienceData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            logger.info('Creating experience', {
                userId,
                position: data.currentPosition,
                company: data.companyName,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Check max limit (e.g., 20 experiences per user)
            const experienceCount = await Experience.getUserExperienceCount(userId);
            if (experienceCount >= 20) {
                throw new Error('Maximum 20 experiences allowed per user');
            }

            // Validate dates
            const startDate = new Date(data.startDate);
            const endDate = data.endDate ? new Date(data.endDate) : undefined;

            if (isNaN(startDate.getTime())) {
                throw new Error('Invalid start date');
            }

            if (endDate && isNaN(endDate.getTime())) {
                throw new Error('Invalid end date');
            }

            if (endDate && endDate < startDate) {
                throw new Error('End date must be after start date');
            }

            if (!data.currentlyWorking && !endDate) {
                throw new Error('End date is required when not currently working');
            }

            // Create experience
            const experienceId = uuidv4();

            const experience = new Experience({
                experienceId,
                userId,
                currentPosition: data.currentPosition,
                companyName: data.companyName,
                description: data.description,
                startDate,
                endDate: data.currentlyWorking ? undefined : endDate,
                currentlyWorking: data.currentlyWorking,
                keyAchievements: data.keyAchievements || [],
            });

            await experience.save();

            // Update user's experienceIds array
            await User.findOneAndUpdate(
                { userId },
                { $push: { experienceIds: experienceId } },
                { new: true }
            );

            logger.info('Experience created successfully', {
                experienceId,
                userId,
                correlationId,
            });

            return experience.toJSON();

        } catch (error: any) {
            logger.error('Create experience failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ GET ALL EXPERIENCES
     */
    static async getAllExperiences(
        userId: string,
        includeArchived: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            logger.info('Fetching all experiences', {
                userId,
                includeArchived,
                correlationId,
            });

            const experiences = await Experience.findByUserId(userId, includeArchived);

            logger.info('Experiences fetched successfully', {
                userId,
                count: experiences.length,
                correlationId,
            });

            return {
                experiences,
                total: experiences.length,
                currentExperiences: experiences.filter(e => e.currentlyWorking),
                pastExperiences: experiences.filter(e => !e.currentlyWorking),
            };

        } catch (error: any) {
            logger.error('Get all experiences failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ GET EXPERIENCE BY ID
     */
    static async getExperienceById(
        experienceId: string,
        userId: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            logger.info('Fetching experience by ID', {
                experienceId,
                userId,
                correlationId,
            });

            const experience = await Experience.findByExperienceId(experienceId, userId);

            if (!experience) {
                throw new Error('Experience not found');
            }

            logger.info('Experience fetched successfully', {
                experienceId,
                userId,
                correlationId,
            });

            return experience;

        } catch (error: any) {
            logger.error('Get experience by ID failed', {
                error: error.message,
                experienceId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ UPDATE EXPERIENCE
     */
    static async updateExperience(
        experienceId: string,
        userId: string,
        updates: UpdateExperienceData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            logger.info('Updating experience', {
                experienceId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            // Find experience
            const experience = await Experience.findOne({
                experienceId,
                userId,
                isDeleted: false,
            });

            if (!experience) {
                throw new Error('Experience not found');
            }

            // Validate dates if provided
            if (updates.startDate) {
                const startDate = new Date(updates.startDate);
                if (isNaN(startDate.getTime())) {
                    throw new Error('Invalid start date');
                }
                experience.startDate = startDate;
            }

            if (updates.endDate) {
                const endDate = new Date(updates.endDate);
                if (isNaN(endDate.getTime())) {
                    throw new Error('Invalid end date');
                }
                if (endDate < experience.startDate) {
                    throw new Error('End date must be after start date');
                }
                experience.endDate = endDate;
            }

            // Update other fields
            if (updates.currentPosition !== undefined) {
                experience.currentPosition = updates.currentPosition;
            }
            if (updates.companyName !== undefined) {
                experience.companyName = updates.companyName;
            }
            if (updates.description !== undefined) {
                experience.description = updates.description;
            }
            if (updates.currentlyWorking !== undefined) {
                experience.currentlyWorking = updates.currentlyWorking;
                if (updates.currentlyWorking) {
                    experience.endDate = undefined;
                }
            }
            if (updates.keyAchievements !== undefined) {
                experience.keyAchievements = updates.keyAchievements;
            }

            await experience.save();

            // Clear cache
            await CacheUtil.del(`experience:${experienceId}`);

            logger.info('Experience updated successfully', {
                experienceId,
                userId,
                correlationId,
            });

            return experience.toJSON();

        } catch (error: any) {
            logger.error('Update experience failed', {
                error: error.message,
                experienceId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ DELETE EXPERIENCE (SOFT)
     */
    static async deleteExperience(
        experienceId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            logger.info('Deleting experience', {
                experienceId,
                userId,
                permanent,
                correlationId,
            });

            if (permanent) {
                // Permanent delete
                const result = await Experience.findOneAndDelete({
                    experienceId,
                    userId,
                });

                if (!result) {
                    throw new Error('Experience not found');
                }

                // Remove from user's experienceIds array
                await User.findOneAndUpdate(
                    { userId },
                    { $pull: { experienceIds: experienceId } }
                );

                logger.info('Experience permanently deleted', {
                    experienceId,
                    userId,
                    correlationId,
                });

                return {
                    experienceId,
                    deleted: true,
                    permanent: true,
                    deletedAt: new Date(),
                };
            } else {
                // Soft delete
                const experience = await Experience.findOneAndUpdate(
                    {
                        experienceId,
                        userId,
                        isDeleted: false,
                    },
                    {
                        $set: {
                            isDeleted: true,
                            deletedAt: new Date(),
                        },
                    },
                    { new: true }
                );

                if (!experience) {
                    throw new Error('Experience not found');
                }

                // Clear cache
                await CacheUtil.del(`experience:${experienceId}`);

                logger.info('Experience soft deleted', {
                    experienceId,
                    userId,
                    correlationId,
                });

                return {
                    experienceId: experience.experienceId,
                    deleted: true,
                    permanent: false,
                    deletedAt: experience.deletedAt,
                };
            }

        } catch (error: any) {
            logger.error('Delete experience failed', {
                error: error.message,
                experienceId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ ARCHIVE EXPERIENCE
     */
    static async archiveExperience(
        experienceId: string,
        userId: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            logger.info('Archiving experience', {
                experienceId,
                userId,
                correlationId,
            });

            const experience = await Experience.archiveExperience(experienceId, userId);

            logger.info('Experience archived successfully', {
                experienceId,
                userId,
                correlationId,
            });

            return experience.toJSON();

        } catch (error: any) {
            logger.error('Archive experience failed', {
                error: error.message,
                experienceId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ RESTORE EXPERIENCE
     */
    static async restoreExperience(
        experienceId: string,
        userId: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            logger.info('Restoring experience', {
                experienceId,
                userId,
                correlationId,
            });

            const experience = await Experience.restoreExperience(experienceId, userId);

            logger.info('Experience restored successfully', {
                experienceId,
                userId,
                correlationId,
            });

            return experience.toJSON();

        } catch (error: any) {
            logger.error('Restore experience failed', {
                error: error.message,
                experienceId,
                userId,
                correlationId,
            });
            throw error;
        }
    }
}

export default ExperienceService;