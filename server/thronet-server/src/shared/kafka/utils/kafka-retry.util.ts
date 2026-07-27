/**
 * kafka-retry.util.ts
 * Kafka Retry Logic with Exponential Backoff
 * Production-ready retry mechanism for Kafka operations
 * 
 * @version 3.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';

export interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors?: string[];
}

export class KafkaRetryUtil {
    private static readonly DEFAULT_CONFIG: RetryConfig = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableErrors: [
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'KafkaJSNumberOfRetriesExceeded',
            'KafkaJSConnectionError',
            'Request timed out',
        ],
    };

    /**
     * Execute function with retry logic
     */
    static async withRetry<T>(
        fn: () => Promise<T>,
        config: Partial<RetryConfig> = {},
        context: string = 'kafka-operation'
    ): Promise<T> {
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
        let lastError: Error | null = null;
        let attempt = 0;

        while (attempt < finalConfig.maxRetries) {
            try {
                attempt++;
                LoggerUtil.debug(`Attempting ${context}`, { attempt, maxRetries: finalConfig.maxRetries });

                const result = await fn();

                if (attempt > 1) {
                    LoggerUtil.info(`${context} succeeded after ${attempt} attempts`);
                }

                return result;
            } catch (error: any) {
                lastError = error;

                const isRetryable = this.isRetryableError(error, finalConfig.retryableErrors);

                if (!isRetryable || attempt >= finalConfig.maxRetries) {
                    LoggerUtil.error(`${context} failed permanently`, {
                        attempt,
                        error: error.message,
                        isRetryable,
                    });
                    throw error;
                }

                const delayMs = this.calculateDelay(attempt, finalConfig);

                LoggerUtil.warn(`${context} failed, retrying...`, {
                    attempt,
                    nextRetryIn: `${delayMs}ms`,
                    error: error.message,
                });

                await this.sleep(delayMs);
            }
        }

        throw lastError || new Error(`${context} failed after ${finalConfig.maxRetries} retries`);
    }

    /**
     * Check if error is retryable
     */
    private static isRetryableError(error: Error, retryableErrors?: string[]): boolean {
        if (!retryableErrors || retryableErrors.length === 0) {
            return true;
        }

        const errorMessage = error.message || '';
        const errorName = error.name || '';
        const errorCode = (error as any).code || '';

        return retryableErrors.some(
            pattern =>
                errorMessage.includes(pattern) ||
                errorName.includes(pattern) ||
                errorCode.includes(pattern)
        );
    }

    /**
     * Calculate delay with exponential backoff and jitter
     */
    private static calculateDelay(attempt: number, config: RetryConfig): number {
        const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
        const delayWithCap = Math.min(exponentialDelay, config.maxDelayMs);

        // Add jitter (±20%) to prevent thundering herd
        const jitter = delayWithCap * 0.2 * (Math.random() - 0.5);

        return Math.floor(delayWithCap + jitter);
    }

    /**
     * Sleep utility
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}