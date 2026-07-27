import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IGroup } from '../interfaces/IGroup';
import { GroupCategory } from '../enums/GroupCategory.enum';
import { GroupVisibility } from '../enums/GroupVisibility.enum';
import { GROUP_CONSTANTS } from '../utils/constants';
import crypto from 'crypto';

// IGroup interface mein naye moderation fields nahi hain.
// Schema ko any se type karo aur model mein IGroup use karo —
// yeh TypeScript ko satisfy karta hai bina IGroup tod ke.
type GroupDocument = IGroup & Document;

const groupSchema = new Schema(
  {
    groupId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    title: {
      type: String,
      required: [true, 'Group title is required'],
      trim: true,
      minlength: [GROUP_CONSTANTS.TITLE_MIN_LENGTH, `Title must be at least ${GROUP_CONSTANTS.TITLE_MIN_LENGTH} characters`],
      maxlength: [GROUP_CONSTANTS.TITLE_MAX_LENGTH, `Title must not exceed ${GROUP_CONSTANTS.TITLE_MAX_LENGTH} characters`],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [GROUP_CONSTANTS.DESCRIPTION_MAX_LENGTH, `Description must not exceed ${GROUP_CONSTANTS.DESCRIPTION_MAX_LENGTH} characters`],
    },
    category: {
      type: String,
      enum: Object.values(GroupCategory),
      required: [true, 'Group category is required'],
    },
    visibility: {
      type: String,
      enum: Object.values(GroupVisibility),
      default: GroupVisibility.PUBLIC,
    },
    avatar:     { type: String, default: null },
    coverImage: { type: String, default: null },
    capacity: {
      type: Number,
      default: GROUP_CONSTANTS.DEFAULT_CAPACITY,
      min: [GROUP_CONSTANTS.MIN_CAPACITY, `Capacity must be at least ${GROUP_CONSTANTS.MIN_CAPACITY}`],
      max: [GROUP_CONSTANTS.MAX_CAPACITY, `Capacity cannot exceed ${GROUP_CONSTANTS.MAX_CAPACITY}`],
    },
    currentMemberCount: { type: Number, default: 1, min: 0 },
    leaderId: {
      type: String,
      ref: 'User',
      required: true,
    },
    goalHours: {
      type: Number,
      min: [GROUP_CONSTANTS.GOAL_HOURS_MIN, `Goal hours must be at least ${GROUP_CONSTANTS.GOAL_HOURS_MIN}`],
      max: [GROUP_CONSTANTS.GOAL_HOURS_MAX, `Goal hours cannot exceed ${GROUP_CONSTANTS.GOAL_HOURS_MAX}`],
    },
    tags:    { type: [String], default: [] },
    joinCode:{ type: String, unique: true, sparse: true },
    isActive:{ type: Boolean, default: true },

    cameraRequired:      { type: Boolean, default: false },
    attendanceRequired:  { type: Boolean, default: false },
    minAttendancePercent:{
      type: Number,
      default: null,
      min: [50, 'Minimum attendance must be at least 50%'],
      max: [100, 'Minimum attendance cannot exceed 100%'],
    },
    groupScore:       { type: Number, default: 0 },
    lastScoreUpdated: { type: Date, default: Date.now },

    // ── Moderation ────────────────────────────────────────────────
    rules: {
      type: [String],
      default: [],
      validate: {
        validator: (rules: string[]) => rules.length <= 20,
        message: 'Maximum 20 rules allowed',
      },
    },
    rulesUpdatedAt: { type: Date, default: null },
    rulesUpdatedBy: { type: String, ref: 'User', default: null },

    moderationLogs: [
      {
        action: {
          type: String,
          enum: ['kick', 'ban', 'unban', 'warn', 'delete_message'],
          required: true,
        },
        moderator: { type: String, ref: 'User', required: true },
        target:    { type: String, ref: 'User', required: true },
        reason:    { type: String, maxlength: 500 },
        permanent: { type: Boolean, default: false },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    bannedUsers: [
      {
        user:      { type: String, ref: 'User', required: true },
        bannedBy:  { type: String, ref: 'User', required: true },
        reason:    { type: String, required: true, maxlength: 500 },
        bannedAt:  { type: Date, default: Date.now },
        permanent: { type: Boolean, default: true },
      },
    ],

    reports: [
      {
        reporter:     { type: String, ref: 'User', required: true },
        reportedUser: { type: String, ref: 'User', required: true },
        reason: {
          type: String,
          required: true,
          enum: ['spam', 'harassment', 'inappropriate', 'other'],
        },
        description: { type: String, required: true, maxlength: 1000 },
        status: {
          type: String,
          enum: ['pending', 'resolved', 'dismissed'],
          default: 'pending',
        },
        reportedAt:  { type: Date, default: Date.now },
        resolvedAt:  { type: Date, default: null },
        resolvedBy:  { type: String, ref: 'User', default: null },
      },
    ],

    messageReports: [
      {
        reporter:      { type: String, ref: 'User', required: true },
        messageId:     { type: String, ref: 'Message', required: true },
        messageSender: { type: String, ref: 'User', required: true },
        reason: {
          type: String,
          required: true,
          enum: ['spam', 'harassment', 'inappropriate', 'other'],
        },
        description: { type: String, required: true, maxlength: 1000 },
        status: {
          type: String,
          enum: ['pending', 'resolved', 'dismissed'],
          default: 'pending',
        },
        reportedAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date, default: null },
        resolvedBy: { type: String, ref: 'User', default: null },
      },
    ],
  },
  {
    timestamps: true,
   toJSON: {
  virtuals: true,
  transform: (_doc, ret) => {
    const r = ret as any;
    r.id = r.groupId;
    delete r._id;
    delete r.__v;
    return r;
  },
},
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────
// groupSchema.index({ groupId: 1 }, { unique: true });
groupSchema.index({ title: 'text', description: 'text' });
groupSchema.index({ category: 1 });
groupSchema.index({ visibility: 1 });
groupSchema.index({ leaderId: 1 });
groupSchema.index({ isActive: 1 });
groupSchema.index({ createdAt: -1 });
// groupSchema.index({ joinCode: 1 }, { sparse: true });
groupSchema.index({ 'bannedUsers.user': 1 });
groupSchema.index({ 'reports.status': 1 });
groupSchema.index({ 'messageReports.status': 1 });

// ── Pre-save ─────────────────────────────────────────────────────
groupSchema.pre('save', function (this: any, next) {
  if (this.visibility === GroupVisibility.PRIVATE && !this.joinCode) {
    const bytes = Buffer.allocUnsafe(4);
    crypto.randomFillSync(bytes);
    this.joinCode = bytes.toString('hex').toUpperCase();
  }
  next();
});

// ── Virtuals ─────────────────────────────────────────────────────
groupSchema.virtual('pendingReportsCount').get(function (this: any) {
  const user    = (this.reports ?? []).filter((r: any) => r.status === 'pending').length;
  const message = (this.messageReports ?? []).filter((r: any) => r.status === 'pending').length;
  return user + message;
});

groupSchema.virtual('bannedUsersCount').get(function (this: any) {
  return (this.bannedUsers ?? []).length;
});

const Group = mongoose.model<GroupDocument>('StudyGroup_Group', groupSchema);

export default Group;