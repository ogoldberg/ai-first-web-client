/**
 * Rate Limiting Middleware
 *
 * Enforces daily request limits per tenant based on their plan.
 * Uses tier-based cost units for usage tracking.
 * - INTELLIGENCE tier: 1 unit
 * - LIGHTWEIGHT tier: 5 units
 * - PLAYWRIGHT tier: 25 units
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Plan } from './types.js';
import {
  getTodayUnits,
  recordUsage,
  getTierCost,
  type Tier,
} from '../services/usage.js';

// Re-export Tier type for convenience
export type { Tier } from '../services/usage.js';

// Plan limits (in units per day)
const PLAN_LIMITS: Record<Plan, { daily: number; burst: number }> = {
  FREE: { daily: 100, burst: 10 },
  STARTER: { daily: 1000, burst: 60 },
  TEAM: { daily: 10000, burst: 300 },
  ENTERPRISE: { daily: 100000, burst: 1000 },
};

/**
 * Convert tier to cost units
 */
export function tierToUnits(tier: Tier): number {
  return getTierCost(tier);
}

/**
 * Get next midnight UTC timestamp
 */
function getNextMidnightUTC(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return Math.floor(tomorrow.getTime() / 1000);
}

/**
 * Rate limit middleware - checks limits before request
 */
export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const tenant = c.get('tenant');
  const planKey = tenant.plan as Plan;
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.FREE;

  // Get current usage in units
  const currentUnits = getTodayUnits(tenant.id);
  const dailyLimit = tenant.dailyLimit || limits.daily;

  // Check if already over limit
  if (currentUnits >= dailyLimit) {
    // Set rate limit headers
    c.header('X-RateLimit-Limit', dailyLimit.toString());
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', getNextMidnightUTC().toString());

    throw new HTTPException(429, {
      message: `Daily limit exceeded. Limit: ${dailyLimit} units, Used: ${currentUnits} units`,
    });
  }

  // Set rate limit headers (remaining is approximate - actual cost depends on tier used)
  c.header('X-RateLimit-Limit', dailyLimit.toString());
  c.header('X-RateLimit-Remaining', Math.max(0, dailyLimit - currentUnits).toString());
  c.header('X-RateLimit-Reset', getNextMidnightUTC().toString());

  // Proceed with request
  await next();
});

/**
 * Record usage after a successful request
 * This should be called after the browse/fetch completes to record the actual tier used
 */
export function recordTierUsage(tenantId: string, tier: string): void {
  // Normalize tier name to lowercase
  const normalizedTier = tier.toLowerCase() as Tier;
  recordUsage(tenantId, normalizedTier);
}
