/**
 * Profile Photo Service - Business Logic for Profile Pictures
 * Handles Cloudinary upload/delete operations
 * 
 * @module services/profilePhoto.service
 * @version 1.0.1 - Added auth cache invalidation fix
 */

import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import { ProfilePhoto, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';
// ✅ NEW IMPORT — needed to clear stale auth cache after profilePhotoId changes
import { AuthCacheRepository } from '@/auth/repository/auth.repository';

// ==================== INTERFACES ====================

interface UploadResult {
    photoId: string;
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

// ==================== PROFILE PHOTO SERVICE ====================

class ProfilePhotoService {

    /**
     * ✅ Upload profile photo to Cloudinary
     */
    static async uploadProfilePhoto(
        userId: string,
        file: Express.Multer.File,
        setAsActive: boolean = true
    ): Promise<UploadResult> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading profile photo', {
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

            // Step 2: Check photo count limit
            const photoCount = await ProfilePhoto.getUserPhotoCount(userId);
            if (photoCount >= Constants.PROFILE_PHOTO_VALIDATION.MAX_PHOTOS_PER_USER) {
                throw new Error(`Maximum ${Constants.PROFILE_PHOTO_VALIDATION.MAX_PHOTOS_PER_USER} photos allowed per user`);
            }

            // Step 3: Validate image dimensions using sharp
            const metadata = await sharp(file.buffer).metadata();

            if (!metadata.width || !metadata.height) {
                throw new Error('Unable to read image dimensions');
            }

            if (metadata.width < Constants.PROFILE_PHOTO_VALIDATION.MIN_WIDTH ||
                metadata.height < Constants.PROFILE_PHOTO_VALIDATION.MIN_HEIGHT) {
                throw new Error(`Image dimensions must be at least ${Constants.PROFILE_PHOTO_VALIDATION.MIN_WIDTH}x${Constants.PROFILE_PHOTO_VALIDATION.MIN_HEIGHT}px`);
            }

            if (metadata.width > Constants.PROFILE_PHOTO_VALIDATION.MAX_WIDTH ||
                metadata.height > Constants.PROFILE_PHOTO_VALIDATION.MAX_HEIGHT) {
                throw new Error(`Image dimensions cannot exceed ${Constants.PROFILE_PHOTO_VALIDATION.MAX_WIDTH}x${Constants.PROFILE_PHOTO_VALIDATION.MAX_HEIGHT}px`);
            }

            LoggerUtil.info('Image dimensions validated', {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                correlationId,
            });

            // Step 4: Upload to Cloudinary
            const uploadResult = await this.uploadToCloudinary(file.buffer, userId);

            LoggerUtil.info('Cloudinary upload successful', {
                publicId: uploadResult.public_id,
                secureUrl: uploadResult.secure_url,
                correlationId,
            });

            // Step 5: Create database record
            const photoId = uuidv4();

            const photo = new ProfilePhoto({
                photoId: photoId,
                userId,
                cloudinaryPublicId: uploadResult.public_id,
                cloudinaryUrl: uploadResult.url,
                cloudinarySecureUrl: uploadResult.secure_url,
                cloudinaryFolder: Constants.PROFILE_PHOTO_VALIDATION.CLOUDINARY_FOLDER,
                originalName: file.originalname,
                mimeType: file.mimetype,
                fileSize: uploadResult.bytes,
                width: uploadResult.width,
                height: uploadResult.height,
                format: uploadResult.format,
                isActive: false,  // Will be set below if needed
                uploadedAt: new Date(),
            });

            await photo.save();

            // Step 6: Set as active if requested
            if (setAsActive) {
                await ProfilePhoto.setActivePhoto(photoId, userId); // ✅ photoId use karo (not photo.photoId)
                photo.isActive = true;

                // ✅ Update User model with profilePhotoId
                await User.findOneAndUpdate(
                    { userId },
                    { $set: { profilePhotoId: photoId } }, // ✅ photoId use karo
                    { new: true }
                );

                // ✅ FIX: Invalidate stale auth cache so getUserById() /
                // profile GET returns the fresh profilePhotoId immediately,
                // instead of waiting for the 15-min cache TTL to expire.
                // This was the root cause of "photo uploads but disappears
                // on refresh" — DB was correct, cached auth user was stale.
                await AuthCacheRepository.invalidateUserCaches(userId);

                LoggerUtil.info('User profilePhotoId updated', {
                    userId,
                    profilePhotoId: photoId, // ✅ photoId use karo
                    correlationId,
                });
            }

            LoggerUtil.info('Profile photo uploaded successfully', {
                photoId: photoId, // ✅ photoId use karo
                userId,
                isActive: photo.isActive,
                correlationId,
            });

            return {
                photoId: photoId, // ✅ photoId use karo
                cloudinaryPublicId: photo.cloudinaryPublicId,
                cloudinaryUrl: photo.cloudinaryUrl,
                cloudinarySecureUrl: photo.cloudinarySecureUrl,
                originalName: photo.originalName,
                fileSize: photo.fileSize,
                width: photo.width,
                height: photo.height,
                format: photo.format,
                isActive: photo.isActive,
            };

        } catch (error: any) {
            LoggerUtil.error('Profile photo upload failed', {
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
                    folder: Constants.PROFILE_PHOTO_VALIDATION.CLOUDINARY_FOLDER,
                    public_id: `${userId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 800, height: 800, crop: 'limit' },  // Max 800x800
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
     * ✅ Get all photos for user
     */
    static async getAllPhotos(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all photos', {
                userId,
                includeArchived,
                correlationId,
            });

            const photos = await ProfilePhoto.findByUserId(userId, includeArchived);

            LoggerUtil.info('Photos fetched successfully', {
                userId,
                count: photos.length,
                correlationId,
            });

            return {
                photos,
                total: photos.length,
                activePhoto: photos.find(p => p.isActive) || null,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all photos failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single photo by ID
     */
    static async getPhotoById(photoId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching photo by ID', {
                photoId,
                requestedBy: userId,
                correlationId,
            });

            const photo = await ProfilePhoto.findOne({
                photoId,
                isDeleted: false,
            });

            if (!photo) {
                throw new Error('Photo not found');
            }

            LoggerUtil.info('Photo fetched successfully', {
                photoId,
                requestedBy: userId,
                correlationId,
            });

            return photo;

        } catch (error: any) {
            LoggerUtil.error('Get photo by ID failed', {
                error: error.message,
                photoId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
 * ✅ Get multiple photos by array of photo IDs
 */
    static async getMultiplePhotosByIds(photoIds: string[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching multiple photos by IDs', {
                photoIdsCount: photoIds.length,
                correlationId,
            });

            // Fetch all photos matching the photoIds array
            const photos = await ProfilePhoto.find({
                photoId: { $in: photoIds },
                isDeleted: false,
            })
                .select('-__v -passwordHash -passwordSalt')
                .lean()
                .exec();

            // Find which IDs were not found
            const foundIds = photos.map((photo: any) => photo.photoId);
            const notFoundIds = photoIds.filter(id => !foundIds.includes(id));

            // Group photos by userId for better organization
            const photosByUser: { [userId: string]: any[] } = {};
            photos.forEach((photo: any) => {
                if (!photosByUser[photo.userId]) {
                    photosByUser[photo.userId] = [];
                }
                photosByUser[photo.userId].push(photo);
            });

            LoggerUtil.info('Multiple photos fetched successfully', {
                requested: photoIds.length,
                found: photos.length,
                notFound: notFoundIds.length,
                uniqueUsers: Object.keys(photosByUser).length,
                correlationId,
            });

            return {
                photos,
                photosByUser,
                total: photos.length,
                requested: photoIds.length,
                found: photos.length,
                notFoundIds,
                statistics: {
                    totalPhotos: photos.length,
                    uniqueUsers: Object.keys(photosByUser).length,
                    activePhotos: photos.filter((p: any) => p.isActive).length,
                    archivedPhotos: photos.filter((p: any) => p.isArchived).length,
                }
            };

        } catch (error: any) {
            LoggerUtil.error('Get multiple photos by IDs failed', {
                error: error.message,
                photoIdsCount: photoIds.length,
                correlationId,
            });
            throw error;
        }
    }

    /**
 * ✅ Get all users' active profile photos
 */
    static async getAllUsersActivePhotos(limit: number = 50): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all users active photos', {
                limit,
                correlationId,
            });

            const photos = await ProfilePhoto.find({
                isActive: true,
                isDeleted: false,
                isArchived: false,
            })
                .limit(limit)
                .select('-__v')
                .lean()
                .exec();

            return {
                photos,
                total: photos.length,
                limit,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all users active photos failed', {
                error: error.message,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update profile photo (replace with new image)
     */
    static async updateProfilePhoto(
        photoId: string,
        userId: string,
        file: Express.Multer.File
    ): Promise<UploadResult> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating profile photo', {
                photoId,
                userId,
                newFileName: file.originalname,
                correlationId,
            });

            // Step 1: Find existing photo
            const existingPhoto = await ProfilePhoto.findOne({
                photoId,
                userId,
                isDeleted: false,
            });

            if (!existingPhoto) {
                throw new Error('Photo not found');
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

            if (metadata.width < Constants.PROFILE_PHOTO_VALIDATION.MIN_WIDTH ||
                metadata.height < Constants.PROFILE_PHOTO_VALIDATION.MIN_HEIGHT) {
                throw new Error(`Image dimensions must be at least ${Constants.PROFILE_PHOTO_VALIDATION.MIN_WIDTH}x${Constants.PROFILE_PHOTO_VALIDATION.MIN_HEIGHT}px`);
            }

            if (metadata.width > Constants.PROFILE_PHOTO_VALIDATION.MAX_WIDTH ||
                metadata.height > Constants.PROFILE_PHOTO_VALIDATION.MAX_HEIGHT) {
                throw new Error(`Image dimensions cannot exceed ${Constants.PROFILE_PHOTO_VALIDATION.MAX_WIDTH}x${Constants.PROFILE_PHOTO_VALIDATION.MAX_HEIGHT}px`);
            }

            LoggerUtil.info('New image dimensions validated', {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                correlationId,
            });

            // Step 4: Delete old image from Cloudinary
            try {
                await cloudinary.uploader.destroy(existingPhoto.cloudinaryPublicId);
                LoggerUtil.info('Old image deleted from Cloudinary', {
                    publicId: existingPhoto.cloudinaryPublicId,
                    correlationId,
                });
            } catch (cloudinaryError: any) {
                LoggerUtil.warn('Failed to delete old image from Cloudinary (non-critical)', {
                    error: cloudinaryError.message,
                    publicId: existingPhoto.cloudinaryPublicId,
                    correlationId,
                });
                // Continue with upload even if old image deletion fails
            }

            // Step 5: Upload new image to Cloudinary
            const uploadResult = await this.uploadToCloudinary(file.buffer, userId);

            LoggerUtil.info('New image uploaded to Cloudinary', {
                publicId: uploadResult.public_id,
                secureUrl: uploadResult.secure_url,
                correlationId,
            });

            // Step 6: Update database record
            existingPhoto.cloudinaryPublicId = uploadResult.public_id;
            existingPhoto.cloudinaryUrl = uploadResult.url;
            existingPhoto.cloudinarySecureUrl = uploadResult.secure_url;
            existingPhoto.originalName = file.originalname;
            existingPhoto.mimeType = file.mimetype;
            existingPhoto.fileSize = uploadResult.bytes;
            existingPhoto.width = uploadResult.width;
            existingPhoto.height = uploadResult.height;
            existingPhoto.format = uploadResult.format;
            existingPhoto.uploadedAt = new Date();

            await existingPhoto.save();

            // ✅ FIX: If this photo is (or becomes) the active one, its
            // cloudinary URL just changed — invalidate stale auth cache
            // so profile GET reflects the new image immediately.
            if (existingPhoto.isActive) {
                await AuthCacheRepository.invalidateUserCaches(userId);
            }

            LoggerUtil.info('Profile photo updated successfully', {
                photoId,
                userId,
                correlationId,
            });

            return {
                photoId: existingPhoto.photoId,
                cloudinaryPublicId: existingPhoto.cloudinaryPublicId,
                cloudinaryUrl: existingPhoto.cloudinaryUrl,
                cloudinarySecureUrl: existingPhoto.cloudinarySecureUrl,
                originalName: existingPhoto.originalName,
                fileSize: existingPhoto.fileSize,
                width: existingPhoto.width,
                height: existingPhoto.height,
                format: existingPhoto.format,
                isActive: existingPhoto.isActive,
            };

        } catch (error: any) {
            LoggerUtil.error('Profile photo update failed', {
                error: error.message,
                stack: error.stack,
                photoId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Set photo as active
     */
    static async setActivePhoto(photoId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Setting active photo', {
                photoId,
                userId,
                correlationId,
            });

            const photo = await ProfilePhoto.setActivePhoto(photoId, userId);

            await User.findOneAndUpdate(
                { userId },
                { $set: { profilePhotoId: photoId } },
                { new: true }
            );

            // ✅ FIX: Invalidate stale auth cache so profile GET returns
            // the fresh profilePhotoId immediately instead of waiting for
            // the 15-min cache TTL to expire.
            await AuthCacheRepository.invalidateUserCaches(userId);

            LoggerUtil.info('Active photo set successfully', {
                photoId,
                userId,
                correlationId,
            });

            return photo;

        } catch (error: any) {
            LoggerUtil.error('Set active photo failed', {
                error: error.message,
                photoId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete photo (soft delete + Cloudinary removal)
     */
    static async deletePhoto(photoId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting photo', {
                photoId,
                userId,
                correlationId,
            });

            // Find photo
            const photo = await ProfilePhoto.findOne({
                photoId,
                userId,
                isDeleted: false,
            });

            if (!photo) {
                throw new Error('Photo not found');
            }

            // Delete from Cloudinary
            await cloudinary.uploader.destroy(photo.cloudinaryPublicId);

            LoggerUtil.info('Photo deleted from Cloudinary', {
                publicId: photo.cloudinaryPublicId,
                correlationId,
            });

         // Soft delete in DB
            const wasActive = photo.isActive;

            photo.isDeleted = true;
            photo.deletedAt = new Date();
            photo.isActive = false;
            await photo.save();

            if (wasActive) {
                await User.findOneAndUpdate(
                    { userId },
                    { $unset: { profilePhotoId: 1 } },
                    { new: true }
                );

                // ✅ FIX: Invalidate stale auth cache so profile GET stops
                // returning the now-deleted photo's URL.
                await AuthCacheRepository.invalidateUserCaches(userId);

                LoggerUtil.info('User profilePhotoId cleared', {
                    userId,
                    deletedPhotoId: photoId,
                    correlationId,
                });
            }

            LoggerUtil.info('Photo deleted successfully', {
                photoId,
                userId,
                correlationId,
            });

            return {
                photoId: photo.photoId,
                deletedAt: photo.deletedAt,
                message: 'Photo deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete photo failed', {
                error: error.message,
                photoId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive photo
     */
    static async archivePhoto(photoId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving photo', {
                photoId,
                userId,
                correlationId,
            });

            const photo = await ProfilePhoto.findOne({
                photoId,
                userId,
                isDeleted: false,
            });

            if (!photo) {
                throw new Error('Photo not found');
            }

            if (photo.isArchived) {
                throw new Error('Photo is already archived');
            }

            const wasActive = photo.isActive;

            photo.isArchived = true;
            photo.archivedAt = new Date();
            photo.isActive = false;
            await photo.save();

            // ✅ FIX: If the active photo got archived, its profilePhotoId
            // is now stale on the User model / auth cache. Clear both.
            if (wasActive) {
                await User.findOneAndUpdate(
                    { userId },
                    { $unset: { profilePhotoId: 1 } },
                    { new: true }
                );
                await AuthCacheRepository.invalidateUserCaches(userId);
            }

            LoggerUtil.info('Photo archived successfully', {
                photoId,
                userId,
                correlationId,
            });

            return {
                photoId: photo.photoId,
                isArchived: photo.isArchived,
                archivedAt: photo.archivedAt,
                message: 'Photo archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive photo failed', {
                error: error.message,
                photoId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived photo
     */
    static async restorePhoto(photoId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring photo', {
                photoId,
                userId,
                correlationId,
            });

            const photo = await ProfilePhoto.findOne({
                photoId,
                userId,
                isDeleted: false,
            });

            if (!photo) {
                throw new Error('Photo not found');
            }

            if (!photo.isArchived) {
                throw new Error('Photo is not archived');
            }

            photo.isArchived = false;
            photo.archivedAt = undefined;
            await photo.save();

            LoggerUtil.info('Photo restored successfully', {
                photoId,
                userId,
                correlationId,
            });

            return {
                photoId: photo.photoId,
                isArchived: photo.isArchived,
                message: 'Photo restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore photo failed', {
                error: error.message,
                photoId,
                userId,
                correlationId,
            });
            throw error;
        }
    }
}

export default ProfilePhotoService;