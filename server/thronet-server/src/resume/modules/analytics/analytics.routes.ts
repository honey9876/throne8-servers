import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";

import {
  getResumeAnalytics,
} from "./analytics.controller";

const router = Router();

router.use(protect);

router.get(
  "/resume/:id",
  getResumeAnalytics
);

export default router;