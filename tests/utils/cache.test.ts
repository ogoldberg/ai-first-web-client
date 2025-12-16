import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResponseCache, ContentCache } from '../../src/utils/cache.js';

describe('ResponseCache', () => {
  let cache: ResponseCache<string>;

  beforeEach(() => {
    cache = new ResponseCache<string>({ ttlMs: 1000, maxEntries: 10 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('https://example.com', 'test-value');
      expect(cache.get('https://example.com')).toBe('test-value');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('https://nonexistent.com')).toBeUndefined();
    });

    it('should handle URL with params', () => {
      cache.set('https://example.com', 'value', { page: '1', sort: 'desc' });
      expect(cache.get('https://example.com', { page: '1', sort: 'desc' })).toBe('value');
    });

    it('should sort params for consistent keys', () => {
      cache.set('https://example.com', 'value', { b: '2', a: '1' });
      // Same params in different order should find the cached value
      expect(cache.get('https://example.com', { a: '1', b: '2' })).toBe('value');
    });

    it('should distinguish between URLs with and without params', () => {
      cache.set('https://example.com', 'no-params');
      cache.set('https://example.com', 'with-params', { foo: 'bar' });

      expect(cache.get('https://example.com')).toBe('no-params');
      expect(cache.get('https://example.com', { foo: 'bar' })).toBe('with-params');
    });
  });

  describe('TTL expiration', () => {
    it('should return undefined for expired entries', () => {
      cache.set('https://example.com', 'value');
      expect(cache.get('https://example.com')).toBe('value');

      vi.advanceTimersByTime(1001); // Advance past TTL

      expect(cache.get('https://example.com')).toBeUndefined();
    });

    it('should allow custom TTL per entry', () => {
      cache.set('https://example.com', 'short-lived', undefined, 500);
      cache.set('https://other.com', 'normal-lived');

      vi.advanceTimersByTime(600);

      expect(cache.get('https://example.com')).toBeUndefined();
      expect(cache.get('https://other.com')).toBe('normal-lived');
    });
  });

  describe('has', () => {
    it('should return true for cached entries', () => {
      cache.set('https://example.com', 'value');
      expect(cache.has('https://example.com')).toBe(true);
    });

    it('should return false for missing entries', () => {
      expect(cache.has('https://nonexistent.com')).toBe(false);
    });

    it('should return false for expired entries', () => {
      cache.set('https://example.com', 'value');
      vi.advanceTimersByTime(1001);
      expect(cache.has('https://example.com')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entries', () => {
      cache.set('https://example.com', 'value');
      expect(cache.delete('https://example.com')).toBe(true);
      expect(cache.get('https://example.com')).toBeUndefined();
    });

    it('should return false for non-existent entries', () => {
      expect(cache.delete('https://nonexistent.com')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('https://example1.com', 'value1');
      cache.set('https://example2.com', 'value2');
      cache.clear();

      expect(cache.get('https://example1.com')).toBeUndefined();
      expect(cache.get('https://example2.com')).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      cache.set('https://example1.com', 'value1', undefined, 500);
      cache.set('https://example2.com', 'value2', undefined, 2000);

      vi.advanceTimersByTime(600);
      const removed = cache.cleanup();

      expect(removed).toBe(1);
      expect(cache.get('https://example1.com')).toBeUndefined();
      expect(cache.get('https://example2.com')).toBe('value2');
    });
  });

  describe('max entries eviction', () => {
    it('should evict oldest entries when at capacity', () => {
      const smallCache = new ResponseCache<string>({ maxEntries: 3 });

      smallCache.set('https://1.com', 'first');
      vi.advanceTimersByTime(10);
      smallCache.set('https://2.com', 'second');
      vi.advanceTimersByTime(10);
      smallCache.set('https://3.com', 'third');
      vi.advanceTimersByTime(10);

      // This should trigger eviction
      smallCache.set('https://4.com', 'fourth');

      expect(smallCache.get('https://4.com')).toBe('fourth');
      // At least one of the older entries should be evicted
      const stats = smallCache.getStats();
      expect(stats.size).toBeLessThanOrEqual(3);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      cache.set('https://example1.com', 'value1');
      vi.advanceTimersByTime(100);
      cache.set('https://example2.com', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxEntries).toBe(10);
      expect(stats.ttlMs).toBe(1000);
      expect(stats.oldestEntry).not.toBeNull();
      expect(stats.newestEntry).not.toBeNull();
    });

    it('should return null timestamps for empty cache', () => {
      const stats = cache.getStats();
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });

  describe('withCache', () => {
    it('should return cached value without calling function', async () => {
      const fn = vi.fn().mockResolvedValue('computed');
      cache.set('https://example.com', 'cached');

      const result = await cache.withCache('https://example.com', fn);

      expect(result).toBe('cached');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should call function and cache result for cache miss', async () => {
      const fn = vi.fn().mockResolvedValue('computed');

      const result = await cache.withCache('https://example.com', fn);

      expect(result).toBe('computed');
      expect(fn).toHaveBeenCalledOnce();
      expect(cache.get('https://example.com')).toBe('computed');
    });

    it('should pass through params', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await cache.withCache('https://example.com', fn, { page: '1' });

      expect(cache.get('https://example.com', { page: '1' })).toBe('result');
    });
  });
});

describe('ContentCache', () => {
  describe('hashContent', () => {
    it('should produce consistent hashes', () => {
      const content = 'Hello, World!';
      const hash1 = ContentCache.hashContent(content);
      const hash2 = ContentCache.hashContent(content);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = ContentCache.hashContent('Content A');
      const hash2 = ContentCache.hashContent('Content B');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = ContentCache.hashContent('');
      expect(hash).toBe('0');
    });
  });

  describe('hasContentChanged', () => {
    let cache: ContentCache;

    beforeEach(() => {
      cache = new ContentCache({ ttlMs: 10000 });
    });

    it('should return true for new URLs (cache miss)', () => {
      expect(cache.hasContentChanged('https://example.com', '<html>new</html>')).toBe(true);
    });

    it('should return false when content is the same', () => {
      const html = '<html><body>Hello</body></html>';
      cache.set('https://example.com', {
        html,
        contentHash: ContentCache.hashContent(html),
        fetchedAt: Date.now(),
      });

      expect(cache.hasContentChanged('https://example.com', html)).toBe(false);
    });

    it('should return true when content has changed', () => {
      const oldHtml = '<html><body>Old content</body></html>';
      const newHtml = '<html><body>New content</body></html>';

      cache.set('https://example.com', {
        html: oldHtml,
        contentHash: ContentCache.hashContent(oldHtml),
        fetchedAt: Date.now(),
      });

      expect(cache.hasContentChanged('https://example.com', newHtml)).toBe(true);
    });
  });
});
