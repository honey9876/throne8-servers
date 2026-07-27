import express from 'express';
import { booleanSearchController, contractJobsController, alumniJobsController, seniorJobsController, networkJobsController, newGradJobsController, startupJobsController, trendingJobsController, fortune500JobsController, noExperienceJobsController, searchSuggestionsController } from '@/Job-Service/controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';


  const router = express.Router();  


router.get(
    '/boolean',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    booleanSearchController
);
  router.get(
    '/network',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    networkJobsController
);
  router.get(
    '/alumni',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    alumniJobsController
);
  router.get(
    '/trending',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    trendingJobsController
);
  router.get(
    '/new-grad',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    newGradJobsController
);
  router.get(
    '/senior',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    seniorJobsController
);
  router.get(
    '/contract-freelance',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    contractJobsController
);
  router.get(
    '/startup',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    startupJobsController
);
  router.get(
    '/fortune500',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    fortune500JobsController
);
  router.get(
    '/no-experience',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    noExperienceJobsController
);
  router.get(
    '/suggestions',
    AuthMiddleware.authenticate as any,
    // createValidationMiddleware,
    searchSuggestionsController
);

//   router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  export default router;