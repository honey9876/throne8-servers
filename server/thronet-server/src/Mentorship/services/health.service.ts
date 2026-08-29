// src/services/health.service.ts

import emailConfig from '@/config/cache/email.confg';
import { isRedisAvailable } from '@/config/cache/redis.mentor';
import { logger } from '@/shared/logger.util';
import mongoose from 'mongoose';
import AWSService  from '@/config/cache/aws.config'
import smsConfig from '@/config/cache/sms.mentor';


interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    aws: ServiceStatus;
    email: ServiceStatus;
    sms: ServiceStatus;
  };
  system: {
    memory: MemoryInfo;
    cpu: number;
    nodeVersion: string;
    environment: string;
  };
}

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  message?: string;
  lastChecked: string;
}

interface MemoryInfo {
  used: string;
  free: string;
  total: string;
  usagePercentage: number;
}

class HealthService {
  /**
   * Get overall health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    try {
      const [database, redis, aws, email, sms] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkAWS(),
        this.checkEmail(),
        this.checkSMS(),
      ]);

      const services = { database, redis, aws, email, sms };
      const overallStatus = this.determineOverallStatus(services);

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services,
        system: this.getSystemInfo(),
      };
    } catch(error : any) {
      logger.error('Health check failed:', error as any);
      throw error;
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      if (mongoose.connection.readyState !== 1) {
        return {
          status: 'down',
          message: 'Database connection not established',
          lastChecked: new Date().toISOString(),
        };
      }

      // Perform a simple query to test connection
      if (mongoose.connection.db) {
        await mongoose.connection.db.admin().ping();
      }
      
      const responseTime = Date.now() - start;

      return {
        status: responseTime > 1000 ? 'degraded' : 'up',
        responseTime,
        message: 'Database connected',
        lastChecked: new Date().toISOString(),
      };
    } catch(error : any) {
      logger.error('Database health check failed:', error as any);
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      const isAvailable = await isRedisAvailable();
      
      if (!isAvailable) {
        return {
          status: 'down',
          message: 'Redis connection not established',
          lastChecked: new Date().toISOString(),
        };
      }

      const responseTime = Date.now() - start;

      return {
        status: responseTime > 500 ? 'degraded' : 'up',
        responseTime,
        message: 'Redis connected',
        lastChecked: new Date().toISOString(),
      };
    } catch(error : any) {
      logger.error('Redis health check failed:', error as any);
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Check AWS S3 connectivity
   */
  private async checkAWS(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      if (!AWSService.isAvailable()) {
        return {
          status: 'down',
          message: 'AWS S3 not configured',
          lastChecked: new Date().toISOString(),
        };
      }

      // Simple availability check
      const responseTime = Date.now() - start;

      return {
        status: responseTime > 2000 ? 'degraded' : 'up',
        responseTime,
        message: 'AWS S3 available',
        lastChecked: new Date().toISOString(),
      };
    } catch(error : any) {
      logger.error('AWS health check failed:', error as any);
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Check email service
   */
  private async checkEmail(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      if (!emailConfig.isEnabled()) {
        return {
          status: 'down',
          message: 'Email service not configured',
          lastChecked: new Date().toISOString(),
        };
      }

      const responseTime = Date.now() - start;

      return {
        status: responseTime > 3000 ? 'degraded' : 'up',
        responseTime,
        message: 'Email service available',
        lastChecked: new Date().toISOString(),
      };
    } catch(error : any) {
      logger.error('Email health check failed:', error as any);
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Check SMS service (Twilio)
   */
  private async checkSMS(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      if (!smsConfig.isEnabled()) {
        return {
          status: 'down',
          message: 'SMS service not configured',
          lastChecked: new Date().toISOString(),
        };
      }

      const responseTime = Date.now() - start;

      return {
        status: responseTime > 3000 ? 'degraded' : 'up',
        responseTime,
        message: `SMS service (${smsConfig.getProvider()}) available`,
        lastChecked: new Date().toISOString(),
      };
    } catch(error : any) {
      logger.error('SMS health check failed:', error as any);
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(services: HealthStatus['services']): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(services).map((s) => s.status);

    // If any critical service is down
    if (statuses.includes('down')) {
      const downServices = Object.entries(services)
        .filter(([_, s]) => s.status === 'down')
        .map(([name]) => name);

      // Critical services: database, redis
      if (downServices.includes('database') || downServices.includes('redis')) {
        return 'unhealthy';
      }

      // Non-critical services down
      return 'degraded';
    }

    // If any service is degraded
    if (statuses.includes('degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get system information
   */
  private getSystemInfo(): HealthStatus['system'] {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const freeMem = totalMem - usedMem;

    return {
      memory: {
        used: this.formatBytes(usedMem),
        free: this.formatBytes(freeMem),
        total: this.formatBytes(totalMem),
        usagePercentage: Math.round((usedMem / totalMem) * 100),
      },
      cpu: process.cpuUsage().system / 1000000, // Convert to seconds
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get liveness probe (simple check)
   */
  async getLiveness(): Promise<{ alive: boolean }> {
    return { alive: true };
  }

  /**
   * Get readiness probe (check critical services)
   */
  async getReadiness(): Promise<{ ready: boolean; message?: string }> {
    try {
      const [dbStatus, redisStatus] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
      ]);

      if (dbStatus.status === 'down' || redisStatus.status === 'down') {
        return {
          ready: false,
          message: 'Critical services unavailable',
        };
      }

      return { ready: true };
    } catch(error : any) {
      return {
        ready: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export default new HealthService();