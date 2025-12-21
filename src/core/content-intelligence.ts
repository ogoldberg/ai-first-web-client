/**
 * Content Intelligence - Extract content for LLMs without browser overhead
 *
 * This module extracts content using multiple strategies, falling back gracefully
 * when one doesn't work. Designed for LLMs, not humans - no rendering needed.
 *
 * Strategy order (fastest to slowest):
 * 1. Framework data extraction (__NEXT_DATA__, __NUXT__, etc.)
 * 2. Structured data (JSON-LD, OpenGraph, microdata)
 * 3. Static HTML parsing (primary method - just fetch and parse)
 * 4. API prediction (may require extra requests)
 * 5. Google Cache (fallback only if direct fetch fails)
 * 6. Archive.org (fallback only if caches unavailable)
 * 7. Playwright (optional, lazy-loaded, last resort)
 *
 * NOTE: Cache sources are only used as fallbacks when direct access fails.
 * Playwright is OPTIONAL - if not installed, we just skip that strategy.
 */

import { CookieJar, Cookie } from 'tough-cookie';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { TIMEOUTS } from '../utils/timeouts.js';
import { logger } from '../utils/logger.js';
import { createRequire } from 'module';
import type {
  ApiExtractionSuccess,
  ApiExtractionListener,
  PatternMatch,
  LearnedApiPattern,
  ContentMapping,
  AntiPattern,
} from '../types/api-patterns.js';
import { ApiPatternRegistry } from './api-pattern-learner.js';
import { discoverGraphQL, isLikelyGraphQL, type GraphQLDiscoveryResult, type GraphQLQueryPattern } from './graphql-introspection.js';
import { classifyFailure } from './failure-learning.js';

// Create a require function for ESM compatibility
const require = createRequire(import.meta.url);

// Types
export interface ContentResult {
  // The extracted content
  content: {
    title: string;
    text: string;
    markdown: string;
    structured?: Record<string, unknown>;
  };

  // Metadata about extraction
  meta: {
    url: string;
    finalUrl: string;
    strategy: ExtractionStrategy;
    strategiesAttempted: ExtractionStrategy[];
    timing: number;
    confidence: 'high' | 'medium' | 'low';
  };

  // Any errors encountered (non-fatal)
  warnings: string[];

  // If we completely failed
  error?: string;
}

export type ExtractionStrategy =
  | 'framework:nextjs'
  | 'framework:nuxt'
  | 'framework:gatsby'
  | 'framework:remix'
  | 'framework:angular'
  | 'structured:jsonld'
  | 'structured:opengraph'
  | 'api:predicted'
  | 'api:discovered'
  | 'api:reddit'
  | 'api:hackernews'
  | 'api:github'
  | 'api:wikipedia'
  | 'api:stackoverflow'
  | 'api:npm'
  | 'api:pypi'
  | 'api:devto'
  | 'api:learned'
  | 'api:openapi'
  | 'api:graphql'
  | 'cache:google'
  | 'cache:archive'
  | 'parse:static'
  | 'browser:playwright';

export interface ContentIntelligenceOptions {
  // Timeout for the entire operation
  timeout?: number;
  // Minimum acceptable content length
  minContentLength?: number;
  // Skip specific strategies
  skipStrategies?: ExtractionStrategy[];
  // Force a specific strategy (skip others)
  forceStrategy?: ExtractionStrategy;
  // Custom headers
  headers?: Record<string, string>;
  // User agent
  userAgent?: string;
  // Whether to try browser as last resort
  allowBrowser?: boolean;
  // Callback when API extraction succeeds (for pattern learning)
  onExtractionSuccess?: ApiExtractionListener;
}

// Realistic browser User-Agent to avoid bot detection
// Using a recent Chrome on macOS - sites that block bots usually accept this
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_OPTIONS: ContentIntelligenceOptions = {
  timeout: TIMEOUTS.NETWORK_FETCH,
  minContentLength: 500,  // Prefer substantial content over meta descriptions
  skipStrategies: [],
  allowBrowser: true,
  userAgent: BROWSER_USER_AGENT,
};

// Lazy-loaded Playwright reference
let playwrightModule: typeof import('playwright') | null = null;
let playwrightLoadAttempted = false;
let playwrightLoadError: string | null = null;

/**
 * Try to load Playwright lazily
 */
async function tryLoadPlaywright(): Promise<typeof import('playwright') | null> {
  if (playwrightLoadAttempted) {
    return playwrightModule;
  }

  playwrightLoadAttempted = true;

  try {
    playwrightModule = await import('playwright');
    return playwrightModule;
  } catch (error) {
    playwrightLoadError = error instanceof Error ? error.message : 'Failed to load Playwright';
    logger.intelligence.warn('Playwright not available', { error: playwrightLoadError });
    logger.intelligence.info('Continuing without browser support - this is fine for most sites');
    return null;
  }
}

export class ContentIntelligence {
  private cookieJar: CookieJar;
  private turndown: TurndownService;
  private options: ContentIntelligenceOptions;
  private extractionListeners: Set<ApiExtractionListener> = new Set();
  private patternRegistry: ApiPatternRegistry;
  private patternRegistryInitialized = false;

  constructor(options: Partial<ContentIntelligenceOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cookieJar = new CookieJar();
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    this.patternRegistry = new ApiPatternRegistry();

    // Add options callback if provided
    if (options.onExtractionSuccess) {
      this.extractionListeners.add(options.onExtractionSuccess);
    }

    // Connect extraction listener to pattern learning
    this.onExtractionSuccess((event) => {
      this.patternRegistry.learnFromExtraction(event);
    });
  }

  /**
   * Initialize the pattern registry (lazy initialization)
   */
  private async ensurePatternRegistryInitialized(): Promise<void> {
    if (!this.patternRegistryInitialized) {
      await this.patternRegistry.initialize();
      this.patternRegistryInitialized = true;
    }
  }

  /**
   * Get the pattern registry (for testing purposes)
   */
  getPatternRegistry(): ApiPatternRegistry {
    return this.patternRegistry;
  }

  /**
   * Subscribe to API extraction success events
   * Used for pattern learning
   */
  onExtractionSuccess(listener: ApiExtractionListener): () => void {
    this.extractionListeners.add(listener);
    return () => this.extractionListeners.delete(listener);
  }

  /**
   * Emit an extraction success event to all listeners
   */
  private emitExtractionSuccess(event: ApiExtractionSuccess): void {
    for (const listener of this.extractionListeners) {
      try {
        listener(event);
      } catch (error) {
        logger.intelligence.error('Extraction listener error', { error });
      }
    }
  }

  /**
   * Helper to emit extraction success event for API strategies if listeners exist
   */
  private handleApiExtractionSuccess(
    result: ContentResult,
    strategy: string,
    strategyStartTime: number,
    url: string,
    opts: ContentIntelligenceOptions
  ): void {
    if (strategy.startsWith('api:') && this.extractionListeners.size > 0) {
      this.emitExtractionSuccess({
        sourceUrl: url,
        apiUrl: result.meta.finalUrl,
        strategy,
        responseTime: Date.now() - strategyStartTime,
        content: result.content,
        headers: opts.headers,
        method: 'GET',
      });
    }
  }

  /**
   * Extract content from a URL using the best available strategy
   */
  async extract(url: string, options: Partial<ContentIntelligenceOptions> = {}): Promise<ContentResult> {
    const opts = { ...this.options, ...options };
    const startTime = Date.now();
    const warnings: string[] = [];
    const strategiesAttempted: ExtractionStrategy[] = [];

    // If forcing a specific strategy, only try that one
    if (opts.forceStrategy) {
      return this.tryStrategy(opts.forceStrategy, url, opts, startTime, [opts.forceStrategy], warnings);
    }

    // Strategy chain - each returns result or throws to continue
    // NOTE: Cache sources should only be fallbacks, not primary strategies
    const strategies: Array<{
      name: ExtractionStrategy;
      fn: () => Promise<ContentResult | null>;
    }> = [
      // 1. Site-specific APIs (fast, reliable if matched)
      { name: 'api:reddit', fn: () => this.tryRedditAPI(url, opts) },
      { name: 'api:hackernews', fn: () => this.tryHackerNewsAPI(url, opts) },
      { name: 'api:github', fn: () => this.tryGitHubAPI(url, opts) },
      { name: 'api:wikipedia', fn: () => this.tryWikipediaAPI(url, opts) },
      { name: 'api:stackoverflow', fn: () => this.tryStackOverflowAPI(url, opts) },
      { name: 'api:npm', fn: () => this.tryNpmAPI(url, opts) },
      { name: 'api:pypi', fn: () => this.tryPyPIAPI(url, opts) },
      { name: 'api:devto', fn: () => this.tryDevToAPI(url, opts) },

      // 1b. Learned API patterns (applied from previous successful extractions)
      { name: 'api:learned', fn: () => this.tryLearnedPatterns(url, opts) },

      // 2. Framework data extraction (instant if __NEXT_DATA__ etc. present)
      { name: 'framework:nextjs', fn: () => this.tryFrameworkExtraction(url, opts) },

      // 3. Structured data (instant if JSON-LD/OpenGraph present)
      { name: 'structured:jsonld', fn: () => this.tryStructuredData(url, opts) },

      // 4. Static HTML parsing (primary method - always try direct fetch first)
      { name: 'parse:static', fn: () => this.tryStaticParsing(url, opts) },

      // 5. API prediction (may require discovering and calling APIs)
      { name: 'api:predicted', fn: () => this.tryPredictedAPI(url, opts) },

      // 5b. OpenAPI/Swagger discovery (probe for API specs - expensive, try after other methods)
      { name: 'api:openapi', fn: () => this.tryOpenAPIDiscovery(url, opts) },

      // 5c. GraphQL introspection (probe for GraphQL API - expensive, try after other methods)
      { name: 'api:graphql', fn: () => this.tryGraphQLDiscovery(url, opts) },

      // 6. Google Cache (fallback only - use if direct fetch failed)
      { name: 'cache:google', fn: () => this.tryGoogleCache(url, opts) },

      // 7. Archive.org (fallback only - historical snapshot as last cache option)
      { name: 'cache:archive', fn: () => this.tryArchiveOrg(url, opts) },

      // 8. Playwright (optional, last resort for JS-heavy sites)
      { name: 'browser:playwright', fn: () => this.tryPlaywright(url, opts) },
    ];

    // Try each strategy in order
    for (const strategy of strategies) {
      // Skip if in skip list
      if (opts.skipStrategies?.includes(strategy.name)) {
        continue;
      }

      // Skip browser if not allowed
      if (strategy.name === 'browser:playwright' && !opts.allowBrowser) {
        continue;
      }

      strategiesAttempted.push(strategy.name);

      try {
        const strategyStartTime = Date.now();
        const result = await strategy.fn();

        if (result && this.isValidContent(result, opts)) {
          // Success! Update metadata and return
          result.meta.strategiesAttempted = strategiesAttempted;
          result.meta.timing = Date.now() - startTime;
          result.warnings = [...warnings, ...result.warnings];

          // Emit extraction success event for API strategies (for pattern learning)
          this.handleApiExtractionSuccess(result, strategy.name, strategyStartTime, url, opts);

          return result;
        }

        if (result) {
          warnings.push(`${strategy.name}: Content too short or invalid`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`${strategy.name}: ${msg}`);
        // Continue to next strategy
      }
    }

    // All strategies failed
    return {
      content: {
        title: '',
        text: '',
        markdown: '',
      },
      meta: {
        url,
        finalUrl: url,
        strategy: 'parse:static',
        strategiesAttempted,
        timing: Date.now() - startTime,
        confidence: 'low',
      },
      warnings,
      error: 'All extraction strategies failed. Site may require authentication or be blocking automated access.',
    };
  }

  /**
   * Try a specific strategy
   */
  private async tryStrategy(
    strategy: ExtractionStrategy,
    url: string,
    opts: ContentIntelligenceOptions,
    startTime: number,
    strategiesAttempted: ExtractionStrategy[],
    warnings: string[]
  ): Promise<ContentResult> {
    const strategyMap: Record<ExtractionStrategy, () => Promise<ContentResult | null>> = {
      'framework:nextjs': () => this.tryFrameworkExtraction(url, opts),
      'framework:nuxt': () => this.tryFrameworkExtraction(url, opts),
      'framework:gatsby': () => this.tryFrameworkExtraction(url, opts),
      'framework:remix': () => this.tryFrameworkExtraction(url, opts),
      'framework:angular': () => this.tryFrameworkExtraction(url, opts),
      'structured:jsonld': () => this.tryStructuredData(url, opts),
      'structured:opengraph': () => this.tryStructuredData(url, opts),
      'api:predicted': () => this.tryPredictedAPI(url, opts),
      'api:discovered': () => this.tryPredictedAPI(url, opts),
      'api:reddit': () => this.tryRedditAPI(url, opts),
      'api:hackernews': () => this.tryHackerNewsAPI(url, opts),
      'api:github': () => this.tryGitHubAPI(url, opts),
      'api:wikipedia': () => this.tryWikipediaAPI(url, opts),
      'api:stackoverflow': () => this.tryStackOverflowAPI(url, opts),
      'api:npm': () => this.tryNpmAPI(url, opts),
      'api:pypi': () => this.tryPyPIAPI(url, opts),
      'api:devto': () => this.tryDevToAPI(url, opts),
      'api:learned': () => this.tryLearnedPatterns(url, opts),
      'api:openapi': () => this.tryOpenAPIDiscovery(url, opts),
      'api:graphql': () => this.tryGraphQLDiscovery(url, opts),
      'cache:google': () => this.tryGoogleCache(url, opts),
      'cache:archive': () => this.tryArchiveOrg(url, opts),
      'parse:static': () => this.tryStaticParsing(url, opts),
      'browser:playwright': () => this.tryPlaywright(url, opts),
    };

    const fn = strategyMap[strategy];
    if (!fn) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }

    const strategyStartTime = Date.now();
    const result = await fn();
    if (result) {
      result.meta.strategiesAttempted = strategiesAttempted;
      result.meta.timing = Date.now() - startTime;
      result.warnings = [...warnings, ...result.warnings];

      // Emit extraction success event for API strategies (for pattern learning)
      this.handleApiExtractionSuccess(result, strategy, strategyStartTime, url, opts);

      return result;
    }

    throw new Error(`Strategy ${strategy} returned no result`);
  }

  // ============================================
  // STRATEGY: Framework Data Extraction
  // ============================================

  private async tryFrameworkExtraction(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const html = await this.fetchHTML(url, opts);

    // Try Next.js
    const nextData = this.extractNextJSData(html);
    if (nextData) {
      return this.buildResult(url, url, 'framework:nextjs', nextData, 'high');
    }

    // Try Nuxt
    const nuxtData = this.extractNuxtData(html);
    if (nuxtData) {
      return this.buildResult(url, url, 'framework:nuxt', nuxtData, 'high');
    }

    // Try Gatsby
    const gatsbyData = this.extractGatsbyData(html);
    if (gatsbyData) {
      return this.buildResult(url, url, 'framework:gatsby', gatsbyData, 'high');
    }

    // Try Remix
    const remixData = this.extractRemixData(html);
    if (remixData) {
      return this.buildResult(url, url, 'framework:remix', remixData, 'high');
    }

    // Try Angular / Angular Universal
    const angularData = this.extractAngularData(html);
    if (angularData) {
      return this.buildResult(url, url, 'framework:angular', angularData, 'high');
    }

    return null;
  }

  private extractNextJSData(html: string): { title: string; text: string; structured?: unknown } | null {
    // Next.js stores all page data in __NEXT_DATA__
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/s);
    if (!match) return null;

    try {
      const data = JSON.parse(match[1]);
      const pageProps = data?.props?.pageProps || {};

      // Extract text content from the props
      const text = this.extractTextFromObject(pageProps);
      const title = pageProps.title || pageProps.name || data?.page || '';

      if (text.length > 50) {
        return { title, text, structured: pageProps };
      }
    } catch {
      // Invalid JSON
    }

    return null;
  }

  private extractNuxtData(html: string): { title: string; text: string; structured?: unknown } | null {
    // Nuxt stores data in window.__NUXT__
    const match = html.match(/window\.__NUXT__\s*=\s*(.+?);\s*<\/script>/s);
    if (!match) return null;

    try {
      // This is JS, not JSON, so we need to be careful
      // Look for the data property which usually contains the page data
      const dataMatch = match[1].match(/data:\s*(\[[\s\S]*?\])/);
      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);
        const text = this.extractTextFromObject(data);
        return { title: '', text, structured: data };
      }
    } catch {
      // Invalid format
    }

    return null;
  }

  private extractGatsbyData(html: string): { title: string; text: string; structured?: unknown } | null {
    // Gatsby uses multiple patterns
    const patterns = [
      /window\.___GATSBY\s*=\s*(.+?);\s*<\/script>/s,
      /<script[^>]*>window\.pagePath\s*=\s*"[^"]+";window\.___webpackCompilationHash\s*=\s*"[^"]+";(.+?)<\/script>/s,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          // Gatsby data is complex, try to find page data
          const pageDataMatch = html.match(/<script[^>]*id="gatsby-script-loader"[^>]*>([^<]+)<\/script>/);
          if (pageDataMatch) {
            const text = this.extractTextFromObject(pageDataMatch[1]);
            if (text.length > 50) {
              return { title: '', text };
            }
          }
        } catch {
          // Continue
        }
      }
    }

    return null;
  }

  private extractRemixData(html: string): { title: string; text: string; structured?: unknown } | null {
    // Remix uses window.__remixContext
    const match = html.match(/window\.__remixContext\s*=\s*(.+?);\s*<\/script>/s);
    if (!match) return null;

    try {
      // The loader data contains the page content
      const loaderMatch = match[1].match(/"loaderData"\s*:\s*(\{[\s\S]*?\})\s*,\s*"actionData"/);
      if (loaderMatch) {
        const data = JSON.parse(loaderMatch[1]);
        const text = this.extractTextFromObject(data);
        return { title: '', text, structured: data };
      }
    } catch {
      // Invalid format
    }

    return null;
  }

  private extractAngularData(html: string): { title: string; text: string; structured?: unknown } | null {
    // Angular Universal (SSR) uses TransferState to pass data from server to client
    // The data is stored in a script tag with type="application/json"
    // Common IDs: serverApp-state, transfer-state, ng-state, or just a script with ngh attribute

    // First, find all application/json script tags and check their IDs
    const angularStateIds = ['serverApp-state', 'transfer-state', 'ng-state'];
    const scriptTagRegex = /<script([^>]*)type\s*=\s*["']application\/json["']([^>]*)>([^<]*)<\/script>/gi;

    // Use matchAll to iterate through all matches
    const scriptMatches = [...html.matchAll(scriptTagRegex)];
    for (const scriptMatch of scriptMatches) {
      const beforeType = scriptMatch[1];
      const afterType = scriptMatch[2];
      const content = scriptMatch[3];
      const attributes = beforeType + afterType;

      // Check if this is an Angular state script
      const isAngularState = angularStateIds.some(id => {
        const idRegex = new RegExp(`id\\s*=\\s*["']?${id}["']?`, 'i');
        return idRegex.test(attributes);
      });

      // Also check for ngh attribute (Angular 17+ hydration)
      const hasNghAttribute = /\bngh\b/i.test(attributes);

      if (isAngularState || hasNghAttribute) {
        try {
          const data = JSON.parse(content.trim());
          const text = this.extractTextFromObject(data);
          if (text.length > 50) {
            const title = this.extractTitleFromObject(data);
            return { title, text, structured: data };
          }
        } catch {
          // Invalid JSON, continue to next match
        }
      }
    }

    // Check for Angular app indicators
    const hasAngularIndicators = this.detectAngularApp(html);
    if (!hasAngularIndicators) {
      return null;
    }

    // Try to extract initial state from various Angular patterns
    // Some Angular apps use window.__initialState or similar
    const statePatterns = [
      /window\.__(?:INITIAL_STATE|STATE|APP_STATE)__\s*=\s*({[\s\S]*?});?\s*<\/script>/s,
      /window\.(?:initialState|appState|state)\s*=\s*({[\s\S]*?});?\s*<\/script>/s,
    ];

    for (const pattern of statePatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          const text = this.extractTextFromObject(data);
          if (text.length > 50) {
            const title = this.extractTitleFromObject(data);
            return { title, text, structured: data };
          }
        } catch {
          // Invalid JSON, continue
        }
      }
    }

    return null;
  }

  private detectAngularApp(html: string): boolean {
    // Check for Angular-specific indicators
    const angularIndicators = [
      // Angular root component
      /<app-root[^>]*>/i,
      // ng-version attribute (Angular adds this to root elements)
      /ng-version=["'][^"']+["']/i,
      // Angular content attributes (added by ViewEncapsulation)
      /_ngcontent-[a-z0-9-]+/i,
      /_nghost-[a-z0-9-]+/i,
      // Angular hydration
      /ngh(?:=["'][^"']*["']|\s|>)/i,
      // Angular Zone.js script
      /zone(?:\.min)?\.js/i,
      // Angular runtime script
      /runtime(?:\.[a-f0-9]+)?\.js/i,
      // Angular main bundle with hash
      /main\.[a-f0-9]+\.js/i,
      // Angular polyfills bundle
      /polyfills(?:\.[a-f0-9]+)?\.js/i,
    ];

    for (const indicator of angularIndicators) {
      if (indicator.test(html)) {
        return true;
      }
    }

    return false;
  }

  private extractTitleFromObject(obj: unknown): string {
    // Try to find a title from common property names
    if (typeof obj !== 'object' || obj === null) return '';

    const record = obj as Record<string, unknown>;
    const titleKeys = ['title', 'name', 'headline', 'heading', 'pageTitle', 'documentTitle'];

    for (const key of titleKeys) {
      if (typeof record[key] === 'string' && record[key]) {
        return record[key] as string;
      }
    }

    // Recursively search for title in nested objects
    for (const value of Object.values(record)) {
      if (typeof value === 'object' && value !== null) {
        const found = this.extractTitleFromObject(value);
        if (found) return found;
      }
    }

    return '';
  }

  // ============================================
  // STRATEGY: Structured Data
  // ============================================

  private async tryStructuredData(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const html = await this.fetchHTML(url, opts);

    // Try JSON-LD (Google's preferred format)
    const jsonLd = this.extractJsonLd(html);
    if (jsonLd && jsonLd.text.length > 50) {
      return this.buildResult(url, url, 'structured:jsonld', jsonLd, 'high');
    }

    // Try OpenGraph + basic meta
    const meta = this.extractMetadata(html);
    if (meta && meta.text.length > 50) {
      return this.buildResult(url, url, 'structured:opengraph', meta, 'medium');
    }

    return null;
  }

  private extractJsonLd(html: string): { title: string; text: string; structured?: unknown } | null {
    const matches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (!matches?.length) return null;

    const allData: unknown[] = [];
    let combinedText = '';
    let title = '';

    for (const match of matches) {
      const jsonMatch = match.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!jsonMatch) continue;

      try {
        const data = JSON.parse(jsonMatch[1]);
        allData.push(data);

        // Extract text from common properties
        if (data.name && !title) title = data.name;
        if (data.headline && !title) title = data.headline;
        if (data.description) combinedText += data.description + '\n';
        if (data.articleBody) combinedText += data.articleBody + '\n';
        if (data.text) combinedText += data.text + '\n';

        // Recursively extract from nested objects
        combinedText += this.extractTextFromObject(data);
      } catch {
        // Invalid JSON, skip
      }
    }

    if (combinedText.length > 50) {
      return { title, text: combinedText.trim(), structured: allData };
    }

    return null;
  }

  private extractMetadata(html: string): { title: string; text: string } | null {
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') ||
                  $('meta[name="twitter:title"]').attr('content') ||
                  $('title').text() || '';

    const description = $('meta[property="og:description"]').attr('content') ||
                       $('meta[name="description"]').attr('content') ||
                       $('meta[name="twitter:description"]').attr('content') || '';

    if (description.length > 50) {
      return { title: title.trim(), text: description.trim() };
    }

    return null;
  }

  // ============================================
  // STRATEGY: API Prediction + JS Analysis
  // ============================================

  private async tryPredictedAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const parsedUrl = new URL(url);

    // First, try to extract APIs from the page's JavaScript
    let html: string | null = null;
    try {
      html = await this.fetchHTML(url, opts);
    } catch {
      // If we can't fetch HTML, fall back to simple predictions
    }

    // Extract APIs from JavaScript code in the page
    const discoveredApis = html ? this.extractApisFromJavaScript(html, parsedUrl) : [];

    // Combine discovered APIs with predictions (discovered first, they're more likely to work)
    const allEndpoints = [
      ...discoveredApis,
      ...this.predictAPIEndpoints(parsedUrl),
    ];

    // Deduplicate
    const uniqueEndpoints = [...new Set(allEndpoints)];

    logger.intelligence.debug(`Trying ${uniqueEndpoints.length} API endpoints`, {
      discovered: discoveredApis.length,
      predicted: uniqueEndpoints.length - discoveredApis.length,
    });

    for (const apiUrl of uniqueEndpoints) {
      try {
        const response = await this.fetchWithCookies(apiUrl, opts);

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';

          if (contentType.includes('application/json')) {
            const data = await response.json();
            const text = this.extractTextFromObject(data);

            if (text.length > 50) {
              const isDiscovered = discoveredApis.includes(apiUrl);
              logger.intelligence.info(`API extraction successful`, {
                source: isDiscovered ? 'js-analysis' : 'prediction',
                endpoint: apiUrl,
              });

              return this.buildResult(url, apiUrl, isDiscovered ? 'api:discovered' : 'api:predicted', {
                title: '',
                text,
                structured: data,
              }, 'high');
            }
          }
        }
      } catch {
        // Try next endpoint
      }
    }

    return null;
  }

  // ============================================
  // STRATEGY: Reddit API Extraction
  // ============================================

  /**
   * Check if URL is a Reddit URL
   */
  private isRedditUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return /^(www\.|old\.)?reddit\.com$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  /**
   * Convert Reddit URL to JSON API URL
   */
  private getRedditJsonUrl(url: string): string {
    const parsed = new URL(url);
    // Remove trailing slash if present, then add .json
    let path = parsed.pathname.replace(/\/$/, '');
    // Don't double-add .json
    if (!path.endsWith('.json')) {
      path += '.json';
    }
    return `${parsed.origin}${path}${parsed.search}`;
  }

  /**
   * Format Reddit JSON data into readable text/markdown
   */
  private formatRedditData(data: unknown): { title: string; text: string; markdown: string; structured: unknown } {
    const lines: string[] = [];
    const markdownLines: string[] = [];
    let title = '';

    // Handle Listing (subreddit posts)
    if (this.isRedditListing(data)) {
      const listing = data as { kind: string; data: { children: Array<{ kind: string; data: Record<string, unknown> }> } };
      title = 'Reddit Posts';

      for (const child of listing.data.children) {
        if (child.kind === 't3') { // Post
          const post = child.data;
          const postTitle = String(post.title || '');
          const author = String(post.author || 'unknown');
          const score = post.score || 0;
          const url = String(post.url || '');
          const selftext = String(post.selftext || '');
          const subreddit = String(post.subreddit || '');
          const numComments = post.num_comments || 0;

          // Text format
          lines.push(`[${score}] ${postTitle}`);
          lines.push(`  by u/${author} in r/${subreddit}`);
          if (selftext) {
            lines.push(`  ${selftext.substring(0, 200)}${selftext.length > 200 ? '...' : ''}`);
          }
          if (url && !url.includes('reddit.com')) {
            lines.push(`  Link: ${url}`);
          }
          lines.push(`  ${numComments} comments`);
          lines.push('');

          // Markdown format
          markdownLines.push(`## ${postTitle}`);
          markdownLines.push(`**Score:** ${score} | **Author:** u/${author} | **Subreddit:** r/${subreddit}`);
          if (selftext) {
            markdownLines.push('');
            markdownLines.push(selftext.substring(0, 500) + (selftext.length > 500 ? '...' : ''));
          }
          if (url && !url.includes('reddit.com')) {
            markdownLines.push(`[External Link](${url})`);
          }
          markdownLines.push(`*${numComments} comments*`);
          markdownLines.push('---');
          markdownLines.push('');
        }
      }
    }
    // Handle post detail (array with post and comments)
    else if (Array.isArray(data) && data.length >= 1) {
      const postListing = data[0] as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
      if (postListing?.data?.children?.[0]?.data) {
        const post = postListing.data.children[0].data;
        title = String(post.title || 'Reddit Post');
        const author = String(post.author || 'unknown');
        const score = post.score || 0;
        const selftext = String(post.selftext || '');
        const subreddit = String(post.subreddit || '');

        lines.push(title);
        lines.push(`by u/${author} in r/${subreddit} | Score: ${score}`);
        lines.push('');
        if (selftext) {
          lines.push(selftext);
          lines.push('');
        }

        markdownLines.push(`# ${title}`);
        markdownLines.push(`**Author:** u/${author} | **Subreddit:** r/${subreddit} | **Score:** ${score}`);
        markdownLines.push('');
        if (selftext) {
          markdownLines.push(selftext);
          markdownLines.push('');
        }

        // Add comments if present
        if (data.length >= 2) {
          const commentsListing = data[1] as { data?: { children?: Array<{ kind: string; data?: Record<string, unknown> }> } };
          if (commentsListing?.data?.children) {
            lines.push('--- Comments ---');
            markdownLines.push('## Comments');
            markdownLines.push('');

            for (const comment of commentsListing.data.children.slice(0, 10)) {
              if (comment.kind === 't1' && comment.data) {
                const commentAuthor = String(comment.data.author || 'unknown');
                const commentBody = String(comment.data.body || '');
                const commentScore = comment.data.score || 0;

                lines.push(`[${commentScore}] u/${commentAuthor}:`);
                lines.push(`  ${commentBody.substring(0, 300)}${commentBody.length > 300 ? '...' : ''}`);
                lines.push('');

                markdownLines.push(`**u/${commentAuthor}** (${commentScore} points)`);
                markdownLines.push(commentBody.substring(0, 500) + (commentBody.length > 500 ? '...' : ''));
                markdownLines.push('');
              }
            }
          }
        }
      }
    }

    return {
      title: title || 'Reddit Content',
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
      structured: data,
    };
  }

  /**
   * Check if data is a Reddit Listing
   */
  private isRedditListing(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    return obj.kind === 'Listing' && typeof obj.data === 'object' && obj.data !== null;
  }

  // ============================================
  // STRATEGY: Learned API Patterns
  // ============================================

  // Confidence thresholds for pattern application
  private static readonly MIN_PATTERN_CONFIDENCE = 0.3;
  private static readonly HIGH_CONFIDENCE_THRESHOLD = 0.8;
  private static readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.5;

  /**
   * Try learned API patterns from previous successful extractions
   * This applies patterns learned from the ApiPatternRegistry
   */
  private async tryLearnedPatterns(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    // Ensure pattern registry is initialized
    await this.ensurePatternRegistryInitialized();

    // Check for active anti-patterns that would block this URL
    const antiPatterns = await this.patternRegistry.checkAntiPatterns(url);
    if (antiPatterns.length > 0) {
      logger.intelligence.debug('Skipping URL due to active anti-patterns', {
        url,
        antiPatternCount: antiPatterns.length,
        categories: antiPatterns.map(ap => ap.failureCategory),
        reasons: antiPatterns.map(ap => ap.reason),
      });
      return null; // Skip - this URL matches active anti-patterns
    }

    // Find patterns that match this URL
    const matches = this.patternRegistry.findMatchingPatterns(url);

    if (matches.length === 0) {
      return null; // No learned patterns match this URL
    }

    const domain = new URL(url).hostname;
    logger.intelligence.debug('Found matching learned patterns', {
      url,
      patternCount: matches.length,
      topPattern: matches[0].pattern.id,
      topConfidence: matches[0].confidence,
    });

    // Try patterns in confidence order (already sorted)
    for (const match of matches) {
      // Skip low-confidence patterns
      if (match.confidence < ContentIntelligence.MIN_PATTERN_CONFIDENCE) {
        logger.intelligence.debug('Skipping low-confidence pattern', {
          patternId: match.pattern.id,
          confidence: match.confidence,
        });
        continue;
      }

      const result = await this.applyLearnedPattern(match, url, domain, opts);
      if (result) {
        return result;
      }
    }

    return null; // All attempted patterns failed
  }

  /**
   * Apply a learned pattern to extract content
   */
  private async applyLearnedPattern(
    match: PatternMatch,
    originalUrl: string,
    domain: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const pattern = match.pattern;
    const startTime = Date.now();

    logger.intelligence.debug('Applying learned pattern', {
      patternId: pattern.id,
      templateType: pattern.templateType,
      apiEndpoint: match.apiEndpoint,
    });

    try {
      // Step 1: Build and execute request
      const response = await this.fetchWithCookies(match.apiEndpoint, {
        ...opts,
        headers: {
          ...opts.headers,
          ...(pattern.headers || {}),
          Accept: 'application/json',
        },
      });

      const responseTime = Date.now() - startTime;

      // Step 2: Validate HTTP response
      if (!response.ok) {
        return this.handlePatternFailure(
          pattern.id,
          domain,
          responseTime,
          `HTTP ${response.status}`,
          { status: response.status },
          match.apiEndpoint
        );
      }

      // Step 3: Validate content type
      const contentType = response.headers.get('content-type') || '';
      if (pattern.responseFormat === 'json' && !contentType.includes('application/json')) {
        return this.handlePatternFailure(
          pattern.id,
          domain,
          responseTime,
          'Wrong content type',
          { contentType },
          match.apiEndpoint
        );
      }

      // Step 4: Parse response
      let data: unknown;
      if (pattern.responseFormat === 'json') {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Step 5: Validate required fields
      for (const field of pattern.validation.requiredFields) {
        if (!this.hasFieldAtPath(data, field)) {
          return this.handlePatternFailure(
            pattern.id,
            domain,
            responseTime,
            `Missing required field: ${field}`,
            { missingField: field },
            match.apiEndpoint
          );
        }
      }

      // Step 6: Extract content using contentMapping
      const extractedContent = this.extractContentFromMapping(data, pattern.contentMapping);

      // Step 7: Validate content length
      if (extractedContent.text.length < pattern.validation.minContentLength) {
        return this.handlePatternFailure(
          pattern.id,
          domain,
          responseTime,
          'Content too short',
          { length: extractedContent.text.length, minRequired: pattern.validation.minContentLength },
          match.apiEndpoint
        );
      }

      // Step 8: Success! Update metrics
      await this.patternRegistry.updatePatternMetrics(
        pattern.id,
        true,
        domain,
        responseTime
      );

      logger.intelligence.info('Learned pattern extraction successful', {
        patternId: pattern.id,
        templateType: pattern.templateType,
        url: originalUrl,
        apiUrl: match.apiEndpoint,
        contentLength: extractedContent.text.length,
        responseTime,
      });

      // Return the result
      return {
        content: {
          title: extractedContent.title,
          text: extractedContent.text,
          markdown: extractedContent.markdown,
          structured: typeof data === 'object' ? (data as Record<string, unknown>) : undefined,
        },
        meta: {
          url: originalUrl,
          finalUrl: match.apiEndpoint,
          strategy: 'api:learned',
          strategiesAttempted: [],
          timing: responseTime,
          confidence: match.confidence > ContentIntelligence.HIGH_CONFIDENCE_THRESHOLD
            ? 'high'
            : match.confidence > ContentIntelligence.MEDIUM_CONFIDENCE_THRESHOLD
              ? 'medium'
              : 'low',
        },
        warnings: [],
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const failureReason = error instanceof Error ? error.message : 'Unknown error';

      // Classify the failure
      const classification = classifyFailure(undefined, failureReason, responseTime);

      logger.intelligence.debug('Learned pattern failed: error', {
        patternId: pattern.id,
        error: failureReason,
        failureCategory: classification.category,
      });

      // Record the failure (updates metrics and may create anti-pattern)
      await this.patternRegistry.recordPatternFailure(
        pattern.id,
        domain,
        match.apiEndpoint,
        undefined,
        failureReason,
        responseTime
      );

      return null;
    }
  }

  /**
   * Try to discover OpenAPI/Swagger specification for the domain
   * and use it to extract content
   */
  private async tryOpenAPIDiscovery(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const domain = new URL(url).hostname;

    // Don't re-discover if we already have OpenAPI patterns for this domain
    await this.ensurePatternRegistryInitialized();
    if (this.patternRegistry.hasOpenAPIPatterns(domain)) {
      // Already have OpenAPI patterns - they'll be tried via tryLearnedPatterns
      logger.intelligence.debug('OpenAPI patterns already exist for domain', { domain });
      return null;
    }

    // Try to discover OpenAPI spec for this domain
    const startTime = Date.now();
    try {
      const result = await this.patternRegistry.discoverFromOpenAPI(domain, {
        timeout: opts.timeout ? opts.timeout / 2 : 10000, // Use half the total timeout
        headers: opts.headers,
      });

      if (!result || result.patternsGenerated === 0) {
        logger.intelligence.debug('No OpenAPI spec found or no patterns generated', {
          domain,
          time: Date.now() - startTime,
        });
        return null;
      }

      logger.intelligence.info('OpenAPI discovery successful', {
        domain,
        patternsGenerated: result.patternsGenerated,
        time: Date.now() - startTime,
      });

      // Now try to apply the newly discovered patterns
      // Re-check matching patterns after discovery
      const matches = this.patternRegistry.findMatchingPatterns(url);
      const openapiMatches = matches.filter(m => m.pattern.id.startsWith('openapi:'));

      if (openapiMatches.length === 0) {
        logger.intelligence.debug('No OpenAPI patterns match this URL', { url, domain });
        return null;
      }

      // Try the first matching OpenAPI pattern
      for (const match of openapiMatches) {
        const contentResult = await this.applyLearnedPattern(match, url, domain, opts);
        if (contentResult) {
          // Update strategy to reflect OpenAPI source
          contentResult.meta.strategy = 'api:openapi';
          return contentResult;
        }
      }

      return null;
    } catch (error) {
      logger.intelligence.debug('OpenAPI discovery failed', {
        domain,
        error: error instanceof Error ? error.message : String(error),
        time: Date.now() - startTime,
      });
      return null;
    }
  }

  /**
   * Try to discover GraphQL API via introspection
   */
  private async tryGraphQLDiscovery(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const domain = new URL(url).hostname;
    const startTime = Date.now();

    try {
      // Check if this domain is likely to have GraphQL (optimization)
      // For unknown domains, we still try but with lower priority
      const likelyGraphQL = isLikelyGraphQL(domain);

      logger.intelligence.debug('Attempting GraphQL discovery', {
        domain,
        likelyGraphQL,
      });

      // Create a fetch function that uses our cookie jar and timeout handling
      const graphqlFetch = async (url: string, init?: RequestInit): Promise<Response> => {
        const cookieString = await this.cookieJar.getCookieString(url);

        const headers: Record<string, string> = {
          'User-Agent': opts.userAgent || DEFAULT_OPTIONS.userAgent!,
          ...(init?.headers as Record<string, string> || {}),
        };

        if (cookieString) {
          headers['Cookie'] = cookieString;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), opts.timeout || TIMEOUTS.NETWORK_FETCH);

        try {
          const response = await fetch(url, {
            ...init,
            headers,
            signal: controller.signal,
          });
          return response;
        } finally {
          clearTimeout(timeoutId);
        }
      };

      // Try to discover GraphQL endpoint and introspect schema
      const result = await discoverGraphQL(domain, {
        headers: opts.headers,
        fetchFn: graphqlFetch,
      });

      if (!result.found) {
        logger.intelligence.debug('No GraphQL endpoint found', {
          domain,
          time: Date.now() - startTime,
        });
        return null;
      }

      if (result.introspectionDisabled) {
        logger.intelligence.debug('GraphQL introspection disabled', {
          domain,
          endpoint: result.endpoint,
          time: Date.now() - startTime,
        });
        return null;
      }

      if (!result.schema || !result.patterns || result.patterns.length === 0) {
        logger.intelligence.debug('GraphQL discovered but no patterns generated', {
          domain,
          endpoint: result.endpoint,
          time: Date.now() - startTime,
        });
        return null;
      }

      logger.intelligence.info('GraphQL discovery successful', {
        domain,
        endpoint: result.endpoint,
        patterns: result.patterns.length,
        entityTypes: result.schema.entityTypes.length,
        paginationPattern: result.schema.paginationPattern,
        time: Date.now() - startTime,
      });

      // Filter patterns once for efficiency
      const queryPatterns = result.patterns.filter(p => p.operationType === 'query');
      const mutationPatterns = result.patterns.filter(p => p.operationType === 'mutation');

      // For now, return a summary of the discovered schema
      // In the future, we could execute specific queries based on the URL
      const schemaInfo = this.formatGraphQLSchemaInfo(result, queryPatterns, mutationPatterns);

      return {
        content: {
          title: `GraphQL API: ${domain}`,
          text: schemaInfo.text,
          markdown: schemaInfo.markdown,
          structured: {
            endpoint: result.endpoint,
            queryCount: queryPatterns.length,
            mutationCount: mutationPatterns.length,
            entityTypes: result.schema.entityTypes,
            paginationPattern: result.schema.paginationPattern,
            queries: queryPatterns.map(p => p.queryName),
            mutations: mutationPatterns.map(p => p.queryName),
          },
        },
        meta: {
          url,
          finalUrl: result.endpoint!,
          strategy: 'api:graphql',
          strategiesAttempted: ['api:graphql'],
          timing: Date.now() - startTime,
          confidence: 'high',
        },
        warnings: [],
      };
    } catch (error) {
      logger.intelligence.debug('GraphQL discovery failed', {
        domain,
        error: error instanceof Error ? error.message : String(error),
        time: Date.now() - startTime,
      });
      return null;
    }
  }

  /**
   * Format GraphQL schema information for display
   * Accepts pre-filtered query and mutation patterns for efficiency
   */
  private formatGraphQLSchemaInfo(
    result: GraphQLDiscoveryResult,
    queryPatterns: GraphQLQueryPattern[],
    mutationPatterns: GraphQLQueryPattern[]
  ): { text: string; markdown: string } {
    if (!result.schema) {
      return { text: 'GraphQL endpoint found, but introspection failed.', markdown: 'GraphQL endpoint found, but introspection failed.' };
    }

    const lines: string[] = [
      `GraphQL API at ${result.endpoint}`,
      '',
      `Entity Types: ${result.schema.entityTypes.join(', ')}`,
      '',
      `Available Queries (${queryPatterns.length}):`,
      ...queryPatterns.map(p => `  - ${p.queryName}(${p.requiredArgs.map(a => a.name).join(', ')})`),
    ];

    if (mutationPatterns.length > 0) {
      lines.push('', `Available Mutations (${mutationPatterns.length}):`);
      lines.push(...mutationPatterns.map(p => `  - ${p.queryName}(${p.requiredArgs.map(a => a.name).join(', ')})`));
    }

    if (result.schema.paginationPattern) {
      lines.push('', `Pagination Pattern: ${result.schema.paginationPattern}`);
    }

    const text = lines.join('\n');

    // Markdown version
    const mdLines: string[] = [
      `# GraphQL API`,
      '',
      `**Endpoint:** ${result.endpoint}`,
      '',
      `## Entity Types`,
      result.schema.entityTypes.map(t => `- ${t}`).join('\n'),
      '',
      `## Available Queries (${queryPatterns.length})`,
      ...queryPatterns.map(p => `- \`${p.queryName}\`${p.requiredArgs.length > 0 ? ` (requires: ${p.requiredArgs.map(a => a.name).join(', ')})` : ''}`),
    ];

    if (mutationPatterns.length > 0) {
      mdLines.push('', `## Available Mutations (${mutationPatterns.length})`);
      mdLines.push(...mutationPatterns.map(p => `- \`${p.queryName}\`${p.requiredArgs.length > 0 ? ` (requires: ${p.requiredArgs.map(a => a.name).join(', ')})` : ''}`));
    }

    if (result.schema.paginationPattern) {
      mdLines.push('', `**Pagination Pattern:** ${result.schema.paginationPattern}`);
    }

    return { text, markdown: mdLines.join('\n') };
  }

  /**
   * Check if an object has a field at the given path (supports dot notation and array access)
   */
  private hasFieldAtPath(obj: unknown, path: string): boolean {
    const value = this.getValueAtPath(obj, path);
    return value !== undefined && value !== null;
  }

  /**
   * Get a value from an object using dot notation path
   * Supports array access like "items[0].title"
   */
  private getValueAtPath(obj: unknown, path: string): unknown {
    if (!path || typeof obj !== 'object' || obj === null) {
      return undefined;
    }

    // Handle array notation like "items[0]"
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    let current: unknown = obj;

    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }

      // Handle numeric indices for arrays
      if (/^\d+$/.test(part) && Array.isArray(current)) {
        current = current[parseInt(part, 10)];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * Extract content from API response using contentMapping
   * Handles HTML content by converting to plain text and markdown
   */
  private extractContentFromMapping(
    data: unknown,
    mapping: ContentMapping
  ): { title: string; text: string; markdown: string } {
    const rawTitle = this.getStringAtPath(data, mapping.title) || 'Untitled';
    const rawDescription = mapping.description ? this.getStringAtPath(data, mapping.description) : null;
    const rawBody = mapping.body ? this.getStringAtPath(data, mapping.body) : null;

    // Prefer body content, fall back to description
    const mainContent = rawBody || rawDescription || this.extractTextFromStructured(data);

    // Strip HTML for title (titles should be plain text)
    const title = this.isHtmlContent(rawTitle) ? this.htmlToPlainText(rawTitle) : rawTitle;

    // Convert HTML content to plain text and markdown
    if (mainContent && this.isHtmlContent(mainContent)) {
      const text = this.htmlToPlainText(mainContent);
      const markdown = this.turndown.turndown(mainContent);
      return { title, text, markdown };
    }

    // Content is already plain text
    const text = mainContent || '';
    const markdown = mainContent || '';
    return { title, text, markdown };
  }

  /**
   * Check if a string contains HTML content
   */
  private isHtmlContent(str: string): boolean {
    // Simple check for HTML tags
    return /<[a-z][\s\S]*>/i.test(str);
  }

  /**
   * Get a string value from an object at the given path
   */
  private getStringAtPath(obj: unknown, path: string): string | null {
    const value = this.getValueAtPath(obj, path);

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return null;
  }

  /**
   * Extract text content from structured data
   */
  private extractTextFromStructured(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    if (typeof data !== 'object' || data === null) {
      return '';
    }

    // Look for common content fields
    const obj = data as Record<string, unknown>;
    const contentFields = [
      'text', 'content', 'body', 'description', 'summary', 'selftext',
      'extract', 'body_markdown', 'readme', 'info.description',
    ];

    for (const field of contentFields) {
      const value = this.getValueAtPath(obj, field);
      if (typeof value === 'string' && value.length > 20) {
        return value;
      }
    }

    return '';
  }

  /**
   * Handle pattern failure by logging, classifying, and updating metrics
   * Uses failure learning to track patterns and potentially create anti-patterns
   * Returns null to indicate failure to caller
   */
  private async handlePatternFailure(
    patternId: string,
    domain: string,
    responseTime: number,
    reason: string,
    logContext: Record<string, unknown>,
    attemptedUrl?: string
  ): Promise<null> {
    // Extract status code from logContext if present
    const statusCode = typeof logContext.status === 'number' ? logContext.status : undefined;

    // Classify the failure
    const classification = classifyFailure(statusCode, reason, responseTime);

    logger.intelligence.debug(`Learned pattern failed: ${reason}`, {
      patternId,
      failureCategory: classification.category,
      confidence: classification.confidence,
      recommendedStrategy: classification.recommendedStrategy,
      ...logContext,
    });

    // Record the failure with full classification (creates anti-patterns if threshold reached)
    await this.patternRegistry.recordPatternFailure(
      patternId,
      domain,
      attemptedUrl || '',
      statusCode,
      reason,
      responseTime
    );

    return null;
  }

  // ============================================
  // STRATEGY: Site-Specific APIs (Reddit)
  // ============================================

  /**
   * Try Reddit's public JSON API
   */
  private async tryRedditAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    // Only try for Reddit URLs
    if (!this.isRedditUrl(url)) {
      return null;
    }

    const jsonUrl = this.getRedditJsonUrl(url);
    logger.intelligence.debug(`Trying Reddit JSON API: ${jsonUrl}`);

    try {
      const response = await this.fetchWithCookies(jsonUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`Reddit API returned ${response.status}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        logger.intelligence.debug(`Reddit API returned non-JSON: ${contentType}`);
        return null;
      }

      const data = await response.json();
      const formatted = this.formatRedditData(data);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug(`Reddit content too short: ${formatted.text.length}`);
        return null;
      }

      logger.intelligence.info(`Reddit API extraction successful`, {
        url: jsonUrl,
        contentLength: formatted.text.length,
      });

      return {
        content: {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: formatted.structured as Record<string, unknown>,
        },
        meta: {
          url,
          finalUrl: jsonUrl,
          strategy: 'api:reddit',
          strategiesAttempted: [],
          timing: 0,
          confidence: 'high',
        },
        warnings: [],
      };
    } catch (error) {
      logger.intelligence.debug(`Reddit API failed: ${error}`);
      return null;
    }
  }

  // ============================================
  // STRATEGY: HackerNews API Extraction
  // ============================================

  /**
   * Check if URL is a HackerNews URL
   */
  private isHackerNewsUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'news.ycombinator.com';
    } catch {
      return false;
    }
  }

  /**
   * Extract item ID from HackerNews URL
   */
  private getHackerNewsItemId(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('id');
    } catch {
      return null;
    }
  }

  /**
   * Format HackerNews item data into readable text/markdown
   */
  private formatHackerNewsItem(item: Record<string, unknown>): { title: string; text: string; markdown: string } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    const title = String(item.title || 'HackerNews Item');
    const author = String(item.by || 'unknown');
    const score = item.score || 0;
    const itemUrl = String(item.url || '');
    const itemText = String(item.text || '');
    const time = item.time ? new Date(Number(item.time) * 1000).toISOString() : '';
    const descendants = item.descendants || 0;
    const type = String(item.type || 'story');

    // Text format
    lines.push(`[${score}] ${title}`);
    lines.push(`by ${author} | ${time}`);
    if (itemUrl) {
      lines.push(`Link: ${itemUrl}`);
    }
    if (itemText) {
      // HN text is HTML, strip basic tags
      const cleanText = itemText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      lines.push(cleanText);
    }
    if (type === 'story') {
      lines.push(`${descendants} comments`);
    }

    // Markdown format
    markdownLines.push(`# ${title}`);
    markdownLines.push(`**Score:** ${score} | **Author:** ${author} | **Posted:** ${time}`);
    if (itemUrl) {
      markdownLines.push(`[Original Link](${itemUrl})`);
    }
    markdownLines.push('');
    if (itemText) {
      const cleanText = itemText.replace(/<p>/g, '\n\n').replace(/<[^>]+>/g, '').trim();
      markdownLines.push(cleanText);
    }
    if (type === 'story') {
      markdownLines.push(`*${descendants} comments*`);
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format HackerNews front page stories
   */
  private formatHackerNewsStories(stories: Array<Record<string, unknown>>): { title: string; text: string; markdown: string } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    lines.push('HackerNews Top Stories');
    lines.push('='.repeat(50));
    markdownLines.push('# HackerNews Top Stories');
    markdownLines.push('');

    for (const story of stories) {
      const title = String(story.title || 'Untitled');
      const author = String(story.by || 'unknown');
      const score = story.score || 0;
      const itemUrl = String(story.url || '');
      const descendants = story.descendants || 0;
      const id = story.id;

      // Text format
      lines.push(`[${score}] ${title}`);
      lines.push(`  by ${author} | ${descendants} comments`);
      if (itemUrl) {
        lines.push(`  ${itemUrl}`);
      }
      lines.push('');

      // Markdown format
      markdownLines.push(`## [${title}](https://news.ycombinator.com/item?id=${id})`);
      markdownLines.push(`**Score:** ${score} | **Author:** ${author} | **Comments:** ${descendants}`);
      if (itemUrl) {
        markdownLines.push(`[Original Link](${itemUrl})`);
      }
      markdownLines.push('---');
      markdownLines.push('');
    }

    return {
      title: 'HackerNews Top Stories',
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Try HackerNews Firebase API
   */
  private async tryHackerNewsAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!this.isHackerNewsUrl(url)) {
      return null;
    }

    const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

    try {
      // Check if this is an item page
      const itemId = this.getHackerNewsItemId(url);

      if (itemId) {
        // Fetch single item
        const apiUrl = `${HN_API_BASE}/item/${itemId}.json`;
        logger.intelligence.debug(`Trying HackerNews item API: ${apiUrl}`);

        const response = await this.fetchWithCookies(apiUrl, opts);
        if (!response.ok) {
          logger.intelligence.debug(`HackerNews API returned ${response.status}`);
          return null;
        }

        const item = await response.json() as Record<string, unknown>;
        if (!item || !item.id) {
          return null;
        }

        const formatted = this.formatHackerNewsItem(item);

        if (formatted.text.length < (opts.minContentLength || 100)) {
          return null;
        }

        logger.intelligence.info(`HackerNews item API extraction successful`, {
          itemId,
          contentLength: formatted.text.length,
        });

        return {
          content: {
            title: formatted.title,
            text: formatted.text,
            markdown: formatted.markdown,
            structured: item,
          },
          meta: {
            url,
            finalUrl: apiUrl,
            strategy: 'api:hackernews',
            strategiesAttempted: [],
            timing: 0,
            confidence: 'high',
          },
          warnings: [],
        };
      } else {
        // Fetch top stories (front page)
        const topStoriesUrl = `${HN_API_BASE}/topstories.json`;
        logger.intelligence.debug(`Trying HackerNews top stories API: ${topStoriesUrl}`);

        const response = await this.fetchWithCookies(topStoriesUrl, opts);
        if (!response.ok) {
          return null;
        }

        const storyIds = await response.json() as number[];
        if (!Array.isArray(storyIds) || storyIds.length === 0) {
          return null;
        }

        // Fetch top 20 stories in parallel
        const top20Ids = storyIds.slice(0, 20);
        const storyPromises = top20Ids.map(async (id) => {
          try {
            const storyResponse = await this.fetchWithCookies(`${HN_API_BASE}/item/${id}.json`, opts);
            if (storyResponse.ok) {
              return await storyResponse.json() as Record<string, unknown>;
            }
          } catch {
            // Skip failed fetches
          }
          return null;
        });

        const stories = (await Promise.all(storyPromises)).filter(Boolean) as Array<Record<string, unknown>>;

        if (stories.length === 0) {
          return null;
        }

        const formatted = this.formatHackerNewsStories(stories);

        logger.intelligence.info(`HackerNews top stories API extraction successful`, {
          storiesCount: stories.length,
          contentLength: formatted.text.length,
        });

        return {
          content: {
            title: formatted.title,
            text: formatted.text,
            markdown: formatted.markdown,
            structured: { stories },
          },
          meta: {
            url,
            finalUrl: topStoriesUrl,
            strategy: 'api:hackernews',
            strategiesAttempted: [],
            timing: 0,
            confidence: 'high',
          },
          warnings: [],
        };
      }
    } catch (error) {
      logger.intelligence.debug(`HackerNews API failed: ${error}`);
      return null;
    }
  }

  // ============================================
  // STRATEGY: GitHub API Extraction
  // ============================================

  /**
   * Check if URL is a GitHub URL
   */
  private isGitHubUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'github.com';
    } catch {
      return false;
    }
  }

  /**
   * Parse GitHub URL to determine type and extract params
   */
  private parseGitHubUrl(url: string): { type: 'repo' | 'user' | 'issue' | 'pr' | 'unknown'; owner?: string; repo?: string; number?: string } {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);

      if (parts.length === 1) {
        // User/org page: github.com/username
        return { type: 'user', owner: parts[0] };
      } else if (parts.length === 2) {
        // Repo page: github.com/owner/repo
        return { type: 'repo', owner: parts[0], repo: parts[1] };
      } else if (parts.length >= 4) {
        const owner = parts[0];
        const repo = parts[1];
        const subType = parts[2];
        const num = parts[3];

        if (subType === 'issues' && num) {
          return { type: 'issue', owner, repo, number: num };
        } else if (subType === 'pull' && num) {
          return { type: 'pr', owner, repo, number: num };
        }
      }
    } catch {
      // Invalid URL
    }
    return { type: 'unknown' };
  }

  /**
   * Format GitHub repo data
   */
  private formatGitHubRepo(repo: Record<string, unknown>): { title: string; text: string; markdown: string } {
    const name = String(repo.full_name || repo.name || 'Unknown Repo');
    const description = String(repo.description || '');
    const stars = repo.stargazers_count || 0;
    const forks = repo.forks_count || 0;
    const language = String(repo.language || 'Unknown');
    const license = (repo.license as Record<string, unknown>)?.name || 'None';
    const topics = (repo.topics as string[]) || [];
    const defaultBranch = String(repo.default_branch || 'main');
    const openIssues = repo.open_issues_count || 0;
    const createdAt = String(repo.created_at || '');
    const updatedAt = String(repo.updated_at || '');
    const homepage = String(repo.homepage || '');

    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(name);
    lines.push('='.repeat(name.length));
    if (description) lines.push(description);
    lines.push('');
    lines.push(`Stars: ${stars} | Forks: ${forks} | Open Issues: ${openIssues}`);
    lines.push(`Language: ${language} | License: ${license}`);
    lines.push(`Default Branch: ${defaultBranch}`);
    if (topics.length > 0) lines.push(`Topics: ${topics.join(', ')}`);
    if (homepage) lines.push(`Homepage: ${homepage}`);
    lines.push(`Created: ${createdAt} | Updated: ${updatedAt}`);

    // Markdown format
    markdownLines.push(`# ${name}`);
    if (description) markdownLines.push(`> ${description}`);
    markdownLines.push('');
    markdownLines.push(`| Stars | Forks | Issues | Language | License |`);
    markdownLines.push(`|-------|-------|--------|----------|---------|`);
    markdownLines.push(`| ${stars} | ${forks} | ${openIssues} | ${language} | ${license} |`);
    markdownLines.push('');
    if (topics.length > 0) {
      markdownLines.push(`**Topics:** ${topics.map(t => `\`${t}\``).join(' ')}`);
    }
    if (homepage) {
      markdownLines.push(`**Homepage:** [${homepage}](${homepage})`);
    }
    markdownLines.push(`**Created:** ${createdAt} | **Updated:** ${updatedAt}`);

    return {
      title: name,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format GitHub user data
   */
  private formatGitHubUser(user: Record<string, unknown>): { title: string; text: string; markdown: string } {
    const login = String(user.login || 'Unknown');
    const name = String(user.name || login);
    const bio = String(user.bio || '');
    const company = String(user.company || '');
    const location = String(user.location || '');
    const publicRepos = user.public_repos || 0;
    const followers = user.followers || 0;
    const following = user.following || 0;
    const blog = String(user.blog || '');
    const type = String(user.type || 'User');

    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(`${name} (@${login})`);
    lines.push('='.repeat(30));
    if (bio) lines.push(bio);
    lines.push('');
    lines.push(`Type: ${type}`);
    lines.push(`Public Repos: ${publicRepos} | Followers: ${followers} | Following: ${following}`);
    if (company) lines.push(`Company: ${company}`);
    if (location) lines.push(`Location: ${location}`);
    if (blog) lines.push(`Blog: ${blog}`);

    // Markdown format
    markdownLines.push(`# ${name} (@${login})`);
    if (bio) markdownLines.push(`> ${bio}`);
    markdownLines.push('');
    markdownLines.push(`| Repos | Followers | Following |`);
    markdownLines.push(`|-------|-----------|-----------|`);
    markdownLines.push(`| ${publicRepos} | ${followers} | ${following} |`);
    markdownLines.push('');
    if (company) markdownLines.push(`**Company:** ${company}`);
    if (location) markdownLines.push(`**Location:** ${location}`);
    if (blog) markdownLines.push(`**Blog:** [${blog}](${blog})`);

    return {
      title: `${name} (@${login})`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format GitHub issue/PR data
   */
  private formatGitHubIssue(issue: Record<string, unknown>, isPR: boolean): { title: string; text: string; markdown: string } {
    const title = String(issue.title || 'Untitled');
    const number = issue.number;
    const state = String(issue.state || 'unknown');
    const author = (issue.user as Record<string, unknown>)?.login || 'unknown';
    const body = String(issue.body || '');
    const labels = ((issue.labels || []) as Array<Record<string, unknown>>).map(l => String(l.name)).filter(Boolean);
    const createdAt = String(issue.created_at || '');
    const comments = issue.comments || 0;

    const lines: string[] = [];
    const markdownLines: string[] = [];
    const typeLabel = isPR ? 'Pull Request' : 'Issue';

    // Text format
    lines.push(`${typeLabel} #${number}: ${title}`);
    lines.push('='.repeat(50));
    lines.push(`State: ${state} | Author: @${author} | Comments: ${comments}`);
    lines.push(`Created: ${createdAt}`);
    if (labels.length > 0) lines.push(`Labels: ${labels.join(', ')}`);
    lines.push('');
    if (body) lines.push(body);

    // Markdown format
    markdownLines.push(`# ${typeLabel} #${number}: ${title}`);
    markdownLines.push(`**State:** ${state} | **Author:** @${author} | **Comments:** ${comments}`);
    markdownLines.push(`**Created:** ${createdAt}`);
    if (labels.length > 0) {
      markdownLines.push(`**Labels:** ${labels.map(l => `\`${l}\``).join(' ')}`);
    }
    markdownLines.push('');
    if (body) markdownLines.push(body);

    return {
      title: `${typeLabel} #${number}: ${title}`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Try GitHub public API
   */
  private async tryGitHubAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!this.isGitHubUrl(url)) {
      return null;
    }

    const parsed = this.parseGitHubUrl(url);
    if (parsed.type === 'unknown') {
      return null;
    }

    const GITHUB_API = 'https://api.github.com';

    try {
      let apiUrl: string;
      let formatted: { title: string; text: string; markdown: string };
      let structured: Record<string, unknown>;

      const apiHeaders = {
        ...opts.headers,
        'Accept': 'application/vnd.github.v3+json',
      };

      if (parsed.type === 'repo' && parsed.owner && parsed.repo) {
        apiUrl = `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}`;
        logger.intelligence.debug(`Trying GitHub repo API: ${apiUrl}`);

        const response = await this.fetchWithCookies(apiUrl, { ...opts, headers: apiHeaders });
        if (!response.ok) {
          logger.intelligence.debug(`GitHub API returned ${response.status}`);
          return null;
        }

        structured = await response.json() as Record<string, unknown>;
        formatted = this.formatGitHubRepo(structured);

      } else if (parsed.type === 'user' && parsed.owner) {
        apiUrl = `${GITHUB_API}/users/${parsed.owner}`;
        logger.intelligence.debug(`Trying GitHub user API: ${apiUrl}`);

        const response = await this.fetchWithCookies(apiUrl, { ...opts, headers: apiHeaders });
        if (!response.ok) {
          return null;
        }

        structured = await response.json() as Record<string, unknown>;
        formatted = this.formatGitHubUser(structured);

      } else if ((parsed.type === 'issue' || parsed.type === 'pr') && parsed.owner && parsed.repo && parsed.number) {
        const endpoint = parsed.type === 'pr' ? 'pulls' : 'issues';
        apiUrl = `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}/${endpoint}/${parsed.number}`;
        logger.intelligence.debug(`Trying GitHub ${parsed.type} API: ${apiUrl}`);

        const response = await this.fetchWithCookies(apiUrl, { ...opts, headers: apiHeaders });
        if (!response.ok) {
          return null;
        }

        structured = await response.json() as Record<string, unknown>;
        formatted = this.formatGitHubIssue(structured, parsed.type === 'pr');

      } else {
        return null;
      }

      if (formatted.text.length < (opts.minContentLength || 100)) {
        return null;
      }

      logger.intelligence.info(`GitHub API extraction successful`, {
        type: parsed.type,
        contentLength: formatted.text.length,
      });

      return {
        content: {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured,
        },
        meta: {
          url,
          finalUrl: apiUrl,
          strategy: 'api:github',
          strategiesAttempted: [],
          timing: 0,
          confidence: 'high',
        },
        warnings: [],
      };

    } catch (error) {
      logger.intelligence.debug(`GitHub API failed: ${error}`);
      return null;
    }
  }

  // ============================================
  // STRATEGY: Wikipedia API Extraction
  // ============================================

  /**
   * Check if URL is a Wikipedia URL
   */
  private isWikipediaUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return /^[a-z]{2,3}\.wikipedia\.org$/i.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  /**
   * Extract article title from Wikipedia URL
   */
  private getWikipediaArticleTitle(url: string): string | null {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/\/wiki\/(.+)/);
      if (match) {
        return decodeURIComponent(match[1].replace(/_/g, ' '));
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  /**
   * Get Wikipedia API base URL from article URL
   */
  private getWikipediaApiBase(url: string): string {
    try {
      const parsed = new URL(url);
      return `https://${parsed.hostname}/api/rest_v1`;
    } catch {
      return 'https://en.wikipedia.org/api/rest_v1';
    }
  }

  /**
   * Try Wikipedia REST API
   */
  private async tryWikipediaAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!this.isWikipediaUrl(url)) {
      return null;
    }

    const articleTitle = this.getWikipediaArticleTitle(url);
    if (!articleTitle) {
      return null;
    }

    const apiBase = this.getWikipediaApiBase(url);
    const encodedTitle = encodeURIComponent(articleTitle);
    const summaryUrl = `${apiBase}/page/summary/${encodedTitle}`;

    logger.intelligence.debug(`Trying Wikipedia API: ${summaryUrl}`);

    try {
      const response = await this.fetchWithCookies(summaryUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`Wikipedia API returned ${response.status}`);
        return null;
      }

      const data = await response.json() as Record<string, unknown>;

      if (!data.title || !data.extract) {
        return null;
      }

      const title = String(data.title);
      const extract = String(data.extract);
      const description = String(data.description || '');
      const thumbnail = (data.thumbnail as Record<string, unknown>)?.source || '';

      // Build formatted output
      const lines: string[] = [];
      const markdownLines: string[] = [];

      // Text format
      lines.push(title);
      lines.push('='.repeat(title.length));
      if (description) lines.push(`(${description})`);
      lines.push('');
      lines.push(extract);

      // Markdown format
      markdownLines.push(`# ${title}`);
      if (description) markdownLines.push(`*${description}*`);
      markdownLines.push('');
      if (thumbnail) {
        markdownLines.push(`![${title}](${thumbnail})`);
        markdownLines.push('');
      }
      markdownLines.push(extract);

      const text = lines.join('\n');

      if (text.length < (opts.minContentLength || 100)) {
        // Try to get full content if summary is too short
        return null;
      }

      logger.intelligence.info(`Wikipedia API extraction successful`, {
        article: title,
        contentLength: text.length,
      });

      return {
        content: {
          title,
          text,
          markdown: markdownLines.join('\n'),
          structured: data,
        },
        meta: {
          url,
          finalUrl: summaryUrl,
          strategy: 'api:wikipedia',
          strategiesAttempted: [],
          timing: 0,
          confidence: 'high',
        },
        warnings: [],
      };

    } catch (error) {
      logger.intelligence.debug(`Wikipedia API failed: ${error}`);
      return null;
    }
  }

  // ============================================
  // STRATEGY: StackOverflow API Extraction
  // ============================================

  /**
   * Check if URL is a Stack Exchange URL
   */
  private isStackExchangeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const stackSites = [
        'stackoverflow.com',
        'serverfault.com',
        'superuser.com',
        'askubuntu.com',
        'stackexchange.com',
      ];
      return stackSites.some(site => parsed.hostname.endsWith(site));
    } catch {
      return false;
    }
  }

  /**
   * Parse Stack Exchange URL to get site and question ID
   */
  private parseStackExchangeUrl(url: string): { site: string; questionId: string | null } {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // Determine site parameter for API
      let site = 'stackoverflow';
      if (hostname.includes('serverfault')) site = 'serverfault';
      else if (hostname.includes('superuser')) site = 'superuser';
      else if (hostname.includes('askubuntu')) site = 'askubuntu';
      else if (hostname.includes('stackexchange')) {
        // Format: sitename.stackexchange.com
        const match = hostname.match(/^([^.]+)\.stackexchange\.com$/);
        if (match) site = match[1];
      }

      // Extract question ID from URL
      // Patterns: /questions/12345/..., /q/12345, /a/12345
      const questionMatch = parsed.pathname.match(/\/questions\/(\d+)/);
      const shortMatch = parsed.pathname.match(/\/q\/(\d+)/);

      const questionId = questionMatch?.[1] || shortMatch?.[1] || null;

      return { site, questionId };
    } catch {
      return { site: 'stackoverflow', questionId: null };
    }
  }

  /**
   * Format Stack Exchange question data
   */
  private formatStackExchangeQuestion(question: Record<string, unknown>, answers: Array<Record<string, unknown>>): { title: string; text: string; markdown: string } {
    const title = String(question.title || 'Question');
    const body = String(question.body || '');
    const score = question.score || 0;
    const viewCount = question.view_count || 0;
    const answerCount = question.answer_count || 0;
    const isAnswered = question.is_answered || false;
    const tags = (question.tags || []) as string[];
    const owner = (question.owner as Record<string, unknown>) || {};
    const authorName = String(owner.display_name || 'Anonymous');
    const createdAt = question.creation_date
      ? new Date(Number(question.creation_date) * 1000).toISOString()
      : '';

    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(title);
    lines.push('='.repeat(50));
    lines.push(`Score: ${score} | Views: ${viewCount} | Answers: ${answerCount}${isAnswered ? ' (Accepted)' : ''}`);
    lines.push(`Asked by: ${authorName} | ${createdAt}`);
    lines.push(`Tags: ${tags.join(', ')}`);
    lines.push('');
    // Strip HTML from body
    const cleanBody = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    lines.push(cleanBody);

    // Markdown format
    markdownLines.push(`# ${title}`);
    markdownLines.push(`**Score:** ${score} | **Views:** ${viewCount} | **Answers:** ${answerCount}${isAnswered ? ' (Accepted answer)' : ''}`);
    markdownLines.push(`**Asked by:** ${authorName} | **Date:** ${createdAt}`);
    markdownLines.push(`**Tags:** ${tags.map(t => `\`${t}\``).join(' ')}`);
    markdownLines.push('');
    markdownLines.push('## Question');
    markdownLines.push('');
    // Keep HTML structure for markdown but simplify
    const mdBody = body
      .replace(/<pre><code>/g, '\n```\n')
      .replace(/<\/code><\/pre>/g, '\n```\n')
      .replace(/<code>/g, '`')
      .replace(/<\/code>/g, '`')
      .replace(/<p>/g, '\n\n')
      .replace(/<\/p>/g, '')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '');
    markdownLines.push(mdBody.trim());

    // Add top answers
    if (answers.length > 0) {
      lines.push('');
      lines.push('--- Answers ---');
      markdownLines.push('');
      markdownLines.push('## Answers');

      for (const answer of answers.slice(0, 3)) {
        const answerBody = String(answer.body || '');
        const answerScore = answer.score || 0;
        const isAccepted = answer.is_accepted || false;
        const answerOwner = (answer.owner as Record<string, unknown>) || {};
        const answerAuthor = String(answerOwner.display_name || 'Anonymous');

        lines.push('');
        lines.push(`${isAccepted ? '[ACCEPTED] ' : ''}[${answerScore}] by ${answerAuthor}:`);
        const cleanAnswer = answerBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        lines.push(cleanAnswer.substring(0, 500) + (cleanAnswer.length > 500 ? '...' : ''));

        markdownLines.push('');
        markdownLines.push(`### ${isAccepted ? 'Accepted Answer' : 'Answer'} by ${answerAuthor} (${answerScore} votes)`);
        const mdAnswer = answerBody
          .replace(/<pre><code>/g, '\n```\n')
          .replace(/<\/code><\/pre>/g, '\n```\n')
          .replace(/<code>/g, '`')
          .replace(/<\/code>/g, '`')
          .replace(/<p>/g, '\n\n')
          .replace(/<\/p>/g, '')
          .replace(/<br\s*\/?>/g, '\n')
          .replace(/<[^>]+>/g, '');
        markdownLines.push(mdAnswer.trim());
      }
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Try Stack Exchange API
   */
  private async tryStackOverflowAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!this.isStackExchangeUrl(url)) {
      return null;
    }

    const { site, questionId } = this.parseStackExchangeUrl(url);
    if (!questionId) {
      return null;
    }

    const SE_API = 'https://api.stackexchange.com/2.3';
    const apiUrl = `${SE_API}/questions/${questionId}?site=${site}&filter=withbody`;

    logger.intelligence.debug(`Trying StackExchange API: ${apiUrl}`);

    try {
      const response = await this.fetchWithCookies(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`StackExchange API returned ${response.status}`);
        return null;
      }

      const data = await response.json() as { items?: Array<Record<string, unknown>> };

      if (!data.items || data.items.length === 0) {
        return null;
      }

      const question = data.items[0];

      // Also fetch answers
      let answers: Array<Record<string, unknown>> = [];
      try {
        const answersUrl = `${SE_API}/questions/${questionId}/answers?site=${site}&filter=withbody&sort=votes&order=desc`;
        const answersResponse = await this.fetchWithCookies(answersUrl, opts);
        if (answersResponse.ok) {
          const answersData = await answersResponse.json() as { items?: Array<Record<string, unknown>> };
          answers = answersData.items || [];
        }
      } catch {
        // Answers fetch failed, continue without them
      }

      const formatted = this.formatStackExchangeQuestion(question, answers);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        return null;
      }

      logger.intelligence.info(`StackExchange API extraction successful`, {
        site,
        questionId,
        contentLength: formatted.text.length,
        answersCount: answers.length,
      });

      return {
        content: {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: { question, answers },
        },
        meta: {
          url,
          finalUrl: apiUrl,
          strategy: 'api:stackoverflow',
          strategiesAttempted: [],
          timing: 0,
          confidence: 'high',
        },
        warnings: [],
      };

    } catch (error) {
      logger.intelligence.debug(`StackExchange API failed: ${error}`);
      return null;
    }
  }

  // ============================================
  // STRATEGY: NPM Registry API Extraction
  // ============================================

  /**
   * Check if URL is an NPM package URL
   */
  private isNpmUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === 'www.npmjs.com' ||
        parsed.hostname === 'npmjs.com' ||
        parsed.hostname === 'registry.npmjs.org'
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract package name from NPM URL
   * Handles:
   * - https://www.npmjs.com/package/express
   * - https://www.npmjs.com/package/@types/node
   * - https://registry.npmjs.org/express
   * - https://registry.npmjs.org/@types%2Fnode
   */
  private getNpmPackageName(url: string): string | null {
    try {
      const parsed = new URL(url);
      const pathname = decodeURIComponent(parsed.pathname);

      // npmjs.com format: /package/{name} or /package/@scope/name
      if (parsed.hostname.includes('npmjs.com')) {
        const match = pathname.match(/^\/package\/(.+)$/);
        if (match) {
          return match[1];
        }
      }

      // registry.npmjs.org format: /{name} or /@scope/name
      if (parsed.hostname === 'registry.npmjs.org') {
        // Remove leading slash
        const name = pathname.slice(1);
        if (name && name !== '-') {
          return name;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Format NPM package data into readable text/markdown
   */
  private formatNpmPackage(
    pkg: Record<string, unknown>,
    latestVersion: string
  ): { title: string; text: string; markdown: string } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    const name = String(pkg.name || 'Unknown Package');
    const description = String(pkg.description || 'No description');
    const latestInfo = (pkg.versions as Record<string, Record<string, unknown>> | undefined)?.[latestVersion] || {};
    const distTags = (pkg['dist-tags'] as Record<string, string>) || {};
    const license = String(latestInfo.license || pkg.license || 'Unknown');
    const homepage = String(latestInfo.homepage || pkg.homepage || '');
    const repository = this.extractRepoUrl(latestInfo.repository || pkg.repository);
    const rawKeywords = latestInfo.keywords || pkg.keywords;
    const keywords: string[] = Array.isArray(rawKeywords) ? rawKeywords : [];
    const maintainers: Array<{ name?: string; email?: string }> = Array.isArray(pkg.maintainers) ? pkg.maintainers : [];
    const dependencies = latestInfo.dependencies as Record<string, string> | undefined;
    const peerDependencies = latestInfo.peerDependencies as Record<string, string> | undefined;
    const time = pkg.time as Record<string, string> | undefined;

    // Text format
    lines.push(`${name}@${latestVersion}`);
    lines.push(`License: ${license}`);
    lines.push('');
    lines.push(description);
    lines.push('');

    // Version info
    if (Object.keys(distTags).length > 0) {
      lines.push('Dist Tags:');
      for (const [tag, version] of Object.entries(distTags)) {
        lines.push(`  ${tag}: ${version}`);
      }
      lines.push('');
    }

    // Links
    if (homepage) {
      lines.push(`Homepage: ${homepage}`);
    }
    if (repository) {
      lines.push(`Repository: ${repository}`);
    }
    lines.push('');

    // Keywords
    if (keywords.length > 0) {
      lines.push(`Keywords: ${keywords.join(', ')}`);
      lines.push('');
    }

    // Dependencies
    if (dependencies && Object.keys(dependencies).length > 0) {
      lines.push(`Dependencies (${Object.keys(dependencies).length}):`);
      for (const [dep, version] of Object.entries(dependencies).slice(0, 15)) {
        lines.push(`  ${dep}: ${version}`);
      }
      if (Object.keys(dependencies).length > 15) {
        lines.push(`  ... and ${Object.keys(dependencies).length - 15} more`);
      }
      lines.push('');
    }

    // Maintainers
    if (maintainers.length > 0) {
      lines.push('Maintainers:');
      for (const m of maintainers.slice(0, 5)) {
        lines.push(`  ${m.name || 'Unknown'}${m.email ? ` <${m.email}>` : ''}`);
      }
      if (maintainers.length > 5) {
        lines.push(`  ... and ${maintainers.length - 5} more`);
      }
    }

    // Markdown format
    markdownLines.push(`# ${name}`);
    markdownLines.push(`**Version:** ${latestVersion} | **License:** ${license}`);
    markdownLines.push('');
    markdownLines.push(description);
    markdownLines.push('');

    // Install command
    markdownLines.push('## Installation');
    markdownLines.push('```bash');
    markdownLines.push(`npm install ${name}`);
    markdownLines.push('```');
    markdownLines.push('');

    // Links section
    if (homepage || repository) {
      markdownLines.push('## Links');
      if (homepage) {
        markdownLines.push(`- [Homepage](${homepage})`);
      }
      if (repository) {
        markdownLines.push(`- [Repository](${repository})`);
      }
      markdownLines.push(`- [npm](https://www.npmjs.com/package/${name})`);
      markdownLines.push('');
    }

    // Dist tags
    if (Object.keys(distTags).length > 0) {
      markdownLines.push('## Dist Tags');
      markdownLines.push('| Tag | Version |');
      markdownLines.push('|-----|---------|');
      for (const [tag, version] of Object.entries(distTags)) {
        markdownLines.push(`| ${tag} | ${version} |`);
      }
      markdownLines.push('');
    }

    // Keywords
    if (keywords.length > 0) {
      markdownLines.push(`**Keywords:** ${keywords.map(k => `\`${k}\``).join(', ')}`);
      markdownLines.push('');
    }

    // Dependencies
    if (dependencies && Object.keys(dependencies).length > 0) {
      markdownLines.push(`## Dependencies (${Object.keys(dependencies).length})`);
      const depList = Object.entries(dependencies).slice(0, 10);
      for (const [dep, version] of depList) {
        markdownLines.push(`- \`${dep}\`: ${version}`);
      }
      if (Object.keys(dependencies).length > 10) {
        markdownLines.push(`- *...and ${Object.keys(dependencies).length - 10} more*`);
      }
      markdownLines.push('');
    }

    // Peer dependencies
    if (peerDependencies && Object.keys(peerDependencies).length > 0) {
      markdownLines.push(`## Peer Dependencies`);
      for (const [dep, version] of Object.entries(peerDependencies)) {
        markdownLines.push(`- \`${dep}\`: ${version}`);
      }
      markdownLines.push('');
    }

    // Maintainers
    if (maintainers.length > 0) {
      markdownLines.push('## Maintainers');
      for (const m of maintainers.slice(0, 5)) {
        markdownLines.push(`- ${m.name || 'Unknown'}`);
      }
      if (maintainers.length > 5) {
        markdownLines.push(`- *...and ${maintainers.length - 5} more*`);
      }
      markdownLines.push('');
    }

    // Last published
    if (time && time[latestVersion]) {
      const publishDate = new Date(time[latestVersion]);
      if (!isNaN(publishDate.getTime())) {
        markdownLines.push(`*Last published: ${publishDate.toLocaleDateString()}*`);
      }
    }

    return {
      title: `${name} - npm`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Extract repository URL from package.json repository field
   */
  private extractRepoUrl(repo: unknown): string {
    if (!repo) return '';

    let url = '';
    if (typeof repo === 'string') {
      url = repo;
    } else if (typeof repo === 'object' && repo !== null) {
      const repoObj = repo as Record<string, unknown>;
      url = String(repoObj.url || '');
    }

    // Convert git+https:// to https:// and remove .git suffix
    return url.replace(/^git\+/, '').replace(/\.git$/, '');
  }

  /**
   * Try NPM Registry API
   */
  private async tryNpmAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!this.isNpmUrl(url)) {
      return null;
    }

    const packageName = this.getNpmPackageName(url);
    if (!packageName) {
      return null;
    }

    // Encode package name for URL (handles scoped packages like @types/node)
    const encodedName = packageName.replace('/', '%2F');
    const apiUrl = `https://registry.npmjs.org/${encodedName}`;

    logger.intelligence.debug(`Trying NPM Registry API: ${apiUrl}`);

    try {
      const response = await this.fetchWithCookies(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`NPM Registry API returned ${response.status}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        logger.intelligence.debug(`NPM Registry API returned non-JSON: ${contentType}`);
        return null;
      }

      const data = await response.json() as Record<string, unknown>;

      if (!data.name) {
        logger.intelligence.debug('NPM Registry API returned invalid package data');
        return null;
      }

      // Get latest version
      const distTags = data['dist-tags'] as Record<string, string> | undefined;
      const latestVersion = distTags?.latest || 'unknown';

      const formatted = this.formatNpmPackage(data, latestVersion);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug(`NPM content too short: ${formatted.text.length}`);
        return null;
      }

      logger.intelligence.info(`NPM Registry API extraction successful`, {
        package: packageName,
        version: latestVersion,
        contentLength: formatted.text.length,
      });

      return {
        content: {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: data,
        },
        meta: {
          url,
          finalUrl: apiUrl,
          strategy: 'api:npm',
          strategiesAttempted: [],
          timing: 0,
          confidence: 'high',
        },
        warnings: [],
      };
    } catch (error) {
      logger.intelligence.debug(`NPM Registry API failed: ${error}`);
      return null;
    }
  }

  // ============================================================================
  // PyPI API Handler
  // ============================================================================

  /**
   * Check if URL is a PyPI package URL
   * Matches: pypi.org/project/{package}, pypi.python.org/pypi/{package}
   */
  private isPyPIUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Match pypi.org and pypi.python.org
      if (hostname === 'pypi.org' || hostname === 'www.pypi.org') {
        // /project/{package} or /project/{package}/{version}
        return /^\/project\/[^/]+/.test(parsed.pathname);
      }

      if (hostname === 'pypi.python.org') {
        // /pypi/{package} or /pypi/{package}/{version}
        return /^\/pypi\/[^/]+/.test(parsed.pathname);
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Extract package name from PyPI URL
   * Handles various URL formats:
   * - pypi.org/project/{package}
   * - pypi.org/project/{package}/{version}
   * - pypi.python.org/pypi/{package}
   * - pypi.python.org/pypi/{package}/{version}
   */
  private getPyPIPackageName(url: string): string | null {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      if (hostname === 'pypi.org' || hostname === 'www.pypi.org') {
        // /project/{package}/...
        if (pathParts[0] === 'project' && pathParts[1]) {
          return pathParts[1];
        }
      }

      if (hostname === 'pypi.python.org') {
        // /pypi/{package}/...
        if (pathParts[0] === 'pypi' && pathParts[1]) {
          return pathParts[1];
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Format PyPI package metadata into readable content
   */
  private formatPyPIPackage(
    pkg: Record<string, unknown>,
    releases: Record<string, unknown[]>
  ): { title: string; text: string; markdown: string } {
    const info = pkg.info as Record<string, unknown> | undefined;
    if (!info) {
      return { title: '', text: '', markdown: '' };
    }

    const name = String(info.name || '');
    const version = String(info.version || '');
    const summary = String(info.summary || '');
    const description = String(info.description || '');
    const author = String(info.author || info.maintainer || '');
    const authorEmail = String(info.author_email || info.maintainer_email || '');
    const license = String(info.license || '');
    const requiresPython = String(info.requires_python || '');
    const homePage = String(info.home_page || '');
    const projectUrls = info.project_urls as Record<string, string> | undefined;
    const classifiers = info.classifiers as string[] | undefined;
    const requiresDist = info.requires_dist as string[] | undefined;
    const keywords = String(info.keywords || '');

    // Build plain text
    const lines: string[] = [];
    lines.push(`${name} ${version}`);
    if (summary) lines.push(summary);
    lines.push('');

    if (author) lines.push(`Author: ${author}`);
    if (authorEmail) lines.push(`Email: ${authorEmail}`);
    if (license) lines.push(`License: ${license}`);
    if (requiresPython) lines.push(`Requires Python: ${requiresPython}`);

    if (homePage) lines.push(`Homepage: ${homePage}`);
    if (projectUrls) {
      const urls = Object.entries(projectUrls);
      if (urls.length > 0) {
        lines.push('Links:');
        for (const [label, link] of urls.slice(0, 5)) {
          lines.push(`  ${label}: ${link}`);
        }
      }
    }

    if (requiresDist && requiresDist.length > 0) {
      lines.push('');
      lines.push('Dependencies:');
      // Filter out extras (those with markers like "; extra ==")
      // Using regex to handle variable whitespace per PEP 508
      const mainDeps = requiresDist.filter((d) => !/;\s*extra\s*==/.test(d));
      for (const dep of mainDeps.slice(0, 10)) {
        // Remove version specifiers for brevity
        const depName = dep.split(/[<>=!;\[]/)[0].trim();
        lines.push(`  - ${depName}`);
      }
      if (mainDeps.length > 10) {
        lines.push(`  - ...and ${mainDeps.length - 10} more`);
      }
    }

    if (description) {
      lines.push('');
      lines.push('Description:');
      // Truncate long descriptions
      const truncatedDesc = description.length > 2000 ? description.substring(0, 2000) + '...' : description;
      lines.push(truncatedDesc);
    }

    // Build markdown
    const markdownLines: string[] = [];
    markdownLines.push(`# ${name}`);
    markdownLines.push('');
    if (summary) markdownLines.push(`> ${summary}`);
    markdownLines.push('');
    markdownLines.push(`**Version:** ${version}`);
    if (author) markdownLines.push(`**Author:** ${author}`);
    if (license) markdownLines.push(`**License:** ${license}`);
    if (requiresPython) markdownLines.push(`**Python:** ${requiresPython}`);
    markdownLines.push('');

    // Links
    if (homePage || (projectUrls && Object.keys(projectUrls).length > 0)) {
      markdownLines.push('## Links');
      if (homePage) markdownLines.push(`- [Homepage](${homePage})`);
      if (projectUrls) {
        for (const [label, link] of Object.entries(projectUrls).slice(0, 5)) {
          markdownLines.push(`- [${label}](${link})`);
        }
      }
      markdownLines.push('');
    }

    // Dependencies
    if (requiresDist && requiresDist.length > 0) {
      // Using regex to handle variable whitespace per PEP 508
      const mainDeps = requiresDist.filter((d) => !/;\s*extra\s*==/.test(d));
      if (mainDeps.length > 0) {
        markdownLines.push('## Dependencies');
        for (const dep of mainDeps.slice(0, 10)) {
          const depName = dep.split(/[<>=!;\[]/)[0].trim();
          markdownLines.push(`- ${depName}`);
        }
        if (mainDeps.length > 10) {
          markdownLines.push(`- *...and ${mainDeps.length - 10} more*`);
        }
        markdownLines.push('');
      }
    }

    // Classifiers (Python versions, topics, etc.)
    if (classifiers && classifiers.length > 0) {
      const pythonVersions = classifiers
        .filter((c) => c.startsWith('Programming Language :: Python ::'))
        .map((c) => c.replace('Programming Language :: Python :: ', ''))
        .filter((v) => /^\d/.test(v)); // Only version numbers

      if (pythonVersions.length > 0) {
        markdownLines.push(`**Supported Python:** ${pythonVersions.join(', ')}`);
      }

      const topics = classifiers
        .filter((c) => c.startsWith('Topic :: '))
        .map((c) => c.replace('Topic :: ', '').split(' :: ')[0]);
      const uniqueTopics = [...new Set(topics)];

      if (uniqueTopics.length > 0) {
        markdownLines.push(`**Topics:** ${uniqueTopics.slice(0, 5).join(', ')}`);
      }
      markdownLines.push('');
    }

    // Keywords
    if (keywords) {
      markdownLines.push(`**Keywords:** ${keywords}`);
      markdownLines.push('');
    }

    // Release info
    const releaseVersions = Object.keys(releases || {});
    if (releaseVersions.length > 0) {
      markdownLines.push(`*${releaseVersions.length} releases available*`);
    }

    // Last release date
    const currentRelease = releases?.[version] as Array<Record<string, unknown>> | undefined;
    if (currentRelease && currentRelease.length > 0) {
      const uploadTime = currentRelease[0]?.upload_time_iso_8601 || currentRelease[0]?.upload_time;
      if (uploadTime) {
        const releaseDate = new Date(String(uploadTime));
        if (!isNaN(releaseDate.getTime())) {
          markdownLines.push(`*Last release: ${releaseDate.toLocaleDateString()}*`);
        }
      }
    }

    return {
      title: `${name} - PyPI`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Try to fetch package info from PyPI JSON API
   */
  private async tryPyPIAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    // Only handle PyPI URLs
    if (!this.isPyPIUrl(url)) {
      return null;
    }

    const packageName = this.getPyPIPackageName(url);
    if (!packageName) {
      logger.intelligence.debug('Could not extract PyPI package name from URL');
      return null;
    }

    try {
      // PyPI JSON API endpoint
      const apiUrl = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

      const response = await this.fetchWithCookies(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`PyPI API returned ${response.status} for ${packageName}`);
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const releases = data.releases as Record<string, unknown[]>;
      const formatted = this.formatPyPIPackage(data, releases);

      if (!formatted.text || formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug('PyPI API response too short');
        return null;
      }

      const info = data.info as Record<string, unknown> | undefined;
      logger.intelligence.info(`PyPI API extraction successful`, {
        package: packageName,
        version: info?.version || 'unknown',
        contentLength: formatted.text.length,
      });

      return {
        content: {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: data,
        },
        meta: {
          url,
          finalUrl: apiUrl,
          strategy: 'api:pypi',
          strategiesAttempted: [],
          timing: 0,
          confidence: 'high',
        },
        warnings: [],
      };
    } catch (error) {
      logger.intelligence.debug(`PyPI API failed: ${error}`);
      return null;
    }
  }

  // ============================================================================
  // Dev.to API Handler
  // ============================================================================

  /**
   * Check if URL is a Dev.to article URL
   * Matches: dev.to/{username}/{slug}, dev.to/{username}
   */
  private isDevToUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Match dev.to
      if (hostname === 'dev.to' || hostname === 'www.dev.to') {
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        // Need at least a username (and optionally an article slug)
        // Exclude tag pages (/t/...) and special routes
        if (pathParts.length >= 1 && !['t', 'api', 'search', 'top', 'latest', 'settings', 'notifications', 'reading-list'].includes(pathParts[0])) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Extract article info from Dev.to URL
   * Returns { username, slug } for article URLs or { username } for profile URLs
   */
  private getDevToArticleInfo(url: string): { username: string; slug?: string } | null {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      if (pathParts.length >= 1) {
        const username = pathParts[0];
        const slug = pathParts.length >= 2 ? pathParts[1] : undefined;
        return { username, slug };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Try Dev.to API for article extraction
   */
  private async tryDevToAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!this.isDevToUrl(url)) {
      return null;
    }

    const articleInfo = this.getDevToArticleInfo(url);
    if (!articleInfo) {
      logger.intelligence.debug('Could not extract Dev.to article info from URL');
      return null;
    }

    try {
      let apiUrl: string;
      let isSingleArticle = false;

      if (articleInfo.slug) {
        // Fetch single article by username/slug
        apiUrl = `https://dev.to/api/articles/${articleInfo.username}/${articleInfo.slug}`;
        isSingleArticle = true;
      } else {
        // Fetch articles by username
        apiUrl = `https://dev.to/api/articles?username=${encodeURIComponent(articleInfo.username)}&per_page=10`;
      }

      logger.intelligence.debug(`Trying Dev.to API: ${apiUrl}`);

      const response = await this.fetchWithCookies(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`Dev.to API returned ${response.status} for ${url}`);
        return null;
      }

      const data = await response.json();

      let formatted: { title: string; text: string; markdown: string };
      let structured: Record<string, unknown>;

      if (isSingleArticle) {
        const article = data as Record<string, unknown>;
        if (!article.title) {
          logger.intelligence.debug('Dev.to API returned invalid article data');
          return null;
        }
        formatted = this.formatDevToArticle(article);
        structured = article;
      } else {
        const articles = data as Array<Record<string, unknown>>;
        if (!Array.isArray(articles) || articles.length === 0) {
          logger.intelligence.debug('Dev.to API returned no articles for user');
          return null;
        }
        formatted = this.formatDevToArticleList(articleInfo.username, articles);
        structured = { articles, username: articleInfo.username };
      }

      if (formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug(`Dev.to content too short: ${formatted.text.length}`);
        return null;
      }

      logger.intelligence.info(`Dev.to API extraction successful`, {
        url,
        contentLength: formatted.text.length,
        isSingleArticle,
      });

      return {
        content: {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured,
        },
        meta: {
          url,
          finalUrl: apiUrl,
          strategy: 'api:devto',
          strategiesAttempted: [],
          timing: 0,
          confidence: 'high',
        },
        warnings: [],
      };
    } catch (error) {
      logger.intelligence.debug(`Dev.to API failed: ${error}`);
      return null;
    }
  }

  /**
   * Format a single Dev.to article for output
   */
  private formatDevToArticle(article: Record<string, unknown>): {
    title: string;
    text: string;
    markdown: string;
  } {
    const title = article.title as string || 'Untitled';
    const description = article.description as string || '';
    const bodyHtml = article.body_html as string || '';
    const bodyMarkdown = article.body_markdown as string || '';
    const user = article.user as Record<string, unknown> | undefined;
    const username = user?.username as string || article.username as string || 'unknown';
    const readingTime = article.reading_time_minutes as number;
    const publishedAt = article.published_at as string || article.readable_publish_date as string || '';
    const tags = article.tag_list as string[] || article.tags as string[] || [];
    const reactionsCount = article.positive_reactions_count as number || article.public_reactions_count as number || 0;
    const commentsCount = article.comments_count as number || 0;
    const coverImage = article.cover_image as string || article.social_image as string || '';
    const articleUrl = article.url as string || article.canonical_url as string || '';

    // Build plain text
    const lines: string[] = [];
    lines.push(`${title}`);
    lines.push(`By @${username}`);
    if (publishedAt) lines.push(`Published: ${publishedAt}`);
    if (readingTime) lines.push(`Reading time: ${readingTime} min`);
    if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`);
    lines.push(`Reactions: ${reactionsCount} | Comments: ${commentsCount}`);
    lines.push('');

    if (description) {
      lines.push(description);
      lines.push('');
    }

    // Convert HTML to plain text if we have it, otherwise use markdown
    if (bodyHtml) {
      const plainText = this.htmlToPlainText(bodyHtml);
      lines.push(plainText);
    } else if (bodyMarkdown) {
      lines.push(bodyMarkdown);
    }

    // Build markdown
    const markdownLines: string[] = [];
    markdownLines.push(`# ${title}`);
    markdownLines.push('');
    markdownLines.push(`> ${description || 'No description'}`);
    markdownLines.push('');
    markdownLines.push(`**Author:** [@${username}](https://dev.to/${username})`);
    if (publishedAt) markdownLines.push(`**Published:** ${publishedAt}`);
    if (readingTime) markdownLines.push(`**Reading time:** ${readingTime} min`);
    markdownLines.push(`**Reactions:** ${reactionsCount} | **Comments:** ${commentsCount}`);
    markdownLines.push('');

    if (tags.length > 0) {
      markdownLines.push('## Tags');
      markdownLines.push(tags.map(t => `\`#${t}\``).join(' '));
      markdownLines.push('');
    }

    if (coverImage) {
      markdownLines.push(`![Cover](${coverImage})`);
      markdownLines.push('');
    }

    if (articleUrl) {
      markdownLines.push(`[Read on Dev.to](${articleUrl})`);
      markdownLines.push('');
    }

    // Add the article body
    if (bodyMarkdown) {
      markdownLines.push('---');
      markdownLines.push('');
      markdownLines.push(bodyMarkdown);
    } else if (bodyHtml) {
      markdownLines.push('---');
      markdownLines.push('');
      // Convert HTML to markdown (simplified)
      markdownLines.push(this.htmlToPlainText(bodyHtml));
    }

    return {
      title: `${title} - DEV Community`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format a list of Dev.to articles for output
   */
  private formatDevToArticleList(
    username: string,
    articles: Array<Record<string, unknown>>
  ): { title: string; text: string; markdown: string } {
    const lines: string[] = [];
    lines.push(`Articles by @${username}`);
    lines.push(`Total: ${articles.length} articles`);
    lines.push('');

    for (const article of articles) {
      const title = article.title as string || 'Untitled';
      const description = article.description as string || '';
      const readingTime = article.reading_time_minutes as number;
      const publishedAt = article.readable_publish_date as string || '';
      const tags = article.tag_list as string[] || [];
      const reactionsCount = article.positive_reactions_count as number || 0;
      const commentsCount = article.comments_count as number || 0;

      lines.push(`- ${title}`);
      if (publishedAt) lines.push(`  Published: ${publishedAt}`);
      if (readingTime) lines.push(`  ${readingTime} min read`);
      if (tags.length > 0) lines.push(`  Tags: ${tags.slice(0, 3).join(', ')}`);
      lines.push(`  Reactions: ${reactionsCount} | Comments: ${commentsCount}`);
      if (description) lines.push(`  ${description.substring(0, 150)}...`);
      lines.push('');
    }

    const markdownLines: string[] = [];
    markdownLines.push(`# Articles by @${username}`);
    markdownLines.push('');
    markdownLines.push(`*${articles.length} articles*`);
    markdownLines.push('');

    for (const article of articles) {
      const title = article.title as string || 'Untitled';
      const description = article.description as string || '';
      const slug = article.slug as string || '';
      const readingTime = article.reading_time_minutes as number;
      const publishedAt = article.readable_publish_date as string || '';
      const tags = article.tag_list as string[] || [];
      const reactionsCount = article.positive_reactions_count as number || 0;
      const commentsCount = article.comments_count as number || 0;

      const articleUrl = slug ? `https://dev.to/${username}/${slug}` : '';
      markdownLines.push(`## [${title}](${articleUrl})`);
      markdownLines.push('');
      if (description) markdownLines.push(`> ${description}`);
      markdownLines.push('');
      const meta: string[] = [];
      if (publishedAt) meta.push(`**Published:** ${publishedAt}`);
      if (readingTime) meta.push(`**${readingTime} min read**`);
      meta.push(`${reactionsCount} reactions`);
      meta.push(`${commentsCount} comments`);
      markdownLines.push(meta.join(' | '));
      if (tags.length > 0) {
        markdownLines.push('');
        markdownLines.push(tags.map(t => `\`#${t}\``).join(' '));
      }
      markdownLines.push('');
      markdownLines.push('---');
      markdownLines.push('');
    }

    return {
      title: `@${username} - DEV Community`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Simple HTML to plain text converter
   */
  private htmlToPlainText(html: string): string {
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Replace common block elements with newlines
    text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n');
    text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");

    // Normalize whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * Extract API URLs by analyzing JavaScript code in the page
   *
   * This performs static analysis of <script> tags to find:
   * - fetch() calls
   * - axios requests
   * - XMLHttpRequest usage
   * - API base URLs in config objects
   * - GraphQL endpoints
   */
  private extractApisFromJavaScript(html: string, pageUrl: URL): string[] {
    const apis: string[] = [];
    const origin = pageUrl.origin;

    // Extract all inline scripts and external script src URLs
    const scriptContents: string[] = [];

    // Get inline script contents
    const inlineScriptRegex = /<script[^>]*>([^<]*(?:(?!<\/script>)<[^<]*)*)<\/script>/gi;
    let match;
    while ((match = inlineScriptRegex.exec(html)) !== null) {
      if (match[1] && match[1].trim().length > 10) {
        scriptContents.push(match[1]);
      }
    }

    // Also look for API URLs in data attributes and JSON embedded in HTML
    const dataJsonRegex = /data-(?:api|endpoint|url|config)[^=]*="([^"]+)"/gi;
    while ((match = dataJsonRegex.exec(html)) !== null) {
      const value = match[1];
      if (this.looksLikeApiUrl(value)) {
        apis.push(this.resolveApiUrl(value, origin));
      }
    }

    // Process all script contents
    for (const script of scriptContents) {
      // Pattern 1: fetch() calls
      // Matches: fetch('/api/...'), fetch("https://..."), fetch(`${baseUrl}/api`)
      const fetchRegex = /fetch\s*\(\s*['"`]([^'"`\s]+)['"`]/g;
      while ((match = fetchRegex.exec(script)) !== null) {
        if (this.looksLikeApiUrl(match[1])) {
          apis.push(this.resolveApiUrl(match[1], origin));
        }
      }

      // Pattern 2: axios calls
      // Matches: axios.get('/api'), axios.post('/api'), axios('/api'), axios({ url: '/api' })
      const axiosRegex = /axios(?:\.(?:get|post|put|delete|patch))?\s*\(\s*['"`]([^'"`\s]+)['"`]/g;
      while ((match = axiosRegex.exec(script)) !== null) {
        if (this.looksLikeApiUrl(match[1])) {
          apis.push(this.resolveApiUrl(match[1], origin));
        }
      }

      // Pattern 3: URL/endpoint configurations
      // Matches: apiUrl: '/api', endpoint: 'https://...', baseURL: '...'
      const configRegex = /(?:api[Uu]rl|endpoint|baseURL|apiEndpoint|apiBase|dataUrl|fetchUrl|requestUrl)\s*[=:]\s*['"`]([^'"`\s]+)['"`]/g;
      while ((match = configRegex.exec(script)) !== null) {
        if (this.looksLikeApiUrl(match[1])) {
          apis.push(this.resolveApiUrl(match[1], origin));
        }
      }

      // Pattern 4: XMLHttpRequest
      // Matches: .open('GET', '/api/...')
      const xhrRegex = /\.open\s*\(\s*['"`](?:GET|POST|PUT|DELETE)['"`]\s*,\s*['"`]([^'"`\s]+)['"`]/gi;
      while ((match = xhrRegex.exec(script)) !== null) {
        if (this.looksLikeApiUrl(match[1])) {
          apis.push(this.resolveApiUrl(match[1], origin));
        }
      }

      // Pattern 5: GraphQL endpoints
      // Matches: '/graphql', '/api/graphql', 'https://.../graphql'
      const graphqlRegex = /['"`]([^'"`]*\/graphql[^'"`]*)['"`]/gi;
      while ((match = graphqlRegex.exec(script)) !== null) {
        apis.push(this.resolveApiUrl(match[1], origin));
      }

      // Pattern 6: REST-like URL patterns in strings
      // Matches URLs that look like API endpoints
      const restRegex = /['"`]((?:https?:\/\/[^'"`\s]+)?\/(?:api|v\d+|rest|data|json|feed)[^'"`\s]*)['"`]/gi;
      while ((match = restRegex.exec(script)) !== null) {
        if (this.looksLikeApiUrl(match[1])) {
          apis.push(this.resolveApiUrl(match[1], origin));
        }
      }

      // Pattern 7: Next.js API routes
      const nextApiRegex = /['"`](\/api\/[^'"`\s]+)['"`]/g;
      while ((match = nextApiRegex.exec(script)) !== null) {
        apis.push(this.resolveApiUrl(match[1], origin));
      }

      // Pattern 8: .json endpoints
      const jsonEndpointRegex = /['"`]([^'"`\s]+\.json)['"`]/g;
      while ((match = jsonEndpointRegex.exec(script)) !== null) {
        // Avoid false positives like 'package.json' or '.json' config files
        if (!match[1].includes('package.json') &&
            !match[1].includes('tsconfig') &&
            !match[1].includes('node_modules') &&
            this.looksLikeApiUrl(match[1])) {
          apis.push(this.resolveApiUrl(match[1], origin));
        }
      }
    }

    // Deduplicate and filter
    const uniqueApis = [...new Set(apis)]
      .filter(url => {
        try {
          const parsed = new URL(url);
          // Only keep URLs from same origin or absolute URLs
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      })
      .slice(0, 20); // Limit to 20 endpoints to avoid hammering servers

    if (uniqueApis.length > 0) {
      logger.intelligence.debug(`Extracted ${uniqueApis.length} API URLs from JavaScript`, {
        urls: uniqueApis.slice(0, 5), // Log first 5
      });
    }

    return uniqueApis;
  }

  /**
   * Check if a string looks like an API URL
   */
  private looksLikeApiUrl(str: string): boolean {
    if (!str || str.length < 2) return false;

    // Must start with / or http
    if (!str.startsWith('/') && !str.startsWith('http')) return false;

    // Skip obvious non-API patterns
    const skipPatterns = [
      /^\/\//,           // Protocol-relative URLs (usually CDN)
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,  // Static assets
      /^\/static\//,     // Static files
      /^\/assets\//,     // Asset files
      /^\/images?\//i,   // Image directories
      /^\/fonts?\//i,    // Font directories
      /^\/_next\/static/,// Next.js static assets
      /^\/favicon/,      // Favicons
      /^javascript:/,    // JavaScript pseudo-protocol
      /^#/,              // Hash links
      /^mailto:/,        // Email links
    ];

    for (const pattern of skipPatterns) {
      if (pattern.test(str)) return false;
    }

    // Positive indicators that this is an API
    const apiIndicators = [
      /\/api\//i,
      /\/v\d+\//,        // Versioned APIs like /v1/, /v2/
      /\/rest\//i,
      /\/graphql/i,
      /\/data\//i,
      /\/json/i,
      /\.json$/i,
      /\/feed/i,
      /\/query/i,
      /\/search/i,
      /\/get/i,
      /\/fetch/i,
      /\/load/i,
    ];

    for (const pattern of apiIndicators) {
      if (pattern.test(str)) return true;
    }

    // If it looks like a path that could return data, accept it
    // But be conservative - we'd rather miss some than try too many
    return str.includes('/api') || str.includes('.json') || str.includes('/data');
  }

  /**
   * Resolve a potentially relative API URL to absolute
   */
  private resolveApiUrl(url: string, origin: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    if (url.startsWith('/')) {
      return origin + url;
    }
    return origin + '/' + url;
  }

  private predictAPIEndpoints(url: URL): string[] {
    const predictions: string[] = [];
    const path = url.pathname;

    // Common API patterns
    predictions.push(`${url.origin}/api${path}`);
    predictions.push(`${url.origin}/api/v1${path}`);
    predictions.push(`${url.origin}${path}.json`);

    // Next.js data routes
    predictions.push(`${url.origin}/_next/data/development${path}.json`);

    // WordPress REST API
    if (path.match(/\/\d{4}\/\d{2}\/[\w-]+/)) {
      // Blog post pattern
      const slug = path.split('/').pop();
      predictions.push(`${url.origin}/wp-json/wp/v2/posts?slug=${slug}`);
    }

    // GraphQL (POST, but we can try GET)
    predictions.push(`${url.origin}/graphql?query={page(path:"${path}"){title,content}}`);

    return predictions;
  }

  // ============================================
  // STRATEGY: Google Cache
  // ============================================

  private async tryGoogleCache(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;

    try {
      const response = await this.fetchWithCookies(cacheUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          // Pretend to be a regular browser
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (response.ok) {
        const html = await response.text();

        // Google cache has a header div we should remove
        const cleanedHtml = html.replace(/<div[^>]*id="google-cache-hdr"[^>]*>[\s\S]*?<\/div>/i, '');

        const content = this.parseStaticHTML(cleanedHtml, url);
        if (content.text.length > 50) {
          return this.buildResult(url, cacheUrl, 'cache:google', content, 'medium');
        }
      }
    } catch {
      // Google cache not available
    }

    return null;
  }

  // ============================================
  // STRATEGY: Archive.org
  // ============================================

  private async tryArchiveOrg(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    // First, check if there's a recent snapshot
    const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;

    try {
      const availResponse = await this.fetchWithCookies(availabilityUrl, opts);
      if (!availResponse.ok) return null;

      const availability = await availResponse.json();
      const snapshot = availability?.archived_snapshots?.closest;

      if (!snapshot?.available) return null;

      // Fetch the archived version
      const response = await this.fetchWithCookies(snapshot.url, opts);
      if (response.ok) {
        const html = await response.text();
        const content = this.parseStaticHTML(html, url);

        if (content.text.length > 50) {
          return this.buildResult(url, snapshot.url, 'cache:archive', content, 'medium');
        }
      }
    } catch {
      // Archive.org not available
    }

    return null;
  }

  // ============================================
  // STRATEGY: Static HTML Parsing
  // ============================================

  private async tryStaticParsing(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const html = await this.fetchHTML(url, opts);
    const content = this.parseStaticHTML(html, url);

    if (content.text.length > (opts.minContentLength || 100)) {
      return this.buildResult(url, url, 'parse:static', content, 'medium');
    }

    return null;
  }

  private parseStaticHTML(html: string, url: string): { title: string; text: string; markdown: string } {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, noscript, iframe, svg, nav, footer, aside, header').remove();
    $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove();
    $('[class*="sidebar"], [class*="advertisement"], [class*="social"]').remove();

    // Get title
    const title = $('title').text() ||
                  $('h1').first().text() ||
                  $('meta[property="og:title"]').attr('content') || '';

    // Find main content
    let mainContent = $('main, article, [role="main"], .content, #content, .post, .article').first();
    if (mainContent.length === 0) {
      mainContent = $('body');
    }

    // Convert to markdown
    const contentHtml = mainContent.html() || '';
    const markdown = this.turndown.turndown(contentHtml);

    // Get plain text
    const text = mainContent.text().replace(/\s+/g, ' ').trim();

    return {
      title: title.trim(),
      text,
      markdown,
    };
  }

  // ============================================
  // STRATEGY: Playwright (Optional, Lazy-loaded)
  // ============================================

  private async tryPlaywright(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    // Try to load Playwright lazily
    const pw = await tryLoadPlaywright();

    if (!pw) {
      // Playwright not available - this is fine, just skip this strategy
      throw new Error('Playwright not installed - skipping browser strategy');
    }

    let browser;
    try {
      browser = await pw.chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: opts.userAgent || DEFAULT_OPTIONS.userAgent,
      });
      const page = await context.newPage();

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: opts.timeout || TIMEOUTS.PAGE_LOAD,
      });

      const html = await page.content();
      const finalUrl = page.url();

      await browser.close();

      const content = this.parseStaticHTML(html, finalUrl);

      if (content.text.length > (opts.minContentLength || 100)) {
        return this.buildResult(url, finalUrl, 'browser:playwright', content, 'high');
      }

      return null;
    } catch (error) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      throw error;
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private async fetchHTML(url: string, opts: ContentIntelligenceOptions): Promise<string> {
    const response = await this.fetchWithCookies(url, opts);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }

  private async fetchWithCookies(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<Response> {
    const cookieString = await this.cookieJar.getCookieString(url);

    const headers: Record<string, string> = {
      'User-Agent': opts.userAgent || DEFAULT_OPTIONS.userAgent!,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...opts.headers,
    };

    if (cookieString) {
      headers['Cookie'] = cookieString;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout || TIMEOUTS.NETWORK_FETCH);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });

      // Store cookies from response
      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      for (const setCookie of setCookieHeaders) {
        try {
          await this.cookieJar.setCookie(setCookie, url);
        } catch {
          // Ignore invalid cookies
        }
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractTextFromObject(obj: unknown, depth = 0): string {
    if (depth > 10) return ''; // Prevent infinite recursion

    if (typeof obj === 'string') {
      // Filter out things that look like code/URLs
      if (obj.length > 20 && !obj.includes('http') && !obj.includes('{') && !obj.includes('<')) {
        return obj + ' ';
      }
      return '';
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.extractTextFromObject(item, depth + 1)).join('');
    }

    if (obj && typeof obj === 'object') {
      let text = '';
      const textKeys = ['text', 'content', 'body', 'description', 'title', 'name',
                       'summary', 'excerpt', 'articleBody', 'headline', 'caption'];

      for (const [key, value] of Object.entries(obj)) {
        // Prioritize text-like keys
        if (textKeys.includes(key)) {
          text += this.extractTextFromObject(value, depth + 1);
        } else if (!['id', 'url', 'href', 'src', 'className', 'style'].includes(key)) {
          text += this.extractTextFromObject(value, depth + 1);
        }
      }
      return text;
    }

    return '';
  }

  private buildResult(
    originalUrl: string,
    finalUrl: string,
    strategy: ExtractionStrategy,
    content: { title: string; text: string; structured?: unknown; markdown?: string },
    confidence: 'high' | 'medium' | 'low'
  ): ContentResult {
    return {
      content: {
        title: content.title,
        text: content.text,
        markdown: content.markdown || this.turndown.turndown(content.text),
        structured: content.structured as Record<string, unknown> | undefined,
      },
      meta: {
        url: originalUrl,
        finalUrl,
        strategy,
        strategiesAttempted: [strategy],
        timing: 0, // Will be set by caller
        confidence,
      },
      warnings: [],
    };
  }

  private isValidContent(result: ContentResult, opts: ContentIntelligenceOptions): boolean {
    const minLength = opts.minContentLength || 100;
    return result.content.text.length >= minLength;
  }

  // ============================================
  // PUBLIC UTILITIES
  // ============================================

  /**
   * Check if Playwright is available without loading it
   */
  static isPlaywrightAvailable(): boolean {
    if (playwrightLoadAttempted) {
      return playwrightModule !== null;
    }

    // Check if playwright is in node_modules without loading it
    try {
      require.resolve('playwright');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get info about available strategies
   */
  static getAvailableStrategies(): { strategy: ExtractionStrategy; available: boolean; note?: string }[] {
    return [
      { strategy: 'framework:nextjs', available: true },
      { strategy: 'framework:nuxt', available: true },
      { strategy: 'framework:gatsby', available: true },
      { strategy: 'framework:remix', available: true },
      { strategy: 'framework:angular', available: true },
      { strategy: 'structured:jsonld', available: true },
      { strategy: 'structured:opengraph', available: true },
      { strategy: 'api:predicted', available: true },
      { strategy: 'api:learned', available: true, note: 'Uses learned API patterns from previous extractions' },
      { strategy: 'api:openapi', available: true, note: 'Discovers and uses OpenAPI/Swagger specifications' },
      { strategy: 'api:graphql', available: true, note: 'Discovers GraphQL APIs via introspection' },
      { strategy: 'cache:google', available: true, note: 'May be rate-limited' },
      { strategy: 'cache:archive', available: true, note: 'May have stale content' },
      { strategy: 'parse:static', available: true },
      { strategy: 'browser:playwright', available: ContentIntelligence.isPlaywrightAvailable(), note: 'Optional dependency' },
    ];
  }

  /**
   * Set cookies for future requests
   */
  async setCookies(cookies: Cookie[], url: string): Promise<void> {
    for (const cookie of cookies) {
      await this.cookieJar.setCookie(cookie, url);
    }
  }

  /**
   * Clear all cookies
   */
  clearCookies(): void {
    this.cookieJar = new CookieJar();
  }
}

// Export singleton for convenience
export const contentIntelligence = new ContentIntelligence();
