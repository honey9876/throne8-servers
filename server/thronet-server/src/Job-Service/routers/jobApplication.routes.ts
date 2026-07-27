import express from "express";

import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import { applyToJobController, attachCoverLetterController, deleteApplicationController, getApplicationsByJobController, selectResumeForApplicationController, updateApplicationStatusController } from "@/Job-Service/controllers";

const router = express.Router();

router.post(
    "/:jobId/apply", 
    AuthMiddleware.authenticate as any,
     applyToJobController
    );
router.get(
    "/:jobId/applications",
    AuthMiddleware.authenticate as any,
    getApplicationsByJobController
);
router.patch(
    "/:applicationId/status",
    AuthMiddleware.authenticate as any,
    updateApplicationStatusController
);
router.delete(
    "/:applicationId",
    AuthMiddleware.authenticate as any,
    deleteApplicationController
);

router.get(
    "/:applicationId/resume",
    AuthMiddleware.authenticate as any,
    selectResumeForApplicationController
)

router.get(
    "/:applicationId/cover-letter",
    AuthMiddleware.authenticate as any,
    attachCoverLetterController
);

export default router;
