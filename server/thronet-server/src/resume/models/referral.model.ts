import mongoose, { Schema, Document } from "mongoose";

/**
 * One document per user: that user's personal referral code.
 * Created lazily the first time the user opens the referral card.
 * The number of successful referrals is NOT stored here. It is counted
 * from the Referral collection, so it can never drift out of sync.
 */
export interface IReferralProfile extends Document {
  // Throne8 userId is a UUID string (never an ObjectId)
  userId: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

const referralProfileSchema = new Schema<IReferralProfile>(
  {
    userId: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true, uppercase: true },
  },
  { timestamps: true },
);

export const ReferralProfile =
  (mongoose.models["ReferralProfile"] as mongoose.Model<IReferralProfile>) ||
  mongoose.model<IReferralProfile>("ReferralProfile", referralProfileSchema);

/**
 * One document per referred user.
 *  pending   = saved, credits not fully applied yet (retried if stuck)
 *  completed = counts toward the sharer's goal
 *  flagged   = looked like abuse, saved for review, never counted
 */
export type ReferralStatus = "pending" | "completed" | "flagged";

export interface IReferral extends Document {
  referrerId: string;
  referredUserId: string;
  code: string;
  status: ReferralStatus;
  flagReason?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferral>(
  {
    referrerId: { type: String, required: true, index: true },
    // unique: one new user can be referred (and counted) only once, ever
    referredUserId: { type: String, required: true, unique: true },
    code: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "flagged"],
      default: "pending",
      index: true,
    },
    flagReason: { type: String },
    ip: { type: String },
  },
  { timestamps: true },
);

// Used for the per-IP abuse check
referralSchema.index({ referrerId: 1, ip: 1 });

export const Referral =
  (mongoose.models["Referral"] as mongoose.Model<IReferral>) ||
  mongoose.model<IReferral>("Referral", referralSchema);
