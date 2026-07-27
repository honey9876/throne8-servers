/**
 * Career Break Service - Business Logic for Career Breaks
 * Handles career break CRUD operations with privacy controls
 * 
 * @module services/careerBreak.service
 * @version 1.0.0
 */

import { CareerBreak, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface CreateCareerBreakData {
    userId: string;
    breakType: 'Caregiving' | 'Personal travel' | 'Career transition' | 'Layoff' |
    'Full-time parenting' | 'Sabbatical' | 'Health & well-being' |
    'Bereavement' | 'Gap year' | 'Relocation' | 'Retirement' |
    'Volunteer work' | 'Other';
    startDate: string;
    endDate?: string | null;
    description?: string;
    displayOnProfile?: boolean;
    notifyNetwork?: boolean;
    visibility?: 'public' | 'connections' | 'private' | 'me_only';
}

interface UpdateCareerBreakData {
    breakType?: 'Caregiving' | 'Personal travel' | 'Career transition' | 'Layoff' |
    'Full-time parenting' | 'Sabbatical' | 'Health & well-being' |
    'Bereavement' | 'Gap year' | 'Relocation' | 'Retirement' |
    'Volunteer work' | 'Other';
    startDate?: string;
    endDate?: string | null;
    description?: string;
    displayOnProfile?: boolean;
    notifyNetwork?: boolean;
    visibility?: 'public' | 'connections' | 'private' | 'me_only';
}

// ==================== CAREER BREAK SERVICE CLASS ====================

class CareerBreakService {

    /**
     * ✅ Create new career break
     */
    static async createCareerBreak(data: CreateCareerBreakData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new career break', {
                userId: data.userId,
                breakType: data.breakType,
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

            // Step 2: Parse and validate dates
            const startDate = new Date(data.startDate);
            const endDate = data.endDate ? new Date(data.endDate) : null;

            this.validateDates(startDate, endDate);

            // Step 3: Create career break document
            const careerBreak = new CareerBreak({
                careerBreakId: uuidv4(),
                userId: data.userId,
                breakType: data.breakType,
                startDate,
                endDate,
                isOngoing: !endDate,
                description: data.description?.trim(),
                displayOnProfile: data.displayOnProfile !== undefined ? data.displayOnProfile : true,
                notifyNetwork: data.notifyNetwork !== undefined ? data.notifyNetwork : false,
                visibility: data.visibility || 'connections',
            });

            await careerBreak.save();

            // Step 4: Update user model with careerBreakId
            if (!user.careerBreakIds) {
                user.careerBreakIds = [];
            }
            user.careerBreakIds.push(careerBreak.careerBreakId);
            await user.save();

            LoggerUtil.info('Career break created successfully', {
                careerBreakId: careerBreak.careerBreakId,
                userId: data.userId,
                breakType: data.breakType,
                correlationId,
            });

            return this.formatCareerBreakResponse(careerBreak);

        } catch (error: any) {
            LoggerUtil.error('Career break creation failed', {
                error: error.message,
                stack: error.stack,
                userId: data.userId,
                correlationId,
            });

            throw error;
        }
    }

    /**
     * ✅ Get all career breaks for user
     */
    static async getAllCareerBreaks(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all career breaks', {
                userId,
                includeArchived,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const careerBreakList = await CareerBreak.findByUserId(userId, includeArchived);

            LoggerUtil.info('Career breaks fetched successfully', {
                userId,
                count: careerBreakList.length,
                correlationId,
            });

            return {
                careerBreakList: careerBreakList.map(cb => this.formatCareerBreakResponse(cb)),
                total: careerBreakList.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all career breaks failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single career break by ID
     */
    static async getCareerBreakById(careerBreakId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching career break by ID', {
                careerBreakId,
                userId,
                correlationId,
            });

            const careerBreak = await CareerBreak.findActiveById(careerBreakId, userId);

            if (!careerBreak) {
                throw new Error('Career break not found');
            }

            LoggerUtil.info('Career break fetched successfully', {
                careerBreakId,
                userId,
                correlationId,
            });

            return this.formatCareerBreakResponse(careerBreak);

        } catch (error: any) {
            LoggerUtil.error('Get career break by ID failed', {
                error: error.message,
                careerBreakId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update career break
     */
    static async updateCareerBreak(
        careerBreakId: string,
        userId: string,
        updates: UpdateCareerBreakData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating career break', {
                careerBreakId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const careerBreak = await CareerBreak.findActiveById(careerBreakId, userId);

            if (!careerBreak) {
                throw new Error('Career break not found');
            }

            // Apply updates
            if (updates.breakType !== undefined) {
                careerBreak.breakType = updates.breakType;
            }
            if (updates.startDate !== undefined) {
                careerBreak.startDate = new Date(updates.startDate);
            }
            if (updates.endDate !== undefined) {
                careerBreak.endDate = updates.endDate ? new Date(updates.endDate) : undefined;
                careerBreak.isOngoing = !updates.endDate;
            }
            if (updates.description !== undefined) {
                careerBreak.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.displayOnProfile !== undefined) {
                careerBreak.displayOnProfile = updates.displayOnProfile;
            }
            if (updates.notifyNetwork !== undefined) {
                careerBreak.notifyNetwork = updates.notifyNetwork;
            }
            if (updates.visibility !== undefined) {
                careerBreak.visibility = updates.visibility;
            }

            // Validate dates if both are present
            if (careerBreak.startDate && careerBreak.endDate) {
                this.validateDates(careerBreak.startDate, careerBreak.endDate);
            }

            await careerBreak.save();

            LoggerUtil.info('Career break updated successfully', {
                careerBreakId,
                userId,
                correlationId,
            });

            return this.formatCareerBreakResponse(careerBreak);

        } catch (error: any) {
            LoggerUtil.error('Update career break failed', {
                error: error.message,
                careerBreakId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete career break (soft delete)
     */
    static async deleteCareerBreak(
        careerBreakId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting career break', {
                careerBreakId,
                userId,
                permanent,
                correlationId,
            });

            const careerBreak = await CareerBreak.findOne({
                careerBreakId,
                userId,
            });

            if (!careerBreak) {
                throw new Error('Career break not found');
            }

            if (permanent) {
                // Permanent delete
                await CareerBreak.deleteOne({ careerBreakId, userId });

                // Remove from user's careerBreakIds
                await User.updateOne(
                    { userId },
                    { $pull: { careerBreakIds: careerBreakId } }
                );

                LoggerUtil.info('Career break permanently deleted', {
                    careerBreakId,
                    userId,
                    correlationId,
                });

                return {
                    careerBreakId,
                    deletedAt: new Date(),
                    permanent: true,
                    message: 'Career break permanently deleted',
                };
            } else {
                // Soft delete
                careerBreak.isDeleted = true;
                careerBreak.deletedAt = new Date();
                await careerBreak.save();

                LoggerUtil.info('Career break soft deleted', {
                    careerBreakId,
                    userId,
                    correlationId,
                });

                return {
                    careerBreakId,
                    deletedAt: careerBreak.deletedAt,
                    permanent: false,
                    message: 'Career break deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete career break failed', {
                error: error.message,
                careerBreakId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive career break
     */
    static async archiveCareerBreak(careerBreakId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving career break', {
                careerBreakId,
                userId,
                correlationId,
            });

            const careerBreak = await CareerBreak.findActiveById(careerBreakId, userId);

            if (!careerBreak) {
                throw new Error('Career break not found');
            }

            if (careerBreak.isArchived) {
                throw new Error('Career break is already archived');
            }

            careerBreak.isArchived = true;
            careerBreak.archivedAt = new Date();
            await careerBreak.save();

            LoggerUtil.info('Career break archived successfully', {
                careerBreakId,
                userId,
                correlationId,
            });

            return {
                careerBreakId: careerBreak.careerBreakId,
                isArchived: careerBreak.isArchived,
                archivedAt: careerBreak.archivedAt,
                message: 'Career break archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive career break failed', {
                error: error.message,
                careerBreakId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived career break
     */
    static async restoreCareerBreak(careerBreakId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring career break', {
                careerBreakId,
                userId,
                correlationId,
            });

            const careerBreak = await CareerBreak.findOne({
                careerBreakId,
                userId,
                isDeleted: false,
            });

            if (!careerBreak) {
                throw new Error('Career break not found');
            }

            if (!careerBreak.isArchived) {
                throw new Error('Career break is not archived');
            }

            careerBreak.isArchived = false;
            careerBreak.archivedAt = undefined;
            await careerBreak.save();

            LoggerUtil.info('Career break restored successfully', {
                careerBreakId,
                userId,
                correlationId,
            });

            return {
                careerBreakId: careerBreak.careerBreakId,
                isArchived: careerBreak.isArchived,
                message: 'Career break restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore career break failed', {
                error: error.message,
                careerBreakId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Validate date logic
     */
    private static validateDates(startDate: Date, endDate: Date | null): void {
        const now = new Date();

        if (startDate > now) {
            const diffDays = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 365) {
                throw new Error('Start date cannot be more than 1 year in the future');
            }
        }

        if (endDate) {
            if (endDate < startDate) {
                throw new Error('End date must be after start date');
            }

            if (endDate > now) {
                const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays > 365) {
                    throw new Error('End date cannot be more than 1 year in the future');
                }
            }

            const diffMs = endDate.getTime() - startDate.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            if (diffDays < 1) {
                throw new Error('Minimum career break duration is 1 day');
            }
        }
    }

    /**
     * ✅ Format career break response
     */
    private static formatCareerBreakResponse(careerBreak: any): any {
        return {
            careerBreakId: careerBreak.careerBreakId,
            userId: careerBreak.userId,
            breakType: careerBreak.breakType,
            startDate: careerBreak.startDate,
            endDate: careerBreak.endDate,
            isOngoing: careerBreak.isOngoing,
            duration: careerBreak.duration,
            description: careerBreak.description,
            displayOnProfile: careerBreak.displayOnProfile,
            notifyNetwork: careerBreak.notifyNetwork,
            visibility: careerBreak.visibility,
            isArchived: careerBreak.isArchived,
            archivedAt: careerBreak.archivedAt,
            createdAt: careerBreak.createdAt,
            updatedAt: careerBreak.updatedAt,
        };
    }
}

export default CareerBreakService;