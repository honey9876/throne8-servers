// src/types/connection.types.ts

/*
 * CONNECTION  TYPES - CORE CONNECTION FUNCTIONALITY
 * =================================================
 * Type definitions for connection management
 */

import { Document, Types } from 'mongoose';
import { PaginationParams } from './common.types';

// ============================================================================
// CONNECTION ENUMS
// ============================================================================

export enum ConnectionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
  REMOVED = 'removed',
}
export enum ConnectionType {
  PROFESSIONAL = 'professional',
  PERSONAL = 'personal',
  ACADEMIC = 'academic',
  BUSINESS = 'business',
  OTHER = 'other',
}
export enum ConnectionStrength {
  WEAK = 'weak',
  MEDIUM = 'medium',
  STRONG = 'strong',
  VERY_STRONG = 'very_strong',
}
export enum ConnectionSource {
  DIRECT_REQUEST = 'direct_request',
  MUTUAL_INTRODUCTION = 'mutual_introduction',
  EVENT = 'event',
  RECOMMENDATION = 'recommendation',
  IMPORTED = 'imported',
  OTHER = 'other',
}

// ============================================================================
// CORE CONNECTION INTERFACE
// ============================================================================

export interface IConnection extends Document {
  _id: Types.ObjectId;
  userId: string;
  connectedUserId: string;
  status: ConnectionStatus;
  type: ConnectionType;
  strength: ConnectionStrength;
  source: ConnectionSource;
  tags: string[];
  note?: string;
  metadata: {
    mutualConnections: number;
    interactions: number;
    lastInteraction?: Date;
    firstMet?: Date;
    location?: string;
    company?: string;
  };
  privacy: {
    isVisible: boolean;
    showToMutual: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;

  // Instance methods
  calculateStrength(): Promise<ConnectionStrength>;
  updateInteraction(): Promise<void>;
}
   
// ============================================================================
// CONNECTION DATA TRANSFER OBJECTS
// ============================================================================

export interface ConnectionDTO {
  id: string;
  userId: string;
  connectedUserId: string;
  status: ConnectionStatus;
  type: ConnectionType;
  strength: ConnectionStrength;
  tags: string[];
  createdAt: Date;
  metadata?: {
    mutualConnections: number;
    interactions: number;
    lastInteraction?: Date;
  };
}

export interface ConnectionDetailsDTO extends ConnectionDTO {
  note?: string;
  source: ConnectionSource;
  privacy: {
    isVisible: boolean;
    showToMutual: boolean;
  };
  userDetails?: {
    name: string;
    avatar?: string;
    headline?: string;
    company?: string;
    location?: string;
  };
}

// ============================================================================
// CONNECTION REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateConnectionData {
  connectedUserId: string;
  type?: ConnectionType;
  source?: ConnectionSource;
  tags?: string[];
  note?: string;
  metadata?: Partial<IConnection['metadata']>;
}

export interface UpdateConnectionData {
  status?: ConnectionStatus;
  type?: ConnectionType;
  strength?: ConnectionStrength;
  tags?: string[];
  note?: string;
  privacy?: Partial<IConnection['privacy']>;
}

export interface ConnectionQueryParams extends PaginationParams {
  status?: ConnectionStatus | ConnectionStatus[];
  type?: ConnectionType | ConnectionType[];
  strength?: ConnectionStrength | ConnectionStrength[];
  tags?: string[];
  search?: string;
  sortBy?: 'createdAt' | 'strength' | 'interactions' | 'name';
  sortOrder?: 'asc' | 'desc';
  includeMetadata?: boolean;
  includeUserDetails?: boolean;
}

// ============================================================================
// CONNECTION STATISTICS
// ============================================================================

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  pendingConnections: number;
  byType: Record<ConnectionType, number>;
  byStrength: Record<ConnectionStrength, number>;
  bySource: Record<ConnectionSource, number>;
  growthRate: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  topTags: Array<{
    tag: string;
    count: number;
  }>;
}

export interface ConnectionMetrics {
  userId: string;
  stats: ConnectionStats;
  engagement: {
    averageInteractions: number;
    lastInteractionDate?: Date;
    activeConnectionsRate: number;
  };
  network: {
    mutualConnectionsAvg: number;
    networkDensity: number;
    clusteringCoefficient: number;
  };
  calculatedAt: Date;
}

// ============================================================================
// CONNECTION RECOMMENDATIONS
// ============================================================================

export interface ConnectionRecommendation {
  userId: string;
  recommendationType: 'mutual' | 'similar_profile' | 'same_company' | 'same_location' | 'skill_based';
  score: number;
  reasons: string[];
  mutualConnections: number;
  mutualConnectionsList?: string[];
  userDetails: {
    name: string;
    headline?: string;
    avatar?: string;
    company?: string;
    location?: string;
  };
  metadata?: Record<string, any>;
}

export interface RecommendationParams {
  userId: string;
  limit?: number;
  types?: ConnectionRecommendation['recommendationType'][];
  minScore?: number;
  excludeExisting?: boolean;
}

// ============================================================================
// CONNECTION ACTIVITY
// ============================================================================

export interface ConnectionActivity {
  connectionId: string;
  activityType: 'message' | 'profile_view' | 'post_interaction' | 'endorsement' | 'recommendation';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ConnectionTimeline {
  connectionId: string;
  events: Array<{
    type: 'created' | 'updated' | 'interaction' | 'note_added' | 'tag_added';
    timestamp: Date;
    description: string;
    metadata?: Record<string, any>;
  }>;
}

// ============================================================================
// CONNECTION SEARCH & FILTER
// ============================================================================

export interface ConnectionSearchParams {
  query: string;
  filters?: {
    status?: ConnectionStatus[];
    type?: ConnectionType[];
    tags?: string[];
    strength?: ConnectionStrength[];
    company?: string;
    location?: string;
    dateFrom?: Date;
    dateTo?: Date;
  };
  pagination?: PaginationParams;
  sortBy?: 'relevance' | 'recent' | 'strength';
}
export interface ConnectionSearchResult {
  connections: ConnectionDetailsDTO[];
  total: number;
  facets?: {
    types: Record<ConnectionType, number>;
    strengths: Record<ConnectionStrength, number>;
    tags: Record<string, number>;
  };
}

// ============================================================================
// CONNECTION IMPORT/EXPORT
// ============================================================================

export interface ConnectionImportData {
  connectedUserId: string;
  type?: ConnectionType;
  source?: ConnectionSource;
  tags?: string[];
  note?: string;
  metadata?: {
    firstMet?: Date;
    location?: string;
    company?: string;
  };
}

export interface ConnectionExportData extends ConnectionDTO {
  userDetails: {
    name: string;
    email?: string;
    company?: string;
    location?: string;
  };
  note?: string;
}

export interface ImportResult {
  successful: number;
  failed: number;
  duplicates: number;
  errors: Array<{
    row: number;
    userId: string;
    error: string;
  }>;
}

// ============================================================================
// CONNECTION BULK OPERATIONS
// ============================================================================

export interface BulkConnectionUpdate {
  connectionIds: string[];
  updates: UpdateConnectionData;
}

export interface BulkConnectionDelete {
  connectionIds: string[];
  softDelete?: boolean;
  reason?: string;
}

export interface BulkOperationResult {
  successful: string[];
  failed: Array<{
    connectionId: string;
    error: string;
  }>;
  totalProcessed: number;
}

// ============================================================================
// CONNECTION PRIVACY
// ============================================================================

export interface ConnectionPrivacySettings {
  userId: string;
  defaultVisibility: boolean;
  allowMutualView: boolean;
  hideConnectionCount: boolean;
  restrictedUsers: string[];
}

export interface ConnectionVisibilityCheck {
  connectionId: string;
  requestingUserId: string;
  canView: boolean;
  reason?: string;
}


// ============================================================================
// CONNECTION NOTIFICATIONS
// ============================================================================

export interface ConnectionNotification {
  type: 'new_connection' | 'connection_request' | 'connection_accepted' | 'connection_milestone';
  connectionId: string;
  userId: string;
  message: string;
  data?: Record<string, any>;
  createdAt: Date;
}


// ============================================================================
// CONNECTION ANALYTICS
// ============================================================================

export interface ConnectionAnalytics {
  userId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    newConnections: number;
    removedConnections: number;
    totalInteractions: number;
    averageStrength: number;
    networkGrowth: number;
  };
  trends: Array<{
    date: Date;
    connections: number;
    interactions: number;
  }>;
  insights: string[];
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isConnection(obj: any): obj is IConnection {
  return obj && obj.userId && obj.connectedUserId && obj.status;
}

export function isValidConnectionStatus(status: any): status is ConnectionStatus {
  return Object.values(ConnectionStatus).includes(status);
}

export function isValidConnectionType(type: any): type is ConnectionType {
  return Object.values(ConnectionType).includes(type);
}