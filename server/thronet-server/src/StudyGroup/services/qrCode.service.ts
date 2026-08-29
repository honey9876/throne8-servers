/**
 * ====================================
 * QR CODE SERVICE
 * ====================================
 * Generate QR codes for group invites
 * Production-ready for 100k+ users
 */

import QRCode from 'qrcode';
import { LoggerUtil } from '@/shared/logger.util';
import { HttpStatus } from '../enums';
import { AppError, BadRequestError } from '@/shared/errors/app.error';

interface QRCodeOptions {
  color?: string;
  backgroundColor?: string;
  size?: number;
}

class QRCodeService {
  // Maximum data length for QR code
  private readonly MAX_QR_DATA_LENGTH = 2000;
  
  // Default QR code configuration
  private readonly DEFAULT_CONFIG = {
    errorCorrectionLevel: 'H' as const,
    margin: 1,
    width: 300,
  };

  /**
   * Generate QR code as data URL (Base64)
   * @param data - Data to encode in QR code
   * @returns Promise<string> - Base64 data URL
   */
  async generateQRCode(data: string): Promise<string> {
    try {
      // Validate input
      if (!this.validateQRData(data)) {
        throw new BadRequestError('Invalid QR code data: Data must be between 1 and 2000 characters'
        );
      }

      const qrCodeDataURL = await QRCode.toDataURL(data, {
        errorCorrectionLevel: this.DEFAULT_CONFIG.errorCorrectionLevel,
        type: 'image/png',
        margin: this.DEFAULT_CONFIG.margin,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        width: this.DEFAULT_CONFIG.width,
      });

      LoggerUtil.info('QR code generated successfully', { 
        dataLength: data.length,
        timestamp: new Date().toISOString()
      });
      
      return qrCodeDataURL;
    } catch (error: any) {
      LoggerUtil.error('Error generating QR code:', {
        error: error.message,
        stack: error.stack,
        data: data.substring(0, 100), // Log only first 100 chars for security
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to generate QR code'
      );
    }
  }

  /**
   * Generate QR code as buffer (for file downloads)
   * @param data - Data to encode in QR code
   * @returns Promise<Buffer> - QR code as buffer
   */
  async generateQRCodeBuffer(data: string): Promise<Buffer> {
    try {
      // Validate input
      if (!this.validateQRData(data)) {
        throw new BadRequestError(
          'Invalid QR code data: Data must be between 1 and 2000 characters'
        );
      }

      const buffer = await QRCode.toBuffer(data, {
        errorCorrectionLevel: this.DEFAULT_CONFIG.errorCorrectionLevel,
        type: 'png',
        margin: this.DEFAULT_CONFIG.margin,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        width: this.DEFAULT_CONFIG.width,
      });

      LoggerUtil.info('QR code buffer generated successfully', {
        bufferSize: buffer.length,
        timestamp: new Date().toISOString()
      });
      
      return buffer;
    } catch (error: any) {
      LoggerUtil.error('Error generating QR code buffer:', {
        error: error.message,
        stack: error.stack,
        data: data.substring(0, 100),
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to generate QR code buffer'
      );
    }
  }

  /**
   * Generate QR code for group invite link
   * @param inviteLink - Full invite URL
   * @returns Promise<string> - Base64 QR code
   */
  async generateGroupInviteQR(inviteLink: string): Promise<string> {
    try {
      // Validate URL format
      if (!this.isValidURL(inviteLink)) {
        throw new BadRequestError(
          'Invalid invite link format'
        );
      }

      LoggerUtil.info('Generating group invite QR code', { 
        inviteLink: inviteLink.substring(0, 50) + '...' 
      });
      
      return await this.generateQRCode(inviteLink);
    } catch (error: any) {
      LoggerUtil.error('Error generating group invite QR:', {
        error: error.message,
        inviteLink: inviteLink.substring(0, 50) + '...',
      });
      throw error;
    }
  }

  /**
   * Generate custom styled QR code
   * @param data - Data to encode
   * @param options - Custom styling options
   * @returns Promise<string> - Base64 QR code
   */
  async generateStyledQRCode(
    data: string,
    options?: QRCodeOptions
  ): Promise<string> {
    try {
      // Validate input
      if (!this.validateQRData(data)) {
        throw new BadRequestError(
          'Invalid QR code data'
        );
      }

      // Validate color codes
      if (options?.color && !this.isValidHexColor(options.color)) {
        throw new BadRequestError(
          'Invalid color format. Use hex color codes (e.g., #000000)'
        );
      }

      if (options?.backgroundColor && !this.isValidHexColor(options.backgroundColor)) {
        throw new BadRequestError(
          'Invalid background color format'
        );
      }

      // Validate size
      const size = options?.size || this.DEFAULT_CONFIG.width;
      if (size < 100 || size > 1000) {
        throw new BadRequestError(
          'QR code size must be between 100 and 1000 pixels'
        );
      }

      const qrCodeDataURL = await QRCode.toDataURL(data, {
        errorCorrectionLevel: this.DEFAULT_CONFIG.errorCorrectionLevel,
        type: 'image/png',
        margin: this.DEFAULT_CONFIG.margin,
        color: {
          dark: options?.color || '#000000',
          light: options?.backgroundColor || '#FFFFFF',
        },
        width: size,
      });

      LoggerUtil.info('Styled QR code generated successfully', {
        customColor: options?.color || 'default',
        customSize: size,
      });
      
      return qrCodeDataURL;
    } catch (error: any) {
      LoggerUtil.error('Error generating styled QR code:', {
        error: error.message,
        options,
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to generate styled QR code'
      );
    }
  }

  /**
   * Validate QR code data
   * @param data - Data to validate
   * @returns boolean - Is valid or not
   */
  validateQRData(data: string): boolean {
    if (!data || typeof data !== 'string') {
      return false;
    }

    const trimmedData = data.trim();
    
    if (trimmedData.length === 0) {
      return false;
    }

    if (trimmedData.length > this.MAX_QR_DATA_LENGTH) {
      return false;
    }

    return true;
  }

  /**
   * Validate URL format
   * @param url - URL to validate
   * @returns boolean
   */
  private isValidURL(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate hex color code
   * @param color - Color code to validate
   * @returns boolean
   */
  private isValidHexColor(color: string): boolean {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexColorRegex.test(color);
  }

  /**
   * Get QR code metrics for monitoring
   * @returns Object with service metrics
   */
  getMetrics(): {
    maxDataLength: number;
    defaultWidth: number;
    defaultErrorCorrection: string;
  } {
    return {
      maxDataLength: this.MAX_QR_DATA_LENGTH,
      defaultWidth: this.DEFAULT_CONFIG.width,
      defaultErrorCorrection: this.DEFAULT_CONFIG.errorCorrectionLevel,
    };
  }
}

export default new QRCodeService();