/**
 * Tests for Multi-Tenant Store (CX-008)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { EmbeddedStore } from '../../src/utils/embedded-store.js';
import {
  TenantStore,
  SharedPatternPool,
  MultiTenantStore,
  TenantConfig,
  SharedPattern,
  TenantNamespaces,
  getDefaultTenantId,
  DEFAULT_TENANT_CONFIG,
} from '../../src/utils/tenant-store.js';

describe('Multi-Tenant Store (CX-008)', () => {
  let testDir: string;
  let store: EmbeddedStore;
  let multiTenant: MultiTenantStore;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(
      tmpdir(),
      `tenant-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });

    store = new EmbeddedStore({
      dbPath: path.join(testDir, 'test.db'),
      allowJsonFallback: true,
      componentName: 'TestStore',
    });
    await store.initialize();

    multiTenant = new MultiTenantStore(store);
  });

  afterEach(async () => {
    await store.close();

    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('TenantStore', () => {
    describe('Basic Operations', () => {
      it('should isolate data by tenant', () => {
        const tenant1 = multiTenant.getTenant('tenant1');
        const tenant2 = multiTenant.getTenant('tenant2');

        tenant1.set('patterns', 'key1', { value: 'tenant1-data' });
        tenant2.set('patterns', 'key1', { value: 'tenant2-data' });

        expect(tenant1.get('patterns', 'key1')).toEqual({ value: 'tenant1-data' });
        expect(tenant2.get('patterns', 'key1')).toEqual({ value: 'tenant2-data' });
      });

      it('should not leak data between tenants', () => {
        const tenant1 = multiTenant.getTenant('tenant1');
        const tenant2 = multiTenant.getTenant('tenant2');

        tenant1.set('secrets', 'apiKey', 'secret-key-123');

        expect(tenant1.get('secrets', 'apiKey')).toBe('secret-key-123');
        expect(tenant2.get('secrets', 'apiKey')).toBeNull();
      });

      it('should return null for non-existent keys', () => {
        const tenant = multiTenant.getTenant('tenant1');

        expect(tenant.get('namespace', 'nonexistent')).toBeNull();
      });

      it('should overwrite existing values', () => {
        const tenant = multiTenant.getTenant('tenant1');

        tenant.set('test', 'key', { v: 1 });
        tenant.set('test', 'key', { v: 2 });

        expect(tenant.get<{ v: number }>('test', 'key')).toEqual({ v: 2 });
      });

      it('should delete values', () => {
        const tenant = multiTenant.getTenant('tenant1');

        tenant.set('test', 'key', 'value');
        expect(tenant.delete('test', 'key')).toBe(true);
        expect(tenant.get('test', 'key')).toBeNull();
      });

      it('should return false when deleting non-existent key', () => {
        const tenant = multiTenant.getTenant('tenant1');

        expect(tenant.delete('test', 'nonexistent')).toBe(false);
      });

      it('should check if key exists', () => {
        const tenant = multiTenant.getTenant('tenant1');

        tenant.set('test', 'key', 'value');

        expect(tenant.has('test', 'key')).toBe(true);
        expect(tenant.has('test', 'nonexistent')).toBe(false);
      });

      it('should list keys in a namespace', () => {
        const tenant = multiTenant.getTenant('tenant1');

        tenant.set('test', 'key1', 'v1');
        tenant.set('test', 'key2', 'v2');
        tenant.set('test', 'key3', 'v3');

        const keys = tenant.keys('test');
        expect(keys).toHaveLength(3);
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
        expect(keys).toContain('key3');
      });

      it('should get all entries in a namespace', () => {
        const tenant = multiTenant.getTenant('tenant1');

        tenant.set('test', 'key1', { a: 1 });
        tenant.set('test', 'key2', { a: 2 });

        const all = tenant.getAll<{ a: number }>('test');
        expect(all.size).toBe(2);
        expect(all.get('key1')).toEqual({ a: 1 });
        expect(all.get('key2')).toEqual({ a: 2 });
      });

      it('should clear a namespace', () => {
        const tenant = multiTenant.getTenant('tenant1');

        tenant.set('test', 'key1', 'v1');
        tenant.set('test', 'key2', 'v2');
        tenant.clear('test');

        expect(tenant.count('test')).toBe(0);
        expect(tenant.get('test', 'key1')).toBeNull();
      });

      it('should count entries in a namespace', () => {
        const tenant = multiTenant.getTenant('tenant1');

        expect(tenant.count('test')).toBe(0);

        tenant.set('test', 'key1', 'v1');
        tenant.set('test', 'key2', 'v2');

        expect(tenant.count('test')).toBe(2);
      });

      it('should run operations in a transaction', () => {
        const tenant = multiTenant.getTenant('tenant1');

        tenant.transaction(() => {
          tenant.set('test', 'key1', 'v1');
          tenant.set('test', 'key2', 'v2');
        });

        expect(tenant.get('test', 'key1')).toBe('v1');
        expect(tenant.get('test', 'key2')).toBe('v2');
      });
    });

    describe('Configuration', () => {
      it('should return tenant ID', () => {
        const tenant = multiTenant.getTenant('my-tenant');

        expect(tenant.getTenantId()).toBe('my-tenant');
      });

      it('should return tenant configuration', () => {
        const tenant = multiTenant.getTenant('tenant1', {
          sharePatterns: true,
          displayName: 'Test Tenant',
        });

        const config = tenant.getConfig();
        expect(config.tenantId).toBe('tenant1');
        expect(config.sharePatterns).toBe(true);
        expect(config.displayName).toBe('Test Tenant');
      });

      it('should apply default configuration', () => {
        const tenant = multiTenant.getTenant('tenant1');
        const config = tenant.getConfig();

        expect(config.sharePatterns).toBe(DEFAULT_TENANT_CONFIG.sharePatterns);
        expect(config.consumeShared).toBe(DEFAULT_TENANT_CONFIG.consumeShared);
      });

      it('should update configuration', () => {
        const tenant = multiTenant.getTenant('tenant1');

        expect(tenant.sharesPatterns()).toBe(false);

        tenant.updateConfig({ sharePatterns: true });

        expect(tenant.sharesPatterns()).toBe(true);
      });

      it('should report sharing status', () => {
        const sharing = multiTenant.getTenant('sharing', { sharePatterns: true });
        const notSharing = multiTenant.getTenant('not-sharing', { sharePatterns: false });

        expect(sharing.sharesPatterns()).toBe(true);
        expect(notSharing.sharesPatterns()).toBe(false);
      });

      it('should report consuming status', () => {
        const consuming = multiTenant.getTenant('consuming', { consumeShared: true });
        const notConsuming = multiTenant.getTenant('not-consuming', { consumeShared: false });

        expect(consuming.consumesShared()).toBe(true);
        expect(notConsuming.consumesShared()).toBe(false);
      });
    });
  });

  describe('SharedPatternPool', () => {
    let pool: SharedPatternPool;

    beforeEach(() => {
      pool = multiTenant.getSharedPool();
    });

    describe('Pattern Operations', () => {
      it('should contribute a pattern', () => {
        pool.contributePattern('tenant1', 'pattern1', { endpoint: '/api/users' });

        const pattern = pool.getPattern<{ endpoint: string }>('pattern1');
        expect(pattern).not.toBeNull();
        expect(pattern?.data.endpoint).toBe('/api/users');
        expect(pattern?.contributedBy).toBe('tenant1');
      });

      it('should update existing pattern', () => {
        pool.contributePattern('tenant1', 'pattern1', { v: 1 });
        pool.contributePattern('tenant1', 'pattern1', { v: 2 });

        const pattern = pool.getPattern<{ v: number }>('pattern1');
        expect(pattern?.data.v).toBe(2);
      });

      it('should return null for non-existent pattern', () => {
        expect(pool.getPattern('nonexistent')).toBeNull();
      });

      it('should get all patterns', () => {
        pool.contributePattern('t1', 'p1', { a: 1 });
        pool.contributePattern('t2', 'p2', { a: 2 });

        const all = pool.getAllPatterns();
        expect(all.size).toBe(2);
      });

      it('should filter patterns by domain', () => {
        pool.contributePattern('t1', 'p1', { a: 1 }, { domain: 'example.com' });
        pool.contributePattern('t1', 'p2', { a: 2 }, { domain: 'other.com' });
        pool.contributePattern('t1', 'p3', { a: 3 }, { domain: 'example.com' });

        const filtered = pool.getPatternsByDomain('example.com');
        expect(filtered.size).toBe(2);
      });

      it('should filter patterns by category', () => {
        pool.contributePattern('t1', 'p1', { a: 1 }, { category: 'api' });
        pool.contributePattern('t1', 'p2', { a: 2 }, { category: 'graphql' });
        pool.contributePattern('t1', 'p3', { a: 3 }, { category: 'api' });

        const filtered = pool.getPatternsByCategory('api');
        expect(filtered.size).toBe(2);
      });

      it('should remove a pattern', () => {
        pool.contributePattern('t1', 'p1', { a: 1 });
        expect(pool.getPattern('p1')).not.toBeNull();

        expect(pool.removePattern('p1')).toBe(true);
        expect(pool.getPattern('p1')).toBeNull();
      });

      it('should clear all patterns', () => {
        pool.contributePattern('t1', 'p1', { a: 1 });
        pool.contributePattern('t1', 'p2', { a: 2 });

        pool.clear();

        expect(pool.getAllPatterns().size).toBe(0);
      });
    });

    describe('Usage Tracking', () => {
      it('should record pattern usage', () => {
        pool.contributePattern('t1', 'p1', { a: 1 });
        pool.recordUsage('t2', 'p1');

        const pattern = pool.getPattern('p1');
        expect(pattern?.usageCount).toBe(1);
        expect(pattern?.usedBy).toContain('t2');
        expect(pattern?.lastUsedAt).not.toBeNull();
      });

      it('should increment usage count for repeated use', () => {
        pool.contributePattern('t1', 'p1', { a: 1 });
        pool.recordUsage('t2', 'p1');
        pool.recordUsage('t2', 'p1');
        pool.recordUsage('t2', 'p1');

        const pattern = pool.getPattern('p1');
        expect(pattern?.usageCount).toBe(3);
      });

      it('should track unique consumers', () => {
        pool.contributePattern('t1', 'p1', { a: 1 });
        pool.recordUsage('t2', 'p1');
        pool.recordUsage('t3', 'p1');
        pool.recordUsage('t2', 'p1'); // Duplicate

        const pattern = pool.getPattern('p1');
        expect(pattern?.usedBy).toHaveLength(2);
        expect(pattern?.usedBy).toContain('t2');
        expect(pattern?.usedBy).toContain('t3');
      });

      it('should not record usage for non-existent pattern', () => {
        // Should not throw
        pool.recordUsage('t1', 'nonexistent');
      });
    });

    describe('Statistics', () => {
      it('should return pool statistics', () => {
        pool.contributePattern('t1', 'p1', { a: 1 }, { category: 'api' });
        pool.contributePattern('t2', 'p2', { a: 2 }, { category: 'api' });
        pool.contributePattern('t1', 'p3', { a: 3 }, { category: 'graphql' });

        pool.recordUsage('t3', 'p1');
        pool.recordUsage('t4', 'p1');
        pool.recordUsage('t3', 'p2');

        const stats = pool.getStats();

        expect(stats.totalPatterns).toBe(3);
        expect(stats.patternsByCategory.api).toBe(2);
        expect(stats.patternsByCategory.graphql).toBe(1);
        expect(stats.patternsByContributor.t1).toBe(2);
        expect(stats.patternsByContributor.t2).toBe(1);
        expect(stats.totalUsageCount).toBe(3);
        expect(stats.uniqueContributors).toBe(2);
        expect(stats.uniqueConsumers).toBe(2);
      });

      it('should return most used patterns', () => {
        pool.contributePattern('t1', 'p1', { a: 1 });
        pool.contributePattern('t1', 'p2', { a: 2 });

        for (let i = 0; i < 5; i++) {
          pool.recordUsage('t2', 'p1');
        }
        for (let i = 0; i < 3; i++) {
          pool.recordUsage('t2', 'p2');
        }

        const stats = pool.getStats();
        expect(stats.mostUsedPatterns[0].patternId).toBe('p1');
        expect(stats.mostUsedPatterns[0].usageCount).toBe(5);
      });

      it('should handle empty pool', () => {
        const stats = pool.getStats();

        expect(stats.totalPatterns).toBe(0);
        expect(stats.totalUsageCount).toBe(0);
        expect(stats.mostUsedPatterns).toHaveLength(0);
      });
    });
  });

  describe('MultiTenantStore', () => {
    describe('Tenant Management', () => {
      it('should create and cache tenant stores', () => {
        const tenant1a = multiTenant.getTenant('tenant1');
        const tenant1b = multiTenant.getTenant('tenant1');

        expect(tenant1a).toBe(tenant1b); // Same instance
      });

      it('should check if tenant exists', () => {
        expect(multiTenant.hasTenant('new-tenant')).toBe(false);

        multiTenant.getTenant('new-tenant');

        expect(multiTenant.hasTenant('new-tenant')).toBe(true);
      });

      it('should get tenant config without creating tenant', () => {
        expect(multiTenant.getTenantConfig('nonexistent')).toBeNull();

        multiTenant.getTenant('tenant1', { displayName: 'Test' });

        const config = multiTenant.getTenantConfig('tenant1');
        expect(config).not.toBeNull();
        expect(config?.displayName).toBe('Test');
      });

      it('should update tenant config', () => {
        multiTenant.getTenant('tenant1');

        multiTenant.updateTenantConfig('tenant1', {
          sharePatterns: true,
          displayName: 'Updated Name',
        });

        const config = multiTenant.getTenantConfig('tenant1');
        expect(config?.sharePatterns).toBe(true);
        expect(config?.displayName).toBe('Updated Name');
      });

      it('should delete tenant', () => {
        multiTenant.getTenant('tenant1');
        expect(multiTenant.hasTenant('tenant1')).toBe(true);

        expect(multiTenant.deleteTenant('tenant1')).toBe(true);
        expect(multiTenant.hasTenant('tenant1')).toBe(false);
      });

      it('should return false when deleting non-existent tenant', () => {
        expect(multiTenant.deleteTenant('nonexistent')).toBe(false);
      });

      it('should list all tenants', () => {
        multiTenant.getTenant('tenant1');
        multiTenant.getTenant('tenant2');
        multiTenant.getTenant('tenant3');

        const tenants = multiTenant.listTenants();
        expect(tenants).toHaveLength(3);
        expect(tenants).toContain('tenant1');
        expect(tenants).toContain('tenant2');
        expect(tenants).toContain('tenant3');
      });

      it('should get all tenant configs', () => {
        multiTenant.getTenant('t1', { displayName: 'Tenant 1' });
        multiTenant.getTenant('t2', { displayName: 'Tenant 2' });

        const configs = multiTenant.getAllTenantConfigs();
        expect(configs.size).toBe(2);
        expect(configs.get('t1')?.displayName).toBe('Tenant 1');
        expect(configs.get('t2')?.displayName).toBe('Tenant 2');
      });

      it('should purge tenant data', () => {
        const tenant = multiTenant.getTenant('tenant1');
        tenant.set('ns1', 'key1', 'value1');
        tenant.set('ns2', 'key2', 'value2');

        multiTenant.purgeTenantData('tenant1', ['ns1', 'ns2']);

        // Tenant should be deleted
        expect(multiTenant.hasTenant('tenant1')).toBe(false);

        // Recreate and verify data is gone
        const newTenant = multiTenant.getTenant('tenant1');
        expect(newTenant.get('ns1', 'key1')).toBeNull();
        expect(newTenant.get('ns2', 'key2')).toBeNull();
      });
    });

    describe('Shared Pool Integration', () => {
      it('should contribute to shared pool when enabled', () => {
        multiTenant.getTenant('sharer', { sharePatterns: true });

        const success = multiTenant.contributeToSharedPool(
          'sharer',
          'p1',
          { endpoint: '/api/test' }
        );

        expect(success).toBe(true);
        expect(multiTenant.getSharedPool().getPattern('p1')).not.toBeNull();
      });

      it('should not contribute when sharing is disabled', () => {
        multiTenant.getTenant('non-sharer', { sharePatterns: false });

        const success = multiTenant.contributeToSharedPool(
          'non-sharer',
          'p1',
          { endpoint: '/api/test' }
        );

        expect(success).toBe(false);
        expect(multiTenant.getSharedPool().getPattern('p1')).toBeNull();
      });

      it('should get from shared pool when consuming is enabled', () => {
        multiTenant.getTenant('sharer', { sharePatterns: true });
        multiTenant.contributeToSharedPool('sharer', 'p1', { value: 42 });

        multiTenant.getTenant('consumer', { consumeShared: true });
        const data = multiTenant.getFromSharedPool<{ value: number }>('consumer', 'p1');

        expect(data).toEqual({ value: 42 });
      });

      it('should not get from shared pool when consuming is disabled', () => {
        multiTenant.getTenant('sharer', { sharePatterns: true });
        multiTenant.contributeToSharedPool('sharer', 'p1', { value: 42 });

        multiTenant.getTenant('non-consumer', { consumeShared: false });
        const data = multiTenant.getFromSharedPool('non-consumer', 'p1');

        expect(data).toBeNull();
      });

      it('should get available shared patterns with filter', () => {
        multiTenant.getTenant('sharer', { sharePatterns: true });
        multiTenant.contributeToSharedPool('sharer', 'p1', { a: 1 }, { domain: 'api.com' });
        multiTenant.contributeToSharedPool('sharer', 'p2', { a: 2 }, { domain: 'other.com' });

        multiTenant.getTenant('consumer', { consumeShared: true });

        const byDomain = multiTenant.getAvailableSharedPatterns('consumer', { domain: 'api.com' });
        expect(byDomain.size).toBe(1);
        expect(byDomain.get('p1')).toEqual({ a: 1 });

        const all = multiTenant.getAvailableSharedPatterns('consumer');
        expect(all.size).toBe(2);
      });

      it('should return empty map when consuming is disabled', () => {
        multiTenant.getTenant('sharer', { sharePatterns: true });
        multiTenant.contributeToSharedPool('sharer', 'p1', { a: 1 });

        multiTenant.getTenant('non-consumer', { consumeShared: false });
        const patterns = multiTenant.getAvailableSharedPatterns('non-consumer');

        expect(patterns.size).toBe(0);
      });
    });

    describe('Statistics', () => {
      it('should return multi-tenant statistics', () => {
        // Create tenants with various configs
        multiTenant.getTenant('t1', { sharePatterns: true, consumeShared: true });
        multiTenant.getTenant('t2', { sharePatterns: false, consumeShared: true });
        multiTenant.getTenant('t3', { sharePatterns: true, consumeShared: false });

        // Contribute some patterns
        multiTenant.contributeToSharedPool('t1', 'p1', { a: 1 });
        multiTenant.contributeToSharedPool('t3', 'p2', { a: 2 });

        const stats = multiTenant.getStats();

        expect(stats.totalTenants).toBe(3);
        expect(stats.sharingTenants).toBe(2);
        expect(stats.consumingTenants).toBe(2);
        expect(stats.sharedPool.totalPatterns).toBe(2);
      });

      it('should track active tenants', () => {
        // All tenants just created should be active
        multiTenant.getTenant('t1');
        multiTenant.getTenant('t2');

        const stats = multiTenant.getStats();
        expect(stats.activeTenants).toBe(2);
      });
    });

    describe('Base Store Access', () => {
      it('should provide access to base store', () => {
        expect(multiTenant.getBaseStore()).toBe(store);
      });
    });
  });

  describe('Namespace Constants', () => {
    it('should export namespace constants', () => {
      expect(TenantNamespaces.SHARED_POOL).toBe('__shared_pool__');
      expect(TenantNamespaces.TENANT_REGISTRY).toBe('__tenant_registry__');
      expect(TenantNamespaces.SHARED_USAGE).toBe('__shared_usage__');
    });
  });

  describe('Default Tenant ID', () => {
    it('should return default tenant ID', () => {
      const originalEnv = process.env.LLM_BROWSER_TENANT_ID;
      delete process.env.LLM_BROWSER_TENANT_ID;

      expect(getDefaultTenantId()).toBe('default');

      // Restore
      if (originalEnv !== undefined) {
        process.env.LLM_BROWSER_TENANT_ID = originalEnv;
      }
    });

    it('should return tenant ID from environment', () => {
      const originalEnv = process.env.LLM_BROWSER_TENANT_ID;
      process.env.LLM_BROWSER_TENANT_ID = 'custom-tenant';

      expect(getDefaultTenantId()).toBe('custom-tenant');

      // Restore
      if (originalEnv !== undefined) {
        process.env.LLM_BROWSER_TENANT_ID = originalEnv;
      } else {
        delete process.env.LLM_BROWSER_TENANT_ID;
      }
    });
  });

  describe('Data Isolation Security', () => {
    it('should prevent namespace collision attacks', () => {
      // Try to access another tenant's data by manipulating namespace
      const tenant1 = multiTenant.getTenant('tenant1');
      const malicious = multiTenant.getTenant('tenant2');

      tenant1.set('secrets', 'password', 'super-secret');

      // Even if attacker knows the internal namespace format, they can't access it
      // through their own tenant store
      expect(malicious.get('secrets', 'password')).toBeNull();

      // Trying to use a crafted namespace shouldn't work
      malicious.set('tenant:tenant1:secrets', 'password', 'hacked');
      expect(tenant1.get('secrets', 'password')).toBe('super-secret');
    });

    it('should prevent shared pool poisoning without opt-in', () => {
      // Non-sharing tenant tries to contribute
      multiTenant.getTenant('bad-actor', { sharePatterns: false });

      const result = multiTenant.contributeToSharedPool('bad-actor', 'malicious', {
        evil: true,
      });

      expect(result).toBe(false);
      expect(multiTenant.getSharedPool().getPattern('malicious')).toBeNull();
    });

    it('should track pattern origin for attribution', () => {
      multiTenant.getTenant('trusted', { sharePatterns: true });
      multiTenant.contributeToSharedPool('trusted', 'p1', { safe: true });

      const pattern = multiTenant.getSharedPool().getPattern('p1');
      expect(pattern?.contributedBy).toBe('trusted');
    });
  });

  describe('Persistence', () => {
    it('should persist tenant data across store instances', async () => {
      // Write data
      const tenant = multiTenant.getTenant('persist-test');
      tenant.set('data', 'key1', { value: 'persisted' });

      // Close and reopen
      await store.close();

      const newStore = new EmbeddedStore({
        dbPath: path.join(testDir, 'test.db'),
        allowJsonFallback: true,
      });
      await newStore.initialize();

      const newMultiTenant = new MultiTenantStore(newStore);
      const reloadedTenant = newMultiTenant.getTenant('persist-test');

      expect(reloadedTenant.get('data', 'key1')).toEqual({ value: 'persisted' });

      await newStore.close();
    });

    it('should persist shared pool across store instances', async () => {
      // Contribute pattern
      multiTenant.getTenant('sharer', { sharePatterns: true });
      multiTenant.contributeToSharedPool('sharer', 'p1', { persistent: true });

      // Close and reopen
      await store.close();

      const newStore = new EmbeddedStore({
        dbPath: path.join(testDir, 'test.db'),
        allowJsonFallback: true,
      });
      await newStore.initialize();

      const newMultiTenant = new MultiTenantStore(newStore);
      const pattern = newMultiTenant.getSharedPool().getPattern<{ persistent: boolean }>('p1');

      expect(pattern?.data.persistent).toBe(true);

      await newStore.close();
    });

    it('should persist tenant config across store instances', async () => {
      // Create tenant with custom config
      multiTenant.getTenant('config-test', {
        sharePatterns: true,
        displayName: 'Persistent Config',
      });

      // Close and reopen
      await store.close();

      const newStore = new EmbeddedStore({
        dbPath: path.join(testDir, 'test.db'),
        allowJsonFallback: true,
      });
      await newStore.initialize();

      const newMultiTenant = new MultiTenantStore(newStore);
      const config = newMultiTenant.getTenantConfig('config-test');

      expect(config?.sharePatterns).toBe(true);
      expect(config?.displayName).toBe('Persistent Config');

      await newStore.close();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tenant ID', () => {
      const tenant = multiTenant.getTenant('');
      tenant.set('test', 'key', 'value');
      expect(tenant.get('test', 'key')).toBe('value');
    });

    it('should handle special characters in tenant ID', () => {
      const tenant = multiTenant.getTenant('tenant:with:colons');
      tenant.set('test', 'key', 'value');
      expect(tenant.get('test', 'key')).toBe('value');
    });

    it('should handle large number of tenants', () => {
      for (let i = 0; i < 100; i++) {
        const tenant = multiTenant.getTenant(`tenant-${i}`);
        tenant.set('test', 'key', i);
      }

      expect(multiTenant.listTenants()).toHaveLength(100);

      // Verify data integrity
      for (let i = 0; i < 100; i++) {
        const tenant = multiTenant.getTenant(`tenant-${i}`);
        expect(tenant.get('test', 'key')).toBe(i);
      }
    });

    it('should handle complex nested data', () => {
      const tenant = multiTenant.getTenant('complex');

      const complex = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: 'value' }],
              date: new Date().toISOString(),
            },
          },
        },
      };

      tenant.set('test', 'nested', complex);

      const retrieved = tenant.get('test', 'nested');
      expect(retrieved).toEqual(complex);
    });
  });
});
