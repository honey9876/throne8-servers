import mongoose from 'mongoose';
import { LoggerUtil } from '../../shared/logger.util';

const logger = LoggerUtil;

export async function createUserIndexes(): Promise<void> {
    try {
        const User = mongoose.model('User');

        await User.collection.createIndex({ email: 1, status: 1 }, {   });
        await User.collection.createIndex({ userId: 1, emailVerified: 1 }, {   });
        await User.collection.createIndex({ username: 1 }, { sparse: true,   });
        await User.collection.createIndex({ createdAt: -1 }, {   });
        await User.collection.createIndex({ role: 1, status: 1 }, {   });
        await User.collection.createIndex({ 'flags.isDeleted': 1, status: 1 }, {   });
        await User.collection.createIndex({ phoneNumber: 1 }, { sparse: true,   });
        await User.collection.createIndex({ lastLoginAt: -1 }, {   });

        logger.info('✅ User indexes created successfully');
    } catch(error : any) {
        logger.error('❌ User index creation failed', { error: (error as Error).message });
        throw error;
    }
}