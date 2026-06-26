import logger, { LogCategory } from '@/shared/logger.util';

class FollowProducer {
  async publishUserFollowed(data: any, userId: string) {
    logger.debug('Mock publishUserFollowed', { data, userId, category: LogCategory.CONNECTION });
  }

  async publishUserUnfollowed(data: any, userId: string) {
    logger.debug('Mock publishUserUnfollowed', { data, userId, category: LogCategory.CONNECTION });
  }

  async publishFollowBatch(events: any[]) {
    logger.debug('Mock publishFollowBatch', { eventsCount: events.length, category: LogCategory.CONNECTION });
  }

  async publishFollowMetrics(userId: string, data: any) {
    logger.debug('Mock publishFollowMetrics', { userId, data, category: LogCategory.CONNECTION });
  }
}

export const followProducer = new FollowProducer();
