console.log('🔍 Verifications routes loading started in routes/index.ts');
/**
 * Centralized Route Management
 * 
 * This file exports all application routes and provides
 * a main router for mounting in the Express app
 * 
 * @module routes/index
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import emailVerificationRoutes from './emailVerification.routes';
// import phoneRoutes from './phone.routes';
// import identityVerificationRoutes from './identity.routes';
// import passwordRoutes from './password.routes';
// import coverRoutes from './profile/cover.routes';


// ==================== MAIN ROUTER ====================

const router = Router();

// ==================== API INFO ====================

/**
 * @route   GET /api/v1
 * @desc    API Info & Health Check
 * @access  Public
 */
router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: 'API is running',
        version: 'v1',
        timestamp: new Date().toISOString(),
        endpoints: {
            banners: '/api/v1/cover',
            // Add other endpoints here
            // auth: '/api/v1/auth',
            // users: '/api/v1/users',
            // profile: '/api/v1/profile',
        },
    });
});

// ==================== HEALTH CHECK ====================

/**
 * @route   GET /api/v1/health
 * @desc    Detailed Health Check
 * @access  Public
 */
router.get('/health', async (_req: Request, res: Response) => {
    try {
        // You can add database, cache, and other service checks here
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            services: {
                api: 'operational',
                // database: 'operational',
                // cache: 'operational',
                // storage: 'operational',
            },
        };

        res.status(200).json({
            success: true,
            data: healthStatus,
        });
    } catch (error: any) {
        res.status(503).json({
            success: false,
            message: 'Service unavailable',
            timestamp: new Date().toISOString(),
        });
    }
});

// ==================== ROUTE MOUNTING ====================

console.log("here is mounting all verify routes .......")

router.use('/email', emailVerificationRoutes);
console.log("email route mouted............")

// router.use('/phone', phoneRoutes);
// console.log("phone route mouted............")

// router.use('/identity', identityVerificationRoutes);
// console.log("identity route mouted............")

// router.use('/password', passwordRoutes);
// console.log("password route mouted............")

// ==================== 404 HANDLER ====================

/**
 * Handle undefined routes
 */
// router.use('*', (_req: Request, res: Response) => {
//     res.status(404).json({
//         success: false,
//         message: 'Route not found',
//         timestamp: new Date().toISOString(),
//     });
// });

// ==================== EXPORT ====================

export default router;

console.log('🔍 Verifications routes loaded successfully in routes/index.ts');