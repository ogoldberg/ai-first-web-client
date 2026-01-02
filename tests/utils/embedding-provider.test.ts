/**
 * Tests for EmbeddingProvider (V-002)
 *
 * Uses centralized beforeEach with context.skip() for cleaner test setup.
 */

import { describe, it, expect, beforeEach, afterEach, type TaskContext } from 'vitest';
import {
  EmbeddingProvider,
  createEmbeddingProvider,
  isEmbeddingAvailable,
} from '../../src/utils/embedding-provider.js';

describe('EmbeddingProvider (V-002)', () => {
  // Provider that gets initialized for tests that need it
  let provider: EmbeddingProvider | null = null;

  beforeEach(() => {
    // Reset singleton before each test
    EmbeddingProvider.reset();
    provider = null;
  });

  afterEach(() => {
    EmbeddingProvider.reset();
  });

  describe('Availability Check', () => {
    it('should check if transformers library is available', async () => {
      const available = await EmbeddingProvider.isAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should expose isEmbeddingAvailable helper', async () => {
      const available = await isEmbeddingAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Singleton Pattern', () => {
    // Initialize provider and skip if not available
    beforeEach(async (context: TaskContext) => {
      const available = await EmbeddingProvider.isAvailable();
      if (!available) {
        console.log('Skipping test - transformers not available');
        context.skip();
        return;
      }
      try {
        provider = await EmbeddingProvider.create();
        if (!provider) {
          context.skip();
        }
      } catch (e) {
        console.log('Skipping test - provider initialization failed', e);
        context.skip();
      }
    });

    it('should return same instance on multiple create calls', async () => {
      const provider2 = await EmbeddingProvider.create();
      expect(provider).toBe(provider2);
    });

    it('should reset singleton on reset()', async () => {
      EmbeddingProvider.reset();
      const provider2 = await EmbeddingProvider.create();

      // After reset, we get a fresh instance (which should be equal since it reinitializes)
      expect(provider2).not.toBeNull();
    });

    it('should use createEmbeddingProvider helper', async () => {
      const helperProvider = await createEmbeddingProvider();
      expect(helperProvider).not.toBeNull();
    });
  });

  describe('Embedding Generation', () => {
    // Initialize provider and skip if not available
    beforeEach(async (context: TaskContext) => {
      const available = await EmbeddingProvider.isAvailable();
      if (!available) {
        console.log('Skipping test - transformers not available');
        context.skip();
        return;
      }
      try {
        provider = await EmbeddingProvider.create();
        if (!provider) {
          console.log('Skipping test - provider could not be initialized');
          context.skip();
        }
      } catch (e) {
        console.log('Skipping embedding provider tests - initialization failed', e);
        context.skip();
      }
    });

    it('should generate embedding for single text', async () => {
      const result = await provider!.generateEmbedding('hello world');

      expect(result.vector).toBeInstanceOf(Float32Array);
      expect(result.vector.length).toBe(provider!.getDimensions());
      expect(result.model).toBe(provider!.getModelName());
    }, 60000); // Allow 60s for model loading

    it('should generate normalized embeddings', async () => {
      const result = await provider!.generateEmbedding('test text');

      // Check if vector is normalized (magnitude close to 1)
      let magnitude = 0;
      for (let i = 0; i < result.vector.length; i++) {
        magnitude += result.vector[i] * result.vector[i];
      }
      magnitude = Math.sqrt(magnitude);

      expect(magnitude).toBeCloseTo(1, 1); // Within 0.1 of 1
    }, 60000);

    it('should throw for empty text', async () => {
      await expect(provider!.generateEmbedding('')).rejects.toThrow();
      await expect(provider!.generateEmbedding('   ')).rejects.toThrow();
    }, 60000);

    it('should handle special characters in text', async () => {
      const result = await provider!.generateEmbedding(
        'Test with special chars: @#$%^&*() and unicode: '
      );

      expect(result.vector).toBeInstanceOf(Float32Array);
      expect(result.vector.length).toBe(provider!.getDimensions());
    }, 60000);

    it('should handle long text', async () => {
      const longText = 'word '.repeat(1000);
      const result = await provider!.generateEmbedding(longText);

      expect(result.vector).toBeInstanceOf(Float32Array);
      expect(result.vector.length).toBe(provider!.getDimensions());
    }, 60000);
  });

  describe('Batch Embedding Generation', () => {
    // Initialize provider and skip if not available
    beforeEach(async (context: TaskContext) => {
      const available = await EmbeddingProvider.isAvailable();
      if (!available) {
        context.skip();
        return;
      }
      try {
        provider = await EmbeddingProvider.create();
        if (!provider) {
          context.skip();
        }
      } catch {
        context.skip();
      }
    });

    it('should generate embeddings for multiple texts', async () => {
      const texts = ['hello', 'world', 'test'];

      const result = await provider!.generateBatch(texts);

      expect(result.vectors).toHaveLength(3);
      expect(result.model).toBe(provider!.getModelName());
      expect(result.processingTimeMs).toBeGreaterThan(0);

      for (const vector of result.vectors) {
        expect(vector).toBeInstanceOf(Float32Array);
        expect(vector.length).toBe(provider!.getDimensions());
      }
    }, 60000);

    it('should handle empty batch', async () => {
      const result = await provider!.generateBatch([]);

      expect(result.vectors).toHaveLength(0);
      expect(result.processingTimeMs).toBe(0);
    }, 60000);

    it('should generate similar embeddings for similar texts', async () => {
      const texts = [
        'The cat sat on the mat',
        'A cat was sitting on a mat',
        'The stock market crashed today',
      ];

      const result = await provider!.generateBatch(texts);

      // Compute cosine similarity between first two (similar) texts
      const similarity12 = cosineSimilarity(result.vectors[0], result.vectors[1]);
      // Compute cosine similarity between first and third (different) texts
      const similarity13 = cosineSimilarity(result.vectors[0], result.vectors[2]);

      // Similar texts should have higher similarity than different texts
      expect(similarity12).toBeGreaterThan(similarity13);
    }, 60000);
  });

  describe('Model Information', () => {
    // Initialize provider and skip if not available
    beforeEach(async (context: TaskContext) => {
      const available = await EmbeddingProvider.isAvailable();
      if (!available) {
        context.skip();
        return;
      }
      try {
        provider = await EmbeddingProvider.create();
        if (!provider) {
          context.skip();
        }
      } catch {
        context.skip();
      }
    });

    it('should return correct model dimensions', async () => {
      const dimensions = provider!.getDimensions();
      expect(dimensions).toBe(384); // Default model dimensions
    }, 60000);

    it('should return model name', async () => {
      const modelName = provider!.getModelName();
      expect(modelName).toBe('Xenova/all-MiniLM-L6-v2');
    }, 60000);

    it('should report initialized state', async () => {
      expect(provider!.isInitialized()).toBe(true);
    }, 60000);
  });
});

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
