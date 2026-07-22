import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  notificationId: string;
  userId: string;
  type: string;
  category: string;
  title: string;
  message: string;
  priority: string;
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  data?: any;
  actionUrl?: string;
  expiresAt?: Date;
  status: {
    read: boolean;
    readAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    notificationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      required: true,
    },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
    },
    data: {
      type: Schema.Types.Mixed,
    },
    actionUrl: {
      type: String,
    },
    expiresAt: {
      type: Date,
    },
    status: {
      read: { type: Boolean, default: false },
      readAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ userId: 1, 'status.read': 1, createdAt: -1 });

const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;
