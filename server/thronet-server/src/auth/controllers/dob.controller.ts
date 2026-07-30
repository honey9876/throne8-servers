// src/auth/controllers/dob.controller.ts
import { Request, Response } from 'express';
import { User } from '@/shared/models/index.models';
import ResponseUtil from '@/shared/response.util';
import LoggerUtil from '@/shared/logger.util';

interface UpdateDobBody {
    dateOfBirth: string; // format: YYYY-MM-DD
}

/**
 * PATCH /auth/date-of-birth
 * Lets an authenticated user set/update their date of birth.
 * Needed so the Catch Up feed can show birthdays for their connections.
 *
 * ✅ FIXED: uses req.user.id (matches the global Express.Request.user type
 * declared as `Partial<IUser> & { id: string }`), not req.user.userId.
 */
export const updateDateOfBirth = async (
    req: Request<{}, any, UpdateDobBody>,
    res: Response
): Promise<void> => {
    const userId = req.user?.id;
    const { dateOfBirth } = req.body;

    try {
        if (!userId) {
            ResponseUtil.unauthorized(res, 'Authentication required');
            return;
        }

        if (!dateOfBirth) {
            ResponseUtil.badRequest(res, 'dateOfBirth is required (format: YYYY-MM-DD)');
            return;
        }

        const parsedDate = new Date(dateOfBirth);
        if (isNaN(parsedDate.getTime())) {
            ResponseUtil.badRequest(res, 'Invalid date format. Use YYYY-MM-DD');
            return;
        }

        const ageYears = (Date.now() - parsedDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (ageYears < 13 || ageYears > 120) {
            ResponseUtil.badRequest(res, 'Date of birth must indicate an age between 13 and 120');
            return;
        }

        const updatedUser = await User.findOneAndUpdate(
            { userId },
            { $set: { dateOfBirth: parsedDate } },
            { new: true }
        ).select('userId dateOfBirth');

        if (!updatedUser) {
            ResponseUtil.notFound(res, 'User not found');
            return;
        }

        LoggerUtil.info('Date of birth updated', { userId });
        ResponseUtil.success(
            res,
            { dateOfBirth: (updatedUser as any).dateOfBirth },
            'Date of birth updated successfully'
        );
        return;
    } catch (error: any) {
        LoggerUtil.error('Update date of birth failed', {
            error: error.message,
            userId,
        });
        ResponseUtil.error(res, error.message || 'Failed to update date of birth', 500);
        return;
    }
};

export default { updateDateOfBirth };

/**
 * ✅ SETUP NOTE — auth.routes.ts mein ye add karo:
 *
 *   import AuthMiddleware from '@/shared/middlewares/auth.middleware';
 *   import { updateDateOfBirth } from '../controllers/dob.controller';
 *
 *   router.patch('/date-of-birth', AuthMiddleware.authenticate, updateDateOfBirth);
 *
 * NOTE: `AuthMiddleware.authenticate` ek static class method hai (function nahi),
 * isliye seedha reference pass karo jaisa upar dikhaya — call mat karo (yani
 * AuthMiddleware.authenticate() nahi likhna, sirf AuthMiddleware.authenticate).
 *
 * Final URL: PATCH /api/v1/auth/date-of-birth
 */