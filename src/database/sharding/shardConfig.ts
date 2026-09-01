import mongoose from 'mongoose';
import { LoggerUtil } from '../../shared/logger.util';

const logger = LoggerUtil;

interface ShardingConfig {
    enabled: boolean;
    shardKey: string;
    collection: string;
}

class ShardConfig {
    private config: ShardingConfig;

    constructor() {
        this.config = {
            enabled: process.env['ENABLE_SHARDING'] === 'true',
            shardKey: process.env['MONGODB_SHARD_KEY'] || 'userId',
            collection: process.env['SHARD_COLLECTION'] || 'users',
        };
    }

    public async enableSharding(): Promise<void> {
        if (!this.config.enabled) {
            logger.info('Sharding is disabled');
            return;
        }

        try {
            // ✅ CHANGE 1: Wait for connection if not ready
            if (mongoose.connection.readyState !== 1) {
                logger.info('Waiting for database connection...');
                await mongoose.connection.asPromise(); // ✅ ADDED: Wait for connection
            }

            // ✅ CHANGE 2: Type-safe db access with null check
            const db = mongoose.connection.db; // ✅ ADDED: Store in variable first
            if (!db) { // ✅ ADDED: Null safety check
                throw new Error('Database connection not established');
            }

            // ✅ CHANGE 3: Use validated 'db' variable
            const adminDb = db.admin(); // ✅ CHANGED: Was mongoose.connection.db.admin()

            await adminDb.command({
                enableSharding: db.databaseName, // ✅ CHANGED: Was mongoose.connection.db.databaseName
            });

            // ✅ CHANGE 4: Enhanced logging
            logger.info('✅ Sharding enabled on database', {
                database: db.databaseName, // ✅ CHANGED: Was mongoose.connection.db.databaseName
            });

            await this.shardCollection(this.config.collection, this.config.shardKey);
            
        } catch (error: any) {
            // ✅ CHANGE 5: Safe error checking with optional chaining
            if (error?.codeName === 'AlreadyInitialized') { // ✅ CHANGED: Added ?. operator
                logger.info('Sharding already enabled');
                return; // ✅ ADDED: Early return for cleaner flow
            } else {
                // ✅ CHANGE 6: Enhanced error logging
                logger.error('❌ Failed to enable sharding', {
                    error: error?.message, // ✅ CHANGED: Added ?. operator
                    code: error?.code, // ✅ ADDED: Log error code
                    codeName: error?.codeName, // ✅ ADDED: Log error codeName
                });
                // ✅ CHANGE 7: Don't throw - graceful degradation
                // App won't crash if sharding fails
            }
        }
    }

    private async shardCollection(collectionName: string, shardKey: string): Promise<void> {
        try {
            // ✅ CHANGE 8: Wait for connection if not ready
            if (mongoose.connection.readyState !== 1) {
                logger.warn('Connection not ready for sharding collection');
                await mongoose.connection.asPromise(); // ✅ ADDED: Wait for connection
            }

            // ✅ CHANGE 9: Type-safe db access with null check
            const db = mongoose.connection.db; // ✅ ADDED: Store in variable first
            if (!db) { // ✅ ADDED: Null safety check
                throw new Error('Database connection not established');
            }

            // ✅ CHANGE 10: Use validated 'db' variable
            const adminDb = db.admin(); // ✅ CHANGED: Was mongoose.connection.db.admin()

            await adminDb.command({
                shardCollection: `${db.databaseName}.${collectionName}`, // ✅ CHANGED: Was mongoose.connection.db.databaseName
                key: { [shardKey]: 'hashed' },
            });

            logger.info('✅ Collection sharded successfully', {
                collection: collectionName,
                shardKey,
            });
            
        } catch (error: any) {
            // ✅ CHANGE 11: Safe error checking with optional chaining
            if (error?.codeName === 'AlreadyInitialized') { // ✅ CHANGED: Added ?. operator
                logger.info(`Collection ${collectionName} already sharded`);
                return; // ✅ ADDED: Early return instead of doing nothing
            } else {
                // ✅ CHANGE 12: Enhanced error logging instead of throwing
                logger.error('❌ Failed to shard collection', {
                    collection: collectionName,
                    error: error?.message, // ✅ CHANGED: Added ?. operator
                    code: error?.code, // ✅ ADDED: Log error code
                    codeName: error?.codeName, // ✅ ADDED: Log error codeName
                });
                // ✅ CHANGE 13: Don't throw - graceful degradation
                // Collection will work without sharding
            }
        }
    }

    public getConfig(): ShardingConfig {
        return this.config;
    }
}

export default new ShardConfig();





// import mongoose from 'mongoose';
// import { LoggerUtil } from '../../utils/logger.util';

// const logger = LoggerUtil;

// interface ShardingConfig {
//     enabled: boolean;
//     shardKey: string;
//     collection: string;
// }

// class ShardConfig {
//     private config: ShardingConfig;

//     constructor() {
//         this.config = {
//             enabled: process.env['ENABLE_SHARDING'] === 'true',
//             shardKey: process.env['MONGODB_SHARD_KEY'] || 'userId',
//             collection: process.env['SHARD_COLLECTION'] || 'users',
//         };
//     }

//     public async enableSharding(): Promise<void> {
//         if (!this.config.enabled) {
//             logger.info('Sharding is disabled');
//             return;
//         }

//         try {
//             const adminDb = mongoose.connection.db.admin();

//             await adminDb.command({
//                 enableSharding: mongoose.connection.db.databaseName,
//             });

//             logger.info('✅ Sharding enabled on database', {
//                 database: mongoose.connection.db.databaseName,
//             });

//             await this.shardCollection(this.config.collection, this.config.shardKey);
//         } catch(error : any) {
//             if ((error as any).codeName === 'AlreadyInitialized') {
//                 logger.info('Sharding already enabled');
//             } else {
//                 logger.error('❌ Failed to enable sharding', {
//                     error: (error as Error).message,
//                 });
//             }
//         }
//     }

//     private async shardCollection(collectionName: string, shardKey: string): Promise<void> {
//         try {
//             const adminDb = mongoose.connection.db.admin();

//             await adminDb.command({
//                 shardCollection: `${mongoose.connection.db.databaseName}.${collectionName}`,
//                 key: { [shardKey]: 'hashed' },
//             });

//             logger.info('✅ Collection sharded successfully', {
//                 collection: collectionName,
//                 shardKey,
//             });
//         } catch(error : any) {
//             if ((error as any).codeName === 'AlreadyInitialized') {
//                 logger.info(`Collection ${collectionName} already sharded`);
//             } else {
//                 throw error;
//             }
//         }
//     }

//     public getConfig(): ShardingConfig {
//         return this.config;
//     }
// }

// export default new ShardConfig();