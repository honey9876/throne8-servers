import express from "express";

import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import { incrementSaveController, incrementViewController } from "../controllers";
import { getJobAnalyticsService } from "../services/jobAnalytics.service";

const router = express.Router();

router.use(AuthMiddleware.authenticate as any);


router.post("/:jobId/view", AuthMiddleware.authenticate as any, incrementViewController);

router.post("/:jobId/save", AuthMiddleware.authenticate as any, incrementSaveController);

router.post("/:jobId/analytics", AuthMiddleware.authenticate as any, getJobAnalyticsService);

// router.post("/search/similar", AuthMiddleware.authenticate as any, searchSimilarJobs);

export default router;
