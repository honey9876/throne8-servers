import CircuitBreaker from 'opossum';
import logger from './logger';
// import { circuitBreakerConfig
import circuitBreakerConfig from '@/config/cache/circuitBreaker';

/**
 * Circuit breaker options interface
 */
export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  name?: string;
}

/**
 * Create a circuit breaker for any async function
 */
export function createCircuitBreaker<T extends unknown[], R>(
  action: (...args: T) => Promise<R>,
  options: CircuitBreakerOptions = {}
): CircuitBreaker<T, R> {
  const breakerOptions = {
    timeout: options.timeout || circuitBreakerConfig.default.timeout,
    errorThresholdPercentage:
      options.errorThresholdPercentage || circuitBreakerConfig.default.errorThresholdPercentage,
    resetTimeout: options.resetTimeout || circuitBreakerConfig.default.resetTimeout,
    rollingCountTimeout:
      options.rollingCountTimeout || circuitBreakerConfig.default.rollingCountTimeout,
    rollingCountBuckets:
      options.rollingCountBuckets || circuitBreakerConfig.default.rollingCountBuckets,
    name: options.name || 'unnamed-breaker',
  };

  const breaker = new CircuitBreaker(action, breakerOptions);

  // Event listeners
  breaker.on('open', () => {
    logger.warn(`Circuit breaker "${breakerOptions.name}" opened`, {
      stats: breaker.stats,
    });
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker "${breakerOptions.name}" half-open, testing...`, {
      stats: breaker.stats,
    });
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker "${breakerOptions.name}" closed`, {
      stats: breaker.stats,
    });
  });

  breaker.on('failure', (error: Error) => {
    logger.error(`Circuit breaker "${breakerOptions.name}" failure`, {
      error: error.message,
      stats: breaker.stats,
    });
  });

  breaker.on('timeout', () => {
    logger.warn(`Circuit breaker "${breakerOptions.name}" timeout`, {
      timeout: breakerOptions.timeout,
      stats: breaker.stats,
    });
  });

  breaker.on('reject', () => {
    logger.warn(`Circuit breaker "${breakerOptions.name}" rejected request`, {
      state: breaker.opened ? 'open' : 'half-open',
      stats: breaker.stats,
    });
  });

  return breaker;
}

/**
 * Create circuit breaker for database operations
 */
export function createDatabaseCircuitBreaker<T extends unknown[], R>(
  action: (...args: T) => Promise<R>,
  name: string
): CircuitBreaker<T, R> {
  return createCircuitBreaker(action, {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    name: `db-${name}`,
  });
}

/**
 * Create circuit breaker for external API calls
 */
export function createApiCircuitBreaker<T extends unknown[], R>(
  action: (...args: T) => Promise<R>,
  apiName: string
): CircuitBreaker<T, R> {
  return createCircuitBreaker(action, {
    timeout: 10000,
    errorThresholdPercentage: 60,
    resetTimeout: 60000,
    name: `api-${apiName}`,
  });
}

/**
 * Create circuit breaker for queue operations
 */
export function createQueueCircuitBreaker<T extends unknown[], R>(
  action: (...args: T) => Promise<R>,
  queueName: string
): CircuitBreaker<T, R> {
  return createCircuitBreaker(action, {
    timeout: 3000,
    errorThresholdPercentage: 70,
    resetTimeout: 20000,
    name: `queue-${queueName}`,
  });
}

/**
 * Execute function with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  breaker: CircuitBreaker<unknown[], T>,
  ...args: unknown[]
): Promise<T> {
  try {
    return await breaker.fire(...args);
  } catch (error : any) {
    const err = error as Error;
    if (err.message === 'Breaker is open') {
      logger.error('Circuit breaker is open, service unavailable', {
        name: breaker.name,
        stats: breaker.stats,
      });
      throw new Error(`Service temporarily unavailable: ${breaker.name}`);
    }
    throw error;
  }
}

/**
 * Get circuit breaker statistics
 */
export function getCircuitBreakerStats(breaker: CircuitBreaker<unknown[], unknown>) {
  return {
    name: breaker.name,
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
    stats: breaker.stats,
    isOpen: breaker.opened,
    isHalfOpen: breaker.halfOpen,
  };
}

export default {
  createCircuitBreaker,
  createDatabaseCircuitBreaker,
  createApiCircuitBreaker,
  createQueueCircuitBreaker,
  executeWithCircuitBreaker,
  getCircuitBreakerStats,
};
