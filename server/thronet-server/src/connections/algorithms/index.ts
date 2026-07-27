/**
 * Algorithms Index - Production-Ready for 1M+ Users
 * Entry point for exporting all algorithm modules in the Connection Service.
 * This file re-exports functions from mutual, degree, network, recommendation, and graph utils.
 * Optimized for tree-shaking and modular imports.
 * 
 * Features (Total 35 Features Exported):
 * - Mutual Algorithms: 8 features (e.g., findMutualConnections, calculateMutualStrength)
 * - Degree Algorithms: 12 features (e.g., calculateFirstDegree, findShortestPath)
 * - Network Algorithms: 10 features (e.g., analyzeNetworkDensity, predictNetworkExpansion)
 * - Recommendation Algorithms: 5 features (e.g., recommendConnections, personalizeRecommendations)
 * - Graph Utils: Shared utilities for graph operations
 * 
 * Dependencies:
 * - mutualAlgorithms.ts
 * - degreeAlgorithms.ts
 * - networkAlgorithms.ts
 * - recommendationAlgorithms.ts
 * - graphUtils.ts
 * 
 * Integration:
 * - Imported by services (e.g., mutualService.ts, degreeService.ts, networkService.ts)
 * - Used in controllers via services (e.g., mutualController.ts getMutualConnections)
 * - Aligns with tsconfig.json for module resolution
 * - No runtime deps—pure functions
 */

export * from './mutualAlgorithms'; // 8 features
export * from './degreeAlgorithms'; // 12 features
export * from './networkAlgorithms'; // 10 features
export * from './recommendationAlgorithms'; // 5 features
export * from './graphUtils'; // Shared graph utilities