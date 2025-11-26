/**
 * Core types for LLM Browser MCP Server
 */

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  requestHeaders: Record<string, string>;
  responseBody?: any;
  contentType?: string;
  timestamp: number;
  duration?: number;
}

export interface ConsoleMessage {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  timestamp: number;
  location?: {
    url: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export interface ApiPattern {
  endpoint: string;
  method: string;
  confidence: 'high' | 'medium' | 'low';
  canBypass: boolean;
  authType?: 'cookie' | 'bearer' | 'header' | 'session';
  authHeaders?: Record<string, string>;
  responseType?: string;
  params?: Record<string, any>;
  reason?: string;
}

export interface SessionStore {
  domain: string;
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  isAuthenticated: boolean;
  authType?: string;
  lastUsed: number;
  expiresAt?: number;
  username?: string;
}

export interface KnowledgeBaseEntry {
  domain: string;
  patterns: ApiPattern[];
  lastUsed: number;
  usageCount: number;
  successRate: number;
}

export interface BrowseOptions {
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
  waitForSelector?: string; // CSS selector to wait for (for SPAs)
  timeout?: number;
  captureNetwork?: boolean;
  captureConsole?: boolean;
  sessionProfile?: string;
  dismissCookieBanner?: boolean; // Auto-dismiss cookie consent banners
  scrollToLoad?: boolean; // Scroll to trigger lazy-loaded content
  detectLanguage?: boolean; // Detect content language
  useRateLimiting?: boolean; // Apply per-domain rate limiting (default: true)
  retryOnError?: boolean; // Retry on transient errors (default: true)
}

export interface BrowseResult {
  url: string;
  title: string;
  content: {
    html: string;
    markdown: string;
    text: string;
  };
  tables?: ExtractedTableResult[]; // Extracted tables as JSON
  network: NetworkRequest[];
  console: ConsoleMessage[];
  discoveredApis: ApiPattern[];
  metadata: {
    loadTime: number;
    timestamp: number;
    finalUrl: string;
    language?: string; // Detected language
    fromCache?: boolean;
    retryCount?: number;
  };
}

export interface ExtractedTableResult {
  headers: string[];
  data: Record<string, string>[];
  caption?: string;
}

export interface ApiCallOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  inheritAuth?: boolean;
  sessionProfile?: string;
}

// ============================================
// LEARNING SYSTEM TYPES
// ============================================

/**
 * Enhanced API pattern with temporal tracking
 */
export interface EnhancedApiPattern extends ApiPattern {
  createdAt: number;
  lastVerified: number;
  verificationCount: number;
  failureCount: number;
  lastFailure?: FailureContext;
}

/**
 * Failure context for learning from errors
 */
export interface FailureContext {
  type: 'auth_expired' | 'rate_limited' | 'site_changed' | 'timeout' | 'blocked' | 'not_found' | 'server_error' | 'unknown';
  responseStatus?: number;
  errorMessage?: string;
  timestamp: number;
  recoveryAttempted?: boolean;
  recoverySucceeded?: boolean;
}

/**
 * Selector pattern for content extraction
 */
export interface SelectorPattern {
  selector: string;
  contentType: 'main_content' | 'requirements' | 'fees' | 'timeline' | 'documents' | 'contact' | 'navigation' | 'table';
  priority: number; // Higher = try first
  successCount: number;
  failureCount: number;
  lastWorked: number;
  lastFailed?: number;
  domain: string;
  urlPattern?: string; // Regex pattern for URL matching
}

/**
 * Selector fallback chain
 */
export interface SelectorChain {
  contentType: SelectorPattern['contentType'];
  selectors: SelectorPattern[];
  domain: string;
}

/**
 * Content change frequency tracking
 */
export interface RefreshPattern {
  urlPattern: string; // Regex pattern
  domain: string;
  avgChangeFrequencyHours: number;
  minChangeFrequencyHours: number;
  maxChangeFrequencyHours: number;
  sampleCount: number;
  lastChecked: number;
  lastChanged: number;
  contentHash?: string;
}

/**
 * Cross-domain pattern group
 */
export interface DomainGroup {
  name: string; // e.g., 'spanish_gov', 'us_gov', 'eu_gov'
  domains: string[];
  sharedPatterns: {
    cookieBannerSelectors: string[];
    contentSelectors: string[];
    navigationSelectors: string[];
    paginationPattern?: PaginationPattern;
    commonAuthType?: 'cookie' | 'none';
    language?: string;
  };
  lastUpdated: number;
}

/**
 * Response validation rules
 */
export interface ContentValidator {
  domain: string;
  urlPattern?: string;
  expectedMinLength: number;
  expectedMaxLength?: number;
  mustContainAny?: string[]; // At least one must be present
  mustContainAll?: string[]; // All must be present
  mustNotContain: string[]; // Error indicators
  expectedLanguage?: string;
  successCount: number;
  failureCount: number;
}

/**
 * Pagination pattern
 */
export interface PaginationPattern {
  type: 'query_param' | 'path_segment' | 'infinite_scroll' | 'next_button' | 'load_more';
  paramName?: string; // e.g., 'page', 'offset', 'cursor'
  startValue?: number | string;
  increment?: number;
  selector?: string; // For button-based pagination
  scrollThreshold?: number; // Pixels from bottom for infinite scroll
  itemsPerPage?: number;
  maxPages?: number;
  hasMoreIndicator?: string; // Selector or text to check if more pages exist
}

/**
 * Enhanced knowledge base entry with all learning features
 */
export interface EnhancedKnowledgeBaseEntry {
  domain: string;

  // API patterns (enhanced)
  apiPatterns: EnhancedApiPattern[];

  // Content extraction
  selectorChains: SelectorChain[];

  // Change frequency
  refreshPatterns: RefreshPattern[];

  // Validation rules
  validators: ContentValidator[];

  // Pagination
  paginationPatterns: Map<string, PaginationPattern> | Record<string, PaginationPattern>;

  // Failure history
  recentFailures: FailureContext[];

  // Metadata
  domainGroup?: string;
  lastUsed: number;
  usageCount: number;
  overallSuccessRate: number;
  createdAt: number;
  lastUpdated: number;
}

/**
 * Learning event for tracking what was learned
 */
export interface LearningEvent {
  type: 'api_discovered' | 'selector_learned' | 'validator_created' | 'pagination_detected' | 'failure_recorded' | 'pattern_verified' | 'confidence_decayed';
  domain: string;
  details: Record<string, unknown>;
  timestamp: number;
}

/**
 * Confidence decay configuration
 */
export interface ConfidenceDecayConfig {
  // Days without verification before starting decay
  gracePeriodDays: number;
  // How much to decay per period after grace
  decayRatePerWeek: number;
  // Minimum confidence before pattern is considered stale
  minConfidenceThreshold: number;
  // Days without use before pattern is archived
  archiveAfterDays: number;
}
