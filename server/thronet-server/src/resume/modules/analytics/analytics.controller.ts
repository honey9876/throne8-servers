import { Response } from "express";

import { AuthRequest } from "../../middleware/auth.middleware";

import { analyticsService } from "./analytics.service";

import { asyncHandler } from "../../utils/asyncHandler";

export const getResumeAnalytics =
  asyncHandler(
    async (
      req: AuthRequest,
      res: Response
    ) => {
      const analytics =
       await analyticsService.getAnalytics(
  req.params.id as string
);

      res.status(200).json({
        success: true,
        analytics,
      });
    }
  );


  export const getUserAnalytics =
  asyncHandler(
    async (
      req: AuthRequest,
      res: Response
    ) => {
      const analytics =
       await analyticsService.getUserAnalytics(
  req.userId!
);

      res.status(200).json({
  success: true,
  data: analytics,
});
    }
  );