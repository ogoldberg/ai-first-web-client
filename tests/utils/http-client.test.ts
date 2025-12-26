/**
 * HTTP Client with Connection Pooling Tests (P-004)
 *
 * Tests for the HttpClient class and related utility functions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HttpClient,
  getGlobalHttpClient,
  configureGlobalHttpClient,
  resetGlobalHttpClient,
  pooledFetch,
  getPoolStats,
  getPoolUtilization,
  createDomainFetch,
  type HttpClientConfig,
  type PoolStats,
} from '../../src/utils/http-client.js';

describe('HTTP Client with Connection Pooling', () => {
  describe('HttpClient class', () => {
    let client: HttpClient;

    beforeEach(() => {
      client = new HttpClient();
    });

    afterEach(() => {
      client.destroy();
    });

    describe('constructor', () => {
      it('should create client with default configuration', () => {
        const stats = client.getStats();
        expect(stats.totalRequests).toBe(0);
        expect(stats.connectionsReused).toBe(0);
        expect(stats.newConnections).toBe(0);
      });

      it('should create client with custom configuration', () => {
        const customClient = new HttpClient({
          maxSockets: 20,
          maxTotalSockets: 100,
          keepAlive: true,
          timeout: 30000,
        });
        expect(customClient).toBeDefined();
        customClient.destroy();
      });

      it('should accept partial configuration', () => {
        const partialClient = new HttpClient({ maxSockets: 5 });
        expect(partialClient).toBeDefined();
        partialClient.destroy();
      });
    });

    describe('getStats', () => {
      it('should return initial stats', () => {
        const stats = client.getStats();

        expect(stats).toHaveProperty('activeSockets');
        expect(stats).toHaveProperty('pendingRequests');
        expect(stats).toHaveProperty('totalActiveSockets');
        expect(stats).toHaveProperty('totalPendingRequests');
        expect(stats).toHaveProperty('uniqueHosts');
        expect(stats).toHaveProperty('totalRequests');
        expect(stats).toHaveProperty('connectionsReused');
        expect(stats).toHaveProperty('newConnections');
      });

      it('should track total requests', async () => {
        // Mock fetch to avoid actual network calls
        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        vi.stubGlobal('fetch', mockFetch);

        await client.fetch('https://example.com/test1');
        await client.fetch('https://example.com/test2');

        const stats = client.getStats();
        expect(stats.totalRequests).toBe(2);

        vi.unstubAllGlobals();
      });
    });

    describe('getHttpAgent and getHttpsAgent', () => {
      it('should return http agent', () => {
        const agent = client.getHttpAgent();
        expect(agent).toBeDefined();
        expect(agent).toHaveProperty('maxSockets');
      });

      it('should return https agent', () => {
        const agent = client.getHttpsAgent();
        expect(agent).toBeDefined();
        expect(agent).toHaveProperty('maxSockets');
      });
    });

    describe('getUtilization', () => {
      it('should return utilization percentages', () => {
        const utilization = client.getUtilization();

        expect(utilization).toHaveProperty('http');
        expect(utilization).toHaveProperty('https');
        expect(utilization).toHaveProperty('total');

        expect(typeof utilization.http).toBe('number');
        expect(typeof utilization.https).toBe('number');
        expect(typeof utilization.total).toBe('number');

        // Initially should be 0%
        expect(utilization.http).toBe(0);
        expect(utilization.https).toBe(0);
        expect(utilization.total).toBe(0);
      });
    });

    describe('resetMetrics', () => {
      it('should reset all metrics to zero', async () => {
        // Mock fetch
        const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
        vi.stubGlobal('fetch', mockFetch);

        await client.fetch('https://example.com/test');
        expect(client.getStats().totalRequests).toBe(1);

        client.resetMetrics();

        const stats = client.getStats();
        expect(stats.totalRequests).toBe(0);
        expect(stats.connectionsReused).toBe(0);
        expect(stats.newConnections).toBe(0);

        vi.unstubAllGlobals();
      });
    });

    describe('fetch', () => {
      beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test')));
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      it('should make HTTP request', async () => {
        const response = await client.fetch('http://example.com/test');
        expect(response).toBeInstanceOf(Response);
      });

      it('should make HTTPS request', async () => {
        const response = await client.fetch('https://example.com/test');
        expect(response).toBeInstanceOf(Response);
      });

      it('should pass options to fetch', async () => {
        await client.fetch('https://example.com/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true }),
        });

        expect(fetch).toHaveBeenCalledWith(
          'https://example.com/test',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      it('should handle URL object', async () => {
        const url = new URL('https://example.com/path');
        await client.fetch(url);
        expect(client.getStats().totalRequests).toBe(1);
      });

      it('should skip pooling when requested', async () => {
        await client.fetch('https://example.com/test', { skipPooling: true });
        expect(client.getStats().totalRequests).toBe(1);
      });

      it('should handle custom timeout', async () => {
        await client.fetch('https://example.com/test', { timeout: 5000 });
        expect(client.getStats().totalRequests).toBe(1);
      });

      it('should handle abort signal', async () => {
        const controller = new AbortController();
        const fetchPromise = client.fetch('https://example.com/test', {
          signal: controller.signal,
        });

        // Don't abort, just verify it works
        const response = await fetchPromise;
        expect(response).toBeInstanceOf(Response);
      });
    });

    describe('destroy', () => {
      it('should destroy agents', () => {
        const testClient = new HttpClient();
        expect(() => testClient.destroy()).not.toThrow();
      });
    });
  });

  describe('Global HTTP Client', () => {
    afterEach(() => {
      resetGlobalHttpClient();
    });

    describe('getGlobalHttpClient', () => {
      it('should return singleton instance', () => {
        const client1 = getGlobalHttpClient();
        const client2 = getGlobalHttpClient();
        expect(client1).toBe(client2);
      });

      it('should be an HttpClient instance', () => {
        const client = getGlobalHttpClient();
        expect(client).toBeInstanceOf(HttpClient);
      });
    });

    describe('configureGlobalHttpClient', () => {
      it('should configure global client', () => {
        configureGlobalHttpClient({ maxSockets: 20 });
        const client = getGlobalHttpClient();
        expect(client).toBeInstanceOf(HttpClient);
      });

      it('should replace existing client', () => {
        const client1 = getGlobalHttpClient();
        configureGlobalHttpClient({ maxSockets: 25 });
        const client2 = getGlobalHttpClient();
        expect(client1).not.toBe(client2);
      });
    });

    describe('resetGlobalHttpClient', () => {
      it('should reset global client', () => {
        const client1 = getGlobalHttpClient();
        resetGlobalHttpClient();
        const client2 = getGlobalHttpClient();
        expect(client1).not.toBe(client2);
      });

      it('should handle being called when no client exists', () => {
        expect(() => resetGlobalHttpClient()).not.toThrow();
        expect(() => resetGlobalHttpClient()).not.toThrow();
      });
    });
  });

  describe('pooledFetch', () => {
    beforeEach(() => {
      resetGlobalHttpClient();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test')));
    });

    afterEach(() => {
      resetGlobalHttpClient();
      vi.unstubAllGlobals();
    });

    it('should make request using global client', async () => {
      const response = await pooledFetch('https://example.com/test');
      expect(response).toBeInstanceOf(Response);
    });

    it('should track requests in global stats', async () => {
      await pooledFetch('https://example.com/test1');
      await pooledFetch('https://example.com/test2');

      const stats = getPoolStats();
      expect(stats.totalRequests).toBe(2);
    });

    it('should accept options', async () => {
      await pooledFetch('https://example.com/test', {
        method: 'POST',
        headers: { 'X-Custom': 'value' },
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/test',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('getPoolStats', () => {
    beforeEach(() => {
      resetGlobalHttpClient();
    });

    afterEach(() => {
      resetGlobalHttpClient();
    });

    it('should return stats from global client', () => {
      const stats = getPoolStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('totalActiveSockets');
    });
  });

  describe('getPoolUtilization', () => {
    beforeEach(() => {
      resetGlobalHttpClient();
    });

    afterEach(() => {
      resetGlobalHttpClient();
    });

    it('should return utilization from global client', () => {
      const utilization = getPoolUtilization();
      expect(utilization).toHaveProperty('http');
      expect(utilization).toHaveProperty('https');
      expect(utilization).toHaveProperty('total');
    });
  });

  describe('createDomainFetch', () => {
    beforeEach(() => {
      resetGlobalHttpClient();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test')));
    });

    afterEach(() => {
      resetGlobalHttpClient();
      vi.unstubAllGlobals();
    });

    it('should create domain-specific fetch function', async () => {
      const githubFetch = createDomainFetch('api.github.com');
      await githubFetch('/repos/user/repo');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/user/repo',
        expect.any(Object)
      );
    });

    it('should handle domain with protocol', async () => {
      const httpFetch = createDomainFetch('http://api.example.com');
      await httpFetch('/endpoint');

      expect(fetch).toHaveBeenCalledWith(
        'http://api.example.com/endpoint',
        expect.any(Object)
      );
    });

    it('should handle path without leading slash', async () => {
      const domainFetch = createDomainFetch('example.com');
      await domainFetch('path/to/resource');

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/path/to/resource',
        expect.any(Object)
      );
    });

    it('should apply default options', async () => {
      const domainFetch = createDomainFetch('api.example.com', {
        headers: { 'X-API-Key': 'secret' },
      });
      await domainFetch('/data');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-API-Key': 'secret' }),
        })
      );
    });

    it('should allow overriding default options', async () => {
      const domainFetch = createDomainFetch('api.example.com', {
        method: 'GET',
      });
      await domainFetch('/data', { method: 'POST' });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle full URL paths', async () => {
      const domainFetch = createDomainFetch('api.example.com');
      await domainFetch('https://other.com/resource');

      expect(fetch).toHaveBeenCalledWith(
        'https://other.com/resource',
        expect.any(Object)
      );
    });
  });

  describe('Configuration options', () => {
    it('should support all configuration options', () => {
      const config: HttpClientConfig = {
        maxSockets: 15,
        maxTotalSockets: 75,
        keepAliveTimeout: 45000,
        timeout: 90000,
        keepAlive: true,
        scheduling: 'lifo',
      };

      const client = new HttpClient(config);
      expect(client).toBeDefined();
      client.destroy();
    });

    it('should support fifo scheduling', () => {
      const client = new HttpClient({ scheduling: 'fifo' });
      expect(client).toBeDefined();
      client.destroy();
    });

    it('should support lifo scheduling', () => {
      const client = new HttpClient({ scheduling: 'lifo' });
      expect(client).toBeDefined();
      client.destroy();
    });

    it('should handle keepAlive false', () => {
      const client = new HttpClient({ keepAlive: false });
      expect(client).toBeDefined();
      client.destroy();
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test')));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should handle multiple concurrent requests', async () => {
      const client = new HttpClient();

      const requests = Array.from({ length: 10 }, (_, i) =>
        client.fetch(`https://example.com/request${i}`)
      );

      const responses = await Promise.all(requests);
      expect(responses).toHaveLength(10);
      expect(client.getStats().totalRequests).toBe(10);

      client.destroy();
    });

    it('should handle requests to different hosts', async () => {
      const client = new HttpClient();

      await Promise.all([
        client.fetch('https://example.com/1'),
        client.fetch('https://other.com/2'),
        client.fetch('https://another.com/3'),
      ]);

      expect(client.getStats().totalRequests).toBe(3);
      client.destroy();
    });

    it('should handle mixed HTTP and HTTPS', async () => {
      const client = new HttpClient();

      await client.fetch('http://example.com/http');
      await client.fetch('https://example.com/https');

      expect(client.getStats().totalRequests).toBe(2);
      client.destroy();
    });
  });
});
