/**
 * Rate Limiter - Per-domain request throttling
 *
 * Prevents overwhelming government websites and getting blocked
 */

interface DomainConfig {
  requestsPerMinute: number;
  minDelayMs: number;
}

interface RequestRecord {
  timestamp: number;
}

// Default and domain-specific rate limits
const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  // Spanish government sites - be extra polite
  'boe.es': { requestsPerMinute: 10, minDelayMs: 3000 },
  'extranjeria.inclusion.gob.es': { requestsPerMinute: 6, minDelayMs: 5000 },
  'sede.administracionespublicas.gob.es': { requestsPerMinute: 6, minDelayMs: 5000 },
  'agenciatributaria.es': { requestsPerMinute: 10, minDelayMs: 3000 },
  'seg-social.es': { requestsPerMinute: 10, minDelayMs: 3000 },

  // Default for unknown domains
  default: { requestsPerMinute: 30, minDelayMs: 1000 },
};

export class RateLimiter {
  private requestHistory: Map<string, RequestRecord[]> = new Map();
  private domainLocks: Map<string, Promise<void>> = new Map();

  /**
   * Get domain from URL
   */
  private getDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get rate limit config for a domain
   */
  private getConfig(domain: string): DomainConfig {
    // Check for exact match
    if (DOMAIN_CONFIGS[domain]) {
      return DOMAIN_CONFIGS[domain];
    }

    // Check for parent domain match (e.g., sub.boe.es -> boe.es)
    for (const [configDomain, config] of Object.entries(DOMAIN_CONFIGS)) {
      if (domain.endsWith(`.${configDomain}`)) {
        return config;
      }
    }

    return DOMAIN_CONFIGS.default;
  }

  /**
   * Clean up old request records (older than 1 minute)
   */
  private cleanupHistory(domain: string): void {
    const history = this.requestHistory.get(domain) || [];
    const oneMinuteAgo = Date.now() - 60000;
    const filtered = history.filter((r) => r.timestamp > oneMinuteAgo);
    this.requestHistory.set(domain, filtered);
  }

  /**
   * Calculate delay needed before next request
   */
  private calculateDelay(domain: string): number {
    const config = this.getConfig(domain);
    this.cleanupHistory(domain);

    const history = this.requestHistory.get(domain) || [];

    // Check if we've hit the rate limit
    if (history.length >= config.requestsPerMinute) {
      const oldestRequest = history[0];
      const waitUntil = oldestRequest.timestamp + 60000;
      const delay = Math.max(0, waitUntil - Date.now());
      return delay;
    }

    // Enforce minimum delay between requests
    if (history.length > 0) {
      const lastRequest = history[history.length - 1];
      const timeSinceLast = Date.now() - lastRequest.timestamp;
      if (timeSinceLast < config.minDelayMs) {
        return config.minDelayMs - timeSinceLast;
      }
    }

    return 0;
  }

  /**
   * Record a request
   */
  private recordRequest(domain: string): void {
    const history = this.requestHistory.get(domain) || [];
    history.push({ timestamp: Date.now() });
    this.requestHistory.set(domain, history);
  }

  /**
   * Wait for rate limit delay and record request.
   *
   * Note: This method only handles rate limiting (delay calculation and request recording).
   * For serialized access (ensuring one request at a time per domain), use throttle() instead.
   * The lock mechanism is intentionally NOT checked here to avoid deadlock when called from throttle().
   */
  async acquire(url: string): Promise<void> {
    const domain = this.getDomain(url);

    // Calculate and wait for rate limit delay
    const delay = this.calculateDelay(domain);
    if (delay > 0) {
      console.error(`[RateLimiter] Waiting ${delay}ms before request to ${domain}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Record this request
    this.recordRequest(domain);
  }

  /**
   * Wrap an async function with rate limiting
   */
  async throttle<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const domain = this.getDomain(url);

    // Create a lock promise for this request
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Wait for existing lock if any
    const existingLock = this.domainLocks.get(domain);
    if (existingLock) {
      await existingLock;
    }

    // Set our lock
    this.domainLocks.set(domain, lockPromise);

    try {
      await this.acquire(url);
      return await fn();
    } finally {
      releaseLock!();
      this.domainLocks.delete(domain);
    }
  }

  /**
   * Get current rate limit status for a domain
   */
  getStatus(url: string): {
    domain: string;
    requestsInLastMinute: number;
    limit: number;
    canRequest: boolean;
  } {
    const domain = this.getDomain(url);
    const config = this.getConfig(domain);
    this.cleanupHistory(domain);

    const history = this.requestHistory.get(domain) || [];

    return {
      domain,
      requestsInLastMinute: history.length,
      limit: config.requestsPerMinute,
      canRequest: history.length < config.requestsPerMinute,
    };
  }

  /**
   * Add or update rate limit config for a domain
   */
  setDomainConfig(domain: string, config: DomainConfig): void {
    DOMAIN_CONFIGS[domain] = config;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
