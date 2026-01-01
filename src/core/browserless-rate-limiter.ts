/**
 * Browserless Rate Limiter
 *
 * Manages rate limiting, connection pooling, and unit tracking for Browserless.io API.
 *
 * Free Plan Limits (as of 2025):
 * - 1,000 units/month (1 unit = 30 seconds of browser time)
 * - 1 max concurrent browser
 * - 1 minute max session time
 *
 * @see https://www.browserless.io/pricing
 * @see https://docs.browserless.io/baas/troubleshooting/timeouts
 */

import { logger } from '../utils/logger.js';

export interface BrowserlessPlanLimits {
  /** Maximum concurrent browser sessions */
  maxConcurrent: number;
  /** Maximum session duration in milliseconds */
  maxSessionDuration: number;
  /** Monthly unit quota */
  monthlyUnits: number;
  /** Queue size (requests waiting for a slot) */
  queueSize: number;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
}

export interface BrowserlessUsageStats {
  /** Units consumed this month */
  unitsUsed: number;
  /** Units remaining this month */
  unitsRemaining: number;
  /** Current active connections */
  activeConnections: number;
  /** Requests currently queued */
  queuedRequests: number;
  /** Total requests processed */
  totalRequests: number;
  /** Requests that timed out */
  timedOutRequests: number;
  /** Requests rejected due to quota */
  rejectedRequests: number;
  /** Month reset date */
  quotaResetDate: Date;
}

interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  timeout: NodeJS.Timeout;
}

/** Plan configurations */
export const BROWSERLESS_PLANS: Record<string, BrowserlessPlanLimits> = {
  free: {
    maxConcurrent: 1,
    maxSessionDuration: 60_000, // 1 minute
    monthlyUnits: 1_000,
    queueSize: 5, // Small queue for free tier
    connectionTimeout: 30_000,
  },
  starter: {
    maxConcurrent: 5,
    maxSessionDuration: 300_000, // 5 minutes
    monthlyUnits: 10_000,
    queueSize: 10,
    connectionTimeout: 30_000,
  },
  team: {
    maxConcurrent: 10,
    maxSessionDuration: 600_000, // 10 minutes
    monthlyUnits: 50_000,
    queueSize: 20,
    connectionTimeout: 30_000,
  },
  enterprise: {
    maxConcurrent: 50,
    maxSessionDuration: 1_800_000, // 30 minutes
    monthlyUnits: 500_000,
    queueSize: 100,
    connectionTimeout: 60_000,
  },
};

export class BrowserlessRateLimiter {
  private limits: BrowserlessPlanLimits;
  private activeConnections: number = 0;
  private requestQueue: QueuedRequest[] = [];
  private unitsUsed: number = 0;
  private totalRequests: number = 0;
  private timedOutRequests: number = 0;
  private rejectedRequests: number = 0;
  private quotaResetDate: Date;
  private activeSessions: Map<string, { startTime: number; timeout: NodeJS.Timeout }> = new Map();

  constructor(plan: keyof typeof BROWSERLESS_PLANS = 'free') {
    this.limits = BROWSERLESS_PLANS[plan] || BROWSERLESS_PLANS.free;
    this.quotaResetDate = this.getNextMonthReset();

    logger.browser.info('BrowserlessRateLimiter initialized', {
      plan,
      maxConcurrent: this.limits.maxConcurrent,
      maxSessionDuration: this.limits.maxSessionDuration,
      monthlyUnits: this.limits.monthlyUnits,
    });
  }

  /**
   * Get the next month reset date (1st of next month)
   */
  private getNextMonthReset(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  /**
   * Check if quota has reset and update if needed
   */
  private checkQuotaReset(): void {
    const now = new Date();
    if (now >= this.quotaResetDate) {
      logger.browser.info('Monthly quota reset', {
        previousUsage: this.unitsUsed,
      });
      this.unitsUsed = 0;
      this.quotaResetDate = this.getNextMonthReset();
    }
  }

  /**
   * Calculate units for a session duration
   * 1 unit = 30 seconds of browser time
   */
  calculateUnits(durationMs: number): number {
    return Math.ceil(durationMs / 30_000);
  }

  /**
   * Check if we have enough units remaining
   */
  hasUnitsAvailable(estimatedUnits: number = 1): boolean {
    this.checkQuotaReset();
    return this.unitsUsed + estimatedUnits <= this.limits.monthlyUnits;
  }

  /**
   * Acquire a connection slot
   * Returns a release function to call when done
   */
  async acquire(sessionId: string): Promise<() => void> {
    this.checkQuotaReset();
    this.totalRequests++;

    // Check monthly quota
    if (!this.hasUnitsAvailable()) {
      this.rejectedRequests++;
      throw new BrowserlessQuotaExceededError(
        `Monthly unit quota exceeded (${this.unitsUsed}/${this.limits.monthlyUnits} units used). ` +
        `Quota resets on ${this.quotaResetDate.toISOString().split('T')[0]}.`
      );
    }

    // If we have capacity, acquire immediately
    if (this.activeConnections < this.limits.maxConcurrent) {
      return this.createSession(sessionId);
    }

    // Otherwise, queue the request
    if (this.requestQueue.length >= this.limits.queueSize) {
      this.rejectedRequests++;
      throw new BrowserlessQueueFullError(
        `Request queue is full (${this.requestQueue.length}/${this.limits.queueSize}). ` +
        `Try again later or upgrade your plan for higher concurrency.`
      );
    }

    // Wait in queue
    return this.waitInQueue(sessionId);
  }

  /**
   * Create a new session and return release function
   */
  private createSession(sessionId: string): () => void {
    this.activeConnections++;
    const startTime = Date.now();

    // Set up session timeout
    const timeout = setTimeout(() => {
      logger.browser.warn('Session timeout reached, forcing release', {
        sessionId,
        maxDuration: this.limits.maxSessionDuration,
      });
      this.releaseSession(sessionId);
    }, this.limits.maxSessionDuration);

    this.activeSessions.set(sessionId, { startTime, timeout });

    logger.browser.debug('Session acquired', {
      sessionId,
      activeConnections: this.activeConnections,
      queuedRequests: this.requestQueue.length,
    });

    // Return release function
    return () => this.releaseSession(sessionId);
  }

  /**
   * Release a session and process queue
   */
  private releaseSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return; // Already released
    }

    // Clear timeout
    clearTimeout(session.timeout);

    // Calculate and track units used
    const durationMs = Date.now() - session.startTime;
    const units = this.calculateUnits(durationMs);
    this.unitsUsed += units;

    this.activeSessions.delete(sessionId);
    this.activeConnections--;

    logger.browser.debug('Session released', {
      sessionId,
      durationMs,
      unitsUsed: units,
      totalUnitsUsed: this.unitsUsed,
      activeConnections: this.activeConnections,
    });

    // Process next queued request
    this.processQueue();
  }

  /**
   * Wait in queue for a connection slot
   */
  private waitInQueue(sessionId: string): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from queue
        const index = this.requestQueue.findIndex(r => r.timeout === timeout);
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
        }
        this.timedOutRequests++;
        reject(new BrowserlessTimeoutError(
          `Request timed out waiting in queue after ${this.limits.connectionTimeout}ms. ` +
          `Queue position was ${index + 1}/${this.requestQueue.length + 1}.`
        ));
      }, this.limits.connectionTimeout);

      const queuedRequest: QueuedRequest = {
        resolve: () => resolve(this.createSession(sessionId)),
        reject,
        enqueuedAt: Date.now(),
        timeout,
      };

      this.requestQueue.push(queuedRequest);

      logger.browser.debug('Request queued', {
        sessionId,
        queuePosition: this.requestQueue.length,
        queueSize: this.limits.queueSize,
      });
    });
  }

  /**
   * Process the next request in queue
   */
  private processQueue(): void {
    if (this.requestQueue.length === 0) {
      return;
    }

    if (this.activeConnections >= this.limits.maxConcurrent) {
      return;
    }

    const nextRequest = this.requestQueue.shift();
    if (nextRequest) {
      clearTimeout(nextRequest.timeout);
      const waitTime = Date.now() - nextRequest.enqueuedAt;
      logger.browser.debug('Processing queued request', { waitTime });
      nextRequest.resolve();
    }
  }

  /**
   * Get current usage statistics
   */
  getStats(): BrowserlessUsageStats {
    this.checkQuotaReset();
    return {
      unitsUsed: this.unitsUsed,
      unitsRemaining: Math.max(0, this.limits.monthlyUnits - this.unitsUsed),
      activeConnections: this.activeConnections,
      queuedRequests: this.requestQueue.length,
      totalRequests: this.totalRequests,
      timedOutRequests: this.timedOutRequests,
      rejectedRequests: this.rejectedRequests,
      quotaResetDate: this.quotaResetDate,
    };
  }

  /**
   * Get plan limits
   */
  getLimits(): BrowserlessPlanLimits {
    return { ...this.limits };
  }

  /**
   * Update plan (e.g., after upgrade)
   */
  setPlan(plan: keyof typeof BROWSERLESS_PLANS): void {
    this.limits = BROWSERLESS_PLANS[plan] || BROWSERLESS_PLANS.free;
    logger.browser.info('Plan updated', { plan, limits: this.limits });
  }

  /**
   * Check if request should be retried based on error
   */
  shouldRetry(error: Error, attempt: number, maxAttempts: number = 3): boolean {
    if (attempt >= maxAttempts) {
      return false;
    }

    // Don't retry quota exceeded
    if (error instanceof BrowserlessQuotaExceededError) {
      return false;
    }

    // Retry timeouts and queue full errors
    if (error instanceof BrowserlessTimeoutError || error instanceof BrowserlessQueueFullError) {
      return true;
    }

    // Retry connection errors (case-insensitive check for timeout)
    if (error.message.toLowerCase().includes('timeout') || error.message.includes('ECONNREFUSED')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  getRetryDelay(attempt: number): number {
    // Base delay: 1s, 2s, 4s, 8s, etc.
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    // Add jitter (0-25% of delay)
    const jitter = Math.random() * 0.25 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Clean up all sessions (call on shutdown)
   */
  cleanup(): void {
    // Clear all session timeouts
    for (const [sessionId, session] of this.activeSessions) {
      clearTimeout(session.timeout);
      this.releaseSession(sessionId);
    }

    // Reject all queued requests
    for (const request of this.requestQueue) {
      clearTimeout(request.timeout);
      request.reject(new Error('Rate limiter shutting down'));
    }
    this.requestQueue = [];

    logger.browser.info('Rate limiter cleaned up');
  }
}

// Custom error classes
export class BrowserlessQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserlessQuotaExceededError';
  }
}

export class BrowserlessQueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserlessQueueFullError';
  }
}

export class BrowserlessTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserlessTimeoutError';
  }
}

// Singleton instance for shared rate limiting
let defaultRateLimiter: BrowserlessRateLimiter | null = null;

/**
 * Get the default rate limiter instance
 */
export function getDefaultRateLimiter(): BrowserlessRateLimiter {
  if (!defaultRateLimiter) {
    const plan = (process.env.BROWSERLESS_PLAN as keyof typeof BROWSERLESS_PLANS) || 'free';
    defaultRateLimiter = new BrowserlessRateLimiter(plan);
  }
  return defaultRateLimiter;
}

/**
 * Reset the default rate limiter (useful for testing)
 */
export function resetDefaultRateLimiter(): void {
  if (defaultRateLimiter) {
    defaultRateLimiter.cleanup();
    defaultRateLimiter = null;
  }
}
