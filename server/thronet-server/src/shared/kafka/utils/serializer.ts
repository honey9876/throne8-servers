/**
 * serializer.ts
 * Professional-level Kafka message serializer for auth-service-phase3-kafka
 * Handles Avro serialization/deserialization
 * Compliant with NIST 800-63B and OWASP guidelines
 * 
 * @module kafka/utils/serializer
 * @version 3.0.0
 */

import { registry } from '@/kafka/schemas/index';
import LoggerUtil from '@/shared/logger.util';

// ==================== INTERFACES ====================

interface SerializationOptions {
    subject?: string;
    schemaId?: number;
}

interface DeserializationResult<T = any> {
    data: T;
    schemaId?: number;
}

// ==================== SERIALIZER CLASS ====================

class Serializer {
    private schemaName: string;
    private subject: string;

    constructor(schemaName: string) {
        this.schemaName = schemaName;
        this.subject = `${schemaName}-value`;
    }

    /**
 * Serialize data using Avro schema
 * 
 * @param data - Data to serialize
 * @param options - Serialization options
 * @returns Encoded buffer
 * @throws Error if serialization fails
 */
    async serialize(data: any, options?: SerializationOptions): Promise<Buffer> {
        try {
            const subject = options?.subject || this.subject;

            // Pehle latest schema ID fetch karo
            const schemaId = options?.schemaId || await registry.getLatestSchemaId(subject);

            // Ab schema ID aur data ke saath encode karo
            const encoded = await registry.encode(schemaId, data);

            LoggerUtil.debug(`Message serialized for schema: ${this.schemaName}`, {
                schemaName: this.schemaName,
                subject: subject,
                schemaId: schemaId,
                dataSize: encoded.length,
            });

            return encoded;
        } catch (error: unknown) {
            LoggerUtil.error(`Serialization failed for schema: ${this.schemaName}`, {
                error: (error as Error).message,
                schemaName: this.schemaName,
                subject: options?.subject || this.subject,
            });
            throw new Error(`Serialization failed: ${(error as Error).message}`);
        }
    }

    /**
     * Deserialize data using Avro schema
     * 
     * @param data - Encoded buffer to deserialize
     * @returns Decoded data
     * @throws Error if deserialization fails
     */
    async deserialize<T = any>(data: Buffer): Promise<T> {
        try {
            const decoded = await registry.decode(data) as T;

            LoggerUtil.debug(`Message deserialized for schema: ${this.schemaName}`, {
                schemaName: this.schemaName,
                dataSize: data.length,
            });

            return decoded;
        } catch (error: unknown) {
            LoggerUtil.error(`Deserialization failed for schema: ${this.schemaName}`, {
                error: (error as Error).message,
                schemaName: this.schemaName,
            });
            throw new Error(`Deserialization failed: ${(error as Error).message}`);
        }
    }

    /**
     * Serialize multiple messages in batch
     * 
     * @param dataArray - Array of data to serialize
     * @param options - Serialization options
     * @returns Array of encoded buffers
     * @throws Error if any serialization fails
     */
    async serializeBatch(dataArray: any[], options?: SerializationOptions): Promise<Buffer[]> {
        try {
            const encoded = await Promise.all(
                dataArray.map((data) => this.serialize(data, options))
            );

            LoggerUtil.info(`Batch serialized for schema: ${this.schemaName}`, {
                schemaName: this.schemaName,
                batchSize: dataArray.length,
            });

            return encoded;
        } catch (error: unknown) {
            LoggerUtil.error(`Batch serialization failed for schema: ${this.schemaName}`, {
                error: (error as Error).message,
                schemaName: this.schemaName,
                batchSize: dataArray.length,
            });
            throw error;
        }
    }

    /**
     * Deserialize multiple messages in batch
     * 
     * @param dataArray - Array of encoded buffers to deserialize
     * @returns Array of decoded data
     * @throws Error if any deserialization fails
     */
    async deserializeBatch<T = any>(dataArray: Buffer[]): Promise<T[]> {
        try {
            const decoded = await Promise.all(
                dataArray.map((data) => this.deserialize<T>(data))
            );

            LoggerUtil.info(`Batch deserialized for schema: ${this.schemaName}`, {
                schemaName: this.schemaName,
                batchSize: dataArray.length,
            });

            return decoded;
        } catch (error: unknown) {
            LoggerUtil.error(`Batch deserialization failed for schema: ${this.schemaName}`, {
                error: (error as Error).message,
                schemaName: this.schemaName,
                batchSize: dataArray.length,
            });
            throw error;
        }
    }

    /**
     * Get the schema name
     * 
     * @returns Schema name
     */
    getSchemaName(): string {
        return this.schemaName;
    }

    /**
     * Get the subject name
     * 
     * @returns Subject name
     */
    getSubject(): string {
        return this.subject;
    }

    /**
     * Validate data against schema (optional feature)
     * 
     * @param data - Data to validate
     * @returns True if valid
     */
    async validate(data: any): Promise<boolean> {
        try {
            await this.serialize(data);
            return true;
        } catch (error: unknown) {
            LoggerUtil.warn(`Validation failed for schema: ${this.schemaName}`, {
                error: (error as Error).message,
                schemaName: this.schemaName,
            });
            return false;
        }
    }
}

// ==================== EXPORT ====================

export default Serializer;

export { SerializationOptions, DeserializationResult };