/**
 * API Documentation Discovery Orchestrator (D-008)
 *
 * Unified pipeline that orchestrates all API discovery methods:
 * - OpenAPI/Swagger specification discovery
 * - GraphQL introspection
 * - (Future) Link relation discovery (RFC 8288)
 * - (Future) Documentation page parsing
 * - (Future) AsyncAPI discovery
 *
 * Features:
 * - Parallel discovery across all methods
 * - Result caching with configurable TTL
 * - Pattern deduplication and merging
 * - Priority-based result ordering
 */

import { logger } from '../utils/logger.js';
import { discoverOpenAPICached, generatePatternsFromOpenAPISpec } from './openapi-discovery.js';
import { discoverGraphQL, type GraphQLDiscoveryResult, type GraphQLQueryPattern } from './graphql-introspection.js';
import {
  discoverLinks,
  generatePatternsFromLinks,
  type LinkDiscoveryResult,
  type DiscoveredLink,
} from './link-discovery.js';
import type { LearnedApiPattern, ParsedOpenAPISpec, OpenAPIDiscoveryOptions } from '../types/api-patterns.js';

// ============================================
// TYPES
// ============================================

/**
 * Source of the discovered API documentation
 */
export type DiscoverySource =
  | 'openapi'
  | 'graphql'
  | 'docs-page'     // Future: HTML documentation pages
  | 'links'         // Future: RFC 8288 link relations
  | 'asyncapi'      // Future: AsyncAPI specs
  | 'raml'          // Future: RAML specs
  | 'observed';     // Patterns learned from observation

/**
 * Rate limit information extracted from API documentation
 */
export interface RateLimitInfo {
  /** Requests allowed per window */
  requests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Header name for remaining requests */
  remainingHeader?: string;
  /** Header name for reset time */
  resetHeader?: string;
}

/**
 * Authentication information extracted from API documentation
 */
export interface AuthInfo {
  /** Authentication type */
  type: 'api_key' | 'bearer' | 'basic' | 'oauth2' | 'cookie';
  /** Where the credential goes */
  in?: 'header' | 'query' | 'cookie';
  /** Header/query param name */
  name?: string;
  /** OAuth2 flow type */
  oauthFlow?: 'authorization_code' | 'client_credentials' | 'implicit' | 'password';
  /** OAuth2 URLs */
  oauthUrls?: {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes?: Record<string, string>;
  };
}

/**
 * Metadata extracted from API documentation
 */
export interface DiscoveryMetadata {
  /** API version string */
  specVersion?: string;
  /** Rate limit information */
  rateLimit?: RateLimitInfo;
  /** Authentication requirements */
  authentication?: AuthInfo[];
  /** Base URL for the API */
  baseUrl?: string;
  /** API title/name */
  title?: string;
  /** API description */
  description?: string;
}

/**
 * Result from a single discovery source
 */
export interface DiscoveryResult {
  /** Source of this discovery */
  source: DiscoverySource;
  /** Confidence in this discovery (0-1) */
  confidence: number;
  /** Discovered patterns (empty if none found) */
  patterns: LearnedApiPattern[];
  /** Extracted metadata */
  metadata: DiscoveryMetadata;
  /** Time taken for discovery (ms) */
  discoveryTime: number;
  /** Whether this source found anything */
  found: boolean;
  /** Error message if discovery failed */
  error?: string;
  /** Raw source data for debugging */
  rawData?: {
    openapi?: ParsedOpenAPISpec;
    graphql?: GraphQLDiscoveryResult;
    links?: LinkDiscoveryResult;
  };
}

/**
 * Aggregated results from all discovery sources
 */
export interface AggregatedDiscoveryResult {
  /** Domain that was discovered */
  domain: string;
  /** All discovery results, ordered by priority/confidence */
  results: DiscoveryResult[];
  /** Combined patterns from all sources (deduplicated) */
  allPatterns: LearnedApiPattern[];
  /** Best metadata (from highest confidence source) */
  metadata: DiscoveryMetadata;
  /** Total discovery time */
  totalTime: number;
  /** Whether any source found documentation */
  found: boolean;
  /** When this result was cached */
  cachedAt?: number;
}

/**
 * Options for discovery orchestration
 */
export interface DiscoveryOptions {
  /** Custom headers for requests */
  headers?: Record<string, string>;
  /** Timeout per source (ms) */
  timeout?: number;
  /** Skip specific sources */
  skipSources?: DiscoverySource[];
  /** Custom fetch function */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Force fresh discovery (ignore cache) */
  forceRefresh?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const discoveryLogger = logger.create('ApiDocumentationDiscovery');

/** Default cache TTL: 1 hour */
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

/** Default timeout per discovery source */
export const DEFAULT_SOURCE_TIMEOUT_MS = 30_000;

/** Confidence scores for different sources */
export const SOURCE_CONFIDENCE: Record<DiscoverySource, number> = {
  openapi: 0.95,     // OpenAPI specs are highly reliable
  graphql: 0.90,     // GraphQL introspection is reliable
  asyncapi: 0.85,    // AsyncAPI is reliable but less common
  raml: 0.80,        // RAML is reliable but older
  links: 0.70,       // Link relations need validation
  'docs-page': 0.60, // Parsed docs need more validation
  observed: 0.50,    // Learned patterns need validation
};

/** Priority order for sources (higher = tried first, results prioritized) */
export const SOURCE_PRIORITY: Record<DiscoverySource, number> = {
  openapi: 100,
  graphql: 90,
  asyncapi: 80,
  raml: 70,
  links: 60,
  'docs-page': 50,
  observed: 40,
};

// ============================================
// CACHE
// ============================================

interface CacheEntry {
  result: AggregatedDiscoveryResult;
  expiresAt: number;
}

/** In-memory cache for discovery results */
const discoveryCache = new Map<string, CacheEntry>();

/**
 * Get cached discovery result if valid
 */
export function getCachedDiscovery(domain: string): AggregatedDiscoveryResult | null {
  const entry = discoveryCache.get(domain);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    discoveryCache.delete(domain);
    discoveryLogger.debug('Cache expired', { domain });
    return null;
  }

  discoveryLogger.debug('Cache hit', { domain, cachedAt: entry.result.cachedAt });
  return entry.result;
}

/**
 * Cache a discovery result
 */
export function cacheDiscovery(
  domain: string,
  result: AggregatedDiscoveryResult,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): void {
  const entry: CacheEntry = {
    result: {
      ...result,
      cachedAt: Date.now(),
    },
    expiresAt: Date.now() + ttlMs,
  };
  discoveryCache.set(domain, entry);
  discoveryLogger.debug('Cached discovery result', { domain, expiresIn: ttlMs });
}

/**
 * Clear cache for a specific domain or all domains
 */
export function clearDiscoveryCache(domain?: string): void {
  if (domain) {
    discoveryCache.delete(domain);
    discoveryLogger.debug('Cleared cache for domain', { domain });
  } else {
    discoveryCache.clear();
    discoveryLogger.debug('Cleared all discovery cache');
  }
}

/**
 * Get cache statistics
 */
export function getDiscoveryCacheStats(): { size: number; domains: string[] } {
  return {
    size: discoveryCache.size,
    domains: [...discoveryCache.keys()],
  };
}

// ============================================
// DISCOVERY FUNCTIONS
// ============================================

/**
 * Discover OpenAPI documentation for a domain
 */
async function discoverOpenAPISource(
  domain: string,
  options: DiscoveryOptions
): Promise<DiscoveryResult> {
  const startTime = Date.now();

  try {
    const openApiOptions: OpenAPIDiscoveryOptions = {
      headers: options.headers,
      timeout: options.timeout || DEFAULT_SOURCE_TIMEOUT_MS,
    };

    const result = await discoverOpenAPICached(domain, openApiOptions);

    if (!result.found || !result.spec) {
      return {
        source: 'openapi',
        confidence: 0,
        patterns: [],
        metadata: {},
        discoveryTime: Date.now() - startTime,
        found: false,
        error: result.error,
      };
    }

    // Generate patterns from the spec
    const patterns = generatePatternsFromOpenAPISpec(result.spec);

    // Extract metadata
    const metadata: DiscoveryMetadata = {
      specVersion: result.spec.version,
      baseUrl: result.spec.baseUrl,
      title: result.spec.title,
      description: result.spec.description,
    };

    // Extract authentication info if available
    if (result.spec.securitySchemes) {
      metadata.authentication = Object.entries(result.spec.securitySchemes).map(
        ([name, scheme]) => {
          const auth: AuthInfo = {
            type: mapSecuritySchemeType(scheme),
            name: scheme.name || name,
            in: scheme.in as 'header' | 'query' | 'cookie' | undefined,
          };
          return auth;
        }
      );
    }

    discoveryLogger.info('OpenAPI discovery successful', {
      domain,
      specUrl: result.specUrl,
      endpoints: result.spec.endpoints.length,
      patterns: patterns.length,
    });

    return {
      source: 'openapi',
      confidence: SOURCE_CONFIDENCE.openapi,
      patterns,
      metadata,
      discoveryTime: Date.now() - startTime,
      found: true,
      rawData: { openapi: result.spec },
    };
  } catch (error) {
    discoveryLogger.error('OpenAPI discovery failed', { domain, error });
    return {
      source: 'openapi',
      confidence: 0,
      patterns: [],
      metadata: {},
      discoveryTime: Date.now() - startTime,
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Discover GraphQL API via introspection
 */
async function discoverGraphQLSource(
  domain: string,
  options: DiscoveryOptions
): Promise<DiscoveryResult> {
  const startTime = Date.now();

  try {
    const result = await discoverGraphQL(domain, {
      headers: options.headers,
      fetchFn: options.fetchFn,
    });

    if (!result.found) {
      return {
        source: 'graphql',
        confidence: 0,
        patterns: [],
        metadata: {},
        discoveryTime: Date.now() - startTime,
        found: false,
        error: result.error,
      };
    }

    if (result.introspectionDisabled) {
      return {
        source: 'graphql',
        confidence: 0,
        patterns: [],
        metadata: { baseUrl: result.endpoint },
        discoveryTime: Date.now() - startTime,
        found: true,
        error: 'GraphQL introspection is disabled',
      };
    }

    // Guard clause: endpoint should be defined at this point
    if (!result.endpoint) {
      return {
        source: 'graphql',
        confidence: 0,
        patterns: [],
        metadata: {},
        discoveryTime: Date.now() - startTime,
        found: false,
        error: 'GraphQL endpoint not found',
      };
    }

    // Store endpoint for use in closures (TypeScript narrowing doesn't work in callbacks)
    const endpoint = result.endpoint;

    // Convert GraphQL patterns to LearnedApiPattern format
    const patterns: LearnedApiPattern[] = (result.patterns || []).map(
      (gqlPattern) => convertGraphQLPattern(gqlPattern, domain, endpoint)
    );

    // Extract metadata
    const metadata: DiscoveryMetadata = {
      baseUrl: endpoint,
      title: `GraphQL API`,
      description: result.schema
        ? `GraphQL API with ${result.schema.entityTypes.length} entity types`
        : undefined,
    };

    discoveryLogger.info('GraphQL discovery successful', {
      domain,
      endpoint: result.endpoint,
      patterns: patterns.length,
      entityTypes: result.schema?.entityTypes.length,
    });

    return {
      source: 'graphql',
      confidence: SOURCE_CONFIDENCE.graphql,
      patterns,
      metadata,
      discoveryTime: Date.now() - startTime,
      found: true,
      rawData: { graphql: result },
    };
  } catch (error) {
    discoveryLogger.error('GraphQL discovery failed', { domain, error });
    return {
      source: 'graphql',
      confidence: 0,
      patterns: [],
      metadata: {},
      discoveryTime: Date.now() - startTime,
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Convert a GraphQL pattern to LearnedApiPattern format
 */
function convertGraphQLPattern(
  gqlPattern: GraphQLQueryPattern,
  domain: string,
  endpoint: string
): LearnedApiPattern {
  const now = Date.now();
  return {
    id: gqlPattern.id,
    templateType: 'query-api', // GraphQL uses query-api template type
    urlPatterns: [`^${escapeRegex(endpoint)}$`],
    endpointTemplate: endpoint,
    // GraphQL doesn't need URL extractors - all info is in the query
    extractors: [],
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    responseFormat: 'json',
    contentMapping: {
      // GraphQL responses are in data field
      title: 'data',
      body: 'data',
    },
    validation: {
      requiredFields: ['data'],
      minContentLength: 10, // GraphQL responses should have at least some data
    },
    metrics: {
      successCount: 1, // Introspection confirmed it works
      failureCount: 0,
      confidence: gqlPattern.confidence,
      lastSuccess: now,
      domains: [domain],
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map OpenAPI security scheme type to our AuthInfo type
 */
function mapSecuritySchemeType(scheme: { type: string; scheme?: string }): AuthInfo['type'] {
  switch (scheme.type) {
    case 'apiKey':
      return 'api_key';
    case 'http':
      // Check the scheme property to distinguish between basic and bearer
      if (scheme.scheme === 'basic') {
        return 'basic';
      }
      return 'bearer'; // Default for http
    case 'oauth2':
    case 'openIdConnect':
      return 'oauth2';
    default:
      return 'api_key';
  }
}

/**
 * Discover API links via RFC 8288 Link headers, HTML links, and HATEOAS
 */
async function discoverLinksSource(
  domain: string,
  options: DiscoveryOptions
): Promise<DiscoveryResult> {
  const startTime = Date.now();

  try {
    // Try to discover links from the domain root
    const url = `https://${domain}`;
    const result = await discoverLinks(url, {
      headers: options.headers,
      fetchFn: options.fetchFn,
      timeout: options.timeout || DEFAULT_SOURCE_TIMEOUT_MS,
    });

    if (!result.found || result.links.length === 0) {
      return {
        source: 'links',
        confidence: 0,
        patterns: [],
        metadata: {},
        discoveryTime: Date.now() - startTime,
        found: false,
        error: result.error,
      };
    }

    // Generate patterns from discovered links
    const patterns = generatePatternsFromLinks(result.apiLinks, domain);

    // Extract metadata from documentation links
    const metadata: DiscoveryMetadata = {};

    // If we found documentation links, note the base URL
    if (result.documentationLinks.length > 0) {
      // First documentation link is likely the API docs
      const firstDoc = result.documentationLinks[0];
      metadata.description = `API documentation available at ${firstDoc.href}`;
    }

    // If we detected a hypermedia format, note it
    if (result.hypermediaFormat) {
      metadata.title = `${result.hypermediaFormat.toUpperCase()} API`;
    }

    discoveryLogger.info('Link discovery successful', {
      domain,
      totalLinks: result.links.length,
      apiLinks: result.apiLinks.length,
      documentationLinks: result.documentationLinks.length,
      patterns: patterns.length,
      hypermediaFormat: result.hypermediaFormat,
    });

    return {
      source: 'links',
      confidence: SOURCE_CONFIDENCE.links,
      patterns,
      metadata,
      discoveryTime: Date.now() - startTime,
      found: true,
      rawData: { links: result },
    };
  } catch (error) {
    discoveryLogger.error('Link discovery failed', { domain, error });
    return {
      source: 'links',
      confidence: 0,
      patterns: [],
      metadata: {},
      discoveryTime: Date.now() - startTime,
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// ORCHESTRATION
// ============================================

/**
 * Run all discovery sources in parallel and aggregate results
 */
export async function discoverApiDocumentation(
  domain: string,
  options: DiscoveryOptions = {}
): Promise<AggregatedDiscoveryResult> {
  const startTime = Date.now();

  // Check cache first (unless forceRefresh)
  if (!options.forceRefresh) {
    const cached = getCachedDiscovery(domain);
    if (cached) {
      return cached;
    }
  }

  discoveryLogger.info('Starting API documentation discovery', { domain });

  // Build list of sources to try
  const skipSources = new Set(options.skipSources || []);
  const sources: Array<{
    name: DiscoverySource;
    discover: () => Promise<DiscoveryResult>;
  }> = [];

  if (!skipSources.has('openapi')) {
    sources.push({
      name: 'openapi',
      discover: () => discoverOpenAPISource(domain, options),
    });
  }

  if (!skipSources.has('graphql')) {
    sources.push({
      name: 'graphql',
      discover: () => discoverGraphQLSource(domain, options),
    });
  }

  if (!skipSources.has('links')) {
    sources.push({
      name: 'links',
      discover: () => discoverLinksSource(domain, options),
    });
  }

  // Future: Add more discovery sources here
  // if (!skipSources.has('asyncapi')) {
  //   sources.push({ name: 'asyncapi', discover: () => discoverAsyncAPISource(domain, options) });
  // }

  // Run all discoveries in parallel, tracking timing for each
  const timedSources = sources.map((s) => {
    const sourceStartTime = Date.now();
    return {
      name: s.name,
      startTime: sourceStartTime,
      promise: s.discover(),
    };
  });

  const settledResults = await Promise.allSettled(
    timedSources.map((s) => s.promise)
  );

  // Process results
  const results: DiscoveryResult[] = [];
  for (let i = 0; i < settledResults.length; i++) {
    const settled = settledResults[i];
    if (settled.status === 'fulfilled') {
      results.push(settled.value);
    } else {
      // Handle rejected promise with accurate timing
      results.push({
        source: timedSources[i].name,
        confidence: 0,
        patterns: [],
        metadata: {},
        discoveryTime: Date.now() - timedSources[i].startTime,
        found: false,
        error: settled.reason?.message || 'Unknown error',
      });
    }
  }

  // Sort by priority and confidence
  results.sort((a, b) => {
    // First by priority
    const priorityDiff = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
    if (priorityDiff !== 0) return priorityDiff;
    // Then by confidence
    return b.confidence - a.confidence;
  });

  // Merge patterns (deduplicate by ID)
  const patternMap = new Map<string, LearnedApiPattern>();
  for (const result of results) {
    for (const pattern of result.patterns) {
      if (!patternMap.has(pattern.id)) {
        patternMap.set(pattern.id, pattern);
      }
    }
  }
  const allPatterns = [...patternMap.values()];

  // Get best metadata (from first result with found=true)
  const bestResult = results.find((r) => r.found);
  const metadata = bestResult?.metadata || {};

  const aggregated: AggregatedDiscoveryResult = {
    domain,
    results,
    allPatterns,
    metadata,
    totalTime: Date.now() - startTime,
    found: results.some((r) => r.found),
  };

  discoveryLogger.info('API documentation discovery complete', {
    domain,
    sources: results.length,
    found: aggregated.found,
    patterns: allPatterns.length,
    time: aggregated.totalTime,
  });

  // Cache the result
  if (aggregated.found) {
    cacheDiscovery(domain, aggregated);
  }

  return aggregated;
}

/**
 * Quick check if a domain has any documented API
 * Returns cached result if available, otherwise runs discovery
 */
export async function hasDocumentedApi(
  domain: string,
  options: DiscoveryOptions = {}
): Promise<boolean> {
  const result = await discoverApiDocumentation(domain, options);
  return result.found;
}

/**
 * Get all patterns for a domain from documented sources
 */
export async function getDocumentedPatterns(
  domain: string,
  options: DiscoveryOptions = {}
): Promise<LearnedApiPattern[]> {
  const result = await discoverApiDocumentation(domain, options);
  return result.allPatterns;
}

/**
 * Get discovery results for a specific source
 */
export async function getDiscoveryBySource(
  domain: string,
  source: DiscoverySource,
  options: DiscoveryOptions = {}
): Promise<DiscoveryResult | null> {
  const result = await discoverApiDocumentation(domain, options);
  return result.results.find((r) => r.source === source) || null;
}

// ============================================
// EXPORTS
// ============================================

export {
  discoverOpenAPISource,
  discoverGraphQLSource,
  discoverLinksSource,
  convertGraphQLPattern,
};

// Re-export link discovery types for convenience
export type {
  LinkDiscoveryResult,
  DiscoveredLink,
} from './link-discovery.js';
