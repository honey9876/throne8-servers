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
import coverRoutes from './cover.routes';
import headlineRoutes from './headline.routes';
import educationRoutes from './education.routes';
import experienceRoutes from './experience.routes';
import profilePhotoRoutes from './profilePhoto.routes';
import activityRoutes from './activity/activity.routes';
import skillRoutes from './skill.routes';
import aboutRoutes from './about.routes';
import contactRoutes from './contact.routes';
import analyticsRoutes from './analytics.routes';
import homePostRouter from './activity/homePost.routes';
import reportRoutes from './report.routes';

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
    } catch (error : any) {
        res.status(503).json({
            success: false,
            message: 'Service unavailable',
            timestamp: new Date().toISOString(),
        });
    }
});

// ==================== ROUTE MOUNTING ====================

/**
 * Banner/Cover Routes
 * Mounted at: /api/v1/cover
 */
router.use('/cover', coverRoutes);
router.use('/headlines', headlineRoutes);
router.use('/contact', contactRoutes);
router.use('/profile-photo', profilePhotoRoutes);
router.use('/education', educationRoutes);
router.use('/experience', experienceRoutes);
router.use('/activity', activityRoutes);
router.use('/home-post', homePostRouter);
router.use('/about', aboutRoutes);
router.use('/skills', skillRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reports', reportRoutes);


// ==================== EXPORT ====================

export default router;

console.log('🔍 routes/index.ts LOADING END in profile indexing');