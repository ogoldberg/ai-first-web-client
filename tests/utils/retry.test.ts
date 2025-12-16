import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, RetryOptions } from '../../src/utils/retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Suppress console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('successful execution', () => {
    it('should return result on first successful attempt', async () => {
      const result = await withRetry(async () => 'success');
      expect(result).toBe('success');
    });

    it('should return complex objects', async () => {
      const data = { foo: 'bar', count: 42 };
      const result = await withRetry(async () => data);
      expect(result).toEqual(data);
    });
  });

  describe('retry behavior', () => {
    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('timeout occurred');
          }
          return 'success';
        },
        { initialDelayMs: 1, maxDelayMs: 10 }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max attempts exceeded', async () => {
      let attempts = 0;
      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new Error('timeout occurred');
          },
          { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 10 }
        )
      ).rejects.toThrow('timeout occurred');

      expect(attempts).toBe(3);
    });

    it('should not retry on non-retryable errors', async () => {
      let attempts = 0;
      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new Error('validation error');
          },
          { maxAttempts: 3, initialDelayMs: 1 }
        )
      ).rejects.toThrow('validation error');

      expect(attempts).toBe(1);
    });
  });

  describe('default retryOn conditions', () => {
    const testRetryableError = async (errorMessage: string) => {
      let attempts = 0;
      try {
        await withRetry(
          async () => {
            attempts++;
            throw new Error(errorMessage);
          },
          { maxAttempts: 2, initialDelayMs: 1 }
        );
      } catch {
        // Expected
      }
      return attempts;
    };

    it('should retry on timeout errors', async () => {
      const attempts = await testRetryableError('request timeout');
      expect(attempts).toBe(2);
    });

    it('should retry on network errors', async () => {
      const attempts = await testRetryableError('net::ERR_CONNECTION_REFUSED');
      expect(attempts).toBe(2);
    });

    it('should retry on connection reset', async () => {
      const attempts = await testRetryableError('ECONNRESET');
      expect(attempts).toBe(2);
    });

    it('should retry on 502 errors', async () => {
      const attempts = await testRetryableError('HTTP 502 Bad Gateway');
      expect(attempts).toBe(2);
    });

    it('should retry on 503 errors', async () => {
      const attempts = await testRetryableError('HTTP 503 Service Unavailable');
      expect(attempts).toBe(2);
    });

    it('should retry on 504 errors', async () => {
      const attempts = await testRetryableError('HTTP 504 Gateway Timeout');
      expect(attempts).toBe(2);
    });
  });

  describe('custom retryOn function', () => {
    it('should use custom retryOn logic', async () => {
      let attempts = 0;
      const options: RetryOptions = {
        maxAttempts: 3,
        initialDelayMs: 1,
        retryOn: (error) => error.message.includes('custom-retry'),
      };

      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new Error('custom-retry-error');
          },
          options
        )
      ).rejects.toThrow();

      expect(attempts).toBe(3);
    });

    it('should not retry when custom retryOn returns false', async () => {
      let attempts = 0;
      const options: RetryOptions = {
        maxAttempts: 3,
        initialDelayMs: 1,
        retryOn: () => false,
      };

      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new Error('any error');
          },
          options
        )
      ).rejects.toThrow();

      expect(attempts).toBe(1);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry callback on each retry', async () => {
      const onRetry = vi.fn();
      let attempts = 0;

      try {
        await withRetry(
          async () => {
            attempts++;
            throw new Error('timeout');
          },
          { maxAttempts: 3, initialDelayMs: 1, onRetry }
        );
      } catch {
        // Expected
      }

      expect(onRetry).toHaveBeenCalledTimes(2); // Called on attempts 1 and 2, not on final failure
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error), expect.any(Number));
    });

    it('should pass correct delay to onRetry', async () => {
      const onRetry = vi.fn();

      try {
        await withRetry(
          async () => {
            throw new Error('timeout');
          },
          {
            maxAttempts: 3,
            initialDelayMs: 100,
            backoffMultiplier: 2,
            onRetry,
          }
        );
      } catch {
        // Expected
      }

      // First retry: delay = 100ms
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), 100);
      // Second retry: delay = 200ms (100 * 2)
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), 200);
    });
  });

  describe('exponential backoff', () => {
    it('should cap delay at maxDelayMs', async () => {
      const onRetry = vi.fn();

      try {
        await withRetry(
          async () => {
            throw new Error('timeout');
          },
          {
            maxAttempts: 5,
            initialDelayMs: 100,
            maxDelayMs: 150,
            backoffMultiplier: 2,
            onRetry,
          }
        );
      } catch {
        // Expected
      }

      // Delays should be capped at 150ms
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), 150); // Capped
      expect(onRetry).toHaveBeenNthCalledWith(3, 3, expect.any(Error), 150); // Still capped
    });
  });

  describe('error handling', () => {
    it('should convert non-Error throws to Error objects', async () => {
      await expect(
        withRetry(
          async () => {
            throw 'string error';
          },
          { maxAttempts: 1 }
        )
      ).rejects.toThrow('string error');
    });
  });
});
