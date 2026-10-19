import { Router } from "express";
import { protect } from "../../middleware/auth.middleware";
import { adminOnly } from "../../middleware/admin.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { validateRequest } from "../../middleware/validate.middleware";
import * as bookingController from "./booking.controller";
import * as bookingValidation from "./booking.validation";

const router = Router();

router.use(protect);

router.post(
  "/",
  validateRequest(bookingValidation.createBookingSchema),
  asyncHandler(bookingController.createBooking)
);

router.get("/my-history", asyncHandler(bookingController.getMyHistory));

// Admin routes
router.use(adminOnly);

router.get("/admin", asyncHandler(bookingController.getAllBookings));

router.patch(
  "/:id/confirm",
  validateRequest(bookingValidation.confirmBookingSchema),
  asyncHandler(bookingController.confirmBooking)
);

router.patch(
  "/:id/cancel",
  validateRequest(bookingValidation.cancelBookingSchema),
  asyncHandler(bookingController.cancelBooking)
);

router.patch(
  "/:id/complete",
  validateRequest(bookingValidation.completeBookingSchema),
  asyncHandler(bookingController.completeBooking)
);

export default router;
