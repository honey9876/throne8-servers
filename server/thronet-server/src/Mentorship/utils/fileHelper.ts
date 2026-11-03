import awsService from '@/config/cache/aws.config';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
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
   * Upload a single file using configured storage (S3 or Cloudinary)
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

      const folder = options.folder || 'senior-mentor-applications/documents';

      // 1. Primary choice if AWS S3 is fully configured & available
      if (awsService.isAvailable()) {
        const { url, key } = await awsService.uploadFile(
          file.buffer,
          filename,
          {
            folder,
            contentType: file.mimetype,
          }
        );

        logger.info(`File uploaded to S3 successfully: ${filename}`);

        return {
          url,
          key,
          filename,
          size: file.size,
          mimetype: file.mimetype,
        };
      }

      // 2. Existing standard storage: Cloudinary
      return await new Promise<UploadedFile>((resolve, reject) => {
        const isImage = file.mimetype.startsWith('image/');
        const publicIdName = path.parse(filename).name;

        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: isImage ? 'image' : 'raw',
            public_id: publicIdName,
          },
          (error, result) => {
            if (error || !result) {
              logger.error('Cloudinary upload error in FileHelper:', error);
              return reject(error ?? new Error('File upload to Cloudinary failed.'));
            }

            logger.info(`File uploaded to Cloudinary successfully: ${filename} -> ${result.secure_url}`);

            resolve({
              url: result.secure_url,
              key: result.public_id,
              filename,
              size: file.size,
              mimetype: file.mimetype,
            });
          }
        );

        uploadStream.end(file.buffer);
      });
    } catch (error: any) {
      logger.error('Failed to upload file:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files
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
    } catch (error: any) {
      logger.error('Failed to upload files:', error);
      throw error;
    }
  }

  /**
   * Delete a file from S3 / Cloudinary
   */
  async deleteFile(fileKey: string): Promise<void> {
    try {
      if (awsService.isAvailable()) {
        await awsService.deleteFile(fileKey).catch(() => undefined);
      }
      await cloudinary.uploader.destroy(fileKey, { resource_type: 'raw' }).catch(() => undefined);
      await cloudinary.uploader.destroy(fileKey).catch(() => undefined);
      logger.info(`File deleted successfully: ${fileKey}`);
    } catch (error: any) {
      logger.error('Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(fileKeys: string[]): Promise<void> {
    try {
      await Promise.all(fileKeys.map((key) => this.deleteFile(key)));
      logger.info(`${fileKeys.length} files deleted successfully`);
    } catch (error: any) {
      logger.error('Failed to delete files:', error);
      throw error;
    }
  }

  /**
   * Get signed URL for file download
   */
  async getSignedUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    try {
      if (awsService.isAvailable()) {
        return await awsService.getSignedUrl(fileKey, expiresIn);
      }
      return cloudinary.url(fileKey, { secure: true });
    } catch (error: any) {
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

export default new FileHelper();
