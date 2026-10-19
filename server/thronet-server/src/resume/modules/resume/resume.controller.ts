import { logActivity } from "../../services/activity.service";
import { ActivityTypes } from "../../models/activity.model";

import { Request, Response, NextFunction } from "express";
import { Resume, DefaultResumeSections } from "../../models/resume.model";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { AuthRequest } from "../../middleware/auth.middleware";
import { getVisitorInfo } from "../../utils/visitor.util";
import { createResumeSchema, updateResumeSchema } from "./resume.validation";
import { analyticsService } from "../analytics/analytics.service";
import {
  parseAndCreateResume,
  parseAndFillResume,
} from "./resume-parse.service";
import crypto from "crypto";

export const createResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const data = createResumeSchema.parse(req.body);

    const resume = await Resume.create({
      userId: req.userId,
      title: data.title,
      targetRole: data.targetRole ?? "",
      templateId: data.templateId ?? "technical-developer",
      sections: DefaultResumeSections,
      version: 1,
      status: "draft",
      personalInfo: {
        fullName: "",
        title: "",
        email: "",
        phone: "",
        address: "",
        linkedIn: "",
        github: "",
        portfolio: "",
        photo: "",
        ...(data.personalInfo ?? {}),
      },
      summary: data.summary ?? "",
      skills: data.skills ?? [],
      experience: data.experience ?? [],
      education: data.education ?? [],
      projects: data.projects ?? [],

      strengths: data.strengths ?? [],
      certifications: data.certifications ?? [],
      languages: data.languages ?? [],
      awards: data.awards ?? [],
      interests: data.interests ?? [],
      achievements: data.achievements ?? [],
    });

    // Create Analytics Document Automatically
    if (req.userId) {
      await analyticsService.createAnalytics(resume._id.toString(), req.userId);
    }

    // Log activity
    await logActivity(
      req.userId as string,
      ActivityTypes.RESUME_CREATED,
      `Created resume "${resume.title}"`,
    );

    res.status(201).json({
      success: true,
      resume,
    });
  },
);

export const uploadAndParseResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!req.file) {
      throw new ApiError(400, "Please upload a PDF resume.");
    }

    const requestedTemplateId =
      typeof req.body?.templateId === "string"
        ? req.body.templateId.trim()
        : undefined;

    const resume = await parseAndCreateResume({
      userId: req.userId,
      fileBuffer: req.file.buffer,
      originalFilename: req.file.originalname,
      templateId: requestedTemplateId || undefined,
    });

    await analyticsService.createAnalytics(resume._id.toString(), req.userId);

    await logActivity(
      req.userId,
      ActivityTypes.RESUME_CREATED,
      `Created resume "${resume.title}"`,
    );

    res.status(201).json({
      success: true,
      resume,
    });
  },
);

// export const getResumes = asyncHandler(
//   async (req: AuthRequest, res: Response) => {
//     const resumes = await Resume.find({
//       userId: req.userId,
//     }).sort({ updatedAt: -1 });

//     res.status(200).json({
//       success: true,
//       resumes,
//     });
//   },
// );

export const getResumes = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const page = Math.max(Number(req.query.page) || 1, 1);

    const limit = 9;

    const skip = (page - 1) * limit;

    const [resumes, totalResumes] = await Promise.all([
      Resume.find({
        userId: req.userId,
      })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),

      Resume.countDocuments({
        userId: req.userId,
      }),
    ]);

    const totalPages = Math.ceil(totalResumes / limit);

    res.status(200).json({
      success: true,
      resumes,
      pagination: {
        currentPage: page,
        limit,
        totalResumes,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  },
);

export const getResumeById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }

    res.status(200).json({
      success: true,
      resume,
    });
  },
);

export const updateResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const data = updateResumeSchema.parse(req.body);

    const existingResume = await Resume.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!existingResume) {
      throw new ApiError(404, "Resume not found");
    }

    const resume = await Resume.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.userId,
      },
      {
        ...data,
        version: existingResume.version + 1,
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (req.userId && resume) {
      await logActivity(
        req.userId,
        ActivityTypes.RESUME_UPDATED,
        `Updated resume "${resume.title}"`,
      );
    }

    res.status(200).json({
      success: true,
      resume,
    });
  },
);

export const deleteResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const resume = await Resume.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }

    if (req.userId) {
      await logActivity(
        req.userId,
        ActivityTypes.RESUME_DELETED,
        `Deleted resume "${resume.title}"`,
      );
    }

    res.status(200).json({
      success: true,
      message: "Resume deleted successfully",
    });
  },
);

export const duplicateResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const existingResume = await Resume.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!existingResume) {
      throw new ApiError(404, "Resume not found");
    }

    const { _id, createdAt, updatedAt, __v, ...resumeData } =
      existingResume.toObject();

    const requestedTemplateId =
      typeof req.body?.templateId === "string"
        ? req.body.templateId.trim()
        : "";

    const duplicatedResume = await Resume.create({
      ...resumeData,
      title: `${existingResume.title} Copy`,
      version: 1,
      userId: req.userId,
      templateId: requestedTemplateId || existingResume.templateId,
    });

    if (req.userId) {
      await logActivity(
        req.userId,
        ActivityTypes.RESUME_CREATED,
        `Duplicated resume "${duplicatedResume.title}"`,
      );
    }

    res.status(201).json({
      success: true,
      resume: duplicatedResume,
    });
  },
);

export const shareResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const shareId = crypto.randomBytes(16).toString("hex");

    const resume = await Resume.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.userId,
      },
      {
        $set: {
          shareId,
          isPublic: true,
        },
      },
      {
        new: true,
        runValidators: false,
      },
    );

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }

    // 👇 Analytics update
    await analyticsService.incrementShares(resume._id.toString());

    if (req.userId) {
      await logActivity(
        req.userId,
        ActivityTypes.RESUME_SHARED,
        `Shared resume "${resume.title}"`,
      );
    }

    res.status(200).json({
      success: true,
      message: "Resume shared successfully",
      shareId: resume.shareId,
    });
  },
);

export const disableShareResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }

    resume.isPublic = false;

    await resume.save();

    res.status(200).json({
      success: true,
      message: "Resume sharing disabled",
    });
  },
);

export const getPublicResume = asyncHandler(
  async (req: Request, res: Response) => {
    console.log("resume shared id is ", req.params.shareId);
    const resume = await Resume.findOne({
      shareId: req.params.shareId,
      isPublic: true,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }
    console.log("resume fond", resume);

    // Visitor Info
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.ip ||
      "unknown";

    const visitor = getVisitorInfo(req.headers["user-agent"] ?? "");

    // Analytics
    await analyticsService.incrementViews(
      resume._id.toString(),
      resume.userId.toString(),
      ip,
      visitor.browser,
      visitor.device,
    );

    res.status(200).json({
      success: true,
      resume,
    });
  },
);

export const uploadAndParseIntoResume = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!req.file) {
      throw new ApiError(400, "Please upload a PDF resume.");
    }

    // const resume = await parseAndFillResume({
    //   userId: req.userId,
    //   resumeId: req.params.id,
    //   fileBuffer: req.file.buffer,
    // });

    const resumeId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const resume = await parseAndFillResume({
      userId: req.userId,
      resumeId,
      fileBuffer: req.file.buffer,
    });

    await logActivity(
      req.userId,
      ActivityTypes.RESUME_UPDATED,
      `Filled resume "${resume.title}" from an uploaded PDF`,
    );

    res.status(200).json({
      success: true,
      resume,
    });
  },
);
