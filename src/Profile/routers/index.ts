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

// ==================== EXPORT ====================

export default router;

// now mere liye mern me ek api create karke do jisme ye yaha par experience sections ke liye api create karni hai and yaha par mujhe experience ke liye kuchh features hain jisko mai aapko mera code deta hun to aap batana ki mere existing code me kuchh update to nahi karna hai aap poori fiels ko update mat karna only changes batana and meri experience ke liye new fiels generate karke dena like models, services, controllers, routes and other validations and other fiels for your sugestions and yaha par abhi ham only crud (getbyid and getall) + archived + restore api create karnege
// yaha par uuid form me genrate kar rahe honge and here is my experience features and my existing code jiske acroding same format me apko ye api create karna hai
//  
// my experience features->

// 1. create Experience

// 2. Current Positions(like Founder, Co-Founder, Backend Engineer etc..)

// 3. Descriptions(15 to 20 words me)

// 4. start date

// 5. end date if completed (if (currently work is true) currently working now not required end date)

// 6. Add key ahivements (like 1. Built AI platform, 2. Scaled to 50k users etc..)

//  
// now create its api and you make its only these features like =>

// 1. create,

// 2. get all,

// 3. get by id(uuid form same as my code),

// 4. update,

// 5. delete soft and permanently in db,

// 6. archived,

// 7. restore

//  
// now give me these all files for experience

// 1. models

// 2. services

// 3. controllers,

// 4. routes,

// 5. validations,

// 6. other for your suggestions