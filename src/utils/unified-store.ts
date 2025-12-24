/**
 * Unified Store - Abstract interface over SQLite and Postgres backends
 *
 * Provides a consistent interface that works with both:
 * - SQLite EmbeddedStore (local development)
 * - PostgreSQL PostgresEmbeddedStore (hosted deployments)
 *
 * Also provides unified vector store access:
 * - LanceDB VectorStore (local development)
 * - pgvector PostgresVectorStore (hosted deployments)
 */

import { logger } from './logger.js';
import { detectStorageBackend, getDatabaseConfig, getPrismaClient } from './database-config.js';

// SQLite backend
import { createEmbeddedStore, EmbeddedStore } from './embedded-store.js';
import { VectorStore, getVectorStore } from './vector-store.js';

// Postgres backend
import {
  createPostgresEmbeddedStore,
  PostgresEmbeddedStore,
} from './postgres-embedded-store.js';
import {
  PostgresVectorStore,
  createPostgresVectorStore,
  VectorSearchResult,
  VectorSearchFilter,
  VectorSearchOptions,
  EmbeddingRecord,
  VectorStoreStats,
} from './postgres-vector-store.js';

const log = logger.create('UnifiedStore');

/**
 * Unified key-value store interface
 */
export interface IKeyValueStore {
  initialize(): Promise<void>;
  get<T>(namespace: string, key: string): Promise<T | null> | T | null;
  set<T>(namespace: string, key: string, value: T): Promise<void> | void;
  delete(namespace: string, key: string): Promise<boolean> | boolean;
  has(namespace: string, key: string): Promise<boolean> | boolean;
  keys(namespace: string): Promise<string[]> | string[];
  getAll<T>(namespace: string): Promise<Map<string, T>> | Map<string, T>;
  clear(namespace: string): Promise<void> | void;
  count(namespace: string): Promise<number> | number;
  close(): Promise<void>;
}

/**
 * Unified vector store interface
 */
export interface IVectorStore {
  initialize(): Promise<void>;
  add(record: EmbeddingRecord): Promise<void>;
  addBatch(records: EmbeddingRecord[]): Promise<void>;
  search(vector: number[] | Float32Array, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  searchFiltered(
    vector: number[] | Float32Array,
    filter: VectorSearchFilter,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;
  get(id: string): Promise<EmbeddingRecord | null>;
  delete(id: string): Promise<boolean>;
  deleteByFilter(filter: VectorSearchFilter): Promise<number>;
  getStats(): Promise<VectorStoreStats>;
  close(): Promise<void>;
}

/**
 * Unified store combining key-value and vector stores
 */
export interface UnifiedStore {
  keyValue: IKeyValueStore;
  vector: IVectorStore | null;
  backend: 'sqlite' | 'postgres';
  close(): Promise<void>;
}

/**
 * Global unified store instance
 */
let globalUnifiedStore: UnifiedStore | null = null;

/**
 * SQLite adapter - wraps EmbeddedStore to match IKeyValueStore interface
 */
class SqliteKeyValueAdapter implements IKeyValueStore {
  constructor(private store: EmbeddedStore) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  get<T>(namespace: string, key: string): T | null {
    return this.store.get<T>(namespace, key);
  }

  set<T>(namespace: string, key: string, value: T): void {
    this.store.set(namespace, key, value);
  }

  delete(namespace: string, key: string): boolean {
    return this.store.delete(namespace, key);
  }

  has(namespace: string, key: string): boolean {
    return this.store.has(namespace, key);
  }

  keys(namespace: string): string[] {
    return this.store.keys(namespace);
  }

  getAll<T>(namespace: string): Map<string, T> {
    return this.store.getAll<T>(namespace);
  }

  clear(namespace: string): void {
    this.store.clear(namespace);
  }

  count(namespace: string): number {
    return this.store.count(namespace);
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

/**
 * LanceDB adapter - wraps VectorStore to match IVectorStore interface
 */
class LanceDbVectorAdapter implements IVectorStore {
  constructor(private store: VectorStore) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async add(record: EmbeddingRecord): Promise<void> {
    await this.store.add(record);
  }

  async addBatch(records: EmbeddingRecord[]): Promise<void> {
    await this.store.addBatch(records);
  }

  async search(vector: number[] | Float32Array, options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    return this.store.search(vector, options);
  }

  async searchFiltered(
    vector: number[] | Float32Array,
    filter: VectorSearchFilter,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    return this.store.searchFiltered(vector, filter, options);
  }

  async get(id: string): Promise<EmbeddingRecord | null> {
    return this.store.get(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async deleteByFilter(filter: VectorSearchFilter): Promise<number> {
    return this.store.deleteByFilter(filter);
  }

  async getStats(): Promise<VectorStoreStats> {
    return this.store.getStats();
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

/**
 * Postgres adapter - wraps PostgresEmbeddedStore to match IKeyValueStore interface
 */
class PostgresKeyValueAdapter implements IKeyValueStore {
  constructor(private store: PostgresEmbeddedStore) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async get<T>(namespace: string, key: string): Promise<T | null> {
    return this.store.get<T>(namespace, key);
  }

  async set<T>(namespace: string, key: string, value: T): Promise<void> {
    await this.store.set(namespace, key, value);
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    return this.store.delete(namespace, key);
  }

  async has(namespace: string, key: string): Promise<boolean> {
    return this.store.has(namespace, key);
  }

  async keys(namespace: string): Promise<string[]> {
    return this.store.keys(namespace);
  }

  async getAll<T>(namespace: string): Promise<Map<string, T>> {
    return this.store.getAll<T>(namespace);
  }

  async clear(namespace: string): Promise<void> {
    await this.store.clear(namespace);
  }

  async count(namespace: string): Promise<number> {
    return this.store.count(namespace);
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

/**
 * pgvector adapter - wraps PostgresVectorStore to match IVectorStore interface
 */
class PgvectorAdapter implements IVectorStore {
  constructor(private store: PostgresVectorStore) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async add(record: EmbeddingRecord): Promise<void> {
    await this.store.add(record);
  }

  async addBatch(records: EmbeddingRecord[]): Promise<void> {
    await this.store.addBatch(records);
  }

  async search(vector: number[] | Float32Array, options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    return this.store.search(vector, options);
  }

  async searchFiltered(
    vector: number[] | Float32Array,
    filter: VectorSearchFilter,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    return this.store.searchFiltered(vector, filter, options);
  }

  async get(id: string): Promise<EmbeddingRecord | null> {
    return this.store.get(id);
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async deleteByFilter(filter: VectorSearchFilter): Promise<number> {
    return this.store.deleteByFilter(filter);
  }

  async getStats(): Promise<VectorStoreStats> {
    return this.store.getStats();
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

/**
 * Create and initialize a unified store based on environment configuration
 */
export async function createUnifiedStore(): Promise<UnifiedStore> {
  const backend = detectStorageBackend();
  const config = getDatabaseConfig();

  log.info('Creating unified store', { backend });

  if (backend === 'postgres') {
    // Use Postgres backends
    const prisma = await getPrismaClient();
    if (!prisma) {
      throw new Error('Failed to get Prisma client for Postgres backend');
    }

    // Create key-value store
    const postgresStore = createPostgresEmbeddedStore({ prisma });
    await postgresStore.initialize();
    const keyValue = new PostgresKeyValueAdapter(postgresStore);

    // Create vector store (may fail if pgvector not available)
    let vector: IVectorStore | null = null;
    try {
      const isAvailable = await PostgresVectorStore.isAvailable(prisma);
      if (isAvailable) {
        const pgVectorStore = createPostgresVectorStore({ prisma });
        await pgVectorStore.initialize();
        vector = new PgvectorAdapter(pgVectorStore);
        log.info('pgvector store initialized');
      } else {
        log.warn('pgvector not available, vector search disabled');
      }
    } catch (error) {
      log.warn('Failed to initialize pgvector store', { error });
    }

    return {
      keyValue,
      vector,
      backend: 'postgres',
      async close() {
        await keyValue.close();
        if (vector) {
          await vector.close();
        }
      },
    };
  } else {
    // Use SQLite/LanceDB backends
    const sqlitePath = (config as { sqlitePath?: string }).sqlitePath || './data/llm-browser.db';
    const vectorDbPath = (config as { vectorDbPath?: string }).vectorDbPath || './data/vectors';

    // Create key-value store
    const sqliteStore = createEmbeddedStore({
      dbPath: sqlitePath,
      allowJsonFallback: true,
      componentName: 'UnifiedStore',
      walMode: true,
    });
    await sqliteStore.initialize();
    const keyValue = new SqliteKeyValueAdapter(sqliteStore);

    // Create vector store (may fail if LanceDB not available)
    let vector: IVectorStore | null = null;
    try {
      const isAvailable = await VectorStore.isAvailable();
      if (isAvailable) {
        const lanceStore = await getVectorStore({
          dbPath: vectorDbPath,
          dimensions: 384,
        });
        if (lanceStore) {
          vector = new LanceDbVectorAdapter(lanceStore);
          log.info('LanceDB store initialized');
        }
      } else {
        log.warn('LanceDB not available, vector search disabled');
      }
    } catch (error) {
      log.warn('Failed to initialize LanceDB store', { error });
    }

    return {
      keyValue,
      vector,
      backend: 'sqlite',
      async close() {
        await keyValue.close();
        if (vector) {
          await vector.close();
        }
      },
    };
  }
}

/**
 * Get or create the global unified store
 */
export async function getUnifiedStore(): Promise<UnifiedStore> {
  if (!globalUnifiedStore) {
    globalUnifiedStore = await createUnifiedStore();
  }
  return globalUnifiedStore;
}

/**
 * Close the global unified store
 */
export async function closeUnifiedStore(): Promise<void> {
  if (globalUnifiedStore) {
    await globalUnifiedStore.close();
    globalUnifiedStore = null;
    log.info('Unified store closed');
  }
}
