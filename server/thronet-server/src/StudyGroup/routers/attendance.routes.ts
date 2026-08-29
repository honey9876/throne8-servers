/**
 * ====================================
 * ATTENDANCE ROUTES
 * ====================================
 * Routes for attendance tracking
 */

import { Router } from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import  attendanceController  from '../controllers/attendance.controller';

const router = Router();

/**
 * All routes require authentication
 */
router.use(AuthMiddleware.authenticate as any);

/**
 * @route   POST /api/attendance/check-in
 * @desc    Daily check-in
 * @body    notes?: string
 * @access  Private
 */
router.post('/check-in', attendanceController.dailyCheckIn);

/**
 * @route   PATCH /api/attendance/auto-mark
 * @desc    Auto-mark attendance after study session or task
 * @body    reason: 'study_session' | 'task_completion'
 * @body    studyHours?: number
 * @access  Private
 */
router.patch('/auto-mark', attendanceController.autoMark);

/**
 * @route   GET /api/attendance/percentage
 * @desc    Get attendance percentage (current month + overall)
 * @access  Private
 */
router.get('/percentage', attendanceController.getPercentage);

/**
 * @route   GET /api/attendance/history
 * @desc    Get attendance history
 * @query   page?: number (default: 1)
 * @query   limit?: number (default: 30)
 * @access  Private
 */
router.get('/history', attendanceController.getHistory);

/**
 * @route   GET /api/attendance/calendar
 * @desc    Get calendar view of attendance
 * @query   month?: number (1-12)
 * @query   year?: number
 * @access  Private
 */
router.get('/calendar', attendanceController.getCalendar);

/**
 * @route   GET /api/attendance/status
 * @desc    Get today's attendance status
 * @access  Private
 */
router.get('/status', attendanceController.getStatus);

export default router;