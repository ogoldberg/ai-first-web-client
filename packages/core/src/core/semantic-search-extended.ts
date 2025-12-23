/**
 * Extended Semantic Search Features (V-004)
 *
 * Builds on SemanticPatternMatcher to provide:
 * - Skill similarity search
 * - Error pattern matching
 * - Content deduplication
 * - Analytics and reporting
 */

import { logger } from '../utils/logger.js';
import { EmbeddingProvider } from '../utils/embedding-provider.js';
import {
  VectorStore,
  type SearchOptions,
  type FilterExpression,
  type SearchResult,
  type EntityType,
} from '../utils/vector-store.js';
import type { EmbeddedStore } from '../utils/embedded-store.js';
import type { Skill } from '../utils/embedding-pipeline.js';
import type { FailureRecord, AntiPattern } from '../types/api-patterns.js';

// Create a logger for extended search operations
const log = logger.create('SemanticSearchExtended');

/**
 * Options for skill similarity search
 */
export interface SkillSearchOptions {
  /** Maximum number of results (default: 5) */
  limit?: number;

  /** Minimum similarity threshold 0.0-1.0 (default: 0.6) */
  minSimilarity?: number;

  /** Scope search to specific domain */
  domain?: string;

  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
}

/**
 * Result of skill similarity search
 */
export interface SimilarSkill {
  /** The matched skill */
  skill: Skill;

  /** Similarity score (0.0-1.0) */
  similarity: number;

  /** Vector store record ID */
  embeddingId: string;
}

/**
 * Options for error pattern search
 */
export interface ErrorSearchOptions {
  /** Maximum number of results (default: 10) */
  limit?: number;

  /** Minimum similarity threshold 0.0-1.0 (default: 0.5) */
  minSimilarity?: number;

  /** Filter by domain */
  domain?: string;

  /** Filter by error category */
  category?: string;

  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
}

/**
 * Result of error pattern search
 */
export interface SimilarError {
  /** The matched error record */
  error: FailureRecord;

  /** Similarity score (0.0-1.0) */
  similarity: number;

  /** Vector store record ID */
  embeddingId: string;

  /** Matching anti-pattern if one exists */
  antiPattern?: AntiPattern;
}

/**
 * Options for content deduplication
 */
export interface DeduplicationOptions {
  /** Similarity threshold to consider content duplicate (default: 0.95) */
  similarityThreshold?: number;

  /** Maximum candidates to check (default: 100) */
  maxCandidates?: number;

  /** Scope to domain */
  domain?: string;

  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
}

/**
 * Result of content deduplication check
 */
export interface DuplicateResult {
  /** Whether a duplicate was found */
  isDuplicate: boolean;

  /** The original content ID if duplicate */
  originalId?: string;

  /** Similarity to original (0.0-1.0) */
  similarity?: number;

  /** Number of candidates checked */
  candidatesChecked: number;
}

/**
 * Analytics data for semantic search
 */
export interface SemanticSearchAnalytics {
  /** Total embeddings by entity type */
  embeddingsByType: Record<EntityType, number>;

  /** Total embeddings */
  totalEmbeddings: number;

  /** Embedding dimensions */
  dimensions: number;

  /** Model used for embeddings */
  model: string;

  /** Average search latency (ms) from recent searches */
  avgSearchLatencyMs: number;

  /** Search count by entity type */
  searchCountByType: Record<EntityType, number>;

  /** Top domains by embedding count */
  topDomains: Array<{ domain: string; count: number }>;

  /** Similarity distribution buckets */
  similarityDistribution: {
    '0.9-1.0': number;
    '0.8-0.9': number;
    '0.7-0.8': number;
    '0.6-0.7': number;
    '0.5-0.6': number;
    'below-0.5': number;
  };
}

/**
 * Internal metrics tracking
 */
interface SearchMetrics {
  searchCount: number;
  totalLatencyMs: number;
  resultsByBucket: {
    '0.9-1.0': number;
    '0.8-0.9': number;
    '0.7-0.8': number;
    '0.6-0.7': number;
    '0.5-0.6': number;
    'below-0.5': number;
  };
  searchesByType: Record<EntityType, number>;
}

/**
 * SemanticSearchExtended - Extended semantic search capabilities
 *
 * Provides skill similarity, error matching, deduplication, and analytics
 * on top of the core pattern matching functionality.
 */
export class SemanticSearchExtended {
  private embeddingProvider: EmbeddingProvider | null = null;
  private vectorStore: VectorStore | null = null;
  private embeddedStore: EmbeddedStore | null = null;

  /** Internal metrics for analytics */
  private metrics: SearchMetrics = {
    searchCount: 0,
    totalLatencyMs: 0,
    resultsByBucket: {
      '0.9-1.0': 0,
      '0.8-0.9': 0,
      '0.7-0.8': 0,
      '0.6-0.7': 0,
      '0.5-0.6': 0,
      'below-0.5': 0,
    },
    searchesByType: {
      pattern: 0,
      skill: 0,
      content: 0,
      error: 0,
    },
  };

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
   * Check if semantic search is available
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
    log.info('Extended semantic search initialized');
  }

  // ==================== SKILL SIMILARITY SEARCH ====================

  /**
   * Find skills semantically similar to a query
   *
   * @param query Search query (skill name, description, or action)
   * @param options Search options
   * @returns Array of similar skills with scores
   */
  async findSimilarSkills(
    query: string,
    options: SkillSearchOptions = {}
  ): Promise<{
    skills: SimilarSkill[];
    searchTimeMs: number;
    usedVectorSearch: boolean;
  }> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      log.debug('Semantic search unavailable for skills');
      return {
        skills: [],
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }

    try {
      // Generate embedding for the query
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(query);

      // Build filter
      const filter: FilterExpression = { entityType: 'skill' };
      if (options.domain) filter.domain = options.domain;
      if (options.tenantId) filter.tenantId = options.tenantId;

      // Search vector store
      const searchOptions: SearchOptions = {
        limit: (options.limit || 5) * 2, // Fetch extra for filtering
        minScore: options.minSimilarity || 0.6,
        includeVector: false,
      };

      const results = await this.vectorStore!.searchFiltered(
        embeddingResult.vector,
        filter,
        searchOptions
      );

      // Fetch full skill records
      const skills: SimilarSkill[] = [];
      for (const result of results) {
        const skill = this.embeddedStore!.get<Skill>('skills', result.id);
        if (skill) {
          skills.push({
            skill: { ...skill, id: result.id },
            similarity: result.score,
            embeddingId: result.id,
          });
        }
      }

      // Sort by similarity and limit
      skills.sort((a, b) => b.similarity - a.similarity);
      const limitedSkills = skills.slice(0, options.limit || 5);

      // Track metrics
      const searchTimeMs = Date.now() - startTime;
      this.trackSearch('skill', searchTimeMs, limitedSkills.map((s) => s.similarity));

      log.debug('Skill similarity search completed', {
        query: query.slice(0, 50),
        resultsCount: limitedSkills.length,
        searchTimeMs,
      });

      return {
        skills: limitedSkills,
        searchTimeMs,
        usedVectorSearch: true,
      };
    } catch (error) {
      log.error('Skill similarity search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        skills: [],
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }
  }

  /**
   * Find skills by action type
   *
   * @param action The action to search for (e.g., "click", "type", "navigate")
   * @param options Search options
   * @returns Similar skills that perform this action
   */
  async findSkillsByAction(
    action: string,
    options: SkillSearchOptions = {}
  ): Promise<SimilarSkill[]> {
    // Create a query focused on the action
    const query = `action ${action} perform ${action}`;
    const result = await this.findSimilarSkills(query, options);
    return result.skills;
  }

  /**
   * Find skills applicable to a specific domain
   *
   * @param domain Domain to search (e.g., "github.com")
   * @param description Optional description of what to accomplish
   * @returns Skills relevant to this domain
   */
  async findSkillsForDomain(
    domain: string,
    description?: string
  ): Promise<SimilarSkill[]> {
    const query = description
      ? `${domain} ${description}`
      : domain;

    const result = await this.findSimilarSkills(query, {
      domain,
      limit: 10,
      minSimilarity: 0.5,
    });

    return result.skills;
  }

  // ==================== ERROR PATTERN MATCHING ====================

  /**
   * Find similar error patterns
   *
   * Useful for:
   * - Finding known solutions to new errors
   * - Identifying recurring issues
   * - Suggesting retry strategies
   *
   * @param errorMessage Error message to match
   * @param context Additional context (URL, domain, status code)
   * @param options Search options
   * @returns Similar errors and their solutions
   */
  async findSimilarErrors(
    errorMessage: string,
    context?: { url?: string; domain?: string; statusCode?: number },
    options: ErrorSearchOptions = {}
  ): Promise<{
    errors: SimilarError[];
    searchTimeMs: number;
    usedVectorSearch: boolean;
  }> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      log.debug('Semantic search unavailable for errors');
      return {
        errors: [],
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }

    try {
      // Build query from error message and context
      let query = errorMessage;
      if (context?.url) {
        query += ` ${this.urlToSearchableText(context.url)}`;
      }
      if (context?.statusCode) {
        query += ` status ${context.statusCode}`;
      }

      // Generate embedding
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(query);

      // Build filter
      const filter: FilterExpression = { entityType: 'error' };
      if (context?.domain || options.domain) {
        filter.domain = context?.domain || options.domain;
      }
      if (options.tenantId) filter.tenantId = options.tenantId;

      // Search vector store
      const searchOptions: SearchOptions = {
        limit: (options.limit || 10) * 2,
        minScore: options.minSimilarity || 0.5,
        includeVector: false,
      };

      const results = await this.vectorStore!.searchFiltered(
        embeddingResult.vector,
        filter,
        searchOptions
      );

      // Fetch full error records and anti-patterns
      const errors: SimilarError[] = [];
      for (const result of results) {
        const error = this.embeddedStore!.get<FailureRecord>('errors', result.id);
        if (error) {
          // Try to find matching anti-pattern
          const antiPattern = this.findMatchingAntiPattern(error);

          errors.push({
            error: { ...error },
            similarity: result.score,
            embeddingId: result.id,
            antiPattern,
          });
        }
      }

      // Sort by similarity and limit
      errors.sort((a, b) => b.similarity - a.similarity);
      const limitedErrors = errors.slice(0, options.limit || 10);

      // Track metrics
      const searchTimeMs = Date.now() - startTime;
      this.trackSearch('error', searchTimeMs, limitedErrors.map((e) => e.similarity));

      log.debug('Error similarity search completed', {
        errorMessage: errorMessage.slice(0, 50),
        resultsCount: limitedErrors.length,
        searchTimeMs,
      });

      return {
        errors: limitedErrors,
        searchTimeMs,
        usedVectorSearch: true,
      };
    } catch (error) {
      log.error('Error similarity search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        errors: [],
        searchTimeMs: Date.now() - startTime,
        usedVectorSearch: false,
      };
    }
  }

  /**
   * Find known anti-patterns that match an error
   */
  private findMatchingAntiPattern(error: FailureRecord): AntiPattern | undefined {
    if (!this.embeddedStore) return undefined;

    // Get all anti-patterns and find matching one
    const antiPatterns = this.embeddedStore.getAll<AntiPattern>('anti-patterns');
    if (!antiPatterns) return undefined;

    for (const [_id, antiPattern] of antiPatterns) {
      // Check domain match
      if (antiPattern.domains.includes(error.domain)) {
        // Check category match
        if (antiPattern.failureCategory === error.category) {
          // Check if not expired
          if (antiPattern.expiresAt === 0 || antiPattern.expiresAt > Date.now()) {
            return antiPattern;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Get suggested retry strategy for an error
   *
   * @param errorMessage Error message
   * @param statusCode HTTP status code if applicable
   * @returns Suggested retry strategy or null
   */
  async getSuggestedRetryStrategy(
    errorMessage: string,
    statusCode?: number
  ): Promise<{
    strategy: 'retry' | 'backoff' | 'skip' | 'none';
    reason: string;
    delayMs?: number;
  } | null> {
    const result = await this.findSimilarErrors(errorMessage, { statusCode }, {
      limit: 5,
      minSimilarity: 0.7,
    });

    if (result.errors.length === 0) {
      return null;
    }

    // Check if any have an anti-pattern with strategy
    for (const error of result.errors) {
      if (error.antiPattern) {
        return {
          strategy: this.mapRetryStrategy(error.antiPattern.recommendedAction),
          reason: error.antiPattern.reason,
          delayMs: error.antiPattern.suppressionDurationMs || undefined,
        };
      }
    }

    // Use the most common category to suggest strategy
    const categories = result.errors.map((e) => e.error.category);
    const mostCommon = this.getMostCommon(categories);

    return this.getDefaultStrategy(mostCommon);
  }

  private mapRetryStrategy(action: string): 'retry' | 'backoff' | 'skip' | 'none' {
    switch (action) {
      case 'none':
        return 'none';
      case 'skip_domain':
        return 'skip';
      case 'backoff':
        return 'backoff';
      case 'retry':
      case 'increase_timeout':
        return 'retry';
      default:
        return 'none';
    }
  }

  private getMostCommon<T>(items: T[]): T | undefined {
    if (items.length === 0) return undefined;
    const counts = new Map<T, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    let maxCount = 0;
    let mostCommon: T | undefined;
    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    }
    return mostCommon;
  }

  private getDefaultStrategy(category?: string): {
    strategy: 'retry' | 'backoff' | 'skip' | 'none';
    reason: string;
    delayMs?: number;
  } {
    switch (category) {
      case 'rate_limited':
        return { strategy: 'backoff', reason: 'Rate limited', delayMs: 60000 };
      case 'timeout':
        return { strategy: 'retry', reason: 'Timeout', delayMs: 5000 };
      case 'server_error':
        return { strategy: 'backoff', reason: 'Server error', delayMs: 10000 };
      case 'auth_required':
        return { strategy: 'none', reason: 'Authentication required' };
      case 'wrong_endpoint':
        return { strategy: 'skip', reason: 'Wrong endpoint' };
      default:
        return { strategy: 'none', reason: 'Unknown error type' };
    }
  }

  // ==================== CONTENT DEDUPLICATION ====================

  /**
   * Check if content is a duplicate of existing content
   *
   * @param content Content to check
   * @param options Deduplication options
   * @returns Duplicate check result
   */
  async checkDuplicate(
    content: string,
    options: DeduplicationOptions = {}
  ): Promise<DuplicateResult> {
    const threshold = options.similarityThreshold || 0.95;
    const maxCandidates = options.maxCandidates || 100;

    if (!this.isAvailable()) {
      return {
        isDuplicate: false,
        candidatesChecked: 0,
      };
    }

    try {
      // Truncate content for embedding
      const queryText = this.truncateContent(content, 500);

      // Generate embedding
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(queryText);

      // Build filter
      const filter: FilterExpression = { entityType: 'content' };
      if (options.domain) filter.domain = options.domain;
      if (options.tenantId) filter.tenantId = options.tenantId;

      // Search for similar content
      const results = await this.vectorStore!.searchFiltered(
        embeddingResult.vector,
        filter,
        { limit: maxCandidates, minScore: threshold - 0.1, includeVector: false }
      );

      // Track in metrics
      this.trackSearch('content', 0, results.map((r) => r.score));

      // Check if any exceed threshold
      for (const result of results) {
        if (result.score >= threshold) {
          log.debug('Duplicate content found', {
            originalId: result.id,
            similarity: result.score,
          });
          return {
            isDuplicate: true,
            originalId: result.id,
            similarity: result.score,
            candidatesChecked: results.length,
          };
        }
      }

      return {
        isDuplicate: false,
        candidatesChecked: results.length,
      };
    } catch (error) {
      log.error('Duplicate check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isDuplicate: false,
        candidatesChecked: 0,
      };
    }
  }

  /**
   * Find all near-duplicates of content
   *
   * @param content Content to find duplicates for
   * @param options Deduplication options
   * @returns Array of near-duplicate content IDs with similarity scores
   */
  async findNearDuplicates(
    content: string,
    options: DeduplicationOptions = {}
  ): Promise<Array<{ id: string; similarity: number }>> {
    const threshold = options.similarityThreshold || 0.85;
    const maxCandidates = options.maxCandidates || 50;

    if (!this.isAvailable()) {
      return [];
    }

    try {
      const queryText = this.truncateContent(content, 500);
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(queryText);

      const filter: FilterExpression = { entityType: 'content' };
      if (options.domain) filter.domain = options.domain;
      if (options.tenantId) filter.tenantId = options.tenantId;

      const results = await this.vectorStore!.searchFiltered(
        embeddingResult.vector,
        filter,
        { limit: maxCandidates, minScore: threshold, includeVector: false }
      );

      return results.map((r) => ({ id: r.id, similarity: r.score }));
    } catch (error) {
      log.error('Find near duplicates failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get content fingerprint for quick comparison
   *
   * @param content Content to fingerprint
   * @returns Fingerprint string (hash of embedding)
   */
  async getContentFingerprint(content: string): Promise<string | null> {
    if (!this.isAvailable()) return null;

    try {
      const queryText = this.truncateContent(content, 500);
      const embeddingResult =
        await this.embeddingProvider!.generateEmbedding(queryText);

      // Create a simple hash from the first 8 dimensions
      const hash = Array.from(embeddingResult.vector.slice(0, 8))
        .map((v) => Math.round(v * 1000).toString(16).padStart(4, '0'))
        .join('');

      return hash;
    } catch (error) {
      log.error('Fingerprint generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ==================== ANALYTICS ====================

  /**
   * Get comprehensive analytics about semantic search
   */
  async getAnalytics(): Promise<SemanticSearchAnalytics> {
    if (!this.isAvailable()) {
      return {
        embeddingsByType: { pattern: 0, skill: 0, content: 0, error: 0 },
        totalEmbeddings: 0,
        dimensions: 0,
        model: 'unavailable',
        avgSearchLatencyMs: 0,
        searchCountByType: { pattern: 0, skill: 0, content: 0, error: 0 },
        topDomains: [],
        similarityDistribution: {
          '0.9-1.0': 0,
          '0.8-0.9': 0,
          '0.7-0.8': 0,
          '0.6-0.7': 0,
          '0.5-0.6': 0,
          'below-0.5': 0,
        },
      };
    }

    try {
      // Get vector store stats
      const vectorStats = await this.vectorStore!.getStats();

      // Calculate average search latency
      const avgLatency =
        this.metrics.searchCount > 0
          ? this.metrics.totalLatencyMs / this.metrics.searchCount
          : 0;

      // Get top domains from embeddings
      const topDomains = await this.getTopDomains(10);

      return {
        embeddingsByType: vectorStats.recordsByType,
        totalEmbeddings: vectorStats.totalRecords,
        dimensions: vectorStats.dimensions,
        model: this.embeddingProvider!.getModelName(),
        avgSearchLatencyMs: Math.round(avgLatency),
        searchCountByType: { ...this.metrics.searchesByType },
        topDomains,
        similarityDistribution: { ...this.metrics.resultsByBucket },
      };
    } catch (error) {
      log.error('Failed to get analytics', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        embeddingsByType: { pattern: 0, skill: 0, content: 0, error: 0 },
        totalEmbeddings: 0,
        dimensions: 0,
        model: 'error',
        avgSearchLatencyMs: 0,
        searchCountByType: { pattern: 0, skill: 0, content: 0, error: 0 },
        topDomains: [],
        similarityDistribution: {
          '0.9-1.0': 0,
          '0.8-0.9': 0,
          '0.7-0.8': 0,
          '0.6-0.7': 0,
          '0.5-0.6': 0,
          'below-0.5': 0,
        },
      };
    }
  }

  /**
   * Get embedding coverage report
   *
   * Shows what percentage of patterns/skills/etc have embeddings
   */
  async getCoverageReport(): Promise<{
    patterns: { total: number; indexed: number; percentage: number };
    skills: { total: number; indexed: number; percentage: number };
  }> {
    if (!this.isAvailable()) {
      return {
        patterns: { total: 0, indexed: 0, percentage: 0 },
        skills: { total: 0, indexed: 0, percentage: 0 },
      };
    }

    try {
      const vectorStats = await this.vectorStore!.getStats();

      // Count patterns in embedded store
      const patterns = this.embeddedStore!.getAll('patterns');
      const patternCount = patterns ? patterns.size : 0;

      // Count skills in embedded store
      const skills = this.embeddedStore!.getAll('skills');
      const skillCount = skills ? skills.size : 0;

      return {
        patterns: {
          total: patternCount,
          indexed: vectorStats.recordsByType.pattern,
          percentage:
            patternCount > 0
              ? Math.round((vectorStats.recordsByType.pattern / patternCount) * 100)
              : 0,
        },
        skills: {
          total: skillCount,
          indexed: vectorStats.recordsByType.skill,
          percentage:
            skillCount > 0
              ? Math.round((vectorStats.recordsByType.skill / skillCount) * 100)
              : 0,
        },
      };
    } catch (error) {
      log.error('Failed to get coverage report', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        patterns: { total: 0, indexed: 0, percentage: 0 },
        skills: { total: 0, indexed: 0, percentage: 0 },
      };
    }
  }

  /**
   * Reset analytics metrics
   */
  resetMetrics(): void {
    this.metrics = {
      searchCount: 0,
      totalLatencyMs: 0,
      resultsByBucket: {
        '0.9-1.0': 0,
        '0.8-0.9': 0,
        '0.7-0.8': 0,
        '0.6-0.7': 0,
        '0.5-0.6': 0,
        'below-0.5': 0,
      },
      searchesByType: {
        pattern: 0,
        skill: 0,
        content: 0,
        error: 0,
      },
    };
    log.info('Metrics reset');
  }

  // ==================== HELPER METHODS ====================

  /**
   * Track search metrics
   */
  private trackSearch(
    entityType: EntityType,
    latencyMs: number,
    similarities: number[]
  ): void {
    this.metrics.searchCount++;
    this.metrics.totalLatencyMs += latencyMs;
    this.metrics.searchesByType[entityType]++;

    // Bucket similarity scores
    for (const score of similarities) {
      if (score >= 0.9) {
        this.metrics.resultsByBucket['0.9-1.0']++;
      } else if (score >= 0.8) {
        this.metrics.resultsByBucket['0.8-0.9']++;
      } else if (score >= 0.7) {
        this.metrics.resultsByBucket['0.7-0.8']++;
      } else if (score >= 0.6) {
        this.metrics.resultsByBucket['0.6-0.7']++;
      } else if (score >= 0.5) {
        this.metrics.resultsByBucket['0.5-0.6']++;
      } else {
        this.metrics.resultsByBucket['below-0.5']++;
      }
    }
  }

  /**
   * Get top domains by embedding count
   */
  private async getTopDomains(
    limit: number
  ): Promise<Array<{ domain: string; count: number }>> {
    // This would require a query against the vector store
    // For now, return empty - could be enhanced with aggregation
    return [];
  }

  /**
   * Convert URL to searchable text
   */
  private urlToSearchableText(url: string): string {
    try {
      const urlObj = new URL(url);
      const parts: string[] = [];

      // Domain
      const domain = urlObj.hostname.replace(/^www\./, '');
      parts.push(domain);

      // Path segments (without IDs)
      const pathSegments = urlObj.pathname
        .split('/')
        .filter((s) => s && !/^[0-9a-f-]+$/i.test(s) && !/^\d+$/.test(s));
      parts.push(...pathSegments);

      return parts.join(' ');
    } catch {
      return url;
    }
  }

  /**
   * Truncate content for embedding
   */
  private truncateContent(content: string, maxLength: number): string {
    const cleaned = content.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;

    const truncated = cleaned.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > maxLength * 0.8
      ? truncated.slice(0, lastSpace)
      : truncated;
  }
}

/**
 * Create a SemanticSearchExtended instance
 */
export function createSemanticSearchExtended(
  embeddingProvider?: EmbeddingProvider | null,
  vectorStore?: VectorStore | null,
  embeddedStore?: EmbeddedStore | null
): SemanticSearchExtended {
  return new SemanticSearchExtended(
    embeddingProvider ?? null,
    vectorStore ?? null,
    embeddedStore ?? null
  );
}
