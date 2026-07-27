import express from "express";
import AuthMiddleware from "@/shared/middlewares/auth.middleware";
import { employeeReviewsController, getCompanyCultureInfoController, getCompanyPageController } from "@/company/controllers";
const router = express.Router();

// Public routes
router.get(
    "/:companyId",
     AuthMiddleware.authenticate as any, 
     getCompanyPageController
    );

    router.get(
        "/:id/reviews", 
        AuthMiddleware.authenticate as any,
        employeeReviewsController
    );

    router.get(
        "/:companyId/culture",
        AuthMiddleware.authenticate as any,
        getCompanyCultureInfoController
    );





// router.get("/", getAllCompanies);
// router.get("/:id", getCompanyById);

export default router;
