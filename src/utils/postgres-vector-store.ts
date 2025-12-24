/**
 * Postgres Vector Store - pgvector-based Vector Storage
 *
 * Provides vector embedding storage using PostgreSQL with pgvector extension.
 * Replaces LanceDB for hosted deployments where file-based storage isn't persistent.
 *
 * Requirements:
 * - PostgreSQL 15+ with pgvector extension
 * - Supabase, Neon, or self-hosted Postgres with pgvector enabled
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger.js';

// Create a logger for vector store operations
const log = logger.create('PostgresVectorStore');

/**
 * Options for PostgresVectorStore
 */
export interface PostgresVectorStoreOptions {
  prisma?: PrismaClient;
  dimensions?: number;
}

/**
 * Entity types that can be stored
 */
export type EntityType = 'pattern' | 'skill' | 'content' | 'error';

/**
 * Valid entity types set for runtime validation
 */
const VALID_ENTITY_TYPES: Set<string> = new Set(['pattern', 'skill', 'content', 'error']);

/**
 * Validate and parse entity type from database value
 * Falls back to 'pattern' for unknown values to ensure type safety
 */
function parseEntityType(value: string): EntityType {
  if (VALID_ENTITY_TYPES.has(value)) {
    return value as EntityType;
  }
  log.warn('Unknown entity type in database, defaulting to pattern', { value });
  return 'pattern';
}

/**
 * Embedding record to store
 */
export interface EmbeddingRecord {
  id: string;
  vector: number[] | Float32Array;
  model: string;
  version: number;
  createdAt: number;
  entityType: EntityType;
  domain?: string;
  tenantId?: string;
  text?: string;
}

/**
 * Filter for vector searches
 */
export interface VectorSearchFilter {
  entityType?: EntityType;
  domain?: string;
  tenantId?: string;
  minVersion?: number;
}

/**
 * Options for vector search
 */
export interface VectorSearchOptions {
  limit?: number;
  minScore?: number;
  includeVector?: boolean;
}

/**
 * Search result
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: {
    entityType: EntityType;
    domain?: string;
    tenantId?: string;
    model: string;
    version: number;
    createdAt: number;
    text?: string;
  };
  vector?: number[];
}

/**
 * Statistics about the vector store
 */
export interface VectorStoreStats {
  totalRecords: number;
  recordsByType: Record<EntityType, number>;
  tableExists: boolean;
  dimensions: number;
  lastModified?: number;
}

/**
 * Raw query result type
 */
interface RawEmbeddingRow {
  id: string;
  distance: number;
  model: string;
  version: number;
  entityType: string;
  domain: string | null;
  tenantId: string | null;
  text: string | null;
  createdAt: Date;
  vector: string | null;
}

/**
 * PostgresVectorStore - pgvector-backed vector storage for semantic search
 *
 * Provides CRUD operations and similarity search for embedding vectors
 * using PostgreSQL's pgvector extension.
 */
export class PostgresVectorStore {
  private prisma: PrismaClient;
  private ownsPrisma: boolean;
  private initialized = false;
  private dimensions: number;

  constructor(options: PostgresVectorStoreOptions = {}) {
    this.dimensions = options.dimensions || 384;

    if (options.prisma) {
      this.prisma = options.prisma;
      this.ownsPrisma = false;
    } else {
      this.prisma = new PrismaClient();
      this.ownsPrisma = true;
    }
  }

  /**
   * Check if pgvector is available
   */
  static async isAvailable(prisma?: PrismaClient): Promise<boolean> {
    const client = prisma || new PrismaClient();
    try {
      // Check if vector extension is installed
      const result = await client.$queryRaw<Array<{ installed: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) as installed
      `;
      return result[0]?.installed ?? false;
    } catch {
      return false;
    } finally {
      if (!prisma) {
        await client.$disconnect();
      }
    }
  }

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test connection and check pgvector
      await this.prisma.$connect();

      // Ensure vector extension is enabled
      await this.prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;

      this.initialized = true;
      log.info('PostgreSQL vector store initialized', {
        dimensions: this.dimensions,
      });
    } catch (error) {
      log.error('Failed to initialize PostgreSQL vector store', { error });
      throw new Error(
        `Failed to initialize vector store: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Add a single embedding record
   */
  async add(record: EmbeddingRecord): Promise<void> {
    this.ensureInitialized();

    const vectorArray = Array.from(record.vector);
    const vectorString = `[${vectorArray.join(',')}]`;

    await this.prisma.$executeRaw`
      INSERT INTO embeddings (id, vector, model, version, "entityType", domain, "tenantId", text, "createdAt")
      VALUES (
        ${record.id},
        ${vectorString}::vector,
        ${record.model},
        ${record.version},
        ${record.entityType},
        ${record.domain || null},
        ${record.tenantId || null},
        ${record.text || null},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        vector = EXCLUDED.vector,
        model = EXCLUDED.model,
        version = EXCLUDED.version,
        "entityType" = EXCLUDED."entityType",
        domain = EXCLUDED.domain,
        "tenantId" = EXCLUDED."tenantId",
        text = EXCLUDED.text
    `;

    log.debug('Added embedding record', { id: record.id });
  }

  /**
   * Add multiple embedding records in batch
   */
  async addBatch(records: EmbeddingRecord[]): Promise<void> {
    if (records.length === 0) return;
    this.ensureInitialized();

    // Use a transaction for batch insert
    await this.prisma.$transaction(
      records.map((record) => {
        const vectorArray = Array.from(record.vector);
        const vectorString = `[${vectorArray.join(',')}]`;

        return this.prisma.$executeRaw`
          INSERT INTO embeddings (id, vector, model, version, "entityType", domain, "tenantId", text, "createdAt")
          VALUES (
            ${record.id},
            ${vectorString}::vector,
            ${record.model},
            ${record.version},
            ${record.entityType},
            ${record.domain || null},
            ${record.tenantId || null},
            ${record.text || null},
            NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            vector = EXCLUDED.vector,
            model = EXCLUDED.model,
            version = EXCLUDED.version,
            "entityType" = EXCLUDED."entityType",
            domain = EXCLUDED.domain,
            "tenantId" = EXCLUDED."tenantId",
            text = EXCLUDED.text
        `;
      })
    );

    log.debug('Added embedding batch', { count: records.length });
  }

  /**
   * Search for similar vectors using cosine similarity
   */
  async search(
    vector: number[] | Float32Array,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const limit = options.limit || 10;
    const vectorArray = Array.from(vector);
    const vectorString = `[${vectorArray.join(',')}]`;

    // Use cosine distance for similarity (1 - cosine_distance = similarity)
    const results = await this.prisma.$queryRaw<RawEmbeddingRow[]>`
      SELECT
        id,
        1 - (vector <=> ${vectorString}::vector) as distance,
        model,
        version,
        "entityType",
        domain,
        "tenantId",
        text,
        "createdAt",
        ${options.includeVector ? Prisma.sql`vector::text` : Prisma.sql`NULL`} as vector
      FROM embeddings
      ORDER BY vector <=> ${vectorString}::vector
      LIMIT ${limit}
    `;

    return this.formatResults(results, options);
  }

  /**
   * Search with metadata filters
   */
  async searchFiltered(
    vector: number[] | Float32Array,
    filter: VectorSearchFilter,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const limit = options.limit || 10;
    const vectorArray = Array.from(vector);
    const vectorString = `[${vectorArray.join(',')}]`;

    // Build dynamic filter conditions
    const conditions: Prisma.Sql[] = [];

    if (filter.entityType) {
      conditions.push(Prisma.sql`"entityType" = ${filter.entityType}`);
    }
    if (filter.domain) {
      conditions.push(Prisma.sql`domain = ${filter.domain}`);
    }
    if (filter.tenantId) {
      conditions.push(Prisma.sql`"tenantId" = ${filter.tenantId}`);
    }
    if (filter.minVersion !== undefined) {
      conditions.push(Prisma.sql`version >= ${filter.minVersion}`);
    }

    const whereClause =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const results = await this.prisma.$queryRaw<RawEmbeddingRow[]>`
      SELECT
        id,
        1 - (vector <=> ${vectorString}::vector) as distance,
        model,
        version,
        "entityType",
        domain,
        "tenantId",
        text,
        "createdAt",
        ${options.includeVector ? Prisma.sql`vector::text` : Prisma.sql`NULL`} as vector
      FROM embeddings
      ${whereClause}
      ORDER BY vector <=> ${vectorString}::vector
      LIMIT ${limit}
    `;

    return this.formatResults(results, options);
  }

  /**
   * Format raw Postgres results into SearchResult objects
   */
  private formatResults(
    results: RawEmbeddingRow[],
    options: VectorSearchOptions
  ): VectorSearchResult[] {
    return results
      .map((row) => {
        // distance is already cosine similarity (1 - cosine_distance)
        const score = Number(row.distance);

        const result: VectorSearchResult = {
          id: row.id,
          score,
          metadata: {
            entityType: parseEntityType(row.entityType),
            domain: row.domain || undefined,
            tenantId: row.tenantId || undefined,
            model: row.model,
            version: row.version,
            createdAt: row.createdAt.getTime(),
            text: row.text || undefined,
          },
        };

        if (options.includeVector && row.vector) {
          // Parse vector string "[1,2,3]" back to array
          result.vector = JSON.parse(row.vector.replace(/^\[/, '[').replace(/\]$/, ']'));
        }

        return result;
      })
      .filter((r) => {
        // Apply minScore filter
        if (options.minScore !== undefined && r.score < options.minScore) {
          return false;
        }
        return true;
      });
  }

  /**
   * Get a single record by ID
   */
  async get(id: string): Promise<EmbeddingRecord | null> {
    this.ensureInitialized();

    const results = await this.prisma.$queryRaw<Array<RawEmbeddingRow & { vector: string }>>`
      SELECT
        id,
        vector::text,
        model,
        version,
        "entityType",
        domain,
        "tenantId",
        text,
        "createdAt"
      FROM embeddings
      WHERE id = ${id}
      LIMIT 1
    `;

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id,
      vector: JSON.parse(row.vector),
      model: row.model,
      version: row.version,
      createdAt: row.createdAt.getTime(),
      entityType: parseEntityType(row.entityType),
      domain: row.domain || undefined,
      tenantId: row.tenantId || undefined,
      text: row.text || undefined,
    };
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    const result = await this.prisma.$executeRaw`
      DELETE FROM embeddings WHERE id = ${id}
    `;

    const deleted = result > 0;
    if (deleted) {
      log.debug('Deleted embedding record', { id });
    }
    return deleted;
  }

  /**
   * Delete records matching a filter
   */
  async deleteByFilter(filter: VectorSearchFilter): Promise<number> {
    this.ensureInitialized();

    const conditions: Prisma.Sql[] = [];

    if (filter.entityType) {
      conditions.push(Prisma.sql`"entityType" = ${filter.entityType}`);
    }
    if (filter.domain) {
      conditions.push(Prisma.sql`domain = ${filter.domain}`);
    }
    if (filter.tenantId) {
      conditions.push(Prisma.sql`"tenantId" = ${filter.tenantId}`);
    }
    if (filter.minVersion !== undefined) {
      conditions.push(Prisma.sql`version >= ${filter.minVersion}`);
    }

    if (conditions.length === 0) {
      throw new Error('At least one filter condition required for deleteByFilter');
    }

    const deleted = await this.prisma.$executeRaw`
      DELETE FROM embeddings
      WHERE ${Prisma.join(conditions, ' AND ')}
    `;

    log.debug('Deleted embedding records by filter', { filter, deleted });
    return deleted;
  }

  /**
   * Create an index for optimized vector search
   * Uses IVFFlat index for larger datasets
   */
  async createIndex(): Promise<void> {
    this.ensureInitialized();

    const stats = await this.getStats();

    if (stats.totalRecords > 1000) {
      // IVFFlat is good for larger datasets
      const lists = Math.min(100, Math.floor(Math.sqrt(stats.totalRecords)));
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS embeddings_vector_idx
        ON embeddings
        USING ivfflat (vector vector_cosine_ops)
        WITH (lists = ${lists})
      `;
      log.info('Created IVFFlat index', { lists, totalRecords: stats.totalRecords });
    } else {
      // HNSW is better for smaller datasets or when you need high recall
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS embeddings_vector_idx
        ON embeddings
        USING hnsw (vector vector_cosine_ops)
      `;
      log.info('Created HNSW index', { totalRecords: stats.totalRecords });
    }
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(): Promise<VectorStoreStats> {
    this.ensureInitialized();

    const totalResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM embeddings
    `;
    const totalRecords = Number(totalResult[0].count);

    // Count by entity type
    const typeResults = await this.prisma.$queryRaw<Array<{ entityType: string; count: bigint }>>`
      SELECT "entityType", COUNT(*) as count
      FROM embeddings
      GROUP BY "entityType"
    `;

    const recordsByType: Record<string, number> = {
      pattern: 0,
      skill: 0,
      content: 0,
      error: 0,
    };

    for (const row of typeResults) {
      if (row.entityType in recordsByType) {
        recordsByType[row.entityType] = Number(row.count);
      }
    }

    // Get last modified
    const lastModifiedResult = await this.prisma.$queryRaw<Array<{ lastModified: Date | null }>>`
      SELECT MAX("createdAt") as "lastModified" FROM embeddings
    `;

    return {
      totalRecords,
      recordsByType,
      tableExists: true,
      dimensions: this.dimensions,
      lastModified: lastModifiedResult[0]?.lastModified?.getTime() || undefined,
    };
  }

  /**
   * Check if the store is using pgvector
   */
  isUsingPgvector(): boolean {
    return this.initialized;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.ownsPrisma) {
      await this.prisma.$disconnect();
    }
    this.initialized = false;
    log.info('PostgreSQL vector store connection closed');
  }

  /**
   * Ensure the store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PostgresVectorStore not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create a PostgresVectorStore instance
 */
export function createPostgresVectorStore(options?: PostgresVectorStoreOptions): PostgresVectorStore {
  return new PostgresVectorStore(options);
}

/**
 * Global vector store instance (singleton)
 */
let globalVectorStore: PostgresVectorStore | null = null;

/**
 * Get or create the global vector store (singleton pattern)
 */
export async function getPostgresVectorStore(
  options?: PostgresVectorStoreOptions
): Promise<PostgresVectorStore | null> {
  if (!process.env.DATABASE_URL) {
    log.warn('DATABASE_URL not set, vector search disabled');
    return null;
  }

  if (!globalVectorStore) {
    globalVectorStore = new PostgresVectorStore(options);
    await globalVectorStore.initialize();
  }

  return globalVectorStore;
}

/**
 * Close the global vector store
 */
export async function closePostgresVectorStore(): Promise<void> {
  if (globalVectorStore) {
    await globalVectorStore.close();
    globalVectorStore = null;
  }
}
