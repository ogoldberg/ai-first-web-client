/**
 * API Key Authentication Middleware
 *
 * Validates Bearer tokens in Authorization header.
 * API keys are hashed with SHA-256 and stored in the database.
 * Format: ub_live_xxxxxxxx or ub_test_xxxxxxxx
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Tenant, ApiKey } from './types.js';

// Context type augmentation
declare module 'hono' {
  interface ContextVariableMap {
    tenant: Tenant;
    apiKey: ApiKey;
  }
}

/**
 * API Key creation data
 */
export interface CreateApiKeyData {
  tenantId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  permissions: string[];
}

/**
 * API Key Store Interface
 * Allows for different backends (Prisma, in-memory, etc.)
 */
export interface ApiKeyStore {
  findByHash(keyHash: string): Promise<(ApiKey & { tenant: Tenant }) | null>;
  create?(data: CreateApiKeyData): Promise<ApiKey>;
  updateLastUsed?(keyId: string): Promise<void>;
  updateTenantLastActive?(tenantId: string): Promise<void>;
}

// Default store - will be set by the application
let apiKeyStore: ApiKeyStore | null = null;

/**
 * Set the API key store implementation
 */
export function setApiKeyStore(store: ApiKeyStore): void {
  apiKeyStore = store;
}

/**
 * Get the current API key store
 */
export function getApiKeyStore(): ApiKeyStore | null {
  return apiKeyStore;
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key with cryptographically secure randomness
 * Format: ub_{env}_{random}
 *
 * SECURITY: Uses crypto.randomBytes() instead of Math.random()
 * to ensure cryptographically secure key generation.
 */
export function generateApiKey(env: 'live' | 'test' = 'live'): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  // Use cryptographically secure random bytes (32 bytes = 64 hex chars, we use first 32)
  const randomPart = randomBytes(32).toString('hex').substring(0, 32);

  const key = `ub_${env}_${randomPart}`;
  const keyHash = hashApiKey(key);
  const keyPrefix = key.substring(0, 8);

  return { key, keyHash, keyPrefix };
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(key: string): boolean {
  // Format: ub_live_xxxxxxxx or ub_test_xxxxxxxx (32+ hex chars after prefix)
  const pattern = /^ub_(live|test)_[a-f0-9]{32,}$/;
  return pattern.test(key);
}

/**
 * Auth middleware - validates API key and injects tenant context
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    throw new HTTPException(401, {
      message: 'Authorization header required',
    });
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, {
      message: 'Invalid authorization format. Use: Bearer <api_key>',
    });
  }

  const apiKey = authHeader.slice(7).trim();

  // Validate key format
  if (!apiKey.startsWith('ub_')) {
    throw new HTTPException(401, {
      message: 'Invalid API key format',
    });
  }

  if (!apiKeyStore) {
    throw new HTTPException(500, {
      message: 'API key store not configured',
    });
  }

  const keyHash = hashApiKey(apiKey);

  // Look up the API key
  const record = await apiKeyStore.findByHash(keyHash);

  // SECURITY: Use uniform error message for all auth failures to prevent
  // user enumeration attacks. Attackers cannot distinguish between:
  // - Invalid API key
  // - Revoked API key
  // - Expired API key
  const authFailedMessage = 'Invalid or inactive API key';

  if (!record) {
    throw new HTTPException(401, {
      message: authFailedMessage,
    });
  }

  // Check if key is revoked
  if (record.revokedAt) {
    throw new HTTPException(401, {
      message: authFailedMessage,
    });
  }

  // Check if key is expired
  if (record.expiresAt && record.expiresAt < new Date()) {
    throw new HTTPException(401, {
      message: authFailedMessage,
    });
  }

  // Update last used timestamp (fire and forget)
  if (apiKeyStore.updateLastUsed) {
    apiKeyStore.updateLastUsed(record.id).catch(() => {
      // Ignore errors from usage tracking
    });
  }

  // Update tenant last active (fire and forget)
  if (apiKeyStore.updateTenantLastActive) {
    apiKeyStore.updateTenantLastActive(record.tenantId).catch(() => {
      // Ignore errors
    });
  }

  // Set context variables
  c.set('tenant', record.tenant);
  c.set('apiKey', record);

  await next();
});

/**
 * Permission check middleware factory
 */
export function requirePermission(permission: string) {
  return createMiddleware(async (c, next) => {
    const apiKey = c.get('apiKey');

    if (!apiKey.permissions.includes(permission) && !apiKey.permissions.includes('admin')) {
      throw new HTTPException(403, {
        message: `Missing required permission: ${permission}`,
      });
    }

    await next();
  });
}

/**
 * Create an in-memory API key store for testing
 */
export function createInMemoryApiKeyStore(
  keys: Map<string, ApiKey & { tenant: Tenant }>,
  tenantLookup?: (tenantId: string) => Promise<Tenant | null>
): ApiKeyStore {
  return {
    async findByHash(keyHash: string) {
      return keys.get(keyHash) || null;
    },
    async create(data) {
      const apiKey: ApiKey = {
        id: `key_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        name: data.name,
        permissions: data.permissions,
        tenantId: data.tenantId,
        revokedAt: null,
        expiresAt: null,
        lastUsedAt: null,
        usageCount: 0,
        createdAt: new Date(),
      };

      // If tenantLookup is provided, find the tenant and store the full record
      if (tenantLookup) {
        const tenant = await tenantLookup(data.tenantId);
        if (tenant) {
          keys.set(data.keyHash, { ...apiKey, tenant });
        }
      }

      return apiKey;
    },
    async updateLastUsed(_keyId: string) {
      // No-op for in-memory
    },
    async updateTenantLastActive(_tenantId: string) {
      // No-op for in-memory
    },
  };
}
