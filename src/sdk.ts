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
