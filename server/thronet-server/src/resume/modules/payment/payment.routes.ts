import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";

import {
  createOrder,
  getMyCredits,
  getPaymentStatus,
  getPlans,
  razorpayWebhook,
  verifyPayment,
} from "./payment.controller";

const router = Router();

// Public: protected by the Razorpay signature, not by login. Keep it above `protect`.
router.post("/webhook", razorpayWebhook);

router.use(protect);

router.get("/plans", getPlans);
router.get("/credits", getMyCredits);
router.post("/orders", createOrder);
router.post("/verify", verifyPayment);
router.get("/:paymentId", getPaymentStatus);

export default router;
