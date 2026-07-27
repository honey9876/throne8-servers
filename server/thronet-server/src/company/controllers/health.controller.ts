// =====================================================
// FILE 1: src/controllers/health.controller.ts
// =====================================================
import { Request, Response } from 'express';
import {
  getConnectionStatus,
  healthCheck as dbHealthCheck,
  getDatabaseStats,
} from '@/database/connection';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import CacheUtil from '@/shared/cache.util';
import config from '@/config/env/env';

/**
 * Simple health check (fast response)
 * GET /health
 */
export const healthCheck = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const dbHealth = await dbHealthCheck();
    const connectionStatus = getConnectionStatus();

    const status = dbHealth ? 'ok' : 'degraded';
    const statusCode = dbHealth ? 200 : 503;

    res.status(statusCode).json({
      status,
      message: 'Server health check',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: connectionStatus.isConnected,
        ready: connectionStatus.readyState === 1,
        database: connectionStatus.dbName,
      },
      environment: config.NODE_ENV,
    });
  } catch (error : any) {
    const err = error as Error;
    logger.error('Health check failed:', err.message);
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Detailed health check with all services
 * GET /health/detailed
 */
export const detailedHealthCheck = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const startTime = Date.now();

    // Check MongoDB
    const dbHealth = await dbHealthCheck();
    const dbStatus = getConnectionStatus();
    let dbStats = null;
    try {
      dbStats = await getDatabaseStats();
    } catch (error : any) {
      logger.warn('Could not fetch DB stats:', error);
    }

    // Check Redis
    let redisHealth = false;
    let redisPing = 0;
    try {
      const pingStart = Date.now();
      const ping = await CacheUtil.ping();
      redisPing = Date.now() - pingStart;
      redisHealth = ping === 'PONG';
    } catch (error : any) {
      logger.warn('Redis health check failed:', error);
    }

    // System metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Overall status
    const allHealthy = dbHealth && redisHealth;
    const overallStatus = allHealthy ? 'healthy' : 'degraded';
    const statusCode = allHealthy ? 200 : 503;

    const responseTime = Date.now() - startTime;

    res.status(statusCode).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      version: config.API_VERSION,
      environment: config.NODE_ENV,

      services: {
        database: {
          status: dbHealth ? 'healthy' : 'unhealthy',
          connected: dbStatus.isConnected,
          readyState: dbStatus.readyStateName,
          database: dbStatus.dbName,
          host: dbStatus.host,
          stats: dbStats,
        },
        redis: {
          status: redisHealth ? 'healthy' : 'unhealthy',
          connected: redisHealth,
          ping: `${redisPing}ms`,
        },
        elasticsearch: {
          status: 'not_configured',
          message: 'Elasticsearch integration pending',
        },
        rabbitmq: {
          status: 'not_configured',
          message: 'RabbitMQ integration pending',
        },
      },

      system: {
        memory: {
          rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
          arrayBuffers: `${(memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`,
        },
        cpu: {
          user: `${(cpuUsage.user / 1000000).toFixed(2)}s`,
          system: `${(cpuUsage.system / 1000000).toFixed(2)}s`,
        },
        process: {
          pid: process.pid,
          version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      },
    });
  } catch (error : any) {
    const err = error as Error;
    logger.error('Detailed health check failed:', err.message);
    res.status(503).json({
      status: 'error',
      message: 'Detailed health check failed',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Kubernetes readiness probe
 * GET /health/ready
 * Returns 200 if service is ready to accept traffic
 */
export const readinessCheck = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    // Check critical dependencies
    const dbHealth = await dbHealthCheck();
    const dbStatus = getConnectionStatus();

    let redisHealth = false;
    try {
      const ping = await CacheUtil.ping();
      redisHealth = ping === 'PONG';
    } catch (error : any) {
      logger.warn('Redis readiness check failed:', error);
    }

    // Service is ready if DB and Redis are healthy
    const isReady = dbHealth && dbStatus.isConnected && redisHealth;

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        message: 'Service is ready to accept traffic',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
          redis: 'ok',
        },
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        message: 'Service is not ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbHealth ? 'ok' : 'failed',
          redis: redisHealth ? 'ok' : 'failed',
        },
      });
    }
  } catch (error : any) {
    const err = error as Error;
    logger.error('Readiness check failed:', err.message);
    res.status(503).json({
      status: 'not_ready',
      message: 'Readiness check failed',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Kubernetes liveness probe
 * GET /health/live
 * Returns 200 if service is alive (not deadlocked)
 */
export const livenessCheck = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    // Simple check - if we can respond, we're alive
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    // Check if process is not in critical state
    const isAlive = uptime > 0 && heapUsedPercent < 95;

    if (isAlive) {
      res.status(200).json({
        status: 'alive',
        message: 'Service is alive',
        timestamp: new Date().toISOString(),
        uptime: uptime,
        memory: {
          heapUsedPercent: `${heapUsedPercent.toFixed(2)}%`,
        },
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        message: 'Service may be deadlocked or out of memory',
        timestamp: new Date().toISOString(),
        uptime: uptime,
        memory: {
          heapUsedPercent: `${heapUsedPercent.toFixed(2)}%`,
        },
      });
    }
  } catch (error : any) {
    const err = error as Error;
    logger.error('Liveness check failed:', err.message);
    res.status(503).json({
      status: 'unhealthy',
      message: 'Liveness check failed',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
};

interface DependencyStatus {
  status: string;
  connected?: boolean;
  readyState?: string;
  database?: string;
  responseTime?: string;
  error?: string;
  message?: string;
}

/**
 * Dependencies status check
 * GET /health/dependencies
 */
export const dependenciesCheck = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const dependencies: Record<string, DependencyStatus> = {};

    // MongoDB Check
    try {
      const dbHealth = await dbHealthCheck();
      const dbStatus = getConnectionStatus();
      dependencies.mongodb = {
        status: dbHealth ? 'healthy' : 'unhealthy',
        connected: dbStatus.isConnected,
        readyState: dbStatus.readyStateName,
        database: dbStatus.dbName,
        responseTime: 'N/A',
      };
    } catch (error : any) {
      dependencies.mongodb = {
        status: 'unhealthy',
        error: (error as Error).message,
      };
    }

    // Redis Check
    try {
      const start = Date.now();
      const ping = await CacheUtil.ping();
      const responseTime = Date.now() - start;
      dependencies.redis = {
        status: ping === 'PONG' ? 'healthy' : 'unhealthy',
        connected: true,
        responseTime: `${responseTime}ms`,
      };
    } catch (error : any) {
      dependencies.redis = {
        status: 'unhealthy',
        connected: false,
        error: (error as Error).message,
      };
    }

    // Elasticsearch Check (placeholder)
    dependencies.elasticsearch = {
      status: 'not_configured',
      message: 'Elasticsearch integration pending',
    };

    // RabbitMQ Check (placeholder)
    dependencies.rabbitmq = {
      status: 'not_configured',
      message: 'RabbitMQ integration pending',
    };

    // Overall status
    const allHealthy = Object.values(dependencies).every(
      (dep) => dep.status === 'healthy' || dep.status === 'not_configured'
    );

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies,
    });
  } catch (error : any) {
    const err = error as Error;
    logger.error('Dependencies check failed:', err.message);
    ResponseUtil.error(res, 'Dependencies check failed', 503);
  }
};

export default {
  healthCheck,
  detailedHealthCheck,
  readinessCheck,
  livenessCheck,
  dependenciesCheck,
};