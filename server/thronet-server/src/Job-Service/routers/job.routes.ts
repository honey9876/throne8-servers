import express from "express";
const router = express.Router();

import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import { createJobController , listJobsController, saveJobsController, deleteJobController, updateJobController, getJobByIdController, featuredJobsController} from "@/Job-Service/controllers";

router.post("/create",
    AuthMiddleware.authenticate as any,
    createJobController
);
router.get(
    "/:jobId",
     AuthMiddleware.authenticate as any,
      getJobByIdController
);
router.put(
    "/update/:jobId",
    AuthMiddleware.authenticate as any,
    updateJobController
);
router.delete(
    "/delete/:jobId",
    AuthMiddleware.authenticate as any,
    deleteJobController
);
router.get(
    "/list",
    AuthMiddleware.authenticate as any,
    listJobsController
);
router.get(
    "/featured",
    AuthMiddleware.authenticate as any,
    featuredJobsController
);

router.post(
    "/saveJob",
    AuthMiddleware.authenticate as any,
    saveJobsController
)

export default router;