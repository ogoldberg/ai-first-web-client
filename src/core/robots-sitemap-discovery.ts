/**
 * Robots.txt & Sitemap Discovery Module (D-007)
 *
 * Extracts API hints from robots.txt and sitemap.xml:
 * - robots.txt: Disallow/Allow directives that hint at API paths
 * - sitemap.xml: URLs that point to API documentation or developer pages
 *
 * This module provides low-confidence hints that can guide further discovery
 * rather than definitive API patterns.
 */

import { logger } from '../utils/logger.js';

const robotsLogger = logger.create('RobotsSitemapDiscovery');

// ============================================
// TYPES
// ============================================

/**
 * A hint extracted from robots.txt or sitemap.xml
 */
export interface ApiHint {
  /** The path or URL that was discovered */
  path: string;
  /** Source of this hint */
  source: 'robots.txt' | 'sitemap.xml';
  /** Type of hint */
  type: 'api-path' | 'documentation' | 'developer-portal' | 'spec-file' | 'graphql';
  /** How the hint was derived */
  reason: string;
  /** Confidence in this hint (0-1) */
  confidence: number;
}

/**
 * Parsed robots.txt directives
 */
export interface ParsedRobotsTxt {
  /** Disallow directives for user-agent * or all user agents */
  disallowPaths: string[];
  /** Allow directives for user-agent * or all user agents */
  allowPaths: string[];
  /** Sitemap URLs referenced */
  sitemapUrls: string[];
  /** Raw content for debugging */
  rawContent?: string;
}

/**
 * Parsed sitemap entry
 */
export interface SitemapEntry {
  /** URL location */
  loc: string;
  /** Last modified date */
  lastmod?: string;
  /** Change frequency */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  /** Priority */
  priority?: number;
}

/**
 * Parsed sitemap (can be sitemap or sitemap index)
 */
export interface ParsedSitemap {
  /** Type of sitemap */
  type: 'sitemap' | 'sitemapindex';
  /** URL entries (for sitemap) */
  entries: SitemapEntry[];
  /** Child sitemap URLs (for sitemapindex) */
  sitemapUrls: string[];
}

/**
 * Result from robots/sitemap discovery
 */
export interface RobotsSitemapDiscoveryResult {
  /** Whether any hints were found */
  found: boolean;
  /** Discovered API hints */
  hints: ApiHint[];
  /** Parsed robots.txt if found */
  robotsTxt?: ParsedRobotsTxt;
  /** Parsed sitemap if found */
  sitemap?: ParsedSitemap;
  /** Locations that were probed */
  probedLocations: string[];
  /** Time taken for discovery (ms) */
  discoveryTime: number;
  /** Error message if discovery failed */
  error?: string;
}

/**
 * Options for robots/sitemap discovery
 */
export interface RobotsSitemapDiscoveryOptions {
  /** Maximum time to spend probing (ms) */
  timeout?: number;
  /** Whether to follow sitemap index references */
  followSitemapIndex?: boolean;
  /** Maximum sitemap entries to analyze */
  maxSitemapEntries?: number;
  /** Headers to send with probe requests */
  headers?: Record<string, string>;
  /** Custom fetch function */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ============================================
// CONSTANTS
// ============================================

/** Default timeout for individual requests */
const DEFAULT_REQUEST_TIMEOUT = 10000;

/** Default maximum sitemap entries to analyze */
const DEFAULT_MAX_SITEMAP_ENTRIES = 1000;

/** API-related path patterns to detect in robots.txt */
const API_PATH_PATTERNS: Array<{ pattern: RegExp; type: ApiHint['type']; confidence: number }> = [
  // Direct API paths
  { pattern: /^\/api\/?$/i, type: 'api-path', confidence: 0.7 },
  { pattern: /^\/api\//i, type: 'api-path', confidence: 0.6 },
  { pattern: /^\/v\d+\/?$/i, type: 'api-path', confidence: 0.6 },
  { pattern: /^\/v\d+\//i, type: 'api-path', confidence: 0.5 },
  { pattern: /^\/rest\/?$/i, type: 'api-path', confidence: 0.6 },
  { pattern: /^\/rest\//i, type: 'api-path', confidence: 0.5 },

  // GraphQL endpoints
  { pattern: /\/graphql\/?$/i, type: 'graphql', confidence: 0.8 },
  { pattern: /\/gql\/?$/i, type: 'graphql', confidence: 0.7 },

  // Spec files
  { pattern: /\/swagger\.json$/i, type: 'spec-file', confidence: 0.9 },
  { pattern: /\/swagger\.yaml$/i, type: 'spec-file', confidence: 0.9 },
  { pattern: /\/openapi\.json$/i, type: 'spec-file', confidence: 0.9 },
  { pattern: /\/openapi\.yaml$/i, type: 'spec-file', confidence: 0.9 },
  { pattern: /\/api-docs$/i, type: 'spec-file', confidence: 0.7 },
  { pattern: /\/api\.json$/i, type: 'spec-file', confidence: 0.6 },

  // Documentation paths
  { pattern: /^\/docs\/?$/i, type: 'documentation', confidence: 0.5 },
  { pattern: /^\/documentation\/?$/i, type: 'documentation', confidence: 0.5 },
  { pattern: /^\/api-docs\/?$/i, type: 'documentation', confidence: 0.7 },
  { pattern: /\/developer[s]?\/?$/i, type: 'developer-portal', confidence: 0.6 },
  { pattern: /^\/dev\/?$/i, type: 'developer-portal', confidence: 0.5 },
];

/** URL patterns to detect API documentation in sitemap */
const SITEMAP_API_PATTERNS: Array<{ pattern: RegExp; type: ApiHint['type']; confidence: number }> = [
  // API documentation
  { pattern: /\/api[-_]?docs?\//i, type: 'documentation', confidence: 0.7 },
  { pattern: /\/docs\/api/i, type: 'documentation', confidence: 0.7 },
  { pattern: /\/documentation\/api/i, type: 'documentation', confidence: 0.7 },
  { pattern: /\/api\/docs/i, type: 'documentation', confidence: 0.6 },
  { pattern: /\/reference\//i, type: 'documentation', confidence: 0.5 },
  { pattern: /\/api-reference/i, type: 'documentation', confidence: 0.7 },

  // Developer portals
  { pattern: /\/developer[s]?\//i, type: 'developer-portal', confidence: 0.6 },
  { pattern: /\/dev-portal/i, type: 'developer-portal', confidence: 0.7 },
  { pattern: /\/dev\//i, type: 'developer-portal', confidence: 0.4 },

  // Spec file references
  { pattern: /\/swagger/i, type: 'spec-file', confidence: 0.8 },
  { pattern: /\/openapi/i, type: 'spec-file', confidence: 0.8 },
  { pattern: /\/asyncapi/i, type: 'spec-file', confidence: 0.8 },
];

// ============================================
// ROBOTS.TXT PARSING
// ============================================

/**
 * Parse robots.txt content into structured format
 */
export function parseRobotsTxt(content: string): ParsedRobotsTxt {
  const lines = content.split('\n');
  const result: ParsedRobotsTxt = {
    disallowPaths: [],
    allowPaths: [],
    sitemapUrls: [],
    rawContent: content,
  };

  let currentUserAgent = '';
  let isRelevantAgent = false; // * or unspecified

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Parse directive
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    switch (directive) {
      case 'user-agent':
        currentUserAgent = value.toLowerCase();
        isRelevantAgent = currentUserAgent === '*' || currentUserAgent === '';
        break;

      case 'disallow':
        if (value && (isRelevantAgent || !currentUserAgent)) {
          result.disallowPaths.push(value);
        }
        break;

      case 'allow':
        if (value && (isRelevantAgent || !currentUserAgent)) {
          result.allowPaths.push(value);
        }
        break;

      case 'sitemap':
        if (value) {
          result.sitemapUrls.push(value);
        }
        break;
    }
  }

  // Deduplicate paths
  result.disallowPaths = [...new Set(result.disallowPaths)];
  result.allowPaths = [...new Set(result.allowPaths)];
  result.sitemapUrls = [...new Set(result.sitemapUrls)];

  return result;
}

/**
 * Extract API hints from parsed robots.txt
 */
export function extractHintsFromRobotsTxt(robotsTxt: ParsedRobotsTxt): ApiHint[] {
  const hints: ApiHint[] = [];
  const seenPaths = new Set<string>();

  // Analyze both Disallow and Allow paths
  const allPaths = [
    ...robotsTxt.disallowPaths.map((p) => ({ path: p, directive: 'Disallow' })),
    ...robotsTxt.allowPaths.map((p) => ({ path: p, directive: 'Allow' })),
  ];

  for (const { path, directive } of allPaths) {
    // Skip if already seen
    if (seenPaths.has(path)) continue;

    for (const { pattern, type, confidence } of API_PATH_PATTERNS) {
      if (pattern.test(path)) {
        seenPaths.add(path);

        // Slightly lower confidence for Disallow (could be private API)
        const adjustedConfidence = directive === 'Disallow' ? confidence * 0.9 : confidence;

        hints.push({
          path,
          source: 'robots.txt',
          type,
          reason: `${directive} directive matches ${type} pattern`,
          confidence: adjustedConfidence,
        });
        break;
      }
    }
  }

  return hints;
}

// ============================================
// SITEMAP PARSING
// ============================================

/**
 * Parse sitemap XML content
 */
export function parseSitemap(content: string): ParsedSitemap {
  const result: ParsedSitemap = {
    type: 'sitemap',
    entries: [],
    sitemapUrls: [],
  };

  // Check if this is a sitemap index
  if (content.includes('<sitemapindex')) {
    result.type = 'sitemapindex';

    // Extract sitemap URLs from index using matchAll
    const sitemapMatches = content.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi);
    for (const match of sitemapMatches) {
      result.sitemapUrls.push(decodeXmlEntities(match[1].trim()));
    }

    return result;
  }

  // Parse regular sitemap entries using matchAll
  const urlMatches = content.matchAll(/<url>([\s\S]*?)<\/url>/gi);

  for (const urlMatch of urlMatches) {
    const urlBlock = urlMatch[1];

    // Extract loc (required)
    const locMatch = /<loc>([^<]+)<\/loc>/i.exec(urlBlock);
    if (!locMatch) continue;

    const entry: SitemapEntry = {
      loc: decodeXmlEntities(locMatch[1].trim()),
    };

    // Extract optional fields
    const lastmodMatch = /<lastmod>([^<]+)<\/lastmod>/i.exec(urlBlock);
    if (lastmodMatch) {
      entry.lastmod = lastmodMatch[1].trim();
    }

    const changefreqMatch = /<changefreq>([^<]+)<\/changefreq>/i.exec(urlBlock);
    if (changefreqMatch) {
      entry.changefreq = changefreqMatch[1].trim().toLowerCase() as SitemapEntry['changefreq'];
    }

    const priorityMatch = /<priority>([^<]+)<\/priority>/i.exec(urlBlock);
    if (priorityMatch) {
      entry.priority = parseFloat(priorityMatch[1].trim());
    }

    result.entries.push(entry);
  }

  return result;
}

/**
 * Decode common XML entities
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Extract API hints from parsed sitemap
 */
export function extractHintsFromSitemap(sitemap: ParsedSitemap): ApiHint[] {
  const hints: ApiHint[] = [];
  const seenUrls = new Set<string>();

  for (const entry of sitemap.entries) {
    // Skip if already seen
    if (seenUrls.has(entry.loc)) continue;

    for (const { pattern, type, confidence } of SITEMAP_API_PATTERNS) {
      if (pattern.test(entry.loc)) {
        seenUrls.add(entry.loc);

        // Boost confidence slightly if changefreq is low (documentation is stable)
        let adjustedConfidence = confidence;
        if (entry.changefreq === 'monthly' || entry.changefreq === 'yearly' || entry.changefreq === 'never') {
          adjustedConfidence = Math.min(1, confidence * 1.1);
        }

        hints.push({
          path: entry.loc,
          source: 'sitemap.xml',
          type,
          reason: `URL matches ${type} pattern`,
          confidence: adjustedConfidence,
        });
        break;
      }
    }
  }

  return hints;
}

// ============================================
// FETCH HELPERS
// ============================================

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: {
    timeout: number;
    headers?: Record<string, string>;
    fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  }
): Promise<Response> {
  const { timeout, headers = {}, fetchFn = fetch } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'LLM-Browser-MCP/1.0 (Robots/Sitemap Discovery)',
        Accept: 'text/plain, application/xml, */*',
        ...headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// MAIN DISCOVERY
// ============================================

/**
 * Discover API hints from robots.txt and sitemap.xml
 */
export async function discoverRobotsSitemap(
  domain: string,
  options: RobotsSitemapDiscoveryOptions = {}
): Promise<RobotsSitemapDiscoveryResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_REQUEST_TIMEOUT * 3;
  const maxSitemapEntries = options.maxSitemapEntries ?? DEFAULT_MAX_SITEMAP_ENTRIES;
  const fetchFn = options.fetchFn ?? fetch;
  const probedLocations: string[] = [];
  const hints: ApiHint[] = [];

  // Ensure domain has protocol
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const parsedBase = new URL(baseUrl);
  const origin = parsedBase.origin;

  let robotsTxt: ParsedRobotsTxt | undefined;
  let sitemap: ParsedSitemap | undefined;

  robotsLogger.debug('Starting robots/sitemap discovery', { domain });

  // 1. Fetch and parse robots.txt
  const robotsUrl = `${origin}/robots.txt`;
  probedLocations.push(robotsUrl);

  try {
    const robotsResponse = await fetchWithTimeout(robotsUrl, {
      timeout: DEFAULT_REQUEST_TIMEOUT,
      headers: options.headers,
      fetchFn,
    });

    if (robotsResponse.ok) {
      const robotsContent = await robotsResponse.text();
      robotsTxt = parseRobotsTxt(robotsContent);
      const robotsHints = extractHintsFromRobotsTxt(robotsTxt);
      hints.push(...robotsHints);

      robotsLogger.debug('Parsed robots.txt', {
        domain,
        disallowPaths: robotsTxt.disallowPaths.length,
        allowPaths: robotsTxt.allowPaths.length,
        sitemapUrls: robotsTxt.sitemapUrls.length,
        hints: robotsHints.length,
      });
    }
  } catch (error) {
    robotsLogger.debug('Failed to fetch robots.txt', {
      domain,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check timeout
  if (Date.now() - startTime > timeout) {
    return {
      found: hints.length > 0,
      hints,
      robotsTxt,
      probedLocations,
      discoveryTime: Date.now() - startTime,
      error: 'Discovery timeout reached',
    };
  }

  // 2. Fetch and parse sitemap(s)
  const sitemapUrls: string[] = [];

  // Add sitemaps from robots.txt
  if (robotsTxt?.sitemapUrls) {
    sitemapUrls.push(...robotsTxt.sitemapUrls);
  }

  // Add default sitemap locations if none found in robots.txt
  if (sitemapUrls.length === 0) {
    sitemapUrls.push(`${origin}/sitemap.xml`);
    sitemapUrls.push(`${origin}/sitemap_index.xml`);
  }

  let totalEntries = 0;

  for (const sitemapUrl of sitemapUrls) {
    // Check timeout and entry limit
    if (Date.now() - startTime > timeout) {
      break;
    }
    if (totalEntries >= maxSitemapEntries) {
      break;
    }

    probedLocations.push(sitemapUrl);

    try {
      const sitemapResponse = await fetchWithTimeout(sitemapUrl, {
        timeout: DEFAULT_REQUEST_TIMEOUT,
        headers: options.headers,
        fetchFn,
      });

      if (!sitemapResponse.ok) continue;

      const sitemapContent = await sitemapResponse.text();
      const parsedSitemap = parseSitemap(sitemapContent);

      // Store first sitemap found
      if (!sitemap) {
        sitemap = parsedSitemap;
      } else {
        // Merge entries
        sitemap.entries.push(...parsedSitemap.entries);
        sitemap.sitemapUrls.push(...parsedSitemap.sitemapUrls);
      }

      // Extract hints
      const sitemapHints = extractHintsFromSitemap(parsedSitemap);
      hints.push(...sitemapHints);
      totalEntries += parsedSitemap.entries.length;

      robotsLogger.debug('Parsed sitemap', {
        url: sitemapUrl,
        type: parsedSitemap.type,
        entries: parsedSitemap.entries.length,
        childSitemaps: parsedSitemap.sitemapUrls.length,
        hints: sitemapHints.length,
      });

      // Follow sitemap index references if enabled
      if (options.followSitemapIndex && parsedSitemap.type === 'sitemapindex') {
        sitemapUrls.push(...parsedSitemap.sitemapUrls);
      }
    } catch (error) {
      robotsLogger.debug('Failed to fetch sitemap', {
        url: sitemapUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Deduplicate hints by path
  const uniqueHints = deduplicateHints(hints);

  robotsLogger.info('Robots/sitemap discovery complete', {
    domain,
    found: uniqueHints.length > 0,
    hints: uniqueHints.length,
    robotsTxtFound: !!robotsTxt,
    sitemapFound: !!sitemap,
    time: Date.now() - startTime,
  });

  return {
    found: uniqueHints.length > 0,
    hints: uniqueHints,
    robotsTxt,
    sitemap,
    probedLocations,
    discoveryTime: Date.now() - startTime,
  };
}

/**
 * Deduplicate hints by path, keeping the highest confidence
 */
function deduplicateHints(hints: ApiHint[]): ApiHint[] {
  const byPath = new Map<string, ApiHint>();

  for (const hint of hints) {
    const existing = byPath.get(hint.path);
    if (!existing || hint.confidence > existing.confidence) {
      byPath.set(hint.path, hint);
    }
  }

  return [...byPath.values()];
}

// ============================================
// CACHING
// ============================================

interface CacheEntry {
  result: RobotsSitemapDiscoveryResult;
  expiresAt: number;
}

/** Default cache TTL: 1 hour */
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

// ============================================
// CACHING (CLOUD-008: Unified Discovery Cache)
// ============================================

import { getDiscoveryCache } from '../utils/discovery-cache.js';

/**
 * Get cached discovery result if valid
 * Uses unified discovery cache with tenant isolation
 */
export async function getCachedRobotsSitemap(domain: string): Promise<RobotsSitemapDiscoveryResult | null> {
  const cache = getDiscoveryCache();
  return await cache.get<RobotsSitemapDiscoveryResult>('robots-sitemap', domain);
}

/**
 * Cache a discovery result
 * Uses unified discovery cache
 */
export async function cacheRobotsSitemap(
  domain: string,
  result: RobotsSitemapDiscoveryResult,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): Promise<void> {
  const cache = getDiscoveryCache();
  await cache.set('robots-sitemap', domain, result, ttlMs);
}

/**
 * Clear cache for a specific domain or all domains
 */
export async function clearRobotsSitemapCache(domain?: string): Promise<void> {
  const cache = getDiscoveryCache();
  if (domain) {
    await cache.delete('robots-sitemap', domain);
  } else {
    await cache.clear('robots-sitemap');
  }
}

/**
 * Discover with caching
 * Uses unified discovery cache with failed domain tracking
 */
export async function discoverRobotsSitemapCached(
  domain: string,
  options: RobotsSitemapDiscoveryOptions = {}
): Promise<RobotsSitemapDiscoveryResult> {
  const cache = getDiscoveryCache();

  // Check if domain is in cooldown from previous failures
  if (cache.isInCooldown('robots-sitemap', domain)) {
    const cooldownInfo = cache.getCooldownInfo('robots-sitemap', domain);
    robotsLogger.debug('Domain in cooldown, returning empty result', {
      domain,
      failureCount: cooldownInfo?.failureCount,
    });
    return {
      found: false,
      hints: [],
      probedLocations: [],
      discoveryTime: 0,
    };
  }

  const cached = await getCachedRobotsSitemap(domain);
  if (cached) {
    robotsLogger.debug('Cache hit for robots/sitemap discovery', { domain });
    return cached;
  }

  try {
    const result = await discoverRobotsSitemap(domain, options);
    await cacheRobotsSitemap(domain, result);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    cache.recordFailure('robots-sitemap', domain, errorMsg);
    throw err;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Filter hints by type
 */
export function filterHintsByType(hints: ApiHint[], types: ApiHint['type'][]): ApiHint[] {
  return hints.filter((h) => types.includes(h.type));
}

/**
 * Get hints above a confidence threshold
 */
export function filterHintsByConfidence(hints: ApiHint[], minConfidence: number): ApiHint[] {
  return hints.filter((h) => h.confidence >= minConfidence);
}

/**
 * Sort hints by confidence (highest first)
 */
export function sortHintsByConfidence(hints: ApiHint[]): ApiHint[] {
  return [...hints].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get just API path hints (for direct API discovery)
 */
export function getApiPathHints(hints: ApiHint[]): ApiHint[] {
  return filterHintsByType(hints, ['api-path', 'graphql']);
}

/**
 * Get documentation hints (for doc discovery)
 */
export function getDocumentationHints(hints: ApiHint[]): ApiHint[] {
  return filterHintsByType(hints, ['documentation', 'developer-portal', 'spec-file']);
}
