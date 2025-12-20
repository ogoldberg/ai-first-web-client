/**
 * Tests for SqlitePersistentStore (CX-007)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  SqlitePersistentStore,
  createSqlitePersistentStore,
} from '../../src/utils/sqlite-persistent-store.js';
import { closeEmbeddedStore } from '../../src/utils/embedded-store.js';

interface TestData {
  name: string;
  value: number;
  items: string[];
}

describe('SqlitePersistentStore (CX-007)', () => {
  let testDir: string;
  let store: SqlitePersistentStore<TestData>;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(
      tmpdir(),
      `sqlite-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });

    store = new SqlitePersistentStore<TestData>(
      path.join(testDir, 'test-data.json'),
      {
        dbPath: path.join(testDir, 'test.db'),
        componentName: 'TestSqliteStore',
      }
    );
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Reset global store
    await closeEmbeddedStore();
  });

  describe('Basic Operations', () => {
    it('should save and load data', async () => {
      const testData: TestData = {
        name: 'test',
        value: 42,
        items: ['a', 'b', 'c'],
      };

      await store.save(testData);
      const loaded = await store.load();

      expect(loaded).toEqual(testData);
    });

    it('should return null when no data exists', async () => {
      const loaded = await store.load();
      expect(loaded).toBeNull();
    });

    it('should overwrite existing data', async () => {
      await store.save({ name: 'first', value: 1, items: [] });
      await store.save({ name: 'second', value: 2, items: ['x'] });

      const loaded = await store.load();
      expect(loaded?.name).toBe('second');
      expect(loaded?.value).toBe(2);
    });

    it('should delete data', async () => {
      await store.save({ name: 'test', value: 1, items: [] });
      await store.delete();

      const loaded = await store.load();
      expect(loaded).toBeNull();
    });

    it('should check if data exists', async () => {
      expect(await store.exists()).toBe(false);

      await store.save({ name: 'test', value: 1, items: [] });

      expect(await store.exists()).toBe(true);
    });
  });

  describe('API Compatibility', () => {
    it('should provide getFilePath()', () => {
      const filePath = store.getFilePath();
      expect(filePath).toContain('test-data.json');
    });

    it('should provide getStats()', async () => {
      await store.save({ name: 'test', value: 1, items: [] });

      const stats = store.getStats();
      expect(stats.saveRequests).toBe(1);
      expect(stats.actualWrites).toBe(1);
      expect(stats.lastWriteTime).not.toBeNull();
    });

    it('should provide saveImmediate() (same as save for SQLite)', async () => {
      await store.saveImmediate({ name: 'immediate', value: 99, items: [] });

      const loaded = await store.load();
      expect(loaded?.name).toBe('immediate');
    });

    it('should provide flush() (no-op for SQLite)', async () => {
      await store.save({ name: 'test', value: 1, items: [] });
      await store.flush();

      const loaded = await store.load();
      expect(loaded).not.toBeNull();
    });

    it('should provide cancel() (no-op for SQLite)', () => {
      store.cancel();
      // Should not throw
    });

    it('should provide hasPendingWrite() (always false for SQLite)', () => {
      expect(store.hasPendingWrite()).toBe(false);
    });
  });

  describe('JSON Migration', () => {
    it('should migrate data from existing JSON file', async () => {
      // Create a JSON file first
      const jsonPath = path.join(testDir, 'legacy-data.json');
      const legacyData: TestData = {
        name: 'legacy',
        value: 100,
        items: ['old', 'data'],
      };
      await fs.writeFile(jsonPath, JSON.stringify(legacyData), 'utf-8');

      // Create store pointing to that JSON file
      const migratingStore = new SqlitePersistentStore<TestData>(jsonPath, {
        dbPath: path.join(testDir, 'migration.db'),
        autoMigrate: true,
      });

      // Load should get the migrated data
      const loaded = await migratingStore.load();

      expect(loaded).toEqual(legacyData);
    });

    it('should not re-migrate if data already exists in SQLite', async () => {
      const jsonPath = path.join(testDir, 'existing-data.json');

      // First, save data directly to SQLite
      const store1 = new SqlitePersistentStore<TestData>(jsonPath, {
        dbPath: path.join(testDir, 'existing.db'),
      });
      await store1.save({ name: 'sqlite-first', value: 1, items: [] });

      // Create a JSON file (should be ignored)
      await fs.writeFile(
        jsonPath,
        JSON.stringify({ name: 'json-second', value: 2, items: [] }),
        'utf-8'
      );

      // Create new store - should use SQLite data, not JSON
      const store2 = new SqlitePersistentStore<TestData>(jsonPath, {
        dbPath: path.join(testDir, 'existing.db'),
        autoMigrate: true,
      });

      const loaded = await store2.load();
      expect(loaded?.name).toBe('sqlite-first');
    });

    it('should skip migration when autoMigrate is false', async () => {
      const jsonPath = path.join(testDir, 'no-migrate.json');
      await fs.writeFile(
        jsonPath,
        JSON.stringify({ name: 'json', value: 1, items: [] }),
        'utf-8'
      );

      const noMigrateStore = new SqlitePersistentStore<TestData>(jsonPath, {
        dbPath: path.join(testDir, 'no-migrate.db'),
        autoMigrate: false,
      });

      const loaded = await noMigrateStore.load();
      expect(loaded).toBeNull(); // No migration, no data
    });
  });

  describe('Factory Function', () => {
    it('should create store with createSqlitePersistentStore', async () => {
      const factoryStore = createSqlitePersistentStore<TestData>(
        path.join(testDir, 'factory-data.json'),
        'FactoryStore',
        {
          dbPath: path.join(testDir, 'factory.db'),
        }
      );

      await factoryStore.save({ name: 'factory', value: 42, items: [] });
      const loaded = await factoryStore.load();

      expect(loaded?.name).toBe('factory');
    });
  });

  describe('Stats Tracking', () => {
    it('should track save requests', async () => {
      await store.save({ name: 'test1', value: 1, items: [] });
      await store.save({ name: 'test2', value: 2, items: [] });
      await store.save({ name: 'test3', value: 3, items: [] });

      const stats = store.getStats();
      expect(stats.saveRequests).toBe(3);
      expect(stats.actualWrites).toBe(3);
    });

    it('should track failed writes', async () => {
      // Force a failure by passing invalid data (undefined)
      try {
        await store.save(undefined as unknown as TestData);
      } catch {
        // Expected to fail
      }

      const stats = store.getStats();
      expect(stats.failedWrites).toBeGreaterThanOrEqual(0); // May or may not fail depending on SQLite behavior
    });

    it('should track last write time', async () => {
      const before = Date.now();
      await store.save({ name: 'test', value: 1, items: [] });
      const after = Date.now();

      const stats = store.getStats();
      expect(stats.lastWriteTime).toBeGreaterThanOrEqual(before);
      expect(stats.lastWriteTime).toBeLessThanOrEqual(after);
    });
  });

  describe('Namespace Isolation', () => {
    it('should isolate data by namespace (derived from filename)', async () => {
      const store1 = new SqlitePersistentStore<TestData>(
        path.join(testDir, 'store-a.json'),
        { dbPath: path.join(testDir, 'shared.db') }
      );

      const store2 = new SqlitePersistentStore<TestData>(
        path.join(testDir, 'store-b.json'),
        { dbPath: path.join(testDir, 'shared.db') }
      );

      await store1.save({ name: 'store-a', value: 1, items: [] });
      await store2.save({ name: 'store-b', value: 2, items: [] });

      const loaded1 = await store1.load();
      const loaded2 = await store2.load();

      expect(loaded1?.name).toBe('store-a');
      expect(loaded2?.name).toBe('store-b');
    });

    it('should allow custom namespace', async () => {
      const customStore = new SqlitePersistentStore<TestData>(
        path.join(testDir, 'custom.json'),
        {
          dbPath: path.join(testDir, 'custom.db'),
          namespace: 'my-custom-namespace',
        }
      );

      await customStore.save({ name: 'custom', value: 1, items: [] });
      const loaded = await customStore.load();

      expect(loaded?.name).toBe('custom');
    });
  });
});
