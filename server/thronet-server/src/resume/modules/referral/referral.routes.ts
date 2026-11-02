import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";
import { getMyReferral } from "./referral.controller";

const router = Router();

router.use(protect);

router.get("/me", getMyReferral);

export default router;
