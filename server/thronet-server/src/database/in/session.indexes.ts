import mongoose from 'mongoose';
import { LoggerUtil } from '../../shared/logger.util';

const logger = LoggerUtil;

export async function createSessionIndexes(): Promise<void> {
    try {
        const Session = mongoose.models['Session'];
        if (!Session) { console.warn('Session model not yet registered'); return; }

        await Session.collection.createIndex({ userId: 1, isActive: 1, lastActivity: -1 }, {});
        await Session.collection.createIndex({ deviceId: 1, userId: 1 }, {});
        await Session.collection.createIndex({ refreshToken: 1 }, { unique: true, });
        await Session.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, });
        await Session.collection.createIndex({ sessionType: 1, isActive: 1 }, {});

        logger.info('✅ Session indexes created successfully');
    } catch (error: any) {
        logger.error('❌ Session index creation failed', { error: (error as Error).message });
        throw error;
    }
}