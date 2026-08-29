import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import CompanyLogoService from '../services/companyLogo.service';

class CompanyLogoController {

    static async uploadLogo(req: AuthRequest, res: Response): Promise<void> {
        const startTime = Date.now();
        const correlationId = (req as any).correlationId || uuidv4();

        try {
            // Auth check
            const uploadedBy = req.user?.id || req.user?.userId || 'system';

            // File check
            if (!req.file) {
                ResponseUtil.badRequest(res, 'No file uploaded');
                return;
            }

            const companyId = req.params.id;
            const setAsActive = req.body.setAsActive !== 'false';

            LoggerUtil.info('Upload company logo request', {
                companyId,
                uploadedBy,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                correlationId,
            });

            const result = await CompanyLogoService.uploadLogo(
                companyId,
                uploadedBy,
                req.file,
                setAsActive
            );

            const duration = Date.now() - startTime;
            LoggerUtil.info('Company logo uploaded successfully', {
                companyId,
                logoId: result.logoId,
                duration,
                correlationId,
            });

            ResponseUtil.created(
                res,
                { logo: result },
                'Company logo uploaded successfully'
            );

        } catch (error: any) {
            const duration = Date.now() - startTime;

            LoggerUtil.error('Company logo upload failed', {
                error: error.message,
                companyId: req.params.companyId,
                duration,
                correlationId,
            });

            if (error.message === 'Company not found') {
                ResponseUtil.notFound(res, 'Company not found');
                return;
            }

            if (error.message.includes('Maximum') || error.message.includes('dimensions') || error.message.includes('must be at least')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }

            ResponseUtil.internalError(
                res,
                process.env.NODE_ENV === 'production' ? 'Logo upload failed' : error.message,
                error
            );
        }
    }

    // Existing uploadLogo ke neeche add karo

    static async getAllLogos(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = req.params.id;

            const logos = await CompanyLogoService.getAllLogos(companyId);

            ResponseUtil.success(res, { logos }, 'Logos fetched successfully');
        } catch (error: any) {
            if (error.message === 'Company not found') {
                ResponseUtil.notFound(res, 'Company not found');
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async getLogoById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = req.params.id;
            const { logoId } = req.params;

            const logo = await CompanyLogoService.getLogoById(companyId, logoId);

            ResponseUtil.success(res, { logo }, 'Logo fetched successfully');
        } catch (error: any) {
            if (error.message === 'Company not found' || error.message === 'Logo not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async updateLogo(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }
            if (!req.file) {
                ResponseUtil.badRequest(res, 'No file uploaded');
                return;
            }

            const companyId = req.params.id;
            const { logoId } = req.params;
            const uploadedBy = req.user.userId;
            const setAsActive = req.body.setAsActive !== 'false';

            const result = await CompanyLogoService.updateLogo(companyId, logoId, uploadedBy, req.file, setAsActive);

            ResponseUtil.success(res, { logo: result }, 'Logo updated successfully');
        } catch (error: any) {
            if (error.message === 'Company not found' || error.message === 'Logo not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }
            if (error.message.includes('must be at least')) {
                ResponseUtil.badRequest(res, error.message);
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async deleteLogo(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const companyId = req.params.id;
            const { logoId } = req.params;

            await CompanyLogoService.deleteLogo(companyId, logoId);

            ResponseUtil.success(res, null, 'Logo deleted successfully');
        } catch (error: any) {
            if (error.message === 'Company not found' || error.message === 'Logo not found') {
                ResponseUtil.notFound(res, error.message);
                return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }
}

export default CompanyLogoController;