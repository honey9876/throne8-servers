/**
 * Volunteer Service - Business Logic for Volunteer Experience Management
 * Handles volunteer CRUD, media upload, skills tagging, reordering
 * 
 * @module services/volunteer.service
 * @version 1.0.0
 */

import { Volunteer, User, Skill } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

// ==================== INTERFACES ====================

interface CreateVolunteerData {
    userId: string;
    organizationName: string;
    role: string;
    cause: string;
    startDate: {
        month: number;
        year: number;
    };
    endDate?: {
        month: number;
        year: number;
    };
    currentlyVolunteering: boolean;
    description?: string;
    skillsUsed?: string[];
    notifyNetwork?: boolean;
}

interface UpdateVolunteerData {
    organizationName?: string;
    role?: string;
    cause?: string;
    startDate?: {
        month: number;
        year: number;
    };
    endDate?: {
        month: number;
        year: number;
    };
    currentlyVolunteering?: boolean;
    description?: string;
    skillsUsed?: string[];
    notifyNetwork?: boolean;
}

interface MediaUploadData {
    mediaType: 'photo' | 'certificate';
    caption?: string;
}

// ==================== VOLUNTEER SERVICE CLASS ====================

class VolunteerService {

    /**
     * ✅ Create new volunteer experience
     */
    static async createVolunteer(data: CreateVolunteerData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new volunteer experience', {
                userId: data.userId,
                organizationName: data.organizationName,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId: data.userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Check volunteer limit (50 max)
            const volunteerCount = await Volunteer.getUserVolunteerCount(data.userId);
            if (volunteerCount >= 50) {
                throw new Error('Maximum volunteer experience limit (50) reached');
            }

            // Validate skills if provided
            if (data.skillsUsed && data.skillsUsed.length > 0) {
                const skills = await Skill.find({
                    skillId: { $in: data.skillsUsed },
                    userId: data.userId,
                    isDeleted: false,
                });

                if (skills.length !== data.skillsUsed.length) {
                    throw new Error('One or more skill IDs are invalid');
                }
            }

            // Get next display order
            const maxOrder = await Volunteer.findOne({ userId: data.userId, isDeleted: false })
                .sort({ displayOrder: -1 })
                .select('displayOrder')
                .exec();

            const displayOrder = maxOrder ? maxOrder.displayOrder + 1 : 0;

            // Create volunteer
            const volunteerId = uuidv4();
            const volunteer = new Volunteer({
                volunteerId,
                userId: data.userId,
                organizationName: data.organizationName.trim(),
                role: data.role.trim(),
                cause: data.cause,
                startDate: data.startDate,
                endDate: data.currentlyVolunteering ? undefined : data.endDate,
                currentlyVolunteering: data.currentlyVolunteering,
                description: data.description?.trim(),
                skillsUsed: data.skillsUsed || [],
                notifyNetwork: data.notifyNetwork || false,
                displayOrder,
                mediaAttachments: [],
            });

            await volunteer.save();

            // Update user model
            await User.findOneAndUpdate(
                { userId: data.userId },
                { $addToSet: { volunteerIds: volunteerId } },
                { new: true }
            );

            LoggerUtil.info('Volunteer experience created successfully', {
                volunteerId,
                userId: data.userId,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                userId: volunteer.userId,
                organizationName: volunteer.organizationName,
                role: volunteer.role,
                cause: volunteer.cause,
                startDate: volunteer.startDate,
                endDate: volunteer.endDate,
                currentlyVolunteering: volunteer.currentlyVolunteering,
                description: volunteer.description,
                skillsUsed: volunteer.skillsUsed,
                notifyNetwork: volunteer.notifyNetwork,
                hasOrganizationLogo: false,
                mediaCount: 0,
                skillsCount: volunteer.skillsUsed.length,
                displayOrder: volunteer.displayOrder,
                createdAt: volunteer.createdAt,
                updatedAt: volunteer.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Volunteer experience creation failed', {
                error: error.message,
                stack: error.stack,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload organization logo
     */
    static async uploadOrganizationLogo(volunteerId: string, userId: string, file: Express.Multer.File): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading organization logo', {
                volunteerId,
                userId,
                fileName: file.originalname,
                correlationId,
            });

            // Find volunteer
            const volunteer = await Volunteer.findActiveById(volunteerId, userId);
            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            // Delete old logo if exists
            if (volunteer.organizationLogo?.logoPublicId) {
                try {
                    await cloudinary.uploader.destroy(volunteer.organizationLogo.logoPublicId);
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete old logo (non-critical)', {
                        error: err.message,
                    });
                }
            }

            // Upload to Cloudinary
            const uploadResult = await this.uploadImageToCloudinary(file.buffer, userId);

            // Update volunteer
            volunteer.organizationLogo = {
                logoUrl: uploadResult.url,
                logoPublicId: uploadResult.public_id,
                logoSecureUrl: uploadResult.secure_url,
                uploadedAt: new Date(),
            };

            await volunteer.save();

            LoggerUtil.info('Organization logo uploaded successfully', {
                volunteerId,
                userId,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                organizationLogo: volunteer.organizationLogo,
                message: 'Organization logo uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Organization logo upload failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload media attachment (photo or certificate)
     */
    static async uploadMediaAttachment(
        volunteerId: string,
        userId: string,
        file: Express.Multer.File,
        metadata: MediaUploadData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading media attachment', {
                volunteerId,
                userId,
                mediaType: metadata.mediaType,
                fileName: file.originalname,
                correlationId,
            });

            // Find volunteer
            const volunteer = await Volunteer.findActiveById(volunteerId, userId);
            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            // Check media count limit (max 10)
            if (volunteer.mediaAttachments.length >= 10) {
                throw new Error('Maximum 10 media attachments allowed');
            }

            // Upload to Cloudinary
            const uploadResult = await this.uploadImageToCloudinary(file.buffer, userId);

            // Add to media attachments
            const mediaId = uuidv4();
            volunteer.mediaAttachments.push({
                mediaId,
                mediaType: metadata.mediaType,
                mediaUrl: uploadResult.url,
                mediaSecureUrl: uploadResult.secure_url,
                mediaPublicId: uploadResult.public_id,
                fileName: file.originalname,
                fileSize: uploadResult.bytes,
                caption: metadata.caption,
                uploadedAt: new Date(),
            } as any);

            await volunteer.save();

            LoggerUtil.info('Media attachment uploaded successfully', {
                volunteerId,
                userId,
                mediaId,
                mediaType: metadata.mediaType,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                mediaAttachment: volunteer.mediaAttachments[volunteer.mediaAttachments.length - 1],
                message: 'Media attachment uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Media attachment upload failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete media attachment
     */
    static async deleteMediaAttachment(volunteerId: string, userId: string, mediaId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const volunteer = await Volunteer.findActiveById(volunteerId, userId);
            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            const mediaIndex = volunteer.mediaAttachments.findIndex(m => m.mediaId === mediaId);
            if (mediaIndex === -1) {
                throw new Error('Media attachment not found');
            }

            const media = volunteer.mediaAttachments[mediaIndex];

            // Delete from Cloudinary
            if (media.mediaPublicId) {
                try {
                    await cloudinary.uploader.destroy(media.mediaPublicId);
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete media from Cloudinary (non-critical)', {
                        error: err.message,
                    });
                }
            }

            // Remove from array
            volunteer.mediaAttachments.splice(mediaIndex, 1);
            await volunteer.save();

            return {
                volunteerId: volunteer.volunteerId,
                mediaId,
                message: 'Media attachment deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                volunteerId,
                mediaId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all volunteers for user
     */
    static async getAllVolunteers(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all volunteer experiences', {
                userId,
                includeArchived,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const volunteersList = await Volunteer.findByUserId(userId, includeArchived);

            // Separate current and past
            const currentVolunteers = volunteersList.filter(v => v.currentlyVolunteering);
            const pastVolunteers = volunteersList.filter(v => !v.currentlyVolunteering);

            LoggerUtil.info('Volunteer experiences fetched successfully', {
                userId,
                total: volunteersList.length,
                current: currentVolunteers.length,
                past: pastVolunteers.length,
                correlationId,
            });

            return {
                volunteersList,
                total: volunteersList.length,
                currentVolunteers,
                pastVolunteers,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all volunteers failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single volunteer by ID
     */
    static async getVolunteerById(volunteerId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching volunteer by ID', {
                volunteerId,
                userId,
                correlationId,
            });

            const volunteer = await Volunteer.findActiveById(volunteerId, userId);

            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            LoggerUtil.info('Volunteer fetched successfully', {
                volunteerId,
                userId,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                userId: volunteer.userId,
                organizationName: volunteer.organizationName,
                role: volunteer.role,
                cause: volunteer.cause,
                startDate: volunteer.startDate,
                endDate: volunteer.endDate,
                currentlyVolunteering: volunteer.currentlyVolunteering,
                description: volunteer.description,
                organizationLogo: volunteer.organizationLogo,
                mediaAttachments: volunteer.mediaAttachments,
                skillsUsed: volunteer.skillsUsed,
                notifyNetwork: volunteer.notifyNetwork,
                hasOrganizationLogo: !!(volunteer.organizationLogo?.logoUrl),
                mediaCount: volunteer.mediaAttachments.length,
                skillsCount: volunteer.skillsUsed.length,
                durationMonths: (volunteer as any).durationMonths,
                displayOrder: volunteer.displayOrder,
                isArchived: volunteer.isArchived,
                archivedAt: volunteer.archivedAt,
                createdAt: volunteer.createdAt,
                updatedAt: volunteer.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get volunteer by ID failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update volunteer
     */
    static async updateVolunteer(
        volunteerId: string,
        userId: string,
        updates: UpdateVolunteerData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating volunteer experience', {
                volunteerId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const volunteer = await Volunteer.findActiveById(volunteerId, userId);

            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            // Validate skills if provided
            if (updates.skillsUsed && updates.skillsUsed.length > 0) {
                const skills = await Skill.find({
                    skillId: { $in: updates.skillsUsed },
                    userId,
                    isDeleted: false,
                });

                if (skills.length !== updates.skillsUsed.length) {
                    throw new Error('One or more skill IDs are invalid');
                }
            }

            // Apply updates
            if (updates.organizationName !== undefined) {
                volunteer.organizationName = updates.organizationName.trim();
            }
            if (updates.role !== undefined) {
                volunteer.role = updates.role.trim();
            }
            if (updates.cause !== undefined) {
                volunteer.cause = updates.cause;
            }
            if (updates.startDate !== undefined) {
                volunteer.startDate = updates.startDate;
            }
            if (updates.currentlyVolunteering !== undefined) {
                volunteer.currentlyVolunteering = updates.currentlyVolunteering;
                if (updates.currentlyVolunteering) {
                    volunteer.endDate = undefined;
                }
            }
            if (updates.endDate !== undefined && !volunteer.currentlyVolunteering) {
                volunteer.endDate = updates.endDate;
            }
            if (updates.description !== undefined) {
                volunteer.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.skillsUsed !== undefined) {
                volunteer.skillsUsed = updates.skillsUsed;
            }
            if (updates.notifyNetwork !== undefined) {
                volunteer.notifyNetwork = updates.notifyNetwork;
            }

            await volunteer.save();

            LoggerUtil.info('Volunteer experience updated successfully', {
                volunteerId,
                userId,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                userId: volunteer.userId,
                organizationName: volunteer.organizationName,
                role: volunteer.role,
                cause: volunteer.cause,
                startDate: volunteer.startDate,
                endDate: volunteer.endDate,
                currentlyVolunteering: volunteer.currentlyVolunteering,
                description: volunteer.description,
                skillsUsed: volunteer.skillsUsed,
                notifyNetwork: volunteer.notifyNetwork,
                hasOrganizationLogo: !!(volunteer.organizationLogo?.logoUrl),
                mediaCount: volunteer.mediaAttachments.length,
                displayOrder: volunteer.displayOrder,
                createdAt: volunteer.createdAt,
                updatedAt: volunteer.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update volunteer failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete volunteer (soft delete or permanent)
     */
    static async deleteVolunteer(volunteerId: string, userId: string, permanent: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting volunteer experience', {
                volunteerId,
                userId,
                permanent,
                correlationId,
            });

            const volunteer = await Volunteer.findActiveById(volunteerId, userId);

            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            if (permanent) {
                // Delete organization logo from Cloudinary
                if (volunteer.organizationLogo?.logoPublicId) {
                    try {
                        await cloudinary.uploader.destroy(volunteer.organizationLogo.logoPublicId);
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete logo (non-critical)', {
                            error: err.message,
                        });
                    }
                }

                // Delete all media
                for (const media of volunteer.mediaAttachments) {
                    if (media.mediaPublicId) {
                        try {
                            await cloudinary.uploader.destroy(media.mediaPublicId);
                        } catch (err: any) {
                            LoggerUtil.warn('Failed to delete media (non-critical)', {
                                error: err.message,
                            });
                        }
                    }
                }

                // Permanent delete
                await Volunteer.deleteOne({ volunteerId, userId });

                // Remove from user model
                await User.findOneAndUpdate(
                    { userId },
                    { $pull: { volunteerIds: volunteerId } },
                    { new: true }
                );

                LoggerUtil.info('Volunteer experience permanently deleted', {
                    volunteerId,
                    userId,
                    correlationId,
                });

                return {
                    volunteerId,
                    message: 'Volunteer experience permanently deleted',
                };
            } else {
                // Soft delete
                volunteer.isDeleted = true;
                volunteer.deletedAt = new Date();
                await volunteer.save();

                LoggerUtil.info('Volunteer experience soft deleted', {
                    volunteerId,
                    userId,
                    correlationId,
                });

                return {
                    volunteerId,
                    deletedAt: volunteer.deletedAt,
                    message: 'Volunteer experience deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete volunteer failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive volunteer
     */
    static async archiveVolunteer(volunteerId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving volunteer experience', {
                volunteerId,
                userId,
                correlationId,
            });

            const volunteer = await Volunteer.findActiveById(volunteerId, userId);

            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            if (volunteer.isArchived) {
                throw new Error('Volunteer experience is already archived');
            }

            volunteer.isArchived = true;
            volunteer.archivedAt = new Date();
            await volunteer.save();

            LoggerUtil.info('Volunteer experience archived successfully', {
                volunteerId,
                userId,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                isArchived: volunteer.isArchived,
                archivedAt: volunteer.archivedAt,
                message: 'Volunteer experience archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive volunteer failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived/deleted volunteer
     */
    static async restoreVolunteer(volunteerId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring volunteer experience', {
                volunteerId,
                userId,
                correlationId,
            });

            const volunteer = await Volunteer.findOne({
                volunteerId,
                userId,
            });

            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            if (!volunteer.isArchived && !volunteer.isDeleted) {
                throw new Error('Volunteer experience is not archived or deleted');
            }

            volunteer.isArchived = false;
            volunteer.archivedAt = undefined;
            volunteer.isDeleted = false;
            volunteer.deletedAt = undefined;
            await volunteer.save();

            LoggerUtil.info('Volunteer experience restored successfully', {
                volunteerId,
                userId,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                isArchived: volunteer.isArchived,
                isDeleted: volunteer.isDeleted,
                message: 'Volunteer experience restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore volunteer failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Toggle notify network
     */
    static async toggleNotifyNetwork(volunteerId: string, userId: string, notifyNetwork: boolean): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Toggling notify network', {
                volunteerId,
                userId,
                notifyNetwork,
                correlationId,
            });

            const volunteer = await Volunteer.findActiveById(volunteerId, userId);

            if (!volunteer) {
                throw new Error('Volunteer experience not found');
            }

            volunteer.notifyNetwork = notifyNetwork;
            await volunteer.save();

            LoggerUtil.info('Notify network toggled successfully', {
                volunteerId,
                userId,
                notifyNetwork,
                correlationId,
            });

            return {
                volunteerId: volunteer.volunteerId,
                notifyNetwork: volunteer.notifyNetwork,
                message: `Network notification ${notifyNetwork ? 'enabled' : 'disabled'}`,
            };

        } catch (error: any) {
            LoggerUtil.error('Toggle notify network failed', {
                error: error.message,
                volunteerId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder volunteers
     */
    static async reorderVolunteers(userId: string, volunteerIds: string[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Reordering volunteer experiences', {
                userId,
                count: volunteerIds.length,
                correlationId,
            });

            // Validate all volunteers belong to user
            const volunteers = await Volunteer.find({
                volunteerId: { $in: volunteerIds },
                userId,
                isDeleted: false,
            });

            if (volunteers.length !== volunteerIds.length) {
                throw new Error('One or more volunteer IDs are invalid');
            }

            await Volunteer.reorderVolunteers(userId, volunteerIds);

            LoggerUtil.info('Volunteer experiences reordered successfully', {
                userId,
                count: volunteerIds.length,
                correlationId,
            });

            return {
                message: 'Volunteer experiences reordered successfully',
                count: volunteerIds.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder volunteers failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== CLOUDINARY HELPERS ====================

    private static async uploadImageToCloudinary(buffer: Buffer, userId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'volunteer-media',
                    public_id: `${userId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 1200, height: 1200, crop: 'limit' },
                        { quality: 'auto:good' },
                    ],
                    overwrite: true,
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(buffer);
        });
    }
}

export default VolunteerService;