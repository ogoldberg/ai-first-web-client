/**
 * API Authentication Tests
 *
 * Tests for API key authentication middleware.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  hashApiKey,
  generateApiKey,
  isValidApiKeyFormat,
  authMiddleware,
  requirePermission,
  setApiKeyStore,
  createInMemoryApiKeyStore,
} from '../src/middleware/auth.js';
import type { Tenant, ApiKey } from '../src/middleware/types.js';

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

// Helper to create test data
function createTestTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant_1',
    name: 'Test Tenant',
    email: 'test@example.com',
    plan: 'FREE',
    dailyLimit: 100,
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
    permissions: ['browse'],
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(),
    tenantId: 'tenant_1',
    ...overrides,
  };
}

describe('API Key Hashing', () => {
  it('should hash API keys consistently', () => {
    const key = 'ub_live_abc123def456';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
  });

  it('should produce different hashes for different keys', () => {
    const hash1 = hashApiKey('ub_live_key1');
    const hash2 = hashApiKey('ub_live_key2');

    expect(hash1).not.toBe(hash2);
  });
});

describe('API Key Generation', () => {
  it('should generate live API keys', () => {
    const { key, keyHash, keyPrefix } = generateApiKey('live');

    expect(key).toMatch(/^ub_live_[a-f0-9]{32}$/);
    expect(keyHash).toHaveLength(64);
    expect(keyPrefix).toBe('ub_live_');
    expect(hashApiKey(key)).toBe(keyHash);
  });

  it('should generate test API keys', () => {
    const { key, keyHash, keyPrefix } = generateApiKey('test');

    expect(key).toMatch(/^ub_test_[a-f0-9]{32}$/);
    expect(keyHash).toHaveLength(64);
    expect(keyPrefix).toBe('ub_test_');
  });

  it('should generate unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    expect(key1.key).not.toBe(key2.key);
    expect(key1.keyHash).not.toBe(key2.keyHash);
  });
});

describe('API Key Format Validation', () => {
  it('should accept valid live keys', () => {
    expect(isValidApiKeyFormat('ub_live_' + 'a'.repeat(32))).toBe(true);
    expect(isValidApiKeyFormat('ub_live_' + 'f'.repeat(32))).toBe(true);
    expect(isValidApiKeyFormat('ub_live_' + '0'.repeat(32))).toBe(true);
  });

  it('should accept valid test keys', () => {
    expect(isValidApiKeyFormat('ub_test_' + 'a'.repeat(32))).toBe(true);
  });

  it('should reject invalid prefixes', () => {
    expect(isValidApiKeyFormat('sk_live_' + 'a'.repeat(32))).toBe(false);
    expect(isValidApiKeyFormat('ub_prod_' + 'a'.repeat(32))).toBe(false);
    expect(isValidApiKeyFormat('api_live_' + 'a'.repeat(32))).toBe(false);
  });

  it('should reject short keys', () => {
    expect(isValidApiKeyFormat('ub_live_' + 'a'.repeat(31))).toBe(false);
    expect(isValidApiKeyFormat('ub_live_abc')).toBe(false);
  });

  it('should reject non-hex characters', () => {
    expect(isValidApiKeyFormat('ub_live_' + 'g'.repeat(32))).toBe(false);
    expect(isValidApiKeyFormat('ub_live_' + 'A'.repeat(32))).toBe(false);
  });
});

describe('Auth Middleware', () => {
  let app: Hono;
  const testKey = 'ub_live_' + 'a'.repeat(32);
  const testKeyHash = hashApiKey(testKey);

  beforeEach(() => {
    // Set up in-memory store with test data
    const tenant = createTestTenant();
    const apiKey = createTestApiKey({ keyHash: testKeyHash, tenant });
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(testKeyHash, { ...apiKey, tenant });
    setApiKeyStore(createInMemoryApiKeyStore(keys));

    app = new Hono();
    withErrorHandler(app);
    app.use('*', authMiddleware);
    app.get('/test', (c) => {
      const tenant = c.get('tenant');
      return c.json({ tenantId: tenant.id });
    });
  });

  afterEach(() => {
    setApiKeyStore(null as any);
  });

  it('should reject requests without Authorization header', async () => {
    const res = await app.request('/test');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Authorization header required');
  });

  it('should reject non-Bearer authorization', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toContain('Invalid authorization format');
  });

  it('should reject invalid key format', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer invalid_key' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid API key format');
  });

  it('should reject unknown API keys', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer ub_live_' + 'b'.repeat(32) },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    // SECURITY: Uses uniform error message to prevent enumeration attacks
    expect(body.error.message).toBe('Invalid or inactive API key');
  });

  it('should reject revoked API keys', async () => {
    // Update store with revoked key
    const tenant = createTestTenant();
    const apiKey = createTestApiKey({
      keyHash: testKeyHash,
      revokedAt: new Date(),
    });
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(testKeyHash, { ...apiKey, tenant });
    setApiKeyStore(createInMemoryApiKeyStore(keys));

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${testKey}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    // SECURITY: Uses uniform error message to prevent enumeration attacks
    expect(body.error.message).toBe('Invalid or inactive API key');
  });

  it('should reject expired API keys', async () => {
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 1);

    const tenant = createTestTenant();
    const apiKey = createTestApiKey({
      keyHash: testKeyHash,
      expiresAt: expiredDate,
    });
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(testKeyHash, { ...apiKey, tenant });
    setApiKeyStore(createInMemoryApiKeyStore(keys));

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${testKey}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    // SECURITY: Uses uniform error message to prevent enumeration attacks
    expect(body.error.message).toBe('Invalid or inactive API key');
  });

  it('should accept valid API keys', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${testKey}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('tenant_1');
  });
});

describe('Permission Middleware', () => {
  let app: Hono;
  const testKey = 'ub_live_' + 'a'.repeat(32);
  const testKeyHash = hashApiKey(testKey);

  beforeEach(() => {
    // Set up store with browse permission only
    const tenant = createTestTenant();
    const apiKey = createTestApiKey({
      keyHash: testKeyHash,
      permissions: ['browse'],
    });
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(testKeyHash, { ...apiKey, tenant });
    setApiKeyStore(createInMemoryApiKeyStore(keys));

    app = new Hono();
    withErrorHandler(app);
    app.use('*', authMiddleware);
    app.use('/admin/*', requirePermission('admin'));
    app.get('/admin/test', (c) => c.json({ ok: true }));
    app.use('/browse/*', requirePermission('browse'));
    app.get('/browse/test', (c) => c.json({ ok: true }));
  });

  afterEach(() => {
    setApiKeyStore(null as any);
  });

  it('should reject requests without required permission', async () => {
    const res = await app.request('/admin/test', {
      headers: { Authorization: `Bearer ${testKey}` },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain('Missing required permission: admin');
  });

  it('should allow requests with required permission', async () => {
    const res = await app.request('/browse/test', {
      headers: { Authorization: `Bearer ${testKey}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('should allow admin to access any route', async () => {
    // Update store with admin permission
    const tenant = createTestTenant();
    const apiKey = createTestApiKey({
      keyHash: testKeyHash,
      permissions: ['admin'],
    });
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(testKeyHash, { ...apiKey, tenant });
    setApiKeyStore(createInMemoryApiKeyStore(keys));

    const res = await app.request('/admin/test', {
      headers: { Authorization: `Bearer ${testKey}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
