/**
 * Analytics Dashboard (GTM-002)
 *
 * Provides a unified view of system analytics by aggregating:
 * - Usage metrics (from UsageMeter)
 * - Performance metrics (from PerformanceTracker)
 * - Success/failure rates by tier and domain
 * - Latency trends over time
 * - Cost trends over time
 */

import { getUsageMeter, type UsageSummary, type UsageAggregate, type TimePeriod } from './usage-meter.js';
import { performanceTracker, type SystemPerformance, type PercentileStats } from './performance-tracker.js';
import type { RenderTier } from '../core/tiered-fetcher.js';
import { addSchemaVersion } from '../types/schema-version.js';

// ============================================
// Types
// ============================================

/**
 * Tier-level analytics
 */
export interface TierAnalytics {
  tier: RenderTier;
  requestCount: number;
  successRate: number;
  costUnits: number;
  costPercentage: number;
  latency: PercentileStats | null;
  avgDurationMs: number;
}

/**
 * Domain-level analytics
 */
export interface DomainAnalytics {
  domain: string;
  requestCount: number;
  successRate: number;
  costUnits: number;
  preferredTier: RenderTier;
  avgLatencyMs: number;
  p95LatencyMs: number | null;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  timestamp: number;
  periodLabel: string;
  requestCount: number;
  successRate: number;
  totalCostUnits: number;
  avgLatencyMs: number;
  fallbackRate: number;
}

/**
 * System health indicators
 */
export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  successRate: number;
  avgLatencyMs: number;
  fallbackRate: number;
  issues: string[];
  recommendations: string[];
}

/**
 * Full analytics dashboard response
 */
export interface AnalyticsDashboard {
  /** Schema version for API compatibility */
  schemaVersion: string;
  /** When this snapshot was generated */
  generatedAt: number;
  /** Time period covered */
  period: TimePeriod;

  /** High-level summary */
  summary: {
    totalRequests: number;
    totalCostUnits: number;
    overallSuccessRate: number;
    avgLatencyMs: number;
    totalDomains: number;
    trackingSince: number | null;
    lastActivity: number | null;
  };

  /** System health assessment */
  health: SystemHealth;

  /** Per-tier breakdown */
  byTier: TierAnalytics[];

  /** Top domains by various metrics */
  topDomains: {
    byCost: DomainAnalytics[];
    byRequests: DomainAnalytics[];
    bySlowest: DomainAnalytics[];
    byFastest: DomainAnalytics[];
  };

  /** Time series for trend visualization */
  timeSeries: TimeSeriesPoint[];

  /** Period-over-period trends */
  trends: {
    requestTrend: number | null;
    costTrend: number | null;
    successRateTrend: number | null;
    latencyTrend: number | null;
  };
}

/**
 * Options for dashboard generation
 */
export interface DashboardOptions {
  /** Time period for aggregation (default: 'day') */
  period?: TimePeriod;
  /** Number of top domains to include (default: 10) */
  topDomainsLimit?: number;
  /** Number of time series points (default: 24 for hour, 7 for day) */
  timeSeriesPoints?: number;
  /** Filter by specific domain */
  domain?: string;
  /** Filter by tenant ID */
  tenantId?: string;
}

// ============================================
// Health Assessment
// ============================================

const HEALTH_THRESHOLDS = {
  successRate: { healthy: 0.95, degraded: 0.85 },
  avgLatencyMs: { healthy: 1000, degraded: 3000 },
  fallbackRate: { healthy: 0.1, degraded: 0.3 },
};

function assessHealth(
  successRate: number,
  avgLatencyMs: number,
  fallbackRate: number,
  hasData: boolean = true
): SystemHealth {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Handle edge case: no data means healthy (nothing to be unhealthy about)
  if (!hasData) {
    return {
      overall: 'healthy',
      successRate: 0,
      avgLatencyMs: 0,
      fallbackRate: 0,
      issues: [],
      recommendations: ['No usage data yet. Start browsing to see analytics.'],
    };
  }

  // Handle NaN/undefined values as neutral (not contributing to unhealthy status)
  const safeSuccessRate = isNaN(successRate) ? 1 : successRate;
  const safeLatencyMs = isNaN(avgLatencyMs) ? 0 : avgLatencyMs;
  const safeFallbackRate = isNaN(fallbackRate) ? 0 : fallbackRate;

  // Check success rate
  if (safeSuccessRate < HEALTH_THRESHOLDS.successRate.degraded) {
    issues.push(`Low success rate: ${(safeSuccessRate * 100).toFixed(1)}%`);
    recommendations.push('Check for recurring errors on specific domains');
    recommendations.push('Review anti-bot detection and session management');
  } else if (safeSuccessRate < HEALTH_THRESHOLDS.successRate.healthy) {
    issues.push(`Success rate below optimal: ${(safeSuccessRate * 100).toFixed(1)}%`);
    recommendations.push('Monitor error patterns for improvement opportunities');
  }

  // Check latency
  if (safeLatencyMs > HEALTH_THRESHOLDS.avgLatencyMs.degraded) {
    issues.push(`High average latency: ${Math.round(safeLatencyMs)}ms`);
    recommendations.push('Consider optimizing tier selection for slow domains');
    recommendations.push('Check if playwright tier is being used excessively');
  } else if (safeLatencyMs > HEALTH_THRESHOLDS.avgLatencyMs.healthy) {
    issues.push(`Latency above optimal: ${Math.round(safeLatencyMs)}ms`);
    recommendations.push('Review domain preferences for optimization opportunities');
  }

  // Check fallback rate
  if (safeFallbackRate > HEALTH_THRESHOLDS.fallbackRate.degraded) {
    issues.push(`High fallback rate: ${(safeFallbackRate * 100).toFixed(1)}%`);
    recommendations.push('Many requests are falling back to slower tiers');
    recommendations.push('Consider pre-learning patterns for high-traffic domains');
  } else if (safeFallbackRate > HEALTH_THRESHOLDS.fallbackRate.healthy) {
    issues.push(`Fallback rate above optimal: ${(safeFallbackRate * 100).toFixed(1)}%`);
  }

  // Determine overall health based on safe values
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (
    safeSuccessRate >= HEALTH_THRESHOLDS.successRate.healthy &&
    safeLatencyMs <= HEALTH_THRESHOLDS.avgLatencyMs.healthy &&
    safeFallbackRate <= HEALTH_THRESHOLDS.fallbackRate.healthy
  ) {
    overall = 'healthy';
  } else if (
    safeSuccessRate >= HEALTH_THRESHOLDS.successRate.degraded &&
    safeLatencyMs <= HEALTH_THRESHOLDS.avgLatencyMs.degraded &&
    safeFallbackRate <= HEALTH_THRESHOLDS.fallbackRate.degraded
  ) {
    overall = 'degraded';
  } else {
    overall = 'unhealthy';
  }

  if (overall === 'healthy' && issues.length === 0) {
    recommendations.push('System is performing optimally');
  }

  return {
    overall,
    successRate: safeSuccessRate,
    avgLatencyMs: safeLatencyMs,
    fallbackRate: safeFallbackRate,
    issues,
    recommendations,
  };
}

// ============================================
// Dashboard Generator
// ============================================

/**
 * Generate the analytics dashboard
 */
export async function generateDashboard(options: DashboardOptions = {}): Promise<AnalyticsDashboard> {
  const period = options.period ?? 'day';
  const topLimit = options.topDomainsLimit ?? 10;
  const usageMeter = getUsageMeter();

  // Get usage summary
  const usageSummary = await usageMeter.getSummary({
    period,
    domain: options.domain,
    tenantId: options.tenantId,
    topDomainsLimit: topLimit,
  });

  // Get performance metrics
  const perfMetrics = performanceTracker.getSystemPerformance();

  // Get time series data
  const granularity = period === 'hour' ? 'hour' : 'day';
  const defaultPoints = granularity === 'hour' ? 24 : 7;
  const timeSeriesData = await usageMeter.getUsageByPeriod(granularity, {
    periods: options.timeSeriesPoints ?? defaultPoints,
    domain: options.domain,
    tenantId: options.tenantId,
  });

  // Build tier analytics
  const tierAnalytics = buildTierAnalytics(usageSummary.currentPeriod, perfMetrics);

  // Build domain analytics
  const domainAnalytics = buildDomainAnalytics(usageSummary.currentPeriod, perfMetrics, topLimit);

  // Build time series
  const timeSeries = buildTimeSeries(timeSeriesData);

  // Calculate trends
  const trends = calculateTrends(usageSummary, perfMetrics);

  // Assess system health
  const hasData = usageSummary.currentPeriod.requestCount > 0;
  const health = assessHealth(
    usageSummary.successRate,
    usageSummary.currentPeriod.avgDurationMs,
    usageSummary.currentPeriod.fallbackRate,
    hasData
  );

  const dashboard: AnalyticsDashboard = {
    schemaVersion: '1.0',
    generatedAt: Date.now(),
    period,
    summary: {
      totalRequests: usageSummary.totalRequests,
      totalCostUnits: usageSummary.totalCostUnits,
      overallSuccessRate: usageSummary.successRate,
      avgLatencyMs: usageSummary.currentPeriod.avgDurationMs,
      totalDomains: perfMetrics.totalDomains,
      trackingSince: usageSummary.trackingSince || null,
      lastActivity: usageSummary.lastActivity || null,
    },
    health,
    byTier: tierAnalytics,
    topDomains: domainAnalytics,
    timeSeries,
    trends,
  };

  return addSchemaVersion(dashboard);
}

/**
 * Build per-tier analytics
 */
function buildTierAnalytics(
  usage: UsageAggregate,
  perf: SystemPerformance
): TierAnalytics[] {
  const tiers: RenderTier[] = ['intelligence', 'lightweight', 'playwright'];
  const totalCost = usage.totalCostUnits || 1; // Avoid division by zero

  return tiers.map(tier => {
    const tierUsage = usage.byTier[tier];
    const tierPerf = perf.byTier[tier];

    return {
      tier,
      requestCount: tierUsage.requestCount,
      successRate: tierUsage.successRate,
      costUnits: tierUsage.costUnits,
      costPercentage: tierUsage.costUnits / totalCost,
      latency: tierPerf,
      avgDurationMs: tierUsage.avgDurationMs,
    };
  });
}

/**
 * Build domain analytics for top domains
 */
function buildDomainAnalytics(
  usage: UsageAggregate,
  perf: SystemPerformance,
  limit: number
): {
  byCost: DomainAnalytics[];
  byRequests: DomainAnalytics[];
  bySlowest: DomainAnalytics[];
  byFastest: DomainAnalytics[];
} {
  // Map usage domain data to analytics format
  const domainMap = new Map<string, DomainAnalytics>();

  for (const domain of usage.topDomainsByCost) {
    const domainPerf = performanceTracker.getDomainPerformance(domain.domain);
    domainMap.set(domain.domain, {
      domain: domain.domain,
      requestCount: domain.requestCount,
      successRate: domain.successRate,
      costUnits: domain.costUnits,
      preferredTier: domain.preferredTier,
      avgLatencyMs: domainPerf?.overall.avg ?? 0,
      p95LatencyMs: domainPerf?.overall.p95 ?? null,
    });
  }

  for (const domain of usage.topDomainsByRequests) {
    if (!domainMap.has(domain.domain)) {
      const domainPerf = performanceTracker.getDomainPerformance(domain.domain);
      domainMap.set(domain.domain, {
        domain: domain.domain,
        requestCount: domain.requestCount,
        successRate: domain.successRate,
        costUnits: domain.costUnits,
        preferredTier: domain.preferredTier,
        avgLatencyMs: domainPerf?.overall.avg ?? 0,
        p95LatencyMs: domainPerf?.overall.p95 ?? null,
      });
    }
  }

  // Add slow/fast domains from perf tracker
  for (const domain of [...perf.topSlowDomains, ...perf.topFastDomains]) {
    if (!domainMap.has(domain.domain)) {
      const domainPerf = performanceTracker.getDomainPerformance(domain.domain);
      if (domainPerf) {
        domainMap.set(domain.domain, {
          domain: domain.domain,
          requestCount: domainPerf.totalRequests,
          successRate: domainPerf.successRate,
          costUnits: 0, // Not tracked in perf data
          preferredTier: domainPerf.preferredTier ?? 'intelligence',
          avgLatencyMs: domainPerf.overall.avg,
          p95LatencyMs: domainPerf.overall.p95,
        });
      }
    }
  }

  const allDomains = Array.from(domainMap.values());

  return {
    byCost: [...allDomains].sort((a, b) => b.costUnits - a.costUnits).slice(0, limit),
    byRequests: [...allDomains].sort((a, b) => b.requestCount - a.requestCount).slice(0, limit),
    bySlowest: [...allDomains].sort((a, b) => b.avgLatencyMs - a.avgLatencyMs).slice(0, limit),
    byFastest: [...allDomains].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs).slice(0, limit),
  };
}

/**
 * Build time series from usage aggregates
 */
function buildTimeSeries(aggregates: UsageAggregate[]): TimeSeriesPoint[] {
  return aggregates.map(agg => {
    const date = new Date(agg.periodStart);
    const periodLabel = date.toISOString().split('T')[0] + ' ' +
      date.toTimeString().split(' ')[0].substring(0, 5);

    return {
      timestamp: agg.periodStart,
      periodLabel,
      requestCount: agg.requestCount,
      successRate: agg.requestCount > 0 ? agg.successCount / agg.requestCount : 0,
      totalCostUnits: agg.totalCostUnits,
      avgLatencyMs: agg.avgDurationMs,
      fallbackRate: agg.fallbackRate,
    };
  });
}

/**
 * Calculate period-over-period trends
 */
function calculateTrends(
  usage: UsageSummary,
  _perf: SystemPerformance
): {
  requestTrend: number | null;
  costTrend: number | null;
  successRateTrend: number | null;
  latencyTrend: number | null;
} {
  const requestTrend = usage.requestTrend ?? null;
  const costTrend = usage.costTrend ?? null;

  // Calculate success rate trend
  let successRateTrend: number | null = null;
  if (usage.previousPeriod && usage.previousPeriod.requestCount > 0) {
    const prevSuccessRate = usage.previousPeriod.successCount / usage.previousPeriod.requestCount;
    const currSuccessRate = usage.currentPeriod.requestCount > 0
      ? usage.currentPeriod.successCount / usage.currentPeriod.requestCount
      : 0;
    if (prevSuccessRate > 0) {
      successRateTrend = (currSuccessRate - prevSuccessRate) / prevSuccessRate;
    }
  }

  // Calculate latency trend
  let latencyTrend: number | null = null;
  if (usage.previousPeriod && usage.previousPeriod.avgDurationMs > 0) {
    latencyTrend = (usage.currentPeriod.avgDurationMs - usage.previousPeriod.avgDurationMs) /
      usage.previousPeriod.avgDurationMs;
  }

  return {
    requestTrend,
    costTrend,
    successRateTrend,
    latencyTrend,
  };
}

/**
 * Get a compact summary suitable for quick status checks
 */
export async function getQuickStatus(): Promise<{
  schemaVersion: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  requests24h: number;
  successRate: number;
  avgLatencyMs: number;
  costUnits24h: number;
}> {
  const usageMeter = getUsageMeter();
  const summary = await usageMeter.getSummary({ period: 'day' });

  const hasData = summary.currentPeriod.requestCount > 0;
  const health = assessHealth(
    summary.successRate,
    summary.currentPeriod.avgDurationMs,
    summary.currentPeriod.fallbackRate,
    hasData
  );

  return addSchemaVersion({
    status: health.overall,
    requests24h: summary.currentPeriod.requestCount,
    successRate: summary.successRate,
    avgLatencyMs: summary.currentPeriod.avgDurationMs,
    costUnits24h: summary.currentPeriod.totalCostUnits,
  });
}
