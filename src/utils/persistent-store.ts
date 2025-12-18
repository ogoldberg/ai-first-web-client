/**
 * Persistent Store - Debounced & Atomic File Persistence
 *
 * Provides reliable file persistence with:
 * - Debounced writes: Batches rapid save calls to reduce I/O
 * - Atomic writes: Uses temp file + rename to prevent corruption
 * - Type-safe serialization: Generic JSON persistence
 *
 * Usage:
 *   const store = new PersistentStore<MyData>('./data.json');
 *   await store.save(data);  // Debounced, atomic write
 *   const data = await store.load();  // Load from file
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { logger } from './logger.js';

/**
 * Configuration for PersistentStore
 */
export interface PersistentStoreConfig {
  /** Debounce delay in milliseconds (default: 1000ms) */
  debounceMs: number;

  /** Pretty-print JSON with indentation (default: true) */
  prettyPrint: boolean;

  /** JSON indentation spaces (default: 2) */
  indent: number;

  /** Create parent directories if they don't exist (default: true) */
  createDirs: boolean;

  /** Component name for logging */
  componentName: string;
}

/**
 * Default configuration
 */
export const DEFAULT_PERSISTENT_STORE_CONFIG: PersistentStoreConfig = {
  debounceMs: 1000,
  prettyPrint: true,
  indent: 2,
  createDirs: true,
  componentName: 'PersistentStore',
};

/**
 * Statistics about store operations
 */
export interface PersistentStoreStats {
  /** Total save requests received */
  saveRequests: number;

  /** Actual writes performed (after debouncing) */
  actualWrites: number;

  /** Failed write attempts */
  failedWrites: number;

  /** Writes skipped due to debouncing */
  debouncedSkips: number;

  /** Last successful write timestamp */
  lastWriteTime: number | null;

  /** Last error message */
  lastError: string | null;
}

/**
 * PersistentStore - Debounced & Atomic JSON file persistence
 */
export class PersistentStore<T> {
  private filePath: string;
  private config: PersistentStoreConfig;
  private stats: PersistentStoreStats;

  // Debounce state
  private pendingData: T | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private writePromise: Promise<void> | null = null;

  constructor(filePath: string, config: Partial<PersistentStoreConfig> = {}) {
    this.filePath = path.resolve(filePath);
    this.config = { ...DEFAULT_PERSISTENT_STORE_CONFIG, ...config };
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
   * Get the resolved file path
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Get store statistics
   */
  getStats(): PersistentStoreStats {
    return { ...this.stats };
  }

  /**
   * Save data to file with debouncing and atomic write
   *
   * Multiple rapid calls will be batched - only the last data is written
   * after the debounce delay expires.
   */
  async save(data: T): Promise<void> {
    this.stats.saveRequests++;
    this.pendingData = data;

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.stats.debouncedSkips++;
    }

    // Set new timer
    return new Promise<void>((resolve, reject) => {
      this.debounceTimer = setTimeout(async () => {
        this.debounceTimer = null;

        // If there's already a write in progress, wait for it
        if (this.writePromise) {
          try {
            await this.writePromise;
          } catch {
            // Ignore errors from previous write
          }
        }

        // Perform the atomic write
        const dataToWrite = this.pendingData;
        this.pendingData = null;

        if (dataToWrite !== null) {
          this.writePromise = this.atomicWrite(dataToWrite);
          try {
            await this.writePromise;
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            this.writePromise = null;
          }
        } else {
          resolve();
        }
      }, this.config.debounceMs);
    });
  }

  /**
   * Save data immediately without debouncing
   *
   * Use sparingly - prefer save() for normal operations
   */
  async saveImmediate(data: T): Promise<void> {
    this.stats.saveRequests++;

    // Clear any pending debounced write
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.pendingData = null;
    }

    // Wait for any in-progress write
    if (this.writePromise) {
      try {
        await this.writePromise;
      } catch {
        // Ignore errors from previous write
      }
    }

    // Perform immediate atomic write
    this.writePromise = this.atomicWrite(data);
    try {
      await this.writePromise;
    } finally {
      this.writePromise = null;
    }
  }

  /**
   * Flush any pending debounced write immediately
   *
   * Useful for graceful shutdown
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const dataToWrite = this.pendingData;
    this.pendingData = null;

    if (dataToWrite !== null) {
      await this.atomicWrite(dataToWrite);
    }

    // Wait for any in-progress write
    if (this.writePromise) {
      await this.writePromise;
    }
  }

  /**
   * Load data from file
   *
   * Returns null if file doesn't exist
   */
  async load(): Promise<T | null> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.server.error(`${this.config.componentName}: Failed to load from ${this.filePath}`, { error });
      throw error;
    }
  }

  /**
   * Check if the file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete the file
   */
  async delete(): Promise<void> {
    // Cancel any pending write
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.pendingData = null;
    }

    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Perform atomic write: write to temp file, then rename
   */
  private async atomicWrite(data: T): Promise<void> {
    const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;

    try {
      // Create parent directories if needed
      if (this.config.createDirs) {
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
      }

      // Serialize data
      const content = this.config.prettyPrint
        ? JSON.stringify(data, null, this.config.indent)
        : JSON.stringify(data);

      // Write to temp file
      await fs.writeFile(tempPath, content, 'utf-8');

      // Atomic rename
      await fs.rename(tempPath, this.filePath);

      this.stats.actualWrites++;
      this.stats.lastWriteTime = Date.now();
      this.stats.lastError = null;

      logger.server.debug(`${this.config.componentName}: Saved to ${this.filePath}`, {
        size: content.length,
      });
    } catch (error) {
      this.stats.failedWrites++;
      this.stats.lastError = String(error);

      logger.server.error(`${this.config.componentName}: Failed to save to ${this.filePath}`, { error });

      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  /**
   * Cancel any pending debounced write without flushing
   */
  cancel(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.pendingData = null;
    }
  }

  /**
   * Check if there's a pending write
   */
  hasPendingWrite(): boolean {
    return this.pendingData !== null || this.writePromise !== null;
  }
}

/**
 * Create a PersistentStore instance with convenience defaults
 */
export function createPersistentStore<T>(
  filePath: string,
  componentName: string,
  config: Partial<PersistentStoreConfig> = {}
): PersistentStore<T> {
  return new PersistentStore<T>(filePath, {
    componentName,
    ...config,
  });
}
