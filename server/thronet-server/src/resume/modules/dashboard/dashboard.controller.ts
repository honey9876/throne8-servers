import { Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";
import { AuthRequest } from "../../middleware/auth.middleware";

import { getDashboardData } from "./dashboard.service";

export const dashboard =
  asyncHandler(
    async (
      req: AuthRequest,
      res: Response
    ) => {
      const data =
        await getDashboardData(
          req.userId!
        );

      res.status(200).json({
        success: true,
        ...data,
      });
    }
  );