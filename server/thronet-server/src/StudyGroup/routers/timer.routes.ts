/**
 * ====================================
 * TIMER & STUDY SESSION ROUTES
 * ====================================
 */

import express from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import  timerController from '../controllers/timer.controller';

const router = express.Router();

// ==========================================
// TIMER CONTROL ROUTES
// ==========================================

/**
 * @route   POST /api/v1/timer/start
 * @desc    Start a new timer/study session
 * @access  Private
 */
router.post('/start', 
    AuthMiddleware.authenticate as any,
     timerController.startTimer
    );

/**
 * @route   PATCH /api/v1/timer/pause
 * @desc    Pause active timer
 * @access  Private
 */
router.patch('/pause', 
    AuthMiddleware.authenticate as any,
     timerController.pauseTimer
    );

/**
 * @route   PATCH /api/v1/timer/resume
 * @desc    Resume paused timer
 * @access  Private
 */
router.patch('/resume', 
    AuthMiddleware.authenticate as any,
     timerController.resumeTimer
    );

/**
 * @route   PATCH /api/v1/timer/stop
 * @desc    Stop timer and save session
 * @access  Private
 */
router.patch('/stop', 
    AuthMiddleware.authenticate as any,
     timerController.stopTimer
    );

/**
 * @route   DELETE /api/v1/timer/cancel
 * @desc    Cancel timer without saving
 * @access  Private
 */
router.delete('/cancel', 
    AuthMiddleware.authenticate as any,
     timerController.cancelTimer
    );

/**
 * @route   GET /api/v1/timer/active
 * @desc    Get active timer
 * @access  Private
 */
router.get('/active', 
    AuthMiddleware.authenticate as any,
     timerController.getActiveTimer
    );

// ==========================================
// SESSION MANAGEMENT ROUTES
// ==========================================

/**
 * @route   GET /api/v1/sessions
 * @desc    Get all study sessions
 * @access  Private
 */
router.get('/', 
    AuthMiddleware.authenticate as any,
     timerController.getAllSessions
    );

/**
 * @route   GET /api/v1/sessions/stats
 * @desc    Get session statistics
 * @access  Private
 */
router.get('/stats', 
    AuthMiddleware.authenticate as any,
     timerController.getSessionStats
    );

/**
 * @route   GET /api/v1/sessions/today
 * @desc    Get today's sessions
 * @access  Private
 */
router.get('/today', 
    AuthMiddleware.authenticate as any,
     timerController.getTodaySessions
    );

/**
 * @route   GET /api/v1/sessions/:sessionId
 * @desc    Get session by ID
 * @access  Private
 */
router.get('/:sessionId', 
    AuthMiddleware.authenticate as any,
     timerController.getSessionById
    );

/**
 * @route   DELETE /api/v1/sessions/:sessionId
 * @desc    Delete a session
 * @access  Private
 */
router.delete('/:sessionId', 
    AuthMiddleware.authenticate as any,
     timerController.deleteSession
    );

export default router;