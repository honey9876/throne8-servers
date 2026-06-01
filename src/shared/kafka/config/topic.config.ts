/**
 * topics.config.ts
 * Kafka Topics Configuration
 * Centralized topic management for auth-service
 * 
 * @version 3.0.0
 */

export interface TopicConfig {
    topic: string;
    numPartitions: number;
    replicationFactor: number;
    configEntries?: Array<{ name: string; value: string }>;
}

export interface Topics {
    auditEvents: TopicConfig;
    userEvents: TopicConfig;
    authEvents: TopicConfig;
}

const topics: Topics = {
    auditEvents: {
        topic: process.env['KAFKA_AUDIT_TOPIC'] || 'audit-events',
        numPartitions: 3,
        replicationFactor: 1,
        configEntries: [
            { name: 'retention.ms', value: '604800000' }, // 7 days
            { name: 'compression.type', value: 'gzip' },
            { name: 'cleanup.policy', value: 'delete' },
        ],
    },
    userEvents: {
        topic: process.env['KAFKA_USER_TOPIC'] || 'user-events',
        numPartitions: 3,
        replicationFactor: 1,
        configEntries: [
            { name: 'retention.ms', value: '2592000000' }, // 30 days
            { name: 'compression.type', value: 'gzip' },
        ],
    },
    authEvents: {
        topic: process.env['KAFKA_AUTH_TOPIC'] || 'auth-events',
        numPartitions: 3,
        replicationFactor: 1,
        configEntries: [
            { name: 'retention.ms', value: '1209600000' }, // 14 days
            { name: 'compression.type', value: 'gzip' },
        ],
    },
};

export default topics;

/**
 * Get all topic names as array
 */
export function getAllTopicNames(): string[] {
    return Object.values(topics).map(config => config.topic);
}

/**
 * Get topic config by name
 */
export function getTopicConfig(topicName: keyof Topics): TopicConfig | null {
    return topics[topicName] || null;
}








// /**
//  * topics.ts
//  * Professional-level Kafka topic definitions for auth-service-phase3-kafka
//  * Defines topics with partitions and replication
//  * Compliant with NIST 800-63B and OWASP guidelines
//  *
//  * @module kafka/config/topics
//  * @version 3.0.0
//  */

// // ==================== INTERFACES ====================

// interface TopicConfig {
//     topic: string;
//     partitions: number;
//     replicationFactor: number;
// }

// interface TopicsConfiguration {
//     authEvents: TopicConfig;
//     userEvents: TopicConfig;
//     auditEvents: TopicConfig;
//     notificationEvents: TopicConfig;
//     analyticsEvents: TopicConfig;
//     fraudDetection: TopicConfig;
//     sessionAnalysis: TopicConfig;
//     userActivity: TopicConfig;
// }

// // ==================== TOPIC CONFIGURATIONS ====================

// const topics: TopicsConfiguration = {
//     authEvents: {
//         topic: 'auth.events',
//         partitions: 10,
//         replicationFactor: 3,
//     },
//     userEvents: {
//         topic: 'user.events',
//         partitions: 10,
//         replicationFactor: 3,
//     },
//     auditEvents: {
//         topic: 'audit.events',
//         partitions: 20,
//         replicationFactor: 3,
//     },
//     notificationEvents: {
//         topic: 'notification.events',
//         partitions: 15,
//         replicationFactor: 3,
//     },
//     analyticsEvents: {
//         topic: 'analytics.events',
//         partitions: 20,
//         replicationFactor: 3,
//     },
//     fraudDetection: {
//         topic: 'fraud.detection',
//         partitions: 10,
//         replicationFactor: 3,
//     },
//     sessionAnalysis: {
//         topic: 'session.analysis',
//         partitions: 10,
//         replicationFactor: 3,
//     },
//     userActivity: {
//         topic: 'user.activity',
//         partitions: 15,
//         replicationFactor: 3,
//     },
// } as const;

// // ==================== TOPIC NAMES ====================

// export const TOPIC_NAMES = {
//     AUTH_EVENTS: topics.authEvents.topic,
//     USER_EVENTS: topics.userEvents.topic,
//     AUDIT_EVENTS: topics.auditEvents.topic,
//     NOTIFICATION_EVENTS: topics.notificationEvents.topic,
//     ANALYTICS_EVENTS: topics.analyticsEvents.topic,
//     FRAUD_DETECTION: topics.fraudDetection.topic,
//     SESSION_ANALYSIS: topics.sessionAnalysis.topic,
//     USER_ACTIVITY: topics.userActivity.topic,
// } as const;

// // ==================== UTILITY FUNCTIONS ====================

// /**
//  * Get all topic names as an array
//  *
//  * @returns Array of topic names
//  */
// export function getAllTopicNames(): string[] {
//     return Object.values(topics).map((config) => config.topic);
// }

// /**
//  * Get topic configuration by name
//  *
//  * @param topicName - Name of the topic
//  * @returns Topic configuration or undefined
//  */
// export function getTopicConfig(topicName: string): TopicConfig | undefined {
//     return Object.values(topics).find((config) => config.topic === topicName);
// }

// /**
//  * Validate if a topic name exists
//  *
//  * @param topicName - Name of the topic
//  * @returns True if topic exists
//  */
// export function isValidTopic(topicName: string): boolean {
//     return getAllTopicNames().includes(topicName);
// }

// /**
//  * Get total number of partitions across all topics
//  *
//  * @returns Total partition count
//  */
// export function getTotalPartitions(): number {
//     return Object.values(topics).reduce((sum, config) => sum + config.partitions, 0);
// }

// /**
//  * Get topic configurations as array
//  *
//  * @returns Array of topic configurations
//  */
// export function getTopicConfigsArray(): TopicConfig[] {
//     return Object.values(topics);
// }

// // ==================== TYPE EXPORTS ====================

// export type TopicName = keyof TopicsConfiguration;
// export type TopicConfigValue = TopicsConfiguration[TopicName];

// // ==================== DEFAULT EXPORT ====================

// export default topics;

// export { TopicConfig, TopicsConfiguration };