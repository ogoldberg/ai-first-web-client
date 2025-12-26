/**
 * API Discovery Orchestrator (FUZZ-001)
 *
 * Coordinates multiple API discovery strategies:
 * 1. Fuzzing-based discovery - Probe common API endpoint patterns
 * 2. OpenAPI spec discovery - Find and parse OpenAPI/Swagger specs
 * 3. AsyncAPI spec discovery - Find and parse AsyncAPI specs
 *
 * This module complements the existing pattern learning by proactively
 * discovering API endpoints before they're accessed organically.
 */

import { logger } from '../utils/logger.js';
import type { LearnedApiPattern } from '../types/index.js';
import type { LearningEngine } from './learning-engine.js';

const discoveryLogger = logger.create('ApiDiscoveryOrchestrator');

/**
 * Common API path patterns to test during fuzzing
 */
const COMMON_API_PATHS = [
  // Standard REST API versioned paths
  '/api',
  '/api/v1',
  '/api/v2',
  '/api/v3',
  '/v1',
  '/v2',
  '/v3',

  // GraphQL endpoints
  '/graphql',
  '/api/graphql',
  '/v1/graphql',

  // REST alternatives
  '/rest',
  '/rest/v1',
  '/api/rest',

  // Common service paths
  '/service',
  '/services',
  '/data',
  '/public',

  // Well-known endpoints
  '/.well-known/api',
  '/.well-known/endpoints',

  // Documentation paths (might reveal API structure)
  '/api-docs',
  '/docs/api',
  '/documentation/api',
] as const;

/**
 * HTTP methods to test for each discovered path
 */
const TEST_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

/**
 * Result of probing a single API path
 */
export interface ProbeResult {
  url: string;
  path: string;
  method: string;
  statusCode: number;
  success: boolean;
  responseTime: number;
  contentType?: string;
  error?: string;
}

/**
 * Result of fuzzing discovery for a domain
 */
export interface FuzzingDiscoveryResult {
  domain: string;
  baseUrl: string;
  discoveredEndpoints: ProbeResult[];
  successfulEndpoints: ProbeResult[];
  failedProbes: number;
  totalProbes: number;
  duration: number;
  patternsLearned: number;
}

/**
 * Options for fuzzing-based discovery
 */
export interface FuzzingDiscoveryOptions {
  /** Paths to probe (defaults to COMMON_API_PATHS) */
  paths?: readonly string[];
  /** HTTP methods to test (defaults to TEST_METHODS) */
  methods?: readonly string[];
  /** Timeout per probe in ms (default: 3000) */
  probeTimeout?: number;
  /** Maximum total discovery time in ms (default: 30000) */
  maxDuration?: number;
  /** Whether to learn patterns from discoveries (default: true) */
  learnPatterns?: boolean;
  /** Custom headers for probes */
  headers?: Record<string, string>;
  /** Status codes considered successful (default: [200, 201, 301, 302, 307, 308]) */
  successCodes?: number[];
}

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(
  url: string,
  options: { timeout: number; method?: string; headers?: Record<string, string> }
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'LLM-Browser-MCP/1.0 (API Discovery)',
        ...options.headers,
      },
      signal: controller.signal,
      redirect: 'manual', // Don't follow redirects automatically
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * API Discovery Orchestrator
 *
 * Coordinates multiple discovery strategies to find API endpoints
 */
export class ApiDiscoveryOrchestrator {
  private learningEngine?: LearningEngine;

  constructor(learningEngine?: LearningEngine) {
    this.learningEngine = learningEngine;
  }

  /**
   * Discover API endpoints via fuzzing (FUZZ-001)
   *
   * Probes common API path patterns to discover endpoints before organic access.
   * This complements existing pattern learning by proactively finding APIs.
   *
   * @param baseUrl - Base URL of the domain (e.g., "https://example.com")
   * @param options - Discovery options
   * @returns Discovery results with successful endpoints and learned patterns
   */
  async discoverViaFuzzing(
    baseUrl: string,
    options: FuzzingDiscoveryOptions = {}
  ): Promise<FuzzingDiscoveryResult> {
    const startTime = Date.now();

    // Parse base URL
    const parsed = new URL(baseUrl);
    const domain = parsed.hostname;
    const origin = parsed.origin;

    // Options with defaults
    const paths = options.paths ?? COMMON_API_PATHS;
    const methods = options.methods ?? ['GET']; // Default to GET only for safety
    const probeTimeout = options.probeTimeout ?? 3000;
    const maxDuration = options.maxDuration ?? 30000;
    const learnPatterns = options.learnPatterns ?? true;
    const successCodes = options.successCodes ?? [200, 201, 301, 302, 307, 308];

    discoveryLogger.info('Starting fuzzing-based API discovery', {
      domain,
      paths: paths.length,
      methods: methods.length,
    });

    const discoveredEndpoints: ProbeResult[] = [];
    let failedProbes = 0;
    let totalProbes = 0;

    // Probe each path with each method
    for (const path of paths) {
      // Check timeout
      if (Date.now() - startTime > maxDuration) {
        discoveryLogger.debug('Discovery timeout reached', { domain, probed: totalProbes });
        break;
      }

      for (const method of methods) {
        totalProbes++;
        const url = `${origin}${path}`;

        try {
          const probeStart = Date.now();
          const response = await fetchWithTimeout(url, {
            timeout: probeTimeout,
            method,
            headers: options.headers,
          });
          const responseTime = Date.now() - probeStart;

          const statusCode = response.status;
          const success = successCodes.includes(statusCode);
          const contentType = response.headers.get('content-type') || undefined;

          const result: ProbeResult = {
            url,
            path,
            method,
            statusCode,
            success,
            responseTime,
            contentType,
          };

          if (success) {
            discoveredEndpoints.push(result);
            discoveryLogger.debug('Discovered endpoint', {
              path,
              method,
              statusCode,
              contentType,
            });
          } else {
            failedProbes++;
          }
        } catch (error: unknown) {
          failedProbes++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          discoveryLogger.debug('Probe failed', { path, method, error: errorMessage });
        }
      }
    }

    // Learn patterns from discoveries
    let patternsLearned = 0;
    if (learnPatterns && this.learningEngine && discoveredEndpoints.length > 0) {
      patternsLearned = await this.learnFromDiscoveries(domain, discoveredEndpoints);
    }

    const duration = Date.now() - startTime;
    const successfulEndpoints = discoveredEndpoints.filter(e => e.success);

    discoveryLogger.info('Fuzzing discovery completed', {
      domain,
      discovered: successfulEndpoints.length,
      failed: failedProbes,
      total: totalProbes,
      patternsLearned,
      duration,
    });

    return {
      domain,
      baseUrl: origin,
      discoveredEndpoints,
      successfulEndpoints,
      failedProbes,
      totalProbes,
      duration,
      patternsLearned,
    };
  }

  /**
   * Learn API patterns from fuzzing discoveries
   *
   * @param domain - Domain where endpoints were discovered
   * @param discoveries - Successful probe results
   * @returns Number of patterns learned
   */
  private async learnFromDiscoveries(
    domain: string,
    discoveries: ProbeResult[]
  ): Promise<number> {
    if (!this.learningEngine) {
      return 0;
    }

    let learned = 0;

    for (const discovery of discoveries) {
      // Only learn from truly successful responses (200-299 range)
      if (discovery.statusCode < 200 || discovery.statusCode >= 400) {
        continue;
      }

      try {
        // Create a learned pattern from the discovery
        const pattern: LearnedApiPattern = {
          endpoint: discovery.url,
          method: discovery.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
          successCount: 1,
          failureCount: 0,
          lastUsed: Date.now(),
          avgResponseTime: discovery.responseTime,
          reliability: 0.8, // Start with moderate reliability until verified
          dataFields: [], // Would need to inspect response to determine fields
          requiresAuth: discovery.statusCode === 401 || discovery.statusCode === 403,
          rateLimit: null, // Would need to inspect headers
        };

        // Learn the pattern with fuzzing source
        await this.learningEngine.learnApiPattern(domain, pattern, {
          source: 'fuzzing',
          sourceUrl: discovery.url,
        });

        learned++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        discoveryLogger.warn('Failed to learn pattern from discovery', {
          url: discovery.url,
          error: errorMessage,
        });
      }
    }

    return learned;
  }

  /**
   * Comprehensive API discovery using all available strategies
   *
   * Combines:
   * - Fuzzing-based discovery (this module)
   * - OpenAPI spec discovery (existing)
   * - AsyncAPI spec discovery (existing)
   *
   * @param baseUrl - Base URL of the domain
   * @param options - Discovery options
   * @returns Combined discovery results
   */
  async discoverAll(
    baseUrl: string,
    options: FuzzingDiscoveryOptions = {}
  ): Promise<FuzzingDiscoveryResult> {
    // For now, just do fuzzing discovery
    // In the future, could integrate with openapi-discovery.ts and asyncapi-discovery.ts
    return this.discoverViaFuzzing(baseUrl, options);
  }
}
