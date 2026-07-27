// FILE 2: src/routes/health.routes.ts (UPDATED)
// =====================================================
import { Router } from 'express';
import {
  healthCheck,
  detailedHealthCheck,
  readinessCheck,
  livenessCheck,
  dependenciesCheck,
} from '@/company/controllers/health.controller';

const router = Router();

/**
 * @route   GET /health
 * @desc    Simple health check (fast)
 * @access  Public
 */
router.get('/', healthCheck);

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with all services
 * @access  Public
 */
router.get('/detailed', detailedHealthCheck);

/**
 * @route   GET /health/ready
 * @desc    Kubernetes readiness probe
 * @access  Public
 */
router.get('/ready', readinessCheck);

/**
 * @route   GET /health/live
 * @desc    Kubernetes liveness probe
 * @access  Public
 */
router.get('/live', livenessCheck);

/**
 * @route   GET /health/dependencies
 * @desc    Check all external dependencies status
 * @access  Public
 */
router.get('/dependencies', dependenciesCheck);

export default router;