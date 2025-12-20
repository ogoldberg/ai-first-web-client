/**
 * Semantic Pattern Matcher for LLM Browser (V-003)
 *
 * Bridges LearningEngine with vector search to find semantically similar patterns.
 * Uses embeddings to find relevant patterns even when URLs/content differ textually.
 */

import { logger } from '../utils/logger.js';
import { EmbeddingProvider } from '../utils/embedding-provider.js';
import {
  VectorStore,
  type SearchOptions,
  type FilterExpression,
  type SearchResult,
} from '../utils/vector-store.js';
import type { EmbeddedStore } from '../utils/embedded-store.js';
import type { EnhancedApiPattern } from '../types/index.js';
import {
  patternToEmbeddingText,
  type LearnedPattern,
} from '../utils/embedding-pipeline.js';

// Create a logger for semantic matching operations
const log = logger.create('SemanticPatternMatcher');

/**
 * Options for finding similar patterns
 */
export interface FindSimilarOptions {
  /** Maximum number of results (default: 5) */
  limit?: number;

  /** Minimum similarity threshold 0.0-1.0 (default: 0.6) */
  minSimilarity?: number;

  /** Scope search to specific domain */
  domain?: string;

  /** Include similarity scores in results */
  includeScores?: boolean;

  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
}

/**
 * Result of semantic pattern search
 */
export interface SimilarPattern {
  /** The matched pattern */
  pattern: LearnedPattern;

  /** Similarity score (0.0-1.0) */
  similarity: number;

  /** What triggered the match */
  matchReason: 'url' | 'content' | 'both';

  /** Vector store record ID */
  embeddingId: string;
}

/**
 * Result of a semantic search with match explanation
 */
export interface SemanticSearchResult {
  /** Matched patterns ordered by relevance */
  patterns: SimilarPattern[];

  /** Query that was embedded */
  queryText: string;

  /** Time taken for embedding + search (ms) */
  searchTimeMs: number;

  /** Whether vector search was available */
  usedVectorSearch: boolean;
}

/**
 * SemanticPatternMatcher - Find patterns using semantic similarity
 *
 * This class provides semantic search over learned patterns by:
 * 1. Converting queries (URLs or content) into embeddings
 * 2. Searching the vector store for similar embeddings
 * 3. Fetching full pattern details from SQLite
 * 4. Ranking results by combined similarity and confidence scores
 */
export class SemanticPatternMatcher {
  private embeddingProvider: EmbeddingProvider | null = null;
  private vectorStore: VectorStore | null = null;
  private embeddedStore: EmbeddedStore | null = null;
  private initialized = false;

  /**
   * Weight for vector similarity in combined scoring (0-1)
   * Higher = more emphasis on semantic similarity
   */
  private readonly similarityWeight = 0.7;

  /**
   * Weight for pattern confidence in combined scoring (0-1)
   */
  private readonly confidenceWeight = 0.2;

  /**
   * Weight for recency in combined scoring (0-1)
   */
  private readonly recencyWeight = 0.1;

  constructor(
    embeddingProvider: EmbeddingProvider | null = null,
    vectorStore: VectorStore | null = null,
    embeddedStore: EmbeddedStore | null = null
  ) {
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.embeddedStore = embeddedStore;
  }

  /**
   * Check if semantic matching is available
   */
  isAvailable(): boolean {
    return (
      this.embeddingProvider !== null &&
      this.vectorStore !== null &&
      this.embeddedStore !== null
    );
  }

  /**
   * Initialize with dependencies
   */
  async initialize(
    embeddingProvider: EmbeddingProvider,
    vectorStore: VectorStore,
    embeddedStore: EmbeddedStore
  ): Promise<void> {
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.embeddedStore = embeddedStore;
    this.initialized = true;
    log.info('Semantic pattern matcher initialized');
  }

  /**
   * Find patterns semantically similar to a URL
   *
   * @param url The URL to find similar patterns for
   * @param options Search options
   * @returns Array of similar patterns with scores
   */
  async findSimilarByUrl(
    url: string,
    options: FindSimilarOptions = {}
  ): Promise<SemanticSearchResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      log.debug('Semantic search unavailable, returning empty results');
      return {
        patterns: [],
        queryText: url,
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }

    try {
      // Parse URL and extract meaningful text for embedding
      const queryText = this.urlToEmbeddingText(url);

      // Generate embedding for the query
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(queryText);

      // Search vector store
      const searchResults = await this.searchVectorStore(
        embeddingResult.vector,
        { ...options, entityType: 'pattern' }
      );

      // Fetch full patterns and rank
      const patterns = await this.fetchAndRankPatterns(
        searchResults,
        'url',
        options
      );

      const result: SemanticSearchResult = {
        patterns,
        queryText,
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: true,
      };

      log.debug('Semantic URL search completed', {
        url,
        resultsCount: patterns.length,
        searchTimeMs: result.searchTimeMs,
      });

      return result;
    } catch (error) {
      log.error('Semantic URL search failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        patterns: [],
        queryText: url,
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }
  }

  /**
   * Find patterns semantically similar to content text
   *
   * @param content The content to find similar patterns for
   * @param options Search options
   * @returns Array of similar patterns with scores
   */
  async findSimilarByContent(
    content: string,
    options: FindSimilarOptions = {}
  ): Promise<SemanticSearchResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      log.debug('Semantic search unavailable, returning empty results');
      return {
        patterns: [],
        queryText: content.slice(0, 100),
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }

    try {
      // Truncate content to reasonable length for embedding
      const queryText = this.truncateContent(content, 500);

      // Generate embedding for the query
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(queryText);

      // Search vector store
      const searchResults = await this.searchVectorStore(
        embeddingResult.vector,
        { ...options, entityType: 'pattern' }
      );

      // Fetch full patterns and rank
      const patterns = await this.fetchAndRankPatterns(
        searchResults,
        'content',
        options
      );

      const result: SemanticSearchResult = {
        patterns,
        queryText: queryText.slice(0, 100) + (queryText.length > 100 ? '...' : ''),
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: true,
      };

      log.debug('Semantic content search completed', {
        contentLength: content.length,
        resultsCount: patterns.length,
        searchTimeMs: result.searchTimeMs,
      });

      return result;
    } catch (error) {
      log.error('Semantic content search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        patterns: [],
        queryText: content.slice(0, 100),
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }
  }

  /**
   * Find patterns combining URL and content similarity
   *
   * @param url The URL to match
   * @param content Optional content to match
   * @param options Search options
   * @returns Combined results from both URL and content search
   */
  async findSimilar(
    url: string,
    content?: string,
    options: FindSimilarOptions = {}
  ): Promise<SemanticSearchResult> {
    const startTime = Date.now();

    // If no content, just do URL search
    if (!content) {
      return this.findSimilarByUrl(url, options);
    }

    if (!this.isAvailable()) {
      return {
        patterns: [],
        queryText: url,
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }

    try {
      // Combine URL and content for embedding
      const urlText = this.urlToEmbeddingText(url);
      const contentText = this.truncateContent(content, 300);
      const queryText = `${urlText} ${contentText}`;

      // Generate embedding for the combined query
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(queryText);

      // Search vector store
      const searchResults = await this.searchVectorStore(
        embeddingResult.vector,
        { ...options, entityType: 'pattern' }
      );

      // Fetch full patterns and rank
      const patterns = await this.fetchAndRankPatterns(
        searchResults,
        'both',
        options
      );

      return {
        patterns,
        queryText: queryText.slice(0, 100) + (queryText.length > 100 ? '...' : ''),
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: true,
      };
    } catch (error) {
      log.error('Semantic combined search failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        patterns: [],
        queryText: url,
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }
  }

  /**
   * Get the best matching pattern for a URL using semantic search
   *
   * This is the main entry point for LearningEngine integration.
   * Returns null if no sufficiently similar pattern is found.
   *
   * @param url The URL to find a pattern for
   * @param minSimilarity Minimum similarity threshold (default: 0.75)
   * @returns Best matching pattern or null
   */
  async findBestMatch(
    url: string,
    minSimilarity = 0.75
  ): Promise<SimilarPattern | null> {
    const result = await this.findSimilarByUrl(url, {
      limit: 1,
      minSimilarity,
    });

    if (result.patterns.length > 0) {
      return result.patterns[0];
    }

    return null;
  }

  /**
   * Convert a URL to embedding text
   */
  private urlToEmbeddingText(url: string): string {
    try {
      const urlObj = new URL(url);

      // Extract meaningful parts
      const parts: string[] = [];

      // Domain (without www)
      const domain = urlObj.hostname.replace(/^www\./, '');
      parts.push(domain);

      // Path segments (filtering out IDs/numbers)
      const pathSegments = urlObj.pathname
        .split('/')
        .filter((s) => s && !/^[0-9a-f-]+$/i.test(s) && !/^\d+$/.test(s));
      parts.push(...pathSegments);

      // Query parameter names (not values)
      const paramNames = Array.from(urlObj.searchParams.keys());
      parts.push(...paramNames);

      return parts.join(' ');
    } catch {
      // If URL parsing fails, return the raw URL
      return url;
    }
  }

  /**
   * Truncate content to a reasonable length for embedding
   */
  private truncateContent(content: string, maxLength: number): string {
    // Clean up whitespace
    const cleaned = content.replace(/\s+/g, ' ').trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Truncate at word boundary
    const truncated = cleaned.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > maxLength * 0.8
      ? truncated.slice(0, lastSpace)
      : truncated;
  }

  /**
   * Search the vector store with filters
   */
  private async searchVectorStore(
    vector: Float32Array,
    options: FindSimilarOptions & { entityType?: 'pattern' | 'skill' }
  ): Promise<SearchResult[]> {
    const limit = options.limit || 5;
    const minScore = options.minSimilarity || 0.6;

    const filter: FilterExpression = {};
    if (options.entityType) {
      filter.entityType = options.entityType;
    }
    if (options.domain) {
      filter.domain = options.domain;
    }
    if (options.tenantId) {
      filter.tenantId = options.tenantId;
    }

    const searchOptions: SearchOptions = {
      limit: limit * 2, // Fetch more to account for filtering
      minScore,
      includeVector: false,
    };

    const hasFilter = Object.keys(filter).length > 0;
    const results = hasFilter
      ? await this.vectorStore!.searchFiltered(vector, filter, searchOptions)
      : await this.vectorStore!.search(vector, searchOptions);

    return results.slice(0, limit);
  }

  /**
   * Fetch full patterns from SQLite and rank by combined score
   */
  private async fetchAndRankPatterns(
    searchResults: SearchResult[],
    matchReason: 'url' | 'content' | 'both',
    options: FindSimilarOptions
  ): Promise<SimilarPattern[]> {
    const patterns: SimilarPattern[] = [];

    for (const result of searchResults) {
      // Fetch the full pattern from EmbeddedStore
      const pattern = this.embeddedStore!.get<LearnedPattern>(
        'patterns',
        result.id
      );

      if (!pattern) {
        // Pattern was deleted but embedding still exists
        log.debug('Pattern not found in store', { id: result.id });
        continue;
      }

      // Calculate combined score
      const combinedScore = this.calculateCombinedScore(result, pattern);

      // Apply minimum similarity filter
      if (
        options.minSimilarity !== undefined &&
        combinedScore < options.minSimilarity
      ) {
        continue;
      }

      patterns.push({
        pattern: { ...pattern, id: result.id },
        similarity: combinedScore,
        matchReason,
        embeddingId: result.id,
      });
    }

    // Sort by combined score (highest first)
    patterns.sort((a, b) => b.similarity - a.similarity);

    // Apply limit
    const limit = options.limit || 5;
    return patterns.slice(0, limit);
  }

  /**
   * Calculate combined score from vector similarity, confidence, and recency
   */
  private calculateCombinedScore(
    searchResult: SearchResult,
    pattern: LearnedPattern
  ): number {
    // Vector similarity (already 0-1)
    const vectorScore = searchResult.score;

    // Pattern confidence (normalize to 0-1)
    const confidence = pattern.confidence || 0.5;
    const confidenceScore = typeof confidence === 'number' ? confidence : 0.5;

    // Recency score (exponential decay over 30 days)
    const now = Date.now();
    const lastUsed = pattern.lastUsed || searchResult.metadata.createdAt;
    const daysSinceUse = (now - lastUsed) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-daysSinceUse / 30);

    // Combined weighted score
    return (
      this.similarityWeight * vectorScore +
      this.confidenceWeight * confidenceScore +
      this.recencyWeight * recencyScore
    );
  }

  /**
   * Get statistics about semantic matching
   */
  async getStats(): Promise<{
    available: boolean;
    patternCount: number;
    dimensions: number;
  }> {
    if (!this.isAvailable()) {
      return {
        available: false,
        patternCount: 0,
        dimensions: 0,
      };
    }

    const vectorStats = await this.vectorStore!.getStats();
    return {
      available: true,
      patternCount: vectorStats.recordsByType.pattern,
      dimensions: vectorStats.dimensions,
    };
  }
}

/**
 * Create a SemanticPatternMatcher with optional initialization
 */
export function createSemanticPatternMatcher(
  embeddingProvider?: EmbeddingProvider | null,
  vectorStore?: VectorStore | null,
  embeddedStore?: EmbeddedStore | null
): SemanticPatternMatcher {
  return new SemanticPatternMatcher(
    embeddingProvider ?? null,
    vectorStore ?? null,
    embeddedStore ?? null
  );
}
