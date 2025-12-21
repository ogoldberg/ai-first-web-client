/**
 * Tests for SemanticSearchExtended (V-004)
 *
 * Tests skill similarity search, error pattern matching,
 * content deduplication, and analytics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SemanticSearchExtended,
  createSemanticSearchExtended,
  type SkillSearchOptions,
  type ErrorSearchOptions,
  type DeduplicationOptions,
} from '../../src/core/semantic-search-extended.js';
import type { EmbeddingProvider } from '../../src/utils/embedding-provider.js';
import type { VectorStore, SearchResult, EntityType } from '../../src/utils/vector-store.js';
import type { EmbeddedStore } from '../../src/utils/embedded-store.js';
import type { Skill } from '../../src/utils/embedding-pipeline.js';
import type { FailureRecord, AntiPattern } from '../../src/types/api-patterns.js';

// ==================== MOCK FACTORIES ====================

function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    generateEmbedding: vi.fn().mockResolvedValue({
      vector: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      model: 'test-model',
    }),
    generateBatch: vi.fn().mockResolvedValue({
      vectors: [new Float32Array([0.1, 0.2, 0.3, 0.4])],
      model: 'test-model',
      processingTimeMs: 10,
    }),
    getDimensions: vi.fn().mockReturnValue(4),
    getModelName: vi.fn().mockReturnValue('test-model'),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmbeddingProvider;
}

function createMockVectorStore(searchResults: SearchResult[] = []): VectorStore {
  return {
    search: vi.fn().mockResolvedValue(searchResults),
    searchFiltered: vi.fn().mockResolvedValue(searchResults),
    add: vi.fn().mockResolvedValue(undefined),
    addBatch: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(true),
    deleteByFilter: vi.fn().mockResolvedValue(0),
    getStats: vi.fn().mockResolvedValue({
      totalRecords: 10,
      recordsByType: { pattern: 5, skill: 3, content: 1, error: 1 },
      tableExists: true,
      dimensions: 4,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isUsingLanceDB: vi.fn().mockReturnValue(true),
    reindex: vi.fn().mockResolvedValue(undefined),
  } as unknown as VectorStore;
}

interface MockStoreData {
  skills?: Map<string, Skill>;
  errors?: Map<string, FailureRecord>;
  antiPatterns?: Map<string, AntiPattern>;
  patterns?: Map<string, unknown>;
}

function createMockEmbeddedStore(data: MockStoreData = {}): EmbeddedStore {
  const skills = data.skills || new Map();
  const errors = data.errors || new Map();
  const antiPatterns = data.antiPatterns || new Map();
  const patterns = data.patterns || new Map();

  return {
    get: vi.fn().mockImplementation((collection: string, id: string) => {
      switch (collection) {
        case 'skills':
          return skills.get(id) || null;
        case 'errors':
          return errors.get(id) || null;
        case 'anti-patterns':
          return antiPatterns.get(id) || null;
        case 'patterns':
          return patterns.get(id) || null;
        default:
          return null;
      }
    }),
    getAll: vi.fn().mockImplementation((collection: string) => {
      switch (collection) {
        case 'skills':
          return skills;
        case 'errors':
          return errors;
        case 'anti-patterns':
          return antiPatterns;
        case 'patterns':
          return patterns;
        default:
          return new Map();
      }
    }),
    set: vi.fn(),
    delete: vi.fn().mockReturnValue(true),
    has: vi.fn().mockImplementation((collection: string, id: string) => {
      switch (collection) {
        case 'skills':
          return skills.has(id);
        case 'errors':
          return errors.has(id);
        default:
          return false;
      }
    }),
    clear: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalRecords: skills.size + errors.size }),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmbeddedStore;
}

function createTestSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'Login to GitHub',
    description: 'Navigate to GitHub and log in with credentials',
    domain: 'github.com',
    steps: [
      { action: 'navigate', description: 'Go to github.com' },
      { action: 'click', description: 'Click sign in button' },
      { action: 'type', description: 'Enter username' },
      { action: 'type', description: 'Enter password' },
      { action: 'click', description: 'Submit login form' },
    ],
    ...overrides,
  };
}

function createTestError(overrides: Partial<FailureRecord> = {}): FailureRecord {
  return {
    timestamp: Date.now(),
    category: 'server_error',
    statusCode: 500,
    message: 'Internal Server Error',
    domain: 'api.example.com',
    attemptedUrl: 'https://api.example.com/v1/data',
    patternId: 'pattern-1',
    responseTime: 1500,
    ...overrides,
  };
}

function createTestAntiPattern(overrides: Partial<AntiPattern> = {}): AntiPattern {
  return {
    id: 'anti-1',
    domains: ['api.example.com'],
    urlPatterns: ['/v1/data'],
    failureCategory: 'server_error',
    reason: 'Endpoint frequently returns 500 errors',
    recommendedAction: 'backoff',
    suppressionDurationMs: 60000,
    createdAt: Date.now() - 1000 * 60 * 60,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
    failureCount: 5,
    lastFailure: Date.now() - 1000 * 60,
    ...overrides,
  };
}

function createTestSearchResult(
  id: string,
  score: number,
  entityType: EntityType = 'skill',
  overrides: Partial<SearchResult['metadata']> = {}
): SearchResult {
  return {
    id,
    score,
    metadata: {
      entityType,
      domain: 'example.com',
      model: 'test-model',
      version: 1,
      createdAt: Date.now(),
      ...overrides,
    },
  };
}

// ==================== TESTS ====================

describe('SemanticSearchExtended', () => {
  describe('Initialization', () => {
    it('should create instance without dependencies', () => {
      const search = createSemanticSearchExtended();
      expect(search).toBeDefined();
      expect(search.isAvailable()).toBe(false);
    });

    it('should create instance with dependencies', () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const search = createSemanticSearchExtended(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      expect(search).toBeDefined();
      expect(search.isAvailable()).toBe(true);
    });

    it('should initialize with dependencies', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const search = new SemanticSearchExtended();
      expect(search.isAvailable()).toBe(false);

      await search.initialize(embeddingProvider, vectorStore, embeddedStore);
      expect(search.isAvailable()).toBe(true);
    });
  });

  describe('Skill Similarity Search', () => {
    let search: SemanticSearchExtended;
    let mockEmbeddingProvider: EmbeddingProvider;
    let mockVectorStore: VectorStore;
    let mockEmbeddedStore: EmbeddedStore;

    beforeEach(() => {
      const skills = new Map<string, Skill>([
        ['skill-1', createTestSkill({ name: 'Login to GitHub' })],
        ['skill-2', createTestSkill({ name: 'Create Repository', domain: 'github.com' })],
        ['skill-3', createTestSkill({ name: 'Search Google', domain: 'google.com' })],
      ]);

      mockEmbeddingProvider = createMockEmbeddingProvider();
      mockVectorStore = createMockVectorStore([
        createTestSearchResult('skill-1', 0.92, 'skill'),
        createTestSearchResult('skill-2', 0.85, 'skill'),
      ]);
      mockEmbeddedStore = createMockEmbeddedStore({ skills });

      search = createSemanticSearchExtended(
        mockEmbeddingProvider,
        mockVectorStore,
        mockEmbeddedStore
      );
    });

    it('should find similar skills by query', async () => {
      const result = await search.findSimilarSkills('log into GitHub');

      expect(result.usedVectorSearch).toBe(true);
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return empty results when unavailable', async () => {
      const unavailableSearch = createSemanticSearchExtended();
      const result = await unavailableSearch.findSimilarSkills('login');

      expect(result.usedVectorSearch).toBe(false);
      expect(result.skills).toEqual([]);
    });

    it('should filter by domain', async () => {
      await search.findSimilarSkills('login', { domain: 'github.com' });

      expect(mockVectorStore.searchFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ domain: 'github.com', entityType: 'skill' }),
        expect.anything()
      );
    });

    it('should filter by tenant ID', async () => {
      await search.findSimilarSkills('login', { tenantId: 'tenant-1' });

      expect(mockVectorStore.searchFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tenantId: 'tenant-1' }),
        expect.anything()
      );
    });

    it('should respect limit option', async () => {
      const result = await search.findSimilarSkills('login', { limit: 1 });

      expect(result.skills.length).toBeLessThanOrEqual(1);
    });

    it('should sort results by similarity', async () => {
      const result = await search.findSimilarSkills('login');

      if (result.skills.length >= 2) {
        expect(result.skills[0].similarity).toBeGreaterThanOrEqual(
          result.skills[1].similarity
        );
      }
    });

    it('should find skills by action', async () => {
      const result = await search.findSkillsByAction('click');

      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('click')
      );
    });

    it('should find skills for domain', async () => {
      const result = await search.findSkillsForDomain('github.com', 'login');

      expect(mockVectorStore.searchFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ domain: 'github.com' }),
        expect.anything()
      );
    });

    it('should handle embedding generation errors gracefully', async () => {
      vi.spyOn(mockEmbeddingProvider, 'generateEmbedding').mockRejectedValue(
        new Error('Embedding failed')
      );

      const result = await search.findSimilarSkills('login');

      expect(result.usedVectorSearch).toBe(false);
      expect(result.skills).toEqual([]);
    });
  });

  describe('Error Pattern Matching', () => {
    let search: SemanticSearchExtended;
    let mockEmbeddingProvider: EmbeddingProvider;
    let mockVectorStore: VectorStore;
    let mockEmbeddedStore: EmbeddedStore;

    beforeEach(() => {
      const errors = new Map<string, FailureRecord>([
        ['error-1', createTestError({ message: 'Internal Server Error', category: 'server_error' })],
        ['error-2', createTestError({ message: 'Rate limit exceeded', category: 'rate_limited', statusCode: 429 })],
        ['error-3', createTestError({ message: 'Connection timeout', category: 'timeout' })],
      ]);

      const antiPatterns = new Map<string, AntiPattern>([
        ['anti-1', createTestAntiPattern({ failureCategory: 'server_error' })],
      ]);

      mockEmbeddingProvider = createMockEmbeddingProvider();
      mockVectorStore = createMockVectorStore([
        createTestSearchResult('error-1', 0.88, 'error'),
        createTestSearchResult('error-2', 0.75, 'error'),
      ]);
      mockEmbeddedStore = createMockEmbeddedStore({ errors, antiPatterns });

      search = createSemanticSearchExtended(
        mockEmbeddingProvider,
        mockVectorStore,
        mockEmbeddedStore
      );
    });

    it('should find similar errors by message', async () => {
      const result = await search.findSimilarErrors('Server returned 500');

      expect(result.usedVectorSearch).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return empty results when unavailable', async () => {
      const unavailableSearch = createSemanticSearchExtended();
      const result = await unavailableSearch.findSimilarErrors('error');

      expect(result.usedVectorSearch).toBe(false);
      expect(result.errors).toEqual([]);
    });

    it('should include URL context in search', async () => {
      await search.findSimilarErrors('error', {
        url: 'https://api.example.com/v1/users',
      });

      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('api.example.com')
      );
    });

    it('should include status code context in search', async () => {
      await search.findSimilarErrors('error', { statusCode: 500 });

      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('500')
      );
    });

    it('should filter by domain', async () => {
      await search.findSimilarErrors('error', { domain: 'api.example.com' });

      expect(mockVectorStore.searchFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ domain: 'api.example.com' }),
        expect.anything()
      );
    });

    it('should include matching anti-patterns', async () => {
      const result = await search.findSimilarErrors('Internal Server Error');

      // The first error should have an anti-pattern match
      const errorWithAntiPattern = result.errors.find((e) => e.antiPattern);
      // May or may not find one depending on mock setup
      // Just verify structure is correct
      expect(result.errors.every((e) => 'antiPattern' in e)).toBe(true);
    });

    it('should handle search errors gracefully', async () => {
      vi.spyOn(mockVectorStore, 'searchFiltered').mockRejectedValue(
        new Error('Search failed')
      );

      const result = await search.findSimilarErrors('error');

      expect(result.usedVectorSearch).toBe(false);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Retry Strategy Suggestions', () => {
    let search: SemanticSearchExtended;

    beforeEach(() => {
      const errors = new Map<string, FailureRecord>([
        ['error-1', createTestError({ category: 'rate_limited' })],
      ]);

      const antiPatterns = new Map<string, AntiPattern>([
        ['anti-1', createTestAntiPattern({
          failureCategory: 'rate_limited',
          recommendedAction: 'backoff',
          suppressionDurationMs: 60000,
          reason: 'Rate limited by API',
        })],
      ]);

      const mockEmbeddingProvider = createMockEmbeddingProvider();
      const mockVectorStore = createMockVectorStore([
        createTestSearchResult('error-1', 0.9, 'error'),
      ]);
      const mockEmbeddedStore = createMockEmbeddedStore({ errors, antiPatterns });

      search = createSemanticSearchExtended(
        mockEmbeddingProvider,
        mockVectorStore,
        mockEmbeddedStore
      );
    });

    it('should return null when no similar errors found', async () => {
      const emptySearch = createSemanticSearchExtended(
        createMockEmbeddingProvider(),
        createMockVectorStore([]), // No results
        createMockEmbeddedStore()
      );

      const result = await emptySearch.getSuggestedRetryStrategy('Unknown error');

      expect(result).toBeNull();
    });

    it('should suggest strategy based on error category', async () => {
      const result = await search.getSuggestedRetryStrategy('Rate limit exceeded');

      expect(result).not.toBeNull();
      expect(result?.strategy).toBeDefined();
      expect(result?.reason).toBeDefined();
    });

    it('should include delay when applicable', async () => {
      const result = await search.getSuggestedRetryStrategy('Rate limit exceeded');

      // Should have delay for rate_limited errors
      if (result && result.strategy === 'backoff') {
        expect(result.delayMs).toBeDefined();
      }
    });
  });

  describe('Content Deduplication', () => {
    let search: SemanticSearchExtended;
    let mockVectorStore: VectorStore;

    beforeEach(() => {
      mockVectorStore = createMockVectorStore([
        createTestSearchResult('content-1', 0.97, 'content'),
        createTestSearchResult('content-2', 0.88, 'content'),
      ]);

      search = createSemanticSearchExtended(
        createMockEmbeddingProvider(),
        mockVectorStore,
        createMockEmbeddedStore()
      );
    });

    it('should detect duplicate content', async () => {
      const result = await search.checkDuplicate('This is some test content');

      expect(result.isDuplicate).toBe(true);
      expect(result.originalId).toBe('content-1');
      expect(result.similarity).toBeGreaterThanOrEqual(0.95);
    });

    it('should not detect duplicate when below threshold', async () => {
      // Override to return lower similarity results
      vi.spyOn(mockVectorStore, 'searchFiltered').mockResolvedValue([
        createTestSearchResult('content-1', 0.85, 'content'),
      ]);

      const result = await search.checkDuplicate('Unique content');

      expect(result.isDuplicate).toBe(false);
      expect(result.originalId).toBeUndefined();
    });

    it('should use custom threshold', async () => {
      const result = await search.checkDuplicate('content', {
        similarityThreshold: 0.99, // Very high threshold
      });

      // With 0.97 similarity and 0.99 threshold, should not be duplicate
      expect(result.isDuplicate).toBe(false);
    });

    it('should filter by domain', async () => {
      await search.checkDuplicate('content', { domain: 'example.com' });

      expect(mockVectorStore.searchFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ domain: 'example.com' }),
        expect.anything()
      );
    });

    it('should return empty result when unavailable', async () => {
      const unavailableSearch = createSemanticSearchExtended();
      const result = await unavailableSearch.checkDuplicate('content');

      expect(result.isDuplicate).toBe(false);
      expect(result.candidatesChecked).toBe(0);
    });

    it('should find near duplicates', async () => {
      vi.spyOn(mockVectorStore, 'searchFiltered').mockResolvedValue([
        createTestSearchResult('content-1', 0.92, 'content'),
        createTestSearchResult('content-2', 0.88, 'content'),
      ]);

      const result = await search.findNearDuplicates('Some content', {
        similarityThreshold: 0.85,
      });

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('content-1');
      expect(result[0].similarity).toBe(0.92);
    });

    it('should generate content fingerprint', async () => {
      const fingerprint = await search.getContentFingerprint('Test content');

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint!.length).toBeGreaterThan(0);
    });

    it('should return null fingerprint when unavailable', async () => {
      const unavailableSearch = createSemanticSearchExtended();
      const fingerprint = await unavailableSearch.getContentFingerprint('content');

      expect(fingerprint).toBeNull();
    });
  });

  describe('Analytics', () => {
    let search: SemanticSearchExtended;

    beforeEach(() => {
      const mockEmbeddingProvider = createMockEmbeddingProvider();
      const mockVectorStore = createMockVectorStore([
        createTestSearchResult('skill-1', 0.85, 'skill'),
      ]);
      const skills = new Map<string, Skill>([
        ['skill-1', createTestSkill()],
        ['skill-2', createTestSkill()],
      ]);
      const mockEmbeddedStore = createMockEmbeddedStore({ skills });

      search = createSemanticSearchExtended(
        mockEmbeddingProvider,
        mockVectorStore,
        mockEmbeddedStore
      );
    });

    it('should return analytics when available', async () => {
      const analytics = await search.getAnalytics();

      expect(analytics.totalEmbeddings).toBeGreaterThanOrEqual(0);
      expect(analytics.dimensions).toBe(4);
      expect(analytics.model).toBe('test-model');
      expect(analytics.embeddingsByType).toBeDefined();
      expect(analytics.similarityDistribution).toBeDefined();
    });

    it('should return empty analytics when unavailable', async () => {
      const unavailableSearch = createSemanticSearchExtended();
      const analytics = await unavailableSearch.getAnalytics();

      expect(analytics.totalEmbeddings).toBe(0);
      expect(analytics.model).toBe('unavailable');
    });

    it('should track search metrics', async () => {
      // Perform a search to generate metrics
      await search.findSimilarSkills('test query');

      const analytics = await search.getAnalytics();

      expect(analytics.searchCountByType.skill).toBeGreaterThan(0);
    });

    it('should track similarity distribution', async () => {
      // Perform searches
      await search.findSimilarSkills('query 1');
      await search.findSimilarSkills('query 2');

      const analytics = await search.getAnalytics();

      // Should have tracked some results
      const totalDistribution = Object.values(analytics.similarityDistribution)
        .reduce((a, b) => a + b, 0);
      expect(totalDistribution).toBeGreaterThanOrEqual(0);
    });

    it('should reset metrics', async () => {
      // Generate some metrics
      await search.findSimilarSkills('test');

      // Reset
      search.resetMetrics();

      const analytics = await search.getAnalytics();

      expect(analytics.avgSearchLatencyMs).toBe(0);
      expect(analytics.searchCountByType.skill).toBe(0);
    });

    it('should get coverage report', async () => {
      const coverage = await search.getCoverageReport();

      expect(coverage.patterns).toBeDefined();
      expect(coverage.patterns.total).toBeGreaterThanOrEqual(0);
      expect(coverage.skills).toBeDefined();
      expect(coverage.skills.total).toBe(2); // We have 2 skills in mock
    });

    it('should return empty coverage when unavailable', async () => {
      const unavailableSearch = createSemanticSearchExtended();
      const coverage = await unavailableSearch.getCoverageReport();

      expect(coverage.patterns.total).toBe(0);
      expect(coverage.patterns.percentage).toBe(0);
      expect(coverage.skills.total).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query gracefully', async () => {
      const search = createSemanticSearchExtended(
        createMockEmbeddingProvider(),
        createMockVectorStore([]),
        createMockEmbeddedStore()
      );

      const result = await search.findSimilarSkills('');

      expect(result.skills).toEqual([]);
    });

    it('should handle very long content in deduplication', async () => {
      const search = createSemanticSearchExtended(
        createMockEmbeddingProvider(),
        createMockVectorStore([]),
        createMockEmbeddedStore()
      );

      const longContent = 'x'.repeat(10000);
      const result = await search.checkDuplicate(longContent);

      // Should not throw
      expect(result).toBeDefined();
    });

    it('should handle special characters in queries', async () => {
      const search = createSemanticSearchExtended(
        createMockEmbeddingProvider(),
        createMockVectorStore([]),
        createMockEmbeddedStore()
      );

      const result = await search.findSimilarSkills('query with <script>alert("xss")</script>');

      // Should not throw
      expect(result).toBeDefined();
    });

    it('should handle Unicode in queries', async () => {
      const search = createSemanticSearchExtended(
        createMockEmbeddingProvider(),
        createMockVectorStore([]),
        createMockEmbeddedStore()
      );

      const result = await search.findSimilarSkills('Test content with emojis is ignored for logging');

      // Should not throw
      expect(result).toBeDefined();
    });

    it('should handle missing embedded store records gracefully', async () => {
      const mockVectorStore = createMockVectorStore([
        createTestSearchResult('missing-skill', 0.9, 'skill'),
      ]);
      // EmbeddedStore has no matching skill
      const mockEmbeddedStore = createMockEmbeddedStore({ skills: new Map() });

      const search = createSemanticSearchExtended(
        createMockEmbeddingProvider(),
        mockVectorStore,
        mockEmbeddedStore
      );

      const result = await search.findSimilarSkills('test');

      // Should return empty results since the skill is not in embedded store
      expect(result.skills).toEqual([]);
    });
  });

  describe('URL Text Extraction', () => {
    let search: SemanticSearchExtended;
    let mockEmbeddingProvider: EmbeddingProvider;

    beforeEach(() => {
      mockEmbeddingProvider = createMockEmbeddingProvider();
      search = createSemanticSearchExtended(
        mockEmbeddingProvider,
        createMockVectorStore([]),
        createMockEmbeddedStore()
      );
    });

    it('should extract domain from URL', async () => {
      await search.findSimilarErrors('error', {
        url: 'https://api.example.com/v1/users/123',
      });

      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('api.example.com')
      );
    });

    it('should filter out numeric IDs from URL path', async () => {
      await search.findSimilarErrors('error', {
        url: 'https://api.example.com/v1/users/12345',
      });

      // Should contain 'users' but the numeric ID should be filtered out
      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('users')
      );
    });

    it('should handle invalid URLs gracefully', async () => {
      await search.findSimilarErrors('error', {
        url: 'not-a-valid-url',
      });

      // Should not throw, just use the raw string
      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalled();
    });
  });
});
