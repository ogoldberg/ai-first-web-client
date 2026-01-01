/**
 * Beta Program Tests (API-017)
 *
 * Tests for beta waitlist, invite codes, and feedback functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { beta } from '../src/routes/beta.js';
import {
  hashApiKey,
  setApiKeyStore,
  createInMemoryApiKeyStore,
} from '../src/middleware/auth.js';
import {
  setTenantStore,
  InMemoryTenantStore,
} from '../src/services/tenants.js';
import {
  joinWaitlist,
  getWaitlistEntry,
  listWaitlist,
  updateWaitlistStatus,
  createInvite,
  validateInviteCode,
  useInviteCode,
  revokeInvite,
  listInvites,
  submitFeedback,
  getFeedback,
  listFeedback,
  updateFeedbackStatus,
  getBetaProgramStats,
  inviteWaitlistEntry,
  batchInviteWaitlist,
  clearBetaProgramData,
  getStoreSizes,
} from '../src/services/beta-program.js';
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
    passwordHash: null,
    emailVerifiedAt: new Date(),
    verificationToken: null,
    verificationTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    isBetaUser: true,
    betaInviteCode: null,
    betaJoinedAt: null,
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

function createUserApiKey(tenantId: string, keyHash: string): ApiKey {
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

// =============================================================================
// Service Unit Tests
// =============================================================================

describe('Beta Program Service', () => {
  beforeEach(() => {
    clearBetaProgramData();
  });

  describe('Waitlist Management', () => {
    it('should join waitlist successfully', async () => {
      const result = await joinWaitlist({
        email: 'test@example.com',
        name: 'Test User',
        useCase: 'Testing the beta program',
      });

      expect(result.success).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry!.email).toBe('test@example.com');
      expect(result.entry!.status).toBe('pending');
    });

    it('should normalize email to lowercase', async () => {
      const result = await joinWaitlist({
        email: 'TEST@EXAMPLE.COM',
        name: 'Test User',
        useCase: 'Testing the beta program',
      });

      expect(result.entry!.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      await joinWaitlist({
        email: 'test@example.com',
        name: 'First User',
        useCase: 'Testing',
      });

      const result = await joinWaitlist({
        email: 'test@example.com',
        name: 'Second User',
        useCase: 'Testing again',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already on waitlist');
    });

    it('should find waitlist entry by email', async () => {
      await joinWaitlist({
        email: 'test@example.com',
        name: 'Test User',
        useCase: 'Testing',
      });

      const entry = await getWaitlistEntry('TEST@EXAMPLE.COM');
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe('Test User');
    });

    it('should list waitlist entries', async () => {
      await joinWaitlist({ email: 'a@test.com', name: 'A', useCase: 'Test' });
      await joinWaitlist({ email: 'b@test.com', name: 'B', useCase: 'Test' });
      await joinWaitlist({ email: 'c@test.com', name: 'C', useCase: 'Test' });

      const result = await listWaitlist();
      expect(result.entries).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter waitlist by status', async () => {
      const { entry: entry1 } = await joinWaitlist({ email: 'a@test.com', name: 'A', useCase: 'Test' });
      await joinWaitlist({ email: 'b@test.com', name: 'B', useCase: 'Test' });

      await updateWaitlistStatus(entry1!.id, 'invited');

      const result = await listWaitlist({ status: 'pending' });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].email).toBe('b@test.com');
    });

    it('should update waitlist status', async () => {
      const { entry } = await joinWaitlist({
        email: 'test@example.com',
        name: 'Test User',
        useCase: 'Testing',
      });

      const result = await updateWaitlistStatus(entry!.id, 'invited', 'BETA-TEST-CODE');
      expect(result.success).toBe(true);

      const updated = await getWaitlistEntry('test@example.com');
      expect(updated!.status).toBe('invited');
      expect(updated!.inviteCode).toBe('BETA-TEST-CODE');
      expect(updated!.invitedAt).not.toBeNull();
    });
  });

  describe('Invite Code Management', () => {
    it('should create invite code', async () => {
      const result = await createInvite({
        createdBy: 'admin_tenant',
      });

      expect(result.success).toBe(true);
      expect(result.invite).toBeDefined();
      expect(result.invite!.code).toMatch(/^BETA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(result.invite!.maxUses).toBe(1);
    });

    it('should create email-specific invite', async () => {
      const result = await createInvite({
        email: 'specific@example.com',
        createdBy: 'admin_tenant',
      });

      expect(result.invite!.email).toBe('specific@example.com');
    });

    it('should create invite with custom max uses', async () => {
      const result = await createInvite({
        maxUses: 10,
        createdBy: 'admin_tenant',
      });

      expect(result.invite!.maxUses).toBe(10);
    });

    it('should create invite with expiration', async () => {
      const result = await createInvite({
        expiresInDays: 7,
        createdBy: 'admin_tenant',
      });

      expect(result.invite!.expiresAt).not.toBeNull();
      const expiresAt = result.invite!.expiresAt!;
      const expectedDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      // Allow 1 minute tolerance
      expect(Math.abs(expiresAt.getTime() - expectedDate.getTime())).toBeLessThan(60000);
    });

    it('should validate valid invite code', async () => {
      const { invite } = await createInvite({ createdBy: 'admin' });

      const result = await validateInviteCode(invite!.code);
      expect(result.valid).toBe(true);
      expect(result.invite).toBeDefined();
    });

    it('should reject invalid invite code', async () => {
      const result = await validateInviteCode('BETA-INVALID-CODE-HERE');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject revoked invite code', async () => {
      const { invite } = await createInvite({ createdBy: 'admin' });
      await revokeInvite(invite!.id);

      const result = await validateInviteCode(invite!.code);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should reject expired invite code', async () => {
      const { invite } = await createInvite({
        expiresInDays: -1, // Already expired
        createdBy: 'admin',
      });

      const result = await validateInviteCode(invite!.code);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject invite code at max uses', async () => {
      const { invite } = await createInvite({ maxUses: 1, createdBy: 'admin' });
      await useInviteCode(invite!.code);

      const result = await validateInviteCode(invite!.code);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum uses');
    });

    it('should validate email-specific invite', async () => {
      const { invite } = await createInvite({
        email: 'specific@example.com',
        createdBy: 'admin',
      });

      // Correct email
      const validResult = await validateInviteCode(invite!.code, 'specific@example.com');
      expect(validResult.valid).toBe(true);

      // Wrong email
      const invalidResult = await validateInviteCode(invite!.code, 'wrong@example.com');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('different email');
    });

    it('should increment use count', async () => {
      const { invite } = await createInvite({ maxUses: 3, createdBy: 'admin' });

      await useInviteCode(invite!.code);
      await useInviteCode(invite!.code);

      const validation = await validateInviteCode(invite!.code);
      expect(validation.invite!.usedCount).toBe(2);
    });

    it('should list invites', async () => {
      await createInvite({ createdBy: 'admin' });
      await createInvite({ createdBy: 'admin' });

      const result = await listInvites();
      expect(result.invites).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should exclude revoked invites by default', async () => {
      const { invite } = await createInvite({ createdBy: 'admin' });
      await createInvite({ createdBy: 'admin' });
      await revokeInvite(invite!.id);

      const result = await listInvites();
      expect(result.invites).toHaveLength(1);

      const withRevoked = await listInvites({ includeRevoked: true });
      expect(withRevoked.invites).toHaveLength(2);
    });
  });

  describe('Feedback Collection', () => {
    it('should submit feedback', async () => {
      const result = await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'Something is broken',
        description: 'This is a detailed description of the issue',
      });

      expect(result.success).toBe(true);
      expect(result.feedback).toBeDefined();
      expect(result.feedback!.status).toBe('new');
      expect(result.feedback!.priority).toBe('medium');
    });

    it('should submit feedback with priority', async () => {
      const result = await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        priority: 'critical',
        title: 'Critical bug',
        description: 'This needs immediate attention',
      });

      expect(result.feedback!.priority).toBe('critical');
    });

    it('should submit feedback with context', async () => {
      const result = await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'API Error',
        description: 'Got an error when calling the API',
        context: {
          endpoint: '/v1/browse',
          requestId: 'req_abc123',
          errorCode: 'TIMEOUT',
        },
      });

      expect(result.feedback!.context).toEqual({
        endpoint: '/v1/browse',
        requestId: 'req_abc123',
        errorCode: 'TIMEOUT',
      });
    });

    it('should get feedback by ID', async () => {
      const { feedback } = await submitFeedback({
        tenantId: 'tenant_123',
        category: 'feature_request',
        title: 'New feature',
        description: 'Please add this feature',
      });

      const retrieved = await getFeedback(feedback!.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe('New feature');
    });

    it('should list feedback', async () => {
      await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'Bug 1',
        description: 'Description 1',
      });
      await submitFeedback({
        tenantId: 'tenant_123',
        category: 'feature_request',
        title: 'Feature 1',
        description: 'Description 2',
      });

      const result = await listFeedback();
      expect(result.feedback).toHaveLength(2);
    });

    it('should filter feedback by category', async () => {
      await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'Bug 1',
        description: 'Description 1',
      });
      await submitFeedback({
        tenantId: 'tenant_123',
        category: 'feature_request',
        title: 'Feature 1',
        description: 'Description 2',
      });

      const result = await listFeedback({ category: 'bug' });
      expect(result.feedback).toHaveLength(1);
      expect(result.feedback[0].category).toBe('bug');
    });

    it('should update feedback status', async () => {
      const { feedback } = await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'Bug',
        description: 'Description',
      });

      const result = await updateFeedbackStatus(feedback!.id, 'in_progress', 'Working on it');
      expect(result.success).toBe(true);

      const updated = await getFeedback(feedback!.id);
      expect(updated!.status).toBe('in_progress');
      expect(updated!.adminNotes).toBe('Working on it');
    });

    it('should set resolvedAt when resolved', async () => {
      const { feedback } = await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'Bug',
        description: 'Description',
      });

      await updateFeedbackStatus(feedback!.id, 'resolved');

      const updated = await getFeedback(feedback!.id);
      expect(updated!.resolvedAt).not.toBeNull();
    });
  });

  describe('Program Statistics', () => {
    it('should return correct stats', async () => {
      // Create waitlist entries
      const { entry: entry1 } = await joinWaitlist({ email: 'a@test.com', name: 'A', useCase: 'Test' });
      await joinWaitlist({ email: 'b@test.com', name: 'B', useCase: 'Test' });
      await updateWaitlistStatus(entry1!.id, 'joined');

      // Create invites
      await createInvite({ createdBy: 'admin' });

      // Create feedback
      await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'Bug',
        description: 'Description',
      });

      const stats = await getBetaProgramStats();

      expect(stats.waitlist.total).toBe(2);
      expect(stats.waitlist.pending).toBe(1);
      expect(stats.waitlist.joined).toBe(1);
      expect(stats.activeUsers).toBe(1);
      expect(stats.inviteCodesActive).toBe(1);
      expect(stats.totalFeedback).toBe(1);
      expect(stats.openIssues).toBe(1);
    });
  });

  describe('Admin Functions', () => {
    it('should invite waitlist entry', async () => {
      const { entry } = await joinWaitlist({
        email: 'test@example.com',
        name: 'Test',
        useCase: 'Testing',
      });

      const result = await inviteWaitlistEntry(entry!.id, 'admin_tenant');

      expect(result.success).toBe(true);
      expect(result.invite).toBeDefined();

      const updated = await getWaitlistEntry('test@example.com');
      expect(updated!.status).toBe('invited');
      expect(updated!.inviteCode).toBe(result.invite!.code);
    });

    it('should reject inviting already invited entry', async () => {
      const { entry } = await joinWaitlist({
        email: 'test@example.com',
        name: 'Test',
        useCase: 'Testing',
      });

      await inviteWaitlistEntry(entry!.id, 'admin_tenant');
      const result = await inviteWaitlistEntry(entry!.id, 'admin_tenant');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has status');
    });

    it('should batch invite waitlist entries', async () => {
      const { entry: entry1 } = await joinWaitlist({ email: 'a@test.com', name: 'A', useCase: 'Test' });
      const { entry: entry2 } = await joinWaitlist({ email: 'b@test.com', name: 'B', useCase: 'Test' });
      const { entry: entry3 } = await joinWaitlist({ email: 'c@test.com', name: 'C', useCase: 'Test' });

      // Invite one first
      await inviteWaitlistEntry(entry1!.id, 'admin');

      const result = await batchInviteWaitlist(
        [entry1!.id, entry2!.id, entry3!.id],
        'admin_tenant'
      );

      expect(result.invited).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Store Management', () => {
    it('should report store sizes', async () => {
      await joinWaitlist({ email: 'test@example.com', name: 'Test', useCase: 'Testing' });
      await createInvite({ createdBy: 'admin' });
      await submitFeedback({
        tenantId: 'tenant_123',
        category: 'bug',
        title: 'Bug',
        description: 'Description',
      });

      const sizes = getStoreSizes();
      expect(sizes.waitlist).toBe(1);
      expect(sizes.invites).toBe(1);
      expect(sizes.feedback).toBe(1);
    });

    it('should clear all data', async () => {
      await joinWaitlist({ email: 'test@example.com', name: 'Test', useCase: 'Testing' });
      await createInvite({ createdBy: 'admin' });

      clearBetaProgramData();

      const sizes = getStoreSizes();
      expect(sizes.waitlist).toBe(0);
      expect(sizes.invites).toBe(0);
      expect(sizes.feedback).toBe(0);
    });
  });
});

// =============================================================================
// Route Integration Tests
// =============================================================================

describe('Beta Program Routes', () => {
  let app: Hono;
  let tenantStore: InMemoryTenantStore;
  const adminKey = 'ub_live_' + 'a'.repeat(32);
  const adminKeyHash = hashApiKey(adminKey);
  const userKey = 'ub_live_' + 'b'.repeat(32);
  const userKeyHash = hashApiKey(userKey);
  const adminAuthHeader = { Authorization: `Bearer ${adminKey}` };
  const userAuthHeader = { Authorization: `Bearer ${userKey}` };

  beforeEach(() => {
    clearBetaProgramData();

    // Set up tenant store
    tenantStore = new InMemoryTenantStore();
    setTenantStore(tenantStore);

    // Set up API key store with admin key
    const adminTenant = createAdminTenant();
    const adminApiKey = createAdminApiKey(adminTenant.id, adminKeyHash);
    const userApiKey = createUserApiKey(adminTenant.id, userKeyHash);
    const keys = new Map<string, ApiKey & { tenant: Tenant }>();
    keys.set(adminKeyHash, { ...adminApiKey, tenant: adminTenant });
    keys.set(userKeyHash, { ...userApiKey, tenant: adminTenant });

    const tenantLookup = async (tenantId: string) => tenantStore.findById(tenantId);
    setApiKeyStore(createInMemoryApiKeyStore(keys, tenantLookup));

    app = new Hono();
    app.route('/v1/beta', beta);
  });

  afterEach(() => {
    setApiKeyStore(null as any);
    setTenantStore(null as any);
    clearBetaProgramData();
  });

  describe('Public Endpoints', () => {
    describe('POST /v1/beta/waitlist', () => {
      it('should join waitlist', async () => {
        const res = await app.request('/v1/beta/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            name: 'Test User',
            useCase: 'Testing the beta program for automated browsing',
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.message).toContain('Successfully joined');
      });

      it('should require valid email', async () => {
        const res = await app.request('/v1/beta/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'invalid-email',
            name: 'Test User',
            useCase: 'Testing the beta program',
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('email');
      });

      it('should require name', async () => {
        const res = await app.request('/v1/beta/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            name: 'X',
            useCase: 'Testing the beta program',
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Name');
      });

      it('should require use case', async () => {
        const res = await app.request('/v1/beta/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            name: 'Test User',
            useCase: 'Short',
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Use case');
      });
    });

    describe('GET /v1/beta/waitlist/status', () => {
      it('should return waitlist status', async () => {
        await joinWaitlist({
          email: 'test@example.com',
          name: 'Test User',
          useCase: 'Testing',
        });

        const res = await app.request('/v1/beta/waitlist/status?email=test@example.com');

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.status).toBe('pending');
      });

      it('should return 404 for unknown email', async () => {
        const res = await app.request('/v1/beta/waitlist/status?email=unknown@example.com');

        expect(res.status).toBe(404);
      });
    });

    describe('POST /v1/beta/invite/validate', () => {
      it('should validate invite code', async () => {
        const { invite } = await createInvite({ createdBy: 'admin' });

        const res = await app.request('/v1/beta/invite/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: invite!.code }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.valid).toBe(true);
      });

      it('should reject invalid code', async () => {
        const res = await app.request('/v1/beta/invite/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'BETA-INVALID-CODE-HERE' }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.valid).toBeUndefined();
      });
    });
  });

  describe('Authenticated Endpoints', () => {
    describe('POST /v1/beta/feedback', () => {
      it('should submit feedback', async () => {
        const res = await app.request('/v1/beta/feedback', {
          method: 'POST',
          headers: { ...userAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'bug',
            title: 'Found a bug',
            description: 'This is a detailed bug report with enough characters',
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.feedbackId).toBeDefined();
      });

      it('should require authentication', async () => {
        const res = await app.request('/v1/beta/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'bug',
            title: 'Bug',
            description: 'Description',
          }),
        });

        expect(res.status).toBe(401);
      });

      it('should validate category', async () => {
        const res = await app.request('/v1/beta/feedback', {
          method: 'POST',
          headers: { ...userAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'invalid_category',
            title: 'Bug',
            description: 'This is a description with enough characters',
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Category');
      });
    });

    describe('GET /v1/beta/feedback', () => {
      it('should list user feedback', async () => {
        // Submit feedback first
        await app.request('/v1/beta/feedback', {
          method: 'POST',
          headers: { ...userAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'bug',
            title: 'Found a bug',
            description: 'This is a detailed bug report with enough characters',
          }),
        });

        const res = await app.request('/v1/beta/feedback', {
          headers: userAuthHeader,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.feedback).toHaveLength(1);
      });
    });
  });

  describe('Admin Endpoints', () => {
    describe('GET /v1/beta/admin/stats', () => {
      it('should return stats', async () => {
        const res = await app.request('/v1/beta/admin/stats', {
          headers: adminAuthHeader,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.stats).toBeDefined();
        expect(body.stats.waitlist).toBeDefined();
      });

      it('should require admin permission', async () => {
        const res = await app.request('/v1/beta/admin/stats', {
          headers: userAuthHeader,
        });

        expect(res.status).toBe(403);
      });
    });

    describe('GET /v1/beta/admin/waitlist', () => {
      it('should list waitlist', async () => {
        await joinWaitlist({ email: 'test@example.com', name: 'Test', useCase: 'Testing' });

        const res = await app.request('/v1/beta/admin/waitlist', {
          headers: adminAuthHeader,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.entries).toHaveLength(1);
      });
    });

    describe('POST /v1/beta/admin/waitlist/:id/invite', () => {
      it('should invite waitlist entry', async () => {
        const { entry } = await joinWaitlist({
          email: 'test@example.com',
          name: 'Test',
          useCase: 'Testing',
        });

        const res = await app.request(`/v1/beta/admin/waitlist/${entry!.id}/invite`, {
          method: 'POST',
          headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.invite).toBeDefined();
      });
    });

    describe('POST /v1/beta/admin/invites', () => {
      it('should create invite', async () => {
        const res = await app.request('/v1/beta/admin/invites', {
          method: 'POST',
          headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxUses: 5 }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.invite.maxUses).toBe(5);
      });
    });

    describe('DELETE /v1/beta/admin/invites/:id', () => {
      it('should revoke invite', async () => {
        const { invite } = await createInvite({ createdBy: 'admin' });

        const res = await app.request(`/v1/beta/admin/invites/${invite!.id}`, {
          method: 'DELETE',
          headers: adminAuthHeader,
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // Verify revoked
        const validation = await validateInviteCode(invite!.code);
        expect(validation.valid).toBe(false);
      });
    });

    describe('PATCH /v1/beta/admin/feedback/:id', () => {
      it('should update feedback status', async () => {
        const { feedback } = await submitFeedback({
          tenantId: 'admin_tenant',
          category: 'bug',
          title: 'Bug',
          description: 'Description with enough characters',
        });

        const res = await app.request(`/v1/beta/admin/feedback/${feedback!.id}`, {
          method: 'PATCH',
          headers: { ...adminAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'in_progress',
            adminNotes: 'Working on it',
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
      });
    });
  });
});
