import { Router } from "express";

import { protect } from "../../middleware/auth.middleware";

 


import {
  createVersion,
  getVersionHistory,
  restoreResumeVersion,
} from "./version.controller";

const router = Router();

router.use(protect);

router.post(
  "/:resumeId",
  createVersion
);

router.get(
  "/:resumeId",
  getVersionHistory
);



router.post(
  "/restore/:versionId",
  restoreResumeVersion
);

export default router;