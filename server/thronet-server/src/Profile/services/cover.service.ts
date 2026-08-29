/**
 * Cover Photo Service - Business Logic for Cover/Banner Pictures
 * Handles Cloudinary upload/delete operations
 * 
 * @module services/coverPhoto.service
 * @version 1.0.1 - Added auth cache invalidation fix
 */

import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import Constants from '@/shared/constants.util';
import { CoverPhoto, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
// ✅ NEW IMPORT — needed to clear stale auth cache after coverPhotoId changes
import { AuthCacheRepository } from '@/auth/repository/auth.repository';

// ==================== INTERFACES ====================

interface UploadResult {
    coverId: string;
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    cloudinarySecureUrl: string;
    originalName: string;
    fileSize: number;
    width: number;
    height: number;
    format: string;
    isActive: boolean;
}

// ==================== COVER PHOTO SERVICE ====================

class CoverPhotoService {

    /**
     * ✅ Upload cover photo to Cloudinary
     */
    static async uploadCoverPhoto(
        userId: string,
        file: Express.Multer.File,
        setAsActive: boolean = true
    ): Promise<UploadResult> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading cover photo', {
                userId,
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                setAsActive,
                correlationId,
            });

            // Step 1: Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Step 2: Check cover count limit
            const coverCount = await CoverPhoto.getUserCoverCount(userId);
            if (coverCount >= Constants.COVER_PHOTO_VALIDATION.MAX_COVERS_PER_USER) {
                throw new Error(`Maximum ${Constants.COVER_PHOTO_VALIDATION.MAX_COVERS_PER_USER} cover photos allowed per user`);
            }

            // Step 3: Validate image dimensions using sharp
            const metadata = await sharp(file.buffer).metadata();

            if (!metadata.width || !metadata.height) {
                throw new Error('Unable to read image dimensions');
            }

            if (metadata.width < Constants.COVER_PHOTO_VALIDATION.MIN_WIDTH ||
                metadata.height < Constants.COVER_PHOTO_VALIDATION.MIN_HEIGHT) {
                throw new Error(`Image dimensions must be at least ${Constants.COVER_PHOTO_VALIDATION.MIN_WIDTH}x${Constants.COVER_PHOTO_VALIDATION.MIN_HEIGHT}px`);
            }

            if (metadata.width > Constants.COVER_PHOTO_VALIDATION.MAX_WIDTH ||
                metadata.height > Constants.COVER_PHOTO_VALIDATION.MAX_HEIGHT) {
                throw new Error(`Image dimensions cannot exceed ${Constants.COVER_PHOTO_VALIDATION.MAX_WIDTH}x${Constants.COVER_PHOTO_VALIDATION.MAX_HEIGHT}px`);
            }

            // Step 4: Validate aspect ratio (recommended 16:9 or similar)
            const aspectRatio = metadata.width / metadata.height;
            if (aspectRatio < Constants.COVER_PHOTO_VALIDATION.MIN_ASPECT_RATIO ||
                aspectRatio > Constants.COVER_PHOTO_VALIDATION.MAX_ASPECT_RATIO) {
                LoggerUtil.warn('Cover photo aspect ratio not recommended', {
                    aspectRatio,
                    recommended: '16:9 (2.67:1) or similar',
                    correlationId,
                });
            }

            LoggerUtil.info('Image dimensions validated', {
                width: metadata.width,
                height: metadata.height,
                aspectRatio,
                format: metadata.format,
                correlationId,
            });

            // Step 5: Upload to Cloudinary
            const uploadResult = await this.uploadToCloudinary(file.buffer, userId);

            LoggerUtil.info('Cloudinary upload successful', {
                publicId: uploadResult.public_id,
                secureUrl: uploadResult.secure_url,
                correlationId,
            });

            // Step 6: Create database record
            const coverId = uuidv4();

            const cover = new CoverPhoto({
                coverId: coverId,
                userId,
                cloudinaryPublicId: uploadResult.public_id,
                cloudinaryUrl: uploadResult.url,
                cloudinarySecureUrl: uploadResult.secure_url,
                cloudinaryFolder: Constants.COVER_PHOTO_VALIDATION.CLOUDINARY_FOLDER,
                originalName: file.originalname,
                mimeType: file.mimetype,
                fileSize: uploadResult.bytes,
                width: uploadResult.width,
                height: uploadResult.height,
                format: uploadResult.format,
                isActive: false,
                uploadedAt: new Date(),
            });

            await cover.save();

            // Step 7: Set as active if requested
            if (setAsActive) {
                await CoverPhoto.setActiveCover(coverId, userId);
                cover.isActive = true;

                // ✅ Update User model with coverPhotoId
                await User.findOneAndUpdate(
                    { userId },
                    { $set: { coverPhotoId: coverId } },
                    { new: true }
                );

                // ✅ FIX: Invalidate stale auth cache so getUserById() 
                // returns the fresh coverPhotoId immediately, instead of
                // waiting for the 15-min cache TTL to expire
                await AuthCacheRepository.invalidateUserCaches(userId);

                LoggerUtil.info('User coverPhotoId updated', {
                    userId,
                    coverPhotoId: coverId,
                    correlationId,
                });
            }

            LoggerUtil.info('Cover photo uploaded successfully', {
                coverId: coverId,
                userId,
                isActive: cover.isActive,
                correlationId,
            });

            return {
                coverId: coverId,
                cloudinaryPublicId: cover.cloudinaryPublicId,
                cloudinaryUrl: cover.cloudinaryUrl,
                cloudinarySecureUrl: cover.cloudinarySecureUrl,
                originalName: cover.originalName,
                fileSize: cover.fileSize,
                width: cover.width,
                height: cover.height,
                format: cover.format,
                isActive: cover.isActive,
            };

        } catch (error: any) {
            LoggerUtil.error('Cover photo upload failed', {
                error: error.message,
                stack: error.stack,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload buffer to Cloudinary
     */
    private static async uploadToCloudinary(buffer: Buffer, userId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: Constants.COVER_PHOTO_VALIDATION.CLOUDINARY_FOLDER,
                    public_id: `${userId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 1920, height: 1080, crop: 'limit' },  // Max 1920x1080
                        { quality: 'auto:good' },
                        { fetch_format: 'auto' }
                    ],
                    overwrite: true,
                },
                (error, result) => {
                    if (error) {
                        LoggerUtil.error('Cloudinary upload failed', {
                            error: error.message,
                        });
                        return reject(error);
                    }
                    resolve(result);
                }
            );

            uploadStream.end(buffer);
        });
    }

    /**
     * ✅ Get all covers for user
     */
    static async getAllCovers(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all covers', {
                userId,
                includeArchived,
                correlationId,
            });

            const covers = await CoverPhoto.findByUserId(userId, includeArchived);

            LoggerUtil.info('Covers fetched successfully', {
                userId,
                count: covers.length,
                correlationId,
            });

            return {
                covers,
                total: covers.length,
                activeCover: covers.find(c => c.isActive) || null,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all covers failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single cover by ID
     * ✅ FIX: userId ko query filter se hataya — coverId already globally unique hai (UUID),
     * isliye viewer ka userId match karne ki zaroorat nahi. Ye hi bug tha jiski wajah se
     * doosre user ki profile pe cover kabhi load nahi hoti thi (viewer ka userId != owner ka userId).
     */
    static async getCoverById(coverId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching cover by ID', {
                coverId,
                requestedBy: userId,
                correlationId,
            });

            const cover = await CoverPhoto.findOne({
                coverId,
                isDeleted: false,
            });

            if (!cover) {
                throw new Error('Cover not found');
            }

            LoggerUtil.info('Cover fetched successfully', {
                coverId,
                requestedBy: userId,
                correlationId,
            });

            return cover;

        } catch (error: any) {
            LoggerUtil.error('Get cover by ID failed', {
                error: error.message,
                coverId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update cover photo (replace with new image)
     */
    static async updateCoverPhoto(
        coverId: string,
        userId: string,
        file: Express.Multer.File
    ): Promise<UploadResult> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating cover photo', {
                coverId,
                userId,
                newFileName: file.originalname,
                correlationId,
            });

            // Step 1: Find existing cover
            const existingCover = await CoverPhoto.findOne({
                coverId,
                userId,
                isDeleted: false,
            });

            if (!existingCover) {
                throw new Error('Cover not found');
            }

            // Step 2: Validate user
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Step 3: Validate new image dimensions
            const metadata = await sharp(file.buffer).metadata();

            if (!metadata.width || !metadata.height) {
                throw new Error('Unable to read image dimensions');
            }

            if (metadata.width < Constants.COVER_PHOTO_VALIDATION.MIN_WIDTH ||
                metadata.height < Constants.COVER_PHOTO_VALIDATION.MIN_HEIGHT) {
                throw new Error(`Image dimensions must be at least ${Constants.COVER_PHOTO_VALIDATION.MIN_WIDTH}x${Constants.COVER_PHOTO_VALIDATION.MIN_HEIGHT}px`);
            }

            if (metadata.width > Constants.COVER_PHOTO_VALIDATION.MAX_WIDTH ||
                metadata.height > Constants.COVER_PHOTO_VALIDATION.MAX_HEIGHT) {
                throw new Error(`Image dimensions cannot exceed ${Constants.COVER_PHOTO_VALIDATION.MAX_WIDTH}x${Constants.COVER_PHOTO_VALIDATION.MAX_HEIGHT}px`);
            }

            // Step 4: Delete old image from Cloudinary
            try {
                await cloudinary.uploader.destroy(existingCover.cloudinaryPublicId);
                LoggerUtil.info('Old cover deleted from Cloudinary', {
                    publicId: existingCover.cloudinaryPublicId,
                    correlationId,
                });
            } catch (cloudinaryError: any) {
                LoggerUtil.warn('Failed to delete old cover from Cloudinary (non-critical)', {
                    error: cloudinaryError.message,
                    publicId: existingCover.cloudinaryPublicId,
                    correlationId,
                });
            }

            // Step 5: Upload new image to Cloudinary
            const uploadResult = await this.uploadToCloudinary(file.buffer, userId);

            LoggerUtil.info('New cover uploaded to Cloudinary', {
                publicId: uploadResult.public_id,
                secureUrl: uploadResult.secure_url,
                correlationId,
            });

            // Step 6: Update database record
            existingCover.cloudinaryPublicId = uploadResult.public_id;
            existingCover.cloudinaryUrl = uploadResult.url;
            existingCover.cloudinarySecureUrl = uploadResult.secure_url;
            existingCover.originalName = file.originalname;
            existingCover.mimeType = file.mimetype;
            existingCover.fileSize = uploadResult.bytes;
            existingCover.width = uploadResult.width;
            existingCover.height = uploadResult.height;
            existingCover.format = uploadResult.format;
            existingCover.uploadedAt = new Date();

            await existingCover.save();

            LoggerUtil.info('Cover photo updated successfully', {
                coverId,
                userId,
                correlationId,
            });

            return {
                coverId: existingCover.coverId,
                cloudinaryPublicId: existingCover.cloudinaryPublicId,
                cloudinaryUrl: existingCover.cloudinaryUrl,
                cloudinarySecureUrl: existingCover.cloudinarySecureUrl,
                originalName: existingCover.originalName,
                fileSize: existingCover.fileSize,
                width: existingCover.width,
                height: existingCover.height,
                format: existingCover.format,
                isActive: existingCover.isActive,
            };

        } catch (error: any) {
            LoggerUtil.error('Cover photo update failed', {
                error: error.message,
                stack: error.stack,
                coverId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Set cover as active
     */
    static async setActiveCover(coverId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Setting active cover', {
                coverId,
                userId,
                correlationId,
            });

            const cover = await CoverPhoto.setActiveCover(coverId, userId);

            await User.findOneAndUpdate(
                { userId },
                { $set: { coverPhotoId: coverId } },
                { new: true }
            );

            // ✅ FIX: Invalidate stale auth cache
            await AuthCacheRepository.invalidateUserCaches(userId);

            LoggerUtil.info('Active cover set successfully', {
                coverId,
                userId,
                correlationId,
            });

            return cover;

        } catch (error: any) {
            LoggerUtil.error('Set active cover failed', {
                error: error.message,
                coverId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete cover (soft delete + Cloudinary removal)
     * ✅ FIX: wasActive ko photo.isActive = false set karne SE PEHLE capture kiya,
     * warna neeche wala check hamesha false hi milta (upar hi false kar diya tha).
     * Isi wajah se User.coverPhotoId kabhi clear nahi hota tha delete hone ke baad.
     */
    static async deleteCover(coverId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting cover', {
                coverId,
                userId,
                correlationId,
            });

            // Find cover
            const cover = await CoverPhoto.findOne({
                coverId,
                userId,
                isDeleted: false,
            });

            if (!cover) {
                throw new Error('Cover not found');
            }

            // Delete from Cloudinary
            await cloudinary.uploader.destroy(cover.cloudinaryPublicId);

            LoggerUtil.info('Cover deleted from Cloudinary', {
                publicId: cover.cloudinaryPublicId,
                correlationId,
            });

            // Soft delete in DB
            const wasActive = cover.isActive;

            cover.isDeleted = true;
            cover.deletedAt = new Date();
            cover.isActive = false;
            await cover.save();

            if (wasActive) {
                await User.findOneAndUpdate(
                    { userId },
                    { $unset: { coverPhotoId: 1 } },
                    { new: true }
                );

                // ✅ FIX: Invalidate stale auth cache
                await AuthCacheRepository.invalidateUserCaches(userId);

                LoggerUtil.info('User coverPhotoId cleared', {
                    userId,
                    deletedCoverId: coverId,
                    correlationId,
                });
            }

            LoggerUtil.info('Cover deleted successfully', {
                coverId,
                userId,
                correlationId,
            });

            return {
                coverId: cover.coverId,
                deletedAt: cover.deletedAt,
                message: 'Cover photo deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete cover failed', {
                error: error.message,
                coverId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive cover
     */
    static async archiveCover(coverId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving cover', {
                coverId,
                userId,
                correlationId,
            });

            const cover = await CoverPhoto.findOne({
                coverId,
                userId,
                isDeleted: false,
            });

            if (!cover) {
                throw new Error('Cover not found');
            }

            if (cover.isArchived) {
                throw new Error('Cover is already archived');
            }

            cover.isArchived = true;
            cover.archivedAt = new Date();
            cover.isActive = false;
            await cover.save();

            LoggerUtil.info('Cover archived successfully', {
                coverId,
                userId,
                correlationId,
            });

            return {
                coverId: cover.coverId,
                isArchived: cover.isArchived,
                archivedAt: cover.archivedAt,
                message: 'Cover photo archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive cover failed', {
                error: error.message,
                coverId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived cover
     */
    static async restoreCover(coverId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring cover', {
                coverId,
                userId,
                correlationId,
            });

            const cover = await CoverPhoto.findOne({
                coverId,
                userId,
                isDeleted: false,
            });

            if (!cover) {
                throw new Error('Cover not found');
            }

            if (!cover.isArchived) {
                throw new Error('Cover is not archived');
            }

            cover.isArchived = false;
            cover.archivedAt = undefined;
            await cover.save();

            LoggerUtil.info('Cover restored successfully', {
                coverId,
                userId,
                correlationId,
            });

            return {
                coverId: cover.coverId,
                isArchived: cover.isArchived,
                message: 'Cover photo restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore cover failed', {
                error: error.message,
                coverId,
                userId,
                correlationId,
            });
            throw error;
        }
    }
}

export default CoverPhotoService;