import express from "express";
const router = express.Router();

import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import { createJobController , listJobsController, saveJobsController, deleteJobController, updateJobController, getJobByIdController, featuredJobsController} from "@/Job-Service/controllers";

/* ==========================================
   OLD CODE (Commented out)
   Reason for change: The dynamic route `/:jobId` was placed above specific routes 
   like `/list` and `/featured`. Because Express evaluates top-to-bottom, `/:jobId` 
   was intercepting those requests, evaluating "list" as an ID, and returning a 404.
   Additionally, we are updating the routes to follow standard RESTful conventions 
   (e.g., changing `/list` to `/`, `/create` to `/`).
   ==========================================
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
*/

// ==========================================
// NEW CODE
// Reason: Specific routes (like `/`, `/featured`) must be placed BEFORE dynamic wildcard 
// routes (like `/:jobId`) so they don't get intercepted. Routes have also been made RESTful.
// ==========================================

// GET /jobs -> List all jobs (replaces /list)
router.get(
    "/",
    AuthMiddleware.authenticate as any,
    listJobsController
);

// GET /jobs/featured -> Featured jobs
router.get(
    "/featured",
    AuthMiddleware.authenticate as any,
    featuredJobsController
);

// POST /jobs -> Create a job (replaces /create)
router.post(
    "/",
    AuthMiddleware.authenticate as any,
    createJobController
);

// POST /jobs/:jobId/save -> Save/Bookmark a job (replaces /saveJob)
router.post(
    "/:jobId/save",
    AuthMiddleware.authenticate as any,
    saveJobsController
);

// GET /jobs/:jobId -> Get single job (Placed at the bottom to prevent wildcard interception)
router.get(
    "/:jobId",
     AuthMiddleware.authenticate as any,
      getJobByIdController
);

// PUT /jobs/:jobId -> Update a job (replaces /update/:jobId)
router.put(
    "/:jobId",
    AuthMiddleware.authenticate as any,
    updateJobController
);

// DELETE /jobs/:jobId -> Delete a job (replaces /delete/:jobId)
router.delete(
    "/:jobId",
    AuthMiddleware.authenticate as any,
    deleteJobController
);

export default router;