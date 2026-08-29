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

    // If already a valid MongoDB ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(uuid)) {
        const directDoc = await Company.findOne({ _id: uuid, 'audit.isDeleted': false }).select('_id').lean();
        if (directDoc) {
            (req as any).resolvedObjectId = directDoc._id.toString();
            return next();
        }
    }

    let company = await Company.findOne({ companyId: uuid, 'audit.isDeleted': false })
        .select('_id')
        .lean();

    if (!company) {
        company = await Company.findOne({ companySlug: uuid, 'audit.isDeleted': false })
            .select('_id')
            .lean();
    }

    if (!company) {
        return ResponseUtil.notFound(res, 'Company not found');
    }

    // Attach ObjectId as string to request
    (req as any).resolvedObjectId = company._id.toString();
    next();
};