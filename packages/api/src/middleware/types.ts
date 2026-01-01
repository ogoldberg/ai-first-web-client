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

  // Beta program fields
  isBetaUser: boolean;
  betaInviteCode: string | null;
  betaJoinedAt: Date | null;
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

// =============================================================================
// Beta Program Types
// =============================================================================

export type BetaWaitlistStatus = 'pending' | 'invited' | 'joined' | 'declined';

export interface BetaWaitlistEntry {
  id: string;
  email: string;
  name: string;
  company: string | null;
  useCase: string;
  expectedVolume: string | null;
  referralSource: string | null;
  status: BetaWaitlistStatus;
  inviteCode: string | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BetaInvite {
  id: string;
  code: string;
  email: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
}

export type BetaFeedbackCategory =
  | 'bug'
  | 'feature_request'
  | 'documentation'
  | 'performance'
  | 'usability'
  | 'other';

export type BetaFeedbackPriority = 'low' | 'medium' | 'high' | 'critical';

export interface BetaFeedback {
  id: string;
  tenantId: string;
  category: BetaFeedbackCategory;
  priority: BetaFeedbackPriority;
  title: string;
  description: string;
  context: {
    endpoint?: string;
    requestId?: string;
    errorCode?: string;
    browserInfo?: string;
  } | null;
  status: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'wont_fix';
  adminNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BetaProgramStats {
  waitlist: {
    total: number;
    pending: number;
    invited: number;
    joined: number;
    declined: number;
  };
  activeUsers: number;
  totalFeedback: number;
  openIssues: number;
  inviteCodesActive: number;
}
