import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';
import sharp from 'sharp';
import Constants from '@/shared/constants.util';
import { Company } from '../models';
import CompanyLogo, { ICompanyLogo } from '../models/CompanyLogo.model';
import { LoggerUtil } from '@/shared/logger.util';

interface LogoUploadResult {
    logoId: string;
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

class CompanyLogoService {

    static async uploadLogo(
        companyId: string,
        uploadedBy: string,
        file: Express.Multer.File,
        setAsActive: boolean = true
    ): Promise<LogoUploadResult> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading company logo', {
                companyId,
                uploadedBy,
                originalName: file.originalname,
                size: file.size,
                correlationId,
            });

            // Step 1: Company exist karta hai?
            const company = await Company.findOne({
                companyId,          // ye UUID hai — DB me "b07e3d20-be76-4d26-b0ee-1db6e2fb4603"
                'audit.isDeleted': false,
            });

            if (!company) throw new Error('Company not found');

            // Step 2: Logo count limit check
            const logoCount = await CompanyLogo.getCompanyLogoCount(companyId);
            if (logoCount >= 5) {
                throw new Error('Maximum 5 logos allowed per company');
            }

            // Step 3: Sharp se dimensions validate karo
            const metadata = await sharp(file.buffer).metadata();

            console.log('🔍 Sharp metadata:', {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                orientation: metadata.orientation,
                bufferSize: file.buffer.length,
                mimetype: file.mimetype
            });

            if (!metadata.width || !metadata.height) {
                throw new Error('Unable to read image dimensions');
            }

            const validation = Constants.COMPANY_LOGO_VALIDATION;

            if (metadata.width < validation.MIN_WIDTH || metadata.height < validation.MIN_HEIGHT) {
                throw new Error(
                    `Image must be at least ${validation.MIN_WIDTH}x${validation.MIN_HEIGHT}px`
                );
            }

            if (metadata.width > validation.MAX_WIDTH || metadata.height > validation.MAX_HEIGHT) {
                throw new Error(
                    `Image cannot exceed ${validation.MAX_WIDTH}x${validation.MAX_HEIGHT}px`
                );
            }

            LoggerUtil.info('Logo dimensions validated', {
                width: metadata.width,
                height: metadata.height,
                correlationId,
            });

            // Step 4: Cloudinary upload
            const uploadResult = await this.uploadToCloudinary(file.buffer, companyId);

            LoggerUtil.info('Cloudinary upload successful', {
                publicId: uploadResult.public_id,
                correlationId,
            });

            // Step 5: DB record banana
            const logoId = uuidv4();

            const logo = new CompanyLogo({
                logoId,
                companyId,
                cloudinaryPublicId: uploadResult.public_id,
                cloudinaryUrl: uploadResult.url,
                cloudinarySecureUrl: uploadResult.secure_url,
                cloudinaryFolder: validation.CLOUDINARY_FOLDER,
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

            await logo.save();

            // Step 6: Active set karo + Company model update karo
            if (setAsActive) {
                await CompanyLogo.setActiveLogo(logoId, companyId);
                logo.isActive = true;

                // Company ke media.logo field update karo
                await Company.findOneAndUpdate(
                    { companyId },
                    {
                        $set: {
                            'media.logo': {
                                url: uploadResult.secure_url,
                                publicId: uploadResult.public_id,
                                uploadedAt: new Date(),
                            },
                        },
                    },
                    { new: true }
                );

                LoggerUtil.info('Company media.logo updated', {
                    companyId,
                    logoId,
                    correlationId,
                });
            }

            return {
                logoId,
                cloudinaryPublicId: logo.cloudinaryPublicId,
                cloudinaryUrl: logo.cloudinaryUrl,
                cloudinarySecureUrl: logo.cloudinarySecureUrl,
                originalName: logo.originalName,
                fileSize: logo.fileSize,
                width: logo.width,
                height: logo.height,
                format: logo.format,
                isActive: logo.isActive,
            };

        } catch (error: any) {
            LoggerUtil.error('Company logo upload failed', {
                error: error.message,
                companyId,
                correlationId,
            });
            throw error;
        }
    }

    // Existing uploadLogo ke neeche add karo

    static async getAllLogos(companyId: string): Promise<ICompanyLogo[]> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        return CompanyLogo.findByCompanyId(companyId);
    }

    static async getLogoById(companyId: string, logoId: string): Promise<ICompanyLogo> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        const logo = await CompanyLogo.findByLogoId(logoId, companyId);
        if (!logo) throw new Error('Logo not found');

        return logo;
    }

    static async updateLogo(
        companyId: string,
        logoId: string,
        uploadedBy: string,
        file: Express.Multer.File,
        setAsActive: boolean = true
    ): Promise<LogoUploadResult> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        const existing = await CompanyLogo.findByLogoId(logoId, companyId);
        if (!existing) throw new Error('Logo not found');

        // Purana Cloudinary image delete karo
        try {
            await cloudinary.uploader.destroy(existing.cloudinaryPublicId);
        } catch (err) {
            LoggerUtil.warn('Old logo cloudinary delete failed', { publicId: existing.cloudinaryPublicId });
        }

        // Naya upload karo
        const metadata = await sharp(file.buffer).metadata();
        if (!metadata.width || !metadata.height) throw new Error('Unable to read image dimensions');

        const validation = Constants.COMPANY_LOGO_VALIDATION;
        if (metadata.width < validation.MIN_WIDTH || metadata.height < validation.MIN_HEIGHT) {
            throw new Error(`Image must be at least ${validation.MIN_WIDTH}x${validation.MIN_HEIGHT}px`);
        }

        const uploadResult = await this.uploadToCloudinary(file.buffer, companyId);

        const updated = await CompanyLogo.findOneAndUpdate(
            { logoId, companyId },
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

        if (!updated) throw new Error('Logo update failed');

        if (setAsActive) {
            await CompanyLogo.setActiveLogo(logoId, companyId);
            updated.isActive = true;

            await Company.findOneAndUpdate(
                { companyId },
                { $set: { 'media.logo': { url: uploadResult.secure_url, publicId: uploadResult.public_id, uploadedAt: new Date() } } }
            );
        }

        return {
            logoId: updated.logoId,
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

    static async deleteLogo(companyId: string, logoId: string): Promise<void> {
        const company = await Company.findOne({ companyId, 'audit.isDeleted': false });
        if (!company) throw new Error('Company not found');

        const logo = await CompanyLogo.findByLogoId(logoId, companyId);
        if (!logo) throw new Error('Logo not found');

        // Cloudinary se delete karo
        try {
            await cloudinary.uploader.destroy(logo.cloudinaryPublicId);
        } catch (err) {
            LoggerUtil.warn('Cloudinary delete failed', { publicId: logo.cloudinaryPublicId });
        }

        // Soft delete
        await CompanyLogo.deleteLogo(logoId, companyId);

        // Agar active tha to company media.logo clear karo
        if (logo.isActive) {
            await Company.findOneAndUpdate(
                { companyId },
                { $set: { 'media.logo': { url: '', publicId: '', uploadedAt: new Date() } } }
            );
        }
    }

    // Cloudinary upload helper — cover photo service jaise
    private static async uploadToCloudinary(
        buffer: Buffer,
        companyId: string
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: Constants.COMPANY_LOGO_VALIDATION.CLOUDINARY_FOLDER,
                    public_id: `company_logo_${companyId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 400, height: 400, crop: 'fill', gravity: 'center' },
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

export default CompanyLogoService;