/**
 * Redis-backed Usage Tracking Service
 *
 * Provides distributed rate limiting and usage tracking using Redis.
 * Falls back to in-memory if Redis is not available.
 *
 * Key patterns:
 * - usage:{tenantId}:{date} - Hash containing usage record
 *
 * All keys expire at midnight UTC + 7 days (for historical queries).
 */

import { getRedisClient, isRedisAvailable, buildKey } from './redis-client.js';
import type { Tier, UsageExport } from './usage.js';
import { getTierCost, clearUsageStore as clearInMemoryStore } from './usage.js';
import * as inMemoryUsage from './usage.js';

/** Usage record stored in Redis */
export interface UsageRecord {
  date: string;
  requests: number;
  units: number;
  byTier: {
    intelligence: { requests: number; units: number };
    lightweight: { requests: number; units: number };
    playwright: { requests: number; units: number };
  };
}

// Cache for checking if Redis is ready
let redisReady: boolean | null = null;

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate seconds until midnight UTC 8 days from now.
 * This retains 7 full days of historical data.
 */
function getTTLSeconds(): number {
  const now = new Date();
  const expiryDate = new Date(now);
  // Set to midnight 8 days from now, retaining 7 full days of history
  expiryDate.setUTCDate(expiryDate.getUTCDate() + 8);
  expiryDate.setUTCHours(0, 0, 0, 0);
  return Math.floor((expiryDate.getTime() - now.getTime()) / 1000);
}

/**
 * Check if we should use Redis (cached for performance)
 */
async function shouldUseRedis(): Promise<boolean> {
  if (redisReady !== null) return redisReady;
  redisReady = await isRedisAvailable();
  return redisReady;
}

/**
 * Reset Redis readiness check (for reconnection)
 */
export function resetRedisCheck(): void {
  redisReady = null;
}

/**
 * Record a request for a tenant with the specified tier
 * Uses Redis for distributed tracking if available
 */
export async function recordUsage(tenantId: string, tier: Tier): Promise<void> {
  const useRedis = await shouldUseRedis();

  if (!useRedis) {
    // Fall back to in-memory
    inMemoryUsage.recordUsage(tenantId, tier);
    return;
  }

  const redis = await getRedisClient();
  if (!redis) {
    inMemoryUsage.recordUsage(tenantId, tier);
    return;
  }

  const today = getToday();
  const cost = getTierCost(tier);
  const key = buildKey('usage', tenantId, today);
  const ttl = getTTLSeconds();

  try {
    // Use Redis pipeline for atomic multi-field update
    const pipeline = redis.pipeline();

    // Increment counters
    pipeline.hincrby(key, 'requests', 1);
    pipeline.hincrby(key, 'units', cost);
    pipeline.hincrby(key, `${tier}_requests`, 1);
    pipeline.hincrby(key, `${tier}_units`, cost);

    // Ensure date field is set
    pipeline.hsetnx(key, 'date', today);

    // Set TTL (only if not already set to avoid resetting)
    pipeline.expire(key, ttl, 'NX');

    await pipeline.exec();
  } catch (error) {
    console.error('[Redis Usage] Record error, falling back to in-memory:', error);
    inMemoryUsage.recordUsage(tenantId, tier);
  }
}

/**
 * Get usage statistics for a tenant for today
 */
export async function getUsageStats(tenantId: string): Promise<UsageRecord> {
  const useRedis = await shouldUseRedis();

  if (!useRedis) {
    return inMemoryUsage.getUsageStats(tenantId);
  }

  const redis = await getRedisClient();
  if (!redis) {
    return inMemoryUsage.getUsageStats(tenantId);
  }

  const today = getToday();
  const key = buildKey('usage', tenantId, today);

  try {
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      // Return empty record if no data
      return {
        date: today,
        requests: 0,
        units: 0,
        byTier: {
          intelligence: { requests: 0, units: 0 },
          lightweight: { requests: 0, units: 0 },
          playwright: { requests: 0, units: 0 },
        },
      };
    }

    return {
      date: today,
      requests: parseInt(data.requests || '0', 10),
      units: parseInt(data.units || '0', 10),
      byTier: {
        intelligence: {
          requests: parseInt(data.intelligence_requests || '0', 10),
          units: parseInt(data.intelligence_units || '0', 10),
        },
        lightweight: {
          requests: parseInt(data.lightweight_requests || '0', 10),
          units: parseInt(data.lightweight_units || '0', 10),
        },
        playwright: {
          requests: parseInt(data.playwright_requests || '0', 10),
          units: parseInt(data.playwright_units || '0', 10),
        },
      },
    };
  } catch (error) {
    console.error('[Redis Usage] Get stats error, falling back to in-memory:', error);
    return inMemoryUsage.getUsageStats(tenantId);
  }
}

/**
 * Get total units used by a tenant for today
 * Optimized for frequent rate limit checks
 */
export async function getTodayUnits(tenantId: string): Promise<number> {
  const useRedis = await shouldUseRedis();

  if (!useRedis) {
    return inMemoryUsage.getTodayUnits(tenantId);
  }

  const redis = await getRedisClient();
  if (!redis) {
    return inMemoryUsage.getTodayUnits(tenantId);
  }

  const today = getToday();
  const key = buildKey('usage', tenantId, today);

  try {
    const units = await redis.hget(key, 'units');
    return parseInt(units || '0', 10);
  } catch (error) {
    console.error('[Redis Usage] Get units error, falling back to in-memory:', error);
    return inMemoryUsage.getTodayUnits(tenantId);
  }
}

/**
 * Get usage statistics for a tenant for a date range
 */
export async function getUsageRange(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<UsageRecord[]> {
  const useRedis = await shouldUseRedis();

  if (!useRedis) {
    return inMemoryUsage.getUsageRange(tenantId, startDate, endDate);
  }

  const redis = await getRedisClient();
  if (!redis) {
    return inMemoryUsage.getUsageRange(tenantId, startDate, endDate);
  }

  const records: UsageRecord[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  try {
    // Build pipeline to fetch all days at once
    const pipeline = redis.pipeline();
    const dates: string[] = [];

    while (current <= end) {
      const date = current.toISOString().split('T')[0];
      dates.push(date);
      pipeline.hgetall(buildKey('usage', tenantId, date));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const results = await pipeline.exec();

    for (let i = 0; i < dates.length; i++) {
      const result = results?.[i];
      if (!result || result[0]) continue; // Error in this command

      const data = result[1] as Record<string, string> | null;
      if (!data || Object.keys(data).length === 0) continue;

      records.push({
        date: dates[i],
        requests: parseInt(data.requests || '0', 10),
        units: parseInt(data.units || '0', 10),
        byTier: {
          intelligence: {
            requests: parseInt(data.intelligence_requests || '0', 10),
            units: parseInt(data.intelligence_units || '0', 10),
          },
          lightweight: {
            requests: parseInt(data.lightweight_requests || '0', 10),
            units: parseInt(data.lightweight_units || '0', 10),
          },
          playwright: {
            requests: parseInt(data.playwright_requests || '0', 10),
            units: parseInt(data.playwright_units || '0', 10),
          },
        },
      });
    }

    return records.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('[Redis Usage] Get range error, falling back to in-memory:', error);
    return inMemoryUsage.getUsageRange(tenantId, startDate, endDate);
  }
}

/**
 * Export usage data for a tenant (for billing integration)
 */
export async function exportUsage(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<UsageExport> {
  const daily = await getUsageRange(tenantId, startDate, endDate);

  const totals = { requests: 0, units: 0 };
  const byTier = {
    intelligence: { requests: 0, units: 0 },
    lightweight: { requests: 0, units: 0 },
    playwright: { requests: 0, units: 0 },
  };

  for (const record of daily) {
    totals.requests += record.requests;
    totals.units += record.units;
    byTier.intelligence.requests += record.byTier.intelligence.requests;
    byTier.intelligence.units += record.byTier.intelligence.units;
    byTier.lightweight.requests += record.byTier.lightweight.requests;
    byTier.lightweight.units += record.byTier.lightweight.units;
    byTier.playwright.requests += record.byTier.playwright.requests;
    byTier.playwright.units += record.byTier.playwright.units;
  }

  return {
    tenantId,
    period: { start: startDate, end: endDate },
    totals,
    byTier,
    daily,
  };
}

/**
 * Clear all usage data (for testing)
 * Warning: This clears Redis data for all tenants!
 */
export async function clearUsageStore(): Promise<void> {
  clearInMemoryStore();

  const useRedis = await shouldUseRedis();
  if (!useRedis) return;

  const redis = await getRedisClient();
  if (!redis) return;

  try {
    // Use SCAN to find all usage keys and delete them
    let cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'usage:*', 'COUNT', 100);
      cursor = newCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (error) {
    console.error('[Redis Usage] Clear error:', error);
  }
}
