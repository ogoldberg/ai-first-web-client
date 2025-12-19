/**
 * API Pattern Learning Types
 *
 * Types for the generalized API pattern learning system that extracts
 * learnable patterns from site-specific API handlers.
 */

// ============================================
// PATTERN TEMPLATE TYPES
// ============================================

/**
 * Pattern template types abstracted from existing handlers:
 * - json-suffix: Append .json to URL (Reddit)
 * - registry-lookup: Extract name, call registry API (NPM, PyPI)
 * - rest-resource: Map URL path to versioned REST API (GitHub, Wikipedia)
 * - firebase-rest: Extract ID, call Firebase-style API (HackerNews)
 * - query-api: Extract params, call query-based API (StackOverflow, Dev.to)
 */
export type PatternTemplateType =
  | 'json-suffix'
  | 'registry-lookup'
  | 'rest-resource'
  | 'firebase-rest'
  | 'query-api';

/**
 * How to extract variables from the source URL
 */
export interface VariableExtractor {
  /** Name of the variable (e.g., 'package', 'owner', 'repo') */
  name: string;
  /** Where to extract from */
  source: 'path' | 'query' | 'subdomain' | 'hostname';
  /** Regex pattern to extract the value */
  pattern: string;
  /** Capture group index (1-based) */
  group: number;
  /** Optional transformation function name */
  transform?: 'lowercase' | 'uppercase' | 'urlencode' | 'urldecode';
}

/**
 * How to map extracted content from API response
 */
export interface ContentMapping {
  /** JSONPath or dot notation path to title */
  title: string;
  /** JSONPath or dot notation path to description/summary */
  description?: string;
  /** JSONPath or dot notation path to main body content */
  body?: string;
  /** Additional metadata mappings */
  metadata?: Record<string, string>;
}

/**
 * Response validation rules
 */
export interface PatternValidation {
  /** Fields that must exist in the response */
  requiredFields: string[];
  /** Minimum content length */
  minContentLength: number;
  /** Maximum acceptable response time in ms */
  maxResponseTime?: number;
  /** Expected content type */
  expectedContentType?: string;
}

/**
 * A pattern template - abstracted from specific implementations
 * Represents a category of API patterns (e.g., all "registry lookup" APIs)
 */
export interface ApiPatternTemplate {
  /** Unique identifier for the template type */
  type: PatternTemplateType;
  /** Human-readable name */
  name: string;
  /** Description of how this pattern type works */
  description: string;

  /** Indicators that suggest this pattern type applies */
  indicators: {
    /** URL patterns that suggest this template (regex strings) */
    urlPatterns?: string[];
    /** Response fields that indicate this pattern type */
    responseIndicators?: string[];
    /** Domain patterns where this commonly works */
    domainPatterns?: string[];
  };

  /** Known sites using this pattern (for bootstrapping) */
  knownImplementations: string[];
}

// ============================================
// LEARNED PATTERN TYPES
// ============================================

/**
 * A learned API pattern - generalized from handlers
 * This is what gets stored and applied to new URLs
 */
export interface LearnedApiPattern {
  /** Unique identifier */
  id: string;

  /** Pattern template this was derived from */
  templateType: PatternTemplateType;

  /** URL patterns this applies to (regex strings) */
  urlPatterns: string[];

  /** API endpoint template with variables like {package}, {owner} */
  endpointTemplate: string;

  /** How to extract template variables from source URL */
  extractors: VariableExtractor[];

  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';

  /** Default headers to send */
  headers?: Record<string, string>;

  /** Response format */
  responseFormat: 'json' | 'xml' | 'html';

  /** How to map response to content */
  contentMapping: ContentMapping;

  /** Validation rules */
  validation: PatternValidation;

  /** Learning metrics */
  metrics: PatternMetrics;

  /** Fallback pattern IDs to try if this fails */
  fallbackPatterns?: string[];

  /** When this pattern was created */
  createdAt: number;

  /** When this pattern was last updated */
  updatedAt: number;
}

/**
 * Metrics tracking for a learned pattern
 */
export interface PatternMetrics {
  /** Successful extractions */
  successCount: number;
  /** Failed extractions */
  failureCount: number;
  /** Last successful use timestamp */
  lastSuccess?: number;
  /** Last failed use timestamp */
  lastFailure?: number;
  /** Last failure reason */
  lastFailureReason?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Domains this pattern has worked for */
  domains: string[];
  /** Average response time in ms */
  avgResponseTime?: number;
}

// ============================================
// PATTERN MATCHING TYPES
// ============================================

/**
 * Result of attempting to match a URL to a pattern
 */
export interface PatternMatch {
  /** The matched pattern */
  pattern: LearnedApiPattern;
  /** Confidence score for this match (0-1) */
  confidence: number;
  /** Extracted variables from the URL */
  extractedVariables: Record<string, string>;
  /** Computed API endpoint URL */
  apiEndpoint: string;
  /** Reason for the match */
  matchReason: string;
}

/**
 * Result of pattern application
 */
export interface PatternApplicationResult {
  /** Whether the pattern successfully extracted content */
  success: boolean;
  /** The pattern that was applied */
  pattern: LearnedApiPattern;
  /** Extracted content (if successful) */
  content?: {
    title: string;
    text: string;
    markdown: string;
    structured: Record<string, unknown>;
  };
  /** Response time in ms */
  responseTime: number;
  /** Error message (if failed) */
  error?: string;
  /** Failure type for learning */
  failureType?: PatternFailureType;
}

/**
 * Types of pattern application failures
 */
export type PatternFailureType =
  | 'network_error'
  | 'auth_required'
  | 'rate_limited'
  | 'not_found'
  | 'server_error'
  | 'parse_error'
  | 'validation_failed'
  | 'timeout'
  | 'wrong_format';

// ============================================
// PATTERN REGISTRY TYPES
// ============================================

/**
 * Configuration for the pattern registry
 */
export interface PatternRegistryConfig {
  /** File path for persisting patterns */
  filePath: string;
  /** Maximum patterns to store */
  maxPatterns: number;
  /** Minimum confidence to keep a pattern */
  minConfidenceThreshold: number;
  /** Days without use before archiving */
  archiveAfterDays: number;
  /** Enable automatic persistence */
  autoPersist: boolean;
  /** Debounce time for persistence (ms) */
  persistDebounceMs: number;
}

/**
 * Statistics about the pattern registry
 */
export interface PatternRegistryStats {
  /** Total number of patterns */
  totalPatterns: number;
  /** Patterns by template type */
  patternsByType: Record<PatternTemplateType, number>;
  /** Total domains covered */
  domainsCovered: number;
  /** Average confidence across patterns */
  avgConfidence: number;
  /** Patterns with high confidence (>0.8) */
  highConfidencePatterns: number;
  /** Patterns needing verification (low recent success) */
  patternsNeedingVerification: number;
  /** Last registry update */
  lastUpdated: number;
}

// ============================================
// BOOTSTRAP PATTERN TYPES
// ============================================

/**
 * A bootstrap pattern definition - used to seed the registry
 * from existing hardcoded handlers
 */
export interface BootstrapPattern {
  /** Source handler (e.g., 'reddit', 'github') */
  source: string;
  /** Pattern definition */
  pattern: Omit<LearnedApiPattern, 'id' | 'createdAt' | 'updatedAt'>;
  /** Initial confidence (bootstrapped high) */
  initialConfidence: number;
  /** Initial success count (bootstrapped) */
  initialSuccessCount: number;
}

// ============================================
// LEARNING EVENT TYPES
// ============================================

/**
 * Events emitted during pattern learning
 */
export type PatternLearningEvent =
  | {
      type: 'pattern_learned';
      pattern: LearnedApiPattern;
      source: 'extraction' | 'bootstrap' | 'transfer';
    }
  | {
      type: 'pattern_applied';
      patternId: string;
      success: boolean;
      domain: string;
      responseTime: number;
    }
  | {
      type: 'pattern_updated';
      patternId: string;
      changes: Partial<LearnedApiPattern>;
    }
  | {
      type: 'confidence_decayed';
      patternId: string;
      oldConfidence: number;
      newConfidence: number;
    }
  | {
      type: 'pattern_archived';
      patternId: string;
      reason: 'stale' | 'low_confidence';
    }
  | {
      type: 'anti_pattern_created';
      antiPattern: AntiPattern;
    };

/**
 * Listener for pattern learning events
 */
export type PatternLearningListener = (event: PatternLearningEvent) => void;

// ============================================
// API EXTRACTION EVENT TYPES
// ============================================

/**
 * Data captured when an API extraction succeeds
 * Used for learning new patterns
 */
export interface ApiExtractionSuccess {
  /** Original URL that was requested */
  sourceUrl: string;
  /** Final URL (API endpoint) that was called */
  apiUrl: string;
  /** Strategy that succeeded (e.g., 'api:reddit', 'api:npm') */
  strategy: string;
  /** Response time in milliseconds */
  responseTime: number;
  /** Extracted content */
  content: {
    title: string;
    text: string;
    markdown: string;
    /** Structured data from the API response (used for content mapping inference) */
    structured?: Record<string, unknown>;
  };
  /** Headers sent with the request */
  headers?: Record<string, string>;
  /** HTTP method used */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

/**
 * Listener for API extraction success events
 */
export type ApiExtractionListener = (event: ApiExtractionSuccess) => void;

// ============================================
// CROSS-SITE TRANSFER TYPES (L-005)
// ============================================

/**
 * Site similarity score components
 * Used to determine if a pattern from one site can be transferred to another
 */
export interface SiteSimilarityScore {
  /** Overall similarity score (0-1) */
  overall: number;
  /** URL structure similarity (same path patterns) */
  urlStructure: number;
  /** Response format similarity (JSON/XML/HTML) */
  responseFormat: number;
  /** Template type compatibility */
  templateType: number;
  /** Domain group match (if both sites are in the same group) */
  domainGroup: number;
  /** Explanation of the similarity calculation */
  explanation: string;
}

/**
 * Result of attempting to transfer a pattern to a new domain
 */
export interface PatternTransferResult {
  /** Whether the transfer was successful */
  success: boolean;
  /** The new pattern ID if transfer succeeded */
  newPatternId?: string;
  /** The transferred pattern (if successful) */
  transferredPattern?: LearnedApiPattern;
  /** Similarity score between source and target sites */
  similarityScore: SiteSimilarityScore;
  /** Confidence applied to the transferred pattern (with decay) */
  transferredConfidence: number;
  /** Reason for transfer success/failure */
  reason: string;
}

/**
 * Options for pattern transfer
 */
export interface PatternTransferOptions {
  /** Minimum similarity score to allow transfer (default: 0.3) */
  minSimilarity?: number;
  /** Confidence decay multiplier (default: 0.5) */
  confidenceDecay?: number;
  /** Whether to immediately test the transferred pattern */
  validateTransfer?: boolean;
  /** Custom URL to test transfer against (if validateTransfer is true) */
  testUrl?: string;
}

/**
 * Domain group definition for API pattern similarity
 * Similar to LearningEngine's domain groups but focused on API patterns
 */
export interface ApiDomainGroup {
  /** Unique group identifier */
  name: string;
  /** Domains that belong to this group */
  domains: string[];
  /** Common API patterns for this group */
  sharedPatterns: {
    /** Common endpoint path patterns */
    pathPatterns?: string[];
    /** Common response field patterns */
    responseFields?: string[];
    /** Common authentication type */
    authType?: 'none' | 'api_key' | 'bearer' | 'basic';
  };
  /** Pattern template types commonly used by this group */
  commonTemplateTypes?: PatternTemplateType[];
  /** When this group was last updated */
  lastUpdated: number;
}

// ============================================
// OPENAPI DISCOVERY TYPES (L-006)
// ============================================

/**
 * Common locations to probe for OpenAPI/Swagger specifications
 */
export const OPENAPI_PROBE_LOCATIONS = [
  '/openapi.json',
  '/openapi.yaml',
  '/openapi.yml',
  '/swagger.json',
  '/swagger.yaml',
  '/swagger.yml',
  '/api-docs',
  '/api-docs.json',
  '/docs/api',
  '/docs/api.json',
  '/.well-known/openapi.json',
  '/v1/openapi.json',
  '/v2/openapi.json',
  '/v3/openapi.json',
  '/api/openapi.json',
  '/api/swagger.json',
] as const;

/**
 * OpenAPI specification version
 */
export type OpenAPIVersion = '2.0' | '3.0' | '3.1';

/**
 * Simplified OpenAPI parameter representation
 */
export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  type?: string;
  schema?: {
    type?: string;
    format?: string;
    enum?: string[];
  };
  description?: string;
}

/**
 * Simplified OpenAPI response representation
 */
export interface OpenAPIResponse {
  statusCode: string;
  description?: string;
  contentType?: string;
  schema?: Record<string, unknown>;
}

/**
 * Request body schema for POST/PUT/DELETE operations
 */
export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  contentType: string;
  schema?: Record<string, unknown>;
}

/**
 * Simplified OpenAPI endpoint representation
 */
export interface OpenAPIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  operationId?: string;
  summary?: string;
  description?: string;
  parameters: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: OpenAPIResponse[];
  tags?: string[];
  deprecated?: boolean;
}

/**
 * Rate limit information extracted from OpenAPI x-ratelimit extensions
 */
export interface OpenAPIRateLimitInfo {
  /** Requests allowed per window */
  limit?: number;
  /** Time window in seconds */
  windowSeconds?: number;
  /** Header name for rate limit */
  limitHeader?: string;
  /** Header name for remaining requests */
  remainingHeader?: string;
  /** Header name for reset time */
  resetHeader?: string;
}

/**
 * Parsed OpenAPI specification
 */
export interface ParsedOpenAPISpec {
  /** OpenAPI/Swagger version */
  version: OpenAPIVersion;
  /** API title */
  title: string;
  /** API description */
  description?: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Available endpoints */
  endpoints: OpenAPIEndpoint[];
  /** Security schemes defined */
  securitySchemes?: Record<string, {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
    name?: string;
    in?: 'query' | 'header' | 'cookie';
    scheme?: string;
  }>;
  /** Rate limit information from x-ratelimit extensions */
  rateLimit?: OpenAPIRateLimitInfo;
  /** When the spec was discovered */
  discoveredAt: number;
  /** URL where the spec was found */
  specUrl: string;
}

/**
 * Result of OpenAPI discovery attempt
 */
export interface OpenAPIDiscoveryResult {
  /** Whether a spec was found */
  found: boolean;
  /** The parsed spec if found */
  spec?: ParsedOpenAPISpec;
  /** URL where the spec was found */
  specUrl?: string;
  /** Locations that were probed */
  probedLocations: string[];
  /** Time taken to discover (ms) */
  discoveryTime: number;
  /** Error message if discovery failed */
  error?: string;
}

/**
 * Options for OpenAPI discovery
 */
export interface OpenAPIDiscoveryOptions {
  /** Maximum time to spend probing (ms) */
  timeout?: number;
  /** Only probe these specific locations */
  probeLocations?: string[];
  /** Skip locations that match these patterns */
  skipPatterns?: string[];
  /** Headers to send with probe requests */
  headers?: Record<string, string>;
  /** Whether to parse YAML specs (requires yaml parser) */
  parseYaml?: boolean;
}

/**
 * Result of generating patterns from OpenAPI spec
 */
export interface OpenAPIPatternGenerationResult {
  /** Number of patterns generated */
  patternsGenerated: number;
  /** IDs of generated patterns */
  patternIds: string[];
  /** Endpoints that couldn't be converted to patterns */
  skippedEndpoints: Array<{
    path: string;
    method: string;
    reason: string;
  }>;
  /** Warnings during generation */
  warnings: string[];
}

// ============================================
// FAILURE LEARNING TYPES (L-007)
// ============================================

/**
 * Categories of API failures for learning
 */
export type FailureCategory =
  | 'auth_required'      // 401/403: Needs authentication
  | 'rate_limited'       // 429: Rate limited
  | 'wrong_endpoint'     // 404: Wrong endpoint structure
  | 'server_error'       // 5xx: Server issues (retry later)
  | 'timeout'            // Request timed out
  | 'parse_error'        // Response format unexpected
  | 'validation_failed'  // Response missing required fields
  | 'content_too_short'  // Response content below minimum length
  | 'network_error'      // Connection/DNS failure
  | 'unknown';           // Uncategorized failure

/**
 * Retry strategy based on failure type
 */
export type RetryStrategy =
  | 'none'               // Don't retry (auth required, wrong endpoint)
  | 'backoff'            // Exponential backoff (rate limited, server error)
  | 'skip_domain'        // Skip this domain temporarily (repeated failures)
  | 'try_alternative'    // Try a fallback pattern
  | 'increase_timeout';  // Retry with longer timeout

/**
 * Tracking of failures by category
 */
export interface FailureCounts {
  auth_required: number;
  rate_limited: number;
  wrong_endpoint: number;
  server_error: number;
  timeout: number;
  parse_error: number;
  validation_failed: number;
  content_too_short: number;
  network_error: number;
  unknown: number;
}

/**
 * Detailed failure record
 */
export interface FailureRecord {
  /** When the failure occurred */
  timestamp: number;
  /** Failure category */
  category: FailureCategory;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Error message or description */
  message: string;
  /** Domain where failure occurred */
  domain: string;
  /** URL that was attempted */
  attemptedUrl: string;
  /** Pattern ID that failed */
  patternId: string;
  /** Response time in ms (if request was made) */
  responseTime?: number;
}

/**
 * An anti-pattern represents something that should NOT be tried
 * Learned from repeated failures
 */
export interface AntiPattern {
  /** Unique identifier */
  id: string;
  /** Pattern ID this is derived from (if applicable) */
  sourcePatternId?: string;
  /** Domain(s) this anti-pattern applies to */
  domains: string[];
  /** URL patterns that match this anti-pattern */
  urlPatterns: string[];
  /** Type of failure this represents */
  failureCategory: FailureCategory;
  /** Why this is an anti-pattern */
  reason: string;
  /** Recommended action when matched */
  recommendedAction: RetryStrategy;
  /** How long to suppress this (0 = forever) */
  suppressionDurationMs: number;
  /** When this anti-pattern was created */
  createdAt: number;
  /** When this anti-pattern expires (0 = never) */
  expiresAt: number;
  /** Number of failures that led to this anti-pattern */
  failureCount: number;
  /** Last failure that updated this anti-pattern */
  lastFailure: number;
}

/**
 * Configuration for retry behavior based on failure type
 */
export interface RetryConfig {
  /** Initial delay before first retry (ms) */
  initialDelayMs: number;
  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
  /** Maximum number of retries */
  maxRetries: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Retry configurations by failure category
 */
export const RETRY_CONFIGS: Record<FailureCategory, { strategy: RetryStrategy; config?: RetryConfig }> = {
  auth_required: {
    strategy: 'none',
  },
  rate_limited: {
    strategy: 'backoff',
    config: {
      initialDelayMs: 60000, // 1 minute
      maxDelayMs: 300000,    // 5 minutes
      maxRetries: 3,
      backoffMultiplier: 2,
    },
  },
  wrong_endpoint: {
    strategy: 'none',
  },
  server_error: {
    strategy: 'backoff',
    config: {
      initialDelayMs: 5000,  // 5 seconds
      maxDelayMs: 60000,     // 1 minute
      maxRetries: 2,
      backoffMultiplier: 2,
    },
  },
  timeout: {
    strategy: 'increase_timeout',
    config: {
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      maxRetries: 2,
      backoffMultiplier: 1.5,
    },
  },
  parse_error: {
    strategy: 'try_alternative',
  },
  validation_failed: {
    strategy: 'try_alternative',
  },
  content_too_short: {
    strategy: 'try_alternative',
  },
  network_error: {
    strategy: 'backoff',
    config: {
      initialDelayMs: 2000,
      maxDelayMs: 30000,
      maxRetries: 3,
      backoffMultiplier: 2,
    },
  },
  unknown: {
    strategy: 'try_alternative',
  },
};

/**
 * Thresholds for creating anti-patterns
 */
export const ANTI_PATTERN_THRESHOLDS = {
  /** Minimum failures before creating an anti-pattern */
  minFailures: 3,
  /** Time window for counting failures (ms) */
  timeWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  /** Default suppression duration for anti-patterns (ms) */
  defaultSuppressionMs: 6 * 60 * 60 * 1000, // 6 hours
  /** Permanent suppression for auth_required failures */
  authSuppressionMs: 0, // Forever (until user provides auth)
  /** Suppression for rate_limited failures */
  rateLimitSuppressionMs: 60 * 60 * 1000, // 1 hour
} as const;

/**
 * Extended PatternMetrics with failure category tracking
 */
export interface ExtendedPatternMetrics extends PatternMetrics {
  /** Failures by category */
  failuresByCategory?: FailureCounts;
  /** Recent failure records (last N failures) */
  recentFailures?: FailureRecord[];
  /** Currently active anti-patterns for this pattern */
  activeAntiPatterns?: string[];
}

/**
 * Result of classifying a failure
 */
export interface FailureClassification {
  /** Detected failure category */
  category: FailureCategory;
  /** Confidence in classification (0-1) */
  confidence: number;
  /** Recommended retry strategy */
  recommendedStrategy: RetryStrategy;
  /** Suggested wait time before retry (ms) */
  suggestedWaitMs?: number;
  /** Whether to create/update an anti-pattern */
  shouldCreateAntiPattern: boolean;
  /** Diagnostic message */
  message: string;
}
