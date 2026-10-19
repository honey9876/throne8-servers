import { AIUsage } from "../../models/ai-usage.model";

/**
 * Free AI credits shared between "generate cover letter" and
 * "regenerate cover letter" — both draw from the same pool.
 *
 * No purchase flow exists yet; once a paid tier is added, this is the
 * single place to look up a user's actual (possibly higher) limit
 * instead of this flat constant.
 */
export const FREE_COVER_LETTER_AI_CREDITS = 2;

const COVER_LETTER_AI_FEATURES = [
  "generate-cover-letter",
  "regenerate-cover-letter",
];

export interface CoverLetterAiCredits {
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Derives remaining AI credits by counting existing AIUsage log entries
 * for this user, rather than maintaining a separate mutable counter.
 * trackAIUsage() (already called on every successful generate/regenerate)
 * IS the "decrement" — there's nothing else to update.
 */
export const getCoverLetterAiCredits = async (
  userId: string,
): Promise<CoverLetterAiCredits> => {
  const used = await AIUsage.countDocuments({
    userId, // Throne8 userId is a UUID string, not an ObjectId
    feature: { $in: COVER_LETTER_AI_FEATURES },
  });

  const remaining = Math.max(FREE_COVER_LETTER_AI_CREDITS - used, 0);

  return {
    used,
    limit: FREE_COVER_LETTER_AI_CREDITS,
    remaining,
  };
};
