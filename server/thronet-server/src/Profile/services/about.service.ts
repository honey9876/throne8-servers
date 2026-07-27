/**
 * About Service - Business Logic with Video, Media, Formatting
 * 
 * @module services/about.service
 * @version 2.0.1 - Added auth cache invalidation fix
 */

import { About, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
// ✅ NEW IMPORT — needed to clear stale auth cache after aboutId changes
import { AuthCacheRepository } from '@/auth/repository/auth.repository';

// ==================== INTERFACES ====================

interface CreateAboutData {
    userId: string;
    aboutText: string;
    textFormatting?: {
        bold?: Array<{ start: number; end: number }>;
        italic?: Array<{ start: number; end: number }>;
        underline?: Array<{ start: number; end: number }>;
    };
}

interface UpdateAboutData {
    aboutText?: string;
    isExpanded?: boolean;
    textFormatting?: {
        bold?: Array<{ start: number; end: number }>;
        italic?: Array<{ start: number; end: number }>;
        underline?: Array<{ start: number; end: number }>;
    };
}

interface MediaAttachment {
    mediaType: 'image' | 'document' | 'link';
    caption?: string;
}

// ==================== ABOUT SERVICE ====================

class AboutService {

    /**
     * ✅ Create About
     */
    static async createAbout(data: CreateAboutData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating about', {
                userId: data.userId,
                textLength: data.aboutText.length,
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

            // Check if about already exists
            const existingAbout = await About.findOne({ userId: data.userId, isDeleted: false });
            if (existingAbout) {
                throw new Error('About already exists. Use update instead.');
            }

            // Validate first letter is capital
            if (!/^[A-Z]/.test(data.aboutText)) {
                throw new Error('About text must start with a capital letter');
            }

            // Create about
            const aboutId = uuidv4();
            const about = new About({
                aboutId,
                userId: data.userId,
                aboutText: data.aboutText.trim(),
                characterCount: data.aboutText.trim().length,
                textFormatting: data.textFormatting || {},
                mediaAttachments: [],
            });

            await about.save();

            // Update user model
            await User.findOneAndUpdate(
                { userId: data.userId },
                { $set: { aboutId } },
                { new: true }
            );

            // ✅ FIX: Invalidate stale auth cache so getUserById() 
            // returns the fresh aboutId immediately, instead of
            // waiting for the 15-min cache TTL to expire
            await AuthCacheRepository.invalidateUserCaches(data.userId);

            LoggerUtil.info('About created successfully', {
                aboutId,
                userId: data.userId,
                correlationId,
            });

            return {
                aboutId: about.aboutId,
                userId: about.userId,
                aboutText: about.aboutText,
                characterCount: about.characterCount,
                textFormatting: about.textFormatting,
                hasVideo: false,
                hasAudio: false,
                mediaCount: 0,
                createdAt: about.createdAt,
                updatedAt: about.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('About creation failed', {
                error: error.message,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload Cover Story Video
     */
    static async uploadCoverStory(aboutId: string, userId: string, file: Express.Multer.File): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading cover story video', {
                aboutId,
                userId,
                fileName: file.originalname,
                fileSize: file.size,
                correlationId,
            });

            // Find about
            const about = await About.findActiveById(aboutId, userId);
            if (!about) {
                throw new Error('About not found');
            }

            // Delete old video if exists
            if (about.coverStory?.videoPublicId) {
                try {
                    await cloudinary.uploader.destroy(about.coverStory.videoPublicId, {
                        resource_type: 'video',
                    });
                    LoggerUtil.info('Old video deleted from Cloudinary', {
                        publicId: about.coverStory.videoPublicId,
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete old video (non-critical)', {
                        error: err.message,
                    });
                }
            }

            // Upload new video to Cloudinary
            const uploadResult = await this.uploadVideoToCloudinary(file.buffer, userId);

            // Update about
            about.coverStory = {
                videoUrl: uploadResult.url,
                videoPublicId: uploadResult.public_id,
                videoSecureUrl: uploadResult.secure_url,
                duration: uploadResult.duration,
                thumbnail: uploadResult.eager?.[0]?.secure_url || uploadResult.secure_url,
                fileSize: uploadResult.bytes,
                format: uploadResult.format,
                width: uploadResult.width,
                height: uploadResult.height,
                uploadedAt: new Date(),
            };

            await about.save();

            LoggerUtil.info('Cover story uploaded successfully', {
                aboutId,
                userId,
                duration: uploadResult.duration,
                correlationId,
            });

            return {
                aboutId: about.aboutId,
                coverStory: about.coverStory,
                message: 'Cover story uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Cover story upload failed', {
                error: error.message,
                aboutId,
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
        aboutId: string,
        userId: string,
        file: Express.Multer.File,
        metadata: MediaAttachment
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading media attachment', {
                aboutId,
                userId,
                mediaType: metadata.mediaType,
                fileName: file.originalname,
                correlationId,
            });

            // Find about
            const about = await About.findActiveById(aboutId, userId);
            if (!about) {
                throw new Error('About not found');
            }

            // Check media count limit (max 10)
            if (about.mediaAttachments.length >= 10) {
                throw new Error('Maximum 10 media attachments allowed');
            }

            let uploadResult: any;

            // Upload based on type
            if (metadata.mediaType === 'image') {
                uploadResult = await this.uploadImageToCloudinary(file.buffer, userId);
            } else if (metadata.mediaType === 'document') {
                uploadResult = await this.uploadDocumentToCloudinary(file.buffer, userId, file.originalname);
            } else {
                throw new Error('Invalid media type');
            }

            // Add to media attachments
            const mediaId = uuidv4();
            about.mediaAttachments.push({
                mediaId,
                mediaType: metadata.mediaType,
                mediaUrl: uploadResult.url,
                mediaSecureUrl: uploadResult.secure_url,
                mediaPublicId: uploadResult.public_id,
                fileName: file.originalname,
                fileSize: uploadResult.bytes,
                mimeType: file.mimetype,
                caption: metadata.caption,
                uploadedAt: new Date(),
            } as any);

            await about.save();

            LoggerUtil.info('Media attachment uploaded successfully', {
                aboutId,
                userId,
                mediaId,
                mediaType: metadata.mediaType,
                correlationId,
            });

            return {
                aboutId: about.aboutId,
                mediaAttachment: about.mediaAttachments[about.mediaAttachments.length - 1],
                message: 'Media attachment uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Media attachment upload failed', {
                error: error.message,
                aboutId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Media Attachment
     */
    static async deleteMediaAttachment(aboutId: string, userId: string, mediaId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const about = await About.findActiveById(aboutId, userId);
            if (!about) {
                throw new Error('About not found');
            }

            const mediaIndex = about.mediaAttachments.findIndex(m => m.mediaId === mediaId);
            if (mediaIndex === -1) {
                throw new Error('Media attachment not found');
            }

            const media = about.mediaAttachments[mediaIndex];

            // Delete from Cloudinary
            if (media.mediaPublicId) {
                try {
                    const resourceType = media.mediaType === 'image' ? 'image' : 'raw';
                    await cloudinary.uploader.destroy(media.mediaPublicId, {
                        resource_type: resourceType,
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete media from Cloudinary (non-critical)', {
                        error: err.message,
                    });
                }
            }

            // Remove from array
            about.mediaAttachments.splice(mediaIndex, 1);
            await about.save();

            return {
                aboutId: about.aboutId,
                mediaId,
                message: 'Media attachment deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete media attachment failed', {
                error: error.message,
                aboutId,
                mediaId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get All About
     */
    static async getAllAbout(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const about = await About.findByUserId(userId);

            return {
                about: about || null,
                hasAbout: !!about,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all about failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get About by ID
     * NOTE: Ye public read hai — profile pe koi bhi (owner ya visitor) is
     * about ko dekh sakta hai. Isliye yahan userId se ownership match nahi
     * karte — sirf aboutId se seedha dhoondhte hain. Edit/Delete/Archive
     * jaisi actions mein ownership check (findActiveById with userId)
     * abhi bhi lagi rahegi.
     */
    static async getAboutById(aboutId: string, userId?: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const about = await About.findOne({ aboutId, isDeleted: false });

            if (!about) {
                throw new Error('About not found');
            }

            return {
                aboutId: about.aboutId,
                userId: about.userId,
                aboutText: about.aboutText,
                characterCount: about.characterCount,
                coverStory: about.coverStory,
                namePronunciation: about.namePronunciation,
                textFormatting: about.textFormatting,
                mediaAttachments: about.mediaAttachments,
                isExpanded: about.isExpanded,
                hasVideo: !!(about.coverStory?.videoUrl),
                hasAudio: !!(about.namePronunciation?.audioUrl),
                mediaCount: about.mediaAttachments.length,
                lastEditedAt: about.lastEditedAt,
                createdAt: about.createdAt,
                updatedAt: about.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get about by ID failed', {
                error: error.message,
                aboutId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update About
     */
    static async updateAbout(aboutId: string, userId: string, updates: UpdateAboutData): Promise<any> {
        const correlationId = uuidv4();

        try {
            const about = await About.findActiveById(aboutId, userId);

            if (!about) {
                throw new Error('About not found');
            }

            if (updates.aboutText !== undefined) {
                // Validate first letter is capital
                if (!/^[A-Z]/.test(updates.aboutText)) {
                    throw new Error('About text must start with a capital letter');
                }
                about.aboutText = updates.aboutText.trim();
            }

            if (updates.isExpanded !== undefined) {
                about.isExpanded = updates.isExpanded;
            }

            if (updates.textFormatting !== undefined) {
                about.textFormatting = updates.textFormatting;
            }

            await about.save();

            LoggerUtil.info('About updated successfully', {
                aboutId,
                userId,
                correlationId,
            });

            return {
                aboutId: about.aboutId,
                userId: about.userId,
                aboutText: about.aboutText,
                characterCount: about.characterCount,
                textFormatting: about.textFormatting,
                isExpanded: about.isExpanded,
                lastEditedAt: about.lastEditedAt,
                updatedAt: about.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update about failed', {
                error: error.message,
                aboutId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete About
     */
    static async deleteAbout(aboutId: string, userId: string, permanent: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            const about = await About.findActiveById(aboutId, userId);

            if (!about) {
                throw new Error('About not found');
            }

            // Delete all media from Cloudinary
            if (about.coverStory?.videoPublicId) {
                try {
                    await cloudinary.uploader.destroy(about.coverStory.videoPublicId, {
                        resource_type: 'video',
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete video (non-critical)', { error: err.message });
                }
            }

            for (const media of about.mediaAttachments) {
                if (media.mediaPublicId) {
                    try {
                        const resourceType = media.mediaType === 'image' ? 'image' : 'raw';
                        await cloudinary.uploader.destroy(media.mediaPublicId, {
                            resource_type: resourceType,
                        });
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                    }
                }
            }

            if (permanent) {
                await About.deleteOne({ aboutId, userId });

                await User.findOneAndUpdate(
                    { userId },
                    { $unset: { aboutId: 1 } },
                    { new: true }
                );

                // ✅ FIX: Invalidate stale auth cache
                await AuthCacheRepository.invalidateUserCaches(userId);

                return {
                    aboutId,
                    message: 'About permanently deleted',
                };
            } else {
                about.isDeleted = true;
                about.deletedAt = new Date();
                await about.save();

                return {
                    aboutId,
                    deletedAt: about.deletedAt,
                    message: 'About deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete about failed', {
                error: error.message,
                aboutId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive About
     */
    static async archiveAbout(aboutId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const about = await About.findActiveById(aboutId, userId);

            if (!about) {
                throw new Error('About not found');
            }

            if (about.isArchived) {
                throw new Error('About is already archived');
            }

            about.isArchived = true;
            about.archivedAt = new Date();
            await about.save();

            return {
                aboutId: about.aboutId,
                isArchived: about.isArchived,
                archivedAt: about.archivedAt,
                message: 'About archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive about failed', {
                error: error.message,
                aboutId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore About
     */
    static async restoreAbout(aboutId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const about = await About.findOne({ aboutId, userId });

            if (!about) {
                throw new Error('About not found');
            }

            if (about.isDeleted) {
                about.isDeleted = false;
                about.deletedAt = undefined;
            }

            if (about.isArchived) {
                about.isArchived = false;
                about.archivedAt = undefined;
            }

            await about.save();

            return {
                aboutId: about.aboutId,
                isDeleted: about.isDeleted,
                isArchived: about.isArchived,
                message: 'About restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore about failed', {
                error: error.message,
                aboutId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== CLOUDINARY HELPERS ====================

    private static async uploadVideoToCloudinary(buffer: Buffer, userId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'about-videos',
                    public_id: `${userId}_${Date.now()}`,
                    resource_type: 'video',
                    eager: [
                        { width: 400, height: 300, crop: 'pad', format: 'jpg' },
                    ],
                    eager_async: true,
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

    private static async uploadImageToCloudinary(buffer: Buffer, userId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'about-images',
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

    private static async uploadDocumentToCloudinary(buffer: Buffer, userId: string, fileName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'about-documents',
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

export default AboutService;