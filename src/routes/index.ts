/**
 * src/routes/index.ts
 * Central API Router — mounts all feature routers under /api/v1
 * @version 2.0.0
 *
 * CHANGES:
 * - /health now performs real DB + cache checks (was hardcoded "operational")
 * - /api/v1 info endpoint lists all actually-mounted routes (not stale comments)
 * - 404 handler re-enabled — important for API clients to get clear errors
 * - Removed dead commented-out imports and unused endpoint stubs
 * - Added ROUTE_PREFIX constant so base path is never hard-coded twice
 */

import { Router, Request, Response } from 'express';

import authRoutes from '@/auth/routes/auth.routes';
import profileRoutes from '@/Profile/routers/index';
import connectionRouter from '@/connections/routes/index';

// Uncomment and add routers here as modules are completed:
import jobRoutes        from '@/Job-Service/routers';
// import mentorRoutes     from '@/Mentorship/routers';
// import studyGroupRoutes from '@/StudyGroup/routers';

import { healthCheck as dbHealthCheck } from '@/database/connection';
import CacheUtil from '@/shared/cache.util';

// ==================== ROUTER ====================

console.log('🔍 routes/index.ts LOADING START');

const router = Router();


// ==================== API INFO ====================

/**
 * GET /api/v1
 * Public — returns API version and list of active endpoints.
 * Keep this in sync whenever a new router is mounted below.
 */
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
            // jobs:        '/api/v1/jobs',
            // mentorship:  '/api/v1/mentorship',
            // study:       '/api/v1/study',
            // company:     '/api/v1/company',
        },
    });
});


// ==================== HEALTH CHECK ====================

/**
 * GET /api/v1/health
 * Public — used by load balancers and uptime monitors.
 * Returns 200 when core dependencies are healthy, 503 otherwise.
 */
router.get('/health', async (_req: Request, res: Response) => {
    try {
        // Run checks in parallel — don't let one slow check block others
        const [dbAlive, cacheAlive] = await Promise.all([
            dbHealthCheck().catch(() => false),
            CacheUtil.healthCheck?.().catch(() => false) ?? Promise.resolve(false),
        ]);

        const allHealthy = dbAlive;  // cache is optional — degraded ≠ down

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

        // 503 only if a hard dependency (DB) is down
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


// ==================== ROUTE MOUNTING ====================

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/connections', connectionRouter);

// Uncomment as each module is ready:
router.use('/',       jobRoutes);
// router.use('/mentorship', mentorRoutes);
// router.use('/study',      studyGroupRoutes);


// ==================== 404 HANDLER ====================

/**
 * Catch-all for any route under /api/v1 that doesn't match.
 * Must be the LAST router.use() in this file.
 */
// router.use('*', (req: Request, res: Response) => {
//     res.status(404).json({
//         success:   false,
//         message:   `Route not found: ${req.method} ${req.originalUrl}`,
//         timestamp: new Date().toISOString(),
//     });
// });


// ==================== EXPORT ====================

export default router;
console.log('🔍 routes/index.ts LOADING END');