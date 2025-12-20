/**
 * SQLite-backed PersistentStore (CX-007)
 *
 * A drop-in replacement for PersistentStore that uses SQLite instead of JSON files.
 * Provides the same API for gradual migration of existing components.
 *
 * Usage:
 *   // Before (JSON-based):
 *   const store = new PersistentStore<MyData>('./data.json');
 *
 *   // After (SQLite-based):
 *   const store = new SqlitePersistentStore<MyData>('./data.json', 'mydata');
 *
 * The SqlitePersistentStore will:
 * - Automatically migrate existing JSON data to SQLite on first use
 * - Store data in the shared EmbeddedStore database
 * - Provide the same save/load/flush API as PersistentStore
 */

import {
  EmbeddedStore,
  getEmbeddedStore,
  initializeEmbeddedStore,
} from './embedded-store.js';
import { logger } from './logger.js';
import type { PersistentStoreStats } from './persistent-store.js';

/**
 * Configuration for SqlitePersistentStore
 */
export interface SqlitePersistentStoreConfig {
  /** Namespace in the SQLite store (defaults to filename without extension) */
  namespace?: string;

  /** Key to use for the data (defaults to '_data' for single-object stores) */
  key?: string;

  /** Component name for logging */
  componentName?: string;

  /** Path to the shared SQLite database (defaults to ./llm-browser.db) */
  dbPath?: string;

  /** Whether to auto-migrate from JSON file (defaults to true) */
  autoMigrate?: boolean;
}

/**
 * SqlitePersistentStore - SQLite-backed replacement for PersistentStore
 *
 * Provides the same API as PersistentStore but stores data in SQLite.
 * Automatically migrates from existing JSON files.
 */
export class SqlitePersistentStore<T> {
  private jsonFilePath: string;
  private namespace: string;
  private key: string;
  private componentName: string;
  private dbPath: string;
  private autoMigrate: boolean;
  private store: EmbeddedStore | null = null;
  private initialized = false;
  private stats: PersistentStoreStats;

  constructor(jsonFilePath: string, config: SqlitePersistentStoreConfig = {}) {
    this.jsonFilePath = jsonFilePath;

    // Extract namespace from filename if not provided
    const filename = jsonFilePath.split('/').pop() || jsonFilePath;
    const baseName = filename.replace(/\.json$/, '');

    this.namespace = config.namespace || baseName;
    this.key = config.key || '_data';
    this.componentName = config.componentName || `SqlitePersistentStore:${baseName}`;
    this.dbPath = config.dbPath || './llm-browser.db';
    this.autoMigrate = config.autoMigrate !== false;

    this.stats = {
      saveRequests: 0,
      actualWrites: 0,
      failedWrites: 0,
      debouncedSkips: 0,
      lastWriteTime: null,
      lastError: null,
    };
  }

  /**
   * Get the original JSON file path (for compatibility)
   */
  getFilePath(): string {
    return this.jsonFilePath;
  }

  /**
   * Get store statistics
   */
  getStats(): PersistentStoreStats {
    return { ...this.stats };
  }

  /**
   * Initialize the store and migrate if needed
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const log = logger.server.child({ component: this.componentName });

    try {
      // Get or create the shared EmbeddedStore
      this.store = getEmbeddedStore({ dbPath: this.dbPath });

      // Initialize if not already done
      if (!this.store.isUsingSqlite() && !this.store.getDbPath()) {
        await initializeEmbeddedStore({ dbPath: this.dbPath });
        this.store = getEmbeddedStore();
      }

      // Ensure the store is initialized
      try {
        // Try a simple operation to check if initialized
        this.store.count(this.namespace);
      } catch {
        // Not initialized yet, initialize now
        await this.store.initialize();
      }

      // Auto-migrate from JSON if enabled and data exists
      if (this.autoMigrate) {
        await this.migrateFromJson();
      }

      this.initialized = true;
      log.debug('SqlitePersistentStore initialized', {
        namespace: this.namespace,
        usingSqlite: this.store.isUsingSqlite(),
      });
    } catch (error) {
      log.error('Failed to initialize SqlitePersistentStore', { error });
      throw error;
    }
  }

  /**
   * Migrate data from the original JSON file
   */
  private async migrateFromJson(): Promise<void> {
    if (!this.store) return;

    const log = logger.server.child({ component: this.componentName });

    try {
      // Check if we already have data in SQLite
      if (this.store.has(this.namespace, this.key)) {
        log.debug('Data already migrated, skipping', { namespace: this.namespace });
        return;
      }

      // Try to migrate the JSON file
      const result = await this.store.migrateFromJson<T>(
        this.jsonFilePath,
        this.namespace,
        (data) => {
          // Store the entire object under our key
          const map = new Map<string, unknown>();
          map.set(this.key, data);
          return map;
        }
      );

      if (result.migrated > 0) {
        log.info('Migrated data from JSON to SQLite', {
          jsonPath: this.jsonFilePath,
          namespace: this.namespace,
        });
      }
    } catch (error) {
      // Migration failure is not fatal - we'll start fresh
      log.warn('JSON migration failed, starting fresh', { error });
    }
  }

  /**
   * Save data to the store
   *
   * Unlike PersistentStore, writes are synchronous in SQLite mode.
   * The Promise is returned for API compatibility.
   */
  async save(data: T): Promise<void> {
    await this.ensureInitialized();
    this.stats.saveRequests++;

    try {
      this.store!.set(this.namespace, this.key, data);
      this.stats.actualWrites++;
      this.stats.lastWriteTime = Date.now();
      this.stats.lastError = null;
    } catch (error) {
      this.stats.failedWrites++;
      this.stats.lastError = String(error);
      throw error;
    }
  }

  /**
   * Save data immediately (same as save() for SQLite)
   */
  async saveImmediate(data: T): Promise<void> {
    return this.save(data);
  }

  /**
   * Flush any pending writes (no-op for SQLite, writes are synchronous)
   */
  async flush(): Promise<void> {
    await this.ensureInitialized();
    // SQLite writes are synchronous, nothing to flush
  }

  /**
   * Load data from the store
   */
  async load(): Promise<T | null> {
    await this.ensureInitialized();

    try {
      return this.store!.get<T>(this.namespace, this.key);
    } catch (error) {
      logger.server.error(`${this.componentName}: Failed to load`, { error });
      throw error;
    }
  }

  /**
   * Check if data exists
   */
  async exists(): Promise<boolean> {
    await this.ensureInitialized();
    return this.store!.has(this.namespace, this.key);
  }

  /**
   * Delete the data
   */
  async delete(): Promise<void> {
    await this.ensureInitialized();
    this.store!.delete(this.namespace, this.key);
  }

  /**
   * Cancel any pending writes (no-op for SQLite)
   */
  cancel(): void {
    // No-op for SQLite
  }

  /**
   * Check if there's a pending write (always false for SQLite)
   */
  hasPendingWrite(): boolean {
    return false;
  }
}

/**
 * Create a SqlitePersistentStore instance with convenience defaults
 */
export function createSqlitePersistentStore<T>(
  jsonFilePath: string,
  componentName: string,
  config: Partial<SqlitePersistentStoreConfig> = {}
): SqlitePersistentStore<T> {
  return new SqlitePersistentStore<T>(jsonFilePath, {
    componentName,
    ...config,
  });
}
