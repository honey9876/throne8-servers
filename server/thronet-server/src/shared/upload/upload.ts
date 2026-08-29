// upload/upload.ts
// import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { NextFunction, Request } from 'express';
import path from 'path';
import { logger } from '@/shared/logger.util';
import { AppError, BadRequestError } from '@/shared/errors/app.error';
import multer, { FileFilterCallback, StorageEngine } from 'multer';

// ==================== CONFIGURATION ====================
interface UploadConfig {
    maxFileSize: number;
    maxVideoFileSize: number;
    allowedMimeTypes: string[];
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
}

const uploadConfig: UploadConfig = {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB (images/docs)
    maxVideoFileSize: parseInt(process.env.MAX_VIDEO_FILE_SIZE || '104857600'), // 100MB (video)
    allowedMimeTypes: (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/jpg,image/png,image/webp,image/gif').split(','),
    minWidth: parseInt(process.env.MIN_IMAGE_WIDTH || '100'),
    minHeight: parseInt(process.env.MIN_IMAGE_HEIGHT || '100'),
    maxWidth: parseInt(process.env.MAX_IMAGE_WIDTH || '10000'),
    maxHeight: parseInt(process.env.MAX_IMAGE_HEIGHT || '10000')
};

// ==================== STORAGE CONFIGURATION ====================

/**
 * Memory Storage for Cloudinary
 * Production-ready: Stores files in memory as Buffer
 */
const memoryStorage: StorageEngine = multer.memoryStorage();

// ==================== FILE FILTER ====================

/**
 * File filter for image validation
 */
const imageFileFilter = (req: Request, file: Express.Multer.File, callback: FileFilterCallback): void => {
    try {
        logger.info('🔍 [FILE FILTER] Validating uploaded file', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });

        // Check MIME type
        if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
            logger.warn('⚠️ [FILE FILTER] Invalid MIME type', {
                mimetype: file.mimetype,
                allowed: uploadConfig.allowedMimeTypes
            });
            return callback(
                new AppError(
                    `Invalid file type. Allowed types: ${uploadConfig.allowedMimeTypes.join(', ')}`,
                    400
                )
            );
        }

        // Check file extension
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

        if (!allowedExtensions.includes(ext)) {
            logger.warn('⚠️ [FILE FILTER] Invalid file extension', {
                extension: ext,
                allowed: allowedExtensions
            });
            return callback(
                new AppError(
                    `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`,
                    400
                )
            );
        }

        logger.info('✅ [FILE FILTER] File validation passed', {
            originalname: file.originalname,
            mimetype: file.mimetype
        });

        callback(null, true);
    } catch (error: any) {
        logger.error('❌ [FILE FILTER] Validation error', {
            error: error.message,
            file: file.originalname
        });
        callback(error);
    }
};

// ✅ Video file filter (mp4 / mov / webm / avi / mpeg)
const videoFileFilter = (req: Request, file: Express.Multer.File, callback: FileFilterCallback): void => {
    try {
        logger.info('🔍 [FILE FILTER] Validating uploaded video', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });

        const allowedVideoMimeTypes = [
            'video/mp4',
            'video/mpeg',
            'video/quicktime',   // .mov
            'video/x-msvideo',   // .avi
            'video/webm'
        ];
        const allowedVideoExtensions = ['.mp4', '.mpeg', '.mpg', '.mov', '.avi', '.webm'];

        if (!allowedVideoMimeTypes.includes(file.mimetype)) {
            logger.warn('⚠️ [FILE FILTER] Invalid video MIME type', {
                mimetype: file.mimetype,
                allowed: allowedVideoMimeTypes
            });
            return callback(
                new AppError(
                    `Invalid video type. Allowed types: ${allowedVideoMimeTypes.join(', ')}`,
                    400
                )
            );
        }

        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedVideoExtensions.includes(ext)) {
            logger.warn('⚠️ [FILE FILTER] Invalid video extension', {
                extension: ext,
                allowed: allowedVideoExtensions
            });
            return callback(
                new AppError(
                    `Invalid video extension. Allowed: ${allowedVideoExtensions.join(', ')}`,
                    400
                )
            );
        }

        logger.info('✅ [FILE FILTER] Video validation passed', {
            originalname: file.originalname,
            mimetype: file.mimetype
        });

        callback(null, true);
    } catch (error: any) {
        logger.error('❌ [FILE FILTER] Video validation error', {
            error: error.message,
            file: file.originalname
        });
        callback(error);
    }
};

// ✅ Universal filter for all media types (used by uploadMultiple/uploadFields)
const mediaFileFilter = (req: Request, file: Express.Multer.File, callback: FileFilterCallback): void => {
    const allowedMimeTypes: { [key: string]: string[] } = {
        images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
        videos: [
            'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm',
            'video/ogg', 'video/3gpp', 'video/x-matroska', 'video/mkv', 'video/avi', 'video/x-m4v', 'video/mp2t'
        ],
        documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    };

    const allAllowed = [
        ...allowedMimeTypes.images,
        ...allowedMimeTypes.videos,
        ...allowedMimeTypes.documents
    ];

    if (file.mimetype.startsWith('video/') || allAllowed.includes(file.mimetype)) {
        return callback(null, true);
    }

    callback(new AppError(`Invalid file type: ${file.mimetype}`, 400));
};

// ==================== MULTER INSTANCES ====================

/**
 * Single file upload configuration (IMAGE)
 */
const uploadSingleConfig = multer({
    storage: memoryStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: uploadConfig.maxFileSize,
        files: 1,
        fields: 20,
        parts: 30
    }
});

/**
 * Single file upload configuration (VIDEO)
 * Separate instance so video gets its own filter + bigger size limit.
 */
const uploadVideoConfig = multer({
    storage: memoryStorage,
    fileFilter: videoFileFilter,
    limits: {
        fileSize: uploadConfig.maxVideoFileSize,
        files: 1,
        fields: 20,
        parts: 30
    }
});

/**
 * Multiple files upload configuration (max 20 files, 100MB for video support)
 */
const uploadMultipleConfig = multer({
    storage: memoryStorage,
    fileFilter: mediaFileFilter,
    limits: {
        fileSize: uploadConfig.maxVideoFileSize,
        files: 20,
        fields: 50,
        parts: 100,
        fieldSize: 10 * 1024 * 1024,
    }
});

// ==================== UPLOAD MIDDLEWARE ====================

type UploadFileType = 'image' | 'video';

/**
 * Single file upload middleware
 * @param fieldName - Form field name
 * @param fileType - 'image' (default) or 'video' — selects the right multer
 *                   instance (filter + size limit) for the field being uploaded.
 */
export const uploadSingle = (fieldName: string = 'photo', fileType: UploadFileType = 'image') => {
    return (req: Request, res: any, next: any) => {
        const startTime = Date.now();
        const config = fileType === 'video' ? uploadVideoConfig : uploadSingleConfig;
        const maxSize = fileType === 'video' ? uploadConfig.maxVideoFileSize : uploadConfig.maxFileSize;

        logger.info('📤 [UPLOAD START] Single file upload initiated', {
            fieldName,
            fileType,
            url: req.url,
            method: req.method
        });

        config.single(fieldName)(req, res, (error: any) => {
            const duration = Date.now() - startTime;

            if (error) {
                if (error instanceof multer.MulterError) {
                    logger.error('❌ [MULTER ERROR] Upload failed', {
                        code: error.code,
                        message: error.message,
                        field: error.field,
                        fileType,
                        duration: `${duration}ms`
                    });

                    if (error.code === 'LIMIT_FILE_SIZE') {
                        return next(
                            new AppError(
                                `File size exceeds maximum limit of ${maxSize / (1024 * 1024)}MB`,
                                400
                            )
                        );
                    }

                    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
                        return next(
                            new AppError(
                                `Unexpected field name. Expected: ${fieldName}`,
                                400
                            )
                        );
                    }

                    return next(new AppError(error.message, 400));
                }

                logger.error('❌ [UPLOAD ERROR] Unknown error', {
                    error: error.message,
                    fileType,
                    duration: `${duration}ms`
                });
                return next(error);
            }

            if (!req.file) {
                logger.warn('⚠️ [NO FILE] No file uploaded', {
                    fieldName,
                    fileType,
                    duration: `${duration}ms`
                });
                return next(new AppError('No file uploaded', 400));
            }

            logger.info('✅ [UPLOAD SUCCESS] File uploaded successfully', {
                fieldName,
                fileType,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                bufferSize: req.file.buffer.length,
                duration: `${duration}ms`
            });

            next();
        });
    };
};

/**
 * Multiple files upload middleware
 * @param fieldName - Form field name
 * @param maxCount - Maximum number of files
 */
export const uploadMultiple = (fieldName: string = 'photos', maxCount: number = 10) => {
    return (req: Request, res: any, next: any) => {
        const startTime = Date.now();

        logger.info('📤 [UPLOAD START] Multiple files upload initiated', {
            fieldName,
            maxCount,
            url: req.url,
            method: req.method
        });

        uploadMultipleConfig.array(fieldName, maxCount)(req, res, (error: any) => {
            const duration = Date.now() - startTime;

            if (error) {
                if (error instanceof multer.MulterError) {
                    logger.error('❌ [MULTER ERROR] Upload failed', {
                        code: error.code,
                        message: error.message,
                        duration: `${duration}ms`
                    });

                    if (error.code === 'LIMIT_FILE_SIZE') {
                        return next(
                            new AppError(
                                `File size exceeds maximum limit of ${uploadConfig.maxFileSize / (1024 * 1024)}MB`,
                                400
                            )
                        );
                    }

                    if (error.code === 'LIMIT_FILE_COUNT') {
                        return next(
                            new AppError(
                                `Too many files. Maximum allowed: ${maxCount}`,
                                400
                            )
                        );
                    }

                    return next(new AppError(error.message, 400));
                }

                logger.error('❌ [UPLOAD ERROR] Unknown error', {
                    error: error.message,
                    duration: `${duration}ms`
                });
                return next(error);
            }

            if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
                logger.warn('⚠️ [NO FILES] No files uploaded', {
                    fieldName,
                    duration: `${duration}ms`
                });
                return next(new AppError('No files uploaded', 400));
            }

            const files = req.files as Express.Multer.File[];
            logger.info('✅ [UPLOAD SUCCESS] Multiple files uploaded', {
                fieldName,
                count: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0),
                files: files.map(f => ({
                    originalname: f.originalname,
                    mimetype: f.mimetype,
                    size: f.size
                })),
                duration: `${duration}ms`
            });

            next();
        });
    };
};

export const uploadFields = (fields: Array<{ name: string; maxCount: number }>) => {
    return (req: Request, res: any, next: any) => {
        const startTime = Date.now();

        logger.info('📤 [UPLOAD START] Multiple fields upload initiated', {
            fields,
            url: req.url
        });

        uploadMultipleConfig.fields(fields)(req, res, (error: any) => {
            const duration = Date.now() - startTime;

            if (error) {
                logger.error('❌ [MULTER / UPLOAD ERROR]', {
                    error: error.message,
                    code: (error as any).code,
                    duration: `${duration}ms`
                });

                if (error instanceof multer.MulterError) {
                    const errorMessages: Record<string, string> = {
                        LIMIT_FILE_SIZE: `File too large. Maximum size allowed: ${uploadConfig.maxVideoFileSize / (1024 * 1024)}MB`,
                        LIMIT_FILE_COUNT: 'Too many files uploaded',
                        LIMIT_UNEXPECTED_FILE: 'Unexpected field in form data',
                    };
                    return res.status(400).json({
                        success: false,
                        message: errorMessages[error.code] || error.message,
                        code: error.code
                    });
                }

                return res.status(400).json({
                    success: false,
                    message: error.message || 'File upload failed'
                });
            }

            logger.info('✅ [UPLOAD SUCCESS] Fields uploaded', {
                duration: `${duration}ms`
            });
            next();
        });
    };
};

// ==================== ERROR HANDLER ====================

/**
 * Multer error handler middleware
 */
export const handleMulterError = (error: any, req: Request, res: any, next: any) => {
    if (error instanceof multer.MulterError) {
        logger.error('❌ [MULTER ERROR]', {
            code: error.code,
            message: error.message,
            field: error.field
        });

        const errorMessages: Record<string, string> = {
            LIMIT_FILE_SIZE: `File too large. Maximum size: ${uploadConfig.maxFileSize / (1024 * 1024)}MB`,
            LIMIT_FILE_COUNT: 'Too many files uploaded',
            LIMIT_UNEXPECTED_FILE: 'Unexpected field in form data',
            LIMIT_FIELD_KEY: 'Field name too long',
            LIMIT_FIELD_VALUE: 'Field value too long',
            LIMIT_FIELD_COUNT: 'Too many fields',
            LIMIT_PART_COUNT: 'Too many parts in form data'
        };

        return res.status(400).json({
            success: false,
            message: errorMessages[error.code] || error.message,
            code: error.code
        });
    }

    next(error);
};


/**
 * Validate uploaded file (for file.routes.ts)
 */
export const validateUploadedFile = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        throw new BadRequestError('No file uploaded');
    }

    next();
};

// ==================== EXPORT ====================
export default {
    uploadSingle,
    uploadMultiple,
    uploadFields,
    handleMulterError,
    uploadConfig
};