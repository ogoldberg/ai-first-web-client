/**
 * Tests for Search Query Optimizer (GAP-006)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SearchQueryOptimizer,
  SearchApiPattern,
  SearchContext,
} from '../../src/core/search-query-optimizer.js';
import type { NetworkRequest } from '../../src/types/index.js';

// ============================================
// TEST HELPERS
// ============================================

function createNetworkRequest(overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    url: 'https://api.example.com/search',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    contentType: 'application/json',
    headers: {},
    requestHeaders: {},
    responseBody: null,
    timestamp: Date.now(),
    ...overrides,
  };
}

function createSearchContext(overrides: Partial<SearchContext> = {}): SearchContext {
  return {
    originalUrl: 'https://example.com/search',
    networkRequests: [],
    ...overrides,
  };
}

// ============================================
// TESTS
// ============================================

describe('SearchQueryOptimizer', () => {
  let optimizer: SearchQueryOptimizer;

  beforeEach(() => {
    optimizer = new SearchQueryOptimizer();
  });

  describe('analyze', () => {
    it('should return detected=false when no network requests provided', async () => {
      const context = createSearchContext({ networkRequests: [] });
      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reasons).toContain('No JSON API requests found during search');
    });

    it('should return detected=false when no JSON API requests found', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({ contentType: 'text/html', status: 200 }),
          createNetworkRequest({ contentType: 'text/css', status: 200 }),
        ],
      });
      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.reasons).toContain('No JSON API requests found during search');
    });

    it('should return detected=false when no search parameters found', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/items',
            contentType: 'application/json',
            status: 200,
            responseBody: { items: [] },
          }),
        ],
      });
      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.reasons).toContain('No requests with search parameters or patterns found');
    });

    it('should detect search API with q parameter', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              results: [
                { title: 'Test Result 1', url: '/page1', description: 'Description 1' },
                { title: 'Test Result 2', url: '/page2', description: 'Description 2' },
              ],
              total: 42,
            }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.queryParamName).toBe('q');
      expect(result.pattern!.responseStructure.resultsPath).toBe('results');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect search API with query parameter', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/api/search?query=hello',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              data: [{ name: 'Result 1' }],
            }),
          }),
        ],
        searchTerm: 'hello',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.queryParamName).toBe('query');
    });

    it('should detect search API with various query param names', async () => {
      const paramVariations = ['q', 'query', 'search', 'keywords', 'term'];

      for (const param of paramVariations) {
        const optimizer = new SearchQueryOptimizer();
        const context = createSearchContext({
          networkRequests: [
            createNetworkRequest({
              url: `https://api.example.com/search?${param}=testing`,
              contentType: 'application/json',
              status: 200,
              responseBody: JSON.stringify({ results: [{ id: 1 }] }),
            }),
          ],
          searchTerm: 'testing',
        });

        const result = await optimizer.analyze(context);
        expect(result.detected).toBe(true);
        expect(result.pattern!.queryParamName).toBe(param);
      }
    });

    it('should prefer requests with /api/ in path', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://example.com/page?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ data: [] }),
          }),
          createNetworkRequest({
            url: 'https://api.example.com/api/v1/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.endpointUrl).toContain('/api/v1/search');
    });

    it('should extract response structure correctly', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              results: [
                { title: 'Result 1', url: '/p1', description: 'Desc 1' },
                { title: 'Result 2', url: '/p2', description: 'Desc 2' },
                { title: 'Result 3', url: '/p3', description: 'Desc 3' },
              ],
              totalCount: 100,
            }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.responseStructure.resultsPath).toBe('results');
      expect(result.pattern!.responseStructure.typicalResultCount).toBe(3);
      expect(result.pattern!.responseStructure.totalCountPath).toBe('totalCount');
      expect(result.pattern!.responseStructure.resultFields.title).toBe('title');
      expect(result.pattern!.responseStructure.resultFields.url).toBe('url');
      expect(result.pattern!.responseStructure.resultFields.description).toBe('description');
    });

    it('should handle root-level array responses', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify([
              { name: 'Result 1' },
              { name: 'Result 2' },
            ]),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.responseStructure.resultsPath).toBe('');
      expect(result.pattern!.responseStructure.typicalResultCount).toBe(2);
    });

    it('should detect pagination support', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test&page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.pagination).toBeDefined();
      expect(result.pattern!.pagination!.paramName).toBe('page');
      expect(result.pattern!.pagination!.type).toBe('page');
      expect(result.pattern!.pagination!.startValue).toBe(1);
    });

    it('should extract required headers', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            requestHeaders: {
              Authorization: 'Bearer token123',
              'X-Api-Key': 'key456',
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0',
            },
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.requiredHeaders.Authorization).toBe('Bearer token123');
      expect(result.pattern!.requiredHeaders['X-Api-Key']).toBe('key456');
      expect(result.pattern!.requiredHeaders.Accept).toBe('application/json');
      expect(result.pattern!.requiredHeaders['User-Agent']).toBeUndefined();
    });

    it('should ignore non-successful responses', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 404,
            responseBody: JSON.stringify({ error: 'not found' }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(false);
      expect(result.reasons).toContain('No JSON API requests found during search');
    });

    it('should detect various result paths', async () => {
      const resultPathTests = ['results', 'items', 'data', 'hits', 'records'];

      for (const resultPath of resultPathTests) {
        const optimizer = new SearchQueryOptimizer();
        const context = createSearchContext({
          networkRequests: [
            createNetworkRequest({
              url: 'https://api.example.com/search?q=test',
              contentType: 'application/json',
              status: 200,
              responseBody: JSON.stringify({ [resultPath]: [{ id: 1 }] }),
            }),
          ],
          searchTerm: 'test',
        });

        const result = await optimizer.analyze(context);
        expect(result.detected).toBe(true);
        expect(result.pattern!.responseStructure.resultsPath).toBe(resultPath);
      }
    });
  });

  describe('pattern storage and retrieval', () => {
    it('should store discovered patterns', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      const pattern = optimizer.getPattern(result.pattern!.id);
      expect(pattern).toBeDefined();
      expect(pattern!.id).toBe(result.pattern!.id);
    });

    it('should retrieve patterns by domain', async () => {
      const context1 = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const context2 = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.other.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      await optimizer.analyze(context1);
      await optimizer.analyze(context2);

      const examplePatterns = optimizer.getPatternsForDomain('api.example.com');
      const otherPatterns = optimizer.getPatternsForDomain('api.other.com');
      const unknownPatterns = optimizer.getPatternsForDomain('unknown.com');

      expect(examplePatterns).toHaveLength(1);
      expect(otherPatterns).toHaveLength(1);
      expect(unknownPatterns).toHaveLength(0);
    });

    it('should find matching pattern for domain', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      await optimizer.analyze(context);

      const matchingPattern = optimizer.findMatchingPattern('api.example.com');
      expect(matchingPattern).not.toBeNull();
      expect(matchingPattern!.domain).toBe('api.example.com');
    });

    it('should return null for non-matching domain', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      await optimizer.analyze(context);

      const matchingPattern = optimizer.findMatchingPattern('api.different.com');
      expect(matchingPattern).toBeNull();
    });

    it('should clear all patterns', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      await optimizer.analyze(context);
      expect(optimizer.getPatternsForDomain('api.example.com')).toHaveLength(1);

      optimizer.clear();
      expect(optimizer.getPatternsForDomain('api.example.com')).toHaveLength(0);
    });
  });

  describe('URL generation', () => {
    it('should generate search URL with query parameter', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=initial',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'initial',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      const searchUrl = optimizer.generateSearchUrl(result.pattern!, 'new query');
      expect(searchUrl).toContain('q=new+query');
    });

    it('should generate search URL with pagination', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test&page=1',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      const searchUrl = optimizer.generateSearchUrlWithPage(result.pattern!, 'query', 3);
      expect(searchUrl).toContain('q=query');
      expect(searchUrl).toContain('page=3');
    });

    it('should preserve base URL parameters', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?category=books&q=test&limit=10',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      const searchUrl = optimizer.generateSearchUrl(result.pattern!, 'new query');
      expect(searchUrl).toContain('category=books');
      expect(searchUrl).toContain('limit=10');
      expect(searchUrl).toContain('q=new+query');
    });
  });

  describe('result extraction', () => {
    it('should extract results from response', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              results: [
                { title: 'Result 1' },
                { title: 'Result 2' },
              ],
            }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      const responseBody = { results: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] };
      const extracted = optimizer.extractResults(result.pattern!, responseBody);

      expect(extracted).toHaveLength(3);
      expect(extracted[0].title).toBe('A');
    });

    it('should extract total count from response', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              results: [{ id: 1 }],
              total: 42,
            }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      const responseBody = { results: [], total: 150 };
      const totalCount = optimizer.extractTotalCount(result.pattern!, responseBody);

      expect(totalCount).toBe(150);
    });

    it('should handle missing total count', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              results: [{ id: 1 }],
            }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      const responseBody = { results: [] };
      const totalCount = optimizer.extractTotalCount(result.pattern!, responseBody);

      expect(totalCount).toBeUndefined();
    });
  });

  describe('recordUsage', () => {
    it('should track successful usage', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);

      optimizer.recordUsage(result.pattern!.id, true, 150, 10);
      optimizer.recordUsage(result.pattern!.id, true, 100, 10);

      const pattern = optimizer.getPattern(result.pattern!.id);
      expect(pattern!.metrics.timesUsed).toBe(2);
      expect(pattern!.metrics.successCount).toBe(2);
      expect(pattern!.metrics.failureCount).toBe(0);
      expect(pattern!.metrics.totalQueries).toBe(2);
      expect(pattern!.metrics.avgResponseTime).toBe(125);
      expect(pattern!.metrics.timeSaved).toBeGreaterThan(0);
    });

    it('should track failed usage', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      optimizer.recordUsage(result.pattern!.id, false, 0, 0);

      const pattern = optimizer.getPattern(result.pattern!.id);
      expect(pattern!.metrics.timesUsed).toBe(1);
      expect(pattern!.metrics.successCount).toBe(0);
      expect(pattern!.metrics.failureCount).toBe(1);
    });

    it('should validate pattern after 3 successful usages', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      optimizer.recordUsage(result.pattern!.id, true, 100, 10);
      optimizer.recordUsage(result.pattern!.id, true, 100, 10);
      optimizer.recordUsage(result.pattern!.id, true, 100, 10);

      const pattern = optimizer.getPattern(result.pattern!.id);
      expect(pattern!.isValidated).toBe(true);
    });

    it('should not crash when recording usage for unknown pattern', () => {
      expect(() => {
        optimizer.recordUsage('unknown-pattern-id', true, 100, 10);
      }).not.toThrow();
    });
  });

  describe('getStatistics', () => {
    it('should return empty statistics initially', () => {
      const stats = optimizer.getStatistics();

      expect(stats.totalPatterns).toBe(0);
      expect(stats.validatedPatterns).toBe(0);
      expect(stats.totalTimeSaved).toBe(0);
      expect(stats.totalQueries).toBe(0);
      expect(Object.keys(stats.byDomain)).toHaveLength(0);
    });

    it('should return correct statistics after discoveries', async () => {
      const context1 = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const context2 = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/find?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result1 = await optimizer.analyze(context1);
      await optimizer.analyze(context2);

      optimizer.recordUsage(result1.pattern!.id, true, 100, 10);

      const stats = optimizer.getStatistics();

      expect(stats.totalPatterns).toBe(2);
      expect(stats.byDomain['api.example.com']).toBe(2);
      expect(stats.totalQueries).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed URLs gracefully', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'not-a-valid-url',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [] }),
          }),
        ],
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(false);
    });

    it('should handle empty response body', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: null,
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(false);
    });

    it('should handle non-JSON response body strings', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: 'not valid json',
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(false);
    });

    it('should detect Elasticsearch-style hits.hits results', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/_search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              hits: {
                hits: [
                  { _source: { title: 'Result 1' } },
                  { _source: { title: 'Result 2' } },
                ],
              },
            }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);
      expect(result.pattern!.responseStructure.resultsPath).toBe('hits.hits');
    });

    it('should detect nested data.results path', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({
              data: {
                results: [{ id: 1 }, { id: 2 }],
              },
            }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      expect(result.detected).toBe(true);
      expect(result.pattern!.responseStructure.resultsPath).toBe('data.results');
    });

    it('should detect offset-based pagination', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test&offset=0',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.pagination).toBeDefined();
      expect(result.pattern!.pagination!.paramName).toBe('offset');
      expect(result.pattern!.pagination!.type).toBe('offset');
      expect(result.pattern!.pagination!.startValue).toBe(0);
    });

    it('should detect cursor-based pagination', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test&cursor=abc123',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);

      expect(result.detected).toBe(true);
      expect(result.pattern!.pagination).toBeDefined();
      expect(result.pattern!.pagination!.paramName).toBe('cursor');
      expect(result.pattern!.pagination!.type).toBe('cursor');
    });

    it('should update lastUsedAt when recording usage', async () => {
      const context = createSearchContext({
        networkRequests: [
          createNetworkRequest({
            url: 'https://api.example.com/search?q=test',
            contentType: 'application/json',
            status: 200,
            responseBody: JSON.stringify({ results: [{ id: 1 }] }),
          }),
        ],
        searchTerm: 'test',
      });

      const result = await optimizer.analyze(context);
      const initialLastUsed = result.pattern!.lastUsedAt;

      await new Promise((resolve) => setTimeout(resolve, 5));

      optimizer.recordUsage(result.pattern!.id, true, 100, 10);

      const pattern = optimizer.getPattern(result.pattern!.id);
      expect(pattern!.lastUsedAt).toBeGreaterThanOrEqual(initialLastUsed);
    });
  });
});
