// ============================================
// Email Worker - ESLint Fixed
// ============================================

import { Job } from 'bull';
import emailQueue from '../../shared/queues/email.queue';
// import { EmailJobData, EmailJobResult } from '@/interfaces';
import { EmailJobData, EmailJobResult } from '../interfaces';
import logger from '@/shared/logger.util';
import queueConfig from '@/config/cache/queue';

// =====================================================
// Email Processing Function
// =====================================================
async function processEmailJob(job: Job<EmailJobData>): Promise<EmailJobResult> {
  const { type, to, subject, template, data } = job.data;

  try {
    logger.info(`Processing email job ${job.id}`, {
      type,
      to,
      subject,
    });

    await job.progress(10);

    // Send email via provider
    await sendEmail(job.data);
    await job.progress(50);

    // Render email template
    const renderedEmail = await renderEmailTemplate(template, data);
    await job.progress(80);

    // Send to provider
    const messageId = await sendToProvider(to, subject, renderedEmail);
    await job.progress(100);

    logger.info('Email sent successfully', {
      jobId: job.id,
      messageId,
      type,
    });

    return {
      success: true,
      messageId,
      sentAt: new Date(),
    };
  } catch (error : any) {
    logger.error(`Email job ${job.id} failed`, {
      type,
      to,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Helper Functions
// =====================================================

async function sendEmail(emailData: EmailJobData): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  logger.info('Email would be sent:', {
    to: emailData.to,
    subject: emailData.subject,
    template: emailData.template,
  });
}

async function renderEmailTemplate(
  template: string,
  data: Record<string, unknown>
): Promise<string> {
  let rendered = template;

  Object.keys(data).forEach((key) => {
    const value = String(data[key]);
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });

  return rendered;
}

async function sendToProvider(
  _to: string | string[],
  _subject: string,
  _html: string
): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logger.info('Email sent to provider', {
    messageId,
  });

  return messageId;
}

// =====================================================
// Start Worker
// =====================================================
export function startEmailWorker(): void {
  const concurrency = queueConfig.bull.queues.email.concurrency;

  emailQueue.process(concurrency, processEmailJob);

  logger.info(`✅ Email worker started with concurrency: ${concurrency}`);
}

export default startEmailWorker;