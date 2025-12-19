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
      reason: string;
    };

/**
 * Listener for pattern learning events
 */
export type PatternLearningListener = (event: PatternLearningEvent) => void;
