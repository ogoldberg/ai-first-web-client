/**
 * Common Types for API Middleware
 *
 * These types are defined here to avoid Prisma dependency for the initial implementation.
 * When the Prisma schema is deployed, these can be replaced with generated types.
 */

export type Plan = 'FREE' | 'STARTER' | 'TEAM' | 'ENTERPRISE';

export interface Tenant {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  dailyLimit: number;
  monthlyLimit: number | null;
  sharePatterns: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date | null;
}

export interface ApiKey {
  id: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  permissions: string[];
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  usageCount: number;
  createdAt: Date;
  tenantId: string;
  tenant?: Tenant;
}
