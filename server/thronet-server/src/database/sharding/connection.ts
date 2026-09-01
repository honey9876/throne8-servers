// server/thronet-server/src/database/sharding/connection.ts
import mongoose, { ConnectOptions } from 'mongoose';
import { LoggerUtil } from '@/shared/logger.util';

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

            await mongoose.connect(uri, options);

            this.isConnected = true;
            this.setupEventListeners();

            logger.info('✅ MongoDB connected successfully', {
                poolSize: options.maxPoolSize,
                readPreference: options.readPreference,
            });
        } catch(error : any) {
            logger.error('❌ MongoDB connection failed', {
                error: (error as Error).message,
                stack: (error as Error).stack,
            });
            throw error;
        }
    }

    private setupEventListeners(): void {
        mongoose.connection.on('connected', () => {
            logger.info('MongoDB connection established');
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB connection disconnected');
            this.isConnected = false;
        });

        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error', { error: err.message });
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
            this.isConnected = true;
        });
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