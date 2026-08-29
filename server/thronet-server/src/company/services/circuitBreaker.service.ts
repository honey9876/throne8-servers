// ============================================
// CIRCUIT BREAKER SERVICE - Resilience Management
// ============================================

import CircuitBreaker from 'opossum';
import logger from '@/shared/logger.util';
import circuitBreakerConfig from '@/config/cache/circuitBreaker';

interface BreakerStats {
  name: string;
  state: 'open' | 'half-open' | 'closed';
  stats: Record<string, unknown>;
  isOpen: boolean;
  isHalfOpen: boolean;
}

interface BreakerConfig {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  rollingCountTimeout: number;
  rollingCountBuckets: number;
  name?: string;
  volumeThreshold: number;
  enabled: boolean;
  fallback?: {
    message: string;
    statusCode: number;
  };
}

class CircuitBreakerService {
  private breakers: Map<string, CircuitBreaker<unknown[], unknown>>;

  constructor() {
    this.breakers = new Map();
    this.initializeBreakers();
  }

  /**
   * Initialize all circuit breakers
   */
  private initializeBreakers(): void {
    logger.info('Initializing circuit breakers...');

    // Pre-create breakers for critical services
    this.getOrCreateBreaker('database', circuitBreakerConfig.database as BreakerConfig);
    this.getOrCreateBreaker('redis', circuitBreakerConfig.redis as BreakerConfig);
    this.getOrCreateBreaker('elasticsearch', circuitBreakerConfig.elasticsearch as BreakerConfig);
    this.getOrCreateBreaker('external-api', circuitBreakerConfig.externalApi as BreakerConfig);
    this.getOrCreateBreaker('media-service', circuitBreakerConfig.mediaService as BreakerConfig);
    this.getOrCreateBreaker('notification-service', circuitBreakerConfig.notificationService as BreakerConfig);
    this.getOrCreateBreaker('email-service', circuitBreakerConfig.emailService as BreakerConfig);

    logger.info(`Initialized ${this.breakers.size} circuit breakers`);
  }

  /**
   * Get or create a circuit breaker
   */
  private getOrCreateBreaker(
    name: string,
    config: BreakerConfig = circuitBreakerConfig.default as BreakerConfig
  ): CircuitBreaker<unknown[], unknown> {
    if (this.breakers.has(name)) {
      return this.breakers.get(name)!;
    }

    const breaker = new CircuitBreaker(
      async (fn: () => Promise<unknown>) => fn(),
      {
        timeout: config.timeout,
        errorThresholdPercentage: config.errorThresholdPercentage,
        resetTimeout: config.resetTimeout,
        rollingCountTimeout: config.rollingCountTimeout,
        rollingCountBuckets: config.rollingCountBuckets,
        name,
        volumeThreshold: config.volumeThreshold,
        enabled: config.enabled,
      }
    );

    // Event listeners
    this.setupBreakerEvents(breaker, name);

    this.breakers.set(name, breaker);
    logger.info(`Circuit breaker created: ${name}`);

    return breaker;
  }

  /**
   * Setup event listeners for a breaker
   */
  private setupBreakerEvents(breaker: CircuitBreaker<unknown[], unknown>, name: string): void {
    breaker.on('open', () => {
      logger.error(`🔴 Circuit breaker OPEN: ${name}`, {
        stats: breaker.stats,
      });
    });

    breaker.on('halfOpen', () => {
      logger.warn(`🟡 Circuit breaker HALF-OPEN: ${name}`, {
        stats: breaker.stats,
      });
    });

    breaker.on('close', () => {
      logger.info(`🟢 Circuit breaker CLOSED: ${name}`, {
        stats: breaker.stats,
      });
    });

    breaker.on('failure', (error: Error) => {
      if (circuitBreakerConfig.events.logErrors) {
        logger.error(`Circuit breaker failure: ${name}`, {
          error: error.message,
        });
      }
    });

    breaker.on('timeout', () => {
      logger.warn(`Circuit breaker timeout: ${name}`);
    });

    breaker.on('reject', () => {
      if (circuitBreakerConfig.events.logFallbacks) {
        logger.warn(`Circuit breaker rejected request: ${name}`);
      }
    });

    breaker.on('fallback', (result: unknown) => {
      if (circuitBreakerConfig.events.logFallbacks) {
        logger.info(`Circuit breaker fallback executed: ${name}`, { result });
      }
    });
  }

  /**
   * Get circuit breaker stats (helper method)
   */
  private getStats(breaker: CircuitBreaker<unknown[], unknown>): BreakerStats {
    const state = breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed';
    
    return {
      name: breaker.name,
      state,
      stats: breaker.stats as unknown as Record<string, unknown>,
      isOpen: breaker.opened,
      isHalfOpen: breaker.halfOpen || false,
    };
  }

  // =====================================================
  // EXECUTE WITH CIRCUIT BREAKER
  // =====================================================

  async execute<T>(
    breakerName: string,
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    const breaker = this.getOrCreateBreaker(breakerName);

    if (fallback) {
      breaker.fallback(fallback);
    }

    try {
      return await breaker.fire(operation) as T;
    } catch (error : any) {
      const err = error as Error;
      
      if (err.message === 'Breaker is open') {
        const config = this.getBreakerConfig(breakerName);
        
        if (config?.fallback) {
          logger.warn(`Using configured fallback for ${breakerName}`, config.fallback);
          throw new Error(config.fallback.message);
        }
        
        throw new Error(`Service temporarily unavailable: ${breakerName}`);
      }
      
      throw error;
    }
  }

  // =====================================================
  // SERVICE-SPECIFIC EXECUTORS
  // =====================================================

  async executeDatabase<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    return this.execute('database', operation, fallback);
  }

  async executeRedis<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    return this.execute('redis', operation, fallback);
  }

  async executeElasticsearch<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    return this.execute('elasticsearch', operation, fallback);
  }

  async executeExternalApi<T>(
    apiName: string,
    operation: () => Promise<T>,
    fallback?: () => T
  ): Promise<T> {
    const breakerName = `api-${apiName}`;
    return this.execute(breakerName, operation, fallback);
  }

  async executeMediaService<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    return this.execute('media-service', operation, fallback);
  }

  async executeNotificationService<T>(
    operation: () => Promise<T>,
    fallback?: () => T
  ): Promise<T> {
    return this.execute('notification-service', operation, fallback);
  }

  async executeEmailService<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    return this.execute('email-service', operation, fallback);
  }

  // =====================================================
  // BREAKER MANAGEMENT
  // =====================================================

  getBreaker(name: string): CircuitBreaker<unknown[], unknown> | undefined {
    return this.breakers.get(name);
  }

  getBreakerConfig(name: string): BreakerConfig | undefined {
    const config = circuitBreakerConfig[name as keyof typeof circuitBreakerConfig];
    if (typeof config === 'object' && config !== null) {
      return config as BreakerConfig;
    }
    return undefined;
  }

  getAllBreakers(): Map<string, CircuitBreaker<unknown[], unknown>> {
    return this.breakers;
  }

  // =====================================================
  // STATISTICS & MONITORING
  // =====================================================

  getBreakerStats(name: string): BreakerStats | null {
    const breaker = this.breakers.get(name);
    if (!breaker) return null;

    return this.getStats(breaker);
  }

  getAllBreakerStats(): BreakerStats[] {
    const stats: BreakerStats[] = [];

    for (const breaker of this.breakers.values()) {
      stats.push(this.getStats(breaker));
    }

    return stats;
  }

  getHealthStatus(): {
    healthy: boolean;
    totalBreakers: number;
    openBreakers: number;
    halfOpenBreakers: number;
    closedBreakers: number;
    breakers: BreakerStats[];
  } {
    const stats = this.getAllBreakerStats();

    const openBreakers = stats.filter((s) => s.state === 'open').length;
    const halfOpenBreakers = stats.filter((s) => s.state === 'half-open').length;
    const closedBreakers = stats.filter((s) => s.state === 'closed').length;

    return {
      healthy: openBreakers === 0,
      totalBreakers: stats.length,
      openBreakers,
      halfOpenBreakers,
      closedBreakers,
      breakers: stats,
    };
  }

  // =====================================================
  // MANUAL CONTROLS
  // =====================================================

  openBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.open();
      logger.warn(`Manually opened circuit breaker: ${name}`);
    }
  }

  closeBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.close();
      logger.info(`Manually closed circuit breaker: ${name}`);
    }
  }

  resetBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      // Clear the breaker and recreate it
      const config = this.getBreakerConfig(name);
      this.breakers.delete(name);
      if (config) {
        this.getOrCreateBreaker(name, config);
      }
      logger.info(`Reset circuit breaker: ${name}`);
    }
  }

  enableBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.enable();
      logger.info(`Enabled circuit breaker: ${name}`);
    }
  }

  disableBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.disable();
      logger.warn(`Disabled circuit breaker: ${name}`);
    }
  }

  // =====================================================
  // SHUTDOWN
  // =====================================================

  shutdown(): void {
    logger.info('Shutting down all circuit breakers...');
    
    for (const [name, breaker] of this.breakers) {
      breaker.shutdown();
      logger.debug(`Circuit breaker shutdown: ${name}`);
    }

    this.breakers.clear();
    logger.info('All circuit breakers shut down');
  }
}

export default new CircuitBreakerService();