/**
 * Vector Store for LLM Browser (V-001)
 *
 * Provides vector embedding storage using LanceDB for semantic similarity search.
 * Supplements SQLite storage - vectors are linked to SQLite records by ID.
 */

import type {
  Connection as LanceDBConnection,
  Table as LanceDBTable,
} from '@lancedb/lancedb';
import { logger } from './logger.js';

// Create a logger for vector store operations
const log = logger.create('VectorStore');

/**
 * Escape a string value for use in SQL queries.
 * Prevents SQL injection by escaping single quotes.
 */
function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Entity types that can be stored in the vector store
 */
export type EntityType = 'pattern' | 'skill' | 'content' | 'error';

/**
 * Record stored in the vector database
 */
export interface EmbeddingRecord {
  /** Primary key (matches SQLite record) */
  id: string;

  /** The embedding vector (dimension depends on model) */
  vector: number[] | Float32Array;

  /** Embedding model used */
  model: string;

  /** Version for re-embedding on model changes */
  version: number;

  /** Creation timestamp */
  createdAt: number;

  /** Entity type for filtering */
  entityType: EntityType;

  /** Domain for domain-scoped searches */
  domain?: string;

  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;

  /** Original text that was embedded (for debugging) */
  text?: string;
}

/**
 * Search options for vector queries
 */
export interface SearchOptions {
  /** Maximum results to return (default: 10) */
  limit?: number;

  /** Minimum similarity score threshold (0-1) */
  minScore?: number;

  /** Include vector in results */
  includeVector?: boolean;
}

/**
 * Filter expression for scoped searches
 */
export interface FilterExpression {
  entityType?: EntityType;
  domain?: string;
  tenantId?: string;
  minVersion?: number;
}

/**
 * Search result from vector query
 */
export interface SearchResult {
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
 * Vector store statistics
 */
export interface VectorStoreStats {
  totalRecords: number;
  recordsByType: Record<EntityType, number>;
  tableExists: boolean;
  dimensions: number;
  lastModified?: number;
}

/**
 * Options for VectorStore initialization
 */
export interface VectorStoreOptions {
  /** Path to LanceDB database directory */
  dbPath: string;

  /** Table name for embeddings (default: 'embeddings') */
  tableName?: string;

  /** Vector dimensions (default: 384 for all-MiniLM-L6-v2) */
  dimensions?: number;
}

/**
 * VectorStore - LanceDB-backed vector storage for semantic search
 *
 * Provides CRUD operations and similarity search for embedding vectors.
 * Falls back gracefully when LanceDB is not available.
 */
export class VectorStore {
  private db: LanceDBConnection | null = null;
  private table: LanceDBTable | null = null;
  private lancedb: typeof import('@lancedb/lancedb') | null = null;
  private initialized = false;

  private readonly dbPath: string;
  private readonly tableName: string;
  private readonly dimensions: number;

  constructor(options: VectorStoreOptions) {
    this.dbPath = options.dbPath;
    this.tableName = options.tableName || 'embeddings';
    this.dimensions = options.dimensions || 384;
  }

  /**
   * Check if LanceDB is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await import('@lancedb/lancedb');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.lancedb = await import('@lancedb/lancedb');
      this.db = await this.lancedb.connect(this.dbPath);

      // Check if table exists
      const tables = await this.db.tableNames();
      if (tables.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
        log.debug('Opened existing vector store table', {
          table: this.tableName,
        });
      } else {
        this.table = null;
        log.debug('Vector store table does not exist yet', {
          table: this.tableName,
        });
      }

      this.initialized = true;
      log.info('Vector store initialized', { dbPath: this.dbPath });
    } catch (error) {
      log.error('Failed to initialize vector store', { error });
      throw new Error(
        `Failed to initialize vector store: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Ensure the table exists (creates with seed data if needed)
   */
  private async ensureTable(): Promise<LanceDBTable> {
    if (!this.initialized || !this.db) {
      throw new Error('VectorStore not initialized');
    }

    if (this.table) {
      return this.table;
    }

    // Create table with a seed record (LanceDB requires at least one record)
    const seedRecord = {
      id: '__seed__',
      vector: Array(this.dimensions).fill(0),
      model: 'seed',
      version: 0,
      createdAt: Date.now(),
      entityType: 'pattern' as EntityType,
      domain: '',
      tenantId: '',
      text: '',
    };

    this.table = await this.db.createTable(this.tableName, [seedRecord], {
      mode: 'create',
    });

    // Delete the seed record
    await this.table.delete("id = '__seed__'");

    log.info('Created vector store table', {
      table: this.tableName,
      dimensions: this.dimensions,
    });

    return this.table;
  }

  /**
   * Add a single embedding record
   */
  async add(record: EmbeddingRecord): Promise<void> {
    const table = await this.ensureTable();

    const data = {
      id: record.id,
      vector: Array.from(record.vector),
      model: record.model,
      version: record.version,
      createdAt: record.createdAt,
      entityType: record.entityType,
      domain: record.domain || '',
      tenantId: record.tenantId || '',
      text: record.text || '',
    };

    await table.add([data]);
    log.debug('Added embedding record', { id: record.id });
  }

  /**
   * Add multiple embedding records in batch
   */
  async addBatch(records: EmbeddingRecord[]): Promise<void> {
    if (records.length === 0) return;

    const table = await this.ensureTable();

    const data = records.map((record) => ({
      id: record.id,
      vector: Array.from(record.vector),
      model: record.model,
      version: record.version,
      createdAt: record.createdAt,
      entityType: record.entityType,
      domain: record.domain || '',
      tenantId: record.tenantId || '',
      text: record.text || '',
    }));

    await table.add(data);
    log.debug('Added embedding batch', { count: records.length });
  }

  /**
   * Search for similar vectors
   */
  async search(
    vector: number[] | Float32Array,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const table = await this.ensureTable();

    const limit = options.limit || 10;
    const queryVector = Array.from(vector);

    const results = await table.search(queryVector).limit(limit).toArray();

    return this.formatResults(results, options);
  }

  /**
   * Search with metadata filters
   */
  async searchFiltered(
    vector: number[] | Float32Array,
    filter: FilterExpression,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const table = await this.ensureTable();

    const limit = options.limit || 10;
    const queryVector = Array.from(vector);

    let query = table.search(queryVector).limit(limit);

    // Build filter expression with proper escaping to prevent SQL injection
    // LanceDB requires quoted column names for camelCase, single quotes for string values
    const conditions: string[] = [];

    if (filter.entityType) {
      conditions.push(`"entityType" = '${escapeSQL(filter.entityType)}'`);
    }
    if (filter.domain) {
      conditions.push(`"domain" = '${escapeSQL(filter.domain)}'`);
    }
    if (filter.tenantId) {
      conditions.push(`"tenantId" = '${escapeSQL(filter.tenantId)}'`);
    }
    if (filter.minVersion !== undefined) {
      conditions.push(`"version" >= ${filter.minVersion}`);
    }

    if (conditions.length > 0) {
      query = query.where(conditions.join(' AND '));
    }

    const results = await query.toArray();
    return this.formatResults(results, options);
  }

  /**
   * Format raw LanceDB results into SearchResult objects
   */
  private formatResults(
    results: Record<string, unknown>[],
    options: SearchOptions
  ): SearchResult[] {
    return results
      .map((row) => {
        // LanceDB returns _distance for L2 distance, convert to similarity score
        const distance = (row._distance as number) || 0;
        // Convert L2 distance to similarity score (0-1)
        // Using exponential decay: score = exp(-distance)
        const score = Math.exp(-distance);

        const result: SearchResult = {
          id: row.id as string,
          score,
          metadata: {
            entityType: row.entityType as EntityType,
            domain: (row.domain as string) || undefined,
            tenantId: (row.tenantId as string) || undefined,
            model: row.model as string,
            version: row.version as number,
            createdAt: row.createdAt as number,
            text: (row.text as string) || undefined,
          },
        };

        if (options.includeVector) {
          result.vector = row.vector as number[];
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
    if (!this.table) return null;

    const results = await this.table
      .search(Array(this.dimensions).fill(0))
      .where(`id = '${escapeSQL(id)}'`)
      .limit(1)
      .toArray();

    if (results.length === 0) return null;

    const row = results[0];
    return {
      id: row.id as string,
      vector: row.vector as number[],
      model: row.model as string,
      version: row.version as number,
      createdAt: row.createdAt as number,
      entityType: row.entityType as EntityType,
      domain: (row.domain as string) || undefined,
      tenantId: (row.tenantId as string) || undefined,
      text: (row.text as string) || undefined,
    };
  }

  /**
   * Delete a record by ID
   * Returns true if a record was deleted, false otherwise.
   */
  async delete(id: string): Promise<boolean> {
    if (!this.table) return false;

    // Count before and after to determine if a record was deleted
    const beforeCount = await this.table.countRows();
    await this.table.delete(`id = '${escapeSQL(id)}'`);
    const afterCount = await this.table.countRows();

    const deleted = beforeCount > afterCount;
    if (deleted) {
      log.debug('Deleted embedding record', { id });
    }
    return deleted;
  }

  /**
   * Delete records matching a filter
   */
  async deleteByFilter(filter: FilterExpression): Promise<number> {
    if (!this.table) return 0;

    // Build filter expression with proper escaping to prevent SQL injection
    const conditions: string[] = [];

    if (filter.entityType) {
      conditions.push(`"entityType" = '${escapeSQL(filter.entityType)}'`);
    }
    if (filter.domain) {
      conditions.push(`"domain" = '${escapeSQL(filter.domain)}'`);
    }
    if (filter.tenantId) {
      conditions.push(`"tenantId" = '${escapeSQL(filter.tenantId)}'`);
    }
    if (filter.minVersion !== undefined) {
      conditions.push(`"version" >= ${filter.minVersion}`);
    }

    if (conditions.length === 0) {
      throw new Error('At least one filter condition required for deleteByFilter');
    }

    // Count before delete
    const beforeCount = await this.table.countRows();

    await this.table.delete(conditions.join(' AND '));

    // Count after delete
    const afterCount = await this.table.countRows();
    const deleted = beforeCount - afterCount;

    log.debug('Deleted embedding records by filter', {
      filter,
      deleted,
    });

    return deleted;
  }

  /**
   * Recreate the index for optimized search
   */
  async reindex(): Promise<void> {
    if (!this.table) return;

    // Create IVF-PQ index for faster search on larger datasets
    const rowCount = await this.table.countRows();

    if (rowCount > 256) {
      // Only index if we have enough data
      // Cast options to any for LanceDB version compatibility
      await this.table.createIndex('vector', {
        config: {
          type: 'IVF_PQ',
          num_partitions: Math.min(256, Math.floor(Math.sqrt(rowCount))),
          num_sub_vectors: Math.min(16, Math.floor(this.dimensions / 8)),
        },
      } as Record<string, unknown>);
      log.info('Reindexed vector store', { rowCount });
    }
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(): Promise<VectorStoreStats> {
    if (!this.table) {
      return {
        totalRecords: 0,
        recordsByType: {
          pattern: 0,
          skill: 0,
          content: 0,
          error: 0,
        },
        tableExists: false,
        dimensions: this.dimensions,
      };
    }

    const totalRecords = await this.table.countRows();

    // Count by entity type using countRows with filter (more efficient and accurate)
    const recordsByType: Record<EntityType, number> = {
      pattern: 0,
      skill: 0,
      content: 0,
      error: 0,
    };

    // Get counts for each type using countRows with filter
    for (const entityType of ['pattern', 'skill', 'content', 'error'] as EntityType[]) {
      recordsByType[entityType] = await this.table.countRows(
        `"entityType" = '${escapeSQL(entityType)}'`
      );
    }

    return {
      totalRecords,
      recordsByType,
      tableExists: true,
      dimensions: this.dimensions,
      lastModified: Date.now(),
    };
  }

  /**
   * Check if the store is using LanceDB
   */
  isUsingLanceDB(): boolean {
    return this.initialized && this.db !== null;
  }

  /**
   * Close the database connection and release resources
   */
  async close(): Promise<void> {
    if (this.db) {
      // LanceDB connection doesn't have an explicit close, but we clear references
      this.db = null;
      this.table = null;
      this.initialized = false;
      log.info('Vector store connection closed');
    }
  }
}

/**
 * Create a VectorStore instance with default options
 */
export function createVectorStore(options: VectorStoreOptions): VectorStore {
  return new VectorStore(options);
}

/**
 * Global vector store instance (singleton)
 */
let globalVectorStore: VectorStore | null = null;

/**
 * Get or create the global vector store (singleton pattern).
 *
 * Note: If the global store already exists, the provided options are ignored
 * and the existing instance is returned. To use different options, call
 * closeVectorStore() first, then call getVectorStore() with new options.
 *
 * @param options - Configuration options (only used when creating new instance)
 * @returns The global VectorStore instance, or null if LanceDB is unavailable
 */
export async function getVectorStore(
  options?: Partial<VectorStoreOptions>
): Promise<VectorStore | null> {
  if (!(await VectorStore.isAvailable())) {
    log.warn('LanceDB not available, vector search disabled');
    return null;
  }

  if (!globalVectorStore) {
    const dbPath = options?.dbPath || './data/vectors';
    globalVectorStore = new VectorStore({
      dbPath,
      tableName: options?.tableName || 'embeddings',
      dimensions: options?.dimensions || 384,
    });
    await globalVectorStore.initialize();
  }

  return globalVectorStore;
}

/**
 * Close the global vector store and release resources.
 * After calling this, getVectorStore() will create a new instance.
 */
export async function closeVectorStore(): Promise<void> {
  if (globalVectorStore) {
    await globalVectorStore.close();
    globalVectorStore = null;
  }
}
