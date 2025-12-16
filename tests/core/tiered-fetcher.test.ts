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
  const createContentResult = (overrides: Partial<ContentResult> = {}): ContentResult => ({
    content: {
      title: 'Test Page',
      text: 'This is enough test content to pass validation. '.repeat(10),
      markdown: '# Test Page\n\nThis is test content.',
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
    mockContentExtractor = {
      extract: vi.fn().mockReturnValue({
        title: 'Extracted Title',
        text: 'This is extracted content with enough text. '.repeat(10),
        markdown: '# Extracted\n\nContent here.',
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
});
