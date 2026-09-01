/**
 * ====================================
 * MAIN ROUTES INDEX - ALL API ROUTES (COMPLETE & FIXED)
 * ====================================
 */

import express from 'express';
import rateLimit from 'express-rate-limit';

// Import all route modules
// import authRoutes from './auth.routes';
import groupRoutes from './group.routes';
import memberRoutes from './member.routes';
import searchRoutes from './search.routes';
import chatRoutes from './chat.routes';
import fileRoutes from './file.routes';
import doubtRoutes from './doubt.routes';
import taskRoutes from './task.routes';
import goalRoutes from './goal.routes';
import timerRoutes from './timer.routes';
import progressRoutes from './progress.routes';
import streakRoutes from './streak.routes';
import attendanceRoutes from './attendance.routes';
import rankingRoutes from './ranking.routes';
import leaderboardRoutes from './leaderboard.routes';
import notificationRoutes from './notification.routes';

// Phase 15 imports
import shareRoutes from './share.routes';
import moderationRoutes from './moderation.routes';
import dashboardRoutes from './dashboard.routes';
import adminRoutes from './admin.routes';

// Live Room System
import liveRoomRoutes from './liveRoom.routes';

// ✅ NEW: Test & Assignment System
import testRoutes from './test.routes';
import assignmentRoutes from './assignment.routes';

const router = express.Router();

/**
 * ============================================
 * RATE LIMITERS
 * ============================================
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * ============================================
 * API VERSION INFO
 * ============================================
 */
router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Study Group API',
    version: '1.0.0',
    apiVersion: 'v1',
    documentation: '/api/v1/docs',
    endpoints: {
      // Phase 2
      auth: '/api/v1/auth',
      
      // Phase 3 & 4
      groups: '/api/v1/groups',
      members: '/api/v1/groups/:groupId/members',
      
      // Phase 5
      search: '/api/v1/search',
      
      // Phase 6
      chat: '/api/v1/chat',
      
      // Phase 8
      files: '/api/v1/files',
      
      // Phase 9
      tasks: '/api/v1/tasks',
      goals: '/api/v1/goals',
      
      // Phase 10
      timer: '/api/v1/timer',
      
      // Phase 11
      progress: '/api/v1/progress',
      streak: '/api/v1/streak',
      attendance: '/api/v1/attendance',
      
      // Phase 12
      ranking: '/api/v1/ranking',
      leaderboard: '/api/v1/leaderboard',
      
      // Phase 13
      notifications: '/api/v1/notifications',
      
      // Phase 14
      doubts: '/api/v1/doubts',
      
      // Phase 15
      share: '/api/v1/share',
      moderation: '/api/v1/moderation',
      dashboard: '/api/v1/dashboard',
      admin: '/api/v1/admin',
      
      // Live Room System
      liveRooms: '/api/v1/live-rooms',
      
      // ✅ NEW: Test & Assignment System
      tests: '/api/v1/tests',
      assignments: '/api/v1/assignments',
    },
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

/**
 * ============================================
 * PHASE 2: AUTHENTICATION ROUTES
 * ============================================
 */
// router.use('/auth/login', authLimiter);
// router.use('/auth/register', authLimiter);
// // router.use('/auth', authRoutes);

/**
 * ============================================
 * PHASE 3: GROUP MANAGEMENT ROUTES
 * ============================================
 */
router.use('/groups', groupRoutes);

/**
 * ============================================
 * PHASE 4: MEMBER MANAGEMENT ROUTES
 * ============================================
 */
router.use('/member', memberRoutes); // Uses /groups/:groupId/members pattern

/**
 * ============================================
 * PHASE 5: SEARCH ROUTES
 * ============================================
 */
router.use('/search', searchRoutes);

/**
 * ============================================
 * PHASE 6 & 7: CHAT ROUTES
 * ============================================
 */
router.use('/chat', chatRoutes);

/**
 * ============================================
 * PHASE 8: FILE SHARING ROUTES
 * ============================================
 */
router.use('/files', fileRoutes);

/**
 * ============================================
 * PHASE 9: TASK & GOAL MANAGEMENT ROUTES
 * ============================================
 */
router.use('/tasks', taskRoutes);
router.use('/goals', goalRoutes);

/**
 * ============================================
 * PHASE 10: TIMER & STUDY SESSION ROUTES
 * ============================================
 */
router.use('/timer', timerRoutes);

/**
 * ============================================
 * PHASE 11: PROGRESS, STREAK & ATTENDANCE ROUTES
 * ============================================
 */
router.use('/progress', progressRoutes);
router.use('/streak', streakRoutes);
router.use('/attendance', attendanceRoutes);

/**
 * ============================================
 * PHASE 12: RANKING & LEADERBOARD ROUTES
 * ============================================
 */
router.use('/ranking', rankingRoutes);
router.use('/leaderboard', leaderboardRoutes);

/**
 * ============================================
 * PHASE 13: NOTIFICATION ROUTES
 * ============================================
 */
router.use('/notifications', notificationRoutes);

/**
 * ============================================
 * PHASE 14: DOUBT SYSTEM ROUTES
 * ============================================
 */
router.use('/doubts', doubtRoutes);

/**
 * ============================================
 * PHASE 15: ADVANCED FEATURES ROUTES
 * ============================================
 */

// Sharing & QR Code
router.use('/share', shareRoutes);

// Moderation & Group Management
router.use('/moderation', moderationRoutes);

// Dashboard & Analytics
router.use('/dashboard', dashboardRoutes);

// Admin Panel
router.use('/admin', apiLimiter, adminRoutes); // Admin routes have rate limiting

/**
 * ============================================
 * LIVE ROOM SYSTEM ROUTES
 * ============================================
 */
router.use('/live-rooms', liveRoomRoutes);

/**
 * ============================================
 * TEST & ASSIGNMENT SYSTEM ROUTES (NEW)
 * ============================================
 */
router.use('/tests', testRoutes);
router.use('/assignments', assignmentRoutes);

/**
 * ============================================
 * API HEALTH CHECK
 * ============================================
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB',
    },
  });
});

/**
 * ============================================
 * 404 HANDLER - Route Not Found
 * ============================================
 */
router.use((_req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: 'Route not found',
    error: 'The requested endpoint does not exist',
    availableEndpoints: '/api/v1',
  });
});

export default router;