import express from "express";
const router = express.Router();
import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import { rateLimitFilter } from "@/Mentorship/middlewares/rateLimit.middleware";
import { searchAndFilterJobsController, saveSearchQueryController, getPopularFiltersController, getFilterSuggestionsController } from "@/Job-Service/controllers";


router.get(
    "/filters",
    AuthMiddleware.authenticate as any,
    rateLimitFilter,
    searchAndFilterJobsController
);
router.get(
    "/suggestions",
    AuthMiddleware.authenticate as any,
    rateLimitFilter,
    getFilterSuggestionsController
);
router.get(
    "/popular",
    AuthMiddleware.authenticate as any,
    rateLimitFilter,
    getPopularFiltersController
);
// router.get(
//     "/filter-count",
//     AuthMiddleware.authenticate as any,
//     rateLimitFilter,
//     getFilterCounts
// );
router.get(
    '/save',
    AuthMiddleware.authenticate as any,
    rateLimitFilter,
    saveSearchQueryController
);
// router.get(
//     '/advancedBoolean',
//     AuthMiddleware.authenticate as any,
//     rateLimitFilter,
//     advancedBooleanSearch
// );


export default router;