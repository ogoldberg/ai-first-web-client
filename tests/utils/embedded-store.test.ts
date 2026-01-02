/**
 * Tests for EmbeddedStore (CX-007)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  EmbeddedStore,
  NamespacedStore,
  getEmbeddedStore,
  initializeEmbeddedStore,
  closeEmbeddedStore,
} from '../../src/utils/embedded-store.js';

describe('EmbeddedStore (CX-007)', () => {
  let testDir: string;
  let store: EmbeddedStore;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(tmpdir(), `embedded-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });

    store = new EmbeddedStore({
      dbPath: path.join(testDir, 'test.db'),
      allowJsonFallback: true,
      componentName: 'TestStore',
    });
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();

    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Reset global store
    await closeEmbeddedStore();
  });

  describe('Basic Operations', () => {
    it('should set and get a value', () => {
      store.set('test', 'key1', { foo: 'bar' });
      const result = store.get<{ foo: string }>('test', 'key1');

      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent key', () => {
      const result = store.get('test', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should overwrite existing value', () => {
      store.set('test', 'key1', { value: 1 });
      store.set('test', 'key1', { value: 2 });

      const result = store.get<{ value: number }>('test', 'key1');
      expect(result).toEqual({ value: 2 });
    });

    it('should delete a value', () => {
      store.set('test', 'key1', 'value1');
      const deleted = store.delete('test', 'key1');

      expect(deleted).toBe(true);
      expect(store.get('test', 'key1')).toBeNull();
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = store.delete('test', 'nonexistent');

      expect(deleted).toBe(false);
    });

    it('should check if key exists', () => {
      store.set('test', 'key1', 'value1');

      expect(store.has('test', 'key1')).toBe(true);
      expect(store.has('test', 'nonexistent')).toBe(false);
    });

    it('should store complex objects', () => {
      const complex = {
        string: 'hello',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { a: { b: { c: 'deep' } } },
        date: '2024-01-01T00:00:00Z',
      };

      store.set('test', 'complex', complex);
      const result = store.get('test', 'complex');

      expect(result).toEqual(complex);
    });

    it('should store null values', () => {
      store.set('test', 'null', null);
      expect(store.get('test', 'null')).toBeNull();
    });

    it('should throw when storing undefined values (SQLite NOT NULL constraint)', () => {
      // undefined values cannot be stored because JSON.stringify(undefined) returns undefined
      // which violates the NOT NULL constraint on the value column
      if (store.isUsingSqlite()) {
        expect(() => store.set('test', 'undefined', undefined)).toThrow();
      } else {
        // JSON fallback allows undefined (stored as undefined in Map)
        // but get() returns null for undefined values due to ?? null coalescing
        store.set('test', 'undefined', undefined);
        expect(store.get('test', 'undefined')).toBeNull();
      }
    });
  });

  describe('Namespace Operations', () => {
    it('should isolate values by namespace', () => {
      store.set('ns1', 'key', 'value1');
      store.set('ns2', 'key', 'value2');

      expect(store.get('ns1', 'key')).toBe('value1');
      expect(store.get('ns2', 'key')).toBe('value2');
    });

    it('should get all keys in a namespace', () => {
      store.set('test', 'key1', 'value1');
      store.set('test', 'key2', 'value2');
      store.set('test', 'key3', 'value3');
      store.set('other', 'key4', 'value4');

      const keys = store.keys('test');

      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys).not.toContain('key4');
    });

    it('should get all entries in a namespace', () => {
      store.set('test', 'key1', 'value1');
      store.set('test', 'key2', 'value2');

      const entries = store.getAll<string>('test');

      expect(entries.size).toBe(2);
      expect(entries.get('key1')).toBe('value1');
      expect(entries.get('key2')).toBe('value2');
    });

    it('should clear all entries in a namespace', () => {
      store.set('test', 'key1', 'value1');
      store.set('test', 'key2', 'value2');
      store.set('other', 'key3', 'value3');

      store.clear('test');

      expect(store.count('test')).toBe(0);
      expect(store.count('other')).toBe(1);
    });

    it('should count entries in a namespace', () => {
      store.set('test', 'key1', 'value1');
      store.set('test', 'key2', 'value2');
      store.set('other', 'key3', 'value3');

      expect(store.count('test')).toBe(2);
      expect(store.count('other')).toBe(1);
      expect(store.count('empty')).toBe(0);
    });

    it('should return empty array for keys of empty namespace', () => {
      const keys = store.keys('nonexistent');
      expect(keys).toEqual([]);
    });
  });

  describe('Statistics', () => {
    it('should track read operations', async () => {
      store.get('test', 'key1');
      store.get('test', 'key2');
      store.has('test', 'key3');

      const stats = await store.getStats();

      expect(stats.reads).toBe(3);
    });

    it('should track write operations', async () => {
      store.set('test', 'key1', 'value1');
      store.set('test', 'key2', 'value2');
      store.delete('test', 'key1');

      const stats = await store.getStats();

      expect(stats.writes).toBe(3);
    });

    it('should track last operation time', async () => {
      const before = Date.now();
      store.set('test', 'key1', 'value1');
      const after = Date.now();

      const stats = await store.getStats();

      expect(stats.lastOperationTime).toBeGreaterThanOrEqual(before);
      expect(stats.lastOperationTime).toBeLessThanOrEqual(after);
    });

    it('should report if using SQLite', async () => {
      const stats = await store.getStats();

      // May be true or false depending on whether better-sqlite3 is available
      expect(typeof stats.usingSqlite).toBe('boolean');
    });
  });

  describe('Transactions', () => {
    it('should run operations in a transaction', () => {
      store.transaction(() => {
        store.set('test', 'key1', 'value1');
        store.set('test', 'key2', 'value2');
      });

      expect(store.get('test', 'key1')).toBe('value1');
      expect(store.get('test', 'key2')).toBe('value2');
    });

    it('should return value from transaction', () => {
      const result = store.transaction(() => {
        store.set('test', 'key1', 'value1');
        return 'transaction-result';
      });

      expect(result).toBe('transaction-result');
    });
  });

  describe('NamespacedStore Wrapper', () => {
    let nsStore: NamespacedStore<string>;

    beforeEach(() => {
      nsStore = new NamespacedStore(store, 'myns');
    });

    it('should set and get values', () => {
      nsStore.set('key1', 'value1');
      expect(nsStore.get('key1')).toBe('value1');
    });

    it('should delete values', () => {
      nsStore.set('key1', 'value1');
      const deleted = nsStore.delete('key1');

      expect(deleted).toBe(true);
      expect(nsStore.get('key1')).toBeNull();
    });

    it('should check if key exists', () => {
      nsStore.set('key1', 'value1');

      expect(nsStore.has('key1')).toBe(true);
      expect(nsStore.has('key2')).toBe(false);
    });

    it('should get all keys', () => {
      nsStore.set('key1', 'value1');
      nsStore.set('key2', 'value2');

      const keys = nsStore.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should get all entries', () => {
      nsStore.set('key1', 'value1');
      nsStore.set('key2', 'value2');

      const entries = nsStore.getAll();
      expect(entries.size).toBe(2);
    });

    it('should clear all entries', () => {
      nsStore.set('key1', 'value1');
      nsStore.set('key2', 'value2');
      nsStore.clear();

      expect(nsStore.count()).toBe(0);
    });

    it('should count entries', () => {
      nsStore.set('key1', 'value1');
      nsStore.set('key2', 'value2');

      expect(nsStore.count()).toBe(2);
    });
  });

  describe('JSON Migration', () => {
    it('should migrate data from JSON file', async () => {
      // Create a JSON file to migrate
      const jsonPath = path.join(testDir, 'legacy.json');
      const legacyData = {
        key1: { name: 'Alice', age: 30 },
        key2: { name: 'Bob', age: 25 },
      };
      await fs.writeFile(jsonPath, JSON.stringify(legacyData), 'utf-8');

      // Migrate
      const result = await store.migrateFromJson(jsonPath, 'users');

      expect(result.migrated).toBe(2);
      expect(result.skipped).toBe(0);
      expect(store.get('users', 'key1')).toEqual({ name: 'Alice', age: 30 });
      expect(store.get('users', 'key2')).toEqual({ name: 'Bob', age: 25 });

      // Original file should be renamed
      const backupExists = await fs.access(`${jsonPath}.migrated`).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('should skip existing keys during migration', async () => {
      // Pre-populate store
      store.set('users', 'key1', { name: 'Existing' });

      // Create JSON file with overlapping key
      const jsonPath = path.join(testDir, 'legacy.json');
      const legacyData = {
        key1: { name: 'FromJson' },
        key2: { name: 'New' },
      };
      await fs.writeFile(jsonPath, JSON.stringify(legacyData), 'utf-8');

      // Migrate
      const result = await store.migrateFromJson(jsonPath, 'users');

      expect(result.migrated).toBe(1);
      expect(result.skipped).toBe(1);
      expect(store.get<{ name: string }>('users', 'key1')?.name).toBe('Existing');
      expect(store.get<{ name: string }>('users', 'key2')?.name).toBe('New');
    });

    it('should handle non-existent JSON file', async () => {
      const result = await store.migrateFromJson('/nonexistent/path.json', 'test');

      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should support custom transform function', async () => {
      // Create JSON file with array data
      const jsonPath = path.join(testDir, 'array-data.json');
      const arrayData = [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ];
      await fs.writeFile(jsonPath, JSON.stringify(arrayData), 'utf-8');

      // Migrate with transform
      const result = await store.migrateFromJson<{ id: string; value: number }[]>(
        jsonPath,
        'items',
        (data) => {
          const map = new Map<string, unknown>();
          for (const item of data) {
            map.set(item.id, item);
          }
          return map;
        }
      );

      expect(result.migrated).toBe(2);
      expect(store.get('items', 'a')).toEqual({ id: 'a', value: 1 });
      expect(store.get('items', 'b')).toEqual({ id: 'b', value: 2 });
    });
  });

  describe('Initialization', () => {
    it('should throw when accessing before initialization', async () => {
      const uninitializedStore = new EmbeddedStore({
        dbPath: path.join(testDir, 'uninitialized.db'),
      });

      expect(() => uninitializedStore.get('test', 'key')).toThrow(
        'EmbeddedStore not initialized'
      );
    });

    it('should be idempotent on multiple initialize calls', async () => {
      await store.initialize();
      await store.initialize();

      store.set('test', 'key', 'value');
      expect(store.get('test', 'key')).toBe('value');
    });

    it('should return database path', () => {
      const dbPath = store.getDbPath();
      expect(dbPath).toContain('test.db');
    });
  });

  describe('Flush and Close', () => {
    it('should flush pending writes', async () => {
      store.set('test', 'key', 'value');
      await store.flush();

      // Value should still be accessible
      expect(store.get('test', 'key')).toBe('value');
    });

    it('should close and prevent further operations', async () => {
      store.set('test', 'key', 'value');
      await store.close();

      expect(() => store.get('test', 'key')).toThrow('not initialized');
    });
  });

  describe('Global Store', () => {
    it('should provide global singleton access', async () => {
      const store1 = await initializeEmbeddedStore({
        dbPath: path.join(testDir, 'global.db'),
      });

      const store2 = getEmbeddedStore();

      expect(store1).toBe(store2);
    });

    it('should close global store', async () => {
      await initializeEmbeddedStore({
        dbPath: path.join(testDir, 'global.db'),
      });

      await closeEmbeddedStore();

      // Getting store after close should create new instance
      const newStore = getEmbeddedStore({
        dbPath: path.join(testDir, 'global2.db'),
      });

      expect(newStore).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty namespace', () => {
      store.set('', 'key', 'value');
      expect(store.get('', 'key')).toBe('value');
    });

    it('should handle empty key', () => {
      store.set('test', '', 'value');
      expect(store.get('test', '')).toBe('value');
    });

    it('should handle special characters in keys', () => {
      const specialKey = 'key:with/special\\chars"and\'quotes';
      store.set('test', specialKey, 'value');
      expect(store.get('test', specialKey)).toBe('value');
    });

    it('should handle unicode in keys and values', () => {
      const unicodeKey = 'key';
      const unicodeValue = { message: 'Hello World' };

      store.set('test', unicodeKey, unicodeValue);
      expect(store.get('test', unicodeKey)).toEqual(unicodeValue);
    });

    it('should handle large values', () => {
      const largeValue = {
        data: 'x'.repeat(100000),
        array: Array.from({ length: 1000 }, (_, i) => i),
      };

      store.set('test', 'large', largeValue);
      const result = store.get<typeof largeValue>('test', 'large');

      expect(result?.data.length).toBe(100000);
      expect(result?.array.length).toBe(1000);
    });

    it('should handle many entries', () => {
      for (let i = 0; i < 1000; i++) {
        store.set('test', `key${i}`, `value${i}`);
      }

      expect(store.count('test')).toBe(1000);
      expect(store.get('test', 'key500')).toBe('value500');
    });
  });
});

describe('EmbeddedStore JSON Fallback', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `embedded-store-json-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    await closeEmbeddedStore();
  });

  it('should save to JSON file when using fallback', async () => {
    // Create store that will use JSON fallback
    // We mock the import to simulate better-sqlite3 not being available
    const store = new EmbeddedStore({
      dbPath: path.join(testDir, 'fallback.db'),
      allowJsonFallback: true,
    });

    // Manually force JSON fallback for testing
    // @ts-expect-error - accessing private for testing
    store.usingSqlite = false;
    // @ts-expect-error - accessing private for testing
    store.initialized = true;

    store.set('test', 'key', 'value');
    await store.flush();

    const jsonPath = path.join(testDir, 'fallback.json');
    const content = await fs.readFile(jsonPath, 'utf-8');
    const data = JSON.parse(content);

    expect(data.test.key).toBe('value');

    await store.close();
  });
});
