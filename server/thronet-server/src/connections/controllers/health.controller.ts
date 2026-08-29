// src/connections/controllers/health.controller.ts - Updated with Network Status
import { Request, Response } from 'express';
// ⚠️ neo4j.ts is currently empty/fully commented -> "not a module" error.
// Path is correct, but the file itself needs at least one export before this will compile.
// Comment this out until neo4j.ts has real exports, or add a dummy export in that file.
// import { getNeo4jDriver } from '@/config/neo4j/neo4j';
import databaseConnection from '@/database/connection'; // default export = object with connectDB/healthCheck/getConnectionStatus etc.
import environmentConfig from '@/config/environment/environment';
import logger, { LogCategory } from '@/shared/logger.util';
import constants from '@/shared/constants.util'; // default export = big nested object, use constants.HTTP_STATUS.OK etc.
import cacheService from '@/shared/cache.util'; // ⚠️ confirm export name in cache.util.ts
import os from 'os';

const HTTP_STATUS = constants.HTTP_STATUS;

class HealthController {
  /**
   * Feature 1: Check Service Health - Simple health check
   */
  async checkServiceHealth(_req: Request, res: Response): Promise<void> {
    try {
      // Neo4j check disabled until config/neo4j/neo4j.ts is fixed
      // const driver = await getNeo4jDriver();
      // await driver.verifyConnectivity();

      // Check cache connectivity
      await cacheService.get('health-check');

      const healthData = {
        status: 'OK',
        message: 'Connection Service is running successfully',
        service: environmentConfig.SERVICE_NAME,
        version: environmentConfig.BUILD_ID,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: environmentConfig.NODE_ENV,
        features: {
          networkAnalysis: true,
          connectionManagement: true,
          degreeCalculation: true,
          mutualConnections: true,
          searchCapabilities: true,
          followSystem: true,
          blockingSystem: true,
          profileViews: true
        }
      };

      logger.info('Health check requested', { category: LogCategory.SYSTEM, data: healthData });
      res.status(HTTP_STATUS.OK).json({ success: true, data: healthData });
    } catch (error: any) {
      logger.error('Health check failed', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Service health check failed',
        error: environmentConfig.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Feature 2: Check Database Connectivity - MongoDB health check
   */
  async checkDatabaseConnectivity(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Database connectivity check requested', { category: LogCategory.DATABASE });
      const isHealthy = await databaseConnection.healthCheck();
      const connStatus = databaseConnection.getConnectionStatus();

      const statusCode = isHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({
        success: isHealthy,
        data: {
          status: isHealthy ? 'OK' : 'ERROR',
          message: isHealthy ? 'Database connection is healthy' : 'Database connection failed',
          database: {
            connected: connStatus.isConnected,
            type: 'MongoDB',
            readyState: connStatus.readyState,
            readyStateName: connStatus.readyStateName,
            host: connStatus.host,
            dbName: connStatus.dbName,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      logger.error('Database connectivity check failed', {
        category: LogCategory.DATABASE,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Database connectivity check failed',
        database: {
          connected: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Feature 3: Check Redis Connectivity
   * ⚠️ DISABLED - config/cache/redis.config.ts is a pure CONFIG provider
   * (RedisConfigManager class), not an actual Redis client/connection.
   * It has no ping/healthCheck against a live connection.
   * The real Redis client instance almost certainly lives in shared/cache.util.ts
   * (the file cacheService is imported from above) — once that file's content is
   * confirmed, wire this up to its actual ping/health method instead.
   */
  async checkRedisConnectivity(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Redis connectivity check requested', { category: LogCategory.REDIS });

      // Using cacheService (shared/cache.util.ts) as a proxy health-check,
      // since redis.config.ts has no live connection to check.
      const testKey = '__redis_health_check__';
      await cacheService.set(testKey, '1', 5);
      const val = await cacheService.get(testKey);
      const connected = val !== null && val !== undefined;
      if (connected) await cacheService.del(testKey);

      const statusCode = connected ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({
        success: connected,
        data: {
          status: connected ? 'OK' : 'ERROR',
          message: connected ? 'Redis connection is healthy' : 'Redis connection failed',
          redis: {
            connected,
            type: 'Redis',
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      logger.error('Redis connectivity check failed', {
        category: LogCategory.REDIS,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Redis connectivity check failed',
        redis: {
          connected: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Feature 4: Check Neo4j Connectivity
   * ⚠️ DISABLED - neo4j.ts is currently empty/commented, has no working getNeo4jDriver export.
   * Re-enable once config/neo4j/neo4j.ts is actually implemented.
   */
  async checkNeo4jConnectivity(_req: Request, res: Response): Promise<void> {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      message: 'Neo4j connectivity check is temporarily disabled (neo4j.ts not implemented)',
      neo4j: {
        connected: false,
        error: 'neo4j.ts has no working exports yet',
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Feature 5: Get System Metrics
   */
  async getSystemMetrics(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('System metrics requested', { category: LogCategory.SYSTEM });

      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsagePercent = ((usedMemory / totalMemory) * 100).toFixed(2);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          status: 'OK',
          message: 'System metrics retrieved successfully',
          metrics: {
            cpuCount: os.cpus().length,
            cpuModel: os.cpus()[0].model,
            loadAverage: os.loadavg(),
            totalMemory: (totalMemory / 1024 / 1024).toFixed(2),
            freeMemory: (freeMemory / 1024 / 1024).toFixed(2),
            usedMemory: (usedMemory / 1024 / 1024).toFixed(2),
            memoryUsagePercent: parseFloat(memoryUsagePercent),
            uptime: os.uptime(),
            processUptime: process.uptime(),
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      logger.error('System metrics check failed', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'System metrics retrieval failed',
        error: environmentConfig.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Feature 6: Get Comprehensive Service Status
   */
  async getServiceStatus(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Service status requested', { category: LogCategory.SYSTEM });

      const serviceHealth = {
        status: 'OK',
        message: 'Connection Service is running successfully',
        service: environmentConfig.SERVICE_NAME,
        version: environmentConfig.BUILD_ID,
        uptime: process.uptime(),
        environment: environmentConfig.NODE_ENV
      };

      // Check MongoDB
      let dbStatus: { connected: boolean; readyStateName?: string; error?: string };
      try {
        const isHealthy = await databaseConnection.healthCheck();
        const connStatus = databaseConnection.getConnectionStatus();
        dbStatus = { connected: isHealthy, readyStateName: connStatus.readyStateName };
      } catch (error: any) {
        logger.error('MongoDB status check failed', {
          category: LogCategory.DATABASE,
          error: error instanceof Error ? error.message : String(error)
        });
        dbStatus = { connected: false, error: error.message };
      }

      // Check Redis (proxy via cacheService — see checkRedisConnectivity note above)
      let redisStatus: { connected: boolean; error?: string };
      try {
        const testKey = '__redis_status_check__';
        await cacheService.set(testKey, '1', 5);
        const val = await cacheService.get(testKey);
        redisStatus = { connected: val !== null && val !== undefined };
        if (redisStatus.connected) await cacheService.del(testKey);
      } catch (error: any) {
        logger.error('Redis status check failed', {
          category: LogCategory.REDIS,
          error: error instanceof Error ? error.message : String(error)
        });
        redisStatus = { connected: false, error: error.message };
      }

      // Neo4j disabled (see checkNeo4jConnectivity note above)
      const neo4jStatus = { connected: false, error: 'neo4j.ts not implemented' };

      const overallStatus = (
        serviceHealth.status === 'OK' &&
        dbStatus.connected &&
        redisStatus.connected
      ) ? 'OK' : 'DEGRADED';

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          status: overallStatus,
          message: 'Comprehensive service status',
          components: {
            service: serviceHealth,
            mongodb: { ...dbStatus, type: 'MongoDB' },
            redis: { ...redisStatus, type: 'Redis' },
            neo4j: { ...neo4jStatus, type: 'Neo4j' },
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      logger.error('Service status check failed', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Service status check failed',
        error: environmentConfig.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Feature 7: Get Cache Status
   */
  async getCacheStatus(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Cache status requested', { category: LogCategory.CACHE_ERROR });

      const testKey = 'health-check-test';
      const testValue = { timestamp: new Date().toISOString(), test: true };

      await cacheService.set(testKey, JSON.stringify(testValue), 60);
      const cachedData = await cacheService.get(testKey);
      const isWorking = cachedData !== null;

      if (isWorking) {
        await cacheService.del(testKey);
      }

      const statusCode = isWorking ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({
        success: isWorking,
        data: {
          status: isWorking ? 'OK' : 'ERROR',
          message: isWorking ? 'Cache service is healthy' : 'Cache service failed',
          cache: {
            connected: isWorking,
            type: 'Redis Cache',
            testResult: isWorking ? 'PASS' : 'FAIL',
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      logger.error('Cache status check failed', {
        category: LogCategory.CACHE_ERROR,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Cache status check failed',
        cache: {
          connected: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Feature 8: Check Network Service Status
   */
  async checkNetworkStatus(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Network service status requested', { category: LogCategory.SYSTEM });

      let networkServiceStatus;
      try {
        const networkModule = await import('@/connections/services/network.service').catch(() => null);
        networkServiceStatus = {
          available: !!networkModule,
          type: 'NetworkService',
          timestamp: new Date().toISOString()
        };
      } catch (error: any) {
        networkServiceStatus = {
          available: false,
          error: error.message,
          type: 'NetworkService',
          timestamp: new Date().toISOString()
        };
      }

      const networkFeatures = {
        networkAnalysis: networkServiceStatus.available,
        connectionOverview: networkServiceStatus.available,
        growthCalculation: networkServiceStatus.available,
        compositionAnalysis: networkServiceStatus.available,
        healthScoring: networkServiceStatus.available,
        gapAnalysis: networkServiceStatus.available,
        influenceCalculation: networkServiceStatus.available,
        recommendations: networkServiceStatus.available,
        qualityAnalysis: networkServiceStatus.available,
        trendAnalysis: networkServiceStatus.available,
        densityCalculation: networkServiceStatus.available,
        keyConnections: networkServiceStatus.available,
        clusterAnalysis: networkServiceStatus.available,
        benchmarking: networkServiceStatus.available,
        growthPrediction: networkServiceStatus.available,
        patternAnalysis: networkServiceStatus.available,
        insightsGeneration: networkServiceStatus.available,
        valueCalculation: networkServiceStatus.available,
        opportunityFinding: networkServiceStatus.available,
        reportGeneration: networkServiceStatus.available,
        dataExport: networkServiceStatus.available
      };

      const statusCode = networkServiceStatus.available ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({
        success: networkServiceStatus.available,
        data: {
          status: networkServiceStatus.available ? 'OK' : 'ERROR',
          message: networkServiceStatus.available ? 'Network service is available' : 'Network service unavailable',
          networkService: networkServiceStatus,
          features: networkFeatures
        }
      });
    } catch (error: any) {
      logger.error('Network service status check failed', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Network service status check failed',
        networkService: {
          available: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Feature 9: Check Note Service Status
   */
  async checkNoteStatus(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Note service status requested', { category: LogCategory.SYSTEM });

      let noteServiceStatus;
      try {
        // ⚠️ confirm this is a named export in connections/models/ConnectionNote.ts
        const { ConnectionNote } = await import('@/connections/models/ConnectionNote');

        const noteCount = await ConnectionNote.countDocuments({ status: 'active' }).limit(1);

        noteServiceStatus = {
          available: true,
          modelLoaded: !!ConnectionNote,
          databaseConnected: true,
          recordsAccessible: noteCount >= 0,
          type: 'NoteService',
          timestamp: new Date().toISOString()
        };
      } catch (error: any) {
        noteServiceStatus = {
          available: false,
          error: error.message,
          type: 'NoteService',
          timestamp: new Date().toISOString()
        };
      }

      const noteFeatures = {
        noteCreation: noteServiceStatus.available,
        noteUpdate: noteServiceStatus.available,
        noteDeletion: noteServiceStatus.available,
        noteRetrieval: noteServiceStatus.available,
        noteSearch: noteServiceStatus.available,
        tagManagement: noteServiceStatus.available,
        noteSharing: noteServiceStatus.available,
        privacySettings: noteServiceStatus.available,
        noteExport: noteServiceStatus.available,
        noteHistory: noteServiceStatus.available,
        reminders: noteServiceStatus.available,
        bulkOperations: noteServiceStatus.available,
        attachmentSupport: noteServiceStatus.available,
        collaborationFeatures: noteServiceStatus.available,
        versionControl: noteServiceStatus.available
      };

      const statusCode = noteServiceStatus.available ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({
        success: noteServiceStatus.available,
        data: {
          status: noteServiceStatus.available ? 'OK' : 'ERROR',
          message: noteServiceStatus.available
            ? 'Note service is available and operational'
            : 'Note service unavailable',
          noteService: noteServiceStatus,
          features: noteFeatures,
          capabilities: {
            maxNotesPerConnection: 'unlimited',
            maxNoteSize: '50KB',
            maxTagsPerNote: 20,
            maxRemindersPerNote: 10,
            maxAttachmentsPerNote: 5,
            supportedFormats: ['text', 'markdown'],
            exportFormats: ['json', 'csv']
          }
        }
      });
    } catch (error: any) {
      logger.error('Note service status check failed', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Note service status check failed',
        noteService: {
          available: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Feature 10: Check Privacy Service Status
   */
  async checkPrivacyStatus(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Privacy service status requested', { category: LogCategory.SYSTEM });

      let privacyServiceStatus;
      try {
        // ⚠️ confirm export name: named `{ privacyService }` vs default export in privacy.service.ts
        const { privacyService } = await import('@/connections/services/privacy.service');

        const testUserId = 'health-check-test-user';
        const settings = await privacyService.getPrivacySettings(testUserId);

        // ⚠️ confirm default vs named export in ConnectionBlock model
        const { default: ConnectionBlock } = await import('@/connections/models/ConnectionBlock');
        const blockCount = await ConnectionBlock.countDocuments().limit(1);

        privacyServiceStatus = {
          available: true,
          serviceLoaded: !!privacyService,
          settingsAccessible: !!settings,
          databaseConnected: blockCount >= 0,
          type: 'PrivacyService',
          timestamp: new Date().toISOString()
        };
      } catch (error: any) {
        privacyServiceStatus = {
          available: false,
          error: error.message,
          type: 'PrivacyService',
          timestamp: new Date().toISOString()
        };
      }

      const privacyFeatures = {
        privacySettings: privacyServiceStatus.available,
        profileVisibility: privacyServiceStatus.available,
        userBlocking: privacyServiceStatus.available,
        connectionPrivacy: privacyServiceStatus.available,
        viewersControl: privacyServiceStatus.available,
        privacyAnalytics: privacyServiceStatus.available,
        dataExport: privacyServiceStatus.available,
        dataImport: privacyServiceStatus.available,
        gdprCompliance: privacyServiceStatus.available,
        batchOperations: privacyServiceStatus.available,
        cacheManagement: privacyServiceStatus.available,
        auditLogging: privacyServiceStatus.available,
        dataRetention: privacyServiceStatus.available,
        deletionRequests: privacyServiceStatus.available,
        complianceReports: privacyServiceStatus.available
      };

      const statusCode = privacyServiceStatus.available ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({
        success: privacyServiceStatus.available,
        data: {
          status: privacyServiceStatus.available ? 'OK' : 'ERROR',
          message: privacyServiceStatus.available
            ? 'Privacy service is available and operational'
            : 'Privacy service unavailable',
          privacyService: privacyServiceStatus,
          features: privacyFeatures,
          capabilities: {
            maxBlocksPerUser: 'unlimited',
            privacyLevels: ['public', 'private', 'connections'],
            dataExportFormats: ['json'],
            gdprCompliant: true,
            ccpaCompliant: true,
            cacheEnabled: true,
            circuitBreakerEnabled: true,
            distributedLocking: true
          }
        }
      });
    } catch (error: any) {
      logger.error('Privacy service status check failed', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Privacy service status check failed',
        privacyService: {
          available: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Feature 11: Check Kafka Service Status
   * ⚠️ DISABLED - '../kafka/kafkaClient' does not exist anywhere in the project.
   * Your actual Kafka setup lives in shared/kafka/producers/* (base.producer.ts etc.)
   * with a totally different API. Rebuild this properly once you need Kafka health-check,
   * pointing at the real producer/consumer instances instead of a fictional kafkaClient class.
   */
  async checkKafkaStatus(_req: Request, res: Response): Promise<void> {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      message: 'Kafka health-check is not implemented yet (kafkaClient.ts does not exist in this project)',
      kafkaService: {
        available: false,
        error: 'kafkaClient module not found - implement against shared/kafka/producers/*',
        timestamp: new Date().toISOString()
      }
    });
  }
}

export const healthController = new HealthController();