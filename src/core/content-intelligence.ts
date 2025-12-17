/**
 * Content Intelligence - Extract content for LLMs without browser overhead
 *
 * This module extracts content using multiple strategies, falling back gracefully
 * when one doesn't work. Designed for LLMs, not humans - no rendering needed.
 *
 * Strategy order (fastest to slowest):
 * 1. Framework data extraction (__NEXT_DATA__, __NUXT__, etc.)
 * 2. Structured data (JSON-LD, OpenGraph, microdata)
 * 3. Direct API prediction and calling
 * 4. Google Cache (pre-rendered)
 * 5. Archive.org (historical snapshots)
 * 6. Static HTML parsing (always works)
 * 7. Playwright (optional, lazy-loaded, last resort)
 *
 * Playwright is OPTIONAL - if not installed, we just skip that strategy.
 */

import { CookieJar, Cookie } from 'tough-cookie';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { TIMEOUTS } from '../utils/timeouts.js';

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
  | 'structured:jsonld'
  | 'structured:opengraph'
  | 'api:predicted'
  | 'api:discovered'
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
}

const DEFAULT_OPTIONS: ContentIntelligenceOptions = {
  timeout: TIMEOUTS.NETWORK_FETCH,
  minContentLength: 100,
  skipStrategies: [],
  allowBrowser: true,
  userAgent: 'Mozilla/5.0 (compatible; LLMBot/1.0; +https://example.com/bot)',
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
    console.error(`[ContentIntelligence] Playwright not available: ${playwrightLoadError}`);
    console.error('[ContentIntelligence] Continuing without browser support - this is fine for most sites');
    return null;
  }
}

export class ContentIntelligence {
  private cookieJar: CookieJar;
  private turndown: TurndownService;
  private options: ContentIntelligenceOptions;

  constructor(options: Partial<ContentIntelligenceOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cookieJar = new CookieJar();
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
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
    const strategies: Array<{
      name: ExtractionStrategy;
      fn: () => Promise<ContentResult | null>;
    }> = [
      // 1. Framework data extraction (instant, complete)
      { name: 'framework:nextjs', fn: () => this.tryFrameworkExtraction(url, opts) },

      // 2. Structured data
      { name: 'structured:jsonld', fn: () => this.tryStructuredData(url, opts) },

      // 3. API prediction
      { name: 'api:predicted', fn: () => this.tryPredictedAPI(url, opts) },

      // 4. Google Cache
      { name: 'cache:google', fn: () => this.tryGoogleCache(url, opts) },

      // 5. Archive.org
      { name: 'cache:archive', fn: () => this.tryArchiveOrg(url, opts) },

      // 6. Static HTML parsing (always works if we can fetch)
      { name: 'parse:static', fn: () => this.tryStaticParsing(url, opts) },

      // 7. Playwright (optional, last resort)
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
        const result = await strategy.fn();

        if (result && this.isValidContent(result, opts)) {
          // Success! Update metadata and return
          result.meta.strategiesAttempted = strategiesAttempted;
          result.meta.timing = Date.now() - startTime;
          result.warnings = [...warnings, ...result.warnings];
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
      'structured:jsonld': () => this.tryStructuredData(url, opts),
      'structured:opengraph': () => this.tryStructuredData(url, opts),
      'api:predicted': () => this.tryPredictedAPI(url, opts),
      'api:discovered': () => this.tryPredictedAPI(url, opts),
      'cache:google': () => this.tryGoogleCache(url, opts),
      'cache:archive': () => this.tryArchiveOrg(url, opts),
      'parse:static': () => this.tryStaticParsing(url, opts),
      'browser:playwright': () => this.tryPlaywright(url, opts),
    };

    const fn = strategyMap[strategy];
    if (!fn) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }

    const result = await fn();
    if (result) {
      result.meta.strategiesAttempted = strategiesAttempted;
      result.meta.timing = Date.now() - startTime;
      result.warnings = [...warnings, ...result.warnings];
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
  // STRATEGY: API Prediction
  // ============================================

  private async tryPredictedAPI(
    url: string,
    opts: ContentIntelligenceOptions
  ): Promise<ContentResult | null> {
    const parsedUrl = new URL(url);
    const predictions = this.predictAPIEndpoints(parsedUrl);

    for (const apiUrl of predictions) {
      try {
        const response = await this.fetchWithCookies(apiUrl, opts);

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';

          if (contentType.includes('application/json')) {
            const data = await response.json();
            const text = this.extractTextFromObject(data);

            if (text.length > 50) {
              return this.buildResult(url, apiUrl, 'api:predicted', {
                title: '',
                text,
                structured: data,
              }, 'high');
            }
          }
        }
      } catch {
        // Try next prediction
      }
    }

    return null;
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
      { strategy: 'structured:jsonld', available: true },
      { strategy: 'structured:opengraph', available: true },
      { strategy: 'api:predicted', available: true },
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
