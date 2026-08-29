import { Request, Response, NextFunction } from 'express';
import { CompanyPost } from '../models';
import ResponseUtil from '@/shared/response.util';

export const resolvePostUUID = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const uuid = req.params.id || req.params.postId;

    if (!uuid) return next();

    // 1. If already a valid MongoDB ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(uuid)) {
        let directDoc = await CompanyPost.findOne({ _id: uuid, status: { $ne: 'Archived' } })
            .select('_id')
            .lean();
        if (!directDoc) {
            directDoc = await CompanyPost.findById(uuid).select('_id').lean();
        }
        if (directDoc) {
            (req as any).resolvedObjectId = directDoc._id.toString();
            return next();
        }
    }

    // 2. If UUID postId
    let post = await CompanyPost.findOne({ postId: uuid, status: { $ne: 'Archived' } })
        .select('_id')
        .lean();

    if (!post) {
        post = await CompanyPost.findOne({ postId: uuid })
            .select('_id')
            .lean();
    }

    // 3. If Slug
    if (!post) {
        post = await CompanyPost.findOne({ slug: uuid })
            .select('_id')
            .lean();
    }

    if (!post) {
        return ResponseUtil.notFound(res, 'Post not found');
    }

    (req as any).resolvedObjectId = post._id.toString();
    next();
};