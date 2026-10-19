import { Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";

import { AuthRequest } from "../../middleware/auth.middleware";

import {
  analyzeResumeService,
  getLatestATSAnalysis,
  getATSAnalysisHistory,
  validateATSRequest,
} from "./ats.service";

// ============================================================
// ANALYZE RESUME
// ============================================================

export const analyzeATS = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { resumeId, targetRole, jobDescription, options } = req.body;

    // --------------------------------------------------------
    // Auth must fail fast
    // --------------------------------------------------------

    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    // --------------------------------------------------------
    // Validate request
    // --------------------------------------------------------
    // validating if all these fields and their types are present or not
    validateATSRequest({
      resumeId,
      targetRole,
      jobDescription,
      options,
    });

    // --------------------------------------------------------
    // Run ATS analysis
    // --------------------------------------------------------

    const result = await analyzeResumeService({
      userId: req.userId,

      resumeId,

      targetRole,

      jobDescription: jobDescription ?? "",

      options,
    });

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.status(200).json({
      success: true,

      message: "Resume ATS analysis completed",

      data: {
        result: result.result,
      },
    });
  },
);

// ============================================================
// GET LATEST ATS ANALYSIS
// ============================================================

export const getLatestATS = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { resumeId } = req.params;

    // ------------------------------------------------------
    // Auth check
    // ------------------------------------------------------

    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    // ------------------------------------------------------
    // Validate resumeId
    // ------------------------------------------------------

    if (!resumeId || typeof resumeId !== "string") {
      throw new ApiError(400, "resumeId is required");
    }

    // ------------------------------------------------------
    // Fetch latest analysis
    // ------------------------------------------------------

    const analysis = await getLatestATSAnalysis(req.userId, resumeId);

    if (!analysis) {
      throw new ApiError(404, "ATS analysis not found");
    }

    // ------------------------------------------------------
    // Response
    // ------------------------------------------------------

    res.status(200).json({
      success: true,

      data: analysis,
    });
  },
);

// ============================================================
// GET ATS ANALYSIS HISTORY
// ============================================================

export const getATSHistory = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { resumeId } = req.params;

    // ------------------------------------------------------
    // Auth check
    // ------------------------------------------------------

    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    // ------------------------------------------------------
    // Validate resumeId
    // ------------------------------------------------------

    if (!resumeId || typeof resumeId !== "string") {
      throw new ApiError(400, "resumeId is required");
    }

    // ------------------------------------------------------
    // Fetch history
    // ------------------------------------------------------

    const history = await getATSAnalysisHistory(req.userId, resumeId);

    // ------------------------------------------------------
    // Response
    // ------------------------------------------------------

    res.status(200).json({
      success: true,

      count: history.length,

      data: history,
    });
  },
);
