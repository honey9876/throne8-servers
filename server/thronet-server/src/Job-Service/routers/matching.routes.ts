// GET /jobs/:id/match-score

// import { calculateMatchScoreController, sendInvitationToApplyController } from "@/controllers";
import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import express from "express";
import { calculateMatchScoreController, sendInvitationToApplyController } from "../controllers";

const router = express.Router();

router.get(
    "/:id/match-score",
    AuthMiddleware.authenticate as any,
    calculateMatchScoreController
)

router.get(
    "/invitations/:jobId",
    AuthMiddleware.authenticate as any,
    sendInvitationToApplyController
)

router



export default router;
