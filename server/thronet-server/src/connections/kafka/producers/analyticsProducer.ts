import logger, { LogCategory } from '@/shared/logger.util';

class AnalyticsProducer {
  async publishUserAction(data: any) {
    logger.debug('Mock publishUserAction', { data, category: LogCategory.CONNECTION });
  }

  async track(event: string, userId: string, properties?: any) {
    logger.debug('Mock track event', { event, userId, properties, category: LogCategory.CONNECTION });
  }
}

export const analyticsProducer = new AnalyticsProducer();
