import { Request, Response, NextFunction } from 'express';
import { CompanyReview } from '../models';
import ResponseUtil from '@/shared/response.util';

export const resolveReviewUUID = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const uuid = req.params.id;

    if (!uuid) return next();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
        return ResponseUtil.badRequest(res, 'Invalid review ID format. UUID v4 required.');
    }

    const review = await CompanyReview.findOne({ reviewId: uuid })
        .select('_id')
        .lean();

    if (!review) {
        return ResponseUtil.notFound(res, 'Review not found');
    }

    (req as any).resolvedObjectId = review._id.toString();
    next();
};