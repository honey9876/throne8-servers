import mongoose from 'mongoose';
import { LoggerUtil } from '../../shared/logger.util';

const logger = LoggerUtil;

export async function enableUserSharding(): Promise<void> {
    try {
        if (process.env['ENABLE_SHARDING'] !== 'true') {
            logger.info('User sharding disabled');
            return;
        }

        const adminDb = mongoose.connection.db.admin();
        const dbName = mongoose.connection.db.databaseName;

        await adminDb.command({ enableSharding: dbName });

        await adminDb.command({
            shardCollection: `${dbName}.users`,
            key: { userId: 'hashed' },
        });

        logger.info('✅ User collection sharded successfully');
    } catch(error : any) {
        if ((error as any).codeName === 'AlreadyInitialized') {
            logger.info('User sharding already enabled');
        } else {
            logger.error('❌ User sharding failed', { error: (error as Error).message });
        }
    }
}