import awsService from '@/config/cache/aws.config'
import logger from '../../shared/logger.util';
import path from 'path';
import { BadRequestError } from '@/shared/errors/app.error';

interface FileUploadOptions {
  folder?: string;
  allowedTypes?: string[];
  maxSize?: number;
  generateUniqueName?: boolean;
}

interface UploadedFile {
  url: string;
  key: string;
  filename: string;
  size: number;
  mimetype: string;
}

class FileHelper {
  // Default allowed MIME types
  private readonly DEFAULT_ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
  ];

  // Default max file size (5MB)
  private readonly DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

  /**
   * Upload a single file to S3
   */
  async uploadFile(
    file: Express.Multer.File,
    options: FileUploadOptions = {}
  ): Promise<UploadedFile> {
    try {
      // Validate file
      this.validateFile(file, options);

      // Generate filename
      const filename = options.generateUniqueName
        ? this.generateUniqueFilename(file.originalname)
        : file.originalname;

      // [UN-COMMENT IN PRODUCTION]
      // const { url, key } = await awsService.uploadFile(
      //   file.buffer,
      //   filename,
      //   {
      //     folder: options.folder || 'uploads',
      //     contentType: file.mimetype,
      //   }
      // );
      
      // Mock upload for development
      const url = `https://mock-s3-bucket.s3.amazonaws.com/${options.folder || 'uploads'}/${filename}`;
      const key = `${options.folder || 'uploads'}/${filename}`;

      logger.info(`File uploaded successfully: ${filename}`);

      return {
        url,
        key,
        filename,
        size: file.size,
        mimetype: file.mimetype,
      };
    } catch(error : any) {
      logger.error('Failed to upload file:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files to S3
   */
  async uploadFiles(
    files: Express.Multer.File[],
    options: FileUploadOptions = {}
  ): Promise<UploadedFile[]> {
    try {
      const uploadPromises = files.map((file) =>
        this.uploadFile(file, options)
      );

      const uploadedFiles = await Promise.all(uploadPromises);

      logger.info(`${files.length} files uploaded successfully`);

      return uploadedFiles;
    } catch(error : any) {
      logger.error('Failed to upload files:', error);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(fileKey: string): Promise<void> {
    try {
      await awsService.deleteFile(fileKey);
      logger.info(`File deleted successfully: ${fileKey}`);
    } catch(error : any) {
      logger.error('Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * Delete multiple files from S3
   */
  async deleteFiles(fileKeys: string[]): Promise<void> {
    try {
      await awsService.deleteFiles(fileKeys);
      logger.info(`${fileKeys.length} files deleted successfully`);
    } catch(error : any) {
      logger.error('Failed to delete files:', error);
      throw error;
    }
  }

  /**
   * Get signed URL for file download
   */
  async getSignedUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    try {
      const url = await awsService.getSignedUrl(fileKey, expiresIn);
      return url;
    } catch(error : any) {
      logger.error('Failed to generate signed URL:', error);
      throw error;
    }
  }

  /**
   * Validate file before upload
   */
  private validateFile(
    file: Express.Multer.File,
    options: FileUploadOptions
  ): void {
    // Check file exists
    if (!file) {
      throw new BadRequestError('No file provided');
    }

    // Check file size
    const maxSize = options.maxSize || this.DEFAULT_MAX_SIZE;
    if (file.size > maxSize) {
      throw new BadRequestError(
        `File size exceeds maximum limit of ${this.formatBytes(maxSize)}`
      );
    }

    // Check file type
    const allowedTypes = options.allowedTypes || this.DEFAULT_ALLOWED_TYPES;
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestError(
        `File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
      );
    }

    // Check filename
    if (!file.originalname) {
      throw new BadRequestError('Invalid filename');
    }
  }

  /**
   * Generate unique filename
   */
  private generateUniqueFilename(originalName: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(originalName);
    const basename = path.basename(originalName, extension);

    // Sanitize basename
    const sanitizedBasename = basename
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);

    return `${sanitizedBasename}_${timestamp}_${randomString}${extension}`;
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(filename: string): string {
    return path.extname(filename).toLowerCase();
  }

  /**
   * Check if file is an image
   */
  isImage(mimetype: string): boolean {
    return mimetype.startsWith('image/');
  }

  /**
   * Check if file is a PDF
   */
  isPDF(mimetype: string): boolean {
    return mimetype === 'application/pdf';
  }

  /**
   * Check if file is a document (PDF or Word)
   */
  isDocument(mimetype: string): boolean {
    const documentTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    return documentTypes.includes(mimetype);
  }

  /**
   * Validate image dimensions (for profile photos, etc.)
   */
  async validateImageDimensions(
    file: Express.Multer.File,
    minWidth: number,
    minHeight: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<boolean> {
    // NOTE: In production, use a library like 'sharp' to read image dimensions
    // For now, we'll just log and return true
    logger.info(`Validating image dimensions for ${file.originalname}`);
    logger.info(`Required: ${minWidth}x${minHeight} to ${maxWidth}x${maxHeight}`);
    
    // In production implementation:
    // const sharp = require('sharp');
    // const metadata = await sharp(file.buffer).metadata();
    // return (
    //   metadata.width >= minWidth &&
    //   metadata.width <= maxWidth &&
    //   metadata.height >= minHeight &&
    //   metadata.height <= maxHeight
    // );

    return true; // Placeholder
  }

  /**
   * Compress image before upload
   */
  async compressImage(
    file: Express.Multer.File,
    quality: number = 80
  ): Promise<Buffer> {
    // NOTE: In production, use 'sharp' library for image compression
    // For now, we'll just return the original buffer
    logger.info(`Compressing image ${file.originalname} with quality ${quality}`);
    
    // In production implementation:
    // const sharp = require('sharp');
    // return await sharp(file.buffer)
    //   .jpeg({ quality })
    //   .toBuffer();

    return file.buffer; // Placeholder
  }

  /**
   * Generate thumbnail for image
   */
  async generateThumbnail(
    file: Express.Multer.File,
    width: number = 200,
    height: number = 200
  ): Promise<Buffer> {
    // NOTE: In production, use 'sharp' library for thumbnail generation
    logger.info(`Generating thumbnail for ${file.originalname}: ${width}x${height}`);
    
    // In production implementation:
    // const sharp = require('sharp');
    // return await sharp(file.buffer)
    //   .resize(width, height, { fit: 'cover' })
    //   .toBuffer();

    return file.buffer; // Placeholder
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  /**
   * Get MIME type from file extension
   */
  getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

export default new FileHelper();// Trigger restart
