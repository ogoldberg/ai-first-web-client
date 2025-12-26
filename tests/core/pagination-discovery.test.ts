/**
 * Tests for Pagination API Discovery (GAP-005)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PaginationDiscovery,
  PaginationApiPattern,
  PaginationContext,
  PaginationAnalysisResult,
} from '../../src/core/pagination-discovery.js';
import type { NetworkRequest } from '../../src/types/index.js';

// ============================================
// TEST HELPERS
// ============================================

function createNetworkRequest(overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    url: 'https://api.example.com/items',
    method: 'GET',
    status: 200,
    contentType: 'application/json',
    requestHeaders: {},
    responseHeaders: {},
    responseBody: null,
    timing: { startTime: 0, endTime: 100, duration: 100 },
    ...overrides,
  };
}

function createPaginationContext(overrides: Partial<PaginationContext> = {}): PaginationContext {
  return {
    originalUrl: 'https://example.com/products',
    pageUrls: [],
    networkRequests: [],
    ...overrides,
  };
}

// ============================================
// TESTS
// ============================================

describe('PaginationDiscovery', () => {
  let discovery: PaginationDiscovery;

  beforeEach(() => {
    discovery = new PaginationDiscovery();
  });

  describe('analyze', () => {
    it('should return detected=false when no network requests provided', async () => {
      const context = createPaginationContext({ networkRequests: [] });
      const result = await discovery.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasons).toContain('No JSON API requests found during pagination');
    });

    it('should return detected=false when no JSON API requests found', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({ contentType: 'text/html', status: 200 }),
          createNetworkRequest({ contentType: 'text/css', status: 200 }),
        ],
      });
      const result = await discovery.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.reasons).toContain('No JSON API requests found during pagination');
    });

    it('should return detected=false when no pagination parameters found', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items',
            contentType: 'application/json',
            status: 200,
            responseBody: { items: [] },
          }),
        ],
      });
      const result = await discovery.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.reasons).toContain('No requests with pagination parameters found');
    });

    it('should detect page-based pagination from query parameter', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=2',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              data: [{ id: 1 }, { id: 2 }],
              total: 100,
              hasMore: true,
            }),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.paginationParam.name).toBe('page');
      expect(result.pattern!.paginationParam.type).toBe('page');
      expect(result.pattern!.paginationParam.startValue).toBe(1);
      expect(result.pattern!.paginationParam.increment).toBe(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect offset-based pagination from query parameter', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?offset=20',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              results: [{ id: 1 }],
              total_count: 50,
            }),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.paginationParam.name).toBe('offset');
      expect(result.pattern!.paginationParam.type).toBe('offset');
      expect(result.pattern!.paginationParam.startValue).toBe(0);
    });

    it('should detect cursor-based pagination', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?cursor=abc123',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              items: [{ id: 1 }],
              nextCursor: 'def456',
            }),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.paginationParam.name).toBe('cursor');
      expect(result.pattern!.paginationParam.type).toBe('cursor');
    });

    it('should prefer requests with higher pagination scores', async () => {
      const context = createPaginationContext({
        networkRequests: [
          // Low score: no pagination metadata
          createNetworkRequest({
            url: 'https://api.example.com/config?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ setting: 'value' }),
          }),
          // High score: has array data and pagination metadata
          createNetworkRequest({
            url: 'https://api.example.com/products?page=2',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              data: [{ id: 1 }, { id: 2 }],
              total: 100,
              hasMore: true,
            }),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.baseUrl).toContain('/products');
    });

    it('should extract response structure correctly', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              data: [{ id: 1 }, { id: 2 }, { id: 3 }],
              total: 150,
              hasMore: true,
              nextCursor: 'xyz789',
            }),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.responseStructure.dataPath).toBe('data');
      expect(result.pattern!.responseStructure.itemsPerPage).toBe(3);
      expect(result.pattern!.responseStructure.totalCountPath).toBe('total');
      expect(result.pattern!.responseStructure.hasMorePath).toBe('hasMore');
      expect(result.pattern!.responseStructure.nextCursorPath).toBe('nextCursor');
    });

    it('should detect pagination from various param name variations', async () => {
      const paramVariations = [
        { param: 'p', expected: 'page' },
        { param: 'pg', expected: 'page' },
        { param: 'start', expected: 'offset' },
        { param: 'skip', expected: 'offset' },
        { param: 'after', expected: 'cursor' },
      ];

      for (const { param, expected } of paramVariations) {
        const discovery = new PaginationDiscovery();
        const context = createPaginationContext({
          networkRequests: [
            createNetworkRequest({
              url: `https://api.example.com/items?${param}=5`,
              contentType: 'application/json',
              status: 200,
              responseBody: JSON.stringify({ data: [{ id: 1 }] }),
            }),
          ],
        });

        const result = await discovery.analyze(context);
        expect(result.detected).toBe(true);
        expect(result.pattern!.paginationParam.type).toBe(expected);
      }
    });

    it('should handle root-level array responses', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify([{ id: 1 }, { id: 2 }]),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.responseStructure.dataPath).toBe('');
      expect(result.pattern!.responseStructure.itemsPerPage).toBe(2);
    });

    it('should ignore non-successful responses', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 404,
            responseBody: JSON.stringify({ error: 'not found' }),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.reasons).toContain('No JSON API requests found during pagination');
    });

    it('should extract relevant headers from requests', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            requestHeaders: {
              Authorization: 'Bearer token123',
              'X-Api-Key': 'key456',
              Cookie: 'session=abc',
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0', // Should not be included
            },
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.headers.Authorization).toBe('Bearer token123');
      expect(result.pattern!.headers['X-Api-Key']).toBe('key456');
      expect(result.pattern!.headers.Cookie).toBe('session=abc');
      expect(result.pattern!.headers.Accept).toBe('application/json');
      expect(result.pattern!.headers['User-Agent']).toBeUndefined();
    });
  });

  describe('pattern storage and retrieval', () => {
    it('should store discovered patterns', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);

      const pattern = discovery.getPattern(result.pattern!.id);
      expect(pattern).toBeDefined();
      expect(pattern!.id).toBe(result.pattern!.id);
    });

    it('should retrieve patterns by domain', async () => {
      // Analyze two different domains
      const context1 = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const context2 = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.other.com/products?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      await discovery.analyze(context1);
      await discovery.analyze(context2);

      const examplePatterns = discovery.getPatternsForDomain('api.example.com');
      const otherPatterns = discovery.getPatternsForDomain('api.other.com');
      const unknownPatterns = discovery.getPatternsForDomain('unknown.com');

      expect(examplePatterns).toHaveLength(1);
      expect(otherPatterns).toHaveLength(1);
      expect(unknownPatterns).toHaveLength(0);
    });

    it('should find matching pattern for URL', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      await discovery.analyze(context);

      const matchingPattern = discovery.findMatchingPattern('https://api.example.com/items');
      expect(matchingPattern).not.toBeNull();
      expect(matchingPattern!.domain).toBe('api.example.com');
    });

    it('should return null for non-matching URL', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      await discovery.analyze(context);

      const matchingPattern = discovery.findMatchingPattern('https://api.different.com/items');
      expect(matchingPattern).toBeNull();
    });

    it('should clear all patterns', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      await discovery.analyze(context);
      expect(discovery.getPatternsForDomain('api.example.com')).toHaveLength(1);

      discovery.clear();
      expect(discovery.getPatternsForDomain('api.example.com')).toHaveLength(0);
    });
  });

  describe('generatePageUrl', () => {
    it('should generate URL for next page with query param', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);

      const nextUrl = discovery.generatePageUrl(result.pattern!, 2);
      expect(nextUrl).toBe('https://api.example.com/items?page=2');
    });

    it('should preserve other query parameters', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?category=electronics&page=1&limit=10',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);

      const nextUrl = discovery.generatePageUrl(result.pattern!, 3);
      expect(nextUrl).toContain('category=electronics');
      expect(nextUrl).toContain('limit=10');
      expect(nextUrl).toContain('page=3');
    });
  });

  describe('getNextPageValue', () => {
    it('should calculate next page for page-based pagination', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);

      expect(discovery.getNextPageValue(result.pattern!, 1)).toBe(2);
      expect(discovery.getNextPageValue(result.pattern!, 5)).toBe(6);
    });

    it('should calculate next offset for offset-based pagination', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?offset=0&limit=20',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);

      // Default increment is undefined for offset, falls back to 1
      expect(discovery.getNextPageValue(result.pattern!, 0)).toBe(1);
    });

    it('should return same value for cursor-based pagination', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?cursor=abc123',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              data: [{ id: 1 }],
              nextCursor: 'def456',
            }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);

      // For cursor, the value comes from response, not calculated
      expect(discovery.getNextPageValue(result.pattern!, 'abc123')).toBe('abc123');
    });
  });

  describe('recordUsage', () => {
    it('should track successful usage', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);

      discovery.recordUsage(result.pattern!.id, true, 150, 20, 2000);
      discovery.recordUsage(result.pattern!.id, true, 100, 20, 2000);

      const pattern = discovery.getPattern(result.pattern!.id);
      expect(pattern!.metrics.timesUsed).toBe(2);
      expect(pattern!.metrics.successCount).toBe(2);
      expect(pattern!.metrics.failureCount).toBe(0);
      expect(pattern!.metrics.totalItemsFetched).toBe(40);
      expect(pattern!.metrics.timeSaved).toBe(4000);
      expect(pattern!.metrics.avgResponseTime).toBe(125); // (150+100)/2
    });

    it('should track failed usage', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      discovery.recordUsage(result.pattern!.id, false, 0, 0, 0);

      const pattern = discovery.getPattern(result.pattern!.id);
      expect(pattern!.metrics.timesUsed).toBe(1);
      expect(pattern!.metrics.successCount).toBe(0);
      expect(pattern!.metrics.failureCount).toBe(1);
    });

    it('should validate pattern after 3 successful usages', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      // Initially may or may not be validated depending on confidence
      const initialValidated = result.pattern!.isValidated;

      // Record 3 successful usages
      discovery.recordUsage(result.pattern!.id, true, 100, 10, 1000);
      discovery.recordUsage(result.pattern!.id, true, 100, 10, 1000);
      discovery.recordUsage(result.pattern!.id, true, 100, 10, 1000);

      const pattern = discovery.getPattern(result.pattern!.id);
      expect(pattern!.isValidated).toBe(true);
    });

    it('should not crash when recording usage for unknown pattern', () => {
      // Should not throw
      expect(() => {
        discovery.recordUsage('unknown-pattern-id', true, 100, 10, 1000);
      }).not.toThrow();
    });
  });

  describe('getStatistics', () => {
    it('should return empty statistics initially', () => {
      const stats = discovery.getStatistics();

      expect(stats.totalPatterns).toBe(0);
      expect(stats.validatedPatterns).toBe(0);
      expect(stats.totalTimeSaved).toBe(0);
      expect(stats.totalItemsFetched).toBe(0);
      expect(Object.keys(stats.byDomain)).toHaveLength(0);
    });

    it('should return correct statistics after discoveries', async () => {
      const context1 = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const context2 = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/products?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result1 = await discovery.analyze(context1);
      await discovery.analyze(context2);

      discovery.recordUsage(result1.pattern!.id, true, 100, 50, 3000);

      const stats = discovery.getStatistics();

      expect(stats.totalPatterns).toBe(2);
      expect(stats.byDomain['api.example.com']).toBe(2);
      expect(stats.totalTimeSaved).toBe(3000);
      expect(stats.totalItemsFetched).toBe(50);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed URLs gracefully', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'not-a-valid-url',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      // Should not crash, just return no pagination found
      expect(result.detected).toBe(false);
    });

    it('should handle empty response body', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: null,
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(false);
    });

    it('should handle non-JSON response body strings', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: 'not valid json',
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(false);
    });

    it('should handle findMatchingPattern with invalid URL', () => {
      const pattern = discovery.findMatchingPattern('not-a-url');
      expect(pattern).toBeNull();
    });

    it('should boost score for /api/ path pattern', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://example.com/api/v2/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);
      expect(result.pattern!.baseUrl).toContain('/api/v2/');
    });

    it('should detect various data array paths', async () => {
      const dataPathTests = ['results', 'items', 'records', 'entries', 'hits'];

      for (const dataPath of dataPathTests) {
        const discovery = new PaginationDiscovery();
        const context = createPaginationContext({
          networkRequests: [
            createNetworkRequest({
              url: 'https://api.example.com/items?page=1',
              contentType: 'application/json',
              status: 200,
              responseBody: JSON.stringify({ [dataPath]: [{ id: 1 }] }),
            }),
          ],
        });

        const result = await discovery.analyze(context);
        expect(result.detected).toBe(true);
        expect(result.pattern!.responseStructure.dataPath).toBe(dataPath);
      }
    });

    it('should detect various has-more path variations', async () => {
      const hasMoreTests = [
        { path: 'hasMore', value: true },
        { path: 'has_more', value: true },
        { path: 'hasNextPage', value: false },
      ];

      for (const { path, value } of hasMoreTests) {
        const discovery = new PaginationDiscovery();
        const context = createPaginationContext({
          networkRequests: [
            createNetworkRequest({
              url: 'https://api.example.com/items?page=1',
              contentType: 'application/json',
              status: 200,
              responseBody: JSON.stringify({
                data: [{ id: 1 }],
                [path]: value,
              }),
            }),
          ],
        });

        const result = await discovery.analyze(context);
        expect(result.detected).toBe(true);
        expect(result.pattern!.responseStructure.hasMorePath).toBe(path);
      }
    });

    it('should detect token-based pagination', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?nextToken=abc123',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              data: [{ id: 1 }],
            }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      expect(result.detected).toBe(true);
      expect(result.pattern!.paginationParam.name).toBe('nextToken');
      expect(result.pattern!.paginationParam.type).toBe('token');
    });

    it('should update lastUsedAt when recording usage', async () => {
      const context = createPaginationContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items?page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [{ id: 1 }] }),
          }),
        ],
      });

      const result = await discovery.analyze(context);
      const initialLastUsed = result.pattern!.lastUsedAt;

      // Wait a tiny bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 5));

      discovery.recordUsage(result.pattern!.id, true, 100, 10, 1000);

      const pattern = discovery.getPattern(result.pattern!.id);
      expect(pattern!.lastUsedAt).toBeGreaterThanOrEqual(initialLastUsed);
    });
  });
});
