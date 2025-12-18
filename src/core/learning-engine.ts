/**
 * Learning Engine - Advanced learning system for the LLM Browser
 *
 * Features:
 * - Temporal confidence decay
 * - Content structure learning (selector patterns)
 * - Selector fallback chains
 * - Failure context learning
 * - Content change frequency tracking
 * - Cross-domain pattern transfer
 * - Response validation
 * - Pagination pattern detection
 *
 * Uses PersistentStore for:
 * - Debounced writes (batches rapid learning calls)
 * - Atomic writes (temp file + rename for corruption safety)
 */

import * as crypto from 'crypto';
import { PersistentStore } from '../utils/persistent-store.js';
import type {
  EnhancedApiPattern,
  EnhancedKnowledgeBaseEntry,
  SelectorPattern,
  SelectorChain,
  RefreshPattern,
  ContentValidator,
  PaginationPattern,
  DomainGroup,
  FailureContext,
  LearningEvent,
  ConfidenceDecayConfig,
  ApiPattern,
  SuccessProfile,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

// Default confidence decay configuration
const DEFAULT_DECAY_CONFIG: ConfidenceDecayConfig = {
  gracePeriodDays: 14,
  decayRatePerWeek: 0.1,
  minConfidenceThreshold: 0.3,
  archiveAfterDays: 90,
};

// Pre-configured domain groups
const DOMAIN_GROUPS: DomainGroup[] = [
  {
    name: 'spanish_gov',
    domains: [
      'boe.es',
      'extranjeria.inclusion.gob.es',
      'agenciatributaria.es',
      'seg-social.es',
      'mites.gob.es',
      'inclusion.gob.es',
      'exteriores.gob.es',
      'policia.es',
    ],
    sharedPatterns: {
      cookieBannerSelectors: [
        '.aceptar-cookies',
        '#aceptarCookies',
        '.acepto-cookies',
        '[data-cookies-accept]',
        '.cookie-accept-btn',
      ],
      contentSelectors: [
        '#contenido',
        '.contenido-principal',
        '#main-content',
        'article.content',
        '.documento-contenido',
      ],
      navigationSelectors: [
        '.navegacion-principal',
        '#menu-principal',
        'nav.main-nav',
      ],
      commonAuthType: 'none',
      language: 'es',
    },
    lastUpdated: Date.now(),
  },
  {
    name: 'us_gov',
    domains: [
      'uscis.gov',
      'irs.gov',
      'state.gov',
      'ssa.gov',
      'dhs.gov',
      'travel.state.gov',
      'cbp.gov',
    ],
    sharedPatterns: {
      cookieBannerSelectors: [
        '#cookie-consent-accept',
        '.usa-banner__button',
        '[data-analytics="cookie-accept"]',
      ],
      contentSelectors: [
        'main#main-content',
        '.usa-layout-docs__main',
        'article.content',
        '#content',
      ],
      navigationSelectors: [
        '.usa-nav',
        '#nav-primary',
        'nav[aria-label="Primary navigation"]',
      ],
      commonAuthType: 'none',
      language: 'en',
    },
    lastUpdated: Date.now(),
  },
  {
    name: 'eu_gov',
    domains: [
      'ec.europa.eu',
      'europa.eu',
      'europarl.europa.eu',
    ],
    sharedPatterns: {
      cookieBannerSelectors: [
        '#cookie-consent-banner .accept',
        '.cck-actions-accept',
        '[data-ecl-cookie-consent-accept]',
      ],
      contentSelectors: [
        '.ecl-page-body',
        'main.ecl-container',
        '#main-content',
        'article.ecl-article',
      ],
      navigationSelectors: [
        '.ecl-menu',
        '.ecl-navigation-menu',
      ],
      commonAuthType: 'none',
      language: 'en',
    },
    lastUpdated: Date.now(),
  },
];

/** Serialized format of the learning engine data */
interface LearningEngineData {
  entries: { [domain: string]: EnhancedKnowledgeBaseEntry };
  learningEvents: LearningEvent[];
  lastSaved: number;
}

export class LearningEngine {
  private entries: Map<string, EnhancedKnowledgeBaseEntry> = new Map();
  private domainGroups: Map<string, DomainGroup> = new Map();
  private learningEvents: LearningEvent[] = [];
  private store: PersistentStore<LearningEngineData>;
  private decayConfig: ConfidenceDecayConfig;

  constructor(
    filePath: string = './enhanced-knowledge-base.json',
    decayConfig: ConfidenceDecayConfig = DEFAULT_DECAY_CONFIG
  ) {
    this.store = new PersistentStore<LearningEngineData>(filePath, {
      componentName: 'LearningEngine',
      debounceMs: 1000, // Batch rapid writes
    });
    this.decayConfig = decayConfig;

    // Initialize domain groups
    for (const group of DOMAIN_GROUPS) {
      this.domainGroups.set(group.name, group);
    }
  }

  async initialize(): Promise<void> {
    await this.load();
    // Apply confidence decay on startup
    this.applyConfidenceDecay();
  }

  // ============================================
  // TEMPORAL CONFIDENCE DECAY
  // ============================================

  /**
   * Apply confidence decay to all patterns based on time since last verification
   */
  applyConfidenceDecay(): void {
    const now = Date.now();
    const gracePeriodMs = this.decayConfig.gracePeriodDays * 24 * 60 * 60 * 1000;
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    for (const [domain, entry] of this.entries) {
      let updated = false;

      for (const pattern of entry.apiPatterns) {
        const timeSinceVerified = now - pattern.lastVerified;

        // Skip if within grace period
        if (timeSinceVerified <= gracePeriodMs) {
          continue;
        }

        // Calculate decay
        const weeksOverdue = (timeSinceVerified - gracePeriodMs) / weekMs;
        const decayAmount = weeksOverdue * this.decayConfig.decayRatePerWeek;

        // Apply decay to confidence
        const oldConfidence = this.confidenceToNumber(pattern.confidence);
        const newConfidence = Math.max(
          this.decayConfig.minConfidenceThreshold,
          oldConfidence - decayAmount
        );

        const newConfidenceLevel = this.numberToConfidence(newConfidence);

        if (pattern.confidence !== newConfidenceLevel) {
          pattern.confidence = newConfidenceLevel;
          pattern.canBypass = newConfidenceLevel === 'high';
          updated = true;

          this.recordLearningEvent({
            type: 'confidence_decayed',
            domain,
            details: {
              endpoint: pattern.endpoint,
              oldConfidence: pattern.confidence,
              newConfidence: newConfidenceLevel,
              daysSinceVerified: Math.floor(timeSinceVerified / (24 * 60 * 60 * 1000)),
            },
            timestamp: now,
          });
        }
      }

      if (updated) {
        entry.lastUpdated = now;
      }
    }

    this.save();
  }

  private confidenceToNumber(confidence: 'high' | 'medium' | 'low'): number {
    switch (confidence) {
      case 'high': return 1.0;
      case 'medium': return 0.6;
      case 'low': return 0.3;
    }
  }

  private numberToConfidence(value: number): 'high' | 'medium' | 'low' {
    if (value >= 0.8) return 'high';
    if (value >= 0.5) return 'medium';
    return 'low';
  }

  // ============================================
  // CONTENT STRUCTURE LEARNING (SELECTORS)
  // ============================================

  /**
   * Learn a successful selector for a content type
   */
  learnSelector(
    domain: string,
    selector: string,
    contentType: SelectorPattern['contentType'],
    urlPattern?: string
  ): void {
    const entry = this.getOrCreateEntry(domain);
    const now = Date.now();

    // Find existing chain for this content type
    let chain = entry.selectorChains.find(c => c.contentType === contentType);
    if (!chain) {
      chain = { contentType, selectors: [], domain };
      entry.selectorChains.push(chain);
    }

    // Find or create selector pattern
    let selectorPattern = chain.selectors.find(s => s.selector === selector);
    if (selectorPattern) {
      // Update existing
      selectorPattern.successCount++;
      selectorPattern.lastWorked = now;
      // Boost priority on success
      selectorPattern.priority = Math.min(100, selectorPattern.priority + 1);
    } else {
      // Create new
      selectorPattern = {
        selector,
        contentType,
        priority: 50, // Start in middle
        successCount: 1,
        failureCount: 0,
        lastWorked: now,
        domain,
        urlPattern,
      };
      chain.selectors.push(selectorPattern);
    }

    // Sort selectors by priority (descending)
    chain.selectors.sort((a, b) => b.priority - a.priority);

    entry.lastUpdated = now;
    this.save();

    this.recordLearningEvent({
      type: 'selector_learned',
      domain,
      details: { selector, contentType, urlPattern },
      timestamp: now,
    });
  }

  /**
   * Record a selector failure
   */
  recordSelectorFailure(domain: string, selector: string, contentType: SelectorPattern['contentType']): void {
    const entry = this.entries.get(domain);
    if (!entry) return;

    const chain = entry.selectorChains.find(c => c.contentType === contentType);
    if (!chain) return;

    const selectorPattern = chain.selectors.find(s => s.selector === selector);
    if (selectorPattern) {
      selectorPattern.failureCount++;
      selectorPattern.lastFailed = Date.now();
      // Reduce priority on failure
      selectorPattern.priority = Math.max(0, selectorPattern.priority - 5);

      // Re-sort
      chain.selectors.sort((a, b) => b.priority - a.priority);
      this.save();
    }
  }

  /**
   * Get the best selector chain for a content type
   */
  getSelectorChain(domain: string, contentType: SelectorPattern['contentType']): string[] {
    // First check domain-specific selectors
    const entry = this.entries.get(domain);
    if (entry) {
      const chain = entry.selectorChains.find(c => c.contentType === contentType);
      if (chain && chain.selectors.length > 0) {
        return chain.selectors.map(s => s.selector);
      }
    }

    // Fall back to domain group selectors
    const group = this.getDomainGroup(domain);
    if (group) {
      if (contentType === 'main_content') {
        return group.sharedPatterns.contentSelectors;
      }
      // Add more mappings as needed
    }

    return [];
  }

  // ============================================
  // FAILURE CONTEXT LEARNING
  // ============================================

  /**
   * Record a failure with context for learning
   */
  recordFailure(
    domain: string,
    failure: Omit<FailureContext, 'timestamp'>
  ): void {
    const entry = this.getOrCreateEntry(domain);
    const now = Date.now();

    const fullFailure: FailureContext = {
      ...failure,
      timestamp: now,
    };

    // Keep only recent failures (last 20)
    entry.recentFailures.unshift(fullFailure);
    if (entry.recentFailures.length > 20) {
      entry.recentFailures = entry.recentFailures.slice(0, 20);
    }

    // Update success rate
    entry.overallSuccessRate = Math.max(0, entry.overallSuccessRate - 0.05);

    entry.lastUpdated = now;
    this.save();

    this.recordLearningEvent({
      type: 'failure_recorded',
      domain,
      details: failure,
      timestamp: now,
    });
  }

  /**
   * Record a successful fetch with details about what worked
   * This builds the success profile for a domain
   */
  recordSuccess(
    domain: string,
    details: {
      tier: 'intelligence' | 'lightweight' | 'playwright';
      strategy?: string;
      responseTime: number;
      contentLength: number;
      hasStructuredData?: boolean;
      hasFrameworkData?: boolean;
      hasBypassableApis?: boolean;
    }
  ): void {
    const entry = this.getOrCreateEntry(domain);
    const now = Date.now();

    // Initialize or update success profile
    if (!entry.successProfile) {
      entry.successProfile = {
        preferredTier: details.tier,
        preferredStrategy: details.strategy,
        avgResponseTime: details.responseTime,
        avgContentLength: details.contentLength,
        successCount: 1,
        lastSuccess: now,
        hasStructuredData: details.hasStructuredData ?? false,
        hasFrameworkData: details.hasFrameworkData ?? false,
        hasBypassableApis: details.hasBypassableApis ?? false,
      };
    } else {
      const profile = entry.successProfile;

      // Update averages with exponential moving average (weight recent results more)
      const alpha = 0.3; // Weight for new values
      profile.avgResponseTime = alpha * details.responseTime + (1 - alpha) * profile.avgResponseTime;
      profile.avgContentLength = alpha * details.contentLength + (1 - alpha) * profile.avgContentLength;

      // Update preferred tier if this one is faster/better
      // Prefer faster tiers (intelligence > lightweight > playwright)
      const tierRanks = { intelligence: 1, lightweight: 2, playwright: 3 };
      if (tierRanks[details.tier] < tierRanks[profile.preferredTier]) {
        profile.preferredTier = details.tier;
        profile.preferredStrategy = details.strategy;
        logger.learning.debug(`Updated preferred tier for ${domain} to ${details.tier}`);
      } else if (details.tier === profile.preferredTier && details.strategy) {
        // Same tier, update strategy if provided
        profile.preferredStrategy = details.strategy;
      }

      // Update content characteristics (OR them - if we ever saw it, note it)
      profile.hasStructuredData = profile.hasStructuredData || (details.hasStructuredData ?? false);
      profile.hasFrameworkData = profile.hasFrameworkData || (details.hasFrameworkData ?? false);
      profile.hasBypassableApis = profile.hasBypassableApis || (details.hasBypassableApis ?? false);

      profile.successCount++;
      profile.lastSuccess = now;
    }

    // Boost overall success rate
    entry.overallSuccessRate = Math.min(1, entry.overallSuccessRate + 0.02);
    entry.lastUsed = now;
    entry.usageCount++;
    entry.lastUpdated = now;

    this.save();

    logger.learning.debug(`Recorded success for ${domain}`, {
      tier: details.tier,
      strategy: details.strategy,
      successCount: entry.successProfile?.successCount,
    });
  }

  /**
   * Get the success profile for a domain
   */
  getSuccessProfile(domain: string): SuccessProfile | null {
    const entry = this.entries.get(domain);
    return entry?.successProfile || null;
  }

  /**
   * Check if we should use the success profile for a domain
   * Returns the profile if it's reliable enough to use
   */
  getReliableSuccessProfile(domain: string): SuccessProfile | null {
    const profile = this.getSuccessProfile(domain);
    if (!profile) return null;

    // Require at least 3 successes and recent activity
    const minSuccesses = 3;
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (profile.successCount >= minSuccesses &&
        Date.now() - profile.lastSuccess < maxAge) {
      return profile;
    }

    return null;
  }

  /**
   * Classify an error into a failure type
   */
  classifyError(error: Error, responseStatus?: number): FailureContext['type'] {
    const message = error.message.toLowerCase();

    if (responseStatus) {
      if (responseStatus === 401 || responseStatus === 403) {
        return 'auth_expired';
      }
      if (responseStatus === 404) {
        return 'not_found';
      }
      if (responseStatus === 429) {
        return 'rate_limited';
      }
      if (responseStatus >= 500) {
        return 'server_error';
      }
    }

    if (message.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('blocked') || message.includes('captcha') || message.includes('cloudflare')) {
      return 'blocked';
    }
    if (message.includes('not found') || message.includes('404')) {
      return 'not_found';
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'rate_limited';
    }

    return 'unknown';
  }

  /**
   * Get failure patterns for a domain
   */
  getFailurePatterns(domain: string): {
    mostCommonType: FailureContext['type'] | null;
    recentFailureRate: number;
    shouldBackoff: boolean;
  } {
    const entry = this.entries.get(domain);
    if (!entry || entry.recentFailures.length === 0) {
      return { mostCommonType: null, recentFailureRate: 0, shouldBackoff: false };
    }

    // Count failure types
    const typeCounts = new Map<FailureContext['type'], number>();
    for (const failure of entry.recentFailures) {
      typeCounts.set(failure.type, (typeCounts.get(failure.type) || 0) + 1);
    }

    // Find most common
    let mostCommonType: FailureContext['type'] | null = null;
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonType = type;
      }
    }

    // Calculate recent failure rate (last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentFailures = entry.recentFailures.filter(f => f.timestamp > oneHourAgo);
    const recentFailureRate = recentFailures.length / entry.usageCount;

    // Should back off if too many rate limit or blocked errors
    const shouldBackoff =
      mostCommonType === 'rate_limited' ||
      mostCommonType === 'blocked' ||
      recentFailureRate > 0.5;

    return { mostCommonType, recentFailureRate, shouldBackoff };
  }

  // ============================================
  // CONTENT CHANGE FREQUENCY LEARNING
  // ============================================

  /**
   * Record a content check and whether it changed
   */
  recordContentCheck(
    domain: string,
    urlPattern: string,
    content: string,
    changed: boolean
  ): void {
    const entry = this.getOrCreateEntry(domain);
    const now = Date.now();
    const contentHash = this.hashContent(content);

    // Find or create refresh pattern
    let pattern = entry.refreshPatterns.find(p => p.urlPattern === urlPattern);

    if (!pattern) {
      pattern = {
        urlPattern,
        domain,
        avgChangeFrequencyHours: 24, // Default to daily
        minChangeFrequencyHours: 24,
        maxChangeFrequencyHours: 24,
        sampleCount: 0,
        lastChecked: now,
        lastChanged: now,
        contentHash,
      };
      entry.refreshPatterns.push(pattern);
    }

    const hoursSinceLastCheck = (now - pattern.lastChecked) / (60 * 60 * 1000);

    if (changed) {
      // Update change frequency statistics
      if (pattern.sampleCount > 0) {
        const hoursSinceChange = (now - pattern.lastChanged) / (60 * 60 * 1000);

        // Running average
        pattern.avgChangeFrequencyHours =
          (pattern.avgChangeFrequencyHours * pattern.sampleCount + hoursSinceChange) /
          (pattern.sampleCount + 1);

        pattern.minChangeFrequencyHours = Math.min(pattern.minChangeFrequencyHours, hoursSinceChange);
        pattern.maxChangeFrequencyHours = Math.max(pattern.maxChangeFrequencyHours, hoursSinceChange);
      }

      pattern.lastChanged = now;
      pattern.contentHash = contentHash;
      pattern.sampleCount++;
    }

    pattern.lastChecked = now;
    entry.lastUpdated = now;
    this.save();
  }

  /**
   * Get recommended refresh interval for a URL pattern
   */
  getRecommendedRefreshInterval(domain: string, urlPattern: string): number {
    const entry = this.entries.get(domain);
    if (!entry) {
      return 24; // Default to daily
    }

    const pattern = entry.refreshPatterns.find(p => p.urlPattern === urlPattern);
    if (!pattern || pattern.sampleCount < 3) {
      return 24; // Not enough data, default to daily
    }

    // Recommend checking slightly more frequently than average change rate
    return Math.max(1, pattern.avgChangeFrequencyHours * 0.8);
  }

  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  // ============================================
  // CROSS-DOMAIN PATTERN TRANSFER
  // ============================================

  /**
   * Get the domain group for a domain
   */
  getDomainGroup(domain: string): DomainGroup | null {
    for (const group of this.domainGroups.values()) {
      if (group.domains.some(d => domain.includes(d) || d.includes(domain))) {
        return group;
      }
    }
    return null;
  }

  /**
   * Transfer learned patterns from one domain to another in the same group
   */
  transferPatterns(fromDomain: string, toDomain: string): boolean {
    const fromGroup = this.getDomainGroup(fromDomain);
    const toGroup = this.getDomainGroup(toDomain);

    // Only transfer if same group
    if (!fromGroup || !toGroup || fromGroup.name !== toGroup.name) {
      return false;
    }

    const fromEntry = this.entries.get(fromDomain);
    if (!fromEntry) {
      return false;
    }

    const toEntry = this.getOrCreateEntry(toDomain);

    // Transfer high-confidence selector chains
    for (const chain of fromEntry.selectorChains) {
      const highConfidenceSelectors = chain.selectors.filter(
        s => s.successCount > 3 && s.failureCount < s.successCount * 0.2
      );

      if (highConfidenceSelectors.length > 0) {
        // Add to target with reduced priority
        let targetChain = toEntry.selectorChains.find(c => c.contentType === chain.contentType);
        if (!targetChain) {
          targetChain = { contentType: chain.contentType, selectors: [], domain: toDomain };
          toEntry.selectorChains.push(targetChain);
        }

        for (const selector of highConfidenceSelectors) {
          if (!targetChain.selectors.find(s => s.selector === selector.selector)) {
            targetChain.selectors.push({
              ...selector,
              domain: toDomain,
              priority: selector.priority * 0.5, // Reduce priority for transferred patterns
              successCount: 0,
              failureCount: 0,
              lastWorked: 0,
            });
          }
        }
      }
    }

    // Transfer validators
    for (const validator of fromEntry.validators) {
      if (validator.successCount > 5) {
        if (!toEntry.validators.find(v => v.mustContainAll?.join() === validator.mustContainAll?.join())) {
          toEntry.validators.push({
            ...validator,
            domain: toDomain,
            successCount: 0,
            failureCount: 0,
          });
        }
      }
    }

    toEntry.domainGroup = fromGroup.name;
    toEntry.lastUpdated = Date.now();
    this.save();

    return true;
  }

  /**
   * Get shared patterns for a domain's group
   */
  getSharedPatterns(domain: string): DomainGroup['sharedPatterns'] | null {
    const group = this.getDomainGroup(domain);
    return group?.sharedPatterns || null;
  }

  // ============================================
  // RESPONSE VALIDATION LEARNING
  // ============================================

  /**
   * Learn validation rules from successful responses
   */
  learnValidator(
    domain: string,
    content: string,
    urlPattern?: string
  ): void {
    const entry = this.getOrCreateEntry(domain);
    const now = Date.now();

    // Extract common terms from content
    const words = content.toLowerCase().split(/\s+/);
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      if (word.length > 4) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    // Find high-frequency meaningful words
    const commonWords = Array.from(wordFreq.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    // Find or update validator
    let validator = entry.validators.find(v => v.urlPattern === urlPattern);

    if (!validator) {
      validator = {
        domain,
        urlPattern,
        expectedMinLength: Math.floor(content.length * 0.5), // Allow 50% variation
        expectedMaxLength: Math.floor(content.length * 2),
        mustContainAny: commonWords.slice(0, 5),
        mustNotContain: [
          'error',
          '404',
          'not found',
          'page not found',
          'access denied',
          'forbidden',
          'maintenance',
          'mantenimiento',
          'unavailable',
        ],
        successCount: 1,
        failureCount: 0,
      };
      entry.validators.push(validator);
    } else {
      validator.successCount++;
      // Update expected length range
      validator.expectedMinLength = Math.min(validator.expectedMinLength, Math.floor(content.length * 0.5));
      validator.expectedMaxLength = Math.max(validator.expectedMaxLength || content.length * 2, content.length * 1.5);
    }

    entry.lastUpdated = now;
    this.save();

    this.recordLearningEvent({
      type: 'validator_created',
      domain,
      details: { urlPattern, contentLength: content.length },
      timestamp: now,
    });
  }

  /**
   * Validate content against learned rules
   */
  validateContent(
    domain: string,
    content: string,
    urlPattern?: string
  ): { valid: boolean; reasons: string[] } {
    const entry = this.entries.get(domain);
    const reasons: string[] = [];

    if (!entry || entry.validators.length === 0) {
      return { valid: true, reasons: [] }; // No validators = assume valid
    }

    // Find matching validator
    const validator = entry.validators.find(v =>
      !v.urlPattern || (urlPattern && new RegExp(v.urlPattern).test(urlPattern))
    );

    if (!validator) {
      return { valid: true, reasons: [] };
    }

    const contentLower = content.toLowerCase();

    // Check length
    if (content.length < validator.expectedMinLength) {
      reasons.push(`Content too short (${content.length} < ${validator.expectedMinLength})`);
    }
    if (validator.expectedMaxLength && content.length > validator.expectedMaxLength) {
      reasons.push(`Content too long (${content.length} > ${validator.expectedMaxLength})`);
    }

    // Check must not contain (error indicators)
    for (const term of validator.mustNotContain) {
      if (contentLower.includes(term.toLowerCase())) {
        reasons.push(`Contains error indicator: "${term}"`);
      }
    }

    // Check must contain any
    if (validator.mustContainAny && validator.mustContainAny.length > 0) {
      const hasAny = validator.mustContainAny.some(term =>
        contentLower.includes(term.toLowerCase())
      );
      if (!hasAny) {
        reasons.push(`Missing expected terms: ${validator.mustContainAny.join(', ')}`);
      }
    }

    // Check must contain all
    if (validator.mustContainAll && validator.mustContainAll.length > 0) {
      const missing = validator.mustContainAll.filter(term =>
        !contentLower.includes(term.toLowerCase())
      );
      if (missing.length > 0) {
        reasons.push(`Missing required terms: ${missing.join(', ')}`);
      }
    }

    const valid = reasons.length === 0;

    // Update validator stats
    if (valid) {
      validator.successCount++;
    } else {
      validator.failureCount++;
    }
    this.save();

    return { valid, reasons };
  }

  /**
   * Universal content anomaly detection - works without prior learning
   * Detects challenge pages, errors, and suspicious content patterns
   */
  detectContentAnomalies(
    content: string,
    url: string,
    expectedTopic?: string
  ): {
    isAnomaly: boolean;
    anomalyType?: 'challenge_page' | 'error_page' | 'empty_content' | 'redirect_notice' | 'captcha' | 'rate_limited';
    confidence: number;
    reasons: string[];
    suggestedAction?: 'wait' | 'retry' | 'use_session' | 'change_agent' | 'skip';
    waitTimeMs?: number;
  } {
    const contentLower = content.toLowerCase();
    const reasons: string[] = [];
    let confidence = 0;

    // ============================================
    // CHALLENGE PAGE DETECTION
    // ============================================
    const challengeIndicators = [
      { pattern: /checking your browser/i, weight: 0.9, type: 'challenge_page' as const },
      { pattern: /please wait/i, weight: 0.4, type: 'challenge_page' as const },
      { pattern: /just a moment/i, weight: 0.7, type: 'challenge_page' as const },
      { pattern: /ddos protection/i, weight: 0.9, type: 'challenge_page' as const },
      { pattern: /cloudflare/i, weight: 0.6, type: 'challenge_page' as const },
      { pattern: /verifying you are human/i, weight: 0.9, type: 'captcha' as const },
      { pattern: /please verify/i, weight: 0.5, type: 'captcha' as const },
      { pattern: /security check/i, weight: 0.6, type: 'challenge_page' as const },
      { pattern: /voight-kampff/i, weight: 0.95, type: 'challenge_page' as const },
      { pattern: /browser check/i, weight: 0.8, type: 'challenge_page' as const },
      { pattern: /you'll be redirected/i, weight: 0.7, type: 'redirect_notice' as const },
      { pattern: /access denied/i, weight: 0.8, type: 'rate_limited' as const },
      { pattern: /rate limit/i, weight: 0.9, type: 'rate_limited' as const },
      { pattern: /too many requests/i, weight: 0.9, type: 'rate_limited' as const },
      { pattern: /temporarily unavailable/i, weight: 0.6, type: 'rate_limited' as const },
    ];

    let maxChallengeWeight = 0;
    let detectedType: 'challenge_page' | 'error_page' | 'empty_content' | 'redirect_notice' | 'captcha' | 'rate_limited' | undefined;

    for (const indicator of challengeIndicators) {
      if (indicator.pattern.test(contentLower)) {
        if (indicator.weight > maxChallengeWeight) {
          maxChallengeWeight = indicator.weight;
          detectedType = indicator.type;
        }
        reasons.push(`Detected: ${indicator.pattern.source}`);
      }
    }

    if (maxChallengeWeight > 0.5) {
      confidence = maxChallengeWeight;
    }

    // ============================================
    // ERROR PAGE DETECTION
    // ============================================
    const errorIndicators = [
      { pattern: /error 404/i, weight: 0.95, type: 'error_page' as const },
      { pattern: /page not found/i, weight: 0.9, type: 'error_page' as const },
      { pattern: /not found/i, weight: 0.4, type: 'error_page' as const },
      { pattern: /error 500/i, weight: 0.95, type: 'error_page' as const },
      { pattern: /internal server error/i, weight: 0.95, type: 'error_page' as const },
      { pattern: /error 403/i, weight: 0.9, type: 'error_page' as const },
      { pattern: /forbidden/i, weight: 0.6, type: 'error_page' as const },
      { pattern: /no existe/i, weight: 0.7, type: 'error_page' as const }, // Spanish
      { pattern: /p.gina no encontrada/i, weight: 0.9, type: 'error_page' as const }, // Spanish 404
    ];

    for (const indicator of errorIndicators) {
      if (indicator.pattern.test(contentLower)) {
        if (indicator.weight > confidence) {
          confidence = indicator.weight;
          detectedType = indicator.type;
        }
        reasons.push(`Error indicator: ${indicator.pattern.source}`);
      }
    }

    // ============================================
    // CONTENT LENGTH ANALYSIS
    // ============================================
    // Very short content is suspicious (unless it's a known short page)
    if (content.length < 200) {
      confidence = Math.max(confidence, 0.8);
      detectedType = detectedType || 'empty_content';
      reasons.push(`Suspiciously short content: ${content.length} chars`);
    } else if (content.length < 500) {
      confidence = Math.max(confidence, 0.5);
      reasons.push(`Short content: ${content.length} chars`);
    }

    // ============================================
    // STRUCTURAL ANALYSIS
    // ============================================
    // Real content pages typically have paragraphs, lists, or structured content
    const hasParagraphs = /<p[^>]*>[\s\S]{50,}<\/p>/i.test(content) || content.split(/\n\n/).length > 3;
    const hasLists = /<(ul|ol)[^>]*>/i.test(content);
    const hasHeadings = /<h[1-6][^>]*>/i.test(content);
    const hasStructure = hasParagraphs || hasLists || hasHeadings;

    if (!hasStructure && content.length < 1000) {
      confidence = Math.max(confidence, 0.6);
      detectedType = detectedType || 'empty_content';
      reasons.push('Lacks typical page structure (no paragraphs, lists, or headings)');
    }

    // ============================================
    // TOPIC RELEVANCE (if expected topic provided)
    // ============================================
    if (expectedTopic) {
      const topicTerms = expectedTopic.toLowerCase().split(/[._-]/).filter(t => t.length > 2);
      const matchedTerms = topicTerms.filter(term => contentLower.includes(term));
      const matchRatio = matchedTerms.length / topicTerms.length;

      if (matchRatio < 0.2 && content.length > 100) {
        confidence = Math.max(confidence, 0.5);
        reasons.push(`Content doesn't match expected topic "${expectedTopic}" (${Math.round(matchRatio * 100)}% term match)`);
      }
    }

    // ============================================
    // DETERMINE SUGGESTED ACTION
    // ============================================
    let suggestedAction: 'wait' | 'retry' | 'use_session' | 'change_agent' | 'skip' | undefined;
    let waitTimeMs: number | undefined;

    if (detectedType === 'challenge_page' || detectedType === 'redirect_notice') {
      suggestedAction = 'wait';
      waitTimeMs = 10000; // Wait 10 seconds for challenge to complete
    } else if (detectedType === 'captcha') {
      suggestedAction = 'use_session'; // Need human to solve captcha and save session
    } else if (detectedType === 'rate_limited') {
      suggestedAction = 'wait';
      waitTimeMs = 60000; // Wait 1 minute for rate limit
    } else if (detectedType === 'error_page') {
      suggestedAction = 'skip'; // Page doesn't exist, no point retrying
    } else if (detectedType === 'empty_content') {
      suggestedAction = 'retry'; // Might be a loading issue
    }

    return {
      isAnomaly: confidence > 0.5,
      anomalyType: detectedType,
      confidence,
      reasons,
      suggestedAction,
      waitTimeMs,
    };
  }

  // ============================================
  // PAGINATION PATTERN LEARNING
  // ============================================

  /**
   * Learn pagination pattern from URL and page content
   */
  learnPaginationPattern(
    domain: string,
    urls: string[],
    pattern: Partial<PaginationPattern>
  ): void {
    if (urls.length < 2) return;

    const entry = this.getOrCreateEntry(domain);
    const now = Date.now();

    // Detect pagination type from URLs
    const detectedPattern = this.detectPaginationFromUrls(urls);
    const finalPattern: PaginationPattern = {
      type: pattern.type || detectedPattern.type || 'query_param',
      paramName: pattern.paramName || detectedPattern.paramName,
      startValue: pattern.startValue || detectedPattern.startValue || 1,
      increment: pattern.increment || detectedPattern.increment || 1,
      selector: pattern.selector,
      itemsPerPage: pattern.itemsPerPage,
      maxPages: pattern.maxPages,
      hasMoreIndicator: pattern.hasMoreIndicator,
    };

    // Store by URL pattern
    const urlBase = this.extractUrlBase(urls[0]);
    const paginationPatterns = entry.paginationPatterns as Record<string, PaginationPattern>;
    paginationPatterns[urlBase] = finalPattern;

    entry.lastUpdated = now;
    this.save();

    this.recordLearningEvent({
      type: 'pagination_detected',
      domain,
      details: { urlBase, pattern: finalPattern },
      timestamp: now,
    });
  }

  private detectPaginationFromUrls(urls: string[]): Partial<PaginationPattern> {
    // Compare URLs to find pagination parameter
    const parsedUrls = urls.map(u => new URL(u));

    // Check query params
    const allParams = new Set<string>();
    for (const url of parsedUrls) {
      for (const key of url.searchParams.keys()) {
        allParams.add(key);
      }
    }

    // Find param that changes between pages
    for (const param of ['page', 'p', 'offset', 'start', 'cursor', 'after']) {
      if (allParams.has(param)) {
        const values = parsedUrls.map(u => u.searchParams.get(param)).filter(Boolean);
        if (new Set(values).size > 1) {
          const numValues = values.map(v => parseInt(v!, 10)).filter(n => !isNaN(n));
          if (numValues.length >= 2) {
            const increment = numValues[1] - numValues[0];
            return {
              type: 'query_param',
              paramName: param,
              startValue: numValues[0],
              increment: increment > 0 ? increment : 1,
            };
          }
        }
      }
    }

    // Check path segments
    const pathSegments = parsedUrls.map(u => u.pathname.split('/').filter(Boolean));
    if (pathSegments.length >= 2) {
      const len = Math.min(...pathSegments.map(s => s.length));
      for (let i = 0; i < len; i++) {
        const values = pathSegments.map(s => s[i]);
        const numValues = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        if (numValues.length >= 2 && new Set(numValues).size > 1) {
          return {
            type: 'path_segment',
            startValue: numValues[0],
            increment: numValues[1] - numValues[0],
          };
        }
      }
    }

    return { type: 'next_button' }; // Default fallback
  }

  private extractUrlBase(url: string): string {
    const parsed = new URL(url);
    // Remove common pagination params
    const params = new URLSearchParams(parsed.search);
    for (const param of ['page', 'p', 'offset', 'start', 'cursor', 'after']) {
      params.delete(param);
    }
    return parsed.origin + parsed.pathname + (params.toString() ? '?' + params.toString() : '');
  }

  /**
   * Get pagination pattern for a URL
   */
  getPaginationPattern(domain: string, url: string): PaginationPattern | null {
    const entry = this.entries.get(domain);
    if (!entry) return null;

    const urlBase = this.extractUrlBase(url);
    const paginationPatterns = entry.paginationPatterns as Record<string, PaginationPattern>;
    return paginationPatterns[urlBase] || null;
  }

  // ============================================
  // API PATTERN ENHANCEMENT
  // ============================================

  /**
   * Learn or update an API pattern with enhanced tracking
   */
  learnApiPattern(domain: string, pattern: ApiPattern): void {
    const entry = this.getOrCreateEntry(domain);
    const now = Date.now();

    // Find existing or create enhanced pattern
    const existingIndex = entry.apiPatterns.findIndex(
      p => p.endpoint === pattern.endpoint && p.method === pattern.method
    );

    if (existingIndex >= 0) {
      // Update existing
      const existing = entry.apiPatterns[existingIndex];
      existing.lastVerified = now;
      existing.verificationCount++;
      existing.confidence = pattern.confidence;
      existing.canBypass = pattern.canBypass;
    } else {
      // Create new enhanced pattern
      const enhanced: EnhancedApiPattern = {
        ...pattern,
        createdAt: now,
        lastVerified: now,
        verificationCount: 1,
        failureCount: 0,
      };
      entry.apiPatterns.push(enhanced);
    }

    entry.usageCount++;
    entry.lastUpdated = now;
    entry.lastUsed = now;
    this.save();

    this.recordLearningEvent({
      type: 'api_discovered',
      domain,
      details: { endpoint: pattern.endpoint, method: pattern.method },
      timestamp: now,
    });
  }

  /**
   * Record API pattern verification success
   */
  verifyApiPattern(domain: string, endpoint: string, method: string): void {
    const entry = this.entries.get(domain);
    if (!entry) return;

    const pattern = entry.apiPatterns.find(
      p => p.endpoint === endpoint && p.method === method
    );

    if (pattern) {
      pattern.lastVerified = Date.now();
      pattern.verificationCount++;
      entry.overallSuccessRate = Math.min(1, entry.overallSuccessRate + 0.02);

      this.recordLearningEvent({
        type: 'pattern_verified',
        domain,
        details: { endpoint, method },
        timestamp: Date.now(),
      });

      this.save();
    }
  }

  /**
   * Record API pattern failure
   */
  recordApiPatternFailure(
    domain: string,
    endpoint: string,
    method: string,
    failure: Omit<FailureContext, 'timestamp'>
  ): void {
    const entry = this.entries.get(domain);
    if (!entry) return;

    const pattern = entry.apiPatterns.find(
      p => p.endpoint === endpoint && p.method === method
    );

    if (pattern) {
      pattern.failureCount++;
      pattern.lastFailure = { ...failure, timestamp: Date.now() };

      // Downgrade confidence after multiple failures
      if (pattern.failureCount >= 3 && pattern.confidence === 'high') {
        pattern.confidence = 'medium';
        pattern.canBypass = false;
      } else if (pattern.failureCount >= 5 && pattern.confidence === 'medium') {
        pattern.confidence = 'low';
      }

      this.save();
    }

    // Also record in general failure history
    this.recordFailure(domain, failure);
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private getOrCreateEntry(domain: string): EnhancedKnowledgeBaseEntry {
    let entry = this.entries.get(domain);
    if (!entry) {
      const now = Date.now();
      entry = {
        domain,
        apiPatterns: [],
        selectorChains: [],
        refreshPatterns: [],
        validators: [],
        paginationPatterns: {},
        recentFailures: [],
        lastUsed: now,
        usageCount: 0,
        overallSuccessRate: 1.0,
        createdAt: now,
        lastUpdated: now,
      };

      // Check for domain group and transfer patterns
      const group = this.getDomainGroup(domain);
      if (group) {
        entry.domainGroup = group.name;
        // Initialize with shared patterns
        const shared = group.sharedPatterns;
        if (shared.contentSelectors.length > 0) {
          entry.selectorChains.push({
            contentType: 'main_content',
            domain,
            selectors: shared.contentSelectors.map((selector, i) => ({
              selector,
              contentType: 'main_content' as const,
              priority: 50 - i, // Descending priority
              successCount: 0,
              failureCount: 0,
              lastWorked: 0,
              domain,
            })),
          });
        }
      }

      this.entries.set(domain, entry);
    }
    return entry;
  }

  private recordLearningEvent(event: LearningEvent): void {
    this.learningEvents.push(event);
    // Keep only last 100 events
    if (this.learningEvents.length > 100) {
      this.learningEvents = this.learningEvents.slice(-100);
    }
  }

  /**
   * Get knowledge base statistics
   */
  getStats(): {
    totalDomains: number;
    totalApiPatterns: number;
    totalSelectors: number;
    totalValidators: number;
    bypassablePatterns: number;
    domainGroups: string[];
    recentLearningEvents: LearningEvent[];
  } {
    let totalApiPatterns = 0;
    let totalSelectors = 0;
    let totalValidators = 0;
    let bypassablePatterns = 0;

    for (const entry of this.entries.values()) {
      totalApiPatterns += entry.apiPatterns.length;
      bypassablePatterns += entry.apiPatterns.filter(p => p.canBypass).length;

      for (const chain of entry.selectorChains) {
        totalSelectors += chain.selectors.length;
      }

      totalValidators += entry.validators.length;
    }

    return {
      totalDomains: this.entries.size,
      totalApiPatterns,
      totalSelectors,
      totalValidators,
      bypassablePatterns,
      domainGroups: Array.from(this.domainGroups.keys()),
      recentLearningEvents: this.learningEvents.slice(-10),
    };
  }

  /**
   * Get entry for a domain
   */
  getEntry(domain: string): EnhancedKnowledgeBaseEntry | null {
    return this.entries.get(domain) || null;
  }

  // ============================================
  // KNOWLEDGEBASE COMPATIBILITY METHODS
  // ============================================

  /**
   * Get all API patterns for a domain
   * (KnowledgeBase compatibility method)
   */
  getPatterns(domain: string): EnhancedApiPattern[] {
    const entry = this.entries.get(domain);
    return entry?.apiPatterns || [];
  }

  /**
   * Get high-confidence patterns that can bypass browser
   * (KnowledgeBase compatibility method)
   */
  getBypassablePatterns(domain: string): EnhancedApiPattern[] {
    const patterns = this.getPatterns(domain);
    return patterns.filter(p => p.canBypass && p.confidence === 'high');
  }

  /**
   * Find a pattern matching a URL
   * (KnowledgeBase compatibility method)
   */
  findPattern(url: string): EnhancedApiPattern | null {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const pathname = urlObj.pathname;

      const entry = this.entries.get(domain);
      if (!entry) {
        return null;
      }

      let partialMatch: EnhancedApiPattern | null = null;

      for (const p of entry.apiPatterns) {
        try {
          const patternUrl = new URL(p.endpoint);
          if (patternUrl.pathname === pathname) {
            // Exact match found, this is the best possible match.
            return p;
          }
          // If we haven't found a partial match yet, check for one.
          if (!partialMatch && pathname.startsWith(patternUrl.pathname)) {
            partialMatch = p;
          }
        } catch {
          // Ignore patterns with invalid endpoints.
        }
      }

      return partialMatch;
    } catch {
      return null;
    }
  }

  /**
   * Update success rate for a pattern
   * (KnowledgeBase compatibility method)
   */
  updateSuccessRate(domain: string, endpoint: string, success: boolean): void {
    const entry = this.entries.get(domain);
    if (!entry) return;

    const pattern = entry.apiPatterns.find(p => p.endpoint === endpoint);
    if (!pattern) return;

    // Update overall success rate
    const currentRate = entry.overallSuccessRate;
    entry.overallSuccessRate = success
      ? Math.min(1.0, currentRate + 0.1)
      : Math.max(0.0, currentRate - 0.2);

    // Lower confidence if success rate drops
    if (entry.overallSuccessRate < 0.6 && pattern.confidence === 'high') {
      pattern.confidence = 'medium';
      pattern.canBypass = false;
    }

    this.save();
  }

  /**
   * Clear all learned data
   * (KnowledgeBase compatibility method)
   */
  clear(): void {
    this.entries.clear();
    this.learningEvents = [];
    this.save();
  }

  /**
   * Alias for learnApiPattern to maintain KnowledgeBase compatibility
   * (KnowledgeBase used learn() method)
   */
  learn(domain: string, patterns: ApiPattern[]): void {
    for (const pattern of patterns) {
      this.learnApiPattern(domain, pattern);
    }
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  private async load(): Promise<void> {
    const data = await this.store.load();
    if (data) {
      // Convert entries from object to Map
      this.entries = new Map();
      if (data.entries) {
        for (const [domain, entry] of Object.entries(data.entries)) {
          this.entries.set(domain, entry as EnhancedKnowledgeBaseEntry);
        }
      }

      // Load learning events
      if (data.learningEvents) {
        this.learningEvents = data.learningEvents;
      }

      logger.learning.info('Loaded knowledge base', { totalDomains: this.entries.size });
    }

    // Attempt migration from old KnowledgeBase format
    await this.migrateFromLegacyKnowledgeBase();
  }

  /**
   * Migrate data from legacy knowledge-base.json to enhanced format
   * This is a one-time migration that preserves existing learned patterns
   */
  private async migrateFromLegacyKnowledgeBase(): Promise<void> {
    const legacyPath = './knowledge-base.json';
    const migratedMarker = '.knowledge-base-migrated';

    try {
      // Check if already migrated
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      const markerPath = path.resolve(migratedMarker);
      try {
        await fs.access(markerPath);
        // Marker exists, already migrated
        return;
      } catch {
        // Marker doesn't exist, continue with migration check
      }

      // Check if legacy file exists
      const resolvedLegacyPath = path.resolve(legacyPath);
      try {
        await fs.access(resolvedLegacyPath);
      } catch {
        // No legacy file, nothing to migrate
        return;
      }

      // Read legacy data
      const legacyContent = await fs.readFile(resolvedLegacyPath, 'utf-8');
      const legacyData = JSON.parse(legacyContent) as Record<string, {
        domain: string;
        patterns: ApiPattern[];
        lastUsed: number;
        usageCount: number;
        successRate: number;
      }>;

      let migratedCount = 0;
      const now = Date.now();

      for (const [domain, legacyEntry] of Object.entries(legacyData)) {
        // Check if we already have data for this domain
        const existingEntry = this.entries.get(domain);

        if (existingEntry) {
          // Merge patterns - add legacy patterns that don't exist
          for (const legacyPattern of legacyEntry.patterns) {
            const exists = existingEntry.apiPatterns.some(
              p => p.endpoint === legacyPattern.endpoint && p.method === legacyPattern.method
            );

            if (!exists) {
              // Convert to enhanced format
              const enhanced: EnhancedApiPattern = {
                ...legacyPattern,
                createdAt: now,
                lastVerified: legacyEntry.lastUsed ?? now,
                verificationCount: 1,
                failureCount: 0,
              };
              existingEntry.apiPatterns.push(enhanced);
              migratedCount++;
            }
          }
        } else {
          // Create new entry from legacy data
          const enhancedEntry: EnhancedKnowledgeBaseEntry = {
            domain,
            apiPatterns: legacyEntry.patterns.map(p => ({
              ...p,
              createdAt: now,
              lastVerified: legacyEntry.lastUsed ?? now,
              verificationCount: 1,
              failureCount: 0,
            })),
            selectorChains: [],
            refreshPatterns: [],
            validators: [],
            paginationPatterns: {},
            recentFailures: [],
            lastUsed: legacyEntry.lastUsed ?? now,
            usageCount: legacyEntry.usageCount || 0,
            overallSuccessRate: legacyEntry.successRate ?? 1.0,
            createdAt: now,
            lastUpdated: now,
          };

          // Check for domain group
          const group = this.getDomainGroup(domain);
          if (group) {
            enhancedEntry.domainGroup = group.name;
          }

          this.entries.set(domain, enhancedEntry);
          migratedCount += legacyEntry.patterns.length;
        }
      }

      if (migratedCount > 0) {
        // Save migrated data
        this.save();

        // Create migration marker
        await fs.writeFile(markerPath, JSON.stringify({
          migratedAt: new Date().toISOString(),
          patternsCount: migratedCount,
          domainsCount: Object.keys(legacyData).length,
        }), 'utf-8');

        logger.learning.info('Migrated legacy knowledge base', {
          domainsCount: Object.keys(legacyData).length,
          patternsCount: migratedCount,
        });

        this.recordLearningEvent({
          type: 'api_discovered',
          domain: 'system',
          details: {
            action: 'legacy_migration',
            domainsCount: Object.keys(legacyData).length,
            patternsCount: migratedCount,
          },
          timestamp: now,
        });
      }
    } catch (error) {
      // Migration is best-effort, don't fail initialization
      logger.learning.warn('Failed to migrate legacy knowledge base', { error });
    }
  }

  private save(): void {
    const data: LearningEngineData = {
      entries: Object.fromEntries(this.entries),
      learningEvents: this.learningEvents.slice(-100),
      lastSaved: Date.now(),
    };

    // Fire-and-forget save (debounced by PersistentStore)
    this.store.save(data).catch(error => {
      logger.learning.error('Failed to save knowledge base', { error });
    });
  }

  /**
   * Flush any pending writes to disk immediately
   */
  async flush(): Promise<void> {
    await this.store.flush();
  }

  /**
   * Export full knowledge base for debugging
   */
  async exportKnowledgeBase(): Promise<string> {
    return JSON.stringify(
      {
        entries: Object.fromEntries(this.entries),
        domainGroups: Array.from(this.domainGroups.values()),
        learningEvents: this.learningEvents,
        stats: this.getStats(),
      },
      null,
      2
    );
  }
}

// Default instance
export const learningEngine = new LearningEngine();
