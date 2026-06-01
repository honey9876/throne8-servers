/**
 * Position Service - Business Logic
 * 
 * @module services/position.service
 * @version 1.0.0
 */

import { Position, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface CreatePositionData {
    userId: string;
    jobTitle: string;
    employmentType: 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship' | 'self-employed' | 'seasonal' | 'temporary';
    companyName: string;
    location?: string;
    locationType: 'on-site' | 'remote' | 'hybrid';
    startDate: string;
    endDate?: string | null;
    currentlyWorking?: boolean;
    industry?: string;
    description?: string;
    updateProfileHeadline?: boolean;
    notifyNetwork?: boolean;
    skillIds?: string[];
}

interface UpdatePositionData {
    jobTitle?: string;
    employmentType?: 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship' | 'self-employed' | 'seasonal' | 'temporary';
    companyName?: string;
    location?: string;
    locationType?: 'on-site' | 'remote' | 'hybrid';
    startDate?: string;
    endDate?: string | null;
    currentlyWorking?: boolean;
    industry?: string;
    description?: string;
    updateProfileHeadline?: boolean;
    notifyNetwork?: boolean;
    skillIds?: string[];
}

// ==================== POSITION SERVICE ====================

class PositionService {

    /**
     * ✅ CREATE POSITION (Feature 16-27)
     */
    static async createPosition(data: CreatePositionData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating position', {
                userId: data.userId,
                jobTitle: data.jobTitle,
                companyName: data.companyName,
                correlationId,
            });

            // Validate user
            const user = await User.findOne({ userId: data.userId });
            if (!user) throw new Error('User not found');
            if (user.status !== 'active') throw new Error('User account is not active');

            // Parse dates
            const startDate = new Date(data.startDate);
            const endDate = data.endDate ? new Date(data.endDate) : null;

            // Get current position count for display order
            const count = await Position.getUserPositionCount(data.userId);

            // Create position
            const position = new Position({
                positionId: uuidv4(),
                userId: data.userId,
                jobTitle: data.jobTitle.trim(),
                employmentType: data.employmentType,
                companyName: data.companyName.trim(),
                location: data.location?.trim(),
                locationType: data.locationType,
                startDate,
                endDate,
                currentlyWorking: data.currentlyWorking ?? !endDate,
                industry: data.industry?.trim(),
                description: data.description?.trim(),
                updateProfileHeadline: data.updateProfileHeadline ?? false,
                notifyNetwork: data.notifyNetwork ?? true,
                skillIds: data.skillIds || [],
                displayOrder: count,
            });

            await position.save();

            // Add to user's positionIds
            await User.updateOne(
                { userId: data.userId },
                { $addToSet: { positionIds: position.positionId } }
            );

            // Update user's headline if requested (Feature 25)
            if (data.updateProfileHeadline) {
                await this.updateUserHeadline(data.userId, position);
            }

            // Recalculate total experience (Feature 35)
            await this.updateTotalExperience(data.userId);

            LoggerUtil.info('Position created', {
                positionId: position.positionId,
                userId: data.userId,
                correlationId,
            });

            return this.formatPositionResponse(position);

        } catch (error: any) {
            LoggerUtil.error('Create position failed', {
                error: error.message,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ GET ALL POSITIONS
     */
    static async getAllPositions(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            const positionList = await Position.findByUserId(userId, includeArchived);

            // Feature 35: Total experience calculation
            const totalExperience = await Position.calculateTotalExperience(userId);

            // Feature 36: Employment gap detection
            const employmentGaps = await Position.detectEmploymentGaps(userId);

            return {
                positionList: positionList.map(pos => this.formatPositionResponse(pos)),
                total: positionList.length,
                totalExperience,
                employmentGaps,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all positions failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ GET POSITION BY ID
     */
    static async getPositionById(positionId: string, userId: string): Promise<any> {
        const position = await Position.findActiveById(positionId, userId);
        if (!position) throw new Error('Position not found');

        return this.formatPositionResponse(position);
    }

    /**
     * ✅ UPDATE POSITION (Feature 30)
     */
    static async updatePosition(
        positionId: string,
        userId: string,
        updates: UpdatePositionData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const position = await Position.findActiveById(positionId, userId);
            if (!position) throw new Error('Position not found');

            // Apply updates
            if (updates.jobTitle) position.jobTitle = updates.jobTitle.trim();
            if (updates.employmentType) position.employmentType = updates.employmentType;
            if (updates.companyName) position.companyName = updates.companyName.trim();
            if (updates.location !== undefined) position.location = updates.location?.trim();
            if (updates.locationType) position.locationType = updates.locationType;
            if (updates.startDate) position.startDate = new Date(updates.startDate);
            if (updates.endDate !== undefined) {
                position.endDate = updates.endDate ? new Date(updates.endDate) : undefined;
                position.currentlyWorking = !updates.endDate;
            }
            if (updates.industry !== undefined) position.industry = updates.industry?.trim();
            if (updates.description !== undefined) position.description = updates.description?.trim();
            if (updates.updateProfileHeadline !== undefined) position.updateProfileHeadline = updates.updateProfileHeadline;
            if (updates.notifyNetwork !== undefined) position.notifyNetwork = updates.notifyNetwork;
            if (updates.skillIds) position.skillIds = updates.skillIds;

            await position.save();

            // Update headline if requested
            if (updates.updateProfileHeadline) {
                await this.updateUserHeadline(userId, position);
            }

            // Recalculate total experience
            await this.updateTotalExperience(userId);

            LoggerUtil.info('Position updated', { positionId, userId, correlationId });

            return this.formatPositionResponse(position);

        } catch (error: any) {
            LoggerUtil.error('Update position failed', {
                error: error.message,
                positionId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ DELETE POSITION (SOFT) (Feature 31)
     */
    static async deletePosition(positionId: string, userId: string): Promise<any> {
        const position = await Position.findActiveById(positionId, userId);
        if (!position) throw new Error('Position not found');

        position.isDeleted = true;
        position.deletedAt = new Date();
        await position.save();

        // Remove from user's positionIds
        await User.updateOne(
            { userId },
            { $pull: { positionIds: positionId } }
        );

        // Recalculate total experience
        await this.updateTotalExperience(userId);

        return { positionId, deletedAt: position.deletedAt, message: 'Position deleted successfully' };
    }

    /**
     * ✅ DELETE POSITION (PERMANENT)
     */
    static async deletePositionPermanently(positionId: string, userId: string): Promise<any> {
        const position = await Position.findOne({ positionId, userId });
        if (!position) throw new Error('Position not found');

        await position.deleteOne();

        await User.updateOne(
            { userId },
            { $pull: { positionIds: positionId } }
        );

        await this.updateTotalExperience(userId);

        return { positionId, message: 'Position permanently deleted' };
    }

    /**
     * ✅ ARCHIVE POSITION (Feature 32)
     */
    static async archivePosition(positionId: string, userId: string): Promise<any> {
        const position = await Position.findActiveById(positionId, userId);
        if (!position) throw new Error('Position not found');
        if (position.isArchived) throw new Error('Position is already archived');

        position.isArchived = true;
        position.archivedAt = new Date();
        await position.save();

        return {
            positionId,
            isArchived: true,
            archivedAt: position.archivedAt,
            message: 'Position archived successfully',
        };
    }

    /**
     * ✅ RESTORE POSITION (Feature 33)
     */
    static async restorePosition(positionId: string, userId: string): Promise<any> {
        const position = await Position.findOne({
            positionId,
            userId,
            isDeleted: false,
        });

        if (!position) throw new Error('Position not found');
        if (!position.isArchived) throw new Error('Position is not archived');

        position.isArchived = false;
        position.archivedAt = undefined;
        await position.save();

        return {
            positionId,
            isArchived: false,
            message: 'Position restored successfully',
        };
    }

    /**
     * ✅ REORDER POSITIONS (Feature 34)
     */
    static async reorderPositions(userId: string, positionIds: string[]): Promise<any> {
        await Position.reorderPositions(userId, positionIds);

        return {
            message: 'Positions reordered successfully',
            order: positionIds,
        };
    }

    /**
     * ✅ ADD MEDIA ATTACHMENT (Feature 28)
     */
    static async addMediaAttachment(
        positionId: string,
        userId: string,
        mediaData: {
            type: 'image' | 'video' | 'document' | 'link';
            url: string;
            publicId?: string;
            fileName?: string;
            fileSize?: number;
            title?: string;
            description?: string;
        }
    ): Promise<any> {
        const position = await Position.findActiveById(positionId, userId);
        if (!position) throw new Error('Position not found');

        if (!position.mediaAttachments) position.mediaAttachments = [];

        position.mediaAttachments.push({
            type: mediaData.type,
            url: mediaData.url,
            publicId: mediaData.publicId,
            fileName: mediaData.fileName,
            fileSize: mediaData.fileSize,
            title: mediaData.title,
            description: mediaData.description,
            uploadedAt: new Date(),
        });

        await position.save();

        return this.formatPositionResponse(position);
    }

    /**
     * ✅ REMOVE MEDIA ATTACHMENT
     */
    static async removeMediaAttachment(
        positionId: string,
        userId: string,
        attachmentIndex: number
    ): Promise<any> {
        const position = await Position.findActiveById(positionId, userId);
        if (!position) throw new Error('Position not found');

        if (!position.mediaAttachments || !position.mediaAttachments[attachmentIndex]) {
            throw new Error('Media attachment not found');
        }

        position.mediaAttachments.splice(attachmentIndex, 1);
        await position.save();

        return this.formatPositionResponse(position);
    }

    /**
     * ✅ GET TOTAL EXPERIENCE (Feature 35)
     */
    static async getTotalExperience(userId: string): Promise<any> {
        return await Position.calculateTotalExperience(userId);
    }

    /**
     * ✅ DETECT EMPLOYMENT GAPS (Feature 36)
     */
    static async getEmploymentGaps(userId: string): Promise<any> {
        const gaps = await Position.detectEmploymentGaps(userId);

        return {
            hasGaps: gaps.length > 0,
            gapsCount: gaps.length,
            gaps,
        };
    }

    /**
     * ✅ GET CURRENT POSITION
     */
    static async getCurrentPosition(userId: string): Promise<any> {
        const position = await Position.getCurrentPosition(userId);

        if (!position) {
            return null;
        }

        return this.formatPositionResponse(position);
    }

    /**
     * ✅ SHARE UPDATE ABOUT NEW POSITION (Feature 37)
     */
    static async sharePositionUpdate(positionId: string, userId: string, message?: string): Promise<any> {
        const position = await Position.findActiveById(positionId, userId);
        if (!position) throw new Error('Position not found');

        // This would integrate with your notification/feed system
        // For now, we'll just return the position data

        const shareData = {
            positionId: position.positionId,
            userId,
            jobTitle: position.jobTitle,
            companyName: position.companyName,
            startDate: position.startDate,
            message: message || `Excited to share that I'm starting a new position as ${position.jobTitle} at ${position.companyName}!`,
            timestamp: new Date(),
        };

        LoggerUtil.info('Position update shared', { positionId, userId });

        return shareData;
    }

    /**
     * ✅ UPDATE USER HEADLINE (Feature 25)
     */
    private static async updateUserHeadline(userId: string, position: any): Promise<void> {
        const headline = `${position.jobTitle} at ${position.companyName}`;

        await User.updateOne(
            { userId },
            { $set: { headline } }
        );

        LoggerUtil.info('User headline updated', { userId, headline });
    }

    /**
     * ✅ UPDATE TOTAL EXPERIENCE (Feature 35)
     */
    private static async updateTotalExperience(userId: string): Promise<void> {
        const { years } = await Position.calculateTotalExperience(userId);

        await User.updateOne(
            { userId },
            { $set: { totalExperienceYears: years } }
        );

        LoggerUtil.info('Total experience updated', { userId, years });
    }

    /**
     * ✅ FORMAT RESPONSE
     */
    private static formatPositionResponse(position: any): any {
        return {
            positionId: position.positionId,
            userId: position.userId,
            jobTitle: position.jobTitle,
            employmentType: position.employmentType,
            companyName: position.companyName,
            location: position.location,
            locationType: position.locationType,
            startDate: position.startDate,
            endDate: position.endDate,
            currentlyWorking: position.currentlyWorking,
            duration: position.duration,
            formattedDates: position.formattedDates,
            durationMonths: position.durationMonths,
            durationYears: position.durationYears,
            industry: position.industry,
            description: position.description,
            updateProfileHeadline: position.updateProfileHeadline,
            notifyNetwork: position.notifyNetwork,
            companyLogo: position.companyLogo,
            mediaAttachments: position.mediaAttachments,
            skillIds: position.skillIds,
            displayOrder: position.displayOrder,
            hasEmploymentGap: position.hasEmploymentGap,
            gapDurationMonths: position.gapDurationMonths,
            isArchived: position.isArchived,
            archivedAt: position.archivedAt,
            createdAt: position.createdAt,
            updatedAt: position.updatedAt,
        };
    }
}

export default PositionService;