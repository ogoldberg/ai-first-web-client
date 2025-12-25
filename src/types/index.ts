/**
 * Core types for LLM Browser MCP Server
 */

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
    condition?: 'success' | 'always' | 'has_pagination' | 'has_next';
  }>;
  // Performance metrics
  metrics: {
    successCount: number;
    failureCount: number;
    avgDuration: number;
    lastUsed: number;
    timesUsed: number;
  };
  createdAt: number;
  updatedAt: number;
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
  timing: {
    total: number;
    perTier: Record<RenderTier, number>;
  };
}
