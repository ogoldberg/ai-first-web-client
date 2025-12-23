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
  SkillExecutionTrace,
  SkillActionResult,
  BrowsingSkill,
  RenderTier,
  BrowseFieldConfidence,
  FieldConfidence,
  TableConfidence,
  ApiConfidence,
} from '../types/index.js';
import {
  createFieldConfidence,
  aggregateConfidence,
  SOURCE_CONFIDENCE_SCORES,
} from '../types/field-confidence.js';
import {
  type DecisionTrace,
  type TierAttempt,
  buildDecisionTrace,
} from '../types/decision-trace.js';
import { BrowserManager } from './browser-manager.js';
import { ContentExtractor, type TableAsJSON } from '../utils/content-extractor.js';
import { ApiAnalyzer } from './api-analyzer.js';
import { SessionManager } from './session-manager.js';
import { LearningEngine } from './learning-engine.js';
import { ProceduralMemory } from './procedural-memory.js';
import { TieredFetcher, type TieredFetchResult, type FreshnessRequirement } from './tiered-fetcher.js';
import { rateLimiter } from '../utils/rate-limiter.js';
import { withRetry } from '../utils/retry.js';
import { findPreset, getWaitStrategy } from '../utils/domain-presets.js';
import { pageCache, ContentCache } from '../utils/cache.js';
import { TIMEOUTS } from '../utils/timeouts.js';
import { logger } from '../utils/logger.js';
import { validateUrlOrThrow, type UrlSafetyConfig } from '../utils/url-safety.js';
import {
  initializeSemanticInfrastructure,
  type SemanticInfrastructure,
} from './semantic-init.js';
import {
  DebugTraceRecorder,
  createDebugTrace,
  getDebugTraceRecorder,
} from '../utils/debug-trace-recorder.js';
import { convertToHar } from '../utils/har-converter.js';
import type {
  Har,
  HarExportOptions,
  HarExportResult,
} from '../types/har.js';

// Procedural memory thresholds
const SKILL_APPLICATION_THRESHOLD = 0.8;  // Minimum similarity to auto-apply a skill
const MIN_SUCCESS_TEXT_LENGTH = 100;       // Minimum extracted text length for successful trajectory

// Default viewport dimensions for screenshots
const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_VIEWPORT_HEIGHT = 1080;

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

  // Decision trace (CX-003)
  includeDecisionTrace?: boolean; // Include detailed decision trace in response (default: false)

  // === Budget Controls (CX-005) ===

  // Maximum acceptable latency in milliseconds
  // Tiers will stop falling back once this budget is exceeded
  maxLatencyMs?: number;

  // Maximum cost tier to use
  // 'intelligence' = cheapest only, 'lightweight' = up to lightweight, 'playwright' = all tiers allowed
  // More expensive tiers will be skipped
  maxCostTier?: RenderTier;

  // Freshness requirement for content
  // 'realtime': Always fetch fresh content, never use cache
  // 'cached': Prefer cached content, only fetch if not in cache
  // 'any': Use cache if available and not stale, otherwise fetch (default)
  freshnessRequirement?: FreshnessRequirement;

  // === Debug Recording (O-005) ===

  // Record debug trace for this operation
  // Trace will be stored persistently for later analysis
  recordDebugTrace?: boolean;
}

/**
 * Domain capabilities summary (TC-002)
 * Extracted for use in smart_browse response and standalone exports
 */
export interface DomainCapabilitiesSummary {
  canBypassBrowser: boolean;
  hasLearnedPatterns: boolean;
  hasActiveSession: boolean;
  hasSkills: boolean;
  hasPagination: boolean;
  hasContentSelectors: boolean;
}

/**
 * Domain knowledge summary (TC-002)
 * Extracted for use in smart_browse response and standalone exports
 */
export interface DomainKnowledgeSummary {
  patternCount: number;
  successRate: number;
  recommendedWaitStrategy: string;
  recommendations: string[];
}

export interface SmartBrowseResult extends BrowseResult {
  // Field-level confidence (CX-002)
  fieldConfidence?: BrowseFieldConfidence;

  // Decision trace (CX-003)
  decisionTrace?: DecisionTrace;

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
    skillExecutionTrace?: SkillExecutionTrace;  // TC-003: Detailed execution trace
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

    // Budget tracking (CX-005)
    budgetInfo?: {
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

    // Domain capabilities summary (TC-002)
    domainCapabilities?: DomainCapabilitiesSummary;

    // Domain knowledge summary (TC-002)
    domainKnowledge?: DomainKnowledgeSummary;
  };

  // Additional pages if pagination was followed
  additionalPages?: Array<{
    url: string;
    content: { html: string; markdown: string; text: string };
  }>;
}

/**
 * Options for screenshot capture
 */
export interface ScreenshotOptions {
  fullPage?: boolean;
  element?: string;
  waitForSelector?: string;
  sessionProfile?: string;
  width?: number;
  height?: number;
}

/**
 * Result of a screenshot capture operation
 */
export interface ScreenshotResult {
  success: boolean;
  image?: string; // base64 encoded PNG
  mimeType: 'image/png';
  url: string;
  finalUrl: string;
  title: string;
  viewport: { width: number; height: number };
  timestamp: string;
  durationMs: number;
  error?: string;
}

export class SmartBrowser {
  private learningEngine: LearningEngine;
  private proceduralMemory: ProceduralMemory;
  private tieredFetcher: TieredFetcher;
  private currentTrajectory: BrowsingTrajectory | null = null;
  private semanticInfrastructure: SemanticInfrastructure | null = null;
  private debugRecorder: DebugTraceRecorder;

  constructor(
    private browserManager: BrowserManager,
    private contentExtractor: ContentExtractor,
    private apiAnalyzer: ApiAnalyzer,
    private sessionManager: SessionManager,
    learningEngine?: LearningEngine
  ) {
    this.learningEngine = learningEngine ?? new LearningEngine();
    this.proceduralMemory = new ProceduralMemory();
    this.tieredFetcher = new TieredFetcher(browserManager, contentExtractor);
    this.debugRecorder = getDebugTraceRecorder();
  }

  async initialize(): Promise<void> {
    await this.learningEngine.initialize();
    await this.proceduralMemory.initialize();
    await this.debugRecorder.initialize();

    // Auto-initialize semantic matching if dependencies available (LI-001)
    const semanticResult = await initializeSemanticInfrastructure();
    if (semanticResult.success && semanticResult.infrastructure) {
      this.semanticInfrastructure = semanticResult.infrastructure;
      this.learningEngine.setSemanticMatcher(semanticResult.infrastructure.matcher);
      logger.smartBrowser.info('Semantic pattern matching enabled');
    } else {
      logger.smartBrowser.debug('Semantic pattern matching disabled', {
        reason: semanticResult.message,
      });
    }
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

    // SSRF Protection: Validate URL before any processing
    validateUrlOrThrow(url);

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

    // Log freshness requirement (CX-005)
    // The freshnessRequirement is passed to TieredFetcher and tracked in budget info
    // Note: Full cache return for 'cached' requires expanding cache infrastructure (future work)
    if (options.freshnessRequirement) {
      logger.smartBrowser.debug('Freshness requirement set', {
        url,
        freshnessRequirement: options.freshnessRequirement,
      });
    }

    // Start trajectory recording for procedural memory
    if (recordTrajectory) {
      this.startTrajectory(url, domain);
    }

    // Check for domain group and apply shared patterns
    const domainGroup = this.learningEngine.getDomainGroup(domain);
    if (domainGroup) {
      learning.domainGroup = domainGroup.name;
      logger.smartBrowser.debug(`Using patterns from domain group: ${domainGroup.name}`);
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
        logger.smartBrowser.debug(`Found ${matchedSkills.length} potentially applicable skills`);

        // Record the best match for later application
        const bestMatch = matchedSkills[0];
        if (bestMatch.preconditionsMet && bestMatch.similarity > SKILL_APPLICATION_THRESHOLD) {
          learning.skillApplied = bestMatch.skill.name;
          logger.smartBrowser.debug(`Will apply skill: ${bestMatch.skill.name} (similarity: ${bestMatch.similarity.toFixed(2)})`);
        }
      }
    }

    // Check if we should back off due to recent failures
    const failurePatterns = this.learningEngine.getFailurePatterns(domain);
    if (failurePatterns.shouldBackoff) {
      logger.smartBrowser.warn(`Backing off from ${domain} due to ${failurePatterns.mostCommonType} errors`);
      // Add extra delay
      await this.delay(TIMEOUTS.FAILURE_BACKOFF);
    }

    // Get learned patterns for optimization
    const entry = this.learningEngine.getEntry(domain);
    if (entry) {
      const bypassablePatterns = entry.apiPatterns.filter(p => p.canBypass);
      if (bypassablePatterns.length > 0) {
        learning.confidenceLevel = 'high';
        logger.smartBrowser.debug(`Found ${bypassablePatterns.length} bypassable API patterns for ${domain}`);
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
        logger.smartBrowser.warn(`Tiered fetching failed, falling back to Playwright: ${error}`);
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
        logger.smartBrowser.debug(`Using saved session for ${domain}`);
      }

      // Use preset or learned wait strategy
      const preset = findPreset(url);
      const waitFor = options.waitFor || (preset ? getWaitStrategy(url) : 'networkidle');

      // Browse the page
      const result = await this.browserManager.browse(url, {
        captureNetwork: options.captureNetwork !== false,
        captureConsole: options.captureConsole !== false,
        waitFor,
        timeout: options.timeout || TIMEOUTS.PAGE_LOAD,
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

    logger.smartBrowser.debug(`Page loaded: ${finalUrl}`);
    logger.smartBrowser.debug(`HTML length: ${html.length} chars`);

    // Note: Bot challenge handling is done in waitForBotChallenge() during browse
    // The page content here should already be post-challenge

    // Run universal anomaly detection (with error boundary)
    try {
      const anomalyResult = this.learningEngine.detectContentAnomalies(
        html,
        finalUrl,
        options.contentType // Use content type as expected topic hint
      );

      if (anomalyResult.isAnomaly) {
        logger.smartBrowser.warn(`Content anomaly detected: ${anomalyResult.anomalyType} (${Math.round(anomalyResult.confidence * 100)}% confidence)`);
        logger.smartBrowser.warn(`Reasons: ${anomalyResult.reasons.join('; ')}`);

        // Record anomaly in learning results
        learning.anomalyDetected = true;
        learning.anomalyType = anomalyResult.anomalyType;
        learning.anomalyAction = anomalyResult.suggestedAction;

        if (anomalyResult.suggestedAction) {
          logger.smartBrowser.warn(`Suggested action: ${anomalyResult.suggestedAction}`);
        }

        // Take automated action based on anomaly type
        if (anomalyResult.suggestedAction === 'wait' && anomalyResult.waitTimeMs) {
          logger.smartBrowser.info(`Waiting ${anomalyResult.waitTimeMs}ms for challenge/rate limit...`);
          await this.delay(anomalyResult.waitTimeMs);

          // Re-fetch content after waiting
          html = await page.content();
          finalUrl = page.url();
          logger.smartBrowser.debug(`Post-wait HTML length: ${html.length} chars`);

          // Check if anomaly is resolved
          const postWaitAnomaly = this.learningEngine.detectContentAnomalies(html, finalUrl, options.contentType);
          if (!postWaitAnomaly.isAnomaly) {
            logger.smartBrowser.info(`Anomaly resolved after waiting`);
          } else {
            logger.smartBrowser.warn(`Anomaly persists: ${postWaitAnomaly.anomalyType}`);
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
    } catch (anomalyError) {
      logger.smartBrowser.error(`Anomaly detection failed (non-fatal): ${anomalyError}`);
      // Continue without anomaly detection - non-critical feature
    }

    // Detect page context for better skill matching (with error boundary)
    if (useSkills) {
      try {
        const detectedContext = await this.detectPageContext(page, finalUrl);

        // Re-match skills with full page context
        const matchedSkills = this.proceduralMemory.retrieveSkills(detectedContext, 3);
        if (matchedSkills.length > 0) {
          learning.skillsMatched = matchedSkills;
          const bestMatch = matchedSkills[0];
          if (bestMatch.preconditionsMet && bestMatch.similarity > 0.75) {
            learning.skillApplied = bestMatch.skill.name;
            logger.smartBrowser.debug(`Matched skill with context: ${bestMatch.skill.name} (${detectedContext.pageType} page, similarity: ${bestMatch.similarity.toFixed(2)})`);
          }
        }
      } catch (contextError) {
        logger.smartBrowser.error(`Page context detection failed (non-fatal): ${contextError}`);
        // Continue without skill matching - non-critical feature
      }
    }

    // TC-003: Auto-apply matched skills
    if (useSkills && learning.skillsMatched && learning.skillsMatched.length > 0) {
      const bestMatch = learning.skillsMatched[0];
      if (bestMatch.preconditionsMet && bestMatch.similarity > SKILL_APPLICATION_THRESHOLD) {
        try {
          logger.smartBrowser.info(`Auto-applying skill: ${bestMatch.skill.name}`);
          const skillTrace = await this.executeSkillWithFallbacks(
            page,
            bestMatch,
            learning.skillsMatched
          );
          learning.skillExecutionTrace = skillTrace;
          learning.skillApplied = skillTrace.success
            ? (skillTrace.usedFallback && skillTrace.fallbackSkillId
                ? `${bestMatch.skill.name} (fallback: ${skillTrace.fallbackSkillId})`
                : bestMatch.skill.name)
            : undefined;

          // Re-fetch page content after skill execution (actions may have changed the page)
          if (skillTrace.success && skillTrace.actionsExecuted > 0) {
            html = await page.content();
            finalUrl = page.url();
            logger.smartBrowser.debug(`Post-skill HTML length: ${html.length} chars`);
          }
        } catch (skillError) {
          logger.smartBrowser.error(`Skill execution failed (non-fatal): ${skillError}`);
          // Continue without skill execution - non-critical feature
        }
      }
    }

    // Try to extract content with learned selectors (with error boundary)
    let extractedContent: { markdown: string; text: string; title: string };
    try {
      extractedContent = await this.extractContentWithLearning(
        page,
        html,
        finalUrl,
        domain,
        options.contentType || 'main_content',
        learning,
        enableLearning
      );
    } catch (extractError) {
      logger.smartBrowser.error(`Learned extraction failed, falling back to basic: ${extractError}`);
      // Fallback to basic extraction
      extractedContent = this.contentExtractor.extract(html, finalUrl);
    }

    logger.smartBrowser.debug(`Extracted content: ${extractedContent.text.length} chars, title: "${extractedContent.title?.slice(0, 50) || 'none'}"`);

    // Extract tables (with error boundary)
    let tables: TableAsJSON[] = [];
    try {
      tables = this.contentExtractor.extractTablesAsJSON(html);
    } catch (tableError) {
      logger.smartBrowser.error(`Table extraction failed (non-fatal): ${tableError}`);
    }

    // Detect language (with error boundary)
    let language: string | undefined;
    if (options.detectLanguage !== false) {
      try {
        language = this.detectLanguage(html);
      } catch (langError) {
        logger.smartBrowser.error(`Language detection failed (non-fatal): ${langError}`);
      }
    }

    // Validate content with learned rules (with error boundary)
    if (options.validateContent !== false && enableLearning) {
      try {
        const validationResult = this.learningEngine.validateContent(
          domain,
          extractedContent.text,
          finalUrl
        );
        learning.validationResult = validationResult;

        if (!validationResult.valid) {
          logger.smartBrowser.warn(`Content validation failed: ${validationResult.reasons.join(', ')}`);
          learning.confidenceLevel = 'low';
        } else if (enableLearning) {
          // Learn from successful validation
          this.learningEngine.learnValidator(domain, extractedContent.text, finalUrl);
        }
      } catch (validationError) {
        logger.smartBrowser.error(`Content validation error (non-fatal): ${validationError}`);
      }
    }

    // Analyze APIs and learn (with error boundary)
    let discoveredApis: ReturnType<typeof this.apiAnalyzer.analyzeRequests> = [];
    try {
      discoveredApis = this.apiAnalyzer.analyzeRequests(network);
      if (enableLearning && discoveredApis.length > 0) {
        for (const api of discoveredApis) {
          this.learningEngine.learnApiPattern(domain, api);
        }
        logger.smartBrowser.debug(`Learned ${discoveredApis.length} API pattern(s) from ${domain}`);
      }
    } catch (apiError) {
      logger.smartBrowser.error(`API analysis failed (non-fatal): ${apiError}`);
    }

    // Check for content changes (with error boundary)
    if (options.checkForChanges) {
      try {
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
      } catch (changeError) {
        logger.smartBrowser.error(`Content change detection failed (non-fatal): ${changeError}`);
      }
    }

    // Cache the content
    pageCache.set(url, {
      html,
      contentHash: ContentCache.hashContent(html),
      fetchedAt: Date.now(),
    });

    // Detect pagination (with error boundary)
    let paginationPattern: PaginationPattern | null = null;
    try {
      paginationPattern = await this.detectPagination(page, finalUrl, domain, enableLearning);
      if (paginationPattern) {
        learning.paginationDetected = paginationPattern;
      }
    } catch (paginationError) {
      logger.smartBrowser.error(`Pagination detection failed (non-fatal): ${paginationError}`);
    }

    // Follow pagination if requested (with error boundary)
    let additionalPages: SmartBrowseResult['additionalPages'];
    if (options.followPagination && paginationPattern) {
      try {
        additionalPages = await this.followPagination(
          page,
          paginationPattern,
          options.maxPages || 5,
          domain
        );
      } catch (followError) {
        logger.smartBrowser.error(`Following pagination failed (non-fatal): ${followError}`);
        // Continue with just the first page
      }
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

    // Complete trajectory recording for procedural memory (with error boundary)
    if (recordTrajectory && this.currentTrajectory) {
      try {
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
      } catch (trajectoryError) {
        logger.smartBrowser.error(`Trajectory recording failed (non-fatal): ${trajectoryError}`);
        // Continue without recording - non-critical feature
      }
    }

    // Record success profile for Playwright path
    if (enableLearning && learning.confidenceLevel !== 'low') {
      try {
        this.learningEngine.recordSuccess(domain, {
          tier: 'playwright',
          responseTime: Date.now() - startTime,
          contentLength: extractedContent.text.length,
          hasStructuredData: false,
          hasFrameworkData: false,
          hasBypassableApis: discoveredApis.length > 0,
        });
      } catch (successError) {
        logger.smartBrowser.error(`Success profile recording failed (non-fatal): ${successError}`);
      }
    }

    // Compute field-level confidence (CX-002)
    const fieldConfidence = this.computeFieldConfidence(
      html,
      finalUrl,
      tables,
      discoveredApis,
      learning
    );

    // Build decision trace if requested (CX-003)
    // For Playwright path, create a single tier attempt showing direct Playwright use
    const playwrightTierAttempts: TierAttempt[] = [{
      tier: 'playwright',
      success: true,
      durationMs: Date.now() - startTime,
    }];
    const decisionTrace = this.buildDecisionTraceIfRequested(
      options,
      html,
      finalUrl,
      playwrightTierAttempts
    );

    const browseResult: SmartBrowseResult = {
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
      fieldConfidence,
      decisionTrace,
      additionalPages,
    };

    // Record debug trace if enabled (O-005)
    if (options.recordDebugTrace) {
      await this.recordDebugTraceForResult(
        url,
        finalUrl,
        learning.confidenceLevel !== 'low',
        Date.now() - startTime,
        browseResult,
        decisionTrace,
        options
      );
    }

    return browseResult;
  }

  /**
   * Build decision trace if requested (CX-003)
   * Extracts selector and title attempts from HTML and combines with tier attempts
   */
  private buildDecisionTraceIfRequested(
    options: SmartBrowseOptions,
    html: string,
    finalUrl: string,
    tierAttempts: TierAttempt[]
  ): DecisionTrace | undefined {
    if (!options.includeDecisionTrace) {
      return undefined;
    }

    const extractionTrace = this.contentExtractor.extractWithTrace(html, finalUrl);
    return buildDecisionTrace(
      tierAttempts,
      extractionTrace.trace.selectorAttempts,
      extractionTrace.trace.titleAttempts
    );
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
        minContentLength: options.minContentLength,  // Let TieredFetcher use its default (500)
        tierTimeout: options.timeout || TIMEOUTS.TIER_ATTEMPT,
        enableLearning,
        headers: options.sessionProfile ? undefined : undefined, // Could add header support
        sessionProfile: options.sessionProfile,
        waitFor: options.waitFor,
        useRateLimiting: options.useRateLimiting,
        // Budget controls (CX-005)
        maxLatencyMs: options.maxLatencyMs,
        maxCostTier: options.maxCostTier,
        freshnessRequirement: options.freshnessRequirement,
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

      // Update learning with budget info (CX-005)
      if (result.budget) {
        learning.budgetInfo = {
          latencyExceeded: result.budget.latencyExceeded,
          tiersSkipped: result.budget.tiersSkipped,
          maxCostTierEnforced: result.budget.maxCostTierEnforced,
          usedCache: result.budget.usedCache,
          freshnessApplied: result.budget.freshnessApplied,
        };
      }

      logger.smartBrowser.debug(`Used ${result.tier} tier for ${domain} (${result.timing.total}ms)`);

      // Extract tables (with error boundary)
      let tables: TableAsJSON[] = [];
      try {
        tables = this.contentExtractor.extractTablesAsJSON(result.html);
      } catch (tableError) {
        logger.smartBrowser.error(`Table extraction failed (non-fatal): ${tableError}`);
      }

      // Detect language (with error boundary)
      let language: string | undefined;
      if (options.detectLanguage !== false) {
        try {
          language = this.detectLanguage(result.html);
        } catch (langError) {
          logger.smartBrowser.error(`Language detection failed (non-fatal): ${langError}`);
        }
      }

      // Validate content with learned rules (with error boundary)
      if (options.validateContent !== false && enableLearning) {
        try {
          const validationResult = this.learningEngine.validateContent(
            domain,
            result.content.text,
            result.finalUrl
          );
          learning.validationResult = validationResult;

          if (!validationResult.valid) {
            logger.smartBrowser.warn(`Content validation failed: ${validationResult.reasons.join(', ')}`);
            learning.confidenceLevel = 'low';
          } else {
            this.learningEngine.learnValidator(domain, result.content.text, result.finalUrl);
          }
        } catch (validationError) {
          logger.smartBrowser.error(`Content validation error (non-fatal): ${validationError}`);
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

      // Record trajectory for procedural memory (with error boundary)
      if (recordTrajectory && this.currentTrajectory) {
        try {
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
        } catch (trajectoryError) {
          logger.smartBrowser.error(`Trajectory recording failed (non-fatal): ${trajectoryError}`);
        }
      }

      // Record success profile for this domain
      if (enableLearning && learning.confidenceLevel !== 'low') {
        try {
          this.learningEngine.recordSuccess(domain, {
            tier: result.tier,
            strategy: result.extractionStrategy,
            responseTime: result.timing.total,
            contentLength: result.content.text.length,
            hasStructuredData: !!result.content.structured,
            hasFrameworkData: result.extractionStrategy?.startsWith('framework:') ?? false,
            hasBypassableApis: result.discoveredApis.length > 0,
          });
        } catch (successError) {
          logger.smartBrowser.error(`Success profile recording failed (non-fatal): ${successError}`);
        }
      }

      // Compute field-level confidence (CX-002)
      const fieldConfidence = this.computeFieldConfidence(
        result.html,
        result.finalUrl,
        tables,
        result.discoveredApis,
        learning
      );

      // Build decision trace if requested (CX-003)
      const decisionTrace = this.buildDecisionTraceIfRequested(
        options,
        result.html,
        result.finalUrl,
        result.tierAttempts
      );

      const tieredResult: SmartBrowseResult = {
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
        fieldConfidence,
        decisionTrace,
      };

      // Record debug trace if enabled (O-005)
      if (options.recordDebugTrace) {
        await this.recordDebugTraceForResult(
          url,
          result.finalUrl,
          learning.confidenceLevel !== 'low',
          result.timing.total,
          tieredResult,
          decisionTrace,
          options
        );
      }

      return tieredResult;
    } catch (error) {
      logger.smartBrowser.error(`Tiered fetching error: ${error}`);
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
        await page.waitForSelector(selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
        learning.selectorsSucceeded.push(selector);
        logger.smartBrowser.debug(`Found selector: ${selector}`);
        return true;
      } catch {
        learning.selectorsFailed.push(selector);
        logger.smartBrowser.debug(`Selector not found: ${selector}`);
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
            logger.smartBrowser.debug(`Dismissed cookie banner using: ${selector}`);

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

            await page.waitForTimeout(TIMEOUTS.COOKIE_BANNER);
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

                logger.smartBrowser.debug(`Extracted content using learned selector: ${selector}`);
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
    logger.smartBrowser.debug(`Falling back to default extraction for ${url}`);
    const defaultExtracted = this.contentExtractor.extract(html, url);
    logger.smartBrowser.debug(`Default extraction result: ${defaultExtracted.text.length} chars`);

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
              logger.smartBrowser.debug(`Learned new selector for ${domain}: ${selector}`);
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
        logger.smartBrowser.error(`Pagination failed at page ${i + 2}: ${error}`);
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
      await page.waitForTimeout(TIMEOUTS.SCROLL_STEP);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(TIMEOUTS.SCROLL_SETTLE);
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

    logger.smartBrowser.info(`Bot challenge detected on ${domain}, waiting for completion...`);

    // Wait for the challenge to complete
    const maxWaitTime = TIMEOUTS.BOT_CHALLENGE_MAX;
    const checkInterval = TIMEOUTS.BOT_CHECK_INTERVAL;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      await page.waitForTimeout(checkInterval);

      // Check if challenge is still present
      const currentText = await page.evaluate(() => document.body?.innerText || '');
      const stillChallenging = challengeIndicators.some(indicator =>
        currentText.toLowerCase().includes(indicator.toLowerCase())
      );

      if (!stillChallenging) {
        logger.smartBrowser.info(`Bot challenge completed on ${domain}`);
        // Wait a bit more for page to fully load after challenge
        await page.waitForTimeout(TIMEOUTS.CLOUDFLARE_WAIT);
        return true;
      }

      // Check if URL changed (redirect after challenge)
      const currentUrl = page.url();
      if (!currentUrl.includes(domain)) {
        logger.smartBrowser.info(`Redirected after challenge to ${currentUrl}`);
        await page.waitForTimeout(TIMEOUTS.CAPTCHA_WAIT);
        return true;
      }
    }

    logger.smartBrowser.warn(`Bot challenge timeout on ${domain} - may need session cookies`);
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
   * Batch browse multiple URLs with controlled concurrency
   *
   * This method allows browsing multiple URLs in a single call, with:
   * - Configurable concurrency limits
   * - Per-URL and total timeout controls
   * - Individual error handling (one failure doesn't stop others)
   * - Shared session and pattern usage across batch
   * - Progress tracking with per-URL status
   *
   * @param urls Array of URLs to browse
   * @param browseOptions Options applied to each browse operation
   * @param batchOptions Options for the batch operation itself
   * @returns Array of results maintaining the original URL order
   */
  async batchBrowse(
    urls: string[],
    browseOptions: SmartBrowseOptions = {},
    batchOptions: import('../types/index.js').BatchBrowseOptions = {}
  ): Promise<import('../types/index.js').BatchBrowseItem<SmartBrowseResult>[]> {
    const {
      concurrency = 3,
      stopOnError = false,
      continueOnRateLimit = true,
      perUrlTimeoutMs,
      totalTimeoutMs,
    } = batchOptions;

    const batchStartTime = Date.now();
    const results: import('../types/index.js').BatchBrowseItem<SmartBrowseResult>[] = [];
    let stopped = false;

    // Pre-validate all URLs for SSRF protection
    const validatedUrls: { url: string; index: number; valid: boolean; error?: string }[] = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        validateUrlOrThrow(urls[i]);
        validatedUrls.push({ url: urls[i], index: i, valid: true });
      } catch (error) {
        validatedUrls.push({
          url: urls[i],
          index: i,
          valid: false,
          error: error instanceof Error ? error.message : 'Invalid URL',
        });
      }
    }

    // Add invalid URL results immediately
    for (const validated of validatedUrls.filter(v => !v.valid)) {
      results.push({
        url: validated.url,
        status: 'error',
        error: validated.error,
        errorCode: 'INVALID_URL',
        durationMs: 0,
        index: validated.index,
      });
    }

    // Process valid URLs with concurrency control
    const validUrls = validatedUrls.filter(v => v.valid);
    const pending: Set<Promise<void>> = new Set();

    const processUrl = async (urlInfo: { url: string; index: number }): Promise<void> => {
      if (stopped) {
        results.push({
          url: urlInfo.url,
          status: 'skipped',
          error: 'Batch stopped due to previous error',
          durationMs: 0,
          index: urlInfo.index,
        });
        return;
      }

      // Check total timeout
      if (totalTimeoutMs && Date.now() - batchStartTime >= totalTimeoutMs) {
        results.push({
          url: urlInfo.url,
          status: 'skipped',
          error: 'Batch timeout exceeded',
          durationMs: 0,
          index: urlInfo.index,
        });
        return;
      }

      const urlStartTime = Date.now();

      try {
        // Apply per-URL timeout if specified
        const effectiveOptions = { ...browseOptions };
        if (perUrlTimeoutMs) {
          effectiveOptions.timeout = perUrlTimeoutMs;
        }

        const result = await this.browse(urlInfo.url, effectiveOptions);

        results.push({
          url: urlInfo.url,
          status: 'success',
          result,
          durationMs: Date.now() - urlStartTime,
          index: urlInfo.index,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isRateLimited = errorMessage.toLowerCase().includes('rate limit') ||
          errorMessage.toLowerCase().includes('429');

        if (isRateLimited && continueOnRateLimit) {
          results.push({
            url: urlInfo.url,
            status: 'rate_limited',
            error: errorMessage,
            errorCode: 'RATE_LIMITED',
            durationMs: Date.now() - urlStartTime,
            index: urlInfo.index,
          });
        } else {
          results.push({
            url: urlInfo.url,
            status: 'error',
            error: errorMessage,
            errorCode: 'BROWSE_ERROR',
            durationMs: Date.now() - urlStartTime,
            index: urlInfo.index,
          });

          if (stopOnError) {
            stopped = true;
          }
        }
      }
    };

    // Process URLs with controlled concurrency
    for (const urlInfo of validUrls) {
      if (stopped) break;

      // Wait for a slot if at capacity
      while (pending.size >= concurrency) {
        await Promise.race(pending);
      }

      // Check total timeout before starting new request
      if (totalTimeoutMs && Date.now() - batchStartTime >= totalTimeoutMs) {
        break;
      }

      const promise = processUrl(urlInfo).finally(() => {
        pending.delete(promise);
      });
      pending.add(promise);
    }

    // Wait for remaining requests to complete
    await Promise.all(pending);

    // Sort results by original index for consistent ordering
    results.sort((a, b) => a.index - b.index);

    logger.smartBrowser.info('Batch browse completed', {
      totalUrls: urls.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      rateLimited: results.filter(r => r.status === 'rate_limited').length,
      totalDurationMs: Date.now() - batchStartTime,
    });

    return results;
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

  /**
   * Get comprehensive capability summary for a domain (CX-011)
   *
   * This provides an LLM-friendly summary of what the system can do
   * for a given domain, helping the LLM make informed decisions.
   */
  async getDomainCapabilities(domain: string): Promise<{
    domain: string;
    capabilities: {
      canBypassBrowser: boolean;
      hasLearnedPatterns: boolean;
      hasActiveSession: boolean;
      hasSkills: boolean;
      hasPagination: boolean;
      hasContentSelectors: boolean;
    };
    confidence: {
      level: 'high' | 'medium' | 'low' | 'unknown';
      score: number;
      basis: string;
    };
    performance: {
      preferredTier: string;
      avgResponseTimeMs: number | null;
      successRate: number;
    };
    recommendations: string[];
    details: {
      apiPatternCount: number;
      skillCount: number;
      selectorCount: number;
      validatorCount: number;
      paginationPatternCount: number;
      recentFailureCount: number;
      domainGroup: string | null;
    };
  }> {
    const entry = this.learningEngine.getEntry(domain);
    const group = this.learningEngine.getDomainGroup(domain);
    const tierPref = this.tieredFetcher.getDomainPreference(domain);
    const skillsByDomain = this.proceduralMemory.getSkillsByDomain();
    const skills = skillsByDomain.get(domain) ?? [];
    const hasSession = this.sessionManager.hasSession(domain);

    // Calculate capabilities
    const apiPatternCount = entry?.apiPatterns.length ?? 0;
    const bypassablePatterns = entry?.apiPatterns.filter(
      p => p.confidence === 'high' || p.confidence === 'medium'
    ).length ?? 0;
    const canBypassBrowser = bypassablePatterns > 0;
    const hasLearnedPatterns = apiPatternCount > 0;
    const hasSkills = skills.length > 0;
    const hasPagination = entry
      ? Object.keys(entry.paginationPatterns as Record<string, unknown>).length > 0
      : false;
    const selectorCount = entry?.selectorChains.reduce((sum, c) => sum + c.selectors.length, 0) ?? 0;
    const hasContentSelectors = selectorCount > 0;
    const validatorCount = entry?.validators.length ?? 0;
    const recentFailureCount = entry?.recentFailures.length ?? 0;

    // Calculate confidence level
    const successRate = entry?.overallSuccessRate ?? 1.0;
    let confidenceLevel: 'high' | 'medium' | 'low' | 'unknown';
    let confidenceBasis: string;

    if (!entry) {
      confidenceLevel = 'unknown';
      confidenceBasis = 'No prior interactions with this domain';
    } else if (successRate >= 0.9 && apiPatternCount >= 2) {
      confidenceLevel = 'high';
      confidenceBasis = `${apiPatternCount} patterns with ${Math.round(successRate * 100)}% success rate`;
    } else if (successRate >= 0.7 || apiPatternCount >= 1) {
      confidenceLevel = 'medium';
      confidenceBasis = `${apiPatternCount} patterns with ${Math.round(successRate * 100)}% success rate`;
    } else {
      confidenceLevel = 'low';
      confidenceBasis = `Limited patterns (${apiPatternCount}) or low success rate (${Math.round(successRate * 100)}%)`;
    }

    // Performance info
    const preferredTier = tierPref?.preferredTier ?? 'intelligence';
    const avgResponseTimeMs = tierPref?.avgResponseTime ?? null;

    // Build recommendations
    const recommendations: string[] = [];

    if (canBypassBrowser) {
      recommendations.push('API patterns available - can bypass browser rendering for faster access');
    }

    if (hasSession) {
      recommendations.push('Active session available - authenticated requests supported');
    } else if (entry?.apiPatterns.some(p => p.authType === 'cookie')) {
      recommendations.push('Authentication required - save a session first for authenticated access');
    }

    if (hasSkills) {
      recommendations.push(`${skills.length} skill(s) available for automated workflows`);
    }

    if (hasPagination) {
      recommendations.push('Pagination patterns learned - can navigate multi-page content');
    }

    if (group) {
      recommendations.push(`Part of ${group.name} domain group - shared patterns may apply`);
    }

    if (recentFailureCount > 0) {
      recommendations.push(`${recentFailureCount} recent failure(s) - may need alternative approach`);
    }

    if (preferredTier === 'playwright') {
      recommendations.push('Full browser required - this domain needs JavaScript rendering');
    }

    if (recommendations.length === 0) {
      recommendations.push('New domain - will learn patterns as you browse');
    }

    return {
      domain,
      capabilities: {
        canBypassBrowser,
        hasLearnedPatterns,
        hasActiveSession: hasSession,
        hasSkills,
        hasPagination,
        hasContentSelectors,
      },
      confidence: {
        level: confidenceLevel,
        score: successRate,
        basis: confidenceBasis,
      },
      performance: {
        preferredTier,
        avgResponseTimeMs,
        successRate,
      },
      recommendations,
      details: {
        apiPatternCount,
        skillCount: skills.length,
        selectorCount,
        validatorCount,
        paginationPatternCount: hasPagination
          ? Object.keys(entry!.paginationPatterns as Record<string, unknown>).length
          : 0,
        recentFailureCount,
        domainGroup: group?.name ?? null,
      },
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

  // ============================================
  // SKILL AUTO-APPLICATION (TC-003)
  // ============================================

  /**
   * Execute a single action on the page
   * Returns the result of the action execution
   */
  private async executeAction(
    page: Page,
    action: BrowsingAction
  ): Promise<SkillActionResult> {
    const startTime = Date.now();
    const result: SkillActionResult = {
      type: action.type,
      selector: action.selector,
      success: false,
      duration: 0,
    };

    try {
      switch (action.type) {
        case 'navigate':
          if (action.url) {
            await page.goto(action.url, {
              waitUntil: action.waitFor === 'networkidle' ? 'networkidle' : 'load',
              timeout: TIMEOUTS.PAGE_LOAD,
            });
            result.success = true;
          }
          break;

        case 'click':
          if (action.selector) {
            await page.waitForSelector(action.selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
            await page.click(action.selector);
            result.success = true;
          }
          break;

        case 'fill':
          if (action.selector && action.value !== undefined) {
            await page.waitForSelector(action.selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
            await page.fill(action.selector, action.value);
            result.success = true;
          }
          break;

        case 'select':
          if (action.selector && action.value !== undefined) {
            await page.waitForSelector(action.selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
            await page.selectOption(action.selector, action.value);
            result.success = true;
          }
          break;

        case 'scroll':
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          // Wait for any lazy-loaded content
          await this.delay(500);
          result.success = true;
          break;

        case 'wait':
          if (action.waitFor === 'selector' && action.selector) {
            await page.waitForSelector(action.selector, { timeout: TIMEOUTS.SELECTOR_WAIT });
          } else if (action.waitFor === 'networkidle') {
            await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.PAGE_LOAD });
          } else {
            await page.waitForLoadState('load', { timeout: TIMEOUTS.PAGE_LOAD });
          }
          result.success = true;
          break;

        case 'extract':
          // Extract action is informational - always succeeds
          result.success = true;
          break;

        case 'dismiss_banner':
          if (action.selector) {
            try {
              await page.waitForSelector(action.selector, { timeout: 2000 });
              await page.click(action.selector);
              result.success = true;
            } catch {
              // Banner might not be present, which is fine
              result.success = true;
            }
          }
          break;

        default:
          logger.smartBrowser.warn(`Unknown action type: ${action.type}`);
          result.success = false;
          result.error = `Unknown action type: ${action.type}`;
      }
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
      logger.smartBrowser.debug(`Action ${action.type} failed: ${result.error}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Execute a skill's action sequence on the page (TC-003)
   * Auto-applies matched skills to automate browsing workflows
   */
  async executeSkillActions(
    page: Page,
    skill: BrowsingSkill,
    match: SkillMatch
  ): Promise<SkillExecutionTrace> {
    const startTime = Date.now();
    const actionResults: SkillActionResult[] = [];
    let actionsExecuted = 0;
    let overallSuccess = true;
    let errorMessage: string | undefined;

    logger.smartBrowser.info(`Executing skill: ${skill.name} (${skill.actionSequence.length} actions)`);

    // Skip navigate action if we're already on the target page
    // (we've already navigated in the browse flow)
    const actionsToExecute = skill.actionSequence.filter((action, index) => {
      // Skip the first navigate action since we're already on the page
      if (index === 0 && action.type === 'navigate') {
        logger.smartBrowser.debug('Skipping initial navigate action (already on page)');
        return false;
      }
      return true;
    });

    for (const action of actionsToExecute) {
      const result = await this.executeAction(page, action);
      actionResults.push(result);
      actionsExecuted++;

      // Record action in trajectory for learning
      this.recordAction({
        ...action,
        timestamp: Date.now(),
        success: result.success,
        duration: result.duration,
      });

      if (!result.success) {
        // For critical actions (click, fill, select), stop on failure
        if (['click', 'fill', 'select'].includes(action.type)) {
          overallSuccess = false;
          errorMessage = result.error || `Action ${action.type} failed`;
          logger.smartBrowser.warn(`Skill execution stopped: ${errorMessage}`);
          break;
        }
        // For non-critical actions (scroll, wait), continue
        logger.smartBrowser.debug(`Non-critical action ${action.type} failed, continuing`);
      }
    }

    const totalDuration = Date.now() - startTime;

    // Record skill execution in procedural memory
    await this.proceduralMemory.recordSkillExecution(skill.id, overallSuccess, totalDuration);

    const trace: SkillExecutionTrace = {
      skillId: skill.id,
      skillName: skill.name,
      matchReason: match.reason || `Similarity: ${(match.similarity * 100).toFixed(0)}%`,
      similarity: match.similarity,
      success: overallSuccess,
      totalDuration,
      actionResults,
      actionsExecuted,
      totalActions: skill.actionSequence.length,
      error: errorMessage,
      usedFallback: false,
    };

    logger.smartBrowser.info(
      `Skill execution ${overallSuccess ? 'succeeded' : 'failed'}: ${skill.name} ` +
      `(${actionsExecuted}/${skill.actionSequence.length} actions, ${totalDuration}ms)`
    );

    return trace;
  }

  /**
   * Execute a skill with fallback chain support (TC-003)
   * Tries the primary skill first, then falls back to alternative skills if available
   */
  async executeSkillWithFallbacks(
    page: Page,
    primaryMatch: SkillMatch,
    allMatches: SkillMatch[]
  ): Promise<SkillExecutionTrace> {
    // Try primary skill first
    let trace = await this.executeSkillActions(page, primaryMatch.skill, primaryMatch);

    if (trace.success) {
      return trace;
    }

    // Try fallback skills from the matched list
    for (let i = 1; i < allMatches.length && !trace.success; i++) {
      const fallbackMatch = allMatches[i];

      // Only try if preconditions are met
      if (!fallbackMatch.preconditionsMet) {
        continue;
      }

      logger.smartBrowser.info(`Trying fallback skill: ${fallbackMatch.skill.name}`);

      const fallbackTrace = await this.executeSkillActions(page, fallbackMatch.skill, fallbackMatch);

      if (fallbackTrace.success) {
        // Create combined trace showing fallback was used
        trace = {
          ...trace,
          success: true,
          usedFallback: true,
          fallbackSkillId: fallbackMatch.skill.id,
          totalDuration: trace.totalDuration + fallbackTrace.totalDuration,
          actionResults: [...trace.actionResults, ...fallbackTrace.actionResults],
          actionsExecuted: trace.actionsExecuted + fallbackTrace.actionsExecuted,
          error: undefined,
        };
        break;
      }
    }

    return trace;
  }

  // ============================================
  // FIELD-LEVEL CONFIDENCE (CX-002)
  // ============================================

  /**
   * Compute field-level confidence for browse results
   * Uses extraction sources and validation results to provide per-field confidence
   */
  computeFieldConfidence(
    html: string,
    url: string,
    tables: TableAsJSON[],
    discoveredApis: Array<{ endpoint: string; method: string; confidence: 'high' | 'medium' | 'low'; canBypass: boolean }>,
    learning: SmartBrowseResult['learning']
  ): BrowseFieldConfidence {
    // Use ContentExtractor's confidence-tracking extraction
    const extraction = this.contentExtractor.extractWithConfidence(html, url);

    // Adjust content confidence based on learning results
    let contentConfidence = extraction.confidence.content;

    // Boost if selectors succeeded
    if (learning.selectorsSucceeded.length > 0) {
      contentConfidence = {
        ...contentConfidence,
        score: Math.min(1.0, contentConfidence.score + 0.1),
        reason: `${contentConfidence.reason}; validated by ${learning.selectorsSucceeded.length} selector(s)`,
      };
    }

    // Reduce if selectors failed
    if (learning.selectorsFailed.length > learning.selectorsSucceeded.length) {
      contentConfidence = {
        ...contentConfidence,
        score: Math.max(0.1, contentConfidence.score - 0.1),
        reason: `${contentConfidence.reason}; ${learning.selectorsFailed.length} selector(s) failed`,
      };
    }

    // Compute table confidence using SOURCE_CONFIDENCE_SCORES
    const tableConfidences: TableConfidence[] = tables.map((table, index) => {
      const hasHeaders = table.headers.length > 0;
      const hasData = table.data.length > 0;

      // Header confidence using predefined scores
      const headerScore = hasHeaders ? SOURCE_CONFIDENCE_SCORES.selector_match : SOURCE_CONFIDENCE_SCORES.fallback;
      const headerConfidence = createFieldConfidence(
        headerScore,
        hasHeaders ? 'selector_match' : 'fallback',
        hasHeaders ? `${table.headers.length} headers detected` : 'No headers detected'
      );

      // Data confidence - use selector_match score for valid data, lower for missing
      const dataScore = hasData ? SOURCE_CONFIDENCE_SCORES.selector_match : 0.10;
      const dataConfidence = createFieldConfidence(
        dataScore,
        hasData ? 'selector_match' : 'fallback',
        hasData ? `${table.data.length} rows extracted` : 'No data rows found'
      );

      // Caption confidence (optional)
      const captionConfidence = table.caption
        ? createFieldConfidence(SOURCE_CONFIDENCE_SCORES.selector_match, 'selector_match', 'Caption found')
        : undefined;

      return {
        index,
        headers: headerConfidence,
        data: dataConfidence,
        caption: captionConfidence,
      };
    });

    // Map string confidence to numeric (defined outside map for efficiency)
    const confidenceMap: Record<'high' | 'medium' | 'low', number> = {
      high: 0.90,
      medium: 0.70,
      low: 0.45,
    };

    // Compute API confidence
    const apiConfidences: ApiConfidence[] = discoveredApis.map((api) => {
      const baseScore = confidenceMap[api.confidence];

      return {
        endpoint: api.endpoint,
        endpointConfidence: createFieldConfidence(
          baseScore,
          'api_response',
          `Discovered from network traffic (${api.confidence} confidence)`
        ),
        methodConfidence: createFieldConfidence(
          0.95, // Method detection is very reliable
          'api_response',
          `HTTP ${api.method} method detected`
        ),
        bypassConfidence: createFieldConfidence(
          api.canBypass ? SOURCE_CONFIDENCE_SCORES.selector_match : SOURCE_CONFIDENCE_SCORES.heuristic,
          api.canBypass ? 'api_response' : 'heuristic',
          api.canBypass ? 'Can likely bypass browser rendering' : 'May require browser for auth/state'
        ),
      };
    });

    // Compute overall confidence using flatMap for cleaner array building
    const allConfidences: FieldConfidence[] = [
      extraction.confidence.title,
      contentConfidence,
      ...tableConfidences.flatMap(tc => [tc.headers, tc.data]),
      ...apiConfidences.map(ac => ac.endpointConfidence),
    ];

    const overall = aggregateConfidence(allConfidences);

    return {
      title: extraction.confidence.title,
      content: contentConfidence,
      tables: tableConfidences.length > 0 ? tableConfidences : undefined,
      discoveredApis: apiConfidences.length > 0 ? apiConfidences : undefined,
      overall,
    };
  }

  /**
   * Check if semantic pattern matching is enabled
   *
   * Returns true if semantic infrastructure was successfully initialized.
   * When enabled, the LearningEngine will use semantic similarity search
   * as a fallback when exact pattern matching fails.
   */
  isSemanticMatchingEnabled(): boolean {
    return this.semanticInfrastructure !== null;
  }

  /**
   * Get the semantic infrastructure (if initialized)
   *
   * Returns the semantic infrastructure components, or null if not initialized.
   * Use this to access the EmbeddedStore for pattern storage or VectorStore
   * for direct embedding operations.
   */
  getSemanticInfrastructure(): SemanticInfrastructure | null {
    return this.semanticInfrastructure;
  }

  // ============================================
  // DEBUG TRACE RECORDING (O-005)
  // ============================================

  /**
   * Get the debug trace recorder for direct access
   */
  getDebugRecorder(): DebugTraceRecorder {
    return this.debugRecorder;
  }

  /**
   * Record a debug trace for a browse result
   */
  private async recordDebugTraceForResult(
    url: string,
    finalUrl: string,
    success: boolean,
    durationMs: number,
    result: SmartBrowseResult,
    decisionTrace: DecisionTrace | undefined,
    options: SmartBrowseOptions
  ): Promise<void> {
    try {
      // Build the trace with decision trace always included for recording
      // (even if not requested in response)
      const traceForRecording = decisionTrace ?? this.buildDecisionTraceIfRequested(
        { ...options, includeDecisionTrace: true },
        result.content.html,
        finalUrl,
        result.learning.tiersAttempted?.map(tier => ({
          tier,
          success: tier === result.learning.renderTier,
          durationMs: result.learning.tierTiming?.[tier] ?? 0,
        })) ?? []
      );

      const debugTrace = createDebugTrace(url, finalUrl, success, durationMs, {
        decisionTrace: traceForRecording,
        network: result.network,
        validation: result.learning.validationResult,
        content: {
          text: result.content.text,
          markdown: result.content.markdown,
          tables: result.tables?.length ?? 0,
          apis: result.discoveredApis.length,
        },
        skills: result.learning.skillsMatched
          ? {
              matched: result.learning.skillsMatched.map(s => s.skill.name),
              applied: result.learning.skillApplied,
              trajectoryRecorded: result.learning.trajectoryRecorded ?? false,
            }
          : undefined,
        anomaly: result.learning.anomalyDetected
          ? {
              type: result.learning.anomalyType ?? 'unknown',
              action: result.learning.anomalyAction ?? 'none',
              confidence: 0.8,
            }
          : undefined,
        options: options as Record<string, unknown>,
        sessionProfile: options.sessionProfile,
        tier: result.learning.renderTier,
        fellBack: result.learning.tierFellBack,
        tiersAttempted: result.learning.tiersAttempted,
        budget: result.learning.budgetInfo
          ? {
              maxLatencyMs: options.maxLatencyMs,
              maxCostTier: options.maxCostTier,
              latencyExceeded: result.learning.budgetInfo.latencyExceeded,
              tiersSkipped: result.learning.budgetInfo.tiersSkipped,
            }
          : undefined,
      });

      await this.debugRecorder.record(debugTrace);
    } catch (error) {
      logger.smartBrowser.error(`Failed to record debug trace (non-fatal): ${error}`);
    }
  }

  /**
   * Create an error response for screenshot capture
   */
  private createScreenshotErrorResponse(
    url: string,
    options: ScreenshotOptions,
    startTime: number,
    errorMessage: string
  ): ScreenshotResult {
    return {
      success: false,
      mimeType: 'image/png',
      url,
      finalUrl: url,
      title: '',
      viewport: {
        width: options.width ?? DEFAULT_VIEWPORT_WIDTH,
        height: options.height ?? DEFAULT_VIEWPORT_HEIGHT,
      },
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }

  /**
   * Capture a screenshot of a URL
   *
   * This method navigates to the URL using Playwright (required for screenshots)
   * and captures a screenshot. Screenshots are not available when using
   * intelligence or lightweight rendering tiers.
   *
   * @param url - The URL to screenshot
   * @param options - Screenshot options
   * @returns Screenshot result with base64 image data and metadata
   */
  async captureScreenshot(
    url: string,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();

    // SSRF Protection: Validate URL before any processing
    validateUrlOrThrow(url);

    // Check if Playwright is available
    if (!BrowserManager.isPlaywrightAvailable()) {
      const error = BrowserManager.getPlaywrightError();
      return this.createScreenshotErrorResponse(
        url,
        options,
        startTime,
        `Screenshot capture requires Playwright. ${error || 'Install with: npm install playwright && npx playwright install chromium'}`
      );
    }

    let page: Page | undefined;
    try {
      // Navigate to the page using BrowserManager
      const browseResult = await this.browserManager.browse(url, {
        profile: options.sessionProfile,
        waitFor: 'networkidle',
      });
      page = browseResult.page;

      // Set viewport if custom dimensions specified
      if (options.width || options.height) {
        await page.setViewportSize({
          width: options.width ?? DEFAULT_VIEWPORT_WIDTH,
          height: options.height ?? DEFAULT_VIEWPORT_HEIGHT,
        });
      }

      // Wait for specific element if requested
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT });
      }

      // Get page info
      const finalUrl = page.url();
      const title = await page.title();
      const viewport = page.viewportSize() ?? {
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT,
      };

      // Capture screenshot
      const imageBase64 = await this.browserManager.screenshotBase64(page, {
        fullPage: options.fullPage ?? true,
        element: options.element,
      });

      return {
        success: true,
        image: imageBase64,
        mimeType: 'image/png',
        url,
        finalUrl,
        title,
        viewport,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.smartBrowser.error('Screenshot capture failed', { url, error: message });

      return this.createScreenshotErrorResponse(url, options, startTime, message);
    } finally {
      // Ensure page is always closed to prevent resource leaks
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Create an error response for HAR export
   */
  private createHarErrorResponse(
    url: string,
    startTime: number,
    errorMessage: string
  ): HarExportResult {
    return {
      success: false,
      url,
      finalUrl: url,
      title: '',
      entriesCount: 0,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }

  /**
   * Export HAR (HTTP Archive) for a URL
   *
   * This method navigates to the URL using Playwright (required for network capture)
   * and exports the network traffic in HAR 1.2 format.
   *
   * @param url - The URL to browse and capture network traffic
   * @param options - HAR export options
   * @returns HAR export result with network data
   */
  async exportHar(
    url: string,
    options: HarExportOptions & {
      sessionProfile?: string;
      waitForSelector?: string;
    } = {}
  ): Promise<HarExportResult> {
    const startTime = Date.now();

    // SSRF Protection: Validate URL before any processing
    validateUrlOrThrow(url);

    // Check if Playwright is available
    if (!BrowserManager.isPlaywrightAvailable()) {
      const error = BrowserManager.getPlaywrightError();
      return this.createHarErrorResponse(
        url,
        startTime,
        `HAR export requires Playwright. ${error || 'Install with: npm install playwright && npx playwright install chromium'}`
      );
    }

    let page: Page | undefined;
    try {
      // Navigate to the page using BrowserManager with network capture
      const browseResult = await this.browserManager.browse(url, {
        profile: options.sessionProfile,
        waitFor: 'networkidle',
        captureNetwork: true,
      });
      page = browseResult.page;

      // Wait for specific element if requested
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: TIMEOUTS.SELECTOR_WAIT });
      }

      // Get page info
      const finalUrl = page.url();
      const title = await page.title();

      // Convert network requests to HAR format
      const har = convertToHar(browseResult.network, {
        includeResponseBodies: options.includeResponseBodies ?? true,
        maxBodySize: options.maxBodySize,
        pageTitle: title || options.pageTitle || 'Page',
      });

      return {
        success: true,
        har,
        url,
        finalUrl,
        title,
        entriesCount: har.log.entries.length,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.smartBrowser.error('HAR export failed', { url, error: message });

      return this.createHarErrorResponse(url, startTime, message);
    } finally {
      // Ensure page is always closed to prevent resource leaks
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Enable debug trace recording globally
   */
  enableDebugRecording(): void {
    this.debugRecorder.enable();
  }

  /**
   * Disable debug trace recording globally
   */
  disableDebugRecording(): void {
    this.debugRecorder.disable();
  }

  /**
   * Check if debug trace recording is enabled
   */
  isDebugRecordingEnabled(): boolean {
    return this.debugRecorder.getConfig().enabled;
  }
}
