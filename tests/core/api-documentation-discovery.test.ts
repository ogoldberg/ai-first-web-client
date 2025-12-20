/**
 * Tests for API Documentation Discovery Orchestrator (D-008)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discoverApiDocumentation,
  hasDocumentedApi,
  getDocumentedPatterns,
  getDiscoveryBySource,
  getCachedDiscovery,
  cacheDiscovery,
  clearDiscoveryCache,
  getDiscoveryCacheStats,
  discoverOpenAPISource,
  discoverGraphQLSource,
  convertGraphQLPattern,
  DEFAULT_CACHE_TTL_MS,
  SOURCE_CONFIDENCE,
  SOURCE_PRIORITY,
  type DiscoveryResult,
  type AggregatedDiscoveryResult,
  type DiscoveryOptions,
} from '../../src/core/api-documentation-discovery.js';
import type { GraphQLQueryPattern } from '../../src/core/graphql-introspection.js';

// ============================================
// MOCKS
// ============================================

// Mock the discovery modules
vi.mock('../../src/core/openapi-discovery.js', () => ({
  discoverOpenAPICached: vi.fn(),
  generatePatternsFromOpenAPISpec: vi.fn(),
}));

vi.mock('../../src/core/graphql-introspection.js', () => ({
  discoverGraphQL: vi.fn(),
}));

vi.mock('../../src/core/link-discovery.js', () => ({
  discoverLinks: vi.fn(),
  generatePatternsFromLinks: vi.fn(),
}));

vi.mock('../../src/core/docs-page-discovery.js', () => ({
  discoverDocs: vi.fn(),
  generatePatternsFromDocs: vi.fn(),
}));

vi.mock('../../src/core/asyncapi-discovery.js', () => ({
  discoverAsyncAPICached: vi.fn(),
  generatePatternsFromAsyncAPI: vi.fn(),
}));

vi.mock('../../src/core/alt-spec-discovery.js', () => ({
  discoverAltSpecsCached: vi.fn(),
  generatePatternsFromAltSpec: vi.fn(),
}));

import { discoverOpenAPICached, generatePatternsFromOpenAPISpec } from '../../src/core/openapi-discovery.js';
import { discoverGraphQL } from '../../src/core/graphql-introspection.js';
import { discoverLinks, generatePatternsFromLinks } from '../../src/core/link-discovery.js';
import { discoverDocs, generatePatternsFromDocs } from '../../src/core/docs-page-discovery.js';
import { discoverAsyncAPICached, generatePatternsFromAsyncAPI } from '../../src/core/asyncapi-discovery.js';
import { discoverAltSpecsCached, generatePatternsFromAltSpec } from '../../src/core/alt-spec-discovery.js';

const mockDiscoverOpenAPI = vi.mocked(discoverOpenAPICached);
const mockGeneratePatterns = vi.mocked(generatePatternsFromOpenAPISpec);
const mockDiscoverGraphQL = vi.mocked(discoverGraphQL);
const mockDiscoverLinks = vi.mocked(discoverLinks);
const mockGeneratePatternsFromLinks = vi.mocked(generatePatternsFromLinks);
const mockDiscoverDocs = vi.mocked(discoverDocs);
const mockGeneratePatternsFromDocs = vi.mocked(generatePatternsFromDocs);
const mockDiscoverAsyncAPI = vi.mocked(discoverAsyncAPICached);
const mockGeneratePatternsFromAsyncAPI = vi.mocked(generatePatternsFromAsyncAPI);
const mockDiscoverAltSpecs = vi.mocked(discoverAltSpecsCached);
const mockGeneratePatternsFromAltSpec = vi.mocked(generatePatternsFromAltSpec);

// ============================================
// TEST UTILITIES
// ============================================

function createMockOpenAPISpec() {
  return {
    version: '3.0' as const,
    title: 'Test API',
    description: 'A test API',
    baseUrl: 'https://api.example.com',
    endpoints: [
      {
        path: '/users',
        method: 'GET' as const,
        operationId: 'getUsers',
        summary: 'Get all users',
        parameters: [],
        responses: [{ statusCode: '200', description: 'Success' }],
      },
    ],
    securitySchemes: {
      apiKey: { type: 'apiKey' as const, name: 'X-API-Key', in: 'header' as const },
    },
    discoveredAt: Date.now(),
    specUrl: 'https://example.com/openapi.json',
  };
}

function createMockGraphQLResult(found = true) {
  if (!found) {
    return {
      found: false,
      error: 'No GraphQL endpoint found',
    };
  }
  return {
    found: true,
    endpoint: 'https://example.com/graphql',
    schema: {
      endpoint: 'https://example.com/graphql',
      queryTypeName: 'Query',
      mutationTypeName: 'Mutation',
      subscriptionTypeName: null,
      types: new Map(),
      entityTypes: ['User', 'Post'],
      paginationPattern: 'relay' as const,
    },
    patterns: [
      {
        id: 'graphql:users',
        queryName: 'users',
        operationType: 'query' as const,
        returnType: 'User',
        requiredArgs: [],
        optionalArgs: [{ name: 'first', typeName: 'Int', isRequired: false }],
        defaultFieldSelection: ['id', 'name'],
        queryTemplate: 'query { users { id name } }',
        confidence: 0.95,
      },
    ],
  };
}

function createMockLearnedPattern() {
  return {
    id: 'openapi:users',
    templateType: 'rest-resource' as const,
    urlPatterns: ['^https://api.example.com/users$'],
    endpointTemplate: 'https://api.example.com/users',
    extractors: [],
    method: 'GET' as const,
    responseFormat: 'json' as const,
    contentMapping: { title: 'title' },
    validation: { requiredFields: ['data'], minContentLength: 10 },
    metrics: {
      successCount: 1,
      failureCount: 0,
      confidence: 0.95,
      domains: ['example.com'],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createMockLinkDiscoveryResult(found = false) {
  return {
    found,
    links: found ? [{ href: '/api', rel: 'service', source: 'header' as const, isApiLink: true, confidence: 0.7 }] : [],
    apiLinks: found ? [{ href: '/api', rel: 'service', source: 'header' as const, isApiLink: true, confidence: 0.7 }] : [],
    documentationLinks: [],
    discoveryTime: 50,
  };
}

// ============================================
// SETUP / TEARDOWN
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
  clearDiscoveryCache();
  // Default mock for link discovery (usually returns nothing found)
  mockDiscoverLinks.mockResolvedValue(createMockLinkDiscoveryResult(false));
  mockGeneratePatternsFromLinks.mockReturnValue([]);
  // Default mock for docs-page discovery (usually returns nothing found)
  mockDiscoverDocs.mockResolvedValue({
    found: false,
    endpoints: [],
    navigationLinks: [],
    discoveryTime: 50,
  });
  mockGeneratePatternsFromDocs.mockReturnValue([]);
  // Default mock for asyncapi discovery (usually returns nothing found)
  mockDiscoverAsyncAPI.mockResolvedValue({
    found: false,
    probedLocations: [],
    discoveryTime: 50,
  });
  mockGeneratePatternsFromAsyncAPI.mockReturnValue([]);
  // Default mock for alt-spec discovery (usually returns nothing found)
  mockDiscoverAltSpecs.mockResolvedValue({
    found: false,
    probedLocations: [],
    discoveryTime: 50,
  });
  mockGeneratePatternsFromAltSpec.mockReturnValue([]);
});

afterEach(() => {
  clearDiscoveryCache();
});

// ============================================
// CACHE TESTS
// ============================================

describe('Discovery Cache', () => {
  describe('getCachedDiscovery', () => {
    it('should return null for uncached domain', () => {
      const result = getCachedDiscovery('uncached.com');
      expect(result).toBeNull();
    });

    it('should return cached result for cached domain', () => {
      const mockResult: AggregatedDiscoveryResult = {
        domain: 'example.com',
        results: [],
        allPatterns: [],
        metadata: { title: 'Test API' },
        totalTime: 100,
        found: true,
      };

      cacheDiscovery('example.com', mockResult);
      const cached = getCachedDiscovery('example.com');

      expect(cached).not.toBeNull();
      expect(cached?.domain).toBe('example.com');
      expect(cached?.cachedAt).toBeDefined();
    });

    it('should return null for expired cache entry', async () => {
      const mockResult: AggregatedDiscoveryResult = {
        domain: 'example.com',
        results: [],
        allPatterns: [],
        metadata: {},
        totalTime: 100,
        found: true,
      };

      // Cache with very short TTL
      cacheDiscovery('example.com', mockResult, 1);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cached = getCachedDiscovery('example.com');
      expect(cached).toBeNull();
    });
  });

  describe('clearDiscoveryCache', () => {
    it('should clear cache for specific domain', () => {
      const mockResult: AggregatedDiscoveryResult = {
        domain: 'example.com',
        results: [],
        allPatterns: [],
        metadata: {},
        totalTime: 100,
        found: true,
      };

      cacheDiscovery('example.com', mockResult);
      cacheDiscovery('other.com', mockResult);

      clearDiscoveryCache('example.com');

      expect(getCachedDiscovery('example.com')).toBeNull();
      expect(getCachedDiscovery('other.com')).not.toBeNull();
    });

    it('should clear all cache when no domain specified', () => {
      const mockResult: AggregatedDiscoveryResult = {
        domain: 'example.com',
        results: [],
        allPatterns: [],
        metadata: {},
        totalTime: 100,
        found: true,
      };

      cacheDiscovery('example.com', mockResult);
      cacheDiscovery('other.com', mockResult);

      clearDiscoveryCache();

      expect(getCachedDiscovery('example.com')).toBeNull();
      expect(getCachedDiscovery('other.com')).toBeNull();
    });
  });

  describe('getDiscoveryCacheStats', () => {
    it('should return empty stats for empty cache', () => {
      const stats = getDiscoveryCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.domains).toHaveLength(0);
    });

    it('should return correct stats for populated cache', () => {
      const mockResult: AggregatedDiscoveryResult = {
        domain: 'example.com',
        results: [],
        allPatterns: [],
        metadata: {},
        totalTime: 100,
        found: true,
      };

      cacheDiscovery('example.com', mockResult);
      cacheDiscovery('other.com', mockResult);

      const stats = getDiscoveryCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.domains).toContain('example.com');
      expect(stats.domains).toContain('other.com');
    });
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('Discovery Constants', () => {
  it('should have correct cache TTL default', () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(60 * 60 * 1000); // 1 hour
  });

  it('should have confidence scores for all sources', () => {
    expect(SOURCE_CONFIDENCE.openapi).toBe(0.95);
    expect(SOURCE_CONFIDENCE.graphql).toBe(0.90);
    expect(SOURCE_CONFIDENCE.asyncapi).toBe(0.85);
    expect(SOURCE_CONFIDENCE['alt-spec']).toBe(0.80);
  });

  it('should have priority scores for all sources', () => {
    expect(SOURCE_PRIORITY.openapi).toBeGreaterThan(SOURCE_PRIORITY.graphql);
    expect(SOURCE_PRIORITY.graphql).toBeGreaterThan(SOURCE_PRIORITY.asyncapi);
  });
});

// ============================================
// OPENAPI SOURCE TESTS
// ============================================

describe('OpenAPI Discovery Source', () => {
  it('should discover OpenAPI spec successfully', async () => {
    const mockSpec = createMockOpenAPISpec();
    const mockPatterns = [createMockLearnedPattern()];

    mockDiscoverOpenAPI.mockResolvedValue({
      found: true,
      spec: mockSpec,
      specUrl: 'https://example.com/openapi.json',
      probedLocations: ['https://example.com/openapi.json'],
      discoveryTime: 100,
    });
    mockGeneratePatterns.mockReturnValue(mockPatterns);

    const result = await discoverOpenAPISource('example.com', {});

    expect(result.found).toBe(true);
    expect(result.source).toBe('openapi');
    expect(result.confidence).toBe(SOURCE_CONFIDENCE.openapi);
    expect(result.patterns).toHaveLength(1);
    expect(result.metadata.title).toBe('Test API');
    expect(result.metadata.baseUrl).toBe('https://api.example.com');
  });

  it('should extract authentication info from spec', async () => {
    const mockSpec = createMockOpenAPISpec();
    const mockPatterns = [createMockLearnedPattern()];

    mockDiscoverOpenAPI.mockResolvedValue({
      found: true,
      spec: mockSpec,
      specUrl: 'https://example.com/openapi.json',
      probedLocations: [],
      discoveryTime: 100,
    });
    mockGeneratePatterns.mockReturnValue(mockPatterns);

    const result = await discoverOpenAPISource('example.com', {});

    expect(result.metadata.authentication).toBeDefined();
    expect(result.metadata.authentication).toHaveLength(1);
    expect(result.metadata.authentication![0].type).toBe('api_key');
  });

  it('should return not found when no spec discovered', async () => {
    mockDiscoverOpenAPI.mockResolvedValue({
      found: false,
      probedLocations: ['https://example.com/openapi.json'],
      discoveryTime: 100,
    });

    const result = await discoverOpenAPISource('example.com', {});

    expect(result.found).toBe(false);
    expect(result.patterns).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it('should handle discovery errors gracefully', async () => {
    mockDiscoverOpenAPI.mockRejectedValue(new Error('Network error'));

    const result = await discoverOpenAPISource('example.com', {});

    expect(result.found).toBe(false);
    expect(result.error).toBe('Network error');
    expect(result.patterns).toHaveLength(0);
  });
});

// ============================================
// GRAPHQL SOURCE TESTS
// ============================================

describe('GraphQL Discovery Source', () => {
  it('should discover GraphQL API successfully', async () => {
    mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(true));

    const result = await discoverGraphQLSource('example.com', {});

    expect(result.found).toBe(true);
    expect(result.source).toBe('graphql');
    expect(result.confidence).toBe(SOURCE_CONFIDENCE.graphql);
    expect(result.patterns).toHaveLength(1);
    expect(result.metadata.baseUrl).toBe('https://example.com/graphql');
  });

  it('should handle introspection disabled', async () => {
    mockDiscoverGraphQL.mockResolvedValue({
      found: true,
      endpoint: 'https://example.com/graphql',
      introspectionDisabled: true,
    });

    const result = await discoverGraphQLSource('example.com', {});

    expect(result.found).toBe(true);
    expect(result.patterns).toHaveLength(0);
    expect(result.error).toBe('GraphQL introspection is disabled');
    expect(result.confidence).toBe(0);
  });

  it('should return not found when no GraphQL discovered', async () => {
    mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

    const result = await discoverGraphQLSource('example.com', {});

    expect(result.found).toBe(false);
    expect(result.patterns).toHaveLength(0);
  });

  it('should handle discovery errors gracefully', async () => {
    mockDiscoverGraphQL.mockRejectedValue(new Error('Connection refused'));

    const result = await discoverGraphQLSource('example.com', {});

    expect(result.found).toBe(false);
    expect(result.error).toBe('Connection refused');
    expect(result.patterns).toHaveLength(0);
  });
});

// ============================================
// PATTERN CONVERSION TESTS
// ============================================

describe('Pattern Conversion', () => {
  describe('convertGraphQLPattern', () => {
    it('should convert GraphQL pattern to LearnedApiPattern', () => {
      const gqlPattern: GraphQLQueryPattern = {
        id: 'graphql:users',
        queryName: 'users',
        operationType: 'query',
        returnType: 'User',
        requiredArgs: [],
        optionalArgs: [],
        defaultFieldSelection: ['id', 'name'],
        queryTemplate: 'query { users { id name } }',
        confidence: 0.95,
      };

      const result = convertGraphQLPattern(
        gqlPattern,
        'example.com',
        'https://example.com/graphql'
      );

      expect(result.id).toBe('graphql:users');
      expect(result.templateType).toBe('query-api');
      expect(result.method).toBe('POST');
      expect(result.responseFormat).toBe('json');
      expect(result.metrics.domains).toContain('example.com');
      expect(result.metrics.confidence).toBe(0.95);
    });

    it('should set correct headers for GraphQL', () => {
      const gqlPattern: GraphQLQueryPattern = {
        id: 'graphql:test',
        queryName: 'test',
        operationType: 'query',
        returnType: 'Test',
        requiredArgs: [],
        optionalArgs: [],
        defaultFieldSelection: [],
        queryTemplate: 'query { test }',
        confidence: 0.9,
      };

      const result = convertGraphQLPattern(
        gqlPattern,
        'example.com',
        'https://example.com/graphql'
      );

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
    });

    it('should escape regex characters in endpoint URL', () => {
      const gqlPattern: GraphQLQueryPattern = {
        id: 'graphql:test',
        queryName: 'test',
        operationType: 'query',
        returnType: 'Test',
        requiredArgs: [],
        optionalArgs: [],
        defaultFieldSelection: [],
        queryTemplate: 'query { test }',
        confidence: 0.9,
      };

      const result = convertGraphQLPattern(
        gqlPattern,
        'example.com',
        'https://example.com/api/graphql?version=1'
      );

      // URL should be escaped
      expect(result.urlPatterns[0]).toContain('\\?');
    });
  });
});

// ============================================
// ORCHESTRATION TESTS
// ============================================

describe('Discovery Orchestration', () => {
  describe('discoverApiDocumentation', () => {
    it('should run all discovery sources in parallel', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: false,
        probedLocations: [],
        discoveryTime: 100,
      });
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      await discoverApiDocumentation('example.com');

      expect(mockDiscoverOpenAPI).toHaveBeenCalled();
      expect(mockDiscoverGraphQL).toHaveBeenCalled();
    });

    it('should aggregate results from multiple sources', async () => {
      const mockSpec = createMockOpenAPISpec();
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: mockSpec,
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(true));

      const result = await discoverApiDocumentation('example.com');

      expect(result.found).toBe(true);
      expect(result.results).toHaveLength(6); // openapi, graphql, asyncapi, alt-spec, links, docs-page
      // OpenAPI should be first (higher priority)
      expect(result.results[0].source).toBe('openapi');
      expect(result.results[1].source).toBe('graphql');
      // asyncapi, alt-spec, links and docs-page order may vary
      const sources = result.results.map(r => r.source);
      expect(sources).toContain('asyncapi');
      expect(sources).toContain('alt-spec');
      expect(sources).toContain('links');
      expect(sources).toContain('docs-page');
    });

    it('should deduplicate patterns by ID', async () => {
      const mockPattern = createMockLearnedPattern();
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([mockPattern, mockPattern]); // Duplicate
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      const result = await discoverApiDocumentation('example.com');

      // Should only have 1 pattern (deduplicated)
      expect(result.allPatterns).toHaveLength(1);
    });

    it('should cache successful discovery', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      await discoverApiDocumentation('example.com');

      const cached = getCachedDiscovery('example.com');
      expect(cached).not.toBeNull();
      expect(cached?.found).toBe(true);
    });

    it('should return cached result on subsequent calls', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      await discoverApiDocumentation('example.com');
      vi.clearAllMocks();

      const result = await discoverApiDocumentation('example.com');

      // Should not have called discovery again
      expect(mockDiscoverOpenAPI).not.toHaveBeenCalled();
      expect(mockDiscoverGraphQL).not.toHaveBeenCalled();
      expect(result.cachedAt).toBeDefined();
    });

    it('should bypass cache with forceRefresh', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      await discoverApiDocumentation('example.com');
      vi.clearAllMocks();

      await discoverApiDocumentation('example.com', { forceRefresh: true });

      // Should have called discovery again
      expect(mockDiscoverOpenAPI).toHaveBeenCalled();
    });

    it('should skip specified sources', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: false,
        probedLocations: [],
        discoveryTime: 100,
      });
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      await discoverApiDocumentation('example.com', {
        skipSources: ['graphql'],
      });

      expect(mockDiscoverOpenAPI).toHaveBeenCalled();
      expect(mockDiscoverGraphQL).not.toHaveBeenCalled();
    });

    it('should sort results by priority and confidence', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(true));

      const result = await discoverApiDocumentation('example.com');

      // OpenAPI has higher priority, should be first
      expect(result.results[0].source).toBe('openapi');
      expect(result.results[1].source).toBe('graphql');
    });
  });

  describe('hasDocumentedApi', () => {
    it('should return true when API docs found', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      const result = await hasDocumentedApi('example.com');
      expect(result).toBe(true);
    });

    it('should return false when no API docs found', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: false,
        probedLocations: [],
        discoveryTime: 100,
      });
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      const result = await hasDocumentedApi('example.com');
      expect(result).toBe(false);
    });
  });

  describe('getDocumentedPatterns', () => {
    it('should return all patterns from discovery', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(true));

      const patterns = await getDocumentedPatterns('example.com');

      // Should have patterns from both OpenAPI and GraphQL
      expect(patterns.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array when no docs found', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: false,
        probedLocations: [],
        discoveryTime: 100,
      });
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      const patterns = await getDocumentedPatterns('example.com');
      expect(patterns).toHaveLength(0);
    });
  });

  describe('getDiscoveryBySource', () => {
    it('should return result for specific source', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: true,
        spec: createMockOpenAPISpec(),
        specUrl: 'https://example.com/openapi.json',
        probedLocations: [],
        discoveryTime: 100,
      });
      mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      const result = await getDiscoveryBySource('example.com', 'openapi');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('openapi');
      expect(result?.found).toBe(true);
    });

    it('should return null for non-existent source', async () => {
      mockDiscoverOpenAPI.mockResolvedValue({
        found: false,
        probedLocations: [],
        discoveryTime: 100,
      });
      mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(false));

      const result = await getDiscoveryBySource('example.com', 'observed');

      // observed source is not implemented as a discovery source
      expect(result).toBeNull();
    });
  });
});

// ============================================
// ERROR HANDLING TESTS
// ============================================

describe('Error Handling', () => {
  it('should handle all sources failing gracefully', async () => {
    mockDiscoverOpenAPI.mockRejectedValue(new Error('OpenAPI error'));
    mockDiscoverGraphQL.mockRejectedValue(new Error('GraphQL error'));
    mockDiscoverLinks.mockRejectedValue(new Error('Links error'));
    mockDiscoverDocs.mockRejectedValue(new Error('Docs error'));
    mockDiscoverAsyncAPI.mockRejectedValue(new Error('AsyncAPI error'));
    mockDiscoverAltSpecs.mockRejectedValue(new Error('AltSpec error'));

    const result = await discoverApiDocumentation('example.com');

    expect(result.found).toBe(false);
    expect(result.allPatterns).toHaveLength(0);
    expect(result.results).toHaveLength(6); // openapi, graphql, asyncapi, alt-spec, links, docs-page
    expect(result.results.every((r) => r.error)).toBe(true);
  });

  it('should continue if one source fails', async () => {
    mockDiscoverOpenAPI.mockRejectedValue(new Error('OpenAPI error'));
    mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(true));

    const result = await discoverApiDocumentation('example.com');

    expect(result.found).toBe(true);
    expect(result.allPatterns.length).toBeGreaterThan(0);
    // Should have result from GraphQL
    expect(result.results.find((r) => r.source === 'graphql')?.found).toBe(true);
  });
});

// ============================================
// METADATA TESTS
// ============================================

describe('Metadata Extraction', () => {
  it('should use metadata from highest priority source', async () => {
    mockDiscoverOpenAPI.mockResolvedValue({
      found: true,
      spec: createMockOpenAPISpec(),
      specUrl: 'https://example.com/openapi.json',
      probedLocations: [],
      discoveryTime: 100,
    });
    mockGeneratePatterns.mockReturnValue([createMockLearnedPattern()]);
    mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(true));

    const result = await discoverApiDocumentation('example.com');

    // Should use OpenAPI metadata (higher priority)
    expect(result.metadata.title).toBe('Test API');
    expect(result.metadata.baseUrl).toBe('https://api.example.com');
  });

  it('should fall back to GraphQL metadata if OpenAPI not found', async () => {
    mockDiscoverOpenAPI.mockResolvedValue({
      found: false,
      probedLocations: [],
      discoveryTime: 100,
    });
    mockDiscoverGraphQL.mockResolvedValue(createMockGraphQLResult(true));

    const result = await discoverApiDocumentation('example.com');

    expect(result.metadata.baseUrl).toBe('https://example.com/graphql');
  });
});
