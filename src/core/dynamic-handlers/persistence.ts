/**
 * Dynamic Handler Persistence
 *
 * Handles saving and loading of learned handlers and quirks to disk.
 * Uses a simple JSON file format for persistence.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../../utils/logger.js';
import type { DynamicHandlerRegistry } from './registry.js';
import type { SerializedHandlerRegistry } from './types.js';

const log = logger.intelligence;

const DEFAULT_PERSISTENCE_PATH = './data/dynamic-handlers.json';

/**
 * Save the registry to disk
 */
export function saveRegistry(
  registry: DynamicHandlerRegistry,
  path: string = DEFAULT_PERSISTENCE_PATH
): void {
  try {
    const serialized = registry.serialize();
    const json = JSON.stringify(serialized, null, 2);

    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, json, 'utf8');

    log.debug('Saved dynamic handler registry', {
      path,
      handlers: serialized.learnedSites.length,
      quirks: serialized.quirks.length,
      observations: serialized.observations.length,
    });
  } catch (error) {
    log.error('Failed to save dynamic handler registry', { error, path });
    throw error;
  }
}

/**
 * Load the registry from disk
 */
export function loadRegistry(
  registry: DynamicHandlerRegistry,
  path: string = DEFAULT_PERSISTENCE_PATH
): boolean {
  try {
    if (!existsSync(path)) {
      log.debug('No dynamic handler registry found at path', { path });
      return false;
    }

    const json = readFileSync(path, 'utf8');
    const data = JSON.parse(json) as SerializedHandlerRegistry;

    // Validate version
    if (data.version !== 1) {
      log.warn('Dynamic handler registry version mismatch', {
        expected: 1,
        found: data.version,
      });
      // Could add migration logic here
    }

    registry.deserialize(data);

    log.info('Loaded dynamic handler registry', {
      path,
      handlers: data.learnedSites.length,
      quirks: data.quirks.length,
      observations: data.observations.length,
      lastUpdated: new Date(data.lastUpdated).toISOString(),
    });

    return true;
  } catch (error) {
    log.error('Failed to load dynamic handler registry', { error, path });
    return false;
  }
}

/**
 * Auto-save registry on changes (debounced)
 */
export class AutoSaveRegistry {
  private registry: DynamicHandlerRegistry;
  private path: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDelayMs: number;
  private dirty: boolean = false;

  constructor(
    registry: DynamicHandlerRegistry,
    options: {
      path?: string;
      saveDelayMs?: number;
      autoLoad?: boolean;
    } = {}
  ) {
    this.registry = registry;
    this.path = options.path || DEFAULT_PERSISTENCE_PATH;
    this.saveDelayMs = options.saveDelayMs || 5000; // 5 second debounce

    if (options.autoLoad !== false) {
      this.load();
    }
  }

  /**
   * Mark registry as dirty and schedule save
   */
  markDirty(): void {
    this.dirty = true;
    this.scheduleSave();
  }

  /**
   * Force immediate save
   */
  save(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.dirty) {
      saveRegistry(this.registry, this.path);
      this.dirty = false;
    }
  }

  /**
   * Load from disk
   */
  load(): boolean {
    return loadRegistry(this.registry, this.path);
  }

  /**
   * Schedule a debounced save
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.save();
    }, this.saveDelayMs);
  }

  /**
   * Clean up (call on shutdown)
   */
  dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.save(); // Final save
  }
}

/**
 * Create a registry with auto-save enabled
 */
export function createPersistentRegistry(
  registry: DynamicHandlerRegistry,
  options?: {
    path?: string;
    saveDelayMs?: number;
    autoLoad?: boolean;
  }
): {
  registry: DynamicHandlerRegistry;
  autoSave: AutoSaveRegistry;
} {
  const autoSave = new AutoSaveRegistry(registry, options);

  return {
    registry,
    autoSave,
  };
}
