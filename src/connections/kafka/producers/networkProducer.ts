import logger, { LogCategory } from '@/shared/logger.util';

class NetworkProducer {
  async publishUserBlocked(data: any) {
    logger.debug('Mock publishUserBlocked', { data, category: LogCategory.CONNECTION });
  }

  async publishUserUnblocked(data: any) {
    logger.debug('Mock publishUserUnblocked', { data, category: LogCategory.CONNECTION });
  }

  async publishBlockAppealSubmitted(data: any) {
    logger.debug('Mock publishBlockAppealSubmitted', { data, category: LogCategory.CONNECTION });
  }
}

export const networkProducer = new NetworkProducer();
