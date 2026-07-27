/**
 * Profile Photo Routes - API Endpoints for Profile Pictures
 * Supports UPLOAD, GET, DELETE, ARCHIVE, RESTORE operations
 * 
 * @module routes/profilePhoto.routes
 * @version 1.0.0
 */

import express, { Request, Response, NextFunction } from 'express';
import { ProfilePhotoController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import { handleMulterError, uploadSingle } from '@/shared/upload/upload';

const router = express.Router();

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/profile-photo
 * @desc    Upload profile photo
 * @access  Private (requires JWT)
 * @body    FormData:
 *          - photo: File (required) - Image file
 *          - setAsActive: boolean (optional, default: true) - Set as active photo
 */
router.post(
    '/upload-photo',
    AuthMiddleware.authenticate as any,
    uploadSingle('photo'),  // Multer middleware with 'photo' field name
    // rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }), // 5 uploads per minute
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPLOAD PROFILE PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📁 File:', req.file ? {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
            } : 'No file');
            console.log('📦 Body:', req.body);

            await ProfilePhotoController.uploadPhoto(req as any, res);

            console.log('✅ UPLOAD PROFILE PHOTO ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ UPLOAD PROFILE PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/profile-photo
 * @desc    Get all profile photos for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional) - Include archived photos
 */
router.get(
    '/get-all-photos',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }), // 50 requests per minute
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL PHOTOS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await ProfilePhotoController.getAllPhotos(req as any, res);

            console.log('✅ GET ALL PHOTOS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET ALL PHOTOS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/profile-photo/:photoId
 * @desc    Get single photo by ID
 * @access  Private
 */
router.get(
    '/get-photo/:photoId',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET PHOTO BY ID ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Photo ID:', req.params.photoId);

            await ProfilePhotoController.getPhotoById(req as any, res);

            console.log('✅ GET PHOTO BY ID ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET PHOTO BY ID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/profile-photo/get-multiple-photos
 * @desc    Get multiple profile photos by array of profile photo IDs
 * @access  Private
 * @body    { photoIds: string[] } - Array of profile photo IDs
 */
router.post(
    '/get-multiple-photos',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 30, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET MULTIPLE PHOTOS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📦 Body:', req.body);

            await ProfilePhotoController.getMultiplePhotos(req as any, res);

            console.log('✅ GET MULTIPLE PHOTOS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET MULTIPLE PHOTOS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/profile-photo/get-all-users-photos
 * @desc    Get all active profile photos of all users
 * @access  Private
 * @query   limit=50 (optional) - Limit number of results
 */
router.get(
    '/get-all-users-photos',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL USERS PHOTOS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await ProfilePhotoController.getAllUsersPhotos(req as any, res);

            console.log('✅ GET ALL USERS PHOTOS ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ GET ALL USERS PHOTOS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/profile-photo/:photoId/set-active
 * @desc    Set photo as active profile picture
 * @access  Private
 */
router.put(
    '/set-active-photo/:photoId/set-active',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 SET ACTIVE PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Photo ID:', req.params.photoId);

            await ProfilePhotoController.setActivePhoto(req as any, res);

            console.log('✅ SET ACTIVE PHOTO ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ SET ACTIVE PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/profile-photo/:photoId
 * @desc    Update profile photo (replace with new image)
 * @access  Private (requires JWT)
 * @body    FormData:
 *          - photo: File (required) - New image file
 */
router.put(
    '/update-photo/:photoId',
    AuthMiddleware.authenticate as any,
    uploadSingle('photo'),  // Multer middleware
    rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }), // 5 updates per minute
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPDATE PROFILE PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Photo ID:', req.params.photoId);
            console.log('📁 File:', req.file ? {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
            } : 'No file');

            await ProfilePhotoController.updatePhoto(req as any, res);

            console.log('✅ UPDATE PROFILE PHOTO ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ UPDATE PROFILE PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/profile-photo/:photoId
 * @desc    Delete photo (soft delete + Cloudinary removal)
 * @access  Private
 */
router.delete(
    '/delete-photo/:photoId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 DELETE PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Photo ID:', req.params.photoId);

            await ProfilePhotoController.deletePhoto(req as any, res);

            console.log('✅ DELETE PHOTO ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ DELETE PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/profile-photo/:photoId/archive
 * @desc    Archive photo
 * @access  Private
 */
router.post(
    '/archive-photo/:photoId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 ARCHIVE PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Photo ID:', req.params.photoId);

            await ProfilePhotoController.archivePhoto(req as any, res);

            console.log('✅ ARCHIVE PHOTO ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ ARCHIVE PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/profile-photo/:photoId/restore
 * @desc    Restore archived photo
 * @access  Private
 */
router.post(
    '/restore-photo/:photoId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RESTORE PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Photo ID:', req.params.photoId);

            await ProfilePhotoController.restorePhoto(req as any, res);

            console.log('✅ RESTORE PHOTO ROUTE COMPLETED');
        } catch (error: any) {
            console.error('❌ RESTORE PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

// ==================== ERROR HANDLER ====================
router.use(handleMulterError);

export default router;

