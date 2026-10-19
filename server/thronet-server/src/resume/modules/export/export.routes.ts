import { Router } from "express";

import { exportPdf } from "./export.controller";
import { protect } from "../../middleware/auth.middleware";

const router = Router();

router.get("/pdf/:id", protect, exportPdf);

export default router;