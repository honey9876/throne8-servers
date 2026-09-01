// src/jobs/stats-flush.job.ts
import cron from 'node-cron';
import { StatsFlushService } from '@/Job-Service/services';
import logger from '@/shared/logger.util.js';

// Every 4 hours (low traffic time, e.g. 2AM, 6AM, 10AM, 2PM, 6PM, 10PM IST)
cron.schedule('0 */4 * * *', async () => {
  logger.info('Starting periodic stats flush');
  await StatsFlushService.flushAll();
  logger.info('Stats flush completed');
}, {
  timezone: 'Asia/Kolkata'
});