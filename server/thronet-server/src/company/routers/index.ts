console.log('🔍 Company/routers/index.ts LOADING START');



import { Router } from 'express';
import companyRoutes from './company.routes';
import postRoutes from './post.routes';
import employeeRoutes from './employee.routes';
import eventRoutes from './event.routes';
import reviewRoutes from './review.routes';
import analyticsRoutes from './analytics.routes';
// import jobRoutes from './job.routes';
import followerRoutes from './follower.routes';

const router = Router();

// =====================================================
// HEALTH CHECK
// =====================================================
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Company Microservice API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// =====================================================
// API INFO
// =====================================================
router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Company Microservice API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      companies: '/api/companies',
      posts: '/api/posts',
      employees: '/api/employees',
      events: '/api/events',
      jobs: '/api/jobs',
      reviews: '/api/reviews',
      analytics: '/api/analytics',
      followers: '/api/followers',
    },
  });
});

// =====================================================
// MOUNT ALL ROUTES
// =====================================================

// Company Routes
router.use('/companies', companyRoutes);

// Employee Routes
router.use('/employees', employeeRoutes);

// Post Routes
router.use('/posts', postRoutes);

// // Event Routes
router.use('/events', eventRoutes);

// // Job Routes
// router.use('/jobs', jobRoutes);

// // Review Routes
router.use('/reviews', reviewRoutes);

// // Analytics Routes
router.use('/analytics', analyticsRoutes);

// Follower Routes
router.use('/followers', followerRoutes);

// =====================================================
// 404 HANDLER
// =====================================================
// router.use('*', (_req, res) => {
//   res.status(404).json({
//     status: 'error',
//     message: 'Route not found',
//     statusCode: 404,
//     timestamp: new Date().toISOString(),
//   });
// });
console.log('🔍 Company/routers/index.ts LOADING END');

export default router;