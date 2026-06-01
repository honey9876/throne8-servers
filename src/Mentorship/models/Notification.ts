// src/models/Notification.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  notificationId: string; // Unique identifier for notification
  userId: string;
  type: string;
  category: string;
  title: string;
  message: string;
  data?: any;
  actionUrl?: string;
  actionText?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  status: {
    sent: boolean;
    read: boolean;
    clicked: boolean;
    sentAt?: Date;
    readAt?: Date;
    clickedAt?: Date;
  };
  metadata?: {
    relatedModel?: string;
    relatedId?: string;
    sender?: string;
    campaignId?: string;
  };
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    // Schema mein sabse upar add karo
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
      enum: [
        // Booking notifications
        'booking_confirmed',
        'booking_reminder',
        'booking_cancelled',
        'booking_rescheduled',

        // Session notifications
        'session_starting_soon',
        'session_started',
        'session_completed',
        'session_feedback_request',

        // Payment notifications
        'payment_received',
        'payment_failed',
        'refund_processed',
        'invoice_generated',

        // Mentor notifications
        'new_booking_request',
        'booking_cancelled_by_mentee',
        'review_received',
        'query_received',

        // User notifications
        'profile_updated',
        'password_changed',
        'email_verified',
        'account_suspended',

        // Waitlist notifications
        'waitlist_spot_available',
        'waitlist_joined',

        // Package notifications
        'package_purchased',
        'package_expiring_soon',
        'package_expired',

        // System notifications
        'maintenance_scheduled',
        'feature_announcement',
        'promotion',
        'achievement_unlocked',

        // Other
        'custom',
      ],
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'booking',
        'session',
        'payment',
        'account',
        'system',
        'promotion',
        'reminder',
        'alert',
      ],
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    data: {
      type: Schema.Types.Mixed,
    },
    actionUrl: {
      type: String,
    },
    actionText: {
      type: String,
      maxlength: 50,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    channels: {
      inApp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
      sms: {
        type: Boolean,
        default: false,
      },
      push: {
        type: Boolean,
        default: false,
      },
    },
    status: {
      sent: {
        type: Boolean,
        default: false,
        index: true,
      },
      read: {
        type: Boolean,
        default: false,
        index: true,
      },
      clicked: {
        type: Boolean,
        default: false,
      },
      sentAt: Date,
      readAt: Date,
      clickedAt: Date,
    },
    metadata: {
      relatedModel: String,
      relatedId: String,
      sender: String,
      campaignId: String,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  // ✅ Replace with
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        ret.id = ret.notificationId;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      }
    }
},
);

// Compound indexes
NotificationSchema.index({ userId: 1, 'status.read': 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, category: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, priority: 1, 'status.read': 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Method to mark as sent
NotificationSchema.methods.markAsSent = async function (): Promise<void> {
  this.status.sent = true;
  this.status.sentAt = new Date();
  await this.save();
};

// Method to mark as read
NotificationSchema.methods.markAsRead = async function (): Promise<void> {
  if (!this.status.read) {
    this.status.read = true;
    this.status.readAt = new Date();
    await this.save();
  }
};

// Method to mark as clicked
NotificationSchema.methods.markAsClicked = async function (): Promise<void> {
  if (!this.status.clicked) {
    this.status.clicked = true;
    this.status.clickedAt = new Date();
    await this.save();
  }
};

// Static method to create notification
NotificationSchema.statics.createNotification = async function (
  notificationData: Partial<INotification>
) {
  const notification = await this.create(notificationData);
  return notification;
};

// Static method to get unread count
NotificationSchema.statics.getUnreadCount = async function (
  userId: string
): Promise<number> {
  return this.countDocuments({
    userId,
    'status.read': false,
  });
};

// Static method to mark all as read
NotificationSchema.statics.markAllAsRead = async function (
  userId: string
): Promise<number> {
  const result = await this.updateMany(
    { userId, 'status.read': false },
    {
      $set: {
        'status.read': true,
        'status.readAt': new Date(),
      },
    }
  );

  return result.modifiedCount;
};

// Static method to delete old notifications
NotificationSchema.statics.deleteOldNotifications = async function (
  daysOld: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await this.deleteMany({
    'status.read': true,
    createdAt: { $lt: cutoffDate },
  });

  return result.deletedCount;
};

// Static method to get user notifications
NotificationSchema.statics.getUserNotifications = async function (
  userId: string,
  options: {
    unreadOnly?: boolean;
    category?: string;
    limit?: number;
    skip?: number;
  } = {}
) {
  const query: any = { userId };

  if (options.unreadOnly) {
    query['status.read'] = false;
  }

  if (options.category) {
    query.category = options.category;
  }

  return this.find(query)
    .sort({ priority: -1, createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0)
    .lean();
};

const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;