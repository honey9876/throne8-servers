import express from 'express';
// import { requirePremium } from '@/middlewares/job-service/require.premium'; // Updated path
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { checkPremiumAccessController, getTipsController, getCreditsController, sendInmailController, checkLimitController, getFeaturesController, checkInmailController, generatePrepController, getAnalyticsController, getBenchmarkController, getQuestionsController, refillCreditsController, getCompetitionController, updateProgressController, analyzeCompetitionController, getApplicantInsightsController } from '@/Job-Service/controllers';

const router = express.Router();

// Premium Basics
router.get(
    '/access',
     AuthMiddleware.authenticate as any,
      checkPremiumAccessController
    );

router.get(
    '/features',
    AuthMiddleware.authenticate as any,
    getFeaturesController
);

// Applicant Insights
router.get(
    '/insights/:jobId',
     AuthMiddleware.authenticate as any,
    //  requirePremium,
      getApplicantInsightsController
);

router.get(
    '/competition/:jobId',
     AuthMiddleware.authenticate as any,
    //  requirePremium,
      getCompetitionController
);

// Competitive Analysis
router.post(
    '/competition/:jobId',
     AuthMiddleware.authenticate as any,
    //  requirePremium,
      analyzeCompetitionController
    );

router.get(
    '/benchmark',
     AuthMiddleware.authenticate as any,
    //  requirePremium,
      getBenchmarkController
    );

// InMail Credits
router.get(
    '/inmail/credits',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    getCreditsController
);

router.post(
    '/inmail/send',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    sendInmailController
);

router.get(
    '/inmail/can-send',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    checkInmailController
);

router.post(
    '/inmail/refill',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    refillCreditsController
);

// Interview Preparation
router.get(
    '/interview/questions/:jobId',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    getQuestionsController
);

router.post(
    '/interview/prep/:jobId',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    generatePrepController
);

router.post(
    '/interview/progress/:jobId',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    updateProgressController
);

router.get(
    '/interview/tips',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    getTipsController
);

// Utility
router.get(
    '/limit/:feature',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    checkLimitController
);

router.get(
    '/analytics',
    AuthMiddleware.authenticate as any,
    // requirePremium,
    getAnalyticsController
);

export default router;