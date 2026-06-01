// src/controllers/healthController.ts - Updated with Network Status
import { Request, Response } from 'express';
import { getNeo4jDriver } from '../config/neo4j';
import { checkMongoDBHealth } from '../config/database';
import { checkRedisConnection } from '../config/redis';
import cacheService from '../services/shared/cacheService';
import environmentConfig from '../config/environment';
import logger, { LogCategory } from '../utils/logger';
import { HTTP_STATUS } from '../utils/constants';
import os from 'os';

class HealthController {
  /**
   * Feature 1: Check Service Health - Simple health check
   */
  async checkServiceHealth(_req: Request, res: Response): Promise<void> {
    try {
      // Check Neo4j connectivity
      const driver = await getNeo4jDriver();
      await driver.verifyConnectivity();
      
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
      const dbStatus = await checkMongoDBHealth();
      
      const statusCode = dbStatus.connection === 'active' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({ 
        success: dbStatus.connection === 'active', 
        data: {
          status: dbStatus.connection === 'active' ? 'OK' : 'ERROR',
          message: dbStatus.connection === 'active' ? 'Database connection is healthy' : 'Database connection failed',
          database: {
            connected: dbStatus.connection === 'active',
            type: 'MongoDB',
            readyState: dbStatus.readyState,
            timestamp: new Date().toISOString(),
            ...(dbStatus.error && { error: dbStatus.error })
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
   */
  async checkRedisConnectivity(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Redis connectivity check requested', { category: LogCategory.REDIS });
      const redisStatus = await checkRedisConnection();
      
      const statusCode = redisStatus.connected ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({ 
        success: redisStatus.connected, 
        data: {
          status: redisStatus.connected ? 'OK' : 'ERROR',
          message: redisStatus.connected ? 'Redis connection is healthy' : 'Redis connection failed',
          redis: {
            ...redisStatus,
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
   */
  async checkNeo4jConnectivity(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Neo4j connectivity check requested', { category: LogCategory.DATABASE });
      const driver = await getNeo4jDriver();
      await driver.verifyConnectivity();
      
      res.status(HTTP_STATUS.OK).json({ 
        success: true, 
        data: {
          status: 'OK',
          message: 'Neo4j connection is healthy',
          neo4j: {
            connected: true,
            type: 'Neo4j',
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (error: any) {
      logger.error('Neo4j connectivity check failed', {
        category: LogCategory.DATABASE,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: 'Neo4j connectivity check failed',
        neo4j: { 
          connected: false, 
          error: error.message, 
          timestamp: new Date().toISOString() 
        }
      });
    }
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
      let dbStatus;
      try {
        dbStatus = await checkMongoDBHealth();
      } catch (error: any) {
        logger.error('MongoDB status check failed', {
          category: LogCategory.DATABASE,
          error: error instanceof Error ? error.message : String(error)
        });
        dbStatus = { connection: 'inactive', error: error.message };
      }

      // Check Redis
      let redisStatus;
      try {
        redisStatus = await checkRedisConnection();
      } catch (error: any) {
        logger.error('Redis status check failed', {
          category: LogCategory.REDIS,
          error: error instanceof Error ? error.message : String(error)
        });
        redisStatus = { connected: false, error: error.message };
      }

      // Check Neo4j
      let neo4jStatus;
      try {
        const driver = await getNeo4jDriver();
        await driver.verifyConnectivity();
        neo4jStatus = { connected: true };
      } catch (error: any) {
        logger.error('Neo4j status check failed', {
          category: LogCategory.DATABASE,
          error: error instanceof Error ? error.message : String(error)
        });
        neo4jStatus = { connected: false, error: error.message };
      }

      const overallStatus = (
        serviceHealth.status === 'OK' && 
        dbStatus.connection === 'active' && 
        redisStatus.connected && 
        neo4jStatus.connected
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
      
      // Test cache read/write
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
      
      // Check if network service is available
      let networkServiceStatus;
      try {
        const networkModule = await import('../services/networkService').catch(() => null);
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
      
      // Check if note-related collections and services are available
      let noteServiceStatus;
      try {
        // Check if ConnectionNote model is available
        const { ConnectionNote } = await import('../models/mongodb/ConnectionNote');
        
        // Test database query - count notes (quick operation)
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
      
      // Check if privacy service is available
      let privacyServiceStatus;
      try {
        const { privacyService } = await import('../services/privacyService');
        
        // Test basic privacy operations
        const testUserId = 'health-check-test-user';
        
        // Try to get privacy settings (should return defaults if user doesn't exist)
        const settings = await privacyService.getPrivacySettings(testUserId);
        
        // Check if ConnectionBlock model is accessible
        const { default: ConnectionBlock } = await import('../models/mongodb/ConnectionBlock');
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
 */
async checkKafkaStatus(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('Kafka service status requested', { category: LogCategory.SYSTEM });
    
    let kafkaServiceStatus;
    try {
      // Import Kafka client
      const kafkaClient = (await import('../kafka/kafkaClient')).default;
      
      // ✅ FIXED - Use correct method name
      const connectionStatus = kafkaClient.getConnectionStatus();
      
      // ✅ FIXED - Use correct method name
      const isHealthy = await kafkaClient.healthCheck();
      
      // Get admin client to check topics
      let topicsInfo = { count: 0, topics: [] as string[] };
      try {
        const admin = await kafkaClient.getAdmin();
        const topics = await admin.listTopics();
        topicsInfo = {
          count: topics.length,
          topics: topics.slice(0, 10) // First 10 topics
        };
      } catch (adminError) {
        logger.warn('Could not fetch Kafka topics', { 
          error: adminError instanceof Error ? adminError.message : String(adminError) 
        });
      }
      
      kafkaServiceStatus = {
        available: true,
        connected: connectionStatus.connected,
        healthy: isHealthy,
        producer: connectionStatus.producer,
        consumers: connectionStatus.consumers,
        admin: connectionStatus.admin,
        topicsCount: topicsInfo.count,
        topics: topicsInfo.topics,
        type: 'KafkaService',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      logger.error('Kafka status check failed', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error.message : String(error)
      });
      
      kafkaServiceStatus = {
        available: false,
        connected: false,
        healthy: false,
        error: error.message,
        type: 'KafkaService',
        timestamp: new Date().toISOString()
      };
    }

    const kafkaFeatures = {
      eventProduction: kafkaServiceStatus.connected,
      eventConsumption: kafkaServiceStatus.connected,
      connectionEvents: kafkaServiceStatus.connected,
      requestEvents: kafkaServiceStatus.connected,
      followEvents: kafkaServiceStatus.connected,
      blockEvents: kafkaServiceStatus.connected,
      networkEvents: kafkaServiceStatus.connected,
      analyticsEvents: kafkaServiceStatus.connected,
      notificationEvents: kafkaServiceStatus.connected,
      cacheInvalidation: kafkaServiceStatus.connected,
      deadLetterQueue: kafkaServiceStatus.connected,
      retryMechanism: kafkaServiceStatus.connected,
      batchProcessing: kafkaServiceStatus.connected,
      messagePartitioning: kafkaServiceStatus.connected,
      consumerGroups: kafkaServiceStatus.connected,
      idempotentProducer: true,
      compressionEnabled: true,
      metricsCollection: true
    };

    const statusCode = kafkaServiceStatus.available && kafkaServiceStatus.healthy 
      ? HTTP_STATUS.OK 
      : HTTP_STATUS.SERVICE_UNAVAILABLE;
      
    res.status(statusCode).json({ 
      success: kafkaServiceStatus.available && kafkaServiceStatus.healthy, 
      data: {
        status: (kafkaServiceStatus.available && kafkaServiceStatus.healthy) ? 'OK' : 'ERROR',
        message: (kafkaServiceStatus.available && kafkaServiceStatus.healthy)
          ? 'Kafka service is available and operational' 
          : 'Kafka service unavailable or unhealthy',
        kafkaService: kafkaServiceStatus,
        features: kafkaFeatures,
        capabilities: {
          brokerCount: 1, // Development setup
          replicationFactor: 1,
          minInSyncReplicas: 1,
          maxMessageSize: '1MB',
          retentionPeriod: '7 days',
          partitionsPerTopic: 3,
          compressionType: 'gzip',
          acks: 'all',
          batchSize: 16384,
          lingerMs: 10,
          idempotentProducer: true,
          maxInFlightRequests: 5
        }
      }
    });
  } catch (error: any) {
    logger.error('Kafka service status check failed', {
      category: LogCategory.SYSTEM,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      message: 'Kafka service status check failed',
      kafkaService: { 
        available: false, 
        error: error.message, 
        timestamp: new Date().toISOString() 
      }
    });
  }
}
}



export const healthController = new HealthController();