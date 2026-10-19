import { Response } from "express";

import { Resume } from "../../models/resume.model";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";

import { AuthRequest } from "../../middleware/auth.middleware";
import { trackAIUsage } from "../../services/ai-usage.service";

import {
  generateSummaryService,
  rewriteExperienceService,
  suggestSkillsService,
  generateProjectService,
  generateExperienceService,
  generateProjectDescriptionService,
  generateCourseworkService,
  generateCustomSectionService,
  generateInternshipService,
  generateFullResumeService,
  generateCoverLetterService,
  regenerateCoverLetterSectionService,
} from "./ai.service";

import { extractResumeStructure } from "../ats/ats.service";
import {
  extractTextFromPdf,
  extractContactWithRegex,
} from "../resume/resume-parse.service";
import type { RegenerateCoverLetterTarget } from "../../prompts/regenerate-cover-letter.prompt";
import {
  getCoverLetterAiCredits,
  FREE_COVER_LETTER_AI_CREDITS,
} from "./coverLetterCredits.service";

export const generateSummary = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { resumeId } = req.body;

    const resume = await Resume.findOne({
      _id: resumeId,
      userId: req.userId,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }

    const summary = await generateSummaryService(resume.toObject());

    await trackAIUsage(req.userId!, "generate-summary");

    res.status(200).json({
      success: true,
      summary,
    });
  },
);

export const rewriteExperience = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { experience, targetRole } = req.body;

    const content = await rewriteExperienceService(experience, targetRole);

    await trackAIUsage(req.userId!, "rewrite-experience");

    res.status(200).json({
      success: true,
      content,
    });
  },
);

export const suggestSkills = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { resumeId, selectedCategory } = req.body;

    const resume = await Resume.findOne({
      _id: resumeId,
      userId: req.userId,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }

    const skills = await suggestSkillsService(
      resume.toObject(),
      selectedCategory,
    );

    await trackAIUsage(req.userId!, "suggest-skills");

    res.status(200).json({
      success: true,
      skills,
    });
  },
);

export const generateExperience = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { company, position, context } = req.body;

    const responsibilities = await generateExperienceService(
      company,
      position,
      context,
    );

    await trackAIUsage(req.userId!, "generate-experience");

    res.status(200).json({
      success: true,
      responsibilities,
    });
  },
);

export const generateProjectDescription = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { projectName, technologies, context } = req.body;

    const description = await generateProjectDescriptionService(
      projectName,
      technologies,
      context,
    );

    await trackAIUsage(req.userId!, "generate-project-description");

    res.status(200).json({
      success: true,
      description,
    });
  },
);

export const generateCoursework = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { degree, fieldOfStudy, targetRole } = req.body;

    const coursework = await generateCourseworkService(
      degree,
      fieldOfStudy,
      targetRole,
    );

    await trackAIUsage(req.userId!, "generate-coursework");

    res.status(200).json({
      success: true,
      coursework,
    });
  },
);

export const generateCustomSection = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { sectionType, itemTitle, itemSubtitle, context } = req.body;

    const description = await generateCustomSectionService(
      sectionType,
      itemTitle,
      itemSubtitle,
      context,
    );

    await trackAIUsage(req.userId!, "generate-custom-section");

    res.status(200).json({
      success: true,
      description,
    });
  },
);

export const generateInternship = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { company, role, context } = req.body;

    const description = await generateInternshipService(company, role, context);

    await trackAIUsage(req.userId!, "generate-internship");

    res.status(200).json({
      success: true,
      description,
    });
  },
);

export const generateResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { formData } = req.body;

    if (!formData?.personalInfo?.fullName || !formData?.personalInfo?.email) {
      throw new ApiError(400, "Full name and email are required");
    }

    const resume = await generateFullResumeService(formData);

    await trackAIUsage(req.userId!, "generate-resume");

    res.status(200).json({
      success: true,
      resume,
    });
  },
);

/**
 * Generate Cover Letter with AI
 *
 * Accepts either:
 * - resumeId: an existing saved resume to base the letter on, OR
 * - an uploaded PDF resume (multipart "file") — parsed in-memory only,
 *   never saved as a resume record.
 *
 * And either:
 * - jobDescription, OR
 * - companyName (+ optional companyInfo) when no JD is available.
 *
 * Returns the generated cover letter CONTENT only. It is not saved to
 * the database here — the frontend saves it via the normal cover
 * letter create/update endpoints once the user keeps/edits it.
 */
export const generateCoverLetter = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { targetRole, jobDescription, companyName, companyInfo, resumeId } =
      req.body;

    if (!targetRole) {
      throw new ApiError(400, "Target role is required");
    }

    if (!jobDescription && !companyName) {
      throw new ApiError(
        400,
        "Please provide a job description, or a company name if you don't have one.",
      );
    }

    const credits = await getCoverLetterAiCredits(req.userId!);

    if (credits.remaining <= 0) {
      throw new ApiError(
        403,
        `You've used all ${FREE_COVER_LETTER_AI_CREDITS} free AI cover letter generations. Buy more credits to continue.`,
      );
    }

    let candidateProfile: unknown;

    if (req.file) {
      // Fresh upload — parse in-memory only, never persisted.
      const text = await extractTextFromPdf(req.file.buffer);
      const regexContact = extractContactWithRegex(text);

      candidateProfile = await extractResumeStructure(text, regexContact);
    } else if (resumeId) {
      const resume = await Resume.findOne({
        _id: resumeId,
        userId: req.userId,
      });

      if (!resume) {
        throw new ApiError(404, "Resume not found");
      }

      candidateProfile = resume;
    } else {
      throw new ApiError(
        400,
        "Please select an existing resume or upload one to base the letter on.",
      );
    }

    const generated = await generateCoverLetterService({
      targetRole,
      jobDescription: jobDescription || undefined,
      companyName: companyName || undefined,
      companyInfo: companyInfo || undefined,
      candidateProfile,
    });

    await trackAIUsage(req.userId!, "generate-cover-letter");

    const updatedCredits = await getCoverLetterAiCredits(req.userId!);

    res.status(200).json({
      success: true,
      coverLetter: generated,
      credits: updatedCredits,
    });
  },
);

/**
 * Regenerate one section (or the whole body) of a cover letter.
 * Also returns content only — not saved here.
 */
export const regenerateCoverLetterSection = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { currentLetter, target, reason } = req.body as {
      currentLetter: unknown;
      target: RegenerateCoverLetterTarget;
      reason: string;
    };

    if (!currentLetter || !target) {
      throw new ApiError(400, "currentLetter and target are required");
    }

    if (!reason || !reason.trim()) {
      throw new ApiError(400, "Please describe what you'd like changed");
    }

    const credits = await getCoverLetterAiCredits(req.userId!);

    if (credits.remaining <= 0) {
      throw new ApiError(
        403,
        `You've used all ${FREE_COVER_LETTER_AI_CREDITS} free AI cover letter generations. Buy more credits to continue.`,
      );
    }

    const result = await regenerateCoverLetterSectionService({
      currentLetter,
      target,
      reason,
    });

    await trackAIUsage(req.userId!, "regenerate-cover-letter");

    const updatedCredits = await getCoverLetterAiCredits(req.userId!);

    res.status(200).json({
      success: true,
      result,
      credits: updatedCredits,
    });
  },
);

/**
 * Get the current user's remaining free cover-letter AI credits
 * (shared pool between generate and regenerate).
 */
export const getCoverLetterCredits = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const credits = await getCoverLetterAiCredits(req.userId!);

    res.status(200).json({
      success: true,
      credits,
    });
  },
);
