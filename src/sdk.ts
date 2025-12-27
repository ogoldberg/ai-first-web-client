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

import type { VerifyOptions, VerificationCheck } from './types/verification.js';

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

/**
 * Verification presets for common research scenarios.
 * These define the expected fields and validation rules for each topic type.
 */
export const RESEARCH_VERIFICATION_PRESETS: Record<ResearchTopic, {
  description: string;
  expectedFields: string[];
  excludePatterns: string[];
  minContentLength: number;
  verifyOptions: Partial<VerifyOptions>;
}> = {
  government_portal: {
    description: 'Government websites and official portals',
    expectedFields: ['requirements', 'documents', 'process', 'contact'],
    excludePatterns: ['404', 'Page not found', 'Error', 'Access denied', 'Service unavailable'],
    minContentLength: 500,
    verifyOptions: {
      enabled: true,
      mode: 'thorough',
    },
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
  customVerificationPresets?: Record<string, typeof RESEARCH_VERIFICATION_PRESETS[ResearchTopic]>;
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
  private researchConfig: Required<Omit<ResearchConfig, keyof LLMBrowserConfig>> & LLMBrowserConfig;
  private sessionProfiles: Record<string, string>;
  private verificationPresets: Record<string, typeof RESEARCH_VERIFICATION_PRESETS[ResearchTopic]>;

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
   * Build verification checks from research options
   */
  private buildVerificationChecks(
    topic: ResearchTopic,
    options: ResearchBrowseOptions
  ): VerificationCheck[] {
    const preset = this.verificationPresets[topic] || RESEARCH_VERIFICATION_PRESETS.general_research;
    const checks: VerificationCheck[] = [];

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
    for (const pattern of excludePatterns) {
      checks.push({
        type: 'content',
        assertion: {
          excludesText: pattern,
        },
        severity: 'critical',
        retryable: true,
      });
    }

    // Add minimum length check
    checks.push({
      type: 'content',
      assertion: {
        minLength: minContentLength,
      },
      severity: 'error',
      retryable: true,
    });

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
          const estimatedBrowserTime = 3000; // Conservative estimate
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
    const skipFields = new Set(['id', '_id', 'created_at', 'updated_at', 'metadata', 'version']);
    if (skipFields.has(key.toLowerCase())) {
      return false;
    }

    // Skip empty values
    if (value === null || value === undefined || value === '') {
      return false;
    }

    // Skip very short string values (likely IDs or codes)
    if (typeof value === 'string' && value.length < 10) {
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
      const titleFields = ['title', 'name', 'headline', 'subject'];
      for (const field of titleFields) {
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
    if (firstLine && firstLine.length < 100) {
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
