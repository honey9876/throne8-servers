import express, { Router } from "express";
const router = express.Router();
import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import { rateLimitFilter } from "@/Mentorship/middlewares/rateLimit.middleware";
import { getSortOptionsControllerController, sortJobsController } from "../controllers";

router.get(
    "/sort",
    AuthMiddleware.authenticate as any,
    rateLimitFilter,
    sortJobsController
);

router.get(
    "/sortOptions",
    AuthMiddleware.authenticate as any,
    rateLimitFilter,
    getSortOptionsControllerController
);

// router.get(
//     "/analytics",
//     AuthMiddleware.authenticate as any,
//     rateLimitFilter,
//     getSortAnalyticsController
// );

// router.get(
//     "/createCustom",
//     AuthMiddleware.authenticate as any,
//     rateLimitFilter,
//     createCustomSortController
// );

// router.get(
//     "/compare",
//     AuthMiddleware.authenticate as any,
//     rateLimitFilter,
//     compareSortsController
// );

// router.get(
//     "/sort-recommendations",
//     AuthMiddleware.authenticate as any,
//     rateLimitFilter,
//     getSmartSortRecommendationsController
// );

// router.get(
//     "/sort-performance",
//     AuthMiddleware.authenticate as any,
//     rateLimitFilter,
//     getSortPerformanceMetricsController
// );



export default router;