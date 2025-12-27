/**
 * Core types for LLM Browser MCP Server
 */

// Import types for use in this file
import type { WebSocketPattern, WebSocketConnection } from './websocket-patterns.js';

// Re-export API pattern types
export * from './api-patterns.js';

// Re-export field-level confidence types (CX-002)
export * from './field-confidence.js';

// Re-export decision trace types (CX-003)
export * from './decision-trace.js';

// Re-export error taxonomy types (CX-004)
export * from './errors.js';

// Re-export provenance types (CX-006)
export * from './provenance.js';

// Re-export progress event types (DX-009)
export * from './progress.js';

// Re-export WebSocket pattern types (FEAT-003)
export * from './websocket-patterns.js';

// Re-export pattern health types (FEAT-002)
export * from './pattern-health.js';

// Re-export verification types (FEAT-001)
export * from './verification.js';

// Re-export content change prediction types (GAP-011)
export * from './content-change.js';

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
  profile?: string;
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  isAuthenticated: boolean;
  authType?: string;
  lastUsed: number;
  createdAt?: number;
  expiresAt?: number;
  username?: string;
  /** Metadata for session sharing and multi-portal tracking (GAP-009, INT-002) */
  metadata?: {
    /** Domain the session was shared from (GAP-009) */
    sharedFrom?: string;
    /** Timestamp when session was shared (GAP-009) */
    sharedAt?: number;
    /** Identity provider ID connecting domains (GAP-009) */
    providerId?: string;
    /** Portal group identifier for multi-portal tracking (INT-002) */
    portalGroup?: string;
    /** Login sequence number within portal group (INT-002) */
    loginSequence?: number;
    /** Parent session this depends on (INT-002) */
    parentSession?: {
      domain: string;
      profile: string;
    };
    /** Child sessions that depend on this one (INT-002) */
    childSessions?: Array<{
      domain: string;
      profile: string;
    }>;
    /** Whether this is the primary/root session in the group (INT-002) */
    isPrimarySession?: boolean;
    /** Last verified timestamp for session validity (INT-002) */
    lastVerified?: number;
  };
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
 * Enhanced API pattern with temporal tracking and provenance
 */
export interface EnhancedApiPattern extends ApiPattern {
  createdAt: number;
  lastVerified: number;
  verificationCount: number;
  failureCount: number;
  lastFailure?: FailureContext;
  /** Provenance metadata for tracking pattern origin and history (CX-006) */
  provenance?: import('./provenance.js').ProvenanceMetadata;
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
 * Stealth profile - learned anti-bot evasion settings for a domain
 * The system learns which stealth settings work for each domain
 */
export interface StealthProfile {
  // Whether stealth headers are required (vs optional) for this domain
  required: boolean;

  // The fingerprint seed that has worked (domain name by default)
  fingerprintSeed?: string;

  // Specific User-Agent that bypassed bot detection (if learned)
  workingUserAgent?: string;

  // Platform that works (Windows/macOS/Linux)
  workingPlatform?: 'Windows' | 'macOS' | 'Linux';

  // Whether this domain requires full browser (Playwright) due to JS challenges
  requiresFullBrowser: boolean;

  // Specific headers that helped bypass detection
  requiredHeaders?: Record<string, string>;

  // Behavioral delay requirements learned from rate limiting
  minDelayMs?: number;
  maxDelayMs?: number;

  // Bot detection encountered (what was detected)
  detectionTypes: Array<'cloudflare' | 'datadome' | 'perimeterx' | 'akamai' | 'recaptcha' | 'turnstile' | 'unknown'>;

  // Success rate with current stealth settings
  successRate: number;
  successCount: number;
  failureCount: number;

  // Last time stealth settings were updated
  lastUpdated: number;
}

/**
 * Detection type for bot protection systems
 */
export type BotDetectionType = 'cloudflare' | 'datadome' | 'perimeterx' | 'akamai' | 'recaptcha' | 'turnstile' | 'unknown';

/**
 * Anomaly false positive - record of when anomaly detection incorrectly flagged content
 * This allows the system to learn which anomaly detections are unreliable for specific domains
 */
export interface AnomalyFalsePositive {
  // What type of anomaly was incorrectly detected
  anomalyType: 'challenge_page' | 'error_page' | 'empty_content' | 'redirect_notice' | 'captcha' | 'rate_limited';

  // The reason(s) that triggered the false positive (e.g., "cloudflare", "too many requests")
  triggerReasons: string[];

  // How much content was actually extracted (proves it wasn't a real block)
  actualContentLength: number;

  // How many times this false positive has occurred
  occurrences: number;

  // When first seen and last seen
  firstSeen: number;
  lastSeen: number;
}

/**
 * Problem type for LLM-assisted research
 * Covers all categories of issues the browser might encounter
 */
export type ProblemType =
  | 'bot_detection'        // Blocked by anti-bot systems
  | 'extraction_failure'   // Failed to extract content
  | 'api_discovery'        // Can't find or access API
  | 'authentication'       // Auth required or expired
  | 'rate_limiting'        // Too many requests
  | 'javascript_required'  // Content requires JS execution
  | 'dynamic_content'      // Content loaded dynamically
  | 'pagination'           // Can't navigate pagination
  | 'selector_failure'     // Selectors don't match
  | 'timeout'              // Request timed out
  | 'unknown';

/**
 * Research suggestion returned when the browser encounters problems
 * Enables LLM-assisted problem-solving feedback loop
 */
export interface ResearchSuggestion {
  /** Category of problem encountered */
  problemType: ProblemType;

  /** Search query to find solutions */
  searchQuery: string;

  /** Recommended sources to search (trusted technical sites) */
  recommendedSources: string[];

  /** For bot detection, the specific system detected */
  detectionType?: BotDetectionType;

  /** Parameters the LLM can adjust on retry */
  retryParameters: Array<
    | 'userAgent'
    | 'headers'
    | 'useFullBrowser'
    | 'delayMs'
    | 'fingerprintSeed'
    | 'waitForSelector'
    | 'scrollToLoad'
    | 'timeout'
    | 'extractionStrategy'
  >;

  /** Specific suggestions based on problem type */
  hints: string[];

  /** Relevant documentation URLs if known */
  documentationUrls?: string[];
}

/**
 * Detected interactive challenge element on the page
 * Used to help LLM understand what action might be required
 */
export interface ChallengeElement {
  /** Type of element detected */
  type: 'checkbox' | 'button' | 'captcha' | 'iframe' | 'unknown';

  /** CSS selector that can target this element */
  selector: string;

  /** Text content of the element if any */
  text?: string;

  /** Position on page (for visualization/clicking) */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Whether element is likely clickable */
  clickable: boolean;

  /** Whether clicking was attempted */
  clickAttempted?: boolean;

  /** Result of click attempt if made */
  clickResult?: 'success' | 'failed' | 'no_change' | 'page_changed';
}

/**
 * Problem response with research suggestion for LLM-assisted solving
 */
export interface ProblemResponse {
  /** Whether a problem occurred that needs LLM assistance */
  needsAssistance: true;

  /** Category of problem */
  problemType: ProblemType;

  /** HTTP status code if available */
  statusCode?: number;

  /** For bot detection, the specific system */
  detectionType?: BotDetectionType;

  /** Human-readable explanation of what happened */
  reason: string;

  /** Research suggestion for LLM to investigate solutions */
  researchSuggestion: ResearchSuggestion;

  /** What was already tried */
  attemptedStrategies: string[];

  /** Partial content if any was extracted */
  partialContent?: string;

  /** The URL that had the problem */
  url: string;

  /** Domain for learning purposes */
  domain: string;

  /** Interactive challenge elements detected on the page */
  challengeElements?: ChallengeElement[];

  /** Whether automatic challenge solving was attempted */
  challengeSolveAttempted?: boolean;

  /** Result of automatic challenge solving attempt */
  challengeSolveResult?: 'success' | 'failed' | 'not_attempted' | 'requires_human' | 'no_change';

  /**
   * Current research depth (LR-005).
   * Tracks how many research-assisted retries have been attempted.
   * When this reaches MAX_RESEARCH_DEPTH, no more research suggestions are provided.
   */
  researchDepth: number;

  /**
   * Whether maximum research depth has been reached (LR-005).
   * When true, the LLM should not attempt further research-based retries
   * and should report the issue as unresolvable via automated means.
   */
  maxResearchDepthReached: boolean;
}

/** @deprecated Use ProblemResponse instead */
export type BlockedResponse = ProblemResponse;

/**
 * Retry configuration that LLM can pass after researching solutions
 */
export interface RetryConfig {
  /** Custom User-Agent to try */
  userAgent?: string;

  /** Custom headers to add/override */
  headers?: Record<string, string>;

  /** Force full browser rendering */
  useFullBrowser?: boolean;

  /** Delay before request (ms) */
  delayMs?: number;

  /** Custom fingerprint seed */
  fingerprintSeed?: string;

  /** Specific platform to emulate */
  platform?: 'Windows' | 'macOS' | 'Linux';

  /** Number of retry attempts already made */
  retryAttempt?: number;

  /**
   * Number of research-assisted retries already attempted (LR-005).
   * Used to prevent infinite LLM research loops.
   * Max 2 research attempts per blocked site.
   */
  researchDepth?: number;

  /** Wait for a specific selector before extraction */
  waitForSelector?: string;

  /** Scroll to trigger lazy loading */
  scrollToLoad?: boolean;

  /** Custom timeout (ms) */
  timeout?: number;

  /** Force a specific extraction strategy */
  extractionStrategy?: string;

  /** Custom selectors to try */
  customSelectors?: Record<string, string>;
}

/**
 * Success profile - what works well for a domain
 * This helps the system remember successful strategies and skip failed ones
 */
export interface SuccessProfile {
  // Best rendering tier for this domain
  preferredTier: 'intelligence' | 'lightweight' | 'playwright';

  // Best extraction strategy within the tier
  preferredStrategy?: string;  // e.g., 'parse:static', 'framework:nextjs'

  // Performance metrics
  avgResponseTime: number;
  avgContentLength: number;

  // Success tracking
  successCount: number;
  lastSuccess: number;

  // Configuration that works
  effectiveUserAgent?: string;
  effectiveHeaders?: Record<string, string>;

  // Content characteristics
  hasStructuredData: boolean;
  hasFrameworkData: boolean;
  hasBypassableApis: boolean;

  // Stealth profile - learned anti-bot evasion settings
  stealthProfile?: StealthProfile;

  // Notes for debugging
  notes?: string;
}

/**
 * Enhanced knowledge base entry with all learning features
 */
/**
 * Pattern tier for progressive disclosure (PROG-001)
 * - essential: Core patterns always loaded (common APIs, basic selectors)
 * - domain-specific: Loaded when domain matches
 * - advanced: Loaded on explicit need (edge cases, rare patterns)
 */
export type PatternTier = 'essential' | 'domain-specific' | 'advanced';

export interface EnhancedKnowledgeBaseEntry {
  domain: string;

  // API patterns (enhanced)
  apiPatterns: EnhancedApiPattern[];

  // WebSocket patterns (FEAT-003)
  websocketPatterns?: WebSocketPattern[];

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

  // Anomaly false positives - track when anomaly detection was wrong
  anomalyFalsePositives?: AnomalyFalsePositive[];

  // SUCCESS PROFILE - what works for this domain
  successProfile?: SuccessProfile;

  // Metadata
  domainGroup?: string;
  lastUsed: number;
  usageCount: number;
  overallSuccessRate: number;
  createdAt: number;
  lastUpdated: number;

  // Progressive loading tier (PROG-001)
  tier?: PatternTier;
  // Load priority within tier (higher = load first)
  loadPriority?: number;
  // Estimated size in KB (for load planning)
  sizeEstimate?: number;

  // Content loading patterns (GAP-008)
  contentLoadingPatterns?: ContentLoadingPatternEntry[];
}

/**
 * Content loading pattern entry for persistence (GAP-008)
 */
export interface ContentLoadingPatternEntry {
  /** Unique identifier */
  id: string;
  /** API endpoint that loads content */
  endpoint: string;
  /** URL pattern for matching */
  urlPattern: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** When content is triggered to load */
  triggerType: 'immediate' | 'delayed' | 'on_scroll' | 'on_interaction' | 'on_visibility';
  /** Delay in ms for 'delayed' trigger */
  triggerDelay?: number;
  /** Parameters that vary between requests */
  variableParams: string[];
  /** Path to data in response */
  dataPath: string;
  /** Type of data at the path */
  dataType: 'array' | 'object' | 'string';
  /** Estimated item count (for arrays) */
  itemCount?: number;
  /** Size of response in bytes */
  responseSize: number;
  /** Fields that look like content */
  contentFields: string[];
  /** Whether this endpoint is essential for page content */
  isEssential: boolean;
  /** Confidence in this pattern (0-1) */
  confidence: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** When pattern was discovered */
  discoveredAt: number;
  /** When pattern was last used */
  lastUsedAt: number;
}

/**
 * Learning event for tracking what was learned
 */
export interface LearningEvent {
  type: 'api_discovered' | 'selector_learned' | 'validator_created' | 'pagination_detected' | 'failure_recorded' | 'pattern_verified' | 'confidence_decayed' | 'content_loading_detected';
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

// ============================================
// PROCEDURAL MEMORY TYPES
// ============================================

/**
 * A browsing action that can be part of a skill
 */
export interface BrowsingAction {
  type: 'navigate' | 'click' | 'fill' | 'select' | 'scroll' | 'wait' | 'extract' | 'dismiss_banner';
  selector?: string;
  value?: string;
  url?: string;
  waitFor?: 'load' | 'networkidle' | 'selector';
  timestamp: number;
  success: boolean;
  duration?: number;
}

/**
 * Preconditions for when a skill is applicable
 */
export interface SkillPreconditions {
  // URL patterns where this skill applies
  urlPatterns?: string[];
  // Domain patterns (supports wildcards)
  domainPatterns?: string[];
  // Required DOM elements for skill to work
  requiredSelectors?: string[];
  // Page must contain certain text
  requiredText?: string[];
  // Page characteristics
  pageType?: 'list' | 'detail' | 'form' | 'search' | 'login' | 'unknown';
  // Language requirements
  language?: string;
  // Content type hints
  contentTypeHints?: Array<SelectorPattern['contentType']>;
}

/**
 * Skill tier for progressive disclosure (PROG-001)
 * - essential: Always loaded (cookie banners, common patterns)
 * - domain-specific: Loaded when domain matches
 * - advanced: Loaded on explicit need (rare/specialized patterns)
 */
export type SkillTier = 'essential' | 'domain-specific' | 'advanced';

/**
 * A learned browsing skill (procedural memory unit)
 */
export interface BrowsingSkill {
  // Unique identifier
  id: string;
  // Human-readable name
  name: string;
  // Description of what this skill does
  description: string;
  // When this skill is applicable
  preconditions: SkillPreconditions;
  // The sequence of actions
  actionSequence: BrowsingAction[];
  // Vector embedding for similarity matching (normalized)
  embedding: number[];
  // Performance metrics
  metrics: {
    successCount: number;
    failureCount: number;
    avgDuration: number;
    lastUsed: number;
    timesUsed: number;
  };
  // Metadata
  createdAt: number;
  updatedAt: number;
  sourceUrl?: string;
  sourceDomain?: string;
  // Verification checks (COMP-014: learned from successes/failures)
  verificationChecks?: Array<{
    check: import('./verification.js').VerificationCheck;
    confidence: number;
    learnedFrom: 'success' | 'failure';
  }>;
  // Progressive loading tier (PROG-001)
  tier?: SkillTier;
  // Load priority within tier (higher = load first)
  loadPriority?: number;
  // Estimated size in KB (for load planning)
  sizeEstimate?: number;
}

/**
 * A recorded browsing trajectory (for skill extraction)
 */
export interface BrowsingTrajectory {
  id: string;
  startUrl: string;
  endUrl: string;
  domain: string;
  actions: BrowsingAction[];
  success: boolean;
  totalDuration: number;
  extractedContent?: {
    text: string;
    tables: number;
    apis: number;
  };
  timestamp: number;
}

/**
 * Skill retrieval result with similarity score
 */
export interface SkillMatch {
  skill: BrowsingSkill;
  similarity: number;
  preconditionsMet: boolean;
  reason?: string;
}

/**
 * Result of executing a skill's action (TC-003)
 */
export interface SkillActionResult {
  type: BrowsingAction['type'];
  selector?: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Trace of skill execution for debugging and learning (TC-003)
 */
export interface SkillExecutionTrace {
  // ID of the executed skill
  skillId: string;
  // Human-readable name of the skill
  skillName: string;
  // Why this skill was selected
  matchReason: string;
  // Similarity score (0-1)
  similarity: number;
  // Overall success of skill execution
  success: boolean;
  // Total execution time in ms
  totalDuration: number;
  // Results of individual actions
  actionResults: SkillActionResult[];
  // Number of actions executed (may be less than total if stopped early)
  actionsExecuted: number;
  // Total actions in the skill
  totalActions: number;
  // Error message if skill failed
  error?: string;
  // Whether fallback skills were tried
  usedFallback: boolean;
  // ID of the fallback skill that succeeded (if any)
  fallbackSkillId?: string;
}

/**
 * Configuration for the procedural memory system
 */
export interface ProceduralMemoryConfig {
  // Embedding dimension (default: 64)
  embeddingDim: number;
  // Minimum similarity threshold for retrieval (default: 0.7)
  similarityThreshold: number;
  // Maximum skills to store (default: 1000)
  maxSkills: number;
  // Minimum trajectory length to extract skill (default: 2)
  minTrajectoryLength: number;
  // Merge threshold for similar skills (default: 0.9)
  mergeThreshold: number;
  // Skill file path
  filePath: string;
  // Maximum versions to keep per skill (default: 10)
  maxVersionsPerSkill?: number;
  // Maximum feedback log entries to keep (default: 500)
  maxFeedbackLogSize?: number;
  // Threshold for auto-rollback on negative feedback (default: 0.3)
  autoRollbackThreshold?: number;
  // Path to the storage directory (optional, for backwards compatibility)
  storagePath?: string;
}

/**
 * Page context for skill matching
 */
export interface PageContext {
  url: string;
  domain: string;
  title?: string;
  language?: string;
  pageType?: SkillPreconditions['pageType'];
  availableSelectors?: string[];
  contentLength?: number;
  hasForm?: boolean;
  hasPagination?: boolean;
  hasTable?: boolean;
}

/**
 * A composed workflow combining multiple skills
 */
export interface SkillWorkflow {
  id: string;
  name: string;
  description: string;
  // Skills to execute in order
  skillIds: string[];
  // Preconditions for the entire workflow
  preconditions: SkillPreconditions;
  // Transition conditions between skills
  transitions: Array<{
    fromSkillId: string;
    toSkillId: string;
    condition?: 'success' | 'always' | 'has_pagination' | 'has_next' | 'failure' | 'has_form' | 'has_table' | 'content_extracted' | 'custom';
    /** Custom condition function name (for serialization) */
    customConditionName?: string;
  }>;
  // Performance metrics
  metrics: {
    successCount: number;
    failureCount: number;
    avgDuration: number;
    lastUsed: number;
    timesUsed: number;
  };
  // Embedding for workflow retrieval
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
}

// ============================================
// SKILL COMPOSITION (F-004)
// ============================================

/**
 * Result of executing a single skill within a workflow
 */
export interface SkillExecutionResult {
  skillId: string;
  skillName: string;
  success: boolean;
  duration: number;
  output?: unknown;
  error?: string;
  /** The transition condition that was evaluated */
  transitionEvaluated?: string;
  /** Whether to continue to next skill */
  continueExecution: boolean;
}

/**
 * Result of executing an entire workflow
 */
export interface WorkflowExecutionResult {
  workflowId: string;
  workflowName: string;
  success: boolean;
  totalDuration: number;
  skillResults: SkillExecutionResult[];
  /** Index of the skill that failed (if any) */
  failedAtSkillIndex?: number;
  /** Aggregated output from all skills */
  aggregatedOutput?: unknown;
  executedAt: number;
}

/**
 * Context for evaluating workflow transitions
 */
export interface WorkflowTransitionContext {
  /** Result from the previous skill */
  previousResult?: SkillExecutionResult;
  /** Current page context */
  pageContext?: PageContext;
  /** Whether pagination is detected */
  hasPagination?: boolean;
  /** Whether a "next" element is detected */
  hasNext?: boolean;
  /** Custom data from skill execution */
  customData?: Record<string, unknown>;
}

/**
 * Extended transition with more condition types
 */
export type WorkflowTransitionCondition =
  | 'success'
  | 'always'
  | 'has_pagination'
  | 'has_next'
  | 'failure'
  | 'has_form'
  | 'has_table'
  | 'content_extracted'
  | 'custom';

/**
 * Options for creating a workflow
 */
export interface CreateWorkflowOptions {
  name: string;
  skillIds: string[];
  description?: string;
  /** Custom transition conditions (default: 'success' between all) */
  transitions?: Array<{
    fromSkillId: string;
    toSkillId: string;
    condition: WorkflowTransitionCondition;
    /** Custom condition evaluator (for 'custom' condition type) */
    customCondition?: (ctx: WorkflowTransitionContext) => boolean;
  }>;
  /** Preconditions that must be met to start the workflow */
  preconditions?: SkillPreconditions;
}

/**
 * Match result when retrieving workflows
 */
export interface WorkflowMatch {
  workflow: SkillWorkflow;
  similarity: number;
  reason: string;
}

/**
 * Options for workflow execution
 */
export interface WorkflowExecutionOptions {
  /** Maximum time for entire workflow (ms) */
  timeout?: number;
  /** Whether to stop on first failure */
  stopOnFailure?: boolean;
  /** Custom transition context data */
  contextData?: Record<string, unknown>;
  /** Callback for each skill completion */
  onSkillComplete?: (result: SkillExecutionResult) => void;
}

/**
 * Coverage tracking for active learning
 */
export interface CoverageStats {
  // Domains with skill coverage
  coveredDomains: string[];
  // Page types with skills
  coveredPageTypes: Array<SkillPreconditions['pageType']>;
  // Domains visited but no skills learned
  uncoveredDomains: string[];
  // Page types frequently encountered but no skills
  uncoveredPageTypes: Array<SkillPreconditions['pageType']>;
  // Suggested areas to explore
  suggestions: Array<{
    type: 'domain' | 'pageType' | 'action';
    value: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

// ============================================
// SKILL VERSIONING & ROLLBACK
// ============================================

/**
 * A snapshot of a skill at a specific version
 */
export interface SkillVersion {
  // Version number (monotonically increasing)
  version: number;
  // When this version was created
  createdAt: number;
  // Snapshot of the action sequence at this version
  actionSequence: BrowsingAction[];
  // Snapshot of the embedding at this version
  embedding: number[];
  // Metrics at the time of versioning
  metricsSnapshot: {
    successCount: number;
    failureCount: number;
    successRate: number;
    avgDuration: number;
    timesUsed: number;
  };
  // What triggered this version (merge, update, manual)
  changeReason: 'initial' | 'merge' | 'update' | 'rollback' | 'optimization';
  // Description of what changed
  changeDescription?: string;
}

/**
 * Extended skill with versioning support
 */
export interface VersionedBrowsingSkill extends BrowsingSkill {
  // Current version number
  currentVersion: number;
  // Version history (last N versions kept)
  versionHistory: SkillVersion[];
  // Performance thresholds for auto-rollback
  rollbackThreshold?: {
    // Minimum success rate before considering rollback
    minSuccessRate: number;
    // Minimum uses before rollback is considered
    minUsesBeforeRollback: number;
  };
}

// ============================================
// NEGATIVE SKILLS (ANTI-PATTERNS)
// ============================================

/**
 * An anti-pattern - something learned NOT to do
 */
export interface AntiPattern {
  // Unique identifier
  id: string;
  // Human-readable name
  name: string;
  // Description of what NOT to do
  description: string;
  // When this anti-pattern applies
  preconditions: SkillPreconditions;
  // The action(s) to avoid
  avoidActions: Array<{
    type: BrowsingAction['type'];
    selector?: string;
    reason: string;
  }>;
  // How many times this mistake was made before learning
  occurrenceCount: number;
  // Consequences of the anti-pattern (what went wrong)
  consequences: string[];
  // Suggested alternative actions
  alternatives?: BrowsingAction[];
  // Metadata
  createdAt: number;
  updatedAt: number;
  sourceDomain?: string;
  sourceUrl?: string;
}

// ============================================
// SKILL EXPLANATION
// ============================================

/**
 * Human-readable explanation of a skill
 */
export interface SkillExplanation {
  // Plain English summary of what the skill does
  summary: string;
  // Step-by-step breakdown of actions
  steps: Array<{
    stepNumber: number;
    action: string;
    target?: string;
    purpose: string;
  }>;
  // When and where this skill should be used
  applicability: string;
  // Success rate and reliability info
  reliability: string;
  // Tips for best results
  tips?: string[];
}

// ============================================
// USER FEEDBACK
// ============================================

/**
 * User feedback on a skill application
 */
export interface SkillFeedback {
  // ID of the skill that was applied
  skillId: string;
  // Thumbs up (positive) or down (negative)
  rating: 'positive' | 'negative';
  // Optional reason for the rating
  reason?: string;
  // Context when feedback was given
  context: {
    url: string;
    domain: string;
    timestamp: number;
  };
  // Whether this feedback was acted upon
  processed: boolean;
}

// ============================================
// SKILL DEPENDENCIES & FALLBACKS
// ============================================

/**
 * Extended preconditions with dependencies and fallbacks
 */
export interface ExtendedSkillPreconditions extends SkillPreconditions {
  // Skills that must run before this one
  prerequisites?: string[];
  // Fallback skills if this one fails
  fallbackSkillIds?: string[];
}

// ============================================
// SKILL SHARING & PORTABILITY (F-012)
// ============================================

/**
 * Domain vertical categories for skill organization
 */
export type SkillVertical =
  | 'government'      // gov, .gov.*, public services
  | 'ecommerce'       // shopping, retail, marketplaces
  | 'documentation'   // docs, wikis, knowledge bases
  | 'social'          // social media, forums, communities
  | 'news'            // news sites, blogs, articles
  | 'developer'       // dev tools, APIs, code hosting
  | 'finance'         // banking, fintech, trading
  | 'travel'          // booking, airlines, hotels
  | 'healthcare'      // medical, health services
  | 'education'       // schools, courses, learning
  | 'general';        // catch-all for unclassified

/**
 * Metadata for an exported skill pack
 */
export interface SkillPackMetadata {
  // Pack identifier
  id: string;
  // Human-readable name
  name: string;
  // Description of what this pack contains
  description: string;
  // Version of this pack (semver)
  version: string;
  // When this pack was created
  createdAt: number;
  // Source instance identifier (optional)
  sourceInstance?: string;
  // Domain verticals covered
  verticals: SkillVertical[];
  // Domains covered by skills in this pack
  domains: string[];
  // Statistics
  stats: {
    skillCount: number;
    antiPatternCount: number;
    workflowCount: number;
    totalSuccessCount: number;
    avgSuccessRate: number;
  };
  // Compatibility info
  compatibility: {
    // Minimum version required to import
    minVersion: string;
    // Schema version of the export format
    schemaVersion: string;
  };
}

/**
 * A portable skill pack for sharing/importing
 */
export interface SkillPack {
  // Pack metadata
  metadata: SkillPackMetadata;
  // Exported skills
  skills: BrowsingSkill[];
  // Exported anti-patterns (what NOT to do)
  antiPatterns: AntiPattern[];
  // Exported workflows (skill compositions)
  workflows: SkillWorkflow[];
}

/**
 * Options for exporting skills
 */
export interface SkillExportOptions {
  // Filter by domain patterns (glob-like matching)
  domainPatterns?: string[];
  // Filter by vertical category
  verticals?: SkillVertical[];
  // Include anti-patterns in export
  includeAntiPatterns?: boolean;
  // Include workflows in export
  includeWorkflows?: boolean;
  // Minimum success rate to include (0-1)
  minSuccessRate?: number;
  // Minimum usage count to include
  minUsageCount?: number;
  // Pack name for the export
  packName?: string;
  // Pack description
  packDescription?: string;
}

/**
 * Conflict resolution strategy for skill import
 */
export type SkillConflictResolution =
  | 'skip'       // Skip if similar skill exists
  | 'overwrite'  // Replace existing with imported
  | 'merge'      // Merge metrics from both
  | 'rename';    // Import with new ID

/**
 * Options for importing skills
 */
export interface SkillImportOptions {
  // How to handle conflicts with existing skills
  conflictResolution?: SkillConflictResolution;
  // Filter which skills to import by domain
  domainFilter?: string[];
  // Filter which skills to import by vertical
  verticalFilter?: SkillVertical[];
  // Import anti-patterns
  importAntiPatterns?: boolean;
  // Import workflows
  importWorkflows?: boolean;
  // Reset metrics on imported skills
  resetMetrics?: boolean;
  // Prefix to add to imported skill names
  namePrefix?: string;
}

/**
 * Result of a skill import operation
 */
export interface SkillImportResult {
  success: boolean;
  // Number of skills imported
  skillsImported: number;
  // Number of skills skipped (conflicts)
  skillsSkipped: number;
  // Number of skills merged
  skillsMerged: number;
  // Number of anti-patterns imported
  antiPatternsImported: number;
  // Number of workflows imported
  workflowsImported: number;
  // Any errors encountered
  errors: string[];
  // Warnings (non-fatal issues)
  warnings: string[];
}

// ============================================
// PATTERN IMPORT/EXPORT TYPES (F-007)
// ============================================

/**
 * Metadata for a knowledge base export pack
 */
export interface KnowledgePackMetadata {
  // Pack identifier
  id: string;
  // Human-readable name
  name: string;
  // Description of what this pack contains
  description: string;
  // Version of this pack (semver)
  version: string;
  // When this pack was created
  createdAt: number;
  // Source instance identifier (optional)
  sourceInstance?: string;
  // Domains covered
  domains: string[];
  // Statistics
  stats: {
    domainCount: number;
    apiPatternCount: number;
    selectorCount: number;
    validatorCount: number;
    paginationPatternCount: number;
    antiPatternCount: number;
  };
  // Compatibility info
  compatibility: {
    // Minimum version required to import
    minVersion: string;
    // Schema version of the export format
    schemaVersion: string;
  };
}

/**
 * Exported knowledge base pack
 */
export interface KnowledgePack {
  // Pack metadata
  metadata: KnowledgePackMetadata;
  // Knowledge base entries by domain
  entries: Record<string, EnhancedKnowledgeBaseEntry>;
  // Anti-patterns (what NOT to do) - uses API-level anti-patterns from api-patterns.ts
  antiPatterns?: import('./api-patterns.js').AntiPattern[];
  // Learning events (optional, for replay)
  learningEvents?: LearningEvent[];
}

/**
 * Options for exporting knowledge base
 */
export interface KnowledgeExportOptions {
  // Filter by domain patterns (glob-like matching)
  domainPatterns?: string[];
  // Include anti-patterns in export
  includeAntiPatterns?: boolean;
  // Include learning events (history)
  includeLearningEvents?: boolean;
  // Minimum usage count to include a domain
  minUsageCount?: number;
  // Minimum success rate to include a domain
  minSuccessRate?: number;
  // Pack name for the export
  packName?: string;
  // Pack description
  packDescription?: string;
}

/**
 * Conflict resolution strategy for knowledge import
 */
export type KnowledgeConflictResolution =
  | 'skip'       // Skip if domain entry exists
  | 'overwrite'  // Replace existing with imported
  | 'merge';     // Merge patterns from both (default)

/**
 * Options for importing knowledge base
 */
export interface KnowledgeImportOptions {
  // How to handle conflicts with existing entries
  conflictResolution?: KnowledgeConflictResolution;
  // Filter which domains to import
  domainFilter?: string[];
  // Import anti-patterns
  importAntiPatterns?: boolean;
  // Import learning events
  importLearningEvents?: boolean;
  // Reset metrics on imported patterns
  resetMetrics?: boolean;
  // Adjust confidence levels (multiply by this factor, 0-1)
  confidenceAdjustment?: number;
}

/**
 * Result of a knowledge import operation
 */
export interface KnowledgeImportResult {
  success: boolean;
  // Number of domain entries imported
  domainsImported: number;
  // Number of domains skipped (conflicts)
  domainsSkipped: number;
  // Number of domains merged
  domainsMerged: number;
  // Pattern counts
  apiPatternsImported: number;
  selectorsImported: number;
  validatorsImported: number;
  antiPatternsImported: number;
  // Any errors encountered
  errors: string[];
  // Warnings (non-fatal issues)
  warnings: string[];
}

/**
 * Unified pattern pack combining knowledge base and skills
 */
export interface UnifiedPatternPack {
  // Pack metadata
  metadata: {
    id: string;
    name: string;
    description: string;
    version: string;
    createdAt: number;
    sourceInstance?: string;
    domains: string[];
    stats: {
      domainCount: number;
      apiPatternCount: number;
      selectorCount: number;
      skillCount: number;
      workflowCount: number;
      antiPatternCount: number;
    };
    compatibility: {
      minVersion: string;
      schemaVersion: string;
    };
  };
  // Knowledge base entries
  knowledge?: KnowledgePack;
  // Skills pack
  skills?: SkillPack;
}

/**
 * Options for unified export
 */
export interface UnifiedExportOptions {
  // Include knowledge base
  includeKnowledge?: boolean;
  // Include skills
  includeSkills?: boolean;
  // Knowledge export options
  knowledgeOptions?: KnowledgeExportOptions;
  // Skill export options
  skillOptions?: SkillExportOptions;
  // Pack name
  packName?: string;
  // Pack description
  packDescription?: string;
}

/**
 * Options for unified import
 */
export interface UnifiedImportOptions {
  // Import knowledge base
  importKnowledge?: boolean;
  // Import skills
  importSkills?: boolean;
  // Knowledge import options
  knowledgeOptions?: KnowledgeImportOptions;
  // Skill import options
  skillOptions?: SkillImportOptions;
}

/**
 * Result of unified import
 */
export interface UnifiedImportResult {
  success: boolean;
  knowledge?: KnowledgeImportResult;
  skills?: SkillImportResult;
  errors: string[];
  warnings: string[];
}

// ============================================
// TIERED RENDERING TYPES
// ============================================

/**
 * Rendering tier for content fetching
 * - intelligence: Content Intelligence (fastest, ~50-200ms)
 *   - Framework data extraction (__NEXT_DATA__, etc.)
 *   - Structured data (JSON-LD, OpenGraph)
 *   - API prediction and direct calling
 *   - Google Cache / Archive.org fallbacks
 *   - Static HTML parsing
 * - lightweight: HTTP + linkedom + Node VM (medium, ~200-500ms)
 * - playwright: Full Chromium browser (slowest, ~2-5s, OPTIONAL)
 */
export type RenderTier = 'intelligence' | 'lightweight' | 'playwright';

// ============================================
// BATCH BROWSE TYPES (F-001)
// ============================================

/**
 * Status of a single URL in a batch operation
 */
export type BatchItemStatus = 'success' | 'error' | 'skipped' | 'rate_limited';

/**
 * Result for a single URL in a batch browse operation
 */
export interface BatchBrowseItem<T> {
  // The URL that was browsed
  url: string;
  // Status of this item
  status: BatchItemStatus;
  // The result (if successful)
  result?: T;
  // Error message (if failed)
  error?: string;
  // Error code (if failed)
  errorCode?: string;
  // Duration in milliseconds
  durationMs: number;
  // Index in the original request
  index: number;
}

/**
 * Options for batch browse operations
 */
export interface BatchBrowseOptions {
  // Maximum concurrent requests (default: 3)
  concurrency?: number;
  // Stop on first error (default: false)
  stopOnError?: boolean;
  // Continue even if rate limited (default: true, will skip rate limited URLs)
  continueOnRateLimit?: boolean;
  // Per-URL timeout (default: use default browse timeout)
  perUrlTimeoutMs?: number;
  // Total batch timeout (default: no limit)
  totalTimeoutMs?: number;
}

/**
 * Domain-specific rendering preference
 */
export interface DomainRenderPreference {
  domain: string;
  preferredTier: RenderTier;
  successCount: number;
  failureCount: number;
  lastUsed: number;
  avgResponseTime: number;
}

/**
 * Result from tiered fetching
 */
export interface TieredFetchResult {
  html: string;
  content: {
    markdown: string;
    text: string;
    title: string;
  };
  tier: RenderTier;
  finalUrl: string;
  fellBack: boolean;
  tiersAttempted: RenderTier[];
  tierReason: string;
  networkRequests: NetworkRequest[];
  discoveredApis: ApiPattern[];
  websocketConnections?: WebSocketConnection[]; // FEAT-003
  timing: {
    total: number;
    perTier: Record<RenderTier, number>;
  };
}
