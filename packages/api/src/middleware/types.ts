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

  // Authentication fields
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  verificationToken: string | null;
  verificationTokenExpiresAt: Date | null;
  passwordResetToken: string | null;
  passwordResetTokenExpiresAt: Date | null;
}

export interface OAuthAccount {
  id: string;
  tenantId: string;
  provider: 'google' | 'github';
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  id: string;
  tenantId: string;
  sessionToken: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
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
