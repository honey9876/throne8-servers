import 'dotenv/config';

export const databaseConfig = {
  // MongoDB Connection
  mongodb: {
    uri: process.env.MONGODB_URI || '',
    dbName: process.env.DB_NAME || '',
    options: {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 5,
    },
  },

  // Connection Pooling
  pooling: {
    min: 5,
    max: 20,
  },

  // Reconnection strategy
  reconnectAttempts: 5,
  reconnectInterval: 1000, // ms
  
  // Transaction support
  transactions: {
    enabled: true,
    retries: 3,
  },
};

export default databaseConfig;