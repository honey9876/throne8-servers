// /**
//  * ====================================
//  * STUDY GROUP — MAIN ROUTES INDEX
//  * ====================================
//  * Mounts all Study Group feature routers under /api/v1/study-group
//  * @module StudyGroup/routers/index
//  * @version 2.0.0
//  */

import express from 'express';
import rateLimit from 'express-rate-limit';

// // ==================== Core ====================
import groupRoutes from './group.routes';
import memberRoutes from './member.routes';

// ==================== Discovery ====================
import searchRoutes from './search.routes';

// ==================== Collaboration ====================
import chatRoutes from './chat.routes';
import fileRoutes from './file.routes';
import doubtRoutes from './doubt.routes';

// ==================== Productivity ====================
import taskRoutes from './task.routes';
import goalRoutes from './goal.routes';
import timerRoutes from './timer.routes';
import progressRoutes from './progress.routes';
import streakRoutes from './streak.routes';
import attendanceRoutes from './attendance.routes';

// ==================== Gamification ====================
import rankingRoutes from './ranking.routes';
import leaderboardRoutes from './leaderboard.routes';

// ==================== Notifications & Sharing ====================
import notificationRoutes from './notification.routes';
import shareRoutes from './share.routes';

// ==================== Governance ====================
import moderationRoutes from './moderation.routes';
import dashboardRoutes from './dashboard.routes';
import adminRoutes from './admin.routes';

// ==================== Live Sessions ====================
// import liveRoomRoutes from './liveRoom.routes';

// ==================== Assessments ====================
import testRoutes from './test.routes';
// import assignmentRoutes from './assignment.routes';
const router = express.Router();

// ==================== RATE LIMITERS ====================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== API INFO ====================

router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Study Group API',
    version: '1.0.0',
    apiVersion: 'v1',
    documentation: '/api/v1/study-group/docs',
    endpoints: {
      groups: '/groups',
      members: '/groups/:groupId/members',
      search: '/search',
      chat: '/chat',
      files: '/files',
      doubts: '/doubts',
      tasks: '/tasks',
      goals: '/goals',
      timer: '/timer',
      progress: '/progress',
      streak: '/streak',
      attendance: '/attendance',
      ranking: '/ranking',
      leaderboard: '/leaderboard',
      notifications: '/notifications',
      share: '/share',
      moderation: '/moderation',
      dashboard: '/dashboard',
      admin: '/admin',
      liveRooms: '/live-rooms',
      tests: '/tests',
      assignments: '/assignments',
    },
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// ==================== HEALTH CHECK ====================

router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Study Group API is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ==================== ROUTE MOUNTING ====================

router.use('/groups', groupRoutes);
router.use('/member', memberRoutes);
router.use('/search', searchRoutes);
router.use('/chat', chatRoutes);
router.use('/files', fileRoutes);
router.use('/doubts', doubtRoutes);
router.use('/tasks', taskRoutes);
router.use('/goals', goalRoutes);
router.use('/timer', timerRoutes);
router.use('/progress', progressRoutes);
router.use('/streak', streakRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/ranking', rankingRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/share', shareRoutes);
router.use('/moderation', moderationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', apiLimiter, adminRoutes);
// router.use('/live-rooms', liveRoomRoutes);
router.use('/tests', testRoutes);
// router.use('/assignments', assignmentRoutes);

// ==================== 404 HANDLER ====================
// Must remain the LAST router.use() in this file.

router.use((_req, res) => {
  res.status(404).json({
    success: false,  
    statusCode: 404,
    message: 'Route not found',
    error: 'The requested endpoint does not exist',
    availableEndpoints: '/api/v1/study-group',
  });
});

export default router;

