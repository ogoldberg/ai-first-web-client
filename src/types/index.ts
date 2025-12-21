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
  // Enable VectorStore for semantic skill retrieval (LI-006)
  // When true and VectorStore is available, uses semantic search instead of hash-based matching
  useVectorStore?: boolean;
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
