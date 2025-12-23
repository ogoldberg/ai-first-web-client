/**
 * Usage Metering & Tier Cost Reporting (GTM-001)
 *
 * Tracks per-request tier usage and cost signals for analytics and billing.
 * Provides aggregation by domain, tier, and time period.
 */

import { RenderTier } from '../core/tiered-fetcher.js';
import { PersistentStore } from './persistent-store.js';
import { logger as loggerFactory } from './logger.js';

const logger = loggerFactory.create('UsageMeter');

// ============================================
// Cost Configuration
// ============================================

/**
 * Cost units per tier (relative cost, not actual pricing).
 * These represent computational/resource cost, not billing amounts.
 *
 * Intelligence: Fastest, minimal resources (static parsing)
 * Lightweight: Medium, uses linkedom + Node VM
 * Playwright: Slowest, full Chromium browser
 */
export const TIER_COST_UNITS: Record<RenderTier, number> = {
  intelligence: 1,
  lightweight: 5,
  playwright: 25,
};

/**
 * Estimated latency ranges in milliseconds for each tier
 */
export const TIER_LATENCY_ESTIMATES: Record<RenderTier, { min: number; max: number; typical: number }> = {
  intelligence: { min: 50, max: 200, typical: 100 },
  lightweight: { min: 200, max: 500, typical: 300 },
  playwright: { min: 2000, max: 5000, typical: 3000 },
};

// ============================================
// Types
// ============================================

/**
 * A single usage event
 */
export interface UsageEvent {
  /** Unique event ID */
  id: string;
  /** Timestamp of the event */
  timestamp: number;
  /** Domain of the request */
  domain: string;
  /** Full URL requested */
  url: string;
  /** Tier used for the request */
  tier: RenderTier;
  /** Whether the request succeeded */
  success: boolean;
  /** Actual duration in milliseconds */
  durationMs: number;
  /** Cost units for this request */
  costUnits: number;
  /** Tiers that were attempted (for fallback tracking) */
  tiersAttempted: RenderTier[];
  /** Whether fallback occurred */
  fellBack: boolean;
  /** Optional tenant ID for multi-tenant deployments */
  tenantId?: string;
}

/**
 * Aggregated usage for a period
 */
export interface UsageAggregate {
  /** Start of the period */
  periodStart: number;
  /** End of the period */
  periodEnd: number;
  /** Total requests in period */
  requestCount: number;
  /** Successful requests */
  successCount: number;
  /** Failed requests */
  failureCount: number;
  /** Total cost units consumed */
  totalCostUnits: number;
  /** Breakdown by tier */
  byTier: Record<RenderTier, TierUsage>;
  /** Top domains by cost */
  topDomainsByCost: DomainUsage[];
  /** Top domains by request count */
  topDomainsByRequests: DomainUsage[];
  /** Average duration in ms */
  avgDurationMs: number;
  /** Fallback rate (0-1) */
  fallbackRate: number;
}

export interface TierUsage {
  requestCount: number;
  successCount: number;
  failureCount: number;
  costUnits: number;
  avgDurationMs: number;
  successRate: number;
}

export interface DomainUsage {
  domain: string;
  requestCount: number;
  costUnits: number;
  successRate: number;
  preferredTier: RenderTier;
}

/**
 * Time period for aggregation
 */
export type TimePeriod = 'hour' | 'day' | 'week' | 'month' | 'all';

/**
 * Usage summary for reporting
 */
export interface UsageSummary {
  /** Total requests since tracking started */
  totalRequests: number;
  /** Total cost units consumed */
  totalCostUnits: number;
  /** Overall success rate (0-1) */
  successRate: number;
  /** Average cost per request */
  avgCostPerRequest: number;
  /** Current period stats */
  currentPeriod: UsageAggregate;
  /** Previous period stats (for comparison) */
  previousPeriod?: UsageAggregate;
  /** Cost trend: positive means increasing cost, negative means decreasing */
  costTrend?: number;
  /** Request trend: positive means increasing requests */
  requestTrend?: number;
  /** Timestamp of first event */
  trackingSince: number;
  /** Timestamp of last event */
  lastActivity: number;
}

/**
 * Options for querying usage
 */
export interface UsageQueryOptions {
  /** Filter by domain */
  domain?: string;
  /** Filter by tier */
  tier?: RenderTier;
  /** Filter by tenant ID */
  tenantId?: string;
  /** Time period for aggregation */
  period?: TimePeriod;
  /** Custom start time (overrides period) */
  startTime?: number;
  /** Custom end time (overrides period) */
  endTime?: number;
  /** Limit for top domains */
  topDomainsLimit?: number;
}

// ============================================
// UsageMeter Class
// ============================================

export class UsageMeter {
  private events: UsageEvent[] = [];
  private persistentStore: PersistentStore<UsageEvent[]>;
  private maxEvents: number;
  private initialized = false;

  constructor(options?: {
    persistPath?: string;
    maxEvents?: number;
  }) {
    this.maxEvents = options?.maxEvents ?? 50000;
    this.persistentStore = new PersistentStore<UsageEvent[]>(
      options?.persistPath ?? 'usage-meter.json',
      { debounceMs: 5000 }
    );
  }

  /**
   * Initialize the usage meter (load persisted events)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const loaded = await this.persistentStore.load();
    if (loaded) {
      this.events = loaded;
      logger.info('Loaded usage events', { count: this.events.length });
    }
    this.initialized = true;
  }

  /**
   * Record a usage event
   */
  async record(event: Omit<UsageEvent, 'id' | 'costUnits'>): Promise<UsageEvent> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fullEvent: UsageEvent = {
      ...event,
      id: this.generateId(),
      costUnits: this.calculateCost(event.tier, event.tiersAttempted),
    };

    this.events.push(fullEvent);

    // Trim old events if exceeding max
    if (this.events.length > this.maxEvents) {
      const trimCount = this.events.length - this.maxEvents;
      this.events = this.events.slice(trimCount);
      logger.debug('Trimmed old usage events', { trimCount });
    }

    // Persist asynchronously
    this.persistentStore.save(this.events);

    logger.debug('Recorded usage event', {
      domain: event.domain,
      tier: event.tier,
      costUnits: fullEvent.costUnits,
      success: event.success,
    });

    return fullEvent;
  }

  /**
   * Calculate cost units for a request
   */
  private calculateCost(finalTier: RenderTier, tiersAttempted: RenderTier[]): number {
    // Sum cost of all tiers attempted (failed attempts still cost resources)
    let totalCost = 0;

    for (const tier of tiersAttempted) {
      if (tier === finalTier) {
        // Full cost for the final tier
        totalCost += TIER_COST_UNITS[tier];
      } else {
        // Partial cost for failed attempts (50% since they didn't complete)
        totalCost += Math.ceil(TIER_COST_UNITS[tier] * 0.5);
      }
    }

    return totalCost;
  }

  /**
   * Generate a unique event ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Get period boundaries based on time period
   */
  private getPeriodBoundaries(period: TimePeriod, referenceTime?: number): { start: number; end: number } {
    const now = referenceTime ?? Date.now();

    switch (period) {
      case 'hour': {
        const hourStart = new Date(now);
        hourStart.setMinutes(0, 0, 0);
        return { start: hourStart.getTime(), end: now };
      }
      case 'day': {
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        return { start: dayStart.getTime(), end: now };
      }
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return { start: weekStart.getTime(), end: now };
      }
      case 'month': {
        const monthStart = new Date(now);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        return { start: monthStart.getTime(), end: now };
      }
      case 'all':
      default:
        return { start: 0, end: now };
    }
  }

  /**
   * Get previous period boundaries for comparison
   */
  private getPreviousPeriodBoundaries(period: TimePeriod): { start: number; end: number } | undefined {
    const now = Date.now();

    switch (period) {
      case 'hour': {
        const prevHourEnd = new Date(now);
        prevHourEnd.setMinutes(0, 0, 0);
        const prevHourStart = new Date(prevHourEnd.getTime() - 60 * 60 * 1000);
        return { start: prevHourStart.getTime(), end: prevHourEnd.getTime() };
      }
      case 'day': {
        const prevDayEnd = new Date(now);
        prevDayEnd.setHours(0, 0, 0, 0);
        const prevDayStart = new Date(prevDayEnd.getTime() - 24 * 60 * 60 * 1000);
        return { start: prevDayStart.getTime(), end: prevDayEnd.getTime() };
      }
      case 'week': {
        const { start: weekStart } = this.getPeriodBoundaries('week');
        const prevWeekEnd = weekStart;
        const prevWeekStart = prevWeekEnd - 7 * 24 * 60 * 60 * 1000;
        return { start: prevWeekStart, end: prevWeekEnd };
      }
      case 'month': {
        const { start: monthStart } = this.getPeriodBoundaries('month');
        const prevMonthEnd = monthStart;
        const prevMonthStart = new Date(prevMonthEnd);
        prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
        return { start: prevMonthStart.getTime(), end: prevMonthEnd };
      }
      default:
        return undefined;
    }
  }

  /**
   * Filter events based on query options
   */
  private filterEvents(options: UsageQueryOptions): UsageEvent[] {
    let filtered = this.events;

    // Time filter
    if (options.startTime !== undefined || options.endTime !== undefined) {
      const start = options.startTime ?? 0;
      const end = options.endTime ?? Date.now();
      filtered = filtered.filter(e => e.timestamp >= start && e.timestamp <= end);
    } else if (options.period && options.period !== 'all') {
      const { start, end } = this.getPeriodBoundaries(options.period);
      filtered = filtered.filter(e => e.timestamp >= start && e.timestamp <= end);
    }

    // Domain filter
    if (options.domain) {
      filtered = filtered.filter(e => e.domain === options.domain);
    }

    // Tier filter
    if (options.tier) {
      filtered = filtered.filter(e => e.tier === options.tier);
    }

    // Tenant filter
    if (options.tenantId) {
      filtered = filtered.filter(e => e.tenantId === options.tenantId);
    }

    return filtered;
  }

  /**
   * Aggregate events into usage stats
   */
  private aggregateEvents(events: UsageEvent[], periodStart: number, periodEnd: number, topLimit = 10): UsageAggregate {
    if (events.length === 0) {
      return {
        periodStart,
        periodEnd,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        totalCostUnits: 0,
        byTier: {
          intelligence: { requestCount: 0, successCount: 0, failureCount: 0, costUnits: 0, avgDurationMs: 0, successRate: 0 },
          lightweight: { requestCount: 0, successCount: 0, failureCount: 0, costUnits: 0, avgDurationMs: 0, successRate: 0 },
          playwright: { requestCount: 0, successCount: 0, failureCount: 0, costUnits: 0, avgDurationMs: 0, successRate: 0 },
        },
        topDomainsByCost: [],
        topDomainsByRequests: [],
        avgDurationMs: 0,
        fallbackRate: 0,
      };
    }

    // Aggregate by tier
    const byTier: Record<RenderTier, { count: number; success: number; cost: number; duration: number }> = {
      intelligence: { count: 0, success: 0, cost: 0, duration: 0 },
      lightweight: { count: 0, success: 0, cost: 0, duration: 0 },
      playwright: { count: 0, success: 0, cost: 0, duration: 0 },
    };

    // Aggregate by domain
    const byDomain: Record<string, { count: number; success: number; cost: number; tier: RenderTier }> = {};

    let totalDuration = 0;
    let fallbackCount = 0;

    for (const event of events) {
      // Tier stats
      byTier[event.tier].count++;
      if (event.success) byTier[event.tier].success++;
      byTier[event.tier].cost += event.costUnits;
      byTier[event.tier].duration += event.durationMs;

      // Domain stats
      if (!byDomain[event.domain]) {
        byDomain[event.domain] = { count: 0, success: 0, cost: 0, tier: event.tier };
      }
      byDomain[event.domain].count++;
      if (event.success) byDomain[event.domain].success++;
      byDomain[event.domain].cost += event.costUnits;
      byDomain[event.domain].tier = event.tier; // Most recent tier

      // Overall stats
      totalDuration += event.durationMs;
      if (event.fellBack) fallbackCount++;
    }

    // Convert tier stats
    const tierUsage: Record<RenderTier, TierUsage> = {} as Record<RenderTier, TierUsage>;
    for (const tier of ['intelligence', 'lightweight', 'playwright'] as RenderTier[]) {
      const stats = byTier[tier];
      tierUsage[tier] = {
        requestCount: stats.count,
        successCount: stats.success,
        failureCount: stats.count - stats.success,
        costUnits: stats.cost,
        avgDurationMs: stats.count > 0 ? Math.round(stats.duration / stats.count) : 0,
        successRate: stats.count > 0 ? stats.success / stats.count : 0,
      };
    }

    // Top domains by cost
    const domainList: DomainUsage[] = Object.entries(byDomain).map(([domain, stats]) => ({
      domain,
      requestCount: stats.count,
      costUnits: stats.cost,
      successRate: stats.count > 0 ? stats.success / stats.count : 0,
      preferredTier: stats.tier,
    }));

    const topByCost = [...domainList].sort((a, b) => b.costUnits - a.costUnits).slice(0, topLimit);
    const topByRequests = [...domainList].sort((a, b) => b.requestCount - a.requestCount).slice(0, topLimit);

    const totalSuccess = events.filter(e => e.success).length;

    return {
      periodStart,
      periodEnd,
      requestCount: events.length,
      successCount: totalSuccess,
      failureCount: events.length - totalSuccess,
      totalCostUnits: events.reduce((sum, e) => sum + e.costUnits, 0),
      byTier: tierUsage,
      topDomainsByCost: topByCost,
      topDomainsByRequests: topByRequests,
      avgDurationMs: Math.round(totalDuration / events.length),
      fallbackRate: fallbackCount / events.length,
    };
  }

  /**
   * Get usage summary with trends
   */
  async getSummary(options: UsageQueryOptions = {}): Promise<UsageSummary> {
    if (!this.initialized) {
      await this.initialize();
    }

    const period = options.period ?? 'day';
    const { start: currentStart, end: currentEnd } = options.startTime !== undefined || options.endTime !== undefined
      ? { start: options.startTime ?? 0, end: options.endTime ?? Date.now() }
      : this.getPeriodBoundaries(period);

    // Get current period events
    const currentEvents = this.filterEvents({ ...options, startTime: currentStart, endTime: currentEnd });
    const currentPeriod = this.aggregateEvents(currentEvents, currentStart, currentEnd, options.topDomainsLimit);

    // Get previous period for comparison
    let previousPeriod: UsageAggregate | undefined;
    let costTrend: number | undefined;
    let requestTrend: number | undefined;

    if (period !== 'all') {
      const prevBoundaries = this.getPreviousPeriodBoundaries(period);
      if (prevBoundaries) {
        const prevEvents = this.filterEvents({ ...options, startTime: prevBoundaries.start, endTime: prevBoundaries.end });
        previousPeriod = this.aggregateEvents(prevEvents, prevBoundaries.start, prevBoundaries.end, options.topDomainsLimit);

        if (previousPeriod.totalCostUnits > 0) {
          costTrend = (currentPeriod.totalCostUnits - previousPeriod.totalCostUnits) / previousPeriod.totalCostUnits;
        }
        if (previousPeriod.requestCount > 0) {
          requestTrend = (currentPeriod.requestCount - previousPeriod.requestCount) / previousPeriod.requestCount;
        }
      }
    }

    // All-time stats
    const allEvents = this.filterEvents({ ...options, period: 'all' });
    const totalRequests = allEvents.length;
    const totalCostUnits = allEvents.reduce((sum, e) => sum + e.costUnits, 0);
    const successRate = totalRequests > 0 ? allEvents.filter(e => e.success).length / totalRequests : 0;
    const avgCostPerRequest = totalRequests > 0 ? totalCostUnits / totalRequests : 0;

    const timestamps = allEvents.map(e => e.timestamp);
    const trackingSince = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
    const lastActivity = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();

    return {
      totalRequests,
      totalCostUnits,
      successRate,
      avgCostPerRequest,
      currentPeriod,
      previousPeriod,
      costTrend,
      requestTrend,
      trackingSince,
      lastActivity,
    };
  }

  /**
   * Get usage aggregated by time periods
   */
  async getUsageByPeriod(
    period: 'hour' | 'day',
    options: UsageQueryOptions & { periods?: number } = {}
  ): Promise<UsageAggregate[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const numPeriods = options.periods ?? (period === 'hour' ? 24 : 7);
    const periodMs = period === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const now = Date.now();

    const results: UsageAggregate[] = [];

    for (let i = numPeriods - 1; i >= 0; i--) {
      const periodEnd = now - i * periodMs;
      const periodStart = periodEnd - periodMs;

      const events = this.filterEvents({
        ...options,
        startTime: periodStart,
        endTime: periodEnd,
      });

      results.push(this.aggregateEvents(events, periodStart, periodEnd, options.topDomainsLimit ?? 5));
    }

    return results;
  }

  /**
   * Get cost breakdown by tier
   */
  async getCostBreakdown(options: UsageQueryOptions = {}): Promise<{
    total: number;
    byTier: Record<RenderTier, { cost: number; percentage: number; requests: number }>;
    avgCostPerRequest: number;
    estimatedMonthlyCost: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const events = this.filterEvents(options);
    const summary = this.aggregateEvents(events, 0, Date.now());

    const total = summary.totalCostUnits;
    const byTier: Record<RenderTier, { cost: number; percentage: number; requests: number }> = {
      intelligence: {
        cost: summary.byTier.intelligence.costUnits,
        percentage: total > 0 ? summary.byTier.intelligence.costUnits / total : 0,
        requests: summary.byTier.intelligence.requestCount,
      },
      lightweight: {
        cost: summary.byTier.lightweight.costUnits,
        percentage: total > 0 ? summary.byTier.lightweight.costUnits / total : 0,
        requests: summary.byTier.lightweight.requestCount,
      },
      playwright: {
        cost: summary.byTier.playwright.costUnits,
        percentage: total > 0 ? summary.byTier.playwright.costUnits / total : 0,
        requests: summary.byTier.playwright.requestCount,
      },
    };

    const avgCostPerRequest = summary.requestCount > 0 ? total / summary.requestCount : 0;

    // Estimate monthly cost based on current rate
    const period = options.period ?? 'day';
    const { start, end } = this.getPeriodBoundaries(period);
    const periodHours = (end - start) / (60 * 60 * 1000);
    const monthlyHours = 30 * 24;
    const estimatedMonthlyCost = periodHours > 0 ? Math.round((total / periodHours) * monthlyHours) : 0;

    return {
      total,
      byTier,
      avgCostPerRequest,
      estimatedMonthlyCost,
    };
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Reset usage data (for testing or admin purposes)
   */
  async reset(): Promise<void> {
    this.events = [];
    await this.persistentStore.save([]);
    logger.info('Usage meter reset');
  }

  /**
   * Flush any pending data to persistent storage
   */
  async flush(): Promise<void> {
    await this.persistentStore.save(this.events);
    await this.persistentStore.flush();
    logger.info('Usage meter flushed');
  }
}

// ============================================
// Singleton Instance
// ============================================

let usageMeterInstance: UsageMeter | null = null;

/**
 * Get or create the global usage meter instance
 */
export function getUsageMeter(): UsageMeter {
  if (!usageMeterInstance) {
    usageMeterInstance = new UsageMeter();
  }
  return usageMeterInstance;
}

/**
 * Reset the global usage meter instance (for testing)
 */
export function resetUsageMeterInstance(): void {
  usageMeterInstance = null;
}
