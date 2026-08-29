import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import Constants from '@/shared/constants.util';
import { Company } from '../models';
import CompanyCover, { ICompanyCover } from '../models/CompanyCover.model';
import { LoggerUtil } from '@/shared/logger.util';

interface CoverUploadResult {
    coverId: string;
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

class CompanyCoverService {

    static async uploadCover(
        companyId: string,
        uploadedBy: string,
        file: Express.Multer.File,
        setAsActive: boolean = true
    ): Promise<CoverUploadResult> {
        const correlationId = uuidv4();

        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        const coverCount = await CompanyCover.getCompanyCoverCount(companyId);
        if (coverCount >= 5) throw new Error('Maximum 5 covers allowed per company');

        const metadata = await sharp(file.buffer).metadata();
        console.log('🔍 Sharp metadata:', {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            orientation: metadata.orientation,
            bufferSize: file.buffer.length,
            mimetype: file.mimetype
        });

        if (!metadata.width || !metadata.height) throw new Error('Unable to read image dimensions');

        // Cover ke liye landscape check — min 400x200
        const coverValidation = Constants.COMPANY_COVER_VALIDATION;

        if (metadata.width < coverValidation.MIN_WIDTH || metadata.height < coverValidation.MIN_HEIGHT) {
            throw new Error(
                `Cover image must be at least ${coverValidation.MIN_WIDTH}x${coverValidation.MIN_HEIGHT}px`
            );
        }

        if (metadata.width > coverValidation.MAX_WIDTH || metadata.height > coverValidation.MAX_HEIGHT) {
            throw new Error(
                `Cover image cannot exceed ${coverValidation.MAX_WIDTH}x${coverValidation.MAX_HEIGHT}px`
            );
        }

        const uploadResult = await this.uploadToCloudinary(file.buffer, companyId);

        const coverId = uuidv4();

        const cover = new CompanyCover({
            coverId,
            companyId,
            cloudinaryPublicId: uploadResult.public_id,
            cloudinaryUrl: uploadResult.url,
            cloudinarySecureUrl: uploadResult.secure_url,
            cloudinaryFolder: 'company-covers',
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSize: uploadResult.bytes,
            width: uploadResult.width,
            height: uploadResult.height,
            format: uploadResult.format,
            isActive: false,
            uploadedBy,
            uploadedAt: new Date(),
        });

        await cover.save();

        if (setAsActive) {
            await CompanyCover.setActiveCover(coverId, companyId);
            cover.isActive = true;

            await Company.findOneAndUpdate(
                { companyId },
                { $set: { 'media.coverImage': { url: uploadResult.secure_url, publicId: uploadResult.public_id, uploadedAt: new Date() } } }
            );

            LoggerUtil.info('Company media.coverImage updated', { companyId, coverId, correlationId });
        }

        return {
            coverId,
            cloudinaryPublicId: cover.cloudinaryPublicId,
            cloudinaryUrl: cover.cloudinaryUrl,
            cloudinarySecureUrl: cover.cloudinarySecureUrl,
            originalName: cover.originalName,
            fileSize: cover.fileSize,
            width: cover.width,
            height: cover.height,
            format: cover.format,
            isActive: cover.isActive,
        };
    }

    static async getAllCovers(companyId: string): Promise<ICompanyCover[]> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');
        return CompanyCover.findByCompanyId(companyId);
    }

    static async getCoverById(companyId: string, coverId: string): Promise<ICompanyCover> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        const cover = await CompanyCover.findByCoverId(coverId, companyId);
        if (!cover) throw new Error('Cover not found');

        return cover;
    }

    static async updateCover(
        companyId: string,
        coverId: string,
        uploadedBy: string,
        file: Express.Multer.File,
        setAsActive: boolean = true
    ): Promise<CoverUploadResult> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        const existing = await CompanyCover.findByCoverId(coverId, companyId);
        if (!existing) throw new Error('Cover not found');

        try {
            await cloudinary.uploader.destroy(existing.cloudinaryPublicId);
        } catch (err) {
            LoggerUtil.warn('Old cover cloudinary delete failed', { publicId: existing.cloudinaryPublicId });
        }

        const metadata = await sharp(file.buffer).metadata();

        if (!metadata.width || !metadata.height) throw new Error('Unable to read image dimensions');

        const coverValidation = Constants.COMPANY_COVER_VALIDATION;

        if (metadata.width < coverValidation.MIN_WIDTH || metadata.height < coverValidation.MIN_HEIGHT) {
            throw new Error(
                `Cover image must be at least ${coverValidation.MIN_WIDTH}x${coverValidation.MIN_HEIGHT}px`
            );
        }

        if (metadata.width > coverValidation.MAX_WIDTH || metadata.height > coverValidation.MAX_HEIGHT) {
            throw new Error(
                `Cover image cannot exceed ${coverValidation.MAX_WIDTH}x${coverValidation.MAX_HEIGHT}px`
            );
        }

        const uploadResult = await this.uploadToCloudinary(file.buffer, companyId);

        const updated = await CompanyCover.findOneAndUpdate(
            { coverId, companyId },
            {
                $set: {
                    cloudinaryPublicId: uploadResult.public_id,
                    cloudinaryUrl: uploadResult.url,
                    cloudinarySecureUrl: uploadResult.secure_url,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    fileSize: uploadResult.bytes,
                    width: uploadResult.width,
                    height: uploadResult.height,
                    format: uploadResult.format,
                    uploadedBy,
                }
            },
            { new: true }
        );

        if (!updated) throw new Error('Cover update failed');

        if (setAsActive) {
            await CompanyCover.setActiveCover(coverId, companyId);
            updated.isActive = true;

            await Company.findOneAndUpdate(
                { companyId },
                { $set: { 'media.coverImage': { url: uploadResult.secure_url, publicId: uploadResult.public_id, uploadedAt: new Date() } } }
            );
        }

        return {
            coverId: updated.coverId,
            cloudinaryPublicId: updated.cloudinaryPublicId,
            cloudinaryUrl: updated.cloudinaryUrl,
            cloudinarySecureUrl: updated.cloudinarySecureUrl,
            originalName: updated.originalName,
            fileSize: updated.fileSize,
            width: updated.width,
            height: updated.height,
            format: updated.format,
            isActive: updated.isActive,
        };
    }

    static async deleteCover(companyId: string, coverId: string): Promise<void> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        const cover = await CompanyCover.findByCoverId(coverId, companyId);
        if (!cover) throw new Error('Cover not found');

        try {
            await cloudinary.uploader.destroy(cover.cloudinaryPublicId);
        } catch (err) {
            LoggerUtil.warn('Cloudinary delete failed', { publicId: cover.cloudinaryPublicId });
        }

        await CompanyCover.deleteCover(coverId, companyId);

        if (cover.isActive) {
            await Company.findOneAndUpdate(
                { companyId },
                { $set: { 'media.coverImage': { url: '', publicId: '', uploadedAt: new Date() } } }
            );
        }
    }

    private static async uploadToCloudinary(buffer: Buffer, companyId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'company-covers',
                    public_id: `company_cover_${companyId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 1200, height: 400, crop: 'fill', gravity: 'center' },
                        { quality: 'auto', fetch_format: 'auto' },
                    ],
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(buffer);
        });
    }
}

export default CompanyCoverService;