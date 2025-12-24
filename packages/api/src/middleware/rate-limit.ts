/**
 * Rate Limiting Middleware
 *
 * Enforces daily request limits per tenant based on their plan.
 * Uses in-memory tracking for the initial implementation.
 * Database persistence will be added when the Prisma schema is deployed.
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Plan } from './types.js';

// Tier types
export type Tier = 'INTELLIGENCE' | 'LIGHTWEIGHT' | 'PLAYWRIGHT';

// Plan limits
const PLAN_LIMITS: Record<Plan, { daily: number; burst: number }> = {
  FREE: { daily: 100, burst: 10 },
  STARTER: { daily: 1000, burst: 60 },
  TEAM: { daily: 10000, burst: 300 },
  ENTERPRISE: { daily: 100000, burst: 1000 },
};

// In-memory cache for rate limits
interface UsageCacheEntry {
  date: string;
  count: number;
  lastSync: number;
}

const usageCache = new Map<string, UsageCacheEntry>();
const CACHE_TTL = 10000; // 10 seconds

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current usage for a tenant (in-memory only for now)
 */
async function getUsage(tenantId: string): Promise<number> {
  const today = getToday();
  const cacheKey = `${tenantId}:${today}`;
  const cached = usageCache.get(cacheKey);

  // Return cached value if exists for today
  if (cached && cached.date === today) {
    return cached.count;
  }

  // No usage yet for today
  return 0;
}

/**
 * Increment usage counter
 */
async function incrementUsage(tenantId: string, _tier: Tier = 'INTELLIGENCE'): Promise<void> {
  const today = getToday();
  const cacheKey = `${tenantId}:${today}`;

  const cached = usageCache.get(cacheKey);
  if (cached && cached.date === today) {
    cached.count++;
  } else {
    usageCache.set(cacheKey, {
      date: today,
      count: 1,
      lastSync: Date.now(),
    });
  }

  // TODO: Persist to database when Prisma is deployed
  // This is intentionally fire-and-forget
}

/**
 * Convert tier to cost units
 */
export function tierToUnits(tier: Tier): number {
  switch (tier) {
    case 'INTELLIGENCE':
      return 1;
    case 'LIGHTWEIGHT':
      return 5;
    case 'PLAYWRIGHT':
      return 25;
    default:
      return 1;
  }
}

/**
 * Rate limit middleware
 */
export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const tenant = c.get('tenant');
  const planKey = tenant.plan as Plan;
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.FREE;

  // Check daily limit
  const currentUsage = await getUsage(tenant.id);
  const dailyLimit = tenant.dailyLimit || limits.daily;

  if (currentUsage >= dailyLimit) {
    // Set rate limit headers
    c.header('X-RateLimit-Limit', dailyLimit.toString());
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', getNextMidnightUTC().toString());

    throw new HTTPException(429, {
      message: `Daily limit exceeded. Limit: ${dailyLimit}, Used: ${currentUsage}`,
    });
  }

  // Set rate limit headers
  c.header('X-RateLimit-Limit', dailyLimit.toString());
  c.header('X-RateLimit-Remaining', Math.max(0, dailyLimit - currentUsage - 1).toString());
  c.header('X-RateLimit-Reset', getNextMidnightUTC().toString());

  // Proceed with request
  await next();

  // Increment usage after successful request
  await incrementUsage(tenant.id);
});

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
 * Clear usage cache (for testing)
 */
export function clearUsageCache(): void {
  usageCache.clear();
}
