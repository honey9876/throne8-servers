import { Request, Response, NextFunction } from 'express';
import { Company } from '@/company/models';
import ResponseUtil from '@/shared/response.util';

/**
 * Resolves UUID param to MongoDB ObjectId
 * Attaches resolvedId to req for downstream use
 */
export const resolveCompanyUUID = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const uuid = req.params.id || req.params.companyId;

    if (!uuid) return next();

    // UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
        return ResponseUtil.badRequest(res, 'Invalid company ID format. UUID v4 required.');
    }

    const company = await Company.findOne({ companyId: uuid, 'audit.isDeleted': false })
        .select('_id')
        .lean();

    if (!company) {
        return ResponseUtil.notFound(res, 'Company not found');
    }

    // Attach ObjectId as string to request
    (req as any).resolvedObjectId = company._id.toString();
    next();
};