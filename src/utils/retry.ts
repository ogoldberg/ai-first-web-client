/**
 * Retry Logic with Exponential Backoff
 *
 * Handles transient failures common with government websites
 */

import { logger } from './logger.js';

const log = logger.create('Retry');

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /**
   * Maximum number of total attempts (not retries).
   *
   * Note: This is TOTAL ATTEMPTS, not retry count.
   * - maxAttempts: 1 = no retries (just the initial attempt)
   * - maxAttempts: 3 = 1 initial attempt + up to 2 retries
   *
   * @default 3 (1 initial + 2 retries)
   */
  maxAttempts?: number;

  /**
   * Initial delay before first retry in milliseconds.
   * @default 1000
   */
  initialDelayMs?: number;

  /**
   * Maximum delay between retries in milliseconds.
   * Caps the exponential backoff.
   * @default 30000
   */
  maxDelayMs?: number;

  /**
   * Multiplier for exponential backoff between retries.
   * delay = min(initialDelayMs * backoffMultiplier^retryCount, maxDelayMs)
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Function to determine if an error should trigger a retry.
   * Return true to retry, false to throw immediately.
   * @default Retries on network errors, timeouts, and 502/503/504 status codes
   */
  retryOn?: (error: Error) => boolean;

  /**
   * Callback invoked before each retry attempt.
   * Useful for logging or cleanup between attempts.
   */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryOn: (error: Error) => {
    // Retry on network errors and timeouts
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('net::') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('socket hang up') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504')
    );
  },
  onRetry: () => {}, // No-op by default
};

/**
 * Execute an async function with automatic retry on failure.
 *
 * Uses exponential backoff between retries. The delay doubles after each
 * retry until it reaches maxDelayMs.
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the function if successful
 * @throws Last error if all attempts fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchData(url),
 *   {
 *     maxAttempts: 3,        // 1 initial + 2 retries
 *     initialDelayMs: 1000,  // 1s before first retry
 *     backoffMultiplier: 2,  // 1s, 2s, 4s... between retries
 *     maxDelayMs: 10000,     // Cap at 10s
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === opts.maxAttempts || !opts.retryOn(lastError)) {
        throw lastError;
      }

      // Call onRetry callback
      opts.onRetry(attempt, lastError, delay);

      // Log retry attempt
      log.warn('Retry attempt failed', {
        attempt,
        maxAttempts: opts.maxAttempts,
        error: lastError.message,
        retryDelayMs: delay,
      });

      // Wait before retrying
      await sleep(delay);

      // Exponential backoff
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
