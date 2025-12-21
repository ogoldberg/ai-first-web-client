/**
 * Tests for getDomainCapabilities (CX-011)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartBrowser } from '../../src/core/smart-browser.js';
import { BrowserManager } from '../../src/core/browser-manager.js';
import { ContentExtractor } from '../../src/utils/content-extractor.js';
import { ApiAnalyzer } from '../../src/core/api-analyzer.js';
import { SessionManager } from '../../src/core/session-manager.js';

describe('getDomainCapabilities', () => {
  let smartBrowser: SmartBrowser;
  let browserManager: BrowserManager;
  let contentExtractor: ContentExtractor;
  let apiAnalyzer: ApiAnalyzer;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    // Create mock browser manager
    browserManager = {
      browse: vi.fn().mockResolvedValue({
        page: {
          content: vi.fn().mockResolvedValue('<html></html>'),
          url: vi.fn().mockReturnValue('https://example.com'),
          close: vi.fn().mockResolvedValue(undefined),
        },
        network: [],
        console: [],
      }),
      getContext: vi.fn().mockResolvedValue({
        pages: vi.fn().mockReturnValue([]),
      }),
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
    } as unknown as BrowserManager;

    vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(false);

    contentExtractor = new ContentExtractor();
    apiAnalyzer = new ApiAnalyzer();

    sessionManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      loadSession: vi.fn().mockResolvedValue(false),
      saveSession: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockReturnValue([]),
      hasSession: vi.fn().mockReturnValue(false),
    } as unknown as SessionManager;

    smartBrowser = new SmartBrowser(
      browserManager,
      contentExtractor,
      apiAnalyzer,
      sessionManager
    );
    await smartBrowser.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('unknown domain', () => {
    it('should return unknown confidence for new domain', async () => {
      const result = await smartBrowser.getDomainCapabilities('never-seen.example.com');

      expect(result.domain).toBe('never-seen.example.com');
      expect(result.confidence.level).toBe('unknown');
      expect(result.confidence.basis).toContain('No prior interactions');
    });

    it('should have all capabilities as false for new domain', async () => {
      const result = await smartBrowser.getDomainCapabilities('new-domain.test');

      expect(result.capabilities.canBypassBrowser).toBe(false);
      expect(result.capabilities.hasLearnedPatterns).toBe(false);
      expect(result.capabilities.hasActiveSession).toBe(false);
      expect(result.capabilities.hasSkills).toBe(false);
      expect(result.capabilities.hasPagination).toBe(false);
      expect(result.capabilities.hasContentSelectors).toBe(false);
    });

    it('should provide default recommendations for new domain', async () => {
      const result = await smartBrowser.getDomainCapabilities('unknown.test');

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(r => r.includes('New domain'))).toBe(true);
    });

    it('should have zero counts in details for new domain', async () => {
      const result = await smartBrowser.getDomainCapabilities('empty.test');

      expect(result.details.apiPatternCount).toBe(0);
      expect(result.details.skillCount).toBe(0);
      expect(result.details.selectorCount).toBe(0);
      expect(result.details.validatorCount).toBe(0);
      expect(result.details.paginationPatternCount).toBe(0);
      expect(result.details.recentFailureCount).toBe(0);
    });
  });

  describe('domain group detection', () => {
    it('should detect spanish_gov domain group', async () => {
      const result = await smartBrowser.getDomainCapabilities('boe.es');

      expect(result.details.domainGroup).toBe('spanish_gov');
      expect(result.recommendations.some(r => r.includes('spanish_gov'))).toBe(true);
    });

    it('should detect us_gov domain group', async () => {
      const result = await smartBrowser.getDomainCapabilities('uscis.gov');

      expect(result.details.domainGroup).toBe('us_gov');
    });

    it('should detect eu_gov domain group', async () => {
      const result = await smartBrowser.getDomainCapabilities('europa.eu');

      expect(result.details.domainGroup).toBe('eu_gov');
    });
  });

  describe('performance defaults', () => {
    it('should default to intelligence tier', async () => {
      const result = await smartBrowser.getDomainCapabilities('default.test');

      expect(result.performance.preferredTier).toBe('intelligence');
    });

    it('should have null avgResponseTimeMs for new domain', async () => {
      const result = await smartBrowser.getDomainCapabilities('new.test');

      expect(result.performance.avgResponseTimeMs).toBeNull();
    });

    it('should have default success rate for new domain', async () => {
      const result = await smartBrowser.getDomainCapabilities('fresh.test');

      expect(result.performance.successRate).toBe(1.0);
    });
  });

  describe('response structure', () => {
    it('should return all required fields', async () => {
      const result = await smartBrowser.getDomainCapabilities('any.test');

      // Top level
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('capabilities');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('performance');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('details');

      // Capabilities
      expect(result.capabilities).toHaveProperty('canBypassBrowser');
      expect(result.capabilities).toHaveProperty('hasLearnedPatterns');
      expect(result.capabilities).toHaveProperty('hasActiveSession');
      expect(result.capabilities).toHaveProperty('hasSkills');
      expect(result.capabilities).toHaveProperty('hasPagination');
      expect(result.capabilities).toHaveProperty('hasContentSelectors');

      // Confidence
      expect(result.confidence).toHaveProperty('level');
      expect(result.confidence).toHaveProperty('score');
      expect(result.confidence).toHaveProperty('basis');

      // Performance
      expect(result.performance).toHaveProperty('preferredTier');
      expect(result.performance).toHaveProperty('avgResponseTimeMs');
      expect(result.performance).toHaveProperty('successRate');

      // Details
      expect(result.details).toHaveProperty('apiPatternCount');
      expect(result.details).toHaveProperty('skillCount');
      expect(result.details).toHaveProperty('selectorCount');
      expect(result.details).toHaveProperty('validatorCount');
      expect(result.details).toHaveProperty('paginationPatternCount');
      expect(result.details).toHaveProperty('recentFailureCount');
      expect(result.details).toHaveProperty('domainGroup');
    });

    it('should return valid confidence levels', async () => {
      const result = await smartBrowser.getDomainCapabilities('test.domain');

      expect(['high', 'medium', 'low', 'unknown']).toContain(result.confidence.level);
    });

    it('should return valid tier preferences', async () => {
      const result = await smartBrowser.getDomainCapabilities('test.domain');

      expect(['intelligence', 'lightweight', 'playwright']).toContain(result.performance.preferredTier);
    });
  });

  describe('with learned patterns', () => {
    beforeEach(async () => {
      // Learn a pattern for the test domain
      const learningEngine = smartBrowser.getLearningEngine();
      learningEngine.learnApiPattern('test-api.example.com', '/api/data', 'GET', {
        responseFormat: 'json',
        bypassable: true,
        authRequired: false,
      });
    });

    it('should detect learned patterns', async () => {
      const result = await smartBrowser.getDomainCapabilities('test-api.example.com');

      expect(result.capabilities.hasLearnedPatterns).toBe(true);
      expect(result.details.apiPatternCount).toBeGreaterThan(0);
    });

    it('should update confidence level with patterns', async () => {
      const result = await smartBrowser.getDomainCapabilities('test-api.example.com');

      // With patterns, confidence should not be unknown
      expect(result.confidence.level).not.toBe('unknown');
    });
  });

  describe('with active session', () => {
    beforeEach(() => {
      // Mock hasSession to return true for a specific domain
      vi.mocked(sessionManager.hasSession).mockImplementation((domain: string) => {
        return domain === 'authenticated.example.com';
      });
    });

    it('should detect active session', async () => {
      const result = await smartBrowser.getDomainCapabilities('authenticated.example.com');

      expect(result.capabilities.hasActiveSession).toBe(true);
      expect(result.recommendations.some(r => r.includes('session'))).toBe(true);
    });

    it('should not detect session for other domains', async () => {
      const result = await smartBrowser.getDomainCapabilities('other.example.com');

      expect(result.capabilities.hasActiveSession).toBe(false);
    });
  });

  describe('recommendations', () => {
    it('should always return at least one recommendation', async () => {
      const result = await smartBrowser.getDomainCapabilities('any.test');

      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    });

    it('should be an array of strings', async () => {
      const result = await smartBrowser.getDomainCapabilities('any.test');

      expect(Array.isArray(result.recommendations)).toBe(true);
      result.recommendations.forEach(rec => {
        expect(typeof rec).toBe('string');
      });
    });
  });
});
