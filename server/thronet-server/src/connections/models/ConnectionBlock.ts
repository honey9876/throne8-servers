

// src/models/mongodb/ConnectionBlock.ts

import mongoose, { Document, Schema, Model, CallbackError, Types } from 'mongoose';
// MongoDB ODM for database operations, schemas, and type safety
// Features: Document modeling, indexing, validation, middleware, virtual fields

// =================================================================================
// ENUMS AND TYPES - Type safety and validation for block operations
// =================================================================================

export enum BlockReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment', 
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  FAKE_PROFILE = 'fake_profile',
  PRIVACY_VIOLATION = 'privacy_violation',
  COMMERCIAL_ABUSE = 'commercial_abuse',
  IMPERSONATION = 'impersonation',
  HATE_SPEECH = 'hate_speech',
  VIOLENT_CONTENT = 'violent_content',
  SCAM_FRAUD = 'scam_fraud',
  COPYRIGHT_VIOLATION = 'copyright_violation',
  OTHER = 'other'
}

export enum BlockStatus {
  ACTIVE = 'active',           
  INACTIVE = 'inactive',       
  PENDING_REVIEW = 'pending_review',  
  SYSTEM_BLOCKED = 'system_blocked',  
  APPEALED = 'appealed',       
  EXPIRED = 'expired'          
}

export enum BlockType {
  USER_INITIATED = 'user_initiated',    
  SYSTEM_AUTOMATED = 'system_automated', 
  ADMIN_ACTION = 'admin_action',        
  BULK_ACTION = 'bulk_action',          
  PRIVACY_BLOCK = 'privacy_block',      
  TEMPORARY_BLOCK = 'temporary_block'   
}

export enum BlockSeverity {
  LOW = 'low',           
  MEDIUM = 'medium',     
  HIGH = 'high',         
  CRITICAL = 'critical'  
}

// =================================================================================
// INTERFACES - Strong typing for 1M+ scale operations
// =================================================================================

export interface IBlockMetadata {
  blockerIP?: string;
  userAgent?: string;
  platform?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet';
  
  location?: {
    country?: string;
    region?: string;
    city?: string;
    coordinates?: [number, number];
  };
  
  reportedBy: string[];      
  reportCount: number;
  severity: BlockSeverity;
  adminNotes?: string;
  moderatorId?: string;
  
  appealSubmitted: boolean;
  appealReason?: string;
  appealedAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewDecision?: 'approved' | 'rejected' | 'pending';
  
  automaticUnblockEnabled: boolean;
  autoUnblockDate?: Date;
  ruleViolated?: string[];    
  evidenceUrls?: string[];    
  
  previousBlocks?: number;    
  mutualReports?: boolean;    
  networkImpact?: number;     
}

export interface IAuditLogEntry {
  action: 'blocked' | 'unblocked' | 'reported' | 'reviewed' | 'appealed' | 'escalated';
  performedBy: string;
  performedByType: 'user' | 'admin' | 'system';
  timestamp: Date;
  reason?: string;
  previousState?: BlockStatus;
  newState?: BlockStatus;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// =================================================================================
// MAIN DOCUMENT INTERFACE
// =================================================================================

export interface IConnectionBlock extends Document {
  _id: Types.ObjectId;
  blockerId: string;          
  blockedId: string;          
  blockType: BlockType;
  status: BlockStatus;
  reason: BlockReason;
  customReason?: string;      
  blockedAt: Date;
  unblockedAt?: Date;
  expiresAt?: Date;           
  isActive: boolean;          
  metadata: IBlockMetadata;
  auditLog: IAuditLogEntry[];
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  unblock(performedBy?: string, reason?: string): Promise<IConnectionBlock>;
  reblock(reason?: BlockReason, performedBy?: string): Promise<IConnectionBlock>;
  addReport(reportedBy: string, reason: BlockReason, evidence?: string[]): Promise<IConnectionBlock>;
  submitAppeal(appealReason: string, userId: string): Promise<IConnectionBlock>;
  isExpired(): boolean;
  addAuditLog(action: string, performedBy: string, performedByType: 'user' | 'admin' | 'system', metadata?: Record<string, any>): Promise<IConnectionBlock>;
  getBlockDuration(): number;
  getReportSummary(): { totalReports: number; reasons: BlockReason[]; reporters: string[] };
}

// =================================================================================
// MODEL STATIC METHODS
// =================================================================================

export interface IConnectionBlockModel extends Model<IConnectionBlock> {
  findByBlocker(blockerId: string, options?: {
    includeInactive?: boolean;
    limit?: number;
    skip?: number;
    sortBy?: string;
  }): Promise<IConnectionBlock[]>;
  
  findByBlocked(blockedId: string, includeInactive?: boolean): Promise<IConnectionBlock[]>;
  isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  isMutuallyBlocked(userId1: string, userId2: string): Promise<boolean>;
  
  getBlockCount(userId: string, status?: BlockStatus): Promise<number>;
  getBlockStats(userId: string): Promise<{
    totalBlocked: number;           
    totalBlockedBy: number;         
    activeBlocks: number;           
    pendingReviews: number;         
    appealsPending: number;         
    mostCommonReason: BlockReason;  
    averageBlockDuration: number;   
  }>;
  
  bulkBlock(
    blockerId: string, 
    blockedIds: string[], 
    reason: BlockReason, 
    type: BlockType,
    metadata?: Partial<IBlockMetadata>
  ): Promise<IConnectionBlock[]>;
  
  bulkUnblock(
    blockerId: string, 
    blockedIds: string[], 
    performedBy?: string, 
    reason?: string
  ): Promise<boolean>;
  
  getBlockHistory(userId: string, options?: {
    startDate?: Date;
    endDate?: Date;
    includeAppeals?: boolean;
    limit?: number;
  }): Promise<IConnectionBlock[]>;
  
  findPendingAppeals(moderatorId?: string): Promise<IConnectionBlock[]>;
  processAppeal(blockId: string, decision: 'approved' | 'rejected', reviewerId: string, notes?: string): Promise<IConnectionBlock>;
  
  getSystemBlockAnalytics(timeframe?: 'day' | 'week' | 'month'): Promise<{
    totalBlocks: number;
    newBlocks: number;
    resolvedBlocks: number;
    activeAppeals: number;
    topReasons: Array<{ reason: BlockReason; count: number }>;
    blocksByType: Array<{ type: BlockType; count: number }>;
    averageResolutionTime: number;
  }>;
  
  anonymizeExpiredBlocks(olderThanDays: number): Promise<number>;
  findBlocksForDataExport(userId: string): Promise<IConnectionBlock[]>;
  getBlockRelationshipMatrix(userIds: string[]): Promise<Map<string, Set<string>>>;
  findBlockedUsersInNetwork(userId: string, maxDegrees?: number): Promise<string[]>;
  findRecentBlocks(since: Date): Promise<IConnectionBlock[]>;
  findEscalatedBlocks(): Promise<IConnectionBlock[]>;
}

// =================================================================================
// MONGOOSE SCHEMA DEFINITION
// =================================================================================

const ConnectionBlockSchema = new Schema<IConnectionBlock>({
  blockerId: {
    type: String,
    required: [true, 'Blocker ID is required'],
    trim: true,
    validate: {
      validator: function(v: string): boolean {
        return Boolean(v && v.length > 0);
      },
      message: 'Blocker ID cannot be empty'
    }
  },
  
  blockedId: {
    type: String,
    required: [true, 'Blocked ID is required'],
    trim: true,
    validate: {
      validator: function(v: string): boolean {
        return Boolean(v && v.length > 0);
      },
      message: 'Blocked ID cannot be empty'
    }
  },
  
  blockType: {
    type: String,
    enum: Object.values(BlockType),
    required: true,
    default: BlockType.USER_INITIATED,
  },
  
  status: {
    type: String,
    enum: Object.values(BlockStatus),
    required: true,
    default: BlockStatus.ACTIVE,
  },
  
  reason: {
    type: String,
    enum: Object.values(BlockReason),
    required: true,
  },
  
  customReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Custom reason cannot exceed 500 characters'],
    default: null
  },
  
  blockedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  
  unblockedAt: {
    type: Date,
    default: null,
  },
  
  expiresAt: {
    type: Date,
    default: null,
  },
  
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  
  metadata: {
    blockerIP: { type: String, default: null },
    userAgent: { type: String, default: null },
    platform: { type: String, default: null },
    deviceType: { 
      type: String, 
      enum: ['mobile', 'desktop', 'tablet', 'unknown'],
      default: 'unknown'
    },
    
    location: {
      country: { type: String, default: null },
      region: { type: String, default: null },
      city: { type: String, default: null },
      coordinates: {
        type: [Number],
        default: null,
        validate: {
          validator: function(v: number[] | null): boolean {
            return !v || (v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90);
          },
          message: 'Invalid coordinates format'
        }
      }
    },
    
    reportedBy: {
      type: [String],
      default: [],
    },
    reportCount: {
      type: Number,
      default: 0,
      min: [0, 'Report count cannot be negative']
    },
    severity: {
      type: String,
      enum: Object.values(BlockSeverity),
      default: BlockSeverity.LOW,
    },
    adminNotes: { type: String, default: null },
    moderatorId: { type: String, default: null },
    
    appealSubmitted: {
      type: Boolean,
      default: false,
    },
    appealReason: { type: String, default: null },
    appealedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewDecision: {
      type: String,
      enum: ['approved', 'rejected', 'pending'],
      default: null
    },
    
    automaticUnblockEnabled: {
      type: Boolean,
      default: false
    },
    autoUnblockDate: { type: Date, default: null },
    ruleViolated: {
      type: [String],
      default: []
    },
    evidenceUrls: {
      type: [String],
      default: []
    },
    
    previousBlocks: {
      type: Number,
      default: 0
    },
    mutualReports: {
      type: Boolean,
      default: false
    },
    networkImpact: {
      type: Number,
      default: 0
    }
  },
  
  auditLog: [{
    action: {
      type: String,
      required: true,
      enum: ['blocked', 'unblocked', 'reported', 'reviewed', 'appealed', 'escalated']
    },
    performedBy: {
      type: String,
      required: true
    },
    performedByType: {
      type: String,
      required: true,
      enum: ['user', 'admin', 'system']
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now
    },
    reason: String,
    previousState: String,
    newState: String,
    metadata: Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String
  }]
  
}, {
  timestamps: true,
  collection: 'connectionblocks'
});

// =================================================================================
// INDEXES
// =================================================================================

ConnectionBlockSchema.index(
  { blockerId: 1, isActive: 1, blockedAt: -1 }, 
  { name: 'blocker_active_date',   }
);

ConnectionBlockSchema.index(
  { blockedId: 1, isActive: 1, blockedAt: -1 }, 
  { name: 'blocked_active_date',   }
);

ConnectionBlockSchema.index(
  { blockerId: 1, blockedId: 1 }, 
  { 
    unique: true, 
    name: 'unique_block_relationship',
    partialFilterExpression: { isActive: true }
  }
);

ConnectionBlockSchema.index({ status: 1, createdAt: -1 }, { name: 'status_created_analytics' });
ConnectionBlockSchema.index({ reason: 1, createdAt: -1 }, { name: 'reason_analytics' });
ConnectionBlockSchema.index({ blockType: 1, createdAt: -1 }, { name: 'type_analytics' });

ConnectionBlockSchema.index(
  { 'metadata.appealSubmitted': 1, 'metadata.reviewDecision': 1 }, 
  { name: 'appeal_review_queue', sparse: true }
);

ConnectionBlockSchema.index({ expiresAt: 1 }, { name: 'expires_cleanup', sparse: true });
ConnectionBlockSchema.index({ isActive: 1, updatedAt: -1 }, { name: 'active_maintenance' });
ConnectionBlockSchema.index({ 'metadata.location.coordinates': '2dsphere' }, { sparse: true });

// =================================================================================
// STATIC METHODS IMPLEMENTATION
// =================================================================================

ConnectionBlockSchema.statics.findByBlocker = function(
  blockerId: string, 
  options: {
    includeInactive?: boolean;
    limit?: number;
    skip?: number;
    sortBy?: string;
  } = {}
): Promise<IConnectionBlock[]> {
  const query: any = { blockerId };
  
  if (!options.includeInactive) {
    query.isActive = true;
  }
  
  return this.find(query)
    .sort({ [options.sortBy || 'blockedAt']: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .lean()
    .exec();
};

ConnectionBlockSchema.statics.findByBlocked = function(
  blockedId: string, 
  includeInactive: boolean = false
): Promise<IConnectionBlock[]> {
  const query: any = { blockedId };
  if (!includeInactive) {
    query.isActive = true;
  }
  
  return this.find(query)
    .sort({ blockedAt: -1 })
    .lean()
    .exec();
};

ConnectionBlockSchema.statics.isBlocked = function(
  blockerId: string, 
  blockedId: string
): Promise<boolean> {
  return this.exists({ blockerId, blockedId, isActive: true })
    .then((result: any) => !!result);
};

ConnectionBlockSchema.statics.isMutuallyBlocked = async function(
  userId1: string, 
  userId2: string
): Promise<boolean> {
  const blocks = await this.find({
    $or: [
      { blockerId: userId1, blockedId: userId2 },
      { blockerId: userId2, blockedId: userId1 }
    ],
    isActive: true
  }).select('_id').lean();
  
  return blocks.length === 2;
};

ConnectionBlockSchema.statics.getBlockCount = function(
  userId: string, 
  status?: BlockStatus
): Promise<number> {
  const query: any = { blockerId: userId };
  if (status) {
    query.status = status;
  }
  
  return this.countDocuments(query);
};

ConnectionBlockSchema.statics.getBlockStats = async function(userId: string) {
  const [
    totalBlocked,
    totalBlockedBy,
    activeBlocks,
    pendingReviews,
    appealsPending,
    reasonStats,
    durationStats
  ] = await Promise.all([
    this.countDocuments({ blockerId: userId }),
    this.countDocuments({ blockedId: userId }),
    this.countDocuments({ blockerId: userId, isActive: true }),
    this.countDocuments({ blockerId: userId, status: BlockStatus.PENDING_REVIEW }),
    this.countDocuments({ blockerId: userId, 'metadata.appealSubmitted': true, 'metadata.reviewDecision': 'pending' }),
    
    this.aggregate([
      { $match: { blockerId: userId } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]),
    
    this.aggregate([
      { 
        $match: { 
          blockerId: userId, 
          unblockedAt: { $exists: true } 
        } 
      },
      { 
        $project: { 
          duration: { $subtract: ['$unblockedAt', '$blockedAt'] } 
        } 
      },
      { 
        $group: { 
          _id: null, 
          avgDuration: { $avg: '$duration' } 
        } 
      }
    ])
  ]);
  
  return {
    totalBlocked,
    totalBlockedBy,
    activeBlocks,
    pendingReviews,
    appealsPending,
    mostCommonReason: reasonStats[0]?._id || BlockReason.OTHER,
    averageBlockDuration: Math.round(durationStats[0]?.avgDuration || 0)
  };
};

ConnectionBlockSchema.statics.bulkBlock = async function(
  blockerId: string,
  blockedIds: string[],
  reason: BlockReason,
  type: BlockType,
  metadata: Partial<IBlockMetadata> = {}
): Promise<IConnectionBlock[]> {
  const blocksToInsert = blockedIds.map(blockedId => ({
    blockerId,
    blockedId,
    reason,
    blockType: type,
    status: BlockStatus.ACTIVE,
    isActive: true,
    blockedAt: new Date(),
    metadata: {
      reportCount: 0,
      severity: BlockSeverity.LOW,
      appealSubmitted: false,
      automaticUnblockEnabled: false,
      reportedBy: [],
      ...metadata
    },
    auditLog: [{
      action: 'blocked',
      performedBy: blockerId,
      performedByType: 'user',
      timestamp: new Date(),
      reason: reason
    }]
  }));
  
  return this.insertMany(blocksToInsert, { ordered: false });
};

ConnectionBlockSchema.statics.bulkUnblock = async function(
  blockerId: string,
  blockedIds: string[],
  performedBy: string = blockerId,
  reason: string = 'bulk unblock'
): Promise<boolean> {
  const result = await this.updateMany(
    { 
      blockerId, 
      blockedId: { $in: blockedIds }, 
      isActive: true 
    },
    { 
      $set: { 
        isActive: false, 
        status: BlockStatus.INACTIVE, 
        unblockedAt: new Date() 
      },
      $push: {
        auditLog: {
          action: 'unblocked',
          performedBy,
          performedByType: performedBy === blockerId ? 'user' : 'admin',
          timestamp: new Date(),
          reason
        }
      }
    }
  );
  
  return result.modifiedCount > 0;
};

ConnectionBlockSchema.statics.getBlockHistory = function(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    includeAppeals?: boolean;
    limit?: number;
  } = {}
): Promise<IConnectionBlock[]> {
  const query: any = {
    $or: [
      { blockerId: userId },
      { blockedId: userId }
    ]
  };
  
  if (options.startDate || options.endDate) {
    query.createdAt = {};
    if (options.startDate) query.createdAt.$gte = options.startDate;
    if (options.endDate) query.createdAt.$lte = options.endDate;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .lean()
    .exec();
};

ConnectionBlockSchema.statics.findPendingAppeals = function(moderatorId?: string) {
  const query: any = {
    'metadata.appealSubmitted': true,
    'metadata.reviewDecision': { $in: ['pending', null] },
    isActive: true
  };
  
  if (moderatorId) {
    query['metadata.reviewedBy'] = moderatorId;
  }
  
  return this.find(query)
    .sort({ 'metadata.appealedAt': 1 })
    .exec();
};

ConnectionBlockSchema.statics.processAppeal = async function(
  blockId: string,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  notes?: string
): Promise<IConnectionBlock> {
  const update: any = {
    'metadata.reviewDecision': decision,
    'metadata.reviewedBy': reviewerId,
    'metadata.reviewedAt': new Date(),
    $push: {
      auditLog: {
        action: 'reviewed',
        performedBy: reviewerId,
        performedByType: 'admin',
        timestamp: new Date(),
        reason: `Appeal ${decision}`,
        metadata: { decision, notes }
      }
    }
  };
  
  if (decision === 'approved') {
    update.isActive = false;
    update.status = BlockStatus.INACTIVE;
    update.unblockedAt = new Date();
  }
  
  if (notes) {
    update['metadata.adminNotes'] = notes;
  }
  
  return this.findByIdAndUpdate(blockId, update, { new: true });
};

ConnectionBlockSchema.statics.getSystemBlockAnalytics = async function(
  timeframe: 'day' | 'week' | 'month' = 'week'
) {
  const timeframeMs = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  };
  
  const since = new Date(Date.now() - timeframeMs[timeframe]);
  
  const [
    totalBlocks,
    newBlocks,
    resolvedBlocks,
    activeAppeals,
    reasonStats,
    typeStats,
    resolutionTime
  ] = await Promise.all([
    this.countDocuments({}),
    this.countDocuments({ createdAt: { $gte: since } }),
    this.countDocuments({ 
      unblockedAt: { $gte: since },
      isActive: false 
    }),
    this.countDocuments({ 
      'metadata.appealSubmitted': true,
      'metadata.reviewDecision': { $in: ['pending', null] }
    }),
    
    this.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    
    this.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$blockType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    
    this.aggregate([
      { 
        $match: { 
          createdAt: { $gte: since },
          unblockedAt: { $exists: true },
          isActive: false
        } 
      },
      { 
        $project: { 
          resolutionTime: { $subtract: ['$unblockedAt', '$blockedAt'] } 
        } 
      },
      { 
        $group: { 
          _id: null, 
          avgTime: { $avg: '$resolutionTime' } 
        } 
      }
    ])
  ]);
  
  return {
    totalBlocks,
    newBlocks,
    resolvedBlocks,
    activeAppeals,
    topReasons: reasonStats,
    blocksByType: typeStats,
    averageResolutionTime: Math.round(resolutionTime[0]?.avgTime || 0)
  };
};

ConnectionBlockSchema.statics.anonymizeExpiredBlocks = async function(olderThanDays: number): Promise<number> {
  const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
  
  const result = await this.updateMany(
    {
      isActive: false,
      unblockedAt: { $lt: cutoffDate }
    },
    {
      $unset: {
        'metadata.blockerIP': '',
        'metadata.userAgent': '',
        'metadata.location': '',
        'metadata.evidenceUrls': '',
        'metadata.adminNotes': ''
      },
      $set: {
        'metadata.anonymized': true,
        'metadata.anonymizedAt': new Date()
      }
    }
  );
  
  return result.modifiedCount;
};

ConnectionBlockSchema.statics.findBlocksForDataExport = function(userId: string): Promise<IConnectionBlock[]> {
  return this.find({
    $or: [
      { blockerId: userId },
      { blockedId: userId },
      { 'metadata.reportedBy': userId }
    ]
  })
  .select('-metadata.blockerIP -metadata.userAgent')
  .lean()
  .exec();
};

ConnectionBlockSchema.statics.getBlockRelationshipMatrix = async function(
  userIds: string[]
): Promise<Map<string, Set<string>>> {
  const blocks = await this.find({
    blockerId: { $in: userIds },
    blockedId: { $in: userIds },
    isActive: true
  })
  .select('blockerId blockedId')
  .lean();
  
  const matrix = new Map<string, Set<string>>();
  
  blocks.forEach((block: { blockerId: string; blockedId: string }) =>  {
    if (!matrix.has(block.blockerId)) {
      matrix.set(block.blockerId, new Set());
    }
    matrix.get(block.blockerId)!.add(block.blockedId);
  });
  
  return matrix;
};

ConnectionBlockSchema.statics.findBlockedUsersInNetwork = async function(
  userId: string
): Promise<string[]> {
  const directBlocks = await this.find({
    blockerId: userId,
    isActive: true
  }).distinct('blockedId');
  
  return directBlocks;
};

ConnectionBlockSchema.statics.findRecentBlocks = function(since: Date): Promise<IConnectionBlock[]> {
  return this.find({
    createdAt: { $gte: since },
    isActive: true
  })
  .sort({ createdAt: -1 })
  .lean()
  .exec();
};

ConnectionBlockSchema.statics.findEscalatedBlocks = function(): Promise<IConnectionBlock[]> {
  return this.find({
    isActive: true,
    $or: [
      { 'metadata.severity': BlockSeverity.CRITICAL },
      { 'metadata.reportCount': { $gte: 3 } },
      { status: BlockStatus.PENDING_REVIEW }
    ]
  })
  .sort({ 'metadata.reportCount': -1, createdAt: 1 })
  .exec();
};

// =================================================================================
// INSTANCE METHODS IMPLEMENTATION
// =================================================================================

ConnectionBlockSchema.methods.unblock = function(
  performedBy?: string,
  reason?: string
): Promise<IConnectionBlock> {
  this.isActive = false;
  this.status = BlockStatus.INACTIVE;
  this.unblockedAt = new Date();
  
  this.auditLog.push({
    action: 'unblocked',
    performedBy: performedBy || this.blockerId,
    performedByType: performedBy && performedBy !== this.blockerId ? 'admin' : 'user',
    timestamp: new Date(),
    reason: reason || 'unblocked by user',
    previousState: BlockStatus.ACTIVE,
    newState: BlockStatus.INACTIVE
  });
  
  return this.save();
};

ConnectionBlockSchema.methods.reblock = function(
  reason?: BlockReason,
  performedBy?: string
): Promise<IConnectionBlock> {
  this.isActive = true;
  this.status = BlockStatus.ACTIVE;
  this.blockedAt = new Date();
  this.unblockedAt = undefined;
  
  if (reason) {
    this.reason = reason;
  }
  
  this.auditLog.push({
    action: 'blocked',
    performedBy: performedBy || this.blockerId,
    performedByType: 'user',
    timestamp: new Date(),
    reason: reason || 'reblocked',
    previousState: BlockStatus.INACTIVE,
    newState: BlockStatus.ACTIVE
  });
  
  return this.save();
};

ConnectionBlockSchema.methods.addReport = function(
  reportedBy: string,
  reason: BlockReason,
  evidence?: string[]
): Promise<IConnectionBlock> {
  if (!this.metadata.reportedBy.includes(reportedBy)) {
    this.metadata.reportedBy.push(reportedBy);
    this.metadata.reportCount += 1;
    
    if (this.metadata.reportCount >= 5) {
      this.metadata.severity = BlockSeverity.CRITICAL;
    } else if (this.metadata.reportCount >= 3) {
      this.metadata.severity = BlockSeverity.HIGH;
    } else if (this.metadata.reportCount >= 2) {
      this.metadata.severity = BlockSeverity.MEDIUM;
    }
    
    if (evidence && evidence.length > 0) {
      this.metadata.evidenceUrls.push(...evidence);
    }
  }
  
  this.auditLog.push({
    action: 'reported',
    performedBy: reportedBy,
    performedByType: 'user',
    timestamp: new Date(),
    reason: reason,
    metadata: { evidence }
  });
  
  return this.save();
};

ConnectionBlockSchema.methods.submitAppeal = function(
  appealReason: string,
  userId: string
): Promise<IConnectionBlock> {
  this.metadata.appealSubmitted = true;
  this.metadata.appealReason = appealReason;
  this.metadata.appealedAt = new Date();
  this.metadata.reviewDecision = 'pending';
  this.status = BlockStatus.APPEALED;
  
  this.auditLog.push({
    action: 'appealed',
    performedBy: userId,
    performedByType: 'user',
    timestamp: new Date(),
    reason: appealReason
  });
  
  return this.save();
};

ConnectionBlockSchema.methods.isExpired = function(): boolean {
  return this.expiresAt ? new Date() > this.expiresAt : false;
};

ConnectionBlockSchema.methods.addAuditLog = function(
  action: string,
  performedBy: string,
  performedByType: 'user' | 'admin' | 'system',
  metadata?: Record<string, any>
): Promise<IConnectionBlock> {
  this.auditLog.push({
    action,
    performedBy,
    performedByType,
    timestamp: new Date(),
    metadata
  } as IAuditLogEntry);
  
  return this.save();
};

ConnectionBlockSchema.methods.getBlockDuration = function(): number {
  const endTime = this.unblockedAt || new Date();
  return endTime.getTime() - this.blockedAt.getTime();
};

ConnectionBlockSchema.methods.getReportSummary = function(): {
  totalReports: number;
  reasons: BlockReason[];
  reporters: string[];
} {
  return {
    totalReports: this.metadata.reportCount,
    reasons: [this.reason],
    reporters: this.metadata.reportedBy
  };
};

// =================================================================================
// MIDDLEWARE - Business logic and validation hooks
// =================================================================================

ConnectionBlockSchema.pre('save', function(next: (error?: CallbackError) => void) {
  if (this.blockerId === this.blockedId) {
    next(new Error('Cannot block yourself'));
    return;
  }
  
  if (this.isActive && !this.blockedAt) {
    this.blockedAt = new Date();
  }
  
  if (this.expiresAt && new Date() > this.expiresAt && this.isActive) {
    this.isActive = false;
    this.status = BlockStatus.EXPIRED;
    this.unblockedAt = new Date();
  }
  
  if (this.metadata.automaticUnblockEnabled && !this.metadata.autoUnblockDate) {
    const autoUnblockDays = this.metadata.severity === BlockSeverity.LOW ? 7 : 
                           this.metadata.severity === BlockSeverity.MEDIUM ? 30 : 90;
    this.metadata.autoUnblockDate = new Date(Date.now() + (autoUnblockDays * 24 * 60 * 60 * 1000));
  }
  
  next();
});

ConnectionBlockSchema.post('save', function(doc: IConnectionBlock) {
  if (doc.isActive && doc.status === BlockStatus.ACTIVE) {
    process.nextTick(() => {
      console.log(`Block notification: ${doc.blockerId} blocked ${doc.blockedId}`);
    });
  }
  
  if (doc.metadata.appealSubmitted && doc.metadata.reviewDecision === 'pending') {
    process.nextTick(() => {
      console.log(`Appeal submitted for block: ${doc._id}`);
    });
  }
});

// =================================================================================
// VIRTUAL FIELDS
// =================================================================================

ConnectionBlockSchema.virtual('blockDurationFormatted').get(function(this: IConnectionBlock) {
  const duration = this.getBlockDuration();
  const days = Math.floor(duration / (24 * 60 * 60 * 1000));
  const hours = Math.floor((duration % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `${days}d ${hours}h`;
});

ConnectionBlockSchema.virtual('appealStatus').get(function(this: IConnectionBlock) {
  if (!this.metadata.appealSubmitted) return 'none';
  return this.metadata.reviewDecision || 'pending';
});

ConnectionBlockSchema.virtual('severityLevel').get(function(this: IConnectionBlock) {
  const severity = this.metadata.severity;
  const reportCount = this.metadata.reportCount;
  
  return {
    level: severity,
    score: severity === BlockSeverity.CRITICAL ? 4 : 
           severity === BlockSeverity.HIGH ? 3 :
           severity === BlockSeverity.MEDIUM ? 2 : 1,
    reportCount,
    escalated: reportCount >= 3
  };
});

ConnectionBlockSchema.virtual('blockedAtFormatted').get(function(this: IConnectionBlock) {
  return this.blockedAt ? this.blockedAt.toISOString() : null;
});

ConnectionBlockSchema.virtual('unblockedAtFormatted').get(function(this: IConnectionBlock) {
  return this.unblockedAt ? this.unblockedAt.toISOString() : null;
});

// =================================================================================
// SCHEMA CONFIGURATION
// =================================================================================

ConnectionBlockSchema.set('toJSON', {
  virtuals: true,
  transform: function(_doc: any, ret: any) {
    delete ret._id;
    delete ret.__v;
    
    if (ret.metadata) {
      delete ret.metadata.blockerIP;
      delete ret.metadata.userAgent;
    }
    
    return ret;
  }
});

ConnectionBlockSchema.set('toObject', { virtuals: true });

// =================================================================================
// MODEL CREATION AND EXPORT
// =================================================================================

const ConnectionBlock = mongoose.model<IConnectionBlock, IConnectionBlockModel>(
  'ConnectionBlock',
  ConnectionBlockSchema
);

export default ConnectionBlock;

// =================================================================================
// FEATURE MAPPING SUMMARY
// This model implements all 12 blockController.ts features:
// 
// 1. blockUser          -> bulkBlock(), save() with audit log
// 2. unblockUser        -> unblock() instance method
// 3. getBlockedUsers    -> findByBlocker() static method
// 4. isUserBlocked      -> isBlocked() static method  
// 5. getBlockHistory    -> getBlockHistory() static method
// 6. setBulkBlockRules  -> bulkBlock() static method
// 7. getBlockAnalytics  -> getBlockStats(), getSystemBlockAnalytics()
// 8. setBlockNotifications -> post-save middleware + findRecentBlocks()
// 9. handleBlockAppeal  -> submitAppeal(), processAppeal() methods
// 10. getBlockReasons   -> addReport() method + reason enum
// 11. setBlockPrivacy   -> anonymizeExpiredBlocks() + data export methods
// 12. exportBlockData   -> findBlocksForDataExport() + JSON transform
// =================================================================================