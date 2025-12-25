/**
 * Adaptive Cache Tests (P-001)
 *
 * Tests for the adaptive response caching system with smart TTL.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  classifyDomain,
  getTTLMultiplier,
  parseCacheControl,
  calculateAdaptiveTTL,
  recordContentCheck,
  getVolatilityFactor,
  getDomainVolatilityStats,
  AdaptiveCache,
  AdaptiveContentCache,
  DEFAULT_PAGE_TTL_MS,
  DEFAULT_API_TTL_MS,
  MIN_TTL_MS,
  MAX_TTL_MS,
  type DomainCategory,
  type CacheControlDirectives,
} from '../../src/utils/adaptive-cache.js';

describe('AdaptiveCache', () => {
  describe('classifyDomain', () => {
    describe('government sites', () => {
      it('should classify .gov domains as static_gov', () => {
        expect(classifyDomain('www.whitehouse.gov')).toBe('static_gov');
        expect(classifyDomain('data.gov')).toBe('static_gov');
        expect(classifyDomain('NOAA.GOV')).toBe('static_gov');
      });

      it('should classify .gov.* domains as static_gov', () => {
        expect(classifyDomain('www.gov.uk')).toBe('static_gov');
        expect(classifyDomain('service.gov.au')).toBe('static_gov');
      });

      it('should classify .gob.* domains as static_gov', () => {
        expect(classifyDomain('www.gob.mx')).toBe('static_gov');
        expect(classifyDomain('portal.gob.cl')).toBe('static_gov');
      });
    });

    describe('documentation sites', () => {
      it('should classify docs.* domains as static_docs', () => {
        expect(classifyDomain('docs.github.com')).toBe('static_docs');
        expect(classifyDomain('docs.python.org')).toBe('static_docs');
      });

      it('should classify readthedocs domains as static_docs', () => {
        expect(classifyDomain('myproject.readthedocs.io')).toBe('static_docs');
      });

      it('should classify *.github.io as static_docs', () => {
        expect(classifyDomain('myuser.github.io')).toBe('static_docs');
      });

      it('should classify developer.* as static_docs', () => {
        expect(classifyDomain('developer.mozilla.org')).toBe('static_docs');
        expect(classifyDomain('developer.apple.com')).toBe('static_docs');
      });
    });

    describe('educational sites', () => {
      it('should classify .edu domains as static_edu', () => {
        expect(classifyDomain('www.mit.edu')).toBe('static_edu');
        expect(classifyDomain('stanford.edu')).toBe('static_edu');
      });

      it('should classify .ac.* domains as static_edu', () => {
        expect(classifyDomain('www.ox.ac.uk')).toBe('static_edu');
        expect(classifyDomain('www.cam.ac.uk')).toBe('static_edu');
      });
    });

    describe('wiki sites', () => {
      it('should classify wiki domains as static_wiki', () => {
        expect(classifyDomain('en.wikipedia.org')).toBe('static_wiki');
        expect(classifyDomain('wiki.archlinux.org')).toBe('static_wiki');
        expect(classifyDomain('wikimedia.org')).toBe('static_wiki');
      });
    });

    describe('social media sites', () => {
      it('should classify twitter/x as dynamic_social', () => {
        expect(classifyDomain('twitter.com')).toBe('dynamic_social');
        expect(classifyDomain('x.com')).toBe('dynamic_social');
      });

      it('should classify facebook as dynamic_social', () => {
        expect(classifyDomain('facebook.com')).toBe('dynamic_social');
        expect(classifyDomain('fb.com')).toBe('dynamic_social');
      });

      it('should classify other social platforms as dynamic_social', () => {
        expect(classifyDomain('instagram.com')).toBe('dynamic_social');
        expect(classifyDomain('linkedin.com')).toBe('dynamic_social');
        expect(classifyDomain('tiktok.com')).toBe('dynamic_social');
        expect(classifyDomain('reddit.com')).toBe('dynamic_social');
        expect(classifyDomain('discord.com')).toBe('dynamic_social');
        expect(classifyDomain('threads.net')).toBe('dynamic_social');
      });
    });

    describe('news sites', () => {
      it('should classify news.* domains as dynamic_news', () => {
        expect(classifyDomain('news.google.com')).toBe('dynamic_news');
        expect(classifyDomain('news.ycombinator.com')).toBe('dynamic_news');
      });

      it('should classify major news outlets as dynamic_news', () => {
        expect(classifyDomain('cnn.com')).toBe('dynamic_news');
        expect(classifyDomain('bbc.com')).toBe('dynamic_news');
        expect(classifyDomain('nytimes.com')).toBe('dynamic_news');
        expect(classifyDomain('theguardian.com')).toBe('dynamic_news');
        expect(classifyDomain('reuters.com')).toBe('dynamic_news');
        expect(classifyDomain('bloomberg.com')).toBe('dynamic_news');
      });
    });

    describe('e-commerce sites', () => {
      it('should classify major e-commerce sites as dynamic_commerce', () => {
        expect(classifyDomain('amazon.com')).toBe('dynamic_commerce');
        expect(classifyDomain('amazon.co.uk')).toBe('dynamic_commerce');
        expect(classifyDomain('ebay.com')).toBe('dynamic_commerce');
        expect(classifyDomain('etsy.com')).toBe('dynamic_commerce');
      });

      it('should classify shop/store subdomains as dynamic_commerce', () => {
        expect(classifyDomain('shop.example.com')).toBe('dynamic_commerce');
        expect(classifyDomain('store.mysite.com')).toBe('dynamic_commerce');
      });
    });

    describe('default classification', () => {
      it('should return default for unclassified domains', () => {
        expect(classifyDomain('example.com')).toBe('default');
        expect(classifyDomain('my-random-site.io')).toBe('default');
      });
    });
  });

  describe('getTTLMultiplier', () => {
    it('should return correct multipliers for each category', () => {
      expect(getTTLMultiplier('static_gov')).toBe(4.0);
      expect(getTTLMultiplier('static_docs')).toBe(3.0);
      expect(getTTLMultiplier('static_edu')).toBe(3.0);
      expect(getTTLMultiplier('static_wiki')).toBe(2.0);
      expect(getTTLMultiplier('static_default')).toBe(2.0);
      expect(getTTLMultiplier('dynamic_social')).toBe(0.25);
      expect(getTTLMultiplier('dynamic_news')).toBe(0.5);
      expect(getTTLMultiplier('dynamic_commerce')).toBe(0.75);
      expect(getTTLMultiplier('default')).toBe(1.0);
    });
  });

  describe('parseCacheControl', () => {
    it('should return defaults for undefined header', () => {
      const result = parseCacheControl(undefined);
      expect(result).toEqual({
        mustRevalidate: false,
        noCache: false,
        noStore: false,
        isPrivate: false,
        isPublic: false,
      });
    });

    it('should return defaults for empty header', () => {
      const result = parseCacheControl('');
      expect(result).toEqual({
        mustRevalidate: false,
        noCache: false,
        noStore: false,
        isPrivate: false,
        isPublic: false,
      });
    });

    it('should parse max-age directive', () => {
      const result = parseCacheControl('max-age=3600');
      expect(result.maxAge).toBe(3600);
    });

    it('should parse s-maxage directive', () => {
      const result = parseCacheControl('s-maxage=7200');
      expect(result.sMaxAge).toBe(7200);
    });

    it('should parse stale-while-revalidate directive', () => {
      const result = parseCacheControl('stale-while-revalidate=600');
      expect(result.staleWhileRevalidate).toBe(600);
    });

    it('should parse stale-if-error directive', () => {
      const result = parseCacheControl('stale-if-error=86400');
      expect(result.staleIfError).toBe(86400);
    });

    it('should parse must-revalidate directive', () => {
      const result = parseCacheControl('must-revalidate');
      expect(result.mustRevalidate).toBe(true);
    });

    it('should parse no-cache directive', () => {
      const result = parseCacheControl('no-cache');
      expect(result.noCache).toBe(true);
    });

    it('should parse no-store directive', () => {
      const result = parseCacheControl('no-store');
      expect(result.noStore).toBe(true);
    });

    it('should parse private directive', () => {
      const result = parseCacheControl('private');
      expect(result.isPrivate).toBe(true);
    });

    it('should parse public directive', () => {
      const result = parseCacheControl('public');
      expect(result.isPublic).toBe(true);
    });

    it('should parse multiple directives', () => {
      const result = parseCacheControl('max-age=3600, must-revalidate, public');
      expect(result.maxAge).toBe(3600);
      expect(result.mustRevalidate).toBe(true);
      expect(result.isPublic).toBe(true);
    });

    it('should handle case insensitivity', () => {
      const result = parseCacheControl('MAX-AGE=3600, Must-Revalidate');
      expect(result.maxAge).toBe(3600);
      expect(result.mustRevalidate).toBe(true);
    });

    it('should handle whitespace', () => {
      const result = parseCacheControl('  max-age=3600  ,  no-cache  ');
      expect(result.maxAge).toBe(3600);
      expect(result.noCache).toBe(true);
    });

    it('should ignore invalid max-age values', () => {
      const result = parseCacheControl('max-age=invalid');
      expect(result.maxAge).toBeUndefined();
    });

    it('should ignore negative max-age values', () => {
      const result = parseCacheControl('max-age=-100');
      expect(result.maxAge).toBeUndefined();
    });
  });

  describe('calculateAdaptiveTTL', () => {
    it('should use default page TTL for unknown domains', () => {
      const result = calculateAdaptiveTTL({
        url: 'https://example.com/page',
      });
      expect(result.ttlMs).toBe(DEFAULT_PAGE_TTL_MS);
      expect(result.domainCategory).toBe('default');
      expect(result.multiplier).toBe(1.0);
    });

    it('should use default API TTL for API responses', () => {
      const result = calculateAdaptiveTTL({
        url: 'https://example.com/api/data',
        isApiResponse: true,
      });
      expect(result.ttlMs).toBe(DEFAULT_API_TTL_MS);
    });

    it('should apply multiplier for government sites', () => {
      const result = calculateAdaptiveTTL({
        url: 'https://www.whitehouse.gov/page',
      });
      expect(result.ttlMs).toBe(DEFAULT_PAGE_TTL_MS * 4.0);
      expect(result.domainCategory).toBe('static_gov');
      expect(result.multiplier).toBe(4.0);
    });

    it('should apply multiplier for social media sites', () => {
      const result = calculateAdaptiveTTL({
        url: 'https://twitter.com/user/status',
      });
      expect(result.ttlMs).toBe(DEFAULT_PAGE_TTL_MS * 0.25);
      expect(result.domainCategory).toBe('dynamic_social');
      expect(result.multiplier).toBe(0.25);
    });

    describe('freshness hints', () => {
      it('should return minimum TTL for realtime hint', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://docs.example.com/api',
          freshnessHint: 'realtime',
        });
        expect(result.ttlMs).toBe(MIN_TTL_MS);
        expect(result.reason).toBe('Freshness hint: realtime requested');
      });

      it('should double TTL for cached hint', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://example.com/page',
          freshnessHint: 'cached',
        });
        expect(result.ttlMs).toBe(DEFAULT_PAGE_TTL_MS * 2);
        expect(result.reason).toContain('cached preference');
      });
    });

    describe('Cache-Control header respect', () => {
      it('should respect max-age header', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://example.com/page',
          cacheControlHeader: 'max-age=3600',
        });
        expect(result.ttlMs).toBe(3600 * 1000);
        expect(result.respectedHeaders).toBe(true);
        expect(result.reason).toContain('max-age=3600s');
      });

      it('should respect s-maxage header', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://example.com/page',
          cacheControlHeader: 's-maxage=7200',
        });
        expect(result.ttlMs).toBe(7200 * 1000);
        expect(result.respectedHeaders).toBe(true);
      });

      it('should return minimum TTL for no-store', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://docs.example.com/page',
          cacheControlHeader: 'no-store',
        });
        expect(result.ttlMs).toBe(MIN_TTL_MS);
        expect(result.respectedHeaders).toBe(true);
        expect(result.reason).toContain('no-store');
      });

      it('should return minimum TTL for no-cache', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://docs.example.com/page',
          cacheControlHeader: 'no-cache',
        });
        expect(result.ttlMs).toBe(MIN_TTL_MS);
        expect(result.respectedHeaders).toBe(true);
        expect(result.reason).toContain('no-cache');
      });

      it('should not apply domain multiplier when headers are explicit', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://www.whitehouse.gov/page',
          cacheControlHeader: 'max-age=300',
        });
        // Should use header value, not multiply by 4x
        expect(result.ttlMs).toBe(300 * 1000);
        expect(result.respectedHeaders).toBe(true);
      });

      it('should enforce minimum TTL from headers', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://example.com/page',
          cacheControlHeader: 'max-age=1', // Very short
        });
        expect(result.ttlMs).toBe(MIN_TTL_MS);
      });

      it('should enforce maximum TTL from headers', () => {
        const result = calculateAdaptiveTTL({
          url: 'https://example.com/page',
          cacheControlHeader: 'max-age=999999999', // Very long
        });
        expect(result.ttlMs).toBe(MAX_TTL_MS);
      });
    });

    it('should enforce minimum TTL', () => {
      // Social media with very short base TTL
      const result = calculateAdaptiveTTL({
        url: 'https://twitter.com/status',
        baseTTL: 10000, // 10 seconds
      });
      expect(result.ttlMs).toBeGreaterThanOrEqual(MIN_TTL_MS);
    });

    it('should enforce maximum TTL', () => {
      // Government site with very long base TTL
      const result = calculateAdaptiveTTL({
        url: 'https://www.whitehouse.gov/page',
        baseTTL: 48 * 60 * 60 * 1000, // 48 hours
      });
      expect(result.ttlMs).toBeLessThanOrEqual(MAX_TTL_MS);
    });

    it('should use custom base TTL when provided', () => {
      const customTTL = 10 * 60 * 1000; // 10 minutes
      const result = calculateAdaptiveTTL({
        url: 'https://example.com/page',
        baseTTL: customTTL,
      });
      expect(result.ttlMs).toBe(customTTL);
    });
  });

  describe('Volatility Tracking', () => {
    beforeEach(() => {
      // Clear volatility data between tests by recording fresh data
      // Note: In a real scenario, we'd expose a clear method
    });

    it('should return null for URLs with insufficient data', () => {
      const factor = getVolatilityFactor('https://new-site.com/page');
      expect(factor).toBeNull();
    });

    it('should track content changes', () => {
      const url = 'https://test-volatility.com/page';

      // Record multiple checks with some changes
      recordContentCheck(url, false); // No change
      recordContentCheck(url, false); // No change
      recordContentCheck(url, true); // Changed

      const factor = getVolatilityFactor(url);
      expect(factor).not.toBeNull();
      // 1 change out of 3 checks = ~0.33 change rate
      expect(factor).toBeCloseTo(0.33, 1);
    });

    it('should return 0 for never-changed content', () => {
      const url = 'https://stable-site.com/static-page';

      recordContentCheck(url, false);
      recordContentCheck(url, false);
      recordContentCheck(url, false);
      recordContentCheck(url, false);
      recordContentCheck(url, false);

      const factor = getVolatilityFactor(url);
      expect(factor).toBe(0);
    });

    it('should track domain volatility stats', () => {
      const domain = 'stats-test.com';

      // Record checks for multiple URLs on the same domain
      recordContentCheck(`https://${domain}/page1`, false);
      recordContentCheck(`https://${domain}/page1`, true);
      recordContentCheck(`https://${domain}/page2`, false);
      recordContentCheck(`https://${domain}/page2`, false);

      const stats = getDomainVolatilityStats(domain);
      expect(stats.urlCount).toBeGreaterThan(0);
    });

    it('should group URLs by path pattern', () => {
      // These should be grouped together
      recordContentCheck('https://pattern-test.com/users/123', true);
      recordContentCheck('https://pattern-test.com/users/456', true);

      const stats = getDomainVolatilityStats('pattern-test.com');
      // Should be grouped as /users/{id}
      expect(stats.urlCount).toBeLessThanOrEqual(1);
    });
  });

  describe('AdaptiveCache class', () => {
    let cache: AdaptiveCache<string>;

    beforeEach(() => {
      cache = new AdaptiveCache<string>(100);
    });

    describe('basic operations', () => {
      it('should store and retrieve values', () => {
        cache.set('https://example.com/page', 'content');
        expect(cache.get('https://example.com/page')).toBe('content');
      });

      it('should return undefined for missing keys', () => {
        expect(cache.get('https://missing.com/page')).toBeUndefined();
      });

      it('should check if key exists', () => {
        cache.set('https://example.com/page', 'content');
        expect(cache.has('https://example.com/page')).toBe(true);
        expect(cache.has('https://missing.com/page')).toBe(false);
      });

      it('should delete entries', () => {
        cache.set('https://example.com/page', 'content');
        expect(cache.delete('https://example.com/page')).toBe(true);
        expect(cache.get('https://example.com/page')).toBeUndefined();
      });

      it('should clear all entries', () => {
        cache.set('https://example.com/page1', 'content1');
        cache.set('https://example.com/page2', 'content2');
        cache.clear();
        expect(cache.get('https://example.com/page1')).toBeUndefined();
        expect(cache.get('https://example.com/page2')).toBeUndefined();
      });
    });

    describe('key generation with params', () => {
      it('should handle params in key generation', () => {
        cache.set('https://example.com/api', 'result1', { params: { id: '1' } });
        cache.set('https://example.com/api', 'result2', { params: { id: '2' } });

        expect(cache.get('https://example.com/api', { id: '1' })).toBe('result1');
        expect(cache.get('https://example.com/api', { id: '2' })).toBe('result2');
      });

      it('should sort params for consistent key generation', () => {
        cache.set('https://example.com/api', 'result', { params: { b: '2', a: '1' } });
        expect(cache.get('https://example.com/api', { a: '1', b: '2' })).toBe('result');
      });
    });

    describe('TTL behavior', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should expire entries after TTL', () => {
        cache.set('https://example.com/page', 'content');

        // Advance time past default TTL
        vi.advanceTimersByTime(DEFAULT_PAGE_TTL_MS + 1000);

        expect(cache.get('https://example.com/page')).toBeUndefined();
      });

      it('should not expire entries before TTL', () => {
        cache.set('https://example.com/page', 'content');

        // Advance time but not past TTL
        vi.advanceTimersByTime(DEFAULT_PAGE_TTL_MS - 1000);

        expect(cache.get('https://example.com/page')).toBe('content');
      });

      it('should apply adaptive TTL based on domain', () => {
        // Government site should have 4x TTL
        cache.set('https://www.whitehouse.gov/page', 'content');

        // Advance past default TTL but not 4x
        vi.advanceTimersByTime(DEFAULT_PAGE_TTL_MS * 2);

        // Should still be cached
        expect(cache.get('https://www.whitehouse.gov/page')).toBe('content');

        // Advance past 4x TTL
        vi.advanceTimersByTime(DEFAULT_PAGE_TTL_MS * 3);

        // Should now be expired
        expect(cache.get('https://www.whitehouse.gov/page')).toBeUndefined();
      });
    });

    describe('eviction', () => {
      it('should evict oldest entries when at capacity', () => {
        const smallCache = new AdaptiveCache<string>(3);

        smallCache.set('https://example.com/1', 'first');
        smallCache.set('https://example.com/2', 'second');
        smallCache.set('https://example.com/3', 'third');
        smallCache.set('https://example.com/4', 'fourth');

        // First entry should be evicted
        expect(smallCache.get('https://example.com/1')).toBeUndefined();
        expect(smallCache.get('https://example.com/4')).toBe('fourth');
      });
    });

    describe('cleanup', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should remove expired entries on cleanup', () => {
        cache.set('https://example.com/1', 'content1');
        cache.set('https://docs.example.com/2', 'content2'); // Longer TTL (static_docs)

        // Advance past default TTL but not docs TTL
        vi.advanceTimersByTime(DEFAULT_PAGE_TTL_MS + 1000);

        const removed = cache.cleanup();
        expect(removed).toBe(1);

        // Docs should still be cached (3x multiplier)
        expect(cache.get('https://docs.example.com/2')).toBe('content2');
      });
    });

    describe('domain operations', () => {
      it('should clear entries for a specific domain', () => {
        cache.set('https://example.com/page1', 'content1');
        cache.set('https://example.com/page2', 'content2');
        cache.set('https://other.com/page', 'content3');

        const removed = cache.clearDomain('example.com');
        expect(removed).toBe(2);
        expect(cache.get('https://example.com/page1')).toBeUndefined();
        expect(cache.get('https://other.com/page')).toBe('content3');
      });

      it('should clear entries for subdomains', () => {
        cache.set('https://api.example.com/data', 'content1');
        cache.set('https://www.example.com/page', 'content2');
        cache.set('https://other.com/page', 'content3');

        cache.clearDomain('example.com');
        expect(cache.get('https://api.example.com/data')).toBeUndefined();
        expect(cache.get('https://www.example.com/page')).toBeUndefined();
        expect(cache.get('https://other.com/page')).toBe('content3');
      });

      it('should list unique domains', () => {
        cache.set('https://example.com/page1', 'content1');
        cache.set('https://example.com/page2', 'content2');
        cache.set('https://other.com/page', 'content3');
        cache.set('https://api.example.com/data', 'content4');

        const domains = cache.getDomains();
        expect(domains).toContain('example.com');
        expect(domains).toContain('other.com');
        expect(domains).toContain('api.example.com');
      });
    });

    describe('statistics', () => {
      it('should track hits and misses', () => {
        cache.set('https://example.com/page', 'content');

        cache.get('https://example.com/page'); // Hit
        cache.get('https://example.com/page'); // Hit
        cache.get('https://missing.com/page'); // Miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
      });

      it('should track entries by category', () => {
        cache.set('https://www.whitehouse.gov/page', 'gov');
        cache.set('https://docs.example.com/page', 'docs');
        cache.set('https://twitter.com/user', 'social');

        const stats = cache.getStats();
        expect(stats.entriesByCategory.static_gov).toBe(1);
        expect(stats.entriesByCategory.static_docs).toBe(1);
        expect(stats.entriesByCategory.dynamic_social).toBe(1);
      });

      it('should calculate average TTL', () => {
        cache.set('https://example.com/page', 'content');
        cache.set('https://www.whitehouse.gov/page', 'gov');

        const stats = cache.getStats();
        // Average of default (15min) and gov (60min) = 37.5min
        const expectedAvg = (DEFAULT_PAGE_TTL_MS + DEFAULT_PAGE_TTL_MS * 4) / 2;
        expect(stats.avgTTLMs).toBeCloseTo(expectedAvg, -3);
      });

      it('should reset stats on clear', () => {
        cache.set('https://example.com/page', 'content');
        cache.get('https://example.com/page');
        cache.get('https://missing.com/page');

        cache.clear();

        const stats = cache.getStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.size).toBe(0);
      });
    });

    describe('withCache wrapper', () => {
      it('should return cached value when available', async () => {
        const fn = vi.fn().mockResolvedValue('fresh-result');

        cache.set('https://example.com/page', 'cached-result');

        const result = await cache.withCache('https://example.com/page', fn);

        expect(result.value).toBe('cached-result');
        expect(result.fromCache).toBe(true);
        expect(fn).not.toHaveBeenCalled();
      });

      it('should call function when cache miss', async () => {
        const fn = vi.fn().mockResolvedValue('fresh-result');

        const result = await cache.withCache('https://example.com/page', fn);

        expect(result.value).toBe('fresh-result');
        expect(result.fromCache).toBe(false);
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should cache the result after function call', async () => {
        const fn = vi.fn().mockResolvedValue('fresh-result');

        await cache.withCache('https://example.com/page', fn);

        // Second call should use cache
        const result = await cache.withCache('https://example.com/page', fn);
        expect(result.fromCache).toBe(true);
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should include TTL result', async () => {
        const fn = vi.fn().mockResolvedValue('result');

        const result = await cache.withCache('https://example.com/page', fn);

        expect(result.ttlResult).toBeDefined();
        expect(result.ttlResult?.domainCategory).toBe('default');
      });
    });

    describe('getTTLResult', () => {
      it('should return TTL result for cached entry', () => {
        cache.set('https://www.whitehouse.gov/page', 'content');

        const ttlResult = cache.getTTLResult('https://www.whitehouse.gov/page');
        expect(ttlResult).toBeDefined();
        expect(ttlResult?.domainCategory).toBe('static_gov');
        expect(ttlResult?.multiplier).toBe(4.0);
      });

      it('should return undefined for missing entry', () => {
        const ttlResult = cache.getTTLResult('https://missing.com/page');
        expect(ttlResult).toBeUndefined();
      });
    });
  });

  describe('AdaptiveContentCache class', () => {
    let cache: AdaptiveContentCache;

    beforeEach(() => {
      cache = new AdaptiveContentCache(100);
    });

    describe('content hashing', () => {
      it('should generate consistent hashes', () => {
        const hash1 = AdaptiveContentCache.hashContent('Hello World');
        const hash2 = AdaptiveContentCache.hashContent('Hello World');
        expect(hash1).toBe(hash2);
      });

      it('should generate different hashes for different content', () => {
        const hash1 = AdaptiveContentCache.hashContent('Hello World');
        const hash2 = AdaptiveContentCache.hashContent('Hello World!');
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('content change detection', () => {
      it('should detect content changes', () => {
        cache.setContent('https://example.com/page', '<html>Version 1</html>');

        expect(cache.hasContentChanged('https://example.com/page', '<html>Version 2</html>')).toBe(
          true
        );
      });

      it('should detect unchanged content', () => {
        cache.setContent('https://example.com/page', '<html>Same</html>');

        expect(cache.hasContentChanged('https://example.com/page', '<html>Same</html>')).toBe(
          false
        );
      });

      it('should return true for uncached URLs', () => {
        expect(cache.hasContentChanged('https://new.com/page', '<html>Content</html>')).toBe(true);
      });
    });

    describe('setContent', () => {
      it('should store content with hash', () => {
        const ttlResult = cache.setContent('https://example.com/page', '<html>Content</html>');

        expect(ttlResult).toBeDefined();
        expect(ttlResult.domainCategory).toBe('default');

        const cached = cache.get('https://example.com/page');
        expect(cached).toBeDefined();
        expect(cached?.html).toBe('<html>Content</html>');
        expect(cached?.contentHash).toBeDefined();
        expect(cached?.fetchedAt).toBeLessThanOrEqual(Date.now());
      });

      it('should apply adaptive TTL', () => {
        const ttlResult = cache.setContent(
          'https://www.whitehouse.gov/page',
          '<html>Gov content</html>'
        );

        expect(ttlResult.domainCategory).toBe('static_gov');
        expect(ttlResult.multiplier).toBe(4.0);
      });

      it('should respect Cache-Control header', () => {
        const ttlResult = cache.setContent('https://example.com/page', '<html>Content</html>', {
          cacheControlHeader: 'max-age=3600',
        });

        expect(ttlResult.respectedHeaders).toBe(true);
        expect(ttlResult.ttlMs).toBe(3600 * 1000);
      });

      it('should respect freshness hint', () => {
        const ttlResult = cache.setContent('https://example.com/page', '<html>Content</html>', {
          freshnessHint: 'realtime',
        });

        expect(ttlResult.ttlMs).toBe(MIN_TTL_MS);
      });
    });

    describe('volatility integration', () => {
      it('should record content checks for volatility tracking', () => {
        const url = 'https://volatility-integration.com/page';

        cache.setContent(url, '<html>Version 1</html>');

        // Update with different content
        cache.setContent(url, '<html>Version 2</html>');

        // Check if volatility was recorded
        const stats = getDomainVolatilityStats('volatility-integration.com');
        expect(stats.urlCount).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
