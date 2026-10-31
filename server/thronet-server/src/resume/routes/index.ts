/**
 * src/resume/routes/index.ts
 * Central resume feature router — mounts all resume sub-routes under /api/v1/resume-builder/*
 * This replaces resume12's routes/index.ts imports (auth route excluded — throne8 handles auth).
 */
import { Router } from 'express';

import resumeRoutes from '../modules/resume/resume.routes';
import coverLetterRoutes from '../modules/coverLetter/coverLetter.routes';
import exportRoutes from '../modules/export/export.routes';
import aiRoutes from '../modules/ai/ai.routes';
import atsRoutes from '../modules/ats/ats.routes';
import analyticsRoutes from '../modules/analytics/analytics.routes';
import versionRoutes from '../modules/version/version.routes';
import adminRoutes from '../modules/admin/admin.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import interviewRoutes from '../modules/interview/interview.routes';
import uploadRoutes from '../modules/upload/upload.routes';
import paymentRoutes from '../modules/payment/payment.routes';

const router = Router();

router.use('/resumes', resumeRoutes);
router.use('/cover-letters', coverLetterRoutes);
router.use('/export', exportRoutes);
router.use('/ai', aiRoutes);
router.use('/ats', atsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/versions', versionRoutes);
router.use('/admin', adminRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/interview', interviewRoutes);
router.use('/upload', uploadRoutes);
router.use('/payments', paymentRoutes);

export default router;
