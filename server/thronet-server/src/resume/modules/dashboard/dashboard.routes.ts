import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";

import { dashboard } from "./dashboard.controller";

const router = Router();

router.use(protect);

router.get("/", dashboard);

export default router;