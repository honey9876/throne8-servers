import mongoose from 'mongoose';
import { LoggerUtil } from '../../shared/logger.util';

const logger = LoggerUtil;

export async function createDeviceIndexes(): Promise<void> {
    try {
        const Device = mongoose.model('Device');

        await Device.collection.createIndex({ userId: 1, isActive: 1 }, {   });
        await Device.collection.createIndex({ deviceId: 1, registeredAt: -1 }, {   });
        await Device.collection.createIndex({ fingerprintHash: 1, userId: 1 }, {   });
        await Device.collection.createIndex({ trustLevel: 1, riskScore: -1 }, {   });

        logger.info('✅ Device indexes created successfully');
    } catch(error : any) {
        logger.error('❌ Device index creation failed', { error: (error as Error).message });
        throw error;
    }
}   