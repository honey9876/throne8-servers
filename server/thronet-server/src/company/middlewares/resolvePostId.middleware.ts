import { Request, Response, NextFunction } from 'express';
import { CompanyPost } from '../models';
import ResponseUtil from '@/shared/response.util';

export const resolvePostUUID = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const uuid = req.params.id;

    if (!uuid) return next();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
        return ResponseUtil.badRequest(res, 'Invalid post ID format. UUID v4 required.');
    }

    const post = await CompanyPost.findOne({ postId: uuid })
        .select('_id')
        .lean();

    if (!post) {
        return ResponseUtil.notFound(res, 'Post not found');
    }

    (req as any).resolvedObjectId = post._id.toString();
    next();
};