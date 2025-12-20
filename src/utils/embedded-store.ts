/**
 * Embedded Store - SQLite-based Persistence Layer (CX-007)
 *
 * Provides reliable persistent storage using SQLite with:
 * - ACID transactions for data integrity
 * - Concurrent read access without corruption
 * - Automatic migration from JSON files
 * - Optional fallback to JSON if SQLite is unavailable
 *
 * Schema:
 * - key_value: Generic key-value storage with namespaces
 * - Designed for future expansion (sessions, patterns, skills tables)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { logger } from './logger.js';

/** Type for better-sqlite3 database when available */
type BetterSqlite3Database = {
  prepare: (sql: string) => {
    run: (...params: unknown[]) => { changes: number };
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  pragma: (pragma: string, simplify?: boolean) => unknown;
  transaction: <T>(fn: () => T) => () => T;
  close: () => void;
};

/** Execute SQL without returning results */
type DatabaseExec = (sql: string) => void;

/** Type for better-sqlite3 constructor */
type BetterSqlite3Constructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }
) => BetterSqlite3Database & { exec: DatabaseExec };

/**
 * Configuration for EmbeddedStore
 */
export interface EmbeddedStoreConfig {
  /** Path to the SQLite database file */
  dbPath: string;

  /** Whether to use JSON fallback if SQLite is unavailable */
  allowJsonFallback: boolean;

  /** Component name for logging */
  componentName: string;

  /** Enable WAL mode for better concurrent read performance */
  walMode: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_EMBEDDED_STORE_CONFIG: EmbeddedStoreConfig = {
  dbPath: './llm-browser.db',
  allowJsonFallback: true,
  componentName: 'EmbeddedStore',
  walMode: true,
};

/**
 * Statistics about store operations
 */
export interface EmbeddedStoreStats {
  /** Whether SQLite is being used (vs JSON fallback) */
  usingSqlite: boolean;

  /** Total read operations */
  reads: number;

  /** Total write operations */
  writes: number;

  /** Failed operations */
  failures: number;

  /** Last operation timestamp */
  lastOperationTime: number | null;

  /** Database file size in bytes (SQLite only) */
  dbSizeBytes: number | null;
}

/**
 * Row structure for key_value table
 */
interface KeyValueRow {
  namespace: string;
  key: string;
  value: string;
  updated_at: number;
}

/**
 * EmbeddedStore - SQLite-based persistent storage
 *
 * Provides namespaced key-value storage with:
 * - Atomic operations via SQLite transactions
 * - Automatic JSON fallback if SQLite is unavailable
 * - Migration from existing JSON files
 */
export class EmbeddedStore {
  private config: EmbeddedStoreConfig;
  private db: (BetterSqlite3Database & { exec: DatabaseExec }) | null = null;
  private usingSqlite = false;
  private initialized = false;
  private stats: EmbeddedStoreStats;

  // JSON fallback storage (in-memory cache + file)
  private jsonCache: Map<string, Map<string, unknown>> = new Map();
  private jsonDirty = false;
  private jsonSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<EmbeddedStoreConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDED_STORE_CONFIG, ...config };
    this.stats = {
      usingSqlite: false,
      reads: 0,
      writes: 0,
      failures: 0,
      lastOperationTime: null,
      dbSizeBytes: null,
    };
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
      // Try to load better-sqlite3
      const Database = await this.loadBetterSqlite3();

      if (Database) {
        // Create parent directories if needed
        const dir = path.dirname(this.config.dbPath);
        await fs.mkdir(dir, { recursive: true });

        // Open database
        this.db = new Database(this.config.dbPath);
        this.usingSqlite = true;
        this.stats.usingSqlite = true;

        // Configure SQLite for optimal performance
        if (this.config.walMode) {
          this.db.pragma('journal_mode = WAL');
        }
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = -64000'); // 64MB cache
        this.db.pragma('temp_store = MEMORY');

        // Create schema
        this.createSchema();

        log.info('SQLite store initialized', { dbPath: this.config.dbPath });
      } else if (this.config.allowJsonFallback) {
        log.warn('better-sqlite3 not available, using JSON fallback');
        await this.initJsonFallback();
      } else {
        throw new Error('better-sqlite3 not available and JSON fallback disabled');
      }

      this.initialized = true;
    } catch (error) {
      log.error('Failed to initialize store', { error });

      if (this.config.allowJsonFallback && !this.usingSqlite) {
        log.warn('Falling back to JSON storage');
        await this.initJsonFallback();
        this.initialized = true;
      } else {
        throw error;
      }
    }
  }

  /**
   * Load better-sqlite3 dynamically
   */
  private async loadBetterSqlite3(): Promise<BetterSqlite3Constructor | null> {
    try {
      // Dynamic import to make it optional
      const module = await import('better-sqlite3');
      return module.default as BetterSqlite3Constructor;
    } catch {
      return null;
    }
  }

  /**
   * Create the database schema
   */
  private createSchema(): void {
    if (!this.db) return;

    const schemaSQL = `
      -- Key-value store with namespaces
      CREATE TABLE IF NOT EXISTS key_value (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, key)
      );

      -- Index for namespace lookups
      CREATE INDEX IF NOT EXISTS idx_key_value_namespace
        ON key_value(namespace);

      -- Migrations tracking
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      -- Store metadata
      CREATE TABLE IF NOT EXISTS store_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;

    this.db.exec(schemaSQL);

    // Record schema version
    const insertMeta = this.db.prepare(
      'INSERT OR REPLACE INTO store_metadata (key, value) VALUES (?, ?)'
    );
    insertMeta.run('schema_version', '1.0');
    insertMeta.run('created_at', String(Date.now()));
  }

  /**
   * Initialize JSON fallback storage
   */
  private async initJsonFallback(): Promise<void> {
    const jsonPath = this.config.dbPath.replace(/\.db$/, '.json');

    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, Record<string, unknown>>;

      for (const [namespace, entries] of Object.entries(data)) {
        const nsMap = new Map<string, unknown>();
        for (const [key, value] of Object.entries(entries)) {
          nsMap.set(key, value);
        }
        this.jsonCache.set(namespace, nsMap);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.server.warn('Failed to load JSON fallback', { error });
      }
    }
  }

  /**
   * Save JSON fallback storage (debounced)
   */
  private scheduleJsonSave(): void {
    if (!this.jsonDirty) {
      this.jsonDirty = true;
    }

    if (this.jsonSaveTimer) {
      clearTimeout(this.jsonSaveTimer);
    }

    this.jsonSaveTimer = setTimeout(async () => {
      await this.saveJsonFallback();
    }, 1000);
  }

  /**
   * Actually save JSON fallback to disk
   */
  private async saveJsonFallback(): Promise<void> {
    if (!this.jsonDirty) return;

    const jsonPath = this.config.dbPath.replace(/\.db$/, '.json');
    const data: Record<string, Record<string, unknown>> = {};

    for (const [namespace, entries] of this.jsonCache.entries()) {
      data[namespace] = Object.fromEntries(entries);
    }

    const dir = path.dirname(jsonPath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${jsonPath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, jsonPath);

    this.jsonDirty = false;
  }

  /**
   * Get a value from the store
   */
  get<T>(namespace: string, key: string): T | null {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare(
          'SELECT value FROM key_value WHERE namespace = ? AND key = ?'
        );
        const row = stmt.get(namespace, key) as { value: string } | undefined;

        if (row) {
          return JSON.parse(row.value) as T;
        }
        return null;
      } else {
        const nsMap = this.jsonCache.get(namespace);
        if (nsMap) {
          return (nsMap.get(key) as T) ?? null;
        }
        return null;
      }
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to get value', { namespace, key, error });
      return null;
    }
  }

  /**
   * Set a value in the store
   */
  set<T>(namespace: string, key: string, value: T): void {
    this.ensureInitialized();
    this.stats.writes++;
    this.stats.lastOperationTime = Date.now();

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO key_value (namespace, key, value, updated_at)
          VALUES (?, ?, ?, ?)
        `);
        stmt.run(namespace, key, JSON.stringify(value), Date.now());
      } else {
        let nsMap = this.jsonCache.get(namespace);
        if (!nsMap) {
          nsMap = new Map();
          this.jsonCache.set(namespace, nsMap);
        }
        nsMap.set(key, value);
        this.scheduleJsonSave();
      }
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to set value', { namespace, key, error });
      throw error;
    }
  }

  /**
   * Delete a value from the store
   */
  delete(namespace: string, key: string): boolean {
    this.ensureInitialized();
    this.stats.writes++;
    this.stats.lastOperationTime = Date.now();

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare(
          'DELETE FROM key_value WHERE namespace = ? AND key = ?'
        );
        const result = stmt.run(namespace, key);
        return result.changes > 0;
      } else {
        const nsMap = this.jsonCache.get(namespace);
        if (nsMap) {
          const deleted = nsMap.delete(key);
          if (deleted) {
            this.scheduleJsonSave();
          }
          return deleted;
        }
        return false;
      }
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to delete value', { namespace, key, error });
      return false;
    }
  }

  /**
   * Get all keys in a namespace
   */
  keys(namespace: string): string[] {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare(
          'SELECT key FROM key_value WHERE namespace = ?'
        );
        const rows = stmt.all(namespace) as { key: string }[];
        return rows.map((r) => r.key);
      } else {
        const nsMap = this.jsonCache.get(namespace);
        return nsMap ? Array.from(nsMap.keys()) : [];
      }
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to get keys', { namespace, error });
      return [];
    }
  }

  /**
   * Get all entries in a namespace
   */
  getAll<T>(namespace: string): Map<string, T> {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    const result = new Map<string, T>();

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare(
          'SELECT key, value FROM key_value WHERE namespace = ?'
        );
        const rows = stmt.all(namespace) as KeyValueRow[];

        for (const row of rows) {
          result.set(row.key, JSON.parse(row.value) as T);
        }
      } else {
        const nsMap = this.jsonCache.get(namespace);
        if (nsMap) {
          for (const [key, value] of nsMap.entries()) {
            result.set(key, value as T);
          }
        }
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
  clear(namespace: string): void {
    this.ensureInitialized();
    this.stats.writes++;
    this.stats.lastOperationTime = Date.now();

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare('DELETE FROM key_value WHERE namespace = ?');
        stmt.run(namespace);
      } else {
        this.jsonCache.delete(namespace);
        this.scheduleJsonSave();
      }
    } catch (error) {
      this.stats.failures++;
      logger.server.error('Failed to clear namespace', { namespace, error });
      throw error;
    }
  }

  /**
   * Check if a key exists
   */
  has(namespace: string, key: string): boolean {
    this.ensureInitialized();
    this.stats.reads++;
    this.stats.lastOperationTime = Date.now();

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare(
          'SELECT 1 FROM key_value WHERE namespace = ? AND key = ?'
        );
        return stmt.get(namespace, key) !== undefined;
      } else {
        const nsMap = this.jsonCache.get(namespace);
        return nsMap?.has(key) ?? false;
      }
    } catch (error) {
      this.stats.failures++;
      return false;
    }
  }

  /**
   * Count entries in a namespace
   */
  count(namespace: string): number {
    this.ensureInitialized();
    this.stats.reads++;

    try {
      if (this.usingSqlite && this.db) {
        const stmt = this.db.prepare(
          'SELECT COUNT(*) as count FROM key_value WHERE namespace = ?'
        );
        const row = stmt.get(namespace) as { count: number };
        return row.count;
      } else {
        return this.jsonCache.get(namespace)?.size ?? 0;
      }
    } catch (error) {
      this.stats.failures++;
      return 0;
    }
  }

  /**
   * Run multiple operations in a transaction (SQLite only)
   * Falls back to sequential running for JSON storage
   */
  transaction<T>(fn: () => T): T {
    this.ensureInitialized();

    if (this.usingSqlite && this.db) {
      const txn = this.db.transaction(fn);
      return txn();
    } else {
      // JSON fallback doesn't support true transactions
      return fn();
    }
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<EmbeddedStoreStats> {
    if (this.usingSqlite) {
      try {
        const stat = await fs.stat(this.config.dbPath);
        this.stats.dbSizeBytes = stat.size;
      } catch {
        this.stats.dbSizeBytes = null;
      }
    }

    return { ...this.stats };
  }

  /**
   * Check if using SQLite
   */
  isUsingSqlite(): boolean {
    return this.usingSqlite;
  }

  /**
   * Get the database path
   */
  getDbPath(): string {
    return this.config.dbPath;
  }

  /**
   * Flush any pending writes (for graceful shutdown)
   */
  async flush(): Promise<void> {
    if (!this.usingSqlite) {
      if (this.jsonSaveTimer) {
        clearTimeout(this.jsonSaveTimer);
        this.jsonSaveTimer = null;
      }
      await this.saveJsonFallback();
    }
    // SQLite writes are synchronous, nothing to flush
  }

  /**
   * Close the store
   */
  async close(): Promise<void> {
    await this.flush();

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.initialized = false;
  }

  /**
   * Migrate data from a JSON file to this store
   */
  async migrateFromJson<T>(
    jsonPath: string,
    namespace: string,
    transform?: (data: T) => Map<string, unknown>
  ): Promise<{ migrated: number; skipped: number }> {
    const log = logger.server.child({ component: this.config.componentName });
    let migrated = 0;
    let skipped = 0;

    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(content) as T;

      if (transform) {
        const entries = transform(data);
        for (const [key, value] of entries) {
          if (!this.has(namespace, key)) {
            this.set(namespace, key, value);
            migrated++;
          } else {
            skipped++;
          }
        }
      } else if (typeof data === 'object' && data !== null) {
        // Default: treat as key-value object
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
          if (!this.has(namespace, key)) {
            this.set(namespace, key, value);
            migrated++;
          } else {
            skipped++;
          }
        }
      }

      log.info('Migrated data from JSON', {
        jsonPath,
        namespace,
        migrated,
        skipped,
      });

      // Optionally rename the old file
      const backupPath = `${jsonPath}.migrated`;
      await fs.rename(jsonPath, backupPath);
      log.info('Renamed migrated JSON file', { from: jsonPath, to: backupPath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, nothing to migrate
        return { migrated: 0, skipped: 0 };
      }
      log.error('Failed to migrate from JSON', { jsonPath, error });
      throw error;
    }

    return { migrated, skipped };
  }

  /**
   * Ensure the store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'EmbeddedStore not initialized. Call initialize() first.'
      );
    }
  }
}

/**
 * Singleton instance for shared store access
 */
let globalStore: EmbeddedStore | null = null;

/**
 * Get the global embedded store instance
 */
export function getEmbeddedStore(config?: Partial<EmbeddedStoreConfig>): EmbeddedStore {
  if (!globalStore) {
    globalStore = new EmbeddedStore(config);
  }
  return globalStore;
}

/**
 * Initialize the global store (call once at startup)
 */
export async function initializeEmbeddedStore(
  config?: Partial<EmbeddedStoreConfig>
): Promise<EmbeddedStore> {
  const store = getEmbeddedStore(config);
  await store.initialize();
  return store;
}

/**
 * Close the global store (call at shutdown)
 */
export async function closeEmbeddedStore(): Promise<void> {
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
export class NamespacedStore<T> {
  private store: EmbeddedStore;
  private namespace: string;

  constructor(store: EmbeddedStore, namespace: string) {
    this.store = store;
    this.namespace = namespace;
  }

  get(key: string): T | null {
    return this.store.get<T>(this.namespace, key);
  }

  set(key: string, value: T): void {
    this.store.set(this.namespace, key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(this.namespace, key);
  }

  has(key: string): boolean {
    return this.store.has(this.namespace, key);
  }

  keys(): string[] {
    return this.store.keys(this.namespace);
  }

  getAll(): Map<string, T> {
    return this.store.getAll<T>(this.namespace);
  }

  clear(): void {
    this.store.clear(this.namespace);
  }

  count(): number {
    return this.store.count(this.namespace);
  }
}
