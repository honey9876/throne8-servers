import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import CompanyCoverService from '../services/companyCover.service';

class CompanyCoverController {

    static async uploadCover(req: AuthRequest, res: Response): Promise<void> {
        try {
            const uploadedBy = req.user?.id || req.user?.userId || 'system';
            if (!req.file) { ResponseUtil.badRequest(res, 'No file uploaded'); return; }

            const companyId = req.params.id;
            const setAsActive = req.body.setAsActive !== 'false';

            const result = await CompanyCoverService.uploadCover(companyId, uploadedBy, req.file, setAsActive);

            ResponseUtil.created(res, { cover: result }, 'Cover uploaded successfully');
        } catch (error: any) {
            if (error.message === 'Company not found') { ResponseUtil.notFound(res, 'Company not found'); return; }
            if (error.message.includes('Maximum') || error.message.includes('must be at least')) {
                ResponseUtil.badRequest(res, error.message); return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async getAllCovers(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = req.params.id;
            const covers = await CompanyCoverService.getAllCovers(companyId);
            ResponseUtil.success(res, { covers }, 'Covers fetched successfully');
        } catch (error: any) {
            if (error.message === 'Company not found') { ResponseUtil.notFound(res, 'Company not found'); return; }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async getCoverById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const companyId = req.params.id;
            const { coverId } = req.params;

            const cover = await CompanyCoverService.getCoverById(companyId, coverId);
            ResponseUtil.success(res, { cover }, 'Cover fetched successfully');
        } catch (error: any) {
            if (error.message === 'Company not found' || error.message === 'Cover not found') {
                ResponseUtil.notFound(res, error.message); return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async updateCover(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }
            if (!req.file) { ResponseUtil.badRequest(res, 'No file uploaded'); return; }

            const companyId = req.params.id;
            const { coverId } = req.params;
            const uploadedBy = req.user.userId;
            const setAsActive = req.body.setAsActive !== 'false';

            const result = await CompanyCoverService.updateCover(companyId, coverId, uploadedBy, req.file, setAsActive);
            ResponseUtil.success(res, { cover: result }, 'Cover updated successfully');
        } catch (error: any) {
            if (error.message === 'Company not found' || error.message === 'Cover not found') {
                ResponseUtil.notFound(res, error.message); return;
            }
            if (error.message.includes('must be at least')) { ResponseUtil.badRequest(res, error.message); return; }
            ResponseUtil.internalError(res, error.message, error);
        }
    }

    static async deleteCover(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) { ResponseUtil.unauthorized(res, 'Authentication required'); return; }

            const companyId = req.params.id;
            const { coverId } = req.params;

            await CompanyCoverService.deleteCover(companyId, coverId);
            ResponseUtil.success(res, null, 'Cover deleted successfully');
        } catch (error: any) {
            if (error.message === 'Company not found' || error.message === 'Cover not found') {
                ResponseUtil.notFound(res, error.message); return;
            }
            ResponseUtil.internalError(res, error.message, error);
        }
    }
}

export default CompanyCoverController;