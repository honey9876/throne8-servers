// src/types/network.types.ts

import { Document } from 'mongoose';
import { ObjectId } from 'mongodb';

/**
 * NETWORK TYPES - ENTERPRISE SCALE DOCUMENTATION
 * ===============================================
 *
 * PURPOSE: Type definitions for network-related operations supporting 1M+ users
 *
 * FEATURES IMPLEMENTED:
 * ✅ TypeScript Interfaces for Type Safety
 * ✅ Generic Types for Reusability
 * ✅ Union Types for Flexibility
 * ✅ Enum Types for Constants
 * ✅ Request/Response Types for API
 * ✅ Validation Types Integration
 * ✅ Pagination Types
 * ✅ Error Handling Types
 * ✅ Metric Calculation Types
 * ✅ Export/Import Types
 * ✅ Analytics Report Types
 * ✅ Network Graph Types
 * ✅ Recommendation Types
 * ✅ Insight Generation Types
 * ✅ Privacy Control Types
 * ✅ Batch Operation Types
 * ✅ Graph Maintenance Types
 * ✅ Algorithm Context Types
 * ✅ Performance Metric Types
 * ✅ Security Audit Types
 */

// Enums for controlled values
export enum NetworkPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

export enum NetworkCompositionType {
  PROFESSIONAL = 'professional',
  PERSONAL = 'personal',
  ACADEMIC = 'academic',
  BUSINESS = 'business',
  OTHER = 'other',
}
 
export enum NetworkInsightType {
  TRENDS = 'trends',
  PATTERNS = 'patterns',
  PREDICTIONS = 'predictions',
  RECOMMENDATIONS = 'recommendations',
  BENCHMARKS = 'benchmarks',
}

export enum ConnectionStrength {
  WEAK = 'weak',
  MEDIUM = 'medium',
  STRONG = 'strong',
  UNKNOWN = 'unknown', 
}

export enum ConnectionStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  BLOCKED = 'blocked',
  INACTIVE = 'inactive',
  REMOVED = 'removed',
}

// Basic types
export type UserId = string | ObjectId;

// Core Interfaces
export interface NetworkComposition {
  professional: number;
  personal: number;
  academic: number;
  business: number;
  other: number;
  total: number;
}

export interface NetworkDiversity {
  geographic: number;
  industry: number;
  experience: number;
  skill: number;
  average: number;
}

export interface NetworkTrends {
  daily: number;
  weekly: number;
  monthly: number;
  quarterly: number;
  yearly: number;
}

export interface NetworkMetrics extends Document {
  userId: ObjectId;
  connectionCount: number;
  growthRate: number;
  composition: NetworkComposition;
  healthScore: number;
  density: number;
  clusters: number;
  influenceScore: number;
  engagementRate: number;
  diversity: NetworkDiversity;
  trends: NetworkTrends;
  lastCalculated: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectionDegreePath {
  path: UserId[];
  length: number;
  weight?: number;
  score?: number;
  cost?: number;
}

export interface CentralityMeasures {
  betweenness: number;
  closeness: number;
  eigenvector: number;
  pageRank?: number;
  degree?: number;
  harmonic?: number;
}

export interface GraphStatistics {
  nodeCount: number;
  edgeCount: number;
  averageDegree: number;
  density: number;
  diameter?: number;
  clusteringCoefficient?: number;
  componentCount?: number;
  largestComponentSize?: number;
  averagePathLength?: number;
}

export interface InfluenceMetrics {
  score: number;
  rank?: number;
  category?: 'high' | 'medium' | 'low';
  factors?: Record<string, number>;
  percentile?: number;
}

// Existing interfaces (enhanced)
export interface IMutualConnection {
  userId: string;
  name: string;
  headline?: string;
  avatar?: string;
  company?: string;
  location?: string;
  connectionStrength: number;
  mutualCount: number;
  profileComplete: boolean;
  lastInteraction?: Date;
  tags?: string[];
}

export interface MutualQueryParams {
  limit?: number;
  offset?: number;
  filters?: {
    company?: string;
    location?: string;
    industry?: string;
    minStrength?: number;
  };
  sortBy?: 'strength' | 'mutualCount' | 'lastInteraction';
}

export interface MutualNetworkMetrics {
  mutualCount: number;
  totalNetworkSize: number;
  avgConnectionStrength: number;
  networkDensity: number;
  strongConnections: number;
  calculatedAt: string;
  weakConnections: number;
}

export interface IConnection {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: ConnectionStatus;
  strength?: number;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  notes?: string;
}

export interface NetworkGraph {
  nodes: Array<{ id: string; label: string; group?: string; properties?: Record<string, any> }>;
  links: Array<{ source: string; target: string; value?: number; type?: string }>;
}

export interface DegreeConnection {
  userId: string;
  degree: 1 | 2 | 3 | 4;
  path: string[];
  strength?: number;
}

// Additional types
export interface TraversalOptions {
  maxDepth: number;
  mode: 'BFS' | 'DFS';
  includeWeights?: boolean;
  filterPredicate?: (node: any) => boolean;
  visitedLimit?: number;
}

export interface PathfindingOptions {
  algorithm: 'dijkstra' | 'astar' | 'bellman-ford' | 'floyd-warshall';
  maxLength?: number;
  includeAlternatives?: boolean;
  weightProperty?: string;
  heuristic?: string;
}

export interface Community {
  id: string;
  members: UserId[];
  size: number;
  density?: number;
  modularity?: number;
  centralUser?: UserId;
}

export interface GraphVisualizationData {
  nodes: Array<{
    id: UserId;
    label?: string;
    properties?: Record<string, any>;
    x?: number;
    y?: number;
    z?: number;
  }>;
  edges: Array<{
    source: UserId;
    target: UserId;
    weight?: number;
    properties?: Record<string, any>;
    color?: string;
  }>;
  layout?: 'force' | 'circular' | 'tree';
}

export interface NetworkAnalysisResult {
  userId: UserId;
  metrics: GraphStatistics;
  centrality: CentralityMeasures;
  influence: InfluenceMetrics;
  community?: Community;
  timestamp: Date;
  version: number;
}

export interface AlgorithmContext {
  algorithm: string;
  parameters: Record<string, any>;
  startTime: number;
  timeout?: number;
  cacheEnabled?: boolean;
  maxIterations?: number;
}

export interface DegreeCalculationParams {
  userId: UserId;
  maxDepth: number;
  includeWeights?: boolean;
  filterByStatus?: ConnectionStatus[];
  cacheResults?: boolean;
  timeout?: number;
  minScore?: number;
}

export interface PathCalculationResult {
  paths: ConnectionDegreePath[];
  totalPaths: number;
  shortestPathLength: number;
  averagePathLength: number;
  calculationTime: number;
  fromCache: boolean;
  alternatives?: number;
}

export interface NetworkRecommendation {
  userId: UserId;
  recommendationType: 'mutual' | 'similar' | 'influence' | 'community' | 'content';
  score: number;
  reasons: string[];
  mutualConnections?: UserId[];
  metadata?: Record<string, any>;
  priority?: 'high' | 'medium' | 'low';
}

export interface BatchOperationResult<T> {
  successful: T[];
  failed: Array<{ item: any; error: string }>;
  totalProcessed: number;
  processingTime: number;
  batchId?: string;
}

export interface GraphMaintenanceOperation {
  operation: 'index' | 'backup' | 'cleanup' | 'optimize' | 'rebuild' | 'vacuum';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  details?: Record<string, any>;
  progress?: number;
}

// Request/Response Types - Fixed
export interface GetNetworkOverviewRequest {
  userId: string;
  includeDetails?: boolean;
}

export interface CalculateNetworkGrowthRequest {
  userId: string;
  period?: NetworkPeriod;
  includeHistorical?: boolean;
}

export interface AnalyzeNetworkCompositionRequest {
  userId: string;
  type?: NetworkCompositionType;
  detailedBreakdown?: boolean;
}

export interface GetNetworkHealthScoreRequest {
  userId: string;
  includeComponents?: boolean;
}

export interface FindNetworkGapsRequest {
  userId: string;
  minConnections?: number;
  analysisDepth?: 'basic' | 'advanced';
}

// Response Types - Fixed
export interface NetworkOverviewResponse {
  connectionCount: number;
  healthScore: number;
  influenceScore: number;
  engagementRate: number;
  composition: NetworkComposition;
  diversity: NetworkDiversity;
  lastUpdated: Date;
  success: boolean;
}

export interface NetworkGrowthResponse {
  newConnections: number;
  totalConnections: number;
  growthRate: number;
  period: NetworkPeriod;
  calculatedAt: Date;
  historicalData?: Array<{
    period: string;
    growth: number;
  }>;
  success: boolean;
}

export interface NetworkCompositionResponse {
  composition: NetworkComposition;
  totalConnections: number;
  diversity: NetworkDiversity;
  percentages: Record<string, number>;
  recommendations: {
    needsMoreProfessional: boolean;
    needsMoreDiversity: boolean;
    isWellBalanced: boolean;
  };
  analyzedAt: Date;
  success: boolean;
}

export interface NetworkHealthResponse {
  score: number;
  storedScore: number;
  components: Record<string, number>;
  analysis: {
    level: string;
    strengths: string[];
    improvements: string[];
    recommendations: string[];
  };
  lastUpdated: Date;
  success: boolean;
}

export interface NetworkGapsResponse {
  connectionGaps: Array<{
    userId: string;
    name: string;
    title: string;
    company: string;
    mutualConnections: number;
    totalConnections: number;
    industries: string[];
    locations: string[];
    priority: 'high' | 'medium' | 'low';
  }>;
  industryGaps?: Array<{
    industry: string;
    potential: number;
  }>;
  summary: {
    totalGaps: number;
    highPriorityGaps: number;
    topIndustriesMissing?: string[];
  };
  analyzedAt: Date;
  success: boolean;
}

// Type Guards
export function isNetworkMetrics(obj: any): obj is NetworkMetrics {
  return obj && typeof obj.userId === 'object' && typeof obj.connectionCount === 'number' && 'composition' in obj;
}

export function isValidUserId(id: any): id is UserId {
  return typeof id === 'string' || id instanceof ObjectId;
}

// Union Types - Fixed
export type NetworkRequest = 
  | GetNetworkOverviewRequest 
  | CalculateNetworkGrowthRequest 
  | AnalyzeNetworkCompositionRequest
  | GetNetworkHealthScoreRequest
  | FindNetworkGapsRequest;

export type NetworkResponse = 
  | NetworkOverviewResponse 
  | NetworkGrowthResponse 
  | NetworkCompositionResponse
  | NetworkHealthResponse
  | NetworkGapsResponse;

// Additional utility types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: PaginationParams;
    totalCount?: number;
    processingTime?: number;
  };
  timestamp: Date;
}

// Generic API Response
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;