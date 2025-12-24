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
  create(data: CreateTenantInput): Promise<Tenant>;
  findById(id: string): Promise<Tenant | null>;
  findByEmail(email: string): Promise<Tenant | null>;
  update(id: string, data: UpdateTenantInput): Promise<Tenant | null>;
  delete(id: string): Promise<boolean>;
  list(options?: ListTenantsOptions): Promise<{ tenants: Tenant[]; total: number }>;
}

export interface CreateTenantInput {
  name: string;
  email: string;
  plan?: Plan;
  dailyLimit?: number;
  monthlyLimit?: number | null;
  sharePatterns?: boolean;
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
    };

    this.tenants.set(tenant.id, tenant);
    this.emailIndex.set(tenant.email, tenant.id);

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
