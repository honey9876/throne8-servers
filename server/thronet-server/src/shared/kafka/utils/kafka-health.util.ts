/**
 * kafka-health.util.ts
 * Kafka Health Monitoring Utility
 * Checks Kafka connection and topic health
 * 
 * @version 3.0.0
 */

import { Kafka, Admin } from 'kafkajs';
import kafkaConfig from '@/config/kafka.config';
import { LoggerUtil } from '@/shared/logger.util';
import { getAllTopicNames } from '@/kafka/config/topic.config';

export interface KafkaHealthStatus {
    isHealthy: boolean;
    brokers: number;
    topics: string[];
    missingTopics: string[];
    timestamp: string;
    error?: string;
}

export class KafkaHealthUtil {
    private static admin: Admin | null = null;

    /**
     * Check Kafka health
     */
    static async checkHealth(): Promise<KafkaHealthStatus> {
        const timestamp = new Date().toISOString();
        const expectedTopics = getAllTopicNames();

        try {
            const admin = await this.getAdmin();

            // Get cluster info
            const cluster = await admin.describeCluster();
            const topics = await admin.listTopics();

            const missingTopics = expectedTopics.filter(topic => !topics.includes(topic));

            const isHealthy = cluster.brokers.length > 0 && missingTopics.length === 0;

            return {
                isHealthy,
                brokers: cluster.brokers.length,
                topics: topics.filter(t => expectedTopics.includes(t)),
                missingTopics,
                timestamp,
            };
        } catch (error: any) {
            LoggerUtil.error('Kafka health check failed', { error: error.message });

            return {
                isHealthy: false,
                brokers: 0,
                topics: [],
                missingTopics: expectedTopics,
                timestamp,
                error: error.message,
            };
        }
    }

    /**
     * Create missing topics
     */
    static async createMissingTopics(): Promise<void> {
        try {
            const admin = await this.getAdmin();
            const health = await this.checkHealth();

            if (health.missingTopics.length === 0) {
                LoggerUtil.info('All Kafka topics exist');
                return;
            }

            LoggerUtil.info(`Creating ${health.missingTopics.length} missing topics...`, {
                topics: health.missingTopics,
            });

            await admin.createTopics({
                topics: health.missingTopics.map(topic => ({
                    topic,
                    numPartitions: 3,
                    replicationFactor: 1,
                })),
            });

            LoggerUtil.info('✅ Missing topics created successfully');
        } catch (error: any) {
            LoggerUtil.error('Failed to create topics', { error: error.message });
            throw error;
        }
    }

    /**
     * Get or create admin client
     */
    private static async getAdmin(): Promise<Admin> {
        if (!this.admin) {
            const kafka = new Kafka(kafkaConfig);
            this.admin = kafka.admin();
            await this.admin.connect();
        }
        return this.admin;
    }

    /**
     * Disconnect admin client
     */
    static async disconnect(): Promise<void> {
        if (this.admin) {
            await this.admin.disconnect();
            this.admin = null;
        }
    }
}