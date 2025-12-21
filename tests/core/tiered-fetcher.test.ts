import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TieredFetcher, type TieredFetchResult, type RenderTier } from '../../src/core/tiered-fetcher.js';
import { BrowserManager } from '../../src/core/browser-manager.js';
import { ContentExtractor } from '../../src/utils/content-extractor.js';
import { ContentIntelligence, type ContentResult, type ExtractionStrategy } from '../../src/core/content-intelligence.js';
import { LightweightRenderer, type LightweightRenderResult } from '../../src/core/lightweight-renderer.js';
import { rateLimiter } from '../../src/utils/rate-limiter.js';

// Mock the modules
vi.mock('../../src/core/content-intelligence.js');
vi.mock('../../src/core/lightweight-renderer.js');
vi.mock('../../src/utils/rate-limiter.js');

describe('TieredFetcher', () => {
  let fetcher: TieredFetcher;
  let mockBrowserManager: BrowserManager;
  let mockContentExtractor: ContentExtractor;
  let mockContentIntelligence: ContentIntelligence;
  let mockLightweightRenderer: LightweightRenderer;

  // Helper to create a successful ContentResult
  // Content must be at least 500 chars to pass default minContentLength validation
  const createContentResult = (overrides: Partial<ContentResult> = {}): ContentResult => ({
    content: {
      title: 'Test Page',
      text: 'This is enough test content to pass validation with the default minContentLength of 500 characters. '.repeat(6),
      markdown: '# Test Page\n\nThis is test content with plenty of markdown text.',
      ...overrides.content,
    },
    meta: {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      strategy: 'static:html' as ExtractionStrategy,
      strategiesAttempted: ['static:html' as ExtractionStrategy],
      timing: 100,
      confidence: 'high',
      ...overrides.meta,
    },
    warnings: [],
    ...overrides,
  });

  // Helper to create a successful LightweightRenderResult
  const createLightweightResult = (overrides: Partial<LightweightRenderResult> = {}): LightweightRenderResult => ({
    html: '<html><head><title>Test</title></head><body><main><h1>Test</h1><p>Content</p></main></body></html>',
    finalUrl: 'https://example.com',
    jsExecuted: true,
    scriptsExecuted: 2,
    scriptsSkipped: 1,
    scriptErrors: [],
    networkRequests: [],
    cookies: [],
    timing: { fetchTime: 50, parseTime: 30, scriptTime: 20, totalTime: 100 },
    detection: {
      needsFullBrowser: false,
      hasComplexJS: false,
      hasWebGL: false,
      hasServiceWorker: false,
      reason: undefined,
      ...overrides.detection,
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.resetAllMocks();

    // Create mock browser manager
    mockBrowserManager = {
      browse: vi.fn(),
      getContext: vi.fn(),
      initialize: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as BrowserManager;

    // Mock BrowserManager.isPlaywrightAvailable
    vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

    // Create mock content extractor
    // Content must be at least 500 chars to pass default minContentLength validation
    mockContentExtractor = {
      extract: vi.fn().mockReturnValue({
        title: 'Extracted Title',
        text: 'This is extracted content with enough text to pass the default minContentLength of 500 characters. '.repeat(6),
        markdown: '# Extracted\n\nContent here with plenty of text.',
      }),
    } as unknown as ContentExtractor;

    // Mock rate limiter
    vi.mocked(rateLimiter.acquire).mockResolvedValue(undefined);

    // Create fetcher
    fetcher = new TieredFetcher(mockBrowserManager, mockContentExtractor);

    // Get references to mocked classes
    mockContentIntelligence = (fetcher as unknown as { contentIntelligence: ContentIntelligence }).contentIntelligence;
    mockLightweightRenderer = (fetcher as unknown as { lightweightRenderer: LightweightRenderer }).lightweightRenderer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tier cascade behavior', () => {
    it('should use intelligence tier when it succeeds', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      const result = await fetcher.fetch('https://example.com');

      expect(result.tier).toBe('intelligence');
      expect(result.fellBack).toBe(false);
      expect(result.tiersAttempted).toEqual(['intelligence']);
      expect(mockContentIntelligence.extract).toHaveBeenCalledOnce();
    });

    it('should fall back to lightweight when intelligence fails', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue({
        ...createContentResult(),
        error: 'Extraction failed',
      });
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

      const result = await fetcher.fetch('https://example.com');

      expect(result.tier).toBe('lightweight');
      expect(result.fellBack).toBe(true);
      expect(result.tiersAttempted).toEqual(['intelligence', 'lightweight']);
    });

    it('should fall back to playwright when lightweight fails', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue({
        ...createContentResult(),
        error: 'Extraction failed',
      });
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue({
        ...createLightweightResult(),
        detection: { ...createLightweightResult().detection, needsFullBrowser: true, reason: 'Complex JS' },
      });

      const mockPage = {
        content: vi.fn().mockResolvedValue('<html><main><h1>Test</h1><p>Content</p></main></html>'),
        url: vi.fn().mockReturnValue('https://example.com'),
        waitForSelector: vi.fn().mockResolvedValue(null),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage,
        network: [],
        console: [],
      } as unknown as ReturnType<BrowserManager['browse']>);

      const result = await fetcher.fetch('https://example.com');

      expect(result.tier).toBe('playwright');
      expect(result.fellBack).toBe(true);
      expect(result.tiersAttempted).toEqual(['intelligence', 'lightweight', 'playwright']);
    });

    it('should throw when all tiers fail', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockRejectedValue(new Error('Intelligence failed'));
      vi.spyOn(mockLightweightRenderer, 'render').mockRejectedValue(new Error('Lightweight failed'));
      vi.mocked(mockBrowserManager.browse).mockRejectedValue(new Error('Playwright failed'));

      await expect(fetcher.fetch('https://example.com')).rejects.toThrow('Playwright failed');
    });
  });

  describe('force tier option', () => {
    it('should use only the specified tier when forceTier is set', async () => {
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

      const result = await fetcher.fetch('https://example.com', { forceTier: 'lightweight' });

      expect(result.tier).toBe('lightweight');
      expect(result.tiersAttempted).toEqual(['lightweight']);
      expect(mockContentIntelligence.extract).not.toHaveBeenCalled();
    });

    it('should handle legacy tier name "static" as "intelligence"', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      const result = await fetcher.fetch('https://example.com', { forceTier: 'static' as RenderTier });

      expect(result.tier).toBe('intelligence');
      expect(mockContentIntelligence.extract).toHaveBeenCalledOnce();
    });
  });

  describe('content validation', () => {
    it('should trigger fallback when content is too short', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue({
        ...createContentResult(),
        content: { title: 'Test', text: 'Short', markdown: 'Short' },
      });
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

      const result = await fetcher.fetch('https://example.com', { minContentLength: 200 });

      expect(result.tier).toBe('lightweight');
      expect(result.fellBack).toBe(true);
      // tierReason contains the validation failure reason
      expect(result.tierReason).toContain('Fell back from intelligence');
    });

    it('should trigger fallback when incomplete markers are detected', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue({
        ...createContentResult(),
        content: { title: 'Test', text: 'Loading...', markdown: 'Loading...' },
      });
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

      const result = await fetcher.fetch('https://example.com');

      expect(result.fellBack).toBe(true);
    });

    it('should accept valid content without fallback', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      const result = await fetcher.fetch('https://example.com', { minContentLength: 100 });

      expect(result.fellBack).toBe(false);
      expect(result.tier).toBe('intelligence');
    });
  });

  describe('Playwright availability', () => {
    it('should skip playwright tier when not available', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(false);
      vi.spyOn(mockContentIntelligence, 'extract').mockRejectedValue(new Error('Failed'));
      vi.spyOn(mockLightweightRenderer, 'render').mockRejectedValue(new Error('Lightweight failed'));

      await expect(fetcher.fetch('https://example.com')).rejects.toThrow('Lightweight failed');

      // Should not have tried playwright
      expect(mockBrowserManager.browse).not.toHaveBeenCalled();
    });

    it('should use lightweight for browser-required domains when playwright unavailable', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(false);
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

      // twitter.com is in KNOWN_BROWSER_REQUIRED
      const result = await fetcher.fetch('https://twitter.com/user');

      expect(result.tier).toBe('lightweight');
      expect(mockBrowserManager.browse).not.toHaveBeenCalled();
    });

    it('should return playwrightAvailable in detection results', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(false);
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      const result = await fetcher.fetch('https://example.com');

      expect(result.detection.playwrightAvailable).toBe(false);
    });
  });

  describe('domain preference learning', () => {
    it('should record successful tier preference', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      await fetcher.fetch('https://example.com', { enableLearning: true });

      const pref = fetcher.getDomainPreference('example.com');
      expect(pref).toBeDefined();
      expect(pref?.preferredTier).toBe('intelligence');
      expect(pref?.successCount).toBe(1);
    });

    it('should use learned preference after multiple successes', async () => {
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

      // Manually set high-confidence preference
      fetcher.setDomainPreference('preferred.com', 'lightweight');

      await fetcher.fetch('https://preferred.com/page');

      // Should start with lightweight due to learned preference
      expect(mockContentIntelligence.extract).not.toHaveBeenCalled();
      expect(mockLightweightRenderer.render).toHaveBeenCalledOnce();
    });

    it('should not learn when enableLearning is false', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      await fetcher.fetch('https://nolearn.com', { enableLearning: false });

      const pref = fetcher.getDomainPreference('nolearn.com');
      expect(pref).toBeUndefined();
    });

    it('should clear preferences', () => {
      fetcher.setDomainPreference('test.com', 'lightweight');
      expect(fetcher.getDomainPreference('test.com')).toBeDefined();

      fetcher.clearPreferences();
      expect(fetcher.getDomainPreference('test.com')).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    it('should apply rate limiting by default', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      await fetcher.fetch('https://example.com');

      expect(rateLimiter.acquire).toHaveBeenCalledWith('https://example.com');
    });

    it('should skip rate limiting when disabled', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      await fetcher.fetch('https://example.com', { useRateLimiting: false });

      expect(rateLimiter.acquire).not.toHaveBeenCalled();
    });
  });

  describe('timing information', () => {
    it('should return timing breakdown per tier', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      const result = await fetcher.fetch('https://example.com');

      expect(result.timing).toBeDefined();
      expect(typeof result.timing.total).toBe('number');
      expect(result.timing.total).toBeGreaterThanOrEqual(0);
      expect(result.timing.perTier.intelligence).toBeGreaterThanOrEqual(0);
    });

    it('should accumulate timing across tiers on fallback', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockRejectedValue(new Error('Failed'));
      vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

      const result = await fetcher.fetch('https://example.com');

      expect(result.timing.perTier.intelligence).toBeGreaterThanOrEqual(0);
      expect(result.timing.perTier.lightweight).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stats and export', () => {
    it('should return stats about tier usage', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      await fetcher.fetch('https://example1.com');
      await fetcher.fetch('https://example2.com');

      const stats = fetcher.getStats();
      expect(stats.totalDomains).toBe(2);
      expect(stats.byTier.intelligence).toBe(2);
    });

    it('should export and import preferences', async () => {
      fetcher.setDomainPreference('test1.com', 'intelligence');
      fetcher.setDomainPreference('test2.com', 'lightweight');

      const exported = fetcher.exportPreferences();
      expect(exported).toHaveLength(2);

      // Create new fetcher and import
      const newFetcher = new TieredFetcher(mockBrowserManager, mockContentExtractor);
      newFetcher.importPreferences(exported);

      expect(newFetcher.getDomainPreference('test1.com')?.preferredTier).toBe('intelligence');
      expect(newFetcher.getDomainPreference('test2.com')?.preferredTier).toBe('lightweight');
    });

    it('should export preferences with complete data structure for analytics', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      // Fetch a URL to create a preference with real stats
      await fetcher.fetch('https://analytics-test.com');

      const exported = fetcher.exportPreferences();
      expect(exported).toHaveLength(1);

      const pref = exported[0];
      expect(pref).toHaveProperty('domain', 'analytics-test.com');
      expect(pref).toHaveProperty('preferredTier', 'intelligence');
      expect(pref).toHaveProperty('successCount');
      expect(pref).toHaveProperty('failureCount');
      expect(pref).toHaveProperty('lastUsed');
      expect(pref).toHaveProperty('avgResponseTime');
      expect(pref.successCount).toBeGreaterThanOrEqual(1);
      expect(pref.lastUsed).toBeGreaterThan(0);
      expect(typeof pref.avgResponseTime).toBe('number');
    });

    it('should track failure counts correctly for analytics', async () => {
      // Make intelligence tier fail, and then lightweight also fail
      vi.spyOn(mockContentIntelligence, 'extract').mockRejectedValue(new Error('Failed'));
      vi.spyOn(mockLightweightRenderer, 'render').mockRejectedValue(new Error('Failed'));
      vi.mocked(mockBrowserManager.browse).mockRejectedValue(new Error('Failed'));

      try {
        await fetcher.fetch('https://failing-domain.com');
      } catch {
        // Expected to fail
      }

      const pref = fetcher.getDomainPreference('failing-domain.com');
      expect(pref).toBeDefined();
      expect(pref?.failureCount).toBeGreaterThanOrEqual(1);
    });

    it('should support filtering exported preferences by tier', async () => {
      fetcher.setDomainPreference('intelligence-site.com', 'intelligence');
      fetcher.setDomainPreference('lightweight-site.com', 'lightweight');
      fetcher.setDomainPreference('playwright-site.com', 'playwright');

      const exported = fetcher.exportPreferences();
      expect(exported).toHaveLength(3);

      // Filter by tier (this would be done by the MCP handler)
      const intelligenceOnly = exported.filter(p => p.preferredTier === 'intelligence');
      expect(intelligenceOnly).toHaveLength(1);
      expect(intelligenceOnly[0].domain).toBe('intelligence-site.com');

      const playwrightOnly = exported.filter(p => p.preferredTier === 'playwright');
      expect(playwrightOnly).toHaveLength(1);
      expect(playwrightOnly[0].domain).toBe('playwright-site.com');
    });

    it('should provide accurate stats breakdown by tier', async () => {
      fetcher.setDomainPreference('int1.com', 'intelligence');
      fetcher.setDomainPreference('int2.com', 'intelligence');
      fetcher.setDomainPreference('light1.com', 'lightweight');
      fetcher.setDomainPreference('play1.com', 'playwright');

      const stats = fetcher.getStats();
      expect(stats.totalDomains).toBe(4);
      expect(stats.byTier.intelligence).toBe(2);
      expect(stats.byTier.lightweight).toBe(1);
      expect(stats.byTier.playwright).toBe(1);
    });
  });

  describe('known domain patterns', () => {
    it('should default to intelligence tier for .gov domains', async () => {
      vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

      const result = await fetcher.fetch('https://whitehouse.gov');

      expect(result.tiersAttempted[0]).toBe('intelligence');
    });

    it('should prefer playwright for social media domains', async () => {
      const mockPage = {
        content: vi.fn().mockResolvedValue('<html><main><h1>Test</h1><p>Content</p></main></html>'),
        url: vi.fn().mockReturnValue('https://twitter.com'),
        waitForSelector: vi.fn().mockResolvedValue(null),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage,
        network: [],
        console: [],
      } as unknown as ReturnType<BrowserManager['browse']>);

      const result = await fetcher.fetch('https://twitter.com/user');

      expect(result.tiersAttempted[0]).toBe('playwright');
    });
  });

  // ============================================
  // Budget Controls (CX-005)
  // ============================================
  describe('budget controls (CX-005)', () => {
    describe('maxCostTier', () => {
      it('should skip expensive tiers when maxCostTier=intelligence', async () => {
        // Make intelligence tier fail
        vi.spyOn(mockContentIntelligence, 'extract').mockRejectedValue(new Error('Intelligence tier failed'));
        vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

        // With maxCostTier=intelligence, lightweight should be skipped
        await expect(
          fetcher.fetch('https://example.com', { maxCostTier: 'intelligence' })
        ).rejects.toThrow();

        // Only intelligence should have been attempted
        expect(mockContentIntelligence.extract).toHaveBeenCalled();
        expect(mockLightweightRenderer.render).not.toHaveBeenCalled();
      });

      it('should allow lightweight tier when maxCostTier=lightweight', async () => {
        // Make intelligence tier fail
        vi.spyOn(mockContentIntelligence, 'extract').mockRejectedValue(new Error('Intelligence tier failed'));
        vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

        const result = await fetcher.fetch('https://example.com', { maxCostTier: 'lightweight' });

        // Should fall back to lightweight but not playwright
        expect(result.tier).toBe('lightweight');
        expect(mockBrowserManager.browse).not.toHaveBeenCalled();
      });

      it('should skip playwright when maxCostTier=lightweight', async () => {
        // Make intelligence and lightweight tiers fail
        vi.spyOn(mockContentIntelligence, 'extract').mockRejectedValue(new Error('Intelligence failed'));
        vi.spyOn(mockLightweightRenderer, 'render').mockRejectedValue(new Error('Lightweight failed'));

        // With maxCostTier=lightweight, playwright should be skipped
        await expect(
          fetcher.fetch('https://example.com', { maxCostTier: 'lightweight' })
        ).rejects.toThrow();

        expect(mockBrowserManager.browse).not.toHaveBeenCalled();
      });

      it('should track tiersSkipped in budget info', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com', { maxCostTier: 'intelligence' });

        expect(result.budget).toBeDefined();
        expect(result.budget!.tiersSkipped).toContain('lightweight');
        expect(result.budget!.tiersSkipped).toContain('playwright');
        expect(result.budget!.maxCostTierEnforced).toBe('intelligence');
      });

      it('should allow all tiers when maxCostTier=playwright', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com', { maxCostTier: 'playwright' });

        // No tiers should be skipped
        expect(result.budget?.tiersSkipped).toHaveLength(0);
      });

      it('should use all tiers when no maxCostTier set', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com');

        // No tiers should be skipped
        expect(result.budget?.tiersSkipped).toHaveLength(0);
      });
    });

    describe('maxLatencyMs', () => {
      it('should track latencyExceeded in budget info when exceeded', async () => {
        // Simulate slow extraction
        vi.spyOn(mockContentIntelligence, 'extract').mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return createContentResult();
        });

        const result = await fetcher.fetch('https://example.com', { maxLatencyMs: 50 });

        expect(result.budget?.latencyExceeded).toBe(true);
      });

      it('should not mark latencyExceeded when within budget', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com', { maxLatencyMs: 5000 });

        expect(result.budget?.latencyExceeded).toBe(false);
      });

      it('should stop tier fallback when latency budget exceeded', async () => {
        // Make intelligence fail slowly
        vi.spyOn(mockContentIntelligence, 'extract').mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          throw new Error('Intelligence failed slowly');
        });
        vi.spyOn(mockLightweightRenderer, 'render').mockResolvedValue(createLightweightResult());

        // With maxLatencyMs=50, should stop before trying lightweight
        await expect(
          fetcher.fetch('https://example.com', { maxLatencyMs: 50 })
        ).rejects.toThrow();

        // Lightweight should not have been attempted due to latency budget exceeded
        expect(mockLightweightRenderer.render).not.toHaveBeenCalled();
      });
    });

    describe('freshnessRequirement', () => {
      it('should track freshnessApplied in budget info', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com', { freshnessRequirement: 'realtime' });

        expect(result.budget?.freshnessApplied).toBe('realtime');
        expect(result.budget?.usedCache).toBe(false);
      });

      it('should default usedCache to false (cache is at higher level)', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com');

        expect(result.budget?.usedCache).toBe(false);
      });
    });

    describe('budget info structure', () => {
      it('should include complete budget info when budget options set', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com', {
          maxLatencyMs: 5000,
          maxCostTier: 'lightweight',
          freshnessRequirement: 'any',
        });

        expect(result.budget).toEqual({
          latencyExceeded: false,
          tiersSkipped: ['playwright'],
          maxCostTierEnforced: 'lightweight',
          usedCache: false,
          freshnessApplied: 'any',
        });
      });

      it('should include budget info even with no budget options', async () => {
        vi.spyOn(mockContentIntelligence, 'extract').mockResolvedValue(createContentResult());

        const result = await fetcher.fetch('https://example.com');

        expect(result.budget).toBeDefined();
        expect(result.budget!.latencyExceeded).toBe(false);
        expect(result.budget!.tiersSkipped).toHaveLength(0);
        expect(result.budget!.usedCache).toBe(false);
      });
    });
  });
});
