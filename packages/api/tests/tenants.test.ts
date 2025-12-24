/**
 * Tenant Management Tests
 *
 * Tests for tenant CRUD operations and admin endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tenants } from '../src/routes/tenants.js';
import {
  hashApiKey,
  setApiKeyStore,
  createInMemoryApiKeyStore,
} from '../src/middleware/auth.js';
import {
  setTenantStore,
  InMemoryTenantStore,
} from '../src/services/tenants.js';
import type { Tenant, ApiKey } from '../src/middleware/types.js';

// Admin test data
function createAdminTenant(): Tenant {
  return {
    id: 'admin_tenant',
    name: 'Admin Tenant',
    email: 'admin@example.com',
    plan: 'ENTERPRISE',
    dailyLimit: 100000,
    monthlyLimit: null,
    sharePatterns: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: null,
  };
}

function createAdminApiKey(tenantId: string, keyHash: string): ApiKey {
  return {
    id: 'admin_key',
    keyHash,
    keyPrefix: 'ub_live_',
    name: 'Admin Key',
    permissions: ['admin', 'browse', 'batch'],
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(),
    tenantId,
  };
}

function createNonAdminApiKey(tenantId: string, keyHash: string): ApiKey {
  return {
    id: 'user_key',
    keyHash,
    keyPrefix: 'ub_live_',
    name: 'User Key',
    permissions: ['browse', 'batch'],
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: new Date(),
    tenantId,
  };
}

describe('Tenant Management Routes', () => {
  let app: Hono;
  let tenantStore: InMemoryTenantStore;
  const adminKey = 'ub_live_' + 'a'.repeat(32);
  const adminKeyHash = hashApiKey(adminKey);
  const userKey = 'ub_live_' + 'b'.repeat(32);
  const userKeyHash = hashApiKey(userKey);
  const adminAuthHeader = { Authorization: `Bearer ${adminKey}` };
  const userAuthHeader = { Authorization: `Bearer ${userKey}` };

  beforeEach(() => {
    // Set up tenant store
    tenantStore = new InMemoryTenantStore();
    setTenantStore(tenantStore);

    // Set up API key store with admin key
    const adminTenant = createAdminTenant();
    const adminApiKey = createAdminApiKey(adminTenant.id, adminKeyHash);
    const userApiKey = createNonAdminApiKey(adminTenant.id, userKeyHash);
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(adminKeyHash, { ...adminApiKey, tenant: adminTenant });
    keys.set(userKeyHash, { ...userApiKey, tenant: adminTenant });

    // Provide tenant lookup for API key creation
    const tenantLookup = async (tenantId: string) => tenantStore.findById(tenantId);
    setApiKeyStore(createInMemoryApiKeyStore(keys, tenantLookup));

    app = new Hono();
    app.route('/v1/admin/tenants', tenants);
  });

  afterEach(() => {
    setApiKeyStore(null as any);
    setTenantStore(null as any);
  });

  describe('Authorization', () => {
    it('should require authentication', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('should require admin permission', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'GET',
        headers: userAuthHeader,
      });

      expect(res.status).toBe(403);
      // HTTPException returns plain text, not JSON
      const text = await res.text();
      expect(text).toContain('admin');
    });
  });

  describe('POST /v1/admin/tenants', () => {
    it('should create a new tenant', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Company',
          email: 'test@company.com',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.tenant.name).toBe('Test Company');
      expect(body.data.tenant.email).toBe('test@company.com');
      expect(body.data.tenant.plan).toBe('FREE'); // default
      expect(body.data.apiKey.key).toMatch(/^ub_live_/);
      expect(body.data.apiKey.keyPrefix).toBe('ub_live_');
    });

    it('should create tenant with specified plan', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Enterprise Company',
          email: 'enterprise@company.com',
          plan: 'ENTERPRISE',
          dailyLimit: 500000,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.tenant.plan).toBe('ENTERPRISE');
      expect(body.data.tenant.dailyLimit).toBe(500000);
    });

    it('should require name', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@company.com',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should require email', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Company',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should validate email format', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Company',
          email: 'invalid-email',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('email');
    });

    it('should reject duplicate email', async () => {
      // Create first tenant
      await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'First Company',
          email: 'same@email.com',
        }),
      });

      // Try to create second with same email
      const res = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Second Company',
          email: 'same@email.com',
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('DUPLICATE_EMAIL');
    });

    it('should validate plan value', async () => {
      const res = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Company',
          email: 'test@company.com',
          plan: 'INVALID_PLAN',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('plan');
    });

    it('should create a functional API key', async () => {
      // Create a new tenant
      const createRes = await app.request('/v1/admin/tenants', {
        method: 'POST',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Company',
          email: 'new@company.com',
        }),
      });

      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const newApiKey = createBody.data.apiKey.key;
      const newTenantId = createBody.data.tenant.id;

      // Verify the new key works by fetching the tenant
      const verifyRes = await app.request(`/v1/admin/tenants/${newTenantId}`, {
        headers: { Authorization: `Bearer ${newApiKey}` },
      });

      // The key should work but may not have admin permission (browse, batch only)
      // So we expect 403 (no admin permission) rather than 401 (invalid key)
      expect(verifyRes.status).toBe(403);
    });
  });

  describe('GET /v1/admin/tenants', () => {
    beforeEach(async () => {
      // Create some test tenants
      await tenantStore.create({ name: 'Company A', email: 'a@company.com', plan: 'FREE' });
      await tenantStore.create({ name: 'Company B', email: 'b@company.com', plan: 'STARTER' });
      await tenantStore.create({ name: 'Company C', email: 'c@company.com', plan: 'TEAM' });
    });

    it('should list all tenants', async () => {
      const res = await app.request('/v1/admin/tenants', {
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.tenants).toHaveLength(3);
      expect(body.data.pagination.total).toBe(3);
    });

    it('should paginate results', async () => {
      const res = await app.request('/v1/admin/tenants?limit=2&offset=0', {
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tenants).toHaveLength(2);
      expect(body.data.pagination.hasMore).toBe(true);
    });

    it('should filter by plan', async () => {
      const res = await app.request('/v1/admin/tenants?plan=STARTER', {
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tenants).toHaveLength(1);
      expect(body.data.tenants[0].plan).toBe('STARTER');
    });

    it('should reject invalid limit parameter', async () => {
      const res = await app.request('/v1/admin/tenants?limit=abc', {
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toContain('non-negative');
    });

    it('should reject negative offset parameter', async () => {
      const res = await app.request('/v1/admin/tenants?offset=-5', {
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /v1/admin/tenants/:id', () => {
    let tenantId: string;

    beforeEach(async () => {
      const tenant = await tenantStore.create({
        name: 'Test Company',
        email: 'test@company.com',
      });
      tenantId = tenant.id;
    });

    it('should get a tenant by ID', async () => {
      const res = await app.request(`/v1/admin/tenants/${tenantId}`, {
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(tenantId);
      expect(body.data.name).toBe('Test Company');
    });

    it('should return 404 for non-existent tenant', async () => {
      const res = await app.request('/v1/admin/tenants/nonexistent', {
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /v1/admin/tenants/:id', () => {
    let tenantId: string;

    beforeEach(async () => {
      const tenant = await tenantStore.create({
        name: 'Test Company',
        email: 'test@company.com',
        plan: 'FREE',
      });
      tenantId = tenant.id;
    });

    it('should update tenant name', async () => {
      const res = await app.request(`/v1/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Company',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Company');
    });

    it('should update tenant plan', async () => {
      const res = await app.request(`/v1/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'ENTERPRISE',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.plan).toBe('ENTERPRISE');
    });

    it('should update multiple fields', async () => {
      const res = await app.request(`/v1/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Name',
          plan: 'TEAM',
          dailyLimit: 5000,
          sharePatterns: true,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('New Name');
      expect(body.data.plan).toBe('TEAM');
      expect(body.data.dailyLimit).toBe(5000);
      expect(body.data.sharePatterns).toBe(true);
    });

    it('should reject duplicate email on update', async () => {
      // Create another tenant
      await tenantStore.create({
        name: 'Other Company',
        email: 'other@company.com',
      });

      const res = await app.request(`/v1/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'other@company.com',
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('DUPLICATE_EMAIL');
    });

    it('should return 404 for non-existent tenant', async () => {
      const res = await app.request('/v1/admin/tenants/nonexistent', {
        method: 'PATCH',
        headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated',
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/admin/tenants/:id', () => {
    let tenantId: string;

    beforeEach(async () => {
      const tenant = await tenantStore.create({
        name: 'Test Company',
        email: 'test@company.com',
      });
      tenantId = tenant.id;
    });

    it('should delete a tenant', async () => {
      const res = await app.request(`/v1/admin/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);

      // Verify deletion
      const tenant = await tenantStore.findById(tenantId);
      expect(tenant).toBeNull();
    });

    it('should return 404 for non-existent tenant', async () => {
      const res = await app.request('/v1/admin/tenants/nonexistent', {
        method: 'DELETE',
        headers: adminAuthHeader,
      });

      expect(res.status).toBe(404);
    });
  });
});

describe('InMemoryTenantStore', () => {
  let store: InMemoryTenantStore;

  beforeEach(() => {
    store = new InMemoryTenantStore();
  });

  it('should create tenant with default plan', async () => {
    const tenant = await store.create({
      name: 'Test',
      email: 'test@example.com',
    });

    expect(tenant.plan).toBe('FREE');
    expect(tenant.dailyLimit).toBe(100); // FREE plan default
  });

  it('should apply plan defaults when creating', async () => {
    const tenant = await store.create({
      name: 'Test',
      email: 'test@example.com',
      plan: 'TEAM',
    });

    expect(tenant.dailyLimit).toBe(10000); // TEAM plan default
    expect(tenant.monthlyLimit).toBe(300000); // TEAM plan default
  });

  it('should allow custom limits', async () => {
    const tenant = await store.create({
      name: 'Test',
      email: 'test@example.com',
      plan: 'FREE',
      dailyLimit: 500,
    });

    expect(tenant.dailyLimit).toBe(500);
  });

  it('should normalize email to lowercase', async () => {
    const tenant = await store.create({
      name: 'Test',
      email: 'TEST@EXAMPLE.COM',
    });

    expect(tenant.email).toBe('test@example.com');
  });

  it('should find by email case-insensitively', async () => {
    await store.create({
      name: 'Test',
      email: 'test@example.com',
    });

    const found = await store.findByEmail('TEST@EXAMPLE.COM');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('test@example.com');
  });
});
