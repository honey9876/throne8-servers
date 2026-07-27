/**
 * Honor Service - Business Logic for Honors & Awards Management
 * 
 * @module services/honor.service
 * @version 1.0.0
 */

import { Honor, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

// ==================== INTERFACES ====================

interface CreateHonorData {
    userId: string;
    title: string;
    issuer: string;
    dateReceived: {
        month: number;
        year: number;
    };
    description?: string;
    category: 'academic' | 'professional' | 'sports' | 'community_service' | 'cultural' | 'research' | 'leadership' | 'other';
    associatedWith?: {
        associationType: 'school' | 'company';
        associationId?: string;
        associationName: string;
    };
    visibility?: 'public' | 'connections';
}

interface UpdateHonorData {
    title?: string;
    issuer?: string;
    dateReceived?: {
        month: number;
        year: number;
    };
    description?: string;
    category?: 'academic' | 'professional' | 'sports' | 'community_service' | 'cultural' | 'research' | 'leadership' | 'other';
    associatedWith?: {
        associationType: 'school' | 'company';
        associationId?: string;
        associationName: string;
    };
    visibility?: 'public' | 'connections';
}

interface ReorderData {
    honorId: string;
    newOrder: number;
}

interface VerificationData {
    verifiedBy: string;
    verificationProof?: string;
}

// ==================== HONOR SERVICE ====================

class HonorService {

    /**
     * ✅ Create Honor
     */
    static async createHonor(data: CreateHonorData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new honor', {
                userId: data.userId,
                title: data.title,
                correlationId,
            });

            // Validate user
            const user = await User.findOne({ userId: data.userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Check honor limit (100 max)
            const honorCount = await Honor.getUserHonorCount(data.userId);
            if (honorCount >= 100) {
                throw new Error('Maximum honor limit (100) reached');
            }

            // Get next display order
            const displayOrder = await Honor.getNextDisplayOrder(data.userId);

            // Create honor
            const honorId = uuidv4();
            const honor = new Honor({
                honorId,
                userId: data.userId,
                title: data.title.trim(),
                issuer: data.issuer.trim(),
                dateReceived: data.dateReceived,
                description: data.description?.trim(),
                category: data.category,
                associatedWith: data.associatedWith,
                visibility: data.visibility || 'public',
                displayOrder,
                isPinned: false,
                mediaAttachments: [],
                verification: { isVerified: false },
            });

            await honor.save();

            // Update user model with first honor ID
            if (!user.honorId) {
                await User.findOneAndUpdate(
                    { userId: data.userId },
                    { $set: { honorId } },
                    { new: true }
                );
            }

            LoggerUtil.info('Honor created successfully', {
                honorId,
                userId: data.userId,
                correlationId,
            });

            return {
                honorId: honor.honorId,
                userId: honor.userId,
                title: honor.title,
                issuer: honor.issuer,
                dateReceived: honor.dateReceived,
                description: honor.description,
                category: honor.category,
                associatedWith: honor.associatedWith,
                visibility: honor.visibility,
                displayOrder: honor.displayOrder,
                isPinned: honor.isPinned,
                verification: honor.verification,
                createdAt: honor.createdAt,
                updatedAt: honor.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Honor creation failed', {
                error: error.message,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get All Honors
     */
    static async getAllHonors(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all honors', {
                userId,
                includeArchived,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const honorsList = await Honor.findByUserId(userId, includeArchived);

            // Separate pinned and regular
            const pinnedHonors = honorsList.filter(h => h.isPinned);
            const regularHonors = honorsList.filter(h => !h.isPinned);

            // Group by category
            const byCategory = honorsList.reduce((acc, honor) => {
                const cat = honor.category;
                if (!acc[cat]) {
                    acc[cat] = [];
                }
                acc[cat].push(honor);
                return acc;
            }, {} as Record<string, any[]>);

            // Count verified
            const verifiedCount = honorsList.filter(h => h.verification.isVerified).length;

            LoggerUtil.info('Honors fetched successfully', {
                userId,
                total: honorsList.length,
                pinned: pinnedHonors.length,
                verified: verifiedCount,
                correlationId,
            });

            return {
                honorsList,
                total: honorsList.length,
                pinnedHonors,
                regularHonors,
                byCategory,
                verifiedCount,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all honors failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get Honor by ID
     */
    static async getHonorById(honorId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching honor by ID', {
                honorId,
                userId,
                correlationId,
            });

            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            LoggerUtil.info('Honor fetched successfully', {
                honorId,
                userId,
                correlationId,
            });

            return {
                honorId: honor.honorId,
                userId: honor.userId,
                title: honor.title,
                issuer: honor.issuer,
                dateReceived: honor.dateReceived,
                description: honor.description,
                category: honor.category,
                associatedWith: honor.associatedWith,
                organizationLogo: honor.organizationLogo,
                mediaAttachments: honor.mediaAttachments,
                verification: honor.verification,
                isPinned: honor.isPinned,
                pinnedOrder: honor.pinnedOrder,
                visibility: honor.visibility,
                displayOrder: honor.displayOrder,
                isArchived: honor.isArchived,
                createdAt: honor.createdAt,
                updatedAt: honor.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get honor by ID failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update Honor
     */
    static async updateHonor(
        honorId: string,
        userId: string,
        updates: UpdateHonorData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating honor', {
                honorId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            // Apply updates
            if (updates.title !== undefined) {
                honor.title = updates.title.trim();
            }
            if (updates.issuer !== undefined) {
                honor.issuer = updates.issuer.trim();
            }
            if (updates.dateReceived !== undefined) {
                honor.dateReceived = updates.dateReceived;
            }
            if (updates.description !== undefined) {
                honor.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.category !== undefined) {
                honor.category = updates.category;
            }
            if (updates.associatedWith !== undefined) {
                honor.associatedWith = updates.associatedWith;
            }
            if (updates.visibility !== undefined) {
                honor.visibility = updates.visibility;
            }

            await honor.save();

            LoggerUtil.info('Honor updated successfully', {
                honorId,
                userId,
                correlationId,
            });

            return {
                honorId: honor.honorId,
                userId: honor.userId,
                title: honor.title,
                issuer: honor.issuer,
                dateReceived: honor.dateReceived,
                description: honor.description,
                category: honor.category,
                associatedWith: honor.associatedWith,
                visibility: honor.visibility,
                updatedAt: honor.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update honor failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Honor
     */
    static async deleteHonor(
        honorId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting honor', {
                honorId,
                userId,
                permanent,
                correlationId,
            });

            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            // Delete media from Cloudinary
            if (honor.organizationLogo?.logoPublicId) {
                try {
                    await cloudinary.uploader.destroy(honor.organizationLogo.logoPublicId);
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete logo (non-critical)', { error: err.message });
                }
            }

            for (const media of honor.mediaAttachments) {
                if (media.mediaPublicId) {
                    try {
                        const resourceType = media.mediaType === 'certificate' ? 'raw' : 'image';
                        await cloudinary.uploader.destroy(media.mediaPublicId, { resource_type: resourceType });
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                    }
                }
            }

            if (permanent) {
                await Honor.deleteOne({ honorId, userId });

                return {
                    honorId,
                    message: 'Honor permanently deleted',
                };
            } else {
                honor.isDeleted = true;
                honor.deletedAt = new Date();
                honor.isPinned = false;
                honor.pinnedOrder = undefined;
                await honor.save();

                return {
                    honorId,
                    deletedAt: honor.deletedAt,
                    message: 'Honor deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete honor failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive Honor
     */
    static async archiveHonor(honorId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            if (honor.isArchived) {
                throw new Error('Honor is already archived');
            }

            honor.isArchived = true;
            honor.archivedAt = new Date();
            honor.isPinned = false;
            honor.pinnedOrder = undefined;
            await honor.save();

            return {
                honorId: honor.honorId,
                isArchived: honor.isArchived,
                archivedAt: honor.archivedAt,
                message: 'Honor archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive honor failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore Honor
     */
    static async restoreHonor(honorId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const honor = await Honor.findOne({
                honorId,
                userId,
            });

            if (!honor) {
                throw new Error('Honor not found');
            }

            if (honor.isDeleted) {
                honor.isDeleted = false;
                honor.deletedAt = undefined;
            }

            if (honor.isArchived) {
                honor.isArchived = false;
                honor.archivedAt = undefined;
            }

            await honor.save();

            return {
                honorId: honor.honorId,
                isDeleted: honor.isDeleted,
                isArchived: honor.isArchived,
                message: 'Honor restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore honor failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Pin Honor
     */
    static async pinHonor(
        honorId: string,
        userId: string,
        pinnedOrder: number
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            if (![1, 2, 3].includes(pinnedOrder)) {
                throw new Error('Pinned order must be 1, 2, or 3');
            }

            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            if (honor.isArchived) {
                throw new Error('Cannot pin archived honor');
            }

            // Unpin existing honor at this position
            const existing = await Honor.findOne({
                userId,
                isPinned: true,
                pinnedOrder,
                honorId: { $ne: honorId },
                isDeleted: false,
            });

            if (existing) {
                existing.isPinned = false;
                existing.pinnedOrder = undefined;
                existing.pinnedAt = undefined;
                await existing.save();
            }

            honor.isPinned = true;
            honor.pinnedOrder = pinnedOrder;
            honor.pinnedAt = new Date();
            await honor.save();

            return {
                honorId: honor.honorId,
                isPinned: honor.isPinned,
                pinnedOrder: honor.pinnedOrder,
                message: 'Honor pinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Pin honor failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Unpin Honor
     */
    static async unpinHonor(honorId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            if (!honor.isPinned) {
                throw new Error('Honor is not pinned');
            }

            honor.isPinned = false;
            honor.pinnedOrder = undefined;
            honor.pinnedAt = undefined;
            await honor.save();

            return {
                honorId: honor.honorId,
                isPinned: honor.isPinned,
                message: 'Honor unpinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Unpin honor failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder Honors
     */
    static async reorderHonors(userId: string, reorderData: ReorderData[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            for (const item of reorderData) {
                const honor = await Honor.findActiveById(item.honorId, userId);
                if (honor) {
                    honor.displayOrder = item.newOrder;
                    await honor.save();
                }
            }

            return {
                message: 'Honors reordered successfully',
                updated: reorderData.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder honors failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Verify Honor
     */
    static async verifyHonor(
        honorId: string,
        userId: string,
        verificationData: VerificationData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            honor.verification = {
                isVerified: true,
                verifiedBy: verificationData.verifiedBy,
                verifiedAt: new Date(),
                verificationProof: verificationData.verificationProof,
            };

            await honor.save();

            return {
                honorId: honor.honorId,
                verification: honor.verification,
                message: 'Honor verified successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Verify honor failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload Organization Logo
     */
    static async uploadOrganizationLogo(
        honorId: string,
        userId: string,
        file: Express.Multer.File
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            // Delete old logo if exists
            if (honor.organizationLogo?.logoPublicId) {
                try {
                    await cloudinary.uploader.destroy(honor.organizationLogo.logoPublicId);
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete old logo (non-critical)', { error: err.message });
                }
            }

            // Upload new logo
            const uploadResult = await this.uploadImageToCloudinary(file.buffer, userId, 'organization-logos');

            honor.organizationLogo = {
                logoUrl: uploadResult.url,
                logoPublicId: uploadResult.public_id,
                logoSecureUrl: uploadResult.secure_url,
                uploadedAt: new Date(),
            };

            await honor.save();

            return {
                honorId: honor.honorId,
                organizationLogo: honor.organizationLogo,
                message: 'Organization logo uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Upload organization logo failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload Media Attachment
     */
    static async uploadMediaAttachment(
        honorId: string,
        userId: string,
        file: Express.Multer.File,
        mediaType: 'certificate' | 'photo'
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            if (honor.mediaAttachments.length >= 10) {
                throw new Error('Maximum 10 media attachments allowed');
            }

            let uploadResult: any;

            if (mediaType === 'photo') {
                uploadResult = await this.uploadImageToCloudinary(file.buffer, userId, 'honor-photos');
            } else {
                uploadResult = await this.uploadDocumentToCloudinary(file.buffer, userId, file.originalname);
            }

            const mediaId = uuidv4();
            honor.mediaAttachments.push({
                mediaId,
                mediaType,
                mediaUrl: uploadResult.url,
                mediaSecureUrl: uploadResult.secure_url,
                mediaPublicId: uploadResult.public_id,
                fileName: file.originalname,
                fileSize: uploadResult.bytes,
                uploadedAt: new Date(),
            } as any);

            await honor.save();

            return {
                honorId: honor.honorId,
                mediaAttachment: honor.mediaAttachments[honor.mediaAttachments.length - 1],
                message: 'Media attachment uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Upload media attachment failed', {
                error: error.message,
                honorId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Media Attachment
     */
    static async deleteMediaAttachment(
        honorId: string,
        userId: string,
        mediaId: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const honor = await Honor.findActiveById(honorId, userId);

            if (!honor) {
                throw new Error('Honor not found');
            }

            const mediaIndex = honor.mediaAttachments.findIndex(m => m.mediaId === mediaId);
            if (mediaIndex === -1) {
                throw new Error('Media attachment not found');
            }

            const media = honor.mediaAttachments[mediaIndex];

            if (media.mediaPublicId) {
                try {
                    const resourceType = media.mediaType === 'certificate' ? 'raw' : 'image';
                    await cloudinary.uploader.destroy(media.mediaPublicId, { resource_type: resourceType });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                }
            }

            honor.mediaAttachments.splice(mediaIndex, 1);
            await honor.save();

            return {
                honorId: honor.honorId,
                mediaId,
                message: 'Media attachment deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                honorId,
                mediaId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== CLOUDINARY HELPERS ====================

    private static async uploadImageToCloudinary(
        buffer: Buffer,
        userId: string,
        folder: string
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
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

    private static async uploadDocumentToCloudinary(
        buffer: Buffer,
        userId: string,
        fileName: string
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'honor-certificates',
                    public_id: `${userId}_${Date.now()}_${fileName}`,
                    resource_type: 'raw',
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

export default HonorService;