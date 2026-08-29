// server/thronet-server/src/database/sharding/connection.ts
//
// ✅ FIX: dns.setServers() override is now restricted to NON-production
// environments. Running it unconditionally broke mongodb+srv:// SRV
// record resolution on Railway (Linux container network doesn't allow
// the same direct external DNS query pattern as local Windows dev),
// which caused the primary connection to fail, fall through to the
// (also unreachable on Railway) localhost fallback, throw, and crash
// the process on every deploy.

import dns from 'dns';
import mongoose, { ConnectOptions } from 'mongoose';
import { LoggerUtil } from '@/shared/logger.util';

// ⚠️ ONLY apply this DNS override in local/dev — on Railway (or any
// Linux container production environment) this can break SRV DNS
// resolution entirely, causing MongoDB connection to hang/fail.
if (process.env['NODE_ENV'] !== 'production') {
    try {
        dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    } catch {
        // ignore
    }
}

const logger = LoggerUtil;

interface MongoConnectionOptions extends ConnectOptions {
    maxPoolSize: number;
    minPoolSize: number;
    serverSelectionTimeoutMS: number;
    socketTimeoutMS: number;
    connectTimeoutMS: number;
    retryWrites: boolean;
    retryReads: boolean;
    // readPreference: string ;
    // w: string | number;
}

class MongoConnection {
    private static instance: MongoConnection;
    private isConnected: boolean = false;
    private listenersRegistered: boolean = false;
    private constructor() { }

    public static getInstance(): MongoConnection {
        if (!MongoConnection.instance) {
            MongoConnection.instance = new MongoConnection();
        }
        return MongoConnection.instance;
    }

    public async connect(): Promise<void> {
        if (this.isConnected) {
            logger.info('MongoDB already connected');
            return;
        }

        try {
            const uri = process.env['MONGODB_URI'];
            if (!uri) {
                throw new Error('MONGODB_URI not defined in environment');
            }

            const options: MongoConnectionOptions = {
                maxPoolSize: Number(process.env['MONGODB_MAX_POOL_SIZE']) || 100,
                minPoolSize: Number(process.env['MONGODB_MIN_POOL_SIZE']) || 10,
                serverSelectionTimeoutMS: Number(process.env['MONGODB_SERVER_SELECTION_TIMEOUT']) || 5000,
                socketTimeoutMS: Number(process.env['MONGODB_SOCKET_TIMEOUT']) || 45000,
                connectTimeoutMS: Number(process.env['MONGODB_CONNECT_TIMEOUT']) || 10000,
                retryWrites: true,
                retryReads: true,
                readPreference: 'secondaryPreferred',
                w: 'majority',
            };

            try {
                await mongoose.connect(uri, options);
            } catch (primaryErr: any) {
                logger.warn(`Primary MongoDB URI failed (${primaryErr.message}). Attempting fallback to local MongoDB...`);
                const fallbackUri = 'mongodb://127.0.0.1:27017/thronet_production';
                await mongoose.connect(fallbackUri, {
                    maxPoolSize: options.maxPoolSize,
                    minPoolSize: options.minPoolSize,
                    serverSelectionTimeoutMS: 5000,
                });
            }
            this.isConnected = true;
            if (!this.listenersRegistered) {
                this.setupEventListeners();
                this.listenersRegistered = true;
            }

            logger.info('✅ MongoDB connected successfully', {
                poolSize: options.maxPoolSize,
                readPreference: options.readPreference,
            });

            // Repair any invalid company coordinates in MongoDB
            try {
                if (mongoose.connection.db) {
                    const companiesCollection = mongoose.connection.db.collection('companies');
                    const invalidCompanies = await companiesCollection.find({
                        $or: [
                            { 'headquarters.coordinates.coordinates': { $exists: false } },
                            { 'headquarters.coordinates.coordinates': null },
                            { 'headquarters.coordinates.coordinates': { $size: 0 } },
                            { 'headquarters.coordinates.type': { $exists: true }, 'headquarters.coordinates.coordinates': { $not: { $type: 'array' } } },
                        ],
                        'headquarters.coordinates': { $exists: true, $ne: null }
                    }).toArray();

                    for (const comp of invalidCompanies) {
                        logger.info(`Cleaning invalid headquarters.coordinates for company: ${comp.companyName || comp.companyId}`);
                        await companiesCollection.updateOne(
                            { _id: comp._id },
                            { $unset: { 'headquarters.coordinates': '' } }
                        );
                    }
                    if (invalidCompanies.length > 0) {
                        logger.info(`Cleaned invalid coordinates for ${invalidCompanies.length} companies.`);
                    }
                }
            } catch (repairErr: any) {
                logger.warn('Company coordinates repair check notice:', { error: repairErr?.message });
            }
        } catch(error : any) {
            logger.error('❌ MongoDB connection failed', {
                error: (error as Error).message,
                stack: (error as Error).stack,
            });
            throw error;
        }
    }

    private reconnectScheduled = false;

    private setupEventListeners(): void {
        mongoose.connection.on('connected', () => {
            logger.info('MongoDB connection established');
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB connection disconnected');
            this.isConnected = false;
            this.scheduleReconnect(0);
        });

        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error', { error: err.message });
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
            this.isConnected = true;
        });
    }

    private scheduleReconnect(attempt: number): void {
        // Guard against overlapping reconnect loops.
        if (this.reconnectScheduled) return;
        this.reconnectScheduled = true;

        const delay = Math.min(5_000 * Math.pow(2, attempt), 60_000); // cap at 60s
        logger.info('Scheduling MongoDB reconnect', { delay: `${delay / 1_000}s`, attempt });

        setTimeout(() => {
            this.reconnectScheduled = false;
            this.connect().catch((err: any) => {
                logger.error('MongoDB reconnect attempt failed', { error: err?.message });
                this.scheduleReconnect(attempt + 1);
            });
        }, delay);
    }
    public async disconnect(): Promise<void> {
        if (!this.isConnected) {
            return;
        }

        try {
            await mongoose.connection.close();
            this.isConnected = false;
            logger.info('✅ MongoDB disconnected gracefully');
        } catch(error : any) {
            logger.error('❌ Error disconnecting MongoDB', {
                error: (error as Error).message,
            });
            throw error;
        }
    }

    public getConnection() {
        return mongoose.connection;
    }

    public isHealthy(): boolean {
        return this.isConnected && mongoose.connection.readyState === 1;
    }
}

export default MongoConnection.getInstance();