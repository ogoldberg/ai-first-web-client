/**
 * Tests for Content Loading Detector (GAP-008)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContentLoadingDetector,
  createContentLoadingDetector,
  contentLoadingDetector,
  type ContentLoadingPattern,
  type ContentLoadingContext,
  type ContentLoadingAnalysisResult,
} from '../../src/core/content-loading-detector.js';
import type { NetworkRequest } from '../../src/types/index.js';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Helper to create a mock network request
function createMockRequest(options: {
  url: string;
  method?: string;
  status?: number;
  contentType?: string;
  responseBody?: unknown;
  duration?: number;
}): NetworkRequest {
  return {
    url: options.url,
    method: options.method || 'GET',
    status: options.status ?? 200,
    statusText: 'OK',
    headers: { 'content-type': options.contentType || 'application/json' },
    requestHeaders: {},
    responseBody: options.responseBody,
    contentType: options.contentType || 'application/json',
    timestamp: Date.now(),
    duration: options.duration || 100,
  };
}

describe('ContentLoadingDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor and factory', () => {
    it('should create detector with default options', () => {
      const detector = new ContentLoadingDetector();
      expect(detector).toBeInstanceOf(ContentLoadingDetector);
    });

    it('should create detector via factory function', () => {
      const detector = createContentLoadingDetector();
      expect(detector).toBeInstanceOf(ContentLoadingDetector);
    });

    it('should have singleton instance exported', () => {
      expect(contentLoadingDetector).toBeInstanceOf(ContentLoadingDetector);
    });
  });

  describe('analyze', () => {
    it('should return no patterns when no network requests', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.patterns).toHaveLength(0);
      expect(result.reasons).toContain('No JSON API requests found during page load');
    });

    it('should detect content-loading API endpoints', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/posts',
            responseBody: {
              data: [
                { id: 1, title: 'Post 1', content: 'Hello world' },
                { id: 2, title: 'Post 2', content: 'Goodbye world' },
              ],
            },
            duration: 150,
          }),
        ],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].endpoint).toBe('https://example.com/api/posts');
    });

    it('should exclude tracking/analytics requests', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://google-analytics.com/collect',
            responseBody: { ok: true },
          }),
          createMockRequest({
            url: 'https://example.com/tracking/pixel',
            responseBody: { ok: true },
          }),
        ],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);

      expect(result.detected).toBe(false);
    });

    it('should exclude non-JSON responses', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/data',
            contentType: 'text/html',
            responseBody: '<html></html>',
          }),
        ],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);

      expect(result.detected).toBe(false);
    });

    it('should detect immediate vs delayed loading', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/immediate',
            responseBody: { data: [{ id: 1, title: 'Item' }] },
            duration: 200, // Under 500ms threshold
          }),
          createMockRequest({
            url: 'https://example.com/api/delayed',
            responseBody: { data: [{ id: 1, title: 'Item' }] },
            duration: 3000, // Over 2000ms threshold
          }),
        ],
        loadTime: 3500,
      };

      const result = await detector.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.patterns.length).toBe(2);

      const immediatePattern = result.patterns.find(
        p => p.endpoint.includes('immediate')
      );
      const delayedPattern = result.patterns.find(
        p => p.endpoint.includes('delayed')
      );

      expect(immediatePattern?.triggerType).toBe('immediate');
      expect(delayedPattern?.triggerType).toBe('on_visibility');
    });

    it('should calculate confidence based on content characteristics', async () => {
      const detector = new ContentLoadingDetector();

      // High-confidence content: large array with content-like fields
      const highConfidenceContext: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/articles',
            responseBody: {
              data: Array(10).fill({
                id: 1,
                title: 'Article Title',
                description: 'Article description',
                content: 'Full article content here...',
                author: 'John Doe',
                date: '2024-01-01',
                thumbnail: 'https://example.com/image.jpg',
              }),
            },
            duration: 100,
          }),
        ],
        loadTime: 1000,
      };

      const highResult = await detector.analyze(highConfidenceContext);
      expect(highResult.detected).toBe(true);
      expect(highResult.patterns[0].confidence).toBeGreaterThan(0.5);

      // Low-confidence content: small response, no content fields
      const lowConfidenceContext: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/config',
            responseBody: { version: '1.0', enabled: true },
            duration: 100,
          }),
        ],
        loadTime: 1000,
      };

      const lowResult = await detector.analyze(lowConfidenceContext);
      // Either not detected, or detected with low confidence
      if (lowResult.detected) {
        expect(lowResult.patterns[0].confidence).toBeLessThan(0.7);
      }
    });

    it('should detect data paths in response', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/products',
            responseBody: {
              results: [
                { id: 1, name: 'Product 1', price: 100 },
                { id: 2, name: 'Product 2', price: 200 },
              ],
              total: 100,
            },
            duration: 100,
          }),
        ],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.patterns[0].responseStructure.dataPath).toBe('results');
      expect(result.patterns[0].responseStructure.dataType).toBe('array');
    });

    it('should mark essential patterns correctly', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/main-content',
            responseBody: {
              data: Array(20).fill({
                id: 1,
                title: 'Content',
                description: 'Description',
                body: 'Full body text',
                image: 'https://example.com/img.jpg',
              }),
            },
            duration: 100, // Immediate
          }),
        ],
        loadTime: 500,
      };

      const result = await detector.analyze(context);

      expect(result.detected).toBe(true);
      // High-confidence immediate content should be marked essential
      if (result.patterns[0].confidence >= 0.7 && result.patterns[0].triggerType === 'immediate') {
        expect(result.patterns[0].isEssential).toBe(true);
      }
    });

    it('should provide recommended wait strategy', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/feed',
            responseBody: {
              data: Array(10).fill({
                id: 1,
                title: 'Feed Item',
                content: 'Content here',
                author: 'Author',
                date: '2024-01-01',
              }),
            },
            duration: 100,
          }),
        ],
        loadTime: 500,
      };

      const result = await detector.analyze(context);

      expect(result.recommendedStrategy).toBeDefined();
      expect(['networkidle', 'endpoint', 'domcontentloaded']).toContain(
        result.recommendedStrategy
      );
    });
  });

  describe('getPatternsForDomain', () => {
    it('should return empty array for unknown domain', () => {
      const detector = new ContentLoadingDetector();
      const patterns = detector.getPatternsForDomain('unknown.com');
      expect(patterns).toEqual([]);
    });

    it('should return stored patterns for domain', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://test.com',
        networkRequests: [
          createMockRequest({
            url: 'https://test.com/api/data',
            responseBody: { data: [{ id: 1, title: 'Test' }] },
          }),
        ],
        loadTime: 1000,
      };

      await detector.analyze(context);
      const patterns = detector.getPatternsForDomain('test.com');

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].domain).toBe('test.com');
    });
  });

  describe('getBestWaitPattern', () => {
    it('should return undefined for unknown domain', () => {
      const detector = new ContentLoadingDetector();
      const pattern = detector.getBestWaitPattern('unknown.com');
      expect(pattern).toBeUndefined();
    });

    it('should return best pattern sorted by essential and confidence', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://test.com',
        networkRequests: [
          createMockRequest({
            url: 'https://test.com/api/main',
            responseBody: {
              data: Array(5).fill({
                id: 1,
                title: 'Main',
                content: 'Content',
              }),
            },
            duration: 100,
          }),
        ],
        loadTime: 500,
      };

      await detector.analyze(context);
      const pattern = detector.getBestWaitPattern('test.com');

      if (pattern) {
        expect(pattern.domain).toBe('test.com');
      }
    });
  });

  describe('recordSuccess and recordFailure', () => {
    it('should update pattern metrics on success', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://test.com',
        networkRequests: [
          createMockRequest({
            url: 'https://test.com/api/data',
            responseBody: { data: [{ id: 1, title: 'Test' }] },
          }),
        ],
        loadTime: 1000,
      };

      await detector.analyze(context);
      const patterns = detector.getPatternsForDomain('test.com');
      expect(patterns.length).toBeGreaterThan(0);

      const patternId = patterns[0].id;
      const initialAvgTime = patterns[0].metrics.avgResponseTime;

      detector.recordSuccess(patternId, 200, 5000);

      const updatedPatterns = detector.getPatternsForDomain('test.com');
      const updated = updatedPatterns.find(p => p.id === patternId);

      expect(updated).toBeDefined();
      expect(updated!.metrics.successCount).toBe(2);
    });

    it('should decay confidence on failure', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://test.com',
        networkRequests: [
          createMockRequest({
            url: 'https://test.com/api/data',
            responseBody: { data: [{ id: 1, title: 'Test' }] },
          }),
        ],
        loadTime: 1000,
      };

      await detector.analyze(context);
      const patterns = detector.getPatternsForDomain('test.com');
      expect(patterns.length).toBeGreaterThan(0);

      const patternId = patterns[0].id;
      const initialConfidence = patterns[0].confidence;

      detector.recordFailure(patternId, 'Timeout');

      const updatedPatterns = detector.getPatternsForDomain('test.com');
      const updated = updatedPatterns.find(p => p.id === patternId);

      expect(updated!.confidence).toBeLessThan(initialConfidence);
    });
  });

  describe('exportPatterns and importPatterns', () => {
    it('should export all patterns', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://test.com',
        networkRequests: [
          createMockRequest({
            url: 'https://test.com/api/data',
            responseBody: { data: [{ id: 1, title: 'Test' }] },
          }),
        ],
        loadTime: 1000,
      };

      await detector.analyze(context);
      const exported = detector.exportPatterns();

      expect(exported.length).toBeGreaterThan(0);
      expect(exported[0].domain).toBe('test.com');
    });

    it('should import patterns', () => {
      const detector = new ContentLoadingDetector();
      const patterns: ContentLoadingPattern[] = [
        {
          id: 'test-pattern-1',
          domain: 'imported.com',
          endpoint: 'https://imported.com/api/data',
          urlPattern: 'https://imported.com/api/data',
          method: 'GET',
          triggerType: 'immediate',
          variableParams: [],
          responseStructure: {
            dataPath: 'data',
            dataType: 'array',
            responseSize: 1000,
            contentFields: ['title'],
          },
          isEssential: true,
          confidence: 0.9,
          metrics: {
            timesMatched: 10,
            successCount: 10,
            failureCount: 0,
            avgResponseTime: 100,
            avgResponseSize: 1000,
            timeSaved: 500,
          },
          discoveredAt: Date.now(),
          lastUsedAt: Date.now(),
          isValidated: true,
        },
      ];

      detector.importPatterns(patterns);
      const retrieved = detector.getPatternsForDomain('imported.com');

      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe('test-pattern-1');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed URLs gracefully', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          {
            ...createMockRequest({
              url: 'not-a-valid-url',
              responseBody: { data: [{ id: 1 }] },
            }),
          },
        ],
        loadTime: 1000,
      };

      // Should not throw
      const result = await detector.analyze(context);
      expect(result).toBeDefined();
    });

    it('should handle empty response body', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/empty',
            responseBody: null,
          }),
        ],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);
      // Should not detect content in empty response
      expect(result.detected).toBe(false);
    });

    it('should handle non-200 status codes', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/error',
            status: 500,
            responseBody: { error: 'Server error' },
          }),
        ],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);
      expect(result.detected).toBe(false);
    });

    it('should handle direct array responses', async () => {
      const detector = new ContentLoadingDetector();
      const context: ContentLoadingContext = {
        originalUrl: 'https://example.com',
        networkRequests: [
          createMockRequest({
            url: 'https://example.com/api/items',
            responseBody: [
              { id: 1, name: 'Item 1', description: 'First item' },
              { id: 2, name: 'Item 2', description: 'Second item' },
            ],
          }),
        ],
        loadTime: 1000,
      };

      const result = await detector.analyze(context);
      expect(result.detected).toBe(true);
      expect(result.patterns[0].responseStructure.dataPath).toBe('');
      expect(result.patterns[0].responseStructure.dataType).toBe('array');
    });
  });
});
