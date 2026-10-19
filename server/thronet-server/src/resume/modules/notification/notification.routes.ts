import { Router } from "express";
import { protect } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import * as notificationController from "./notification.controller";

const router = Router();

router.use(protect);

router.get("/", asyncHandler(notificationController.getNotifications));
router.get("/unread-count", asyncHandler(notificationController.getUnreadCount));
router.patch("/:id/read", asyncHandler(notificationController.markAsRead));
router.patch("/read-all", asyncHandler(notificationController.markAllAsRead));

export default router;
