import { Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { AuthRequest } from "../../middleware/auth.middleware";
import { getCreditBalances } from "../../services/credit.service";

import {
  createOrder as createOrderService,
  getPaymentStatus as getPaymentStatusService,
  handleWebhook,
  listPlans,
  verifyPayment as verifyPaymentService,
} from "./payment.service";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const getPlans = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.status(200).json({ success: true, data: { plans: listPlans() } });
});

export const getMyCredits = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const credits = await getCreditBalances(req.userId!);
    res.status(200).json({ success: true, data: { credits } });
  },
);

export const createOrder = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { planId } = req.body ?? {};

    if (!isNonEmptyString(planId)) {
      throw new ApiError(400, "planId is required");
    }

    const order = await createOrderService(req.userId!, planId);

    res.status(201).json({ success: true, data: order });
  },
);

export const verifyPayment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      req.body ?? {};

    if (
      !isNonEmptyString(paymentId) ||
      !isNonEmptyString(razorpayOrderId) ||
      !isNonEmptyString(razorpayPaymentId) ||
      !isNonEmptyString(razorpaySignature)
    ) {
      throw new ApiError(400, "Missing payment verification details");
    }

    const result = await verifyPaymentService(req.userId!, {
      paymentId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    res.status(200).json({ success: true, data: result });
  },
);

export const getPaymentStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const paymentId = req.params.paymentId;

    if (!isNonEmptyString(paymentId)) {
      throw new ApiError(400, "paymentId is required");
    }

    const status = await getPaymentStatusService(req.userId!, paymentId);

    res.status(200).json({ success: true, data: status });
  },
);

/**
 * Razorpay webhook. No login: it is protected by the signature, which is
 * checked against the raw body saved by the JSON parser in app.ts.
 */
export const razorpayWebhook = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;

    await handleWebhook(rawBody, signature);

    res.status(200).json({ received: true });
  },
);
