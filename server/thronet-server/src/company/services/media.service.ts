  import axios, { AxiosInstance } from 'axios';
  import logger from '@/shared/logger.util';

  interface UploadResponse {
    success: boolean;
    url?: string;
    error?: string;
  }

  interface MediaMetadata {
    filename: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    duration?: number;
  }

  // const client: typeof axios = axios.create({...});

  class MediaService {
    private client: AxiosInstance;
    private readonly MEDIA_API_URL: string;
    private readonly API_KEY: string;
    private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    private readonly ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    private readonly ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];

    constructor() {
      this.MEDIA_API_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:4000';
      this.API_KEY = process.env.MEDIA_API_KEY || '';

      this.client = axios.create({
        baseURL: this.MEDIA_API_URL,
        timeout: 30000, // 30 seconds
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.API_KEY}`,
        },
      });

      // Request interceptor
      this.client.interceptors.request.use(
        (config: any) => {
          logger.debug(`Media API Request: ${config.method?.toUpperCase()} ${config.url}`);
          return config;
        },
        (error: Error) => {
          logger.error('Media API Request Error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor
      this.client.interceptors.response.use(
        (response: any) => {
          logger.debug(`Media API Response: ${response.status}`);
          return response;
        },
        (error: any ) => {
          logger.error('Media API Response Error:', error.response?.data || error.message);
          return Promise.reject(error);
        }
      );
    }

    // =====================================================
    // UPLOAD IMAGE
    // =====================================================
    async uploadImage(
      file: Buffer | string,
      metadata: MediaMetadata
    ): Promise<UploadResponse> {
      try {
        // Validate file type
        if (!this.ALLOWED_IMAGE_TYPES.includes(metadata.mimeType)) {
          return {
            success: false,
            error: `Invalid image type. Allowed: ${this.ALLOWED_IMAGE_TYPES.join(', ')}`,
          };
        }

        // Validate file size
        if (metadata.size > this.MAX_FILE_SIZE) {
          return {
            success: false,
            error: `File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`,
          };
        }

        // Convert buffer to base64 if needed
        const base64Data = Buffer.isBuffer(file) ? file.toString('base64') : file;

        const response = await this.client.post('/api/upload/image', {
          file: base64Data,
          metadata,
        });

        if (response.data.success) {
          logger.info(`Image uploaded successfully: ${response.data.url}`);
          return {
            success: true,
            url: response.data.url,
          };
        }

        return {
          success: false,
          error: response.data.error || 'Upload failed',
        };
      } catch (error : any) {
        logger.error('Error uploading image:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // =====================================================
    // UPLOAD VIDEO
    // =====================================================
    async uploadVideo(
      file: Buffer | string,
      metadata: MediaMetadata
    ): Promise<UploadResponse> {
      try {
        // Validate file type
        if (!this.ALLOWED_VIDEO_TYPES.includes(metadata.mimeType)) {
          return {
            success: false,
            error: `Invalid video type. Allowed: ${this.ALLOWED_VIDEO_TYPES.join(', ')}`,
          };
        }

        // Validate file size (videos can be larger)
        const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
        if (metadata.size > MAX_VIDEO_SIZE) {
          return {
            success: false,
            error: `Video size exceeds ${MAX_VIDEO_SIZE / 1024 / 1024}MB limit`,
          };
        }

        const base64Data = Buffer.isBuffer(file) ? file.toString('base64') : file;

        const response = await this.client.post('/api/upload/video', {
          file: base64Data,
          metadata,
        });

        if (response.data.success) {
          logger.info(`Video uploaded successfully: ${response.data.url}`);
          return {
            success: true,
            url: response.data.url,
          };
        }

        return {
          success: false,
          error: response.data.error || 'Upload failed',
        };
      } catch (error : any) {
        logger.error('Error uploading video:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // =====================================================
    // DELETE MEDIA
    // =====================================================
    async deleteMedia(url: string): Promise<boolean> {
      try {
        const response = await this.client.delete('/api/media', {
          data: { url },
        });

        if (response.data.success) {
          logger.info(`Media deleted successfully: ${url}`);
          return true;
        }

        return false;
      } catch (error : any) {
        logger.error('Error deleting media:', error);
        return false;
      }
    }

    // =====================================================
    // GET MEDIA METADATA
    // =====================================================
    async getMediaMetadata(url: string): Promise<MediaMetadata | null> {
      try {
        const response = await this.client.get('/api/media/metadata', {
          params: { url },
        });

        if (response.data.success) {
          return response.data.metadata;
        }

        return null;
      } catch (error : any) {
        logger.error('Error getting media metadata:', error);
        return null;
      }
    }

    // =====================================================
    // OPTIMIZE IMAGE
    // =====================================================
    async optimizeImage(url: string, options?: {
      width?: number;
      height?: number;
      quality?: number;
    }): Promise<string | null> {
      try {
        const response = await this.client.post('/api/media/optimize', {
          url,
          options: {
            width: options?.width || 1200,
            height: options?.height,
            quality: options?.quality || 85,
          },
        });

        if (response.data.success) {
          logger.info(`Image optimized: ${response.data.url}`);
          return response.data.url;
        }

        return null;
      } catch (error : any) {
        logger.error('Error optimizing image:', error);
        return null;
      }
    }

    // =====================================================
    // VALIDATE MEDIA URL
    // =====================================================
    async validateMediaUrl(url: string): Promise<boolean> {
      try {
        const response = await this.client.head(url);
        return response.status === 200;
      } catch (error : any) {
        return false;
      }
    }

    // =====================================================
    // GET PRESIGNED UPLOAD URL (For direct client uploads)
    // =====================================================
    async getPresignedUploadUrl(
      filename: string,
      mimeType: string
    ): Promise<{ uploadUrl: string; fileUrl: string } | null> {
      try {
        const response = await this.client.post('/api/upload/presigned', {
          filename,
          mimeType,
        });

        if (response.data.success) {
          return {
            uploadUrl: response.data.uploadUrl,
            fileUrl: response.data.fileUrl,
          };
        }

        return null;
      } catch (error : any) {
        logger.error('Error getting presigned URL:', error);
        return null;
      }
    }
  }

  export default new MediaService();