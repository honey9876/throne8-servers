import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

interface SlotType {
  startTime: string;
  endTime: string;
  isBooked: boolean;
  sessionId?: string;
  isBlocked: boolean;
  blockReason?: string;
}

export interface IAvailability {
  _id: string;
  availabilityId: string;
  mentorId: string;
  date: Date;
  slots: SlotType[];
  dayOfWeek: string;
  isRecurring: boolean;
  timezone: string;
  overrideReason?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilityDocument extends Omit<IAvailability, '_id'>, Document {
  getAvailableSlots(): Array<{ startTime: string; endTime: string }>;
  bookSlot(startTime: string, sessionId: string): Promise<AvailabilityDocument>;
  releaseSlot(startTime: string): Promise<AvailabilityDocument>;
  blockSlot(startTime: string, reason?: string): Promise<AvailabilityDocument>;
  unblockSlot(startTime: string): Promise<AvailabilityDocument>;
}

const SlotSchema = new Schema<SlotType>(
  {
    startTime: {
      type: String,
      required: true,
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'],
    },
    endTime: {
      type: String,
      required: true,
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'],
    },
    isBooked:    { type: Boolean, default: false },
    sessionId:   { type: String },
    isBlocked:   { type: Boolean, default: false },
    blockReason: String,
  },
  { _id: false }
);

const AvailabilitySchema = new Schema<AvailabilityDocument>(
  {
    availabilityId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
      validate: {
        validator: (v: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
        message: 'Invalid availability UUID format',
      },
    },
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
    slots: { type: [SlotSchema], required: true },
    dayOfWeek: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      required: true,
      lowercase: true,
    },
    isRecurring: { type: Boolean, default: false },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
    },
    overrideReason: String,
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret.availabilityId;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes ─────────────────────────────────────────────
AvailabilitySchema.index({ mentorId: 1, date: 1 }, { unique: true });
AvailabilitySchema.index({ availabilityId: 1, isDeleted: 1 });
AvailabilitySchema.index({ mentorId: 1, date: 1, 'slots.isBooked': 1 });
AvailabilitySchema.index({ date: 1, mentorId: 1 });
AvailabilitySchema.index({ 'slots.sessionId': 1 }, { sparse: true });

// ── Virtuals ─────────────────────────────────────────────────────
AvailabilitySchema.virtual('isPast').get(function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return this.date < today;
});

AvailabilitySchema.virtual('totalSlots').get(function () {
  return this.slots.length;
});

AvailabilitySchema.virtual('availableSlotsCount').get(function () {
  return this.slots.filter((s: SlotType) => !s.isBooked && !s.isBlocked).length;
});

AvailabilitySchema.virtual('bookedSlotsCount').get(function () {
  return this.slots.filter((s: SlotType) => s.isBooked).length;
});

// ── Validation ───────────────────────────────────────────────────
AvailabilitySchema.pre('validate', function (next) {
  const sorted = [...this.slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endTime > sorted[i + 1].startTime) {
      return next(new Error('Slots cannot overlap'));
    }
  }
  next();
});

// ── Instance Methods ─────────────────────────────────────────────
AvailabilitySchema.methods.getAvailableSlots = function () {
  return this.slots
    .filter((s: SlotType) => !s.isBooked && !s.isBlocked)
    .map((s: SlotType) => ({ startTime: s.startTime, endTime: s.endTime }));
};

AvailabilitySchema.methods.bookSlot = async function (startTime: string, sessionId: string) {
  const slot = this.slots.find((s: SlotType) => s.startTime === startTime);
  if (!slot) throw new Error('Slot not found');
  if (slot.isBooked) throw new Error('Slot is already booked');
  if (slot.isBlocked) throw new Error('Slot is blocked');
  slot.isBooked = true;
  slot.sessionId = sessionId;
  return await this.save();
};

AvailabilitySchema.methods.releaseSlot = async function (startTime: string) {
  const slot = this.slots.find((s: SlotType) => s.startTime === startTime);
  if (!slot) throw new Error('Slot not found');
  slot.isBooked = false;
  slot.sessionId = undefined;
  return await this.save();
};

AvailabilitySchema.methods.blockSlot = async function (startTime: string, reason?: string) {
  const slot = this.slots.find((s: SlotType) => s.startTime === startTime);
  if (!slot) throw new Error('Slot not found');
  if (slot.isBooked) throw new Error('Cannot block a booked slot');
  slot.isBlocked = true;
  slot.blockReason = reason;
  return await this.save();
};

AvailabilitySchema.methods.unblockSlot = async function (startTime: string) {
  const slot = this.slots.find((s: SlotType) => s.startTime === startTime);
  if (!slot) throw new Error('Slot not found');
  slot.isBlocked = false;
  slot.blockReason = undefined;
  return await this.save();
};

// ── Static Methods ───────────────────────────────────────────────
AvailabilitySchema.statics.findByMentorAndDate = function (mentorId: string, date: Date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end   = new Date(date); end.setHours(23, 59, 59, 999);
  return this.findOne({ mentorId, date: { $gte: start, $lte: end } });
};

AvailabilitySchema.statics.findByMentorAndDateRange = function (
  mentorId: string, startDate: Date, endDate: Date
) {
  return this.find({ mentorId, date: { $gte: startDate, $lte: endDate } }).sort({ date: 1 });
};

AvailabilitySchema.statics.getUpcomingAvailability = function (mentorId: string, days = 30) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endDate = new Date(today); endDate.setDate(endDate.getDate() + days);
  return this.find({ mentorId, date: { $gte: today, $lte: endDate } }).sort({ date: 1 });
};

AvailabilitySchema.statics.createBulkAvailability = async function (
  mentorId: string,
  dates: Date[],
  slots: Array<{ startTime: string; endTime: string }>,
  timezone: string,
  isRecurring = false
) {
  const availabilities = dates.map((date) => ({
    mentorId,
    date,
    slots: slots.map((s) => ({ ...s, isBooked: false, isBlocked: false })),
    dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
    timezone,
    isRecurring,
  }));
  return await this.insertMany(availabilities, { ordered: false });
};

AvailabilitySchema.statics.deleteOldAvailability = async function (daysOld = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  return await this.deleteMany({ date: { $lt: cutoff } });
};

AvailabilitySchema.statics.getAvailabilityStats = async function (mentorId: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stats = await this.aggregate([
    { $match: { mentorId, date: { $gte: today } } },
    { $unwind: '$slots' },
    {
      $group: {
        _id: null,
        totalSlots:   { $sum: 1 },
        bookedSlots:  { $sum: { $cond: ['$slots.isBooked', 1, 0] } },
        blockedSlots: { $sum: { $cond: ['$slots.isBlocked', 1, 0] } },
        availableSlots: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$slots.isBooked', false] }, { $eq: ['$slots.isBlocked', false] }] },
              1, 0,
            ],
          },
        },
      },
    },
  ]);
  return stats[0] || { totalSlots: 0, bookedSlots: 0, blockedSlots: 0, availableSlots: 0 };
};

export default mongoose.model<AvailabilityDocument>('Availability', AvailabilitySchema);