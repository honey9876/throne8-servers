import Razorpay from "razorpay";

/**
 * Same Razorpay account and keys as Mentorship (RAZORPAY_KEY_ID /
 * RAZORPAY_KEY_SECRET). Created lazily so the server still boots when the
 * keys are not set.
 */
let client: Razorpay | null = null;

export const getRazorpay = (): Razorpay => {
  if (!client) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      throw new Error(
        "Razorpay not configured - set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET",
      );
    }

    client = new Razorpay({ key_id, key_secret });
  }

  return client;
};
