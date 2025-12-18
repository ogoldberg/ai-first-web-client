/**
 * Comprehensive tests for LearningEngine
 *
 * These tests cover:
 * - Temporal confidence decay
 * - Content structure learning (selector patterns)
 * - Failure context learning
 * - Success profile tracking
 * - Content change frequency learning
 * - Cross-domain pattern transfer
 * - Response validation learning
 * - Content anomaly detection
 * - Pagination pattern learning
 * - API pattern enhancement
 * - Statistics and metadata
 * - Persistence (save/load/export)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LearningEngine } from '../../src/core/learning-engine.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  ApiPattern,
  ConfidenceDecayConfig,
  SelectorPattern,
} from '../../src/types/index.js';

/**
 * Helper to wait for async file operations to complete
 */
async function waitForFileSave(
  filePath: string,
  condition: (content: string) => boolean,
  maxWaitMs: number = 1000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      if (condition(content)) {
        return true;
      }
    } catch {
      // File doesn't exist yet, continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
}

describe('LearningEngine', () => {
  let engine: LearningEngine;
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learning-engine-test-'));
    filePath = path.join(tempDir, 'enhanced-knowledge-base.json');
    engine = new LearningEngine(filePath);
    await engine.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ============================================
  // TEMPORAL CONFIDENCE DECAY TESTS
  // ============================================
  describe('Temporal Confidence Decay', () => {
    it('should not decay patterns within grace period', async () => {
      // Add an API pattern verified recently
      const pattern: ApiPattern = {
        endpoint: '/api/items',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      engine.learnApiPattern('test.com', pattern);

      // Apply decay (should not affect anything)
      engine.applyConfidenceDecay();

      const entry = engine.getEntry('test.com');
      expect(entry?.apiPatterns[0].confidence).toBe('high');
      expect(entry?.apiPatterns[0].canBypass).toBe(true);
    });

    it('should decay patterns after grace period', async () => {
      // Create engine with custom decay config
      const customConfig: ConfidenceDecayConfig = {
        gracePeriodDays: 0, // No grace period for testing
        decayRatePerWeek: 0.3,
        minConfidenceThreshold: 0.3,
        archiveAfterDays: 90,
      };
      const customEngine = new LearningEngine(filePath, customConfig);
      await customEngine.initialize();

      // Add pattern
      const pattern: ApiPattern = {
        endpoint: '/api/decaying',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      customEngine.learnApiPattern('decay.com', pattern);

      // Manually set lastVerified to 2 weeks ago
      const entry = customEngine.getEntry('decay.com');
      if (entry) {
        entry.apiPatterns[0].lastVerified = Date.now() - 14 * 24 * 60 * 60 * 1000;
      }

      // Apply decay
      customEngine.applyConfidenceDecay();

      const decayedEntry = customEngine.getEntry('decay.com');
      expect(decayedEntry?.apiPatterns[0].confidence).not.toBe('high');
      expect(decayedEntry?.apiPatterns[0].canBypass).toBe(false);
    });

    it('should respect minimum confidence threshold', async () => {
      const customConfig: ConfidenceDecayConfig = {
        gracePeriodDays: 0,
        decayRatePerWeek: 1.0, // Aggressive decay
        minConfidenceThreshold: 0.3,
        archiveAfterDays: 90,
      };
      const customEngine = new LearningEngine(filePath, customConfig);
      await customEngine.initialize();

      const pattern: ApiPattern = {
        endpoint: '/api/min-threshold',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      customEngine.learnApiPattern('threshold.com', pattern);

      // Set lastVerified to very old
      const entry = customEngine.getEntry('threshold.com');
      if (entry) {
        entry.apiPatterns[0].lastVerified = Date.now() - 365 * 24 * 60 * 60 * 1000;
      }

      customEngine.applyConfidenceDecay();

      const decayedEntry = customEngine.getEntry('threshold.com');
      // Should be at minimum (low) but not deleted
      expect(decayedEntry?.apiPatterns[0].confidence).toBe('low');
    });
  });

  // ============================================
  // CONTENT STRUCTURE LEARNING (SELECTORS) TESTS
  // ============================================
  describe('Content Structure Learning (Selectors)', () => {
    it('should learn a new selector', () => {
      engine.learnSelector('selectors.com', '.main-content', 'main_content');

      const chain = engine.getSelectorChain('selectors.com', 'main_content');
      expect(chain).toContain('.main-content');
    });

    it('should boost priority on selector success', () => {
      engine.learnSelector('priority.com', '#content', 'main_content');
      engine.learnSelector('priority.com', '#content', 'main_content'); // Second success

      const entry = engine.getEntry('priority.com');
      const selector = entry?.selectorChains
        .find(c => c.contentType === 'main_content')
        ?.selectors.find(s => s.selector === '#content');

      expect(selector?.successCount).toBe(2);
      expect(selector?.priority).toBeGreaterThan(50); // Started at 50
    });

    it('should record selector failure and reduce priority', () => {
      engine.learnSelector('failure.com', '.bad-selector', 'main_content');
      engine.recordSelectorFailure('failure.com', '.bad-selector', 'main_content');

      const entry = engine.getEntry('failure.com');
      const selector = entry?.selectorChains
        .find(c => c.contentType === 'main_content')
        ?.selectors.find(s => s.selector === '.bad-selector');

      expect(selector?.failureCount).toBe(1);
      expect(selector?.priority).toBeLessThan(50);
    });

    it('should sort selectors by priority', () => {
      engine.learnSelector('sort.com', '.low-priority', 'main_content');
      engine.learnSelector('sort.com', '.high-priority', 'main_content');
      // Make high-priority actually high
      for (let i = 0; i < 5; i++) {
        engine.learnSelector('sort.com', '.high-priority', 'main_content');
      }

      const chain = engine.getSelectorChain('sort.com', 'main_content');
      expect(chain[0]).toBe('.high-priority');
    });

    it('should return empty array for unknown domain', () => {
      const chain = engine.getSelectorChain('unknown.com', 'main_content');
      expect(chain).toEqual([]);
    });

    it('should fall back to domain group selectors', () => {
      // The engine has pre-configured domain groups including spanish_gov
      const chain = engine.getSelectorChain('boe.es', 'main_content');
      // Should include shared patterns from spanish_gov group
      expect(chain.length).toBeGreaterThan(0);
    });

    it('should track URL pattern for selectors', () => {
      engine.learnSelector('pattern.com', '.article', 'main_content', '/articles/.*');

      const entry = engine.getEntry('pattern.com');
      const selector = entry?.selectorChains
        .find(c => c.contentType === 'main_content')
        ?.selectors.find(s => s.selector === '.article');

      expect(selector?.urlPattern).toBe('/articles/.*');
    });
  });

  // ============================================
  // FAILURE CONTEXT LEARNING TESTS
  // ============================================
  describe('Failure Context Learning', () => {
    it('should record a failure with context', () => {
      engine.recordFailure('failure.com', {
        type: 'timeout',
        errorMessage: 'Request timed out',
        responseStatus: undefined,
      });

      const entry = engine.getEntry('failure.com');
      expect(entry?.recentFailures).toHaveLength(1);
      expect(entry?.recentFailures[0].type).toBe('timeout');
      expect(entry?.overallSuccessRate).toBeLessThan(1.0);
    });

    it('should limit failure history to 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        engine.recordFailure('many-failures.com', {
          type: 'timeout',
          errorMessage: `Failure ${i}`,
        });
      }

      const entry = engine.getEntry('many-failures.com');
      expect(entry?.recentFailures).toHaveLength(20);
    });

    it('should classify errors correctly', () => {
      expect(engine.classifyError(new Error('timeout occurred'))).toBe('timeout');
      expect(engine.classifyError(new Error('blocked by Cloudflare'))).toBe('blocked');
      expect(engine.classifyError(new Error('page not found'))).toBe('not_found');
      expect(engine.classifyError(new Error('rate limit exceeded'))).toBe('rate_limited');
      expect(engine.classifyError(new Error('unknown error'))).toBe('unknown');

      // With response status
      expect(engine.classifyError(new Error(''), 401)).toBe('auth_expired');
      expect(engine.classifyError(new Error(''), 403)).toBe('auth_expired');
      expect(engine.classifyError(new Error(''), 404)).toBe('not_found');
      expect(engine.classifyError(new Error(''), 429)).toBe('rate_limited');
      expect(engine.classifyError(new Error(''), 500)).toBe('server_error');
    });

    it('should determine failure patterns', () => {
      // Record several rate limit failures
      for (let i = 0; i < 5; i++) {
        engine.recordFailure('rate-limited.com', { type: 'rate_limited' });
      }

      const patterns = engine.getFailurePatterns('rate-limited.com');
      expect(patterns.mostCommonType).toBe('rate_limited');
      expect(patterns.shouldBackoff).toBe(true);
    });

    it('should return empty patterns for unknown domain', () => {
      const patterns = engine.getFailurePatterns('unknown.com');
      expect(patterns.mostCommonType).toBeNull();
      expect(patterns.recentFailureRate).toBe(0);
      expect(patterns.shouldBackoff).toBe(false);
    });
  });

  // ============================================
  // SUCCESS PROFILE TRACKING TESTS
  // ============================================
  describe('Success Profile Tracking', () => {
    it('should record success and create profile', () => {
      engine.recordSuccess('success.com', {
        tier: 'intelligence',
        strategy: 'framework:nextjs',
        responseTime: 150,
        contentLength: 5000,
        hasStructuredData: true,
        hasFrameworkData: true,
        hasBypassableApis: false,
      });

      const profile = engine.getSuccessProfile('success.com');
      expect(profile).not.toBeNull();
      expect(profile?.preferredTier).toBe('intelligence');
      expect(profile?.preferredStrategy).toBe('framework:nextjs');
      expect(profile?.hasStructuredData).toBe(true);
    });

    it('should update profile with exponential moving average', () => {
      engine.recordSuccess('average.com', {
        tier: 'lightweight',
        responseTime: 100,
        contentLength: 1000,
      });
      engine.recordSuccess('average.com', {
        tier: 'lightweight',
        responseTime: 200,
        contentLength: 2000,
      });

      const profile = engine.getSuccessProfile('average.com');
      // Should be between 100 and 200, weighted toward 200
      expect(profile?.avgResponseTime).toBeGreaterThan(100);
      expect(profile?.avgResponseTime).toBeLessThan(200);
    });

    it('should prefer faster tiers in profile', () => {
      engine.recordSuccess('tier-update.com', {
        tier: 'playwright',
        responseTime: 3000,
        contentLength: 5000,
      });
      engine.recordSuccess('tier-update.com', {
        tier: 'intelligence',
        responseTime: 100,
        contentLength: 5000,
      });

      const profile = engine.getSuccessProfile('tier-update.com');
      expect(profile?.preferredTier).toBe('intelligence');
    });

    it('should not downgrade to slower tier', () => {
      engine.recordSuccess('no-downgrade.com', {
        tier: 'intelligence',
        responseTime: 100,
        contentLength: 5000,
      });
      engine.recordSuccess('no-downgrade.com', {
        tier: 'playwright',
        responseTime: 3000,
        contentLength: 5000,
      });

      const profile = engine.getSuccessProfile('no-downgrade.com');
      expect(profile?.preferredTier).toBe('intelligence');
    });

    it('should return null for unknown domain', () => {
      expect(engine.getSuccessProfile('unknown.com')).toBeNull();
    });

    it('should return reliable profile only when sufficient data', () => {
      // Single success - not reliable
      engine.recordSuccess('not-reliable.com', {
        tier: 'intelligence',
        responseTime: 100,
        contentLength: 5000,
      });

      expect(engine.getReliableSuccessProfile('not-reliable.com')).toBeNull();

      // Three more successes - now reliable
      for (let i = 0; i < 3; i++) {
        engine.recordSuccess('not-reliable.com', {
          tier: 'intelligence',
          responseTime: 100,
          contentLength: 5000,
        });
      }

      expect(engine.getReliableSuccessProfile('not-reliable.com')).not.toBeNull();
    });

    it('should track content characteristics via OR', () => {
      engine.recordSuccess('characteristics.com', {
        tier: 'intelligence',
        responseTime: 100,
        contentLength: 5000,
        hasStructuredData: true,
        hasFrameworkData: false,
      });
      engine.recordSuccess('characteristics.com', {
        tier: 'intelligence',
        responseTime: 100,
        contentLength: 5000,
        hasStructuredData: false,
        hasFrameworkData: true,
      });

      const profile = engine.getSuccessProfile('characteristics.com');
      expect(profile?.hasStructuredData).toBe(true);
      expect(profile?.hasFrameworkData).toBe(true);
    });
  });

  // ============================================
  // CONTENT CHANGE FREQUENCY LEARNING TESTS
  // ============================================
  describe('Content Change Frequency Learning', () => {
    it('should record content check', () => {
      engine.recordContentCheck('change.com', '/news/.*', 'Initial content', false);

      const entry = engine.getEntry('change.com');
      expect(entry?.refreshPatterns).toHaveLength(1);
      expect(entry?.refreshPatterns[0].urlPattern).toBe('/news/.*');
    });

    it('should track content changes', () => {
      engine.recordContentCheck('track.com', '/page', 'Content v1', false);

      // Simulate time passing
      const entry = engine.getEntry('track.com');
      if (entry?.refreshPatterns[0]) {
        entry.refreshPatterns[0].lastChecked = Date.now() - 60 * 60 * 1000; // 1 hour ago
        entry.refreshPatterns[0].lastChanged = Date.now() - 60 * 60 * 1000;
      }

      engine.recordContentCheck('track.com', '/page', 'Content v2', true);

      const updatedEntry = engine.getEntry('track.com');
      expect(updatedEntry?.refreshPatterns[0].sampleCount).toBe(1);
    });

    it('should return default refresh interval for unknown patterns', () => {
      const interval = engine.getRecommendedRefreshInterval('unknown.com', '/path');
      expect(interval).toBe(24); // Default daily
    });

    it('should return calculated interval for known patterns', () => {
      // Create pattern with enough samples
      engine.recordContentCheck('calculated.com', '/frequent', 'Content', true);

      const entry = engine.getEntry('calculated.com');
      if (entry?.refreshPatterns[0]) {
        entry.refreshPatterns[0].sampleCount = 10;
        entry.refreshPatterns[0].avgChangeFrequencyHours = 12;
      }

      const interval = engine.getRecommendedRefreshInterval('calculated.com', '/frequent');
      expect(interval).toBeCloseTo(9.6, 1); // 12 * 0.8
    });
  });

  // ============================================
  // CROSS-DOMAIN PATTERN TRANSFER TESTS
  // ============================================
  describe('Cross-Domain Pattern Transfer', () => {
    it('should identify domain groups', () => {
      const spanishGroup = engine.getDomainGroup('boe.es');
      expect(spanishGroup).not.toBeNull();
      expect(spanishGroup?.name).toBe('spanish_gov');

      const usGroup = engine.getDomainGroup('uscis.gov');
      expect(usGroup).not.toBeNull();
      expect(usGroup?.name).toBe('us_gov');
    });

    it('should return null for ungrouped domains', () => {
      const group = engine.getDomainGroup('random-website.com');
      expect(group).toBeNull();
    });

    it('should transfer patterns between same-group domains', () => {
      // Learn selectors on boe.es
      engine.learnSelector('boe.es', '.doc-content', 'main_content');
      for (let i = 0; i < 5; i++) {
        engine.learnSelector('boe.es', '.doc-content', 'main_content');
      }

      // Transfer to another spanish gov domain
      const transferred = engine.transferPatterns('boe.es', 'agenciatributaria.es');
      expect(transferred).toBe(true);

      // Check transfer worked (with reduced priority)
      const targetEntry = engine.getEntry('agenciatributaria.es');
      expect(targetEntry?.domainGroup).toBe('spanish_gov');
    });

    it('should not transfer between different groups', () => {
      engine.learnSelector('boe.es', '.spanish-content', 'main_content');

      const transferred = engine.transferPatterns('boe.es', 'uscis.gov');
      expect(transferred).toBe(false);
    });

    it('should not transfer from unknown domain', () => {
      const transferred = engine.transferPatterns('unknown.com', 'boe.es');
      expect(transferred).toBe(false);
    });

    it('should get shared patterns for domain', () => {
      const patterns = engine.getSharedPatterns('uscis.gov');
      expect(patterns).not.toBeNull();
      expect(patterns?.contentSelectors.length).toBeGreaterThan(0);
      expect(patterns?.language).toBe('en');
    });

    it('should return null for ungrouped domain', () => {
      const patterns = engine.getSharedPatterns('random.com');
      expect(patterns).toBeNull();
    });
  });

  // ============================================
  // RESPONSE VALIDATION LEARNING TESTS
  // ============================================
  describe('Response Validation Learning', () => {
    it('should learn validator from content', () => {
      const content = 'This is a test page with some important keywords that appear multiple times. The keywords are repeated for testing. keywords keywords keywords';
      engine.learnValidator('validator.com', content, '/test');

      const entry = engine.getEntry('validator.com');
      expect(entry?.validators).toHaveLength(1);
      expect(entry?.validators[0].expectedMinLength).toBeLessThan(content.length);
      expect(entry?.validators[0].mustNotContain).toContain('error');
    });

    it('should validate content against learned rules', () => {
      // Learn from good content
      const goodContent = 'Product listing with many items for sale. products products products listing listing listing';
      engine.learnValidator('validate.com', goodContent);

      // Validate good content
      const goodResult = engine.validateContent('validate.com', goodContent);
      expect(goodResult.valid).toBe(true);
      expect(goodResult.reasons).toHaveLength(0);

      // Validate bad content (too short)
      const shortResult = engine.validateContent('validate.com', 'Error');
      expect(shortResult.valid).toBe(false);
      expect(shortResult.reasons.length).toBeGreaterThan(0);
    });

    it('should detect error indicators in content', () => {
      engine.learnValidator('errors.com', 'Normal content with lots of text for testing purposes testing testing testing');

      const errorContent = 'error 404 page not found';
      const result = engine.validateContent('errors.com', errorContent);

      expect(result.valid).toBe(false);
      expect(result.reasons.some(r => r.includes('error indicator'))).toBe(true);
    });

    it('should return valid for unknown domains', () => {
      const result = engine.validateContent('unknown.com', 'Any content');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================
  // CONTENT ANOMALY DETECTION TESTS
  // ============================================
  describe('Content Anomaly Detection', () => {
    it('should detect challenge pages', () => {
      const challengeContent = 'Just a moment... Checking your browser before accessing the site. DDoS protection by Cloudflare';
      const result = engine.detectContentAnomalies(challengeContent, 'https://protected.com');

      expect(result.isAnomaly).toBe(true);
      expect(result.anomalyType).toBe('challenge_page');
      expect(result.suggestedAction).toBe('wait');
    });

    it('should detect captcha pages', () => {
      const captchaContent = 'Please verify you are human by completing the captcha below';
      const result = engine.detectContentAnomalies(captchaContent, 'https://captcha.com');

      expect(result.isAnomaly).toBe(true);
      expect(result.anomalyType).toBe('captcha');
      expect(result.suggestedAction).toBe('use_session');
    });

    it('should detect rate limiting', () => {
      const rateLimitContent = 'Rate limit exceeded. Too many requests. Please try again later.';
      const result = engine.detectContentAnomalies(rateLimitContent, 'https://limited.com');

      expect(result.isAnomaly).toBe(true);
      expect(result.anomalyType).toBe('rate_limited');
      expect(result.suggestedAction).toBe('wait');
      expect(result.waitTimeMs).toBe(60000);
    });

    it('should detect error pages', () => {
      const errorContent = 'Error 404 - Page not found';
      const result = engine.detectContentAnomalies(errorContent, 'https://missing.com');

      expect(result.isAnomaly).toBe(true);
      expect(result.anomalyType).toBe('error_page');
      expect(result.suggestedAction).toBe('skip');
    });

    it('should detect empty content', () => {
      const emptyContent = 'Hi';
      const result = engine.detectContentAnomalies(emptyContent, 'https://empty.com');

      expect(result.isAnomaly).toBe(true);
      expect(result.anomalyType).toBe('empty_content');
    });

    it('should detect topic mismatch', () => {
      // Content needs to be > 100 chars for topic mismatch detection
      const content = 'This page is about cooking recipes and kitchen tips. We have many delicious recipes for you to try. From soups to desserts, we have it all covered in our comprehensive cooking guide.';
      const result = engine.detectContentAnomalies(
        content,
        'https://example.com/products',
        'electronics-products-catalog'
      );

      expect(result.reasons.some(r => r.includes("doesn't match expected topic"))).toBe(true);
    });

    it('should pass normal content', () => {
      const normalContent = `
        <html>
        <body>
          <h1>Welcome to Our Store</h1>
          <p>Browse our selection of products. We have electronics, clothing, and more.
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
          incididunt ut labore et dolore magna aliqua.</p>
          <ul>
            <li>Product 1</li>
            <li>Product 2</li>
            <li>Product 3</li>
          </ul>
        </body>
        </html>
      `;
      const result = engine.detectContentAnomalies(normalContent, 'https://store.com');

      expect(result.isAnomaly).toBe(false);
    });
  });

  // ============================================
  // PAGINATION PATTERN LEARNING TESTS
  // ============================================
  describe('Pagination Pattern Learning', () => {
    it('should detect query param pagination', () => {
      const urls = [
        'https://shop.com/products?page=1',
        'https://shop.com/products?page=2',
        'https://shop.com/products?page=3',
      ];
      engine.learnPaginationPattern('shop.com', urls, {});

      const pattern = engine.getPaginationPattern('shop.com', urls[0]);
      expect(pattern).not.toBeNull();
      expect(pattern?.type).toBe('query_param');
      expect(pattern?.paramName).toBe('page');
      expect(pattern?.increment).toBe(1);
    });

    it('should detect offset-based pagination', () => {
      const urls = [
        'https://api.com/items?offset=0',
        'https://api.com/items?offset=20',
        'https://api.com/items?offset=40',
      ];
      engine.learnPaginationPattern('api.com', urls, {});

      const pattern = engine.getPaginationPattern('api.com', urls[0]);
      expect(pattern).not.toBeNull();
      expect(pattern?.paramName).toBe('offset');
      expect(pattern?.increment).toBe(20);
    });

    it('should accept custom pagination config', () => {
      const urls = [
        'https://custom.com/items?p=1',
        'https://custom.com/items?p=2',
      ];
      engine.learnPaginationPattern('custom.com', urls, {
        type: 'query_param',
        itemsPerPage: 50,
        maxPages: 10,
      });

      const pattern = engine.getPaginationPattern('custom.com', urls[0]);
      expect(pattern?.itemsPerPage).toBe(50);
      expect(pattern?.maxPages).toBe(10);
    });

    it('should not learn from single URL', () => {
      engine.learnPaginationPattern('single.com', ['https://single.com/page'], {});

      const entry = engine.getEntry('single.com');
      // Should not have pagination patterns from single URL
      const paginationPatterns = entry?.paginationPatterns as Record<string, unknown>;
      expect(Object.keys(paginationPatterns || {}).length).toBe(0);
    });

    it('should return null for unknown pagination', () => {
      const pattern = engine.getPaginationPattern('unknown.com', 'https://unknown.com/page');
      expect(pattern).toBeNull();
    });
  });

  // ============================================
  // API PATTERN ENHANCEMENT TESTS
  // ============================================
  describe('API Pattern Enhancement', () => {
    it('should learn new API pattern', () => {
      const pattern: ApiPattern = {
        endpoint: '/api/v1/users',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      engine.learnApiPattern('api.com', pattern);

      const entry = engine.getEntry('api.com');
      expect(entry?.apiPatterns).toHaveLength(1);
      expect(entry?.apiPatterns[0].endpoint).toBe('/api/v1/users');
      expect(entry?.apiPatterns[0].verificationCount).toBe(1);
    });

    it('should update existing API pattern', () => {
      const pattern: ApiPattern = {
        endpoint: '/api/items',
        method: 'POST',
        confidence: 'medium',
        canBypass: false,
      };

      engine.learnApiPattern('update.com', pattern);
      engine.learnApiPattern('update.com', { ...pattern, confidence: 'high', canBypass: true });

      const entry = engine.getEntry('update.com');
      expect(entry?.apiPatterns).toHaveLength(1);
      expect(entry?.apiPatterns[0].verificationCount).toBe(2);
      expect(entry?.apiPatterns[0].confidence).toBe('high');
    });

    it('should verify API pattern', () => {
      const pattern: ApiPattern = {
        endpoint: '/api/verified',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      engine.learnApiPattern('verify.com', pattern);

      engine.verifyApiPattern('verify.com', '/api/verified', 'GET');

      const entry = engine.getEntry('verify.com');
      expect(entry?.apiPatterns[0].verificationCount).toBe(2);
    });

    it('should record API pattern failure', () => {
      const pattern: ApiPattern = {
        endpoint: '/api/failing',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      engine.learnApiPattern('failing.com', pattern);

      engine.recordApiPatternFailure('failing.com', '/api/failing', 'GET', {
        type: 'timeout',
        errorMessage: 'Request timed out',
      });

      const entry = engine.getEntry('failing.com');
      expect(entry?.apiPatterns[0].failureCount).toBe(1);
      expect(entry?.apiPatterns[0].lastFailure).toBeDefined();
    });

    it('should downgrade confidence after multiple failures', () => {
      const pattern: ApiPattern = {
        endpoint: '/api/degrading',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      engine.learnApiPattern('degrade.com', pattern);

      // Record 3 failures
      for (let i = 0; i < 3; i++) {
        engine.recordApiPatternFailure('degrade.com', '/api/degrading', 'GET', {
          type: 'timeout',
        });
      }

      const entry = engine.getEntry('degrade.com');
      expect(entry?.apiPatterns[0].confidence).toBe('medium');
      expect(entry?.apiPatterns[0].canBypass).toBe(false);
    });

    it('should further downgrade after more failures', () => {
      const pattern: ApiPattern = {
        endpoint: '/api/very-broken',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      };
      engine.learnApiPattern('very-broken.com', pattern);

      // Record 6 failures (3 to medium, 5+ to low)
      for (let i = 0; i < 6; i++) {
        engine.recordApiPatternFailure('very-broken.com', '/api/very-broken', 'GET', {
          type: 'server_error',
        });
      }

      const entry = engine.getEntry('very-broken.com');
      expect(entry?.apiPatterns[0].confidence).toBe('low');
    });
  });

  // ============================================
  // STATISTICS AND METADATA TESTS
  // ============================================
  describe('Statistics and Metadata', () => {
    it('should return correct stats', () => {
      engine.learnApiPattern('stats1.com', {
        endpoint: '/api/1',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });
      engine.learnApiPattern('stats2.com', {
        endpoint: '/api/2',
        method: 'POST',
        confidence: 'medium',
        canBypass: false,
      });
      engine.learnSelector('stats1.com', '.content', 'main_content');
      engine.learnValidator('stats2.com', 'Some content for validation testing testing testing');

      const stats = engine.getStats();
      expect(stats.totalDomains).toBe(2);
      expect(stats.totalApiPatterns).toBe(2);
      expect(stats.bypassablePatterns).toBe(1);
      expect(stats.totalSelectors).toBeGreaterThan(0);
      expect(stats.totalValidators).toBe(1);
      expect(stats.domainGroups.length).toBeGreaterThan(0);
    });

    it('should track learning events', () => {
      engine.learnApiPattern('events.com', {
        endpoint: '/api/event',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });
      engine.learnSelector('events.com', '.test', 'main_content');

      const stats = engine.getStats();
      expect(stats.recentLearningEvents.length).toBeGreaterThan(0);
      expect(stats.recentLearningEvents.some(e => e.type === 'api_discovered')).toBe(true);
      expect(stats.recentLearningEvents.some(e => e.type === 'selector_learned')).toBe(true);
    });

    it('should return null for unknown entry', () => {
      const entry = engine.getEntry('completely-unknown-domain.xyz');
      expect(entry).toBeNull();
    });

    it('should return entry for known domain', () => {
      engine.learnApiPattern('known.com', {
        endpoint: '/api',
        method: 'GET',
        confidence: 'medium',
        canBypass: false,
      });

      const entry = engine.getEntry('known.com');
      expect(entry).not.toBeNull();
      expect(entry?.domain).toBe('known.com');
    });
  });

  // ============================================
  // PERSISTENCE TESTS
  // ============================================
  describe('Persistence', () => {
    it('should save and load entries', async () => {
      engine.learnApiPattern('persist.com', {
        endpoint: '/api/persist',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });
      engine.learnSelector('persist.com', '.persisted', 'main_content');

      // Wait for file save
      const saved = await waitForFileSave(filePath, (content) => {
        try {
          const data = JSON.parse(content);
          return data.entries?.['persist.com'] !== undefined;
        } catch {
          return false;
        }
      });
      expect(saved).toBe(true);

      // Create new instance and load
      const newEngine = new LearningEngine(filePath);
      await newEngine.initialize();

      const entry = newEngine.getEntry('persist.com');
      expect(entry).not.toBeNull();
      expect(entry?.apiPatterns).toHaveLength(1);
      expect(entry?.selectorChains.length).toBeGreaterThan(0);
    });

    it('should export knowledge base as JSON', async () => {
      engine.learnApiPattern('export.com', {
        endpoint: '/api/export',
        method: 'GET',
        confidence: 'high',
        canBypass: true,
      });

      const exported = await engine.exportKnowledgeBase();
      const parsed = JSON.parse(exported);

      expect(parsed.entries).toBeDefined();
      expect(parsed.entries['export.com']).toBeDefined();
      expect(parsed.domainGroups).toBeDefined();
      expect(parsed.stats).toBeDefined();
    });

    it('should handle empty knowledge base gracefully', async () => {
      const emptyPath = path.join(tempDir, 'empty-kb.json');
      const emptyEngine = new LearningEngine(emptyPath);
      await emptyEngine.initialize();

      const stats = emptyEngine.getStats();
      expect(stats.totalDomains).toBe(0);
    });
  });

  // ============================================
  // DOMAIN GROUP INITIALIZATION TESTS
  // ============================================
  describe('Domain Group Initialization', () => {
    it('should initialize entry with group selectors', () => {
      // Access a domain in a known group
      engine.learnApiPattern('seg-social.es', {
        endpoint: '/api/info',
        method: 'GET',
        confidence: 'medium',
        canBypass: false,
      });

      const entry = engine.getEntry('seg-social.es');
      expect(entry?.domainGroup).toBe('spanish_gov');
      expect(entry?.selectorChains.length).toBeGreaterThan(0);
    });

    it('should not set domain group for ungrouped domains', () => {
      engine.learnApiPattern('random-site.io', {
        endpoint: '/api',
        method: 'GET',
        confidence: 'low',
        canBypass: false,
      });

      const entry = engine.getEntry('random-site.io');
      expect(entry?.domainGroup).toBeUndefined();
    });
  });
});
