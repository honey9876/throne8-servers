// ============================================
// Post Worker - ESLint Fixed
// ============================================

import { Job } from 'bull';
import postQueue from '../../shared/queues/post.queue';
import { PostJobData, PostJobResult } from '../interfaces';
import logger from '@/shared/logger.util';
import { queueConfig } from '@/config/cache/queue';

// =====================================================
// Post Processing Function
// =====================================================
async function processPostJob(job: Job<PostJobData>): Promise<PostJobResult> {
  const { type, postId, action } = job.data;

  try {
    logger.info(`Processing post job ${job.id}`, {
      type,
      postId,
      action,
    });

    await job.progress(10);

    let result: PostJobResult;

    switch (type) {
      case 'publish-post':
        result = await publishPost(job);
        break;

      case 'schedule-post':
        result = await schedulePost(job);
        break;

      case 'update-engagement':
        result = await updateEngagement(job);
        break;

      case 'generate-preview':
        result = await generatePreview(job);
        break;

      case 'sync-to-social':
        result = await syncToSocial(job);
        break;

      case 'index-search':
        result = await indexForSearch(job);
        break;

      default:
        throw new Error(`Unknown post job type: ${type}`);
    }

    await job.progress(100);

    logger.info('Post job completed', {
      jobId: job.id,
      type,
      success: result.success,
    });

    return result;
  } catch (error : any) {
    logger.error(`Post job ${job.id} failed`, {
      type,
      postId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      action: 'updated',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Post Job Handlers
// =====================================================

async function publishPost(job: Job<PostJobData>): Promise<PostJobResult> {
  await job.progress(30);

  const { postId } = job.data;

  await new Promise((resolve) => setTimeout(resolve, 500));

  await job.progress(60);

  await notifyFollowers(postId);

  await job.progress(80);

  logger.info('Post published', { postId });

  return {
    success: true,
    postId,
    action: 'published',
  };
}

async function schedulePost(job: Job<PostJobData>): Promise<PostJobResult> {
  await job.progress(30);

  const { postId, scheduledFor } = job.data;

  await new Promise((resolve) => setTimeout(resolve, 300));

  await job.progress(80);

  logger.info('Post scheduled', { postId, scheduledFor });

  return {
    success: true,
    postId,
    action: 'scheduled',
  };
}

async function updateEngagement(job: Job<PostJobData>): Promise<PostJobResult> {
  await job.progress(30);

  const { postId } = job.data;

  await new Promise((resolve) => setTimeout(resolve, 200));

  await job.progress(80);

  logger.info('Engagement updated', { postId });

  return {
    success: true,
    postId,
    action: 'updated',
  };
}

async function generatePreview(job: Job<PostJobData>): Promise<PostJobResult> {
  await job.progress(30);

  const { postId } = job.data;

  await new Promise((resolve) => setTimeout(resolve, 400));

  await job.progress(80);

  logger.info('Preview generated', { postId });

  return {
    success: true,
    postId,
    action: 'updated',
  };
}

async function syncToSocial(job: Job<PostJobData>): Promise<PostJobResult> {
  await job.progress(30);

  const { postId } = job.data;

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await job.progress(80);

  logger.info('Synced to social media', { postId });

  return {
    success: true,
    postId,
    action: 'updated',
  };
}

async function indexForSearch(job: Job<PostJobData>): Promise<PostJobResult> {
  await job.progress(30);

  const { postId } = job.data;

  await new Promise((resolve) => setTimeout(resolve, 300));

  await job.progress(80);

  logger.info('Post indexed for search', { postId });

  return {
    success: true,
    postId,
    action: 'updated',
  };
}

async function notifyFollowers(postId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));

  logger.debug('Followers notified', { postId });
}

// =====================================================
// Start Worker
// =====================================================
export function startPostWorker(): void {
  const concurrency = queueConfig.bull.queues.post.concurrency;

  postQueue.process(concurrency, processPostJob);

  logger.info(`✅ Post worker started with concurrency: ${concurrency}`);
}

export default startPostWorker;