// src/routes/index.ts
import { Router, Request, Response } from 'express';
import ReminderCron from '@/jobs/reminderCron';
import mentorRoutes from './mentor.routes';
import searchRoutes from './search.routes';
// import aiRoutes from './ai.routes';
import availabilityRoutes from './availability.routes';
import sessionRoutes from './session.routes';
import queryRoutes from './query.routes';
import groupRoutes from './group.routes';
import packageRoutes from './package.routes';
import waitlistRoutes from './waitlist.routes';
import reviewRoutes from './review.routes'; // ✅ PHASE 11
import analyticsRoutes from './analytics.routes'; // ✅ PHASE 11
import adminRoutes from './admin.routes'; // ✅ PHASE 11
import notificationRoutes from './notification.routes'; // ✅ PHASE 11 - NEW
import seniorMentorApplicationRoutes from './seniorMentorApplication.routes';

const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    service: 'Mentorship Service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ✅ TEST ROUTE - Manually trigger reminder cron job (REMOVE IN PRODUCTION)
router.post('/test/trigger-reminders', async (_req: Request, res: Response) => {
  try {
    await ReminderCron.triggerManually();
    res.json({ 
      success: true,
      message: 'Reminders triggered successfully!' 
    });
  } catch(error : any) {
    res.status(500).json({ 
      success: false,
      message: 'Failed to trigger reminders',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Mount routes
router.use('/mentors', mentorRoutes);
router.use('/search', searchRoutes);
// router.use('/ai', aiRoutes);
router.use('/availability', availabilityRoutes);
router.use('/sessions', sessionRoutes);
router.use('/queries', queryRoutes);
router.use('/group-sessions', groupRoutes);
router.use('/packages', packageRoutes);
router.use('/waitlist', waitlistRoutes);
router.use('/reviews', reviewRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/senior-mentor-applications', seniorMentorApplicationRoutes);

export default router;