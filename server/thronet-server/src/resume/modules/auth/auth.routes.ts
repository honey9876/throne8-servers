import { Router } from "express";

import {
  register,
  login,
  getMe,
} from "./auth.controller";

import { protect } from "../../middleware/auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);

router.get("/me", protect, getMe);

export default router;