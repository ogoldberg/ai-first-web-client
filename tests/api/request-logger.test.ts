/**
 * Request Logger Middleware Tests
 *
 * Tests for structured request/response logging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createRequestLoggerMiddleware,
  InMemoryLogStore,
  setRequestLogger,
  redactHeaders,
  type RequestLogEntry,
} from '../../packages/api/src/middleware/request-logger.js';
import {
  setApiKeyStore,
  createInMemoryApiKeyStore,
  hashApiKey,
  authMiddleware,
} from '../../packages/api/src/middleware/auth.js';
import type { Tenant, ApiKey } from '../../packages/api/src/middleware/types.js';

// Helper to add error handler to test apps
function withErrorHandler(app: Hono): Hono {
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      const status = err.status;
      let code = 'ERROR';
      if (status === 401) code = 'UNAUTHORIZED';
      else if (status === 403) code = 'FORBIDDEN';
      else if (status === 429) code = 'RATE_LIMIT_EXCEEDED';
      else if (status === 400) code = 'BAD_REQUEST';

      return c.json({ success: false, error: { code, message: err.message } }, status);
    }
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  });
  return app;
}

// Test data helpers
function createTestTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant_1',
    name: 'Test Tenant',
    email: 'test@example.com',
    plan: 'FREE',
    dailyLimit: 100,
    createdAt: new Date(),
    ...overrides,
  };
}

function createTestApiKey(tenantId: string, overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key_1',
    tenantId,
    keyHash: hashApiKey('ub_test_key123'),
    keyPrefix: 'ub_test_',
    name: 'Test Key',
    permissions: ['browse', 'api'],
    createdAt: new Date(),
    ...overrides,
  };
}

describe('InMemoryLogStore', () => {
  let store: InMemoryLogStore;

  beforeEach(() => {
    store = new InMemoryLogStore();
  });

  it('should log entries', () => {
    const entry: RequestLogEntry = {
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    };

    store.log(entry);
    const logs = store.query({});
    expect(logs).toHaveLength(1);
    expect(logs[0].requestId).toBe('req_1');
  });

  it('should enforce max size', () => {
    const smallStore = new InMemoryLogStore(5);

    for (let i = 0; i < 10; i++) {
      smallStore.log({
        requestId: `req_${i}`,
        timestamp: new Date().toISOString(),
        durationMs: 100,
        method: 'GET',
        path: '/test',
        query: {},
        status: 200,
        success: true,
      });
    }

    const logs = smallStore.query({ limit: 100 });
    expect(logs).toHaveLength(5);
    // Should keep the newest entries
    expect(logs.map((l) => l.requestId)).toContain('req_9');
    expect(logs.map((l) => l.requestId)).not.toContain('req_0');
  });

  it('should filter by tenantId', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
      tenantId: 'tenant_1',
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
      tenantId: 'tenant_2',
    });

    const logs = store.query({ tenantId: 'tenant_1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].tenantId).toBe('tenant_1');
  });

  it('should filter by method', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'POST',
      path: '/test',
      query: {},
      status: 201,
      success: true,
    });

    const logs = store.query({ method: 'POST' });
    expect(logs).toHaveLength(1);
    expect(logs[0].method).toBe('POST');
  });

  it('should filter by path', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/v1/browse',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/v1/fetch',
      query: {},
      status: 200,
      success: true,
    });

    const logs = store.query({ path: '/v1/browse' });
    expect(logs).toHaveLength(1);
    expect(logs[0].path).toBe('/v1/browse');
  });

  it('should filter by pathPrefix', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/v1/browse',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/health',
      query: {},
      status: 200,
      success: true,
    });

    const logs = store.query({ pathPrefix: '/v1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].path).toBe('/v1/browse');
  });

  it('should filter by status', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 404,
      success: false,
    });

    const logs = store.query({ status: 404 });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(404);
  });

  it('should filter by status range', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 500,
      success: false,
    });

    const logs = store.query({ statusRange: { min: 500, max: 599 } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(500);
  });

  it('should filter by success', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 500,
      success: false,
    });

    const logs = store.query({ success: false });
    expect(logs).toHaveLength(1);
    expect(logs[0].success).toBe(false);
  });

  it('should filter by time range', () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    store.log({
      requestId: 'req_old',
      timestamp: twoHoursAgo.toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_recent',
      timestamp: now.toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    });

    const logs = store.query({ startTime: hourAgo });
    expect(logs).toHaveLength(1);
    expect(logs[0].requestId).toBe('req_recent');
  });

  it('should paginate results', () => {
    for (let i = 0; i < 10; i++) {
      store.log({
        requestId: `req_${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        durationMs: 100,
        method: 'GET',
        path: '/test',
        query: {},
        status: 200,
        success: true,
      });
    }

    const page1 = store.query({ limit: 3, offset: 0 });
    const page2 = store.query({ limit: 3, offset: 3 });

    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);
    expect(page1[0].requestId).toBe('req_0'); // newest first
    expect(page2[0].requestId).toBe('req_3');
  });

  it('should calculate stats correctly', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/v1/browse',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_2',
      timestamp: new Date().toISOString(),
      durationMs: 200,
      method: 'GET',
      path: '/v1/browse',
      query: {},
      status: 200,
      success: true,
    });
    store.log({
      requestId: 'req_3',
      timestamp: new Date().toISOString(),
      durationMs: 300,
      method: 'POST',
      path: '/v1/fetch',
      query: {},
      status: 500,
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Test error' },
    });

    const stats = store.getStats();

    expect(stats.totalRequests).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.errorCount).toBe(1);
    expect(stats.avgDurationMs).toBe(200);
    expect(stats.statusCodes[200]).toBe(2);
    expect(stats.statusCodes[500]).toBe(1);
    expect(stats.topPaths).toHaveLength(2);
    expect(stats.topErrors).toHaveLength(1);
    expect(stats.topErrors[0].code).toBe('INTERNAL_ERROR');
  });

  it('should return empty stats for empty store', () => {
    const stats = store.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.avgDurationMs).toBe(0);
  });

  it('should clear logs', () => {
    store.log({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      durationMs: 100,
      method: 'GET',
      path: '/test',
      query: {},
      status: 200,
      success: true,
    });

    expect(store.query({})).toHaveLength(1);
    store.clear();
    expect(store.query({})).toHaveLength(0);
  });
});

describe('redactHeaders', () => {
  it('should redact authorization header', () => {
    const headers = { authorization: 'Bearer sk_live_12345678901234567890' };
    const redacted = redactHeaders(headers);
    expect(redacted.authorization).toBe('Bearer s...REDACTED');
  });

  it('should redact cookie header', () => {
    const headers = { cookie: 'session=abc123; token=xyz789' };
    const redacted = redactHeaders(headers);
    expect(redacted.cookie).toBe('session=...REDACTED');
  });

  it('should redact x-api-key header', () => {
    const headers = { 'x-api-key': 'ub_live_123456789' };
    const redacted = redactHeaders(headers);
    expect(redacted['x-api-key']).toBe('ub_live_...REDACTED');
  });

  it('should not redact non-sensitive headers', () => {
    const headers = { 'content-type': 'application/json', 'user-agent': 'TestClient/1.0' };
    const redacted = redactHeaders(headers);
    expect(redacted['content-type']).toBe('application/json');
    expect(redacted['user-agent']).toBe('TestClient/1.0');
  });

  it('should handle short sensitive values', () => {
    const headers = { authorization: 'short' };
    const redacted = redactHeaders(headers);
    expect(redacted.authorization).toBe('REDACTED');
  });
});

describe('Request Logger Middleware', () => {
  let store: InMemoryLogStore;
  let app: Hono;

  beforeEach(() => {
    store = new InMemoryLogStore();
    setRequestLogger(store);
    app = new Hono();
    app.use('*', createRequestLoggerMiddleware({ logToConsole: false }));
  });

  it('should log successful requests', async () => {
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);

    const logs = store.query({});
    expect(logs).toHaveLength(1);
    expect(logs[0].method).toBe('GET');
    expect(logs[0].path).toBe('/test');
    expect(logs[0].status).toBe(200);
    expect(logs[0].success).toBe(true);
    expect(logs[0].requestId).toMatch(/^req_/);
  });

  it('should add X-Request-Id header to response', async () => {
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test');
    const requestId = res.headers.get('X-Request-Id');
    expect(requestId).toMatch(/^req_/);

    const logs = store.query({});
    expect(logs[0].requestId).toBe(requestId);
  });

  it('should log error responses', async () => {
    app.get('/error', (c) => c.json({ success: false, error: { code: 'TEST_ERROR', message: 'Test' } }, 400));

    const res = await app.request('/error');
    expect(res.status).toBe(400);

    const logs = store.query({});
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(400);
    expect(logs[0].success).toBe(false);
    expect(logs[0].error?.code).toBe('TEST_ERROR');
  });

  it('should log thrown errors', async () => {
    withErrorHandler(app);
    app.get('/throw', () => {
      throw new Error('Test exception');
    });

    const res = await app.request('/throw');
    expect(res.status).toBe(500);

    const logs = store.query({});
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(500);
    expect(logs[0].success).toBe(false);
    // Error handler transforms to INTERNAL_ERROR
    expect(logs[0].error?.code).toBe('INTERNAL_ERROR');
  });

  it('should skip health check paths', async () => {
    app.get('/health', (c) => c.json({ status: 'ok' }));
    app.get('/test', (c) => c.json({ success: true }));

    await app.request('/health');
    await app.request('/test');

    const logs = store.query({});
    expect(logs).toHaveLength(1);
    expect(logs[0].path).toBe('/test');
  });

  it('should track request duration', async () => {
    app.get('/slow', async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return c.json({ success: true });
    });

    await app.request('/slow');

    const logs = store.query({});
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(50);
  });

  it('should redact query parameters', async () => {
    app.get('/test', (c) => c.json({ success: true }));

    await app.request('/test?api_key=secret123&name=test');

    const logs = store.query({});
    expect(logs[0].query.api_key).toBe('REDACTED');
    expect(logs[0].query.name).toBe('test');
  });

  it('should capture tenant context when auth is present', async () => {
    const tenant = createTestTenant();
    const apiKey = createTestApiKey(tenant.id);

    // Create a map with key hash -> (apiKey + tenant)
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(apiKey.keyHash, { ...apiKey, tenant });
    const keyStore = createInMemoryApiKeyStore(keys);
    setApiKeyStore(keyStore);

    const authApp = new Hono();
    authApp.use('*', createRequestLoggerMiddleware({ logToConsole: false }));
    authApp.use('*', authMiddleware);
    authApp.get('/test', (c) => c.json({ success: true }));

    await authApp.request('/test', {
      headers: { authorization: 'Bearer ub_test_key123' },
    });

    const logs = store.query({});
    expect(logs[0].tenantId).toBe(tenant.id);
    expect(logs[0].tenantName).toBe(tenant.name);
    expect(logs[0].apiKeyId).toBe(apiKey.id);
    expect(logs[0].apiKeyPrefix).toBe('ub_test_');
  });

  it('should capture user agent', async () => {
    app.get('/test', (c) => c.json({ success: true }));

    await app.request('/test', {
      headers: { 'user-agent': 'TestBot/1.0' },
    });

    const logs = store.query({});
    expect(logs[0].userAgent).toBe('TestBot/1.0');
  });
});
