import crypto, { randomUUID } from "crypto";

import { logger } from "@/shared/logger.util";

import {
  IResumePayment,
  ResumeFulfillmentStatus,
  ResumePayment,
  ResumePaymentStatus,
} from "../../models/resume-payment.model";
import { getPlan, planAmountPaise, RESUME_PLAN_LIST } from "../../config/plans";
import { getRazorpay } from "../../config/razorpay";
import { ApiError } from "../../utils/ApiError";
import { getCreditBalances, grantCredits } from "../../services/credit.service";

const FULFILLMENT_LOCK_MS = 2 * 60 * 1000;
const MAX_FULFILLMENT_ATTEMPTS = 5;

/* ------------------------------------------------------------------ */
/* Signature helpers (pure, exported so they can be tested)            */
/* ------------------------------------------------------------------ */

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/** Checkout signature: HMAC-SHA256 of "orderId|paymentId" with the key secret. */
export const isValidCheckoutSignature = (
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): boolean => {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqual(expected, signature);
};

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export const isValidWebhookSignature = (
  rawBody: Buffer | string,
  signature: string,
  secret: string,
): boolean => {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return safeEqual(expected, signature);
};

const compact = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out as Partial<T>;
};

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

export const listPlans = () =>
  RESUME_PLAN_LIST.map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    credits: plan.credits,
  }));

/* ------------------------------------------------------------------ */
/* Create order                                                        */
/* ------------------------------------------------------------------ */

export interface CreatedOrder {
  paymentId: string;
  orderId: string;
  /** Paise, as Razorpay Checkout expects. */
  amount: number;
  currency: string;
  keyId: string;
  planId: string;
  description: string;
}

export const createOrder = async (
  userId: string,
  planId: string,
): Promise<CreatedOrder> => {
  // The price always comes from the server catalog, never from the client.
  const plan = getPlan(planId);
  if (!plan) throw new ApiError(400, "Unknown plan");

  const paymentId = randomUUID();
  const amountPaise = planAmountPaise(plan);

  let order: { id: string };
  try {
    order = (await getRazorpay().orders.create({
      amount: amountPaise,
      currency: "INR",
      // Razorpay receipts are limited to 40 characters.
      receipt: `rb_${paymentId.replace(/-/g, "").slice(0, 30)}`,
      notes: { paymentId, userId, product: "resume", planId: plan.id },
    })) as { id: string };
  } catch (error) {
    const e = error as { error?: { description?: string }; message?: string };
    logger.error(
      `Resume order creation failed: ${e?.error?.description || e?.message}`,
    );
    throw new ApiError(502, "Unable to start payment right now. Please try again.");
  }

  await ResumePayment.create({
    paymentId,
    userId,
    planId: plan.id,
    razorpayOrderId: order.id,
    amount: plan.price,
    amountPaise,
    currency: "INR",
    credits: plan.credits,
    status: ResumePaymentStatus.CREATED,
    fulfillment: { status: ResumeFulfillmentStatus.PENDING, attempts: 0 },
  });

  return {
    paymentId,
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: process.env.RAZORPAY_KEY_ID as string,
    planId: plan.id,
    description: plan.name,
  };
};

/* ------------------------------------------------------------------ */
/* Mark paid / fulfill (idempotent: safe for verify + webhook races)   */
/* ------------------------------------------------------------------ */

const markPaid = async (
  orderId: string,
  razorpayPaymentId: string,
  signature?: string,
  method?: string,
): Promise<IResumePayment | null> => {
  const updated = await ResumePayment.findOneAndUpdate(
    {
      razorpayOrderId: orderId,
      status: {
        $in: [ResumePaymentStatus.CREATED, ResumePaymentStatus.FAILED],
      },
    },
    {
      $set: compact({
        status: ResumePaymentStatus.PAID,
        razorpayPaymentId,
        razorpaySignature: signature,
        method,
        paidAt: new Date(),
      }),
      $unset: { failureReason: 1 },
    },
    { new: true },
  );

  if (updated) return updated;
  return ResumePayment.findOne({ razorpayOrderId: orderId });
};

/**
 * Claims the payment (only one caller wins), adds the credits, and marks it
 * fulfilled. The credit grant itself is idempotent per paymentId, so a crash
 * between the grant and the status update can never add credits twice.
 */
const fulfill = async (paymentId: string): Promise<void> => {
  const claimed = await ResumePayment.findOneAndUpdate(
    {
      paymentId,
      status: ResumePaymentStatus.PAID,
      "fulfillment.attempts": { $lt: MAX_FULFILLMENT_ATTEMPTS },
      $or: [
        { "fulfillment.status": ResumeFulfillmentStatus.PENDING },
        {
          "fulfillment.status": ResumeFulfillmentStatus.PROCESSING,
          "fulfillment.startedAt": {
            $lt: new Date(Date.now() - FULFILLMENT_LOCK_MS),
          },
        },
      ],
    },
    {
      $set: {
        "fulfillment.status": ResumeFulfillmentStatus.PROCESSING,
        "fulfillment.startedAt": new Date(),
      },
      $inc: { "fulfillment.attempts": 1 },
    },
    { new: true },
  );

  // Someone else already fulfilled it or is doing it right now.
  if (!claimed) return;

  try {
    await grantCredits(claimed.userId, claimed.credits, claimed.paymentId);

    await ResumePayment.updateOne(
      { paymentId: claimed.paymentId },
      {
        $set: {
          "fulfillment.status": ResumeFulfillmentStatus.FULFILLED,
          "fulfillment.completedAt": new Date(),
        },
        $unset: { "fulfillment.error": 1 },
      },
    );
  } catch (error) {
    const message = (error as Error)?.message || "Could not add credits";
    logger.error(`Credit fulfillment failed for ${claimed.paymentId}: ${message}`);

    // Back to pending so verify/webhook can retry; after the last attempt it
    // is marked failed for manual handling (the user has paid).
    const exhausted = claimed.fulfillment.attempts >= MAX_FULFILLMENT_ATTEMPTS;
    await ResumePayment.updateOne(
      { paymentId: claimed.paymentId },
      {
        $set: {
          "fulfillment.status": exhausted
            ? ResumeFulfillmentStatus.FAILED
            : ResumeFulfillmentStatus.PENDING,
          "fulfillment.error": message.slice(0, 300),
        },
      },
    );

    throw new ApiError(
      500,
      "We received your payment but could not add your credits yet. They will be added shortly, or contact support.",
    );
  }
};

const waitForSettled = async (
  paymentId: string,
  timeoutMs = 8000,
): Promise<IResumePayment> => {
  const startedAt = Date.now();

  for (;;) {
    const doc = await ResumePayment.findOne({ paymentId });
    if (!doc) throw new ApiError(404, "Payment not found");

    const status = doc.fulfillment.status;
    if (
      status !== ResumeFulfillmentStatus.PENDING &&
      status !== ResumeFulfillmentStatus.PROCESSING
    ) {
      return doc;
    }
    if (Date.now() - startedAt >= timeoutMs) return doc;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

/* ------------------------------------------------------------------ */
/* Verify (called by the browser after Razorpay Checkout succeeds)     */
/* ------------------------------------------------------------------ */

export interface VerifyInput {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/** Confirms the payment with Razorpay and captures it if it is only authorized. */
const confirmWithGateway = async (
  payment: IResumePayment,
  razorpayPaymentId: string,
): Promise<string | undefined> => {
  try {
    const rp = (await getRazorpay().payments.fetch(razorpayPaymentId)) as {
      order_id: string;
      amount: number | string;
      status: string;
      method?: string;
    };

    if (
      rp.order_id !== payment.razorpayOrderId ||
      Number(rp.amount) !== payment.amountPaise
    ) {
      logger.error(
        `Gateway mismatch for ${payment.paymentId}: order ${rp.order_id}, amount ${rp.amount}`,
      );
      throw new ApiError(400, "Payment verification failed");
    }

    if (rp.status === "authorized") {
      await getRazorpay().payments.capture(
        razorpayPaymentId,
        payment.amountPaise,
        payment.currency,
      );
    } else if (rp.status !== "captured") {
      throw new ApiError(400, "Payment is not completed yet");
    }

    return rp.method;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // The signature was already verified; if the gateway lookup failed the
    // webhook will settle the payment.
    logger.warn(
      `Gateway confirmation skipped for ${payment.paymentId}: ${(error as Error)?.message}`,
    );
    return undefined;
  }
};

export const verifyPayment = async (userId: string, input: VerifyInput) => {
  const payment = await ResumePayment.findOne({
    paymentId: input.paymentId,
    userId,
  });
  if (!payment) throw new ApiError(404, "Payment not found");

  if (payment.razorpayOrderId !== input.razorpayOrderId) {
    throw new ApiError(400, "Payment verification failed");
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET is not set");

  if (
    !isValidCheckoutSignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
      secret,
    )
  ) {
    logger.warn(`Invalid checkout signature for ${payment.paymentId}`);
    throw new ApiError(400, "Payment verification failed");
  }

  const method = await confirmWithGateway(payment, input.razorpayPaymentId);
  await markPaid(
    payment.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
    method,
  );

  await fulfill(payment.paymentId);

  const settled = await waitForSettled(payment.paymentId);

  return {
    paymentId: settled.paymentId,
    planId: settled.planId,
    status:
      settled.fulfillment.status === ResumeFulfillmentStatus.FULFILLED
        ? "fulfilled"
        : "processing",
    credits: await getCreditBalances(userId),
  };
};

export const getPaymentStatus = async (userId: string, paymentId: string) => {
  const payment = await ResumePayment.findOne({ paymentId, userId }).lean();
  if (!payment) throw new ApiError(404, "Payment not found");

  return {
    paymentId: payment.paymentId,
    planId: payment.planId,
    paymentStatus: payment.status,
    fulfillmentStatus: payment.fulfillment?.status,
    error: payment.fulfillment?.error,
  };
};

/* ------------------------------------------------------------------ */
/* Webhook (backup if the browser never calls verify)                  */
/* ------------------------------------------------------------------ */

interface RazorpayEvent {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number | string;
        method?: string;
        error_description?: string;
        error_reason?: string;
      };
    };
    order?: { entity?: { id?: string } };
  };
}

const onPaymentCaptured = async (event: RazorpayEvent): Promise<void> => {
  const entity = event.payload?.payment?.entity;
  const orderId = entity?.order_id || event.payload?.order?.entity?.id;
  if (!entity?.id || !orderId) return;

  const existing = await ResumePayment.findOne({ razorpayOrderId: orderId });
  // Not a resume order (the same Razorpay account also serves Mentorship).
  if (!existing) return;

  if (Number(entity.amount) !== existing.amountPaise) {
    logger.error(`Resume webhook amount mismatch for order ${orderId}: ${entity.amount}`);
    return;
  }

  const payment = await markPaid(orderId, entity.id, undefined, entity.method);
  if (payment && payment.status === ResumePaymentStatus.PAID) {
    try {
      await fulfill(payment.paymentId);
    } catch (error) {
      // Already logged. Returning normally keeps Razorpay from retrying forever;
      // the failed state is visible on the payment record.
      logger.error(
        `Resume webhook fulfillment failed for ${payment.paymentId}: ${(error as Error)?.message}`,
      );
    }
  }
};

const onPaymentFailed = async (event: RazorpayEvent): Promise<void> => {
  const entity = event.payload?.payment?.entity;
  if (!entity?.order_id) return;

  await ResumePayment.updateOne(
    { razorpayOrderId: entity.order_id, status: ResumePaymentStatus.CREATED },
    {
      $set: {
        status: ResumePaymentStatus.FAILED,
        failureReason:
          entity.error_description || entity.error_reason || "Payment failed",
      },
    },
  );
};

export const handleWebhook = async (
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
): Promise<void> => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set");
  if (!rawBody || !signature) throw new ApiError(400, "Invalid webhook request");

  if (!isValidWebhookSignature(rawBody, signature, secret)) {
    logger.warn("Resume Razorpay webhook signature mismatch");
    throw new ApiError(400, "Invalid webhook signature");
  }

  const event = JSON.parse(rawBody.toString()) as RazorpayEvent;

  switch (event.event) {
    case "payment.captured":
    case "order.paid":
      await onPaymentCaptured(event);
      break;
    case "payment.failed":
      await onPaymentFailed(event);
      break;
    default:
      logger.info(`Resume Razorpay webhook ignored: ${event.event}`);
  }
};
