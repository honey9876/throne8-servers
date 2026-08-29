import mongoose from 'mongoose';
import { LoggerUtil } from '../../shared/logger.util';

const logger = LoggerUtil;

/**
 * Enable sharding for sessions collection
 * Call this AFTER mongoose.connect() is successful
 * 
 * @production Optimized for 1M+ users
 */
export async function enableSessionSharding(): Promise<void> {
    try {
        // Check if sharding is enabled
        if (process.env['ENABLE_SHARDING'] !== 'true') {
            logger.info('Session sharding disabled');
            return;
        }

        // ✅ CHANGE 1: Wait for connection if not ready (prevents race conditions)
        if (mongoose.connection.readyState !== 1) {
            logger.info('Waiting for database connection...');
            await mongoose.connection.asPromise(); // ✅ ADDED: Wait for connection
        }

        // ✅ CHANGE 2: Type-safe db access with null check (prevents undefined error)
        const db = mongoose.connection.db; // ✅ ADDED: Store in variable first
        if (!db) { // ✅ ADDED: Null safety check
            throw new Error('Database connection not established');
        }

        // ✅ CHANGE 3: Use the validated 'db' variable instead of direct access
        const adminDb = db.admin(); // ✅ CHANGED: Was mongoose.connection.db.admin()
        const dbName = db.databaseName; // ✅ CHANGED: Was mongoose.connection.db.databaseName

        // Enable sharding
        await adminDb.command({
            shardCollection: `${dbName}.sessions`,
            key: { userId: 'hashed' },
        });

        // ✅ CHANGE 4: Enhanced logging with more details
        logger.info('✅ Session collection sharded successfully', {
            collection: `${dbName}.sessions`, // ✅ ADDED: Log collection name
            shardKey: 'userId (hashed)' // ✅ ADDED: Log shard key
        });

    } catch (error: any) {
        // ✅ CHANGE 5: Better error code checking
        if (error?.codeName === 'AlreadyInitialized') { // ✅ CHANGED: Added ?. operator
            logger.info('Session sharding already enabled');
            return; // ✅ ADDED: Early return for cleaner flow
        }

        // ✅ CHANGE 6: Enhanced error logging with more context
        logger.error('❌ Session sharding failed', {
            error: error?.message, // ✅ CHANGED: Added ?. operator
            code: error?.code, // ✅ ADDED: Log error code
            codeName: error?.codeName // ✅ ADDED: Log error codeName
        });

        // ✅ CHANGE 7: Don't throw - graceful degradation (app won't crash)
        // Don't throw - sharding failure shouldn't crash the app
    }
}



// import mongoose from 'mongoose';
// import { LoggerUtil } from '../../utils/logger.util';

// const logger = LoggerUtil;

// export async function enableSessionSharding(): Promise<void> {
//     try {
//         if (process.env['ENABLE_SHARDING'] !== 'true') {
//             logger.info('Session sharding disabled');
//             return;
//         }

//         const adminDb = mongoose.connection.db.admin();
//         const dbName = mongoose.connection.db.databaseName;

//         await adminDb.command({
//             shardCollection: `${dbName}.sessions`,
//             key: { userId: 'hashed' },
//         });

//         logger.info('✅ Session collection sharded successfully');
//     } catch(error : any) {
//         if ((error as any).codeName === 'AlreadyInitialized') {
//             logger.info('Session sharding already enabled');
//         } else {
//             logger.error('❌ Session sharding failed', { error: (error as Error).message });
//         }
//     }
// }