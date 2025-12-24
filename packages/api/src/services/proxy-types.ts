/**
 * Proxy Management Types
 *
 * Shared types for proxy management, health tracking, and domain risk classification.
 */

import type { Plan } from '../middleware/types.js';

// ============================================================================
// Proxy Tiers & Pools
// ============================================================================

/**
 * Proxy tier levels, ordered by cost and blocking resistance
 */
export type ProxyTier = 'datacenter' | 'isp' | 'residential' | 'premium';

/**
 * Proxy tiers ordered from cheapest to most expensive
 */
export const PROXY_TIER_ORDER: ProxyTier[] = ['datacenter', 'isp', 'residential', 'premium'];

/**
 * Relative cost multiplier for each tier (for usage tracking)
 */
export const PROXY_TIER_COSTS: Record<ProxyTier, number> = {
  datacenter: 1,
  isp: 5,
  residential: 25,
  premium: 100,
};

/**
 * Proxy tiers available per plan
 */
export const PLAN_PROXY_ACCESS: Record<Plan, ProxyTier[]> = {
  FREE: ['datacenter'],
  STARTER: ['datacenter', 'isp'],
  TEAM: ['datacenter', 'isp', 'residential'],
  ENTERPRISE: ['datacenter', 'isp', 'residential', 'premium'],
};

/**
 * Configuration for a proxy pool
 */
export interface ProxyPoolConfig {
  id: string;
  tier: ProxyTier;
  name: string;

  // Connection details
  proxies: ProxyEndpoint[];

  // Pool-level settings
  maxConcurrent?: number;
  rotationStrategy?: 'round-robin' | 'random' | 'least-used' | 'healthiest';
  enabled?: boolean;
}

/**
 * Individual proxy endpoint
 */
export interface ProxyEndpoint {
  id: string;
  url: string; // http://user:pass@host:port or socks5://...
  country?: string;
  city?: string;
  isp?: string;
  isResidential?: boolean;
}

/**
 * Instance of a proxy ready for use
 */
export interface ProxyInstance {
  id: string;
  poolId: string;
  tier: ProxyTier;
  endpoint: ProxyEndpoint;

  // For request execution
  getProxyUrl(): string;

  // For Playwright
  getPlaywrightProxy(): {
    server: string;
    username?: string;
    password?: string;
  };
}

// ============================================================================
// Health Tracking
// ============================================================================

/**
 * Reasons for proxy failure
 */
export type FailureReason =
  | 'blocked' // Site returned 403, challenge page, etc.
  | 'timeout' // Request timed out
  | 'connection_error' // Could not connect to proxy
  | 'rate_limited' // Too many requests
  | 'captcha' // CAPTCHA challenge
  | 'authentication' // Proxy auth failed
  | 'unknown';

/**
 * Per-domain statistics for a proxy
 */
export interface DomainStats {
  domain: string;
  successCount: number;
  failureCount: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  isBlocked: boolean;
  blockDetectedAt: Date | null;
  consecutiveFailures: number;
}

/**
 * Health status for a single proxy
 */
export interface ProxyHealth {
  proxyId: string;
  poolId: string;
  tier: ProxyTier;

  // Overall health metrics
  successRate: number; // 0-1, based on recent requests
  avgLatencyMs: number;
  lastUsed: Date | null;

  // Per-domain tracking
  domainStats: Map<string, DomainStats>;
  blockedDomains: string[];

  // Cooldown management
  cooldownUntil: Date | null;
  cooldownReason: FailureReason | null;

  // Lifecycle
  createdAt: Date;
  totalRequests: number;
  totalFailures: number;

  // Computed
  isHealthy: boolean;
  isInCooldown: boolean;
}

/**
 * Configuration for health tracking
 */
export interface HealthTrackerConfig {
  /** Number of recent requests to track for success rate */
  healthWindow?: number;

  /** Cooldown duration after being blocked (minutes) */
  cooldownMinutes?: number;

  /** Failure rate threshold to trigger cooldown (0-1) */
  blockThreshold?: number;

  /** Consecutive failures to mark as blocked for domain */
  consecutiveFailureThreshold?: number;
}

// ============================================================================
// Domain Risk Classification
// ============================================================================

/**
 * Risk level for a domain
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

/**
 * Known bot protection services
 */
export type BotProtection =
  | 'cloudflare'
  | 'datadome'
  | 'perimeterx'
  | 'akamai'
  | 'imperva'
  | 'kasada'
  | 'shape'
  | 'recaptcha'
  | 'hcaptcha'
  | 'turnstile'
  | 'unknown';

/**
 * Risk assessment for a domain
 */
export interface DomainRisk {
  domain: string;
  riskLevel: RiskLevel;
  confidence: number; // 0-1

  // Risk factors
  factors: {
    knownProtection: BotProtection[];
    historicalBlockRate: number; // 0-1
    requiresResidential: boolean;
    requiresSession: boolean;
    geoRestrictions: string[]; // Country codes
  };

  // Recommendations
  recommendedProxyTier: ProxyTier;
  recommendedDelayMs: number;
  specialHandling: string[];

  // Metadata
  assessedAt: Date;
  source: 'static' | 'historical' | 'realtime' | 'detected';
}

/**
 * Configuration for domain risk classifier
 */
export interface DomainRiskConfig {
  /** Cache duration for risk assessments (minutes) */
  cacheDurationMinutes?: number;

  /** Whether to learn from failures */
  enableLearning?: boolean;

  /** Historical data weight in risk calculation */
  historicalWeight?: number;
}

// ============================================================================
// Proxy Selection
// ============================================================================

/**
 * Request for proxy selection
 */
export interface ProxySelectionRequest {
  domain: string;
  tenantId: string;
  tenantPlan: Plan;

  // Optional preferences
  preferredTier?: ProxyTier;
  preferredCountry?: string;
  requireFresh?: boolean; // Avoid recently-used proxies
  stickySessionId?: string; // Use same proxy for session
}

/**
 * Result of proxy selection
 */
export interface ProxySelectionResult {
  proxy: ProxyInstance;
  riskAssessment: DomainRisk;
  selectionReason: string;
  fallbacksAvailable: number;
}

/**
 * Request options for browse with proxy
 */
export interface ProxyBrowseOptions {
  preferredTier?: ProxyTier;
  preferredCountry?: string;
  requireFresh?: boolean;
  stickySessionId?: string;
}

// ============================================================================
// Proxy Manager
// ============================================================================

/**
 * Statistics for a proxy pool
 */
export interface ProxyPoolStats {
  poolId: string;
  tier: ProxyTier;
  totalProxies: number;
  healthyProxies: number;
  blockedProxies: number;
  inCooldown: number;
  avgSuccessRate: number;
  avgLatencyMs: number;
}

/**
 * Error when proxy selection fails
 */
export interface ProxyError {
  code: 'PROXY_BLOCKED' | 'PROXY_EXHAUSTED' | 'TIER_UNAVAILABLE' | 'NO_PROXY_CONFIGURED';
  message: string;
  domain: string;
  attemptedTiers: ProxyTier[];
  recommendation: {
    retryAfterMs?: number;
    upgradePlan?: boolean;
    alternativeApproach?: string;
  };
}

/**
 * Proxy configuration from environment
 */
export interface ProxyConfig {
  // Pool URLs (comma-separated)
  datacenterUrls?: string;
  ispUrls?: string;

  // Bright Data configuration
  brightdataAuth?: string;
  brightdataZone?: string;
  brightdataCountry?: string;

  // Health tracking
  healthWindow?: number;
  cooldownMinutes?: number;
  blockThreshold?: number;

  // Domain risk
  riskCacheMinutes?: number;
  enableRiskLearning?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse a proxy URL into components
 */
export function parseProxyUrl(url: string): {
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
} {
  const parsed = new URL(url);
  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
  };
}

/**
 * Check if a tier is available for a plan
 */
export function isTierAvailableForPlan(tier: ProxyTier, plan: Plan): boolean {
  return PLAN_PROXY_ACCESS[plan].includes(tier);
}

/**
 * Get the next higher tier
 */
export function getNextTier(tier: ProxyTier): ProxyTier | null {
  const index = PROXY_TIER_ORDER.indexOf(tier);
  if (index === -1 || index >= PROXY_TIER_ORDER.length - 1) {
    return null;
  }
  return PROXY_TIER_ORDER[index + 1];
}

/**
 * Get risk level from block rate
 */
export function getRiskLevelFromBlockRate(blockRate: number): RiskLevel {
  if (blockRate >= 0.7) return 'extreme';
  if (blockRate >= 0.4) return 'high';
  if (blockRate >= 0.15) return 'medium';
  return 'low';
}

/**
 * Get recommended tier for risk level
 */
export function getRecommendedTierForRisk(riskLevel: RiskLevel): ProxyTier {
  switch (riskLevel) {
    case 'extreme':
      return 'premium';
    case 'high':
      return 'residential';
    case 'medium':
      return 'isp';
    case 'low':
    default:
      return 'datacenter';
  }
}
