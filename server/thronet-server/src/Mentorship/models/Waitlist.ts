// src/models/Waitlist.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Waitlist Status
 */
export enum WaitlistStatus {
  ACTIVE = 'active',
  NOTIFIED = 'notified',
  BOOKED = 'booked',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * Waitlist Interface
 */
export interface IWaitlist extends Document {
  _id: mongoose.Types.ObjectId;
  waitlistId: string; // Unique identifier for waitlist entry

  // User & Mentor
  userId: string;
  mentorId: string;

  // Preferences
  preferredDates: Date[];
  preferredTimeSlots: string[]; // ['09:00-12:00', '14:00-18:00']
  sessionType: string;
  timezone: string;

  // Waitlist info
  position: number;
  status: WaitlistStatus;
  priority: number; // Higher priority users notified first

  // Notification tracking
  notifiedAt?: Date;
  notificationSent: boolean;
  bookingWindowExpiresAt?: Date; // 48 hours to book after notification

  // Booking reference
  sessionId?: string;
  bookedAt?: Date;

  // Additional info
  notes?: string;
  cancelReason?: string;

  // Metadata
  expiresAt: Date; // Auto-remove after 7 days
  createdAt: Date;
  updatedAt: Date;

  // Methods
  notify(): Promise<void>;
  markAsBooked(sessionId: mongoose.Types.ObjectId): Promise<void>;
  markAsExpired(): Promise<void>;
  cancel(reason: string): Promise<void>;
  isBookingWindowExpired(): boolean;
}

/**
 * Waitlist Schema
 */
const WaitlistSchema = new Schema<IWaitlist>(
  {
    // Schema mein sabse upar add karo
    waitlistId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    mentorId: {
      type: String,
      ref: 'Mentor',
      required: [true, 'Mentor ID is required'],
      index: true,
    },
    preferredDates: [
      {
        type: Date,
        required: true,
      },
    ],
    preferredTimeSlots: [
      {
        type: String,
        trim: true,
      },
    ],
    sessionType: {
      type: String,
      required: [true, 'Session type is required'],
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
    },
    position: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(WaitlistStatus),
      default: WaitlistStatus.ACTIVE,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    notifiedAt: Date,
    notificationSent: {
      type: Boolean,
      default: false,
    },
    bookingWindowExpiresAt: Date,
    sessionId: {
      type: String,
      ref: 'Session',
    },
    bookedAt: Date,
    notes: String,
    cancelReason: String,
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        ret.id = ret.waitlistId;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      }
    },
    toObject: { virtuals: true },
  }
);

/**
 * Compound Indexes
 */
WaitlistSchema.index({ mentorId: 1, status: 1, position: 1 });
WaitlistSchema.index({ userId: 1, mentorId: 1, status: 1 });
WaitlistSchema.index({ status: 1, priority: -1, position: 1 });
WaitlistSchema.index({ expiresAt: 1, status: 1 });
WaitlistSchema.index({ bookingWindowExpiresAt: 1, status: 1 });

/**
 * Pre-save middleware - Set expiry date
 */
WaitlistSchema.pre('save', function (next) {
  // Always set expiresAt if not present
  if (!this.expiresAt) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // 7 days expiry
    this.expiresAt = expiryDate;
  }
  next();
});

/**
 * Method: Notify user about availability
 */
WaitlistSchema.methods.notify = async function (): Promise<void> {
  if (this.status !== WaitlistStatus.ACTIVE) {
    throw new Error('Waitlist entry is not active');
  }

  this.status = WaitlistStatus.NOTIFIED;
  this.notifiedAt = new Date();
  this.notificationSent = true;

  // Set 48-hour booking window
  const bookingWindow = new Date();
  bookingWindow.setHours(bookingWindow.getHours() + 48);
  this.bookingWindowExpiresAt = bookingWindow;

  await this.save();
};

/**
 * Method: Mark as booked
 */
WaitlistSchema.methods.markAsBooked = async function (
  sessionId: mongoose.Types.ObjectId
): Promise<void> {
  if (this.status !== WaitlistStatus.NOTIFIED && this.status !== WaitlistStatus.ACTIVE) {
    throw new Error('Cannot mark this waitlist entry as booked');
  }

  this.status = WaitlistStatus.BOOKED;
  this.sessionId = sessionId;
  this.bookedAt = new Date();

  await this.save();
};

/**
 * Method: Mark as expired
 */
WaitlistSchema.methods.markAsExpired = async function (): Promise<void> {
  if (this.status === WaitlistStatus.BOOKED || this.status === WaitlistStatus.CANCELLED) {
    return;
  }

  this.status = WaitlistStatus.EXPIRED;
  await this.save();
};

/**
 * Method: Cancel waitlist entry
 */
WaitlistSchema.methods.cancel = async function (reason: string): Promise<void> {
  if (this.status === WaitlistStatus.BOOKED) {
    throw new Error('Cannot cancel a booked waitlist entry');
  }

  this.status = WaitlistStatus.CANCELLED;
  this.cancelReason = reason;
  await this.save();
};

/**
 * Method: Check if booking window expired
 */
WaitlistSchema.methods.isBookingWindowExpired = function (): boolean {
  if (!this.bookingWindowExpiresAt) {
    return false;
  }
  return new Date() > this.bookingWindowExpiresAt;
};

/**
 * Virtual: Mentor reference
 */
WaitlistSchema.virtual('mentor', {
  ref: 'Mentor',
  localField: 'mentorId',
  foreignField: 'userId',
  justOne: true,
});

/**
 * Virtual: Session reference
 */
WaitlistSchema.virtual('session', {
  ref: 'Session',
  localField: 'sessionId',
  foreignField: 'sessionId',
  justOne: true,
});

/**
 * Static: Get next in line for mentor
 */
WaitlistSchema.statics.getNextInLine = async function (mentorId: string) {
  return await this.findOne({
    mentorId,
    status: WaitlistStatus.ACTIVE,
    expiresAt: { $gt: new Date() },
  }).sort({ priority: -1, position: 1 });
};

/**
 * Static: Get user's position in waitlist
 */
WaitlistSchema.statics.getUserPosition = async function (userId: string, mentorId: string) {
  const entry = await this.findOne({
    userId,
    mentorId,
    status: WaitlistStatus.ACTIVE,
  });

  if (!entry) {
    return null;
  }

  const totalAhead = await this.countDocuments({
    mentorId,
    status: WaitlistStatus.ACTIVE,
    $or: [
      { priority: { $gt: entry.priority } },
      { priority: entry.priority, position: { $lt: entry.position } },
    ],
  });

  return {
    position: totalAhead + 1,
    waitlistEntry: entry,
  };
};

/**
 * Static: Expire old entries
 */
WaitlistSchema.statics.expireOldEntries = async function () {
  const now = new Date();

  // Expire entries past their expiry date
  const expiredByDate = await this.updateMany(
    {
      status: WaitlistStatus.ACTIVE,
      expiresAt: { $lt: now },
    },
    {
      $set: { status: WaitlistStatus.EXPIRED },
    }
  );

  // Expire notified entries with expired booking window
  const expiredByWindow = await this.updateMany(
    {
      status: WaitlistStatus.NOTIFIED,
      bookingWindowExpiresAt: { $lt: now },
    },
    {
      $set: { status: WaitlistStatus.EXPIRED },
    }
  );

  return {
    expiredByDate: expiredByDate.modifiedCount,
    expiredByWindow: expiredByWindow.modifiedCount,
  };
};

/**
 * Static: Reorder positions after removal
 */
WaitlistSchema.statics.reorderPositions = async function (mentorId: string) {
  const activeEntries = await this.find({
    mentorId,
    status: WaitlistStatus.ACTIVE,
  }).sort({ priority: -1, position: 1 });

  // for (let i = 0; i < activeEntries.length; i++) {
  //   activeEntries[i].position = i + 1;
  //   await activeEntries[i].save();
  // }

  // ✅ Fix — bulkWrite use karo
  const bulkOps = activeEntries.map((entry: any, i: any) => ({
    updateOne: {
      filter: { waitlistId: entry.waitlistId },
      update: { $set: { position: i + 1 } }
    }
  }));
  await Waitlist.bulkWrite(bulkOps);
};

/**
 * Create and export model
 */
const Waitlist: Model<IWaitlist> = mongoose.model<IWaitlist>('Waitlist', WaitlistSchema);

export default Waitlist;