import { AIUsage } from "../models/ai-usage.model";
import { CreditWallet, ICreditWallet } from "../models/credit-wallet.model";
import { InterviewSession } from "../models/interview-session.model";

import {
  COVER_EDIT_FEATURES,
  COVER_RUN_FEATURES,
  CREDIT_TYPES,
  CreditAmounts,
  CreditType,
  FREE_CREDITS,
  RESUME_EDIT_FEATURES,
  RESUME_RUN_FEATURES,
} from "../config/plans";
import { ApiError } from "../utils/ApiError";

export type CreditBalances = Record<CreditType, number>;

const LOW_CREDIT_MESSAGE: Record<CreditType, string> = {
  resumeRuns: "You have no AI resume credits left. Buy a pack to continue.",
  resumeEdits: "You have no AI resume edit credits left. Buy a pack to continue.",
  coverRuns: "You have no AI cover letter credits left. Buy a pack to continue.",
  coverEdits:
    "You have no AI cover letter edit credits left. Buy a pack to continue.",
  interview5:
    "You have no 5-question AI interview credits left. Buy a pack to continue.",
  interview10:
    "You have no 10-question AI interview credits left. Buy a pack to continue.",
  interview15:
    "You have no 15-question AI interview credits left. Buy a pack to continue.",
};

const isDuplicateKeyError = (error: unknown): boolean =>
  (error as { code?: number })?.code === 11000;

const toBalances = (wallet: ICreditWallet): CreditBalances => {
  const balances = {} as CreditBalances;
  for (const type of CREDIT_TYPES) {
    balances[type] = wallet[type] ?? 0;
  }
  return balances;
};

/**
 * Free credits for a brand-new wallet. Users who already used the AI
 * features before payments existed only get what is left of the free
 * allowance, so launching payments never hands existing users a fresh
 * set of free credits.
 */
const buildFreeSeed = async (userId: string): Promise<CreditBalances> => {
  const [resumeRuns, resumeEdits, coverRuns, coverEdits, interviews] =
    await Promise.all([
      AIUsage.countDocuments({ userId, feature: { $in: RESUME_RUN_FEATURES } }),
      AIUsage.countDocuments({ userId, feature: { $in: RESUME_EDIT_FEATURES } }),
      AIUsage.countDocuments({ userId, feature: { $in: COVER_RUN_FEATURES } }),
      AIUsage.countDocuments({ userId, feature: { $in: COVER_EDIT_FEATURES } }),
      InterviewSession.countDocuments({ userId }),
    ]);

  const left = (free: number, used: number) => Math.max(0, free - used);

  return {
    resumeRuns: left(FREE_CREDITS.resumeRuns, resumeRuns),
    resumeEdits: left(FREE_CREDITS.resumeEdits, resumeEdits),
    coverRuns: left(FREE_CREDITS.coverRuns, coverRuns),
    coverEdits: left(FREE_CREDITS.coverEdits, coverEdits),
    interview5: left(FREE_CREDITS.interview5, interviews),
    interview10: FREE_CREDITS.interview10,
    interview15: FREE_CREDITS.interview15,
  };
};

/**
 * Returns the user's wallet, creating it with the free credits on first use.
 * Safe to call concurrently: a second creator hits the unique userId index
 * and simply reads the wallet the first one made.
 */
export const getOrCreateWallet = async (
  userId: string,
): Promise<ICreditWallet> => {
  const existing = await CreditWallet.findOne({ userId });
  if (existing) return existing;

  const seed = await buildFreeSeed(userId);

  try {
    return await CreditWallet.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, ...seed, freeGranted: true } },
      { upsert: true, new: true },
    ).then((wallet) => wallet as ICreditWallet);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const created = await CreditWallet.findOne({ userId });
    if (!created) throw error;
    return created;
  }
};

export const getCreditBalances = async (
  userId: string,
): Promise<CreditBalances> => toBalances(await getOrCreateWallet(userId));

/**
 * Atomically spends credits. Returns the updated wallet, or null when the
 * balance is too low (nothing is deducted in that case).
 */
export const consumeCredit = async (
  userId: string,
  type: CreditType,
  amount = 1,
): Promise<ICreditWallet | null> => {
  await getOrCreateWallet(userId);

  return CreditWallet.findOneAndUpdate(
    { userId, [type]: { $gte: amount } },
    { $inc: { [type]: -amount } },
    { new: true },
  );
};

/** Same as consumeCredit but throws a 402 the controllers can pass on. */
export const requireCredit = async (
  userId: string,
  type: CreditType,
  amount = 1,
): Promise<ICreditWallet> => {
  const wallet = await consumeCredit(userId, type, amount);
  if (!wallet) throw new ApiError(402, LOW_CREDIT_MESSAGE[type]);
  return wallet;
};

/** Gives credits back, e.g. when the AI call failed after they were spent. */
export const refundCredit = async (
  userId: string,
  type: CreditType,
  amount = 1,
): Promise<void> => {
  await CreditWallet.updateOne({ userId }, { $inc: { [type]: amount } });
};

/**
 * Adds bought credits to the wallet (creating it first if needed).
 *
 * Pass the paymentId to make the grant idempotent: the credits and the
 * "this payment was applied" marker change in ONE atomic update, so even if
 * verify, the webhook and a crash-retry all run, the credits are added once.
 */
export const grantCredits = async (
  userId: string,
  credits: CreditAmounts,
  paymentId?: string,
): Promise<ICreditWallet> => {
  await getOrCreateWallet(userId);

  const inc: Record<string, number> = {};
  for (const type of CREDIT_TYPES) {
    const amount = credits[type];
    if (amount === undefined) continue;

    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`Invalid credit amount for ${type}: ${amount}`);
    }
    if (amount > 0) inc[type] = amount;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(inc).length > 0) update.$inc = inc;
  if (paymentId) update.$push = { appliedPaymentIds: paymentId };

  if (Object.keys(update).length > 0) {
    const filter = paymentId
      ? { userId, appliedPaymentIds: { $ne: paymentId } }
      : { userId };

    const updated = await CreditWallet.findOneAndUpdate(filter, update, {
      new: true,
    });
    if (updated) return updated;
  }

  // Nothing to add, or this payment was already applied: return as is.
  const wallet = await CreditWallet.findOne({ userId });
  if (!wallet) throw new Error("Credit wallet not found");
  return wallet;
};

/**
 * Spends a credit, runs the AI call, and gives the credit back if the call
 * throws. Use this around the AI call only, after request validation, so a
 * bad request never costs a credit.
 */
export const withCredit = async <T>(
  userId: string,
  type: CreditType,
  run: () => Promise<T>,
): Promise<T> => {
  await requireCredit(userId, type);

  try {
    return await run();
  } catch (error) {
    await refundCredit(userId, type).catch((refundError) => {
      console.error(
        `Failed to refund ${type} credit for user ${userId}:`,
        refundError,
      );
    });
    throw error;
  }
};

export interface CoverCredits {
  runs: number;
  edits: number;
}

export const getCoverCredits = async (userId: string): Promise<CoverCredits> => {
  const wallet = await getOrCreateWallet(userId);
  return { runs: wallet.coverRuns, edits: wallet.coverEdits };
};
