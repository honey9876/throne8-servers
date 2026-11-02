import { Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";
import { AuthRequest } from "../../middleware/auth.middleware";
import { getReferralStats } from "../../services/referral.service";

/**
 * GET /resume-builder/referral/me
 * The signed-in user's referral code and progress.
 */

export const getMyReferral = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const stats = await getReferralStats(req.userId!);
    res.status(200).json({ success: true, data: stats });
  },
);
