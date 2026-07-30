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
 */
export const updateDateOfBirth = async (
    req: Request<{}, any, UpdateDobBody> & { user?: { userId: string } },
    res: Response
): Promise<void> => {
    const userId = req.user?.userId;
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
            { dateOfBirth: updatedUser.dateOfBirth },
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
 * ✅ SETUP NOTE:
 * Apne `src/auth/routes/auth.routes.ts` mein ye route add karo
 * (authentication middleware ke saath, jo baaki protected routes use karte hain):
 *
 *   import { updateDateOfBirth } from '../controllers/dob.controller';
 *   router.patch('/date-of-birth', authenticateJWT, updateDateOfBirth);
 *
 * Final URL: PATCH /api/v1/auth/date-of-birth
 */