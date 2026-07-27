import 'dotenv/config';

export const circuitBreakerConfig = {
  // Default circuit breaker options
  default: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '3000', 10), // 3 seconds
    errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000', 10), // 30 seconds
    rollingCountTimeout: 10000, // 10 seconds
    rollingCountBuckets: 10,
    name: 'default-breaker',
    volumeThreshold: 10, // Minimum number of requests
    enabled: true,
  },

  // Database circuit breaker
  database: {
    timeout: 5000, // 5 seconds
    errorThresholdPercentage: 60,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    name: 'database-breaker',
    volumeThreshold: 5,
    enabled: true,
    
    // Fallback response
    fallback: {
      message: 'Database temporarily unavailable',
      statusCode: 503,
    },
  },

  // Redis cache circuit breaker
  redis: {
    timeout: 2000, // 2 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 20000, // 20 seconds
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    name: 'redis-breaker',
    volumeThreshold: 10,
    enabled: true,

    fallback: {
      message: 'Cache temporarily unavailable',
      statusCode: 503,
    },
  },

  // External API circuit breaker
  externalApi: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '5000', 10),
    errorThresholdPercentage: 70,
    resetTimeout: 60000, // 1 minute
    rollingCountTimeout: 20000,
    rollingCountBuckets: 10,
    name: 'external-api-breaker',
    volumeThreshold: 5,
    enabled: true,

    fallback: {
      message: 'External service temporarily unavailable',
      statusCode: 503,
    },
  },

  // Media service circuit breaker
  mediaService: {
    timeout: 10000, // 10 seconds (file uploads can take longer)
    errorThresholdPercentage: 60,
    resetTimeout: 45000, // 45 seconds
    rollingCountTimeout: 15000,
    rollingCountBuckets: 10,
    name: 'media-service-breaker',
    volumeThreshold: 3,
    enabled: true,

    fallback: {
      message: 'Media service temporarily unavailable',
      statusCode: 503,
    },
  },

  // Notification service circuit breaker
  notificationService: {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    name: 'notification-service-breaker',
    volumeThreshold: 5,
    enabled: true,

    fallback: {
      message: 'Notification service temporarily unavailable',
      statusCode: 503,
    },
  },

  // Email service circuit breaker
  emailService: {
    timeout: 5000,
    errorThresholdPercentage: 60,
    resetTimeout: 45000,
    rollingCountTimeout: 15000,
    rollingCountBuckets: 10,
    name: 'email-service-breaker',
    volumeThreshold: 3,
    enabled: true,

    fallback: {
      message: 'Email service temporarily unavailable',
      statusCode: 503,
    },
  },

  // Elasticsearch circuit breaker
  elasticsearch: {
    timeout: 4000, // 4 seconds
    errorThresholdPercentage: 55,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    name: 'elasticsearch-breaker',
    volumeThreshold: 5,
    enabled: true,

    fallback: {
      message: 'Search service temporarily unavailable',
      statusCode: 503,
    },
  },

  // RabbitMQ circuit breaker
  rabbitmq: {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10,
    name: 'rabbitmq-breaker',
    volumeThreshold: 5,
    enabled: true,

    fallback: {
      message: 'Message queue temporarily unavailable',
      statusCode: 503,
    },
  },

  // Circuit breaker events
  events: {
    logStateChanges: true,
    logErrors: true,
    logFallbacks: true,
  },

  // Health check settings
  healthCheck: {
    enabled: true,
    interval: 30000, // Check every 30 seconds
    timeout: 5000,
  },
};

export default circuitBreakerConfig;