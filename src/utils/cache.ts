/**
 * Response Cache - In-memory cache with TTL for reducing redundant requests
 *
 * Useful for:
 * - Avoiding re-fetching the same page during a session
 * - Reducing load on government websites
 * - Speeding up development/testing iterations
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions {
  ttlMs?: number; // Default 15 minutes
  maxEntries?: number; // Prevent unbounded growth
}

const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_ENTRIES = 1000;

export class ResponseCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;
  private maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Generate a cache key from URL and optional parameters
   */
  private generateKey(url: string, params?: Record<string, string>): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return `${url}?${sortedParams}`;
  }

  /**
   * Get a cached value if it exists and hasn't expired
   */
  get(url: string, params?: Record<string, string>): T | undefined {
    const key = this.generateKey(url, params);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Store a value in the cache
   */
  set(url: string, value: T, params?: Record<string, string>, ttlMs?: number): void {
    const key = this.generateKey(url, params);
    const now = Date.now();

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: now,
      expiresAt: now + (ttlMs ?? this.ttlMs),
    });
  }

  /**
   * Check if a URL is cached (and not expired)
   */
  has(url: string, params?: Record<string, string>): boolean {
    return this.get(url, params) !== undefined;
  }

  /**
   * Remove a specific entry from the cache
   */
  delete(url: string, params?: Record<string, string>): boolean {
    const key = this.generateKey(url, params);
    return this.cache.delete(key);
  }

  /**
   * Remove all expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evict the oldest entries to make room
   */
  private evictOldest(count: number = 100): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      .slice(0, count);

    for (const [key] of entries) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxEntries: number;
    ttlMs: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const entry of this.cache.values()) {
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp;
      }
      if (newest === null || entry.timestamp > newest) {
        newest = entry.timestamp;
      }
    }

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }

  /**
   * Wrap an async function with caching
   */
  async withCache<R extends T>(
    url: string,
    fn: () => Promise<R>,
    params?: Record<string, string>,
    ttlMs?: number
  ): Promise<R> {
    const cached = this.get(url, params) as R | undefined;
    if (cached !== undefined) {
      return cached;
    }

    const result = await fn();
    this.set(url, result, params, ttlMs);
    return result;
  }
}

/**
 * Specialized cache for HTML content with content hash tracking
 */
export class ContentCache extends ResponseCache<{
  html: string;
  contentHash: string;
  fetchedAt: number;
}> {
  constructor(options?: CacheOptions) {
    super(options);
  }

  /**
   * Simple hash function for content comparison
   */
  static hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Check if content has changed since last cache
   */
  hasContentChanged(url: string, newContent: string): boolean {
    const cached = this.get(url);
    if (!cached) {
      return true; // No cached version, treat as changed
    }

    const newHash = ContentCache.hashContent(newContent);
    return cached.contentHash !== newHash;
  }
}

// Default singleton instances
export const pageCache = new ContentCache({
  ttlMs: 15 * 60 * 1000, // 15 minutes
  maxEntries: 500,
});

export const apiCache = new ResponseCache({
  ttlMs: 5 * 60 * 1000, // 5 minutes for API responses
  maxEntries: 200,
});
