import { Response } from "express";

import { CoverLetter, CoverLetterTemplates } from "../../models/coverLetter.model";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { AuthRequest } from "../../middleware/auth.middleware";
import {
  createCoverLetterSchema,
  updateCoverLetterSchema,
} from "./coverLetter.validation";

/**
 * Create Cover Letter
 */
export const createCoverLetter = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const data = createCoverLetterSchema.parse(req.body);

    const defaultDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const coverLetter = await CoverLetter.create({
      userId: req.userId,
      title: data.title,
      targetRole: data.targetRole ?? "",
      templateId: data.templateId ?? CoverLetterTemplates.CLASSIC_FORMAL,

      // If full content was supplied (e.g. an AI-generated draft being
      // saved for the first time), use it. Otherwise fall back to the
      // same empty defaults as a manually-created cover letter.
      personalInfo: data.personalInfo ?? undefined,

      recipient: {
        date: data.recipient?.date || defaultDate,
        recipientName: data.recipient?.recipientName || "Hiring Manager",
        companyName: data.recipient?.companyName || "",
        companyLocation: data.recipient?.companyLocation || "",
        subject:
          data.recipient?.subject ||
          (data.targetRole
            ? `Application for ${data.targetRole} Position`
            : ""),
        greeting: data.recipient?.greeting || "Dear Hiring Manager,",
      },

      body: data.body ?? undefined,

      closing: data.closing ?? undefined,
    });

    res.status(201).json({
      success: true,
      coverLetter,
    });
  },
);

/**
 * Get All Cover Letters (for current user)
 */
export const getCoverLetters = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const coverLetters = await CoverLetter.find({ userId: req.userId }).sort({
      updatedAt: -1,
    });

    res.status(200).json({
      success: true,
      coverLetters,
    });
  },
);

/**
 * Get Cover Letter By Id
 */
export const getCoverLetterById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const coverLetter = await CoverLetter.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!coverLetter) {
      throw new ApiError(404, "Cover letter not found");
    }

    res.status(200).json({
      success: true,
      coverLetter,
    });
  },
);

/**
 * Update Cover Letter
 */
export const updateCoverLetter = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const data = updateCoverLetterSchema.parse(req.body);

    const coverLetter = await CoverLetter.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!coverLetter) {
      throw new ApiError(404, "Cover letter not found");
    }

    res.status(200).json({
      success: true,
      coverLetter,
    });
  },
);

/**
 * Delete Cover Letter
 */
export const deleteCoverLetter = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const coverLetter = await CoverLetter.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!coverLetter) {
      throw new ApiError(404, "Cover letter not found");
    }

    res.status(200).json({
      success: true,
      message: "Cover letter deleted",
    });
  },
);
