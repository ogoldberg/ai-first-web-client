/**
 * Dynamic Content Loading Detection (GAP-008)
 *
 * Learns which XHR/fetch calls load essential page content:
 * 1. Monitors network traffic during page load
 * 2. Identifies API endpoints that return content-like data
 * 3. Learns content response structure (data paths, arrays, etc.)
 * 4. Enables waiting for specific endpoints instead of generic networkidle
 *
 * Expected result: 20-50% faster page loads for dynamic sites
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import type { NetworkRequest } from '../types/index.js';

const contentLogger = logger.create('ContentLoadingDetector');

// ============================================
// TYPES
// ============================================

/**
 * Trigger type for content loading
 */
export type ContentTriggerType =
  | 'immediate'      // Loads on page load
  | 'delayed'        // Loads after a delay (lazy loading)
  | 'on_scroll'      // Loads when scrolling (infinite scroll)
  | 'on_interaction' // Loads on user interaction (click, hover)
  | 'on_visibility'; // Loads when element becomes visible

/**
 * Learned content loading pattern
 */
export interface ContentLoadingPattern {
  /** Unique identifier */
  id: string;
  /** Domain this pattern applies to */
  domain: string;
  /** API endpoint that loads content */
  endpoint: string;
  /** URL pattern for matching (regex-safe) */
  urlPattern: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** When content is triggered to load */
  triggerType: ContentTriggerType;
  /** Delay in ms for 'delayed' trigger */
  triggerDelay?: number;
  /** Parameters that vary between requests */
  variableParams: string[];
  /** Response structure information */
  responseStructure: ContentResponseStructure;
  /** Whether this endpoint is essential for page content */
  isEssential: boolean;
  /** Confidence in this pattern (0-1) */
  confidence: number;
  /** Pattern metrics */
  metrics: ContentLoadingMetrics;
  /** When pattern was discovered */
  discoveredAt: number;
  /** When pattern was last used */
  lastUsedAt: number;
  /** Whether pattern is validated */
  isValidated: boolean;
}

/**
 * Response structure for content API
 */
export interface ContentResponseStructure {
  /** Path to data in response (e.g., "data.items", "results") */
  dataPath: string;
  /** Type of data at the path */
  dataType: 'array' | 'object' | 'string';
  /** Estimated item count (for arrays) */
  itemCount?: number;
  /** Size of response in bytes */
  responseSize: number;
  /** Fields that look like content */
  contentFields: string[];
}

/**
 * Metrics for content loading pattern
 */
export interface ContentLoadingMetrics {
  /** Times pattern was matched */
  timesMatched: number;
  /** Successful loads */
  successCount: number;
  /** Failed loads */
  failureCount: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Average response size (bytes) */
  avgResponseSize: number;
  /** Time saved vs networkidle (ms) */
  timeSaved: number;
}

/**
 * Result from content loading analysis
 */
export interface ContentLoadingAnalysisResult {
  /** Whether content loading patterns were detected */
  detected: boolean;
  /** Detected patterns (sorted by relevance) */
  patterns: ContentLoadingPattern[];
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Reasons for detection/non-detection */
  reasons: string[];
  /** Recommended wait strategy */
  recommendedStrategy: 'networkidle' | 'endpoint' | 'domcontentloaded';
  /** If endpoint strategy, which endpoint to wait for */
  recommendedEndpoint?: string;
}

/**
 * Context for content loading detection
 */
export interface ContentLoadingContext {
  /** Original page URL */
  originalUrl: string;
  /** Network requests during page load */
  networkRequests: NetworkRequest[];
  /** Initial HTML before JS execution (if available) */
  initialHtml?: string;
  /** Final HTML after JS execution */
  finalHtml?: string;
  /** Time from navigation start to networkidle (ms) */
  loadTime: number;
}

// ============================================
// CONSTANTS
// ============================================

/** API content types */
const API_CONTENT_TYPES = [
  'application/json',
  'application/ld+json',
  'application/hal+json',
  'application/vnd.api+json',
  'text/json',
];

/** Minimum confidence to consider a pattern valid */
const MIN_CONFIDENCE = 0.5;

/** Minimum response size to consider as content (bytes) */
const MIN_CONTENT_SIZE = 100;

/** Maximum timing to consider as immediate (ms) */
const IMMEDIATE_THRESHOLD = 500;

/** Paths to check for data arrays in response */
const DATA_PATHS = [
  'data', 'results', 'items', 'records',
  'entries', 'content', 'list', 'rows',
  'hits', 'documents', 'objects', 'posts',
  'articles', 'products', 'users', 'comments',
  'messages', 'notifications', 'feed', 'timeline',
];

/** Fields that indicate content-like data */
const CONTENT_FIELDS = [
  'title', 'name', 'description', 'body', 'text',
  'content', 'html', 'markdown', 'summary', 'excerpt',
  'image', 'thumbnail', 'avatar', 'photo', 'picture',
  'author', 'date', 'created', 'updated', 'published',
  'url', 'link', 'href', 'slug', 'id',
  'price', 'rating', 'score', 'count', 'views',
];

/** Pre-computed lowercase content fields for efficient matching */
const LOWERCASE_CONTENT_FIELDS = CONTENT_FIELDS.map(field => field.toLowerCase());

/** URL patterns that likely return content */
const CONTENT_URL_PATTERNS = [
  /\/api\//i,
  /\/v\d+\//i,
  /\/graphql/i,
  /\/feed/i,
  /\/posts/i,
  /\/articles/i,
  /\/products/i,
  /\/items/i,
  /\/data/i,
  /\/content/i,
  /\.json$/i,
];

/** URL patterns to exclude (not content) */
const EXCLUDE_URL_PATTERNS = [
  /\/analytics/i,
  /\/tracking/i,
  /\/beacon/i,
  /\/pixel/i,
  /\/log/i,
  /\/metrics/i,
  /\/health/i,
  /\/status/i,
  /google-analytics/i,
  /gtag/i,
  /facebook/i,
  /twitter/i,
  /linkedin/i,
  /doubleclick/i,
  /adsense/i,
  /cdn\.jsdelivr/i,
  /cdnjs\.cloudflare/i,
  /unpkg\.com/i,
];

// ============================================
// MAIN CLASS
// ============================================

export class ContentLoadingDetector {
  private patterns: Map<string, ContentLoadingPattern> = new Map();
  private patternsByDomain: Map<string, string[]> = new Map();

  /**
   * Analyze network requests to detect content loading patterns
   */
  async analyze(context: ContentLoadingContext): Promise<ContentLoadingAnalysisResult> {
    const domain = new URL(context.originalUrl).hostname;

    contentLogger.info('Analyzing for content loading patterns', {
      originalUrl: context.originalUrl,
      networkRequestCount: context.networkRequests.length,
      loadTime: context.loadTime,
    });

    const reasons: string[] = [];
    const detectedPatterns: ContentLoadingPattern[] = [];

    // Filter to JSON API requests only
    const apiRequests = context.networkRequests.filter(req =>
      this.isContentApiRequest(req)
    );

    if (apiRequests.length === 0) {
      reasons.push('No JSON API requests found during page load');
      return {
        detected: false,
        patterns: [],
        confidence: 0,
        reasons,
        recommendedStrategy: 'networkidle',
      };
    }

    contentLogger.debug('Found API requests', { count: apiRequests.length });

    // Analyze each API request for content characteristics
    for (const request of apiRequests) {
      const analysis = this.analyzeRequest(request, domain, context);

      if (analysis.isContent && analysis.confidence >= MIN_CONFIDENCE) {
        const pattern = this.createPattern(request, domain, analysis);
        detectedPatterns.push(pattern);
        reasons.push(`Detected content endpoint: ${pattern.endpoint} (confidence: ${analysis.confidence.toFixed(2)})`);
      }
    }

    if (detectedPatterns.length === 0) {
      reasons.push('No content-loading API endpoints detected');
      return {
        detected: false,
        patterns: [],
        confidence: 0,
        reasons,
        recommendedStrategy: 'networkidle',
      };
    }

    // Sort patterns by confidence and essentialness
    detectedPatterns.sort((a, b) => {
      if (a.isEssential !== b.isEssential) {
        return a.isEssential ? -1 : 1;
      }
      return b.confidence - a.confidence;
    });

    // Store patterns
    for (const pattern of detectedPatterns) {
      this.storePattern(pattern);
    }

    // Determine recommended strategy
    const bestPattern = detectedPatterns[0];
    const overallConfidence = detectedPatterns.reduce((sum, p) => sum + p.confidence, 0) / detectedPatterns.length;

    let recommendedStrategy: 'networkidle' | 'endpoint' | 'domcontentloaded';
    let recommendedEndpoint: string | undefined;

    if (bestPattern.confidence >= 0.8 && bestPattern.isEssential) {
      // High confidence essential endpoint - wait for it specifically
      recommendedStrategy = 'endpoint';
      recommendedEndpoint = bestPattern.endpoint;
    } else if (detectedPatterns.length > 3 && overallConfidence < 0.6) {
      // Many low-confidence endpoints - use domcontentloaded + wait
      recommendedStrategy = 'domcontentloaded';
    } else {
      // Default to networkidle for safety
      recommendedStrategy = 'networkidle';
    }

    return {
      detected: true,
      patterns: detectedPatterns,
      confidence: overallConfidence,
      reasons,
      recommendedStrategy,
      recommendedEndpoint,
    };
  }

  /**
   * Get patterns for a domain
   */
  getPatternsForDomain(domain: string): ContentLoadingPattern[] {
    const patternIds = this.patternsByDomain.get(domain) || [];
    return patternIds
      .map(id => this.patterns.get(id))
      .filter((p): p is ContentLoadingPattern => p !== undefined);
  }

  /**
   * Get the best pattern for waiting
   */
  getBestWaitPattern(domain: string): ContentLoadingPattern | undefined {
    const patterns = this.getPatternsForDomain(domain);
    if (patterns.length === 0) return undefined;

    // Sort by: essential first, then confidence, then response time
    const sorted = patterns.sort((a, b) => {
      if (a.isEssential !== b.isEssential) {
        return a.isEssential ? -1 : 1;
      }
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      return a.metrics.avgResponseTime - b.metrics.avgResponseTime;
    });

    return sorted[0];
  }

  /**
   * Record a successful pattern match
   */
  recordSuccess(patternId: string, responseTime: number, responseSize: number): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    pattern.metrics.timesMatched++;
    pattern.metrics.successCount++;
    pattern.metrics.avgResponseTime =
      (pattern.metrics.avgResponseTime * (pattern.metrics.timesMatched - 1) + responseTime) /
      pattern.metrics.timesMatched;
    pattern.metrics.avgResponseSize =
      (pattern.metrics.avgResponseSize * (pattern.metrics.timesMatched - 1) + responseSize) /
      pattern.metrics.timesMatched;
    pattern.lastUsedAt = Date.now();
    pattern.isValidated = true;

    contentLogger.debug('Recorded pattern success', {
      patternId,
      successCount: pattern.metrics.successCount,
    });
  }

  /**
   * Record a pattern failure
   */
  recordFailure(patternId: string, reason: string): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    pattern.metrics.timesMatched++;
    pattern.metrics.failureCount++;
    pattern.confidence *= 0.9; // Decay confidence on failure

    contentLogger.debug('Recorded pattern failure', {
      patternId,
      reason,
      newConfidence: pattern.confidence,
    });
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns(): ContentLoadingPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Import patterns from storage
   */
  importPatterns(patterns: ContentLoadingPattern[]): void {
    for (const pattern of patterns) {
      this.storePattern(pattern);
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Check if a request is a content API request
   */
  private isContentApiRequest(req: NetworkRequest): boolean {
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

    // Must be GET or POST
    if (!['GET', 'POST'].includes(req.method)) {
      return false;
    }

    // Exclude tracking/analytics URLs
    if (EXCLUDE_URL_PATTERNS.some(pattern => pattern.test(req.url))) {
      return false;
    }

    return true;
  }

  /**
   * Analyze a request for content characteristics
   */
  private analyzeRequest(
    req: NetworkRequest,
    domain: string,
    context: ContentLoadingContext
  ): {
    isContent: boolean;
    confidence: number;
    dataPath?: string;
    dataType?: 'array' | 'object' | 'string';
    contentFields: string[];
    triggerType: ContentTriggerType;
    itemCount?: number;
  } {
    let confidence = 0;
    const contentFields: string[] = [];
    let dataPath: string | undefined;
    let dataType: 'array' | 'object' | 'string' | undefined;
    let itemCount: number | undefined;

    // Check URL pattern
    if (CONTENT_URL_PATTERNS.some(pattern => pattern.test(req.url))) {
      confidence += 0.2;
    }

    // Check response size
    const responseSize = req.responseBody ? JSON.stringify(req.responseBody).length : 0;
    if (responseSize >= MIN_CONTENT_SIZE) {
      confidence += 0.1;
    }
    if (responseSize >= 1000) {
      confidence += 0.1;
    }
    if (responseSize >= 5000) {
      confidence += 0.1;
    }

    // Analyze response body
    if (req.responseBody && typeof req.responseBody === 'object') {
      const analysis = this.analyzeResponseBody(req.responseBody);
      if (analysis.dataPath !== undefined) {
        dataPath = analysis.dataPath;
        dataType = analysis.dataType;
        itemCount = analysis.itemCount;
        confidence += 0.3;
      }
      contentFields.push(...analysis.contentFields);
      if (contentFields.length > 0) {
        confidence += Math.min(0.2, contentFields.length * 0.05);
      }
    }

    // Check timing for trigger type (duration = time from request start to response)
    const timing = req.duration || 0;
    let triggerType: ContentTriggerType = 'immediate';

    if (timing < IMMEDIATE_THRESHOLD) {
      triggerType = 'immediate';
      confidence += 0.1; // Immediate loads are more likely essential
    } else if (timing < 2000) {
      triggerType = 'delayed';
    } else {
      triggerType = 'on_visibility';
      confidence -= 0.1; // Late loads less likely essential
    }

    // Check if URL is from same domain
    try {
      const requestUrl = new URL(req.url);
      if (requestUrl.hostname === domain || requestUrl.hostname.endsWith(`.${domain}`)) {
        confidence += 0.1;
      }
    } catch {
      // Invalid URL, no bonus
    }

    // Cap confidence at 1.0
    confidence = Math.min(1.0, Math.max(0, confidence));

    return {
      isContent: confidence >= MIN_CONFIDENCE,
      confidence,
      dataPath,
      dataType,
      contentFields,
      triggerType,
      itemCount,
    };
  }

  /**
   * Analyze response body for content structure
   */
  private analyzeResponseBody(body: unknown): {
    dataPath?: string;
    dataType?: 'array' | 'object' | 'string';
    contentFields: string[];
    itemCount?: number;
  } {
    const contentFields: string[] = [];

    if (typeof body !== 'object' || body === null) {
      return { contentFields };
    }

    // Check for direct array
    if (Array.isArray(body)) {
      const fields = this.findContentFields(body[0]);
      return {
        dataPath: '',
        dataType: 'array',
        contentFields: fields,
        itemCount: body.length,
      };
    }

    const obj = body as Record<string, unknown>;

    // Check known data paths
    for (const path of DATA_PATHS) {
      const value = this.getValueByPath(obj, path);
      if (value !== undefined) {
        if (Array.isArray(value)) {
          const fields = this.findContentFields(value[0]);
          return {
            dataPath: path,
            dataType: 'array',
            contentFields: fields,
            itemCount: value.length,
          };
        } else if (typeof value === 'object' && value !== null) {
          const fields = this.findContentFields(value);
          return {
            dataPath: path,
            dataType: 'object',
            contentFields: fields,
          };
        }
      }
    }

    // Check root level content fields
    const rootFields = this.findContentFields(obj);
    if (rootFields.length > 0) {
      return {
        dataPath: '',
        dataType: 'object',
        contentFields: rootFields,
      };
    }

    return { contentFields };
  }

  /**
   * Find content-like fields in an object
   */
  private findContentFields(obj: unknown): string[] {
    if (typeof obj !== 'object' || obj === null) {
      return [];
    }

    const found: string[] = [];
    const keys = Object.keys(obj as Record<string, unknown>);

    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (LOWERCASE_CONTENT_FIELDS.some(field => lowerKey.includes(field))) {
        found.push(key);
      }
    }

    return found;
  }

  /**
   * Get value by dot-separated path
   */
  private getValueByPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Create a pattern from a request
   */
  private createPattern(
    req: NetworkRequest,
    domain: string,
    analysis: {
      confidence: number;
      dataPath?: string;
      dataType?: 'array' | 'object' | 'string';
      contentFields: string[];
      triggerType: ContentTriggerType;
      itemCount?: number;
    }
  ): ContentLoadingPattern {
    const url = new URL(req.url);
    const responseSize = req.responseBody ? JSON.stringify(req.responseBody).length : 0;

    // Extract variable params (query params that likely vary)
    const variableParams = this.extractVariableParams(url);

    // Create URL pattern (remove variable values)
    const urlPattern = this.createUrlPattern(url, variableParams);

    return {
      id: `clp-${domain}-${randomUUID()}`,
      domain,
      endpoint: req.url,
      urlPattern,
      method: req.method as 'GET' | 'POST',
      triggerType: analysis.triggerType,
      variableParams,
      responseStructure: {
        dataPath: analysis.dataPath || '',
        dataType: analysis.dataType || 'object',
        itemCount: analysis.itemCount,
        responseSize,
        contentFields: analysis.contentFields,
      },
      isEssential: analysis.triggerType === 'immediate' && analysis.confidence >= 0.7,
      confidence: analysis.confidence,
      metrics: {
        timesMatched: 1,
        successCount: 1,
        failureCount: 0,
        avgResponseTime: req.duration || 0,
        avgResponseSize: responseSize,
        timeSaved: 0,
      },
      discoveredAt: Date.now(),
      lastUsedAt: Date.now(),
      isValidated: false,
    };
  }

  /**
   * Extract variable parameters from URL
   */
  private extractVariableParams(url: URL): string[] {
    const variableParams: string[] = [];

    // Common variable params
    const likelyVariable = [
      'timestamp', 'ts', 't', '_', 'rand', 'random',
      'token', 'auth', 'session', 'sid', 'uid',
      'offset', 'page', 'limit', 'cursor',
    ];

    for (const [key] of url.searchParams) {
      const lowerKey = key.toLowerCase();
      if (likelyVariable.some(v => lowerKey.includes(v))) {
        variableParams.push(key);
      }
    }

    return variableParams;
  }

  /**
   * Create a regex-safe URL pattern
   */
  private createUrlPattern(url: URL, variableParams: string[]): string {
    let pattern = `${url.origin}${url.pathname}`;

    // Add static query params only
    const staticParams: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (!variableParams.includes(key)) {
        staticParams.push(`${key}=${encodeURIComponent(value)}`);
      }
    }

    if (staticParams.length > 0) {
      pattern += '?' + staticParams.join('&');
    }

    return pattern;
  }

  /**
   * Store a pattern
   */
  private storePattern(pattern: ContentLoadingPattern): void {
    this.patterns.set(pattern.id, pattern);

    // Update domain index
    const domainPatterns = this.patternsByDomain.get(pattern.domain) || [];
    if (!domainPatterns.includes(pattern.id)) {
      domainPatterns.push(pattern.id);
      this.patternsByDomain.set(pattern.domain, domainPatterns);
    }

    contentLogger.debug('Stored content loading pattern', {
      id: pattern.id,
      domain: pattern.domain,
      endpoint: pattern.endpoint,
      confidence: pattern.confidence,
    });
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

/** Default content loading detector instance */
export const contentLoadingDetector = new ContentLoadingDetector();

/**
 * Create a new content loading detector
 */
export function createContentLoadingDetector(): ContentLoadingDetector {
  return new ContentLoadingDetector();
}
