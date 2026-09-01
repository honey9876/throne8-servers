/**
 * Publication Service - Business Logic for Publications Management
 * 
 * @module services/publication.service
 * @version 1.0.0
 */

import { Publication, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

// ==================== INTERFACES ====================

interface CreatePublicationData {
    userId: string;
    title: string;
    publisherName: string;
    publicationDate: {
        month: number;
        day?: number;
        year: number;
    };
    publicationUrl?: string;
    description?: string;
    authors?: Array<{
        authorId?: string;
        authorName: string;
        authorProfile?: string;
    }>;
    publicationType: 'article' | 'book' | 'paper' | 'conference_paper' | 'thesis';
}

interface UpdatePublicationData {
    title?: string;
    publisherName?: string;
    publicationDate?: {
        month: number;
        day?: number;
        year: number;
    };
    publicationUrl?: string;
    description?: string;
    authors?: Array<{
        authorId?: string;
        authorName: string;
        authorProfile?: string;
    }>;
    publicationType?: 'article' | 'book' | 'paper' | 'conference_paper' | 'thesis';
}

interface ReorderData {
    publicationId: string;
    newOrder: number;
}

// ==================== PUBLICATION SERVICE ====================

class PublicationService {

    /**
     * ✅ Create Publication
     */
    static async createPublication(data: CreatePublicationData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new publication', {
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

            // Check publication limit (50 max)
            const publicationCount = await Publication.getUserPublicationCount(data.userId);
            if (publicationCount >= 50) {
                throw new Error('Maximum publication limit (50) reached');
            }

            // Get next display order
            const displayOrder = await Publication.getNextDisplayOrder(data.userId);

            // Create publication
            const publicationId = uuidv4();
            const publication = new Publication({
                publicationId,
                userId: data.userId,
                title: data.title.trim(),
                publisherName: data.publisherName.trim(),
                publicationDate: data.publicationDate,
                publicationUrl: data.publicationUrl?.trim(),
                description: data.description?.trim(),
                authors: data.authors || [],
                publicationType: data.publicationType,
                displayOrder,
                isPinned: false,
                citationCount: 0,
                mediaAttachments: [],
            });

            await publication.save();

            // Update user model with first publication ID
            if (!user.publicationId) {
                await User.findOneAndUpdate(
                    { userId: data.userId },
                    { $set: { publicationId } },
                    { new: true }
                );
            }

            LoggerUtil.info('Publication created successfully', {
                publicationId,
                userId: data.userId,
                correlationId,
            });

            return {
                publicationId: publication.publicationId,
                userId: publication.userId,
                title: publication.title,
                publisherName: publication.publisherName,
                publicationDate: publication.publicationDate,
                publicationUrl: publication.publicationUrl,
                description: publication.description,
                authors: publication.authors,
                publicationType: publication.publicationType,
                displayOrder: publication.displayOrder,
                citationCount: publication.citationCount,
                isPinned: publication.isPinned,
                createdAt: publication.createdAt,
                updatedAt: publication.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Publication creation failed', {
                error: error.message,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get All Publications
     */
    static async getAllPublications(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all publications', {
                userId,
                includeArchived,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const publicationsList = await Publication.findByUserId(userId, includeArchived);

            // Separate pinned and regular publications
            const pinnedPublications = publicationsList.filter(p => p.isPinned);
            const regularPublications = publicationsList.filter(p => !p.isPinned);

            // Group by type
            const byType = publicationsList.reduce((acc, pub) => {
                const type = pub.publicationType;
                if (!acc[type]) {
                    acc[type] = [];
                }
                acc[type].push(pub);
                return acc;
            }, {} as Record<string, any[]>);

            LoggerUtil.info('Publications fetched successfully', {
                userId,
                total: publicationsList.length,
                pinned: pinnedPublications.length,
                correlationId,
            });

            return {
                publicationsList,
                total: publicationsList.length,
                pinnedPublications,
                regularPublications,
                byType,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all publications failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get Publication by ID
     */
    static async getPublicationById(publicationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching publication by ID', {
                publicationId,
                userId,
                correlationId,
            });

            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            LoggerUtil.info('Publication fetched successfully', {
                publicationId,
                userId,
                correlationId,
            });

            return {
                publicationId: publication.publicationId,
                userId: publication.userId,
                title: publication.title,
                publisherName: publication.publisherName,
                publicationDate: publication.publicationDate,
                publicationUrl: publication.publicationUrl,
                description: publication.description,
                authors: publication.authors,
                publicationType: publication.publicationType,
                publisherLogo: publication.publisherLogo,
                mediaAttachments: publication.mediaAttachments,
                citationCount: publication.citationCount,
                citationTracking: publication.citationTracking,
                isPinned: publication.isPinned,
                pinnedOrder: publication.pinnedOrder,
                displayOrder: publication.displayOrder,
                isArchived: publication.isArchived,
                createdAt: publication.createdAt,
                updatedAt: publication.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get publication by ID failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update Publication
     */
    static async updatePublication(
        publicationId: string,
        userId: string,
        updates: UpdatePublicationData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating publication', {
                publicationId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            // Apply updates
            if (updates.title !== undefined) {
                publication.title = updates.title.trim();
            }
            if (updates.publisherName !== undefined) {
                publication.publisherName = updates.publisherName.trim();
            }
            if (updates.publicationDate !== undefined) {
                publication.publicationDate = updates.publicationDate;
            }
            if (updates.publicationUrl !== undefined) {
                publication.publicationUrl = updates.publicationUrl ? updates.publicationUrl.trim() : undefined;
            }
            if (updates.description !== undefined) {
                publication.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.authors !== undefined) {
                publication.authors = updates.authors;
            }
            if (updates.publicationType !== undefined) {
                publication.publicationType = updates.publicationType;
            }

            await publication.save();

            LoggerUtil.info('Publication updated successfully', {
                publicationId,
                userId,
                correlationId,
            });

            return {
                publicationId: publication.publicationId,
                userId: publication.userId,
                title: publication.title,
                publisherName: publication.publisherName,
                publicationDate: publication.publicationDate,
                publicationUrl: publication.publicationUrl,
                description: publication.description,
                authors: publication.authors,
                publicationType: publication.publicationType,
                updatedAt: publication.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update publication failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Publication
     */
    static async deletePublication(
        publicationId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting publication', {
                publicationId,
                userId,
                permanent,
                correlationId,
            });

            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            // Delete media from Cloudinary
            if (publication.publisherLogo?.logoPublicId) {
                try {
                    await cloudinary.uploader.destroy(publication.publisherLogo.logoPublicId);
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete logo (non-critical)', { error: err.message });
                }
            }

            for (const media of publication.mediaAttachments) {
                if (media.mediaPublicId) {
                    try {
                        const resourceType = media.mediaType === 'pdf' ? 'raw' : 'image';
                        await cloudinary.uploader.destroy(media.mediaPublicId, { resource_type: resourceType });
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                    }
                }
            }

            if (permanent) {
                await Publication.deleteOne({ publicationId, userId });

                return {
                    publicationId,
                    message: 'Publication permanently deleted',
                };
            } else {
                publication.isDeleted = true;
                publication.deletedAt = new Date();
                publication.isPinned = false;
                publication.pinnedOrder = undefined;
                await publication.save();

                return {
                    publicationId,
                    deletedAt: publication.deletedAt,
                    message: 'Publication deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete publication failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive Publication
     */
    static async archivePublication(publicationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            if (publication.isArchived) {
                throw new Error('Publication is already archived');
            }

            publication.isArchived = true;
            publication.archivedAt = new Date();
            publication.isPinned = false;
            publication.pinnedOrder = undefined;
            await publication.save();

            return {
                publicationId: publication.publicationId,
                isArchived: publication.isArchived,
                archivedAt: publication.archivedAt,
                message: 'Publication archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive publication failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore Publication
     */
    static async restorePublication(publicationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const publication = await Publication.findOne({
                publicationId,
                userId,
            });

            if (!publication) {
                throw new Error('Publication not found');
            }

            if (publication.isDeleted) {
                publication.isDeleted = false;
                publication.deletedAt = undefined;
            }

            if (publication.isArchived) {
                publication.isArchived = false;
                publication.archivedAt = undefined;
            }

            await publication.save();

            return {
                publicationId: publication.publicationId,
                isDeleted: publication.isDeleted,
                isArchived: publication.isArchived,
                message: 'Publication restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore publication failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Pin Publication
     */
    static async pinPublication(
        publicationId: string,
        userId: string,
        pinnedOrder: number
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            if (![1, 2, 3].includes(pinnedOrder)) {
                throw new Error('Pinned order must be 1, 2, or 3');
            }

            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            if (publication.isArchived) {
                throw new Error('Cannot pin archived publication');
            }

            // Unpin existing publication at this position
            const existing = await Publication.findOne({
                userId,
                isPinned: true,
                pinnedOrder,
                publicationId: { $ne: publicationId },
                isDeleted: false,
            });

            if (existing) {
                existing.isPinned = false;
                existing.pinnedOrder = undefined;
                existing.pinnedAt = undefined;
                await existing.save();
            }

            publication.isPinned = true;
            publication.pinnedOrder = pinnedOrder;
            publication.pinnedAt = new Date();
            await publication.save();

            return {
                publicationId: publication.publicationId,
                isPinned: publication.isPinned,
                pinnedOrder: publication.pinnedOrder,
                message: 'Publication pinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Pin publication failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Unpin Publication
     */
    static async unpinPublication(publicationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            if (!publication.isPinned) {
                throw new Error('Publication is not pinned');
            }

            publication.isPinned = false;
            publication.pinnedOrder = undefined;
            publication.pinnedAt = undefined;
            await publication.save();

            return {
                publicationId: publication.publicationId,
                isPinned: publication.isPinned,
                message: 'Publication unpinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Unpin publication failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder Publications
     */
    static async reorderPublications(userId: string, reorderData: ReorderData[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            for (const item of reorderData) {
                const publication = await Publication.findActiveById(item.publicationId, userId);
                if (publication) {
                    publication.displayOrder = item.newOrder;
                    await publication.save();
                }
            }

            return {
                message: 'Publications reordered successfully',
                updated: reorderData.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder publications failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update Citation Count
     */
    static async updateCitationCount(
        publicationId: string,
        userId: string,
        citationData: {
            googleScholar?: number;
            researchGate?: number;
            pubmed?: number;
        }
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            if (!publication.citationTracking) {
                publication.citationTracking = {
                    googleScholar: 0,
                    researchGate: 0,
                    pubmed: 0,
                    lastUpdated: new Date(),
                } as any;
            }

            const citationTracking = publication.citationTracking!;

            if (citationData.googleScholar !== undefined) {
                citationTracking.googleScholar = citationData.googleScholar;
            }
            if (citationData.researchGate !== undefined) {
                citationTracking.researchGate = citationData.researchGate;
            }
            if (citationData.pubmed !== undefined) {
                citationTracking.pubmed = citationData.pubmed;
            }

            citationTracking.lastUpdated = new Date();
            await publication.save();

            return {
                publicationId: publication.publicationId,
                citationCount: publication.citationCount,
                citationTracking: publication.citationTracking,
                message: 'Citation count updated successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Update citation count failed', {
                error: error.message,
                publicationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload Publisher Logo
     */
    static async uploadPublisherLogo(
        publicationId: string,
        userId: string,
        file: Express.Multer.File
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            // Delete old logo if exists
            if (publication.publisherLogo?.logoPublicId) {
                try {
                    await cloudinary.uploader.destroy(publication.publisherLogo.logoPublicId);
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete old logo (non-critical)', { error: err.message });
                }
            }

            // Upload new logo
            const uploadResult = await this.uploadImageToCloudinary(file.buffer, userId, 'publisher-logos');

            publication.publisherLogo = {
                logoUrl: uploadResult.url,
                logoPublicId: uploadResult.public_id,
                logoSecureUrl: uploadResult.secure_url,
                uploadedAt: new Date(),
            };

            await publication.save();

            return {
                publicationId: publication.publicationId,
                publisherLogo: publication.publisherLogo,
                message: 'Publisher logo uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Upload publisher logo failed', {
                error: error.message,
                publicationId,
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
        publicationId: string,
        userId: string,
        file: Express.Multer.File,
        mediaType: 'pdf' | 'image'
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            if (publication.mediaAttachments.length >= 10) {
                throw new Error('Maximum 10 media attachments allowed');
            }

            let uploadResult: any;

            if (mediaType === 'image') {
                uploadResult = await this.uploadImageToCloudinary(file.buffer, userId, 'publication-images');
            } else {
                uploadResult = await this.uploadDocumentToCloudinary(file.buffer, userId, file.originalname);
            }

            const mediaId = uuidv4();
            publication.mediaAttachments.push({
                mediaId,
                mediaType,
                mediaUrl: uploadResult.url,
                mediaSecureUrl: uploadResult.secure_url,
                mediaPublicId: uploadResult.public_id,
                fileName: file.originalname,
                fileSize: uploadResult.bytes,
                uploadedAt: new Date(),
            } as any);

            await publication.save();

            return {
                publicationId: publication.publicationId,
                mediaAttachment: publication.mediaAttachments[publication.mediaAttachments.length - 1],
                message: 'Media attachment uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Upload media attachment failed', {
                error: error.message,
                publicationId,
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
        publicationId: string,
        userId: string,
        mediaId: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const publication = await Publication.findActiveById(publicationId, userId);

            if (!publication) {
                throw new Error('Publication not found');
            }

            const mediaIndex = publication.mediaAttachments.findIndex(m => m.mediaId === mediaId);
            if (mediaIndex === -1) {
                throw new Error('Media attachment not found');
            }

            const media = publication.mediaAttachments[mediaIndex];

            if (media.mediaPublicId) {
                try {
                    const resourceType = media.mediaType === 'pdf' ? 'raw' : 'image';
                    await cloudinary.uploader.destroy(media.mediaPublicId, { resource_type: resourceType });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                }
            }

            publication.mediaAttachments.splice(mediaIndex, 1);
            await publication.save();

            return {
                publicationId: publication.publicationId,
                mediaId,
                message: 'Media attachment deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                publicationId,
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
                    folder: 'publication-documents',
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

export default PublicationService;