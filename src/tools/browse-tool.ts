/**
 * Browse Tool - Main tool for browsing websites with intelligence
 *
 * Features:
 * - Rate limiting per domain (prevents IP bans)
 * - Retry with exponential backoff
 * - Cookie banner auto-dismissal
 * - Scroll-to-load for lazy content
 * - Language detection
 * - Table extraction
 * - Domain-specific presets
 */

import type { BrowseResult, BrowseOptions } from '../types/index.js';
import { BrowserManager } from '../core/browser-manager.js';
import { ContentExtractor } from '../utils/content-extractor.js';
import { ApiAnalyzer } from '../core/api-analyzer.js';
import { SessionManager } from '../core/session-manager.js';
import { LearningEngine } from '../core/learning-engine.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { findPreset, getWaitStrategy } from '../utils/domain-presets.js';
import { pageCache, ContentCache } from '../utils/cache.js';
import { TIMEOUTS } from '../utils/timeouts.js';
import { logger } from '../utils/logger.js';
import type { Page } from 'playwright';

const log = logger.browseTool;

// Common cookie consent selectors across different banner providers
const COOKIE_BANNER_SELECTORS = [
  // Generic patterns
  '[class*="cookie"] button[class*="accept"]',
  '[class*="cookie"] button[class*="agree"]',
  '[class*="consent"] button[class*="accept"]',
  '[id*="cookie"] button[class*="accept"]',
  'button[id*="accept-cookie"]',
  'button[id*="acceptCookie"]',
  // Specific providers
  '#onetrust-accept-btn-handler', // OneTrust
  '.cc-btn.cc-dismiss', // Cookie Consent
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
  '[data-cookiebanner="accept_button"]',
  '.evidon-banner-acceptbutton', // Evidon
  '#accept-recommended-btn-handler',
  '.js-accept-cookies',
  'button[aria-label*="accept"]',
  'button[aria-label*="Accept"]',
  // Spanish government sites
  '.aceptar-cookies',
  '#aceptarCookies',
  '.acepto-cookies',
];

export class BrowseTool {
  constructor(
    private browserManager: BrowserManager,
    private contentExtractor: ContentExtractor,
    private apiAnalyzer: ApiAnalyzer,
    private sessionManager: SessionManager,
    private learningEngine: LearningEngine
  ) {}

  /**
   * Detect page language from HTML
   */
  private detectLanguage(html: string): string | undefined {
    // Check html lang attribute
    const htmlLangMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
    if (htmlLangMatch) {
      return htmlLangMatch[1].split('-')[0].toLowerCase();
    }

    // Check meta content-language
    const metaLangMatch = html.match(
      /<meta[^>]*http-equiv=["']content-language["'][^>]*content=["']([^"']+)["']/i
    );
    if (metaLangMatch) {
      return metaLangMatch[1].split('-')[0].toLowerCase();
    }

    // Check og:locale
    const ogLocaleMatch = html.match(
      /<meta[^>]*property=["']og:locale["'][^>]*content=["']([^"']+)["']/i
    );
    if (ogLocaleMatch) {
      return ogLocaleMatch[1].split('_')[0].toLowerCase();
    }

    return undefined;
  }

  /**
   * Try to dismiss cookie consent banners
   */
  private async dismissCookieBanner(page: Page): Promise<boolean> {
    for (const selector of COOKIE_BANNER_SELECTORS) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isVisible();
          if (isVisible) {
            await button.click();
            log.debug('Dismissed cookie banner', { selector });
            // Wait for banner to disappear
            await page.waitForTimeout(TIMEOUTS.COOKIE_BANNER);
            return true;
          }
        }
      } catch {
        // Selector not found or not clickable, try next
      }
    }
    return false;
  }

  /**
   * Scroll page to trigger lazy-loaded content
   */
  private async scrollToLoadContent(page: Page): Promise<void> {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    // Scroll in chunks
    let currentPosition = 0;
    const scrollStep = viewportHeight * 0.8;

    while (currentPosition < scrollHeight) {
      currentPosition += scrollStep;
      await page.evaluate((y) => window.scrollTo(0, y), currentPosition);
      // Wait for content to load
      await page.waitForTimeout(TIMEOUTS.SCROLL_STEP);
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    // Wait for any final content
    await page.waitForTimeout(TIMEOUTS.SCROLL_SETTLE);
  }

  async execute(url: string, options: BrowseOptions = {}): Promise<BrowseResult> {
    const startTime = Date.now();
    const profile = options.sessionProfile || 'default';
    const useRateLimiting = options.useRateLimiting !== false;
    const retryOnError = options.retryOnError !== false;

    // Check if we have a known pattern we can optimize
    const domain = new URL(url).hostname;
    const knownPattern = this.learningEngine.findPattern(url);
    const preset = findPreset(url);

    if (knownPattern && knownPattern.canBypass && knownPattern.confidence === 'high') {
      log.info('Found high-confidence pattern', { domain });
    }

    if (preset) {
      log.info('Using preset', { presetName: preset.name });
    }

    // The core browsing operation
    const browseOperation = async (): Promise<{
      page: Page;
      network: BrowseResult['network'];
      console: BrowseResult['console'];
    }> => {
      // Apply rate limiting if enabled
      if (useRateLimiting) {
        await rateLimiter.acquire(url);
      }

      // Load session if available
      const context = await this.browserManager.getContext(profile);
      const hasSession = await this.sessionManager.loadSession(domain, context, profile);

      if (hasSession) {
        log.info('Loaded saved session', { domain, profile });
      }

      // Use preset wait strategy if available
      const waitFor = options.waitFor || (preset ? getWaitStrategy(url) : 'networkidle');

      // Browse the page
      const result = await this.browserManager.browse(url, {
        captureNetwork: options.captureNetwork !== false,
        captureConsole: options.captureConsole !== false,
        waitFor,
        timeout: options.timeout || TIMEOUTS.PAGE_LOAD,
        profile,
      });

      // Wait for specific selector if requested (for SPAs)
      if (options.waitForSelector) {
        try {
          await result.page.waitForSelector(options.waitForSelector, {
            timeout: options.timeout || TIMEOUTS.PAGE_LOAD,
          });
          log.debug('Found selector', { selector: options.waitForSelector });
        } catch (e) {
          log.warn('Selector not found', { selector: options.waitForSelector });
        }
      }

      // Dismiss cookie banners if requested
      if (options.dismissCookieBanner !== false) {
        await this.dismissCookieBanner(result.page);
      }

      // Scroll to load lazy content if requested
      if (options.scrollToLoad) {
        await this.scrollToLoadContent(result.page);
      }

      return result;
    };

    // Execute with retry if enabled
    let result: Awaited<ReturnType<typeof browseOperation>>;
    let retryCount = 0;

    if (retryOnError) {
      const retryResult = await withRetry(browseOperation, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        retryOn: (error: Error) => {
          const message = error.message.toLowerCase();
          return (
            message.includes('timeout') ||
            message.includes('net::') ||
            message.includes('navigation')
          );
        },
        onRetry: (attempt: number, error: Error) => {
          retryCount = attempt;
        },
      });
      result = retryResult;
    } else {
      result = await browseOperation();
    }

    const { page, network, console: consoleMessages } = result;

    // Extract content
    const html = await page.content();
    const finalUrl = page.url();
    const extracted = this.contentExtractor.extract(html, finalUrl);

    // Extract tables if present
    const tables = this.contentExtractor.extractTablesAsJSON(html);

    // Detect language if requested
    let language: string | undefined;
    if (options.detectLanguage !== false) {
      language = this.detectLanguage(html);
    }

    // Analyze APIs
    const discoveredApis = this.apiAnalyzer.analyzeRequests(network);

    // Learn from this browsing session
    if (discoveredApis.length > 0) {
      this.learningEngine.learn(domain, discoveredApis);
      log.info('Discovered API patterns', { domain, count: discoveredApis.length });
    }

    // Cache the content for change detection
    pageCache.set(url, {
      html,
      contentHash: ContentCache.hashContent(html),
      fetchedAt: Date.now(),
    });

    // Close the page
    await page.close();

    const loadTime = Date.now() - startTime;

    return {
      url,
      title: extracted.title,
      content: {
        html,
        markdown: extracted.markdown,
        text: extracted.text,
      },
      tables: tables.length > 0 ? tables : undefined,
      network,
      console: consoleMessages,
      discoveredApis,
      metadata: {
        loadTime,
        timestamp: Date.now(),
        finalUrl,
        language,
        retryCount: retryCount > 0 ? retryCount : undefined,
      },
    };
  }
}
