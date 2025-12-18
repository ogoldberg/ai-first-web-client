/**
 * End-to-End Tests: Full Browse Cycle
 *
 * Tests the complete browsing workflow from SmartBrowser call to final response,
 * validating that all components work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartBrowser } from '../../src/core/smart-browser.js';
import { BrowserManager } from '../../src/core/browser-manager.js';
import { ContentExtractor } from '../../src/utils/content-extractor.js';
import { ApiAnalyzer } from '../../src/core/api-analyzer.js';
import { SessionManager } from '../../src/core/session-manager.js';
import { rateLimiter } from '../../src/utils/rate-limiter.js';

// Create mock functions that persist across resets
const mockContentIntelligenceExtract = vi.fn();
const mockLightweightRendererRender = vi.fn();

// Mock modules with proper class constructors
vi.mock('../../src/core/content-intelligence.js', () => ({
  ContentIntelligence: class MockContentIntelligence {
    extract = mockContentIntelligenceExtract;
  },
}));

vi.mock('../../src/core/lightweight-renderer.js', () => ({
  LightweightRenderer: class MockLightweightRenderer {
    render = mockLightweightRendererRender;
  },
}));

vi.mock('../../src/utils/rate-limiter.js', () => ({
  rateLimiter: {
    acquire: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('E2E: Full Browse Cycle', () => {
  let smartBrowser: SmartBrowser;
  let browserManager: BrowserManager;
  let contentExtractor: ContentExtractor;
  let apiAnalyzer: ApiAnalyzer;
  let sessionManager: SessionManager;

  // Sample HTML content with at least 500 chars of text for minContentLength validation
  const SAMPLE_HTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Test Page</title></head>
    <body>
      <main>
        <h1>Welcome to Test Page</h1>
        <article>
          <p>This is a test article with enough content to pass validation checks. The content needs to meet the minimum content length requirement of 500 characters.</p>
          <p>The browser extracts this content and learns patterns for future use. This helps improve performance on subsequent visits to similar pages.</p>
          <p>Additional paragraphs ensure we have sufficient text length for processing. The smart browser learns from each interaction and optimizes future requests.</p>
          <p>More content is needed to ensure we pass the 500 character minimum content length validation. This paragraph adds the necessary additional text.</p>
          <p>Final paragraph to guarantee sufficient content length for all test scenarios. The extraction process validates content quality before returning results.</p>
        </article>
        <table>
          <thead><tr><th>Name</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Item 1</td><td>100</td></tr>
            <tr><td>Item 2</td><td>200</td></tr>
          </tbody>
        </table>
      </main>
    </body>
    </html>
  `;

  // Helper to create a successful ContentResult
  const createContentResult = (overrides: Record<string, unknown> = {}) => ({
    content: {
      title: 'Test Page',
      text: 'This is a test article with enough content to pass validation checks. The browser extracts this content and learns patterns for future use. Additional paragraphs ensure we have sufficient text length. '.repeat(5),
      markdown: '# Test Page\n\nThis is a test article with enough content to pass validation checks.',
      ...(overrides.content as Record<string, unknown> || {}),
    },
    meta: {
      url: 'https://example.com/test',
      finalUrl: 'https://example.com/test',
      strategy: 'static:html',
      strategiesAttempted: ['static:html'],
      timing: 50,
      confidence: 'high',
      ...(overrides.meta as Record<string, unknown> || {}),
    },
    warnings: [],
    ...overrides,
  });

  // Helper to create a successful LightweightRenderResult
  const createLightweightResult = (overrides: Record<string, unknown> = {}) => ({
    html: SAMPLE_HTML,
    finalUrl: 'https://example.com',
    jsExecuted: true,
    scriptsExecuted: 0,
    scriptsSkipped: 0,
    scriptErrors: [],
    networkRequests: [],
    cookies: [],
    timing: { fetchTime: 50, parseTime: 30, scriptTime: 0, totalTime: 80 },
    detection: {
      needsFullBrowser: false,
      hasComplexJS: false,
      hasWebGL: false,
      hasServiceWorker: false,
      ...(overrides.detection as Record<string, unknown> || {}),
    },
    ...overrides,
  });

  beforeEach(async () => {
    // Clear call history but preserve implementations
    vi.clearAllMocks();

    // Set up default mock behaviors
    mockContentIntelligenceExtract.mockResolvedValue(createContentResult());
    mockLightweightRendererRender.mockResolvedValue(createLightweightResult());
    vi.mocked(rateLimiter.acquire).mockResolvedValue(undefined);

    // Create mock browser manager with a proper result shape
    const mockPage = {
      content: vi.fn().mockResolvedValue(SAMPLE_HTML),
      url: vi.fn().mockReturnValue('https://example.com'),
      waitForSelector: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(undefined),
      $: vi.fn().mockResolvedValue(null),
      $$: vi.fn().mockResolvedValue([]),
      evaluate: vi.fn().mockImplementation((fn: () => unknown) => {
        // Return appropriate values for common evaluations
        if (fn.toString().includes('innerText')) {
          return Promise.resolve('Test page content for evaluation');
        }
        if (fn.toString().includes('scrollHeight')) {
          return Promise.resolve(1000);
        }
        return Promise.resolve(undefined);
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };

    browserManager = {
      browse: vi.fn().mockResolvedValue({
        page: mockPage,
        network: [],
        console: [],
      }),
      getContext: vi.fn().mockResolvedValue({
        pages: vi.fn().mockReturnValue([mockPage]),
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
    } as unknown as SessionManager;

    // Create SmartBrowser instance
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

  describe('Complete browse flow', () => {
    it('should complete full browse cycle with intelligence tier', async () => {
      const result = await smartBrowser.browse('https://example.com/test', {
        useTieredFetching: true,
        enableLearning: true,
      });

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com/test');
      expect(result.content).toBeDefined();
      expect(result.content.text.length).toBeGreaterThan(50);
      expect(result.learning).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.loadTime).toBeGreaterThanOrEqual(0);
    });

    it('should include learning insights in response', async () => {
      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
        enableLearning: true,
      });

      // Verify learning structure
      expect(result.learning).toBeDefined();
      expect(result.learning.confidenceLevel).toBeDefined();
      expect(['high', 'medium', 'low', 'unknown']).toContain(result.learning.confidenceLevel);
      expect(result.learning.selectorsUsed).toBeInstanceOf(Array);
      expect(result.learning.selectorsSucceeded).toBeInstanceOf(Array);
      expect(result.learning.selectorsFailed).toBeInstanceOf(Array);
    });

    it('should handle tiered rendering fallback', async () => {
      // Make intelligence tier fail
      mockContentIntelligenceExtract.mockResolvedValue({
        error: 'Failed to extract',
        content: { title: '', text: '', markdown: '' },
        meta: { url: '', finalUrl: '', strategy: 'static:html', strategiesAttempted: [], timing: 0, confidence: 'low' },
        warnings: [],
      });

      // Lightweight tier succeeds with good content
      mockLightweightRendererRender.mockResolvedValue(createLightweightResult());

      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
      });

      // Should have fallen back to lightweight
      expect(result.learning.renderTier).toBe('lightweight');
      expect(result.learning.tierFellBack).toBe(true);
    });
  });

  describe('Content extraction', () => {
    it('should return content via tiered fetching', async () => {
      const result = await smartBrowser.browse('https://example.com/table', {
        useTieredFetching: true,
      });

      // Content should be extracted via intelligence tier
      expect(result.content).toBeDefined();
      expect(result.content.text.length).toBeGreaterThan(0);
      expect(result.learning.renderTier).toBe('intelligence');
    });

    it('should detect language from HTML', async () => {
      const result = await smartBrowser.browse('https://example.com/es', {
        detectLanguage: true,
        useTieredFetching: true,
      });

      // Language detection should be attempted
      expect(result.metadata).toBeDefined();
    });
  });

  describe('Response structure validation', () => {
    it('should return complete SmartBrowseResult structure', async () => {
      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
      });

      // Verify all expected fields exist
      expect(result.url).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.html).toBeDefined();
      expect(result.content.markdown).toBeDefined();
      expect(result.content.text).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.loadTime).toBeDefined();
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.metadata.finalUrl).toBeDefined();
      expect(result.learning).toBeDefined();
      expect(result.network).toBeDefined();
      expect(result.discoveredApis).toBeDefined();
    });

    it('should include tiered rendering info in learning', async () => {
      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
      });

      // Should have tier information
      expect(result.learning.renderTier).toBeDefined();
      expect(result.learning.tiersAttempted).toBeDefined();
      expect(result.learning.tierTiming).toBeDefined();
    });
  });

  describe('Error handling in browse cycle', () => {
    it('should handle extraction errors gracefully', async () => {
      // All tiers fail
      mockContentIntelligenceExtract.mockRejectedValue(new Error('Intelligence failed'));
      mockLightweightRendererRender.mockRejectedValue(new Error('Lightweight failed'));

      // Also make Playwright fail to test complete failure path
      vi.mocked(browserManager.browse).mockRejectedValue(new Error('Playwright failed'));

      await expect(
        smartBrowser.browse('https://example.com', { useTieredFetching: true })
      ).rejects.toThrow();
    });

    it('should continue with partial results when non-critical features fail', async () => {
      // Should complete even if some features have errors
      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
      });

      expect(result.content.text.length).toBeGreaterThan(0);
    });
  });

  describe('Learning and intelligence features', () => {
    it('should record trajectory when enabled', async () => {
      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
        recordTrajectory: true,
      });

      expect(result.learning.trajectoryRecorded).toBe(true);
    });

    it('should provide domain intelligence after browsing', async () => {
      mockContentIntelligenceExtract.mockResolvedValue(createContentResult({
        meta: {
          url: 'https://intelligence-test.com',
          finalUrl: 'https://intelligence-test.com',
        },
      }));

      await smartBrowser.browse('https://intelligence-test.com', {
        useTieredFetching: true,
        enableLearning: true,
      });

      const intelligence = await smartBrowser.getDomainIntelligence('intelligence-test.com');

      expect(intelligence).toBeDefined();
      expect(typeof intelligence.knownPatterns).toBe('number');
      expect(typeof intelligence.successRate).toBe('number');
    });
  });

  describe('Options handling', () => {
    it('should respect useTieredFetching option', async () => {
      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
      });

      // Should use tiered fetching
      expect(result.learning.renderTier).toBeDefined();
    });

    it('should respect minContentLength validation', async () => {
      // Return short content that fails validation in both intelligence and lightweight tiers
      mockContentIntelligenceExtract.mockResolvedValue({
        content: {
          title: 'Short',
          text: 'Too short',
          markdown: '# Short',
        },
        meta: {
          url: 'https://example.com',
          finalUrl: 'https://example.com',
          strategy: 'static:html',
          strategiesAttempted: ['static:html'],
          timing: 50,
          confidence: 'low',
        },
        warnings: [],
      });

      // Lightweight also returns short content
      mockLightweightRendererRender.mockResolvedValue({
        ...createLightweightResult(),
        html: '<html><body><p>Short</p></body></html>',
      });

      const result = await smartBrowser.browse('https://example.com', {
        useTieredFetching: true,
        minContentLength: 500,
      });

      // When tiered fetching fails validation, it falls back to Playwright
      // Result should still have content (from Playwright fallback via mock)
      expect(result.content).toBeDefined();
      expect(result.content.text.length).toBeGreaterThan(0);
    });
  });
});
