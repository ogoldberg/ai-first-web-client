/**
 * Postgres Embedded Store - PostgreSQL-based Persistence Layer
 *
 * Provides reliable persistent storage using PostgreSQL with Prisma:
 * - ACID transactions for data integrity
 * - Connection pooling for performance
 * - Compatible with cloud-hosted Postgres (Supabase, Railway, etc.)
 *
 * This replaces the SQLite EmbeddedStore for hosted deployments.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

/**
 * Configuration options for PostgresEmbeddedStore
 */
export interface PostgresEmbeddedStoreConfig {
  componentName?: string;
  prisma?: PrismaClient;
}

/**
 * Default configuration
 */
export const DEFAULT_POSTGRES_STORE_CONFIG: Required<Pick<PostgresEmbeddedStoreConfig, 'componentName'>> = {
  componentName: 'PostgresEmbeddedStore',
};

/**
 * Store statistics
 */
interface StoreStats {
  reads: number;
  writes: number;
  failures: number;
  lastOperationTime: number | null;
  totalRecords?: number;
}

/**
 * PostgresEmbeddedStore - Prisma-based persistent storage
 *
 * Provides namespaced key-value storage with:
 * - Atomic operations via Postgres transactions
 * - Connection pooling
 * - Cloud deployment support
 */
export class PostgresEmbeddedStore {
  private config: Required<Pick<PostgresEmbeddedStoreConfig, 'componentName'>> & PostgresEmbeddedStoreConfig;
  private prisma: PrismaClient;
  private ownsPrisma: boolean;
  private initialized = false;
  private stats: StoreStats;

  constructor(config: PostgresEmbeddedStoreConfig = {}) {
    this.config = { ...DEFAULT_POSTGRES_STORE_CONFIG, ...config };
    this.stats = {
      reads: 0,
      writes: 0,
      failures: 0,
      lastOperationTime: null,
    };

    // Use provided Prisma client or create our own
    if (config.prisma) {
      this.prisma = config.prisma;
      this.ownsPrisma = false;
    } else {
      this.prisma = new PrismaClient();
      this.ownsPrisma = true;
    }
  }

  /**
   * Check if Postgres is available (DATABASE_URL is set)
   */
  static isAvailable(): boolean {
    return !!process.env.DATABASE_URL;
  }

  /**
   * Initialize the store (must be called before use)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const log = logger.server.child({ component: this.config.componentName });

    try {
      // Test connection
      await this.prisma.$connect();
      this.initialized = true;
      log.info('PostgreSQL store initialized');
    } catch (error) {
      log.error('Failed to initialize PostgreSQL store', { error });
      throw error;
    }
  }

  /**
   * Get a value from the store
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    try {
      const record = await this.prisma.keyValue.findUnique({
        where: {
          tenantId_namespace_key: { tenantId: 'default', namespace, key },
        },
      });

      if (record) {
        return JSON.parse(record.value) as T;
      }
      return null;
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to get value', { namespace, key, error });
      return null;
    }
  }

  /**
   * Set a value in the store
   */
  async set<T>(namespace: string, key: string, value: T): Promise<void> {
    this.ensureInitialized();
    this.stats.writes++;
    this.stats.lastOperationTime = Date.now();

    try {
      await this.prisma.keyValue.upsert({
        where: {
          tenantId_namespace_key: { tenantId: 'default', namespace, key },
        },
        update: {
          value: JSON.stringify(value),
        },
        create: {
          tenantId: 'default',
          namespace,
          key,
          value: JSON.stringify(value),
        },
      });
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to set value', { namespace, key, error });
      throw error;
    }
  }

  /**
   * Delete a value from the store
   */
  async delete(namespace: string, key: string): Promise<boolean> {
    this.ensureInitialized();
    this.stats.writes++;
    this.stats.lastOperationTime = Date.now();

    try {
      await this.prisma.keyValue.delete({
        where: {
          tenantId_namespace_key: { tenantId: 'default', namespace, key },
        },
      });
      return true;
    } catch (error) {
      // Prisma throws if record doesn't exist
      if ((error as { code?: string }).code === 'P2025') {
        return false;
      }
      this.stats.failures++;
      logger.server.error('Failed to delete value', { namespace, key, error });
      return false;
    }
  }

  /**
   * Get all keys in a namespace
   */
  async keys(namespace: string): Promise<string[]> {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    try {
      const records = await this.prisma.keyValue.findMany({
        where: { namespace },
        select: { key: true },
      });
      return records.map((r: { key: string }) => r.key);
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to get keys', { namespace, error });
      return [];
    }
  }

  /**
   * Get all entries in a namespace
   */
  async getAll<T>(namespace: string): Promise<Map<string, T>> {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    const result = new Map<string, T>();

    try {
      const records = await this.prisma.keyValue.findMany({
        where: { namespace },
      });

      for (const record of records) {
        result.set(record.key, JSON.parse(record.value) as T);
      }
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to get all', { namespace, error });
    }

    return result;
  }

  /**
   * Clear all entries in a namespace
   */
  async clear(namespace: string): Promise<void> {
    this.ensureInitialized();
    this.stats.writes++;
    this.stats.lastOperationTime = Date.now();

    try {
      await this.prisma.keyValue.deleteMany({
        where: { namespace },
      });
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to clear namespace', { namespace, error });
      throw error;
    }
  }

  /**
   * Check if a key exists
   */
  async has(namespace: string, key: string): Promise<boolean> {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    try {
      const count = await this.prisma.keyValue.count({
        where: { namespace, key },
      });
      return count > 0;
    } catch (error) {
      this.stats.failures++;
      return false;
    }
  }

  /**
   * Count entries in a namespace
   */
  async count(namespace: string): Promise<number> {
    this.ensureInitialized();
    this.stats.reads++;

    try {
      return await this.prisma.keyValue.count({
        where: { namespace },
      });
    } catch (error) {
      this.stats.failures++;
      return 0;
    }
  }

  /**
   * Run multiple operations in a transaction
   */
  async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    this.ensureInitialized();
    return this.prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      return fn(tx as PrismaClient);
    });
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<StoreStats> {
    try {
      const totalRecords = await this.prisma.keyValue.count();
      return { ...this.stats, totalRecords };
    } catch {
      return { ...this.stats };
    }
  }

  /**
   * Flush any pending writes (no-op for Postgres, writes are immediate)
   */
  async flush(): Promise<void> {
    // Postgres writes are immediate, nothing to flush
  }

  /**
   * Close the store
   */
  async close(): Promise<void> {
    if (this.ownsPrisma) {
      await this.prisma.$disconnect();
    }
    this.initialized = false;
  }

  /**
   * Migrate data from SQLite EmbeddedStore to Postgres
   */
  async migrateFromSqlite<T>(sqliteData: Map<string, Map<string, T>>): Promise<{ migrated: number; skipped: number }> {
    const log = logger.server.child({ component: this.config.componentName });
    let migrated = 0;
    let skipped = 0;

    for (const [namespace, entries] of sqliteData.entries()) {
      for (const [key, value] of entries.entries()) {
        const exists = await this.has(namespace, key);
        if (!exists) {
          await this.set(namespace, key, value);
          migrated++;
        } else {
          skipped++;
        }
      }
    }

    log.info('Migrated data from SQLite', { migrated, skipped });
    return { migrated, skipped };
  }

  /**
   * Get the Prisma client (for advanced use cases)
   */
  getPrismaClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * Ensure the store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PostgresEmbeddedStore not initialized. Call initialize() first.');
    }
  }
}

/**
 * Singleton instance for shared store access
 */
let globalStore: PostgresEmbeddedStore | null = null;

/**
 * Get the global Postgres store instance
 */
export function getPostgresEmbeddedStore(config?: PostgresEmbeddedStoreConfig): PostgresEmbeddedStore {
  if (!globalStore) {
    globalStore = new PostgresEmbeddedStore(config);
  }
  return globalStore;
}

/**
 * Initialize the global store (call once at startup)
 */
export async function initializePostgresEmbeddedStore(config?: PostgresEmbeddedStoreConfig): Promise<PostgresEmbeddedStore> {
  const store = getPostgresEmbeddedStore(config);
  await store.initialize();
  return store;
}

/**
 * Close the global store (call at shutdown)
 */
export async function closePostgresEmbeddedStore(): Promise<void> {
  if (globalStore) {
    await globalStore.close();
    globalStore = null;
  }
}

/**
 * Create a namespaced store wrapper for a specific component
 *
 * This provides a simpler API for components that only use one namespace.
 */
export class NamespacedPostgresStore<T> {
  private store: PostgresEmbeddedStore;
  private namespace: string;

  constructor(store: PostgresEmbeddedStore, namespace: string) {
    this.store = store;
    this.namespace = namespace;
  }

  async get(key: string): Promise<T | null> {
    return this.store.get<T>(this.namespace, key);
  }

  async set(key: string, value: T): Promise<void> {
    return this.store.set(this.namespace, key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(this.namespace, key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(this.namespace, key);
  }

  async keys(): Promise<string[]> {
    return this.store.keys(this.namespace);
  }

  async getAll(): Promise<Map<string, T>> {
    return this.store.getAll<T>(this.namespace);
  }

  async clear(): Promise<void> {
    return this.store.clear(this.namespace);
  }

  async count(): Promise<number> {
    return this.store.count(this.namespace);
  }
}

/**
 * Create a new PostgresEmbeddedStore instance
 *
 * Use this factory when you need a separate store instance.
 * For shared access, use getPostgresEmbeddedStore() instead.
 */
export function createPostgresEmbeddedStore(config: PostgresEmbeddedStoreConfig = {}): PostgresEmbeddedStore {
  return new PostgresEmbeddedStore(config);
}
