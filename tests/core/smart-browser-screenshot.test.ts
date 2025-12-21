import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartBrowser } from '../../src/core/smart-browser.js';
import { BrowserManager } from '../../src/core/browser-manager.js';
import { ContentExtractor } from '../../src/utils/content-extractor.js';
import { ApiAnalyzer } from '../../src/core/api-analyzer.js';
import { SessionManager } from '../../src/core/session-manager.js';

// Mock the logger to avoid noise in tests
// Note: vi.mock is hoisted, so we inline everything
vi.mock('../../src/utils/logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  return {
    logger: {
      smartBrowser: mockLogger,
      browser: mockLogger,
      learning: mockLogger,
      proceduralMemory: mockLogger,
      intelligence: mockLogger,
      tieredFetcher: mockLogger,
      knowledgeBase: mockLogger,
      embedding: mockLogger,
      browseTool: mockLogger,
      apiCall: mockLogger,
      rateLimiter: mockLogger,
      retry: mockLogger,
      server: mockLogger,
      session: mockLogger,
      create: vi.fn(() => mockLogger),
    },
    Logger: vi.fn().mockImplementation(() => mockLogger),
  };
});

describe('SmartBrowser Screenshot Capture', () => {
  let smartBrowser: SmartBrowser;
  let mockBrowserManager: BrowserManager;
  let mockContentExtractor: ContentExtractor;
  let mockApiAnalyzer: ApiAnalyzer;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    mockBrowserManager = {
      browse: vi.fn(),
      screenshotBase64: vi.fn(),
    } as unknown as BrowserManager;

    mockContentExtractor = {} as ContentExtractor;
    mockApiAnalyzer = {} as ApiAnalyzer;
    mockSessionManager = {} as SessionManager;

    smartBrowser = new SmartBrowser(
      mockBrowserManager,
      mockContentExtractor,
      mockApiAnalyzer,
      mockSessionManager
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('captureScreenshot', () => {
    it('should return error when Playwright is not available', async () => {
      // Mock Playwright as unavailable
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(false);
      vi.spyOn(BrowserManager, 'getPlaywrightError').mockReturnValue('Module not found');

      const result = await smartBrowser.captureScreenshot('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Playwright');
      expect(result.url).toBe('https://example.com');
      expect(result.mimeType).toBe('image/png');
      expect(result.timestamp).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should capture screenshot with default options when Playwright is available', async () => {
      // Mock Playwright as available
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      const mockPage = {
        url: vi.fn().mockReturnValue('https://example.com/redirected'),
        title: vi.fn().mockResolvedValue('Example Page'),
        viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
        close: vi.fn().mockResolvedValue(undefined),
        setViewportSize: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage as any,
        network: [],
        console: [],
      });

      vi.mocked(mockBrowserManager.screenshotBase64).mockResolvedValue('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

      const result = await smartBrowser.captureScreenshot('https://example.com');

      expect(result.success).toBe(true);
      expect(result.image).toBeDefined();
      expect(result.mimeType).toBe('image/png');
      expect(result.url).toBe('https://example.com');
      expect(result.finalUrl).toBe('https://example.com/redirected');
      expect(result.title).toBe('Example Page');
      expect(result.viewport).toEqual({ width: 1920, height: 1080 });
      expect(result.timestamp).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify BrowserManager was called correctly
      expect(mockBrowserManager.browse).toHaveBeenCalledWith('https://example.com', {
        profile: undefined,
        waitFor: 'networkidle',
      });
      expect(mockBrowserManager.screenshotBase64).toHaveBeenCalledWith(mockPage, {
        fullPage: true,
        element: undefined,
      });
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should support custom viewport dimensions', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      const mockPage = {
        url: vi.fn().mockReturnValue('https://example.com'),
        title: vi.fn().mockResolvedValue('Example'),
        viewportSize: vi.fn().mockReturnValue({ width: 800, height: 600 }),
        close: vi.fn().mockResolvedValue(undefined),
        setViewportSize: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage as any,
        network: [],
        console: [],
      });

      vi.mocked(mockBrowserManager.screenshotBase64).mockResolvedValue('base64data');

      await smartBrowser.captureScreenshot('https://example.com', {
        width: 800,
        height: 600,
      });

      expect(mockPage.setViewportSize).toHaveBeenCalledWith({
        width: 800,
        height: 600,
      });
    });

    it('should support element-specific screenshots', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      const mockPage = {
        url: vi.fn().mockReturnValue('https://example.com'),
        title: vi.fn().mockResolvedValue('Example'),
        viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage as any,
        network: [],
        console: [],
      });

      vi.mocked(mockBrowserManager.screenshotBase64).mockResolvedValue('base64data');

      await smartBrowser.captureScreenshot('https://example.com', {
        element: '#main-content',
        fullPage: false,
      });

      expect(mockBrowserManager.screenshotBase64).toHaveBeenCalledWith(mockPage, {
        fullPage: false,
        element: '#main-content',
      });
    });

    it('should wait for selector before capturing', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      const mockPage = {
        url: vi.fn().mockReturnValue('https://example.com'),
        title: vi.fn().mockResolvedValue('Example'),
        viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
        close: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage as any,
        network: [],
        console: [],
      });

      vi.mocked(mockBrowserManager.screenshotBase64).mockResolvedValue('base64data');

      await smartBrowser.captureScreenshot('https://example.com', {
        waitForSelector: '.dynamic-content',
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.dynamic-content', { timeout: 10000 });
    });

    it('should use session profile for authenticated pages', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      const mockPage = {
        url: vi.fn().mockReturnValue('https://example.com'),
        title: vi.fn().mockResolvedValue('Example'),
        viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage as any,
        network: [],
        console: [],
      });

      vi.mocked(mockBrowserManager.screenshotBase64).mockResolvedValue('base64data');

      await smartBrowser.captureScreenshot('https://example.com', {
        sessionProfile: 'my-auth-session',
      });

      expect(mockBrowserManager.browse).toHaveBeenCalledWith('https://example.com', {
        profile: 'my-auth-session',
        waitFor: 'networkidle',
      });
    });

    it('should handle navigation errors gracefully', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      vi.mocked(mockBrowserManager.browse).mockRejectedValue(new Error('Navigation timeout'));

      const result = await smartBrowser.captureScreenshot('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Navigation timeout');
      expect(result.url).toBe('https://example.com');
    });

    it('should handle screenshot errors gracefully', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      const mockPage = {
        url: vi.fn().mockReturnValue('https://example.com'),
        title: vi.fn().mockResolvedValue('Example'),
        viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage as any,
        network: [],
        console: [],
      });

      vi.mocked(mockBrowserManager.screenshotBase64).mockRejectedValue(new Error('Element not found: #missing'));

      const result = await smartBrowser.captureScreenshot('https://example.com', {
        element: '#missing',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Element not found: #missing');
    });

    it('should block unsafe URLs', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      // Private IP should be blocked by SSRF protection
      await expect(smartBrowser.captureScreenshot('http://192.168.1.1/admin')).rejects.toThrow();
    });

    it('should include timing information in response', async () => {
      vi.spyOn(BrowserManager, 'isPlaywrightAvailable').mockReturnValue(true);

      const mockPage = {
        url: vi.fn().mockReturnValue('https://example.com'),
        title: vi.fn().mockResolvedValue('Example'),
        viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(mockBrowserManager.browse).mockResolvedValue({
        page: mockPage as any,
        network: [],
        console: [],
      });

      vi.mocked(mockBrowserManager.screenshotBase64).mockResolvedValue('base64data');

      const result = await smartBrowser.captureScreenshot('https://example.com');

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
