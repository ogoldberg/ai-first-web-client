/**
 * Tests for PersistentStore - Debounced & Atomic File Persistence
 *
 * Tests cover:
 * - Basic save/load operations
 * - Debouncing (batches rapid writes)
 * - Atomic writes (temp file + rename)
 * - Error handling
 * - Statistics tracking
 * - Flush and cancel operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PersistentStore,
  createPersistentStore,
  DEFAULT_PERSISTENT_STORE_CONFIG,
} from '../../src/utils/persistent-store.js';

describe('PersistentStore', () => {
  let testDir: string;
  let testFilePath: string;

  // Helper to create a unique test file path
  const createTestPath = (name: string) => path.join(testDir, `${name}-${Date.now()}.json`);

  // Helper to wait for debounce
  const waitForDebounce = (ms: number = 1100) => new Promise(resolve => setTimeout(resolve, ms));

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `persistent-store-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    testFilePath = createTestPath('test');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================
  // BASIC OPERATIONS
  // ============================================
  describe('Basic Operations', () => {
    it('should create store with default config', () => {
      const store = new PersistentStore<{ value: number }>(testFilePath);
      expect(store.getFilePath()).toBe(path.resolve(testFilePath));
    });

    it('should create store with custom config', () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 500,
        prettyPrint: false,
        componentName: 'TestStore',
      });
      expect(store.getFilePath()).toBe(path.resolve(testFilePath));
    });

    it('should return null when loading non-existent file', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath);
      const data = await store.load();
      expect(data).toBeNull();
    });

    it('should return false for exists() on non-existent file', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath);
      expect(await store.exists()).toBe(false);
    });

    it('should save and load data correctly', async () => {
      const store = new PersistentStore<{ value: number; name: string }>(testFilePath, {
        debounceMs: 0, // No debounce for immediate test
      });

      const testData = { value: 42, name: 'test' };
      await store.save(testData);

      // Wait for debounce even with 0ms
      await waitForDebounce(100);

      const loaded = await store.load();
      expect(loaded).toEqual(testData);
    });

    it('should return true for exists() after save', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 0 });
      await store.save({ value: 1 });
      await waitForDebounce(100);
      expect(await store.exists()).toBe(true);
    });

    it('should delete file correctly', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 0 });
      await store.save({ value: 1 });
      await waitForDebounce(100);

      expect(await store.exists()).toBe(true);
      await store.delete();
      expect(await store.exists()).toBe(false);
    });

    it('should not throw when deleting non-existent file', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath);
      await expect(store.delete()).resolves.not.toThrow();
    });
  });

  // ============================================
  // DEBOUNCING
  // ============================================
  describe('Debouncing', () => {
    it('should debounce rapid saves', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 200,
      });

      // Rapid saves
      store.save({ value: 1 });
      store.save({ value: 2 });
      store.save({ value: 3 });
      const savePromise = store.save({ value: 4 }); // Last one wins

      // Wait for debounce
      await savePromise;
      await waitForDebounce(300);

      const loaded = await store.load();
      expect(loaded).toEqual({ value: 4 });

      // Check stats
      const stats = store.getStats();
      expect(stats.saveRequests).toBe(4);
      expect(stats.actualWrites).toBe(1);
      expect(stats.debouncedSkips).toBe(3);
    });

    it('should batch writes within debounce window', async () => {
      const store = new PersistentStore<{ values: number[] }>(testFilePath, {
        debounceMs: 100,
      });

      // First batch
      store.save({ values: [1] });
      store.save({ values: [1, 2] });
      await waitForDebounce(200);

      let loaded = await store.load();
      expect(loaded).toEqual({ values: [1, 2] });

      // Second batch
      store.save({ values: [1, 2, 3] });
      store.save({ values: [1, 2, 3, 4] });
      await waitForDebounce(200);

      loaded = await store.load();
      expect(loaded).toEqual({ values: [1, 2, 3, 4] });

      const stats = store.getStats();
      expect(stats.actualWrites).toBe(2);
    });

    it('should respect custom debounce delay', async () => {
      const shortDebounce = new PersistentStore<{ value: number }>(createTestPath('short'), {
        debounceMs: 50,
      });

      const startTime = Date.now();
      await shortDebounce.save({ value: 1 });
      const elapsed = Date.now() - startTime;

      // Should complete in ~50ms (with some tolerance)
      expect(elapsed).toBeLessThan(200);
    });
  });

  // ============================================
  // IMMEDIATE SAVE
  // ============================================
  describe('Immediate Save', () => {
    it('should save immediately without debouncing', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 5000, // Long debounce
      });

      const startTime = Date.now();
      await store.saveImmediate({ value: 42 });
      const elapsed = Date.now() - startTime;

      // Should complete quickly (no debounce delay)
      expect(elapsed).toBeLessThan(500);

      const loaded = await store.load();
      expect(loaded).toEqual({ value: 42 });
    });

    it('should cancel pending debounced write', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 5000,
      });

      // Start debounced save (won't complete due to long delay)
      store.save({ value: 1 });

      // Immediate save should cancel and override
      await store.saveImmediate({ value: 2 });

      const loaded = await store.load();
      expect(loaded).toEqual({ value: 2 });
    });
  });

  // ============================================
  // FLUSH
  // ============================================
  describe('Flush', () => {
    it('should flush pending data immediately', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 5000, // Long debounce
      });

      // Start debounced save
      store.save({ value: 42 });
      expect(store.hasPendingWrite()).toBe(true);

      // Flush immediately
      await store.flush();
      expect(store.hasPendingWrite()).toBe(false);

      const loaded = await store.load();
      expect(loaded).toEqual({ value: 42 });
    });

    it('should be no-op when nothing pending', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath);
      await expect(store.flush()).resolves.not.toThrow();
    });
  });

  // ============================================
  // CANCEL
  // ============================================
  describe('Cancel', () => {
    it('should cancel pending write without saving', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 5000,
      });

      // Start debounced save
      store.save({ value: 42 });
      expect(store.hasPendingWrite()).toBe(true);

      // Cancel
      store.cancel();
      expect(store.hasPendingWrite()).toBe(false);

      // File should not exist
      expect(await store.exists()).toBe(false);
    });
  });

  // ============================================
  // ATOMIC WRITES
  // ============================================
  describe('Atomic Writes', () => {
    it('should not leave temp files after successful write', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 0 });
      await store.save({ value: 42 });
      await waitForDebounce(100);

      // Check directory for temp files
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter(f => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should create parent directories', async () => {
      const nestedPath = path.join(testDir, 'nested', 'deep', 'dir', 'file.json');
      const store = new PersistentStore<{ value: number }>(nestedPath, {
        debounceMs: 0,
        createDirs: true,
      });

      await store.save({ value: 42 });
      await waitForDebounce(100);

      const loaded = await store.load();
      expect(loaded).toEqual({ value: 42 });
    });

    it('should preserve data integrity on sequential writes', async () => {
      const store = new PersistentStore<{ counter: number }>(testFilePath, { debounceMs: 0 });

      // Perform multiple sequential writes
      for (let i = 1; i <= 10; i++) {
        await store.saveImmediate({ counter: i });
      }

      const loaded = await store.load();
      expect(loaded).toEqual({ counter: 10 });
    });
  });

  // ============================================
  // SERIALIZATION
  // ============================================
  describe('Serialization', () => {
    it('should pretty-print by default', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 0 });
      await store.save({ value: 42 });
      await waitForDebounce(100);

      const content = await fs.readFile(testFilePath, 'utf-8');
      expect(content).toContain('\n'); // Has newlines
      expect(content).toContain('  '); // Has indentation
    });

    it('should not pretty-print when disabled', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 0,
        prettyPrint: false,
      });
      await store.save({ value: 42 });
      await waitForDebounce(100);

      const content = await fs.readFile(testFilePath, 'utf-8');
      expect(content).toBe('{"value":42}');
    });

    it('should use custom indentation', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, {
        debounceMs: 0,
        indent: 4,
      });
      await store.save({ value: 42 });
      await waitForDebounce(100);

      const content = await fs.readFile(testFilePath, 'utf-8');
      expect(content).toContain('    '); // 4-space indentation
    });

    it('should handle complex data structures', async () => {
      interface ComplexData {
        items: Array<{ id: number; name: string }>;
        metadata: { created: string; count: number };
        nested: { deep: { value: boolean } };
      }

      const store = new PersistentStore<ComplexData>(testFilePath, { debounceMs: 0 });
      const testData: ComplexData = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ],
        metadata: { created: '2025-01-01', count: 2 },
        nested: { deep: { value: true } },
      };

      await store.save(testData);
      await waitForDebounce(100);

      const loaded = await store.load();
      expect(loaded).toEqual(testData);
    });
  });

  // ============================================
  // STATISTICS
  // ============================================
  describe('Statistics', () => {
    it('should track save requests', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 50 });

      store.save({ value: 1 });
      store.save({ value: 2 });
      await store.save({ value: 3 });
      await waitForDebounce(100);

      const stats = store.getStats();
      expect(stats.saveRequests).toBe(3);
    });

    it('should track actual writes', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 0 });

      await store.saveImmediate({ value: 1 });
      await store.saveImmediate({ value: 2 });

      const stats = store.getStats();
      expect(stats.actualWrites).toBe(2);
    });

    it('should track debounced skips', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 100 });

      store.save({ value: 1 });
      store.save({ value: 2 });
      store.save({ value: 3 });
      await store.save({ value: 4 });
      await waitForDebounce(200);

      const stats = store.getStats();
      expect(stats.debouncedSkips).toBe(3);
    });

    it('should track last write time', async () => {
      const store = new PersistentStore<{ value: number }>(testFilePath, { debounceMs: 0 });

      const before = Date.now();
      await store.saveImmediate({ value: 1 });
      const after = Date.now();

      const stats = store.getStats();
      expect(stats.lastWriteTime).toBeGreaterThanOrEqual(before);
      expect(stats.lastWriteTime).toBeLessThanOrEqual(after);
    });

    it('should return copy of stats', () => {
      const store = new PersistentStore<{ value: number }>(testFilePath);
      const stats1 = store.getStats();
      const stats2 = store.getStats();
      expect(stats1).not.toBe(stats2); // Different objects
      expect(stats1).toEqual(stats2); // Same values
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================
  describe('Error Handling', () => {
    it('should throw on invalid JSON during load', async () => {
      await fs.writeFile(testFilePath, 'not valid json', 'utf-8');

      const store = new PersistentStore<{ value: number }>(testFilePath);
      await expect(store.load()).rejects.toThrow();
    });

    it('should track failed writes in stats', async () => {
      // Create a store pointing to a directory (can't write to directory as file)
      const store = new PersistentStore<{ value: number }>(testDir, {
        debounceMs: 0,
        createDirs: false,
      });

      try {
        await store.saveImmediate({ value: 1 });
      } catch {
        // Expected to fail
      }

      const stats = store.getStats();
      expect(stats.failedWrites).toBeGreaterThan(0);
      expect(stats.lastError).not.toBeNull();
    });
  });

  // ============================================
  // FACTORY FUNCTION
  // ============================================
  describe('createPersistentStore', () => {
    it('should create store with component name', () => {
      const store = createPersistentStore<{ value: number }>(testFilePath, 'TestComponent');
      expect(store).toBeInstanceOf(PersistentStore);
    });

    it('should merge custom config', async () => {
      const store = createPersistentStore<{ value: number }>(testFilePath, 'TestComponent', {
        debounceMs: 0,
        prettyPrint: false,
      });

      await store.save({ value: 42 });
      await waitForDebounce(100);

      const content = await fs.readFile(testFilePath, 'utf-8');
      expect(content).toBe('{"value":42}');
    });
  });

  // ============================================
  // CONCURRENT WRITES
  // ============================================
  describe('Concurrent Writes', () => {
    it('should handle concurrent save calls safely', async () => {
      const store = new PersistentStore<{ values: number[] }>(testFilePath, { debounceMs: 0 });

      // Fire multiple saves concurrently
      const promises = [
        store.saveImmediate({ values: [1] }),
        store.saveImmediate({ values: [1, 2] }),
        store.saveImmediate({ values: [1, 2, 3] }),
      ];

      await Promise.all(promises);

      // File should contain valid JSON
      const loaded = await store.load();
      expect(loaded).toBeDefined();
      expect(Array.isArray(loaded?.values)).toBe(true);
    });
  });
});
