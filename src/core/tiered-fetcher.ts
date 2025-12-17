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
import { rateLimiter } from '../utils/rate-limiter.js';
import type { NetworkRequest, ApiPattern } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type RenderTier = 'intelligence' | 'lightweight' | 'playwright';

// Map old tier names to new ones for backward compatibility
const TIER_ALIASES: Record<string, RenderTier> = {
  'static': 'intelligence',
  'intelligence': 'intelligence',
  'lightweight': 'lightweight',
  'playwright': 'playwright',
};

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
}

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
  // Tiers that were tried
  tiersAttempted: RenderTier[];
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
  };
  // Detection results
  detection: {
    isStatic: boolean;
    isJSHeavy: boolean;
    needsFullBrowser: boolean;
    contentComplete: boolean;
    playwrightAvailable: boolean;
  };
}

// Domain patterns that are known to be static
const KNOWN_STATIC_DOMAINS = [
  /\.gov$/,           // Government sites
  /\.gov\.\w{2}$/,    // International gov sites
  /\.edu$/,           // Educational sites
  /docs\./,           // Documentation sites
  /wiki/,             // Wiki sites
  /github\.io$/,      // GitHub pages
  /readthedocs/,      // ReadTheDocs
  /\.org$/,           // Many org sites
  /blog\./,           // Blog subdomains
];

// Domain patterns that need full browser
const KNOWN_BROWSER_REQUIRED = [
  /twitter\.com/,
  /x\.com/,
  /instagram\.com/,
  /facebook\.com/,
  /linkedin\.com/,
  /tiktok\.com/,
  /youtube\.com/,
  /reddit\.com/,
  /discord\.com/,
];

// Content markers that indicate the page rendered properly
const CONTENT_MARKERS = [
  /<article/i,
  /<main/i,
  /class="content/i,
  /id="content/i,
  /<h1/i,
  /<p[>\s]/i,
];

// Markers that indicate JavaScript hasn't finished rendering
const INCOMPLETE_MARKERS = [
  /loading\.\.\./i,
  /please wait/i,
  /<div id="(root|app|__next)">\s*<\/div>/i,
  /class="skeleton/i,
  /class="loading/i,
];

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
  private domainPreferences: Map<string, DomainPreference> = new Map();

  constructor(
    browserManager: BrowserManager,
    contentExtractor: ContentExtractor
  ) {
    this.browserManager = browserManager;
    this.contentExtractor = contentExtractor;
    this.contentIntelligence = new ContentIntelligence();
    this.lightweightRenderer = new LightweightRenderer();
  }

  /**
   * Fetch a URL using the optimal tier
   */
  async fetch(url: string, options: TieredFetchOptions = {}): Promise<TieredFetchResult> {
    const startTime = Date.now();
    const domain = new URL(url).hostname;
    const timing: TieredFetchResult['timing'] = {
      total: 0,
      perTier: { intelligence: 0, lightweight: 0, playwright: 0 },
    };
    const tiersAttempted: RenderTier[] = [];

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

    // Try tiers in order
    const tierOrder = this.getTierOrder(startTier);
    let lastError: Error | null = null;
    let fellBack = false;

    for (const tier of tierOrder) {
      const tierStart = Date.now();
      tiersAttempted.push(tier);

      try {
        const result = await this.executeTier(tier, url, options);
        timing.perTier[tier] = Date.now() - tierStart;

        // Validate result
        const validation = this.validateResult(result, options);

        if (validation.isValid) {
          timing.total = Date.now() - startTime;

          // Learn from success
          if (options.enableLearning !== false) {
            this.recordSuccess(domain, tier, timing.perTier[tier]);
          }

          return {
            ...result,
            tier,
            fellBack,
            tiersAttempted,
            tierReason: fellBack
              ? `Fell back from ${tiersAttempted[0]} due to: ${validation.reason || 'incomplete content'}`
              : `${tier} tier successful`,
            timing,
            detection: {
              isStatic: tier === 'intelligence',
              isJSHeavy: tier === 'playwright',
              needsFullBrowser: tier === 'playwright',
              contentComplete: true,
              playwrightAvailable: BrowserManager.isPlaywrightAvailable(),
            },
          };
        }

        // Content validation failed - try next tier
        fellBack = true;
        lastError = new Error(validation.reason || 'Content validation failed');
      } catch (error) {
        timing.perTier[tier] = Date.now() - tierStart;
        fellBack = true;
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next tier
      }
    }

    // All tiers failed
    if (options.enableLearning !== false) {
      this.recordFailure(domain, tiersAttempted[tiersAttempted.length - 1]);
    }

    throw lastError || new Error('All rendering tiers failed');
  }

  /**
   * Execute a specific tier
   */
  private async executeTier(
    tier: RenderTier,
    url: string,
    options: TieredFetchOptions
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierReason' | 'timing' | 'detection'>> {
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
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierReason' | 'timing' | 'detection'>> {
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
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierReason' | 'timing' | 'detection'>> {
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

    // Convert network requests to our format
    const networkRequests: NetworkRequest[] = result.networkRequests.map(req => ({
      url: req.url,
      method: req.method,
      status: req.status || 0,
      statusText: '',
      headers: {},
      requestHeaders: {},
      contentType: req.contentType,
      timestamp: Date.now(),
    }));

    return {
      html: result.html,
      content,
      finalUrl: result.finalUrl,
      networkRequests,
      discoveredApis: [],
    };
  }

  /**
   * Tier 3: Full Playwright browser
   */
  private async executePlaywright(
    url: string,
    options: TieredFetchOptions
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierReason' | 'timing' | 'detection'>> {
    const result = await this.browserManager.browse(url, {
      profile: options.sessionProfile,
      waitFor: options.waitFor || 'networkidle',
      timeout: options.tierTimeout || 30000,
      captureNetwork: true,
      captureConsole: false,
    });

    // Wait for specific selector if requested
    if (options.waitForSelector) {
      await result.page.waitForSelector(options.waitForSelector, { timeout: 5000 }).catch(() => {});
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
    if (KNOWN_BROWSER_REQUIRED.some(pattern => pattern.test(domain))) {
      // If Playwright not available, try lightweight instead
      return playwrightAvailable ? 'playwright' : 'lightweight';
    }

    // Default to intelligence tier (fastest) - it tries multiple strategies
    return 'intelligence';
  }

  /**
   * Get the order of tiers to try
   */
  private getTierOrder(startTier: RenderTier): RenderTier[] {
    // Normalize legacy tier name
    const tier = TIER_ALIASES[startTier] || startTier;

    // Check if Playwright is available - skip that tier if not
    const playwrightAvailable = BrowserManager.isPlaywrightAvailable();

    switch (tier) {
      case 'intelligence':
        return playwrightAvailable
          ? ['intelligence', 'lightweight', 'playwright']
          : ['intelligence', 'lightweight'];
      case 'lightweight':
        return playwrightAvailable
          ? ['lightweight', 'playwright']
          : ['lightweight'];
      case 'playwright':
        if (!playwrightAvailable) {
          logger.tieredFetcher.warn('Playwright tier requested but Playwright is not available', { fallback: 'lightweight' });
          return ['lightweight'];
        }
        return ['playwright'];
      default:
        return playwrightAvailable
          ? ['intelligence', 'lightweight', 'playwright']
          : ['intelligence', 'lightweight'];
    }
  }

  /**
   * Validate that the result has sufficient content
   */
  private validateResult(
    result: Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierReason' | 'timing' | 'detection'>,
    options: TieredFetchOptions
  ): { isValid: boolean; reason?: string } {
    const { html, content } = result;
    const minLength = options.minContentLength || 200;

    // Check text length
    if (content.text.length < minLength) {
      return { isValid: false, reason: `Content too short: ${content.text.length} < ${minLength}` };
    }

    // Check for incomplete markers
    for (const marker of INCOMPLETE_MARKERS) {
      if (marker.test(html) && content.text.length < 500) {
        return { isValid: false, reason: `Found incomplete marker: ${marker.source}` };
      }
    }

    // Check for content markers (at least one should be present for good content)
    const hasContentMarkers = CONTENT_MARKERS.some(marker => marker.test(html));
    if (!hasContentMarkers && content.text.length < 1000) {
      return { isValid: false, reason: 'No content markers found and content is short' };
    }

    return { isValid: true };
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
}
