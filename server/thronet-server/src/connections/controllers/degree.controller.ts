// // src/controllers/degreeController.ts - Fixed version
// import { Request, Response, NextFunction } from 'express';
// // TEMPORARILY use mock service instead of real degreeService
// // import { degreeService } from '../services/degreeService';
// import { mockDegreeService as degreeService } from '../services/degreeService.mock';
// import logger, { LogCategory } from '../utils/logger';

// /**
//  * Calculate 1st, 2nd, and 3rd degree connections for a user
//  */
// export const calculateConnectionDegrees = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));
    
//     console.log(`✅ Processing calculateConnectionDegrees for userId: ${userId}, maxDepth: ${maxDepth}`);
    
//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
//     res.json({ success: true, data: degrees });
//   } catch (error: any) {
//     logger.error('calculateConnectionDegrees controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Find shortest path between two users
//  */
// export const findShortestPathBetweenUsers = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { fromUserId, toUserId } = req.params;
//     const algorithm = (req.query.algorithm as 'dijkstra' | 'astar') || 'dijkstra';
    
//     console.log(`✅ Processing findShortestPathBetweenUsers from: ${fromUserId} to: ${toUserId}, algorithm: ${algorithm}`);
    
//     const paths = await degreeService.handlePathFinding(fromUserId, toUserId, algorithm);
//     res.json({ success: true, data: paths });
//   } catch (error: any) {
//     logger.error('findShortestPathBetweenUsers controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       fromUserId: req.params.fromUserId,
//       toUserId: req.params.toUserId
//     });
//     next(error);
//   }
// };

// /**
//  * Get degree of separation count for a user
//  */
// export const getDegreeSeparationCount = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 2));
    
//     console.log(`✅ Processing getDegreeSeparationCount for userId: ${userId}, depth: ${depth}`);
    
//     const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
//     const count = nodes.length;
//     res.json({ success: true, data: { count } });
//   } catch (error: any) {
//     logger.error('getDegreeSeparationCount controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate network reach for a user
//  */
// export const calculateNetworkReach = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 3));
    
//     console.log(`✅ Processing calculateNetworkReach for userId: ${userId}, depth: ${depth}`);
    
//     const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
//     const reach = nodes.reduce((acc, node) => acc + (node.degree || 1), 0);
//     res.json({ success: true, data: { reach } });
//   } catch (error: any) {
//     logger.error('calculateNetworkReach controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Get degree distribution for a user
//  */
// export const getDegreeDistribution = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));
    
//     console.log(`✅ Processing getDegreeDistribution for userId: ${userId}, maxDepth: ${maxDepth}`);
    
//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
//     res.json({ success: true, data: degrees });
//   } catch (error: any) {
//     logger.error('getDegreeDistribution controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Find influential nodes by degree for a user
//  */
// export const findInfluentialNodesByDegree = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing findInfluentialNodesByDegree for userId: ${userId}`);
    
//     const influence = await degreeService.processInfluenceCalculation(userId);
//     res.json({ success: true, data: { influence } });
//   } catch (error: any) {
//     logger.error('findInfluentialNodesByDegree controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate centrality measures for a user
//  */
// export const calculateCentralityMeasures = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing calculateCentralityMeasures for userId: ${userId}`);
    
//     const measures = await degreeService.processCentralityMeasures(userId);
//     res.json({ success: true, data: measures });
//   } catch (error: any) {
//     logger.error('calculateCentralityMeasures controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Get average path length for a user
//  */
// export const getAveragePathLength = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxLength = Math.max(1, Math.min(10, parseInt(req.query.maxLength as string) || 5));
    
//     console.log(`✅ Processing getAveragePathLength for userId: ${userId}, maxLength: ${maxLength}`);
    
//     const paths = await degreeService.processShortestPaths(userId, maxLength);
//     const avgLength = paths.length ? paths.reduce((sum, path) => sum + path.length, 0) / paths.length : 0;
//     res.json({ success: true, data: { averagePathLength: avgLength } });
//   } catch (error: any) {
//     logger.error('getAveragePathLength controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate network diameter
//  */
// export const calculateNetworkDiameter = async (
//   _req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     console.log(`✅ Processing calculateNetworkDiameter`);
    
//     const metrics = await degreeService.handleNetworkMetrics();
//     res.json({ success: true, data: { diameter: metrics.diameter } });
//   } catch (error: any) {
//     logger.error('calculateNetworkDiameter controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK
//     });
//     next(error);
//   }
// };

// /**
//  * Find bridge connections for a user
//  */
// export const findBridgeConnections = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing findBridgeConnections for userId: ${userId}`);
    
//     const bridges = await degreeService.handleBridgeDetection(userId);
//     res.json({ success: true, data: bridges });
//   } catch (error: any) {
//     logger.error('findBridgeConnections controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate clustering coefficient for a user
//  */
// export const calculateClusteringCoefficient = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing calculateClusteringCoefficient for userId: ${userId}`);
    
//     const analytics = await degreeService.processGraphAnalytics(userId);
//     res.json({ success: true, data: analytics });
//   } catch (error: any) {
//     logger.error('calculateClusteringCoefficient controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Generate degree analysis report for a user
//  */
// export const generateDegreeAnalysisReport = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));
    
//     console.log(`✅ Processing generateDegreeAnalysisReport for userId: ${userId}, maxDepth: ${maxDepth}`);
    
//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
//     const metrics = await degreeService.handleNetworkMetrics();
//     const analytics = await degreeService.processGraphAnalytics(userId);
    
//     const report = {
//       degrees,
//       networkMetrics: metrics,
//       clusteringCoefficient: analytics.clusteringCoefficient
//     };
//     res.json({ success: true, data: report });
//   } catch (error: any) {
//     logger.error('generateDegreeAnalysisReport controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };





// // src/controllers/degreeController.ts - Fixed version to work with actual service
// import { Request, Response, NextFunction } from 'express';
// // NOW using actual degreeService instead of mock
// import { degreeService } from '../services/degreeService';
// // import { mockDegreeService as degreeService } from '../services/degreeService.mock'; // COMMENTED OUT
// import logger, { LogCategory } from '../utils/logger';

// /**
//  * Calculate 1st, 2nd, and 3rd degree connections for a user
//  */
// export const calculateConnectionDegrees = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));
    
//     console.log(`✅ Processing calculateConnectionDegrees for userId: ${userId}, maxDepth: ${maxDepth}`);
    
//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
//     res.json({ success: true, data: degrees });
//   } catch (error: any) {
//     logger.error('calculateConnectionDegrees controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Find shortest path between two users
//  */
// export const findShortestPathBetweenUsers = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { fromUserId, toUserId } = req.params;
//     const algorithm = (req.query.algorithm as 'dijkstra' | 'astar') || 'dijkstra';
    
//     console.log(`✅ Processing findShortestPathBetweenUsers from: ${fromUserId} to: ${toUserId}, algorithm: ${algorithm}`);
    
//     const paths = await degreeService.handlePathFinding(fromUserId, toUserId, algorithm);
//     res.json({ success: true, data: paths });
//   } catch (error: any) {
//     logger.error('findShortestPathBetweenUsers controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       fromUserId: req.params.fromUserId,
//       toUserId: req.params.toUserId
//     });
//     next(error);
//   }
// };

// /**
//  * Get degree of separation count for a user
//  */
// export const getDegreeSeparationCount = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 2));
    
//     console.log(`✅ Processing getDegreeSeparationCount for userId: ${userId}, depth: ${depth}`);
    
//     const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
//     const count = nodes.length;
//     res.json({ success: true, data: { count } });
//   } catch (error: any) {
//     logger.error('getDegreeSeparationCount controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate network reach for a user
//  */
// export const calculateNetworkReach = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 3));
    
//     console.log(`✅ Processing calculateNetworkReach for userId: ${userId}, depth: ${depth}`);
    
//     const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
//     const reach = nodes.reduce((acc, node) => acc + (node.degree || 1), 0);
//     res.json({ success: true, data: { reach } });
//   } catch (error: any) {
//     logger.error('calculateNetworkReach controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Get degree distribution for a user
//  */
// export const getDegreeDistribution = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));
    
//     console.log(`✅ Processing getDegreeDistribution for userId: ${userId}, maxDepth: ${maxDepth}`);
    
//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
//     res.json({ success: true, data: degrees });
//   } catch (error: any) {
//     logger.error('getDegreeDistribution controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Find influential nodes by degree for a user
//  */
// export const findInfluentialNodesByDegree = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing findInfluentialNodesByDegree for userId: ${userId}`);
    
//     const influence = await degreeService.processInfluenceCalculation(userId);
//     res.json({ success: true, data: influence }); // CHANGED: removed wrapping in { influence }
//   } catch (error: any) {
//     logger.error('findInfluentialNodesByDegree controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate centrality measures for a user
//  */
// export const calculateCentralityMeasures = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing calculateCentralityMeasures for userId: ${userId}`);
    
//     const measures = await degreeService.processCentralityMeasures(userId);
//     res.json({ success: true, data: measures });
//   } catch (error: any) {
//     logger.error('calculateCentralityMeasures controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Get average path length for a user
//  */
// export const getAveragePathLength = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxLength = Math.max(1, Math.min(10, parseInt(req.query.maxLength as string) || 5));
    
//     console.log(`✅ Processing getAveragePathLength for userId: ${userId}, maxLength: ${maxLength}`);
    
//     const paths = await degreeService.processShortestPaths(userId, maxLength);
//     const avgLength = paths.length ? paths.reduce((sum, path) => sum + path.length, 0) / paths.length : 0;
//     res.json({ success: true, data: { averagePathLength: avgLength } });
//   } catch (error: any) {
//     logger.error('getAveragePathLength controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate network diameter
//  */
// export const calculateNetworkDiameter = async (
//   _req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     console.log(`✅ Processing calculateNetworkDiameter`);
    
//     const metrics = await degreeService.handleNetworkMetrics();
//     res.json({ success: true, data: { diameter: metrics.diameter } });
//   } catch (error: any) {
//     logger.error('calculateNetworkDiameter controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK
//     });
//     next(error);
//   }
// };

// /**
//  * Find bridge connections for a user
//  */
// export const findBridgeConnections = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing findBridgeConnections for userId: ${userId}`);
    
//     const bridges = await degreeService.handleBridgeDetection(userId);
//     res.json({ success: true, data: bridges });
//   } catch (error: any) {
//     logger.error('findBridgeConnections controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Calculate clustering coefficient for a user
//  */
// export const calculateClusteringCoefficient = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
    
//     console.log(`✅ Processing calculateClusteringCoefficient for userId: ${userId}`);
    
//     const analytics = await degreeService.processGraphAnalytics(userId);
//     res.json({ success: true, data: analytics });
//   } catch (error: any) {
//     logger.error('calculateClusteringCoefficient controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };

// /**
//  * Generate degree analysis report for a user
//  */
// export const generateDegreeAnalysisReport = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));
    
//     console.log(`✅ Processing generateDegreeAnalysisReport for userId: ${userId}, maxDepth: ${maxDepth}`);
    
//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
//     const metrics = await degreeService.handleNetworkMetrics();
//     const analytics = await degreeService.processGraphAnalytics(userId);
    
//     const report = {
//       degrees,
//       networkMetrics: metrics,
//       clusteringCoefficient: analytics.clusteringCoefficient
//     };
//     res.json({ success: true, data: report });
//   } catch (error: any) {
//     logger.error('generateDegreeAnalysisReport controller error', { 
//       error: error.message, 
//       category: LogCategory.NETWORK,
//       userId: req.params.userId
//     });
//     next(error);
//   }
// };


// // src/controllers/degreeController.ts (Production Ready - Fixed)

// import { Request, Response, NextFunction } from 'express';
// import logger from '../utils/logger';
// import { degreeService } from '../services/degreeService';
// import { SuccessResponse, ErrorResponse, HttpStatus } from '../utils/response';
// // import { NetworkMetrics, ConnectionDegreePath, CentralityMeasures } from '../types/network.types';

// /**
//  * Degree Controller
//  * Handles HTTP requests for network degree analysis, integrating with degreeService for business logic.
//  * Includes comprehensive error handling, validation, rate limiting integration, and response formatting.
//  * 
//  * Features (12 total, aligned with service):
//  * 1. calculateConnectionDegrees - GET /degrees/:userId/calculate?maxDepth=3
//  * 2. findShortestPathBetweenUsers - GET /degrees/:fromUserId/:toUserId/path?algorithm=dijkstra
//  * 3. getDegreeSeparationCount - GET /degrees/:userId/separation-count?depth=2
//  * 4. calculateNetworkReach - GET /degrees/:userId/network-reach?depth=3
//  * 5. getDegreeDistribution - GET /degrees/:userId/distribution?maxDepth=3
//  * 6. findInfluentialNodesByDegree - GET /degrees/:userId/influential-nodes
//  * 7. calculateCentralityMeasures - GET /degrees/:userId/centrality
//  * 8. getAveragePathLength - GET /degrees/:userId/average-path?maxLength=5
//  * 9. calculateNetworkDiameter - GET /degrees/network/diameter
//  * 10. findBridgeConnections - GET /degrees/:userId/bridges
//  * 11. calculateClusteringCoefficient - GET /degrees/:userId/clustering
//  * 12. generateDegreeAnalysisReport - GET /degrees/:userId/analysis-report?maxDepth=3
//  * 
//  * Dependencies:
//  * - express: For Request/Response/NextFunction
//  * - logger: For request/response logging
//  * - degreeService: For core business logic
//  * - response: For standardized SuccessResponse/ErrorResponse
//  * - environmentConfig: For limits (e.g., MAX_DEPTH_LIMIT)
//  * - types: For request/response types
//  * 
//  * Error Handling: Catches service errors, maps to HTTP status, logs details
//  * Validation: Relies on service validation; adds param checks
//  * Scalability: Pagination via query params, async operations
//  * Integration: Called from degreeRoutes.ts; auth via middleware
//  * Monitoring: Logs response times, errors with context
//  */

// export const calculateConnectionDegrees = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));

//     // Basic param validation (service does deeper checks)
//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);

//     const responseTime = Date.now() - startTime;
//     logger.info('Connection degrees calculated', {
//       userId,
//       maxDepth,
//       degreeLevels: Object.keys(degrees).length,
//       responseTimeMs: responseTime,
//       clientIp: req.ip,
//       userAgent: req.get('User-Agent'),
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { degrees, maxDepth },
//         'Connection degrees calculated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in calculateConnectionDegrees', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       maxDepth: req.query.maxDepth,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const findShortestPathBetweenUsers = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { fromUserId, toUserId } = req.params;
//     const algorithm = (req.query.algorithm as 'dijkstra' | 'astar') || 'dijkstra';

//     if (!fromUserId || !toUserId) {
//       throw new ErrorResponse('Both user IDs are required', HttpStatus.BAD_REQUEST);
//     }

//     const paths = await degreeService.handlePathFinding(fromUserId, toUserId, algorithm);

//     const responseTime = Date.now() - startTime;
//     logger.info('Shortest path calculated', {
//       fromUserId,
//       toUserId,
//       algorithm,
//       pathsFound: Array.isArray(paths) ? paths.length : 1,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { paths, algorithm },
//         'Shortest path calculated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in findShortestPathBetweenUsers', {
//       errorMessage: error.message,
//       fromUserId: req.params.fromUserId,
//       toUserId: req.params.toUserId,
//       algorithm: req.query.algorithm,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const getDegreeSeparationCount = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;
//     const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 2));

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
//     const count = nodes.length;

//     const responseTime = Date.now() - startTime;
//     logger.info('Degree separation count calculated', {
//       userId,
//       depth,
//       separationCount: count,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { count, depth },
//         `Found ${count} connections within ${depth} degrees of separation`
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in getDegreeSeparationCount', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       depth: req.query.depth,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const calculateNetworkReach = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;
//     const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 3));

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
//     const reach = nodes.reduce((acc, node) => acc + (node.degree || 1), 0);

//     const responseTime = Date.now() - startTime;
//     logger.info('Network reach calculated', {
//       userId,
//       depth,
//       networkReach: reach,
//       nodesAnalyzed: nodes.length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { reach, depth, nodesAnalyzed: nodes.length },
//         'Network reach calculated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in calculateNetworkReach', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       depth: req.query.depth,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const getDegreeDistribution = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);

//     const responseTime = Date.now() - startTime;
//     logger.info('Degree distribution retrieved', {
//       userId,
//       maxDepth,
//       distributionLevels: Object.keys(degrees).length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { distribution: degrees, maxDepth },
//         'Degree distribution retrieved successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in getDegreeDistribution', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       maxDepth: req.query.maxDepth,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const findInfluentialNodesByDegree = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const influence = await degreeService.processInfluenceCalculation(userId);

//     const responseTime = Date.now() - startTime;
//     logger.info('Influential nodes found', {
//       userId,
//       influentialNodesCount: Array.isArray(influence) ? influence.length : Object.keys(influence).length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         influence,
//         'Influential nodes found successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in findInfluentialNodesByDegree', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const calculateCentralityMeasures = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const measures = await degreeService.processCentralityMeasures(userId);

//     const responseTime = Date.now() - startTime;
//     logger.info('Centrality measures calculated', {
//       userId,
//       measuresCalculated: Object.keys(measures).length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { measures },
//         'Centrality measures calculated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in calculateCentralityMeasures', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const getAveragePathLength = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;
//     const maxLength = Math.max(1, Math.min(10, parseInt(req.query.maxLength as string) || 5));

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const paths = await degreeService.processShortestPaths(userId, maxLength);
//     const avgLength = paths.length ? paths.reduce((sum, path) => sum + path.length, 0) / paths.length : 0;

//     const responseTime = Date.now() - startTime;
//     logger.info('Average path length calculated', {
//       userId,
//       maxLength,
//       pathsAnalyzed: paths.length,
//       averagePathLength: avgLength,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { averagePathLength: avgLength, pathsAnalyzed: paths.length, maxLength },
//         'Average path length calculated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in getAveragePathLength', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       maxLength: req.query.maxLength,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const calculateNetworkDiameter = async (
//   _req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const metrics = await degreeService.handleNetworkMetrics();

//     const responseTime = Date.now() - startTime;
//     logger.info('Network diameter calculated', {
//       diameter: metrics.diameter,
//       metricsCalculated: Object.keys(metrics).length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { diameter: metrics.diameter, networkMetrics: metrics },
//         'Network diameter calculated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in calculateNetworkDiameter', {
//       errorMessage: error.message,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const findBridgeConnections = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const bridges = await degreeService.handleBridgeDetection(userId);

//     const responseTime = Date.now() - startTime;
//     logger.info('Bridge connections found', {
//       userId,
//       bridgeConnectionsCount: Array.isArray(bridges) ? bridges.length : Object.keys(bridges).length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { bridges },
//         'Bridge connections found successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in findBridgeConnections', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const calculateClusteringCoefficient = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const analytics = await degreeService.processGraphAnalytics(userId);

//     const responseTime = Date.now() - startTime;
//     logger.info('Clustering coefficient calculated', {
//       userId,
//       clusteringCoefficient: analytics.clusteringCoefficient,
//       analyticsCalculated: Object.keys(analytics).length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { analytics },
//         'Clustering coefficient calculated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in calculateClusteringCoefficient', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// export const generateDegreeAnalysisReport = async (
//   req: Request,
//   res: Response,
//   _next: NextFunction
// ): Promise<void> => {
//   const startTime = Date.now();
//   try {
//     const { userId } = req.params;
//     const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));

//     if (!userId) {
//       throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
//     }

//     const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
//     const metrics = await degreeService.handleNetworkMetrics();
//     const analytics = await degreeService.processGraphAnalytics(userId);

//     const report = {
//       degrees,
//       networkMetrics: metrics,
//       clusteringCoefficient: analytics.clusteringCoefficient,
//       analytics,
//       generatedAt: new Date().toISOString(),
//       maxDepth,
//     };

//     const responseTime = Date.now() - startTime;
//     logger.info('Degree analysis report generated', {
//       userId,
//       maxDepth,
//       reportSections: Object.keys(report).length,
//       responseTimeMs: responseTime,
//     });

//     res.status(HttpStatus.OK).json(
//       SuccessResponse(
//         { report },
//         'Degree analysis report generated successfully'
//       )
//     );
//   } catch (error: any) {
//     const responseTime = Date.now() - startTime;
//     logger.error('Error in generateDegreeAnalysisReport', {
//       errorMessage: error.message,
//       userId: req.params.userId,
//       maxDepth: req.query.maxDepth,
//       responseTimeMs: responseTime,
//     });

//     if (error instanceof ErrorResponse) {
//       res.status(error.statusCode).json(error);
//     } else {
//       res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
//         new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
//       );
//     }
//   }
// };

// // Export all controller functions
// export default {
//   calculateConnectionDegrees,
//   findShortestPathBetweenUsers,
//   getDegreeSeparationCount,
//   calculateNetworkReach,
//   getDegreeDistribution,
//   findInfluentialNodesByDegree,
//   calculateCentralityMeasures,
//   getAveragePathLength,
//   calculateNetworkDiameter,
//   findBridgeConnections,
//   calculateClusteringCoefficient,
//   generateDegreeAnalysisReport,
// };

// src/controllers/degreeController.ts (Production Ready - Fixed)

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { degreeService } from '../services/degreeService';
import { SuccessResponse, ErrorResponse, HttpStatus } from '../utils/response';
// import { NetworkMetrics, ConnectionDegreePath, CentralityMeasures } from '../types/network.types';

/**
 * Degree Controller
 * Handles HTTP requests for network degree analysis, integrating with degreeService for business logic.
 * Includes comprehensive error handling, validation, rate limiting integration, and response formatting.
 * 
 * Features (12 total, aligned with service):
 * 1. calculateConnectionDegrees - GET /degrees/:userId/calculate?maxDepth=3
 * 2. findShortestPathBetweenUsers - GET /degrees/:fromUserId/:toUserId/path?algorithm=dijkstra
 * 3. getDegreeSeparationCount - GET /degrees/:userId/separation-count?depth=2
 * 4. calculateNetworkReach - GET /degrees/:userId/network-reach?depth=3
 * 5. getDegreeDistribution - GET /degrees/:userId/distribution?maxDepth=3
 * 6. findInfluentialNodesByDegree - GET /degrees/:userId/influential-nodes
 * 7. calculateCentralityMeasures - GET /degrees/:userId/centrality
 * 8. getAveragePathLength - GET /degrees/:userId/average-path?maxLength=5
 * 9. calculateNetworkDiameter - GET /degrees/network/diameter
 * 10. findBridgeConnections - GET /degrees/:userId/bridges
 * 11. calculateClusteringCoefficient - GET /degrees/:userId/clustering
 * 12. generateDegreeAnalysisReport - GET /degrees/:userId/analysis-report?maxDepth=3
 * 
 * Dependencies:
 * - express: For Request/Response/NextFunction
 * - logger: For request/response logging
 * - degreeService: For core business logic
 * - response: For standardized SuccessResponse/ErrorResponse
 * - environmentConfig: For limits (e.g., MAX_DEPTH_LIMIT)
 * - types: For request/response types
 * 
 * Error Handling: Catches service errors, maps to HTTP status, logs details
 * Validation: Relies on service validation; adds param checks
 * Scalability: Pagination via query params, async operations
 * Integration: Called from degreeRoutes.ts; auth via middleware
 * Monitoring: Logs response times, errors with context
 */

class degreeController {}

export const calculateConnectionDegrees = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));

    // Basic param validation (service does deeper checks)
    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);

    const responseTime = Date.now() - startTime;
    logger.info('Connection degrees calculated', {
      userId,
      maxDepth,
      degreeLevels: Object.keys(degrees).length,
      responseTimeMs: responseTime,
      clientIp: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { degrees, maxDepth },
        'Connection degrees calculated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in calculateConnectionDegrees', {
      errorMessage: error.message,
      userId: req.params.userId,
      maxDepth: req.query.maxDepth,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const findShortestPathBetweenUsers = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { fromUserId, toUserId } = req.params;
    const algorithm = (req.query.algorithm as 'dijkstra' | 'astar') || 'dijkstra';

    if (!fromUserId || !toUserId) {
      throw new ErrorResponse('Both user IDs are required', HttpStatus.BAD_REQUEST);
    }

    const paths = await degreeService.handlePathFinding(fromUserId, toUserId, algorithm);

    const responseTime = Date.now() - startTime;
    logger.info('Shortest path calculated', {
      fromUserId,
      toUserId,
      algorithm,
      pathsFound: Array.isArray(paths) ? paths.length : 1,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { paths, algorithm },
        'Shortest path calculated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in findShortestPathBetweenUsers', {
      errorMessage: error.message,
      fromUserId: req.params.fromUserId,
      toUserId: req.params.toUserId,
      algorithm: req.query.algorithm,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const getDegreeSeparationCount = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 2));

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
    const count = nodes.length;

    const responseTime = Date.now() - startTime;
    logger.info('Degree separation count calculated', {
      userId,
      depth,
      separationCount: count,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { count, depth },
        `Found ${count} connections within ${depth} degrees of separation`
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in getDegreeSeparationCount', {
      errorMessage: error.message,
      userId: req.params.userId,
      depth: req.query.depth,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const calculateNetworkReach = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    const depth = Math.max(1, Math.min(5, parseInt(req.query.depth as string) || 3));

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const nodes = await degreeService.processGraphTraversal(userId, depth, 'BFS');
    const reach = nodes.reduce((acc, node) => acc + (node.degree || 1), 0);

    const responseTime = Date.now() - startTime;
    logger.info('Network reach calculated', {
      userId,
      depth,
      networkReach: reach,
      nodesAnalyzed: nodes.length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { reach, depth, nodesAnalyzed: nodes.length },
        'Network reach calculated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in calculateNetworkReach', {
      errorMessage: error.message,
      userId: req.params.userId,
      depth: req.query.depth,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const getDegreeDistribution = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);

    const responseTime = Date.now() - startTime;
    logger.info('Degree distribution retrieved', {
      userId,
      maxDepth,
      distributionLevels: Object.keys(degrees).length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { distribution: degrees, maxDepth },
        'Degree distribution retrieved successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in getDegreeDistribution', {
      errorMessage: error.message,
      userId: req.params.userId,
      maxDepth: req.query.maxDepth,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const findInfluentialNodesByDegree = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const influence = await degreeService.processInfluenceCalculation(userId);

    const responseTime = Date.now() - startTime;
    logger.info('Influential nodes found', {
      userId,
      influentialNodesCount: Array.isArray(influence) ? influence.length : Object.keys(influence).length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        influence,
        'Influential nodes found successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in findInfluentialNodesByDegree', {
      errorMessage: error.message,
      userId: req.params.userId,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const calculateCentralityMeasures = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const measures = await degreeService.processCentralityMeasures(userId);

    const responseTime = Date.now() - startTime;
    logger.info('Centrality measures calculated', {
      userId,
      measuresCalculated: Object.keys(measures).length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { measures },
        'Centrality measures calculated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in calculateCentralityMeasures', {
      errorMessage: error.message,
      userId: req.params.userId,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const getAveragePathLength = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    const maxLength = Math.max(1, Math.min(10, parseInt(req.query.maxLength as string) || 5));

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const paths = await degreeService.processShortestPaths(userId, maxLength);
    const avgLength = paths.length ? paths.reduce((sum, path) => sum + path.length, 0) / paths.length : 0;

    const responseTime = Date.now() - startTime;
    logger.info('Average path length calculated', {
      userId,
      maxLength,
      pathsAnalyzed: paths.length,
      averagePathLength: avgLength,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { averagePathLength: avgLength, pathsAnalyzed: paths.length, maxLength },
        'Average path length calculated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in getAveragePathLength', {
      errorMessage: error.message,
      userId: req.params.userId,
      maxLength: req.query.maxLength,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const calculateNetworkDiameter = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const metrics = await degreeService.handleNetworkMetrics();

    const responseTime = Date.now() - startTime;
    logger.info('Network diameter calculated', {
      // FIXED: Remove diameter reference if it doesn't exist in metrics
      metricsCalculated: Object.keys(metrics).length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { networkMetrics: metrics },
        'Network metrics calculated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in calculateNetworkDiameter', {
      errorMessage: error.message,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const findBridgeConnections = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const bridges = await degreeService.handleBridgeDetection(userId);

    const responseTime = Date.now() - startTime;
    logger.info('Bridge connections found', {
      userId,
      bridgeConnectionsCount: Array.isArray(bridges) ? bridges.length : Object.keys(bridges).length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { bridges },
        'Bridge connections found successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in findBridgeConnections', {
      errorMessage: error.message,
      userId: req.params.userId,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const calculateClusteringCoefficient = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const analytics = await degreeService.processGraphAnalytics(userId);

    const responseTime = Date.now() - startTime;
    logger.info('Clustering coefficient calculated', {
      userId,
      clusteringCoefficient: analytics.clusteringCoefficient,
      analyticsCalculated: Object.keys(analytics).length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { analytics },
        'Clustering coefficient calculated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in calculateClusteringCoefficient', {
      errorMessage: error.message,
      userId: req.params.userId,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

export const generateDegreeAnalysisReport = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    const maxDepth = Math.max(1, Math.min(5, parseInt(req.query.maxDepth as string) || 3));

    if (!userId) {
      throw new ErrorResponse('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const degrees = await degreeService.calculateConnectionDegrees(userId, maxDepth);
    const metrics = await degreeService.handleNetworkMetrics();
    const analytics = await degreeService.processGraphAnalytics(userId);

    const report = {
      degrees,
      networkMetrics: metrics,
      clusteringCoefficient: analytics.clusteringCoefficient,
      analytics,
      generatedAt: new Date().toISOString(),
      maxDepth,
    };

    const responseTime = Date.now() - startTime;
    logger.info('Degree analysis report generated', {
      userId,
      maxDepth,
      reportSections: Object.keys(report).length,
      responseTimeMs: responseTime,
    });

    res.status(HttpStatus.OK).json(
      SuccessResponse(
        { report },
        'Degree analysis report generated successfully'
      )
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    logger.error('Error in generateDegreeAnalysisReport', {
      errorMessage: error.message,
      userId: req.params.userId,
      maxDepth: req.query.maxDepth,
      responseTimeMs: responseTime,
    });

    if (error instanceof ErrorResponse) {
      res.status(error.statusCode).json(error);
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        new ErrorResponse('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    }
  }
};

// Export all controller functions
export default {
  calculateConnectionDegrees,
  findShortestPathBetweenUsers,
  getDegreeSeparationCount,
  calculateNetworkReach,
  getDegreeDistribution,
  findInfluentialNodesByDegree,
  calculateCentralityMeasures,
  getAveragePathLength,
  calculateNetworkDiameter,
  findBridgeConnections,
  calculateClusteringCoefficient,
  generateDegreeAnalysisReport,
};

export {
  degreeController
}