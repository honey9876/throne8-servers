import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";

import { CreditAmounts } from "../config/plans";

export enum ResumePaymentStatus {
  CREATED = "created",
  PAID = "paid",
  FAILED = "failed",
  REFUNDED = "refunded",
}

export enum ResumeFulfillmentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  FULFILLED = "fulfilled",
  FAILED = "failed",
}

export interface IResumePayment extends Document {
  paymentId: string;
  userId: string;
  planId: string;

  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;

  /** Rupees. */
  amount: number;
  amountPaise: number;
  currency: string;

  /** Credits sold with this payment, copied from the catalog at order time. */
  credits: CreditAmounts;

  status: ResumePaymentStatus;
  method?: string;
  failureReason?: string;
  paidAt?: Date;

  fulfillment: {
    status: ResumeFulfillmentStatus;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
    attempts: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const resumePaymentSchema = new Schema<IResumePayment>(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
      default: () => randomUUID(),
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    planId: {
      type: String,
      required: true,
    },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },

    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    amount: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    credits: { type: Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: Object.values(ResumePaymentStatus),
      default: ResumePaymentStatus.CREATED,
      index: true,
    },

    method: { type: String },
    failureReason: { type: String },
    paidAt: { type: Date },

    fulfillment: {
      status: {
        type: String,
        enum: Object.values(ResumeFulfillmentStatus),
        default: ResumeFulfillmentStatus.PENDING,
      },
      startedAt: { type: Date },
      completedAt: { type: Date },
      error: { type: String },
      attempts: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

resumePaymentSchema.index({ userId: 1, createdAt: -1 });

export const ResumePayment =
  (mongoose.models["ResumePayment"] as mongoose.Model<IResumePayment>) ||
  mongoose.model<IResumePayment>("ResumePayment", resumePaymentSchema);
