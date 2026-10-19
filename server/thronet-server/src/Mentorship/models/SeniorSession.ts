import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import {
  ISeniorSession,
  ISeniorSessionBooking,
  SeniorSessionType,
  SeniorSessionStatus,
} from '../interface/seniorSession.types';

/**
 * Mongoose document type
 */
export interface SeniorSessionDocument
  extends ISeniorSession,
    Document {
  sessionId: string;
}

/**
 * Booking sub-schema
 *
 * Each object represents one junior
 * registered for this senior session.
 */
const SeniorSessionPaymentSchema = new Schema<
  NonNullable<ISeniorSessionBooking['payment']>
>(
  {
    status: {
      type: String,
    },

    method: {
      type: String,
    },
  },
  { _id: false }
);

const SeniorSessionPricingSchema = new Schema<
  NonNullable<ISeniorSessionBooking['pricing']>
>(
  {
    basePrice: {
      type: Number,
      min: 0,
    },

    platformFee: {
      type: Number,
      min: 0,
    },

    totalAmount: {
      type: Number,
      min: 0,
    },

    currency: {
      type: String,
      default: 'INR',
    },
  },
  { _id: false }
);

// Retained for legacy bookings only; new Senior Session bookings omit both subdocuments.
const SeniorSessionBookingSchema = new Schema<ISeniorSessionBooking>(
  {
    menteeId: {
      type: String,
      required: [true, 'Mentee ID is required'],
    },

    bookedBy: {
      type: String,
    },

    bookedAt: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: Object.values(SeniorSessionStatus),
      default: SeniorSessionStatus.UPCOMING,
    },

    slotTime: {
      type: String,
    },

    scheduledAt: {
      type: Date,
    },

    reminders: {
      h24: { type: Boolean, default: false },
      h1: { type: Boolean, default: false },
      m15: { type: Boolean, default: false },
      m5: { type: Boolean, default: false },
    },

    payment: {
      type: SeniorSessionPaymentSchema,
      default: undefined,
    },

    pricing: {
      type: SeniorSessionPricingSchema,
      default: undefined,
    },
  },
  {
    _id: true,
  }
);

/**
 * Senior Session Schema
 */
const SeniorSessionSchema = new Schema<SeniorSessionDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),

      validate: {
        validator: (value: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
          ),

        message: 'Invalid session UUID format',
      },
    },

    /**
     * Senior mentor who owns the session.
     *
     * This connects the session to the
     * Senior Mentor user.
     */
    mentorId: {
      type: String,
      required: [true, 'Mentor ID is required'],
      index: true,
    },

    sessionType: {
      type: String,
      enum: Object.values(SeniorSessionType),
      required: [true, 'Session type is required'],
      default: SeniorSessionType.GROUP,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(SeniorSessionStatus),
      required: true,
      default: SeniorSessionStatus.DRAFT,
      index: true,
    },

    scheduledAt: {
      type: Date,
      required: function (this: any) {
        return this.sessionType === SeniorSessionType.GROUP;
      },
      index: true,
    },

    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [15, 'Duration must be at least 15 minutes'],
      max: [240, 'Duration cannot exceed 240 minutes'],
    },

    timezone: {
      type: String,
      required: true,
      default: 'Asia/Kolkata',
    },

    title: {
      type: String,
      required: [true, 'Session title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    category: {
      type: String,
      trim: true,
      maxlength: [100, 'Category cannot exceed 100 characters'],
    },

    thumbnailImage: {
      type: String,
      trim: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: [200, 'Short description cannot exceed 200 characters'],
    },

    tags: {
      type: [String],
      default: [],
    },

    learningOutcomes: {
      type: [String],
      default: [],
    },

    prerequisites: {
      type: [String],
      default: [],
    },

    /**
     * All juniors registered for this session.
     *
     * Example:
     *
     * bookings: [
     *   Junior A,
     *   Junior B,
     *   Junior C
     * ]
     */
    bookings: {
      type: [SeniorSessionBookingSchema],
      default: [],
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

    toObject: {
      virtuals: true,
    },
  }
);

/**
 * Indexes
 */
SeniorSessionSchema.index({
  mentorId: 1,
  status: 1,
});

SeniorSessionSchema.index({
  scheduledAt: 1,
  status: 1,
});

SeniorSessionSchema.index({
  'bookings.menteeId': 1,
});

/**
 * Prevent model recompilation during hot reload
 */
const SeniorSession =
  mongoose.models.SeniorSession ||
  mongoose.model<SeniorSessionDocument>(
    'SeniorSession',
    SeniorSessionSchema
  );

export default SeniorSession;