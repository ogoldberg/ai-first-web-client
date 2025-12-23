/**
 * SDK HTTP Client Integration Tests
 *
 * Tests for @unbrowser/core HTTP client in isolation (no MCP).
 * These tests ensure all SDK features work programmatically.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createUnbrowser,
  UnbrowserClient,
  UnbrowserError,
  type UnbrowserConfig,
  type BrowseOptions,
  type BrowseResult,
  type BatchResult,
  type SessionData,
  type Cookie,
  type DomainIntelligence,
} from '../../packages/core/src/index.js';

// Mock fetch for testing
const mockFetch = vi.fn();

describe('SDK HTTP Client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ============================================
  // Client Construction
  // ============================================

  describe('createUnbrowser()', () => {
    it('should create a client with valid config', () => {
      const client = createUnbrowser({
        apiKey: 'ub_live_test123',
      });

      expect(client).toBeInstanceOf(UnbrowserClient);
    });

    it('should throw MISSING_API_KEY when apiKey is empty', () => {
      expect(() =>
        createUnbrowser({
          apiKey: '',
        })
      ).toThrow(UnbrowserError);

      try {
        createUnbrowser({ apiKey: '' });
      } catch (error) {
        expect((error as UnbrowserError).code).toBe('MISSING_API_KEY');
      }
    });

    it('should throw INVALID_API_KEY when apiKey format is wrong', () => {
      expect(() =>
        createUnbrowser({
          apiKey: 'invalid_key_format',
        })
      ).toThrow(UnbrowserError);

      try {
        createUnbrowser({ apiKey: 'invalid_key' });
      } catch (error) {
        expect((error as UnbrowserError).code).toBe('INVALID_API_KEY');
      }
    });

    it('should accept valid API key formats', () => {
      // Live key
      expect(() => createUnbrowser({ apiKey: 'ub_live_abc123' })).not.toThrow();

      // Test key
      expect(() => createUnbrowser({ apiKey: 'ub_test_xyz789' })).not.toThrow();
    });

    it('should use default values for optional config', () => {
      const client = createUnbrowser({
        apiKey: 'ub_live_test123',
      });

      // Client should be created successfully with defaults
      expect(client).toBeInstanceOf(UnbrowserClient);
    });

    it('should accept custom baseUrl', () => {
      const client = createUnbrowser({
        apiKey: 'ub_live_test123',
        baseUrl: 'https://custom.api.example.com',
      });

      expect(client).toBeInstanceOf(UnbrowserClient);
    });

    it('should accept custom timeout', () => {
      const client = createUnbrowser({
        apiKey: 'ub_live_test123',
        timeout: 30000,
      });

      expect(client).toBeInstanceOf(UnbrowserClient);
    });

    it('should accept retry configuration', () => {
      const client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: true,
        maxRetries: 5,
      });

      expect(client).toBeInstanceOf(UnbrowserClient);
    });
  });

  // ============================================
  // Browse Method
  // ============================================

  describe('client.browse()', () => {
    let client: UnbrowserClient;

    beforeEach(() => {
      client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: false, // Disable retry for faster tests
      });
    });

    it('should make a POST request to /v1/browse', async () => {
      const mockResult: BrowseResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com',
        title: 'Example Domain',
        content: {
          markdown: '# Example Domain\n\nThis is an example.',
          text: 'Example Domain\n\nThis is an example.',
        },
        metadata: {
          loadTime: 150,
          tier: 'intelligence',
          tiersAttempted: ['intelligence'],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const result = await client.browse('https://example.com');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.unbrowser.ai/v1/browse');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer ub_live_test123');

      const body = JSON.parse(options.body);
      expect(body.url).toBe('https://example.com');

      expect(result).toEqual(mockResult);
    });

    it('should pass browse options', async () => {
      const mockResult: BrowseResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com',
        title: 'Example',
        content: { markdown: '', text: '' },
        metadata: { loadTime: 100, tier: 'intelligence', tiersAttempted: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const options: BrowseOptions = {
        contentType: 'text',
        waitForSelector: '.content',
        maxChars: 5000,
        includeTables: true,
        maxLatencyMs: 2000,
        maxCostTier: 'lightweight',
      };

      await client.browse('https://example.com', options);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.options).toEqual(options);
    });

    it('should pass session data', async () => {
      const mockResult: BrowseResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com',
        title: 'Example',
        content: { markdown: '', text: '' },
        metadata: { loadTime: 100, tier: 'intelligence', tiersAttempted: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const session: SessionData = {
        cookies: [{ name: 'session', value: 'abc123', domain: 'example.com' }],
        localStorage: { theme: 'dark' },
      };

      await client.browse('https://example.com', {}, session);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.session).toEqual(session);
    });

    it('should throw UnbrowserError on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'BROWSE_ERROR', message: 'Failed to browse' },
        }),
      });

      try {
        await client.browse('https://example.com');
        expect.fail('Expected UnbrowserError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnbrowserError);
        expect((error as UnbrowserError).code).toBe('BROWSE_ERROR');
      }
    });

    it('should handle UNAUTHORIZED error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        }),
      });

      await expect(client.browse('https://example.com')).rejects.toThrow(UnbrowserError);
    });

    it('should handle RATE_LIMITED error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        }),
      });

      await expect(client.browse('https://example.com')).rejects.toThrow(UnbrowserError);
    });
  });

  // ============================================
  // Batch Method
  // ============================================

  describe('client.batch()', () => {
    let client: UnbrowserClient;

    beforeEach(() => {
      client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: false,
      });
    });

    it('should make a POST request to /v1/batch', async () => {
      const mockResult: BatchResult = {
        results: [
          {
            url: 'https://example.com/page1',
            success: true,
            data: {
              url: 'https://example.com/page1',
              finalUrl: 'https://example.com/page1',
              title: 'Page 1',
              content: { markdown: '', text: '' },
              metadata: { loadTime: 100, tier: 'intelligence', tiersAttempted: [] },
            },
          },
          {
            url: 'https://example.com/page2',
            success: true,
            data: {
              url: 'https://example.com/page2',
              finalUrl: 'https://example.com/page2',
              title: 'Page 2',
              content: { markdown: '', text: '' },
              metadata: { loadTime: 150, tier: 'intelligence', tiersAttempted: [] },
            },
          },
        ],
        totalTime: 250,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const result = await client.batch([
        'https://example.com/page1',
        'https://example.com/page2',
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.unbrowser.ai/v1/batch');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.urls).toEqual([
        'https://example.com/page1',
        'https://example.com/page2',
      ]);

      expect(result).toEqual(mockResult);
    });

    it('should handle partial failures in batch', async () => {
      const mockResult: BatchResult = {
        results: [
          {
            url: 'https://example.com/page1',
            success: true,
            data: {
              url: 'https://example.com/page1',
              finalUrl: 'https://example.com/page1',
              title: 'Page 1',
              content: { markdown: '', text: '' },
              metadata: { loadTime: 100, tier: 'intelligence', tiersAttempted: [] },
            },
          },
          {
            url: 'https://example.com/page2',
            success: false,
            error: { code: 'BROWSE_ERROR', message: 'Failed to load' },
          },
        ],
        totalTime: 300,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const result = await client.batch([
        'https://example.com/page1',
        'https://example.com/page2',
      ]);

      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error?.code).toBe('BROWSE_ERROR');
    });
  });

  // ============================================
  // Fetch Method
  // ============================================

  describe('client.fetch()', () => {
    let client: UnbrowserClient;

    beforeEach(() => {
      client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: false,
      });
    });

    it('should make a POST request to /v1/fetch', async () => {
      const mockResult: BrowseResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com',
        title: 'Example',
        content: { markdown: '', text: '' },
        metadata: { loadTime: 50, tier: 'intelligence', tiersAttempted: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const result = await client.fetch('https://example.com');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.unbrowser.ai/v1/fetch');

      expect(result).toEqual(mockResult);
    });
  });

  // ============================================
  // Domain Intelligence
  // ============================================

  describe('client.getDomainIntelligence()', () => {
    let client: UnbrowserClient;

    beforeEach(() => {
      client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: false,
      });
    });

    it('should make a GET request to /v1/domains/:domain/intelligence', async () => {
      const mockResult: DomainIntelligence = {
        domain: 'example.com',
        knownPatterns: 5,
        selectorChains: 3,
        validators: 2,
        paginationPatterns: 1,
        recentFailures: 0,
        successRate: 0.95,
        domainGroup: 'general',
        recommendedWaitStrategy: 'load',
        shouldUseSession: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const result = await client.getDomainIntelligence('example.com');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.unbrowser.ai/v1/domains/example.com/intelligence');
      expect(options.method).toBe('GET');

      expect(result).toEqual(mockResult);
    });

    it('should encode domain with special characters', async () => {
      const mockResult: DomainIntelligence = {
        domain: 'sub.example.com',
        knownPatterns: 0,
        selectorChains: 0,
        validators: 0,
        paginationPatterns: 0,
        recentFailures: 0,
        successRate: 0,
        domainGroup: null,
        recommendedWaitStrategy: 'load',
        shouldUseSession: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      await client.getDomainIntelligence('sub.example.com');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.unbrowser.ai/v1/domains/sub.example.com/intelligence');
    });
  });

  // ============================================
  // Usage Statistics
  // ============================================

  describe('client.getUsage()', () => {
    let client: UnbrowserClient;

    beforeEach(() => {
      client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: false,
      });
    });

    it('should make a GET request to /v1/usage', async () => {
      const mockResult = {
        period: { start: '2025-12-01', end: '2025-12-31' },
        requests: {
          total: 1000,
          byTier: { intelligence: 500, lightweight: 300, playwright: 200 },
        },
        limits: { daily: 10000, remaining: 9000 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      const result = await client.getUsage();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.unbrowser.ai/v1/usage');
      expect(options.method).toBe('GET');

      expect(result).toEqual(mockResult);
    });
  });

  // ============================================
  // Health Check
  // ============================================

  describe('client.health()', () => {
    let client: UnbrowserClient;

    beforeEach(() => {
      client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: false,
      });
    });

    it('should make a GET request to /health (no auth)', async () => {
      const mockResult = {
        status: 'ok',
        version: '1.0.0',
        uptime: 86400,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await client.health();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.unbrowser.ai/health');
      expect(options.method).toBe('GET');
      // Health check should NOT include Authorization header
      expect(options.headers['Authorization']).toBeUndefined();

      expect(result).toEqual(mockResult);
    });

    it('should throw on health check failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      await expect(client.health()).rejects.toThrow(UnbrowserError);
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('Error Handling', () => {
    let client: UnbrowserClient;

    beforeEach(() => {
      client = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: false,
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.browse('https://example.com')).rejects.toThrow();
    });

    it('should handle timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.browse('https://example.com');
        expect.fail('Expected UnbrowserError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnbrowserError);
        expect((error as UnbrowserError).code).toBe('REQUEST_ABORTED');
      }
    });

    it('should not retry on UNAUTHORIZED', async () => {
      const clientWithRetry = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: true,
        maxRetries: 3,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        }),
      });

      await expect(clientWithRetry.browse('https://example.com')).rejects.toThrow(UnbrowserError);

      // Should only be called once (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on INVALID_URL', async () => {
      const clientWithRetry = createUnbrowser({
        apiKey: 'ub_live_test123',
        retry: true,
        maxRetries: 3,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'INVALID_URL', message: 'Invalid URL' },
        }),
      });

      await expect(clientWithRetry.browse('not-a-url')).rejects.toThrow(UnbrowserError);

      // Should only be called once (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Custom Base URL
  // ============================================

  describe('Custom Base URL', () => {
    it('should use custom base URL for all requests', async () => {
      const client = createUnbrowser({
        apiKey: 'ub_live_test123',
        baseUrl: 'https://custom.api.example.com',
        retry: false,
      });

      const mockResult: BrowseResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com',
        title: 'Example',
        content: { markdown: '', text: '' },
        metadata: { loadTime: 100, tier: 'intelligence', tiersAttempted: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      await client.browse('https://example.com');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.api.example.com/v1/browse');
    });

    it('should strip trailing slash from base URL', async () => {
      const client = createUnbrowser({
        apiKey: 'ub_live_test123',
        baseUrl: 'https://custom.api.example.com/',
        retry: false,
      });

      const mockResult: BrowseResult = {
        url: 'https://example.com',
        finalUrl: 'https://example.com',
        title: 'Example',
        content: { markdown: '', text: '' },
        metadata: { loadTime: 100, tier: 'intelligence', tiersAttempted: [] },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockResult }),
      });

      await client.browse('https://example.com');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.api.example.com/v1/browse');
    });
  });

  // ============================================
  // Type Exports
  // ============================================

  describe('Type Exports', () => {
    it('should export all required types', () => {
      // These are compile-time checks - if they compile, they pass
      const config: UnbrowserConfig = { apiKey: 'ub_live_test' };
      const options: BrowseOptions = { contentType: 'markdown' };
      const session: SessionData = { cookies: [] };
      const cookie: Cookie = { name: 'test', value: 'value' };

      expect(config.apiKey).toBe('ub_live_test');
      expect(options.contentType).toBe('markdown');
      expect(session.cookies).toEqual([]);
      expect(cookie.name).toBe('test');
    });

    it('should export UnbrowserError class', () => {
      const error = new UnbrowserError('TEST_ERROR', 'Test message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnbrowserError);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('UnbrowserError');
    });
  });
});
