import { Request, Response, NextFunction } from 'express';
import { Employee } from '../models';
import ResponseUtil from '@/shared/response.util';

export const resolveEmployeeUUID = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const uuid = req.params.id;

    if (!uuid) return next();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
        return ResponseUtil.badRequest(res, 'Invalid employee ID format. UUID v4 required.');
    }

    const employee = await Employee.findOne({ employeeId: uuid })
        .select('_id')
        .lean();

    if (!employee) {
        return ResponseUtil.notFound(res, 'Employee not found');
    }

    (req as any).resolvedObjectId = employee._id.toString();
    next();
};