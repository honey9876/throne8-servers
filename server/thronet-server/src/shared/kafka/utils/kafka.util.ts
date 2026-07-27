/**
 * kafka.util.ts
 * Kafka Utility Functions
 * Helper functions for Kafka operations
 * 
 * @version 3.0.0
 */

import { Kafka, Admin, ITopicConfig } from 'kafkajs';
import kafkaConfig from '@/config/kafka.config';
import { LoggerUtil } from '@/shared/logger.util';
import topics, { TopicConfig } from '@/kafka/config/topic.config';

// ==================== KAFKA UTILITY CLASS ====================

export class KafkaUtil {
    private static kafka: Kafka | null = null;
    private static admin: Admin | null = null;

    /**
     * Get Kafka instance
     */
    static getKafka(): Kafka {
        if (!this.kafka) {
            this.kafka = new Kafka(kafkaConfig);
        }
        return this.kafka;
    }

    /**
     * Get Admin client
     */
    static async getAdmin(): Promise<Admin> {
        if (!this.admin) {
            this.admin = this.getKafka().admin();
            await this.admin.connect();
            LoggerUtil.info('✅ Kafka admin connected');
        }
        return this.admin;
    }

    /**
     * Disconnect admin client
     */
    static async disconnectAdmin(): Promise<void> {
        if (this.admin) {
            await this.admin.disconnect();
            this.admin = null;
            LoggerUtil.info('✅ Kafka admin disconnected');
        }
    }

    /**
     * Create topics if they don't exist
     */
    static async createTopics(): Promise<void> {
        try {
            const admin = await this.getAdmin();

            const topicsToCreate: ITopicConfig[] = Object.values(topics).map((config: TopicConfig) => ({
                topic: config.topic,
                numPartitions: config.numPartitions,
                replicationFactor: config.replicationFactor,
                configEntries: config.configEntries,
            }));

            LoggerUtil.info('Creating Kafka topics...', {
                topics: topicsToCreate.map(t => t.topic),
            });

            const result = await admin.createTopics({
                topics: topicsToCreate,
                waitForLeaders: true,
                timeout: 10000,
            });

            if (result) {
                LoggerUtil.info('✅ Kafka topics created successfully');
            } else {
                LoggerUtil.info('ℹ️ Kafka topics already exist');
            }
        } catch (error: any) {
            if (error.message.includes('already exists')) {
                LoggerUtil.info('ℹ️ Topics already exist, skipping creation');
            } else {
                LoggerUtil.error('Failed to create Kafka topics', {
                    error: error.message,
                });
                throw error;
            }
        }
    }

    /**
     * List all topics
     */
    static async listTopics(): Promise<string[]> {
        try {
            const admin = await this.getAdmin();
            const topics = await admin.listTopics();

            LoggerUtil.info('Kafka topics', { topics });
            return topics;
        } catch (error: any) {
            LoggerUtil.error('Failed to list topics', { error: error.message });
            return [];
        }
    }

    /**
     * Check if topic exists
     */
    static async topicExists(topicName: string): Promise<boolean> {
        try {
            const topics = await this.listTopics();
            return topics.includes(topicName);
        } catch (error: any) {
            LoggerUtil.error('Failed to check topic existence', {
                topic: topicName,
                error: error.message,
            });
            return false;
        }
    }

    /**
     * Delete topic (use with caution)
     */
    static async deleteTopic(topicName: string): Promise<void> {
        try {
            const admin = await this.getAdmin();

            LoggerUtil.warn('Deleting Kafka topic', { topic: topicName });

            await admin.deleteTopics({
                topics: [topicName],
                timeout: 10000,
            });

            LoggerUtil.info('✅ Kafka topic deleted', { topic: topicName });
        } catch (error: any) {
            LoggerUtil.error('Failed to delete topic', {
                topic: topicName,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get topic metadata
     */
    static async getTopicMetadata(topicName: string): Promise<any> {
        try {
            const admin = await this.getAdmin();

            const metadata = await admin.fetchTopicMetadata({
                topics: [topicName],
            });

            LoggerUtil.info('Topic metadata', { topic: topicName, metadata });
            return metadata;
        } catch (error: any) {
            LoggerUtil.error('Failed to fetch topic metadata', {
                topic: topicName,
                error: error.message,
            });
            return null;
        }
    }

    /**
     * Describe topic configuration
     */
    static async describeTopicConfig(topicName: string): Promise<any> {
        try {
            const admin = await this.getAdmin();

            const config = await admin.describeConfigs({
                resources: [
                    {
                        type: 2, // TOPIC
                        name: topicName,
                    },
                ],
                includeSynonyms: false
            });

            LoggerUtil.info('Topic configuration', { topic: topicName, config });
            return config;
        } catch (error: any) {
            LoggerUtil.error('Failed to describe topic config', {
                topic: topicName,
                error: error.message,
            });
            return null;
        }
    }

    /**
     * Check Kafka cluster health
     */
    static async checkClusterHealth(): Promise<{
        isHealthy: boolean;
        brokers: number;
        topics: number;
        error?: string;
    }> {
        try {
            const admin = await this.getAdmin();

            const cluster = await admin.describeCluster();
            const topics = await admin.listTopics();

            const health = {
                isHealthy: cluster.brokers.length > 0,
                brokers: cluster.brokers.length,
                topics: topics.length,
            };

            LoggerUtil.info('Kafka cluster health', health);
            return health;
        } catch (error: any) {
            LoggerUtil.error('Kafka cluster health check failed', {
                error: error.message,
            });

            return {
                isHealthy: false,
                brokers: 0,
                topics: 0,
                error: error.message,
            };
        }
    }

    /**
     * Get consumer groups
     */
    static async listConsumerGroups(): Promise<any[]> {
        try {
            const admin = await this.getAdmin();

            const groups = await admin.listGroups();

            LoggerUtil.info('Consumer groups', { count: groups.groups.length });
            return groups.groups;
        } catch (error: any) {
            LoggerUtil.error('Failed to list consumer groups', {
                error: error.message,
            });
            return [];
        }
    }

    /**
     * Delete consumer group (use with caution)
     */
    static async deleteConsumerGroup(groupId: string): Promise<void> {
        try {
            const admin = await this.getAdmin();

            LoggerUtil.warn('Deleting consumer group', { groupId });

            await admin.deleteGroups([groupId]);

            LoggerUtil.info('✅ Consumer group deleted', { groupId });
        } catch (error: any) {
            LoggerUtil.error('Failed to delete consumer group', {
                groupId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Initialize Kafka (create topics if needed)
     */
    static async initialize(): Promise<void> {
        try {
            LoggerUtil.info('🔧 Initializing Kafka...');

            // Create topics
            await this.createTopics();

            // Check cluster health
            const health = await this.checkClusterHealth();

            if (!health.isHealthy) {
                throw new Error('Kafka cluster is not healthy');
            }

            LoggerUtil.info('✅ Kafka initialized successfully', {
                brokers: health.brokers,
                topics: health.topics,
            });
        } catch (error: any) {
            LoggerUtil.error('❌ Kafka initialization failed', {
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Cleanup (disconnect admin)
     */
    static async cleanup(): Promise<void> {
        await this.disconnectAdmin();
    }
}

// ==================== EXPORT ====================

export default KafkaUtil;