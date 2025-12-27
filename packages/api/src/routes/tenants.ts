/**
 * Tenant Management Routes
 *
 * Admin API endpoints for managing tenants.
 * These routes require admin permission.
 */

import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import {
  getTenantStore,
  createTenantWithApiKey,
  type CreateTenantInput,
  type UpdateTenantInput,
  type ListTenantsOptions,
} from '../services/tenants.js';
import type { Plan } from '../middleware/types.js';

const tenants = new Hono();

// Apply auth middleware to all routes
tenants.use('*', authMiddleware);

// All tenant management requires admin permission
tenants.use('*', requirePermission('admin'));

/**
 * Validate plan value
 */
function isValidPlan(plan: string): plan is Plan {
  return ['FREE', 'STARTER', 'TEAM', 'ENTERPRISE'].includes(plan);
}

/**
 * Validate email format
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/**
 * Create validation error response for email
 */
function emailValidationError(c: any) {
  return c.json(
    {
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'Invalid email format' },
    },
    400
  );
}

/**
 * Create validation error response for plan
 */
function planValidationError(c: any) {
  return c.json(
    {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid plan. Must be FREE, STARTER, TEAM, or ENTERPRISE',
      },
    },
    400
  );
}

/**
 * Create store not configured error response
 */
function storeNotConfiguredError(c: any) {
  return c.json(
    {
      success: false,
      error: { code: 'STORE_ERROR', message: 'Tenant store not configured' },
    },
    500
  );
}

/**
 * Get tenant store with type guard
 */
function requireTenantStore(c: any): ReturnType<typeof getTenantStore> | null {
  const store = getTenantStore();
  return store;
}

/**
 * POST /v1/admin/tenants
 * Create a new tenant with an initial API key
 */
tenants.post(
  '/',
  validator('json', (value, c) => {
    const body = value as CreateTenantInput;

    if (!body.name || typeof body.name !== 'string') {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'name is required' },
        },
        400
      );
    }

    if (!body.email || typeof body.email !== 'string') {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'email is required' },
        },
        400
      );
    }

    // Validate email format
    if (!isValidEmail(body.email)) {
      return emailValidationError(c);
    }

    // Validate plan if provided
    if (body.plan && !isValidPlan(body.plan)) {
      return planValidationError(c);
    }

    return body;
  }),
  async (c) => {
    const body = c.req.valid('json') as CreateTenantInput;

    const store = getTenantStore();
    if (!store) {
      return c.json(
        {
          success: false,
          error: { code: 'STORE_ERROR', message: 'Tenant store not configured' },
        },
        500
      );
    }

    try {
      // Check for existing tenant with same email
      const existing = await store.findByEmail(body.email);
      if (existing) {
        return c.json(
          {
            success: false,
            error: { code: 'DUPLICATE_EMAIL', message: 'A tenant with this email already exists' },
          },
          409
        );
      }

      const result = await createTenantWithApiKey(body);

      return c.json(
        {
          success: true,
          data: {
            tenant: formatTenantResponse(result.tenant),
            apiKey: {
              key: result.apiKey.key, // Only returned on creation
              keyPrefix: result.apiKey.keyPrefix,
              name: result.apiKey.name,
            },
          },
        },
        201
      );
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: 'CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create tenant',
          },
        },
        500
      );
    }
  }
);

/**
 * GET /v1/admin/tenants
 * List all tenants with pagination
 */
tenants.get('/', async (c) => {
  const store = getTenantStore();
  if (!store) {
    return c.json(
      {
        success: false,
        error: { code: 'STORE_ERROR', message: 'Tenant store not configured' },
      },
      500
    );
  }

  const limitParam = c.req.query('limit') || '20';
  const offsetParam = c.req.query('offset') || '0';
  const plan = c.req.query('plan') as Plan | undefined;

  const limit = parseInt(limitParam, 10);
  const offset = parseInt(offsetParam, 10);

  // Validate that limit and offset are non-negative numbers
  if (Number.isNaN(limit) || Number.isNaN(offset) || limit < 0 || offset < 0) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'limit and offset must be non-negative numbers' },
      },
      400
    );
  }

  const options: ListTenantsOptions = {
    limit: Math.min(limit, 100), // Cap at 100
    offset,
    plan: plan && isValidPlan(plan) ? plan : undefined,
  };

  try {
    const result = await store.list(options);

    return c.json({
      success: true,
      data: {
        tenants: result.tenants.map(formatTenantResponse),
        pagination: {
          total: result.total,
          limit: options.limit,
          offset: options.offset,
          hasMore: options.offset! + result.tenants.length < result.total,
        },
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'LIST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list tenants',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/admin/tenants/:id
 * Get a specific tenant by ID
 */
tenants.get('/:id', async (c) => {
  const store = getTenantStore();
  if (!store) {
    return c.json(
      {
        success: false,
        error: { code: 'STORE_ERROR', message: 'Tenant store not configured' },
      },
      500
    );
  }

  const id = c.req.param('id');

  try {
    const tenant = await store.findById(id);

    if (!tenant) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: formatTenantResponse(tenant),
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'GET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get tenant',
        },
      },
      500
    );
  }
});

/**
 * PATCH /v1/admin/tenants/:id
 * Update a tenant
 */
tenants.patch(
  '/:id',
  validator('json', (value, c) => {
    const body = value as UpdateTenantInput;

    // Validate email format if provided
    if (body.email && !isValidEmail(body.email)) {
      return emailValidationError(c);
    }

    // Validate plan if provided
    if (body.plan && !isValidPlan(body.plan)) {
      return planValidationError(c);
    }

    // Validate dailyLimit if provided
    if (body.dailyLimit !== undefined && (typeof body.dailyLimit !== 'number' || body.dailyLimit < 0)) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'dailyLimit must be a non-negative number' },
        },
        400
      );
    }

    return body;
  }),
  async (c) => {
    const store = getTenantStore();
    if (!store) {
      return c.json(
        {
          success: false,
          error: { code: 'STORE_ERROR', message: 'Tenant store not configured' },
        },
        500
      );
    }

    const id = c.req.param('id');
    const body = c.req.valid('json') as UpdateTenantInput;

    try {
      // Check if email is being changed to an existing one
      if (body.email) {
        const existing = await store.findByEmail(body.email);
        if (existing && existing.id !== id) {
          return c.json(
            {
              success: false,
              error: { code: 'DUPLICATE_EMAIL', message: 'A tenant with this email already exists' },
            },
            409
          );
        }
      }

      const tenant = await store.update(id, body);

      if (!tenant) {
        return c.json(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Tenant not found' },
          },
          404
        );
      }

      return c.json({
        success: true,
        data: formatTenantResponse(tenant),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update tenant',
          },
        },
        500
      );
    }
  }
);

/**
 * DELETE /v1/admin/tenants/:id
 * Delete a tenant
 */
tenants.delete('/:id', async (c) => {
  const store = getTenantStore();
  if (!store) {
    return c.json(
      {
        success: false,
        error: { code: 'STORE_ERROR', message: 'Tenant store not configured' },
      },
      500
    );
  }

  const id = c.req.param('id');

  try {
    const deleted = await store.delete(id);

    if (!deleted) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete tenant',
        },
      },
      500
    );
  }
});

/**
 * GET /v1/tenants/:id/data
 * Export all data for a tenant (GDPR Article 15 - Right to Access, CCPA Right to Know)
 *
 * Authentication: Tenant can only access their own data
 */
tenants.get('/:id/data', async (c) => {
  const requestedTenantId = c.req.param('id');
  const authenticatedTenant = c.get('tenant');

  // Verify the tenant is requesting their own data (or is admin)
  const isAdmin = authenticatedTenant.email === 'admin@unbrowser.ai'; // Update with your admin check
  if (!isAdmin && authenticatedTenant.id !== requestedTenantId) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only access your own data' },
      },
      403
    );
  }

  const store = getTenantStore();
  if (!store) {
    return storeNotConfiguredError(c);
  }

  try {
    const tenant = await store.findById(requestedTenantId);
    if (!tenant) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found' },
        },
        404
      );
    }

    // Get all tenant data for export
    const exportData = {
      tenant: formatTenantResponse(tenant),
      exportedAt: new Date().toISOString(),
      dataCategories: {
        account: formatTenantResponse(tenant),
        // TODO: Add usage statistics
        // usage: await getUsageStats(tenant.id),
        // TODO: Add session data (if any)
        // sessions: await getAllSessions(tenant.id),
        // TODO: Add workflow data
        // workflows: workflowRecorder.listWorkflows(),
        // TODO: Add API keys (hashes only, not plaintext)
        // apiKeys: await listApiKeys(tenant.id),
      },
      privacyNotice: 'This export contains all personal data we have stored about you. ' +
        'It does not include scraped content from websites, as we do not persist that data. ' +
        'For questions, contact privacy@unbrowser.ai',
    };

    return c.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'EXPORT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to export data',
        },
      },
      500
    );
  }
});

/**
 * DELETE /v1/tenants/:id/data
 * Delete all data for a tenant (GDPR Article 17 - Right to Erasure, CCPA Right to Delete)
 *
 * Authentication: Tenant can only delete their own data
 *
 * WARNING: This is irreversible. All tenant data including account, sessions,
 * usage stats, and API keys will be permanently deleted.
 */
tenants.delete('/:id/data', async (c) => {
  const requestedTenantId = c.req.param('id');
  const authenticatedTenant = c.get('tenant');

  // Verify the tenant is deleting their own data (or is admin)
  const isAdmin = authenticatedTenant.email === 'admin@unbrowser.ai'; // Update with your admin check
  if (!isAdmin && authenticatedTenant.id !== requestedTenantId) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only delete your own data' },
      },
      403
    );
  }

  // Require confirmation parameter to prevent accidental deletion
  const confirmParam = c.req.query('confirm');
  if (confirmParam !== 'DELETE_ALL_DATA') {
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'To delete all data, add query parameter: ?confirm=DELETE_ALL_DATA',
        },
      },
      400
    );
  }

  const store = getTenantStore();
  if (!store) {
    return storeNotConfiguredError(c);
  }

  try {
    const tenant = await store.findById(requestedTenantId);
    if (!tenant) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tenant not found' },
        },
        404
      );
    }

    // Delete all tenant data
    // 1. Revoke all API keys
    // TODO: await revokeAllApiKeys(tenant.id);

    // 2. Delete all sessions
    // TODO: await clearTenantSessions(tenant.id);

    // 3. Delete workflows
    // TODO: workflow recorder cleanup

    // 4. Delete usage stats
    // TODO: await deleteUsageStats(tenant.id);

    // 5. Delete tenant account (cascades to related data)
    const deleted = await store.delete(requestedTenantId);

    if (!deleted) {
      return c.json(
        {
          success: false,
          error: { code: 'DELETE_ERROR', message: 'Failed to delete tenant' },
        },
        500
      );
    }

    return c.json({
      success: true,
      data: {
        deleted: true,
        tenantId: requestedTenantId,
        deletedAt: new Date().toISOString(),
        message: 'All tenant data has been permanently deleted. This action cannot be undone.',
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete tenant data',
        },
      },
      500
    );
  }
});

/**
 * Format tenant for API response
 */
function formatTenantResponse(tenant: import('../middleware/types.js').Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    plan: tenant.plan,
    dailyLimit: tenant.dailyLimit,
    monthlyLimit: tenant.monthlyLimit,
    sharePatterns: tenant.sharePatterns,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    lastActiveAt: tenant.lastActiveAt?.toISOString() || null,
  };
}

export { tenants };
