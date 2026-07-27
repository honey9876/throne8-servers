import logger from './logger';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
  onRetry: () => {},
};

/**
 * Sleep utility function
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error : any) {
      lastError = error as Error;

      if (attempt === config.maxAttempts) {
        logger.error(`Retry failed after ${attempt} attempts`, {
          error: lastError.message,
          stack: lastError.stack,
        });
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.delayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs
      );

      logger.warn(`Retry attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delay}ms`, {
        error: lastError.message,
      });

      // Call onRetry callback
      config.onRetry(lastError, attempt);

      // Wait before next attempt
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retry with custom condition
 */
export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error : any) {
      lastError = error as Error;

      // Check if we should retry based on error
      if (!shouldRetry(lastError) || attempt === config.maxAttempts) {
        logger.error('Retry condition not met or max attempts reached', {
          error: lastError.message,
          attempt,
        });
        throw lastError;
      }

      const delay = Math.min(
        config.delayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs
      );

      logger.warn(`Retry attempt ${attempt}/${config.maxAttempts} with condition`, {
        error: lastError.message,
        delay,
      });

      config.onRetry(lastError, attempt);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retry for database operations
 */
export async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return retry(operation, {
    maxAttempts: 5,
    delayMs: 500,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
    onRetry: (error, attempt) => {
      logger.warn(`Database operation "${operationName}" retry ${attempt}`, {
        error: error.message,
      });
    },
  });
}

/**
 * Retry for external API calls
 */
export async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  apiName: string
): Promise<T> {
  return retryWithCondition(
    apiCall,
    (error: Error & { code?: string; response?: { status?: number } }) => {
      // Retry on network errors or 5xx errors
      const shouldRetry =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        (error.response?.status !== undefined && 
         error.response.status >= 500 && 
         error.response.status < 600);

      return shouldRetry;
    },
    {
      maxAttempts: 3,
      delayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 8000,
      onRetry: (error, attempt) => {
        logger.warn(`API call "${apiName}" retry ${attempt}`, {
          error: error.message,
        });
      },
    }
  );
}

export default {
  retry,
  retryWithCondition,
  retryDatabaseOperation,
  retryApiCall,
};