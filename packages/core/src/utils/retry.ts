/**
 * Retry Logic with Exponential Backoff
 *
 * Handles transient failures common with government websites
 */

import { logger } from './logger.js';

const log = logger.create('Retry');

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOn?: (error: Error) => boolean;
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
