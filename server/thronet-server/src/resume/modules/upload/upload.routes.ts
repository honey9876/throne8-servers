import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";
import { upload } from "../../middleware/upload.middleware";

import { uploadProfilePhoto } from "./upload.controller";

const router = Router();

/**
 * POST /api/v1/upload/profile-photo
 */
router.post(
  "/profile-photo",
  protect,
  upload.single("photo"),
  uploadProfilePhoto,
);

export default router;