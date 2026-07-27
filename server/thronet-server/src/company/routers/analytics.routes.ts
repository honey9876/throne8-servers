import { Router } from 'express';
import { companyAnalyticsController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { analyticsValidators } from '../validations/company.validation';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';
import { resolvePostUUID } from '../middlewares/resolvePostId.middleware';

const router = Router();

// ── NO /:id routes ──
router.post('/track',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateJoi(analyticsValidators.track),
  companyAnalyticsController.trackEvent as any
);

router.get('/dashboard',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(analyticsValidators.dashboardQuery),
  companyAnalyticsController.getDashboard as any
);

router.get('/engagement',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(analyticsValidators.engagementQuery),
  companyAnalyticsController.getEngagementMetrics as any
);

router.get('/trends',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(analyticsValidators.trendsQuery),
  companyAnalyticsController.getTrends as any
);

router.get('/top-posts',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(analyticsValidators.topPostsQuery),
  companyAnalyticsController.getTopPosts as any
);

router.get('/top-companies',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(analyticsValidators.topCompaniesQuery),
  companyAnalyticsController.getTopCompanies as any
);

router.get('/export',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(analyticsValidators.exportQuery),
  companyAnalyticsController.exportAnalytics as any
);

// ── /posts/:id — resolvePostUUID lagao ──
router.get('/posts/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(analyticsValidators.postId),
  resolvePostUUID,
  companyAnalyticsController.getPostAnalytics as any
);

// ── /company/:id routes — resolveCompanyUUID lagao ──
router.get('/company/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(analyticsValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(analyticsValidators.dateRange),
  companyAnalyticsController.getCompanyAnalytics as any
);

router.get('/company/:id/daily',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(analyticsValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(analyticsValidators.daysQuery),
  companyAnalyticsController.getDailyStats as any
);

router.get('/company/:id/weekly',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(analyticsValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(analyticsValidators.weeksQuery),
  companyAnalyticsController.getWeeklyStats as any
);

router.get('/company/:id/monthly',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(analyticsValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(analyticsValidators.monthsQuery),
  companyAnalyticsController.getMonthlyStats as any
);

router.get('/company/:id/yearly',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(analyticsValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(analyticsValidators.yearQuery),
  companyAnalyticsController.getYearlyStats as any
);

router.post('/track-user',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateJoi(analyticsValidators.trackUser),
  companyAnalyticsController.trackUserEvent as any
);

router.get('/dashboard-v2',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(analyticsValidators.dashboardV2Query),
  companyAnalyticsController.getDashboardV2 as any
);

export default router;