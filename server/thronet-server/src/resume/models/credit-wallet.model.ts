import mongoose, { Schema, Document } from "mongoose";

import { CreditType } from "../config/plans";

/**
 * One wallet per user holding the remaining AI credits (free and bought).
 * Credits never expire; they are only spent. Balances are changed only
 * with atomic $inc updates from services/credit.service.ts.
 */
export interface ICreditWallet extends Document, Record<CreditType, number> {
  // Throne8 userId is a UUID string (never an ObjectId)
  userId: string;

  /** Set once the one-time free credits have been put in this wallet. */
  freeGranted: boolean;

  /** Payments whose credits were already added, so a grant can never repeat. */
  appliedPaymentIds: string[];

  createdAt: Date;
  updatedAt: Date;
}

const credit = { type: Number, default: 0, min: 0 };

const creditWalletSchema = new Schema<ICreditWallet>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    resumeRuns: credit,
    resumeEdits: credit,
    coverRuns: credit,
    coverEdits: credit,
    interview5: credit,
    interview10: credit,
    interview15: credit,

    freeGranted: {
      type: Boolean,
      default: false,
    },

    appliedPaymentIds: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

export const CreditWallet =
  (mongoose.models["CreditWallet"] as mongoose.Model<ICreditWallet>) ||
  mongoose.model<ICreditWallet>("CreditWallet", creditWalletSchema);
