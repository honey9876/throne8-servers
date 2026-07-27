/**
 * error-handler.ts
 * Professional-level Kafka error handler for auth-service-phase3-kafka
 * Handles Kafka-specific errors with retries
 * Compliant with NIST 800-63B and OWASP guidelines
 * 
 * @module kafka/utils/error-handler
 * @version 3.0.0
 */

import LoggerUtil from '@/shared/logger.util';

// ==================== INTERFACES ====================

interface KafkaError extends Error {
    originalError?: Error;
    retryable?: boolean;
    code?: string;
}

// ==================== ERROR HANDLER CLASS ====================

class ErrorHandler {
    /**
     * Create a Kafka-specific error with retry metadata
     * 
     * @param error - Original error
     * @param message - Error message
     * @returns Enhanced Kafka error
     */
    static kafkaError(error: Error, message: string): KafkaError {
        const err: KafkaError = new Error(message);
        err.originalError = error;
        err.code = (error as any).code;
        err.retryable =
            (error as any).code === 'ECONNREFUSED' ||
            (error as any).code === 'ETIMEDOUT';

        LoggerUtil.error(message, {
            error: error.message,
            code: (error as any).code
        });

        return err;
    }

    /**
     * Retry operation with fixed delay
     * 
     * @param operation - Async operation to retry
     * @param maxRetries - Maximum number of retry attempts
     * @param delay - Delay between retries in milliseconds
     * @returns Result of successful operation
     * @throws Error if all retries fail
     */
    static async retryOperation<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        delay: number = 1000
    ): Promise<T> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error: unknown) {
                const kafkaError = error as KafkaError;

                if (!kafkaError.retryable || attempt === maxRetries) {
                    throw error;
                }

                LoggerUtil.warn(`Retrying operation, attempt ${attempt}`, {
                    error: (error as Error).message
                });

                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }

        // This line should never be reached, but TypeScript needs it
        throw new Error('Operation failed after all retries');
    }
}

// ==================== EXPORT ====================

export default ErrorHandler;

export { KafkaError };