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
import {
  redditHandler,
  hackerNewsHandler,
  gitHubHandler,
  wikipediaHandler,
  stackOverflowHandler,
  npmHandler,
  pypiHandler,
  devtoHandler,
  mediumHandler,
  youtubeHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './site-handlers/index.js';
import {
  extractNextJSData,
  extractNuxtData,
  extractGatsbyData,
  extractRemixData,
  extractAngularData,
  extractVitePressData,
  extractVuePressData,
  extractTextFromObject as extractTextFromObjectUtil,
  extractTitleFromObject as extractTitleFromObjectUtil,
  htmlToPlainText as htmlToPlainTextUtil,
  unescapeJavaScriptString as unescapeJavaScriptStringUtil,
} from './framework-extractors/index.js';

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
  | 'framework:vitepress'
  | 'framework:vuepress'
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
  | 'api:medium'
  | 'api:youtube'
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
      { name: 'api:medium', fn: () => this.tryMediumAPI(url, opts) },
      { name: 'api:youtube', fn: () => this.tryYouTubeAPI(url, opts) },

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
      'framework:vitepress': () => this.tryFrameworkExtraction(url, opts),
      'framework:vuepress': () => this.tryFrameworkExtraction(url, opts),
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
      'api:medium': () => this.tryMediumAPI(url, opts),
      'api:youtube': () => this.tryYouTubeAPI(url, opts),
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

  // ============================================================================
  // Framework Data Extraction
  // Delegated to extracted extractors in framework-extractors/
  // ============================================================================

  private async tryFrameworkExtraction(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const html = await this.fetchHTML(url, opts);

    // Try Next.js
    const nextData = extractNextJSData(html);
    if (nextData) {
      return this.buildResult(url, url, 'framework:nextjs', nextData, 'high');
    }

    // Try Nuxt
    const nuxtData = extractNuxtData(html);
    if (nuxtData) {
      return this.buildResult(url, url, 'framework:nuxt', nuxtData, 'high');
    }

    // Try Gatsby
    const gatsbyData = extractGatsbyData(html);
    if (gatsbyData) {
      return this.buildResult(url, url, 'framework:gatsby', gatsbyData, 'high');
    }

    // Try Remix
    const remixData = extractRemixData(html);
    if (remixData) {
      return this.buildResult(url, url, 'framework:remix', remixData, 'high');
    }

    // Try Angular / Angular Universal
    const angularData = extractAngularData(html);
    if (angularData) {
      return this.buildResult(url, url, 'framework:angular', angularData, 'high');
    }

    // Try VitePress (Vue 3 static site generator)
    const vitepressData = extractVitePressData(html);
    if (vitepressData) {
      return this.buildResult(url, url, 'framework:vitepress', vitepressData, 'high');
    }

    // Try VuePress (Vue 2/3 documentation generator)
    const vuepressData = extractVuePressData(html);
    if (vuepressData) {
      return this.buildResult(url, url, 'framework:vuepress', vuepressData, 'high');
    }

    return null;
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
  // Delegated to extracted handler in site-handlers/reddit-handler.ts
  // ============================================

  /**
   * Convert a SiteHandlerResult to a ContentResult
   * strategiesAttempted and timing are populated by the main extract loop
   */
  private toContentResult(result: SiteHandlerResult): ContentResult {
    return {
      content: result.content,
      meta: {
        ...result.meta,
        strategiesAttempted: [],
        timing: 0,
      },
      warnings: result.warnings,
    };
  }

  /**
   * Try Reddit's public JSON API
   */
  private async tryRedditAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!redditHandler.canHandle(url)) {
      return null;
    }

    const result = await redditHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================
  // STRATEGY: HackerNews API Extraction
  // Delegated to extracted handler in site-handlers/hackernews-handler.ts
  // ============================================

  /**
   * Try HackerNews Firebase API
   */
  private async tryHackerNewsAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!hackerNewsHandler.canHandle(url)) {
      return null;
    }

    const result = await hackerNewsHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================
  // STRATEGY: GitHub API Extraction
  // Delegated to extracted handler in site-handlers/github-handler.ts
  // ============================================

  /**
   * Try GitHub public API
   */
  private async tryGitHubAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!gitHubHandler.canHandle(url)) {
      return null;
    }

    const result = await gitHubHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================
  // STRATEGY: Wikipedia API Extraction
  // Delegated to extracted handler in site-handlers/wikipedia-handler.ts
  // ============================================

  /**
   * Try Wikipedia REST API
   */
  private async tryWikipediaAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!wikipediaHandler.canHandle(url)) {
      return null;
    }

    const result = await wikipediaHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================
  // STRATEGY: StackOverflow API Extraction
  // Delegated to extracted handler in site-handlers/stackoverflow-handler.ts
  // ============================================

  /**
   * Try Stack Exchange API
   */
  private async tryStackOverflowAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!stackOverflowHandler.canHandle(url)) {
      return null;
    }

    const result = await stackOverflowHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================
  // STRATEGY: NPM Registry API Extraction
  // Delegated to extracted handler in site-handlers/npm-handler.ts
  // ============================================

  /**
   * Try NPM Registry API
   */
  private async tryNpmAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!npmHandler.canHandle(url)) {
      return null;
    }

    const result = await npmHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================================================
  // PyPI API Handler
  // Delegated to extracted handler in site-handlers/pypi-handler.ts
  // ============================================================================

  /**
   * Try to fetch package info from PyPI JSON API
   */
  private async tryPyPIAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!pypiHandler.canHandle(url)) {
      return null;
    }

    const result = await pypiHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================================================
  // Dev.to API Handler
  // Delegated to extracted handler in site-handlers/devto-handler.ts
  // ============================================================================

  /**
   * Try Dev.to API for article extraction
   */
  private async tryDevToAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!devtoHandler.canHandle(url)) {
      return null;
    }

    const result = await devtoHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================================================
  // Medium API Handler
  // Delegated to extracted handler in site-handlers/medium-handler.ts
  // ============================================================================

  /**
   * Try Medium API for article extraction
   */
  private async tryMediumAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!mediumHandler.canHandle(url)) {
      return null;
    }

    const result = await mediumHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
  }

  // ============================================================================
  // YouTube API Handler
  // Delegated to extracted handler in site-handlers/youtube-handler.ts
  // ============================================================================

  /**
   * Try YouTube API for video metadata extraction
   */
  private async tryYouTubeAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    if (!youtubeHandler.canHandle(url)) {
      return null;
    }

    const result = await youtubeHandler.extract(url, this.createFetchFunction(opts), opts);
    if (!result) {
      return null;
    }

    return this.toContentResult(result);
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

  /**
   * Create a FetchFunction for use with site handlers
   * This wraps fetchWithCookies to match the SiteHandler interface
   */
  private createFetchFunction(opts: ContentIntelligenceOptions): FetchFunction {
    return async (url: string, handlerOpts: SiteHandlerOptions) => {
      return this.fetchWithCookies(url, {
        ...opts,
        ...handlerOpts,
        headers: { ...opts.headers, ...handlerOpts.headers },
      });
    };
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
      { strategy: 'framework:vitepress', available: true },
      { strategy: 'framework:vuepress', available: true },
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
