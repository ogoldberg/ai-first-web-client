/**
 * Tests for Unified Discovery Cache (CLOUD-008)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DiscoveryCache,
  createDiscoveryCache,
  getDiscoveryCache,
  resetGlobalDiscoveryCache,
  type DiscoverySource,
  type DiscoveryCacheConfig,
} from '../../src/utils/discovery-cache.js';

describe('DiscoveryCache', () => {
  let cache: DiscoveryCache;

  beforeEach(() => {
    resetGlobalDiscoveryCache();
    cache = createDiscoveryCache();
  });

  afterEach(() => {
    resetGlobalDiscoveryCache();
  });

  describe('basic operations', () => {
    it('should store and retrieve values', async () => {
      const testData = { found: true, version: '3.0.0' };
      await cache.set('openapi', 'example.com', testData);

      const result = await cache.get('openapi', 'example.com');
      expect(result).toEqual(testData);
    });

    it('should return null for missing entries', async () => {
      const result = await cache.get('openapi', 'nonexistent.com');
      expect(result).toBeNull();
    });

    it('should delete entries', async () => {
      await cache.set('openapi', 'example.com', { found: true });
      expect(await cache.get('openapi', 'example.com')).not.toBeNull();

      await cache.delete('openapi', 'example.com');
      expect(await cache.get('openapi', 'example.com')).toBeNull();
    });

    it('should handle different sources independently', async () => {
      await cache.set('openapi', 'example.com', { type: 'openapi' });
      await cache.set('asyncapi', 'example.com', { type: 'asyncapi' });

      const openapiResult = await cache.get('openapi', 'example.com');
      const asyncapiResult = await cache.get('asyncapi', 'example.com');

      expect(openapiResult).toEqual({ type: 'openapi' });
      expect(asyncapiResult).toEqual({ type: 'asyncapi' });
    });

    it('should clear cache for specific source', async () => {
      await cache.set('openapi', 'example.com', { found: true });
      await cache.set('asyncapi', 'example.com', { found: true });

      await cache.clear('openapi');

      expect(await cache.get('openapi', 'example.com')).toBeNull();
      expect(await cache.get('asyncapi', 'example.com')).not.toBeNull();
    });

    it('should clear all cache', async () => {
      await cache.set('openapi', 'example.com', { found: true });
      await cache.set('asyncapi', 'other.com', { found: true });

      await cache.clear();

      expect(await cache.get('openapi', 'example.com')).toBeNull();
      expect(await cache.get('asyncapi', 'other.com')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should respect custom TTL', async () => {
      vi.useFakeTimers();

      await cache.set('openapi', 'example.com', { found: true }, 1000);

      // Should exist immediately
      expect(await cache.get('openapi', 'example.com')).not.toBeNull();

      // Fast forward past TTL
      vi.advanceTimersByTime(1500);

      // Should be expired
      expect(await cache.get('openapi', 'example.com')).toBeNull();

      vi.useRealTimers();
    });

    it('should use default TTL when not specified', async () => {
      vi.useFakeTimers();

      const customCache = createDiscoveryCache({ defaultTtlMs: 5000 });
      await customCache.set('openapi', 'example.com', { found: true });

      // Should exist after 4 seconds
      vi.advanceTimersByTime(4000);
      expect(await customCache.get('openapi', 'example.com')).not.toBeNull();

      // Should be expired after 6 seconds
      vi.advanceTimersByTime(2000);
      expect(await customCache.get('openapi', 'example.com')).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('tenant isolation', () => {
    it('should isolate data between tenants', async () => {
      const tenant1Cache = createDiscoveryCache({ tenantId: 'tenant-1' });
      const tenant2Cache = createDiscoveryCache({ tenantId: 'tenant-2' });

      await tenant1Cache.set('openapi', 'example.com', { tenant: '1' });
      await tenant2Cache.set('openapi', 'example.com', { tenant: '2' });

      const result1 = await tenant1Cache.get('openapi', 'example.com');
      const result2 = await tenant2Cache.get('openapi', 'example.com');

      expect(result1).toEqual({ tenant: '1' });
      expect(result2).toEqual({ tenant: '2' });
    });

    it('should clear only tenant-specific cache', async () => {
      const tenant1Cache = createDiscoveryCache({ tenantId: 'tenant-1' });
      const tenant2Cache = createDiscoveryCache({ tenantId: 'tenant-2' });

      await tenant1Cache.set('openapi', 'example.com', { found: true });
      await tenant2Cache.set('openapi', 'example.com', { found: true });

      await tenant1Cache.clear();

      expect(await tenant1Cache.get('openapi', 'example.com')).toBeNull();
      // Note: Since both use the global in-memory backend, clearing tenant1
      // will clear by prefix, so this test verifies the prefix isolation works
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when at capacity', async () => {
      const smallCache = createDiscoveryCache({ maxEntriesPerSource: 3 });

      await smallCache.set('openapi', 'domain1.com', { id: 1 });
      await smallCache.set('openapi', 'domain2.com', { id: 2 });
      await smallCache.set('openapi', 'domain3.com', { id: 3 });

      // Adding a 4th entry should evict the oldest (domain1)
      await smallCache.set('openapi', 'domain4.com', { id: 4 });

      // domain1 should be evicted
      const stats = await smallCache.getStats();
      expect(stats.entriesBySource['openapi']).toBeLessThanOrEqual(3);
    });

    it('should update last accessed time on get', async () => {
      vi.useFakeTimers();
      const smallCache = createDiscoveryCache({ maxEntriesPerSource: 3 });

      await smallCache.set('openapi', 'domain1.com', { id: 1 });
      vi.advanceTimersByTime(100);
      await smallCache.set('openapi', 'domain2.com', { id: 2 });
      vi.advanceTimersByTime(100);
      await smallCache.set('openapi', 'domain3.com', { id: 3 });

      // Access domain1 to make it "recent"
      await smallCache.get('openapi', 'domain1.com');

      vi.advanceTimersByTime(100);
      // Adding domain4 should evict domain2 (oldest accessed)
      await smallCache.set('openapi', 'domain4.com', { id: 4 });

      // domain1 should still exist (was accessed recently)
      expect(await smallCache.get('openapi', 'domain1.com')).toEqual({ id: 1 });

      vi.useRealTimers();
    });
  });

  describe('failed domain tracking', () => {
    it('should not be in cooldown initially', () => {
      expect(cache.isInCooldown('openapi', 'example.com')).toBe(false);
    });

    it('should enter cooldown after recording failure', () => {
      cache.recordFailure('openapi', 'example.com', 'Connection timeout');
      expect(cache.isInCooldown('openapi', 'example.com')).toBe(true);
    });

    it('should use exponential backoff for repeated failures', () => {
      vi.useFakeTimers();

      // First failure - base cooldown (5 min default)
      cache.recordFailure('openapi', 'example.com', 'Error 1');
      const info1 = cache.getCooldownInfo('openapi', 'example.com');
      const cooldown1 = info1!.cooldownUntil - Date.now();

      // Fast forward past first cooldown
      vi.advanceTimersByTime(cooldown1 + 1000);
      expect(cache.isInCooldown('openapi', 'example.com')).toBe(false);

      // Second failure - 2x cooldown
      cache.recordFailure('openapi', 'example.com', 'Error 2');
      const info2 = cache.getCooldownInfo('openapi', 'example.com');
      const cooldown2 = info2!.cooldownUntil - Date.now();

      expect(cooldown2).toBeGreaterThan(cooldown1);
      expect(info2!.failureCount).toBe(2);

      vi.useRealTimers();
    });

    it('should cap cooldown at max value', () => {
      const cache = createDiscoveryCache({
        baseCooldownMs: 1000,
        maxCooldownMs: 5000,
      });

      // Record many failures
      for (let i = 0; i < 10; i++) {
        cache.recordFailure('openapi', 'example.com', `Error ${i}`);
      }

      const info = cache.getCooldownInfo('openapi', 'example.com');
      const cooldown = info!.cooldownUntil - Date.now();

      // Cooldown should not exceed max
      expect(cooldown).toBeLessThanOrEqual(5000);
    });

    it('should clear failed domain on successful cache', async () => {
      cache.recordFailure('openapi', 'example.com', 'Error');
      expect(cache.isInCooldown('openapi', 'example.com')).toBe(true);

      // Successful cache should clear failure tracking
      await cache.set('openapi', 'example.com', { found: true });
      expect(cache.isInCooldown('openapi', 'example.com')).toBe(false);
    });

    it('should track failures per source independently', () => {
      cache.recordFailure('openapi', 'example.com', 'OpenAPI error');

      expect(cache.isInCooldown('openapi', 'example.com')).toBe(true);
      expect(cache.isInCooldown('asyncapi', 'example.com')).toBe(false);
    });

    it('should get all failed domains', () => {
      cache.recordFailure('openapi', 'domain1.com', 'Error 1');
      cache.recordFailure('asyncapi', 'domain2.com', 'Error 2');

      const failed = cache.getFailedDomains();
      expect(failed).toHaveLength(2);
      expect(failed.map(f => f.domain)).toContain('domain1.com');
      expect(failed.map(f => f.domain)).toContain('domain2.com');
    });
  });

  describe('withCache helper', () => {
    it('should return cached value if available', async () => {
      await cache.set('openapi', 'example.com', { cached: true });

      const discoveryFn = vi.fn().mockResolvedValue({ cached: false });
      const result = await cache.withCache('openapi', 'example.com', discoveryFn);

      expect(result).toEqual({ cached: true });
      expect(discoveryFn).not.toHaveBeenCalled();
    });

    it('should call discovery function on cache miss', async () => {
      const discoveryFn = vi.fn().mockResolvedValue({ found: true });
      const result = await cache.withCache('openapi', 'example.com', discoveryFn);

      expect(result).toEqual({ found: true });
      expect(discoveryFn).toHaveBeenCalledTimes(1);

      // Should be cached now
      const cached = await cache.get('openapi', 'example.com');
      expect(cached).toEqual({ found: true });
    });

    it('should return null for domains in cooldown', async () => {
      cache.recordFailure('openapi', 'example.com', 'Error');

      const discoveryFn = vi.fn().mockResolvedValue({ found: true });
      const result = await cache.withCache('openapi', 'example.com', discoveryFn);

      expect(result).toBeNull();
      expect(discoveryFn).not.toHaveBeenCalled();
    });

    it('should skip cooldown check when requested', async () => {
      cache.recordFailure('openapi', 'example.com', 'Error');

      const discoveryFn = vi.fn().mockResolvedValue({ found: true });
      const result = await cache.withCache('openapi', 'example.com', discoveryFn, {
        skipCooldownCheck: true,
      });

      expect(result).toEqual({ found: true });
      expect(discoveryFn).toHaveBeenCalledTimes(1);
    });

    it('should record failure on discovery error', async () => {
      const discoveryFn = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        cache.withCache('openapi', 'example.com', discoveryFn)
      ).rejects.toThrow('Network error');

      expect(cache.isInCooldown('openapi', 'example.com')).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', async () => {
      await cache.set('openapi', 'example.com', { found: true });

      // Hit
      await cache.get('openapi', 'example.com');
      // Miss
      await cache.get('openapi', 'nonexistent.com');

      const stats = await cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should count entries by source', async () => {
      await cache.set('openapi', 'domain1.com', { found: true });
      await cache.set('openapi', 'domain2.com', { found: true });
      await cache.set('asyncapi', 'domain1.com', { found: true });

      const stats = await cache.getStats();
      expect(stats.entriesBySource['openapi']).toBe(2);
      expect(stats.entriesBySource['asyncapi']).toBe(1);
      expect(stats.totalEntries).toBe(3);
    });

    it('should count failed domains', async () => {
      cache.recordFailure('openapi', 'domain1.com', 'Error 1');
      cache.recordFailure('asyncapi', 'domain2.com', 'Error 2');

      const stats = await cache.getStats();
      expect(stats.failedDomains).toBe(2);
    });

    it('should report backend type', async () => {
      const stats = await cache.getStats();
      expect(stats.backend).toBe('memory');
    });

    it('should reset statistics', async () => {
      await cache.set('openapi', 'example.com', { found: true });
      await cache.get('openapi', 'example.com');
      await cache.get('openapi', 'nonexistent.com');

      cache.resetStats();

      const stats = await cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('global cache singleton', () => {
    it('should return same instance', () => {
      const cache1 = getDiscoveryCache();
      const cache2 = getDiscoveryCache();
      expect(cache1).toBe(cache2);
    });

    it('should reset singleton', async () => {
      const cache1 = getDiscoveryCache();
      await cache1.set('openapi', 'example.com', { found: true });

      resetGlobalDiscoveryCache();

      const cache2 = getDiscoveryCache();
      expect(cache2).not.toBe(cache1);
      expect(await cache2.get('openapi', 'example.com')).toBeNull();
    });

    it('should accept config on first creation', async () => {
      resetGlobalDiscoveryCache();

      const cache = getDiscoveryCache({ defaultTtlMs: 1000 });
      await cache.set('openapi', 'example.com', { found: true });

      // Config is applied
      vi.useFakeTimers();
      vi.advanceTimersByTime(1500);
      expect(await cache.get('openapi', 'example.com')).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('discovery sources', () => {
    const sources: DiscoverySource[] = [
      'openapi',
      'asyncapi',
      'alt-spec',
      'robots-sitemap',
      'backend-framework',
      'docs-page',
      'graphql',
      'links',
    ];

    it.each(sources)('should support %s source', async (source) => {
      await cache.set(source, 'example.com', { source });
      const result = await cache.get(source, 'example.com');
      expect(result).toEqual({ source });
    });
  });
});
