/**
 * Patent Service - Business Logic for Patents Management
 * 
 * @module services/patent.service
 * @version 1.0.0
 */

import { Patent, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

// ==================== INTERFACES ====================

interface CreatePatentData {
    userId: string;
    title: string;
    patentNumber: string;
    patentOffice: string;
    issueDate: {
        month: number;
        day?: number;
        year: number;
    };
    inventors: Array<{
        inventorId?: string;
        inventorName: string;
        inventorProfile?: string;
    }>;
    patentStatus: 'pending' | 'granted' | 'expired' | 'abandoned';
    description?: string;
    patentUrl?: string;
}

interface UpdatePatentData {
    title?: string;
    patentNumber?: string;
    patentOffice?: string;
    issueDate?: {
        month: number;
        day?: number;
        year: number;
    };
    inventors?: Array<{
        inventorId?: string;
        inventorName: string;
        inventorProfile?: string;
    }>;
    patentStatus?: 'pending' | 'granted' | 'expired' | 'abandoned';
    description?: string;
    patentUrl?: string;
}

interface ReorderData {
    patentId: string;
    newOrder: number;
}

// ==================== PATENT SERVICE ====================

class PatentService {

    /**
     * ✅ Create Patent
     */
    static async createPatent(data: CreatePatentData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new patent', {
                userId: data.userId,
                title: data.title,
                patentNumber: data.patentNumber,
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

            // Check patent limit (30 max)
            const patentCount = await Patent.getUserPatentCount(data.userId);
            if (patentCount >= 30) {
                throw new Error('Maximum patent limit (30) reached');
            }

            // Check duplicate patent number
            const existingPatent = await Patent.findByPatentNumber(data.patentNumber, data.userId);
            if (existingPatent) {
                throw new Error('Patent number already exists');
            }

            // Get next display order
            const displayOrder = await Patent.getNextDisplayOrder(data.userId);

            // Create patent
            const patentId = uuidv4();
            const patent = new Patent({
                patentId,
                userId: data.userId,
                title: data.title.trim(),
                patentNumber: data.patentNumber.trim().toUpperCase(),
                patentOffice: data.patentOffice.toUpperCase(),
                issueDate: data.issueDate,
                inventors: data.inventors,
                patentStatus: data.patentStatus,
                description: data.description?.trim(),
                patentUrl: data.patentUrl?.trim(),
                displayOrder,
                mediaAttachments: [],
            });

            await patent.save();

            // Update user model with first patent ID
            if (!user.patentId) {
                await User.findOneAndUpdate(
                    { userId: data.userId },
                    { $set: { patentId } },
                    { new: true }
                );
            }

            LoggerUtil.info('Patent created successfully', {
                patentId,
                userId: data.userId,
                correlationId,
            });

            return {
                patentId: patent.patentId,
                userId: patent.userId,
                title: patent.title,
                patentNumber: patent.patentNumber,
                patentOffice: patent.patentOffice,
                issueDate: patent.issueDate,
                inventors: patent.inventors,
                patentStatus: patent.patentStatus,
                description: patent.description,
                patentUrl: patent.patentUrl,
                displayOrder: patent.displayOrder,
                createdAt: patent.createdAt,
                updatedAt: patent.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Patent creation failed', {
                error: error.message,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get All Patents
     */
    static async getAllPatents(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all patents', {
                userId,
                includeArchived,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const patentsList = await Patent.findByUserId(userId, includeArchived);

            // Group by status
            const byStatus = patentsList.reduce((acc, patent) => {
                const status = patent.patentStatus;
                if (!acc[status]) {
                    acc[status] = [];
                }
                acc[status].push(patent);
                return acc;
            }, {} as Record<string, any[]>);

            // Group by office
            const byOffice = patentsList.reduce((acc, patent) => {
                const office = patent.patentOffice;
                if (!acc[office]) {
                    acc[office] = [];
                }
                acc[office].push(patent);
                return acc;
            }, {} as Record<string, any[]>);

            LoggerUtil.info('Patents fetched successfully', {
                userId,
                total: patentsList.length,
                correlationId,
            });

            return {
                patentsList,
                total: patentsList.length,
                byStatus,
                byOffice,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all patents failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get Patent by ID
     */
    static async getPatentById(patentId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching patent by ID', {
                patentId,
                userId,
                correlationId,
            });

            const patent = await Patent.findActiveById(patentId, userId);

            if (!patent) {
                throw new Error('Patent not found');
            }

            LoggerUtil.info('Patent fetched successfully', {
                patentId,
                userId,
                correlationId,
            });

            return {
                patentId: patent.patentId,
                userId: patent.userId,
                title: patent.title,
                patentNumber: patent.patentNumber,
                patentOffice: patent.patentOffice,
                issueDate: patent.issueDate,
                inventors: patent.inventors,
                patentStatus: patent.patentStatus,
                description: patent.description,
                patentUrl: patent.patentUrl,
                mediaAttachments: patent.mediaAttachments,
                displayOrder: patent.displayOrder,
                isArchived: patent.isArchived,
                createdAt: patent.createdAt,
                updatedAt: patent.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get patent by ID failed', {
                error: error.message,
                patentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update Patent
     */
    static async updatePatent(
        patentId: string,
        userId: string,
        updates: UpdatePatentData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating patent', {
                patentId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const patent = await Patent.findActiveById(patentId, userId);

            if (!patent) {
                throw new Error('Patent not found');
            }

            // Check duplicate patent number if updating
            if (updates.patentNumber && updates.patentNumber !== patent.patentNumber) {
                const existing = await Patent.findByPatentNumber(updates.patentNumber, userId);
                if (existing && existing.patentId !== patentId) {
                    throw new Error('Patent number already exists');
                }
            }

            // Apply updates
            if (updates.title !== undefined) {
                patent.title = updates.title.trim();
            }
            if (updates.patentNumber !== undefined) {
                patent.patentNumber = updates.patentNumber.trim().toUpperCase();
            }
            if (updates.patentOffice !== undefined) {
                patent.patentOffice = updates.patentOffice.toUpperCase();
            }
            if (updates.issueDate !== undefined) {
                patent.issueDate = updates.issueDate;
            }
            if (updates.inventors !== undefined) {
                patent.inventors = updates.inventors;
            }
            if (updates.patentStatus !== undefined) {
                patent.patentStatus = updates.patentStatus;
            }
            if (updates.description !== undefined) {
                patent.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.patentUrl !== undefined) {
                patent.patentUrl = updates.patentUrl ? updates.patentUrl.trim() : undefined;
            }

            await patent.save();

            LoggerUtil.info('Patent updated successfully', {
                patentId,
                userId,
                correlationId,
            });

            return {
                patentId: patent.patentId,
                userId: patent.userId,
                title: patent.title,
                patentNumber: patent.patentNumber,
                patentOffice: patent.patentOffice,
                issueDate: patent.issueDate,
                inventors: patent.inventors,
                patentStatus: patent.patentStatus,
                description: patent.description,
                patentUrl: patent.patentUrl,
                updatedAt: patent.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update patent failed', {
                error: error.message,
                patentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Patent
     */
    static async deletePatent(
        patentId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting patent', {
                patentId,
                userId,
                permanent,
                correlationId,
            });

            const patent = await Patent.findActiveById(patentId, userId);

            if (!patent) {
                throw new Error('Patent not found');
            }

            // Delete media from Cloudinary
            for (const media of patent.mediaAttachments) {
                if (media.mediaPublicId) {
                    try {
                        await cloudinary.uploader.destroy(media.mediaPublicId, { resource_type: 'raw' });
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                    }
                }
            }

            if (permanent) {
                await Patent.deleteOne({ patentId, userId });

                return {
                    patentId,
                    message: 'Patent permanently deleted',
                };
            } else {
                patent.isDeleted = true;
                patent.deletedAt = new Date();
                await patent.save();

                return {
                    patentId,
                    deletedAt: patent.deletedAt,
                    message: 'Patent deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete patent failed', {
                error: error.message,
                patentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive Patent
     */
    static async archivePatent(patentId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const patent = await Patent.findActiveById(patentId, userId);

            if (!patent) {
                throw new Error('Patent not found');
            }

            if (patent.isArchived) {
                throw new Error('Patent is already archived');
            }

            patent.isArchived = true;
            patent.archivedAt = new Date();
            await patent.save();

            return {
                patentId: patent.patentId,
                isArchived: patent.isArchived,
                archivedAt: patent.archivedAt,
                message: 'Patent archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive patent failed', {
                error: error.message,
                patentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore Patent
     */
    static async restorePatent(patentId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const patent = await Patent.findOne({
                patentId,
                userId,
            });

            if (!patent) {
                throw new Error('Patent not found');
            }

            if (patent.isDeleted) {
                patent.isDeleted = false;
                patent.deletedAt = undefined;
            }

            if (patent.isArchived) {
                patent.isArchived = false;
                patent.archivedAt = undefined;
            }

            await patent.save();

            return {
                patentId: patent.patentId,
                isDeleted: patent.isDeleted,
                isArchived: patent.isArchived,
                message: 'Patent restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore patent failed', {
                error: error.message,
                patentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder Patents
     */
    static async reorderPatents(userId: string, reorderData: ReorderData[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            for (const item of reorderData) {
                const patent = await Patent.findActiveById(item.patentId, userId);
                if (patent) {
                    patent.displayOrder = item.newOrder;
                    await patent.save();
                }
            }

            return {
                message: 'Patents reordered successfully',
                updated: reorderData.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder patents failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload Patent Document
     */
    static async uploadPatentDocument(
        patentId: string,
        userId: string,
        file: Express.Multer.File
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const patent = await Patent.findActiveById(patentId, userId);

            if (!patent) {
                throw new Error('Patent not found');
            }

            if (patent.mediaAttachments.length >= 5) {
                throw new Error('Maximum 5 patent documents allowed');
            }

            // Upload document to Cloudinary
            const uploadResult = await this.uploadDocumentToCloudinary(file.buffer, userId, file.originalname);

            const mediaId = uuidv4();
            patent.mediaAttachments.push({
                mediaId,
                mediaType: 'document',
                mediaUrl: uploadResult.url,
                mediaSecureUrl: uploadResult.secure_url,
                mediaPublicId: uploadResult.public_id,
                fileName: file.originalname,
                fileSize: uploadResult.bytes,
                uploadedAt: new Date(),
            } as any);

            await patent.save();

            return {
                patentId: patent.patentId,
                mediaAttachment: patent.mediaAttachments[patent.mediaAttachments.length - 1],
                message: 'Patent document uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Upload patent document failed', {
                error: error.message,
                patentId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Patent Document
     */
    static async deletePatentDocument(
        patentId: string,
        userId: string,
        mediaId: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const patent = await Patent.findActiveById(patentId, userId);

            if (!patent) {
                throw new Error('Patent not found');
            }

            const mediaIndex = patent.mediaAttachments.findIndex(m => m.mediaId === mediaId);
            if (mediaIndex === -1) {
                throw new Error('Patent document not found');
            }

            const media = patent.mediaAttachments[mediaIndex];

            if (media.mediaPublicId) {
                try {
                    await cloudinary.uploader.destroy(media.mediaPublicId, { resource_type: 'raw' });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete document (non-critical)', { error: err.message });
                }
            }

            patent.mediaAttachments.splice(mediaIndex, 1);
            await patent.save();

            return {
                patentId: patent.patentId,
                mediaId,
                message: 'Patent document deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete patent document failed', {
                error: error.message,
                patentId,
                mediaId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== CLOUDINARY HELPER ====================

    private static async uploadDocumentToCloudinary(
        buffer: Buffer,
        userId: string,
        fileName: string
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'patent-documents',
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

export default PatentService;