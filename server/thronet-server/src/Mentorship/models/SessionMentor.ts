import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { SessionType } from '@/shared/constants/sessionTypes';
import { BookingStatus } from '@/shared/constants/bookingStatus';
import { ISessionMentor, PaymentStatus, PaymentMethod } from '@/Mentorship/interface/session.types';

export interface SessionMentorshipDocument extends Omit<ISessionMentor, '_id'>, Document {}

const SessionMentorSchema = new Schema<SessionMentorshipDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
      validate: {
        validator: (v: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
        message: 'Invalid session UUID format',
      },
    },
    mentorId: {
      type: String,
      required: [true, 'Mentor ID is required'],
      index: true,
    },
    menteeId: {
      type: String,
      default: null,
      index: true,
    },
    sessionType: {
      type: String,
      enum: Object.values(SessionType),
      required: [true, 'Session type is required'],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: [true, 'Scheduled time is required'],
      index: true,
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [0, 'Duration cannot be negative'],
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
    },
    startedAt: { type: Date },
    endedAt:   { type: Date },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    notes:       { type: String, trim: true },
    attachments: [String],
    thumbnailImage: { type: String },
    pricing: {
      basePrice:    { type: Number, required: true, min: 0 },
      platformFee:  { type: Number, required: true, min: 0 },
      totalAmount:  { type: Number, required: true, min: 0 },
      currency:     { type: String, default: 'INR' },
    },
    bookings: [
      {
        menteeId:       { type: String, required: true },
        bookedBy:       { type: String },
        bookedAt:       { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ['pending', 'confirmed', 'rescheduled', 'in_progress', 'cancelled', 'completed'],
          default: 'pending',
        },
        slotTime:       { type: String },
        scheduledAt:    { type: Date },
        availabilityId: { type: String },
        payment: {
          status: { type: String },
          method: { type: String },
        },
        pricing: {
          basePrice:   { type: Number, default: 0 },
          platformFee: { type: Number, default: 0 },
          totalAmount: { type: Number, default: 0 },
          currency:    { type: String, default: 'INR' },
        },
      },
    ],
    isBooked:       { type: Boolean, default: false, index: true },
    bookedBy:       { type: String, default: null },
    bookedAt:       { type: Date, default: null },
    slotTime:       { type: String },
    availabilityId: { type: String, index: true },
    progress: {
      totalSessionsBooked: { type: Number, default: 0 },
      completedSessions:   { type: Number, default: 0 },
      leftSessions:        { type: Number, default: 0 },
      totalTimeSpent:      { type: Number, default: 0 },
    },
    payment: {
      status: {
        type: String,
        enum: Object.values(PaymentStatus),
        default: PaymentStatus.PENDING,
        index: true,
      },
      method: {
        type: String,
        enum: Object.values(PaymentMethod),
        required: true,
      },
      transactionId: { type: String, index: true },
      paidAt:        { type: Date },
      refundAmount:  { type: Number, min: 0 },
      refundedAt:    { type: Date },
      refundReason:  { type: String },
    },
    meeting: {
      platform:     { type: String, enum: ['zoom', 'google_meet', 'daily_co', 'custom'] },
      meetingUrl:   { type: String },
      meetingId:    { type: String },
      passcode:     { type: String },
      recordingUrl: { type: String },
    },
    cancellation: {
      cancelledBy:    { type: String },
      cancelledAt:    { type: Date },
      reason:         { type: String },
      refundEligible: { type: Boolean, default: false },
    },
    reschedule: {
      count:              { type: Number, default: 0, min: 0 },
      lastRescheduledAt:  { type: Date },
      previousDates:      [Date],
      rescheduledBy:      { type: String },
      reason:             { type: String },
    },
    review: {
      mentorReview: { type: String },
      menteeReview: { type: String },
      rating:       { type: Number, min: 1, max: 5 },
      reviewedAt:   { type: Date },
    },

    completion: {
      completedAt:      { type: Date },
      actualDuration:   { type: Number },
      wasSuccessful:    { type: Boolean, default: true },
      followUpRequired: { type: Boolean, default: false },
      followUpNotes:    { type: String },
      leftAt:           { type: Date },
      leftEarlyReason:  { type: String },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret.sessionId;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes ─────────────────────────────────────────────
SessionMentorSchema.index({ mentorId: 1, status: 1 });
SessionMentorSchema.index({ menteeId: 1, status: 1 });
SessionMentorSchema.index({ mentorId: 1, scheduledAt: 1 });
SessionMentorSchema.index({ menteeId: 1, scheduledAt: 1 });
SessionMentorSchema.index({ status: 1, scheduledAt: 1 });
SessionMentorSchema.index({ 'payment.status': 1, 'payment.transactionId': 1 });
SessionMentorSchema.index({ sessionType: 1, status: 1 });
SessionMentorSchema.index({ scheduledAt: 1, status: 1 });
SessionMentorSchema.index({ sessionId: 1, mentorId: 1 });
SessionMentorSchema.index({ sessionId: 1, menteeId: 1 });
SessionMentorSchema.index({ sessionId: 1, status: 1 });
SessionMentorSchema.index({ mentorId: 1, createdAt: -1 });
SessionMentorSchema.index({ status: 1, createdAt: -1 });

// ── Virtuals ─────────────────────────────────────────────────────
SessionMentorSchema.virtual('isUpcoming').get(function () {
  return (
    this.scheduledAt > new Date() &&
    [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(this.status)
  );
});

SessionMentorSchema.virtual('isPast').get(function () {
  return this.scheduledAt < new Date();
});

SessionMentorSchema.virtual('canBeCancelled').get(function () {
  const hoursDiff = (this.scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
  return (
    hoursDiff >= 24 &&
    [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(this.status)
  );
});

// ── Pre-save ─────────────────────────────────────────────────────
SessionMentorSchema.pre('save', function (next) {
  if (this.isModified('pricing') && !this.pricing.platformFee) {
    this.pricing.platformFee = Math.round(this.pricing.basePrice * 0.15);
    this.pricing.totalAmount = this.pricing.basePrice + this.pricing.platformFee;
  }
  next();
});

// ── Instance Methods ─────────────────────────────────────────────
SessionMentorSchema.methods.confirmBooking = async function () {
  this.status = BookingStatus.CONFIRMED;
  return await this.save();
};

SessionMentorSchema.methods.startSession = async function () {
  this.status = BookingStatus.IN_PROGRESS;
  this.startedAt = new Date();
  if (this.bookings && this.bookings.length > 0) {
    this.bookings.forEach((b: any) => {
      if (b.status === 'confirmed' || b.status === 'rescheduled') {
        b.status = 'in_progress';
      }
    });
    this.markModified('bookings');
  }
  return await this.save();
};

SessionMentorSchema.methods.completeSession = async function (
  actualDuration?: number,
  wasSuccessful = true,
  followUpRequired = false,
  followUpNotes?: string
) {
  this.status = BookingStatus.COMPLETED;
  this.completion = {
    completedAt: new Date(),
    actualDuration: actualDuration ?? this.duration,
    wasSuccessful,
    followUpRequired,
    followUpNotes,
  };
  this.endedAt = new Date();

  // Cascade the completed status to the individual bookings
  if (this.bookings && this.bookings.length > 0) {
    this.bookings.forEach((b: any) => {
      if (b.status === 'in_progress' || b.status === 'confirmed' || b.status === 'rescheduled') {
        b.status = 'completed';
      }
    });
    this.markModified('bookings');
  }

  return await this.save();
};

SessionMentorSchema.methods.cancelSession = async function (
  cancelledBy: string,
  reason: string,
  refundEligible = false
) {
  this.status = BookingStatus.CANCELLED;
  if (this.bookings && this.bookings.length > 0) {
    this.bookings[0].status = 'cancelled';
  }
  this.cancellation = { cancelledBy, cancelledAt: new Date(), reason, refundEligible };
  return await this.save();
};

SessionMentorSchema.methods.rescheduleSession = async function (
  newScheduledAt: Date,
  rescheduledBy: string,
  reason: string
) {
  if (this.reschedule.count >= 2) throw new Error('Maximum reschedule limit reached');
  this.reschedule.previousDates.push(this.scheduledAt);
  this.scheduledAt = newScheduledAt;
  if (this.bookings && this.bookings.length > 0) {
    this.bookings[0].scheduledAt = newScheduledAt;
  }
  this.reschedule.count += 1;
  this.reschedule.lastRescheduledAt = new Date();
  this.reschedule.rescheduledBy = rescheduledBy;
  this.reschedule.reason = reason;
  this.status = BookingStatus.RESCHEDULED;
  return await this.save();
};

SessionMentorSchema.methods.markAsNoShow = async function () {
  this.status = BookingStatus.NO_SHOW;
  return await this.save();
};

SessionMentorSchema.methods.updatePaymentStatus = async function (
  status: PaymentStatus,
  transactionId?: string
) {
  this.payment.status = status;
  if (transactionId) this.payment.transactionId = transactionId;
  if (status === PaymentStatus.COMPLETED) this.payment.paidAt = new Date();
  return await this.save();
};

SessionMentorSchema.methods.processRefund = async function (
  refundAmount: number,
  reason: string
) {
  this.payment.status = PaymentStatus.REFUNDED;
  this.payment.refundAmount = refundAmount;
  this.payment.refundedAt = new Date();
  this.payment.refundReason = reason;
  this.status = BookingStatus.REFUNDED;
  return await this.save();
};

// Single addReview definition (duplicate removed)
SessionMentorSchema.methods.addReview = async function (
  rating: number,
  review: string,
  reviewerType: 'mentor' | 'mentee'
) {
  if (!this.review) this.review = {} as any;
  this.review.rating = rating;
  this.review.reviewedAt = new Date();
  if (reviewerType === 'mentor') {
    this.review.mentorReview = review;
  } else {
    this.review.menteeReview = review;
  }
  return await this.save();
};

SessionMentorSchema.methods.setMeetingDetails = async function (
  platform: string,
  meetingUrl: string,
  meetingId?: string,
  passcode?: string
) {
  this.meeting = { platform: platform as any, meetingUrl, meetingId, passcode };
  return await this.save();
};

// ── Static Methods ───────────────────────────────────────────────
SessionMentorSchema.statics.findUpcoming = function (userId: string, role: 'mentor' | 'mentee') {
  const query: any = {
    scheduledAt: { $gt: new Date() },
    status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    [role === 'mentor' ? 'mentorId' : 'menteeId']: userId,
  };
  return this.find(query).sort({ scheduledAt: 1 });
};

SessionMentorSchema.statics.findCompleted = function (userId: string, role: 'mentor' | 'mentee') {
  return this.find({
    status: BookingStatus.COMPLETED,
    [role === 'mentor' ? 'mentorId' : 'menteeId']: userId,
  }).sort({ scheduledAt: -1 });
};

SessionMentorSchema.statics.findByDateRange = function (
  userId: string,
  role: 'mentor' | 'mentee',
  startDate: Date,
  endDate: Date
) {
  return this.find({
    scheduledAt: { $gte: startDate, $lte: endDate },
    [role === 'mentor' ? 'mentorId' : 'menteeId']: userId,
  }).sort({ scheduledAt: 1 });
};

SessionMentorSchema.statics.getSessionStats = async function (
  userId: string,
  role: 'mentor' | 'mentee'
) {
  const matchField = role === 'mentor' ? 'mentorId' : 'menteeId';
  const stats = await this.aggregate([
    { $match: { [matchField]: userId } },
    {
      $group: {
        _id: null,
        total:        { $sum: 1 },
        completed:    { $sum: { $cond: [{ $eq: ['$status', BookingStatus.COMPLETED] }, 1, 0] } },
        cancelled:    { $sum: { $cond: [{ $eq: ['$status', BookingStatus.CANCELLED] }, 1, 0] } },
        upcoming: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$scheduledAt', new Date()] },
                  { $in: ['$status', [BookingStatus.PENDING, BookingStatus.CONFIRMED]] },
                ],
              },
              1, 0,
            ],
          },
        },
        totalRevenue: { $sum: '$pricing.basePrice' },
      },
    },
  ]);
  return stats[0] || { total: 0, completed: 0, cancelled: 0, upcoming: 0, totalRevenue: 0 };
};

export default mongoose.model<SessionMentorshipDocument>('SessionMentor', SessionMentorSchema);