import mongoose, { Schema, Document } from 'mongoose';

export interface ITimeSlot {
  _id: string;
  mentorId: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'available' | 'booked' | 'blocked' | 'expired';
  sessionId?: string;
  sessionType?: string;
  price?: number;
  timezone: string;
  metadata: {
    isRecurring: boolean;
    recurringPattern?: string;
    bufferBefore: number;
    bufferAfter: number;
    lastModifiedBy?: string;
    modificationReason?: string;
  };
  booking: {
    bookedAt?: Date;
    bookedBy?: string;
    expiresAt?: Date;
    confirmationRequired: boolean;
    autoConfirm: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeSlotDocument extends Omit<ITimeSlot, '_id'>, Document {
  fullStartDateTime: Date;
  fullEndDateTime: Date;
  isExpired: boolean;
  isBookable: boolean;
  isAvailable(): boolean;
  canBeBooked(): boolean;
  book(sessionId: string, bookedBy: string): Promise<TimeSlotDocument>;
  release(): Promise<TimeSlotDocument>;
  block(reason?: string, blockedBy?: string): Promise<TimeSlotDocument>;
  unblock(): Promise<TimeSlotDocument>;
  expire(): Promise<TimeSlotDocument>;
}

const TimeSlotSchema = new Schema<TimeSlotDocument>(
  {
    mentorId: {
      type: String,
      required: [true, 'Mentor ID is required'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      index: true,
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'],
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [15, 'Minimum duration is 15 minutes'],
      max: [240, 'Maximum duration is 240 minutes'],
    },
    status: {
      type: String,
      enum: ['available', 'booked', 'blocked', 'expired'],
      default: 'available',
      index: true,
    },
    sessionId: {
      type: String,
      index: true,
      sparse: true,
    },
    sessionType: {
      type: String,
      index: true,
    },
    price: {
      type: Number,
      min: 0,
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
    },
    metadata: {
      isRecurring: {
        type: Boolean,
        default: false,
      },
      recurringPattern: String,
      bufferBefore: {
        type: Number,
        default: 0,
        min: 0,
      },
      bufferAfter: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastModifiedBy: String,
      modificationReason: String,
    },
    booking: {
      bookedAt: Date,
      bookedBy: String,
      expiresAt: Date,
      confirmationRequired: {
        type: Boolean,
        default: false,
      },
      autoConfirm: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound Indexes for high performance
TimeSlotSchema.index({ mentorId: 1, date: 1, startTime: 1 }, { unique: true });
TimeSlotSchema.index({ mentorId: 1, status: 1, date: 1 });
TimeSlotSchema.index({ date: 1, status: 1 });
TimeSlotSchema.index({ sessionId: 1 }, { sparse: true });
TimeSlotSchema.index({ 'booking.expiresAt': 1 }, { sparse: true });

// Virtual: Full datetime
TimeSlotSchema.virtual('fullStartDateTime').get(function () {
  const [hours, minutes] = this.startTime.split(':').map(Number);
  const dateTime = new Date(this.date);
  dateTime.setHours(hours, minutes, 0, 0);
  return dateTime;
});

TimeSlotSchema.virtual('fullEndDateTime').get(function () {
  const [hours, minutes] = this.endTime.split(':').map(Number);
  const dateTime = new Date(this.date);
  dateTime.setHours(hours, minutes, 0, 0);
  return dateTime;
});

// Virtual: Check if expired
TimeSlotSchema.virtual('isExpired').get(function () {
  const slotDateTime = this.fullStartDateTime;
  return slotDateTime < new Date();
});

// Virtual: Check if bookable
TimeSlotSchema.virtual('isBookable').get(function () {
  return (
    this.status === 'available' &&
    !this.isExpired &&
    this.fullStartDateTime > new Date()
  );
});

// Pre-save: Auto-expire old slots
TimeSlotSchema.pre('save', function (next) {
  if (this.isExpired && this.status === 'available') {
    this.status = 'expired';
  }
  next();
});

// Instance Methods
TimeSlotSchema.methods.isAvailable = function (): boolean {
  return this.status === 'available' && !this.isExpired;
};

TimeSlotSchema.methods.canBeBooked = function (): boolean {
  return (
    this.status === 'available' &&
    !this.isExpired &&
    this.fullStartDateTime > new Date()
  );
};

TimeSlotSchema.methods.book = async function (sessionId: string, bookedBy: string) {
  if (!this.canBeBooked()) {
    throw new Error('Time slot is not available for booking');
  }

  this.status = 'booked';
  this.sessionId = sessionId;
  this.booking.bookedAt = new Date();
  this.booking.bookedBy = bookedBy;

  return await this.save();
};

TimeSlotSchema.methods.release = async function () {
  if (this.status !== 'booked') {
    throw new Error('Only booked slots can be released');
  }

  // Check if slot is still in future
  if (this.fullStartDateTime < new Date()) {
    this.status = 'expired';
  } else {
    this.status = 'available';
  }

  this.sessionId = undefined;
  this.booking.bookedAt = undefined;
  this.booking.bookedBy = undefined;

  return await this.save();
};

TimeSlotSchema.methods.block = async function (reason?: string, blockedBy?: string) {
  if (this.status === 'booked') {
    throw new Error('Cannot block a booked slot');
  }

  this.status = 'blocked';
  this.metadata.modificationReason = reason;
  this.metadata.lastModifiedBy = blockedBy;

  return await this.save();
};

TimeSlotSchema.methods.unblock = async function () {
  if (this.status !== 'blocked') {
    throw new Error('Only blocked slots can be unblocked');
  }

  if (this.isExpired) {
    this.status = 'expired';
  } else {
    this.status = 'available';
  }

  return await this.save();
};

TimeSlotSchema.methods.expire = async function () {
  this.status = 'expired';
  return await this.save();
};

// Static Methods
TimeSlotSchema.statics.findAvailableSlots = function (
  mentorId: string,
  startDate: Date,
  endDate: Date,
  sessionType?: string
) {
  const query: any = {
    mentorId,
    date: { $gte: startDate, $lte: endDate },
    status: 'available',
  };

  if (sessionType) {
    query.sessionType = sessionType;
  }

  return this.find(query).sort({ date: 1, startTime: 1 });
};

TimeSlotSchema.statics.generateSlots = async function (
  mentorId: string,
  dates: Date[],
  startTime: string,
  endTime: string,
  slotDuration: number,
  timezone: string,
  bufferBetween: number = 0
) {
  const slots = [];

  for (const date of dates) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    while (currentMinutes + slotDuration <= endMinutes) {
      const slotStart = `${String(Math.floor(currentMinutes / 60)).padStart(2, '0')}:${String(currentMinutes % 60).padStart(2, '0')}`;
      const slotEndMinutes = currentMinutes + slotDuration;
      const slotEnd = `${String(Math.floor(slotEndMinutes / 60)).padStart(2, '0')}:${String(slotEndMinutes % 60).padStart(2, '0')}`;

      slots.push({
        mentorId,
        date,
        startTime: slotStart,
        endTime: slotEnd,
        duration: slotDuration,
        status: 'available',
        timezone,
        metadata: {
          isRecurring: false,
          bufferBefore: 0,
          bufferAfter: bufferBetween,
        },
        booking: {
          confirmationRequired: false,
          autoConfirm: true,
        },
      });

      currentMinutes += slotDuration + bufferBetween;
    }
  }

  return await this.insertMany(slots, { ordered: false });
};

TimeSlotSchema.statics.expireOldSlots = async function () {
  const now = new Date();

  return await this.updateMany(
    {
      status: 'available',
      date: { $lt: now },
    },
    {
      $set: { status: 'expired' },
    }
  );
};

TimeSlotSchema.statics.cleanupExpiredSlots = async function (daysOld: number = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return await this.deleteMany({
    status: 'expired',
    date: { $lt: cutoffDate },
  });
};

export default mongoose.model<TimeSlotDocument>('TimeSlot', TimeSlotSchema);