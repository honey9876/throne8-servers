// import 'dotenv/config';

// export const queueConfig = {
//   // Bull Queue (Redis-based)
//   bull: {
//     redis: {
//       host: process.env.BULL_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
//       port: parseInt(process.env.BULL_REDIS_PORT || process.env.REDIS_PORT || '6379', 10),
//       password: process.env.BULL_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
//       db: 1, // Separate database for queue
//       keyPrefix: 'bull:',
//       // ✅ CRITICAL FIX: Bull requires these specific values
//       maxRetriesPerRequest: null,  // ⚠️ MUST be null for Bull
//       enableReadyCheck: false,     // ⚠️ MUST be false for Bull
//       enableOfflineQueue: true,
//     },

//     // Default job options
//     defaultJobOptions: {
//       attempts: 3,
//       backoff: {
//         type: 'exponential',
//         delay: 2000,
//       },
//       removeOnComplete: {
//         count: 100, // Keep last 100 completed jobs
//         age: 3600, // Remove after 1 hour
//       },
//       removeOnFail: {
//         count: 500, // Keep last 500 failed jobs
//         age: 86400, // Remove after 24 hours
//       },
//     },

//     // Queue-specific settings
//     queues: {
//       email: {
//         name: 'email-queue',
//         concurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY || '3', 10),
//         limiter: {
//           max: 100, // Max 100 jobs
//           duration: 60000, // Per minute
//         },
//       },
//       notification: {
//         name: 'notification-queue',
//         concurrency: parseInt(process.env.NOTIFICATION_QUEUE_CONCURRENCY || '5', 10),
//         limiter: {
//           max: 200,
//           duration: 60000,
//         },
//       },
//       analytics: {
//         name: 'analytics-queue',
//         concurrency: parseInt(process.env.ANALYTICS_QUEUE_CONCURRENCY || '2', 10),
//         limiter: {
//           max: 50,
//           duration: 60000,
//         },
//       },
//       media: {
//         name: 'media-queue',
//         concurrency: parseInt(process.env.MEDIA_QUEUE_CONCURRENCY || '2', 10),
//         limiter: {
//           max: 20,
//           duration: 60000,
//         },
//       },
//       post: {
//         name: 'post-queue',
//         concurrency: parseInt(process.env.POST_QUEUE_CONCURRENCY || '3', 10),
//         limiter: {
//           max: 100,
//           duration: 60000,
//         },
//       },
//     },

//     // Bull Board (UI Dashboard)
//     bullBoard: {
//       enabled: process.env.ENABLE_BULL_BOARD === 'true',
//       basePath: '/admin/queues',
//       username: process.env.BULL_BOARD_USERNAME || 'admin',
//       password: process.env.BULL_BOARD_PASSWORD || 'admin123',
//     },
//   },

//   // RabbitMQ Configuration (Alternative/Advanced)
//   rabbitmq: {
//     enabled: process.env.ENABLE_RABBITMQ === 'true',
//     url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
//     connection: {
//       host: process.env.RABBITMQ_HOST || 'localhost',
//       port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
//       username: process.env.RABBITMQ_USERNAME || 'guest',
//       password: process.env.RABBITMQ_PASSWORD || 'guest',
//       vhost: process.env.RABBITMQ_VHOST || '/',
//     },
    
//     // Connection options
//     socketOptions: {
//       heartbeatIntervalInSeconds: 60,
//       reconnectTimeInSeconds: 10,
//     },

//     // Exchanges
//     exchanges: {
//       events: {
//         name: 'company.events',
//         type: 'topic',
//         options: {
//           durable: true,
//           autoDelete: false,
//         },
//       },
//       jobs: {
//         name: 'company.jobs',
//         type: 'direct',
//         options: {
//           durable: true,
//           autoDelete: false,
//         },
//       },
//     },

//     // Queues
//     queues: {
//       email: {
//         name: 'email.queue',
//         options: {
//           durable: true,
//           deadLetterExchange: 'company.dlx',
//           messageTtl: 3600000, // 1 hour
//         },
//       },
//       notification: {
//         name: 'notification.queue',
//         options: {
//           durable: true,
//           deadLetterExchange: 'company.dlx',
//           messageTtl: 1800000, // 30 minutes
//         },
//       },
//     },
//   },

//   // Worker Configuration
//   worker: {
//     concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
//     stalledInterval: 30000, // Check for stalled jobs every 30s
//     maxStalledCount: 3,
//     lockDuration: 30000, // 30s
//     lockRenewTime: 15000, // 15s
    
//     // Graceful shutdown
//     gracefulShutdown: {
//       enabled: true,
//       timeout: 30000, // 30s to finish jobs
//     },
//   },

//   // Job priorities
//   priorities: {
//     critical: 1,
//     high: 2,
//     normal: 3,
//     low: 4,
//   },

//   // Retry strategies
//   retryStrategies: {
//     exponential: {
//       type: 'exponential',
//       delay: 2000,
//     },
//     fixed: {
//       type: 'fixed',
//       delay: 5000,
//     },
//   },
// };

// export default queueConfig;