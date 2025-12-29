/**
 * Tenant Management Service
 *
 * Provides CRUD operations for tenant management.
 * Uses a pluggable store interface for different backends.
 */

import { randomUUID } from 'crypto';
import type { Tenant, Plan } from '../middleware/types.js';
import { generateApiKey, getApiKeyStore } from '../middleware/auth.js';

/**
 * Tenant Store Interface
 * Allows for different backends (Prisma, in-memory, etc.)
 */
export interface TenantStore {
  // Core CRUD operations
  create(data: CreateTenantInput): Promise<Tenant>;
  findById(id: string): Promise<Tenant | null>;
  findByEmail(email: string): Promise<Tenant | null>;
  update(id: string, data: UpdateTenantInput): Promise<Tenant | null>;
  delete(id: string): Promise<boolean>;
  list(options?: ListTenantsOptions): Promise<{ tenants: Tenant[]; total: number }>;

  // Authentication methods
  findByVerificationToken(token: string): Promise<Tenant | null>;
  findByPasswordResetToken(token: string): Promise<Tenant | null>;
  setPasswordHash(id: string, passwordHash: string): Promise<void>;
  setVerificationToken(id: string, token: string | null, expiresAt: Date | null): Promise<void>;
  setPasswordResetToken(id: string, token: string | null, expiresAt: Date | null): Promise<void>;
  setEmailVerified(id: string): Promise<void>;

  // OAuth methods
  findByOAuthAccount(provider: string, providerAccountId: string): Promise<Tenant | null>;
  createOAuthAccount(
    tenantId: string,
    provider: string,
    providerAccountId: string
  ): Promise<void>;
}

export interface CreateTenantInput {
  name: string;
  email: string;
  plan?: Plan;
  dailyLimit?: number;
  monthlyLimit?: number | null;
  sharePatterns?: boolean;
  // Auth fields
  passwordHash?: string;
  verificationToken?: string;
  verificationTokenExpiresAt?: Date;
}

export interface UpdateTenantInput {
  name?: string;
  email?: string;
  plan?: Plan;
  dailyLimit?: number;
  monthlyLimit?: number | null;
  sharePatterns?: boolean;
}

export interface ListTenantsOptions {
  limit?: number;
  offset?: number;
  plan?: Plan;
}

// Default limits by plan
const PLAN_LIMITS: Record<Plan, { daily: number; monthly: number | null }> = {
  FREE: { daily: 100, monthly: null },
  STARTER: { daily: 1000, monthly: 30000 },
  TEAM: { daily: 10000, monthly: 300000 },
  ENTERPRISE: { daily: 100000, monthly: null },
};

// Store instance
let tenantStore: TenantStore | null = null;

/**
 * Set the tenant store implementation
 */
export function setTenantStore(store: TenantStore): void {
  tenantStore = store;
}

/**
 * Get the current tenant store
 */
export function getTenantStore(): TenantStore | null {
  return tenantStore;
}

/**
 * Generate a unique tenant ID using crypto.randomUUID
 */
function generateTenantId(): string {
  return `tenant_${randomUUID()}`;
}

/**
 * In-memory tenant store for testing and development
 */
export class InMemoryTenantStore implements TenantStore {
  private tenants = new Map<string, Tenant>();
  private emailIndex = new Map<string, string>(); // email -> id
  private verificationTokenIndex = new Map<string, string>(); // token -> id
  private passwordResetTokenIndex = new Map<string, string>(); // token -> id
  private oauthAccounts = new Map<string, { tenantId: string; provider: string; providerAccountId: string }>(); // "provider:accountId" -> data

  async create(data: CreateTenantInput): Promise<Tenant> {
    // Check for duplicate email
    if (this.emailIndex.has(data.email.toLowerCase())) {
      throw new Error('Tenant with this email already exists');
    }

    const plan = data.plan || 'FREE';
    const limits = PLAN_LIMITS[plan];

    const tenant: Tenant = {
      id: generateTenantId(),
      name: data.name,
      email: data.email.toLowerCase(),
      plan,
      dailyLimit: data.dailyLimit ?? limits.daily,
      monthlyLimit: data.monthlyLimit ?? limits.monthly,
      sharePatterns: data.sharePatterns ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActiveAt: null,
      // Auth fields
      passwordHash: data.passwordHash ?? null,
      emailVerifiedAt: null,
      verificationToken: data.verificationToken ?? null,
      verificationTokenExpiresAt: data.verificationTokenExpiresAt ?? null,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    };

    this.tenants.set(tenant.id, tenant);
    this.emailIndex.set(tenant.email, tenant.id);

    // Index verification token if present
    if (tenant.verificationToken) {
      this.verificationTokenIndex.set(tenant.verificationToken, tenant.id);
    }

    return tenant;
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) || null;
  }

  async findByEmail(email: string): Promise<Tenant | null> {
    const id = this.emailIndex.get(email.toLowerCase());
    if (!id) return null;
    return this.tenants.get(id) || null;
  }

  async update(id: string, data: UpdateTenantInput): Promise<Tenant | null> {
    const tenant = this.tenants.get(id);
    if (!tenant) return null;

    // Handle email change
    if (data.email && data.email.toLowerCase() !== tenant.email) {
      // Check for duplicate
      if (this.emailIndex.has(data.email.toLowerCase())) {
        throw new Error('Tenant with this email already exists');
      }
      // Update index
      this.emailIndex.delete(tenant.email);
      this.emailIndex.set(data.email.toLowerCase(), id);
    }

    // Update fields
    const updated: Tenant = {
      ...tenant,
      name: data.name ?? tenant.name,
      email: data.email?.toLowerCase() ?? tenant.email,
      plan: data.plan ?? tenant.plan,
      dailyLimit: data.dailyLimit ?? tenant.dailyLimit,
      monthlyLimit: data.monthlyLimit !== undefined ? data.monthlyLimit : tenant.monthlyLimit,
      sharePatterns: data.sharePatterns ?? tenant.sharePatterns,
      updatedAt: new Date(),
    };

    this.tenants.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const tenant = this.tenants.get(id);
    if (!tenant) return false;

    this.emailIndex.delete(tenant.email);
    this.tenants.delete(id);
    return true;
  }

  async list(options?: ListTenantsOptions): Promise<{ tenants: Tenant[]; total: number }> {
    let tenants = Array.from(this.tenants.values());

    // Filter by plan
    if (options?.plan) {
      tenants = tenants.filter((t) => t.plan === options.plan);
    }

    const total = tenants.length;

    // Sort by creation date (newest first)
    tenants.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 20;
    tenants = tenants.slice(offset, offset + limit);

    return { tenants, total };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.tenants.clear();
    this.emailIndex.clear();
    this.verificationTokenIndex.clear();
    this.passwordResetTokenIndex.clear();
    this.oauthAccounts.clear();
  }

  // ==========================================================================
  // Authentication Methods
  // ==========================================================================

  async findByVerificationToken(token: string): Promise<Tenant | null> {
    const id = this.verificationTokenIndex.get(token);
    if (!id) return null;
    const tenant = this.tenants.get(id);
    if (!tenant) return null;
    // Check if token is expired
    if (tenant.verificationTokenExpiresAt && tenant.verificationTokenExpiresAt < new Date()) {
      return null;
    }
    return tenant;
  }

  async findByPasswordResetToken(token: string): Promise<Tenant | null> {
    const id = this.passwordResetTokenIndex.get(token);
    if (!id) return null;
    const tenant = this.tenants.get(id);
    if (!tenant) return null;
    // Check if token is expired
    if (tenant.passwordResetTokenExpiresAt && tenant.passwordResetTokenExpiresAt < new Date()) {
      return null;
    }
    return tenant;
  }

  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    const tenant = this.tenants.get(id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    tenant.passwordHash = passwordHash;
    tenant.updatedAt = new Date();
    this.tenants.set(id, tenant);
  }

  async setVerificationToken(id: string, token: string | null, expiresAt: Date | null): Promise<void> {
    const tenant = this.tenants.get(id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Remove old token from index if present
    if (tenant.verificationToken) {
      this.verificationTokenIndex.delete(tenant.verificationToken);
    }

    tenant.verificationToken = token;
    tenant.verificationTokenExpiresAt = expiresAt;
    tenant.updatedAt = new Date();
    this.tenants.set(id, tenant);

    // Add new token to index if present
    if (token) {
      this.verificationTokenIndex.set(token, id);
    }
  }

  async setPasswordResetToken(id: string, token: string | null, expiresAt: Date | null): Promise<void> {
    const tenant = this.tenants.get(id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Remove old token from index if present
    if (tenant.passwordResetToken) {
      this.passwordResetTokenIndex.delete(tenant.passwordResetToken);
    }

    tenant.passwordResetToken = token;
    tenant.passwordResetTokenExpiresAt = expiresAt;
    tenant.updatedAt = new Date();
    this.tenants.set(id, tenant);

    // Add new token to index if present
    if (token) {
      this.passwordResetTokenIndex.set(token, id);
    }
  }

  async setEmailVerified(id: string): Promise<void> {
    const tenant = this.tenants.get(id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Clear verification token
    if (tenant.verificationToken) {
      this.verificationTokenIndex.delete(tenant.verificationToken);
    }

    tenant.emailVerifiedAt = new Date();
    tenant.verificationToken = null;
    tenant.verificationTokenExpiresAt = null;
    tenant.updatedAt = new Date();
    this.tenants.set(id, tenant);
  }

  // ==========================================================================
  // OAuth Methods
  // ==========================================================================

  async findByOAuthAccount(provider: string, providerAccountId: string): Promise<Tenant | null> {
    const key = `${provider}:${providerAccountId}`;
    const account = this.oauthAccounts.get(key);
    if (!account) return null;
    return this.tenants.get(account.tenantId) || null;
  }

  async createOAuthAccount(
    tenantId: string,
    provider: string,
    providerAccountId: string
  ): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const key = `${provider}:${providerAccountId}`;
    if (this.oauthAccounts.has(key)) {
      throw new Error('OAuth account already linked');
    }

    this.oauthAccounts.set(key, {
      tenantId,
      provider,
      providerAccountId,
    });
  }
}

/**
 * Create a new tenant with an initial API key
 */
export interface CreateTenantResult {
  tenant: Tenant;
  apiKey: {
    key: string;
    keyPrefix: string;
    name: string;
  };
}

export async function createTenantWithApiKey(
  data: CreateTenantInput,
  apiKeyName: string = 'Default API Key'
): Promise<CreateTenantResult> {
  if (!tenantStore) {
    throw new Error('Tenant store not configured');
  }

  const apiKeyStore = getApiKeyStore();
  if (!apiKeyStore?.create) {
    throw new Error('API key store not configured or does not support creation');
  }

  const tenant = await tenantStore.create(data);
  const { key, keyHash, keyPrefix } = generateApiKey('live');

  // Persist the API key to the store
  await apiKeyStore.create({
    tenantId: tenant.id,
    keyHash,
    keyPrefix,
    name: apiKeyName,
    permissions: ['browse', 'batch'],
  });

  return {
    tenant,
    apiKey: {
      key,
      keyPrefix,
      name: apiKeyName,
    },
  };
}
