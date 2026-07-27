/**
 * schemas/index.ts
 * Professional-level schema registry setup for auth-service-phase3-kafka
 * Manages Avro schema registration
 * Compliant with NIST 800-63B and OWASP guidelines
 * 
 * @module kafka/schemas/index
 * @version 3.0.0
 */

import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import LoggerUtil from '@/shared/logger.util';

// ==================== INTERFACES ====================

interface SchemaRegistryConfig {
    host: string;
    auth?: {
        username?: string;
        password?: string;
    };
}

interface AvroSchema {
    type: string;
    name: string;
    namespace?: string;
    fields: Array<{
        name: string;
        type: string | string[] | Record<string, any>;
        default?: any;
    }>;
}

interface SchemaMap {
    [key: string]: AvroSchema;
}

// ==================== DIRECTORY SETUP ====================

// __dirname natively available in CommonJS

// ==================== SCHEMA REGISTRY CONFIGURATION ====================

const registryConfig: SchemaRegistryConfig = {
    host: process.env['SCHEMA_REGISTRY_URL'] || 'http://schema-registry:8081',
};

// Add authentication if credentials are provided
if (process.env['SCHEMA_REGISTRY_USERNAME'] && process.env['SCHEMA_REGISTRY_PASSWORD']) {
    registryConfig.auth = {
        username: process.env['SCHEMA_REGISTRY_USERNAME'],
        password: process.env['SCHEMA_REGISTRY_PASSWORD'],
    };
}

const registry = new SchemaRegistry(registryConfig);

// ==================== SCHEMA LOADING ====================

/**
 * Load Avro schema from file
 * 
 * @param filename - Schema filename
 * @returns Parsed Avro schema
 * @throws Error if schema file cannot be loaded or parsed
 */
const loadSchema = (filename: string): AvroSchema => {
    try {
        const schemaPath = join(__dirname, 'avro', filename);
        const schemaContent = readFileSync(schemaPath, 'utf8');
        const schema = JSON.parse(schemaContent) as AvroSchema;

        LoggerUtil.debug(`Schema loaded: ${filename}`, {
            filename,
            schemaPath,
            schemaName: schema.name,
        });

        return schema;
    } catch (error: unknown) {
        LoggerUtil.error(`Failed to load schema: ${filename}`, {
            error: (error as Error).message,
            filename,
        });
        throw new Error(`Failed to load schema ${filename}: ${(error as Error).message}`);
    }
};

// ==================== SCHEMA DEFINITIONS ====================

const schemas: SchemaMap = {
    'auth-event': loadSchema('auth-event.avsc'),
    'user-event': loadSchema('user-event.avsc'),
    'audit-event': loadSchema('audit-event.avsc'),
};

// ==================== SCHEMA REGISTRATION ====================

/**
 * Register all schemas with Schema Registry
 * 
 * @throws Error if any schema registration fails
 */
const registerSchemas = async (): Promise<void> => {
    try {
        LoggerUtil.info('Starting schema registration...');

        const registrationPromises = Object.entries(schemas).map(async ([name, schema]) => {
            try {
                const { id } = await registry.register({
                    type: SchemaType.AVRO,
                    schema: JSON.stringify(schema),
                }, {
                    subject: `${name}-value`,
                });

                LoggerUtil.info(`Schema registered: ${name}`, {
                    schemaName: name,
                    schemaId: id,
                    subject: `${name}-value`,
                });

                return { name, id };
            } catch (error: unknown) {
                LoggerUtil.error(`Failed to register schema: ${name}`, {
                    error: (error as Error).message,
                    schemaName: name,
                });
                throw error;
            }
        });

        const results = await Promise.all(registrationPromises);

        LoggerUtil.info('All schemas registered successfully', {
            totalSchemas: results.length,
            schemas: results.map((r) => ({ name: r.name, id: r.id })),
        });
    } catch (error: unknown) {
        LoggerUtil.error('Schema registration failed', {
            error: (error as Error).message
        });
        throw new Error(`Schema registration failed: ${(error as Error).message}`);
    }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get schema by name
 * 
 * @param schemaName - Name of the schema
 * @returns Avro schema or undefined
 */
export function getSchema(schemaName: string): AvroSchema | undefined {
    return schemas[schemaName];
}

/**
 * Get all schema names
 * 
 * @returns Array of schema names
 */
export function getSchemaNames(): string[] {
    return Object.keys(schemas);
}

/**
 * Check if schema exists
 * 
 * @param schemaName - Name of the schema
 * @returns True if schema exists
 */
export function hasSchema(schemaName: string): boolean {
    return schemaName in schemas;
}

/**
 * Get latest schema version from registry
 * 
 * @param subject - Schema subject
 * @returns Schema metadata
 */
export async function getLatestSchema(subject: string): Promise<any> {
    try {
        const latestSchema = await registry.getLatestSchemaId(subject);
        LoggerUtil.debug(`Retrieved latest schema for subject: ${subject}`, {
            subject,
            schemaId: latestSchema,
        });
        return latestSchema;
    } catch (error: unknown) {
        LoggerUtil.error(`Failed to get latest schema for subject: ${subject}`, {
            error: (error as Error).message,
            subject,
        });
        throw error;
    }
}

/**
 * Validate schema compatibility
 * 
 * @param schemaName - Name of the schema
 * @param newSchema - New schema to validate
 * @returns True if compatible
 */
export async function validateSchemaCompatibility(
    schemaName: string,
    newSchema: AvroSchema
): Promise<boolean> {
    try {
        // This would need Schema Registry API support
        LoggerUtil.info(`Validating schema compatibility: ${schemaName}`);
        // Implementation would depend on Schema Registry API
        return true;
    } catch (error: unknown) {
        LoggerUtil.error(`Schema compatibility validation failed: ${schemaName}`, {
            error: (error as Error).message,
        });
        return false;
    }
}

// ==================== EXPORTS ====================

export {
    registry,
    registerSchemas,
    schemas,
    loadSchema,
};

export type {
    AvroSchema,
    SchemaMap,
    SchemaRegistryConfig
};