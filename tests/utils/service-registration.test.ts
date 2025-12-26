/**
 * Service Registration Tests (D-006)
 *
 * Tests for the service registration module that bootstraps
 * core services into the DI container.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerCoreServices,
  registerAllServices,
  getRateLimiterService,
  getPageCacheService,
  getApiCacheService,
  getHttpClientService,
  clearAllCaches,
  getServiceStats,
} from '../../src/utils/service-registration.js';
import {
  ServiceContainer,
  resetServiceContainer,
  getServiceContainer,
  ServiceTokens,
} from '../../src/utils/service-container.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';
import { ResponseCache, ContentCache } from '../../src/utils/cache.js';
import { HttpClient } from '../../src/utils/http-client.js';

describe('Service Registration', () => {
  beforeEach(() => {
    resetServiceContainer();
  });

  afterEach(() => {
    resetServiceContainer();
  });

  describe('registerCoreServices', () => {
    it('should register all core services', () => {
      registerCoreServices();

      const container = getServiceContainer();
      expect(container.has(ServiceTokens.RateLimiter)).toBe(true);
      expect(container.has(ServiceTokens.PageCache)).toBe(true);
      expect(container.has(ServiceTokens.ApiCache)).toBe(true);
      expect(container.has(ServiceTokens.HttpClient)).toBe(true);
    });

    it('should create correct service instances', () => {
      registerCoreServices();

      const container = getServiceContainer();
      expect(container.get(ServiceTokens.RateLimiter)).toBeInstanceOf(RateLimiter);
      expect(container.get(ServiceTokens.PageCache)).toBeInstanceOf(ContentCache);
      expect(container.get(ServiceTokens.ApiCache)).toBeInstanceOf(ResponseCache);
      expect(container.get(ServiceTokens.HttpClient)).toBeInstanceOf(HttpClient);
    });

    it('should skip existing services by default', () => {
      const container = getServiceContainer();

      // Pre-register a custom rate limiter
      const customRateLimiter = new RateLimiter();
      container.registerInstance(ServiceTokens.RateLimiter, customRateLimiter);

      registerCoreServices();

      // Should still be the custom one
      expect(container.get(ServiceTokens.RateLimiter)).toBe(customRateLimiter);
    });

    it('should overwrite existing when skipExisting is false', () => {
      const container = getServiceContainer();

      // Pre-register a custom rate limiter
      const customRateLimiter = new RateLimiter();
      container.registerInstance(ServiceTokens.RateLimiter, customRateLimiter);

      registerCoreServices({ skipExisting: false });

      // Should be a new instance
      expect(container.get(ServiceTokens.RateLimiter)).not.toBe(customRateLimiter);
    });

    it('should work with custom container', () => {
      const customContainer = new ServiceContainer({ name: 'custom' });

      registerCoreServices({ container: customContainer });

      expect(customContainer.has(ServiceTokens.RateLimiter)).toBe(true);
      expect(customContainer.has(ServiceTokens.PageCache)).toBe(true);

      // Global container should not have these
      expect(getServiceContainer().has(ServiceTokens.RateLimiter)).toBe(false);
    });

    it('should tag services correctly', () => {
      registerCoreServices();

      const container = getServiceContainer();

      const coreServices = container.getByTag('core');
      expect(coreServices.length).toBe(4); // RateLimiter, PageCache, ApiCache, HttpClient

      const cacheServices = container.getByTag('cache');
      expect(cacheServices.length).toBe(2); // PageCache, ApiCache

      const networkServices = container.getByTag('network');
      expect(networkServices.length).toBe(1); // HttpClient
    });
  });

  describe('registerAllServices', () => {
    it('should register all services', () => {
      registerAllServices();

      const container = getServiceContainer();
      expect(container.has(ServiceTokens.RateLimiter)).toBe(true);
      expect(container.has(ServiceTokens.PageCache)).toBe(true);
    });
  });

  describe('Service getter functions', () => {
    describe('getRateLimiterService', () => {
      it('should return RateLimiter instance', () => {
        const rateLimiter = getRateLimiterService();
        expect(rateLimiter).toBeInstanceOf(RateLimiter);
      });

      it('should auto-register if not present', () => {
        const container = getServiceContainer();
        expect(container.has(ServiceTokens.RateLimiter)).toBe(false);

        getRateLimiterService();

        expect(container.has(ServiceTokens.RateLimiter)).toBe(true);
      });

      it('should return same instance on multiple calls', () => {
        const instance1 = getRateLimiterService();
        const instance2 = getRateLimiterService();
        expect(instance1).toBe(instance2);
      });
    });

    describe('getPageCacheService', () => {
      it('should return ContentCache instance', () => {
        const cache = getPageCacheService();
        expect(cache).toBeInstanceOf(ContentCache);
      });

      it('should have correct default configuration', () => {
        const cache = getPageCacheService();
        const stats = cache.getStats();
        expect(stats.ttlMs).toBe(15 * 60 * 1000); // 15 minutes
        expect(stats.maxEntries).toBe(500);
      });
    });

    describe('getApiCacheService', () => {
      it('should return ResponseCache instance', () => {
        const cache = getApiCacheService();
        expect(cache).toBeInstanceOf(ResponseCache);
      });

      it('should have correct default configuration', () => {
        const cache = getApiCacheService();
        const stats = cache.getStats();
        expect(stats.ttlMs).toBe(5 * 60 * 1000); // 5 minutes
        expect(stats.maxEntries).toBe(200);
      });
    });

    describe('getHttpClientService', () => {
      it('should return HttpClient instance', () => {
        const client = getHttpClientService();
        expect(client).toBeInstanceOf(HttpClient);
      });

      it('should track requests', async () => {
        const client = getHttpClientService();
        const stats = client.getStats();
        expect(stats.totalRequests).toBe(0);
      });
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all cache services', () => {
      registerCoreServices();

      const pageCache = getPageCacheService();
      const apiCache = getApiCacheService();

      // Add some entries
      pageCache.set('https://example.com', {
        html: '<html></html>',
        contentHash: 'abc',
        fetchedAt: Date.now(),
      });
      apiCache.set('https://api.example.com', { data: 'test' });

      expect(pageCache.getStats().size).toBe(1);
      expect(apiCache.getStats().size).toBe(1);

      clearAllCaches();

      expect(pageCache.getStats().size).toBe(0);
      expect(apiCache.getStats().size).toBe(0);
    });
  });

  describe('getServiceStats', () => {
    it('should return stats for all registered services', () => {
      registerCoreServices();

      // Access services to initialize them
      getRateLimiterService();
      getPageCacheService();
      getApiCacheService();
      getHttpClientService();

      const stats = getServiceStats();

      expect(stats.container).toBeDefined();
      expect(stats.initializationOrder).toBeDefined();
      expect(stats.rateLimiter).toBeDefined();
      expect(stats.pageCache).toBeDefined();
      expect(stats.apiCache).toBeDefined();
      expect(stats.httpClient).toBeDefined();
    });

    it('should track initialization order', () => {
      registerCoreServices();

      getRateLimiterService();
      getPageCacheService();

      const stats = getServiceStats();
      const order = stats.initializationOrder as string[];

      expect(order).toContain(ServiceTokens.RateLimiter);
      expect(order).toContain(ServiceTokens.PageCache);
    });
  });

  describe('Test isolation', () => {
    it('should allow complete reset between tests', () => {
      registerCoreServices();
      const cache1 = getPageCacheService();
      cache1.set('https://test.com', {
        html: 'test',
        contentHash: 'hash',
        fetchedAt: Date.now(),
      });

      // Simulate new test
      resetServiceContainer();

      registerCoreServices();
      const cache2 = getPageCacheService();

      // Should be a fresh instance with no data
      expect(cache2).not.toBe(cache1);
      expect(cache2.getStats().size).toBe(0);
    });

    it('should support mocking services for tests', () => {
      const container = getServiceContainer();

      // Register mock rate limiter
      const mockRateLimiter = {
        acquire: async () => {},
        throttle: async <T>(url: string, fn: () => Promise<T>) => fn(),
        getStatus: () => ({
          domain: 'test',
          requestsInLastMinute: 0,
          limit: 100,
          canRequest: true,
        }),
        setDomainConfig: () => {},
      };

      container.registerInstance(ServiceTokens.RateLimiter, mockRateLimiter);
      registerCoreServices(); // Should skip the rate limiter

      const rateLimiter = getRateLimiterService();
      expect(rateLimiter).toBe(mockRateLimiter);
    });
  });
});
