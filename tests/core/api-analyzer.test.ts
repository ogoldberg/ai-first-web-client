import { describe, it, expect, beforeEach } from 'vitest';
import { ApiAnalyzer } from '../../src/core/api-analyzer.js';
import type { NetworkRequest, ApiPattern } from '../../src/types/index.js';

describe('ApiAnalyzer', () => {
  let analyzer: ApiAnalyzer;

  beforeEach(() => {
    analyzer = new ApiAnalyzer();
  });

  // Helper to create a mock network request
  const createRequest = (overrides: Partial<NetworkRequest> = {}): NetworkRequest => ({
    url: 'https://api.example.com/v1/users',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    requestHeaders: {},
    contentType: 'application/json',
    timestamp: Date.now(),
    duration: 100,
    ...overrides,
  });

  describe('analyzeRequests', () => {
    it('should identify JSON API requests', () => {
      const requests = [createRequest()];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns).toHaveLength(1);
      expect(patterns[0].endpoint).toBe('https://api.example.com/v1/users');
      expect(patterns[0].method).toBe('GET');
    });

    it('should skip non-API requests', () => {
      const requests = [
        createRequest({
          url: 'https://example.com/page.html',
          contentType: 'text/html',
        }),
      ];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns).toHaveLength(0);
    });

    it('should detect bearer auth', () => {
      const requests = [
        createRequest({
          requestHeaders: { authorization: 'Bearer token123' },
        }),
      ];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns[0].authType).toBe('bearer');
      expect(patterns[0].authHeaders).toHaveProperty('authorization');
    });

    it('should detect cookie auth', () => {
      const requests = [
        createRequest({
          requestHeaders: { cookie: 'session=abc123' },
        }),
      ];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns[0].authType).toBe('cookie');
    });

    it('should detect API key auth', () => {
      const requests = [
        createRequest({
          requestHeaders: { 'x-api-key': 'my-api-key' },
        }),
      ];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns[0].authType).toBe('header');
    });

    it('should calculate high confidence for successful GET JSON requests', () => {
      const requests = [
        createRequest({
          status: 200,
          method: 'GET',
          contentType: 'application/json',
          responseBody: { data: 'test' },
          requestHeaders: { cookie: 'session=abc' },
        }),
      ];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns[0].confidence).toBe('high');
      expect(patterns[0].canBypass).toBe(true);
    });

    it('should calculate medium confidence for POST requests', () => {
      const requests = [
        createRequest({
          method: 'POST',
          status: 200,
          contentType: 'application/json',
        }),
      ];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns[0].confidence).toBe('medium');
    });

    it('should calculate low confidence for failed requests', () => {
      const requests = [
        createRequest({
          status: 500,
          method: 'POST',
        }),
      ];
      const patterns = analyzer.analyzeRequests(requests);

      expect(patterns[0].confidence).toBe('low');
    });
  });

  // ============================================
  // CX-009: Tier-Aware API Analysis
  // ============================================
  describe('tier-aware API analysis (CX-009)', () => {
    describe('analyzeRequestsWithTier', () => {
      it('should return patterns unchanged for playwright tier', () => {
        const requests = [
          createRequest({
            status: 200,
            method: 'GET',
            contentType: 'application/json',
            responseBody: { data: 'test' },
            requestHeaders: { cookie: 'session=abc' },
          }),
        ];

        const patterns = analyzer.analyzeRequestsWithTier(requests, 'playwright');

        expect(patterns).toHaveLength(1);
        expect(patterns[0].confidence).toBe('high');
        expect(patterns[0].canBypass).toBe(true);
        expect(patterns[0].reason).not.toContain('degraded');
      });

      it('should degrade high confidence to medium for lightweight tier', () => {
        const requests = [
          createRequest({
            status: 200,
            method: 'GET',
            contentType: 'application/json',
            responseBody: { data: 'test' },
            requestHeaders: { cookie: 'session=abc' },
          }),
        ];

        const patterns = analyzer.analyzeRequestsWithTier(requests, 'lightweight');

        expect(patterns).toHaveLength(1);
        expect(patterns[0].confidence).toBe('medium');
        expect(patterns[0].canBypass).toBe(false);
        expect(patterns[0].reason).toContain('lightweight tier');
      });

      it('should degrade medium confidence to low for lightweight tier', () => {
        const requests = [
          createRequest({
            method: 'POST',
            status: 200,
            contentType: 'application/json',
          }),
        ];

        const patterns = analyzer.analyzeRequestsWithTier(requests, 'lightweight');

        expect(patterns).toHaveLength(1);
        expect(patterns[0].confidence).toBe('low');
        expect(patterns[0].reason).toContain('confidence degraded');
      });

      it('should keep low confidence as low for lightweight tier', () => {
        const requests = [
          createRequest({
            status: 500,
            method: 'POST',
          }),
        ];

        const patterns = analyzer.analyzeRequestsWithTier(requests, 'lightweight');

        expect(patterns).toHaveLength(1);
        expect(patterns[0].confidence).toBe('low');
      });

      it('should degrade high confidence to low for intelligence tier', () => {
        const requests = [
          createRequest({
            status: 200,
            method: 'GET',
            contentType: 'application/json',
            responseBody: { data: 'test' },
            requestHeaders: { cookie: 'session=abc' },
          }),
        ];

        const patterns = analyzer.analyzeRequestsWithTier(requests, 'intelligence');

        expect(patterns).toHaveLength(1);
        expect(patterns[0].confidence).toBe('low');
        expect(patterns[0].canBypass).toBe(false);
      });

      it('should filter out non-high patterns for intelligence tier', () => {
        const requests = [
          createRequest({
            method: 'POST',
            status: 200,
            contentType: 'application/json',
          }),
        ];

        // Medium confidence patterns should be filtered out for intelligence tier
        const patterns = analyzer.analyzeRequestsWithTier(requests, 'intelligence');

        expect(patterns).toHaveLength(0);
      });

      it('should handle multiple requests with different confidence levels', () => {
        const requests = [
          // High confidence - should be medium after lightweight degradation
          createRequest({
            url: 'https://api.example.com/users',
            status: 200,
            method: 'GET',
            contentType: 'application/json',
            responseBody: { data: 'test' },
            requestHeaders: { cookie: 'session=abc' },
          }),
          // Medium confidence - should be low after lightweight degradation
          createRequest({
            url: 'https://api.example.com/posts',
            method: 'POST',
            status: 200,
            contentType: 'application/json',
          }),
        ];

        const patterns = analyzer.analyzeRequestsWithTier(requests, 'lightweight');

        expect(patterns).toHaveLength(2);
        expect(patterns.find(p => p.endpoint.includes('users'))?.confidence).toBe('medium');
        expect(patterns.find(p => p.endpoint.includes('posts'))?.confidence).toBe('low');
      });
    });

    describe('convertLightweightRequests', () => {
      it('should convert lightweight request format to NetworkRequest format', () => {
        const lightweightRequests = [
          {
            url: 'https://api.example.com/data',
            method: 'GET',
            status: 200,
            contentType: 'application/json',
            requestHeaders: { authorization: 'Bearer token' },
            responseHeaders: { 'content-type': 'application/json' },
            responseBody: { items: [1, 2, 3] },
            timestamp: 1234567890,
            duration: 150,
          },
        ];

        const converted = ApiAnalyzer.convertLightweightRequests(lightweightRequests);

        expect(converted).toHaveLength(1);
        expect(converted[0].url).toBe('https://api.example.com/data');
        expect(converted[0].method).toBe('GET');
        expect(converted[0].status).toBe(200);
        expect(converted[0].statusText).toBe('OK');
        expect(converted[0].contentType).toBe('application/json');
        expect(converted[0].requestHeaders).toEqual({ authorization: 'Bearer token' });
        expect(converted[0].headers).toEqual({ 'content-type': 'application/json' });
        expect(converted[0].responseBody).toEqual({ items: [1, 2, 3] });
        expect(converted[0].timestamp).toBe(1234567890);
        expect(converted[0].duration).toBe(150);
      });

      it('should handle missing optional fields', () => {
        const lightweightRequests = [
          {
            url: 'https://api.example.com/data',
            method: 'POST',
            timestamp: 1234567890,
          },
        ];

        const converted = ApiAnalyzer.convertLightweightRequests(lightweightRequests);

        expect(converted).toHaveLength(1);
        expect(converted[0].status).toBe(0);
        expect(converted[0].statusText).toBe('Error');
        expect(converted[0].requestHeaders).toEqual({});
        expect(converted[0].headers).toEqual({});
        expect(converted[0].responseBody).toBeUndefined();
      });

      it('should set statusText based on status code', () => {
        const lightweightRequests = [
          { url: 'https://api.example.com/a', method: 'GET', status: 200, timestamp: 0 },
          { url: 'https://api.example.com/b', method: 'GET', status: 0, timestamp: 0 },
          { url: 'https://api.example.com/c', method: 'GET', status: 404, timestamp: 0 },
        ];

        const converted = ApiAnalyzer.convertLightweightRequests(lightweightRequests);

        expect(converted[0].statusText).toBe('OK');
        expect(converted[1].statusText).toBe('Error');
        expect(converted[2].statusText).toBe('Unknown');
      });
    });

    describe('integration: lightweight requests to API patterns', () => {
      it('should analyze converted lightweight requests with tier degradation', () => {
        const lightweightRequests = [
          {
            url: 'https://api.example.com/v1/users',
            method: 'GET',
            status: 200,
            contentType: 'application/json',
            requestHeaders: { cookie: 'session=abc123' },
            responseHeaders: { 'content-type': 'application/json' },
            responseBody: { users: [{ id: 1, name: 'Test' }] },
            timestamp: Date.now(),
            duration: 100,
          },
        ];

        // Convert and analyze
        const networkRequests = ApiAnalyzer.convertLightweightRequests(lightweightRequests);
        const patterns = analyzer.analyzeRequestsWithTier(networkRequests, 'lightweight');

        expect(patterns).toHaveLength(1);
        // High confidence should be degraded to medium for lightweight tier
        expect(patterns[0].confidence).toBe('medium');
        expect(patterns[0].endpoint).toBe('https://api.example.com/v1/users');
        expect(patterns[0].authType).toBe('cookie');
        expect(patterns[0].reason).toContain('lightweight tier');
      });
    });
  });
});
