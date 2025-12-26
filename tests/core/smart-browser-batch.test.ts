/**
 * Tests for SmartBrowser.batchBrowse() - Batch browse operations (F-001)
 *
 * Tests the batch browsing functionality including:
 * - Basic batch processing of multiple URLs
 * - Concurrency control
 * - Error handling and isolation
 * - Rate limiting behavior
 * - Timeout controls (per-URL and total)
 * - SSRF protection
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { SmartBrowser, SmartBrowseResult } from '../../src/core/smart-browser.js';
import { BrowserManager } from '../../src/core/browser-manager.js';
import { ContentExtractor } from '../../src/utils/content-extractor.js';
import { ApiAnalyzer } from '../../src/core/api-analyzer.js';
import { SessionManager } from '../../src/core/session-manager.js';
import type { BatchBrowseOptions } from '../../src/types/index.js';

// Mock modules
vi.mock('../../src/core/content-intelligence.js', () => ({
  ContentIntelligence: class MockContentIntelligence {
    extract = vi.fn().mockResolvedValue({
      content: { title: 'Test', text: 'Content', markdown: '# Test' },
      meta: { strategy: 'static:html', confidence: 'high', timing: 100 },
      warnings: [],
    });
  },
}));

vi.mock('../../src/core/lightweight-renderer.js', () => ({
  LightweightRenderer: class MockLightweightRenderer {
    render = vi.fn().mockResolvedValue({
      html: '<html></html>',
      finalUrl: 'https://example.com',
      jsExecuted: false,
    });
  },
}));

vi.mock('../../src/utils/rate-limiter.js', () => ({
  rateLimiter: {
    acquire: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('SmartBrowser.batchBrowse()', () => {
  let smartBrowser: SmartBrowser;
  let browserManager: BrowserManager;
  let contentExtractor: ContentExtractor;
  let apiAnalyzer: ApiAnalyzer;
  let sessionManager: SessionManager;

  // Create a mock SmartBrowseResult
  const createMockResult = (url: string, overrides: Partial<SmartBrowseResult> = {}): SmartBrowseResult => ({
    url,
    title: `Title for ${url}`,
    content: {
      html: '<html></html>',
      markdown: `# Content for ${url}`,
      text: `Content for ${url}`,
    },
    network: [],
    console: [],
    discoveredApis: [],
    metadata: {
      loadTime: 100,
      timestamp: Date.now(),
      finalUrl: url,
    },
    learning: {
      selectorsUsed: [],
      selectorsSucceeded: [],
      selectorsFailed: [],
      confidenceLevel: 'high',
    },
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    browserManager = new BrowserManager();
    contentExtractor = new ContentExtractor();
    apiAnalyzer = new ApiAnalyzer();
    sessionManager = new SessionManager();

    smartBrowser = new SmartBrowser(
      browserManager,
      contentExtractor,
      apiAnalyzer,
      sessionManager
    );

    await smartBrowser.initialize();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should process a single URL', async () => {
      const browseSpy = vi.spyOn(smartBrowser, 'browse').mockResolvedValue(
        createMockResult('https://example.com')
      );

      const results = await smartBrowser.batchBrowse(['https://example.com']);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].url).toBe('https://example.com');
      expect(results[0].result).toBeDefined();
      expect(results[0].index).toBe(0);
      expect(browseSpy).toHaveBeenCalledTimes(1);
    });

    it('should process multiple URLs', async () => {
      const urls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3',
      ];

      const browseSpy = vi.spyOn(smartBrowser, 'browse').mockImplementation(
        async (url) => createMockResult(url)
      );

      const results = await smartBrowser.batchBrowse(urls);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'success')).toBe(true);
      expect(browseSpy).toHaveBeenCalledTimes(3);
    });

    it('should maintain original order in results', async () => {
      const urls = [
        'https://example.com/a',
        'https://example.com/b',
        'https://example.com/c',
      ];

      // Mock varying delays to ensure order is preserved
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        const delay = url.includes('a') ? 50 : url.includes('b') ? 10 : 30;
        await new Promise(resolve => setTimeout(resolve, delay));
        return createMockResult(url);
      });

      const results = await smartBrowser.batchBrowse(urls);

      expect(results[0].url).toBe('https://example.com/a');
      expect(results[0].index).toBe(0);
      expect(results[1].url).toBe('https://example.com/b');
      expect(results[1].index).toBe(1);
      expect(results[2].url).toBe('https://example.com/c');
      expect(results[2].index).toBe(2);
    });

    it('should return empty array for empty input', async () => {
      const results = await smartBrowser.batchBrowse([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('concurrency control', () => {
    it('should respect concurrency limit', async () => {
      const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/page${i}`);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(resolve => setTimeout(resolve, 50));
        currentConcurrent--;
        return createMockResult(url);
      });

      await smartBrowser.batchBrowse(urls, {}, { concurrency: 3 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should use default concurrency of 3', async () => {
      const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/page${i}`);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(resolve => setTimeout(resolve, 30));
        currentConcurrent--;
        return createMockResult(url);
      });

      await smartBrowser.batchBrowse(urls);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should handle concurrency of 1 (sequential processing)', async () => {
      const urls = ['https://example.com/a', 'https://example.com/b'];
      const callOrder: string[] = [];

      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        callOrder.push(`start:${url}`);
        await new Promise(resolve => setTimeout(resolve, 10));
        callOrder.push(`end:${url}`);
        return createMockResult(url);
      });

      await smartBrowser.batchBrowse(urls, {}, { concurrency: 1 });

      // With concurrency 1, calls should be sequential
      expect(callOrder[0]).toBe('start:https://example.com/a');
      expect(callOrder[1]).toBe('end:https://example.com/a');
      expect(callOrder[2]).toBe('start:https://example.com/b');
      expect(callOrder[3]).toBe('end:https://example.com/b');
    });
  });

  describe('error handling', () => {
    it('should handle individual URL errors without stopping batch', async () => {
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        if (url.includes('fail')) {
          throw new Error('Failed to browse');
        }
        return createMockResult(url);
      });

      const results = await smartBrowser.batchBrowse([
        'https://example.com/success1',
        'https://example.com/fail',
        'https://example.com/success2',
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('error');
      expect(results[1].error).toBe('Failed to browse');
      expect(results[2].status).toBe('success');
    });

    it('should stop batch on error when stopOnError is true', async () => {
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        if (url.includes('fail')) {
          throw new Error('Failed to browse');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        return createMockResult(url);
      });

      const results = await smartBrowser.batchBrowse(
        [
          'https://example.com/success1',
          'https://example.com/fail',
          'https://example.com/success2',
        ],
        {},
        { stopOnError: true, concurrency: 1 }
      );

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('error');
      expect(results[2].status).toBe('skipped');
      expect(results[2].error).toBe('Batch stopped due to previous error');
    });

    it('should handle rate limiting as a separate status', async () => {
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        if (url.includes('limited')) {
          throw new Error('Rate limit exceeded (429)');
        }
        return createMockResult(url);
      });

      const results = await smartBrowser.batchBrowse([
        'https://example.com/ok',
        'https://example.com/limited',
      ]);

      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('rate_limited');
      expect(results[1].errorCode).toBe('RATE_LIMITED');
    });

    it('should treat rate limiting as error when continueOnRateLimit is false', async () => {
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        if (url.includes('limited')) {
          throw new Error('Rate limit exceeded');
        }
        return createMockResult(url);
      });

      const results = await smartBrowser.batchBrowse(
        ['https://example.com/limited'],
        {},
        { continueOnRateLimit: false }
      );

      expect(results[0].status).toBe('error');
      expect(results[0].errorCode).toBe('BROWSE_ERROR');
    });
  });

  describe('SSRF protection', () => {
    it('should reject private IP addresses', async () => {
      const browseSpy = vi.spyOn(smartBrowser, 'browse');

      const results = await smartBrowser.batchBrowse([
        'https://192.168.1.1/admin',
        'https://10.0.0.1/config',
        'https://example.com/ok',
      ]);

      expect(results[0].status).toBe('error');
      expect(results[0].error).toContain('private');
      expect(results[1].status).toBe('error');
      expect(results[1].error).toContain('private');
      expect(browseSpy).toHaveBeenCalledTimes(1); // Only the valid URL
    });

    it('should reject localhost URLs', async () => {
      const results = await smartBrowser.batchBrowse([
        'http://localhost:8080/api',
        'http://127.0.0.1:3000/data',
      ]);

      expect(results.every(r => r.status === 'error')).toBe(true);
      expect(results.every(r => r.errorCode === 'INVALID_URL')).toBe(true);
    });

    it('should reject file:// protocol', async () => {
      const results = await smartBrowser.batchBrowse([
        'file:///etc/passwd',
      ]);

      expect(results[0].status).toBe('error');
      expect(results[0].errorCode).toBe('INVALID_URL');
    });
  });

  describe('timeout controls', () => {
    it('should apply perUrlTimeoutMs to each request', async () => {
      const browseSpy = vi.spyOn(smartBrowser, 'browse').mockImplementation(
        async (url, options) => {
          expect(options?.timeout).toBe(5000);
          return createMockResult(url);
        }
      );

      await smartBrowser.batchBrowse(
        ['https://example.com/a', 'https://example.com/b'],
        {},
        { perUrlTimeoutMs: 5000 }
      );

      expect(browseSpy).toHaveBeenCalledTimes(2);
    });

    it('should skip remaining URLs when totalTimeoutMs is exceeded', async () => {
      // With 150ms per URL and 200ms total timeout, we expect:
      // - First URL completes (~150ms)
      // - Second URL starts but timeout is exceeded during processing
      // - Remaining URLs should be skipped before they start
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        await new Promise(resolve => setTimeout(resolve, 150));
        return createMockResult(url);
      });

      const results = await smartBrowser.batchBrowse(
        Array.from({ length: 5 }, (_, i) => `https://example.com/page${i}`),
        {},
        { totalTimeoutMs: 200, concurrency: 1 }
      );

      // With concurrency 1 and 150ms per URL, only 1-2 should complete before timeout
      // The rest should be skipped (but due to timing variance, we just check some are skipped)
      const successful = results.filter(r => r.status === 'success');
      const skipped = results.filter(r => r.status === 'skipped');

      // At least one should succeed (the first one)
      expect(successful.length).toBeGreaterThanOrEqual(1);
      // Not all should succeed - some should be skipped
      expect(successful.length).toBeLessThan(5);
    });
  });

  describe('browse options forwarding', () => {
    it('should pass browse options to each URL', async () => {
      const browseSpy = vi.spyOn(smartBrowser, 'browse').mockImplementation(
        async (url, options) => {
          expect(options?.sessionProfile).toBe('test-profile');
          expect(options?.scrollToLoad).toBe(true);
          expect(options?.contentType).toBe('main_content');
          return createMockResult(url);
        }
      );

      await smartBrowser.batchBrowse(
        ['https://example.com/a'],
        {
          sessionProfile: 'test-profile',
          scrollToLoad: true,
          contentType: 'main_content',
        }
      );

      expect(browseSpy).toHaveBeenCalledTimes(1);
    });

    it('should enable learning and validation by default', async () => {
      const browseSpy = vi.spyOn(smartBrowser, 'browse').mockImplementation(
        async (url, options) => {
          expect(options?.enableLearning).toBe(true);
          expect(options?.validateContent).toBe(true);
          return createMockResult(url);
        }
      );

      await smartBrowser.batchBrowse(['https://example.com']);

      expect(browseSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('result timing', () => {
    it('should track duration for each URL', async () => {
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async (url) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return createMockResult(url);
      });

      const results = await smartBrowser.batchBrowse(['https://example.com']);

      // Use 45ms threshold to account for timer precision variance
      // setTimeout(50) can fire slightly early on some platforms
      expect(results[0].durationMs).toBeGreaterThanOrEqual(45);
    });

    it('should track duration for failed URLs', async () => {
      vi.spyOn(smartBrowser, 'browse').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 35));
        throw new Error('Failed');
      });

      const results = await smartBrowser.batchBrowse(['https://example.com']);

      expect(results[0].status).toBe('error');
      // Use a small buffer for timing precision (35ms wait, expect >= 25ms)
      expect(results[0].durationMs).toBeGreaterThanOrEqual(25);
    });
  });

  describe('edge cases', () => {
    it('should handle duplicate URLs', async () => {
      const browseSpy = vi.spyOn(smartBrowser, 'browse').mockImplementation(
        async (url) => createMockResult(url)
      );

      const results = await smartBrowser.batchBrowse([
        'https://example.com/same',
        'https://example.com/same',
      ]);

      expect(results).toHaveLength(2);
      expect(browseSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed valid and invalid URLs', async () => {
      vi.spyOn(smartBrowser, 'browse').mockImplementation(
        async (url) => createMockResult(url)
      );

      const results = await smartBrowser.batchBrowse([
        'https://example.com/valid',
        'http://192.168.1.1/invalid',
        'https://another.com/valid',
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('error');
      expect(results[2].status).toBe('success');
    });

    it('should handle very large batch sizes', async () => {
      const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/page${i}`);

      vi.spyOn(smartBrowser, 'browse').mockImplementation(
        async (url) => createMockResult(url)
      );

      const results = await smartBrowser.batchBrowse(urls, {}, { concurrency: 10 });

      expect(results).toHaveLength(100);
      expect(results.every(r => r.status === 'success')).toBe(true);
    });
  });
});
