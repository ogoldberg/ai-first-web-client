/**
 * Embedding Pipeline for LLM Browser (V-002)
 *
 * Connects EmbeddingProvider to VectorStore for indexing patterns and skills.
 * Handles ingestion, batch processing, and migration of existing data.
 */

import { logger } from './logger.js';
import { EmbeddingProvider } from './embedding-provider.js';
import {
  VectorStore,
  createVectorStore,
  type EmbeddingRecord,
  type EntityType,
} from './vector-store.js';
import type { EmbeddedStore } from './embedded-store.js';

// Create a logger for pipeline operations
const log = logger.create('EmbeddingPipeline');

/**
 * Learned pattern structure (from EmbeddedStore)
 */
export interface LearnedPattern {
  id?: string;
  urlPattern: string;
  method?: string;
  description?: string;
  contentMapping?: Record<string, unknown>;
  confidence?: number;
  domain?: string;
  lastUsed?: number;
  successCount?: number;
  failureCount?: number;
  embeddingId?: string;
  embeddingVersion?: number;
}

/**
 * Skill structure (from EmbeddedStore)
 */
export interface Skill {
  id?: string;
  name: string;
  description?: string;
  domain?: string;
  steps?: SkillStep[];
  embeddingId?: string;
  embeddingVersion?: number;
}

interface SkillStep {
  action: string;
  description?: string;
}

/**
 * Configuration for the embedding pipeline
 */
export interface EmbeddingPipelineOptions {
  /** Path to the vector database */
  vectorDbPath: string;

  /** Batch size for processing (default: 50) */
  batchSize?: number;

  /** Whether to auto-index new patterns (default: true) */
  autoIndex?: boolean;

  /** Embedding model version (default: 1) */
  embeddingVersion?: number;
}

/**
 * Statistics from indexing operations
 */
export interface IndexStats {
  indexed: number;
  failed: number;
  skipped: number;
  totalTimeMs: number;
}

/**
 * Result of indexing a single entity
 */
export interface IndexResult {
  id: string;
  success: boolean;
  error?: string;
}

/**
 * EmbeddingPipeline - Manages the flow of data from patterns/skills to vector store
 */
export class EmbeddingPipeline {
  private embeddingProvider: EmbeddingProvider | null = null;
  private vectorStore: VectorStore | null = null;
  private initialized = false;

  private readonly vectorDbPath: string;
  private readonly batchSize: number;
  private readonly autoIndex: boolean;
  private readonly embeddingVersion: number;

  constructor(options: EmbeddingPipelineOptions) {
    this.vectorDbPath = options.vectorDbPath;
    this.batchSize = options.batchSize || 50;
    this.autoIndex = options.autoIndex ?? true;
    this.embeddingVersion = options.embeddingVersion || 1;
  }

  /**
   * Check if the pipeline can be initialized (dependencies available)
   */
  static async isAvailable(): Promise<boolean> {
    const embeddingsAvailable = await EmbeddingProvider.isAvailable();
    const vectorStoreAvailable = await VectorStore.isAvailable();
    return embeddingsAvailable && vectorStoreAvailable;
  }

  /**
   * Initialize the pipeline
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize embedding provider
    this.embeddingProvider = await EmbeddingProvider.create();
    if (!this.embeddingProvider) {
      throw new Error('Failed to initialize EmbeddingProvider');
    }

    // Initialize vector store
    this.vectorStore = createVectorStore({
      dbPath: this.vectorDbPath,
      tableName: 'embeddings',
      dimensions: this.embeddingProvider.getDimensions(),
    });
    await this.vectorStore.initialize();

    this.initialized = true;
    log.info('Embedding pipeline initialized', {
      vectorDbPath: this.vectorDbPath,
      model: this.embeddingProvider.getModelName(),
      dimensions: this.embeddingProvider.getDimensions(),
    });
  }

  /**
   * Ensure the pipeline is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.embeddingProvider || !this.vectorStore) {
      throw new Error('EmbeddingPipeline not initialized');
    }
  }

  /**
   * Index a single pattern
   */
  async indexPattern(pattern: LearnedPattern): Promise<IndexResult> {
    await this.ensureInitialized();

    const id = pattern.id || `pattern-${Date.now()}`;

    try {
      // Generate embedding text from pattern
      const text = patternToEmbeddingText(pattern);
      if (!text || text.trim().length === 0) {
        return { id, success: false, error: 'Empty embedding text' };
      }

      // Generate embedding
      const result = await this.embeddingProvider!.generateEmbedding(text);

      // Store in vector store
      const record: EmbeddingRecord = {
        id,
        vector: result.vector,
        model: result.model,
        version: this.embeddingVersion,
        createdAt: Date.now(),
        entityType: 'pattern',
        domain: pattern.domain || extractDomain(pattern.urlPattern),
        text,
      };

      await this.vectorStore!.add(record);
      log.debug('Indexed pattern', { id, domain: record.domain });

      return { id, success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('Failed to index pattern', { id, error: errorMsg });
      return { id, success: false, error: errorMsg };
    }
  }

  /**
   * Index a single skill
   */
  async indexSkill(skill: Skill): Promise<IndexResult> {
    await this.ensureInitialized();

    const id = skill.id || `skill-${Date.now()}`;

    try {
      // Generate embedding text from skill
      const text = skillToEmbeddingText(skill);
      if (!text || text.trim().length === 0) {
        return { id, success: false, error: 'Empty embedding text' };
      }

      // Generate embedding
      const result = await this.embeddingProvider!.generateEmbedding(text);

      // Store in vector store
      const record: EmbeddingRecord = {
        id,
        vector: result.vector,
        model: result.model,
        version: this.embeddingVersion,
        createdAt: Date.now(),
        entityType: 'skill',
        domain: skill.domain,
        text,
      };

      await this.vectorStore!.add(record);
      log.debug('Indexed skill', { id, name: skill.name });

      return { id, success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('Failed to index skill', { id, error: errorMsg });
      return { id, success: false, error: errorMsg };
    }
  }

  /**
   * Index multiple patterns in batch
   */
  async indexPatterns(patterns: LearnedPattern[]): Promise<IndexStats> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const stats: IndexStats = { indexed: 0, failed: 0, skipped: 0, totalTimeMs: 0 };

    // Process in batches
    for (let i = 0; i < patterns.length; i += this.batchSize) {
      const batch = patterns.slice(i, i + this.batchSize);
      const batchStats = await this.processBatch(batch, 'pattern');

      stats.indexed += batchStats.indexed;
      stats.failed += batchStats.failed;
      stats.skipped += batchStats.skipped;

      log.debug('Processed pattern batch', {
        batch: i / this.batchSize + 1,
        total: Math.ceil(patterns.length / this.batchSize),
        indexed: batchStats.indexed,
      });
    }

    stats.totalTimeMs = Date.now() - startTime;
    log.info('Finished indexing patterns', { ...stats });
    return stats;
  }

  /**
   * Index multiple skills in batch
   */
  async indexSkills(skills: Skill[]): Promise<IndexStats> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const stats: IndexStats = { indexed: 0, failed: 0, skipped: 0, totalTimeMs: 0 };

    // Process in batches
    for (let i = 0; i < skills.length; i += this.batchSize) {
      const batch = skills.slice(i, i + this.batchSize);
      const batchStats = await this.processSkillBatch(batch);

      stats.indexed += batchStats.indexed;
      stats.failed += batchStats.failed;
      stats.skipped += batchStats.skipped;
    }

    stats.totalTimeMs = Date.now() - startTime;
    log.info('Finished indexing skills', { ...stats });
    return stats;
  }

  /**
   * Process a batch of patterns
   */
  private async processBatch(
    patterns: LearnedPattern[],
    entityType: EntityType
  ): Promise<IndexStats> {
    const stats: IndexStats = { indexed: 0, failed: 0, skipped: 0, totalTimeMs: 0 };

    // Filter out empty patterns and generate texts
    const validPatterns: Array<{ pattern: LearnedPattern; text: string; id: string }> = [];

    for (const pattern of patterns) {
      const text = patternToEmbeddingText(pattern);
      if (!text || text.trim().length === 0) {
        stats.skipped++;
        continue;
      }
      validPatterns.push({
        pattern,
        text,
        id: pattern.id || `${entityType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
    }

    if (validPatterns.length === 0) {
      return stats;
    }

    try {
      // Generate embeddings in batch
      const texts = validPatterns.map((p) => p.text);
      const embeddings = await this.embeddingProvider!.generateBatch(texts);

      // Create records
      const records: EmbeddingRecord[] = validPatterns.map((p, idx) => ({
        id: p.id,
        vector: embeddings.vectors[idx],
        model: embeddings.model,
        version: this.embeddingVersion,
        createdAt: Date.now(),
        entityType,
        domain: p.pattern.domain || extractDomain(p.pattern.urlPattern),
        text: p.text,
      }));

      // Store in vector store
      await this.vectorStore!.addBatch(records);
      stats.indexed = validPatterns.length;
    } catch (error) {
      log.error('Batch processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      stats.failed = validPatterns.length;
    }

    return stats;
  }

  /**
   * Process a batch of skills
   */
  private async processSkillBatch(skills: Skill[]): Promise<IndexStats> {
    const stats: IndexStats = { indexed: 0, failed: 0, skipped: 0, totalTimeMs: 0 };

    // Filter out empty skills and generate texts
    const validSkills: Array<{ skill: Skill; text: string; id: string }> = [];

    for (const skill of skills) {
      const text = skillToEmbeddingText(skill);
      if (!text || text.trim().length === 0) {
        stats.skipped++;
        continue;
      }
      validSkills.push({
        skill,
        text,
        id: skill.id || `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
    }

    if (validSkills.length === 0) {
      return stats;
    }

    try {
      // Generate embeddings in batch
      const texts = validSkills.map((s) => s.text);
      const embeddings = await this.embeddingProvider!.generateBatch(texts);

      // Create records
      const records: EmbeddingRecord[] = validSkills.map((s, idx) => ({
        id: s.id,
        vector: embeddings.vectors[idx],
        model: embeddings.model,
        version: this.embeddingVersion,
        createdAt: Date.now(),
        entityType: 'skill' as EntityType,
        domain: s.skill.domain,
        text: s.text,
      }));

      // Store in vector store
      await this.vectorStore!.addBatch(records);
      stats.indexed = validSkills.length;
    } catch (error) {
      log.error('Skill batch processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      stats.failed = validSkills.length;
    }

    return stats;
  }

  /**
   * Migrate existing patterns from EmbeddedStore to vector store
   */
  async migrateFromStore(store: EmbeddedStore): Promise<IndexStats> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const stats: IndexStats = { indexed: 0, failed: 0, skipped: 0, totalTimeMs: 0 };

    // Get all patterns from the store
    const patterns = store.getAll<LearnedPattern>('patterns');
    const patternArray = Array.from(patterns.values());

    log.info('Starting pattern migration', { patternCount: patternArray.length });

    // Index patterns in batches
    const patternStats = await this.indexPatterns(patternArray);
    stats.indexed += patternStats.indexed;
    stats.failed += patternStats.failed;
    stats.skipped += patternStats.skipped;

    // Get all skills from the store
    const skills = store.getAll<Skill>('skills');
    const skillArray = Array.from(skills.values());

    log.info('Starting skill migration', { skillCount: skillArray.length });

    // Index skills in batches
    const skillStats = await this.indexSkills(skillArray);
    stats.indexed += skillStats.indexed;
    stats.failed += skillStats.failed;
    stats.skipped += skillStats.skipped;

    stats.totalTimeMs = Date.now() - startTime;
    log.info('Migration completed', { ...stats });
    return stats;
  }

  /**
   * Reindex patterns that have stale embeddings
   */
  async reindexStale(
    store: EmbeddedStore,
    currentVersion?: number
  ): Promise<IndexStats> {
    await this.ensureInitialized();

    const version = currentVersion || this.embeddingVersion;
    const stats: IndexStats = { indexed: 0, failed: 0, skipped: 0, totalTimeMs: 0 };
    const startTime = Date.now();

    // Find patterns with older embedding versions
    const patterns = store.getAll<LearnedPattern>('patterns');
    const stalePatterns: LearnedPattern[] = [];

    for (const [id, pattern] of patterns) {
      if (!pattern.embeddingVersion || pattern.embeddingVersion < version) {
        stalePatterns.push({ ...pattern, id });
      }
    }

    if (stalePatterns.length > 0) {
      log.info('Found stale patterns to reindex', { count: stalePatterns.length });
      const patternStats = await this.indexPatterns(stalePatterns);
      stats.indexed += patternStats.indexed;
      stats.failed += patternStats.failed;
      stats.skipped += patternStats.skipped;
    }

    // Find skills with older embedding versions
    const skills = store.getAll<Skill>('skills');
    const staleSkills: Skill[] = [];

    for (const [id, skill] of skills) {
      if (!skill.embeddingVersion || skill.embeddingVersion < version) {
        staleSkills.push({ ...skill, id });
      }
    }

    if (staleSkills.length > 0) {
      log.info('Found stale skills to reindex', { count: staleSkills.length });
      const skillStats = await this.indexSkills(staleSkills);
      stats.indexed += skillStats.indexed;
      stats.failed += skillStats.failed;
      stats.skipped += skillStats.skipped;
    }

    stats.totalTimeMs = Date.now() - startTime;
    return stats;
  }

  /**
   * Delete an embedding by ID
   */
  async deleteEmbedding(id: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.vectorStore!.delete(id);
  }

  /**
   * Delete embeddings by domain
   */
  async deleteByDomain(domain: string): Promise<number> {
    await this.ensureInitialized();
    return this.vectorStore!.deleteByFilter({ domain });
  }

  /**
   * Get vector store statistics
   */
  async getStats(): Promise<{ patterns: number; skills: number; total: number }> {
    await this.ensureInitialized();
    const stats = await this.vectorStore!.getStats();
    return {
      patterns: stats.recordsByType.pattern,
      skills: stats.recordsByType.skill,
      total: stats.totalRecords,
    };
  }

  /**
   * Get the vector store instance for direct queries
   */
  getVectorStore(): VectorStore | null {
    return this.vectorStore;
  }

  /**
   * Get the embedding provider for direct embeddings
   */
  getEmbeddingProvider(): EmbeddingProvider | null {
    return this.embeddingProvider;
  }

  /**
   * Close the pipeline and release resources
   */
  async close(): Promise<void> {
    if (this.vectorStore) {
      await this.vectorStore.close();
      this.vectorStore = null;
    }
    this.embeddingProvider = null;
    this.initialized = false;
    log.info('Embedding pipeline closed');
  }
}

/**
 * Convert a pattern to embedding text
 */
export function patternToEmbeddingText(pattern: LearnedPattern): string {
  const parts: string[] = [];

  // URL pattern is primary
  if (pattern.urlPattern) {
    parts.push(pattern.urlPattern);
  }

  // Method if not GET
  if (pattern.method && pattern.method !== 'GET') {
    parts.push(pattern.method);
  }

  // Description if available
  if (pattern.description) {
    parts.push(pattern.description);
  }

  // Content mapping keys (field names)
  if (pattern.contentMapping) {
    const fields = Object.keys(pattern.contentMapping);
    if (fields.length > 0) {
      parts.push(fields.join(' '));
    }
  }

  return parts.filter(Boolean).join(' ');
}

/**
 * Convert a skill to embedding text
 */
export function skillToEmbeddingText(skill: Skill): string {
  const parts: string[] = [];

  // Name is primary
  if (skill.name) {
    parts.push(skill.name);
  }

  // Description
  if (skill.description) {
    parts.push(skill.description);
  }

  // Step summaries (first 5)
  if (skill.steps && skill.steps.length > 0) {
    const stepSummary = skill.steps
      .slice(0, 5)
      .map((s) => s.description || s.action)
      .filter(Boolean)
      .join('. ');
    if (stepSummary) {
      parts.push(stepSummary);
    }
  }

  return parts.filter(Boolean).join(' ');
}

/**
 * Extract domain from URL pattern
 */
function extractDomain(urlPattern: string): string | undefined {
  try {
    // Handle patterns like "api.example.com/v1/..."
    const cleaned = urlPattern
      .replace(/\{[^}]+\}/g, 'placeholder')
      .replace(/\*/g, 'wildcard');

    // Try to parse as URL
    if (cleaned.includes('://')) {
      const url = new URL(cleaned);
      return url.hostname;
    }

    // Try with https prefix
    const url = new URL(`https://${cleaned}`);
    return url.hostname;
  } catch {
    // Extract first segment as potential domain
    const match = urlPattern.match(/^([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match?.[1];
  }
}

/**
 * Create an EmbeddingPipeline instance
 */
export function createEmbeddingPipeline(
  options: EmbeddingPipelineOptions
): EmbeddingPipeline {
  return new EmbeddingPipeline(options);
}
