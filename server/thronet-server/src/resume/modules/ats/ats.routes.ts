import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";

import {
  analyzeATS,
  getLatestATS,
  getATSHistory,
} from "./ats.controller";

const router = Router();

// ============================================================
// Authentication
// ============================================================

router.use(protect);

// ============================================================
// ATS ANALYSIS
// ============================================================

router.post(
  "/analyze",
  analyzeATS
);

// ============================================================
// LATEST ANALYSIS
// ============================================================

router.get(
  "/:resumeId/latest",
  getLatestATS
);

// ============================================================
// ANALYSIS HISTORY
// ============================================================

router.get(
  "/:resumeId/history",
  getATSHistory
);

export default router;