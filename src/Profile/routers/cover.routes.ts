/**
 * Cover Photo Routes - API Endpoints for Cover/Banner Pictures
 * Supports UPLOAD, GET, DELETE, ARCHIVE, RESTORE operations
 * 
 * @module routes/coverPhoto.routes
 * @version 1.0.0
 */

import express, { Request, Response, NextFunction } from 'express';
import { CoverPhotoController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared/middlewares/rateLimit.middleware';
import { handleMulterError, uploadSingle } from '@/shared/upload/upload';

const router = express.Router();

// ==================== ROUTES ====================

/**
 * @route   POST /api/v1/cover-photo/upload-cover
 * @desc    Upload cover photo
 * @access  Private (requires JWT)
 * @body    FormData:
 *          - cover: File (required) - Image file
 *          - setAsActive: boolean (optional, default: true) - Set as active cover
 */
router.post(
    '/upload-cover',
    AuthMiddleware.authenticate as any,
    uploadSingle('cover'),  // Multer middleware with 'cover' field name
    // rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }), // 5 uploads per minute
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPLOAD COVER PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📁 File:', req.file ? {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
            } : 'No file');
            console.log('📦 Body:', req.body);

            await CoverPhotoController.uploadCover(req as any, res);

            console.log('✅ UPLOAD COVER PHOTO ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPLOAD COVER PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/cover-photo/get-all-covers
 * @desc    Get all cover photos for authenticated user
 * @access  Private
 * @query   includeArchived=true (optional) - Include archived covers
 */
router.get(
    '/get-all-covers',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET ALL COVERS ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('📊 Query:', req.query);

            await CoverPhotoController.getAllCovers(req as any, res);

            console.log('✅ GET ALL COVERS ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET ALL COVERS ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   GET /api/v1/cover-photo/get-cover/:coverId
 * @desc    Get single cover by ID
 * @access  Private
 */
router.get(
    '/get-cover/:coverId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 GET COVER BY ID ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Cover ID:', req.params.coverId);

            await CoverPhotoController.getCoverById(req as any, res);

            console.log('✅ GET COVER BY ID ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ GET COVER BY ID ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/cover-photo/set-active-cover/:coverId/set-active
 * @desc    Set cover as active
 * @access  Private
 */
router.put(
    '/set-active-cover/:coverId/set-active',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 SET ACTIVE COVER ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Cover ID:', req.params.coverId);

            await CoverPhotoController.setActiveCover(req as any, res);

            console.log('✅ SET ACTIVE COVER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ SET ACTIVE COVER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   PUT /api/v1/cover-photo/update-cover/:coverId
 * @desc    Update cover photo (replace with new image)
 * @access  Private (requires JWT)
 * @body    FormData:
 *          - cover: File (required) - New image file
 */
router.put(
    '/update-cover/:coverId',
    AuthMiddleware.authenticate as any,
    uploadSingle('cover'),  // Multer middleware
    rateLimitMiddleware({ maxRequests: 5, windowMs: 60000 }), // 5 updates per minute
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 UPDATE COVER PHOTO ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Cover ID:', req.params.coverId);
            console.log('📁 File:', req.file ? {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
            } : 'No file');

            await CoverPhotoController.updateCover(req as any, res);

            console.log('✅ UPDATE COVER PHOTO ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ UPDATE COVER PHOTO ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   DELETE /api/v1/cover-photo/delete-cover/:coverId
 * @desc    Delete cover (soft delete + Cloudinary removal)
 * @access  Private
 */
router.delete(
    '/delete-cover/:coverId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 DELETE COVER ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Cover ID:', req.params.coverId);

            await CoverPhotoController.deleteCover(req as any, res);

            console.log('✅ DELETE COVER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ DELETE COVER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/cover-photo/archive-cover/:coverId
 * @desc    Archive cover
 * @access  Private
 */
router.post(
    '/archive-cover/:coverId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 ARCHIVE COVER ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Cover ID:', req.params.coverId);

            await CoverPhotoController.archiveCover(req as any, res);

            console.log('✅ ARCHIVE COVER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ ARCHIVE COVER ROUTE ERROR:', error);
            next(error);
        }
    }
);

/**
 * @route   POST /api/v1/cover-photo/restore-cover/:coverId
 * @desc    Restore archived cover
 * @access  Private
 */
router.post(
    '/restore-cover/:coverId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log('🎯 RESTORE COVER ROUTE HIT');
            console.log('👤 User:', (req as any).user);
            console.log('🆔 Cover ID:', req.params.coverId);

            await CoverPhotoController.restoreCover(req as any, res);

            console.log('✅ RESTORE COVER ROUTE COMPLETED');
        } catch (error : any) {
            console.error('❌ RESTORE COVER ROUTE ERROR:', error);
            next(error);
        }
    }
);

// ==================== ERROR HANDLER ====================
router.use(handleMulterError);

export default router;