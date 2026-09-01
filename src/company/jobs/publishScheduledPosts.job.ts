import cron from 'node-cron';
import { CompanyPost } from '../models';
import { PostStatus } from '../interfaces';
import logger from '@/shared/logger.util';

export const startScheduledPostsJob = () => {
    // Har 30 minute mein run karo
    cron.schedule('*/30 * * * *', async () => {
        logger.info('🕐 [CRON] Checking scheduled posts...');

        try {
            const now = new Date();

            // Scheduled posts jinका time aa gaya
            const postsToRelease = await CompanyPost.find({
                status: PostStatus.SCHEDULED,
                isPublished: false,
                scheduledFor: { $lte: now },
            });

            if (postsToRelease.length === 0) {
                return;
            }

            logger.info(`🕐 [CRON] Releasing ${postsToRelease.length} scheduled posts to Draft`);

            const postIds = postsToRelease.map(p => p._id);

            // ✅ Sirf Draft mein switch karo — publish nahi karna
            await CompanyPost.updateMany(
                { _id: { $in: postIds } },
                {
                    $set: {
                        status: PostStatus.DRAFT,  
                        isPublished: false,        
                        scheduledFor: null,        
                    },
                }
            );

            logger.info(`✅ [CRON] ${postsToRelease.length} posts moved to Draft`);

        } catch (error) {
            logger.error('❌ [CRON] Error releasing scheduled posts:', error);
        }
    });

    logger.info('✅ [CRON] Scheduled posts job started (every 30 min)');
};