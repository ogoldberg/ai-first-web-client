/**
 * Adaptive Response Cache (P-001)
 *
 * Smart TTL optimization based on:
 * 1. Domain classification (static vs dynamic sites)
 * 2. Content volatility (learned from change history)
 * 3. HTTP Cache-Control headers
 * 4. Domain groups from heuristics config
 *
 * Goals:
 * - Longer TTL for stable content (gov, docs, wikis)
 * - Shorter TTL for dynamic content (social media, news)
 * - Learn from content change patterns
 * - Respect HTTP caching hints
 */

import { isStaticDomain, isBrowserRequired } from './heuristics-config.js';
import { logger } from './logger.js';

const log = logger.create('AdaptiveCache');

// ============================================
// TTL CONSTANTS
// ============================================

/** Default TTL for pages (15 minutes) */
const DEFAULT_PAGE_TTL_MS = 15 * 60 * 1000;

/** Default TTL for API responses (5 minutes) */
const DEFAULT_API_TTL_MS = 5 * 60 * 1000;

/** Minimum TTL to avoid excessive requests (30 seconds) */
const MIN_TTL_MS = 30 * 1000;

/** Maximum TTL for any content (24 hours) */
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

/** TTL multipliers by domain type */
const TTL_MULTIPLIERS = {
  /** Government sites - very stable content */
  static_gov: 4.0,
  /** Documentation sites - stable content */
  static_docs: 3.0,
  /** Educational sites - stable content */
  static_edu: 3.0,
  /** Wiki sites - moderately stable */
  static_wiki: 2.0,
  /** General static sites */
  static_default: 2.0,
  /** Social media - very dynamic */
  dynamic_social: 0.25,
  /** News sites - dynamic */
  dynamic_news: 0.5,
  /** E-commerce - moderately dynamic */
  dynamic_commerce: 0.75,
  /** Unknown domain type */
  default: 1.0,
} as const;

// ============================================
// DOMAIN CLASSIFICATION
// ============================================

/** Domain category for TTL calculation */
export type DomainCategory =
  | 'static_gov'
  | 'static_docs'
  | 'static_edu'
  | 'static_wiki'
  | 'static_default'
  | 'dynamic_social'
  | 'dynamic_news'
  | 'dynamic_commerce'
  | 'default';

/** Domain patterns for classification */
const DOMAIN_PATTERNS: Array<{ pattern: RegExp; category: DomainCategory }> = [
  // Government sites
  { pattern: /\.gov(?:\.[a-z]{2})?$/i, category: 'static_gov' },
  { pattern: /\.gob\.[a-z]{2}$/i, category: 'static_gov' },

  // Documentation sites
  { pattern: /docs?\./i, category: 'static_docs' },
  { pattern: /readthedocs/i, category: 'static_docs' },
  { pattern: /\.github\.io$/i, category: 'static_docs' },
  { pattern: /developer\./i, category: 'static_docs' },
  { pattern: /devdocs/i, category: 'static_docs' },

  // Educational sites
  { pattern: /\.edu(?:\.[a-z]{2})?$/i, category: 'static_edu' },
  { pattern: /\.ac\.[a-z]{2}$/i, category: 'static_edu' },

  // Wiki sites
  { pattern: /wiki/i, category: 'static_wiki' },
  { pattern: /pedia/i, category: 'static_wiki' },

  // Social media
  { pattern: /twitter\.com|x\.com/i, category: 'dynamic_social' },
  { pattern: /facebook\.com|fb\.com/i, category: 'dynamic_social' },
  { pattern: /instagram\.com/i, category: 'dynamic_social' },
  { pattern: /linkedin\.com/i, category: 'dynamic_social' },
  { pattern: /tiktok\.com/i, category: 'dynamic_social' },
  { pattern: /reddit\.com/i, category: 'dynamic_social' },
  { pattern: /discord\.com/i, category: 'dynamic_social' },
  { pattern: /threads\.net/i, category: 'dynamic_social' },

  // News sites
  { pattern: /news\./i, category: 'dynamic_news' },
  { pattern: /\.news$/i, category: 'dynamic_news' },
  { pattern: /cnn\.com|bbc\.com|nytimes\.com|theguardian\.com/i, category: 'dynamic_news' },
  { pattern: /reuters\.com|apnews\.com|bloomberg\.com/i, category: 'dynamic_news' },

  // E-commerce
  { pattern: /amazon\.|ebay\.|etsy\.|shopify/i, category: 'dynamic_commerce' },
  { pattern: /shop\.|store\./i, category: 'dynamic_commerce' },
];

/**
 * Classify a domain into a category for TTL calculation.
 */
export function classifyDomain(domain: string): DomainCategory {
  const lowerDomain = domain.toLowerCase();

  // Check specific patterns first
  for (const { pattern, category } of DOMAIN_PATTERNS) {
    if (pattern.test(lowerDomain)) {
      return category;
    }
  }

  // Fall back to heuristics config
  if (isStaticDomain(lowerDomain)) {
    return 'static_default';
  }

  // Dynamic sites often require browser
  if (isBrowserRequired(lowerDomain)) {
    return 'dynamic_social';
  }

  return 'default';
}

/**
 * Get the TTL multiplier for a domain category.
 */
export function getTTLMultiplier(category: DomainCategory): number {
  return TTL_MULTIPLIERS[category];
}

// ============================================
// CACHE-CONTROL PARSING
// ============================================

/** Parsed Cache-Control directive values */
export interface CacheControlDirectives {
  /** max-age directive value in seconds */
  maxAge?: number;
  /** s-maxage directive value in seconds (shared cache) */
  sMaxAge?: number;
  /** Whether cache should be revalidated before use */
  mustRevalidate: boolean;
  /** Whether content should not be cached */
  noCache: boolean;
  /** Whether content should not be stored at all */
  noStore: boolean;
  /** Whether content is private (user-specific) */
  isPrivate: boolean;
  /** Whether content is public */
  isPublic: boolean;
  /** stale-while-revalidate value in seconds */
  staleWhileRevalidate?: number;
  /** stale-if-error value in seconds */
  staleIfError?: number;
}

/**
 * Parse Cache-Control header into structured directives.
 *
 * @param header - Cache-Control header value
 * @returns Parsed directives
 *
 * @example
 * ```ts
 * parseCacheControl('max-age=3600, must-revalidate')
 * // { maxAge: 3600, mustRevalidate: true, ... }
 * ```
 */
export function parseCacheControl(header: string | undefined): CacheControlDirectives {
  const directives: CacheControlDirectives = {
    mustRevalidate: false,
    noCache: false,
    noStore: false,
    isPrivate: false,
    isPublic: false,
  };

  if (!header) {
    return directives;
  }

  const parts = header.toLowerCase().split(',').map((p) => p.trim());

  for (const part of parts) {
    if (part.startsWith('max-age=')) {
      const value = parseInt(part.slice(8), 10);
      if (!isNaN(value) && value >= 0) {
        directives.maxAge = value;
      }
    } else if (part.startsWith('s-maxage=')) {
      const value = parseInt(part.slice(9), 10);
      if (!isNaN(value) && value >= 0) {
        directives.sMaxAge = value;
      }
    } else if (part.startsWith('stale-while-revalidate=')) {
      const value = parseInt(part.slice(23), 10);
      if (!isNaN(value) && value >= 0) {
        directives.staleWhileRevalidate = value;
      }
    } else if (part.startsWith('stale-if-error=')) {
      const value = parseInt(part.slice(15), 10);
      if (!isNaN(value) && value >= 0) {
        directives.staleIfError = value;
      }
    } else if (part === 'must-revalidate') {
      directives.mustRevalidate = true;
    } else if (part === 'no-cache') {
      directives.noCache = true;
    } else if (part === 'no-store') {
      directives.noStore = true;
    } else if (part === 'private') {
      directives.isPrivate = true;
    } else if (part === 'public') {
      directives.isPublic = true;
    }
  }

  return directives;
}

// ============================================
// CONTENT VOLATILITY TRACKING
// ============================================

/** Volatility record for a URL or domain */
interface VolatilityRecord {
  /** Number of times content was checked */
  checkCount: number;
  /** Number of times content changed */
  changeCount: number;
  /** Average time between changes in ms (null if never changed) */
  avgChangeIntervalMs: number | null;
  /** Timestamp of last check */
  lastCheckedAt: number;
  /** Timestamp of last change */
  lastChangedAt: number | null;
}

/** Volatility data storage */
const volatilityData = new Map<string, VolatilityRecord>();

/** Maximum number of volatility records to store */
const MAX_VOLATILITY_RECORDS = 1000;

/**
 * Get the volatility key for a URL (domain + path pattern).
 */
function getVolatilityKey(url: string): string {
  try {
    const parsed = new URL(url);
    // Group by domain + path pattern (remove query params and specific IDs)
    const pathPattern = parsed.pathname
      .replace(/\/\d+/g, '/{id}')
      .replace(/\/[a-f0-9-]{32,}/gi, '/{uuid}');
    return `${parsed.hostname}${pathPattern}`;
  } catch {
    return url;
  }
}

/**
 * Record a content check for volatility tracking.
 *
 * @param url - The URL that was checked
 * @param contentChanged - Whether the content changed since last check
 */
export function recordContentCheck(url: string, contentChanged: boolean): void {
  const key = getVolatilityKey(url);
  const now = Date.now();

  let record = volatilityData.get(key);

  if (!record) {
    // Evict oldest records if at capacity
    if (volatilityData.size >= MAX_VOLATILITY_RECORDS) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of volatilityData) {
        if (v.lastCheckedAt < oldestTime) {
          oldestTime = v.lastCheckedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        volatilityData.delete(oldestKey);
      }
    }

    record = {
      checkCount: 0,
      changeCount: 0,
      avgChangeIntervalMs: null,
      lastCheckedAt: now,
      lastChangedAt: null,
    };
    volatilityData.set(key, record);
  }

  record.checkCount++;
  record.lastCheckedAt = now;

  if (contentChanged) {
    const previousChangeAt = record.lastChangedAt;
    record.changeCount++;
    record.lastChangedAt = now;

    // Update average change interval
    if (previousChangeAt) {
      const interval = now - previousChangeAt;
      if (record.avgChangeIntervalMs === null) {
        record.avgChangeIntervalMs = interval;
      } else {
        // Exponential moving average
        record.avgChangeIntervalMs = record.avgChangeIntervalMs * 0.7 + interval * 0.3;
      }
    }
  }
}

/**
 * Get the volatility factor for a URL.
 *
 * @param url - The URL to check
 * @returns Volatility factor (0-1, where 0 = very stable, 1 = very volatile)
 */
export function getVolatilityFactor(url: string): number | null {
  const key = getVolatilityKey(url);
  const record = volatilityData.get(key);

  if (!record || record.checkCount < 2) {
    return null; // Not enough data
  }

  // Calculate change rate
  const changeRate = record.changeCount / record.checkCount;

  // Consider time since last change
  const now = Date.now();
  if (record.lastChangedAt) {
    const hoursSinceChange = (now - record.lastChangedAt) / (60 * 60 * 1000);
    // If no change for 24+ hours, reduce volatility
    if (hoursSinceChange > 24) {
      return changeRate * 0.5;
    }
  } else {
    // Never changed in our observations
    return 0;
  }

  return changeRate;
}

/**
 * Get volatility statistics for a domain.
 */
export function getDomainVolatilityStats(domain: string): {
  urlCount: number;
  avgChangeRate: number;
  mostVolatilePaths: Array<{ path: string; changeRate: number }>;
} {
  const lowerDomain = domain.toLowerCase();
  const domainRecords: Array<{ path: string; record: VolatilityRecord }> = [];

  for (const [key, record] of volatilityData) {
    if (key.startsWith(lowerDomain) && record.checkCount >= 2) {
      const path = key.slice(lowerDomain.length);
      domainRecords.push({ path, record });
    }
  }

  if (domainRecords.length === 0) {
    return { urlCount: 0, avgChangeRate: 0, mostVolatilePaths: [] };
  }

  const changeRates = domainRecords.map((r) => r.record.changeCount / r.record.checkCount);
  const avgChangeRate = changeRates.reduce((a, b) => a + b, 0) / changeRates.length;

  const sorted = domainRecords
    .map((r) => ({
      path: r.path,
      changeRate: r.record.changeCount / r.record.checkCount,
    }))
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, 5);

  return {
    urlCount: domainRecords.length,
    avgChangeRate,
    mostVolatilePaths: sorted,
  };
}

// ============================================
// ADAPTIVE TTL CALCULATION
// ============================================

/** Options for calculating adaptive TTL */
export interface AdaptiveTTLOptions {
  /** URL being cached */
  url: string;
  /** Whether this is an API response (default: false for page) */
  isApiResponse?: boolean;
  /** Cache-Control header value from response */
  cacheControlHeader?: string;
  /** Custom base TTL in ms (overrides defaults) */
  baseTTL?: number;
  /** Freshness requirement hint */
  freshnessHint?: 'realtime' | 'cached' | 'any';
}

/** Result of TTL calculation */
export interface AdaptiveTTLResult {
  /** Calculated TTL in milliseconds */
  ttlMs: number;
  /** Domain category used for calculation */
  domainCategory: DomainCategory;
  /** TTL multiplier applied */
  multiplier: number;
  /** Whether HTTP cache headers were respected */
  respectedHeaders: boolean;
  /** Volatility factor if available */
  volatilityFactor: number | null;
  /** Explanation of how TTL was calculated */
  reason: string;
}

/**
 * Calculate an adaptive TTL based on multiple factors.
 *
 * @param options - Options for TTL calculation
 * @returns Calculated TTL and metadata
 *
 * @example
 * ```ts
 * const result = calculateAdaptiveTTL({
 *   url: 'https://docs.example.com/api/reference',
 *   cacheControlHeader: 'max-age=3600',
 * });
 * // result.ttlMs might be 3600000 (1 hour from header)
 *
 * const result2 = calculateAdaptiveTTL({
 *   url: 'https://twitter.com/user/status',
 * });
 * // result.ttlMs might be 225000 (3.75 minutes, social media penalty)
 * ```
 */
export function calculateAdaptiveTTL(options: AdaptiveTTLOptions): AdaptiveTTLResult {
  const { url, isApiResponse = false, cacheControlHeader, baseTTL, freshnessHint } = options;

  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = 'unknown';
  }

  // Start with base TTL
  const defaultTTL = isApiResponse ? DEFAULT_API_TTL_MS : DEFAULT_PAGE_TTL_MS;
  let ttlMs = baseTTL ?? defaultTTL;
  const reasons: string[] = [];

  // 1. Check freshness hint
  if (freshnessHint === 'realtime') {
    // User wants fresh content - use minimum TTL
    return {
      ttlMs: MIN_TTL_MS,
      domainCategory: classifyDomain(domain),
      multiplier: 1.0,
      respectedHeaders: false,
      volatilityFactor: null,
      reason: 'Freshness hint: realtime requested',
    };
  }

  if (freshnessHint === 'cached') {
    // User prefers cached content - use longer TTL
    ttlMs = Math.min(ttlMs * 2, MAX_TTL_MS);
    reasons.push('cached preference (+100%)');
  }

  // 2. Parse and respect Cache-Control headers
  const cacheControl = parseCacheControl(cacheControlHeader);
  let respectedHeaders = false;

  if (cacheControl.noStore || cacheControl.noCache) {
    // Don't cache, but we still return a minimal TTL for our internal use
    return {
      ttlMs: MIN_TTL_MS,
      domainCategory: classifyDomain(domain),
      multiplier: 1.0,
      respectedHeaders: true,
      volatilityFactor: null,
      reason: `Cache-Control: ${cacheControl.noStore ? 'no-store' : 'no-cache'}`,
    };
  }

  if (cacheControl.maxAge !== undefined) {
    const headerTTL = cacheControl.maxAge * 1000;
    // Use header value but apply bounds
    ttlMs = Math.max(MIN_TTL_MS, Math.min(headerTTL, MAX_TTL_MS));
    respectedHeaders = true;
    reasons.push(`max-age=${cacheControl.maxAge}s`);
  } else if (cacheControl.sMaxAge !== undefined) {
    const headerTTL = cacheControl.sMaxAge * 1000;
    ttlMs = Math.max(MIN_TTL_MS, Math.min(headerTTL, MAX_TTL_MS));
    respectedHeaders = true;
    reasons.push(`s-maxage=${cacheControl.sMaxAge}s`);
  }

  // 3. Apply domain category multiplier (unless headers were explicit)
  const category = classifyDomain(domain);
  const multiplier = getTTLMultiplier(category);

  if (!respectedHeaders && multiplier !== 1.0) {
    ttlMs = ttlMs * multiplier;
    reasons.push(`${category} domain (x${multiplier})`);
  }

  // 4. Consider volatility (learned from change tracking)
  const volatility = getVolatilityFactor(url);
  if (volatility !== null) {
    // High volatility (> 0.5) reduces TTL
    // Low volatility (< 0.2) increases TTL
    if (volatility > 0.5) {
      const reduction = 1 - (volatility - 0.5);
      ttlMs = ttlMs * reduction;
      reasons.push(`high volatility (${Math.round(volatility * 100)}%)`);
    } else if (volatility < 0.2) {
      const increase = 1 + (0.2 - volatility);
      ttlMs = ttlMs * increase;
      reasons.push(`low volatility (${Math.round(volatility * 100)}%)`);
    }
  }

  // 5. Apply bounds
  ttlMs = Math.max(MIN_TTL_MS, Math.min(ttlMs, MAX_TTL_MS));

  log.debug('Calculated adaptive TTL', {
    url,
    ttlMs,
    category,
    multiplier,
    respectedHeaders,
    volatility,
    reasons,
  });

  return {
    ttlMs: Math.round(ttlMs),
    domainCategory: category,
    multiplier,
    respectedHeaders,
    volatilityFactor: volatility,
    reason: reasons.length > 0 ? reasons.join(', ') : 'default TTL',
  };
}

// ============================================
// ADAPTIVE CACHE ENTRY
// ============================================

/** Entry stored in the adaptive cache */
interface AdaptiveCacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
  ttlResult: AdaptiveTTLResult;
}

/** Statistics for cache performance */
export interface AdaptiveCacheStats {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  entriesByCategory: Record<DomainCategory, number>;
  avgTTLMs: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

/**
 * Adaptive Response Cache with smart TTL.
 *
 * @typeParam T - Type of cached values
 */
export class AdaptiveCache<T = unknown> {
  private cache: Map<string, AdaptiveCacheEntry<T>> = new Map();
  private readonly maxEntries: number;
  private hits = 0;
  private misses = 0;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Generate a cache key from URL and optional parameters.
   */
  private generateKey(url: string, params?: Record<string, string>): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `${url}?${sortedParams}`;
  }

  /**
   * Get a cached value if it exists and hasn't expired.
   */
  get(url: string, params?: Record<string, string>): T | undefined {
    const key = this.generateKey(url, params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * Store a value in the cache with adaptive TTL.
   */
  set(
    url: string,
    value: T,
    options?: {
      params?: Record<string, string>;
      cacheControlHeader?: string;
      isApiResponse?: boolean;
      freshnessHint?: 'realtime' | 'cached' | 'any';
    }
  ): AdaptiveTTLResult {
    const key = this.generateKey(url, options?.params);
    const now = Date.now();

    // Calculate adaptive TTL
    const ttlResult = calculateAdaptiveTTL({
      url,
      isApiResponse: options?.isApiResponse,
      cacheControlHeader: options?.cacheControlHeader,
      freshnessHint: options?.freshnessHint,
    });

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: now,
      expiresAt: now + ttlResult.ttlMs,
      ttlResult,
    });

    return ttlResult;
  }

  /**
   * Check if a URL is cached (and not expired).
   */
  has(url: string, params?: Record<string, string>): boolean {
    return this.get(url, params) !== undefined;
  }

  /**
   * Remove a specific entry from the cache.
   */
  delete(url: string, params?: Record<string, string>): boolean {
    const key = this.generateKey(url, params);
    return this.cache.delete(key);
  }

  /**
   * Remove all expired entries.
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
   * Evict the oldest entries to make room.
   */
  private evictOldest(count: number = 1): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      .slice(0, count);

    for (const [key] of entries) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Clear cache entries for a specific domain.
   */
  clearDomain(domain: string): number {
    let removed = 0;
    const normalizedDomain = domain.toLowerCase();

    for (const key of this.cache.keys()) {
      try {
        const url = new URL(key.startsWith('http') ? key : `https://${key}`);
        if (
          url.hostname.toLowerCase() === normalizedDomain ||
          url.hostname.toLowerCase().endsWith(`.${normalizedDomain}`)
        ) {
          this.cache.delete(key);
          removed++;
        }
      } catch {
        // Key is not a valid URL, skip
      }
    }

    return removed;
  }

  /**
   * Get all unique domains in the cache.
   */
  getDomains(): string[] {
    const domains = new Set<string>();

    for (const key of this.cache.keys()) {
      try {
        const url = new URL(key.startsWith('http') ? key : `https://${key}`);
        domains.add(url.hostname.toLowerCase());
      } catch {
        // Key is not a valid URL, skip
      }
    }

    return Array.from(domains).sort();
  }

  /**
   * Get cache statistics.
   */
  getStats(): AdaptiveCacheStats {
    let oldest: number | null = null;
    let newest: number | null = null;
    let totalTTL = 0;
    const byCategory: Record<DomainCategory, number> = {
      static_gov: 0,
      static_docs: 0,
      static_edu: 0,
      static_wiki: 0,
      static_default: 0,
      dynamic_social: 0,
      dynamic_news: 0,
      dynamic_commerce: 0,
      default: 0,
    };

    for (const entry of this.cache.values()) {
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp;
      }
      if (newest === null || entry.timestamp > newest) {
        newest = entry.timestamp;
      }
      totalTTL += entry.ttlResult.ttlMs;
      byCategory[entry.ttlResult.domainCategory]++;
    }

    const total = this.hits + this.misses;

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      entriesByCategory: byCategory,
      avgTTLMs: this.cache.size > 0 ? totalTTL / this.cache.size : 0,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }

  /**
   * Get the TTL result for a cached entry.
   */
  getTTLResult(url: string, params?: Record<string, string>): AdaptiveTTLResult | undefined {
    const key = this.generateKey(url, params);
    const entry = this.cache.get(key);
    return entry?.ttlResult;
  }

  /**
   * Wrap an async function with caching.
   */
  async withCache<R extends T>(
    url: string,
    fn: () => Promise<R>,
    options?: {
      params?: Record<string, string>;
      cacheControlHeader?: string;
      isApiResponse?: boolean;
      freshnessHint?: 'realtime' | 'cached' | 'any';
    }
  ): Promise<{ value: R; fromCache: boolean; ttlResult?: AdaptiveTTLResult }> {
    const cached = this.get(url, options?.params) as R | undefined;
    if (cached !== undefined) {
      return {
        value: cached,
        fromCache: true,
        ttlResult: this.getTTLResult(url, options?.params),
      };
    }

    const result = await fn();
    const ttlResult = this.set(url, result, options);
    return { value: result, fromCache: false, ttlResult };
  }
}

// ============================================
// CONTENT CACHE WITH ADAPTIVE TTL
// ============================================

/** Content entry with hash for change detection */
interface ContentEntry {
  html: string;
  contentHash: string;
  fetchedAt: number;
}

/**
 * Adaptive content cache with change detection.
 */
export class AdaptiveContentCache extends AdaptiveCache<ContentEntry> {
  constructor(maxEntries?: number) {
    super(maxEntries);
  }

  /**
   * Simple hash function for content comparison.
   */
  static hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Check if content has changed since last cache and record for volatility.
   */
  hasContentChanged(url: string, newContent: string): boolean {
    const cached = this.get(url);
    const newHash = AdaptiveContentCache.hashContent(newContent);

    if (!cached) {
      return true;
    }

    const changed = cached.contentHash !== newHash;

    // Record for volatility tracking
    recordContentCheck(url, changed);

    return changed;
  }

  /**
   * Store content with adaptive TTL and change detection.
   */
  setContent(
    url: string,
    html: string,
    options?: {
      cacheControlHeader?: string;
      freshnessHint?: 'realtime' | 'cached' | 'any';
    }
  ): AdaptiveTTLResult {
    const contentHash = AdaptiveContentCache.hashContent(html);

    // Check for change before storing
    const cached = this.get(url);
    if (cached) {
      const changed = cached.contentHash !== contentHash;
      recordContentCheck(url, changed);
    }

    return this.set(
      url,
      {
        html,
        contentHash,
        fetchedAt: Date.now(),
      },
      {
        isApiResponse: false,
        cacheControlHeader: options?.cacheControlHeader,
        freshnessHint: options?.freshnessHint,
      }
    );
  }
}

// ============================================
// DEFAULT INSTANCES
// ============================================

/** Default adaptive page cache */
export const adaptivePageCache = new AdaptiveContentCache(500);

/** Default adaptive API cache */
export const adaptiveApiCache = new AdaptiveCache(200);

// ============================================
// EXPORTS
// ============================================

export {
  DEFAULT_PAGE_TTL_MS,
  DEFAULT_API_TTL_MS,
  MIN_TTL_MS,
  MAX_TTL_MS,
  TTL_MULTIPLIERS,
};
