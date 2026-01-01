/**
 * Prisma-based Store Implementations
 *
 * Provides TenantStore and ApiKeyStore implementations using Prisma.
 */

import { prisma } from '../lib/prisma.js';
import type { Tenant, ApiKey, Plan } from '../middleware/types.js';
import type { TenantStore, CreateTenantInput, UpdateTenantInput, ListTenantsOptions } from './tenants.js';
import type { ApiKeyStore, CreateApiKeyData } from '../middleware/auth.js';
import type { SessionStore } from './session.js';
import { getSessionExpiryDate } from './session.js';

/**
 * Prisma-based Tenant Store
 */
export class PrismaTenantStore implements TenantStore {
  async create(data: CreateTenantInput): Promise<Tenant> {
    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        email: data.email,
        plan: data.plan || 'FREE',
        dailyLimit: data.dailyLimit || 100,
        monthlyLimit: data.monthlyLimit,
        sharePatterns: data.sharePatterns ?? true,
        passwordHash: data.passwordHash,
        verificationToken: data.verificationToken,
        verificationTokenExpiresAt: data.verificationTokenExpiresAt,
      },
    });
    return this.mapTenant(tenant);
  }

  async findById(id: string): Promise<Tenant | null> {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    return tenant ? this.mapTenant(tenant) : null;
  }

  async findByEmail(email: string): Promise<Tenant | null> {
    const tenant = await prisma.tenant.findUnique({ where: { email } });
    return tenant ? this.mapTenant(tenant) : null;
  }

  async update(id: string, data: UpdateTenantInput): Promise<Tenant | null> {
    try {
      const tenant = await prisma.tenant.update({
        where: { id },
        data: {
          name: data.name,
          email: data.email,
          plan: data.plan,
          dailyLimit: data.dailyLimit,
          monthlyLimit: data.monthlyLimit,
          sharePatterns: data.sharePatterns,
        },
      });
      return this.mapTenant(tenant);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.tenant.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async list(options?: ListTenantsOptions): Promise<{ tenants: Tenant[]; total: number }> {
    const where = options?.plan ? { plan: options.plan } : {};
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        take: options?.limit || 50,
        skip: options?.offset || 0,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.tenant.count({ where }),
    ]);
    return { tenants: tenants.map(this.mapTenant), total };
  }

  async findByVerificationToken(token: string): Promise<Tenant | null> {
    const tenant = await prisma.tenant.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpiresAt: { gt: new Date() },
      },
    });
    return tenant ? this.mapTenant(tenant) : null;
  }

  async findByPasswordResetToken(token: string): Promise<Tenant | null> {
    const tenant = await prisma.tenant.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetTokenExpiresAt: { gt: new Date() },
      },
    });
    return tenant ? this.mapTenant(tenant) : null;
  }

  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await prisma.tenant.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async setVerificationToken(id: string, token: string | null, expiresAt: Date | null): Promise<void> {
    await prisma.tenant.update({
      where: { id },
      data: {
        verificationToken: token,
        verificationTokenExpiresAt: expiresAt,
      },
    });
  }

  async setPasswordResetToken(id: string, token: string | null, expiresAt: Date | null): Promise<void> {
    await prisma.tenant.update({
      where: { id },
      data: {
        passwordResetToken: token,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });
  }

  async setEmailVerified(id: string): Promise<void> {
    await prisma.tenant.update({
      where: { id },
      data: {
        emailVerifiedAt: new Date(),
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });
  }

  async findByOAuthAccount(provider: string, providerAccountId: string): Promise<Tenant | null> {
    const account = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      include: { tenant: true },
    });
    return account ? this.mapTenant(account.tenant) : null;
  }

  async createOAuthAccount(tenantId: string, provider: string, providerAccountId: string): Promise<void> {
    await prisma.oAuthAccount.create({
      data: {
        tenantId,
        provider,
        providerAccountId,
      },
    });
  }

  private mapTenant(tenant: any): Tenant {
    return {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      plan: tenant.plan as Plan,
      dailyLimit: tenant.dailyLimit,
      monthlyLimit: tenant.monthlyLimit,
      sharePatterns: tenant.sharePatterns,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      lastActiveAt: tenant.lastActiveAt,
      emailVerifiedAt: tenant.emailVerifiedAt,
      passwordHash: tenant.passwordHash,
      verificationToken: tenant.verificationToken,
      verificationTokenExpiresAt: tenant.verificationTokenExpiresAt,
      passwordResetToken: tenant.passwordResetToken,
      passwordResetTokenExpiresAt: tenant.passwordResetTokenExpiresAt,
      isBetaUser: tenant.isBetaUser ?? false,
      betaInviteCode: tenant.betaInviteCode ?? null,
      betaJoinedAt: tenant.betaJoinedAt ?? null,
    };
  }
}

/**
 * Prisma-based API Key Store
 */
export class PrismaApiKeyStore implements ApiKeyStore {
  async findByHash(keyHash: string): Promise<(ApiKey & { tenant: Tenant }) | null> {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    });

    if (!apiKey) return null;

    return {
      id: apiKey.id,
      tenantId: apiKey.tenantId,
      keyHash: apiKey.keyHash,
      keyPrefix: apiKey.keyPrefix,
      name: apiKey.name,
      permissions: apiKey.permissions,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      expiresAt: apiKey.expiresAt,
      usageCount: apiKey.usageCount,
      tenant: {
        id: apiKey.tenant.id,
        name: apiKey.tenant.name,
        email: apiKey.tenant.email,
        plan: apiKey.tenant.plan as Plan,
        dailyLimit: apiKey.tenant.dailyLimit,
        monthlyLimit: apiKey.tenant.monthlyLimit,
        sharePatterns: apiKey.tenant.sharePatterns,
        createdAt: apiKey.tenant.createdAt,
        updatedAt: apiKey.tenant.updatedAt,
        lastActiveAt: apiKey.tenant.lastActiveAt,
        passwordHash: apiKey.tenant.passwordHash,
        emailVerifiedAt: apiKey.tenant.emailVerifiedAt,
        verificationToken: apiKey.tenant.verificationToken,
        verificationTokenExpiresAt: apiKey.tenant.verificationTokenExpiresAt,
        passwordResetToken: apiKey.tenant.passwordResetToken,
        passwordResetTokenExpiresAt: apiKey.tenant.passwordResetTokenExpiresAt,
        isBetaUser: (apiKey.tenant as any).isBetaUser ?? false,
        betaInviteCode: (apiKey.tenant as any).betaInviteCode ?? null,
        betaJoinedAt: (apiKey.tenant as any).betaJoinedAt ?? null,
      },
    };
  }

  async create(data: CreateApiKeyData): Promise<ApiKey> {
    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId: data.tenantId,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        name: data.name,
        permissions: data.permissions,
      },
    });

    return {
      id: apiKey.id,
      tenantId: apiKey.tenantId,
      keyHash: apiKey.keyHash,
      keyPrefix: apiKey.keyPrefix,
      name: apiKey.name,
      permissions: apiKey.permissions,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      expiresAt: apiKey.expiresAt,
      usageCount: apiKey.usageCount,
    };
  }

  async updateLastUsed(keyId: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  }

  async updateTenantLastActive(tenantId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { lastActiveAt: new Date() },
    });
  }
}

/**
 * Prisma-based Session Store
 */
export class PrismaSessionStore implements SessionStore {
  async create(
    tenantId: string,
    sessionToken: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<void> {
    await prisma.userSession.create({
      data: {
        tenantId,
        sessionToken,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt: getSessionExpiryDate(),
      },
    });
  }

  async validate(sessionToken: string): Promise<{ tenantId: string; id: string } | null> {
    const session = await prisma.userSession.findUnique({
      where: { sessionToken },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) {
      // Session expired, delete it
      await prisma.userSession.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return { tenantId: session.tenantId, id: session.id };
  }

  async delete(sessionToken: string): Promise<void> {
    await prisma.userSession.delete({
      where: { sessionToken },
    }).catch(() => {
      // Ignore if session doesn't exist
    });
  }

  async deleteAllForTenant(tenantId: string): Promise<number> {
    const result = await prisma.userSession.deleteMany({
      where: { tenantId },
    });
    return result.count;
  }

  async updateActivity(sessionToken: string): Promise<void> {
    await prisma.userSession.update({
      where: { sessionToken },
      data: { lastActivityAt: new Date() },
    }).catch(() => {
      // Ignore if session doesn't exist
    });
  }

  async cleanupExpired(): Promise<number> {
    const result = await prisma.userSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }
}

/**
 * Initialize all stores - call this on server startup
 */
export function initializeStores(): {
  tenantStore: PrismaTenantStore;
  apiKeyStore: PrismaApiKeyStore;
  sessionStore: PrismaSessionStore;
} {
  return {
    tenantStore: new PrismaTenantStore(),
    apiKeyStore: new PrismaApiKeyStore(),
    sessionStore: new PrismaSessionStore(),
  };
}
