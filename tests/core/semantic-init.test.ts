/**
 * Tests for Semantic Infrastructure Initialization (LI-001)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initializeSemanticInfrastructure,
  checkSemanticDependencies,
  getSemanticInfrastructure,
  getSemanticMatcher,
  isSemanticInitialized,
  wasInitializationAttempted,
  resetSemanticInfrastructure,
} from '../../src/core/semantic-init.js';

// Mock the dependencies
vi.mock('../../src/utils/embedding-provider.js', () => ({
  EmbeddingProvider: {
    isAvailable: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../src/utils/vector-store.js', () => ({
  VectorStore: {
    isAvailable: vi.fn(),
  },
  getVectorStore: vi.fn(),
}));

vi.mock('../../src/utils/embedded-store.js', () => ({
  EmbeddedStore: {
    isAvailable: vi.fn(),
  },
  createEmbeddedStore: vi.fn(),
}));

vi.mock('../../src/core/semantic-pattern-matcher.js', () => ({
  createSemanticPatternMatcher: vi.fn(),
}));

import { EmbeddingProvider } from '../../src/utils/embedding-provider.js';
import { VectorStore, getVectorStore } from '../../src/utils/vector-store.js';
import { EmbeddedStore, createEmbeddedStore } from '../../src/utils/embedded-store.js';
import { createSemanticPatternMatcher } from '../../src/core/semantic-pattern-matcher.js';

describe('Semantic Infrastructure Initialization', () => {
  beforeEach(async () => {
    // Reset all mocks and global state
    vi.clearAllMocks();
    await resetSemanticInfrastructure();
  });

  afterEach(async () => {
    await resetSemanticInfrastructure();
  });

  describe('checkSemanticDependencies', () => {
    it('should report all dependencies available when they exist', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should report missing @xenova/transformers', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(false);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(false);
      expect(result.missing).toContain('@xenova/transformers');
    });

    it('should report missing @lancedb/lancedb', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(false);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(false);
      expect(result.missing).toContain('@lancedb/lancedb');
    });

    it('should report missing better-sqlite3', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(false);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(false);
      expect(result.missing).toContain('better-sqlite3');
    });

    it('should report multiple missing dependencies', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(false);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(false);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(false);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(false);
      expect(result.missing).toHaveLength(3);
      expect(result.missing).toContain('@xenova/transformers');
      expect(result.missing).toContain('@lancedb/lancedb');
      expect(result.missing).toContain('better-sqlite3');
    });
  });

  describe('initializeSemanticInfrastructure', () => {
    it('should fail gracefully when dependencies are missing', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(false);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(false);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(false);

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(false);
      expect(result.infrastructure).toBeNull();
      expect(result.message).toContain('missing dependencies');
      expect(result.unavailable).toBeDefined();
      expect(result.unavailable?.length).toBeGreaterThan(0);
    });

    it('should succeed when all dependencies are available', async () => {
      // Mock all dependencies as available
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      // Mock successful creation of each component
      const mockEmbeddingProvider = {
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      };
      vi.mocked(EmbeddingProvider.create).mockResolvedValue(
        mockEmbeddingProvider as unknown as import('../../src/utils/embedding-provider.js').EmbeddingProvider
      );

      const mockVectorStore = {};
      vi.mocked(getVectorStore).mockResolvedValue(
        mockVectorStore as unknown as import('../../src/utils/vector-store.js').VectorStore
      );

      const mockEmbeddedStore = {
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(createEmbeddedStore).mockReturnValue(
        mockEmbeddedStore as unknown as import('../../src/utils/embedded-store.js').EmbeddedStore
      );

      const mockMatcher = {};
      vi.mocked(createSemanticPatternMatcher).mockReturnValue(
        mockMatcher as unknown as import('../../src/core/semantic-pattern-matcher.js').SemanticPatternMatcher
      );

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(true);
      expect(result.infrastructure).not.toBeNull();
      expect(result.infrastructure?.embeddingProvider).toBe(mockEmbeddingProvider);
      expect(result.infrastructure?.vectorStore).toBe(mockVectorStore);
      expect(result.infrastructure?.embeddedStore).toBe(mockEmbeddedStore);
      expect(result.infrastructure?.matcher).toBe(mockMatcher);
    });

    it('should return cached infrastructure on subsequent calls', async () => {
      // Setup for successful initialization
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      const mockEmbeddingProvider = {
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      };
      vi.mocked(EmbeddingProvider.create).mockResolvedValue(
        mockEmbeddingProvider as unknown as import('../../src/utils/embedding-provider.js').EmbeddingProvider
      );
      vi.mocked(getVectorStore).mockResolvedValue({} as unknown as import('../../src/utils/vector-store.js').VectorStore);
      vi.mocked(createEmbeddedStore).mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as import('../../src/utils/embedded-store.js').EmbeddedStore);
      vi.mocked(createSemanticPatternMatcher).mockReturnValue(
        {} as unknown as import('../../src/core/semantic-pattern-matcher.js').SemanticPatternMatcher
      );

      // First call initializes
      const result1 = await initializeSemanticInfrastructure();
      expect(result1.success).toBe(true);

      // Second call returns cached
      const result2 = await initializeSemanticInfrastructure();
      expect(result2.success).toBe(true);
      expect(result2.infrastructure).toBe(result1.infrastructure);

      // Create should only be called once
      expect(EmbeddingProvider.create).toHaveBeenCalledTimes(1);
    });

    it('should fail gracefully when EmbeddingProvider.create returns null', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      vi.mocked(EmbeddingProvider.create).mockResolvedValue(null);

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(false);
      expect(result.infrastructure).toBeNull();
      expect(result.message).toContain('Failed to create embedding provider');
    });

    it('should fail gracefully when getVectorStore returns null', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      vi.mocked(EmbeddingProvider.create).mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
      } as unknown as import('../../src/utils/embedding-provider.js').EmbeddingProvider);
      vi.mocked(getVectorStore).mockResolvedValue(null);

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(false);
      expect(result.infrastructure).toBeNull();
      expect(result.message).toContain('Failed to create vector store');
    });

    it('should handle initialization errors gracefully', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      vi.mocked(EmbeddingProvider.create).mockRejectedValue(new Error('Test error'));

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(false);
      expect(result.infrastructure).toBeNull();
      expect(result.message).toContain('Initialization failed');
      expect(result.message).toContain('Test error');
    });
  });

  describe('getSemanticInfrastructure and getSemanticMatcher', () => {
    it('should return null when not initialized', () => {
      expect(getSemanticInfrastructure()).toBeNull();
      expect(getSemanticMatcher()).toBeNull();
    });

    it('should return infrastructure after successful initialization', async () => {
      // Setup for successful initialization
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      const mockMatcher = { isAvailable: vi.fn().mockReturnValue(true) };
      vi.mocked(EmbeddingProvider.create).mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      } as unknown as import('../../src/utils/embedding-provider.js').EmbeddingProvider);
      vi.mocked(getVectorStore).mockResolvedValue({} as unknown as import('../../src/utils/vector-store.js').VectorStore);
      vi.mocked(createEmbeddedStore).mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as import('../../src/utils/embedded-store.js').EmbeddedStore);
      vi.mocked(createSemanticPatternMatcher).mockReturnValue(
        mockMatcher as unknown as import('../../src/core/semantic-pattern-matcher.js').SemanticPatternMatcher
      );

      await initializeSemanticInfrastructure();

      expect(getSemanticInfrastructure()).not.toBeNull();
      expect(getSemanticMatcher()).toBe(mockMatcher);
    });
  });

  describe('isSemanticInitialized and wasInitializationAttempted', () => {
    it('should correctly track initialization state', async () => {
      expect(isSemanticInitialized()).toBe(false);
      expect(wasInitializationAttempted()).toBe(false);

      // Setup for failed initialization (missing deps)
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(false);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(false);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(false);

      await initializeSemanticInfrastructure();

      expect(isSemanticInitialized()).toBe(false);
      expect(wasInitializationAttempted()).toBe(true);
    });

    it('should track successful initialization', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      vi.mocked(EmbeddingProvider.create).mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      } as unknown as import('../../src/utils/embedding-provider.js').EmbeddingProvider);
      vi.mocked(getVectorStore).mockResolvedValue({} as unknown as import('../../src/utils/vector-store.js').VectorStore);
      vi.mocked(createEmbeddedStore).mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as import('../../src/utils/embedded-store.js').EmbeddedStore);
      vi.mocked(createSemanticPatternMatcher).mockReturnValue(
        {} as unknown as import('../../src/core/semantic-pattern-matcher.js').SemanticPatternMatcher
      );

      await initializeSemanticInfrastructure();

      expect(isSemanticInitialized()).toBe(true);
      expect(wasInitializationAttempted()).toBe(true);
    });
  });

  describe('resetSemanticInfrastructure', () => {
    it('should reset all global state', async () => {
      // Setup and initialize
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      vi.mocked(EmbeddingProvider.create).mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      } as unknown as import('../../src/utils/embedding-provider.js').EmbeddingProvider);
      vi.mocked(getVectorStore).mockResolvedValue({} as unknown as import('../../src/utils/vector-store.js').VectorStore);
      vi.mocked(createEmbeddedStore).mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as import('../../src/utils/embedded-store.js').EmbeddedStore);
      vi.mocked(createSemanticPatternMatcher).mockReturnValue(
        {} as unknown as import('../../src/core/semantic-pattern-matcher.js').SemanticPatternMatcher
      );

      await initializeSemanticInfrastructure();
      expect(isSemanticInitialized()).toBe(true);
      expect(wasInitializationAttempted()).toBe(true);

      // Reset
      await resetSemanticInfrastructure();

      expect(isSemanticInitialized()).toBe(false);
      expect(wasInitializationAttempted()).toBe(false);
      expect(getSemanticInfrastructure()).toBeNull();
      expect(getSemanticMatcher()).toBeNull();
    });
  });

  describe('concurrent initialization', () => {
    it('should handle concurrent initialization calls', async () => {
      vi.mocked(EmbeddingProvider.isAvailable).mockResolvedValue(true);
      vi.mocked(VectorStore.isAvailable).mockResolvedValue(true);
      vi.mocked(EmbeddedStore.isAvailable).mockResolvedValue(true);

      vi.mocked(EmbeddingProvider.create).mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      } as unknown as import('../../src/utils/embedding-provider.js').EmbeddingProvider);
      vi.mocked(getVectorStore).mockResolvedValue({} as unknown as import('../../src/utils/vector-store.js').VectorStore);
      vi.mocked(createEmbeddedStore).mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as import('../../src/utils/embedded-store.js').EmbeddedStore);
      vi.mocked(createSemanticPatternMatcher).mockReturnValue(
        {} as unknown as import('../../src/core/semantic-pattern-matcher.js').SemanticPatternMatcher
      );

      // Start multiple concurrent initializations
      const [result1, result2, result3] = await Promise.all([
        initializeSemanticInfrastructure(),
        initializeSemanticInfrastructure(),
        initializeSemanticInfrastructure(),
      ]);

      // All should succeed with the same infrastructure
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(result1.infrastructure).toBe(result2.infrastructure);
      expect(result2.infrastructure).toBe(result3.infrastructure);

      // Create should only be called once despite concurrent calls
      expect(EmbeddingProvider.create).toHaveBeenCalledTimes(1);
    });
  });
});
