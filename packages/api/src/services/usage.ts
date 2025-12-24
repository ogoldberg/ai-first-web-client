/**
 * Usage Tracking Service
 *
 * Tracks request usage by tier for billing and analytics.
 * Each tier has a different cost in units:
 * - INTELLIGENCE: 1 unit (fast, no browser)
 * - LIGHTWEIGHT: 5 units (simple DOM parsing)
 * - PLAYWRIGHT: 25 units (full browser rendering)
 */

export type Tier = 'intelligence' | 'lightweight' | 'playwright';

// Cost units per tier
const TIER_COSTS: Record<Tier, number> = {
  intelligence: 1,
  lightweight: 5,
  playwright: 25,
};

// In-memory usage store (per tenant, per day)
interface UsageRecord {
  date: string;
  requests: number;
  units: number;
  byTier: {
    intelligence: { requests: number; units: number };
    lightweight: { requests: number; units: number };
    playwright: { requests: number; units: number };
  };
}

const usageStore = new Map<string, UsageRecord>();

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get or create a usage record for a tenant for today
 */
function getOrCreateRecord(tenantId: string): UsageRecord {
  const today = getToday();
  const key = `${tenantId}:${today}`;

  let record = usageStore.get(key);
  if (!record || record.date !== today) {
    record = {
      date: today,
      requests: 0,
      units: 0,
      byTier: {
        intelligence: { requests: 0, units: 0 },
        lightweight: { requests: 0, units: 0 },
        playwright: { requests: 0, units: 0 },
      },
    };
    usageStore.set(key, record);
  }

  return record;
}

/**
 * Record a request for a tenant with the specified tier
 */
export function recordUsage(tenantId: string, tier: Tier): void {
  const record = getOrCreateRecord(tenantId);
  const cost = TIER_COSTS[tier] || TIER_COSTS.intelligence;

  record.requests++;
  record.units += cost;

  const tierRecord = record.byTier[tier];
  if (tierRecord) {
    tierRecord.requests++;
    tierRecord.units += cost;
  }
}

/**
 * Get usage statistics for a tenant for today
 */
export function getUsageStats(tenantId: string): UsageRecord {
  return getOrCreateRecord(tenantId);
}

/**
 * Get usage statistics for a tenant for a date range
 */
export function getUsageRange(
  tenantId: string,
  startDate: string,
  endDate: string
): UsageRecord[] {
  const records: UsageRecord[] = [];

  for (const [key, record] of usageStore.entries()) {
    if (key.startsWith(`${tenantId}:`) && record.date >= startDate && record.date <= endDate) {
      records.push(record);
    }
  }

  return records.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get total units used by a tenant for today
 */
export function getTodayUnits(tenantId: string): number {
  return getOrCreateRecord(tenantId).units;
}

/**
 * Get total requests by a tenant for today
 */
export function getTodayRequests(tenantId: string): number {
  return getOrCreateRecord(tenantId).requests;
}

/**
 * Get the cost in units for a tier
 */
export function getTierCost(tier: Tier): number {
  return TIER_COSTS[tier] || TIER_COSTS.intelligence;
}

/**
 * Check if a tenant can afford a request at the given tier
 */
export function canAfford(tenantId: string, tier: Tier, dailyLimit: number): boolean {
  const currentUnits = getTodayUnits(tenantId);
  const cost = getTierCost(tier);
  return currentUnits + cost <= dailyLimit;
}

/**
 * Clear all usage data (for testing)
 */
export function clearUsageStore(): void {
  usageStore.clear();
}

/**
 * Export usage data for a tenant (for billing integration)
 */
export interface UsageExport {
  tenantId: string;
  period: {
    start: string;
    end: string;
  };
  totals: {
    requests: number;
    units: number;
  };
  byTier: {
    intelligence: { requests: number; units: number };
    lightweight: { requests: number; units: number };
    playwright: { requests: number; units: number };
  };
  daily: UsageRecord[];
}

export function exportUsage(tenantId: string, startDate: string, endDate: string): UsageExport {
  const daily = getUsageRange(tenantId, startDate, endDate);

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
