/**
 * Search Query Optimizer (GAP-006)
 *
 * Learns search API patterns from network traffic during browsing:
 * 1. Monitors network requests when user performs searches
 * 2. Detects search API endpoints that return results
 * 3. Learns query parameter patterns (q, query, search, etc.)
 * 4. Enables direct API calls for subsequent searches (bypasses form rendering)
 *
 * Expected result: 6-25x speedup for search operations
 */

import { logger } from '../utils/logger.js';
import type { NetworkRequest } from '../types/index.js';

const searchLogger = logger.create('SearchQueryOptimizer');

// ============================================
// TYPES
// ============================================

/**
 * Learned search API pattern
 */
export interface SearchApiPattern {
  /** Unique identifier */
  id: string;
  /** Domain this pattern applies to */
  domain: string;
  /** Base endpoint URL (without query parameters) */
  endpointUrl: string;
  /** Query parameter name for search term */
  queryParamName: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Required headers for API calls */
  requiredHeaders: Record<string, string>;
  /** Response structure information */
  responseStructure: SearchResponseStructure;
  /** Optional pagination support */
  pagination?: SearchPaginationInfo;
  /** Pattern metrics */
  metrics: SearchPatternMetrics;
  /** When pattern was discovered */
  discoveredAt: number;
  /** When pattern was last used */
  lastUsedAt: number;
  /** Whether pattern is validated */
  isValidated: boolean;
}

/**
 * Search response structure
 */
export interface SearchResponseStructure {
  /** Path to results array in response */
  resultsPath: string;
  /** Number of results typically returned */
  typicalResultCount: number;
  /** Path to total count (optional) */
  totalCountPath?: string;
  /** Detected result fields */
  resultFields: SearchResultFields;
}

/**
 * Fields detected in search results
 */
export interface SearchResultFields {
  /** Path to result title */
  title?: string;
  /** Path to result URL */
  url?: string;
  /** Path to description/snippet */
  description?: string;
  /** Other detected fields */
  [key: string]: string | undefined;
}

/**
 * Pagination info for search results
 */
export interface SearchPaginationInfo {
  /** Pagination parameter name */
  paramName: string;
  /** Pagination type */
  type: 'page' | 'offset' | 'cursor';
  /** Start value */
  startValue: number | string;
  /** Increment (for page/offset) */
  increment?: number;
}

/**
 * Metrics for search pattern usage
 */
export interface SearchPatternMetrics {
  /** Times pattern was used */
  timesUsed: number;
  /** Successful searches */
  successCount: number;
  /** Failed searches */
  failureCount: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Total queries processed */
  totalQueries: number;
  /** Time saved vs form rendering (ms) */
  timeSaved: number;
}

/**
 * Context for search detection
 */
export interface SearchContext {
  /** Original page URL where search happened */
  originalUrl: string;
  /** Network requests during search */
  networkRequests: NetworkRequest[];
  /** Search term used (if known) */
  searchTerm?: string;
}

/**
 * Result from search analysis
 */
export interface SearchAnalysisResult {
  /** Whether search API was detected */
  detected: boolean;
  /** Detected pattern (if any) */
  pattern?: SearchApiPattern;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Reasons for detection/non-detection */
  reasons: string[];
}

/**
 * Search execution result
 */
export interface SearchExecutionResult {
  /** Whether search was successful */
  success: boolean;
  /** Search results */
  results?: any[];
  /** Total count (if available) */
  totalCount?: number;
  /** Response time (ms) */
  responseTime: number;
  /** Error message (if failed) */
  error?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Common search query parameter names */
const SEARCH_PARAM_NAMES = [
  'q', 'query', 'search', 'searchTerm', 'keywords',
  'term', 's', 'k', 'text', 'filter', 'find',
];

/** URL patterns indicating search endpoints */
const SEARCH_URL_PATTERNS = [
  /\/api\/.*search/i,
  /\/search\/api/i,
  /\/api\/.*query/i,
  /\/query\/?$/i,
  /\/_search/i,
  /\/api\/.*find/i,
  /\/graphql/i,  // Often used for search
];

/** API content types */
const API_CONTENT_TYPES = [
  'application/json',
  'application/ld+json',
  'application/hal+json',
  'application/vnd.api+json',
];

/** Common result array paths */
const RESULT_PATHS = [
  'results', 'items', 'data', 'hits', 'records',
  'entries', 'rows', 'documents', 'matches',
  'data.results', 'data.items', 'data.hits',
  'response.results', 'response.data',
  'hits.hits', // Elasticsearch style
];

/** Common result field paths */
const RESULT_FIELD_PATHS = {
  title: ['title', 'name', 'label', 'heading', 'subject'],
  url: ['url', 'link', 'href', 'uri', 'path'],
  description: ['description', 'snippet', 'summary', 'excerpt', 'body', 'text', 'content'],
};

/** Minimum confidence to consider pattern valid */
const MIN_CONFIDENCE = 0.6;

/** Estimated form rendering time (ms) for time saved calculation */
const ESTIMATED_FORM_TIME = 3000;

// ============================================
// MAIN CLASS
// ============================================

export class SearchQueryOptimizer {
  private patterns: Map<string, SearchApiPattern> = new Map();
  private patternsByDomain: Map<string, string[]> = new Map();

  /**
   * Analyze network requests to detect search API patterns
   */
  async analyze(context: SearchContext): Promise<SearchAnalysisResult> {
    searchLogger.info('Analyzing for search API patterns', {
      originalUrl: context.originalUrl,
      networkRequestCount: context.networkRequests.length,
      searchTerm: context.searchTerm,
    });

    const reasons: string[] = [];

    // Filter to JSON API requests only
    const apiRequests = context.networkRequests.filter(req =>
      this.isApiRequest(req)
    );

    if (apiRequests.length === 0) {
      reasons.push('No JSON API requests found during search');
      return { detected: false, confidence: 0, reasons };
    }

    searchLogger.debug('Found API requests', { count: apiRequests.length });

    // Find requests that look like search API calls
    const searchCandidates = this.findSearchCandidates(apiRequests, context.searchTerm);

    if (searchCandidates.length === 0) {
      reasons.push('No requests with search parameters or patterns found');
      return { detected: false, confidence: 0, reasons };
    }

    // Analyze the best candidate
    const analysis = this.analyzeSearchCandidate(searchCandidates[0], context);

    if (!analysis.pattern) {
      reasons.push(...analysis.reasons);
      return { detected: false, confidence: analysis.confidence, reasons };
    }

    // Store the pattern
    this.storePattern(analysis.pattern);

    reasons.push(`Detected search API with '${analysis.pattern.queryParamName}' parameter`);

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
   * Find requests that look like search API calls
   */
  private findSearchCandidates(
    requests: NetworkRequest[],
    searchTerm?: string
  ): NetworkRequest[] {
    const candidates: Array<{ request: NetworkRequest; score: number }> = [];

    for (const req of requests) {
      let score = 0;

      try {
        const url = new URL(req.url);

        // Check for search query parameters
        for (const param of SEARCH_PARAM_NAMES) {
          if (url.searchParams.has(param)) {
            score += 4;
            // Extra points if value matches known search term
            if (searchTerm && url.searchParams.get(param)?.includes(searchTerm)) {
              score += 2;
            }
            break;
          }
        }

        // Check for search URL patterns
        for (const pattern of SEARCH_URL_PATTERNS) {
          if (pattern.test(url.pathname)) {
            score += 3;
            break;
          }
        }

        // Check for /api/ path
        if (/\/api\//i.test(url.pathname) || /\/v\d+\//i.test(url.pathname)) {
          score += 2;
        }

        // Check response for array data (search results)
        if (req.responseBody) {
          const hasResults = this.hasResultsArray(req.responseBody);
          if (hasResults) {
            score += 3;
          }
        }

        if (score > 0) {
          candidates.push({ request: req, score });
        }
      } catch (error) {
        searchLogger.debug('Skipping candidate due to invalid URL', { url: req.url, error });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates.map(c => c.request);
  }

  /**
   * Check if response contains an array of results
   */
  private hasResultsArray(body: any): boolean {
    const data = this.parseResponseBody(body);
    if (!data) return false;

    // Check if root is an array with multiple items
    if (Array.isArray(data) && data.length > 0) return true;

    // Check common result paths
    for (const path of RESULT_PATHS) {
      const value = this.getValueByPath(data, path);
      if (Array.isArray(value) && value.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze a search candidate request
   */
  private analyzeSearchCandidate(
    request: NetworkRequest,
    context: SearchContext
  ): { pattern?: SearchApiPattern; confidence: number; reasons: string[] } {
    const reasons: string[] = [];
    let confidence = 0;

    try {
      const url = new URL(request.url);
      const domain = url.hostname;

      // Detect search query parameter
      const queryParamName = this.detectQueryParamName(url, context.searchTerm);
      if (!queryParamName) {
        reasons.push('Could not identify search query parameter');
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

      // Build endpoint URL (without query params)
      const endpointUrl = this.buildEndpointUrl(url, queryParamName);

      // Extract required headers
      const requiredHeaders = this.extractRelevantHeaders(request.requestHeaders);

      confidence += 0.2;

      // Detect pagination support
      const pagination = this.detectPagination(url);

      // Validate pattern
      if (responseStructure.typicalResultCount > 0) {
        confidence += 0.2;
      }

      const pattern: SearchApiPattern = {
        id: this.generatePatternId(),
        domain,
        endpointUrl,
        queryParamName,
        method: request.method as 'GET' | 'POST',
        requiredHeaders,
        responseStructure,
        pagination,
        metrics: this.createEmptyMetrics(),
        discoveredAt: Date.now(),
        lastUsedAt: Date.now(),
        isValidated: confidence >= MIN_CONFIDENCE,
      };

      return { pattern, confidence, reasons };
    } catch (error) {
      searchLogger.debug('Error analyzing search candidate', { error, url: request.url });
      reasons.push(`Analysis error: ${error instanceof Error ? error.message : 'unknown'}`);
      return { confidence: 0, reasons };
    }
  }

  /**
   * Detect search query parameter name
   */
  private detectQueryParamName(url: URL, searchTerm?: string): string | null {
    // First, look for known search param names
    for (const param of SEARCH_PARAM_NAMES) {
      if (url.searchParams.has(param)) {
        const value = url.searchParams.get(param) || '';
        // Extra validation if we know the search term
        if (searchTerm) {
          if (value.toLowerCase().includes(searchTerm.toLowerCase())) {
            return param;
          }
        } else if (value.length > 0) {
          return param;
        }
      }
    }

    // If search term known, find any param that contains it
    if (searchTerm) {
      for (const [key, value] of url.searchParams) {
        if (value.toLowerCase().includes(searchTerm.toLowerCase())) {
          return key;
        }
      }
    }

    return null;
  }

  /**
   * Analyze response structure to understand search results
   */
  private analyzeResponseStructure(body: any): SearchResponseStructure | null {
    const data = this.parseResponseBody(body);
    if (!data) return null;

    // Find results array path
    let resultsPath = '';
    let results: any[] = [];

    if (Array.isArray(data)) {
      resultsPath = '';
      results = data;
    } else {
      for (const path of RESULT_PATHS) {
        const value = this.getValueByPath(data, path);
        if (Array.isArray(value) && value.length > 0) {
          resultsPath = path;
          results = value;
          break;
        }
      }
    }

    if (results.length === 0) {
      return null;
    }

    // Find total count path
    let totalCountPath: string | undefined;
    const totalPaths = ['total', 'totalCount', 'total_count', 'count', 'totalResults', 'meta.total'];
    for (const path of totalPaths) {
      const value = this.getValueByPath(data, path);
      if (typeof value === 'number') {
        totalCountPath = path;
        break;
      }
    }

    // Analyze result fields from first result
    const resultFields = this.detectResultFields(results[0]);

    return {
      resultsPath,
      typicalResultCount: results.length,
      totalCountPath,
      resultFields,
    };
  }

  /**
   * Detect common fields in a result object
   */
  private detectResultFields(result: any): SearchResultFields {
    const fields: SearchResultFields = {};

    if (!result || typeof result !== 'object') {
      return fields;
    }

    // Detect title field
    for (const path of RESULT_FIELD_PATHS.title) {
      if (this.getValueByPath(result, path) !== undefined) {
        fields.title = path;
        break;
      }
    }

    // Detect URL field
    for (const path of RESULT_FIELD_PATHS.url) {
      if (this.getValueByPath(result, path) !== undefined) {
        fields.url = path;
        break;
      }
    }

    // Detect description field
    for (const path of RESULT_FIELD_PATHS.description) {
      if (this.getValueByPath(result, path) !== undefined) {
        fields.description = path;
        break;
      }
    }

    return fields;
  }

  /**
   * Detect pagination support in URL
   */
  private detectPagination(url: URL): SearchPaginationInfo | undefined {
    const paginationParams = ['page', 'p', 'offset', 'start', 'cursor', 'after'];

    for (const param of paginationParams) {
      if (url.searchParams.has(param)) {
        return {
          paramName: param,
          type: this.inferPaginationType(param),
          startValue: this.inferStartValue(param),
          increment: ['page', 'p'].includes(param) ? 1 : undefined,
        };
      }
    }

    return undefined;
  }

  /**
   * Infer pagination type from parameter name
   */
  private inferPaginationType(param: string): 'page' | 'offset' | 'cursor' {
    const lowerParam = param.toLowerCase();

    if (['page', 'p'].includes(lowerParam)) {
      return 'page';
    }

    if (['offset', 'start', 'skip'].includes(lowerParam)) {
      return 'offset';
    }

    return 'cursor';
  }

  /**
   * Infer pagination start value based on parameter name
   */
  private inferStartValue(param: string): number | string {
    const lowerParam = param.toLowerCase();

    if (['page', 'p'].includes(lowerParam)) {
      return 1;
    }

    if (['offset', 'start', 'skip'].includes(lowerParam)) {
      return 0;
    }

    return '';
  }

  /**
   * Build endpoint URL without query parameter and volatile parameters
   * Filters out session IDs, timestamps, nonces, and other non-stable params
   */
  private buildEndpointUrl(url: URL, queryParamName: string): string {
    const newUrl = new URL(url.origin + url.pathname);
    const volatileKeys = /^(?:_|token|session|nonce|cache|timestamp|t|ts|_t|rand|random|nocache)/i;

    for (const [key, value] of url.searchParams.entries()) {
      if (key !== queryParamName && !volatileKeys.test(key)) {
        newUrl.searchParams.set(key, value);
      }
    }

    return newUrl.toString();
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
   * Handles keys containing dots by first checking if the path exists as a single key
   */
  private getValueByPath(obj: any, path: string): any {
    if (!path) return obj;

    // First, check if the path exists as a single key (handles keys with dots)
    if (obj && typeof obj === 'object' && path in obj) {
      return obj[path];
    }

    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * Generate unique pattern ID
   */
  private generatePatternId(): string {
    return `search_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): SearchPatternMetrics {
    return {
      timesUsed: 0,
      successCount: 0,
      failureCount: 0,
      avgResponseTime: 0,
      totalQueries: 0,
      timeSaved: 0,
    };
  }

  /**
   * Store a discovered pattern
   */
  private storePattern(pattern: SearchApiPattern): void {
    this.patterns.set(pattern.id, pattern);

    const domainPatterns = this.patternsByDomain.get(pattern.domain) || [];
    domainPatterns.push(pattern.id);
    this.patternsByDomain.set(pattern.domain, domainPatterns);

    searchLogger.info('Stored search pattern', {
      patternId: pattern.id,
      domain: pattern.domain,
      queryParam: pattern.queryParamName,
      resultsPath: pattern.responseStructure.resultsPath,
    });
  }

  // ============================================
  // PATTERN RETRIEVAL
  // ============================================

  /**
   * Get pattern by ID
   */
  getPattern(id: string): SearchApiPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get patterns for a domain
   */
  getPatternsForDomain(domain: string): SearchApiPattern[] {
    const ids = this.patternsByDomain.get(domain) || [];
    return ids
      .map(id => this.patterns.get(id))
      .filter((p): p is SearchApiPattern => p !== undefined);
  }

  /**
   * Find matching pattern for a domain
   */
  findMatchingPattern(domain: string): SearchApiPattern | null {
    const patterns = this.getPatternsForDomain(domain);
    if (patterns.length === 0) {
      return null;
    }

    // Return the most recently used validated pattern
    const validated = patterns.filter(p => p.isValidated);
    if (validated.length > 0) {
      validated.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      return validated[0];
    }

    // Fall back to any pattern
    patterns.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    return patterns[0];
  }

  // ============================================
  // SEARCH EXECUTION
  // ============================================

  /**
   * Generate search URL from pattern and query
   */
  generateSearchUrl(pattern: SearchApiPattern, query: string): string {
    const url = new URL(pattern.endpointUrl);
    url.searchParams.set(pattern.queryParamName, query);
    return url.toString();
  }

  /**
   * Generate search URL with pagination
   */
  generateSearchUrlWithPage(
    pattern: SearchApiPattern,
    query: string,
    pageValue: number | string
  ): string {
    const url = new URL(pattern.endpointUrl);
    url.searchParams.set(pattern.queryParamName, query);

    if (pattern.pagination) {
      url.searchParams.set(pattern.pagination.paramName, String(pageValue));
    }

    return url.toString();
  }

  /**
   * Extract results from API response using learned structure
   */
  extractResults(pattern: SearchApiPattern, responseBody: any): any[] {
    const data = this.parseResponseBody(responseBody);
    if (!data) return [];

    if (!pattern.responseStructure.resultsPath) {
      return Array.isArray(data) ? data : [];
    }

    const results = this.getValueByPath(data, pattern.responseStructure.resultsPath);
    return Array.isArray(results) ? results : [];
  }

  /**
   * Extract total count from API response
   */
  extractTotalCount(pattern: SearchApiPattern, responseBody: any): number | undefined {
    if (!pattern.responseStructure.totalCountPath) {
      return undefined;
    }

    const data = this.parseResponseBody(responseBody);
    if (!data) return undefined;

    const count = this.getValueByPath(data, pattern.responseStructure.totalCountPath);
    return typeof count === 'number' ? count : undefined;
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
    resultCount: number = 0
  ): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    pattern.metrics.timesUsed++;
    pattern.metrics.totalQueries++;
    pattern.lastUsedAt = Date.now();

    if (success) {
      pattern.metrics.successCount++;
      pattern.metrics.avgResponseTime = this.updateRunningAverage(
        pattern.metrics.avgResponseTime,
        responseTime,
        pattern.metrics.successCount
      );
      // Calculate time saved (form would take ~3s, API takes responseTime)
      const timeSaved = Math.max(0, ESTIMATED_FORM_TIME - responseTime);
      pattern.metrics.timeSaved += timeSaved;
    } else {
      pattern.metrics.failureCount++;
    }

    // Validate pattern after successful usage
    if (success && !pattern.isValidated && pattern.metrics.successCount >= 3) {
      pattern.isValidated = true;
      searchLogger.info('Pattern validated after successful usage', {
        patternId: pattern.id,
        successCount: pattern.metrics.successCount,
      });
    }

    searchLogger.debug('Recorded pattern usage', {
      patternId,
      success,
      responseTime,
      resultCount,
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
  // STATISTICS
  // ============================================

  /**
   * Get optimizer statistics
   */
  getStatistics(): {
    totalPatterns: number;
    validatedPatterns: number;
    byDomain: Record<string, number>;
    totalTimeSaved: number;
    totalQueries: number;
    avgResponseTime: number;
  } {
    const patterns = [...this.patterns.values()];
    const byDomain: Record<string, number> = {};
    let totalTimeSaved = 0;
    let totalQueries = 0;
    let totalResponseTime = 0;
    let queriesWithTime = 0;

    for (const pattern of patterns) {
      byDomain[pattern.domain] = (byDomain[pattern.domain] || 0) + 1;
      totalTimeSaved += pattern.metrics.timeSaved;
      totalQueries += pattern.metrics.totalQueries;
      if (pattern.metrics.successCount > 0) {
        totalResponseTime += pattern.metrics.avgResponseTime * pattern.metrics.successCount;
        queriesWithTime += pattern.metrics.successCount;
      }
    }

    return {
      totalPatterns: patterns.length,
      validatedPatterns: patterns.filter(p => p.isValidated).length,
      byDomain,
      totalTimeSaved,
      totalQueries,
      avgResponseTime: queriesWithTime > 0 ? totalResponseTime / queriesWithTime : 0,
    };
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.patternsByDomain.clear();
    searchLogger.info('Cleared all search patterns');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

/** Default search query optimizer instance */
export const searchQueryOptimizer = new SearchQueryOptimizer();
