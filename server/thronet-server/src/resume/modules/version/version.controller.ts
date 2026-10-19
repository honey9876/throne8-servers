import { Response } from "express";

import { AuthRequest } from "../../middleware/auth.middleware";

import { asyncHandler } from "../../utils/asyncHandler";

// import { saveVersion } from "./version.service";
import { ApiError } from "../../utils/ApiError";

import {
  saveVersion,
  getVersions,
  restoreVersion,
} from "./version.service";

 
export const createVersion =
  asyncHandler(
    async (
      req: AuthRequest,
      res: Response
    ) => {
      const { resumeId } = req.params;

      if (
        !resumeId ||
        Array.isArray(resumeId)
      ) {
        throw new ApiError(
          400,
          "Invalid resume id"
        );
      }

      const version =
        await saveVersion(
          resumeId,
          req.userId!
        );

      res.status(201).json({
        success: true,
        version,
      });
    }
  );

  export const getVersionHistory =
  asyncHandler(
    async (
      req: AuthRequest,
      res: Response
    ) => {
      const versions = await getVersions(
  req.params.resumeId as string,
  req.userId!
);

      res.status(200).json({
        success: true,
        versions,
      });
    }
  );

  export const restoreResumeVersion =
  asyncHandler(
    async (
      req: AuthRequest,
      res: Response
    ) => {
      const resume =
        await restoreVersion(
          req.params.versionId as string,
          req.userId!
        );

      res.status(200).json({
        success: true,
        message:
          "Version restored successfully",
        resume,
      });
    }
  );