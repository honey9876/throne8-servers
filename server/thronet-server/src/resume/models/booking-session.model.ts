import mongoose, { Schema, Document } from "mongoose";

export const BookingTimeSlot = {
  MORNING: "morning",
  AFTERNOON: "afternoon",
  EVENING: "evening",
  NIGHT: "night",
  CUSTOM: "custom",
} as const;

export const BookingInterviewType = {
  MOCK_INTERVIEW: "mock_interview",
  RESUME_REVIEW: "resume_review",
  PLACEMENT_GUIDANCE: "placement_guidance",
} as const;

export const BookingStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
} as const;

export interface IBookingFeedback {
  interviewFocus: string;
  score: number;
  comment: string;
  interviewerName: string;
  completedAt: Date;
}

export interface IBookingSession extends Document {
  userId: string;
  resumeId?: mongoose.Types.ObjectId;

  preferredDate: Date;
  timeSlot: (typeof BookingTimeSlot)[keyof typeof BookingTimeSlot];
  customTimeText?: string;
  
  interviewType: (typeof BookingInterviewType)[keyof typeof BookingInterviewType];
  notes?: string;
  
  status: (typeof BookingStatus)[keyof typeof BookingStatus];

  confirmedDateTime?: Date;
  meetingLink?: string;
  adminNotes?: string;

  cancelReason?: string;
  rescheduleSuggestion?: {
    suggestedDate?: Date;
    suggestedTimeText?: string;
    contactNote?: string;
  };

  feedback?: IBookingFeedback;

  createdAt: Date;
  updatedAt: Date;
}

const bookingFeedbackSchema = new Schema<IBookingFeedback>(
  {
    interviewFocus: { type: String, default: "" },
    score: { type: Number, default: 0 },
    comment: { type: String, default: "" },
    interviewerName: { type: String, default: "" },
    completedAt: { type: Date },
  },
  { _id: false },
);

const rescheduleSuggestionSchema = new Schema(
  {
    suggestedDate: { type: Date },
    suggestedTimeText: { type: String },
    contactNote: { type: String },
  },
  { _id: false },
);

const bookingSessionSchema = new Schema<IBookingSession>(
  {
    userId: {
      type: String,
      required: true,
    },
    resumeId: {
      type: Schema.Types.ObjectId,
      ref: "ResumeBuilder",
    },
    preferredDate: {
      type: Date,
      required: true,
    },
    timeSlot: {
      type: String,
      enum: Object.values(BookingTimeSlot),
      required: true,
    },
    customTimeText: {
      type: String,
    },
    interviewType: {
      type: String,
      enum: Object.values(BookingInterviewType),
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
    },
    confirmedDateTime: {
      type: Date,
    },
    meetingLink: {
      type: String,
    },
    adminNotes: {
      type: String,
    },
    cancelReason: {
      type: String,
    },
    rescheduleSuggestion: {
      type: rescheduleSuggestionSchema,
    },
    feedback: {
      type: bookingFeedbackSchema,
    },
  },
  {
    timestamps: true,
  },
);

export const BookingSession =
  (mongoose.models["BookingSession"] as mongoose.Model<IBookingSession>) ||
  mongoose.model<IBookingSession>(
    "BookingSession",
    bookingSessionSchema,
  );
