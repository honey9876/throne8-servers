import { Request, Response } from 'express';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';
import companyAboutService from '../services/companyAbout.service';
import ResponseUtil from '@/shared/response.util';
import logger from '@/shared/logger.util';

const getObjectId = (req: Request): string => {
    const objectId = (req as any).resolvedObjectId;
    if (!objectId) throw new Error('resolvedObjectId missing — resolveCompanyUUID middleware not applied');
    return objectId;
};

const getCompanyUUID = (req: Request): string => req.params.id;

class CompanyAboutController {

    // ========== FEATURE 1: IDENTITY ==========

    async upsertIdentity(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const companyUUID = getCompanyUUID(req);
            const userId = req.user?.id!;
            const result = await companyAboutService.upsertIdentity(objectId, companyUUID, req.body, userId);
            ResponseUtil.success(res, result, 'Company identity saved successfully');
        } catch (error: any) {
            logger.error('Error upserting identity:', error);
            ResponseUtil.error(res, error.message || 'Failed to save identity', 500);
        }
    }

    async getIdentity(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const result = await companyAboutService.getIdentity(objectId);
            if (!result) { ResponseUtil.notFound(res, 'Identity not found'); return; }
            ResponseUtil.success(res, result, 'Identity fetched successfully');
        } catch (error: any) {
            logger.error('Error getting identity:', error);
            ResponseUtil.error(res, error.message || 'Failed to fetch identity', 500);
        }
    }

    async deleteIdentity(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            await companyAboutService.deleteIdentity(objectId);
            ResponseUtil.success(res, null, 'Identity deleted successfully');
        } catch (error: any) {
            logger.error('Error deleting identity:', error);
            ResponseUtil.error(res, error.message || 'Failed to delete identity', 500);
        }
    }

    // ========== FEATURE 2: TIMELINE ==========

    async createTimeline(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const companyUUID = getCompanyUUID(req);
            const userId = req.user?.id!;
            const result = await companyAboutService.createTimeline(objectId, companyUUID, req.body, userId);
            ResponseUtil.created(res, result, 'Timeline entry created successfully');
        } catch (error: any) {
            logger.error('Error creating timeline:', error);
            ResponseUtil.error(res, error.message || 'Failed to create timeline', 500);
        }
    }

    async getTimelines(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const page = parseInt(req.query.page as string) || 1;
            const pageSize = parseInt(req.query.pageSize as string) || 20;
            const result = await companyAboutService.getTimelines(objectId, page, pageSize);
            ResponseUtil.success(res, result, 'Timelines fetched successfully');
        } catch (error: any) {
            logger.error('Error getting timelines:', error);
            ResponseUtil.error(res, error.message || 'Failed to fetch timelines', 500);
        }
    }

    async updateTimeline(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const { timelineId } = req.params;
            const userId = req.user?.id!;
            const result = await companyAboutService.updateTimeline(timelineId, objectId, req.body, userId);
            ResponseUtil.success(res, result, 'Timeline updated successfully');
        } catch (error: any) {
            logger.error('Error updating timeline:', error);
            if (error.message === 'Timeline not found') { ResponseUtil.notFound(res, error.message); return; }
            ResponseUtil.error(res, error.message || 'Failed to update timeline', 500);
        }
    }

    async deleteTimeline(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const { timelineId } = req.params;
            await companyAboutService.deleteTimeline(timelineId, objectId);
            ResponseUtil.success(res, null, 'Timeline deleted successfully');
        } catch (error: any) {
            logger.error('Error deleting timeline:', error);
            if (error.message === 'Timeline not found') { ResponseUtil.notFound(res, error.message); return; }
            ResponseUtil.error(res, error.message || 'Failed to delete timeline', 500);
        }
    }

    // ========== FEATURE 3: UPDATES / NEWS ==========

    async createUpdate(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const companyUUID = getCompanyUUID(req);
            const userId = req.user?.id!;
            const result = await companyAboutService.createUpdate(objectId, companyUUID, req.body, userId);
            ResponseUtil.created(res, result, 'Update created successfully');
        } catch (error: any) {
            logger.error('Error creating update:', error);
            ResponseUtil.error(res, error.message || 'Failed to create update', 500);
        }
    }

    async getUpdates(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const filters = {
                page: parseInt(req.query.page as string) || 1,
                pageSize: parseInt(req.query.pageSize as string) || 20,
                category: req.query.category as string,
                isPublished: req.query.isPublished === 'true' ? true : req.query.isPublished === 'false' ? false : undefined,
            };
            const result = await companyAboutService.getUpdates(objectId, filters);
            ResponseUtil.success(res, result, 'Updates fetched successfully');
        } catch (error: any) {
            logger.error('Error getting updates:', error);
            ResponseUtil.error(res, error.message || 'Failed to fetch updates', 500);
        }
    }

    async getUpdateById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const { updateId } = req.params;
            const result = await companyAboutService.getUpdateById(updateId, objectId);
            ResponseUtil.success(res, result, 'Update fetched successfully');
        } catch (error: any) {
            logger.error('Error getting update:', error);
            if (error.message === 'Update not found') { ResponseUtil.notFound(res, error.message); return; }
            ResponseUtil.error(res, error.message || 'Failed to fetch update', 500);
        }
    }

    async updateUpdate(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const { updateId } = req.params;
            const userId = req.user?.id!;
            const result = await companyAboutService.updateUpdate(updateId, objectId, req.body, userId);
            ResponseUtil.success(res, result, 'Update saved successfully');
        } catch (error: any) {
            logger.error('Error updating update:', error);
            if (error.message === 'Update not found') { ResponseUtil.notFound(res, error.message); return; }
            ResponseUtil.error(res, error.message || 'Failed to update', 500);
        }
    }

    async deleteUpdate(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const { updateId } = req.params;
            await companyAboutService.deleteUpdate(updateId, objectId);
            ResponseUtil.success(res, null, 'Update deleted successfully');
        } catch (error: any) {
            logger.error('Error deleting update:', error);
            if (error.message === 'Update not found') { ResponseUtil.notFound(res, error.message); return; }
            ResponseUtil.error(res, error.message || 'Failed to delete update', 500);
        }
    }

    // ========== FEATURE 4: TESTIMONIALS ==========

    async createTestimonial(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const companyUUID = getCompanyUUID(req);
            const userId = req.user?.id!;
            const result = await companyAboutService.createTestimonial(objectId, companyUUID, req.body, userId);
            ResponseUtil.created(res, result, 'Testimonial created successfully');
        } catch (error: any) {
            logger.error('Error creating testimonial:', error);
            ResponseUtil.error(res, error.message || 'Failed to create testimonial', 500);
        }
    }

    async getTestimonials(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const filters = {
                page: parseInt(req.query.page as string) || 1,
                pageSize: parseInt(req.query.pageSize as string) || 20,
                isFeatured: req.query.isFeatured === 'true' ? true : undefined,
                isPublished: req.query.isPublished === 'true' ? true : req.query.isPublished === 'false' ? false : undefined,
            };
            const result = await companyAboutService.getTestimonials(objectId, filters);
            ResponseUtil.success(res, result, 'Testimonials fetched successfully');
        } catch (error: any) {
            logger.error('Error getting testimonials:', error);
            ResponseUtil.error(res, error.message || 'Failed to fetch testimonials', 500);
        }
    }

    async updateTestimonial(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const { testimonialId } = req.params;
            const userId = req.user?.id!;
            const result = await companyAboutService.updateTestimonial(testimonialId, objectId, req.body, userId);
            ResponseUtil.success(res, result, 'Testimonial updated successfully');
        } catch (error: any) {
            logger.error('Error updating testimonial:', error);
            if (error.message === 'Testimonial not found') { ResponseUtil.notFound(res, error.message); return; }
            ResponseUtil.error(res, error.message || 'Failed to update testimonial', 500);
        }
    }

    async deleteTestimonial(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const { testimonialId } = req.params;
            await companyAboutService.deleteTestimonial(testimonialId, objectId);
            ResponseUtil.success(res, null, 'Testimonial deleted successfully');
        } catch (error: any) {
            logger.error('Error deleting testimonial:', error);
            if (error.message === 'Testimonial not found') { ResponseUtil.notFound(res, error.message); return; }
            ResponseUtil.error(res, error.message || 'Failed to delete testimonial', 500);
        }
    }

    // ========== FEATURE 5: PRODUCT ==========

    async upsertProduct(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const companyUUID = getCompanyUUID(req);
            const userId = req.user?.id!;
            const result = await companyAboutService.upsertProduct(objectId, companyUUID, req.body, userId);
            ResponseUtil.success(res, result, 'Product info saved successfully');
        } catch (error: any) {
            logger.error('Error upserting product:', error);
            ResponseUtil.error(res, error.message || 'Failed to save product info', 500);
        }
    }

    async getProduct(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const result = await companyAboutService.getProduct(objectId);
            if (!result) { ResponseUtil.notFound(res, 'Product info not found'); return; }
            ResponseUtil.success(res, result, 'Product info fetched successfully');
        } catch (error: any) {
            logger.error('Error getting product:', error);
            ResponseUtil.error(res, error.message || 'Failed to fetch product info', 500);
        }
    }

    async deleteProduct(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            await companyAboutService.deleteProduct(objectId);
            ResponseUtil.success(res, null, 'Product info deleted successfully');
        } catch (error: any) {
            logger.error('Error deleting product:', error);
            ResponseUtil.error(res, error.message || 'Failed to delete product info', 500);
        }
    }

    // ========== FEATURE 6: COMPANY LIFE ==========

    async upsertLife(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const companyUUID = getCompanyUUID(req);
            const userId = req.user?.id!;
            const result = await companyAboutService.upsertLife(objectId, companyUUID, req.body, userId);
            ResponseUtil.success(res, result, 'Company life saved successfully');
        } catch (error: any) {
            logger.error('Error upserting company life:', error);
            ResponseUtil.error(res, error.message || 'Failed to save company life', 500);
        }
    }

    async getLife(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const result = await companyAboutService.getLife(objectId);
            if (!result) { ResponseUtil.notFound(res, 'Company life not found'); return; }
            ResponseUtil.success(res, result, 'Company life fetched successfully');
        } catch (error: any) {
            logger.error('Error getting company life:', error);
            ResponseUtil.error(res, error.message || 'Failed to fetch company life', 500);
        }
    }

    // ========== FULL ABOUT PAGE ==========
    async getFullAbout(req: AuthRequest, res: Response): Promise<void> {
        try {
            const objectId = getObjectId(req);
            const result = await companyAboutService.getFullAbout(objectId);
            ResponseUtil.success(res, result, 'About page fetched successfully');
        } catch (error: any) {
            logger.error('Error getting full about:', error);
            ResponseUtil.error(res, error.message || 'Failed to fetch about page', 500);
        }
    }
}

export default new CompanyAboutController();