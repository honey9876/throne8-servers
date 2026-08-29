// ============================================
// Media Worker - ESLint Fixed
// ============================================

import { Job } from 'bull';
import mediaQueue from '../../shared/queues/media.queue';
import { MediaJobData, MediaJobResult } from '../interfaces';
import { mediaService } from '@/services';
import logger from '@/shared/logger.util';
import queueConfig from '@/config/cache/queue';

// =====================================================
// Media Processing Function
// =====================================================
async function processMediaJob(job: Job<MediaJobData>): Promise<MediaJobResult> {
  const { type, filename, size } = job.data;

  try {
    logger.info(`Processing media job ${job.id}`, {
      type,
      filename,
      size,
    });

    await job.progress(10);

    let result: MediaJobResult;

    switch (type) {
      case 'image-upload':
        result = await processImageUpload(job);
        break;

      case 'video-upload':
        result = await processVideoUpload(job);
        break;

      case 'image-optimization':
        result = await processImageOptimization(job);
        break;

      case 'video-transcoding':
        result = await processVideoTranscoding(job);
        break;

      case 'thumbnail-generation':
        result = await processThumbnailGeneration(job);
        break;

      case 'media-delete':
        result = await processMediaDelete(job);
        break;

      default:
        throw new Error(`Unknown media job type: ${type}`);
    }

    await job.progress(100);

    logger.info('Media job completed', {
      jobId: job.id,
      type,
      success: result.success,
    });

    return result;
  } catch (error: any) {
    logger.error(`Media job ${job.id} failed`, {
      type,
      filename,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// Media Job Handlers
// =====================================================

async function processImageUpload(job: Job<MediaJobData>): Promise<MediaJobResult> {
  await job.progress(30);

  const { fileBuffer, filename, mimeType, size } = job.data;

  if (!fileBuffer) {
    throw new Error('No file data provided');
  }

  const uploadResult = await mediaService.uploadImage(fileBuffer, {
    filename,
    mimeType,
    size,
  });

  await job.progress(80);

  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || 'Upload failed');
  }

  return {
    success: true,
    url: uploadResult.url,
    metadata: {
      size,
      format: mimeType,
    },
  };
}

async function processVideoUpload(job: Job<MediaJobData>): Promise<MediaJobResult> {
  await job.progress(30);

  const { fileBuffer, filename, mimeType, size } = job.data;

  if (!fileBuffer) {
    throw new Error('No file data provided');
  }

  const uploadResult = await mediaService.uploadVideo(fileBuffer, {
    filename,
    mimeType,
    size,
  });

  await job.progress(80);

  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || 'Upload failed');
  }

  return {
    success: true,
    url: uploadResult.url,
    metadata: {
      size,
      format: mimeType,
    },
  };
}

async function processImageOptimization(
  job: Job<MediaJobData>
): Promise<MediaJobResult> {
  await job.progress(30);

  const { fileUrl, options } = job.data;

  if (!fileUrl) {
    throw new Error('No file URL provided');
  }

  const optimizedUrl = await mediaService.optimizeImage(fileUrl, options);

  await job.progress(80);

  if (!optimizedUrl) {
    throw new Error('Optimization failed');
  }

  return {
    success: true,
    url: optimizedUrl,
  };
}

async function processVideoTranscoding(
  job: Job<MediaJobData>
): Promise<MediaJobResult> {
  await job.progress(20);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  await job.progress(80);

  return {
    success: true,
    url: 'https://cdn.example.com/transcoded-video.mp4',
  };
}

async function processThumbnailGeneration(
  job: Job<MediaJobData>
): Promise<MediaJobResult> {
  await job.progress(30);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await job.progress(80);

  return {
    success: true,
    thumbnailUrl: 'https://cdn.example.com/thumbnail.jpg',
  };
}

async function processMediaDelete(job: Job<MediaJobData>): Promise<MediaJobResult> {
  await job.progress(30);

  const { fileUrl } = job.data;

  if (!fileUrl) {
    throw new Error('No file URL provided');
  }

  const deleted = await mediaService.deleteMedia(fileUrl);

  await job.progress(80);

  if (!deleted) {
    throw new Error('Deletion failed');
  }

  return {
    success: true,
  };
}

// =====================================================
// Start Worker
// =====================================================
export function startMediaWorker(): void {
  const concurrency = queueConfig.bull.queues.media.concurrency;

  mediaQueue.process(concurrency, processMediaJob);

  logger.info(`✅ Media worker started with concurrency: ${concurrency}`);
}

export default startMediaWorker;