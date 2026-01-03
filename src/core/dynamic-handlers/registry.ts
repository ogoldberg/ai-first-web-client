/**
 * Dynamic Handler Registry
 *
 * The core system for learning and creating handlers dynamically.
 * Manages:
 * - Observation of successful extractions
 * - Detection and application of pattern templates
 * - Learning and storage of site-specific quirks
 * - Creation and lifecycle of dynamic handlers
 */

import { logger } from '../../utils/logger.js';
import { detectTemplate, getTemplateConfig, PATTERN_TEMPLATES } from './pattern-templates.js';
import type {
  DynamicHandler,
  LearnedSiteHandler,
  SiteQuirks,
  ExtractionObservation,
  ExtractionRule,
  ApiPattern,
  HandlerTemplate,
  LearningConfig,
  HandlerMatch,
  SerializedHandlerRegistry,
} from './types.js';

const log = logger.intelligence;

/**
 * Default learning configuration
 */
const DEFAULT_CONFIG: LearningConfig = {
  minObservations: 3,
  promotionThreshold: 0.8,
  demotionThreshold: 0.3,
  maxHandlersPerDomain: 5,
  handlerTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
  autoPromote: true,
};

/**
 * Dynamic Handler Registry
 */
export class DynamicHandlerRegistry {
  private handlers: Map<string, DynamicHandler> = new Map();
  private learnedSites: Map<string, LearnedSiteHandler> = new Map();
  private quirks: Map<string, SiteQuirks> = new Map();
  private observations: Map<string, ExtractionObservation[]> = new Map();
  private config: LearningConfig;

  constructor(config: Partial<LearningConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================
  // OBSERVATION & LEARNING
  // ============================================

  /**
   * Record an observation from a successful extraction
   */
  recordObservation(observation: ExtractionObservation): void {
    const domain = observation.domain;

    // Store observation
    if (!this.observations.has(domain)) {
      this.observations.set(domain, []);
    }
    const domainObs = this.observations.get(domain)!;
    domainObs.push(observation);

    // Keep only recent observations
    if (domainObs.length > 100) {
      domainObs.shift();
    }

    log.debug('Recorded extraction observation', {
      domain,
      strategy: observation.strategy,
      observationCount: domainObs.length,
    });

    // Increment success count on existing handler
    const handler = this.learnedSites.get(domain);
    if (handler) {
      handler.performance.successCount++;
      handler.performance.successRate = this.calculateConfidence(
        handler.performance.successCount,
        handler.performance.failureCount
      );
    }

    // Trigger learning
    this.learnFromObservations(domain);
  }

  /**
   * Record a failure for learning (to detect quirks)
   */
  recordFailure(
    url: string,
    error: string,
    context: {
      statusCode?: number;
      headers?: Record<string, string>;
      strategy?: string;
    }
  ): void {
    const domain = this.extractDomain(url);

    // Increment failure count on existing handler
    const handler = this.learnedSites.get(domain);
    if (handler) {
      handler.performance.failureCount++;
      handler.performance.successRate = this.calculateConfidence(
        handler.performance.successCount,
        handler.performance.failureCount
      );
    }

    // Learn quirks from failures
    this.learnQuirksFromFailure(domain, error, context);
  }

  /**
   * Learn from accumulated observations for a domain
   */
  private learnFromObservations(domain: string): void {
    const observations = this.observations.get(domain) || [];

    if (observations.length < this.config.minObservations) {
      return; // Not enough data yet
    }

    // Check if we already have a handler for this domain
    const existingHandler = this.learnedSites.get(domain);

    if (existingHandler) {
      // Update existing handler
      this.updateHandler(domain, observations);
    } else {
      // Create new handler
      this.createHandler(domain, observations);
    }
  }

  /**
   * Create a new handler from observations
   */
  private createHandler(domain: string, observations: ExtractionObservation[]): void {
    // Analyze observations to find patterns
    const analysis = this.analyzeObservations(observations);

    // Get the HTML from the most recent observation to detect template
    const recentObs = observations[observations.length - 1];

    // Detect which template matches best
    // For now, use the strategy from observations to infer template
    const template = this.inferTemplateFromStrategy(analysis.dominantStrategy);

    // Create quirks from analysis
    const quirks: SiteQuirks = {
      domain,
      confidence: analysis.confidence,
      learnedAt: Date.now(),
      lastVerified: Date.now(),
    };

    // Create the learned site handler
    const handler: LearnedSiteHandler = {
      domain,
      template,
      quirks,
      customRules: analysis.extractionRules,
      discoveredApis: analysis.apiPatterns,
      effectiveConfig: {
        ...getTemplateConfig(template).defaultConfig,
      },
      performance: {
        successRate: 1.0, // Starting optimistically
        avgDuration: analysis.avgDuration,
        lastUsed: Date.now(),
        successCount: observations.length, // Initial observations are all successes
        failureCount: 0,
      },
      version: 1,
    };

    this.learnedSites.set(domain, handler);
    this.quirks.set(domain, quirks);

    log.info('Created dynamic handler', {
      domain,
      template,
      confidence: analysis.confidence,
      rulesLearned: analysis.extractionRules.length,
      apisDiscovered: analysis.apiPatterns.length,
    });
  }

  /**
   * Update an existing handler with new observations
   */
  private updateHandler(domain: string, observations: ExtractionObservation[]): void {
    const handler = this.learnedSites.get(domain)!;
    const analysis = this.analyzeObservations(observations);

    // Update performance metrics
    handler.performance.avgDuration =
      (handler.performance.avgDuration + analysis.avgDuration) / 2;
    handler.performance.lastUsed = Date.now();

    // Merge new extraction rules
    for (const newRule of analysis.extractionRules) {
      const existingRule = handler.customRules.find(r =>
        r.field === newRule.field && r.selector === newRule.selector
      );

      if (existingRule) {
        // Update existing rule
        existingRule.successCount += newRule.successCount;
        existingRule.confidence = this.calculateConfidence(
          existingRule.successCount,
          existingRule.failureCount
        );
      } else {
        // Add new rule
        handler.customRules.push(newRule);
      }
    }

    // Merge new API patterns
    for (const newApi of analysis.apiPatterns) {
      const existingApi = handler.discoveredApis.find(a =>
        a.urlPattern === newApi.urlPattern
      );

      if (!existingApi) {
        handler.discoveredApis.push(newApi);
      }
    }

    // Increment version
    handler.version++;

    log.debug('Updated dynamic handler', {
      domain,
      version: handler.version,
      totalRules: handler.customRules.length,
    });
  }

  /**
   * Analyze observations to extract patterns
   */
  private analyzeObservations(observations: ExtractionObservation[]): {
    dominantStrategy: string;
    confidence: number;
    avgDuration: number;
    extractionRules: ExtractionRule[];
    apiPatterns: ApiPattern[];
  } {
    // Find dominant strategy
    const strategyCounts = new Map<string, number>();
    let totalDuration = 0;

    for (const obs of observations) {
      strategyCounts.set(obs.strategy, (strategyCounts.get(obs.strategy) || 0) + 1);
      totalDuration += obs.duration;
    }

    const dominantStrategy = [...strategyCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    // Extract rules from successful extractions
    const extractionRules: ExtractionRule[] = [];
    const seenSelectors = new Set<string>();

    for (const obs of observations) {
      // Learn from selectors used
      if (obs.selectorsUsed) {
        for (const selector of obs.selectorsUsed) {
          if (!seenSelectors.has(selector)) {
            seenSelectors.add(selector);
            extractionRules.push({
              type: 'css-selector',
              selector,
              field: this.inferFieldFromSelector(selector),
              confidence: 0.7,
              successCount: 1,
              failureCount: 0,
            });
          }
        }
      }

      // Learn from JSON paths
      if (obs.jsonPaths) {
        for (const path of obs.jsonPaths) {
          if (!seenSelectors.has(path)) {
            seenSelectors.add(path);
            extractionRules.push({
              type: 'json-path',
              selector: path,
              field: this.inferFieldFromPath(path),
              confidence: 0.8,
              successCount: 1,
              failureCount: 0,
            });
          }
        }
      }
    }

    // Extract API patterns
    const apiPatterns: ApiPattern[] = [];
    const seenApis = new Set<string>();

    for (const obs of observations) {
      if (obs.apiCalls) {
        for (const call of obs.apiCalls) {
          const pattern = this.extractApiPattern(call.url);
          if (!seenApis.has(pattern)) {
            seenApis.add(pattern);
            apiPatterns.push({
              urlPattern: pattern,
              method: call.method as 'GET' | 'POST',
              responseType: call.responseType as 'json' | 'html',
              confidence: 0.7,
            });
          }
        }
      }
    }

    return {
      dominantStrategy,
      confidence: this.calculateConfidence(observations.length, 0),
      avgDuration: totalDuration / observations.length,
      extractionRules,
      apiPatterns,
    };
  }

  // ============================================
  // QUIRKS LEARNING
  // ============================================

  /**
   * Learn quirks from a failure
   */
  private learnQuirksFromFailure(
    domain: string,
    error: string,
    context: {
      statusCode?: number;
      headers?: Record<string, string>;
      strategy?: string;
    }
  ): void {
    let quirks = this.quirks.get(domain);
    if (!quirks) {
      quirks = {
        domain,
        confidence: 0.3,
        learnedAt: Date.now(),
        lastVerified: Date.now(),
      };
      this.quirks.set(domain, quirks);
    }

    // Learn from status codes
    if (context.statusCode === 403 || context.statusCode === 429) {
      // Likely needs stealth or rate limiting
      if (context.statusCode === 429) {
        quirks.rateLimit = quirks.rateLimit || {
          requestsPerSecond: 1,
          cooldownMs: 5000,
        };
        // Reduce rate limit
        quirks.rateLimit.requestsPerSecond = Math.max(
          0.5,
          (quirks.rateLimit.requestsPerSecond || 1) * 0.5
        );
      }

      if (context.statusCode === 403) {
        quirks.stealth = {
          required: true,
          reason: 'Received 403 Forbidden',
        };
      }
    }

    // Learn from error messages
    if (error.toLowerCase().includes('cloudflare')) {
      quirks.antiBot = {
        type: 'cloudflare',
        severity: 'high',
      };
      quirks.stealth = { required: true, reason: 'Cloudflare protection' };
    } else if (error.toLowerCase().includes('captcha')) {
      quirks.antiBot = {
        type: 'unknown',
        severity: 'high',
        workaround: 'May need browser rendering',
      };
    }

    // Learn timing from rate limit headers
    if (context.headers?.['retry-after']) {
      const retryAfter = parseInt(context.headers['retry-after']);
      if (!isNaN(retryAfter)) {
        quirks.timing = quirks.timing || {};
        quirks.timing.minDelayMs = retryAfter * 1000;
      }
    }

    quirks.lastVerified = Date.now();

    log.debug('Learned quirk from failure', {
      domain,
      error: error.substring(0, 100),
      statusCode: context.statusCode,
      quirks: {
        stealth: quirks.stealth?.required,
        rateLimit: quirks.rateLimit?.requestsPerSecond,
        antiBot: quirks.antiBot?.type,
      },
    });
  }

  /**
   * Get quirks for a domain
   */
  getQuirks(domain: string): SiteQuirks | undefined {
    return this.quirks.get(domain);
  }

  /**
   * Update quirks manually
   */
  updateQuirks(domain: string, updates: Partial<SiteQuirks>): void {
    const existing = this.quirks.get(domain) || {
      domain,
      confidence: 0.5,
      learnedAt: Date.now(),
      lastVerified: Date.now(),
    };

    this.quirks.set(domain, {
      ...existing,
      ...updates,
      lastVerified: Date.now(),
    });
  }

  // ============================================
  // HANDLER MATCHING & RETRIEVAL
  // ============================================

  /**
   * Find a handler for the given URL
   */
  findHandler(url: string): HandlerMatch | null {
    const domain = this.extractDomain(url);
    const handler = this.learnedSites.get(domain);

    if (!handler) {
      return null;
    }

    // Check URL patterns if any
    // For now, return the handler if domain matches
    return {
      handler: this.toDynamicHandler(handler),
      confidence: handler.performance.successRate,
      capturedParams: {},
    };
  }

  /**
   * Get all handlers for a domain
   */
  getHandlersForDomain(domain: string): DynamicHandler[] {
    const handler = this.learnedSites.get(domain);
    if (!handler) return [];
    return [this.toDynamicHandler(handler)];
  }

  /**
   * Check if we have learned anything about a domain
   */
  hasLearnedDomain(domain: string): boolean {
    return this.learnedSites.has(domain) || this.quirks.has(domain);
  }

  /**
   * Get the best extraction approach for a URL
   */
  getExtractionApproach(url: string, html?: string): {
    template: HandlerTemplate;
    quirks?: SiteQuirks;
    rules: ExtractionRule[];
    apis: ApiPattern[];
    confidence: number;
  } {
    const domain = this.extractDomain(url);
    const handler = this.learnedSites.get(domain);
    const quirks = this.quirks.get(domain);

    if (handler) {
      return {
        template: handler.template,
        quirks,
        rules: handler.customRules,
        apis: handler.discoveredApis,
        confidence: handler.performance.successRate,
      };
    }

    // If we have HTML, detect template
    if (html) {
      const detected = detectTemplate(html, url);
      return {
        template: detected.template,
        quirks,
        rules: [],
        apis: [],
        confidence: detected.confidence,
      };
    }

    // No knowledge
    return {
      template: 'html-scrape',
      quirks,
      rules: [],
      apis: [],
      confidence: 0.1,
    };
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  /**
   * Serialize the registry for persistence
   */
  serialize(): SerializedHandlerRegistry {
    return {
      version: 1,
      handlers: [...this.handlers.values()],
      learnedSites: [...this.learnedSites.values()],
      quirks: [...this.quirks.values()],
      observations: [...this.observations.entries()].flatMap(([_, obs]) => obs),
      lastUpdated: Date.now(),
    };
  }

  /**
   * Load from serialized data
   */
  deserialize(data: SerializedHandlerRegistry): void {
    this.handlers.clear();
    this.learnedSites.clear();
    this.quirks.clear();
    this.observations.clear();

    for (const handler of data.handlers) {
      this.handlers.set(handler.id, handler);
    }

    for (const site of data.learnedSites) {
      // Backward compatibility: add successCount/failureCount if missing
      if (site.performance.successCount === undefined) {
        site.performance.successCount = Math.round(site.performance.successRate * 10);
        site.performance.failureCount = Math.round((1 - site.performance.successRate) * 10);
      }
      this.learnedSites.set(site.domain, site);
    }

    for (const quirk of data.quirks) {
      this.quirks.set(quirk.domain, quirk);
    }

    // Group observations by domain
    for (const obs of data.observations) {
      if (!this.observations.has(obs.domain)) {
        this.observations.set(obs.domain, []);
      }
      this.observations.get(obs.domain)!.push(obs);
    }

    log.info('Loaded dynamic handler registry', {
      handlers: this.handlers.size,
      learnedSites: this.learnedSites.size,
      quirks: this.quirks.size,
      observations: data.observations.length,
    });
  }

  /**
   * Get statistics about the registry
   */
  getStats(): {
    totalHandlers: number;
    totalQuirks: number;
    totalObservations: number;
    topDomains: Array<{ domain: string; observations: number }>;
  } {
    const domainStats = [...this.observations.entries()]
      .map(([domain, obs]) => ({ domain, observations: obs.length }))
      .sort((a, b) => b.observations - a.observations)
      .slice(0, 10);

    return {
      totalHandlers: this.learnedSites.size,
      totalQuirks: this.quirks.size,
      totalObservations: [...this.observations.values()].reduce((sum, obs) => sum + obs.length, 0),
      topDomains: domainStats,
    };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private calculateConfidence(successes: number, failures: number): number {
    const total = successes + failures;
    if (total === 0) return 0.5;
    return successes / total;
  }

  private inferTemplateFromStrategy(strategy: string): HandlerTemplate {
    if (strategy.includes('shopify')) return 'shopify-like';
    if (strategy.includes('woocommerce')) return 'woocommerce-like';
    if (strategy.includes('nextjs') || strategy.includes('next')) return 'nextjs-ssr';
    if (strategy.includes('graphql')) return 'graphql';
    if (strategy.includes('jsonld') || strategy.includes('json-ld')) return 'structured-data';
    if (strategy.includes('api')) return 'rest-api';
    return 'html-scrape';
  }

  private inferFieldFromSelector(selector: string): string {
    const lower = selector.toLowerCase();
    if (lower.includes('title') || lower.includes('name')) return 'title';
    if (lower.includes('price') || lower.includes('cost')) return 'price';
    if (lower.includes('desc')) return 'description';
    if (lower.includes('image') || lower.includes('img')) return 'image';
    if (lower.includes('rating') || lower.includes('star')) return 'rating';
    return 'unknown';
  }

  private inferFieldFromPath(path: string): string {
    const lower = path.toLowerCase();
    if (lower.includes('title') || lower.includes('name')) return 'title';
    if (lower.includes('price')) return 'price';
    if (lower.includes('description')) return 'description';
    if (lower.includes('image')) return 'image';
    return 'unknown';
  }

  private extractApiPattern(url: string): string {
    try {
      const parsed = new URL(url);
      // Replace numeric IDs with placeholders
      const path = parsed.pathname.replace(/\/\d+/g, '/{id}');
      return path;
    } catch {
      return url;
    }
  }

  private toDynamicHandler(learned: LearnedSiteHandler): DynamicHandler {
    return {
      id: `dynamic-${learned.domain}`,
      domain: learned.domain,
      name: `Learned: ${learned.domain}`,
      template: learned.template,
      strategy: `dynamic:${learned.template}`,
      urlPatterns: [{
        type: 'prefix',
        pattern: learned.domain,
      }],
      apiPatterns: learned.discoveredApis,
      extractionRules: learned.customRules,
      config: learned.effectiveConfig,
      confidence: {
        score: learned.performance.successRate,
        successCount: learned.performance.successCount,
        failureCount: learned.performance.failureCount,
        lastSuccess: learned.performance.lastUsed,
      },
      version: learned.version,
      createdAt: learned.quirks.learnedAt,
      updatedAt: learned.quirks.lastVerified,
      enabled: true,
      promoted: learned.performance.successRate >= this.config.promotionThreshold,
    };
  }
}

// Export singleton
export const dynamicHandlerRegistry = new DynamicHandlerRegistry();
