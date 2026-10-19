/**
 * email.queue.ts
 * BullMQ Email Queue Implementation
 * 
 * Rules:
 * - Queue isolation: Uses dedicated Redis instance via getQueueConnectionConfig() (REDIS_QUEUE_URL)
 * - Deduplication Policy:
 *   - Only deduplicate when the caller explicitly passes an `idempotencyKey` or custom `jobId`.
 *   - For OTP emails, include `otpRecordId` / `otpId` or creation timestamp/nonce so resends always generate a new job.
 *   - For non-OTP emails without idempotency keys, generate a unique ID (UUID/random).
 *   - NEVER use a 1-minute time bucket for non-OTP emails (it silently drops distinct emails).
 * - Fallback: If queue is disabled (CACHE_QUEUE_EMAIL_ENABLED=false) or Redis fails, fall back to NotificationService.sendEmail.
 */

import { Queue, QueueOptions, JobsOptions } from 'bullmq';
import crypto from 'crypto';
import { LoggerUtil } from '@/shared/logger.util';
import { getQueueConnectionConfig, maskEmail } from './queueConnection';
import NotificationService from '@/auth/services/notification.service';

export interface EmailJobPayload {
  to: string | string[];
  subject: string;
  template?: string;
  html?: string;
  text?: string;
  data?: Record<string, any>;
  priority?: number;
  delay?: number;
  jobId?: string;
  idempotencyKey?: string;
  otpRecordId?: string;
  expiresAt?: number;
  [key: string]: any;
}

export interface QueueEmailResult {
  success: boolean;
  jobId?: string;
  queuedAt: string;
  messageId?: string;
}

const QUEUE_NAME = 'email-queue';

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 86400, // 24 hours
    count: 10000,
  },
  removeOnFail: {
    age: 7 * 86400, // 7 days retention
  },
};

let emailQueueInstance: Queue<EmailJobPayload> | null = null;

export function getEmailQueue(): Queue<EmailJobPayload> {
  if (!emailQueueInstance) {
    const connection = getQueueConnectionConfig();
    emailQueueInstance = new Queue<EmailJobPayload>(QUEUE_NAME, {
      connection,
      defaultJobOptions,
    });
  }
  return emailQueueInstance;
}

/**
 * Generate jobId according to strict deduplication policy:
 * 1. Caller explicit idempotencyKey -> 'idem:<key>'
 * 2. Caller explicit jobId -> '<jobId>'
 * 3. OTP emails with otpId/otpRecordId/nonce -> unique to that OTP record
 * 4. General emails without explicit idempotency -> strictly unique ID
 */
export function generateEmailJobId(data: EmailJobPayload): string {
  if (data.idempotencyKey) {
    return `idem_${data.idempotencyKey}`;
  }
  if (data.jobId) {
    return data.jobId;
  }
  // OTP emails: check for otpId / otpRecordId in data or payload
  const otpId = data.otpRecordId || data.data?.otpId || data.data?.otpRecordId;
  if (otpId) {
    const toStr = Array.isArray(data.to) ? data.to.join(',') : data.to;
    return `otp_${toStr}_${otpId}`;
  }
  if (data.data?.createdAt) {
    const toStr = Array.isArray(data.to) ? data.to.join(',') : data.to;
    return `otp_${toStr}_${data.data.createdAt}_${crypto.randomBytes(4).toString('hex')}`;
  }

  // Non-OTP emails without idempotency key:
  // Strictly unique identifier (NO 1-minute bucket) to prevent dropping distinct emails
  return `email_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Enqueue email with fail-safe direct delivery fallback
 */
export async function enqueueEmail(data: EmailJobPayload): Promise<QueueEmailResult> {
  const isQueueEnabled = process.env['CACHE_QUEUE_EMAIL_ENABLED'] !== 'false';

  // Kill-switch fallback: send directly
  if (!isQueueEnabled) {
    LoggerUtil.info('[EmailQueue] Queue disabled by kill switch, sending directly', {
      to: maskEmail(data.to),
    });
    const directResult = await NotificationService.sendEmail({
      to: Array.isArray(data.to) ? data.to[0]! : data.to,
      subject: data.subject,
      template: data.template,
      html: data.html,
      text: data.text,
      data: data.data,
    });
    return {
      success: directResult.success,
      queuedAt: new Date().toISOString(),
      messageId: directResult.messageId,
    };
  }

  try {
    const queue = getEmailQueue();
    const computedJobId = generateEmailJobId(data);

    // Calculate OTP expiry timestamp from creation time if expiryMinutes or expiresAt is provided
    let expiresAt = data.expiresAt;
    if (!expiresAt && data.data?.expiryMinutes) {
      expiresAt = Date.now() + Number(data.data.expiryMinutes) * 60 * 1000;
    }

    const payload: EmailJobPayload = {
      ...data,
      expiresAt,
    };

    const job = await queue.add('send-email', payload, {
      jobId: computedJobId,
      priority: data.priority ?? 5,
      delay: data.delay ?? 0,
    });

    LoggerUtil.info('[EmailQueue] Email job enqueued successfully', {
      jobId: job.id,
      to: maskEmail(data.to),
      subject: data.subject,
      template: data.template,
    });

    return {
      success: true,
      jobId: job.id,
      queuedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    LoggerUtil.error('[EmailQueue] Enqueue failed, falling back to direct send', {
      error: error.message,
      to: maskEmail(data.to),
    });

    // Fallback: never drop an email if BullMQ Redis is down
    try {
      const directResult = await NotificationService.sendEmail({
        to: Array.isArray(data.to) ? data.to[0]! : data.to,
        subject: data.subject,
        template: data.template,
        html: data.html,
        text: data.text,
        data: data.data,
      });
      return {
        success: directResult.success,
        queuedAt: new Date().toISOString(),
        messageId: directResult.messageId,
      };
    } catch (directErr: any) {
      LoggerUtil.error('[EmailQueue] Direct send fallback also failed', {
        error: directErr.message,
      });
      throw directErr;
    }
  }
}

export async function closeEmailQueue(): Promise<void> {
  if (emailQueueInstance) {
    await emailQueueInstance.close();
    emailQueueInstance = null;
  }
}

// For legacy code compatibility
export const emailQueue = {
  add: async (nameOrData: any, maybeData?: any) => {
    const payload = maybeData || nameOrData;
    return enqueueEmail(payload);
  },
  process: (_concurrencyOrHandler: any, _maybeHandler?: any) => {
    // BullMQ processing is handled in worker.ts
  },
  close: closeEmailQueue,
};

export default emailQueue;