/**
 * Smart Browser - Unified intelligent browsing with automatic learning
 *
 * This is the main orchestrator that ties together all learning features
 * into a cohesive, intelligent browsing experience for AI agents.
 *
 * Key capabilities:
 * - Automatic content extraction with learned selectors
 * - Fallback selector chains when primary fails
 * - Response validation with learned rules
 * - Automatic learning from successes and failures
 * - Cross-domain pattern transfer
 * - Pagination detection and handling
 * - Change frequency tracking
 * - Intelligent retry with failure context
 */

import type { Page } from 'playwright';
import type {
  BrowseResult,
  BrowseOptions,
  SelectorPattern,
  PaginationPattern,
  BrowsingAction,
  BrowsingTrajectory,
  PageContext,
  SkillMatch,
  RenderTier,
} from '../types/index.js';
import { BrowserManager } from './browser-manager.js';
import { ContentExtractor } from '../utils/content-extractor.js';
import { ApiAnalyzer } from './api-analyzer.js';
import { SessionManager } from './session-manager.js';
import { LearningEngine } from './learning-engine.js';
import { ProceduralMemory } from './procedural-memory.js';
import { TieredFetcher, type TieredFetchResult } from './tiered-fetcher.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { findPreset, getWaitStrategy } from '../utils/domain-presets.js';
import { pageCache, ContentCache } from '../utils/cache.js';

// Procedural memory thresholds
const SKILL_APPLICATION_THRESHOLD = 0.8;  // Minimum similarity to auto-apply a skill
const MIN_SUCCESS_TEXT_LENGTH = 100;       // Minimum extracted text length for successful trajectory

// Common cookie consent selectors (enhanced with learning)
const DEFAULT_COOKIE_SELECTORS = [
  '[class*="cookie"] button[class*="accept"]',
  '[class*="cookie"] button[class*="agree"]',
  '[class*="consent"] button[class*="accept"]',
  '#onetrust-accept-btn-handler',
  '.cc-btn.cc-dismiss',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '.aceptar-cookies',
  '#aceptarCookies',
  'button[aria-label*="accept" i]',
];

export interface SmartBrowseOptions extends BrowseOptions {
  // Content extraction
  extractContent?: boolean;
  contentType?: SelectorPattern['contentType'];

  // Validation
  validateContent?: boolean;

  // Pagination
  followPagination?: boolean;
  maxPages?: number;

  // Learning
  enableLearning?: boolean;

  // Change detection
  checkForChanges?: boolean;

  // Procedural memory / skills
  useSkills?: boolean; // Try to apply learned skills (default: true)
  recordTrajectory?: boolean; // Record this session for skill learning (default: true)

  // Tiered rendering
  useTieredFetching?: boolean; // Use lightweight rendering when possible (default: true)
  forceTier?: RenderTier; // Force a specific rendering tier
  minContentLength?: number; // Minimum content length for tier validation
}

export interface SmartBrowseResult extends BrowseResult {
  // Learning insights
  learning: {
    selectorsUsed: string[];
    selectorsSucceeded: string[];
    selectorsFailed: string[];
    validationResult?: { valid: boolean; reasons: string[] };
    paginationDetected?: PaginationPattern;
    contentChanged?: boolean;
    recommendedRefreshHours?: number;
    domainGroup?: string;
    confidenceLevel: 'high' | 'medium' | 'low' | 'unknown';
    // Procedural memory insights
    skillsMatched?: SkillMatch[];
    skillApplied?: string;
    trajectoryRecorded?: boolean;
    // Anomaly detection results
    anomalyDetected?: boolean;
    anomalyType?: 'challenge_page' | 'error_page' | 'empty_content' | 'redirect_notice' | 'captcha' | 'rate_limited';
    anomalyAction?: 'wait' | 'retry' | 'use_session' | 'change_agent' | 'skip';
    // Tiered rendering insights
    renderTier?: RenderTier;
    tierFellBack?: boolean;
    tiersAttempted?: RenderTier[];
    tierReason?: string;
    tierTiming?: Record<RenderTier, number>;
  };

  // Additional pages if pagination was followed
  additionalPages?: Array<{
    url: string;
    content: { html: string; markdown: string; text: string };
  }>;
}

export class SmartBrowser {
  private learningEngine: LearningEngine;
  private proceduralMemory: ProceduralMemory;
  private tieredFetcher: TieredFetcher;
  private currentTrajectory: BrowsingTrajectory | null = null;

  constructor(
    private browserManager: BrowserManager,
    private contentExtractor: ContentExtractor,
    private apiAnalyzer: ApiAnalyzer,
    private sessionManager: SessionManager
  ) {
    this.learningEngine = new LearningEngine();
    this.proceduralMemory = new ProceduralMemory();
    this.tieredFetcher = new TieredFetcher(browserManager, contentExtractor);
  }

  async initialize(): Promise<void> {
    await this.learningEngine.initialize();
    await this.proceduralMemory.initialize();
  }

  /**
   * Get the tiered fetcher for direct access
   */
  getTieredFetcher(): TieredFetcher {
    return this.tieredFetcher;
  }

  /**
   * Intelligent browse with automatic learning and optimization
   */
  async browse(url: string, options: SmartBrowseOptions = {}): Promise<SmartBrowseResult> {
    const startTime = Date.now();
    const domain = new URL(url).hostname;
    const enableLearning = options.enableLearning !== false;
    const useSkills = options.useSkills !== false;
    const recordTrajectory = options.recordTrajectory !== false;

    // Initialize learning result
    const learning: SmartBrowseResult['learning'] = {
      selectorsUsed: [],
      selectorsSucceeded: [],
      selectorsFailed: [],
      confidenceLevel: 'unknown',
    };

    // Start trajectory recording for procedural memory
    if (recordTrajectory) {
      this.startTrajectory(url, domain);
    }

    // Check for domain group and apply shared patterns
    const domainGroup = this.learningEngine.getDomainGroup(domain);
    if (domainGroup) {
      learning.domainGroup = domainGroup.name;
      console.error(`[SmartBrowser] Using patterns from domain group: ${domainGroup.name}`);
    }

    // Check for applicable skills from procedural memory
    if (useSkills) {
      const pageContext: PageContext = {
        url,
        domain,
        pageType: 'unknown',
      };

      const matchedSkills = this.proceduralMemory.retrieveSkills(pageContext, 3);
      if (matchedSkills.length > 0) {
        learning.skillsMatched = matchedSkills;
        console.error(`[SmartBrowser] Found ${matchedSkills.length} potentially applicable skills`);

        // Record the best match for later application
        const bestMatch = matchedSkills[0];
        if (bestMatch.preconditionsMet && bestMatch.similarity > SKILL_APPLICATION_THRESHOLD) {
          learning.skillApplied = bestMatch.skill.name;
          console.error(`[SmartBrowser] Will apply skill: ${bestMatch.skill.name} (similarity: ${bestMatch.similarity.toFixed(2)})`);
        }
      }
    }

    // Check if we should back off due to recent failures
    const failurePatterns = this.learningEngine.getFailurePatterns(domain);
    if (failurePatterns.shouldBackoff) {
      console.error(`[SmartBrowser] Backing off from ${domain} due to ${failurePatterns.mostCommonType} errors`);
      // Add extra delay
      await this.delay(5000);
    }

    // Get learned patterns for optimization
    const entry = this.learningEngine.getEntry(domain);
    if (entry) {
      const bypassablePatterns = entry.apiPatterns.filter(p => p.canBypass);
      if (bypassablePatterns.length > 0) {
        learning.confidenceLevel = 'high';
        console.error(`[SmartBrowser] Found ${bypassablePatterns.length} bypassable API patterns for ${domain}`);
      }
    }

    // Try tiered fetching if enabled (faster for static/simple pages)
    const useTieredFetching = options.useTieredFetching !== false;
    const needsFullBrowser = options.followPagination || options.waitForSelector || learning.skillApplied;

    if (useTieredFetching && !needsFullBrowser) {
      try {
        const tieredResult = await this.browseWithTieredFetching(url, options, learning, startTime);
        if (tieredResult) {
          // Tiered fetching succeeded without needing Playwright
          return tieredResult;
        }
        // If tieredResult is null, it fell back to playwright - continue below
      } catch (error) {
        // Tiered fetching failed completely, fall through to Playwright
        console.error(`[SmartBrowser] Tiered fetching failed, falling back to Playwright: ${error}`);
      }
    }

    // The core browsing operation with intelligent enhancements
    const browseWithLearning = async (): Promise<{
      page: Page;
      network: BrowseResult['network'];
      console: BrowseResult['console'];
    }> => {
      // Apply rate limiting
      if (options.useRateLimiting !== false) {
        await rateLimiter.acquire(url);
      }

      // Load session if available
      const context = await this.browserManager.getContext(options.sessionProfile || 'default');
      const hasSession = await this.sessionManager.loadSession(domain, context, options.sessionProfile || 'default');
      if (hasSession) {
        console.error(`[SmartBrowser] Using saved session for ${domain}`);
      }

      // Use preset or learned wait strategy
      const preset = findPreset(url);
      const waitFor = options.waitFor || (preset ? getWaitStrategy(url) : 'networkidle');

      // Browse the page
      const result = await this.browserManager.browse(url, {
        captureNetwork: options.captureNetwork !== false,
        captureConsole: options.captureConsole !== false,
        waitFor,
        timeout: options.timeout || 30000,
        profile: options.sessionProfile,
      });

      // Wait for specific selector if requested
      if (options.waitForSelector) {
        await this.waitForSelectorWithFallback(result.page, options.waitForSelector, domain, learning);
      }

      // Dismiss cookie banners with learned selectors
      if (options.dismissCookieBanner !== false) {
        await this.dismissCookieBannerWithLearning(result.page, domain, enableLearning);
      }

      // Scroll to load lazy content
      if (options.scrollToLoad) {
        await this.scrollToLoadContent(result.page);
      }

      // Check for and wait through bot challenge pages
      await this.waitForBotChallenge(result.page, domain);

      return result;
    };

    // Execute with retry and failure learning
    let result: Awaited<ReturnType<typeof browseWithLearning>>;
    let retryCount = 0;

    try {
      if (options.retryOnError !== false) {
        result = await withRetry(browseWithLearning, {
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
            // Learn from the failure
            if (enableLearning) {
              this.learningEngine.recordFailure(domain, {
                type: this.learningEngine.classifyError(error),
                errorMessage: error.message,
                recoveryAttempted: true,
              });
            }
          },
        });
      } else {
        result = await browseWithLearning();
      }
    } catch (error) {
      // Record final failure
      if (enableLearning && error instanceof Error) {
        this.learningEngine.recordFailure(domain, {
          type: this.learningEngine.classifyError(error),
          errorMessage: error.message,
          recoveryAttempted: retryCount > 0,
          recoverySucceeded: false,
        });
      }
      throw error;
    }

    const { page, network, console: consoleMessages } = result;

    // Get initial content (may be challenge page)
    let html = await page.content();
    let finalUrl = page.url();

    console.error(`[SmartBrowser] Page loaded: ${finalUrl}`);
    console.error(`[SmartBrowser] HTML length: ${html.length} chars`);

    // Note: Bot challenge handling is done in waitForBotChallenge() during browse
    // The page content here should already be post-challenge

    // Run universal anomaly detection
    const anomalyResult = this.learningEngine.detectContentAnomalies(
      html,
      finalUrl,
      options.contentType // Use content type as expected topic hint
    );

    if (anomalyResult.isAnomaly) {
      console.error(`[SmartBrowser] Content anomaly detected: ${anomalyResult.anomalyType} (${Math.round(anomalyResult.confidence * 100)}% confidence)`);
      console.error(`[SmartBrowser] Reasons: ${anomalyResult.reasons.join('; ')}`);

      // Record anomaly in learning results
      learning.anomalyDetected = true;
      learning.anomalyType = anomalyResult.anomalyType;
      learning.anomalyAction = anomalyResult.suggestedAction;

      if (anomalyResult.suggestedAction) {
        console.error(`[SmartBrowser] Suggested action: ${anomalyResult.suggestedAction}`);
      }

      // Take automated action based on anomaly type
      if (anomalyResult.suggestedAction === 'wait' && anomalyResult.waitTimeMs) {
        console.error(`[SmartBrowser] Waiting ${anomalyResult.waitTimeMs}ms for challenge/rate limit...`);
        await this.delay(anomalyResult.waitTimeMs);

        // Re-fetch content after waiting
        html = await page.content();
        finalUrl = page.url();
        console.error(`[SmartBrowser] Post-wait HTML length: ${html.length} chars`);

        // Check if anomaly is resolved
        const postWaitAnomaly = this.learningEngine.detectContentAnomalies(html, finalUrl, options.contentType);
        if (!postWaitAnomaly.isAnomaly) {
          console.error(`[SmartBrowser] Anomaly resolved after waiting`);
        } else {
          console.error(`[SmartBrowser] Anomaly persists: ${postWaitAnomaly.anomalyType}`);
          learning.validationResult = {
            valid: false,
            reasons: postWaitAnomaly.reasons,
          };
          learning.confidenceLevel = 'low';
        }
      } else if (anomalyResult.anomalyType === 'error_page') {
        // Record this for learning but don't retry - page doesn't exist
        learning.validationResult = {
          valid: false,
          reasons: anomalyResult.reasons,
        };
        learning.confidenceLevel = 'low';
      }
    }

    // Detect page context for better skill matching
    if (useSkills) {
      const detectedContext = await this.detectPageContext(page, finalUrl);

      // Re-match skills with full page context
      const matchedSkills = this.proceduralMemory.retrieveSkills(detectedContext, 3);
      if (matchedSkills.length > 0) {
        learning.skillsMatched = matchedSkills;
        const bestMatch = matchedSkills[0];
        if (bestMatch.preconditionsMet && bestMatch.similarity > 0.75) {
          learning.skillApplied = bestMatch.skill.name;
          console.error(`[SmartBrowser] Matched skill with context: ${bestMatch.skill.name} (${detectedContext.pageType} page, similarity: ${bestMatch.similarity.toFixed(2)})`);
        }
      }
    }

    // Try to extract content with learned selectors
    let extractedContent = await this.extractContentWithLearning(
      page,
      html,
      finalUrl,
      domain,
      options.contentType || 'main_content',
      learning,
      enableLearning
    );

    console.error(`[SmartBrowser] Extracted content: ${extractedContent.text.length} chars, title: "${extractedContent.title?.slice(0, 50) || 'none'}"`);

    // Extract tables
    const tables = this.contentExtractor.extractTablesAsJSON(html);

    // Detect language
    let language: string | undefined;
    if (options.detectLanguage !== false) {
      language = this.detectLanguage(html);
    }

    // Validate content with learned rules
    if (options.validateContent !== false && enableLearning) {
      const validationResult = this.learningEngine.validateContent(
        domain,
        extractedContent.text,
        finalUrl
      );
      learning.validationResult = validationResult;

      if (!validationResult.valid) {
        console.error(`[SmartBrowser] Content validation failed: ${validationResult.reasons.join(', ')}`);
        learning.confidenceLevel = 'low';
      } else if (enableLearning) {
        // Learn from successful validation
        this.learningEngine.learnValidator(domain, extractedContent.text, finalUrl);
      }
    }

    // Analyze APIs and learn
    const discoveredApis = this.apiAnalyzer.analyzeRequests(network);
    if (enableLearning && discoveredApis.length > 0) {
      for (const api of discoveredApis) {
        this.learningEngine.learnApiPattern(domain, api);
      }
      console.error(`[SmartBrowser] Learned ${discoveredApis.length} API pattern(s) from ${domain}`);
    }

    // Check for content changes
    if (options.checkForChanges) {
      const cached = pageCache.get(url);
      if (cached) {
        const newHash = ContentCache.hashContent(html);
        const changed = cached.contentHash !== newHash;
        learning.contentChanged = changed;

        if (enableLearning) {
          this.learningEngine.recordContentCheck(domain, finalUrl, html, changed);
          learning.recommendedRefreshHours = this.learningEngine.getRecommendedRefreshInterval(domain, finalUrl);
        }
      }
    }

    // Cache the content
    pageCache.set(url, {
      html,
      contentHash: ContentCache.hashContent(html),
      fetchedAt: Date.now(),
    });

    // Detect pagination
    const paginationPattern = await this.detectPagination(page, finalUrl, domain, enableLearning);
    if (paginationPattern) {
      learning.paginationDetected = paginationPattern;
    }

    // Follow pagination if requested
    let additionalPages: SmartBrowseResult['additionalPages'];
    if (options.followPagination && paginationPattern) {
      additionalPages = await this.followPagination(
        page,
        paginationPattern,
        options.maxPages || 5,
        domain
      );
    }

    // Close the page
    await page.close();

    // Determine overall confidence
    if (learning.confidenceLevel === 'unknown') {
      if (learning.selectorsSucceeded.length > 0 && learning.validationResult?.valid !== false) {
        learning.confidenceLevel = 'high';
      } else if (learning.selectorsFailed.length > learning.selectorsSucceeded.length) {
        learning.confidenceLevel = 'low';
      } else {
        learning.confidenceLevel = 'medium';
      }
    }

    // Complete trajectory recording for procedural memory
    if (recordTrajectory && this.currentTrajectory) {
      const success = learning.confidenceLevel !== 'low' && extractedContent.text.length > MIN_SUCCESS_TEXT_LENGTH;
      await this.completeTrajectory(
        finalUrl,
        success,
        Date.now() - startTime,
        {
          text: extractedContent.text,
          tables: tables.length,
          apis: discoveredApis.length,
        }
      );
      learning.trajectoryRecorded = true;
    }

    return {
      url,
      title: extractedContent.title,
      content: {
        html,
        markdown: extractedContent.markdown,
        text: extractedContent.text,
      },
      tables: tables.length > 0 ? tables : undefined,
      network,
      console: consoleMessages,
      discoveredApis,
      metadata: {
        loadTime: Date.now() - startTime,
        timestamp: Date.now(),
        finalUrl,
        language,
        retryCount: retryCount > 0 ? retryCount : undefined,
      },
      learning,
      additionalPages,
    };
  }

  /**
   * Browse using tiered fetching (static -> lightweight -> playwright)
   * Returns null if it needs to fall back to full Playwright path
   */
  private async browseWithTieredFetching(
    url: string,
    options: SmartBrowseOptions,
    learning: SmartBrowseResult['learning'],
    startTime: number
  ): Promise<SmartBrowseResult | null> {
    const domain = new URL(url).hostname;
    const enableLearning = options.enableLearning !== false;
    const recordTrajectory = options.recordTrajectory !== false;

    try {
      const result = await this.tieredFetcher.fetch(url, {
        forceTier: options.forceTier,
        minContentLength: options.minContentLength || 200,
        tierTimeout: options.timeout || 30000,
        enableLearning,
        headers: options.sessionProfile ? undefined : undefined, // Could add header support
        sessionProfile: options.sessionProfile,
        waitFor: options.waitFor,
        useRateLimiting: options.useRateLimiting,
      });

      // If it fell back to playwright and returned a page, we should use the full Playwright path
      // for better integration with the rest of the system
      if (result.tier === 'playwright' && result.page) {
        // Close the page - we'll redo with full Playwright integration
        await result.page.close();
        return null;
      }

      // Update learning with tier info
      learning.renderTier = result.tier;
      learning.tierFellBack = result.fellBack;
      learning.tiersAttempted = result.tiersAttempted;
      learning.tierReason = result.tierReason;
      learning.tierTiming = result.timing.perTier;

      console.error(`[SmartBrowser] Used ${result.tier} tier for ${domain} (${result.timing.total}ms)`);

      // Extract tables
      const tables = this.contentExtractor.extractTablesAsJSON(result.html);

      // Detect language
      let language: string | undefined;
      if (options.detectLanguage !== false) {
        language = this.detectLanguage(result.html);
      }

      // Validate content with learned rules
      if (options.validateContent !== false && enableLearning) {
        const validationResult = this.learningEngine.validateContent(
          domain,
          result.content.text,
          result.finalUrl
        );
        learning.validationResult = validationResult;

        if (!validationResult.valid) {
          console.error(`[SmartBrowser] Content validation failed: ${validationResult.reasons.join(', ')}`);
          learning.confidenceLevel = 'low';
        } else {
          this.learningEngine.learnValidator(domain, result.content.text, result.finalUrl);
        }
      }

      // Determine confidence level
      if (learning.confidenceLevel === 'unknown') {
        if (result.content.text.length > 500 && !result.fellBack) {
          learning.confidenceLevel = 'high';
        } else if (result.fellBack) {
          learning.confidenceLevel = 'medium';
        } else {
          learning.confidenceLevel = 'medium';
        }
      }

      // Record trajectory for procedural memory
      if (recordTrajectory && this.currentTrajectory) {
        const success = learning.confidenceLevel !== 'low' && result.content.text.length > MIN_SUCCESS_TEXT_LENGTH;
        await this.completeTrajectory(
          result.finalUrl,
          success,
          Date.now() - startTime,
          {
            text: result.content.text,
            tables: tables.length,
            apis: result.discoveredApis.length,
          }
        );
        learning.trajectoryRecorded = true;
      }

      return {
        url,
        title: result.content.title,
        content: {
          html: result.html,
          markdown: result.content.markdown,
          text: result.content.text,
        },
        tables: tables.length > 0 ? tables : undefined,
        network: result.networkRequests,
        console: [], // No console in lightweight rendering
        discoveredApis: result.discoveredApis,
        metadata: {
          loadTime: result.timing.total,
          timestamp: Date.now(),
          finalUrl: result.finalUrl,
          language,
        },
        learning,
      };
    } catch (error) {
      console.error(`[SmartBrowser] Tiered fetching error: ${error}`);
      throw error;
    }
  }

  /**
   * Wait for selector with learned fallbacks
   */
  private async waitForSelectorWithFallback(
    page: Page,
    primarySelector: string,
    domain: string,
    learning: SmartBrowseResult['learning']
  ): Promise<boolean> {
    // Get fallback chain from learning
    const fallbackChain = this.learningEngine.getSelectorChain(domain, 'main_content');
    const allSelectors = [primarySelector, ...fallbackChain.filter(s => s !== primarySelector)];

    learning.selectorsUsed = allSelectors;

    for (const selector of allSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        learning.selectorsSucceeded.push(selector);
        console.error(`[SmartBrowser] Found selector: ${selector}`);
        return true;
      } catch {
        learning.selectorsFailed.push(selector);
        console.error(`[SmartBrowser] Selector not found: ${selector}`);
      }
    }

    return false;
  }

  /**
   * Dismiss cookie banner with learning
   */
  private async dismissCookieBannerWithLearning(
    page: Page,
    domain: string,
    enableLearning: boolean
  ): Promise<boolean> {
    // Get domain group cookie selectors
    const sharedPatterns = this.learningEngine.getSharedPatterns(domain);
    const groupSelectors = sharedPatterns?.cookieBannerSelectors || [];

    // Combine with defaults, domain-specific first
    const allSelectors = [...groupSelectors, ...DEFAULT_COOKIE_SELECTORS];

    for (const selector of allSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isVisible();
          if (isVisible) {
            const startTime = Date.now();
            await button.click();
            console.error(`[SmartBrowser] Dismissed cookie banner using: ${selector}`);

            // Record action for procedural memory
            this.recordAction({
              type: 'dismiss_banner',
              selector,
              timestamp: Date.now(),
              success: true,
              duration: Date.now() - startTime,
            });

            // Learn this selector if it's not from the group
            if (enableLearning && !groupSelectors.includes(selector)) {
              // Could add cookie banner learning here
            }

            await page.waitForTimeout(500);
            return true;
          }
        }
      } catch {
        // Selector not found or not clickable
      }
    }

    return false;
  }

  /**
   * Extract content using learned selectors with fallbacks
   */
  private async extractContentWithLearning(
    page: Page,
    html: string,
    url: string,
    domain: string,
    contentType: SelectorPattern['contentType'],
    learning: SmartBrowseResult['learning'],
    enableLearning: boolean
  ): Promise<{ markdown: string; text: string; title: string }> {
    // Get selector chain for this content type
    const selectorChain = this.learningEngine.getSelectorChain(domain, contentType);

    if (selectorChain.length > 0) {
      learning.selectorsUsed.push(...selectorChain);

      // Try each selector
      for (const selector of selectorChain) {
        try {
          const element = await page.$(selector);
          if (element) {
            const elementHtml = await element.innerHTML();
            if (elementHtml && elementHtml.length > 100) {
              // Extract from this element
              const extracted = this.contentExtractor.extract(elementHtml, url);

              if (extracted.text.length > 50) {
                learning.selectorsSucceeded.push(selector);

                // Learn success
                if (enableLearning) {
                  this.learningEngine.learnSelector(domain, selector, contentType);
                }

                // Record extraction action for procedural memory
                this.recordAction({
                  type: 'extract',
                  selector,
                  timestamp: Date.now(),
                  success: true,
                });

                console.error(`[SmartBrowser] Extracted content using learned selector: ${selector}`);
                return extracted;
              }
            }
          }

          learning.selectorsFailed.push(selector);
          if (enableLearning) {
            this.learningEngine.recordSelectorFailure(domain, selector, contentType);
          }
        } catch {
          learning.selectorsFailed.push(selector);
        }
      }
    }

    // Fall back to default extraction
    console.error(`[SmartBrowser] Falling back to default extraction for ${url}`);
    const defaultExtracted = this.contentExtractor.extract(html, url);
    console.error(`[SmartBrowser] Default extraction result: ${defaultExtracted.text.length} chars`);

    // Learn from the successful extraction
    if (enableLearning && defaultExtracted.text.length > 100) {
      // Try to identify what selector would have worked
      const possibleSelectors = ['main', 'article', '#content', '.content', '[role="main"]'];
      for (const selector of possibleSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const elementHtml = await element.innerHTML();
            // Compare against text length as a heuristic
            if (elementHtml && elementHtml.length > defaultExtracted.text.length * 0.5) {
              this.learningEngine.learnSelector(domain, selector, contentType);
              console.error(`[SmartBrowser] Learned new selector for ${domain}: ${selector}`);
              break;
            }
          }
        } catch {
          // Skip
        }
      }
    }

    return defaultExtracted;
  }

  /**
   * Detect pagination pattern
   */
  private async detectPagination(
    page: Page,
    url: string,
    domain: string,
    enableLearning: boolean
  ): Promise<PaginationPattern | null> {
    // Check if we already know the pattern
    const knownPattern = this.learningEngine.getPaginationPattern(domain, url);
    if (knownPattern) {
      return knownPattern;
    }

    // Try to detect pagination
    const paginationSelectors = [
      '.pagination',
      '[aria-label="pagination"]',
      '.pager',
      'nav[role="navigation"]',
      '.page-numbers',
    ];

    for (const selector of paginationSelectors) {
      try {
        const pagination = await page.$(selector);
        if (pagination) {
          // Look for next/prev links
          const nextLink = await page.$(`${selector} a[rel="next"], ${selector} .next a, ${selector} a:has-text("Next")`);
          const pageLinks = await page.$$(`${selector} a[href*="page"], ${selector} a[href*="p="]`);

          if (nextLink || pageLinks.length > 1) {
            const urls = await Promise.all(
              pageLinks.slice(0, 3).map(async link => {
                const href = await link.getAttribute('href');
                return href ? new URL(href, url).href : null;
              })
            );

            const validUrls = urls.filter((u): u is string => u !== null);

            if (validUrls.length >= 2) {
              // Learn the pagination pattern
              const pattern: PaginationPattern = {
                type: nextLink ? 'next_button' : 'query_param',
                selector: nextLink ? `${selector} a[rel="next"], ${selector} .next a` : undefined,
              };

              if (enableLearning) {
                this.learningEngine.learnPaginationPattern(domain, [url, ...validUrls], pattern);
              }

              return this.learningEngine.getPaginationPattern(domain, url);
            }
          }
        }
      } catch {
        // Skip
      }
    }

    return null;
  }

  /**
   * Follow pagination to get additional pages
   */
  private async followPagination(
    page: Page,
    pattern: PaginationPattern,
    maxPages: number,
    domain: string
  ): Promise<Array<{ url: string; content: { html: string; markdown: string; text: string } }>> {
    const additionalPages: Array<{ url: string; content: { html: string; markdown: string; text: string } }> = [];

    for (let i = 0; i < maxPages - 1; i++) {
      try {
        if (pattern.type === 'next_button' && pattern.selector) {
          const nextButton = await page.$(pattern.selector);
          if (!nextButton) break;

          await nextButton.click();
          await page.waitForLoadState('networkidle');

          const html = await page.content();
          const url = page.url();
          const extracted = this.contentExtractor.extract(html, url);

          additionalPages.push({
            url,
            content: {
              html,
              markdown: extracted.markdown,
              text: extracted.text,
            },
          });
        } else {
          // Query param or path-based pagination
          // Would need to construct next URL and navigate
          break; // For now, only button-based is fully implemented
        }
      } catch (error) {
        console.error(`[SmartBrowser] Pagination failed at page ${i + 2}:`, error);
        break;
      }
    }

    return additionalPages;
  }

  /**
   * Scroll page to load lazy content
   */
  private async scrollToLoadContent(page: Page): Promise<void> {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    let currentPosition = 0;
    const scrollStep = viewportHeight * 0.8;

    while (currentPosition < scrollHeight) {
      currentPosition += scrollStep;
      await page.evaluate((y) => window.scrollTo(0, y), currentPosition);
      await page.waitForTimeout(300);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  }

  /**
   * Detect and wait through bot challenge pages (Cloudflare, Voight-Kampff, etc.)
   */
  private async waitForBotChallenge(page: Page, domain: string): Promise<boolean> {
    // Common indicators of bot challenge pages
    const challengeIndicators = [
      'Checking Your Browser',
      'Please wait',
      'Voight-Kampff',
      'Just a moment',
      'DDoS protection',
      'Cloudflare',
      'Attention Required',
      'Access Denied',
      'Verifying you are human',
      'Please verify you are a human',
      'Security check',
      'challenge-running',
      'cf-browser-verification',
    ];

    // Check if we're on a challenge page
    const pageContent = await page.content();
    const pageText = await page.evaluate(() => document.body?.innerText || '');

    const isChallengePage = challengeIndicators.some(indicator =>
      pageContent.toLowerCase().includes(indicator.toLowerCase()) ||
      pageText.toLowerCase().includes(indicator.toLowerCase())
    );

    if (!isChallengePage) {
      return false;
    }

    console.error(`[SmartBrowser] Bot challenge detected on ${domain}, waiting for completion...`);

    // Wait for the challenge to complete (up to 15 seconds)
    const maxWaitTime = 15000;
    const checkInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      await page.waitForTimeout(checkInterval);

      // Check if challenge is still present
      const currentText = await page.evaluate(() => document.body?.innerText || '');
      const stillChallenging = challengeIndicators.some(indicator =>
        currentText.toLowerCase().includes(indicator.toLowerCase())
      );

      if (!stillChallenging) {
        console.error(`[SmartBrowser] Bot challenge completed on ${domain}`);
        // Wait a bit more for page to fully load after challenge
        await page.waitForTimeout(2000);
        return true;
      }

      // Check if URL changed (redirect after challenge)
      const currentUrl = page.url();
      if (!currentUrl.includes(domain)) {
        console.error(`[SmartBrowser] Redirected after challenge to ${currentUrl}`);
        await page.waitForTimeout(1000);
        return true;
      }
    }

    console.error(`[SmartBrowser] Bot challenge timeout on ${domain} - may need session cookies`);
    return false;
  }

  /**
   * Detect page language
   */
  private detectLanguage(html: string): string | undefined {
    const htmlLangMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
    if (htmlLangMatch) {
      return htmlLangMatch[1].split('-')[0].toLowerCase();
    }

    const metaLangMatch = html.match(
      /<meta[^>]*http-equiv=["']content-language["'][^>]*content=["']([^"']+)["']/i
    );
    if (metaLangMatch) {
      return metaLangMatch[1].split('-')[0].toLowerCase();
    }

    return undefined;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get learning engine for direct access
   */
  getLearningEngine(): LearningEngine {
    return this.learningEngine;
  }

  /**
   * Get intelligence summary for a domain
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
    const entry = this.learningEngine.getEntry(domain);
    const group = this.learningEngine.getDomainGroup(domain);
    const preset = findPreset(`https://${domain}`);

    if (!entry) {
      return {
        knownPatterns: 0,
        selectorChains: 0,
        validators: 0,
        paginationPatterns: 0,
        recentFailures: 0,
        successRate: 1.0,
        domainGroup: group?.name || null,
        recommendedWaitStrategy: preset ? 'preset' : 'networkidle',
        shouldUseSession: false,
      };
    }

    const paginationCount = Object.keys(entry.paginationPatterns as Record<string, unknown>).length;

    return {
      knownPatterns: entry.apiPatterns.length,
      selectorChains: entry.selectorChains.reduce((sum, c) => sum + c.selectors.length, 0),
      validators: entry.validators.length,
      paginationPatterns: paginationCount,
      recentFailures: entry.recentFailures.length,
      successRate: entry.overallSuccessRate,
      domainGroup: entry.domainGroup || group?.name || null,
      recommendedWaitStrategy: preset ? 'preset' : 'networkidle',
      shouldUseSession: entry.apiPatterns.some(p => p.authType === 'cookie'),
    };
  }

  // ============================================
  // PROCEDURAL MEMORY / SKILL METHODS
  // ============================================

  /**
   * Get procedural memory for direct access
   */
  getProceduralMemory(): ProceduralMemory {
    return this.proceduralMemory;
  }

  /**
   * Detect page context for better skill matching
   */
  async detectPageContext(page: Page, url: string): Promise<PageContext> {
    const domain = new URL(url).hostname;

    // Detect page elements in parallel
    const [
      hasForm,
      hasTable,
      hasPagination,
      hasLogin,
      hasSearch,
      title,
      language,
    ] = await Promise.all([
      page.$('form').then(el => el !== null),
      page.$('table').then(el => el !== null),
      page.$('.pagination, [aria-label="pagination"], .pager, nav[role="navigation"] a[href*="page"]').then(el => el !== null),
      page.$('input[type="password"], form[action*="login"], form[action*="signin"], #login, .login-form').then(el => el !== null),
      page.$('input[type="search"], form[action*="search"], input[name="q"], input[name="query"]').then(el => el !== null),
      page.title(),
      page.$eval('html', el => el.getAttribute('lang')).catch(() => undefined),
    ]);

    // Infer page type
    let pageType: PageContext['pageType'] = 'unknown';
    if (hasLogin) {
      pageType = 'login';
    } else if (hasSearch) {
      pageType = 'search';
    } else if (hasForm) {
      pageType = 'form';
    } else if (hasTable || hasPagination) {
      pageType = 'list';
    } else {
      pageType = 'detail';
    }

    // Get available selectors for skill matching
    const availableSelectors = await page.evaluate(() => {
      const selectors: string[] = [];
      // Check for common content selectors
      const checks = [
        'main', 'article', '#content', '.content', '[role="main"]',
        'table', 'form', '.pagination', 'nav',
      ];
      for (const sel of checks) {
        if (document.querySelector(sel)) {
          selectors.push(sel);
        }
      }
      return selectors;
    });

    // Get content length estimate
    const contentLength = await page.evaluate(() => document.body?.innerText?.length || 0);

    return {
      url,
      domain,
      title,
      language: language?.split('-')[0],
      pageType,
      availableSelectors,
      contentLength,
      hasForm,
      hasPagination,
      hasTable,
    };
  }

  /**
   * Start recording a new browsing trajectory
   */
  private startTrajectory(url: string, domain: string): void {
    this.currentTrajectory = {
      id: `traj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startUrl: url,
      endUrl: url,
      domain,
      actions: [],
      success: false,
      totalDuration: 0,
      timestamp: Date.now(),
    };

    // Record the initial navigate action
    this.recordAction({
      type: 'navigate',
      url,
      timestamp: Date.now(),
      success: true,
    });
  }

  /**
   * Record an action in the current trajectory
   */
  recordAction(action: BrowsingAction): void {
    if (this.currentTrajectory) {
      this.currentTrajectory.actions.push(action);
    }
  }

  /**
   * Complete and submit the current trajectory for skill learning
   */
  private async completeTrajectory(
    endUrl: string,
    success: boolean,
    totalDuration: number,
    extractedContent?: { text: string; tables: number; apis: number }
  ): Promise<void> {
    if (!this.currentTrajectory) return;

    this.currentTrajectory.endUrl = endUrl;
    this.currentTrajectory.success = success;
    this.currentTrajectory.totalDuration = totalDuration;
    this.currentTrajectory.extractedContent = extractedContent;

    // Submit to procedural memory for potential skill extraction
    await this.proceduralMemory.recordTrajectory(this.currentTrajectory);

    // Clear the current trajectory
    this.currentTrajectory = null;
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
    return this.proceduralMemory.getStats();
  }

  /**
   * Find applicable skills for a given URL
   */
  findApplicableSkills(url: string, topK: number = 3): SkillMatch[] {
    const domain = new URL(url).hostname;
    const pageContext: PageContext = {
      url,
      domain,
      pageType: 'unknown',
    };
    return this.proceduralMemory.retrieveSkills(pageContext, topK);
  }
}
