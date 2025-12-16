/**
 * Tiered Fetcher - Intelligent orchestration between rendering strategies
 *
 * Implements a cascade of rendering strategies from fastest to most capable:
 *
 * Tier 1: Static fetch (fastest, ~50ms)
 *   - Plain HTTP fetch + HTML parsing
 *   - No JavaScript execution
 *   - Best for: Documentation, blogs, government sites, static content
 *
 * Tier 2: Lightweight JS (~200-500ms)
 *   - HTTP fetch + linkedom + Node VM script execution
 *   - Handles basic JS-rendered content
 *   - Best for: Server-rendered pages with hydration, simple SPAs
 *
 * Tier 3: Full browser (slowest, ~2-5s)
 *   - Playwright with full Chromium
 *   - Handles everything including anti-bot
 *   - Best for: Complex SPAs, sites with anti-bot, heavy interactivity
 *
 * The fetcher learns over time which tier works best for each domain.
 */

import { LightweightRenderer, LightweightRenderResult } from './lightweight-renderer.js';
import { BrowserManager } from './browser-manager.js';
import { ContentExtractor } from '../utils/content-extractor.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import type { NetworkRequest, ApiPattern } from '../types/index.js';
import type { Page } from 'playwright';

export type RenderTier = 'static' | 'lightweight' | 'playwright';

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
  };
  // Which tier was used
  tier: RenderTier;
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
      perTier: { static: 0, lightweight: 0, playwright: 0 },
    };
    const tiersAttempted: RenderTier[] = [];

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
              isStatic: tier === 'static',
              isJSHeavy: tier === 'playwright',
              needsFullBrowser: tier === 'playwright',
              contentComplete: true,
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
      case 'static':
        return this.executeStatic(url, options);
      case 'lightweight':
        return this.executeLightweight(url, options);
      case 'playwright':
        return this.executePlaywright(url, options);
    }
  }

  /**
   * Tier 1: Static fetch
   */
  private async executeStatic(
    url: string,
    options: TieredFetchOptions
  ): Promise<Omit<TieredFetchResult, 'tier' | 'fellBack' | 'tiersAttempted' | 'tierReason' | 'timing' | 'detection'>> {
    const result = await this.lightweightRenderer.renderStatic(url, {
      headers: options.headers,
      timeout: options.tierTimeout,
    });

    const content = this.contentExtractor.extract(result.html, result.finalUrl);

    return {
      html: result.html,
      content,
      finalUrl: result.finalUrl,
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
    // Check learned preferences first
    const preference = this.domainPreferences.get(domain);
    if (preference && preference.successCount > 2) {
      return preference.preferredTier;
    }

    // Check known static domains
    if (KNOWN_STATIC_DOMAINS.some(pattern => pattern.test(domain))) {
      return 'static';
    }

    // Check known browser-required domains
    if (KNOWN_BROWSER_REQUIRED.some(pattern => pattern.test(domain))) {
      return 'playwright';
    }

    // Default to static (fastest) and let it fall back if needed
    return 'static';
  }

  /**
   * Get the order of tiers to try
   */
  private getTierOrder(startTier: RenderTier): RenderTier[] {
    switch (startTier) {
      case 'static':
        return ['static', 'lightweight', 'playwright'];
      case 'lightweight':
        return ['lightweight', 'playwright'];
      case 'playwright':
        return ['playwright'];
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
        const nextTier = tier === 'static' ? 'lightweight' : 'playwright';
        existing.preferredTier = nextTier;
        existing.successCount = 0;
        existing.failureCount = 0;
      }
    } else {
      // Create preference pointing to next tier
      const nextTier = tier === 'static' ? 'lightweight' : 'playwright';
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
  } {
    const byTier: Record<RenderTier, number> = { static: 0, lightweight: 0, playwright: 0 };
    const responseTimes: Record<RenderTier, number[]> = { static: [], lightweight: [], playwright: [] };

    for (const pref of this.domainPreferences.values()) {
      byTier[pref.preferredTier]++;
      if (pref.avgResponseTime > 0) {
        responseTimes[pref.preferredTier].push(pref.avgResponseTime);
      }
    }

    const avgResponseTimes: Record<RenderTier, number> = {
      static: responseTimes.static.length > 0
        ? responseTimes.static.reduce((a, b) => a + b, 0) / responseTimes.static.length
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
