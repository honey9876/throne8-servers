import express from "express";
// import { requirePremium } from "../../middlewares/require.premium.js";
import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import multer from "multer";
import { createFollowUpReminderController, compareOffersController, createThankYouNoteController, createOfferController, createApplicationTemplateController, createApplicationNoteController, createInterviewController, createReferenceController, getApplicationNotesController, getFollowUpRemindersController, exportApplicationDataController, saveVideoIntroductionController, updateInterviewStatusController, createBatchApplicationController, savePortfolioAttachmentController, updateQuickApplySettingsController, calculateApplicationScoreController } from "@/Job-Service/controllers";
import { rateLimitGeneral } from "@/shared/middlewares";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100000000 },
}); // 100MB max

// Follow-up Reminders
router.post(
  "/follow-ups",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createFollowUpReminderRateLimit,
  rateLimitGeneral,
  createFollowUpReminderController
);
router.get(
  "/follow-ups",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.getFollowUpRemindersRateLimit,
  rateLimitGeneral,
  getFollowUpRemindersController
);

// Interview Tracking
router.post(
  "/interviews",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createInterviewRateLimit,
  rateLimitGeneral,
  createInterviewController
);

router.patch(
  "/interviews/:interviewId/status",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.updateInterviewStatusRateLimit,
  rateLimitGeneral,
  updateInterviewStatusController
);

// Offer Management
router.post(
  "/offers",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createOfferRateLimit,
  rateLimitGeneral,
  createOfferController
);

router.post(
  "/offers/compare",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.compareOffersRateLimit,
  rateLimitGeneral,
  compareOffersController
);

// Application Notes
router.post(
  "/notes",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createApplicationNoteRateLimit,
  rateLimitGeneral,
  createApplicationNoteController
);

router.get(
  "/notes/:applicationId",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.getApplicationNotesRateLimit,
  rateLimitGeneral,
  getApplicationNotesController
);

// Batch Applications
router.post(
  "/batch-applications",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createBatchApplicationRateLimit,
  rateLimitGeneral,
  createBatchApplicationController
);

// Application Templates
router.post(
  "/templates",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createApplicationTemplateRateLimit,
  rateLimitGeneral,
  createApplicationTemplateController
);

// Quick Apply Settings
router.patch(
  "/quick-apply",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.updateQuickApplySettingsRateLimit,
  rateLimitGeneral,
  updateQuickApplySettingsController
);

// Application Scoring
router.get(
  "/scoring/:applicationId",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.calculateApplicationScoreRateLimit,
  rateLimitGeneral,
  calculateApplicationScoreController
);

// Application Export
router.post(
  "/export",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.exportApplicationDataRateLimit,
  rateLimitGeneral,
  exportApplicationDataController
);

// Thank You Note
router.post(
  "/thank-you",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createThankYouNoteRateLimit,
  rateLimitGeneral,
  createThankYouNoteController
);

// Video Introduction
router.post(
  "/videos",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  upload.single("video"),
  // rateLimiters.saveVideoIntroductionRateLimit,
  rateLimitGeneral,
  saveVideoIntroductionController
);

// Portfolio Attachment
router.post(
  "/portfolio",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  upload.single("file"),
  // rateLimiters.savePortfolioAttachmentRateLimit,
  rateLimitGeneral,
  savePortfolioAttachmentController
);

// Reference Management
router.post(
  "/references",
  AuthMiddleware.authenticate as any,
  // requirePremium,
  // rateLimiters.createReferenceRateLimit,
  rateLimitGeneral,
  createReferenceController
);

export default router;
