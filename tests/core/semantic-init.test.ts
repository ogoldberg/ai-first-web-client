/**
 * Tests for Semantic Infrastructure Initialization (LI-001)
 *
 * Uses vi.spyOn() for static methods since the setup file loads modules
 * before vi.mock() can be applied in the ESM environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type SpyInstance } from 'vitest';
import {
  initializeSemanticInfrastructure,
  checkSemanticDependencies,
  getSemanticInfrastructure,
  getSemanticMatcher,
  isSemanticInitialized,
  wasInitializationAttempted,
  resetSemanticInfrastructure,
} from '../../src/core/semantic-init.js';
import { EmbeddingProvider } from '../../src/utils/embedding-provider.js';
import { VectorStore, getVectorStore } from '../../src/utils/vector-store.js';
import { EmbeddedStore, createEmbeddedStore } from '../../src/utils/embedded-store.js';
import * as semanticPatternMatcher from '../../src/core/semantic-pattern-matcher.js';
import * as vectorStoreModule from '../../src/utils/vector-store.js';
import * as embeddedStoreModule from '../../src/utils/embedded-store.js';

describe('Semantic Infrastructure Initialization', () => {
  // Spies for static methods
  let embeddingProviderIsAvailableSpy: SpyInstance;
  let embeddingProviderCreateSpy: SpyInstance;
  let vectorStoreIsAvailableSpy: SpyInstance;
  let getVectorStoreSpy: SpyInstance;
  let embeddedStoreIsAvailableSpy: SpyInstance;
  let createEmbeddedStoreSpy: SpyInstance;
  let createSemanticPatternMatcherSpy: SpyInstance;

  beforeEach(async () => {
    // Reset global state first
    await resetSemanticInfrastructure();

    // Create fresh spies for each test
    embeddingProviderIsAvailableSpy = vi.spyOn(EmbeddingProvider, 'isAvailable');
    embeddingProviderCreateSpy = vi.spyOn(EmbeddingProvider, 'create');
    vectorStoreIsAvailableSpy = vi.spyOn(VectorStore, 'isAvailable');
    getVectorStoreSpy = vi.spyOn(vectorStoreModule, 'getVectorStore');
    embeddedStoreIsAvailableSpy = vi.spyOn(EmbeddedStore, 'isAvailable');
    createEmbeddedStoreSpy = vi.spyOn(embeddedStoreModule, 'createEmbeddedStore');
    createSemanticPatternMatcherSpy = vi.spyOn(semanticPatternMatcher, 'createSemanticPatternMatcher');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetSemanticInfrastructure();
  });

  describe('checkSemanticDependencies', () => {
    it('should report all dependencies available when they exist', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should report missing @xenova/transformers', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(false);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(false);
      expect(result.missing).toContain('@xenova/transformers');
    });

    it('should report missing @lancedb/lancedb', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(false);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(false);
      expect(result.missing).toContain('@lancedb/lancedb');
    });

    it('should report missing better-sqlite3', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(false);

      const result = await checkSemanticDependencies();

      expect(result.available).toBe(false);
      expect(result.missing).toContain('better-sqlite3');
    });

    it('should report multiple missing dependencies', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(false);
      vectorStoreIsAvailableSpy.mockResolvedValue(false);
      embeddedStoreIsAvailableSpy.mockResolvedValue(false);

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
      embeddingProviderIsAvailableSpy.mockResolvedValue(false);
      vectorStoreIsAvailableSpy.mockResolvedValue(false);
      embeddedStoreIsAvailableSpy.mockResolvedValue(false);

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(false);
      expect(result.infrastructure).toBeNull();
      expect(result.message).toContain('missing dependencies');
      expect(result.unavailable).toBeDefined();
      expect(result.unavailable?.length).toBeGreaterThan(0);
    });

    it('should succeed when all dependencies are available', async () => {
      // Mock all dependencies as available
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      // Mock successful creation of each component
      const mockEmbeddingProvider = {
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      };
      embeddingProviderCreateSpy.mockResolvedValue(mockEmbeddingProvider);

      const mockVectorStore = {};
      getVectorStoreSpy.mockResolvedValue(mockVectorStore);

      const mockEmbeddedStore = {
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      createEmbeddedStoreSpy.mockReturnValue(mockEmbeddedStore);

      const mockMatcher = {};
      createSemanticPatternMatcherSpy.mockReturnValue(mockMatcher);

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
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      const mockEmbeddingProvider = {
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      };
      embeddingProviderCreateSpy.mockResolvedValue(mockEmbeddingProvider);
      getVectorStoreSpy.mockResolvedValue({});
      createEmbeddedStoreSpy.mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });
      createSemanticPatternMatcherSpy.mockReturnValue({});

      // First call initializes
      const result1 = await initializeSemanticInfrastructure();
      expect(result1.success).toBe(true);

      // Second call returns cached
      const result2 = await initializeSemanticInfrastructure();
      expect(result2.success).toBe(true);
      expect(result2.infrastructure).toBe(result1.infrastructure);

      // Create should only be called once
      expect(embeddingProviderCreateSpy).toHaveBeenCalledTimes(1);
    });

    it('should fail gracefully when EmbeddingProvider.create returns null', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      embeddingProviderCreateSpy.mockResolvedValue(null);

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(false);
      expect(result.infrastructure).toBeNull();
      expect(result.message).toContain('Failed to create embedding provider');
    });

    it('should fail gracefully when getVectorStore returns null', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      embeddingProviderCreateSpy.mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
      });
      getVectorStoreSpy.mockResolvedValue(null);

      const result = await initializeSemanticInfrastructure();

      expect(result.success).toBe(false);
      expect(result.infrastructure).toBeNull();
      expect(result.message).toContain('Failed to create vector store');
    });

    it('should handle initialization errors gracefully', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      embeddingProviderCreateSpy.mockRejectedValue(new Error('Test error'));

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
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      const mockMatcher = { isAvailable: vi.fn().mockReturnValue(true) };
      embeddingProviderCreateSpy.mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      });
      getVectorStoreSpy.mockResolvedValue({});
      createEmbeddedStoreSpy.mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });
      createSemanticPatternMatcherSpy.mockReturnValue(mockMatcher);

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
      embeddingProviderIsAvailableSpy.mockResolvedValue(false);
      vectorStoreIsAvailableSpy.mockResolvedValue(false);
      embeddedStoreIsAvailableSpy.mockResolvedValue(false);

      await initializeSemanticInfrastructure();

      expect(isSemanticInitialized()).toBe(false);
      expect(wasInitializationAttempted()).toBe(true);
    });

    it('should track successful initialization', async () => {
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      embeddingProviderCreateSpy.mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      });
      getVectorStoreSpy.mockResolvedValue({});
      createEmbeddedStoreSpy.mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });
      createSemanticPatternMatcherSpy.mockReturnValue({});

      await initializeSemanticInfrastructure();

      expect(isSemanticInitialized()).toBe(true);
      expect(wasInitializationAttempted()).toBe(true);
    });
  });

  describe('resetSemanticInfrastructure', () => {
    it('should reset all global state', async () => {
      // Setup and initialize
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      embeddingProviderCreateSpy.mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      });
      getVectorStoreSpy.mockResolvedValue({});
      createEmbeddedStoreSpy.mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });
      createSemanticPatternMatcherSpy.mockReturnValue({});

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
      embeddingProviderIsAvailableSpy.mockResolvedValue(true);
      vectorStoreIsAvailableSpy.mockResolvedValue(true);
      embeddedStoreIsAvailableSpy.mockResolvedValue(true);

      embeddingProviderCreateSpy.mockResolvedValue({
        getDimensions: vi.fn().mockReturnValue(384),
        getModelName: vi.fn().mockReturnValue('test-model'),
      });
      getVectorStoreSpy.mockResolvedValue({});
      createEmbeddedStoreSpy.mockReturnValue({
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      });
      createSemanticPatternMatcherSpy.mockReturnValue({});

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
      expect(embeddingProviderCreateSpy).toHaveBeenCalledTimes(1);
    });
  });
});
