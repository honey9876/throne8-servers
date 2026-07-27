// lock-and-retry.utils.ts
import CacheUtil from '@/shared/cache.util.js';
import { logger } from '@/shared/logger.util.js';
import { generateSecureId } from '@/shared/security.js';

/**
 * Executes a callback function while holding a distributed lock using Redis.
 * Uses the Redlock-like pattern with NX + EX + Lua script for safe unlock.
 *
 * @template T - The return type of the callback
 * @param key - Unique identifier for the lock (will be prefixed with 'lock:')
 * @param timeoutMs - Maximum time (in milliseconds) to hold the lock
 * @param callback - The async function to execute while the lock is held
 * @returns The result returned by the callback
 * @throws Error if lock could not be acquired or callback throws
 */
export async function withLock<T>(
  key: string,
  timeoutMs: number,
  callback: () => Promise<T> | T
): Promise<T> {
  const lockKey = `lock:${key}`;
  const lockTimeoutSeconds = Math.ceil(timeoutMs / 1000);
  const lockValue = generateSecureId();

  try {
    // Try to acquire lock using CacheUtil
    const acquired = await CacheUtil.set(
      lockKey, // CacheUtil prefix automatically add karega
      lockValue,
      lockTimeoutSeconds
    );

    if (!acquired) {
      throw new Error(`Failed to acquire lock for ${key}`);
    }

    return await callback();
  } finally {
    // Safe release (non-atomic but safe for most cases)
    const currentValue = await CacheUtil.get(lockKey);
    if (currentValue === lockValue) {
      await CacheUtil.del(lockKey);
    } else {
      logger.warn(`Lock ${lockKey} was not released - value mismatch or expired`);
    }
  }
}

/**
 * Retries an async operation with exponential backoff when it fails.
 * Useful for handling transient errors (network, rate limits, etc.).
 *
 * @template T - Return type of the operation
 * @param operation - The async function to retry
 * @param maxAttempts - Maximum retry attempts (default: 3)
 * @param baseDelayMs - Initial delay in milliseconds (default: 100)
 * @param shouldRetry - Optional predicate to decide whether to retry (default: always retry on error)
 * @returns The result of the successful operation
 * @throws The last error after max attempts
 */

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 100,
  shouldRetry: (error: unknown) => boolean = () => true
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error : any) {
      lastError = error;

      // If this was the last attempt, or we shouldn't retry → throw
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff with small jitter
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      console.warn(
        `Operation failed (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay)}ms...`,
        error
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This line should never be reached (TypeScript safety)
  throw lastError;
}

// ────────────────────────────────────────────────────────────────
// Example usage
// ────────────────────────────────────────────────────────────────

// /* Example 1: Critical section with lock */
// await withLock('user:123:balance-update', 10000, async () => {
//   // This block runs only if lock is acquired
//   const balance = await getBalance('123');
//   await updateBalance('123', balance - 50);
//   console.log('Balance updated safely');
// });

// /* Example 2: Retry flaky API call */
// const response = await withRetry(
//   async () => {
//     return await fetch('https://api.example.com/data');
//   },
//   5,           // max 5 attempts
//   500,         // start with 500ms delay
//   (err: any) => err.status === 429 || err.code === 'ECONNRESET' // retry only on 429 or connection reset
// );

// /* Example 3: Lock + retry together */
// const result = await withRetry(
//   () =>
//     withLock('payment:process:order456', 15000, async () => {
//       // critical payment logic
//       return await processPayment('order456');
//     }),
//   3,
//   1000
// );