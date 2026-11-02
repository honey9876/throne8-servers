/**
 * Referral programme rules. This is the ONLY place to change how many
 * referrals are needed or which credits are given.
 *
 * Only "creation" credits are rewarded. Edit credits (resumeEdits,
 * coverEdits) and resumeUploads are never touched by referrals.
 */
import { CreditAmounts } from "./plans";

/** Successful referrals the sharer needs before the reward is given. */
export const REFERRAL_GOAL = 5;

/** Given to the NEW user who signs up with a valid code. */
export const REFERRED_USER_BONUS: CreditAmounts = {
  resumeRuns: 1,
};

/** Given ONCE to the sharer when they reach REFERRAL_GOAL. */
export const SHARER_REWARD: CreditAmounts = {
  resumeRuns: 1,
  coverRuns: 1,
  interview5: 1,
  atsChecks: 1,
};

/**
 * More referrals than this from the SAME IP for the SAME sharer are saved
 * but flagged and not counted (likely one person making fake accounts).
 */
export const MAX_COUNTED_REFERRALS_PER_IP = 3;

/** A "pending" referral older than this is retried (crash recovery). */
export const PENDING_RETRY_AFTER_MS = 2 * 60 * 1000;

/** Throw-away email providers: signups from these never count. */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
]);
