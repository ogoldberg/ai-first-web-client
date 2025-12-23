/**
 * Multi-Tenant Store - Memory Isolation with Shared Pool (CX-008)
 *
 * Provides tenant isolation for multi-tenant deployments with:
 * - Per-tenant data isolation via namespace prefixing
 * - Opt-in shared pattern pool for cross-tenant learning
 * - Usage tracking and attribution
 * - Tenant lifecycle management
 */

import { logger } from './logger.js';
import type { EmbeddedStore, EmbeddedStoreStats } from './embedded-store.js';

// Create a logger for tenant operations
const tenantLogger = logger.create('TenantStore');

/**
 * Namespace constants for shared pool
 */
const SHARED_POOL_NAMESPACE = '__shared_pool__';
const TENANT_REGISTRY_NAMESPACE = '__tenant_registry__';
const SHARED_USAGE_NAMESPACE = '__shared_usage__';

/**
 * Configuration for a tenant
 */
export interface TenantConfig {
  /** Unique tenant identifier */
  tenantId: string;

  /** Whether this tenant contributes patterns to the shared pool */
  sharePatterns: boolean;

  /** Whether this tenant consumes patterns from the shared pool */
  consumeShared: boolean;

  /** Optional display name */
  displayName?: string;

  /** Tenant creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActiveAt: number;
}

/**
 * Default tenant configuration
 */
export const DEFAULT_TENANT_CONFIG: Omit<TenantConfig, 'tenantId' | 'createdAt' | 'lastActiveAt'> = {
  sharePatterns: false,
  consumeShared: true,
};

/**
 * Shared pattern metadata
 */
export interface SharedPattern<T = unknown> {
  /** Pattern data */
  data: T;

  /** Tenant that contributed this pattern */
  contributedBy: string;

  /** Contribution timestamp */
  contributedAt: number;

  /** Number of tenants using this pattern */
  usageCount: number;

  /** Tenants that have used this pattern */
  usedBy: string[];

  /** Last used timestamp */
  lastUsedAt: number | null;

  /** Pattern domain (for filtering) */
  domain?: string;

  /** Pattern category (for organization) */
  category?: string;
}

/**
 * Usage record for shared patterns
 */
export interface PatternUsageRecord {
  patternId: string;
  tenantId: string;
  usedAt: number;
  success: boolean;
}

/**
 * Statistics for the shared pool
 */
export interface SharedPoolStats {
  /** Total patterns in the pool */
  totalPatterns: number;

  /** Patterns by category */
  patternsByCategory: Record<string, number>;

  /** Patterns by contributing tenant */
  patternsByContributor: Record<string, number>;

  /** Total usage count across all patterns */
  totalUsageCount: number;

  /** Most used patterns (top 10) */
  mostUsedPatterns: Array<{ patternId: string; usageCount: number }>;

  /** Number of unique contributors */
  uniqueContributors: number;

  /** Number of unique consumers */
  uniqueConsumers: number;
}

/**
 * TenantStore - Wraps EmbeddedStore with tenant isolation
 *
 * All namespaces are automatically prefixed with the tenant ID
 * to ensure complete data isolation between tenants.
 */
export class TenantStore {
  private store: EmbeddedStore;
  private tenantId: string;
  private config: TenantConfig;
  private log = tenantLogger;

  constructor(store: EmbeddedStore, config: TenantConfig) {
    this.store = store;
    this.tenantId = config.tenantId;
    this.config = config;
  }

  /**
   * Get the tenant-prefixed namespace
   */
  private getNamespace(namespace: string): string {
    return `tenant:${this.tenantId}:${namespace}`;
  }

  /**
   * Get a value from the tenant's store
   */
  get<T>(namespace: string, key: string): T | null {
    this.updateLastActive();
    return this.store.get<T>(this.getNamespace(namespace), key);
  }

  /**
   * Set a value in the tenant's store
   */
  set<T>(namespace: string, key: string, value: T): void {
    this.updateLastActive();
    this.store.set(this.getNamespace(namespace), key, value);
  }

  /**
   * Delete a value from the tenant's store
   */
  delete(namespace: string, key: string): boolean {
    this.updateLastActive();
    return this.store.delete(this.getNamespace(namespace), key);
  }

  /**
   * Check if a key exists in the tenant's store
   */
  has(namespace: string, key: string): boolean {
    return this.store.has(this.getNamespace(namespace), key);
  }

  /**
   * Get all keys in a namespace for this tenant
   */
  keys(namespace: string): string[] {
    return this.store.keys(this.getNamespace(namespace));
  }

  /**
   * Get all entries in a namespace for this tenant
   */
  getAll<T>(namespace: string): Map<string, T> {
    return this.store.getAll<T>(this.getNamespace(namespace));
  }

  /**
   * Clear all entries in a namespace for this tenant
   */
  clear(namespace: string): void {
    this.updateLastActive();
    this.store.clear(this.getNamespace(namespace));
  }

  /**
   * Count entries in a namespace for this tenant
   */
  count(namespace: string): number {
    return this.store.count(this.getNamespace(namespace));
  }

  /**
   * Run operations in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.store.transaction(fn);
  }

  /**
   * Get the tenant ID
   */
  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Get the tenant configuration
   */
  getConfig(): TenantConfig {
    return { ...this.config };
  }

  /**
   * Update tenant configuration
   */
  updateConfig(updates: Partial<Omit<TenantConfig, 'tenantId' | 'createdAt'>>): void {
    this.config = { ...this.config, ...updates };
    this.store.set(TENANT_REGISTRY_NAMESPACE, this.tenantId, this.config);
  }

  /**
   * Check if this tenant shares patterns
   */
  sharesPatterns(): boolean {
    return this.config.sharePatterns;
  }

  /**
   * Check if this tenant consumes shared patterns
   */
  consumesShared(): boolean {
    return this.config.consumeShared;
  }

  /**
   * Update last active timestamp
   */
  private updateLastActive(): void {
    this.config.lastActiveAt = Date.now();
  }
}

/**
 * SharedPatternPool - Manages patterns shared across tenants
 *
 * Patterns can be contributed by tenants who opt-in to sharing,
 * and consumed by tenants who opt-in to using shared data.
 */
export class SharedPatternPool {
  private store: EmbeddedStore;
  private log = tenantLogger;

  constructor(store: EmbeddedStore) {
    this.store = store;
  }

  /**
   * Contribute a pattern to the shared pool
   */
  contributePattern<T>(
    tenantId: string,
    patternId: string,
    data: T,
    options: { domain?: string; category?: string } = {}
  ): void {
    const existing = this.store.get<SharedPattern<T>>(SHARED_POOL_NAMESPACE, patternId);

    const pattern: SharedPattern<T> = existing
      ? {
          ...existing,
          data, // Update data
          contributedAt: Date.now(),
        }
      : {
          data,
          contributedBy: tenantId,
          contributedAt: Date.now(),
          usageCount: 0,
          usedBy: [],
          lastUsedAt: null,
          domain: options.domain,
          category: options.category,
        };

    this.store.set(SHARED_POOL_NAMESPACE, patternId, pattern);

    this.log.info('Pattern contributed to shared pool', {
      patternId,
      tenantId,
      domain: options.domain,
      category: options.category,
    });
  }

  /**
   * Get a shared pattern by ID
   */
  getPattern<T>(patternId: string): SharedPattern<T> | null {
    return this.store.get<SharedPattern<T>>(SHARED_POOL_NAMESPACE, patternId);
  }

  /**
   * Get all shared patterns
   */
  getAllPatterns<T>(): Map<string, SharedPattern<T>> {
    return this.store.getAll<SharedPattern<T>>(SHARED_POOL_NAMESPACE);
  }

  /**
   * Get shared patterns filtered by domain
   */
  getPatternsByDomain<T>(domain: string): Map<string, SharedPattern<T>> {
    const all = this.getAllPatterns<T>();
    const filtered = new Map<string, SharedPattern<T>>();

    for (const [id, pattern] of all) {
      if (pattern.domain === domain) {
        filtered.set(id, pattern);
      }
    }

    return filtered;
  }

  /**
   * Get shared patterns filtered by category
   */
  getPatternsByCategory<T>(category: string): Map<string, SharedPattern<T>> {
    const all = this.getAllPatterns<T>();
    const filtered = new Map<string, SharedPattern<T>>();

    for (const [id, pattern] of all) {
      if (pattern.category === category) {
        filtered.set(id, pattern);
      }
    }

    return filtered;
  }

  /**
   * Record pattern usage by a tenant
   */
  recordUsage(tenantId: string, patternId: string, success: boolean = true): void {
    const pattern = this.store.get<SharedPattern>(SHARED_POOL_NAMESPACE, patternId);

    if (pattern) {
      // Update pattern usage
      if (!pattern.usedBy.includes(tenantId)) {
        pattern.usedBy.push(tenantId);
      }
      pattern.usageCount++;
      pattern.lastUsedAt = Date.now();
      this.store.set(SHARED_POOL_NAMESPACE, patternId, pattern);

      // Record usage event
      const usageRecord: PatternUsageRecord = {
        patternId,
        tenantId,
        usedAt: Date.now(),
        success,
      };

      const usageKey = `${tenantId}:${patternId}:${Date.now()}`;
      this.store.set(SHARED_USAGE_NAMESPACE, usageKey, usageRecord);
    }
  }

  /**
   * Remove a pattern from the shared pool
   */
  removePattern(patternId: string): boolean {
    return this.store.delete(SHARED_POOL_NAMESPACE, patternId);
  }

  /**
   * Get statistics about the shared pool
   */
  getStats(): SharedPoolStats {
    const patterns = this.getAllPatterns();
    const patternsByCategory: Record<string, number> = {};
    const patternsByContributor: Record<string, number> = {};
    const contributorSet = new Set<string>();
    const consumerSet = new Set<string>();
    let totalUsageCount = 0;
    const patternUsage: Array<{ patternId: string; usageCount: number }> = [];

    for (const [patternId, pattern] of patterns) {
      // Count by category
      const category = pattern.category || 'uncategorized';
      patternsByCategory[category] = (patternsByCategory[category] || 0) + 1;

      // Count by contributor
      patternsByContributor[pattern.contributedBy] =
        (patternsByContributor[pattern.contributedBy] || 0) + 1;
      contributorSet.add(pattern.contributedBy);

      // Track consumers
      for (const consumer of pattern.usedBy) {
        consumerSet.add(consumer);
      }

      // Track usage
      totalUsageCount += pattern.usageCount;
      patternUsage.push({ patternId, usageCount: pattern.usageCount });
    }

    // Sort by usage and take top 10
    patternUsage.sort((a, b) => b.usageCount - a.usageCount);
    const mostUsedPatterns = patternUsage.slice(0, 10);

    return {
      totalPatterns: patterns.size,
      patternsByCategory,
      patternsByContributor,
      totalUsageCount,
      mostUsedPatterns,
      uniqueContributors: contributorSet.size,
      uniqueConsumers: consumerSet.size,
    };
  }

  /**
   * Clear all patterns from the shared pool
   */
  clear(): void {
    this.store.clear(SHARED_POOL_NAMESPACE);
    this.store.clear(SHARED_USAGE_NAMESPACE);
  }
}

/**
 * MultiTenantStore - Manages multiple tenant stores with shared pool
 *
 * This is the main entry point for multi-tenant storage operations.
 * It provides:
 * - Tenant lifecycle management (create, get, delete)
 * - Access to tenant-specific stores
 * - Access to the shared pattern pool
 * - Cross-tenant statistics
 */
export class MultiTenantStore {
  private store: EmbeddedStore;
  private tenantStores: Map<string, TenantStore> = new Map();
  private sharedPool: SharedPatternPool;
  private log = tenantLogger;

  constructor(store: EmbeddedStore) {
    this.store = store;
    this.sharedPool = new SharedPatternPool(store);
  }

  /**
   * Get or create a tenant store
   */
  getTenant(
    tenantId: string,
    options: Partial<Omit<TenantConfig, 'tenantId' | 'createdAt' | 'lastActiveAt'>> = {}
  ): TenantStore {
    // Check cache first
    const cached = this.tenantStores.get(tenantId);
    if (cached) {
      return cached;
    }

    // Try to load existing config
    let config = this.store.get<TenantConfig>(TENANT_REGISTRY_NAMESPACE, tenantId);

    if (!config) {
      // Create new tenant
      const now = Date.now();
      config = {
        tenantId,
        ...DEFAULT_TENANT_CONFIG,
        ...options,
        createdAt: now,
        lastActiveAt: now,
      };
      this.store.set(TENANT_REGISTRY_NAMESPACE, tenantId, config);

      this.log.info('Created new tenant', { tenantId, options });
    }

    const tenantStore = new TenantStore(this.store, config);
    this.tenantStores.set(tenantId, tenantStore);

    return tenantStore;
  }

  /**
   * Check if a tenant exists
   */
  hasTenant(tenantId: string): boolean {
    return this.store.has(TENANT_REGISTRY_NAMESPACE, tenantId);
  }

  /**
   * Get tenant configuration without creating the tenant
   */
  getTenantConfig(tenantId: string): TenantConfig | null {
    return this.store.get<TenantConfig>(TENANT_REGISTRY_NAMESPACE, tenantId);
  }

  /**
   * Update tenant configuration
   */
  updateTenantConfig(
    tenantId: string,
    updates: Partial<Omit<TenantConfig, 'tenantId' | 'createdAt'>>
  ): void {
    const config = this.store.get<TenantConfig>(TENANT_REGISTRY_NAMESPACE, tenantId);
    if (config) {
      const updatedConfig = { ...config, ...updates };
      this.store.set(TENANT_REGISTRY_NAMESPACE, tenantId, updatedConfig);

      // Update cached store if present
      const cached = this.tenantStores.get(tenantId);
      if (cached) {
        cached.updateConfig(updates);
      }

      this.log.info('Updated tenant config', { tenantId, updates });
    }
  }

  /**
   * Delete a tenant and all its data
   */
  deleteTenant(tenantId: string): boolean {
    // Remove from cache
    this.tenantStores.delete(tenantId);

    // Remove config
    const deleted = this.store.delete(TENANT_REGISTRY_NAMESPACE, tenantId);

    if (deleted) {
      // Note: We don't automatically delete tenant data here
      // as that would require scanning all namespaces.
      // Use purgeTenantData() for full cleanup.
      this.log.info('Deleted tenant', { tenantId });
    }

    return deleted;
  }

  /**
   * Purge all data for a tenant
   * This is a more thorough cleanup that removes all tenant namespaces
   */
  purgeTenantData(tenantId: string, namespaces: string[]): void {
    const tenant = this.getTenant(tenantId);

    for (const namespace of namespaces) {
      tenant.clear(namespace);
    }

    // Also delete the tenant registration
    this.deleteTenant(tenantId);

    this.log.info('Purged tenant data', { tenantId, namespaces });
  }

  /**
   * List all tenant IDs
   */
  listTenants(): string[] {
    return this.store.keys(TENANT_REGISTRY_NAMESPACE);
  }

  /**
   * Get all tenant configurations
   */
  getAllTenantConfigs(): Map<string, TenantConfig> {
    return this.store.getAll<TenantConfig>(TENANT_REGISTRY_NAMESPACE);
  }

  /**
   * Get the shared pattern pool
   */
  getSharedPool(): SharedPatternPool {
    return this.sharedPool;
  }

  /**
   * Contribute a pattern from a tenant to the shared pool
   *
   * Only works if the tenant has sharePatterns enabled
   */
  contributeToSharedPool<T>(
    tenantId: string,
    patternId: string,
    data: T,
    options: { domain?: string; category?: string } = {}
  ): boolean {
    const config = this.getTenantConfig(tenantId);

    if (!config?.sharePatterns) {
      this.log.warn('Tenant not configured to share patterns', { tenantId });
      return false;
    }

    this.sharedPool.contributePattern(tenantId, patternId, data, options);
    return true;
  }

  /**
   * Get a pattern from the shared pool for a tenant
   *
   * Only works if the tenant has consumeShared enabled
   * Automatically records usage
   */
  getFromSharedPool<T>(
    tenantId: string,
    patternId: string
  ): T | null {
    const config = this.getTenantConfig(tenantId);

    if (!config?.consumeShared) {
      this.log.debug('Tenant not configured to consume shared patterns', { tenantId });
      return null;
    }

    const pattern = this.sharedPool.getPattern<T>(patternId);

    if (pattern) {
      this.sharedPool.recordUsage(tenantId, patternId, true);
      return pattern.data;
    }

    return null;
  }

  /**
   * Get all shared patterns available to a tenant
   *
   * Only returns patterns if the tenant has consumeShared enabled
   */
  getAvailableSharedPatterns<T>(
    tenantId: string,
    filter?: { domain?: string; category?: string }
  ): Map<string, T> {
    const config = this.getTenantConfig(tenantId);
    const result = new Map<string, T>();

    if (!config?.consumeShared) {
      return result;
    }

    let patterns: Map<string, SharedPattern<T>>;

    if (filter?.domain) {
      patterns = this.sharedPool.getPatternsByDomain<T>(filter.domain);
    } else if (filter?.category) {
      patterns = this.sharedPool.getPatternsByCategory<T>(filter.category);
    } else {
      patterns = this.sharedPool.getAllPatterns<T>();
    }

    for (const [id, pattern] of patterns) {
      result.set(id, pattern.data);
    }

    return result;
  }

  /**
   * Get multi-tenant statistics
   */
  getStats(): {
    totalTenants: number;
    activeTenants: number;
    sharingTenants: number;
    consumingTenants: number;
    sharedPool: SharedPoolStats;
  } {
    const configs = this.getAllTenantConfigs();
    const now = Date.now();
    const activeThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

    let activeTenants = 0;
    let sharingTenants = 0;
    let consumingTenants = 0;

    for (const config of configs.values()) {
      if (now - config.lastActiveAt < activeThreshold) {
        activeTenants++;
      }
      if (config.sharePatterns) {
        sharingTenants++;
      }
      if (config.consumeShared) {
        consumingTenants++;
      }
    }

    return {
      totalTenants: configs.size,
      activeTenants,
      sharingTenants,
      consumingTenants,
      sharedPool: this.sharedPool.getStats(),
    };
  }

  /**
   * Get the underlying embedded store
   */
  getBaseStore(): EmbeddedStore {
    return this.store;
  }
}

/**
 * Create a default tenant ID from environment or generate one
 */
export function getDefaultTenantId(): string {
  return process.env.LLM_BROWSER_TENANT_ID || 'default';
}

/**
 * Namespace utilities
 */
export const TenantNamespaces = {
  SHARED_POOL: SHARED_POOL_NAMESPACE,
  TENANT_REGISTRY: TENANT_REGISTRY_NAMESPACE,
  SHARED_USAGE: SHARED_USAGE_NAMESPACE,
} as const;
