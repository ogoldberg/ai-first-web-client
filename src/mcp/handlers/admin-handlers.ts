/**
 * Admin Tool Handlers
 *
 * Handlers for administrative and analytics tools:
 * - tier_management
 * - get_performance_metrics
 * - content_tracking
 * - usage_analytics
 * - get_analytics_dashboard
 * - get_system_status
 * - tool_selection_metrics
 */

import type { SmartBrowser } from '../../core/smart-browser.js';
import type { RenderTier } from '../../core/tiered-fetcher.js';
import { jsonResponse, errorResponse, type McpResponse } from '../response-formatters.js';
import { addSchemaVersion } from '../../types/schema-version.js';
import { getUsageMeter, type UsageQueryOptions } from '../../utils/usage-meter.js';
import { generateDashboard, getQuickStatus } from '../../utils/analytics-dashboard.js';
import { getContentChangeTracker } from '../../utils/content-change-tracker.js';
import { getToolSelectionMetrics } from '../../utils/tool-selection-metrics.js';

// ============================================
// TIER MANAGEMENT
// ============================================

export type TierAction = 'stats' | 'set' | 'usage';

export async function handleTierManagement(
  smartBrowser: SmartBrowser,
  action: TierAction,
  args: Record<string, unknown>
): Promise<McpResponse> {
  const tieredFetcher = smartBrowser.getTieredFetcher();

  switch (action) {
    case 'stats': {
      const tierStats = tieredFetcher.getStats();
      return jsonResponse({
        summary: {
          totalDomains: tierStats.totalDomains,
          domainsByTier: tierStats.byTier,
          playwrightAvailable: tierStats.playwrightAvailable,
        },
        performance: {
          avgResponseTimes: {
            intelligence: Math.round(tierStats.avgResponseTimes.intelligence) + 'ms',
            lightweight: Math.round(tierStats.avgResponseTimes.lightweight) + 'ms',
            playwright: Math.round(tierStats.avgResponseTimes.playwright) + 'ms',
          },
        },
        efficiency: {
          intelligencePercent:
            tierStats.totalDomains > 0
              ? Math.round((tierStats.byTier.intelligence / tierStats.totalDomains) * 100) + '%'
              : '0%',
          lightweightPercent:
            tierStats.totalDomains > 0
              ? Math.round((tierStats.byTier.lightweight / tierStats.totalDomains) * 100) + '%'
              : '0%',
          playwrightPercent:
            tierStats.totalDomains > 0
              ? Math.round((tierStats.byTier.playwright / tierStats.totalDomains) * 100) + '%'
              : '0%',
          message:
            tierStats.byTier.intelligence + tierStats.byTier.lightweight > tierStats.byTier.playwright
              ? 'Good! Most requests are using lightweight rendering'
              : tierStats.playwrightAvailable
                ? 'Consider optimizing - many requests still require full browser'
                : 'Playwright not installed - using lightweight strategies only',
        },
      });
    }

    case 'set': {
      if (!args.domain || !args.tier) {
        return errorResponse('domain and tier are required for set action');
      }
      const domain = args.domain as string;
      const tier = args.tier as RenderTier;

      tieredFetcher.setDomainPreference(domain, tier);

      return jsonResponse({
        success: true,
        message: `Set ${domain} to use ${tier} tier`,
        note:
          tier === 'intelligence'
            ? 'Content Intelligence - tries framework extraction, API prediction, caches, then static parsing'
            : tier === 'lightweight'
              ? 'Lightweight JS - executes scripts without full browser'
              : 'Full browser - handles all pages but slowest (requires Playwright)',
      });
    }

    case 'usage': {
      const preferences = tieredFetcher.exportPreferences();
      const filterTier = args.tier as string | undefined;
      const sortBy = (args.sortBy as string) || 'lastUsed';
      const limit = (args.limit as number) || 50;

      let filtered = preferences;
      if (filterTier) {
        filtered = preferences.filter(p => p.preferredTier === filterTier);
      }

      const sorted = [...filtered].sort((a, b) => {
        switch (sortBy) {
          case 'domain':
            return a.domain.localeCompare(b.domain);
          case 'tier':
            return a.preferredTier.localeCompare(b.preferredTier);
          case 'successRate': {
            const rateA =
              a.successCount + a.failureCount > 0
                ? a.successCount / (a.successCount + a.failureCount)
                : 0;
            const rateB =
              b.successCount + b.failureCount > 0
                ? b.successCount / (b.successCount + b.failureCount)
                : 0;
            return rateB - rateA;
          }
          case 'responseTime':
            return a.avgResponseTime - b.avgResponseTime;
          case 'lastUsed':
          default:
            return b.lastUsed - a.lastUsed;
        }
      });

      const limited = sorted.slice(0, limit);

      const formatted = limited.map(p => {
        const totalAttempts = p.successCount + p.failureCount;
        const successRate = totalAttempts > 0 ? Math.round((p.successCount / totalAttempts) * 100) : 0;
        return {
          domain: p.domain,
          tier: p.preferredTier,
          successCount: p.successCount,
          failureCount: p.failureCount,
          successRate: `${successRate}%`,
          avgResponseTime: `${Math.round(p.avgResponseTime)}ms`,
          lastUsed: new Date(p.lastUsed).toISOString(),
        };
      });

      const summary = {
        intelligence: filtered.filter(p => p.preferredTier === 'intelligence').length,
        lightweight: filtered.filter(p => p.preferredTier === 'lightweight').length,
        playwright: filtered.filter(p => p.preferredTier === 'playwright').length,
      };

      return jsonResponse({
        totalDomains: preferences.length,
        filteredCount: filtered.length,
        showing: limited.length,
        filter: filterTier || 'none',
        sortedBy: sortBy,
        summary: filterTier ? undefined : summary,
        domains: formatted,
      });
    }

    default:
      return errorResponse(`Unknown tier_management action: ${action}`);
  }
}

// ============================================
// PERFORMANCE METRICS
// ============================================

export function handleGetPerformanceMetrics(
  smartBrowser: SmartBrowser,
  args: {
    domain?: string;
    sortBy?: 'avgTime' | 'p95' | 'successRate';
    order?: 'asc' | 'desc';
    limit?: number;
  }
): McpResponse {
  const tieredFetcher = smartBrowser.getTieredFetcher();
  const tracker = tieredFetcher.getPerformanceTracker();
  const { domain, limit = 20 } = args;
  const sortBy = args.sortBy || 'avgTime';
  const order = args.order || (sortBy === 'successRate' ? 'desc' : 'asc');

  const formatStats = (
    stats: { p50: number; p95: number; p99: number; min: number; max: number; avg: number; count: number } | null
  ) => {
    if (!stats) return null;
    return {
      p50: `${Math.round(stats.p50)}ms`,
      p95: `${Math.round(stats.p95)}ms`,
      p99: `${Math.round(stats.p99)}ms`,
      min: `${Math.round(stats.min)}ms`,
      max: `${Math.round(stats.max)}ms`,
      avg: `${Math.round(stats.avg)}ms`,
      count: stats.count,
    };
  };

  if (domain) {
    const domainPerf = tracker.getDomainPerformance(domain);
    if (!domainPerf) {
      return jsonResponse({
        error: `No performance data found for domain: ${domain}`,
        suggestion: 'This domain may not have been accessed yet. Try browsing it first with smart_browse.',
      });
    }

    return jsonResponse({
      domain: domainPerf.domain,
      totalRequests: domainPerf.totalRequests,
      successRate: `${Math.round(domainPerf.successRate * 100)}%`,
      preferredTier: domainPerf.preferredTier,
      lastUpdated: new Date(domainPerf.lastUpdated).toISOString(),
      overall: formatStats(domainPerf.overall),
      byTier: {
        intelligence: formatStats(domainPerf.byTier.intelligence),
        lightweight: formatStats(domainPerf.byTier.lightweight),
        playwright: formatStats(domainPerf.byTier.playwright),
      },
    });
  }

  const systemPerf = tracker.getSystemPerformance();
  const componentBreakdown = tracker.getComponentBreakdown();
  const domainRankings = tracker.getDomainsByPerformance(sortBy, order, limit);

  return jsonResponse({
    summary: {
      totalRequests: systemPerf.totalRequests,
      totalDomains: systemPerf.totalDomains,
      successRate: `${Math.round(systemPerf.successRate * 100)}%`,
    },
    overall: formatStats(systemPerf.overall),
    byTier: {
      intelligence: formatStats(systemPerf.byTier.intelligence),
      lightweight: formatStats(systemPerf.byTier.lightweight),
      playwright: formatStats(systemPerf.byTier.playwright),
    },
    componentBreakdown: {
      network: formatStats(componentBreakdown.network),
      parsing: formatStats(componentBreakdown.parsing),
      jsExecution: formatStats(componentBreakdown.jsExecution),
      extraction: formatStats(componentBreakdown.extraction),
    },
    topFastestDomains: systemPerf.topFastDomains.map(d => ({
      domain: d.domain,
      avgTime: `${d.avgTime}ms`,
    })),
    topSlowestDomains: systemPerf.topSlowDomains.map(d => ({
      domain: d.domain,
      avgTime: `${d.avgTime}ms`,
    })),
    domainRankings: domainRankings.map(d => ({
      domain: d.domain,
      requests: d.totalRequests,
      successRate: `${Math.round(d.successRate * 100)}%`,
      avgTime: `${Math.round(d.overall.avg)}ms`,
      p95: `${Math.round(d.overall.p95)}ms`,
      preferredTier: d.preferredTier,
    })),
  });
}

// ============================================
// CONTENT TRACKING
// ============================================

export type ContentTrackingAction = 'track' | 'check' | 'list' | 'history' | 'untrack' | 'stats';

export async function handleContentTracking(
  smartBrowser: SmartBrowser,
  action: ContentTrackingAction,
  args: Record<string, unknown>
): Promise<McpResponse> {
  const tracker = getContentChangeTracker();
  const url = args.url as string | undefined;

  switch (action) {
    case 'track': {
      if (!url) throw new Error('url is required for track action');
      const result = await smartBrowser.browse(url, {
        validateContent: true,
        enableLearning: true,
      });
      const tracked = await tracker.trackUrl(url, result.content.markdown, {
        label: args.label as string | undefined,
        tags: args.tags as string[] | undefined,
      });
      return jsonResponse({
        action: 'track',
        message: 'URL is now being tracked for content changes',
        url: tracked.url,
        domain: tracked.domain,
        fingerprint: {
          hash: tracked.fingerprint.hash.substring(0, 12) + '...',
          textLength: tracked.fingerprint.textLength,
          wordCount: tracked.fingerprint.wordCount,
        },
        trackedSince: new Date(tracked.trackedSince).toISOString(),
        label: tracked.label,
        tags: tracked.tags,
        pageTitle: result.title,
      });
    }

    case 'check': {
      if (!url) throw new Error('url is required for check action');
      const result = await smartBrowser.browse(url, {
        validateContent: true,
        enableLearning: true,
      });
      const checkResult = await tracker.checkForChanges(url, result.content.markdown);

      if (checkResult.isFirstCheck || !checkResult.isTracked) {
        const tracked = await tracker.trackUrl(url, result.content.markdown);
        return jsonResponse({
          action: 'check',
          message: 'URL was not tracked - now tracking for future comparisons',
          url: tracked.url,
          isTracked: true,
          isFirstCheck: true,
          hasChanged: false,
          fingerprint: {
            hash: tracked.fingerprint.hash.substring(0, 12) + '...',
            textLength: tracked.fingerprint.textLength,
            wordCount: tracked.fingerprint.wordCount,
          },
          pageTitle: result.title,
        });
      }

      const response: Record<string, unknown> = {
        action: 'check',
        url,
        isTracked: true,
        hasChanged: checkResult.hasChanged,
        checkCount: checkResult.trackedUrl?.checkCount,
        changeCount: checkResult.trackedUrl?.changeCount,
        lastChecked: checkResult.trackedUrl?.lastChecked
          ? new Date(checkResult.trackedUrl.lastChecked).toISOString()
          : undefined,
        pageTitle: result.title,
      };

      if (checkResult.hasChanged && checkResult.changeReport) {
        response.changeDetails = {
          significance: checkResult.changeReport.overallSignificance,
          summary: checkResult.changeReport.summary,
          previousFingerprint: {
            textLength: checkResult.changeReport.oldFingerprint.textLength,
            wordCount: checkResult.changeReport.oldFingerprint.wordCount,
          },
          newFingerprint: {
            textLength: checkResult.changeReport.newFingerprint.textLength,
            wordCount: checkResult.changeReport.newFingerprint.wordCount,
          },
          textLengthDiff:
            checkResult.changeReport.newFingerprint.textLength -
            checkResult.changeReport.oldFingerprint.textLength,
          wordCountDiff:
            checkResult.changeReport.newFingerprint.wordCount -
            checkResult.changeReport.oldFingerprint.wordCount,
        };
      }
      return jsonResponse(response);
    }

    case 'list': {
      const urls = await tracker.listTrackedUrls({
        domain: args.domain as string | undefined,
        tags: args.tags as string[] | undefined,
        hasChanges: args.hasChanges as boolean | undefined,
        limit: (args.limit as number) || 50,
      });
      return jsonResponse({
        action: 'list',
        count: urls.length,
        trackedUrls: urls.map(u => ({
          url: u.url,
          domain: u.domain,
          label: u.label,
          tags: u.tags,
          trackedSince: new Date(u.trackedSince).toISOString(),
          lastChecked: new Date(u.lastChecked).toISOString(),
          checkCount: u.checkCount,
          changeCount: u.changeCount,
          hasChanges: u.changeCount > 0,
          fingerprint: {
            textLength: u.fingerprint.textLength,
            wordCount: u.fingerprint.wordCount,
          },
        })),
      });
    }

    case 'history': {
      const history = await tracker.getChangeHistory(url, (args.limit as number) || 50);
      return jsonResponse({
        action: 'history',
        count: history.length,
        changes: history.map(r => ({
          url: r.url,
          timestamp: new Date(r.timestamp).toISOString(),
          significance: r.significance,
          summary: r.summary,
          sectionsAdded: r.sectionsAdded,
          sectionsRemoved: r.sectionsRemoved,
          sectionsModified: r.sectionsModified,
          previousLength: r.previousFingerprint.textLength,
          newLength: r.newFingerprint.textLength,
          lengthChange: r.newFingerprint.textLength - r.previousFingerprint.textLength,
        })),
      });
    }

    case 'untrack': {
      if (!url) throw new Error('url is required for untrack action');
      const wasTracked = await tracker.untrackUrl(url);
      return jsonResponse({
        action: 'untrack',
        message: wasTracked ? 'URL is no longer being tracked' : 'URL was not being tracked',
        url,
        untracked: wasTracked,
      });
    }

    case 'stats': {
      const stats = await tracker.getStats();
      return jsonResponse({
        action: 'stats',
        totalTracked: stats.totalTracked,
        urlsWithChanges: stats.urlsWithChanges,
        totalChanges: stats.totalChanges,
        changesBySignificance: stats.changesBySignificance,
        recentChanges: stats.recentChanges.map(c => ({
          url: c.url,
          timestamp: new Date(c.timestamp).toISOString(),
          significance: c.significance,
        })),
      });
    }

    default:
      throw new Error(`Unknown content_tracking action: ${action}`);
  }
}

// ============================================
// USAGE ANALYTICS
// ============================================

export type UsageAnalyticsAction = 'summary' | 'by_period' | 'cost_breakdown' | 'reset';

export async function handleUsageAnalytics(
  action: UsageAnalyticsAction,
  args: Record<string, unknown>
): Promise<McpResponse> {
  const usageMeter = getUsageMeter();
  await usageMeter.initialize();

  switch (action) {
    case 'summary': {
      const options: UsageQueryOptions = {
        period: (args.period as 'hour' | 'day' | 'week' | 'month' | 'all') || 'all',
        domain: args.domain as string | undefined,
        tier: args.tier as 'intelligence' | 'lightweight' | 'playwright' | undefined,
        tenantId: args.tenantId as string | undefined,
      };

      const summary = await usageMeter.getSummary(options);
      const periodSuccessRate =
        summary.currentPeriod.requestCount > 0
          ? summary.currentPeriod.successCount / summary.currentPeriod.requestCount
          : 0;

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        period: options.period,
        totalRequests: summary.totalRequests,
        totalCostUnits: summary.totalCostUnits,
        successRate: Math.round(summary.successRate * 100) / 100,
        avgCostPerRequest: Math.round(summary.avgCostPerRequest * 100) / 100,
        currentPeriod: {
          requestCount: summary.currentPeriod.requestCount,
          totalCostUnits: summary.currentPeriod.totalCostUnits,
          successRate: Math.round(periodSuccessRate * 100) / 100,
          fallbackRate: Math.round(summary.currentPeriod.fallbackRate * 100) / 100,
          byTier: summary.currentPeriod.byTier,
          topDomainsByCost: summary.currentPeriod.topDomainsByCost.slice(0, 5),
          topDomainsByRequests: summary.currentPeriod.topDomainsByRequests.slice(0, 5),
        },
        filters: {
          domain: options.domain,
          tier: options.tier,
          tenantId: options.tenantId,
        },
      });
    }

    case 'by_period': {
      const rawGranularity = (args.granularity as string) || 'day';
      const granularity: 'hour' | 'day' = rawGranularity === 'hour' ? 'hour' : 'day';
      const periods = (args.periods as number) || (granularity === 'hour' ? 24 : 7);
      const domain = args.domain as string | undefined;

      const periodData = await usageMeter.getUsageByPeriod(granularity, { periods, domain });

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        granularity,
        periods: periodData.map(p => {
          const successRate = p.requestCount > 0 ? p.successCount / p.requestCount : 0;
          return {
            periodStart: new Date(p.periodStart).toISOString(),
            periodEnd: new Date(p.periodEnd).toISOString(),
            requestCount: p.requestCount,
            totalCostUnits: p.totalCostUnits,
            successRate: Math.round(successRate * 100) / 100,
            fallbackRate: Math.round(p.fallbackRate * 100) / 100,
            byTier: p.byTier,
          };
        }),
      });
    }

    case 'cost_breakdown': {
      const period = (args.period as 'hour' | 'day' | 'week' | 'month' | 'all') || 'day';
      const domain = args.domain as string | undefined;

      const breakdown = await usageMeter.getCostBreakdown({ period, domain });

      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        period,
        total: breakdown.total,
        estimatedMonthlyCost: Math.round(breakdown.estimatedMonthlyCost * 100) / 100,
        byTier: {
          intelligence: {
            cost: breakdown.byTier.intelligence.cost,
            percentage: Math.round(breakdown.byTier.intelligence.percentage * 100),
            requests: breakdown.byTier.intelligence.requests,
          },
          lightweight: {
            cost: breakdown.byTier.lightweight.cost,
            percentage: Math.round(breakdown.byTier.lightweight.percentage * 100),
            requests: breakdown.byTier.lightweight.requests,
          },
          playwright: {
            cost: breakdown.byTier.playwright.cost,
            percentage: Math.round(breakdown.byTier.playwright.percentage * 100),
            requests: breakdown.byTier.playwright.requests,
          },
        },
        recommendations: generateCostRecommendations(breakdown),
      });
    }

    case 'reset': {
      await usageMeter.reset();
      return jsonResponse({
        schemaVersion: addSchemaVersion({}).schemaVersion,
        success: true,
        message: 'Usage meters reset',
      });
    }

    default:
      return errorResponse(`Unknown usage_analytics action: ${action}`);
  }
}

/**
 * Generate cost optimization recommendations
 */
function generateCostRecommendations(breakdown: {
  total: number;
  byTier: {
    intelligence: { cost: number; percentage: number; requests: number };
    lightweight: { cost: number; percentage: number; requests: number };
    playwright: { cost: number; percentage: number; requests: number };
  };
}): string[] {
  const recommendations: string[] = [];

  if (breakdown.byTier.playwright.percentage > 0.5) {
    recommendations.push(
      'Over 50% of cost is from Playwright tier - consider investigating if some sites could use lighter tiers'
    );
  }

  const totalRequests =
    breakdown.byTier.intelligence.requests +
    breakdown.byTier.lightweight.requests +
    breakdown.byTier.playwright.requests;

  if (totalRequests > 10 && breakdown.byTier.playwright.requests > breakdown.byTier.intelligence.requests) {
    recommendations.push(
      'More Playwright requests than Intelligence - learning may help optimize tier selection over time'
    );
  }

  if (breakdown.byTier.intelligence.percentage < 0.2 && totalRequests > 10) {
    recommendations.push(
      'Low Intelligence tier usage - ensure Content Intelligence is enabled for compatible sites'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Cost distribution looks healthy - tier selection is working efficiently');
  }

  return recommendations;
}

// ============================================
// ANALYTICS DASHBOARD
// ============================================

export async function handleGetAnalyticsDashboard(args: {
  period?: 'hour' | 'day' | 'week' | 'month' | 'all';
  topDomainsLimit?: number;
  timeSeriesPoints?: number;
  domain?: string;
  tenantId?: string;
}): Promise<McpResponse> {
  const usageMeter = getUsageMeter();
  await usageMeter.initialize();

  const dashboard = await generateDashboard({
    period: args.period ?? 'day',
    topDomainsLimit: args.topDomainsLimit,
    timeSeriesPoints: args.timeSeriesPoints,
    domain: args.domain,
    tenantId: args.tenantId,
  });

  return jsonResponse(dashboard);
}

export async function handleGetSystemStatus(): Promise<McpResponse> {
  const usageMeter = getUsageMeter();
  await usageMeter.initialize();

  const status = await getQuickStatus();
  return jsonResponse(status);
}

// ============================================
// TOOL SELECTION METRICS
// ============================================

export type ToolSelectionMetricsAction = 'stats' | 'confusion';

export async function handleToolSelectionMetrics(
  action: ToolSelectionMetricsAction,
  args: {
    period?: 'hour' | 'day' | 'week' | 'month' | 'all';
    tool?: string;
    category?: 'core' | 'debug' | 'admin' | 'deprecated' | 'unknown';
    sessionId?: string;
    tenantId?: string;
  }
): Promise<McpResponse> {
  const metrics = getToolSelectionMetrics();
  await metrics.initialize();

  const queryOptions = {
    period: args.period,
    tool: args.tool,
    category: args.category,
    sessionId: args.sessionId,
    tenantId: args.tenantId,
  };

  switch (action) {
    case 'stats': {
      const stats = await metrics.getStats(queryOptions);
      return jsonResponse(stats);
    }
    case 'confusion': {
      const indicators = await metrics.getConfusionIndicators(queryOptions);
      return jsonResponse(indicators);
    }
    default:
      throw new Error(`Unknown action for tool_selection_metrics: ${action}`);
  }
}
