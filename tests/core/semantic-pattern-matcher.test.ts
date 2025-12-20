/**
 * Tests for SemanticPatternMatcher (V-003)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SemanticPatternMatcher,
  createSemanticPatternMatcher,
  type FindSimilarOptions,
  type SimilarPattern,
} from '../../src/core/semantic-pattern-matcher.js';
import type { EmbeddingProvider } from '../../src/utils/embedding-provider.js';
import type { VectorStore, SearchResult } from '../../src/utils/vector-store.js';
import type { EmbeddedStore } from '../../src/utils/embedded-store.js';
import type { LearnedPattern } from '../../src/utils/embedding-pipeline.js';

// Mock dependencies
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
      recordsByType: { pattern: 8, skill: 2, content: 0, error: 0 },
      tableExists: true,
      dimensions: 4,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isUsingLanceDB: vi.fn().mockReturnValue(true),
    reindex: vi.fn().mockResolvedValue(undefined),
  } as unknown as VectorStore;
}

function createMockEmbeddedStore(patterns: Map<string, LearnedPattern> = new Map()): EmbeddedStore {
  return {
    get: vi.fn().mockImplementation((collection: string, id: string) => {
      return patterns.get(id) || null;
    }),
    set: vi.fn(),
    delete: vi.fn().mockReturnValue(true),
    getAll: vi.fn().mockReturnValue(patterns),
    has: vi.fn().mockImplementation((collection: string, id: string) => patterns.has(id)),
    clear: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalRecords: patterns.size }),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmbeddedStore;
}

function createTestPattern(overrides: Partial<LearnedPattern> = {}): LearnedPattern {
  return {
    urlPattern: 'https://api.example.com/v1/users/{id}',
    method: 'GET',
    description: 'User lookup endpoint',
    confidence: 0.9,
    domain: 'api.example.com',
    lastUsed: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    successCount: 10,
    failureCount: 0,
    ...overrides,
  };
}

function createTestSearchResult(
  id: string,
  score: number,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    id,
    score,
    metadata: {
      entityType: 'pattern',
      domain: 'api.example.com',
      model: 'test-model',
      version: 1,
      createdAt: Date.now(),
    },
    ...overrides,
  };
}

describe('SemanticPatternMatcher', () => {
  describe('Initialization', () => {
    it('should create with null dependencies', () => {
      const matcher = createSemanticPatternMatcher();
      expect(matcher.isAvailable()).toBe(false);
    });

    it('should create with provided dependencies', () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      expect(matcher.isAvailable()).toBe(true);
    });

    it('should initialize via initialize method', async () => {
      const matcher = new SemanticPatternMatcher();
      expect(matcher.isAvailable()).toBe(false);

      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      await matcher.initialize(embeddingProvider, vectorStore, embeddedStore);
      expect(matcher.isAvailable()).toBe(true);
    });
  });

  describe('findSimilarByUrl', () => {
    it('should return empty results when not available', async () => {
      const matcher = createSemanticPatternMatcher();
      const result = await matcher.findSimilarByUrl('https://example.com/api/users');

      expect(result.patterns).toEqual([]);
      expect(result.usedVectorSearch).toBe(false);
    });

    it('should generate embedding and search vector store', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.9),
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilarByUrl('https://api.example.com/v1/users/123');

      expect(embeddingProvider.generateEmbedding).toHaveBeenCalled();
      expect(result.usedVectorSearch).toBe(true);
      expect(result.patterns.length).toBe(1);
      expect(result.patterns[0].pattern.urlPattern).toBe('https://api.example.com/v1/users/{id}');
    });

    it('should extract domain and path for embedding', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      await matcher.findSimilarByUrl('https://www.example.com/api/v1/users/123?include=profile');

      expect(embeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('example.com')
      );
      expect(embeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('api')
      );
      expect(embeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('users')
      );
      // Should include query param name but not numeric IDs
      expect(embeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('include')
      );
    });

    it('should filter by minimum similarity', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.9),
        createTestSearchResult('pattern-2', 0.5), // Below threshold
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
        ['pattern-2', createTestPattern({ urlPattern: 'https://api.example.com/v2/posts' })],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilarByUrl('https://api.example.com/api', {
        minSimilarity: 0.7,
      });

      // Only high-scoring pattern should be returned
      expect(result.patterns.length).toBe(1);
      expect(result.patterns[0].similarity).toBeGreaterThanOrEqual(0.7);
    });

    it('should apply domain filter', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.9),
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      await matcher.findSimilarByUrl('https://api.example.com/users', {
        domain: 'api.example.com',
      });

      expect(vectorStore.searchFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ domain: 'api.example.com' }),
        expect.anything()
      );
    });

    it('should handle missing patterns gracefully', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('missing-pattern', 0.9),
      ]);
      const embeddedStore = createMockEmbeddedStore(new Map()); // Empty store

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilarByUrl('https://api.example.com/users');

      expect(result.patterns).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      (embeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Model loading failed')
      );
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilarByUrl('https://api.example.com/users');

      expect(result.patterns).toEqual([]);
      expect(result.usedVectorSearch).toBe(false);
    });
  });

  describe('findSimilarByContent', () => {
    it('should search by content text', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.85),
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern({ description: 'Fetch user profile' })],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilarByContent(
        'Get user profile information including name and email'
      );

      expect(embeddingProvider.generateEmbedding).toHaveBeenCalled();
      expect(result.usedVectorSearch).toBe(true);
      expect(result.patterns.length).toBe(1);
    });

    it('should truncate long content', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const longContent = 'a'.repeat(1000);
      await matcher.findSimilarByContent(longContent);

      const call = (embeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0].length).toBeLessThanOrEqual(500);
    });
  });

  describe('findSimilar (combined)', () => {
    it('should combine URL and content for embedding', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.88),
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilar(
        'https://api.example.com/v1/users',
        'Fetch user data from the API'
      );

      expect(result.usedVectorSearch).toBe(true);
      expect(result.patterns.length).toBe(1);
      expect(result.patterns[0].matchReason).toBe('both');
    });

    it('should fall back to URL-only when no content', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.88),
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilar('https://api.example.com/v1/users');

      expect(result.usedVectorSearch).toBe(true);
      expect(result.patterns[0].matchReason).toBe('url');
    });
  });

  describe('findBestMatch', () => {
    it('should return best matching pattern', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.95),
        createTestSearchResult('pattern-2', 0.75),
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
        ['pattern-2', createTestPattern({ urlPattern: 'https://api.example.com/v2/posts' })],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findBestMatch('https://api.example.com/users');

      expect(result).not.toBeNull();
      expect(result!.pattern.urlPattern).toBe('https://api.example.com/v1/users/{id}');
    });

    it('should return null when no match above threshold', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.5), // Below default 0.75 threshold
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findBestMatch('https://api.example.com/users', 0.75);

      expect(result).toBeNull();
    });

    it('should respect custom similarity threshold', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('pattern-1', 0.6),
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['pattern-1', createTestPattern()],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      // With lower threshold, should return result
      const result = await matcher.findBestMatch('https://api.example.com/users', 0.5);
      expect(result).not.toBeNull();

      // With higher threshold, should not
      const result2 = await matcher.findBestMatch('https://api.example.com/users', 0.8);
      expect(result2).toBeNull();
    });
  });

  describe('Combined scoring', () => {
    it('should combine vector similarity with confidence', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('high-conf', 0.8),
        createTestSearchResult('low-conf', 0.85), // Higher vector similarity but lower pattern confidence
      ]);
      const patterns = new Map<string, LearnedPattern>([
        ['high-conf', createTestPattern({ confidence: 0.95 })],
        ['low-conf', createTestPattern({ confidence: 0.4, urlPattern: 'https://other.com/api' })],
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilarByUrl('https://api.example.com/users', {
        limit: 2,
        minSimilarity: 0.5,
      });

      // Results should be sorted by combined score
      expect(result.patterns.length).toBe(2);
      // The high confidence pattern should rank first despite slightly lower vector similarity
      // due to the weighted combination
      expect(result.patterns[0].embeddingId).toBe('high-conf');
    });

    it('should factor in recency', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore([
        createTestSearchResult('recent', 0.8),
        createTestSearchResult('old', 0.8), // Same vector similarity
      ]);
      const now = Date.now();
      const patterns = new Map<string, LearnedPattern>([
        ['recent', createTestPattern({ lastUsed: now - 1000 * 60 * 60 })], // 1 hour ago
        ['old', createTestPattern({ lastUsed: now - 1000 * 60 * 60 * 24 * 60, urlPattern: 'https://old.com/api' })], // 60 days ago
      ]);
      const embeddedStore = createMockEmbeddedStore(patterns);

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const result = await matcher.findSimilarByUrl('https://api.example.com/users', {
        limit: 2,
        minSimilarity: 0.5,
      });

      expect(result.patterns.length).toBe(2);
      // Recent pattern should score higher due to recency bonus
      expect(result.patterns[0].pattern.urlPattern).toContain('api.example.com');
    });
  });

  describe('getStats', () => {
    it('should return unavailable stats when not initialized', async () => {
      const matcher = createSemanticPatternMatcher();
      const stats = await matcher.getStats();

      expect(stats.available).toBe(false);
      expect(stats.patternCount).toBe(0);
    });

    it('should return vector store stats', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      const stats = await matcher.getStats();

      expect(stats.available).toBe(true);
      expect(stats.patternCount).toBe(8);
      expect(stats.dimensions).toBe(4);
    });
  });

  describe('URL text extraction', () => {
    it('should filter out numeric IDs from URL', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      await matcher.findSimilarByUrl('https://api.example.com/users/12345/posts/67890');

      const call = (embeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>).mock.calls[0];
      const text = call[0] as string;

      // Should not include numeric IDs
      expect(text).not.toContain('12345');
      expect(text).not.toContain('67890');
      // Should include path segments
      expect(text).toContain('users');
      expect(text).toContain('posts');
    });

    it('should filter out UUID-like IDs from URL', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      await matcher.findSimilarByUrl('https://api.example.com/items/550e8400-e29b-41d4-a716-446655440000');

      const call = (embeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>).mock.calls[0];
      const text = call[0] as string;

      // Should not include UUID
      expect(text).not.toContain('550e8400');
      // Should include path segment
      expect(text).toContain('items');
    });

    it('should strip www from domain', async () => {
      const embeddingProvider = createMockEmbeddingProvider();
      const vectorStore = createMockVectorStore();
      const embeddedStore = createMockEmbeddedStore();

      const matcher = createSemanticPatternMatcher(
        embeddingProvider,
        vectorStore,
        embeddedStore
      );

      await matcher.findSimilarByUrl('https://www.example.com/api');

      const call = (embeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>).mock.calls[0];
      const text = call[0] as string;

      expect(text).toContain('example.com');
      expect(text).not.toContain('www.example.com');
    });
  });
});

describe('LearningEngine Semantic Integration', () => {
  // Note: These tests would require importing LearningEngine
  // but are included here as documentation of the integration

  it.skip('should set semantic matcher', () => {
    // const engine = new LearningEngine();
    // const matcher = createSemanticPatternMatcher(...);
    // engine.setSemanticMatcher(matcher);
    // expect(engine.hasSemanticMatcher()).toBe(true);
  });

  it.skip('should use semantic search in findPatternAsync', async () => {
    // Test that findPatternAsync falls back to semantic search
  });
});
