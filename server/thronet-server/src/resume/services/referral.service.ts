import crypto from "crypto";

import { CreditWallet } from "../models/credit-wallet.model";
import {
  IReferral,
  Referral,
  ReferralProfile,
} from "../models/referral.model";
import { User } from "../models/user.model";

import {
  DISPOSABLE_EMAIL_DOMAINS,
  MAX_COUNTED_REFERRALS_PER_IP,
  PENDING_RETRY_AFTER_MS,
  REFERRAL_GOAL,
  REFERRED_USER_BONUS,
  SHARER_REWARD,
} from "../config/referral";
import { grantCredits } from "./credit.service";

const isDuplicateKeyError = (error: unknown): boolean =>
  (error as { code?: number })?.code === 11000;

// No 0/O/1/I/L so a code is easy to read out or type
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

const makeCode = (): string =>
  Array.from(
    crypto.randomBytes(CODE_LENGTH),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");

/** Keys that make credit grants idempotent (see grantCredits). */
const bonusKey = (referredUserId: string) => `referral-bonus:${referredUserId}`;
const rewardKey = (referrerId: string) => `referral-reward:${referrerId}`;

/**
 * Reduces an email to the real inbox it points to, so a+1@gmail.com,
 * a.b@gmail.com and ab@gmail.com are all recognised as the same person.
 */
export const normalizeEmail = (email: string): string => {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0];
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
};

const emailDomain = (email: string): string =>
  email.trim().toLowerCase().split("@")[1] ?? "";

// ---------------------------------------------------------------------------
// Sharer side: the code and the progress card
// ---------------------------------------------------------------------------

/**
 * Returns the user's referral profile, creating the code on first use.
 * Safe to call concurrently: the unique indexes make a second creator
 * fail, and it then reads what the first one made.
 */
export const getOrCreateReferralProfile = async (userId: string) => {
  const existing = await ReferralProfile.findOne({ userId });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await ReferralProfile.create({ userId, code: makeCode() });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      // Either someone created this user's profile, or the code collided
      const created = await ReferralProfile.findOne({ userId });
      if (created) return created;
    }
  }

  throw new Error("Could not generate a referral code");
};

const countCompleted = (referrerId: string): Promise<number> =>
  Referral.countDocuments({ referrerId, status: "completed" });

export interface ReferralStats {
  code: string;
  count: number;
  goal: number;
  rewardGiven: boolean;
  /** What the sharer gets at the goal, so the UI can show it. */
  reward: typeof SHARER_REWARD;
  /** What each friend gets, so the UI can show it. */
  friendBonus: typeof REFERRED_USER_BONUS;
}

export const getReferralStats = async (
  userId: string,
): Promise<ReferralStats> => {
  const profile = await getOrCreateReferralProfile(userId);

  // Heal any referral of this user that got stuck half-finished
  await retryPendingReferrals(userId).catch((error) =>
    console.error("Referral retry failed:", error),
  );

  const [count, rewarded] = await Promise.all([
    countCompleted(userId),
    CreditWallet.exists({ userId, appliedPaymentIds: rewardKey(userId) }),
  ]);

  return {
    code: profile.code,
    count: Math.min(count, REFERRAL_GOAL),
    goal: REFERRAL_GOAL,
    rewardGiven: !!rewarded,
    reward: SHARER_REWARD,
    friendBonus: REFERRED_USER_BONUS,
  };
};

// ---------------------------------------------------------------------------
// New user side: applying a code at signup
// ---------------------------------------------------------------------------

/**
 * Finishes one referral: gives the friend's bonus, marks it completed,
 * and gives the sharer their reward once the goal is reached.
 *
 * Every step is safe to repeat, so a crashed or concurrent run can simply
 * be run again:
 *  - the bonus and the reward use fixed keys in grantCredits
 *  - the pending -> completed change only succeeds once
 *  - the count is read from the Referral collection, never stored
 */
const finishReferral = async (referral: IReferral): Promise<void> => {
  await grantCredits(
    referral.referredUserId,
    REFERRED_USER_BONUS,
    bonusKey(referral.referredUserId),
  );

  await Referral.updateOne(
    { _id: referral._id, status: "pending" },
    { $set: { status: "completed" } },
  );

  const count = await countCompleted(referral.referrerId);
  if (count >= REFERRAL_GOAL) {
    await grantCredits(
      referral.referrerId,
      SHARER_REWARD,
      rewardKey(referral.referrerId),
    );
  }
};

/** Retries this sharer's referrals that were saved but never finished. */
const retryPendingReferrals = async (referrerId: string): Promise<void> => {
  const stuck = await Referral.find({
    referrerId,
    status: "pending",
    createdAt: { $lt: new Date(Date.now() - PENDING_RETRY_AFTER_MS) },
  }).limit(20);

  for (const referral of stuck) {
    await finishReferral(referral);
  }
};

/** For a script or admin job: retries every stuck referral. */
export const retryAllPendingReferrals = async (): Promise<number> => {
  const stuck = await Referral.find({
    status: "pending",
    createdAt: { $lt: new Date(Date.now() - PENDING_RETRY_AFTER_MS) },
  }).limit(200);

  for (const referral of stuck) {
    await finishReferral(referral);
  }
  return stuck.length;
};

export type ApplyReferralResult =
  | { applied: true; flagged: boolean }
  | { applied: false; reason: string };

/**
 * Called right after a successful signup. Never throws for "normal"
 * problems (bad code, abuse). It returns why nothing happened instead.
 */
export const applyReferral = async (
  newUserId: string,
  rawCode: string,
  options: { ip?: string } = {},
): Promise<ApplyReferralResult> => {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code || code.length > 32) return { applied: false, reason: "no_code" };

  const referrer = await ReferralProfile.findOne({ code });
  if (!referrer) return { applied: false, reason: "invalid_code" };
  if (referrer.userId === newUserId) {
    return { applied: false, reason: "self_referral" };
  }

  const [newUser, referrerUser] = await Promise.all([
    User.findOne({ userId: newUserId }).select("email"),
    User.findOne({ userId: referrer.userId }).select("email"),
  ]);
  if (!newUser?.email) return { applied: false, reason: "user_not_found" };

  // Abuse checks. Work out whether this signup may count.
  let flagReason: string | undefined;

  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain(newUser.email))) {
    flagReason = "disposable_email";
  } else if (
    referrerUser?.email &&
    normalizeEmail(referrerUser.email) === normalizeEmail(newUser.email)
  ) {
    flagReason = "same_inbox_as_sharer";
  } else if (options.ip) {
    const sameIpCount = await Referral.countDocuments({
      referrerId: referrer.userId,
      ip: options.ip,
      status: { $ne: "flagged" },
    });
    if (sameIpCount >= MAX_COUNTED_REFERRALS_PER_IP) {
      flagReason = "too_many_from_same_ip";
    }
  }

  let referral: IReferral;
  try {
    referral = await Referral.create({
      referrerId: referrer.userId,
      referredUserId: newUserId,
      code,
      ip: options.ip,
      status: flagReason ? "flagged" : "pending",
      flagReason,
    });
  } catch (error) {
    // This user was already referred once: do nothing, never count twice
    if (isDuplicateKeyError(error)) {
      return { applied: false, reason: "already_referred" };
    }
    throw error;
  }

  if (flagReason) return { applied: true, flagged: true };

  await finishReferral(referral);
  return { applied: true, flagged: false };
};
