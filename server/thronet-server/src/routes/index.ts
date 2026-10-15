/**
 * src/routes/index.ts
 * Central API Router — saare feature routers yahin se /api/v1 ke neeche mount hote hain.
 * Disabled modules load hi nahi hote (memory + startup time bachta hai).
 * @version 3.0.0
 */
import { Router, Request, Response } from 'express';
import authRoutes from '@/auth/routes/auth.routes';
import verifyRoutes from '@/auth/routes/index';
import profileRoutes from '@/Profile/routers/index';
import mentorshipRoutes from '@/Mentorship/routers/index';
import notificationRoutes from '@/notifications/routes/notification.routes';

import { healthCheck as dbHealthCheck } from '@/database/connection';
import CacheUtil from '@/shared/cache.util';
import { LoggerUtil } from '@/shared/logger.util';
import { FEATURES, FeatureName, enabledFeatures } from '@/config/features';

const router = Router();

// ==================== HELPERS ====================

const resolveRouter = (mod: any): Router => mod?.default ?? mod;

const featureDisabled = (feature: FeatureName) => (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    status: 'error',
    message: 'This feature is not available yet',
    code: 'FEATURE_DISABLED',
    feature,
  });
};

/**
 * Optional module mount. Feature off ho toh module require hi nahi hota,
 * aur us path pe clean FEATURE_DISABLED response milta hai.
 */
function mountOptional(path: string, feature: FeatureName, loader: () => unknown): void {
  if (!FEATURES[feature]) {
    router.use(path, featureDisabled(feature));
    LoggerUtil.info(`Route ${path} disabled (feature: ${feature})`);
    return;
  }
  router.use(path, resolveRouter(loader()));
  LoggerUtil.info(`Route ${path} mounted (feature: ${feature})`);
}

// ==================== ROOT + HEALTH ====================

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Thronet API is running',
    version: 'v1',
    timestamp: new Date().toISOString(),
    features: enabledFeatures(),
  });
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [dbAlive, cacheAlive] = await Promise.all([
      dbHealthCheck().catch(() => false),
      CacheUtil.healthCheck?.().catch(() => false) ?? Promise.resolve(false),
    ]);
    const allHealthy = dbAlive;
    const payload = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env['NODE_ENV'] ?? 'development',
      version: process.env['APP_VERSION'] ?? '1.0.0',
      services: {
        database: dbAlive ? 'operational' : 'unavailable',
        cache: cacheAlive ? 'operational' : 'degraded',
      },
    };
    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      data: payload,
    });
  } catch {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// ==================== CORE (always on) ====================

router.use('/auth', authRoutes);
router.use('/verify', verifyRoutes);
router.use('/profile', profileRoutes);
router.use('/mentorship', mentorshipRoutes);
router.use('/notifications', notificationRoutes);

// ==================== OPTIONAL (feature flags) ====================
/* eslint-disable @typescript-eslint/no-var-requires */

mountOptional('/connections', 'connections', () => require('../connections/routes/index'));
mountOptional('/company', 'company', () => require('../company/routers'));
mountOptional('/messaging', 'messaging', () => require('../message/routes/message.routes'));
mountOptional('/study-group', 'studyGroup', () => require('../StudyGroup/routers'));
mountOptional('/job-service', 'jobService', () => require('../Job-Service/routers'));

/* eslint-enable @typescript-eslint/no-var-requires */

LoggerUtil.info('API routes ready', { enabledFeatures: enabledFeatures() });

export default router;