// src/models/AdminAction.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminAction extends Document {
  adminId: string;
  adminEmail: string;
  actionType: string;
  targetModel: string;
  targetId: string;
  targetDetails?: any;
  changes?: {
    before?: any;
    after?: any;
  };
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  metadata?: any;
  createdAt: Date;
}

const AdminActionSchema = new Schema<IAdminAction>(
  {
    adminId: {
      type: String,
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      required: true,
    },
    actionType: {
      type: String,
      required: true,
      enum: [
        // User Management
        'user_create',
        'user_update',
        'user_delete',
        'user_suspend',
        'user_activate',
        'user_role_change',
        
        // Mentor Management
        'mentor_approve',
        'mentor_reject',
        'mentor_suspend',
        'mentor_activate',
        'mentor_update',
        'mentor_delete',
        'mentor_featured_add',
        'mentor_featured_remove',
        
        // Session Management
        'session_cancel',
        'session_refund',
        'session_reschedule',
        'session_modify',
        
        // Review Management
        'review_approve',
        'review_reject',
        'review_delete',
        'review_flag',
        
        // Payment Management
        'payment_refund',
        'payment_dispute_resolve',
        'payment_manual_process',
        
        // Content Management
        'content_moderate',
        'content_delete',
        'content_flag',
        
        // System Actions
        'system_config_update',
        'system_maintenance',
        'system_backup',
        'system_restore',
        
        // Report Actions
        'report_generate',
        'report_export',
        
        // Other
        'other',
      ],
      index: true,
    },
    targetModel: {
      type: String,
      required: true,
      enum: [
        'User',
        'Mentor',
        'Session',
        'Review',
        'Payment',
        'Package',
        'Waitlist',
        'Query',
        'GroupSession',
        'Notification',
        'System',
        'Report',
        'Other',
      ],
    },
    targetId: {
      type: String,
      required: true,
      index: true,
    },
    targetDetails: {
      type: Schema.Types.Mixed,
    },
    changes: {
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
    },
    reason: {
      type: String,
      maxlength: 1000,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
      index: true,
    },
    errorMessage: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
AdminActionSchema.index({ adminId: 1, createdAt: -1 });
AdminActionSchema.index({ actionType: 1, createdAt: -1 });
AdminActionSchema.index({ targetModel: 1, targetId: 1 });
AdminActionSchema.index({ createdAt: -1 });

// Static method to log action
AdminActionSchema.statics.logAction = async function (
  adminId: string,
  adminEmail: string,
  actionType: string,
  targetModel: string,
  targetId: string,
  additionalData?: Partial<IAdminAction>
) {
  try {
    const action = await this.create({
      adminId,
      adminEmail,
      actionType,
      targetModel,
      targetId,
      status: 'success',
      ...additionalData,
    });
    return action;
  } catch (error : any) {
    console.error('Failed to log admin action:', error);
    throw error;
  }
};

// Static method to get admin activity
AdminActionSchema.statics.getAdminActivity = async function (
  adminId: string,
  limit: number = 50
) {
  return this.find({ adminId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// Static method to get actions by type
AdminActionSchema.statics.getActionsByType = async function (
  actionType: string,
  limit: number = 100
) {
  return this.find({ actionType })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// Static method to get target history
AdminActionSchema.statics.getTargetHistory = async function (
  targetModel: string,
  targetId: string
) {
  return this.find({ targetModel, targetId })
    .sort({ createdAt: -1 })
    .lean();
};

const AdminAction = mongoose.model<IAdminAction>('AdminAction', AdminActionSchema);

export default AdminAction;