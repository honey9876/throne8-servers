//aws service of sharred services
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../env/env';
import { logger } from '@/shared/logger.util';

interface S3UploadOptions {
  bucket?: string;
  folder?: string;
  contentType?: string;
  acl?: string;
}

interface S3DeleteOptions {
  bucket?: string;
}

class AWSService {
  private s3Client: S3Client | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      // Check if AWS credentials are configured
      if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY || !config.AWS_REGION) {
        logger.warn('⚠️  AWS S3 not configured. File uploads will be disabled.');
        logger.warn('Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and AWS_S3_BUCKET in .env');
        this.isConfigured = false;
        return;
      }

      // Initialize S3 client
      this.s3Client = new S3Client({
        region: config.AWS_REGION,
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        },
      });

      this.isConfigured = true;
      logger.info('✅ AWS S3 initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize AWS S3:', error);
      this.isConfigured = false;
    }
  }


  /**
   * Check if AWS S3 is configured
   */
  public isAvailable(): boolean {
    return this.isConfigured && this.s3Client !== null;
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    file: Buffer,
    fileName: string,
    options: S3UploadOptions = {}
  ): Promise<{ url: string; key: string }> {
    if (!this.isAvailable() || !this.s3Client) {
      throw new Error('AWS S3 is not configured. Cannot upload file.');
    }

    try {
      const bucket = options.bucket || config.AWS_S3_BUCKET;
      if (!bucket) {
        throw new Error('S3 bucket not configured');
      }

      // Generate unique file key
      const timestamp = Date.now();
      const folder = options.folder || 'uploads';
      const key = `${folder}/${timestamp}-${fileName}`;

      // Upload command
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file,
        ContentType: options.contentType || 'application/octet-stream',
        ACL: options.acl as any || 'private',
      });

      await this.s3Client.send(command);

      // Construct URL
      const url = `https://${bucket}.s3.${config.AWS_REGION}.amazonaws.com/${key}`;

      logger.info(`File uploaded to S3: ${key}`);

      return { url, key };
    } catch (error: any) {
      logger.error('Failed to upload file to S3:', error);
      throw new Error('File upload failed');
    }
  }

  /**
   * Upload multiple files to S3
   */
  async uploadFiles(
    files: Array<{ buffer: Buffer; fileName: string }>,
    options: S3UploadOptions = {}
  ): Promise<Array<{ url: string; key: string }>> {
    const uploadPromises = files.map((file) =>
      this.uploadFile(file.buffer, file.fileName, options)
    );

    return await Promise.all(uploadPromises);
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string, options: S3DeleteOptions = {}): Promise<void> {
    if (!this.isAvailable() || !this.s3Client) {
      throw new Error('AWS S3 is not configured. Cannot delete file.');
    }

    try {
      const bucket = options.bucket || config.AWS_S3_BUCKET;
      if (!bucket) {
        throw new Error('S3 bucket not configured');
      }

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.s3Client.send(command);

      logger.info(`File deleted from S3: ${key}`);
    } catch (error: any) {
      logger.error('Failed to delete file from S3:', error);
      throw new Error('File deletion failed');
    }
  }

  /**
   * Delete multiple files from S3
   */
  async deleteFiles(keys: string[], options: S3DeleteOptions = {}): Promise<void> {
    const deletePromises = keys.map((key) => this.deleteFile(key, options));
    await Promise.all(deletePromises);
  }

  /**
   * Get signed URL for private file access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.isAvailable() || !this.s3Client) {
      throw new Error('AWS S3 is not configured. Cannot generate signed URL.');
    }

    try {
      const bucket = config.AWS_S3_BUCKET;
      if (!bucket) {
        throw new Error('S3 bucket not configured');
      }

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      logger.info(`Signed URL generated for: ${key}`);

      return url;
    } catch (error: any) {
      logger.error('Failed to generate signed URL:', error);
      throw new Error('Signed URL generation failed');
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    if (!this.isAvailable() || !this.s3Client) {
      return false;
    }

    try {
      const bucket = config.AWS_S3_BUCKET;
      if (!bucket) {
        return false;
      }

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<any> {
    if (!this.isAvailable() || !this.s3Client) {
      throw new Error('AWS S3 is not configured.');
    }

    try {
      const bucket = config.AWS_S3_BUCKET;
      if (!bucket) {
        throw new Error('S3 bucket not configured');
      }

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (error: any) {
      logger.error('Failed to get file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }


  /**
   * Verify S3 connection
   */
  async verifyS3Connection(): Promise<boolean> {
    // const client = getS3Client();
    const client = this.s3Client;

    if (!client) {
      logger.warn('⚠️  S3 Client not initialized - skipping connection test');
      return false;
    }

    try {
      // Try to list buckets to verify connection
      // const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      // Dynamic import hata do, seedha use karo
      await this.s3Client?.send(new HeadBucketCommand({ Bucket: config.AWS_S3_BUCKET }));
      await client.send(
        new HeadBucketCommand({
          // Bucket: getS3Bucket(),
          Bucket: config.AWS_S3_BUCKET,
        })
      );

      logger.info('✅ AWS S3 connection verified');
      return true;
    } catch (error: any) {
      logger.error('❌ AWS S3 connection failed:', error);
      return false;
    }
  };


  /**
   * Generate S3 file URL
   */
  getS3FileURL(key: string): string {
    const bucket = config.AWS_S3_BUCKET || '';
    const region = config.AWS_REGION || 'us-east-1';
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}

export default new AWSService();
