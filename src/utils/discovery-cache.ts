/**
 * Unified Discovery Cache (CLOUD-008)
 *
 * A unified caching layer for all discovery modules that provides:
 * - Pluggable backends: in-memory (default) and Redis (optional)
 * - Tenant isolation via cache key prefixes
 * - LRU eviction with configurable max size
 * - Failed domain tracking with exponential backoff cooldown
 * - Type-safe cache entries with automatic TTL expiration
 *
 * This replaces the individual in-memory Maps in each discovery module:
 * - openapi-discovery.ts (specCache)
 * - robots-sitemap-discovery.ts (discoveryCache)
 * - asyncapi-discovery.ts (specCache)
 * - alt-spec-discovery.ts (specCache)
 * - backend-framework-fingerprinting.ts (frameworkCache)
 * - api-documentation-discovery.ts (discoveryCache)
 */

import { logger } from './logger.js';

const cacheLogger = logger.create('DiscoveryCache');

// ============================================
// TYPES
// ============================================

/**
 * Cache entry wrapper with metadata
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** When the entry was cached (Unix timestamp ms) */
  cachedAt: number;
  /** When the entry expires (Unix timestamp ms) */
  expiresAt: number;
  /** Number of times this entry has been accessed */
  hitCount: number;
  /** Last access time for LRU eviction */
  lastAccessedAt: number;
}

/**
 * Failed domain tracking entry
 */
export interface FailedDomain {
  /** Domain that failed */
  domain: string;
  /** Discovery source that failed (e.g., 'openapi', 'asyncapi') */
  source: string;
  /** Number of consecutive failures */
  failureCount: number;
  /** First failure timestamp */
  firstFailureAt: number;
  /** Last failure timestamp */
  lastFailureAt: number;
  /** When the cooldown expires and retry is allowed */
  cooldownUntil: number;
  /** Last error message */
  lastError?: string;
}

/**
 * Discovery cache configuration
 */
export interface DiscoveryCacheConfig {
  /** Maximum number of entries per source type */
  maxEntriesPerSource?: number;
  /** Default TTL in milliseconds */
  defaultTtlMs?: number;
  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
  /** Base cooldown time for failed domains (ms) */
  baseCooldownMs?: number;
  /** Maximum cooldown time for failed domains (ms) */
  maxCooldownMs?: number;
  /** Enable Redis backend if available */
  useRedis?: boolean;
}

/**
 * Cache statistics
 */
export interface DiscoveryCacheStats {
  /** Number of entries by source */
  entriesBySource: Record<string, number>;
  /** Total entries across all sources */
  totalEntries: number;
  /** Number of failed domains being tracked */
  failedDomains: number;
  /** Hit rate since last reset */
  hitRate: number;
  /** Total hits */
  hits: number;
  /** Total misses */
  misses: number;
  /** Backend type in use */
  backend: 'memory' | 'redis';
}

/**
 * Backend interface for pluggable storage
 */
export interface CacheBackend {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(prefix?: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  size(prefix?: string): Promise<number>;
}

// ============================================
// CONSTANTS
// ============================================

/** Default maximum entries per source */
const DEFAULT_MAX_ENTRIES_PER_SOURCE = 500;

/** Default TTL: 1 hour */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Base cooldown for failed domains: 5 minutes */
const DEFAULT_BASE_COOLDOWN_MS = 5 * 60 * 1000;

/** Maximum cooldown for failed domains: 24 hours */
const DEFAULT_MAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Discovery source types */
export type DiscoverySource =
  | 'openapi'
  | 'asyncapi'
  | 'alt-spec'
  | 'robots-sitemap'
  | 'backend-framework'
  | 'docs-page'
  | 'graphql'
  | 'links';

// ============================================
// IN-MEMORY BACKEND
// ============================================

/**
 * In-memory cache backend using Map
 */
class InMemoryBackend implements CacheBackend {
  private cache = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    return entry as CacheEntry<T>;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.cache.set(key, entry as CacheEntry<unknown>);
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(prefix?: string): Promise<void> {
    if (prefix) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    const allKeys = [...this.cache.keys()];
    if (prefix) {
      return allKeys.filter(k => k.startsWith(prefix));
    }
    return allKeys;
  }

  async size(prefix?: string): Promise<number> {
    if (prefix) {
      return (await this.keys(prefix)).length;
    }
    return this.cache.size;
  }
}

// ============================================
// REDIS BACKEND
// ============================================

/**
 * Redis cache backend for multi-instance deployments
 */
class RedisBackend implements CacheBackend {
  private redis: import('ioredis').default;
  private keyPrefix: string;

  constructor(redis: import('ioredis').default, keyPrefix: string = 'discovery:') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const data = await this.redis.get(this.prefixKey(key));
      if (!data) return null;
      return JSON.parse(data) as CacheEntry<T>;
    } catch (err) {
      cacheLogger.error('Redis get failed', { key, error: err });
      return null;
    }
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      const ttlMs = entry.expiresAt - Date.now();
      if (ttlMs <= 0) return; // Already expired

      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await this.redis.setex(this.prefixKey(key), ttlSeconds, JSON.stringify(entry));
    } catch (err) {
      cacheLogger.error('Redis set failed', { key, error: err });
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(this.prefixKey(key));
      return result > 0;
    } catch (err) {
      cacheLogger.error('Redis delete failed', { key, error: err });
      return false;
    }
  }

  async clear(prefix?: string): Promise<void> {
    try {
      const pattern = prefix
        ? `${this.prefixKey(prefix)}*`
        : `${this.keyPrefix}*`;

      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        // Remove the global prefix that ioredis may have added
        const cleanKeys = keys.map(k => k.replace(/^unbrowser:/, ''));
        await this.redis.del(...cleanKeys);
      }
    } catch (err) {
      cacheLogger.error('Redis clear failed', { prefix, error: err });
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    try {
      const pattern = prefix
        ? `${this.prefixKey(prefix)}*`
        : `${this.keyPrefix}*`;

      const keys = await this.redis.keys(pattern);
      // Remove our prefix from keys
      return keys.map(k => k.replace(new RegExp(`^(?:unbrowser:)?${this.keyPrefix}`), ''));
    } catch (err) {
      cacheLogger.error('Redis keys failed', { prefix, error: err });
      return [];
    }
  }

  async size(prefix?: string): Promise<number> {
    return (await this.keys(prefix)).length;
  }
}

// ============================================
// DISCOVERY CACHE
// ============================================

/**
 * Unified discovery cache with pluggable backends
 */
export class DiscoveryCache {
  private backend: CacheBackend;
  private config: Required<DiscoveryCacheConfig>;
  private failedDomains = new Map<string, FailedDomain>();
  private hits = 0;
  private misses = 0;
  private backendType: 'memory' | 'redis' = 'memory';

  constructor(config: DiscoveryCacheConfig = {}) {
    this.config = {
      maxEntriesPerSource: config.maxEntriesPerSource ?? DEFAULT_MAX_ENTRIES_PER_SOURCE,
      defaultTtlMs: config.defaultTtlMs ?? DEFAULT_TTL_MS,
      tenantId: config.tenantId ?? '',
      baseCooldownMs: config.baseCooldownMs ?? DEFAULT_BASE_COOLDOWN_MS,
      maxCooldownMs: config.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS,
      useRedis: config.useRedis ?? false,
    };

    // Start with in-memory backend
    this.backend = new InMemoryBackend();
    this.backendType = 'memory';

    cacheLogger.debug('DiscoveryCache initialized', {
      tenantId: this.config.tenantId || 'default',
      maxEntriesPerSource: this.config.maxEntriesPerSource,
    });
  }

  /**
   * Initialize Redis backend if available and configured
   */
  async initializeRedis(redis: import('ioredis').default): Promise<boolean> {
    if (!this.config.useRedis) {
      return false;
    }

    try {
      // Test connection
      await redis.ping();

      // Create Redis backend with tenant-aware prefix
      const keyPrefix = this.config.tenantId
        ? `discovery:${this.config.tenantId}:`
        : 'discovery:';

      this.backend = new RedisBackend(redis, keyPrefix);
      this.backendType = 'redis';

      cacheLogger.info('Redis backend initialized', {
        tenantId: this.config.tenantId || 'default',
      });

      return true;
    } catch (err) {
      cacheLogger.warn('Redis backend initialization failed, using in-memory', { error: err });
      return false;
    }
  }

  /**
   * Build cache key with source and tenant isolation
   */
  private buildKey(source: DiscoverySource, domain: string): string {
    const tenantPrefix = this.config.tenantId ? `${this.config.tenantId}:` : '';
    return `${tenantPrefix}${source}:${domain}`;
  }

  /**
   * Build failed domain key
   */
  private buildFailedKey(source: DiscoverySource, domain: string): string {
    return `${source}:${domain}`;
  }

  /**
   * Get cached discovery result
   */
  async get<T>(source: DiscoverySource, domain: string): Promise<T | null> {
    const key = this.buildKey(source, domain);
    const entry = await this.backend.get<T>(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      await this.backend.delete(key);
      this.misses++;
      cacheLogger.debug('Cache expired', { source, domain });
      return null;
    }

    // Update hit count and last accessed
    entry.hitCount++;
    entry.lastAccessedAt = Date.now();
    await this.backend.set(key, entry);

    this.hits++;
    cacheLogger.debug('Cache hit', { source, domain, hitCount: entry.hitCount });
    return entry.value;
  }

  /**
   * Store discovery result in cache
   */
  async set<T>(
    source: DiscoverySource,
    domain: string,
    value: T,
    ttlMs?: number
  ): Promise<void> {
    const key = this.buildKey(source, domain);
    const now = Date.now();
    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;

    const entry: CacheEntry<T> = {
      value,
      cachedAt: now,
      expiresAt: now + effectiveTtl,
      hitCount: 0,
      lastAccessedAt: now,
    };

    // Enforce max entries with LRU eviction
    await this.enforceMaxEntries(source);

    await this.backend.set(key, entry);
    cacheLogger.debug('Cached result', { source, domain, ttlMs: effectiveTtl });

    // Clear any failed domain tracking on successful cache
    this.clearFailedDomain(source, domain);
  }

  /**
   * Delete cached entry
   */
  async delete(source: DiscoverySource, domain: string): Promise<boolean> {
    const key = this.buildKey(source, domain);
    return await this.backend.delete(key);
  }

  /**
   * Clear cache for a specific source or all sources
   */
  async clear(source?: DiscoverySource): Promise<void> {
    if (source) {
      const prefix = this.config.tenantId
        ? `${this.config.tenantId}:${source}:`
        : `${source}:`;
      await this.backend.clear(prefix);
      cacheLogger.debug('Cleared cache for source', { source });
    } else {
      const prefix = this.config.tenantId ? `${this.config.tenantId}:` : '';
      await this.backend.clear(prefix);
      this.failedDomains.clear();
      cacheLogger.debug('Cleared all cache');
    }
  }

  /**
   * LRU eviction to enforce max entries per source
   */
  private async enforceMaxEntries(source: DiscoverySource): Promise<void> {
    const prefix = this.config.tenantId
      ? `${this.config.tenantId}:${source}:`
      : `${source}:`;

    const keys = await this.backend.keys(prefix);

    if (keys.length < this.config.maxEntriesPerSource) {
      return;
    }

    // Get all entries to find LRU candidates
    const entries: Array<{ key: string; lastAccessedAt: number }> = [];

    for (const key of keys) {
      const fullKey = this.config.tenantId ? `${this.config.tenantId}:${key}` : key;
      const entry = await this.backend.get<unknown>(fullKey);
      if (entry) {
        entries.push({ key: fullKey, lastAccessedAt: entry.lastAccessedAt });
      }
    }

    // Sort by last accessed (oldest first) and evict 10% or at least 1
    entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    const toEvict = Math.max(1, Math.floor(this.config.maxEntriesPerSource * 0.1));

    for (let i = 0; i < toEvict && i < entries.length; i++) {
      await this.backend.delete(entries[i].key);
    }

    cacheLogger.debug('LRU eviction', { source, evicted: toEvict });
  }

  // ============================================
  // FAILED DOMAIN TRACKING
  // ============================================

  /**
   * Check if a domain is in cooldown after failures
   */
  isInCooldown(source: DiscoverySource, domain: string): boolean {
    const key = this.buildFailedKey(source, domain);
    const failed = this.failedDomains.get(key);

    if (!failed) return false;

    if (Date.now() >= failed.cooldownUntil) {
      // Cooldown expired, but keep tracking for backoff
      return false;
    }

    return true;
  }

  /**
   * Get cooldown info for a domain
   */
  getCooldownInfo(source: DiscoverySource, domain: string): FailedDomain | null {
    const key = this.buildFailedKey(source, domain);
    return this.failedDomains.get(key) || null;
  }

  /**
   * Record a discovery failure for a domain
   */
  recordFailure(
    source: DiscoverySource,
    domain: string,
    error?: string
  ): void {
    const key = this.buildFailedKey(source, domain);
    const now = Date.now();
    const existing = this.failedDomains.get(key);

    if (existing) {
      // Increment failure count and calculate exponential backoff
      existing.failureCount++;
      existing.lastFailureAt = now;
      existing.lastError = error;

      // Exponential backoff: base * 2^(failures-1), capped at max
      const backoffMs = Math.min(
        this.config.baseCooldownMs * Math.pow(2, existing.failureCount - 1),
        this.config.maxCooldownMs
      );
      existing.cooldownUntil = now + backoffMs;

      cacheLogger.debug('Failure recorded', {
        source,
        domain,
        failureCount: existing.failureCount,
        cooldownMs: backoffMs,
      });
    } else {
      // First failure
      this.failedDomains.set(key, {
        domain,
        source,
        failureCount: 1,
        firstFailureAt: now,
        lastFailureAt: now,
        cooldownUntil: now + this.config.baseCooldownMs,
        lastError: error,
      });

      cacheLogger.debug('First failure recorded', {
        source,
        domain,
        cooldownMs: this.config.baseCooldownMs,
      });
    }
  }

  /**
   * Clear failed domain tracking (on success)
   */
  clearFailedDomain(source: DiscoverySource, domain: string): void {
    const key = this.buildFailedKey(source, domain);
    if (this.failedDomains.has(key)) {
      this.failedDomains.delete(key);
      cacheLogger.debug('Cleared failed domain tracking', { source, domain });
    }
  }

  /**
   * Get all failed domains
   */
  getFailedDomains(): FailedDomain[] {
    return [...this.failedDomains.values()];
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get cache statistics
   */
  async getStats(): Promise<DiscoveryCacheStats> {
    const sources: DiscoverySource[] = [
      'openapi', 'asyncapi', 'alt-spec', 'robots-sitemap',
      'backend-framework', 'docs-page', 'graphql', 'links'
    ];

    const entriesBySource: Record<string, number> = {};
    let totalEntries = 0;

    for (const source of sources) {
      const prefix = this.config.tenantId
        ? `${this.config.tenantId}:${source}:`
        : `${source}:`;
      const count = await this.backend.size(prefix);
      entriesBySource[source] = count;
      totalEntries += count;
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      entriesBySource,
      totalEntries,
      failedDomains: this.failedDomains.size,
      hitRate,
      hits: this.hits,
      misses: this.misses,
      backend: this.backendType,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Wrapper for cached discovery operations
   */
  async withCache<T>(
    source: DiscoverySource,
    domain: string,
    discoveryFn: () => Promise<T>,
    options: { ttlMs?: number; skipCooldownCheck?: boolean } = {}
  ): Promise<T | null> {
    // Check cooldown unless explicitly skipped
    if (!options.skipCooldownCheck && this.isInCooldown(source, domain)) {
      const info = this.getCooldownInfo(source, domain);
      cacheLogger.debug('Domain in cooldown, skipping discovery', {
        source,
        domain,
        failureCount: info?.failureCount,
        cooldownUntil: info?.cooldownUntil,
      });
      return null;
    }

    // Check cache first
    const cached = await this.get<T>(source, domain);
    if (cached !== null) {
      return cached;
    }

    // Perform discovery
    try {
      const result = await discoveryFn();
      await this.set(source, domain, result, options.ttlMs);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.recordFailure(source, domain, errorMsg);
      throw err;
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

/** Global discovery cache instance */
let globalCache: DiscoveryCache | null = null;

/**
 * Get or create the global discovery cache
 */
export function getDiscoveryCache(config?: DiscoveryCacheConfig): DiscoveryCache {
  if (!globalCache) {
    globalCache = new DiscoveryCache(config);
  }
  return globalCache;
}

/**
 * Create a new discovery cache (for testing or multi-tenant scenarios)
 */
export function createDiscoveryCache(config?: DiscoveryCacheConfig): DiscoveryCache {
  return new DiscoveryCache(config);
}

/**
 * Reset the global cache (for testing)
 */
export function resetGlobalDiscoveryCache(): void {
  globalCache = null;
}
