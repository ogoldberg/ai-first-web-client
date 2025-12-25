/**
 * Admin Dashboard API Tests (API-008)
 *
 * Tests for admin dashboard endpoints including:
 * - Overview metrics
 * - Usage analytics
 * - Tenant management
 * - Error analysis
 * - System health
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { dashboard } from '../src/routes/dashboard.js';
import { adminUI } from '../src/routes/admin-ui.js';
import {
  hashApiKey,
  authMiddleware,
  requirePermission,
  setApiKeyStore,
  createInMemoryApiKeyStore,
} from '../src/middleware/auth.js';
import type { Tenant, ApiKey } from '../src/middleware/types.js';
import { setTenantStore, InMemoryTenantStore } from '../src/services/tenants.js';
import { recordUsage } from '../src/services/usage.js';

// Helper to add error handler to test apps
function withErrorHandler(app: Hono): Hono {
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      const status = err.status;
      let code = 'ERROR';
      if (status === 401) code = 'UNAUTHORIZED';
      else if (status === 403) code = 'FORBIDDEN';

      return c.json({ success: false, error: { code, message: err.message } }, status);
    }
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  });
  return app;
}

// Test data helpers
function createTestTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant_admin',
    name: 'Admin Tenant',
    email: 'admin@example.com',
    plan: 'ENTERPRISE',
    dailyLimit: 10000,
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
    id: 'key_admin',
    keyHash: hashApiKey('ub_live_adminkey123'),
    keyPrefix: 'ub_live_adm',
    name: 'Admin Key',
    permissions: ['browse', 'admin'],
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(),
    tenantId: 'tenant_admin',
    ...overrides,
  };
}

function createNonAdminApiKey(): ApiKey {
  return {
    id: 'key_user',
    keyHash: hashApiKey('ub_live_userkey456'),
    keyPrefix: 'ub_live_usr',
    name: 'User Key',
    permissions: ['browse'],
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(),
    tenantId: 'tenant_user',
  };
}

describe('Dashboard API', () => {
  let app: Hono;
  let tenantStore: InMemoryTenantStore;

  const adminTenant = createTestTenant();
  const userTenant = createTestTenant({
    id: 'tenant_user',
    name: 'User Tenant',
    email: 'user@example.com',
    plan: 'FREE',
    dailyLimit: 100,
  });

  const adminKeyRaw = 'ub_live_adminkey123' + 'a'.repeat(13); // 32 chars after prefix
  const userKeyRaw = 'ub_live_userkey4567' + 'b'.repeat(13);  // 32 chars after prefix

  const adminKey = createTestApiKey({
    keyHash: hashApiKey(adminKeyRaw),
    keyPrefix: adminKeyRaw.slice(0, 11),
  });
  const userKey = createNonAdminApiKey();

  let createdAdminTenant: Tenant;
  let createdUserTenant: Tenant;

  beforeEach(async () => {
    // Setup tenant store
    tenantStore = new InMemoryTenantStore();
    setTenantStore(tenantStore);

    // Add tenants (the store generates its own IDs)
    createdAdminTenant = await tenantStore.create({
      name: adminTenant.name,
      email: adminTenant.email,
      plan: adminTenant.plan,
      dailyLimit: adminTenant.dailyLimit,
    });
    createdUserTenant = await tenantStore.create({
      name: userTenant.name,
      email: userTenant.email,
      plan: userTenant.plan,
      dailyLimit: userTenant.dailyLimit,
    });

    // Create API key store with pre-populated keys using actual tenant objects
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(hashApiKey(adminKeyRaw), { ...adminKey, keyHash: hashApiKey(adminKeyRaw), tenantId: createdAdminTenant.id, tenant: createdAdminTenant });
    keys.set(hashApiKey(userKeyRaw), { ...userKey, keyHash: hashApiKey(userKeyRaw), tenantId: createdUserTenant.id, tenant: createdUserTenant });
    setApiKeyStore(createInMemoryApiKeyStore(keys));

    // Record some usage for testing (use actual tenant IDs)
    recordUsage(createdAdminTenant.id, 'intelligence');
    recordUsage(createdAdminTenant.id, 'lightweight');
    recordUsage(createdUserTenant.id, 'intelligence');

    // Create test app with dashboard routes
    app = new Hono();
    app = withErrorHandler(app);
    app.route('/dashboard', dashboard);
    app.route('/admin', adminUI);
  });

  afterEach(() => {
    setApiKeyStore(null as any);
    setTenantStore(null as any);
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      const res = await app.request('/dashboard/overview');
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should require admin permission', async () => {
      const res = await app.request('/dashboard/overview', {
        headers: {
          'Authorization': `Bearer ${userKeyRaw}`,
        },
      });
      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should allow admin users', async () => {
      const res = await app.request('/dashboard/overview', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /overview', () => {
    it('should return aggregated metrics', async () => {
      const res = await app.request('/dashboard/overview', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.timestamp).toBeDefined();
      expect(data.data.period).toBeDefined();
      expect(data.data.requests).toBeDefined();
      expect(data.data.tenants).toBeDefined();
      expect(data.data.system).toBeDefined();
    });

    it('should include request statistics', async () => {
      const res = await app.request('/dashboard/overview', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      const requests = data.data.requests;

      expect(requests).toHaveProperty('total');
      expect(requests).toHaveProperty('today');
      expect(requests).toHaveProperty('errors');
      expect(requests).toHaveProperty('errorRate');
      expect(requests).toHaveProperty('avgLatencyMs');
      expect(requests).toHaveProperty('p95LatencyMs');
    });

    it('should include tenant counts', async () => {
      const res = await app.request('/dashboard/overview', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      const tenants = data.data.tenants;

      expect(tenants.total).toBe(2);
      expect(tenants.byPlan).toBeDefined();
    });

    it('should include system metrics', async () => {
      const res = await app.request('/dashboard/overview', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      const system = data.data.system;

      expect(system.uptime).toBeGreaterThan(0);
      expect(system.memory).toBeDefined();
      expect(system.nodeVersion).toBeDefined();
    });
  });

  describe('GET /usage', () => {
    it('should return usage for all tenants when no filter', async () => {
      const res = await app.request('/dashboard/usage', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.period).toBeDefined();
      expect(data.data.today).toBeDefined();
    });

    it('should return usage for specific tenant', async () => {
      const res = await app.request('/dashboard/usage?tenantId=tenant_admin', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /usage/summary', () => {
    it('should return aggregated usage by tier', async () => {
      const res = await app.request('/dashboard/usage/summary', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.period).toBeDefined();
      expect(data.data.totals).toBeDefined();
      expect(data.data.byTier).toBeDefined();
      expect(data.data.costBreakdown).toBeDefined();
    });

    it('should include tier breakdown', async () => {
      const res = await app.request('/dashboard/usage/summary', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      const byTier = data.data.byTier;

      expect(Array.isArray(byTier)).toBe(true);
      for (const tier of byTier) {
        expect(tier).toHaveProperty('tier');
        expect(tier).toHaveProperty('requests');
        expect(tier).toHaveProperty('units');
        expect(tier).toHaveProperty('requestPercent');
        expect(tier).toHaveProperty('unitPercent');
      }
    });
  });

  describe('GET /tenants', () => {
    it('should list all tenants with usage', async () => {
      const res = await app.request('/dashboard/tenants', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tenants).toBeDefined();
      expect(data.data.pagination).toBeDefined();
      expect(data.data.tenants.length).toBe(2);
    });

    it('should include usage data for each tenant', async () => {
      const res = await app.request('/dashboard/tenants', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      for (const tenant of data.data.tenants) {
        expect(tenant.usage).toBeDefined();
        expect(tenant.usage.today).toBeDefined();
        expect(tenant.usage.today).toHaveProperty('requests');
        expect(tenant.usage.today).toHaveProperty('units');
      }
    });

    it('should support pagination', async () => {
      const res = await app.request('/dashboard/tenants?limit=1&offset=0', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      expect(data.data.tenants.length).toBe(1);
      expect(data.data.pagination.limit).toBe(1);
      expect(data.data.pagination.offset).toBe(0);
      expect(data.data.pagination.total).toBe(2);
      expect(data.data.pagination.hasMore).toBe(true);
    });

    it('should filter by plan', async () => {
      const res = await app.request('/dashboard/tenants?plan=FREE', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      expect(data.data.tenants.length).toBe(1);
      expect(data.data.tenants[0].plan).toBe('FREE');
    });
  });

  describe('GET /tenants/:id', () => {
    it('should return detailed tenant info', async () => {
      const res = await app.request(`/dashboard/tenants/${createdAdminTenant.id}`, {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tenant).toBeDefined();
      expect(data.data.tenant.id).toBe(createdAdminTenant.id);
      expect(data.data.usage).toBeDefined();
    });

    it('should return 404 for non-existent tenant', async () => {
      const res = await app.request('/dashboard/tenants/nonexistent', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /errors', () => {
    it('should return error analysis', async () => {
      const res = await app.request('/dashboard/errors', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.summary).toBeDefined();
      expect(data.data.summary).toHaveProperty('clientErrors');
      expect(data.data.summary).toHaveProperty('serverErrors');
      expect(data.data.summary).toHaveProperty('total');
      expect(data.data.topErrorPaths).toBeDefined();
    });
  });

  describe('GET /system', () => {
    it('should return system metrics', async () => {
      const res = await app.request('/dashboard/system', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.process).toBeDefined();
      expect(data.data.memory).toBeDefined();
      expect(data.data.metrics).toBeDefined();
    });

    it('should include process info', async () => {
      const res = await app.request('/dashboard/system', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      const process = data.data.process;

      expect(process.pid).toBeDefined();
      expect(process.uptime).toBeGreaterThan(0);
      expect(process.uptimeHuman).toBeDefined();
      expect(process.nodeVersion).toBeDefined();
      expect(process.platform).toBeDefined();
      expect(process.arch).toBeDefined();
    });

    it('should include memory info', async () => {
      const res = await app.request('/dashboard/system', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });

      const data = await res.json();
      const memory = data.data.memory;

      expect(memory.heapUsed).toBeGreaterThan(0);
      expect(memory.heapTotal).toBeGreaterThan(0);
      expect(memory.rss).toBeGreaterThan(0);
      expect(memory.heapUsedMB).toBeGreaterThan(0);
      expect(memory.heapTotalMB).toBeGreaterThan(0);
    });
  });

  describe('GET /system/prometheus', () => {
    it('should return Prometheus format metrics', async () => {
      const res = await app.request('/dashboard/system/prometheus', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/plain');

      const text = await res.text();
      expect(text).toBeDefined();
    });
  });

  describe('GET /proxy', () => {
    it('should return proxy status', async () => {
      const res = await app.request('/dashboard/proxy', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.configured).toBeDefined();
    });
  });

  describe('Admin UI', () => {
    it('should serve HTML dashboard', async () => {
      // Test without trailing slash
      const res = await app.request('/admin', {
        headers: {
          'Authorization': `Bearer ${adminKeyRaw}`,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Unbrowser Admin Dashboard');
    });

    it('should require authentication for UI', async () => {
      const res = await app.request('/admin');
      expect(res.status).toBe(401);
    });

    it('should require admin permission for UI', async () => {
      const res = await app.request('/admin', {
        headers: {
          'Authorization': `Bearer ${userKeyRaw}`,
        },
      });
      expect(res.status).toBe(403);
    });
  });
});
