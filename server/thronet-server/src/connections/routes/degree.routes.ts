import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { degreeController } from '../controllers/index';
import degreeValidationSchemas from '../models/schemas/degreeValidationSchemas';
import { validateRequest } from '@/shared/middlewares/connections/validations.middleware';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import { asyncHandler } from '@/shared/handler/catchAsync';
import environmentConfig from '@/config/environment/environment';
import { logger } from '@/shared/logger.util';

const router: Router = Router();

// Rate limiter for degree-related routes
const degreeLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes fallback
    max: environmentConfig.RATE_LIMIT_MAX || 100, // Fallback to 100 requests
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        logger.warn('Degree route rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent'),
            userId: req.user?.userId || 'anonymous'
        });

        const error = new ErrorResponse('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
        res.status(error.statusCode).json(error);
    },
});

// Rate limiter for computationally intensive operations
const intensiveOperationLimiter = rateLimit({
    windowMs: environmentConfig.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes fallback
    max: Math.floor((environmentConfig.RATE_LIMIT_MAX || 100) / 2) || 50, // Fallback to 50
    message: {
        error: 'Too many intensive requests',
        message: 'Intensive operation rate limit exceeded. Please try again later.',
        statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        logger.warn('Intensive operation rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userId: req.user?.userId || 'anonymous'
        });

        const error = new ErrorResponse('Too many intensive requests', HttpStatus.TOO_MANY_REQUESTS);
        res.status(error.statusCode).json(error);
    },
});

// Logging middleware for all routes
router.use('*', (req: Request, _res: Response, next: NextFunction) => {
    logger.info('Degree route accessed', {
        method: req.method,
        path: req.path,
        userId: req.user?.userId || 'anonymous',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    next();
});

// FIXED ROUTES - Removed duplicate "degrees" from path

// 1. Calculate 1st, 2nd, and 3rd degree connections
/**
 * Calculate 1st, 2nd, and 3rd degree connections for a user
 * @route GET /api/degrees/:userId  (CHANGED FROM /degrees/:userId)
 * @access Private
 */
router.get(
    '/:userId',
    degreeLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.calculateConnectionDegrees)
);

// 2. Find shortest path between two users
/**
 * Find shortest path between two users
 * @route GET /api/degrees/paths/:fromUserId/:toUserId
 * @access Private
 */
router.get(
    '/paths/:fromUserId/:toUserId',
    intensiveOperationLimiter,
    validateRequest(degreeValidationSchemas.userPathSchema),
    asyncHandler(degreeController.findShortestPathBetweenUsers)
);

// 3. Get degree of separation count
/**
 * Get degree of separation count for a user
 * @route GET /api/degrees/separation/:userId
 * @access Private
 */
router.get(
    '/separation/:userId',
    degreeLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.getDegreeSeparationCount)
);

// 4. Calculate network reach for a user
/**
 * Calculate network reach for a user
 * @route GET /api/degrees/reach/:userId
 * @access Private
 */
router.get(
    '/reach/:userId',
    intensiveOperationLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.calculateNetworkReach)
);

// 5. Get degree distribution for a user
/**
 * Get degree distribution for a user
 * @route GET /api/degrees/distribution/:userId
 * @access Private
 */
router.get(
    '/distribution/:userId',
    degreeLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.getDegreeDistribution)
);

// 6. Find influential nodes by degree
/**
 * Find influential nodes by degree for a user
 * @route GET /api/degrees/influential/:userId
 * @access Private
 */
router.get(
    '/influential/:userId',
    intensiveOperationLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.findInfluentialNodesByDegree)
);

// 7. Calculate centrality measures
/**
 * Calculate centrality measures for a user
 * @route GET /api/degrees/centrality/:userId
 * @access Private
 */
router.get(
    '/centrality/:userId',
    intensiveOperationLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.calculateCentralityMeasures)
);

// 8. Get average path length for a user
/**
 * Get average path length for a user
 * @route GET /api/degrees/avg-path-length/:userId
 * @access Private
 */
router.get(
    '/avg-path-length/:userId',
    intensiveOperationLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.getAveragePathLength)
);

// 9. Calculate network diameter
/**
 * Calculate network diameter
 * @route GET /api/degrees/diameter
 * @access Private
 */
router.get(
    '/diameter',
    intensiveOperationLimiter,
    asyncHandler(degreeController.calculateNetworkDiameter)
);

// 10. Find bridge connections
/**
 * Find bridge connections for a user
 * @route GET /api/degrees/bridges/:userId
 * @access Private
 */
router.get(
    '/bridges/:userId',
    intensiveOperationLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.findBridgeConnections)
);

// 11. Calculate clustering coefficient
/**
 * Calculate clustering coefficient for a user
 * @route GET /api/degrees/clustering/:userId
 * @access Private
 */
router.get(
    '/clustering/:userId',
    intensiveOperationLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.calculateClusteringCoefficient)
);

// 12. Generate degree analysis report
/**
 * Generate degree analysis report for a user
 * @route GET /api/degrees/report/:userId
 * @access Private
 */
router.get(
    '/report/:userId',
    degreeLimiter,
    validateRequest(degreeValidationSchemas.userIdSchema),
    asyncHandler(degreeController.generateDegreeAnalysisReport)
);

// Error handling for unmatched routes
router.use('*', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const error = new ErrorResponse(
        `Route ${req.method} ${req.path} not found`,
        HttpStatus.NOT_FOUND
    );

    logger.warn('Degree route not found', {
        method: req.method,
        path: req.path,
        userId: req.user?.userId || 'anonymous',
        ip: req.ip
    });

    res.status(error.statusCode).json(error);
}));

export default router;