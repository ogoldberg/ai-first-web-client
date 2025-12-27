/**
 * Pagination API Discovery (GAP-005)
 *
 * Learns pagination API patterns from network requests during browsing:
 * 1. Monitors network traffic when pagination occurs (page change, load more)
 * 2. Detects API endpoints that return paginated data
 * 3. Learns parameter patterns (page, offset, cursor, limit)
 * 4. Enables direct API calls for subsequent pages (bypasses rendering)
 *
 * Expected result: 10-100x speedup for multi-page scraping
 */

import { logger } from '../utils/logger.js';
import type { NetworkRequest, PaginationPattern } from '../types/index.js';
import {
  getPaginationPreset,
  type PaginationPresetConfig,
} from '../utils/domain-presets.js';

const paginationLogger = logger.create('PaginationDiscovery');

// ============================================
// TYPES
// ============================================

/**
 * Discovered pagination API pattern
 */
export interface PaginationApiPattern {
  /** Unique identifier */
  id: string;
  /** Domain this pattern applies to */
  domain: string;
  /** Base URL for the pagination API (without pagination params) */
  baseUrl: string;
  /** The parameter used for pagination */
  paginationParam: PaginationParam;
  /** HTTP method for the API call */
  method: 'GET' | 'POST';
  /** Required headers for the API call */
  headers: Record<string, string>;
  /** Response structure information */
  responseStructure: PaginationResponseStructure;
  /** Metrics tracking pattern usage */
  metrics: PaginationPatternMetrics;
  /** When pattern was discovered */
  discoveredAt: number;
  /** When pattern was last successfully used */
  lastUsedAt: number;
  /** Whether this pattern is validated and ready for use */
  isValidated: boolean;
}

/**
 * Pagination parameter configuration
 */
export interface PaginationParam {
  /** Parameter name (page, offset, cursor, after, etc.) */
  name: string;
  /** Parameter type */
  type: 'page' | 'offset' | 'cursor' | 'token';
  /** Starting value for first page */
  startValue: number | string;
  /** Increment for page/offset types */
  increment?: number;
  /** Location of parameter */
  location: 'query' | 'path' | 'body';
  /** For cursor/token: path to next cursor in response */
  nextValuePath?: string;
}

/**
 * Response structure for pagination API
 */
export interface PaginationResponseStructure {
  /** Path to data array in response */
  dataPath: string;
  /** Path to total count (optional) */
  totalCountPath?: string;
  /** Path to has-more indicator (optional) */
  hasMorePath?: string;
  /** Path to next page token/cursor (optional) */
  nextCursorPath?: string;
  /** Number of items typically returned per page */
  itemsPerPage: number;
}

/**
 * Metrics for pagination pattern usage
 */
export interface PaginationPatternMetrics {
  /** Times pattern was used */
  timesUsed: number;
  /** Successful usages */
  successCount: number;
  /** Failed usages */
  failureCount: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Total items fetched via this pattern */
  totalItemsFetched: number;
  /** Time saved by using API vs rendering (ms) */
  timeSaved: number;
}

/**
 * Result from pagination analysis
 */
export interface PaginationAnalysisResult {
  /** Whether pagination API was detected */
  detected: boolean;
  /** Detected pattern (if any) */
  pattern?: PaginationApiPattern;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Reasons for detection/non-detection */
  reasons: string[];
}

/**
 * Context for pagination detection
 */
export interface PaginationContext {
  /** Original page URL */
  originalUrl: string;
  /** URLs accessed during pagination */
  pageUrls: string[];
  /** Network requests during pagination */
  networkRequests: NetworkRequest[];
  /** UI pagination pattern detected (if any) */
  uiPattern?: PaginationPattern;
}

// ============================================
// CONSTANTS
// ============================================

/** Common pagination parameter names */
const PAGINATION_PARAMS = [
  'page', 'p', 'pg',
  'offset', 'start', 'skip',
  'cursor', 'after', 'before',
  'limit', 'size', 'per_page', 'pageSize',
  'nextToken', 'continuation', 'token',
];

/** API content types */
const API_CONTENT_TYPES = [
  'application/json',
  'application/ld+json',
  'application/hal+json',
  'application/vnd.api+json',
];

/** Minimum confidence to consider a pattern valid */
const MIN_CONFIDENCE = 0.6;

/** Paths to check for data arrays in response */
const DATA_PATHS = [
  'data', 'results', 'items', 'records',
  'entries', 'content', 'list', 'rows',
  'hits', 'documents', 'objects',
];

/** Paths to check for has-more indicator */
const HAS_MORE_PATHS = [
  'hasMore', 'has_more', 'hasNextPage', 'has_next_page',
  'more', 'next', 'nextPage', 'moreResults',
];

/** Paths to check for total count */
const TOTAL_COUNT_PATHS = [
  'total', 'totalCount', 'total_count', 'count',
  'totalResults', 'total_results', 'totalItems', 'total_items',
  'meta.total', 'pagination.total', 'page.totalElements',
];

/** Paths to check for next cursor */
const NEXT_CURSOR_PATHS = [
  'nextCursor', 'next_cursor', 'cursor', 'nextToken',
  'next_token', 'continuationToken', 'pageInfo.endCursor',
];

// ============================================
// MAIN CLASS
// ============================================

export class PaginationDiscovery {
  private patterns: Map<string, PaginationApiPattern> = new Map();
  private patternsByDomain: Map<string, string[]> = new Map();
  private presetPatterns: Map<string, PaginationApiPattern> = new Map();

  /**
   * Analyze network requests to discover pagination API patterns
   * First checks for domain presets, then falls back to discovery
   */
  async analyze(context: PaginationContext): Promise<PaginationAnalysisResult> {
    paginationLogger.info('Analyzing for pagination API patterns', {
      originalUrl: context.originalUrl,
      networkRequestCount: context.networkRequests.length,
      pageUrlCount: context.pageUrls.length,
    });

    const reasons: string[] = [];

    // INT-005: Check for preset first
    const presetResult = this.tryPreset(context.originalUrl);
    if (presetResult.detected && presetResult.pattern) {
      reasons.push(`Using preset pagination for ${presetResult.pattern.domain}`);
      return {
        detected: true,
        pattern: presetResult.pattern,
        confidence: presetResult.confidence,
        reasons,
      };
    }

    // Filter to JSON API requests only
    const apiRequests = context.networkRequests.filter(req =>
      this.isApiRequest(req)
    );

    if (apiRequests.length === 0) {
      reasons.push('No JSON API requests found during pagination');
      return { detected: false, confidence: 0, reasons };
    }

    paginationLogger.debug('Found API requests', { count: apiRequests.length });

    // Find requests that look like pagination calls
    const paginationCandidates = this.findPaginationCandidates(apiRequests);

    if (paginationCandidates.length === 0) {
      reasons.push('No requests with pagination parameters found');
      return { detected: false, confidence: 0, reasons };
    }

    // Analyze the best candidate
    const analysis = this.analyzePaginationCandidate(paginationCandidates[0], context);

    if (!analysis.pattern) {
      reasons.push(...analysis.reasons);
      return { detected: false, confidence: analysis.confidence, reasons };
    }

    // Store the pattern
    this.storePattern(analysis.pattern);

    reasons.push(`Detected ${analysis.pattern.paginationParam.type} pagination via ${analysis.pattern.paginationParam.name} parameter`);

    return {
      detected: true,
      pattern: analysis.pattern,
      confidence: analysis.confidence,
      reasons,
    };
  }

  /**
   * Check if a network request is a JSON API request
   */
  private isApiRequest(req: NetworkRequest): boolean {
    // Must be successful
    if (req.status < 200 || req.status >= 300) {
      return false;
    }

    // Must be JSON content type
    const contentType = req.contentType?.toLowerCase() || '';
    const isJson = API_CONTENT_TYPES.some(type => contentType.includes(type));

    if (!isJson) {
      return false;
    }

    // Must be a GET or POST request
    if (!['GET', 'POST'].includes(req.method)) {
      return false;
    }

    return true;
  }

  /**
   * Find requests that look like pagination API calls
   */
  private findPaginationCandidates(requests: NetworkRequest[]): NetworkRequest[] {
    const candidates: Array<{ request: NetworkRequest; score: number }> = [];

    for (const req of requests) {
      let score = 0;

      try {
        const url = new URL(req.url);

        // Check for pagination query parameters
        for (const param of PAGINATION_PARAMS) {
          if (url.searchParams.has(param)) {
            score += 3;
            break;
          }
        }

        // Check for /api/ or similar path
        if (/\/api\//i.test(url.pathname) || /\/v\d+\//i.test(url.pathname)) {
          score += 2;
        }

        // Check response for array data
        if (req.responseBody) {
          const hasArray = this.hasArrayData(req.responseBody);
          if (hasArray) {
            score += 3;
          }
        }

        // Boost score if response has pagination metadata
        if (req.responseBody && this.hasPaginationMetadata(req.responseBody)) {
          score += 2;
        }

        if (score > 0) {
          candidates.push({ request: req, score });
        }
      } catch (error) {
        paginationLogger.debug('Skipping candidate due to invalid URL', { url: req.url, error });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates.map(c => c.request);
  }

  /**
   * Check if response body contains array data
   */
  private hasArrayData(body: any): boolean {
    const data = this.parseResponseBody(body);
    if (!data) return false;

    // Check if root is an array
    if (Array.isArray(data)) return true;

    // Check common data paths
    for (const path of DATA_PATHS) {
      const value = this.getValueByPath(data, path);
      if (Array.isArray(value) && value.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if response has pagination metadata
   */
  private hasPaginationMetadata(body: any): boolean {
    const data = this.parseResponseBody(body);
    if (!data || typeof data !== 'object') return false;

    // Check for has-more indicators
    for (const path of HAS_MORE_PATHS) {
      if (this.getValueByPath(data, path) !== undefined) {
        return true;
      }
    }

    // Check for total count
    for (const path of TOTAL_COUNT_PATHS) {
      if (this.getValueByPath(data, path) !== undefined) {
        return true;
      }
    }

    // Check for next cursor
    for (const path of NEXT_CURSOR_PATHS) {
      if (this.getValueByPath(data, path) !== undefined) {
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze a pagination candidate request
   */
  private analyzePaginationCandidate(
    request: NetworkRequest,
    context: PaginationContext
  ): { pattern?: PaginationApiPattern; confidence: number; reasons: string[] } {
    const reasons: string[] = [];
    let confidence = 0;

    try {
      const url = new URL(request.url);
      const domain = url.hostname;

      // Detect pagination parameter
      const paginationParam = this.detectPaginationParam(url);
      if (!paginationParam) {
        reasons.push('Could not identify pagination parameter');
        return { confidence: 0.2, reasons };
      }

      confidence += 0.3;

      // Analyze response structure
      const responseStructure = this.analyzeResponseStructure(request.responseBody);
      if (!responseStructure) {
        reasons.push('Could not determine response structure');
        return { confidence: 0.3, reasons };
      }

      confidence += 0.3;

      // Build base URL (without pagination param)
      const baseUrl = this.buildBaseUrl(url, paginationParam);

      // Extract required headers
      const headers = this.extractRelevantHeaders(request.requestHeaders);

      confidence += 0.2;

      // Validate the pattern makes sense
      if (responseStructure.itemsPerPage > 0) {
        confidence += 0.2;
      }

      const pattern: PaginationApiPattern = {
        id: this.generatePatternId(),
        domain,
        baseUrl,
        paginationParam,
        method: request.method as 'GET' | 'POST',
        headers,
        responseStructure,
        metrics: this.createEmptyMetrics(),
        discoveredAt: Date.now(),
        lastUsedAt: Date.now(),
        isValidated: confidence >= MIN_CONFIDENCE,
      };

      return { pattern, confidence, reasons };
    } catch (error) {
      paginationLogger.debug('Error analyzing pagination candidate', { error, url: request.url });
      reasons.push(`Analysis error: ${error instanceof Error ? error.message : 'unknown'}`);
      return { confidence: 0, reasons };
    }
  }

  /**
   * Detect pagination parameter from URL
   */
  private detectPaginationParam(url: URL): PaginationParam | null {
    // Check query parameters
    for (const param of PAGINATION_PARAMS) {
      if (url.searchParams.has(param)) {
        const value = url.searchParams.get(param) || '';
        return {
          name: param,
          type: this.inferParamType(param, value),
          startValue: this.inferStartValue(param, value),
          increment: this.inferIncrement(param),
          location: 'query',
        };
      }
    }

    // Check path segments for page numbers
    const pathParts = url.pathname.split('/').filter(Boolean);
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (/^(page|p)$/i.test(pathParts[i - 1] || '') && /^\d+$/.test(part)) {
        return {
          name: 'page',
          type: 'page',
          startValue: 1,
          increment: 1,
          location: 'path',
        };
      }
    }

    return null;
  }

  /**
   * Infer pagination parameter type
   */
  private inferParamType(param: string, value: string): 'page' | 'offset' | 'cursor' | 'token' {
    const lowerParam = param.toLowerCase();

    if (['page', 'p', 'pg'].includes(lowerParam)) {
      return 'page';
    }

    if (['offset', 'start', 'skip'].includes(lowerParam)) {
      return 'offset';
    }

    if (['cursor', 'after', 'before'].includes(lowerParam)) {
      return 'cursor';
    }

    if (['nexttoken', 'token', 'continuation'].includes(lowerParam)) {
      return 'token';
    }

    // Try to infer from value
    if (/^\d+$/.test(value)) {
      const num = parseInt(value, 10);
      if (num <= 10) return 'page';
      return 'offset';
    }

    return 'cursor';
  }

  /**
   * Infer start value for pagination
   */
  private inferStartValue(param: string, _value: string): number | string {
    const lowerParam = param.toLowerCase();

    if (['page', 'p', 'pg'].includes(lowerParam)) {
      return 1;
    }

    if (['offset', 'start', 'skip'].includes(lowerParam)) {
      return 0;
    }

    return '';
  }

  /**
   * Infer increment for pagination
   */
  private inferIncrement(param: string): number | undefined {
    const lowerParam = param.toLowerCase();

    if (['page', 'p', 'pg'].includes(lowerParam)) {
      return 1;
    }

    // For offset-based, we don't know the increment without more context
    return undefined;
  }

  /**
   * Analyze response structure to understand pagination data
   */
  private analyzeResponseStructure(body: any): PaginationResponseStructure | null {
    const data = this.parseResponseBody(body);
    if (!data) return null;

    // Find data array path
    let dataPath = '';
    let itemsPerPage = 0;

    if (Array.isArray(data)) {
      dataPath = '';
      itemsPerPage = data.length;
    } else {
      for (const path of DATA_PATHS) {
        const value = this.getValueByPath(data, path);
        if (Array.isArray(value) && value.length > 0) {
          dataPath = path;
          itemsPerPage = value.length;
          break;
        }
      }
    }

    if (!dataPath && itemsPerPage === 0) {
      return null;
    }

    // Find total count path
    let totalCountPath: string | undefined;
    for (const path of TOTAL_COUNT_PATHS) {
      const value = this.getValueByPath(data, path);
      if (typeof value === 'number') {
        totalCountPath = path;
        break;
      }
    }

    // Find has-more path
    let hasMorePath: string | undefined;
    for (const path of HAS_MORE_PATHS) {
      const value = this.getValueByPath(data, path);
      if (typeof value === 'boolean') {
        hasMorePath = path;
        break;
      }
    }

    // Find next cursor path
    let nextCursorPath: string | undefined;
    for (const path of NEXT_CURSOR_PATHS) {
      const value = this.getValueByPath(data, path);
      if (value !== undefined && value !== null) {
        nextCursorPath = path;
        break;
      }
    }

    return {
      dataPath,
      totalCountPath,
      hasMorePath,
      nextCursorPath,
      itemsPerPage,
    };
  }

  /**
   * Build base URL without pagination parameter
   */
  private buildBaseUrl(url: URL, paginationParam: PaginationParam): string {
    if (paginationParam.location === 'query') {
      const base = new URL(url.toString());
      base.searchParams.delete(paginationParam.name);
      return base.toString();
    } else if (paginationParam.location === 'path') {
      // Find the numeric page value in the path and replace it with a placeholder
      const pathParts = url.pathname.split('/');
      // Find the last numeric segment (search backwards for ES2022 compatibility)
      let pageIndex = -1;
      for (let i = pathParts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(pathParts[i])) {
          pageIndex = i;
          break;
        }
      }
      if (pageIndex > -1) {
        pathParts[pageIndex] = '{page}';
        // Build URL string manually to avoid encoding of placeholder
        const newPathname = pathParts.join('/');
        return `${url.origin}${newPathname}${url.search}`;
      }
    }
    return url.toString();
  }

  /**
   * Extract relevant headers for API calls
   */
  private extractRelevantHeaders(headers: Record<string, string>): Record<string, string> {
    const relevant: Record<string, string> = {};
    const importantHeaders = new Set(['authorization', 'x-api-key', 'cookie', 'accept']);

    for (const [key, value] of Object.entries(headers)) {
      if (importantHeaders.has(key.toLowerCase())) {
        relevant[key] = value;
      }
    }

    return relevant;
  }

  /**
   * Parse response body if it's a string
   */
  private parseResponseBody(body: any): any {
    if (!body) return null;

    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    }

    return body;
  }

  /**
   * Get value by dot-notation path
   */
  private getValueByPath(obj: any, path: string): any {
    if (!path) return obj;

    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * Generate unique pattern ID
   */
  private generatePatternId(): string {
    return `pag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): PaginationPatternMetrics {
    return {
      timesUsed: 0,
      successCount: 0,
      failureCount: 0,
      avgResponseTime: 0,
      totalItemsFetched: 0,
      timeSaved: 0,
    };
  }

  /**
   * Store a discovered pattern
   */
  private storePattern(pattern: PaginationApiPattern): void {
    this.patterns.set(pattern.id, pattern);

    const domainPatterns = this.patternsByDomain.get(pattern.domain) || [];
    domainPatterns.push(pattern.id);
    this.patternsByDomain.set(pattern.domain, domainPatterns);

    paginationLogger.info('Stored pagination pattern', {
      patternId: pattern.id,
      domain: pattern.domain,
      paramName: pattern.paginationParam.name,
      paramType: pattern.paginationParam.type,
    });
  }

  // ============================================
  // PATTERN RETRIEVAL
  // ============================================

  /**
   * Get pattern by ID
   */
  getPattern(id: string): PaginationApiPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get patterns for a domain
   */
  getPatternsForDomain(domain: string): PaginationApiPattern[] {
    const ids = this.patternsByDomain.get(domain) || [];
    return ids
      .map(id => this.patterns.get(id))
      .filter((p): p is PaginationApiPattern => p !== undefined);
  }

  /**
   * Find matching pattern for a URL
   */
  findMatchingPattern(url: string): PaginationApiPattern | null {
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname;

      const patterns = this.getPatternsForDomain(domain);
      if (patterns.length === 0) {
        return null;
      }

      // Find pattern with matching base URL structure
      for (const pattern of patterns) {
        if (this.urlMatchesPattern(parsed, pattern)) {
          return pattern;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if URL matches a pattern
   */
  private urlMatchesPattern(url: URL, pattern: PaginationApiPattern): boolean {
    try {
      const patternUrl = new URL(pattern.baseUrl);

      // Compare path structure (ignoring pagination param)
      const urlPath = url.pathname.replace(/\/\d+\/?$/, '');
      const patternPath = patternUrl.pathname.replace(/\/\d+\/?$/, '');

      return urlPath === patternPath;
    } catch {
      return false;
    }
  }

  // ============================================
  // USAGE TRACKING
  // ============================================

  /**
   * Record pattern usage result
   */
  recordUsage(
    patternId: string,
    success: boolean,
    responseTime: number,
    itemsFetched: number,
    timeSaved: number
  ): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    pattern.metrics.timesUsed++;
    pattern.lastUsedAt = Date.now();

    if (success) {
      pattern.metrics.successCount++;
      pattern.metrics.avgResponseTime = this.updateRunningAverage(
        pattern.metrics.avgResponseTime,
        responseTime,
        pattern.metrics.successCount
      );
      pattern.metrics.totalItemsFetched += itemsFetched;
      pattern.metrics.timeSaved += timeSaved;
    } else {
      pattern.metrics.failureCount++;
    }

    // Validate pattern after successful usage
    if (success && !pattern.isValidated && pattern.metrics.successCount >= 3) {
      pattern.isValidated = true;
      paginationLogger.info('Pattern validated after successful usage', {
        patternId: pattern.id,
        successCount: pattern.metrics.successCount,
      });
    }

    paginationLogger.debug('Recorded pattern usage', {
      patternId,
      success,
      responseTime,
      itemsFetched,
    });
  }

  /**
   * Update running average
   */
  private updateRunningAverage(currentAvg: number, newValue: number, count: number): number {
    if (count <= 1) return newValue;
    return currentAvg + (newValue - currentAvg) / count;
  }

  // ============================================
  // PAGINATION URL GENERATION
  // ============================================

  /**
   * Generate URL for a specific page using a pattern
   */
  generatePageUrl(pattern: PaginationApiPattern, pageValue: number | string): string {
    if (pattern.paginationParam.location === 'query') {
      const url = new URL(pattern.baseUrl);
      url.searchParams.set(pattern.paginationParam.name, String(pageValue));
      return url.toString();
    }

    if (pattern.paginationParam.location === 'path') {
      // Replace {page} placeholder in baseUrl
      return pattern.baseUrl.replace('{page}', String(pageValue));
    }

    return pattern.baseUrl;
  }

  /**
   * Get the next page value based on current value and pattern
   */
  getNextPageValue(pattern: PaginationApiPattern, currentValue: number | string): number | string {
    if (pattern.paginationParam.type === 'page' || pattern.paginationParam.type === 'offset') {
      const current = typeof currentValue === 'string' ? parseInt(currentValue, 10) : currentValue;
      const increment = pattern.paginationParam.increment || 1;
      return current + increment;
    }

    // For cursor/token types, the next value must come from the response
    return currentValue;
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get discovery statistics
   */
  getStatistics(): {
    totalPatterns: number;
    validatedPatterns: number;
    byDomain: Record<string, number>;
    totalTimeSaved: number;
    totalItemsFetched: number;
  } {
    const patterns = [...this.patterns.values()];
    const byDomain: Record<string, number> = {};
    let totalTimeSaved = 0;
    let totalItemsFetched = 0;

    for (const pattern of patterns) {
      byDomain[pattern.domain] = (byDomain[pattern.domain] || 0) + 1;
      totalTimeSaved += pattern.metrics.timeSaved;
      totalItemsFetched += pattern.metrics.totalItemsFetched;
    }

    return {
      totalPatterns: patterns.length,
      validatedPatterns: patterns.filter(p => p.isValidated).length,
      byDomain,
      totalTimeSaved,
      totalItemsFetched,
    };
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.patternsByDomain.clear();
    this.presetPatterns.clear();
    paginationLogger.info('Cleared all pagination patterns');
  }

  // ============================================
  // INT-005: PRESET SUPPORT FOR LEGAL DOCUMENTS
  // ============================================

  /**
   * Try to use a domain preset for pagination configuration
   */
  tryPreset(url: string): PaginationAnalysisResult {
    const reasons: string[] = [];

    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.replace(/^www\./, '');

      // Check if we already have a preset pattern cached
      const cachedPattern = this.presetPatterns.get(domain);
      if (cachedPattern) {
        reasons.push(`Using cached preset pattern for ${domain}`);
        return {
          detected: true,
          pattern: cachedPattern,
          confidence: 0.9,
          reasons,
        };
      }

      // Try to get preset from domain-presets
      const preset = getPaginationPreset(url);
      if (!preset) {
        reasons.push('No pagination preset found for domain');
        return { detected: false, confidence: 0, reasons };
      }

      // Create pattern from preset
      const pattern = this.createPatternFromPreset(domain, parsed, preset);

      // Cache the preset pattern
      this.presetPatterns.set(domain, pattern);
      this.storePattern(pattern);

      paginationLogger.info('Created pagination pattern from preset', {
        domain,
        paramName: pattern.paginationParam.name,
        paramType: pattern.paginationParam.type,
      });

      reasons.push(`Created pattern from ${domain} preset`);
      return {
        detected: true,
        pattern,
        confidence: 0.9, // High confidence for presets
        reasons,
      };
    } catch (error) {
      paginationLogger.debug('Error trying preset', { url, error });
      reasons.push(`Preset check error: ${error instanceof Error ? error.message : 'unknown'}`);
      return { detected: false, confidence: 0, reasons };
    }
  }

  /**
   * Create a PaginationApiPattern from a preset configuration
   */
  private createPatternFromPreset(
    domain: string,
    parsedUrl: URL,
    preset: PaginationPresetConfig
  ): PaginationApiPattern {
    // Determine pagination param type
    let paramType: 'page' | 'offset' | 'cursor' | 'token' = 'page';
    if (preset.paramName) {
      const lower = preset.paramName.toLowerCase();
      if (['offset', 'start', 'skip'].includes(lower)) {
        paramType = 'offset';
      } else if (['cursor', 'after', 'before'].includes(lower)) {
        paramType = 'cursor';
      } else if (['token', 'nexttoken', 'continuation'].includes(lower)) {
        paramType = 'token';
      }
    }

    // Determine param location
    let location: 'query' | 'path' | 'body' = 'query';
    if (preset.type === 'path_segment') {
      location = 'path';
    }

    // Build base URL
    const baseUrl = preset.apiEndpoint
      ? `${parsedUrl.origin}${preset.apiEndpoint}`
      : `${parsedUrl.origin}${parsedUrl.pathname}`;

    return {
      id: `preset_${domain}_${Date.now()}`,
      domain,
      baseUrl,
      paginationParam: {
        name: preset.paramName || 'page',
        type: paramType,
        startValue: preset.startValue ?? 1,
        increment: preset.increment,
        location,
        nextValuePath: preset.nextCursorPath,
      },
      method: 'GET',
      headers: {},
      responseStructure: {
        dataPath: preset.responseDataPath || 'data',
        totalCountPath: preset.totalCountPath,
        hasMorePath: preset.hasMorePath,
        nextCursorPath: preset.nextCursorPath,
        itemsPerPage: preset.itemsPerPage || 10,
      },
      metrics: this.createEmptyMetrics(),
      discoveredAt: Date.now(),
      lastUsedAt: Date.now(),
      isValidated: true, // Presets are pre-validated
    };
  }

  /**
   * Get preset pattern for a domain (if available)
   */
  getPresetPattern(url: string): PaginationApiPattern | undefined {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      return this.presetPatterns.get(domain);
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a URL has a pagination preset available
   */
  hasPreset(url: string): boolean {
    return getPaginationPreset(url) !== undefined;
  }

  /**
   * Get all domains with pagination presets loaded
   */
  getPresetDomains(): string[] {
    return Array.from(this.presetPatterns.keys());
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

/** Default pagination discovery instance */
export const paginationDiscovery = new PaginationDiscovery();
