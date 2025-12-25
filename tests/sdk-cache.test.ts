import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LLMBrowserClient } from '../src/sdk.js';
import { pageCache, apiCache } from '../src/utils/cache.js';

describe('LLMBrowserClient Cache Management (DX-004)', () => {
  let client: LLMBrowserClient;

  beforeEach(() => {
    // Clear any existing cache entries
    pageCache.clear();
    apiCache.clear();

    client = new LLMBrowserClient();
  });

  afterEach(() => {
    // Clean up caches between tests
    pageCache.clear();
    apiCache.clear();
  });

  describe('getCacheStats', () => {
    it('should return empty stats for fresh cache', () => {
      const stats = client.getCacheStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.pageCache.size).toBe(0);
      expect(stats.apiCache.size).toBe(0);
      expect(stats.domains).toEqual([]);
    });

    it('should return accurate stats after caching', () => {
      // Simulate page cache entries
      pageCache.set('https://example.com/page1', {
        html: '<html>test</html>',
        contentHash: 'abc123',
        fetchedAt: Date.now(),
      });
      pageCache.set('https://example.com/page2', {
        html: '<html>test2</html>',
        contentHash: 'def456',
        fetchedAt: Date.now(),
      });

      // Simulate API cache entries
      apiCache.set('https://api.example.com/data', { result: 'test' });

      const stats = client.getCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.pageCache.size).toBe(2);
      expect(stats.apiCache.size).toBe(1);
      expect(stats.domains).toContain('example.com');
      expect(stats.domains).toContain('api.example.com');
    });

    it('should combine domains from both caches', () => {
      pageCache.set('https://page.example.com/test', {
        html: '<html></html>',
        contentHash: 'abc',
        fetchedAt: Date.now(),
      });
      apiCache.set('https://api.example.com/test', { data: 'test' });

      const stats = client.getCacheStats();

      expect(stats.domains).toHaveLength(2);
      expect(stats.domains).toContain('page.example.com');
      expect(stats.domains).toContain('api.example.com');
    });

    it('should include cache configuration in stats', () => {
      const stats = client.getCacheStats();

      expect(stats.pageCache.maxEntries).toBe(500);
      expect(stats.pageCache.ttlMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(stats.apiCache.maxEntries).toBe(200);
      expect(stats.apiCache.ttlMs).toBe(5 * 60 * 1000); // 5 minutes
    });
  });

  describe('clearCache', () => {
    beforeEach(() => {
      // Set up test cache entries
      pageCache.set('https://example.com/page1', {
        html: '<html>1</html>',
        contentHash: 'hash1',
        fetchedAt: Date.now(),
      });
      pageCache.set('https://example.com/page2', {
        html: '<html>2</html>',
        contentHash: 'hash2',
        fetchedAt: Date.now(),
      });
      pageCache.set('https://other.com/page', {
        html: '<html>other</html>',
        contentHash: 'hash3',
        fetchedAt: Date.now(),
      });
      apiCache.set('https://api.example.com/data', { data: 'test' });
      apiCache.set('https://api.other.com/data', { data: 'other' });
    });

    it('should clear all cache entries when no domain specified', () => {
      const cleared = client.clearCache();

      expect(cleared).toBe(5);
      expect(client.getCacheStats().totalEntries).toBe(0);
    });

    it('should clear only specified domain entries', () => {
      const cleared = client.clearCache('example.com');

      expect(cleared).toBe(3); // 2 page entries + 1 api entry

      const stats = client.getCacheStats();
      expect(stats.totalEntries).toBe(2); // other.com entries remain
      expect(stats.domains).toContain('other.com');
      expect(stats.domains).toContain('api.other.com');
      expect(stats.domains).not.toContain('example.com');
      expect(stats.domains).not.toContain('api.example.com');
    });

    it('should return 0 when clearing non-existent domain', () => {
      const cleared = client.clearCache('nonexistent.com');

      expect(cleared).toBe(0);
      expect(client.getCacheStats().totalEntries).toBe(5);
    });

    it('should handle subdomain clearing correctly', () => {
      pageCache.set('https://sub.example.com/page', {
        html: '<html>sub</html>',
        contentHash: 'hashsub',
        fetchedAt: Date.now(),
      });

      const cleared = client.clearCache('example.com');

      // Should clear example.com, api.example.com, and sub.example.com
      expect(cleared).toBe(4);
    });
  });

  describe('clearCache edge cases', () => {
    it('should work on empty cache', () => {
      const cleared = client.clearCache();
      expect(cleared).toBe(0);
    });

    it('should work on empty cache with domain parameter', () => {
      const cleared = client.clearCache('example.com');
      expect(cleared).toBe(0);
    });

    it('should be case-insensitive for domain matching', () => {
      pageCache.set('https://EXAMPLE.COM/page', {
        html: '<html></html>',
        contentHash: 'hash',
        fetchedAt: Date.now(),
      });

      const cleared = client.clearCache('example.com');
      expect(cleared).toBe(1);
    });
  });
});
