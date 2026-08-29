/**
 * src/routes/index.ts
 * Central API Router — mounts all feature routers under /api/v1
 * @version 2.3.0
 */
import { Router, Request, Response } from 'express';
import authRoutes from '@/auth/routes/auth.routes';
import profileRoutes from '@/Profile/routers/index';
import connectionRouter from '@/connections/routes/index';
import companyRouter from '@/company/routers/index';
import { healthCheck as dbHealthCheck } from '@/database/connection';
import CacheUtil from '@/shared/cache.util';

console.log('🔍 routes/index.ts LOADING START');

const router = Router();

router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: 'Thronet API is running',
        version: 'v1',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/api/v1/health',
            auth: '/api/v1/auth',
            profile: '/api/v1/profile',
            connections: '/api/v1/connections',
            follow: '/api/v1/connections/follow',
            mentorship: '/api/v1/mentorship',
            company: '/api/v1/company',
            studyGroup: '/api/v1/study-group',
            messaging: '/api/v1/messaging',
            notifications: '/api/v1/notifications',
            jobService: '/api/v1/job-service',
        },
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

router.use('/auth', authRoutes);
console.log('🔍 AuthRoutes mounted successfully in routes/index.ts');

router.use('/profile', profileRoutes);
console.log('🔍 ProfileRoutes mounted successfully in routes/index.ts');

router.use('/connections', connectionRouter);
console.log('🔍 ConnectionRoutes mounted successfully in routes/index.ts');

import companyRoutes from '@/company/routers';

router.use('/company', companyRoutes);
console.log('🔍 CompanyRoutes mounted successfully in routes/index.ts');

export default router;

console.log('🔍 routes/index.ts LOADING END');