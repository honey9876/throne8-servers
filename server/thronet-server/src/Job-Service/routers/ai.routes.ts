import express from "express";
import { optimizeResumeController, verifySalaryController, detectSpamJobController, verifyCompanyController, getJobMatchesController, updateOpenToWorkController, sendDirectMessageController, getTopApplicantJobsController, setFeaturedApplicantController, analyzeJobDescriptionController, calculateJobQualityScoreController, detectDuplicateApplicationController } from '@/Job-Service/controllers'
import AuthMiddleware from "@/shared/middlewares/auth.middleware";

const router = express.Router();

router.post(
  "/resume/optimize",
   AuthMiddleware.authenticate as any,
   optimizeResumeController
  );

router.get(
  "/jobs/matches", 
  AuthMiddleware.authenticate as any,
   getJobMatchesController
  );

router.post(
  "/jobs/analyze", 
  AuthMiddleware.authenticate as any,
   analyzeJobDescriptionController
  );

router.post(
  "/open-to-work", 
  AuthMiddleware.authenticate as any,
   updateOpenToWorkController
  );

router.post(
  "/applicants/featured", 
  AuthMiddleware.authenticate as any,
   setFeaturedApplicantController
  );

router.post(
  "/messages/direct", 
  AuthMiddleware.authenticate as any,
   sendDirectMessageController
  );

router.get(
  "/applicants/top-jobs", 
  AuthMiddleware.authenticate as any,
   getTopApplicantJobsController
  );

router.post(
  "/company/verify", 
  AuthMiddleware.authenticate as any,
   verifyCompanyController
  );

router.post(
  "/jobs/salary/verify", 
  AuthMiddleware.authenticate as any,
   verifySalaryController
  );

router.post(
  "/applications/duplicate", 
  AuthMiddleware.authenticate as any,
   detectDuplicateApplicationController
  );

router.post(
  "/jobs/quality", 
  AuthMiddleware.authenticate as any,
   calculateJobQualityScoreController
  );

router.post(
  "/jobs/spam", 
  AuthMiddleware.authenticate as any,
   detectSpamJobController
  );


export default router;