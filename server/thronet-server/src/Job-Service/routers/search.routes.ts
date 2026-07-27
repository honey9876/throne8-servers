import express from 'express';
const router = express.Router();
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { advancedJobSearchController, bulkSearchJobsController, getAutoCompleteSuggestionsController, getOfflineJobsController, getRecentlyViewedJobsController, getSearchSuggestionsController, getTrendingSearchesController } from '@/Job-Service/controllers';
import { rateLimitSearch } from '@/shared/middlewares';

//  import { rateLimitSearch

router.get(
    '/advanced',
    AuthMiddleware.authenticate as any,
    rateLimitSearch,
    advancedJobSearchController
);

router.get(
    "/auto-complete",
    AuthMiddleware.authenticate as any,
    rateLimitSearch,
    getAutoCompleteSuggestionsController
);

router.get(
    "/suggestions",
    AuthMiddleware.authenticate as any,
    rateLimitSearch,
    getSearchSuggestionsController
);

router.get(
    "/trending",
    AuthMiddleware.authenticate as any,
    rateLimitSearch,
    getTrendingSearchesController
);

router.get(
    "/bulk-search",
    AuthMiddleware.authenticate as any,
    rateLimitSearch,
    bulkSearchJobsController
);

router.get(
    "/recently-viewed",
    AuthMiddleware.authenticate as any,
    rateLimitSearch,
    getRecentlyViewedJobsController
);

router.get(
    "/offline-job",
    AuthMiddleware.authenticate as any,
    rateLimitSearch,
    getOfflineJobsController
);

export default router;
