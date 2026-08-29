import { createUserIndexes } from './user.indexes';
import { createSessionIndexes } from './session.indexes';
import { createDeviceIndexes } from './device.indexes';
import { LoggerUtil } from '../../shared/logger.util';

const logger = LoggerUtil;

export async function createAllIndexes(): Promise<void> {
    try {
        logger.info('🔧 Creating database indexes...');

        await createUserIndexes();
        await createSessionIndexes();
        await createDeviceIndexes();

        logger.info('✅ All database indexes created successfully');
    } catch(error : any) {
        logger.error('❌ Index creation failed', { error: (error as Error).message });
        throw error;
    }
}