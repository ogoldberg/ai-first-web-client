/**
 * Tiered Fetcher - Intelligent orchestration between rendering strategies
 *
 * Implements a cascade of rendering strategies from fastest to most capable:
 *
 * Tier 1: Content Intelligence (fastest, ~50-200ms)
 *   - Framework data extraction (__NEXT_DATA__, etc.)
 *   - Structured data (JSON-LD)
 *   - API prediction
 *   - Google Cache / Archive.org
 *   - Static HTML parsing
 *   - Best for: Most sites, especially modern frameworks
 *
 * Tier 2: Lightweight JS (~200-500ms)
 *   - HTTP fetch + linkedom + Node VM script execution
 *   - Handles basic JS-rendered content
 *   - Best for: Sites that need simple JS but not full browser
 *
 * Tier 3: Full browser (slowest, ~2-5s, OPTIONAL)
 *   - Playwright with full Chromium (if installed)
 *   - Handles everything including anti-bot
 *   - Best for: Complex SPAs, sites with anti-bot
 *   - Gracefully skipped if Playwright not available
 *
 * The fetcher learns over time which tier works best for each domain.
 */

import { LightweightRenderer } from './lightweight-renderer.js';
import { ContentIntelligence, type ContentResult, type ExtractionStrategy } from './content-intelligence.js';
import { BrowserManager, type Page } from './browser-manager.js';
import { ContentExtractor } from '../utils/content-extractor.js';
import { ApiAnalyzer } from './api-analyzer.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { TIMEOUTS } from '../utils/timeouts.js';
import type { NetworkRequest, ApiPattern, TierAttempt, TierValidationDetails } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { performanceTracker, type TimingBreakdown } from '../utils/performance-tracker.js';
import { getUsageMeter } from '../utils/usage-meter.js';
import { validateUrlOrThrow } from '../utils/url-safety.js';
import {
  isBrowserRequired,
  getContentMarkerPatterns,
  getIncompleteMarkerPatterns,
} from '../utils/heuristics-config.js';

export type RenderTier = 'intelligence' | 'lightweight' | 'playwright';

// Map old tier names to new ones for backward compatibility
const TIER_ALIASES: Record<string, RenderTier> = {
  'static': 'intelligence',
  'intelligence': 'intelligence',
  'lightweight': 'lightweight',
  'playwright': 'playwright',
};

/**
 * Freshness requirement for content
 * - 'realtime': Always fetch fresh content, never use cache
 * - 'cached': Prefer cached content, only fetch if not in cache
 * - 'any': Use cache if available and not stale, otherwise fetch
 */
export type FreshnessRequirement = 'realtime' | 'cached' | 'any';

export interface TieredFetchOptions {
  // Force a specific tier (skip auto-detection)
  forceTier?: RenderTier;
  // Minimum acceptable content length
  minContentLength?: number;
  // Timeout for each tier attempt
  tierTimeout?: number;
  // Whether to learn from this request
  enableLearning?: boolean;
  // Headers to pass through
  headers?: Record<string, string>;
  // Session profile for Playwright
  sessionProfile?: string;
  // Wait strategy for Playwright
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
  // Custom wait selector
  waitForSelector?: string;
  // Apply rate limiting
  useRateLimiting?: boolean;

  // === Budget Controls (CX-005) ===

  // Maximum acceptable latency in milliseconds
  // If the current tier exceeds this, skip remaining tiers
  maxLatencyMs?: number;

  // Maximum cost tier to use
  // 'intelligence' = cheapest only, 'lightweight' = allow lightweight, 'playwright' = allow all
  // Tiers more expensive than this will be skipped
  maxCostTier?: RenderTier;

  // Freshness requirement for content
  // Controls whether cached content is acceptable
  freshnessRequirement?: FreshnessRequirement;
}

// Default options for fetch
const DEFAULT_FETCH_OPTIONS: Required<Pick<TieredFetchOptions, 'minContentLength'>> = {
  minContentLength: 500,  // Prefer substantial content over meta descriptions
};

export interface TieredFetchResult {
  // The final HTML content
  html: string;
  // Extracted content
  content: {
    markdown: string;
    text: string;
    title: string;
    structured?: Record<string, unknown>; // Structured data if available
  };
  // Which tier was used
  tier: RenderTier;
  // Specific extraction strategy used (for intelligence tier)
  extractionStrategy?: ExtractionStrategy;
  // Final URL after redirects
  finalUrl: string;
  // Whether we had to fall back to a higher tier
  fellBack: boolean;
  // Tiers that were tried (deprecated, use tierAttempts instead)
  tiersAttempted: RenderTier[];
  // Detailed tier attempt information (CX-003)
  tierAttempts: TierAttempt[];
  // Why we used this tier
  tierReason: string;
  // Network requests captured (Playwright only currently)
  networkRequests: NetworkRequest[];
  // Discovered APIs (Playwright only)
  discoveredApis: ApiPattern[];
  // Page reference if Playwright was used (for further interactions)
  page?: Page;
  // Timing breakdown
  timing: {
    total: number;
    perTier: Record<RenderTier, number>;
    // Component-level timing (when available)
    breakdown?: TimingBreakdown;
  };
  // Detection results
  detection: {
    isStatic: boolean;
    isJSHeavy: boolean;
    needsFullBrowser: boolean;
    contentComplete: boolean;
    playwrightAvailable: boolean;
  };

  // Budget tracking (CX-005)
  budget?: {
    // Whether latency exceeded the maxLatencyMs budget
    latencyExceeded: boolean;
    // Tiers that were skipped due to maxCostTier
    tiersSkipped: RenderTier[];
    // The max cost tier that was enforced
    maxCostTierEnforced?: RenderTier;
    // Whether cache was used due to freshness settings
    usedCache: boolean;
    // The freshness requirement that was applied
    freshnessApplied?: FreshnessRequirement;
  };
}

// Tier routing rules are loaded from heuristics-config.ts (CX-010)

// Tier cost ordering (CX-005): lower index = cheaper
// Used to filter out expensive tiers based on maxCostTier
const TIER_COST_ORDER: RenderTier[] = ['intelligence', 'lightweight', 'playwright'];

/**
 * Get the cost index for a tier (lower = cheaper)
 */
function getTierCostIndex(tier: RenderTier): number {
  return TIER_COST_ORDER.indexOf(tier);
}

/**
 * Check if a tier is within budget based on maxCostTier
 */
function isTierWithinBudget(tier: RenderTier, maxCostTier?: RenderTier): boolean {
  if (!maxCostTier) return true;
  return getTierCostIndex(tier) <= getTierCostIndex(maxCostTier);
}

export interface DomainPreference {
  domain: string;
  preferredTier: RenderTier;
  successCount: number;
  failureCount: number;
  lastUsed: number;
  avgResponseTime: number;
}

export class TieredFetcher {
  private contentIntelligence: ContentIntelligence;
  private lightweightRenderer: LightweightRenderer;
  private browserManager: BrowserManager;
  private contentExtractor: ContentExtractor;
  private apiAnalyzer: ApiAnalyzer; // CX-009: For tier-aware API learning
  private domainPreferences: Map<string, DomainPreference> = new Map();

  constructor(
    browserManager: BrowserManager,
    contentExtractor: ContentExtractor
  ) {
    this.browserManager = browserManager;
    this.contentExtractor = contentExtractor;
    this.contentIntelligence = new ContentIntelligence();
    this.lightweightRenderer = new LightweightRenderer();
    this.apiAnalyzer = new ApiAnalyzer(); // CX-009
  }

  /**
   * Fetch a URL using the optimal tier
   */
  async fetch(url: string, options: TieredFetchOptions = {}): Promise<TieredFetchResult> {
    // SSRF Protection: Validate URL before any processing
    validateUrlOrThrow(url);

    // Apply defaults
    options = { ...DEFAULT_FETCH_OPTIONS, ...options };

    const startTime = Date.now();
    const domain = new URL(url).hostname;
    const timing: TieredFetchResult['timing'] = {
      total: 0,
      perTier: { intelligence: 0, lightweight: 0, playwright: 0 },
    };
    const tiersAttempted: RenderTier[] = [];
    const tierAttempts: TierAttempt[] = [];

    // Normalize tier name (handle 'static' -> 'intelligence' alias)
    if (options.forceTier && TIER_ALIASES[options.forceTier]) {
      options.forceTier = TIER_ALIASES[options.forceTier];
    }

    // Apply rate limiting if enabled
    if (options.useRateLimiting !== false) {
      await rateLimiter.acquire(url);
    }

    // Determine starting tier
    const startTier = options.forceTier || this.determineStartingTier(domain, url);

    // Try tiers in order, respecting maxCostTier budget (CX-005)
    const { tiers: tierOrder, skipped: tiersSkipped } = this.getTierOrder(startTier, options.maxCostTier);
    let lastError: Error | null = null;
    let fellBack = false;
    let latencyExceeded = false;

    for (const tier of tierOrder) {
      const tierStart = Date.now();
      tiersAttempted.push(tier);

      try {
        const result = await this.executeTier(tier, url, options);
        const tierDuration = Date.now() - tierStart;
        timing.perTier[tier] = tierDuration;

        // Validate result
        const validation = this.validateResult(result, options);

        if (validation.isValid) {
          timing.total = Date.now() - startTime;

          // Record successful tier attempt (CX-003)
          tierAttempts.push({
            tier,
            success: true,
            durationMs: tierDuration,
            extractionStrategy: result.extractionStrategy,
            validationDetails: validation.details,
          });

          // Learn from success
          if (options.enableLearning !== false) {
            this.recordSuccess(domain, tier, timing.perTier[tier]);
          }

          // Record to performance tracker
          performanceTracker.record({
            domain,
            url,
            tier,
            timing: {
              total: timing.total,
              network: timing.perTier[tier], // Approximate - actual tier time
            },
            success: true,
            fellBack,
            tiersAttempted,
          });

          // Record to usage meter (GTM-001 wiring)
          const usageMeter = getUsageMeter();
          usageMeter.record({
            timestamp: Date.now(),
            domain,
            url,
            tier,
            success: true,
            durationMs: timing.total,
            tiersAttempted,
            fellBack,
          }).catch(err => {
            logger.tieredFetcher.debug('Failed to record usage event', { error: String(err) });
          });

          // Check latency budget (CX-005)
          if (options.maxLatencyMs && timing.total > options.maxLatencyMs) {
            latencyExceeded = true;
            logger.tieredFetcher.info('Latency budget exceeded', {
              maxLatencyMs: options.maxLatencyMs,
              actualLatencyMs: timing.total,
              tier,
            });
          }

          return {
            ...result,
            tier,
            fellBack,
            tiersAttempted,
            tierAttempts,
            tierReason: fellBack
              ? `Fell back from ${tiersAttempted[0]} due to: ${validation.reason || 'incomplete content'}`
              : `${tier} tier successful`,
            timing: {
              ...timing,
              breakdown: {
                total: timing.total,
                network: timing.perTier[tier],
              },
            },
            detection: {
              isStatic: tier === 'intelligence',
              isJSHeavy: tier === 'playwright',
              needsFullBrowser: tier === 'playwright',
              contentComplete: true,
              playwrightAvailable: BrowserManager.isPlaywrightAvailable(),
            },
            // Budget tracking (CX-005)
            budget: {
              latencyExceeded,
              tiersSkipped,
              maxCostTierEnforced: options.maxCostTier,
              usedCache: false, // Cache handling is at SmartBrowser level
              freshnessApplied: options.freshnessRequirement,
            },
          };
        }

        // Content validation failed - record attempt and try next tier (CX-003)
        tierAttempts.push({
          tier,
          success: false,
          durationMs: tierDuration,
          failureReason: validation.reason || 'Content validation failed',
          extractionStrategy: result.extractionStrategy,
          validationDetails: validation.details,
        });

        fellBack = true;
        lastError = new Error(validation.reason || 'Content validation failed');

        // Check latency budget before trying next tier (CX-005)
        const elapsedSoFar = Date.now() - startTime;
        if (options.maxLatencyMs && elapsedSoFar > options.maxLatencyMs) {
          latencyExceeded = true;
          logger.tieredFetcher.info('Latency budget exceeded, stopping tier fallback', {
            maxLatencyMs: options.maxLatencyMs,
            elapsedMs: elapsedSoFar,
            currentTier: tier,
            remainingTiers: tierOrder.slice(tierOrder.indexOf(tier) + 1),
          });
          break;
        }
      } catch (error) {
        const tierDuration = Date.now() - tierStart;
        timing.perTier[tier] = tierDuration;

        // Record failed tier attempt (CX-003)
        tierAttempts.push({
          tier,
          success: false,
          durationMs: tierDuration,
          failureReason: error instanceof Error ? error.message : String(error),
        });

        fellBack = true;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check latency budget before trying next tier (CX-005)
        const elapsedSoFar = Date.now() - startTime;
        if (options.maxLatencyMs && elapsedSoFar > options.maxLatencyMs) {
          latencyExceeded = true;
          logger.tieredFetcher.info('Latency budget exceeded after error, stopping tier fallback', {
            maxLatencyMs: options.maxLatencyMs,
            elapsedMs: elapsedSoFar,
            currentTier: tier,
            error: lastError.message,
          });
          break;
        }
        // Continue to next tier
      }
    }

    // All tiers failed
    const totalTime = Date.now() - startTime;
    if (options.enableLearning !== false) {
      this.recordFailure(domain, tiersAttempted[tiersAttempted.length - 1]);
    }

    // Record failure to performance tracker
    performanceTracker.record({
      domain,
      url,
      tier: tiersAttempted[tiersAttempted.length - 1],
      timing: {
        total: totalTime,
      },
      success: false,
      fellBack: true,
      tiersAttempted,
    });

    // Record failure to usage meter (GTM-001 wiring)
    const usageMeter = getUsageMeter();
    usageMeter.record({
      timestamp: Date.now(),
      domain,
      url,
      tier: tiersAttempted[tiersAttempted.length - 1],
      success: false,
      durationMs: totalTime,
      tiersAttempted,
      fellBack: true,
    }).catch(err => {
      logger.tieredFetcher.debug('Failed to record usage event', { error: String(err) });
    });

    throw lastError || new Error('All rendering tiers failed');
  }

  /**
   * Execute a specific tier
   */
  private async executeTier(
    tier: RenderTier,
    url: string,
    options: TieredFetchOptions
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierAttempts' | 'tierReason' | 'timing' | 'detection'>> {
    switch (tier) {
      case 'intelligence':
        return this.executeIntelligence(url, options);
      case 'lightweight':
        return this.executeLightweight(url, options);
      case 'playwright':
        return this.executePlaywright(url, options);
      default:
        // Handle legacy 'static' tier
        return this.executeIntelligence(url, options);
    }
  }

  /**
   * Tier 1: Content Intelligence (framework extraction, structured data, API prediction, caches)
   */
  private async executeIntelligence(
    url: string,
    options: TieredFetchOptions
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierAttempts' | 'tierReason' | 'timing' | 'detection'>> {
    const result = await this.contentIntelligence.extract(url, {
      timeout: options.tierTimeout,
      minContentLength: options.minContentLength,
      headers: options.headers,
      // Don't use browser in this tier - that's what the playwright tier is for
      allowBrowser: false,
    });

    // If extraction failed completely, throw to trigger fallback
    if (result.error) {
      throw new Error(result.error);
    }

    // Build a minimal HTML representation for compatibility
    const html = `<!DOCTYPE html>
<html>
<head><title>${result.content.title}</title></head>
<body>
<article>${result.content.markdown}</article>
</body>
</html>`;

    return {
      html,
      content: {
        title: result.content.title,
        text: result.content.text,
        markdown: result.content.markdown,
        structured: result.content.structured,
      },
      extractionStrategy: result.meta.strategy,
      finalUrl: result.meta.finalUrl,
      networkRequests: [],
      discoveredApis: [],
    };
  }

  /**
   * Tier 2: Lightweight JS
   */
  private async executeLightweight(
    url: string,
    options: TieredFetchOptions
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierAttempts' | 'tierReason' | 'timing' | 'detection'>> {
    const result = await this.lightweightRenderer.render(url, {
      headers: options.headers,
      timeout: options.tierTimeout,
      executeScripts: true,
    });

    // If the lightweight renderer detected it needs full browser, throw to trigger fallback
    if (result.detection.needsFullBrowser) {
      throw new Error(`Page requires full browser: ${result.detection.reason}`);
    }

    const content = this.contentExtractor.extract(result.html, result.finalUrl);

    // Convert lightweight network requests to full NetworkRequest format (CX-009)
    // Uses enhanced data from the updated lightweight renderer
    const networkRequests: NetworkRequest[] = ApiAnalyzer.convertLightweightRequests(
      result.networkRequests
    );

    // CX-009: Analyze network requests with tier-aware confidence degradation
    // Lightweight tier gets confidence downgraded by 1 level
    const discoveredApis = this.apiAnalyzer.analyzeRequestsWithTier(
      networkRequests,
      'lightweight'
    );

    if (discoveredApis.length > 0) {
      logger.tieredFetcher.info('CX-009: Discovered APIs from lightweight tier', {
        url,
        apiCount: discoveredApis.length,
        apis: discoveredApis.map(api => ({ endpoint: api.endpoint, confidence: api.confidence })),
      });
    }

    return {
      html: result.html,
      content,
      finalUrl: result.finalUrl,
      networkRequests,
      discoveredApis,
    };
  }

  /**
   * Tier 3: Full Playwright browser
   */
  private async executePlaywright(
    url: string,
    options: TieredFetchOptions
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierAttempts' | 'tierReason' | 'timing' | 'detection'>> {
    const result = await this.browserManager.browse(url, {
      profile: options.sessionProfile,
      waitFor: options.waitFor || 'networkidle',
      timeout: options.tierTimeout || TIMEOUTS.TIER_ATTEMPT,
      captureNetwork: true,
      captureConsole: false,
    });

    // Wait for specific selector if requested
    if (options.waitForSelector) {
      await result.page.waitForSelector(options.waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT }).catch(() => {});
    }

    const html = await result.page.content();
    const finalUrl = result.page.url();
    const content = this.contentExtractor.extract(html, finalUrl);

    // Don't close the page - let the caller decide
    return {
      html,
      content,
      finalUrl,
      networkRequests: result.network,
      discoveredApis: [], // API analysis happens at higher level
      page: result.page,
    };
  }

  /**
   * Determine which tier to start with
   */
  private determineStartingTier(domain: string, url: string): RenderTier {
    const playwrightAvailable = BrowserManager.isPlaywrightAvailable();

    // Check learned preferences first
    const preference = this.domainPreferences.get(domain);
    if (preference && preference.successCount > 2) {
      // Normalize legacy tier names
      const preferredTier = TIER_ALIASES[preference.preferredTier] || preference.preferredTier;
      // If preference is playwright but it's not available, fall back to lightweight
      if (preferredTier === 'playwright' && !playwrightAvailable) {
        return 'lightweight';
      }
      return preferredTier;
    }

    // Check known browser-required domains (social media, etc.)
    if (isBrowserRequired(domain)) {
      // If Playwright not available, try lightweight instead
      return playwrightAvailable ? 'playwright' : 'lightweight';
    }

    // Default to intelligence tier (fastest) - it tries multiple strategies
    return 'intelligence';
  }

  /**
   * Get the order of tiers to try, respecting budget constraints
   * @param startTier - The tier to start from
   * @param maxCostTier - Maximum cost tier allowed (CX-005)
   * @returns Object containing tier order and any skipped tiers
   */
  private getTierOrder(startTier: RenderTier, maxCostTier?: RenderTier): { tiers: RenderTier[]; skipped: RenderTier[] } {
    // Normalize legacy tier name
    const tier = TIER_ALIASES[startTier] || startTier;

    // Check if Playwright is available - skip that tier if not
    const playwrightAvailable = BrowserManager.isPlaywrightAvailable();

    // Build initial tier list based on starting tier
    let allTiers: RenderTier[];
    switch (tier) {
      case 'intelligence':
        allTiers = playwrightAvailable
          ? ['intelligence', 'lightweight', 'playwright']
          : ['intelligence', 'lightweight'];
        break;
      case 'lightweight':
        allTiers = playwrightAvailable
          ? ['lightweight', 'playwright']
          : ['lightweight'];
        break;
      case 'playwright':
        if (!playwrightAvailable) {
          logger.tieredFetcher.warn('Playwright tier requested but Playwright is not available', { fallback: 'lightweight' });
          allTiers = ['lightweight'];
        } else {
          allTiers = ['playwright'];
        }
        break;
      default:
        allTiers = playwrightAvailable
          ? ['intelligence', 'lightweight', 'playwright']
          : ['intelligence', 'lightweight'];
    }

    // Filter out tiers that exceed maxCostTier budget (CX-005)
    if (maxCostTier) {
      const skipped: RenderTier[] = [];
      const tiers: RenderTier[] = [];

      for (const t of allTiers) {
        if (isTierWithinBudget(t, maxCostTier)) {
          tiers.push(t);
        } else {
          skipped.push(t);
        }
      }

      if (tiers.length === 0) {
        // No tiers within budget - log warning and use cheapest available
        logger.tieredFetcher.warn('No tiers available within budget', {
          maxCostTier,
          allTiers,
          fallback: 'intelligence',
        });
        return { tiers: ['intelligence'], skipped };
      }

      if (skipped.length > 0) {
        logger.tieredFetcher.info('Budget constraint applied', {
          maxCostTier,
          allowedTiers: tiers,
          skippedTiers: skipped,
        });
      }

      return { tiers, skipped };
    }

    return { tiers: allTiers, skipped: [] };
  }

  /**
   * Validate that the result has sufficient content
   * Returns detailed validation information for CX-003 decision trace
   */
  private validateResult(
    result: Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierAttempts' | 'tierReason' | 'timing' | 'detection'>,
    options: TieredFetchOptions
  ): { isValid: boolean; reason?: string; details?: TierValidationDetails } {
    const { html, content } = result;
    const minLength = options.minContentLength || DEFAULT_FETCH_OPTIONS.minContentLength;

    // Check for content markers (semantic HTML elements)
    const contentMarkerPatterns = getContentMarkerPatterns();
    const hasSemanticMarkers = contentMarkerPatterns.some(marker => marker.test(html));

    // Check for incomplete markers
    const incompleteMarkers: string[] = [];
    for (const marker of getIncompleteMarkerPatterns()) {
      if (marker.test(html)) {
        incompleteMarkers.push(marker.source);
      }
    }

    // Build validation details for tracing
    const details: TierValidationDetails = {
      contentLength: content.text.length,
      hasSemanticMarkers,
      incompleteMarkers: incompleteMarkers.length > 0 ? incompleteMarkers : undefined,
    };

    // Check text length
    if (content.text.length < minLength) {
      return {
        isValid: false,
        reason: `Content too short: ${content.text.length} < ${minLength}`,
        details,
      };
    }

    // Check for incomplete markers (only fail if content is also short)
    if (incompleteMarkers.length > 0 && content.text.length < 500) {
      return {
        isValid: false,
        reason: `Found incomplete marker: ${incompleteMarkers[0]}`,
        details,
      };
    }

    // Check for content markers (at least one should be present for good content)
    if (!hasSemanticMarkers && content.text.length < 1000) {
      return {
        isValid: false,
        reason: 'No content markers found and content is short',
        details,
      };
    }

    return { isValid: true, details };
  }

  /**
   * Record a successful fetch for learning
   */
  private recordSuccess(domain: string, tier: RenderTier, responseTime: number): void {
    const existing = this.domainPreferences.get(domain);

    if (existing) {
      // Update existing preference
      existing.successCount++;
      existing.lastUsed = Date.now();
      existing.avgResponseTime = (existing.avgResponseTime * (existing.successCount - 1) + responseTime) / existing.successCount;

      // Update preferred tier if this was faster
      if (tier !== existing.preferredTier) {
        // Only switch if we have evidence the new tier is consistently better
        if (existing.failureCount > existing.successCount / 2) {
          existing.preferredTier = tier;
          existing.successCount = 1;
          existing.failureCount = 0;
        }
      }
    } else {
      // Create new preference
      this.domainPreferences.set(domain, {
        domain,
        preferredTier: tier,
        successCount: 1,
        failureCount: 0,
        lastUsed: Date.now(),
        avgResponseTime: responseTime,
      });
    }
  }

  /**
   * Record a failed fetch for learning
   */
  private recordFailure(domain: string, tier: RenderTier): void {
    const existing = this.domainPreferences.get(domain);

    if (existing) {
      existing.failureCount++;
      existing.lastUsed = Date.now();

      // If we're failing too often, try a higher tier next time
      if (existing.failureCount > 2 && tier !== 'playwright') {
        const nextTier = tier === 'intelligence' ? 'lightweight' : 'playwright';
        existing.preferredTier = nextTier;
        existing.successCount = 0;
        existing.failureCount = 0;
      }
    } else {
      // Create preference pointing to next tier
      const nextTier = tier === 'intelligence' ? 'lightweight' : 'playwright';
      this.domainPreferences.set(domain, {
        domain,
        preferredTier: nextTier,
        successCount: 0,
        failureCount: 1,
        lastUsed: Date.now(),
        avgResponseTime: 0,
      });
    }
  }

  /**
   * Get statistics about tier usage
   */
  getStats(): {
    totalDomains: number;
    byTier: Record<RenderTier, number>;
    avgResponseTimes: Record<RenderTier, number>;
    playwrightAvailable: boolean;
  } {
    const byTier: Record<RenderTier, number> = { intelligence: 0, lightweight: 0, playwright: 0 };
    const responseTimes: Record<RenderTier, number[]> = { intelligence: [], lightweight: [], playwright: [] };

    for (const pref of this.domainPreferences.values()) {
      // Normalize legacy tier names
      const tier = TIER_ALIASES[pref.preferredTier] || pref.preferredTier;
      byTier[tier] = (byTier[tier] || 0) + 1;
      if (pref.avgResponseTime > 0) {
        responseTimes[tier] = responseTimes[tier] || [];
        responseTimes[tier].push(pref.avgResponseTime);
      }
    }

    const avgResponseTimes: Record<RenderTier, number> = {
      intelligence: responseTimes.intelligence.length > 0
        ? responseTimes.intelligence.reduce((a, b) => a + b, 0) / responseTimes.intelligence.length
        : 0,
      lightweight: responseTimes.lightweight.length > 0
        ? responseTimes.lightweight.reduce((a, b) => a + b, 0) / responseTimes.lightweight.length
        : 0,
      playwright: responseTimes.playwright.length > 0
        ? responseTimes.playwright.reduce((a, b) => a + b, 0) / responseTimes.playwright.length
        : 0,
    };

    return {
      totalDomains: this.domainPreferences.size,
      byTier,
      avgResponseTimes,
      playwrightAvailable: BrowserManager.isPlaywrightAvailable(),
    };
  }

  /**
   * Get preference for a specific domain
   */
  getDomainPreference(domain: string): DomainPreference | undefined {
    return this.domainPreferences.get(domain);
  }

  /**
   * Manually set tier preference for a domain
   */
  setDomainPreference(domain: string, tier: RenderTier): void {
    this.domainPreferences.set(domain, {
      domain,
      preferredTier: tier,
      successCount: 10, // High confidence
      failureCount: 0,
      lastUsed: Date.now(),
      avgResponseTime: 0,
    });
  }

  /**
   * Export preferences for persistence
   */
  exportPreferences(): DomainPreference[] {
    return Array.from(this.domainPreferences.values());
  }

  /**
   * Import preferences from persistence
   */
  importPreferences(preferences: DomainPreference[]): void {
    for (const pref of preferences) {
      this.domainPreferences.set(pref.domain, pref);
    }
  }

  /**
   * Clear all learned preferences
   */
  clearPreferences(): void {
    this.domainPreferences.clear();
  }

  /**
   * Get the performance tracker for metrics access
   */
  getPerformanceTracker(): typeof performanceTracker {
    return performanceTracker;
  }
}
