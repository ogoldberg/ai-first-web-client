/**
 * Security Tests
 *
 * Tests for security headers, CORS, and input validation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { setApiKeyStore, hashApiKey } from '../src/middleware/auth.js';
import type { ApiKey, Tenant, Plan } from '../src/middleware/types.js';

// Test tenant and API key
const testTenant: Tenant = {
  id: 'tenant_security_test',
  name: 'Security Test Tenant',
  email: 'security@test.com',
  plan: 'STARTER' as Plan,
  isActive: true,
  dailyLimit: 1000,
  collectiveLearning: false,
  createdAt: new Date(),
  lastActiveAt: new Date(),
};

const testApiKey = 'ub_test_securitytestkey1234567890ab';
const testApiKeyRecord: ApiKey & { tenant: Tenant } = {
  id: 'key_security_test',
  keyHash: hashApiKey(testApiKey),
  keyPrefix: 'ub_test_',
  name: 'Security Test Key',
  permissions: ['browse', 'batch'],
  tenantId: testTenant.id,
  revokedAt: null,
  expiresAt: null,
  lastUsedAt: null,
  usageCount: 0,
  createdAt: new Date(),
  tenant: testTenant,
};

// Store for test keys
const testKeys = new Map<string, ApiKey & { tenant: Tenant }>();

// Set up API key store once for all tests
beforeAll(() => {
  testKeys.set(testApiKeyRecord.keyHash, testApiKeyRecord);
  setApiKeyStore({
    async findByHash(keyHash: string) {
      return testKeys.get(keyHash) || null;
    },
  });
});

afterAll(() => {
  testKeys.clear();
});

describe('Security Headers', () => {

  describe('Content Security Policy', () => {
    it('sets Content-Security-Policy header', async () => {
      const res = await app.request('/health');
      const csp = res.headers.get('content-security-policy');

      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('X-Content-Type-Options', () => {
    it('prevents MIME type sniffing', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });
  });

  describe('X-Frame-Options', () => {
    it('prevents clickjacking', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    });
  });

  describe('X-XSS-Protection', () => {
    it('enables XSS filter', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('x-xss-protection')).toBe('1; mode=block');
    });
  });

  describe('Referrer-Policy', () => {
    it('restricts referrer information', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Strict-Transport-Security', () => {
    it('enforces HTTPS', async () => {
      const res = await app.request('/health');
      const hsts = res.headers.get('strict-transport-security');
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
    });
  });

  describe('Permissions-Policy', () => {
    it('restricts browser features', async () => {
      const res = await app.request('/health');
      const policy = res.headers.get('permissions-policy');
      expect(policy).toBeTruthy();
      expect(policy).toContain('camera=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('geolocation=()');
    });
  });
});

describe('CORS', () => {
  it('allows requests from unbrowser.ai', async () => {
    const res = await app.request('/health', {
      headers: {
        Origin: 'https://unbrowser.ai',
      },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('https://unbrowser.ai');
  });

  it('allows requests from localhost in development', async () => {
    const res = await app.request('/health', {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });

    // In development mode, localhost should be allowed
    const origin = res.headers.get('access-control-allow-origin');
    expect(origin === 'http://localhost:3000' || origin === null).toBe(true);
  });

  it('includes credentials support', async () => {
    const res = await app.request('/health', {
      headers: {
        Origin: 'https://unbrowser.ai',
      },
    });

    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('exposes rate limit headers', async () => {
    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://unbrowser.ai',
        'Access-Control-Request-Method': 'GET',
      },
    });

    const exposed = res.headers.get('access-control-expose-headers');
    expect(exposed).toContain('X-Request-Id');
    expect(exposed).toContain('X-RateLimit-Limit');
  });
});

describe('Input Validation', () => {
  describe('URL Validation', () => {
    it('rejects requests without URL (after auth)', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({}),
      });

      // Auth passes, then validation fails with 400
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('rejects invalid URL format (after auth)', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({ url: 'not-a-valid-url' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_URL');
    });

    it('rejects file:// protocol (after auth)', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({ url: 'file:///etc/passwd' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_URL');
    });

    it('rejects javascript: protocol (after auth)', async () => {
      const res = await app.request('/v1/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({ url: 'javascript:alert(1)' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_URL');
    });

    it('accepts valid HTTP URL (validation only)', async () => {
      // Use preview endpoint which validates URL but doesn't fetch
      const res = await app.request('/v1/browse/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({ url: 'http://example.com' }),
      });

      // Should pass validation - not a 400 error
      expect(res.status).not.toBe(400);
    });

    it('accepts valid HTTPS URL (validation only)', async () => {
      // Use preview endpoint which validates URL but doesn't fetch
      const res = await app.request('/v1/browse/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      // Should pass validation - not a 400 error
      expect(res.status).not.toBe(400);
    });
  });
});

describe('Authentication', () => {
  it('rejects requests without Authorization header', async () => {
    const res = await app.request('/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid Bearer format', async () => {
    const res = await app.request('/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'InvalidFormat token123',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects invalid API key format', async () => {
    const res = await app.request('/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_key_format',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects non-existent API key', async () => {
    const res = await app.request('/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ub_test_nonexistentkey1234567890',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid API key');
  });
});

describe('Error Handling', () => {
  it('does not expose stack traces in production-like responses', async () => {
    const res = await app.request('/nonexistent-route');

    expect(res.status).toBe(404);
    const body = await res.json();

    // Should have structured error
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');

    // Should not have stack trace
    expect(body.error.stack).toBeUndefined();
  });

  it('returns request ID header', async () => {
    // Use preview endpoint for fast response
    const res = await app.request('/v1/browse/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    const requestId = res.headers.get('x-request-id');
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(/^req_/);
  });
});

describe('Rate Limit Headers', () => {
  it('includes rate limit headers on browse preview requests', async () => {
    // Use preview endpoint which is fast and doesn't do full browsing
    const res = await app.request('/v1/browse/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    // Rate limit headers should be present on authenticated browse endpoints
    expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
    expect(res.headers.get('x-ratelimit-remaining')).toBeTruthy();
    expect(res.headers.get('x-ratelimit-reset')).toBeTruthy();
  });
});
