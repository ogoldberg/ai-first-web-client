/**
 * API Routes Tests
 *
 * Tests for browse, health, and other API routes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { health, setHealthCheck } from '../src/routes/health.js';
import { browse } from '../src/routes/browse.js';
import {
  hashApiKey,
  setApiKeyStore,
  createInMemoryApiKeyStore,
} from '../src/middleware/auth.js';
import { setBrowserClient } from '../src/services/browser.js';
import type { Tenant, ApiKey } from '../src/middleware/types.js';

// Mock browser client for testing
function createMockBrowserClient() {
  return {
    browse: vi.fn().mockResolvedValue({
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      title: 'Example Domain',
      content: {
        markdown: '# Example Domain\n\nThis domain is for use in illustrative examples.',
        text: 'Example Domain\n\nThis domain is for use in illustrative examples.',
        html: '<html>...</html>',
      },
      tier: 'intelligence',
      tiersAttempted: ['intelligence'],
      tables: [],
      links: [],
      discoveredApis: [],
      learning: {
        patternsApplied: false,
      },
      fieldConfidence: {
        aggregated: { score: 0.9 },
      },
    }),
    fetch: vi.fn().mockResolvedValue({
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      content: {
        markdown: '# Example Domain\n\nThis domain is for use in illustrative examples.',
        text: 'Example Domain\n\nThis domain is for use in illustrative examples.',
        title: 'Example Domain',
      },
      tier: 'intelligence',
      tiersAttempted: ['intelligence'],
    }),
    getDomainIntelligence: vi.fn().mockResolvedValue({
      knownPatterns: 2,
      selectorChains: 1,
      validators: 0,
      paginationPatterns: 0,
      recentFailures: 0,
      successRate: 0.95,
      domainGroup: null,
      recommendedWaitStrategy: 'networkidle',
      shouldUseSession: false,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// Helper to create test data
function createTestTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant_1',
    name: 'Test Tenant',
    email: 'test@example.com',
    plan: 'STARTER',
    dailyLimit: 1000,
    monthlyLimit: null,
    sharePatterns: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: null,
    ...overrides,
  };
}

function createTestApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key_1',
    keyHash: 'hash',
    keyPrefix: 'ub_live_',
    name: 'Test Key',
    permissions: ['browse', 'batch'],
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(),
    tenantId: 'tenant_1',
    ...overrides,
  };
}

describe('Health Routes', () => {
  let app: Hono;

  beforeEach(() => {
    // Reset health check to default (healthy)
    setHealthCheck(async () => true);
    app = new Hono();
    app.route('/health', health);
  });

  describe('GET /health', () => {
    it('should return healthy status when checks pass', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('healthy');
      expect(body.checks.core).toBeDefined();
      expect(body.checks.core.status).toBe('healthy');
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when checks fail', async () => {
      setHealthCheck(async () => false);

      const res = await app.request('/health');

      // Now returns 503 when unhealthy
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('unhealthy');
      expect(body.checks.core.status).toBe('unhealthy');
    });

    it('should return unhealthy status when checks throw', async () => {
      setHealthCheck(async () => {
        throw new Error('Connection refused');
      });

      const res = await app.request('/health');

      // Now returns 503 when unhealthy
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('unhealthy');
      expect(body.checks.core.status).toBe('unhealthy');
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when checks pass', async () => {
      const res = await app.request('/health/ready');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ready).toBe(true);
    });

    it('should return not ready when checks fail', async () => {
      setHealthCheck(async () => false);

      const res = await app.request('/health/ready');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ready).toBe(false);
    });
  });

  describe('GET /health/live', () => {
    it('should always return alive', async () => {
      const res = await app.request('/health/live');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alive).toBe(true);
    });
  });
});

describe('Browse Routes', () => {
  let app: Hono;
  let mockClient: ReturnType<typeof createMockBrowserClient>;
  const testKey = 'ub_live_' + 'a'.repeat(32);
  const testKeyHash = hashApiKey(testKey);
  const authHeader = { Authorization: `Bearer ${testKey}` };

  beforeEach(() => {
    // Set up mock browser client
    mockClient = createMockBrowserClient();
    setBrowserClient(mockClient);

    // Set up in-memory store with test data
    const tenant = createTestTenant();
    const apiKey = createTestApiKey({ keyHash: testKeyHash });
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(testKeyHash, { ...apiKey, tenant });
    setApiKeyStore(createInMemoryApiKeyStore(keys));

    app = new Hono();
    app.route('/v1', browse);
  });

  afterEach(() => {
    setApiKeyStore(null as any);
    setBrowserClient(null as any);
  });

  describe('POST /v1/browse', () => {
    it('should require authentication', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      expect(res.status).toBe(401);
    });

    it('should require url parameter', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should validate URL format', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-url' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_URL');
    });

    it('should reject non-http URLs', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'file:///etc/passwd' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_URL');
    });

    it('should browse valid URLs', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.url).toBe('https://example.com');
      expect(body.data.content).toBeDefined();
      expect(body.data.content.markdown).toContain('Example Domain');
      expect(body.data.metadata).toBeDefined();
      expect(mockClient.browse).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    it('should pass options to browser client', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          options: {
            waitForSelector: '.content',
            scrollToLoad: true,
            maxLatencyMs: 5000,
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockClient.browse).toHaveBeenCalledWith('https://example.com', {
        waitForSelector: '.content',
        scrollToLoad: true,
        maxLatencyMs: 5000,
        maxCostTier: undefined,
      });
    });
  });

  describe('POST /v1/fetch', () => {
    it('should fetch valid URLs', async () => {
      const res = await app.request('/v1/fetch', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.url).toBe('https://example.com');
      expect(mockClient.fetch).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });
  });

  describe('POST /v1/batch', () => {
    it('should require urls array', async () => {
      const res = await app.request('/v1/batch', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should reject empty urls array', async () => {
      const res = await app.request('/v1/batch', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('empty');
    });

    it('should limit batch size', async () => {
      const urls = Array(11).fill('https://example.com');

      const res = await app.request('/v1/batch', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('LIMIT_EXCEEDED');
    });

    it('should validate all URLs in batch', async () => {
      const res = await app.request('/v1/batch', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://example.com', 'invalid-url'] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_URL');
    });

    it('should batch browse multiple URLs', async () => {
      const res = await app.request('/v1/batch', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: ['https://example.com/page1', 'https://example.com/page2'],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.results).toHaveLength(2);
      expect(body.data.totalTime).toBeGreaterThanOrEqual(0);
      expect(body.data.successCount).toBe(2);
      expect(mockClient.browse).toHaveBeenCalledTimes(2);
    });
  });

  describe('GET /v1/usage', () => {
    it('should return usage statistics', async () => {
      const res = await app.request('/v1/usage', {
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.period).toBeDefined();
      expect(body.data.today).toBeDefined();
      expect(body.data.today.requests).toBeDefined();
      expect(body.data.today.units).toBeDefined();
      expect(body.data.today.byTier).toBeDefined();
      expect(body.data.month).toBeDefined();
      expect(body.data.limits).toBeDefined();
      expect(body.data.limits.daily).toBeDefined();
      expect(body.data.limits.remaining).toBeDefined();
    });
  });

  describe('GET /v1/domains/:domain/intelligence', () => {
    it('should return domain intelligence', async () => {
      const res = await app.request('/v1/domains/example.com/intelligence', {
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.domain).toBe('example.com');
      expect(body.data.knownPatterns).toBe(2);
      expect(mockClient.getDomainIntelligence).toHaveBeenCalledWith('example.com');
    });
  });
});
