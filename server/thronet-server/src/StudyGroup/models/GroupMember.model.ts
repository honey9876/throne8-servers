/**
 * ====================================
 * GROUP MEMBER MODEL (WITH MODERATION FIELDS)
 * ====================================
 */

import mongoose, { Schema } from 'mongoose';
import { IGroupMember, MemberRole, MemberStatus } from '../interfaces/IGroupMember';

const groupMemberSchema = new Schema<IGroupMember>(
  {
    groupId: {
      type: String,
      ref: 'StudyGroup_Group',   
      required: true,
    },
    userId: {
      type: String,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(MemberRole),
      default: MemberRole.MEMBER,
    },
    status: {
      type: String,
      enum: Object.values(MemberStatus),
      default: MemberStatus.ACTIVE,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    
    // ============================================
    // MODERATION FIELDS (Phase 15)
    // ============================================
    
    // Warning System
    warnings: [{
      warnedBy: {
        type: String,
        ref: 'User',
        required: true,
      },
      reason: {
        type: String,
        required: true,
        maxlength: 500,
      },
      warnedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    
    warningCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    // Ban Information
    bannedAt: {
      type: Date,
      default: null,
    },
    bannedBy: {
      type: String,
      ref: 'User',
      default: null,
    },
    banReason: {
      type: String,
      maxlength: 500,
      default: null,
    },
    banPermanent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Indexes
 */
groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true }); // was: group, user
groupMemberSchema.index({ groupId: 1 });  // was: group
groupMemberSchema.index({ userId: 1 });   // was: user
groupMemberSchema.index({ role: 1 });
groupMemberSchema.index({ status: 1 });
groupMemberSchema.index({ warningCount: 1 });

/**
 * Virtual: Check if member is banned
 */
groupMemberSchema.virtual('isBanned').get(function () {
  return this.status === MemberStatus.BANNED;
});

/**
 * Virtual: Check if member has warnings
 */
groupMemberSchema.virtual('hasWarnings').get(function () {
  return (this.warningCount || 0) > 0;
});

/**
 * Method: Add warning to member
 */
groupMemberSchema.methods.addWarning = async function (warnedBy: string, reason: string) {
  this.warnings.push({
    warnedBy,
    reason,
    warnedAt: new Date(),
  });
  this.warningCount = (this.warningCount || 0) + 1;
  return await this.save();
};

/**
 * Method: Clear all warnings
 */
groupMemberSchema.methods.clearWarnings = async function () {
  this.warnings = [];
  this.warningCount = 0;
  return await this.save();
};

const GroupMember = mongoose.model<IGroupMember>('StudyGroup_GroupMember', groupMemberSchema);

export default GroupMember;