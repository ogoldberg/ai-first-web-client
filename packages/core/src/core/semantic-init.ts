/**
 * Semantic Infrastructure Initialization (LI-001)
 *
 * Provides zero-config auto-initialization for semantic pattern matching.
 * If dependencies are available, semantic matching is enabled automatically.
 * If dependencies are missing, falls back gracefully to non-semantic matching.
 *
 * Dependencies:
 * - @xenova/transformers (for embeddings)
 * - @lancedb/lancedb (for vector search)
 * - better-sqlite3 (for EmbeddedStore)
 */

import { logger } from '../utils/logger.js';
import { EmbeddingProvider } from '../utils/embedding-provider.js';
import { VectorStore, getVectorStore } from '../utils/vector-store.js';
import { EmbeddedStore, createEmbeddedStore } from '../utils/embedded-store.js';
import {
  SemanticPatternMatcher,
  createSemanticPatternMatcher,
} from './semantic-pattern-matcher.js';

const log = logger.create('SemanticInit');

/**
 * Semantic infrastructure components
 */
export interface SemanticInfrastructure {
  /** Embedding provider for generating embeddings */
  embeddingProvider: EmbeddingProvider;

  /** Vector store for similarity search */
  vectorStore: VectorStore;

  /** Embedded store for pattern data */
  embeddedStore: EmbeddedStore;

  /** Semantic pattern matcher for finding similar patterns */
  matcher: SemanticPatternMatcher;
}

/**
 * Configuration for semantic infrastructure
 */
export interface SemanticInfrastructureConfig {
  /** Path to vector database (default: ./data/vectors) */
  vectorDbPath?: string;

  /** Path to SQLite database (default: ./data/llm-browser.db) */
  sqliteDbPath?: string;

  /** Enable verbose logging during initialization */
  verbose?: boolean;
}

/**
 * Initialization result with status information
 */
export interface SemanticInitResult {
  /** Whether initialization succeeded */
  success: boolean;

  /** The infrastructure components (null if failed) */
  infrastructure: SemanticInfrastructure | null;

  /** Status message explaining the result */
  message: string;

  /** Which components were unavailable (if failed) */
  unavailable?: string[];
}

/**
 * Global initialization state
 */
let globalInfrastructure: SemanticInfrastructure | null = null;
let initializationAttempted = false;
let initializationPromise: Promise<SemanticInitResult> | null = null;

/**
 * Check if all semantic infrastructure dependencies are available
 */
export async function checkSemanticDependencies(): Promise<{
  available: boolean;
  missing: string[];
}> {
  const missing: string[] = [];

  // Check @xenova/transformers
  const embeddingsAvailable = await EmbeddingProvider.isAvailable();
  if (!embeddingsAvailable) {
    missing.push('@xenova/transformers');
  }

  // Check @lancedb/lancedb
  const vectorStoreAvailable = await VectorStore.isAvailable();
  if (!vectorStoreAvailable) {
    missing.push('@lancedb/lancedb');
  }

  // Check better-sqlite3 (via EmbeddedStore)
  const sqliteAvailable = await EmbeddedStore.isAvailable();
  if (!sqliteAvailable) {
    missing.push('better-sqlite3');
  }

  return {
    available: missing.length === 0,
    missing,
  };
}

/**
 * Initialize semantic infrastructure with automatic dependency detection.
 *
 * This is the main entry point for enabling semantic pattern matching.
 * Call this once during application startup (e.g., in SmartBrowser constructor).
 *
 * @param config Optional configuration
 * @returns Initialization result with status and infrastructure (if successful)
 */
export async function initializeSemanticInfrastructure(
  config: SemanticInfrastructureConfig = {}
): Promise<SemanticInitResult> {
  // Return cached result if already initialized
  if (globalInfrastructure) {
    return {
      success: true,
      infrastructure: globalInfrastructure,
      message: 'Semantic infrastructure already initialized',
    };
  }

  // Prevent concurrent initialization attempts
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = doInitialize(config);
  const result = await initializationPromise;
  initializationPromise = null;
  initializationAttempted = true;

  return result;
}

/**
 * Internal initialization logic
 */
async function doInitialize(
  config: SemanticInfrastructureConfig
): Promise<SemanticInitResult> {
  const vectorDbPath = config.vectorDbPath || './data/vectors';
  const sqliteDbPath = config.sqliteDbPath || './data/llm-browser.db';

  // Check dependencies first
  const deps = await checkSemanticDependencies();
  if (!deps.available) {
    const message = `Semantic matching disabled: missing dependencies (${deps.missing.join(', ')})`;
    if (config.verbose) {
      log.info(message);
    } else {
      log.debug(message);
    }
    return {
      success: false,
      infrastructure: null,
      message,
      unavailable: deps.missing,
    };
  }

  try {
    log.info('Initializing semantic infrastructure...');
    const startTime = Date.now();

    // Initialize embedding provider
    const embeddingProvider = await EmbeddingProvider.create();
    if (!embeddingProvider) {
      return {
        success: false,
        infrastructure: null,
        message: 'Failed to create embedding provider',
        unavailable: ['EmbeddingProvider'],
      };
    }

    // Initialize vector store
    const vectorStore = await getVectorStore({
      dbPath: vectorDbPath,
      dimensions: embeddingProvider.getDimensions(),
    });
    if (!vectorStore) {
      return {
        success: false,
        infrastructure: null,
        message: 'Failed to create vector store',
        unavailable: ['VectorStore'],
      };
    }

    // Initialize embedded store
    const embeddedStore = createEmbeddedStore({
      dbPath: sqliteDbPath,
      allowJsonFallback: true,
      componentName: 'SemanticInit',
      walMode: true,
    });
    await embeddedStore.initialize();

    // Create semantic pattern matcher
    const matcher = createSemanticPatternMatcher(
      embeddingProvider,
      vectorStore,
      embeddedStore
    );

    const infrastructure: SemanticInfrastructure = {
      embeddingProvider,
      vectorStore,
      embeddedStore,
      matcher,
    };

    globalInfrastructure = infrastructure;

    const elapsed = Date.now() - startTime;
    log.info('Semantic infrastructure initialized', {
      vectorDbPath,
      sqliteDbPath,
      model: embeddingProvider.getModelName(),
      dimensions: embeddingProvider.getDimensions(),
      initTimeMs: elapsed,
    });

    return {
      success: true,
      infrastructure,
      message: `Semantic matching enabled (${elapsed}ms)`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error('Failed to initialize semantic infrastructure', { error: errorMsg });
    return {
      success: false,
      infrastructure: null,
      message: `Initialization failed: ${errorMsg}`,
    };
  }
}

/**
 * Get the global semantic infrastructure (if initialized).
 *
 * Returns null if initialization hasn't been attempted or failed.
 * Use initializeSemanticInfrastructure() to ensure initialization.
 */
export function getSemanticInfrastructure(): SemanticInfrastructure | null {
  return globalInfrastructure;
}

/**
 * Get the global semantic pattern matcher (if available).
 *
 * Convenience function for quick access to the matcher.
 * Returns null if semantic infrastructure isn't initialized.
 */
export function getSemanticMatcher(): SemanticPatternMatcher | null {
  return globalInfrastructure?.matcher ?? null;
}

/**
 * Check if semantic infrastructure has been initialized.
 */
export function isSemanticInitialized(): boolean {
  return globalInfrastructure !== null;
}

/**
 * Check if initialization has been attempted (even if it failed).
 */
export function wasInitializationAttempted(): boolean {
  return initializationAttempted;
}

/**
 * Reset the global semantic infrastructure.
 *
 * This closes all resources and allows re-initialization.
 * Primarily useful for testing.
 */
export async function resetSemanticInfrastructure(): Promise<void> {
  if (globalInfrastructure) {
    try {
      await globalInfrastructure.embeddedStore.close();
    } catch {
      // Ignore close errors
    }
    globalInfrastructure = null;
  }
  initializationAttempted = false;
  initializationPromise = null;
  log.debug('Semantic infrastructure reset');
}
