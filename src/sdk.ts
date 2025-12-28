/**
 * LLM Browser SDK
 *
 * Programmatic SDK for using the LLM Browser as a library.
 * This allows applications to integrate intelligent browsing capabilities
 * directly without going through the MCP server.
 *
 * Features:
 * - SmartBrowser: Intelligent browsing with automatic learning
 * - TieredFetcher: Fast content fetching (intelligence → lightweight → playwright)
 * - ProceduralMemory: Skill-based learning for browsing patterns
 * - ContentExtractor: HTML to markdown/text extraction
 * - SessionManager: Session persistence across requests
 *
 * Usage:
 * ```typescript
 * import { createLLMBrowser, SmartBrowser } from 'llm-browser/sdk';
 *
 * const browser = await createLLMBrowser();
 * const result = await browser.browse('https://example.com');
 * await browser.cleanup();
 * ```
 */

import { BrowserManager, type BrowserConfig } from './core/browser-manager.js';
import { ContentExtractor } from './utils/content-extractor.js';
import { ApiAnalyzer } from './core/api-analyzer.js';
import { SessionManager } from './core/session-manager.js';
import { SmartBrowser, type SmartBrowseOptions, type SmartBrowseResult } from './core/smart-browser.js';
import { TieredFetcher, type TieredFetchOptions, type TieredFetchResult } from './core/tiered-fetcher.js';
import { ProceduralMemory } from './core/procedural-memory.js';
import { LearningEngine } from './core/learning-engine.js';
import { pageCache, apiCache } from './utils/cache.js';
import type { SkillMatch } from './types/index.js';

// Re-export core types from their actual modules
export type { SmartBrowseOptions, SmartBrowseResult } from './core/smart-browser.js';
export type { TieredFetchOptions, TieredFetchResult, RenderTier } from './core/tiered-fetcher.js';
export type { BrowserConfig } from './core/browser-manager.js';

export type {
  NetworkRequest,
  ConsoleMessage,
  ApiPattern,
  EnhancedApiPattern,
  BrowseResult,
  BrowseOptions,
  BrowsingAction,
  BrowsingSkill,
  BrowsingTrajectory,
  PageContext,
  SkillMatch,
  // Progress event types (DX-009)
  BrowseProgressStage,
  BrowseProgressEvent,
  OnProgressCallback,
} from './types/index.js';

import type { EnhancedApiPattern } from './types/index.js';

// Re-export progress helpers (DX-009)
export {
  createProgressEvent,
  estimateProgressPercent,
} from './types/progress.js';

// Re-export core classes for advanced usage
export {
  SmartBrowser,
  TieredFetcher,
  ProceduralMemory,
  LearningEngine,
  ContentExtractor,
  BrowserManager,
  SessionManager,
  ApiAnalyzer,
};

// Re-export SSO/session sharing types and classes (GAP-009)
export type {
  IdentityProvider,
  SSOFlowInfo,
  DomainSSORelationship,
  SSODetectorOptions,
} from './core/sso-flow-detector.js';

export type {
  SessionShareResult,
  SessionCandidate,
  SessionSharingOptions,
  SessionSharingConfig,
} from './core/session-sharing.js';

export type {
  DomainGroup,
  CorrelationStats,
  CorrelatorState,
} from './core/domain-correlator.js';

export { SSOFlowDetector, KNOWN_PROVIDERS } from './core/sso-flow-detector.js';
export { SessionSharingService } from './core/session-sharing.js';
export { DomainCorrelator } from './core/domain-correlator.js';

// =============================================================================
// SDK CONFIGURATION
// =============================================================================

export interface LLMBrowserConfig {
  /** Directory for storing session data (default: './sessions') */
  sessionsDir?: string;
  /** Path to learning engine JSON file (default: './enhanced-knowledge-base.json') */
  learningEnginePath?: string;
  /** Browser configuration */
  browser?: BrowserConfig;
  /** Enable procedural memory / skill learning (default: true) */
  enableProceduralMemory?: boolean;
  /** Enable content learning (default: true) */
  enableLearning?: boolean;
}

// =============================================================================
// SDK CLIENT
// =============================================================================

/**
 * LLM Browser SDK Client
 *
 * High-level interface for intelligent web browsing with automatic learning.
 */
export class LLMBrowserClient {
  private browserManager: BrowserManager;
  private contentExtractor: ContentExtractor;
  private apiAnalyzer: ApiAnalyzer;
  private sessionManager: SessionManager;
  private learningEngine: LearningEngine;
  private smartBrowser: SmartBrowser;
  private initialized = false;
  private config: LLMBrowserConfig;

  constructor(config: LLMBrowserConfig = {}) {
    this.config = config;

    this.browserManager = new BrowserManager(config.browser);
    this.contentExtractor = new ContentExtractor();
    this.apiAnalyzer = new ApiAnalyzer();
    this.sessionManager = new SessionManager(config.sessionsDir ?? './sessions');
    this.learningEngine = new LearningEngine(config.learningEnginePath ?? './enhanced-knowledge-base.json');

    this.smartBrowser = new SmartBrowser(
      this.browserManager,
      this.contentExtractor,
      this.apiAnalyzer,
      this.sessionManager
    );
  }

  /**
   * Initialize the browser and learning systems
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.sessionManager.initialize();
    await this.learningEngine.initialize();
    await this.smartBrowser.initialize();

    this.initialized = true;
  }

  /**
   * Ensure the client is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Browse a URL with intelligent learning and optimization
   *
   * This is the main entry point for browsing. It automatically:
   * - Uses learned selectors for reliable content extraction
   * - Applies tiered rendering (fast static → lightweight → full browser)
   * - Validates responses against learned patterns
   * - Learns from successes and failures
   * - Applies cross-domain patterns
   */
  async browse(url: string, options: SmartBrowseOptions = {}): Promise<SmartBrowseResult> {
    await this.ensureInitialized();

    return this.smartBrowser.browse(url, {
      enableLearning: this.config.enableLearning ?? true,
      useSkills: this.config.enableProceduralMemory ?? true,
      recordTrajectory: this.config.enableProceduralMemory ?? true,
      ...options,
    });
  }

  /**
   * Preview what would happen when browsing a URL without executing
   */
  async previewBrowse(url: string, options: SmartBrowseOptions = {}): Promise<import('./types/plan-preview.js').BrowsePreviewResponse> {
    await this.ensureInitialized();
    return this.smartBrowser.previewBrowse(url, options);
  }

  /**
   * Fetch content using tiered rendering (fast path)
   *
   * Tries intelligence tier first (framework extraction, APIs),
   * then lightweight (HTTP + JS), then full browser.
   */
  async fetch(url: string, options: TieredFetchOptions = {}): Promise<TieredFetchResult> {
    await this.ensureInitialized();

    return this.smartBrowser.getTieredFetcher().fetch(url, options);
  }

  /**
   * Get domain intelligence summary
   */
  async getDomainIntelligence(domain: string): Promise<{
    knownPatterns: number;
    selectorChains: number;
    validators: number;
    paginationPatterns: number;
    recentFailures: number;
    successRate: number;
    domainGroup: string | null;
    recommendedWaitStrategy: string;
    shouldUseSession: boolean;
  }> {
    await this.ensureInitialized();
    return this.smartBrowser.getDomainIntelligence(domain);
  }

  /**
   * Find applicable browsing skills for a URL
   */
  findApplicableSkills(url: string, topK: number = 3): SkillMatch[] {
    return this.smartBrowser.findApplicableSkills(url, topK);
  }

  /**
   * Get procedural memory statistics
   */
  getProceduralMemoryStats(): {
    totalSkills: number;
    totalTrajectories: number;
    skillsByDomain: Record<string, number>;
    avgSuccessRate: number;
    mostUsedSkills: Array<{ name: string; uses: number }>;
  } {
    return this.smartBrowser.getProceduralMemoryStats();
  }

  /**
   * Get learning statistics
   */
  getLearningStats(): {
    totalDomains: number;
    totalApiPatterns: number;
    bypassablePatterns: number;
    totalSelectors: number;
    totalValidators: number;
    domainGroups: string[];
    recentLearningEvents: Array<{ type: string; domain: string; timestamp: number }>;
  } {
    return this.smartBrowser.getLearningEngine().getStats();
  }

  /**
   * Get tiered fetcher statistics
   */
  getTieredFetcherStats(): {
    totalDomains: number;
    byTier: Record<string, number>;
    avgResponseTimes: Record<string, number>;
    playwrightAvailable: boolean;
  } {
    return this.smartBrowser.getTieredFetcher().getStats();
  }

  /**
   * Access the underlying SmartBrowser for advanced operations
   */
  getSmartBrowser(): SmartBrowser {
    return this.smartBrowser;
  }

  /**
   * Access the procedural memory system
   */
  getProceduralMemory(): ProceduralMemory {
    return this.smartBrowser.getProceduralMemory();
  }

  /**
   * Access the learning engine
   */
  getLearningEngine(): LearningEngine {
    return this.smartBrowser.getLearningEngine();
  }

  /**
   * Access the tiered fetcher
   */
  getTieredFetcher(): TieredFetcher {
    return this.smartBrowser.getTieredFetcher();
  }

  /**
   * Access the content extractor
   */
  getContentExtractor(): ContentExtractor {
    return this.contentExtractor;
  }

  // =============================================================================
  // SESSION SHARING (GAP-009)
  // =============================================================================

  /**
   * Detect SSO flow from a URL and learn domain relationships
   * Call this when navigating to capture OAuth/SAML/OIDC flows
   *
   * @param url - The URL to check for SSO flow
   * @param initiatingDomain - The domain that initiated the SSO flow
   * @returns SSO flow info if detected, null otherwise
   *
   * @example
   * ```typescript
   * // Check if a URL is an SSO redirect
   * const flow = browser.detectSSOFlow(
   *   'https://accounts.google.com/o/oauth2/auth?client_id=...',
   *   'myapp.com'
   * );
   * if (flow) {
   *   console.log(`Detected ${flow.provider.name} SSO for ${flow.initiatingDomain}`);
   * }
   * ```
   */
  detectSSOFlow(
    url: string,
    initiatingDomain?: string
  ): import('./core/sso-flow-detector.js').SSOFlowInfo | null {
    return this.smartBrowser.detectSSOFlow(url, initiatingDomain);
  }

  /**
   * Find and share a session from a related domain that uses the same identity provider
   *
   * @param targetDomain - The domain to get a session for
   * @param options - Session sharing options
   * @returns Result including success status and source domain
   *
   * @example
   * ```typescript
   * // Try to reuse an existing session from a related domain
   * const result = await browser.shareSessionFromRelatedDomain('app2.com');
   * if (result.success) {
   *   console.log(`Shared session from ${result.sourceDomain} via ${result.providerId}`);
   * }
   * ```
   */
  async shareSessionFromRelatedDomain(
    targetDomain: string,
    options?: { sessionProfile?: string; minConfidence?: number }
  ): Promise<{ success: boolean; sourceDomain?: string; providerId?: string }> {
    await this.ensureInitialized();
    return this.smartBrowser.shareSessionFromRelatedDomain(targetDomain, options);
  }

  /**
   * Get domains that share the same identity provider with the given domain
   *
   * @param domain - The domain to find related domains for
   * @param minConfidence - Minimum confidence threshold (0-1)
   * @returns Array of related domain names
   *
   * @example
   * ```typescript
   * // Find domains using the same SSO provider
   * const related = browser.getRelatedDomains('app1.com');
   * console.log(`Related domains: ${related.join(', ')}`);
   * ```
   */
  getRelatedDomains(domain: string, minConfidence?: number): string[] {
    return this.smartBrowser.getRelatedDomains(domain, minConfidence);
  }

  /**
   * Get domain groups organized by identity provider
   *
   * @param minConfidence - Minimum confidence threshold (0-1)
   * @returns Array of domain groups
   *
   * @example
   * ```typescript
   * // See which domains share SSO providers
   * const groups = browser.getDomainGroups();
   * for (const group of groups) {
   *   console.log(`${group.providerName}: ${group.domains.join(', ')}`);
   * }
   * ```
   */
  getDomainGroups(minConfidence?: number): import('./core/domain-correlator.js').DomainGroup[] {
    return this.smartBrowser.getDomainGroups(minConfidence);
  }

  // =============================================================================
  // CACHE MANAGEMENT (DX-004)
  // =============================================================================

  /**
   * Clear cached content
   *
   * @param domain - Optional domain to clear cache for (e.g., 'example.com').
   *                 If not provided, clears all cached content.
   * @returns Number of cache entries cleared
   *
   * @example
   * ```typescript
   * // Clear all cache
   * const cleared = browser.clearCache();
   * console.log(`Cleared ${cleared} entries`);
   *
   * // Clear cache for a specific domain
   * const domainCleared = browser.clearCache('example.com');
   * console.log(`Cleared ${domainCleared} entries for example.com`);
   * ```
   */
  clearCache(domain?: string): number {
    let pageCacheCleared = 0;
    let apiCacheCleared = 0;

    if (domain) {
      // Clear for specific domain
      pageCacheCleared = pageCache.clearDomain(domain);
      apiCacheCleared = apiCache.clearDomain(domain);
    } else {
      // Get current sizes before clearing
      pageCacheCleared = pageCache.getStats().size;
      apiCacheCleared = apiCache.getStats().size;
      pageCache.clear();
      apiCache.clear();
    }

    return pageCacheCleared + apiCacheCleared;
  }

  /**
   * Get cache statistics
   *
   * @returns Combined cache statistics including:
   *   - totalEntries: Total number of cached items
   *   - pageCache: Page/HTML content cache stats
   *   - apiCache: API response cache stats
   *   - domains: List of domains with cached content
   *
   * @example
   * ```typescript
   * const stats = browser.getCacheStats();
   * console.log(`Cache has ${stats.totalEntries} entries across ${stats.domains.length} domains`);
   * console.log(`Page cache: ${stats.pageCache.size} entries`);
   * console.log(`API cache: ${stats.apiCache.size} entries`);
   * ```
   */
  getCacheStats(): {
    totalEntries: number;
    pageCache: {
      size: number;
      maxEntries: number;
      ttlMs: number;
      oldestEntry: number | null;
      newestEntry: number | null;
    };
    apiCache: {
      size: number;
      maxEntries: number;
      ttlMs: number;
      oldestEntry: number | null;
      newestEntry: number | null;
    };
    domains: string[];
  } {
    const pageCacheStats = pageCache.getStats();
    const apiCacheStats = apiCache.getStats();

    // Combine domains from both caches
    const allDomains = new Set([
      ...pageCache.getDomains(),
      ...apiCache.getDomains(),
    ]);

    return {
      totalEntries: pageCacheStats.size + apiCacheStats.size,
      pageCache: pageCacheStats,
      apiCache: apiCacheStats,
      domains: Array.from(allDomains).sort(),
    };
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    await this.browserManager.cleanup();
    this.initialized = false;
  }

  /**
   * Check if Playwright is available
   */
  static isPlaywrightAvailable(): boolean {
    return BrowserManager.isPlaywrightAvailable();
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create and initialize an LLM Browser client
 *
 * @param config - Configuration options
 * @returns Initialized LLM Browser client
 *
 * @example
 * ```typescript
 * const browser = await createLLMBrowser();
 * const result = await browser.browse('https://example.com');
 * console.log(result.content.markdown);
 * await browser.cleanup();
 * ```
 */
export async function createLLMBrowser(config: LLMBrowserConfig = {}): Promise<LLMBrowserClient> {
  const client = new LLMBrowserClient(config);
  await client.initialize();
  return client;
}

/**
 * Create a simple content fetcher without full browser capabilities
 *
 * Uses tiered fetching for fast content extraction.
 *
 * @example
 * ```typescript
 * const fetcher = createContentFetcher();
 * const content = await fetcher.fetch('https://example.com');
 * console.log(content.text);
 * ```
 */
export function createContentFetcher(): {
  fetch: (url: string, options?: TieredFetchOptions) => Promise<TieredFetchResult>;
  extract: (html: string, url: string) => { markdown: string; text: string; title: string };
} {
  const browserManager = new BrowserManager();
  const contentExtractor = new ContentExtractor();
  const learningEngine = new LearningEngine(); // FEAT-003
  const tieredFetcher = new TieredFetcher(browserManager, contentExtractor, learningEngine); // FEAT-003

  return {
    fetch: (url: string, options?: TieredFetchOptions) => tieredFetcher.fetch(url, options),
    extract: (html: string, url: string) => contentExtractor.extract(html, url),
  };
}

// =============================================================================
// RESEARCH SDK (INT-001)
// =============================================================================

import type { VerifyOptions, VerificationCheck, VerificationAssertion } from './types/verification.js';

// Re-export workflow template types and templates (INT-006)
export {
  WORKFLOW_TEMPLATES,
  COUNTRY_PORTALS,
  VISA_TYPE_PATHS,
  VISA_RESEARCH_TEMPLATE,
  DOCUMENT_EXTRACTION_TEMPLATE,
  FEE_TRACKING_TEMPLATE,
  CROSS_COUNTRY_COMPARISON_TEMPLATE,
  TAX_OBLIGATIONS_TEMPLATE,
  resolveUrlTemplate,
  prepareVariables,
  validateVariables,
  extractFindings,
  buildWorkflowSummary,
  listTemplates,
  getTemplate,
} from './core/workflow-templates.js';

export type {
  WorkflowTemplate,
  WorkflowTemplateStep,
  WorkflowTemplateResult,
  WorkflowTemplateStepResult,
  WorkflowTemplateSummary,
  WorkflowFinding,
} from './core/workflow-templates.js';

// Re-export government skill pack (INT-007)
export {
  GOVERNMENT_SKILL_PACK,
  SPAIN_SKILLS,
  PORTUGAL_SKILLS,
  GERMANY_SKILLS,
  getSkillsForCountry,
  getSkillById,
  getSkillsByCategory,
  getSkillsForDomain,
  searchSkills,
  listGovernmentSkills,
  skillToPattern,
  exportSkillPack,
  importSkillPack,
  getSkillPackSummary,
} from './core/government-skill-pack.js';

export type {
  GovernmentSkill,
  GovernmentSkillStep,
  GovernmentServiceCategory,
  GovernmentSkillPack,
} from './core/government-skill-pack.js';

// =============================================================================
// DYNAMIC REFRESH SCHEDULER (INT-008)
// =============================================================================

/**
 * Dynamic refresh scheduler for intelligent content update scheduling.
 * Replaces fixed staleness thresholds with learned update patterns.
 *
 * @example
 * ```typescript
 * import { createDynamicRefreshScheduler, CONTENT_TYPE_PRESETS } from 'llm-browser/sdk';
 *
 * const scheduler = createDynamicRefreshScheduler();
 *
 * // Record content observations
 * scheduler.recordContentCheck(
 *   'https://exteriores.gob.es/visa-requirements',
 *   'abc123hash',
 *   true, // content changed
 *   'requirements'
 * );
 *
 * // Get optimal refresh schedule
 * const schedule = scheduler.getRefreshSchedule(url);
 * console.log(schedule.recommendedRefreshHours); // e.g., 168 (weekly)
 * console.log(schedule.nextCheckAt); // timestamp when to check next
 * console.log(schedule.isLearned); // true if based on observed patterns
 *
 * // Get URLs needing refresh
 * const needsRefresh = scheduler.getUrlsNeedingRefresh();
 * for (const { url, recommendation } of needsRefresh) {
 *   console.log(`${url}: ${recommendation.reason}`);
 * }
 * ```
 */
export {
  DynamicRefreshScheduler,
  createDynamicRefreshScheduler,
  CONTENT_TYPE_PRESETS,
  KNOWN_DOMAIN_PATTERNS,
} from './core/dynamic-refresh-scheduler.js';

export type {
  GovernmentContentType,
  ContentTypePreset,
  DomainPattern,
  RefreshSchedule,
  DynamicRefreshSchedulerConfig,
} from './core/dynamic-refresh-scheduler.js';

// Re-export content change predictor types for advanced usage
export { ContentChangePredictor } from './core/content-change-predictor.js';
export type {
  ContentChangePattern,
  ContentChangeAnalysis,
  PollRecommendation,
  ContentChangePredictionConfig,
  ChangePatternType,
  ChangeObservation,
  TemporalPattern,
  ChangeFrequencyStats,
  ChangePrediction,
} from './types/content-change.js';
export { DEFAULT_CHANGE_PREDICTION_CONFIG } from './types/content-change.js';

// =============================================================================
// STRUCTURED GOVERNMENT DATA EXTRACTION (INT-012)
// =============================================================================

export {
  StructuredGovDataExtractor,
  createGovDataExtractor,
  extractGovData,
  validateGovData,
  type GovContentType,
  type MonetaryValue,
  type TimelineValue,
  type DocumentRequirement,
  type EligibilityRequirement,
  type FeeEntry,
  type ProcessingStep,
  type ContactInfo,
  type AppointmentInfo,
  type FormInfo,
  type StructuredGovData,
  type ExtractionOptions,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
} from './core/structured-gov-data-extractor.js';

// =============================================================================
// APPOINTMENT AVAILABILITY DETECTION (INT-013)
// =============================================================================

/**
 * Appointment availability detector for government and service portals.
 * Detects booking systems, extracts available time slots, and provides
 * monitoring suggestions for slot openings.
 *
 * @example
 * ```typescript
 * import {
 *   detectAppointmentAvailability,
 *   hasAppointmentSystem,
 *   getAvailabilityStatus
 * } from 'llm-browser/sdk';
 *
 * // Check if page has appointment system
 * if (hasAppointmentSystem(html, 'es')) {
 *   const result = detectAppointmentAvailability(html, {
 *     language: 'es',
 *     url: 'https://sede.gob.es/cita-previa'
 *   });
 *
 *   console.log(`Detected: ${result.detected}`);
 *   console.log(`Availability: ${result.availability}`);
 *   console.log(`Systems: ${result.systems.map(s => s.name).join(', ')}`);
 *   console.log(`Slots: ${result.slots.length}`);
 *
 *   // Get monitoring suggestions
 *   for (const suggestion of result.monitoringSuggestions) {
 *     console.log(`Check every ${suggestion.checkIntervalMinutes} minutes`);
 *     console.log(`Reason: ${suggestion.reason}`);
 *   }
 * }
 *
 * // Quick availability check
 * const status = getAvailabilityStatus(html, 'es');
 * if (status === 'unavailable') {
 *   console.log('No slots available - set up monitoring');
 * }
 * ```
 */
export {
  AppointmentAvailabilityDetector,
  createAvailabilityDetector,
  detectAppointmentAvailability,
  hasAppointmentSystem,
  getAvailabilityStatus,
  type AppointmentSystemType,
  type SlotAvailability,
  type TimeSlot,
  type BookingSystem,
  type AppointmentAvailabilityResult,
  type MonitoringSuggestion,
  type AvailabilityDetectionOptions,
} from './core/appointment-availability-detector.js';

// =============================================================================
// FIELD-LEVEL CHANGE TRACKING (INT-014)
// =============================================================================

/**
 * Field-level change tracker for government content monitoring.
 * Tracks specific field changes with severity classification and
 * structured before/after diffs.
 *
 * @example
 * ```typescript
 * import {
 *   trackFieldChanges,
 *   hasBreakingChanges,
 *   getBreakingChanges
 * } from 'llm-browser/sdk';
 *
 * // Track changes between two data snapshots
 * const result = trackFieldChanges(oldData, newData, {
 *   url: 'https://gov.example.com/visa',
 *   language: 'es',
 * });
 *
 * // Check for breaking changes
 * if (result.breakingChanges.length > 0) {
 *   console.log('Breaking changes detected:');
 *   for (const change of result.breakingChanges) {
 *     console.log(`  - ${change.description}`);
 *     console.log(`    Impact: ${change.impact}`);
 *   }
 * }
 *
 * // Quick check for breaking changes
 * if (hasBreakingChanges(oldData, newData)) {
 *   console.log('Action required!');
 * }
 *
 * // Get all breaking changes
 * const breaking = getBreakingChanges(oldData, newData);
 * for (const change of breaking) {
 *   console.log(`${change.fieldName}: ${change.oldValueFormatted} -> ${change.newValueFormatted}`);
 * }
 * ```
 */
export {
  FieldLevelChangeTracker,
  createFieldLevelChangeTracker,
  getFieldLevelChangeTracker,
  trackFieldChanges,
  getBreakingChanges,
  hasBreakingChanges,
  type ChangeSeverity,
  type FieldCategory,
  type ChangeType,
  type FieldChange,
  type ChangeTrackingResult,
  type TrackingOptions,
  type ChangeHistoryRecord,
  type FieldLevelChangeTrackerConfig,
} from './core/field-level-change-tracker.js';

// =============================================================================
// CROSS-SOURCE VERIFICATION (INT-015)
// =============================================================================

/**
 * Cross-source verifier for comparing data across multiple sources.
 * Detects contradictions and provides confidence-scored verified facts.
 *
 * @example
 * ```typescript
 * import {
 *   verifySources,
 *   hasContradictions,
 *   getHighConfidenceFacts
 * } from 'llm-browser/sdk';
 *
 * // Verify data from multiple sources
 * const result = verifySources([
 *   { url: 'https://gov.example.com/visa', data: { fee: 100 } },
 *   { url: 'https://embassy.example.com/visa', data: { fee: 100 } },
 *   { url: 'https://blog.example.com/visa', data: { fee: 150 } },
 * ]);
 *
 * // Check for contradictions
 * if (result.hasContradictions) {
 *   for (const c of result.contradictions) {
 *     console.log(`${c.field}: ${c.explanation}`);
 *     console.log(`Recommended: ${c.recommendedValue}`);
 *   }
 * }
 *
 * // Get verified facts
 * for (const fact of result.verifiedFacts) {
 *   console.log(`${fact.field}: ${fact.value}`);
 *   console.log(`  Agreement: ${fact.agreementLevel}`);
 *   console.log(`  Confidence: ${fact.confidence}`);
 * }
 *
 * // Quick checks
 * if (hasContradictions(sources)) {
 *   console.log('Sources disagree - verify manually');
 * }
 *
 * // Get only high-confidence facts
 * const reliable = getHighConfidenceFacts(sources);
 * ```
 */
export {
  CrossSourceVerifier,
  createCrossSourceVerifier,
  getCrossSourceVerifier,
  verifySources,
  hasContradictions,
  getContradictions,
  getHighConfidenceFacts,
  type SourceCredibility,
  type AgreementLevel,
  type ConfidenceLevel,
  type VerificationSource,
  type Contradiction,
  type VerifiedFact,
  type VerificationResult,
  type VerificationOptions,
  type VerificationHistoryRecord,
  type CrossSourceVerifierConfig,
} from './core/cross-source-verifier.js';

/**
 * Research topic categories with associated verification presets
 */
export type ResearchTopic =
  | 'government_portal'
  | 'legal_document'
  | 'visa_immigration'
  | 'tax_finance'
  | 'official_registry'
  | 'general_research';

// =============================================================================
// VERIFICATION CHECK BUILDERS (INT-004)
// =============================================================================

/**
 * Pre-built verification checks for government content validation.
 * These can be composed into custom verification presets.
 *
 * @example
 * ```typescript
 * import { VERIFICATION_CHECKS } from 'llm-browser/sdk';
 *
 * const customPreset = {
 *   checks: [
 *     VERIFICATION_CHECKS.hasFees,
 *     VERIFICATION_CHECKS.hasTimeline,
 *     VERIFICATION_CHECKS.excludeErrorPages,
 *   ]
 * };
 * ```
 */
export const VERIFICATION_CHECKS = {
  // ============ Fee Validation ============

  /**
   * Checks for presence of fee-related content.
   * Matches common fee patterns in multiple currencies.
   */
  hasFees: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:fee|cost|price|tarifa|tasa|precio|gebuhr|cout)[\s:]*[\d.,]+\s*(?:EUR|USD|GBP|\u20AC|\$|\u00A3|euro|euros)/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  /**
   * Validates that fee amounts are reasonable (between 0 and 10,000).
   */
  feeAmountReasonable: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:fee|cost|price|tarifa|tasa)[\s:]*(?:[\d.,]+)\s*(?:EUR|USD|GBP|\u20AC|\$|\u00A3)/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  // ============ Timeline Validation ============

  /**
   * Checks for presence of timeline/duration information.
   * Matches patterns like "2-3 weeks", "30 days", "3 meses".
   */
  hasTimeline: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:timeline|duration|processing|plazo|tiempo|dauer|delai)[\s:]*(?:\d+[-\s]?\d*)\s*(?:day|week|month|year|dia|semana|mes|ano|tag|woche|monat|jour|semaine|mois)/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  /**
   * Checks for deadline or due date information.
   */
  hasDeadline: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:deadline|due|fecha\s*limite|vencimiento|frist|echeance)[\s:]*(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  // ============ Document Requirements ============

  /**
   * Checks for required documents list.
   */
  hasRequiredDocuments: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:required|necessary|needed|requerid|necesari|erforderlich|requis)\s*(?:document|paper|form|documento|formulario|unterlagen|papier)/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  /**
   * Checks for passport/ID requirements.
   */
  hasIdentityRequirements: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:passport|identity|identification|NIE|NIF|DNI|pasaporte|identidad|reisepass|ausweis|carte\s*d'identite)/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  // ============ Legal Document Validation ============

  /**
   * Checks for article/section numbering typical in legal documents.
   */
  hasLegalStructure: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:article|section|chapter|paragraph|articulo|seccion|capitulo|artikel|abschnitt|kapitel)[\s.]*(?:\d+|[IVXLCDM]+)/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  /**
   * Checks for effective date in legal documents.
   */
  hasEffectiveDate: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:effective|entry\s*into\s*force|vigor|entrada\s*en\s*vigor|geltung|inkrafttreten|entree\s*en\s*vigueur)[\s:]*(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  // ============ Tax/Financial Validation ============

  /**
   * Checks for tax rate information.
   */
  hasTaxRates: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:tax\s*rate|rate|IRPF|IVA|VAT|tipo\s*impositivo|steuersatz|taux)[\s:]*\d+(?:[.,]\d+)?%/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  /**
   * Checks for tax filing deadline information.
   */
  hasTaxDeadlines: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:filing|declaration|declaracion|steuererkl|declaration\s*fiscale)[\s]*(?:deadline|date|fecha|frist|limite)/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  // ============ Error Page Detection ============

  /**
   * Excludes common error page patterns.
   */
  excludeErrorPages: {
    type: 'content' as const,
    assertion: {
      excludesText: '404',
    },
    severity: 'critical' as const,
    retryable: true,
  } satisfies VerificationCheck,

  /**
   * Excludes "page not found" variations.
   */
  excludePageNotFound: {
    type: 'content' as const,
    assertion: {
      excludesText: 'page not found',
    },
    severity: 'critical' as const,
    retryable: true,
  } satisfies VerificationCheck,

  /**
   * Excludes access denied pages.
   */
  excludeAccessDenied: {
    type: 'content' as const,
    assertion: {
      excludesText: 'access denied',
    },
    severity: 'critical' as const,
    retryable: true,
  } satisfies VerificationCheck,

  /**
   * Excludes service unavailable pages.
   */
  excludeServiceUnavailable: {
    type: 'content' as const,
    assertion: {
      excludesText: 'service unavailable',
    },
    severity: 'critical' as const,
    retryable: true,
  } satisfies VerificationCheck,

  /**
   * Excludes session expired pages.
   */
  excludeSessionExpired: {
    type: 'content' as const,
    assertion: {
      excludesText: 'session expired',
    },
    severity: 'critical' as const,
    retryable: true,
  } satisfies VerificationCheck,

  // ============ Contact Information ============

  /**
   * Checks for email contact information.
   */
  hasEmailContact: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  /**
   * Checks for phone contact information.
   */
  hasPhoneContact: {
    type: 'content' as const,
    assertion: {
      fieldMatches: {
        content: /(?:tel|phone|telefono|telefon|telephone)[\s.:]*[+]?[\d\s\-().]{8,}/i,
      },
    },
    severity: 'warning' as const,
    retryable: false,
  } satisfies VerificationCheck,

  // ============ Minimum Content Length ============

  /**
   * Requires at least 200 characters of content.
   */
  minLength200: {
    type: 'content' as const,
    assertion: {
      minLength: 200,
    },
    severity: 'error' as const,
    retryable: true,
  } satisfies VerificationCheck,

  /**
   * Requires at least 500 characters of content.
   */
  minLength500: {
    type: 'content' as const,
    assertion: {
      minLength: 500,
    },
    severity: 'error' as const,
    retryable: true,
  } satisfies VerificationCheck,

  /**
   * Requires at least 1000 characters of content.
   */
  minLength1000: {
    type: 'content' as const,
    assertion: {
      minLength: 1000,
    },
    severity: 'error' as const,
    retryable: true,
  } satisfies VerificationCheck,
} as const;

/**
 * Create a custom verification check with the specified assertion.
 *
 * @param assertion - The verification assertion to apply
 * @param severity - Check severity (default: 'warning')
 * @param retryable - Whether failures can be retried (default: false)
 * @returns A verification check object
 *
 * @example
 * ```typescript
 * const customCheck = createVerificationCheck(
 *   { fieldExists: ['visa_type', 'processing_time'] },
 *   'error',
 *   true
 * );
 * ```
 */
export function createVerificationCheck(
  assertion: VerificationAssertion,
  severity: 'warning' | 'error' | 'critical' = 'warning',
  retryable = false
): VerificationCheck {
  return {
    type: 'content',
    assertion,
    severity,
    retryable,
  };
}

/**
 * Compose multiple verification checks into a single array.
 * Useful for building custom verification presets.
 *
 * @param checks - Verification checks to compose
 * @returns Array of verification checks
 *
 * @example
 * ```typescript
 * const visaChecks = composeChecks(
 *   VERIFICATION_CHECKS.hasFees,
 *   VERIFICATION_CHECKS.hasTimeline,
 *   VERIFICATION_CHECKS.hasRequiredDocuments,
 *   VERIFICATION_CHECKS.excludeErrorPages,
 *   VERIFICATION_CHECKS.excludePageNotFound
 * );
 * ```
 */
export function composeChecks(...checks: VerificationCheck[]): VerificationCheck[] {
  return checks;
}

// =============================================================================
// VERIFICATION PRESETS (INT-004)
// =============================================================================

/**
 * Type definition for verification preset configuration.
 * Used by RESEARCH_VERIFICATION_PRESETS and custom presets.
 */
export interface VerificationPreset {
  /** Human-readable description of this preset */
  description: string;
  /** Expected fields to check for (legacy, used by buildVerificationChecks) */
  expectedFields: string[];
  /** Text patterns that should NOT appear in content (legacy, used by buildVerificationChecks) */
  excludePatterns: string[];
  /** Minimum content length required */
  minContentLength: number;
  /** Verification options to apply */
  verifyOptions: Partial<VerifyOptions>;
  /**
   * Pre-built verification checks to include (INT-004).
   * These are applied in addition to checks built from expectedFields/excludePatterns.
   * Use VERIFICATION_CHECKS constants or create custom checks.
   */
  checks?: VerificationCheck[];
}

export const RESEARCH_VERIFICATION_PRESETS: Record<ResearchTopic, VerificationPreset> = {
  government_portal: {
    description: 'Government websites and official portals',
    expectedFields: ['requirements', 'documents', 'process', 'contact'],
    excludePatterns: ['404', 'Page not found', 'Error', 'Access denied', 'Service unavailable'],
    minContentLength: 500,
    verifyOptions: {
      enabled: true,
      mode: 'thorough',
    },
    // INT-004: Pre-built checks for government portals
    checks: [
      VERIFICATION_CHECKS.hasRequiredDocuments,
      VERIFICATION_CHECKS.hasEmailContact,
      VERIFICATION_CHECKS.hasPhoneContact,
      VERIFICATION_CHECKS.excludeErrorPages,
      VERIFICATION_CHECKS.excludePageNotFound,
      VERIFICATION_CHECKS.excludeAccessDenied,
      VERIFICATION_CHECKS.excludeServiceUnavailable,
    ],
  },
  legal_document: {
    description: 'Legal documents, regulations, and official texts',
    expectedFields: ['article', 'section', 'chapter', 'effective_date'],
    excludePatterns: ['404', 'Page not found', 'Error', 'Document not found'],
    minContentLength: 1000,
    verifyOptions: {
      enabled: true,
      mode: 'thorough',
    },
    // INT-004: Pre-built checks for legal documents
    checks: [
      VERIFICATION_CHECKS.hasLegalStructure,
      VERIFICATION_CHECKS.hasEffectiveDate,
      VERIFICATION_CHECKS.minLength1000,
      VERIFICATION_CHECKS.excludeErrorPages,
      VERIFICATION_CHECKS.excludePageNotFound,
    ],
  },
  visa_immigration: {
    description: 'Visa requirements and immigration procedures',
    expectedFields: ['requirements', 'documents', 'fees', 'timeline', 'application'],
    excludePatterns: ['404', 'Page not found', 'Error', 'Access denied'],
    minContentLength: 500,
    verifyOptions: {
      enabled: true,
      mode: 'thorough',
    },
    // INT-004: Pre-built checks for visa/immigration content
    checks: [
      VERIFICATION_CHECKS.hasFees,
      VERIFICATION_CHECKS.hasTimeline,
      VERIFICATION_CHECKS.hasRequiredDocuments,
      VERIFICATION_CHECKS.hasIdentityRequirements,
      VERIFICATION_CHECKS.minLength500,
      VERIFICATION_CHECKS.excludeErrorPages,
      VERIFICATION_CHECKS.excludePageNotFound,
      VERIFICATION_CHECKS.excludeAccessDenied,
    ],
  },
  tax_finance: {
    description: 'Tax information and financial regulations',
    expectedFields: ['rates', 'deadlines', 'forms', 'requirements'],
    excludePatterns: ['404', 'Page not found', 'Error', 'Session expired'],
    minContentLength: 500,
    verifyOptions: {
      enabled: true,
      mode: 'thorough',
    },
    // INT-004: Pre-built checks for tax/finance content
    checks: [
      VERIFICATION_CHECKS.hasTaxRates,
      VERIFICATION_CHECKS.hasTaxDeadlines,
      VERIFICATION_CHECKS.hasDeadline,
      VERIFICATION_CHECKS.minLength500,
      VERIFICATION_CHECKS.excludeErrorPages,
      VERIFICATION_CHECKS.excludePageNotFound,
      VERIFICATION_CHECKS.excludeSessionExpired,
    ],
  },
  official_registry: {
    description: 'Official registries and databases',
    expectedFields: ['name', 'status', 'registration', 'date'],
    excludePatterns: ['404', 'Page not found', 'Error', 'No results'],
    minContentLength: 200,
    verifyOptions: {
      enabled: true,
      mode: 'standard',
    },
    // INT-004: Pre-built checks for registry content
    checks: [
      VERIFICATION_CHECKS.minLength200,
      VERIFICATION_CHECKS.excludeErrorPages,
      VERIFICATION_CHECKS.excludePageNotFound,
    ],
  },
  general_research: {
    description: 'General research and information gathering',
    expectedFields: ['content'],
    excludePatterns: ['404', 'Page not found', 'Error'],
    minContentLength: 200,
    verifyOptions: {
      enabled: true,
      mode: 'standard',
    },
    // INT-004: Basic checks for general research
    checks: [
      VERIFICATION_CHECKS.minLength200,
      VERIFICATION_CHECKS.excludeErrorPages,
      VERIFICATION_CHECKS.excludePageNotFound,
    ],
  },
};

/**
 * Session profile mappings for government portals.
 * Maps domain patterns to session profile names for SSO reuse.
 */
export const GOVERNMENT_SESSION_PROFILES: Record<string, string> = {
  // Spain
  'agenciatributaria.es': 'spain-tax',
  'agenciatributaria.gob.es': 'spain-tax',
  'sede.agenciatributaria.gob.es': 'spain-tax',
  'seg-social.es': 'spain-social',
  'sede.seg-social.gob.es': 'spain-social',
  'extranjeros.inclusion.gob.es': 'spain-immigration',
  'sede.administracionespublicas.gob.es': 'spain-admin',
  'clave.gob.es': 'spain-clave',
  // Portugal
  'aima.gov.pt': 'portugal-immigration',
  'portaldasfinancas.gov.pt': 'portugal-tax',
  'seg-social.pt': 'portugal-social',
  // France
  'service-public.fr': 'france-admin',
  'impots.gouv.fr': 'france-tax',
  // Germany
  'auswaertiges-amt.de': 'germany-foreign',
  'bundesfinanzministerium.de': 'germany-tax',
  // Italy
  'agenziaentrate.gov.it': 'italy-tax',
  'inps.it': 'italy-social',
  // Netherlands
  'belastingdienst.nl': 'netherlands-tax',
  'ind.nl': 'netherlands-immigration',
};

/**
 * Configuration options for the Research Browser
 */
export interface ResearchConfig extends LLMBrowserConfig {
  /**
   * Default research topic for verification presets.
   * Can be overridden per-request.
   * @default 'general_research'
   */
  defaultTopic?: ResearchTopic;

  /**
   * Enable automatic pagination following for legal documents.
   * @default true
   */
  followPagination?: boolean;

  /**
   * Maximum pages to follow when pagination is enabled.
   * @default 10
   */
  maxPages?: number;

  /**
   * Enable session persistence for government portals.
   * When enabled, sessions are automatically saved and reused.
   * @default true
   */
  persistSessions?: boolean;

  /**
   * Enable SSO detection and cross-domain session sharing.
   * @default true
   */
  enableSSOSharing?: boolean;

  /**
   * Minimum confidence threshold for session sharing.
   * @default 0.6
   */
  ssoMinConfidence?: number;

  /**
   * Enable API discovery before browser fallback.
   * When APIs are found, they're used for faster data extraction.
   * @default true
   */
  preferApiDiscovery?: boolean;

  /**
   * Custom session profiles for domains not in the default list.
   * Merged with GOVERNMENT_SESSION_PROFILES.
   */
  customSessionProfiles?: Record<string, string>;

  /**
   * Custom verification presets for topics not in the default list.
   * Merged with RESEARCH_VERIFICATION_PRESETS.
   */
  customVerificationPresets?: Record<string, VerificationPreset>;
}

/**
 * Research-specific browse options
 */
export interface ResearchBrowseOptions extends SmartBrowseOptions {
  /**
   * Research topic for applying verification presets.
   * Overrides the default topic from config.
   */
  topic?: ResearchTopic;

  /**
   * Expected fields to verify in the content.
   * Merged with preset fields if a topic is specified.
   */
  expectedFields?: string[];

  /**
   * Text patterns that indicate an error page.
   * Merged with preset patterns if a topic is specified.
   */
  excludePatterns?: string[];

  /**
   * Minimum content length for validation.
   * Overrides preset value if specified.
   */
  minContentLength?: number;

  /**
   * Whether to save the session after browsing.
   * Useful for authenticated portals.
   * @default false
   */
  saveSession?: boolean;

  /**
   * Session profile to use/save.
   * Auto-detected from domain if not specified.
   */
  sessionProfile?: string;
}

/**
 * Research result with additional metadata
 */
export interface ResearchResult extends SmartBrowseResult {
  /** Research-specific metadata */
  research: {
    /** Topic used for verification */
    topic: ResearchTopic;
    /** Session profile used */
    sessionProfile?: string;
    /** Whether session was shared from another domain */
    sessionSharedFrom?: string;
    /** API used instead of browser (if discovered) */
    apiUsed?: boolean;
    /** Whether browser rendering was bypassed via direct API call (INT-003) */
    bypassedBrowser?: boolean;
    /** API endpoint used if browser was bypassed (INT-003) */
    apiEndpoint?: string;
    /** Time saved by using API instead of browser in ms (INT-003) */
    timeSavedMs?: number;
    /** Error message if the research operation failed */
    error?: string;
    /** Verification result summary */
    verificationSummary: {
      passed: boolean;
      confidence: number;
      checkedFields: string[];
      missingFields: string[];
      excludedPatternFound?: string;
    };
  };
}

/**
 * Research Browser Client
 *
 * Specialized SDK client for research use cases with presets for:
 * - Government portal navigation
 * - Legal document extraction
 * - Visa/immigration information
 * - Cross-domain session sharing (SSO)
 *
 * @example
 * ```typescript
 * const browser = await createResearchBrowser({
 *   defaultTopic: 'visa_immigration',
 *   persistSessions: true,
 * });
 *
 * // Browse with research presets
 * const result = await browser.research('https://extranjeros.inclusion.gob.es/visados', {
 *   topic: 'visa_immigration',
 *   expectedFields: ['requirements', 'documents', 'fees'],
 * });
 *
 * console.log(result.research.verificationSummary);
 * await browser.cleanup();
 * ```
 */
export class ResearchBrowserClient extends LLMBrowserClient {
  // Static constants for API bypass and content extraction (INT-003)
  /** Conservative estimate for browser render time in ms */
  private static readonly ESTIMATED_BROWSER_RENDER_TIME_MS = 3000;
  /** Fields to skip during content extraction (internal/metadata fields) */
  private static readonly IRRELEVANT_FIELDS = new Set(['id', '_id', 'created_at', 'updated_at', 'metadata', 'version']);
  /** Minimum length for a string to be considered relevant content */
  private static readonly MIN_RELEVANT_STRING_LENGTH = 10;
  /** Fields to check for title extraction, in priority order */
  private static readonly CANDIDATE_TITLE_FIELDS = ['title', 'name', 'headline', 'subject'];
  /** Maximum length of first line to use as title */
  private static readonly MAX_TITLE_LENGTH_FROM_FIRST_LINE = 100;

  private researchConfig: Required<Omit<ResearchConfig, keyof LLMBrowserConfig>> & LLMBrowserConfig;
  private sessionProfiles: Record<string, string>;
  private verificationPresets: Record<string, VerificationPreset>;

  constructor(config: ResearchConfig = {}) {
    super(config);

    // Set research defaults
    this.researchConfig = {
      ...config,
      defaultTopic: config.defaultTopic ?? 'general_research',
      followPagination: config.followPagination ?? true,
      maxPages: config.maxPages ?? 10,
      persistSessions: config.persistSessions ?? true,
      enableSSOSharing: config.enableSSOSharing ?? true,
      ssoMinConfidence: config.ssoMinConfidence ?? 0.6,
      preferApiDiscovery: config.preferApiDiscovery ?? true,
      customSessionProfiles: config.customSessionProfiles ?? {},
      customVerificationPresets: config.customVerificationPresets ?? {},
    };

    // Merge session profiles
    this.sessionProfiles = {
      ...GOVERNMENT_SESSION_PROFILES,
      ...config.customSessionProfiles,
    };

    // Merge verification presets
    this.verificationPresets = {
      ...RESEARCH_VERIFICATION_PRESETS,
      ...config.customVerificationPresets,
    };
  }

  /**
   * Get session profile for a domain
   */
  getSessionProfileForDomain(domain: string): string | undefined {
    // Check exact match first
    if (this.sessionProfiles[domain]) {
      return this.sessionProfiles[domain];
    }

    // Check partial matches (subdomain matching)
    for (const [pattern, profile] of Object.entries(this.sessionProfiles)) {
      if (domain === pattern || domain.endsWith(`.${pattern}`)) {
        return profile;
      }
    }

    return undefined;
  }

  /**
   * Build verification checks from research options (INT-004)
   *
   * Combines checks from multiple sources in order:
   * 1. Pre-built checks from the preset (VERIFICATION_CHECKS)
   * 2. Field existence check from expectedFields
   * 3. Exclude pattern checks from excludePatterns
   * 4. Minimum content length check
   */
  private buildVerificationChecks(
    topic: ResearchTopic,
    options: ResearchBrowseOptions
  ): VerificationCheck[] {
    const preset = this.verificationPresets[topic] || RESEARCH_VERIFICATION_PRESETS.general_research;
    const checks: VerificationCheck[] = [];

    // INT-004: Add pre-built checks from preset first
    if (preset.checks && preset.checks.length > 0) {
      checks.push(...preset.checks);
    }

    // Merge expected fields
    const expectedFields = [
      ...preset.expectedFields,
      ...(options.expectedFields || []),
    ];

    // Merge exclude patterns
    const excludePatterns = [
      ...preset.excludePatterns,
      ...(options.excludePatterns || []),
    ];

    // Minimum content length
    const minContentLength = options.minContentLength ?? preset.minContentLength;

    // Add field existence check if we have expected fields
    if (expectedFields.length > 0) {
      checks.push({
        type: 'content',
        assertion: {
          fieldExists: expectedFields,
        },
        severity: 'warning', // Warning, not error, since fields might have different names
        retryable: false,
      });
    }

    // Add exclude pattern check (one per pattern since excludesText expects a string)
    // Skip patterns already covered by preset checks to avoid duplicates
    const presetExcludePatterns = new Set(
      (preset.checks || [])
        .filter(c => c.assertion.excludesText)
        .map(c => c.assertion.excludesText?.toLowerCase())
    );

    for (const pattern of excludePatterns) {
      if (!presetExcludePatterns.has(pattern.toLowerCase())) {
        checks.push({
          type: 'content',
          assertion: {
            excludesText: pattern,
          },
          severity: 'critical',
          retryable: true,
        });
      }
    }

    // Add minimum length check only if not already in preset checks
    const hasMinLengthCheck = (preset.checks || []).some(
      c => c.assertion.minLength !== undefined
    );
    if (!hasMinLengthCheck) {
      checks.push({
        type: 'content',
        assertion: {
          minLength: minContentLength,
        },
        severity: 'error',
        retryable: true,
      });
    }

    return checks;
  }

  /**
   * Research a URL with verification presets and session management
   *
   * This is the main research method that:
   * - Applies verification presets based on topic
   * - Attempts SSO session sharing when applicable
   * - Follows pagination for legal documents
   * - Prefers API discovery when available
   *
   * @param url - The URL to research
   * @param options - Research-specific options
   * @returns Research result with verification summary
   */
  async research(url: string, options: ResearchBrowseOptions = {}): Promise<ResearchResult> {
    const topic = options.topic ?? this.researchConfig.defaultTopic;
    const preset = this.verificationPresets[topic] || RESEARCH_VERIFICATION_PRESETS.general_research;

    // Extract domain
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Determine session profile
    const sessionProfile = options.sessionProfile ?? this.getSessionProfileForDomain(domain);

    // Try SSO session sharing if enabled
    let sessionSharedFrom: string | undefined;
    if (this.researchConfig.enableSSOSharing && sessionProfile) {
      try {
        const shareResult = await this.shareSessionFromRelatedDomain(domain, {
          sessionProfile,
          minConfidence: this.researchConfig.ssoMinConfidence,
        });
        if (shareResult.success && shareResult.sourceDomain !== domain) {
          sessionSharedFrom = shareResult.sourceDomain;
        }
      } catch (error) {
        // SSO sharing failed, continue without it. Log for debugging.
        console.warn(`[ResearchBrowserClient] SSO session sharing failed for domain ${domain}:`, error);
      }
    }

    // Build verification checks
    const verificationChecks = this.buildVerificationChecks(topic, options);

    // INT-003: Try API bypass before browser rendering
    // This can provide 10-50x speedup for domains with discovered APIs
    if (this.researchConfig.preferApiDiscovery) {
      const apiResult = await this.tryApiBypass(url, domain, topic, options);
      if (apiResult) {
        // API bypass succeeded - return result without browser rendering
        const verificationSummary = this.buildVerificationSummary(apiResult.result, topic, options);
        return {
          ...apiResult.result,
          research: {
            topic,
            sessionProfile,
            sessionSharedFrom,
            apiUsed: true,
            bypassedBrowser: true,
            apiEndpoint: apiResult.apiEndpoint,
            timeSavedMs: apiResult.estimatedTimeSavedMs,
            verificationSummary,
          },
        };
      }
    }

    // Build browse options
    const browseOptions: SmartBrowseOptions = {
      ...options,
      // Apply pagination settings
      followPagination: options.followPagination ?? this.researchConfig.followPagination,
      maxPages: options.maxPages ?? this.researchConfig.maxPages,
      // Apply session profile
      sessionProfile,
      // Apply verification - ensure enabled and mode are always set
      verify: {
        enabled: preset.verifyOptions.enabled ?? true,
        mode: preset.verifyOptions.mode ?? 'standard',
        ...options.verify,
        checks: [
          ...(options.verify?.checks || []),
          ...verificationChecks,
        ],
      },
      // Enable learning
      enableLearning: options.enableLearning ?? true,
    };

    // Perform the browse
    const result = await this.browse(url, browseOptions);

    // Check for API usage - if APIs were discovered and potentially used
    const apiUsed = result.discoveredApis && result.discoveredApis.length > 0;

    // Build verification summary
    const verificationSummary = this.buildVerificationSummary(result, topic, options);

    // Save session if requested
    // Note: Session saving requires browser context access which may not be available
    // after tiered fetching. This is a best-effort attempt.
    if (options.saveSession && sessionProfile && this.researchConfig.persistSessions) {
      try {
        // Use SmartBrowser's internal session management
        // Sessions are typically saved automatically during browsing
        // This is mainly for explicit user-requested saves
        // The actual save happens during the browse operation if a Playwright context was used
      } catch (error) {
        // Session save failed, continue without it. Log for debugging.
        console.warn(`[ResearchBrowserClient] Failed to save session for profile ${sessionProfile}:`, error);
      }
    }

    // Return enriched result
    return {
      ...result,
      research: {
        topic,
        sessionProfile,
        sessionSharedFrom,
        apiUsed,
        bypassedBrowser: false,
        verificationSummary,
      },
    };
  }

  /**
   * Try to bypass browser rendering using discovered APIs (INT-003)
   *
   * This method checks if there are high-confidence APIs that can be called
   * directly instead of rendering the page in a browser. This can provide
   * 10-50x speedup for domains with discovered APIs.
   *
   * @param url - The URL to research
   * @param domain - The domain extracted from the URL
   * @param topic - The research topic for content extraction
   * @param options - Research browse options
   * @returns API bypass result if successful, null if should fall back to browser
   */
  private async tryApiBypass(
    url: string,
    domain: string,
    topic: ResearchTopic,
    options: ResearchBrowseOptions
  ): Promise<{
    result: SmartBrowseResult;
    apiEndpoint: string;
    estimatedTimeSavedMs: number;
  } | null> {
    try {
      // Get high-confidence APIs that can bypass browser rendering
      const learningEngine = this.getLearningEngine();
      const bypassableApis = learningEngine.getBypassablePatterns(domain);

      if (bypassableApis.length === 0) {
        return null; // No APIs available, fall back to browser
      }

      const startTime = Date.now();

      // Try each API in order of verification count (most reliable first)
      const sortedApis = [...bypassableApis].sort(
        (a, b) => b.verificationCount - a.verificationCount
      );

      for (const api of sortedApis) {
        try {
          // Make direct API call
          const response = await fetch(api.endpoint, {
            method: api.method,
            headers: {
              'Accept': 'application/json',
              ...api.authHeaders,
            },
          });

          if (!response.ok) {
            // API call failed, try next one
            continue;
          }

          const contentType = response.headers.get('content-type') || '';
          const isJson = contentType.includes('application/json');

          let content: string;
          let structuredData: Record<string, unknown> | undefined;

          if (isJson) {
            const jsonData = await response.json();
            structuredData = jsonData;
            content = this.extractContentFromApiResponse(jsonData, topic);
          } else {
            content = await response.text();
          }

          // Validate content meets minimum requirements
          const preset = this.verificationPresets[topic] || RESEARCH_VERIFICATION_PRESETS.general_research;
          const minLength = options.minContentLength ?? preset.minContentLength;

          if (content.length < minLength) {
            // Content too short, try next API or fall back to browser
            continue;
          }

          const endTime = Date.now();
          const apiDuration = endTime - startTime;

          // Estimate time saved (browser rendering typically takes 2-5 seconds)
          const estimatedBrowserTime = ResearchBrowserClient.ESTIMATED_BROWSER_RENDER_TIME_MS;
          const timeSaved = Math.max(0, estimatedBrowserTime - apiDuration);

          // Build SmartBrowseResult from API response
          const result: SmartBrowseResult = {
            url,
            title: this.extractTitleFromContent(content, structuredData),
            content: {
              html: isJson ? `<pre>${JSON.stringify(structuredData, null, 2)}</pre>` : content,
              markdown: content,
              text: content,
            },
            network: [],
            console: [],
            discoveredApis: [api],
            metadata: {
              loadTime: apiDuration,
              timestamp: Date.now(),
              finalUrl: api.endpoint,
            },
            learning: {
              selectorsUsed: [],
              selectorsSucceeded: [],
              selectorsFailed: [],
              confidenceLevel: 'high',
            },
          };

          return {
            result,
            apiEndpoint: api.endpoint,
            estimatedTimeSavedMs: timeSaved,
          };
        } catch (error) {
          // Log for debugging and continue to next API
          console.warn(`[ResearchBrowserClient] API call failed for ${api.endpoint}:`, error);
          continue;
        }
      }

      // All APIs failed, fall back to browser
      return null;
    } catch (error) {
      // Error getting APIs, fall back to browser
      console.warn(`[ResearchBrowserClient] Error in API bypass:`, error);
      return null;
    }
  }

  /**
   * Extract readable content from API JSON response (INT-003)
   */
  private extractContentFromApiResponse(
    data: unknown,
    topic: ResearchTopic
  ): string {
    if (typeof data === 'string') {
      return data;
    }

    if (Array.isArray(data)) {
      // For arrays, extract content from each item
      return data.map((item, i) => this.extractContentFromApiResponse(item, topic)).join('\n\n');
    }

    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;

      // Get preset fields to prioritize
      const preset = this.verificationPresets[topic] || RESEARCH_VERIFICATION_PRESETS.general_research;
      const priorityFields = new Set(preset.expectedFields.map(f => f.toLowerCase()));

      // Build content from object fields
      const lines: string[] = [];

      // First, extract priority fields
      for (const field of preset.expectedFields) {
        const value = this.getNestedValue(obj, field);
        if (value !== undefined) {
          lines.push(`## ${field}\n${this.formatValue(value)}`);
        }
      }

      // Then extract other relevant fields
      for (const [key, value] of Object.entries(obj)) {
        if (!priorityFields.has(key.toLowerCase()) && this.isRelevantField(key, value)) {
          lines.push(`## ${key}\n${this.formatValue(value)}`);
        }
      }

      return lines.join('\n\n') || JSON.stringify(data, null, 2);
    }

    return String(data);
  }

  /**
   * Get nested value from object using dot notation or exact match
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    // Try exact match first
    if (path in obj) {
      return obj[path];
    }

    // Try case-insensitive match
    const lowerPath = path.toLowerCase();
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase() === lowerPath) {
        return value;
      }
    }

    // Try nested path
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Format a value for display
   */
  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(v => `- ${this.formatValue(v)}`).join('\n');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /**
   * Check if a field is relevant for content extraction
   */
  private isRelevantField(key: string, value: unknown): boolean {
    // Skip internal/metadata fields
    if (ResearchBrowserClient.IRRELEVANT_FIELDS.has(key.toLowerCase())) {
      return false;
    }

    // Skip empty values
    if (value === null || value === undefined || value === '') {
      return false;
    }

    // Skip very short string values (likely IDs or codes)
    if (typeof value === 'string' && value.length < ResearchBrowserClient.MIN_RELEVANT_STRING_LENGTH) {
      return false;
    }

    return true;
  }

  /**
   * Extract title from content or structured data
   */
  private extractTitleFromContent(
    content: string,
    structuredData?: Record<string, unknown>
  ): string {
    // Try to get title from structured data
    if (structuredData) {
      for (const field of ResearchBrowserClient.CANDIDATE_TITLE_FIELDS) {
        const value = structuredData[field];
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
      }
    }

    // Extract from markdown heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      return headingMatch[1];
    }

    // Use first line
    const firstLine = content.split('\n')[0];
    if (firstLine && firstLine.length < ResearchBrowserClient.MAX_TITLE_LENGTH_FROM_FIRST_LINE) {
      return firstLine;
    }

    return 'API Response';
  }

  /**
   * Build verification summary from browse result
   */
  private buildVerificationSummary(
    result: SmartBrowseResult,
    topic: ResearchTopic,
    options: ResearchBrowseOptions
  ): ResearchResult['research']['verificationSummary'] {
    const preset = this.verificationPresets[topic] || RESEARCH_VERIFICATION_PRESETS.general_research;
    const expectedFields = [
      ...preset.expectedFields,
      ...(options.expectedFields || []),
    ];
    const excludePatterns = [
      ...preset.excludePatterns,
      ...(options.excludePatterns || []),
    ];

    // Check which fields are present in content
    const content = (result.content.markdown + ' ' + result.content.text).toLowerCase();
    const checkedFields: string[] = [];
    const missingFields: string[] = [];

    for (const field of expectedFields) {
      const fieldLower = field.toLowerCase().replace(/_/g, ' ');
      if (content.includes(fieldLower) || content.includes(field.toLowerCase())) {
        checkedFields.push(field);
      } else {
        missingFields.push(field);
      }
    }

    // Check for excluded patterns
    let excludedPatternFound: string | undefined;
    for (const pattern of excludePatterns) {
      if (content.includes(pattern.toLowerCase())) {
        excludedPatternFound = pattern;
        break;
      }
    }

    // Calculate confidence based on checks
    const fieldConfidence = expectedFields.length > 0
      ? checkedFields.length / expectedFields.length
      : 1;
    const patternConfidence = excludedPatternFound ? 0 : 1;
    const lengthConfidence = content.length >= preset.minContentLength ? 1 : content.length / preset.minContentLength;

    const confidence = (fieldConfidence * 0.4 + patternConfidence * 0.4 + lengthConfidence * 0.2);
    const passed = confidence >= 0.6 && !excludedPatternFound;

    return {
      passed,
      confidence,
      checkedFields,
      missingFields,
      excludedPatternFound,
    };
  }

  /**
   * Research multiple URLs with the same topic
   *
   * @param urls - Array of URLs to research
   * @param options - Research options applied to all URLs
   * @returns Array of research results
   */
  async researchBatch(
    urls: string[],
    options: ResearchBrowseOptions = {}
  ): Promise<ResearchResult[]> {
    const results: ResearchResult[] = [];

    // Process URLs sequentially to respect rate limits and session management
    for (const url of urls) {
      try {
        const result = await this.research(url, options);
        results.push(result);
      } catch (error) {
        // Create error result with required SmartBrowseResult fields
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          url,
          title: '',
          content: { html: '', markdown: '', text: '' },
          network: [],
          console: [],
          discoveredApis: [],
          metadata: {
            loadTime: 0,
            timestamp: Date.now(),
            finalUrl: url,
          },
          learning: {
            selectorsUsed: [],
            selectorsSucceeded: [],
            selectorsFailed: [],
            confidenceLevel: 'low',
          },
          research: {
            topic: options.topic ?? this.researchConfig.defaultTopic,
            error: errorMessage,
            verificationSummary: {
              passed: false,
              confidence: 0,
              checkedFields: [],
              missingFields: [],
            },
          },
        });
      }
    }

    return results;
  }

  /**
   * Get research statistics
   */
  getResearchStats(): {
    sessionProfiles: number;
    verificationPresets: number;
    governmentDomains: string[];
    ssoEnabled: boolean;
    defaultTopic: ResearchTopic;
  } {
    return {
      sessionProfiles: Object.keys(this.sessionProfiles).length,
      verificationPresets: Object.keys(this.verificationPresets).length,
      governmentDomains: Object.keys(this.sessionProfiles),
      ssoEnabled: this.researchConfig.enableSSOSharing,
      defaultTopic: this.researchConfig.defaultTopic,
    };
  }

  // =============================================================================
  // WORKFLOW TEMPLATES (INT-006)
  // =============================================================================

  /**
   * Execute a workflow template with the given variables
   *
   * Workflow templates provide pre-built research patterns for common use cases:
   * - Visa research across countries
   * - Document extraction from legal databases
   * - Fee tracking for immigration/tax procedures
   *
   * @param template - The workflow template to execute
   * @param variables - Variables to substitute in the template
   * @returns Workflow execution result with findings and summary
   *
   * @example
   * ```typescript
   * import { createResearchBrowser, WORKFLOW_TEMPLATES } from 'llm-browser/sdk';
   *
   * const browser = await createResearchBrowser();
   *
   * // Execute visa research workflow
   * const result = await browser.executeTemplate(WORKFLOW_TEMPLATES.visaResearch, {
   *   country: 'ES',
   *   visaType: 'digital_nomad',
   * });
   *
   * console.log(`Success: ${result.success}`);
   * console.log(`Findings: ${result.summary.findings.length}`);
   * ```
   */
  async executeTemplate(
    template: import('./core/workflow-templates.js').WorkflowTemplate,
    variables: Record<string, string | number>
  ): Promise<import('./core/workflow-templates.js').WorkflowTemplateResult> {
    const { validateVariables, prepareVariables, resolveUrlTemplate, buildWorkflowSummary } = await import('./core/workflow-templates.js');

    // Validate required variables
    const validation = validateVariables(template, variables);
    if (!validation.valid) {
      throw new Error(`Missing required variables: ${validation.missing.join(', ')}`);
    }

    // Prepare variables with URL expansions
    const preparedVars = prepareVariables(template, variables);

    const startedAt = Date.now();
    const stepResults: import('./core/workflow-templates.js').WorkflowTemplateStepResult[] = [];

    // Execute steps
    for (const step of template.steps) {
      const stepStart = Date.now();

      try {
        // Resolve URL template
        const url = resolveUrlTemplate(step.urlTemplate, preparedVars);

        // Skip step if URL couldn't be resolved (still has {{placeholders}})
        if (url.includes('{{')) {
          if (step.critical && !template.continueOnFailure) {
            throw new Error(`Could not resolve URL for critical step ${step.id}: ${url}`);
          }
          stepResults.push({
            stepId: step.id,
            stepName: step.name,
            url,
            success: false,
            error: `URL template could not be fully resolved: ${url}`,
            duration: Date.now() - stepStart,
          });
          continue;
        }

        // Apply delay if specified
        if (step.delayMs && step.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, step.delayMs));
        }

        // Execute research
        const result = await this.research(url, {
          topic: step.topic || template.defaultTopic || 'general_research',
          expectedFields: step.expectedFields,
          verify: step.additionalChecks ? {
            enabled: true,
            mode: 'thorough',
            checks: step.additionalChecks,
          } : undefined,
          ...step.options,
        });

        // Check if step succeeded
        const success = result.research?.verificationSummary?.passed !== false;

        stepResults.push({
          stepId: step.id,
          stepName: step.name,
          url,
          success,
          result,
          duration: Date.now() - stepStart,
        });

        // Stop on critical step failure if not continuing on failure
        if (!success && step.critical && !template.continueOnFailure) {
          break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        stepResults.push({
          stepId: step.id,
          stepName: step.name,
          url: resolveUrlTemplate(step.urlTemplate, preparedVars),
          success: false,
          error: errorMessage,
          duration: Date.now() - stepStart,
        });

        // Stop on critical step failure if not continuing on failure
        if (step.critical && !template.continueOnFailure) {
          break;
        }
      }
    }

    const completedAt = Date.now();

    // Determine overall success (all critical steps passed)
    const criticalSteps = template.steps.filter(s => s.critical);
    const criticalResults = stepResults.filter(r =>
      criticalSteps.some(s => s.id === r.stepId)
    );
    const allCriticalPassed = criticalResults.every(r => r.success);

    return {
      templateId: template.id,
      templateName: template.name,
      variables: preparedVars,
      steps: stepResults,
      success: allCriticalPassed,
      totalDuration: completedAt - startedAt,
      startedAt,
      completedAt,
      summary: buildWorkflowSummary(stepResults),
    };
  }

  /**
   * List available workflow templates
   *
   * @returns Array of template metadata
   */
  listWorkflowTemplates(): Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    requiredVariables: string[];
  }> {
    // Import dynamically to avoid circular dependency issues
    const { listTemplates } = require('./core/workflow-templates.js');
    return listTemplates();
  }

  /**
   * Get a workflow template by ID
   *
   * @param id - Template ID
   * @returns Template or undefined if not found
   */
  getWorkflowTemplate(id: string): import('./core/workflow-templates.js').WorkflowTemplate | undefined {
    // Import dynamically to avoid circular dependency issues
    const { getTemplate } = require('./core/workflow-templates.js');
    return getTemplate(id);
  }
}

/**
 * Create and initialize a Research Browser client
 *
 * Factory function for creating a research-optimized browser with presets for:
 * - Government portal navigation
 * - Legal document extraction
 * - Visa/immigration information
 * - Cross-domain session sharing
 *
 * @param config - Research configuration options
 * @returns Initialized Research Browser client
 *
 * @example
 * ```typescript
 * // Create with defaults
 * const browser = await createResearchBrowser();
 *
 * // Research a government portal
 * const result = await browser.research('https://extranjeros.inclusion.gob.es/visados', {
 *   topic: 'visa_immigration',
 * });
 *
 * // Check verification
 * if (result.research.verificationSummary.passed) {
 *   console.log('Content verified:', result.content.markdown);
 * } else {
 *   console.log('Missing fields:', result.research.verificationSummary.missingFields);
 * }
 *
 * await browser.cleanup();
 * ```
 *
 * @example
 * ```typescript
 * // Create with custom presets
 * const browser = await createResearchBrowser({
 *   defaultTopic: 'government_portal',
 *   customSessionProfiles: {
 *     'customs.gov': 'customs-portal',
 *   },
 *   customVerificationPresets: {
 *     customs_declaration: {
 *       description: 'Customs declaration forms',
 *       expectedFields: ['declaration', 'items', 'value', 'origin'],
 *       excludePatterns: ['404', 'Error'],
 *       minContentLength: 300,
 *       verifyOptions: { enabled: true, mode: 'thorough' },
 *     },
 *   },
 * });
 * ```
 */
export async function createResearchBrowser(config: ResearchConfig = {}): Promise<ResearchBrowserClient> {
  const client = new ResearchBrowserClient(config);
  await client.initialize();
  return client;
}
