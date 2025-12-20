/**
 * Embedding Provider for LLM Browser (V-002)
 *
 * Provides text embedding generation using @xenova/transformers.
 * Uses all-MiniLM-L6-v2 model (384 dimensions) by default.
 * Falls back gracefully when transformers library is not available.
 */

import { logger } from './logger.js';

// Create a logger for embedding operations
const log = logger.create('EmbeddingProvider');

/**
 * Configuration options for EmbeddingProvider
 */
export interface EmbeddingProviderOptions {
  /** Model to use for embeddings (default: 'Xenova/all-MiniLM-L6-v2') */
  model?: string;

  /** Whether to quantize the model for faster inference (default: true) */
  quantized?: boolean;

  /** Cache directory for downloaded models */
  cacheDir?: string;
}

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  /** The embedding vector */
  vector: Float32Array;

  /** The model used to generate the embedding */
  model: string;

  /** Number of tokens in the input */
  tokenCount?: number;
}

/**
 * Batch embedding generation result
 */
export interface BatchEmbeddingResult {
  /** Array of embedding vectors */
  vectors: Float32Array[];

  /** The model used to generate the embeddings */
  model: string;

  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * EmbeddingProvider - Wraps @xenova/transformers for text embedding generation
 *
 * Provides singleton access to embedding generation with lazy model loading.
 * Falls back gracefully when the library is unavailable.
 */
export class EmbeddingProvider {
  private static instance: EmbeddingProvider | null = null;
  private static loadError: Error | null = null;

  private pipeline: unknown = null;
  private transformers: typeof import('@xenova/transformers') | null = null;
  private initialized = false;
  private initializing = false;
  private initPromise: Promise<void> | null = null;

  private readonly modelName: string;
  private readonly quantized: boolean;
  private readonly cacheDir?: string;

  /**
   * Model dimensions for known models
   */
  private static readonly MODEL_DIMENSIONS: Record<string, number> = {
    'Xenova/all-MiniLM-L6-v2': 384,
    'Xenova/all-MiniLM-L12-v2': 384,
    'Xenova/bge-small-en-v1.5': 384,
    'Xenova/bge-base-en-v1.5': 768,
    'Xenova/gte-small': 384,
    'Xenova/gte-base': 768,
    'Xenova/e5-small-v2': 384,
    'Xenova/e5-base-v2': 768,
  };

  /**
   * Default model for embeddings
   */
  static readonly DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

  private constructor(options: EmbeddingProviderOptions = {}) {
    this.modelName = options.model || EmbeddingProvider.DEFAULT_MODEL;
    this.quantized = options.quantized ?? true;
    this.cacheDir = options.cacheDir;
  }

  /**
   * Check if the transformers library is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await import('@xenova/transformers');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create or get the singleton EmbeddingProvider instance
   *
   * @param options Configuration options (only used for first creation)
   * @returns EmbeddingProvider instance or null if unavailable
   */
  static async create(
    options: EmbeddingProviderOptions = {}
  ): Promise<EmbeddingProvider | null> {
    // Return cached error
    if (this.loadError) {
      log.warn('EmbeddingProvider previously failed to load', {
        error: this.loadError.message,
      });
      return null;
    }

    // Return existing instance
    if (this.instance && this.instance.initialized) {
      return this.instance;
    }

    // Check availability first
    if (!(await this.isAvailable())) {
      log.warn('Transformers library not available, embeddings disabled');
      this.loadError = new Error('@xenova/transformers not available');
      return null;
    }

    try {
      if (!this.instance) {
        this.instance = new EmbeddingProvider(options);
      }
      await this.instance.initialize();
      return this.instance;
    } catch (error) {
      this.loadError =
        error instanceof Error ? error : new Error(String(error));
      log.error('Failed to initialize EmbeddingProvider', {
        error: this.loadError.message,
      });
      return null;
    }
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    this.instance = null;
    this.loadError = null;
  }

  /**
   * Initialize the embedding model
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Prevent concurrent initialization
    if (this.initializing && this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initializing = true;
    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } finally {
      this.initializing = false;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      log.info('Loading embedding model', { model: this.modelName });
      const startTime = Date.now();

      // Dynamic import of transformers
      this.transformers = await import('@xenova/transformers');

      // Configure cache directory if specified
      if (this.cacheDir) {
        this.transformers.env.cacheDir = this.cacheDir;
      }

      // Load the feature extraction pipeline
      this.pipeline = await this.transformers.pipeline(
        'feature-extraction',
        this.modelName,
        { quantized: this.quantized }
      );

      this.initialized = true;
      const loadTime = Date.now() - startTime;
      log.info('Embedding model loaded', {
        model: this.modelName,
        loadTimeMs: loadTime,
        dimensions: this.getDimensions(),
      });
    } catch (error) {
      log.error('Failed to load embedding model', {
        model: this.modelName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate an embedding for a single text
   *
   * @param text Text to embed
   * @returns Embedding result with vector
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    await this.ensureInitialized();

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelineFn = this.pipeline as any;
    const output = await pipelineFn(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Extract the embedding from the output tensor
    const embedding = new Float32Array(output.data);

    return {
      vector: embedding,
      model: this.modelName,
    };
  }

  /**
   * Generate embeddings for multiple texts in batch
   *
   * @param texts Array of texts to embed
   * @returns Batch embedding result with vectors
   */
  async generateBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    await this.ensureInitialized();

    if (texts.length === 0) {
      return {
        vectors: [],
        model: this.modelName,
        processingTimeMs: 0,
      };
    }

    const startTime = Date.now();
    const vectors: Float32Array[] = [];

    // Process in batches to manage memory
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineFn = this.pipeline as any;
      const output = await pipelineFn(batch, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract embeddings for each text in the batch
      const dimensions = this.getDimensions();
      for (let j = 0; j < batch.length; j++) {
        const start = j * dimensions;
        const embedding = new Float32Array(dimensions);
        for (let k = 0; k < dimensions; k++) {
          embedding[k] = output.data[start + k];
        }
        vectors.push(embedding);
      }
    }

    return {
      vectors,
      model: this.modelName,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get the number of dimensions for the current model
   */
  getDimensions(): number {
    return EmbeddingProvider.MODEL_DIMENSIONS[this.modelName] || 384;
  }

  /**
   * Get the current model name
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Check if the provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the provider is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.initialized) {
      throw new Error('EmbeddingProvider not initialized');
    }
  }
}

/**
 * Create a new EmbeddingProvider instance
 * Convenience function for non-singleton usage
 */
export async function createEmbeddingProvider(
  options?: EmbeddingProviderOptions
): Promise<EmbeddingProvider | null> {
  return EmbeddingProvider.create(options);
}

/**
 * Check if embedding generation is available
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  return EmbeddingProvider.isAvailable();
}
