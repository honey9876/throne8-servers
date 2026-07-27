// src/routes/networkRoutes.ts
import { Router } from 'express';

import { networkControllers } from '../controllers/index';
import networkValidator from '../validators/networkValidator';
import { defaultRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateRequest } from '@/shared/middlewares/connections/validations.middleware';

const router: Router = Router();

// Apply common middleware
// router.use(authenticateJWT);
router.use(defaultRateLimiter);

// 1. GET /network/:userId/overview - Get network overview
router.get(
    '/:userId/overview',
    validateRequest(networkValidator.validateGetNetworkOverview),
    networkController.getNetworkOverview
);

// 2. GET /network/:userId/growth - Calculate network growth
router.get(
    '/:userId/growth',
    validateRequest(networkValidator.validateCalculateNetworkGrowth),
    networkController.calculateNetworkGrowth
);

// 3. GET /network/:userId/composition - Analyze network composition
router.get(
    '/:userId/composition',
    validateRequest(networkValidator.validateAnalyzeNetworkComposition),
    networkController.analyzeNetworkComposition
);

// 4. GET /network/:userId/health - Get network health score
router.get(
    '/:userId/health',
    validateRequest(networkValidator.validateGetNetworkHealthScore),
    networkController.getNetworkHealthScore
);

// 5. GET /network/:userId/gaps - Find network gaps
router.get(
    '/:userId/gaps',
    validateRequest(networkValidator.validateFindNetworkGaps),
    networkController.findNetworkGaps
);

// 6. GET /network/:userId/influence - Calculate influence score
router.get(
    '/:userId/influence',
    validateRequest(networkValidator.validateCalculateInfluenceScore),
    networkController.calculateInfluenceScore
);

// 7. GET /network/:userId/recommendations - Get network recommendations
router.get(
    '/:userId/recommendations',
    validateRequest(networkValidator.validateGetNetworkRecommendations),
    networkController.getNetworkRecommendations
);

// 8. GET /network/:userId/quality - Analyze connection quality
router.get(
    '/:userId/quality',
    validateRequest(networkValidator.validateAnalyzeConnectionQuality),
    networkController.analyzeConnectionQuality
);

// 9. GET /network/:userId/trends - Get network trends
router.get(
    '/:userId/trends',
    validateRequest(networkValidator.validateGetNetworkTrends),
    networkController.getNetworkTrends
);

// 10. GET /network/:userId/density - Calculate network density
router.get(
    '/:userId/density',
    validateRequest(networkValidator.validateCalculateNetworkDensity),
    networkController.calculateNetworkDensity
);

// 11. GET /network/:userId/key-connections - Find key connections
router.get(
    '/:userId/key-connections',
    validateRequest(networkValidator.validateFindKeyConnections),
    networkController.findKeyConnections
);

// 12. GET /network/:userId/clusters - Analyze network clusters
router.get(
    '/:userId/clusters',
    validateRequest(networkValidator.validateAnalyzeNetworkClusters),
    networkController.analyzeNetworkClusters
);

// 13. GET /network/:userId/benchmarks - Get network benchmarks
router.get(
    '/:userId/benchmarks',
    validateRequest(networkValidator.validateGetNetworkBenchmarks),
    networkController.getNetworkBenchmarks
);

// 14. GET /network/:userId/prediction - Predict network growth
router.get(
    '/:userId/prediction',
    validateRequest(networkValidator.validatePredictNetworkGrowth),
    networkController.predictNetworkGrowth
);

// 15. GET /network/:userId/patterns - Analyze connection patterns
router.get(
    '/:userId/patterns',
    validateRequest(networkValidator.validateAnalyzeConnectionPatterns),
    networkController.analyzeConnectionPatterns
);

// 16. GET /network/:userId/insights - Get network insights
router.get(
    '/:userId/insights',
    validateRequest(networkValidator.validateGetNetworkInsights),
    networkController.getNetworkInsights
);

// 17. GET /network/:userId/value - Calculate network value
router.get(
    '/:userId/value',
    validateRequest(networkValidator.validateCalculateNetworkValue),
    networkController.calculateNetworkValue
);

// 18. GET /network/:userId/opportunities - Find network opportunities
router.get(
    '/:userId/opportunities',
    validateRequest(networkValidator.validateFindNetworkOpportunities),
    networkController.findNetworkOpportunities
);

// 19. GET /network/:userId/report - Generate network report
router.get(
    '/:userId/report',
    validateRequest(networkValidator.validateGenerateNetworkReport),
    networkController.generateNetworkReport
);

// 20. GET /network/:userId/export - Export network data
router.get(
    '/:userId/export',
    validateRequest(networkValidator.validateExportNetworkData),
    networkController.exportNetworkData
);

export default router;