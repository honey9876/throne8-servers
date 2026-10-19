/**
 * email.worker.ts
 * BullMQ Worker for background email processing
 * 
 * Rules:
 * - Checks OTP expiry: must count from creation time, not worker pickup time.
 * - Never logs OTPs or email bodies.
 * - Calls direct sender on NotificationService.
 */

import { Worker, Job } from 'bullmq';
import { LoggerUtil } from '@/shared/logger.util';
import { getQueueConnectionConfig, maskEmail } from '../queueConnection';
import { EmailJobPayload } from '../email.queue';
import NotificationService from '@/auth/services/notification.service';

const QUEUE_NAME = 'email-queue';

export function createEmailWorker(concurrency = 3): Worker<EmailJobPayload> {
  const connection = getQueueConnectionConfig();

  const worker = new Worker<EmailJobPayload>(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      const { to, subject, template, expiresAt } = job.data;

      // Rule: OTP expiry must count from creation, not send time.
      if (expiresAt && Date.now() > expiresAt) {
        LoggerUtil.warn('[EmailWorker] OTP/Email expired before delivery, skipping stale job', {
          jobId: job.id,
          to: maskEmail(to),
          expiresAt: new Date(expiresAt).toISOString(),
        });
        return { success: false, skipped: true, reason: 'expired_before_delivery' };
      }

      LoggerUtil.info('[EmailWorker] Processing email job', {
        jobId: job.id,
        to: maskEmail(to),
        subject,
        template,
        attempt: job.attemptsMade + 1,
      });

      // Send email directly through email transport
      const result = await NotificationService.sendEmailDirect({
        to: Array.isArray(to) ? to[0]! : to,
        subject,
        template,
        html: job.data.html,
        text: job.data.text,
        data: job.data.data,
      });

      LoggerUtil.info('[EmailWorker] Email sent successfully', {
        jobId: job.id,
        to: maskEmail(to),
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    },
    {
      connection,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    LoggerUtil.info('[EmailWorker] Job completed', {
      jobId: job.id,
      to: maskEmail(job.data.to),
    });
  });

  worker.on('failed', (job, err) => {
    LoggerUtil.error('[EmailWorker] Job failed', {
      jobId: job?.id,
      to: maskEmail(job?.data?.to),
      attempt: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    LoggerUtil.error(`[EmailWorker] Worker error: ${err.message}`);
  });

  return worker;
}
