import { Request, Response, NextFunction } from 'express';
import Event from '../models/event.model';
import ResponseUtil from '@/shared/response.util';

export const resolveEventUUID = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const uuid = req.params.id;

    if (!uuid) return next();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
        return ResponseUtil.badRequest(res, 'Invalid event ID format. UUID v4 required.');
    }

    const event = await Event.findOne({ eventId: uuid }).select('_id').lean();

    if (!event) {
        return ResponseUtil.notFound(res, 'Event not found');
    }

    (req as any).resolvedObjectId = event._id.toString();
    next();
};