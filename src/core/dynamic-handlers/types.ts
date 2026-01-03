/**
 * Dynamic Handler Types
 *
 * Types and interfaces for the dynamic handler learning system.
 * This enables the application to learn and create new handlers
 * automatically based on observed patterns.
 *
 * The system learns TWO things:
 *
 * 1. REPEATABLE PATTERNS - Common structures like:
 *    - "Shopify-like" stores with /products.json
 *    - "Next.js SSR" sites with __NEXT_DATA__
 *    - "WooCommerce" with /wp-json/wc/store/v1/
 *    These become templates that apply to many sites.
 *
 * 2. SITE-SPECIFIC QUIRKS - Unique behaviors like:
 *    - "example.com needs X-Custom-Header"
 *    - "store.com has price in .weird-price-class"
 *    - "api.site.com rate limits at 2 req/s"
 *    These are specific to individual domains.
 */

import type { ExtractionStrategy } from '../content-intelligence.js';

/**
 * Learned extraction rule - how to get data from a specific element/path
 */
export interface ExtractionRule {
  /** Type of extraction */
  type: 'json-path' | 'css-selector' | 'regex' | 'api-endpoint';

  /** The selector/path/pattern */
  selector: string;

  /** What field this extracts (e.g., 'title', 'price', 'description') */
  field: string;

  /** Optional transformation to apply */
  transform?: 'text' | 'html' | 'number' | 'currency' | 'date' | 'array';

  /** Confidence score for this rule (0-1) */
  confidence: number;

  /** Number of times this rule succeeded */
  successCount: number;

  /** Number of times this rule failed */
  failureCount: number;
}

/**
 * API pattern - a discovered API endpoint pattern
 */
export interface ApiPattern {
  /** URL pattern with placeholders (e.g., "/api/products/{id}") */
  urlPattern: string;

  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';

  /** Required headers */
  headers?: Record<string, string>;

  /** Response type */
  responseType: 'json' | 'html' | 'xml';

  /** JSON paths to extract data from response */
  dataPaths?: Record<string, string>;

  /** Whether authentication is required */
  requiresAuth?: boolean;

  /** Confidence score */
  confidence: number;
}

/**
 * URL matching pattern
 */
export interface UrlPattern {
  /** Pattern type */
  type: 'exact' | 'prefix' | 'regex' | 'glob';

  /** The pattern itself */
  pattern: string;

  /** URL path segments to capture (e.g., { id: 2 } means segment 2 is the ID) */
  captures?: Record<string, number>;
}

/**
 * Handler template - a known pattern type
 */
export type HandlerTemplate =
  | 'shopify-like'      // Sites with /products.json API
  | 'woocommerce-like'  // WordPress + WooCommerce API
  | 'rest-api'          // Generic REST API
  | 'graphql'           // GraphQL endpoint
  | 'nextjs-ssr'        // Next.js with __NEXT_DATA__
  | 'spa-json'          // SPA with embedded JSON
  | 'structured-data'   // Relies on JSON-LD/microdata
  | 'html-scrape'       // Pure HTML parsing
  | 'custom';           // Custom learned pattern

/**
 * A dynamically created handler
 */
export interface DynamicHandler {
  /** Unique identifier */
  id: string;

  /** Domain this handler is for */
  domain: string;

  /** Human-readable name */
  name: string;

  /** Template this handler is based on */
  template: HandlerTemplate;

  /** Strategy identifier for logging/metrics */
  strategy: ExtractionStrategy | `dynamic:${string}`;

  /** URL patterns this handler matches */
  urlPatterns: UrlPattern[];

  /** API patterns discovered for this site */
  apiPatterns: ApiPattern[];

  /** Extraction rules for HTML/JSON parsing */
  extractionRules: ExtractionRule[];

  /** Site-specific configuration */
  config: {
    /** Base URL for API calls */
    apiBase?: string;

    /** Custom headers needed */
    headers?: Record<string, string>;

    /** Whether stealth mode is needed */
    needsStealth?: boolean;

    /** Rate limiting (requests per second) */
    rateLimit?: number;

    /** Pagination configuration */
    pagination?: {
      type: 'page-number' | 'cursor' | 'offset' | 'link-header';
      param?: string;
      nextSelector?: string;
    };
  };

  /** Confidence metrics */
  confidence: {
    /** Overall confidence (0-1) */
    score: number;

    /** Number of successful extractions */
    successCount: number;

    /** Number of failed extractions */
    failureCount: number;

    /** Last successful extraction timestamp */
    lastSuccess?: number;

    /** Last failure timestamp */
    lastFailure?: number;
  };

  /** Version for rollback support */
  version: number;

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Whether this handler is enabled */
  enabled: boolean;

  /** Whether this handler has been promoted to "stable" */
  promoted: boolean;
}

/**
 * Observation from a successful extraction
 */
export interface ExtractionObservation {
  /** URL that was extracted */
  url: string;

  /** Domain */
  domain: string;

  /** Strategy that succeeded */
  strategy: ExtractionStrategy;

  /** What was extracted */
  extracted: {
    title?: string;
    content?: string;
    structured?: Record<string, unknown>;
  };

  /** API calls that were made */
  apiCalls?: Array<{
    url: string;
    method: string;
    status: number;
    responseType: string;
  }>;

  /** Selectors that were used */
  selectorsUsed?: string[];

  /** JSON paths that worked */
  jsonPaths?: string[];

  /** Time taken (ms) */
  duration: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Handler learning configuration
 */
export interface LearningConfig {
  /** Minimum observations before creating a handler */
  minObservations: number;

  /** Minimum confidence to promote a handler */
  promotionThreshold: number;

  /** Minimum confidence to keep a handler active */
  demotionThreshold: number;

  /** Maximum handlers per domain */
  maxHandlersPerDomain: number;

  /** How long to keep unused handlers (ms) */
  handlerTTL: number;

  /** Whether to auto-promote high-confidence handlers */
  autoPromote: boolean;
}

/**
 * Result of handler matching
 */
export interface HandlerMatch {
  handler: DynamicHandler;
  confidence: number;
  capturedParams: Record<string, string>;
}

/**
 * Site-specific quirks - unique behaviors learned for a domain
 */
export interface SiteQuirks {
  /** Domain these quirks apply to */
  domain: string;

  /** Required headers (learned from failures/successes) */
  requiredHeaders?: Record<string, string>;

  /** Headers to avoid (cause blocks) */
  avoidHeaders?: string[];

  /** User agent that works best */
  preferredUserAgent?: string;

  /** Stealth requirements */
  stealth?: {
    required: boolean;
    profile?: string;
    reason?: string;
  };

  /** Rate limiting observed */
  rateLimit?: {
    requestsPerSecond: number;
    burstLimit?: number;
    cooldownMs?: number;
  };

  /** Authentication quirks */
  auth?: {
    type: 'cookie' | 'header' | 'query' | 'none';
    details?: string;
  };

  /** Anti-bot protection detected */
  antiBot?: {
    type: 'cloudflare' | 'akamai' | 'datadome' | 'perimeter' | 'custom' | 'unknown';
    severity: 'low' | 'medium' | 'high';
    workaround?: string;
  };

  /** Content quirks */
  content?: {
    /** Encoding issues */
    encoding?: string;
    /** Lazy loading patterns */
    lazyLoad?: boolean;
    /** Requires JavaScript for content */
    requiresJs?: boolean;
    /** Content behind login */
    loginWall?: boolean;
  };

  /** Timing quirks */
  timing?: {
    /** Minimum delay between requests */
    minDelayMs?: number;
    /** Random delay range */
    randomDelayMs?: [number, number];
    /** Best time to scrape (hour of day) */
    preferredHours?: number[];
  };

  /** Selector overrides - when standard selectors don't work */
  selectorOverrides?: Record<string, string>;

  /** API quirks */
  apiQuirks?: {
    /** Non-standard JSON structure */
    jsonRoot?: string;
    /** Pagination is weird */
    paginationQuirk?: string;
    /** Error response format */
    errorFormat?: string;
  };

  /** Confidence in these quirks */
  confidence: number;

  /** When these were learned */
  learnedAt: number;

  /** Last verified */
  lastVerified: number;
}

/**
 * A reusable pattern template
 */
export interface PatternTemplate {
  /** Template identifier */
  id: HandlerTemplate;

  /** Human-readable name */
  name: string;

  /** Description */
  description: string;

  /** Signals that indicate this pattern */
  signals: PatternSignal[];

  /** How to extract content using this pattern */
  extraction: {
    /** Primary method */
    primary: ExtractionMethod;
    /** Fallback methods */
    fallbacks: ExtractionMethod[];
  };

  /** Default configuration */
  defaultConfig: Partial<DynamicHandler['config']>;

  /** Sites known to use this pattern (for reference) */
  knownSites?: string[];
}

/**
 * A signal that indicates a pattern
 */
export interface PatternSignal {
  /** Type of signal */
  type: 'html-marker' | 'api-endpoint' | 'header' | 'meta-tag' | 'script-src' | 'url-pattern';

  /** What to look for */
  pattern: string;

  /** Weight of this signal (0-1) */
  weight: number;

  /** Whether this signal is required */
  required?: boolean;
}

/**
 * An extraction method
 */
export interface ExtractionMethod {
  /** Method type */
  type: 'api' | 'json-ld' | 'microdata' | 'opengraph' | 'html-parse' | 'framework-data';

  /** Configuration for this method */
  config: {
    /** API endpoint pattern */
    endpoint?: string;
    /** Selectors to use */
    selectors?: Record<string, string>;
    /** JSON paths */
    jsonPaths?: Record<string, string>;
    /** Framework-specific key */
    frameworkKey?: string;
  };
}

/**
 * Combined handler: template + quirks
 */
export interface LearnedSiteHandler {
  /** Domain */
  domain: string;

  /** Base pattern template being used */
  template: HandlerTemplate;

  /** Site-specific quirks */
  quirks: SiteQuirks;

  /** Customized extraction rules (template + learned) */
  customRules: ExtractionRule[];

  /** Discovered APIs specific to this site */
  discoveredApis: ApiPattern[];

  /** Effective configuration (template defaults + quirks) */
  effectiveConfig: DynamicHandler['config'];

  /** How well this handler performs */
  performance: {
    successRate: number;
    avgDuration: number;
    lastUsed: number;
    /** Number of successful extractions */
    successCount: number;
    /** Number of failed extractions */
    failureCount: number;
  };

  /** Version for rollback */
  version: number;
}

/**
 * Serialized format for persistence
 */
export interface SerializedHandlerRegistry {
  version: number;
  handlers: DynamicHandler[];
  learnedSites: LearnedSiteHandler[];
  quirks: SiteQuirks[];
  observations: ExtractionObservation[];
  lastUpdated: number;
}
