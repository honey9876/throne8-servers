import mongoose, { Schema, Model } from 'mongoose';
import { INotification } from '../interfaces/INotification';
import { NotificationType } from '../enums/NotificationType.enum';
import { validId } from '@/shared/security';

interface INotificationMethods {
  markAsRead(): Promise<INotification>;
  isExpired(): boolean;
}

interface INotificationStatics {
  findUnreadByUser(userId: string, limit?: number): Promise<INotification[]>;
  markAllAsReadByUser(userId: string): Promise<number>;
  deleteOldNotifications(days?: number): Promise<number>;
  getUnreadCount(userId: string): Promise<number>;
}

type NotificationModel = Model<INotification, {}, INotificationMethods> & INotificationStatics;

const notificationSchema = new Schema(
  {
    notificationId: {
      type: String,
      required: true,
      default: (v: any) => validId(v),
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: [true, 'Notification type is required'],
    },
    recipient: {
      type: String,
      ref: 'User',
      required: [true, 'Recipient is required'],
    },
    sender: {
      type: String,
      ref: 'User',
      default: null,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    link: {
      type: String,
      default: null,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    metadata: {
      groupId: { type: String, ref: 'StudyGroup_Group', default: null },
      taskId: { type: String, ref: 'StudyGroup_Task', default: null },
      doubtId: { type: String, ref: 'StudyGroup_Doubt', default: null },
      messageId: { type: String, ref: 'StudyGroup_Message', default: null },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        (ret as any).id = (ret as any).notificationId;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

notificationSchema.index({ notificationId: 1 }, { unique: true });
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1 });
notificationSchema.index({ recipient: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ sender: 1 });

notificationSchema.virtual('senderDetails', {
  ref: 'User',
  localField: 'sender',
  foreignField: '_id',
  justOne: true,
  select: 'name avatar username',
});

notificationSchema.virtual('recipientDetails', {
  ref: 'User',
  localField: 'recipient',
  foreignField: '_id',
  justOne: true,
  select: 'name avatar username',
});

notificationSchema.virtual('isExpiredVirtual').get(function (this: INotification) {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

notificationSchema.methods.markAsRead = async function (this: INotification): Promise<INotification> {
  this.isRead = true;
  this.readAt = new Date();
  return await this.save();
};

notificationSchema.methods.isExpired = function (this: INotification): boolean {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

notificationSchema.statics.findUnreadByUser = async function (
  userId: string,
  limit: number = 20
) {
  return await this.find({ recipient: userId, isRead: false })
    .populate('sender', 'name avatar username')
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit);
};

notificationSchema.statics.markAllAsReadByUser = async function (
  userId: string
): Promise<number> {
  const result = await this.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  return result.modifiedCount;
};

notificationSchema.statics.deleteOldNotifications = async function (
  days: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    isRead: true,
  });
  return result.deletedCount;
};

notificationSchema.statics.getUnreadCount = async function (
  userId: string
): Promise<number> {
  return this.countDocuments({ recipient: userId, isRead: false });
};

notificationSchema.pre('save', function (this: INotification, next) {
  if (!this.expiresAt) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    this.expiresAt = expiryDate;
  }
  next();
});

const Notification = mongoose.model<INotification, NotificationModel>(
  'StudyGroup_Notification',
  notificationSchema
);

export default Notification;