// having many erorr need to verify









import express from "express";
// import AuthMiddleware from "@/shared/middlewares/auth.middleware";
// import { checkJobSpamController, getCompanyVerificationController } from "@/controllers/jobService/qualityTrust.controller";
// // import { calculateJobQualityController, checkDuplicateApplicationController, checkJobSpamController,  getCompanyVerificationController,  verifySalaryqtController } from "@/controllers/jobService/qualityTrust.controller.js";

const router = express.Router();

// // Routes
// router.get(
//   "/company/:companyId/verification",
//   AuthMiddleware.authenticate as any,
//   getCompanyVerificationController
// );
// router.post(
//   "/company/:companyId/verify",
//   AuthMiddleware.authenticate as any,
//   // companyVerificationLimiter,
//   verifyCompanyController
// );
// router.post(
//   "/job/:jobId/spam",
//   AuthMiddleware.authenticate as any,
//   // jobSpamLimiter,
//   checkJobSpamController
// );
// router.post(
//   "/job/:jobId/salary",
//   AuthMiddleware.authenticate as any,
//   // salaryVerificationLimiter,
//   verifySalaryqtController
// );
// router.post(
//   "/application/duplicate",
//   AuthMiddleware.authenticate as any,
//   // duplicateApplicationLimiter,
//   checkDuplicateApplicationController
// );
// router.post(
//   "/job/:jobId/quality",
//   AuthMiddleware.authenticate as any,
//   // jobQualityLimiter,
//   calculateJobQualityController
// );

export default router;
