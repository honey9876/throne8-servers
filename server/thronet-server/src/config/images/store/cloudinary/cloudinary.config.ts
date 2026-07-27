// src/config/cloudinary.config.ts
// import { v2 as cloudinary } from 'cloudinary';
import {v2 as cloudinary} from "cloudinary";
import { logger } from '@/shared/logger.util';

// ==================== CLOUDINARY CONFIGURATION ====================
interface CloudinaryConfig {
    cloud_name: string;
    api_key: string;
    api_secret: string;
    secure: boolean;
}

class CloudinaryConfigManager {
    private isConfigured: boolean = false;

    constructor() {
        this.initializeCloudinary();
    }

    /**
     * Initialize Cloudinary with environment variables
     */
    private initializeCloudinary(): void {
        try {
            const config: CloudinaryConfig = {
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
                api_key: process.env.CLOUDINARY_API_KEY || '',
                api_secret: process.env.CLOUDINARY_API_SECRET || '',
                secure: process.env.CLOUDINARY_SECURE_URLS === 'true'
            };

            // Validate configuration
            if (!config.cloud_name || !config.api_key || !config.api_secret) {
                throw new Error('Missing required Cloudinary configuration');
            }

            // Configure Cloudinary
            cloudinary.config(config);

            this.isConfigured = true;

            logger.info('✅ Cloudinary configured successfully', {
                cloud_name: config.cloud_name,
                secure: config.secure,
                timestamp: new Date().toISOString()
            });
        } catch (error: any) {
            logger.error('❌ Failed to configure Cloudinary', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Check if Cloudinary is configured
     */
    public isReady(): boolean {
        return this.isConfigured;
    }

    /**
     * Get Cloudinary instance
     */
    public getInstance() {
        if (!this.isConfigured) {
            throw new Error('Cloudinary is not configured');
        }
        return cloudinary;
    }

    /**
     * Test Cloudinary connection
     */
    public async testConnection(): Promise<boolean> {
        try {
            const result = await cloudinary.api.ping();
            logger.info('✅ Cloudinary connection test successful', { result });
            return true;
        } catch (error: any) {
            logger.error('❌ Cloudinary connection test failed', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get upload configuration
     */
    public getUploadConfig() {
        return {
            folder: process.env.CLOUDINARY_FOLDER || 'profile-photos',
            uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'profile_photos',
            maxFileSize: parseInt(process.env.CLOUDINARY_MAX_FILE_SIZE || '52428800'),
            autoQuality: process.env.CLOUDINARY_AUTO_QUALITY === 'true',
            autoFormat: process.env.CLOUDINARY_AUTO_FORMAT === 'true',
            fetchFormat: process.env.CLOUDINARY_FETCH_FORMAT || 'auto',
            defaultQuality: process.env.CLOUDINARY_DEFAULT_QUALITY || 'auto:good'
        };
    }
}

// Export singleton instance
const cloudinaryConfig = new CloudinaryConfigManager();

export { cloudinaryConfig };
export default cloudinary;