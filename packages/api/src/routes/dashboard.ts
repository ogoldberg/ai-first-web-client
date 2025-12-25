/**
 * Admin Dashboard Routes (API-008)
 *
 * Provides aggregated data for the admin dashboard UI including:
 * - Usage overview (requests, units, costs)
 * - Tenant management
 * - System metrics
 * - Error analysis
 */

import { Hono } from 'hono';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { getRequestLogger } from '../middleware/request-logger.js';
import { getTenantStore } from '../services/tenants.js';
import { getMetricsJson, getPrometheusMetrics } from '../services/metrics.js';
import { getProxyManager, hasProxiesConfigured } from '../services/proxy-manager.js';
import {
  exportUsage,
  getUsageStats,
  getUsageRange,
} from '../services/usage.js';

export const dashboard = new Hono();

// Protect all dashboard routes - require authentication and admin permission
dashboard.use('*', authMiddleware, requirePermission('admin'));

// ============================================
// DASHBOARD OVERVIEW
// ============================================

/**
 * GET /overview - Get dashboard overview with key metrics
 *
 * Returns aggregated stats for a quick system health check
 */
dashboard.get('/overview', async (c) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Get request log stats
  const logger = getRequestLogger();
  const logStats = logger.getStats();

  // Get tenant count
  const tenantStore = getTenantStore();
  let tenantStats = { total: 0, byPlan: {} as Record<string, number> };
  if (tenantStore) {
    try {
      const { total } = await tenantStore.list({ limit: 0 });
      tenantStats.total = total;

      // Count by plan
      for (const plan of ['FREE', 'STARTER', 'TEAM', 'ENTERPRISE']) {
        const { total: planCount } = await tenantStore.list({ plan: plan as any, limit: 0 });
        tenantStats.byPlan[plan] = planCount;
      }
    } catch {
      // Tenant store may not be configured
    }
  }

  // Get proxy stats if available
  let proxyStats = null;
  if (hasProxiesConfigured()) {
    try {
      const proxyManager = getProxyManager();
      proxyStats = {
        hasProxies: proxyManager.hasProxies(),
        poolStats: proxyManager.getPoolStats(),
      };
    } catch {
      // Proxy manager may not be initialized
    }
  }

  // Get metrics
  const metrics = getMetricsJson();

  // Calculate error rate from log stats
  const totalRequests = logStats.totalRequests || 0;
  // Count 4xx and 5xx errors from statusCodes
  let errorRequests = 0;
  if (logStats.statusCodes) {
    for (const [code, count] of Object.entries(logStats.statusCodes)) {
      const statusCode = parseInt(code, 10);
      if (statusCode >= 400 && statusCode < 600) {
        errorRequests += count;
      }
    }
  }
  const errorRate = totalRequests > 0 ? errorRequests / totalRequests : 0;

  return c.json({
    success: true,
    data: {
      timestamp: now.toISOString(),
      period: { start: thirtyDaysAgo, end: today },
      requests: {
        total: totalRequests,
        today: logStats.totalRequests || 0,
        errors: errorRequests,
        errorRate: Math.round(errorRate * 10000) / 100, // percentage with 2 decimals
        avgLatencyMs: logStats.avgDurationMs || 0,
        p95LatencyMs: logStats.p95DurationMs || 0,
      },
      tenants: tenantStats,
      proxy: proxyStats,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
      },
      metrics: {
        http: metrics['unbrowser_http_requests_total'] || [],
        usage: metrics['unbrowser_usage_requests_total'] || [],
      },
    },
  });
});

// ============================================
// USAGE ANALYTICS
// ============================================

/**
 * GET /usage - Get usage analytics with optional filtering
 *
 * Query parameters:
 * - tenantId: Filter by tenant
 * - startDate: Start of date range (YYYY-MM-DD)
 * - endDate: End of date range (YYYY-MM-DD)
 */
dashboard.get('/usage', (c) => {
  const query = c.req.query();
  const tenantId = query.tenantId || '*';

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const startDate = query.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const endDate = query.endDate || today;

  // If specific tenant, get their usage
  if (tenantId !== '*') {
    const usage = exportUsage(tenantId, startDate, endDate);
    return c.json({
      success: true,
      data: usage,
    });
  }

  // Get today's usage stats for '*' (all tenants)
  const todayStats = getUsageStats('*');

  return c.json({
    success: true,
    data: {
      period: { start: startDate, end: endDate },
      today: todayStats,
      message: 'Use tenantId parameter for detailed per-tenant usage',
    },
  });
});

/**
 * GET /usage/summary - Get aggregated usage summary across all tenants
 */
dashboard.get('/usage/summary', (c) => {
  const query = c.req.query();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const startDate = query.startDate || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const endDate = query.endDate || today;

  // Get metrics for usage breakdown
  const metrics = getMetricsJson() as Record<string, Array<{ value: number; labels: Record<string, string> }>>;
  const usageByTier: Record<string, { requests: number; units: number }> = {
    intelligence: { requests: 0, units: 0 },
    lightweight: { requests: 0, units: 0 },
    playwright: { requests: 0, units: 0 },
  };

  // Parse usage metrics
  const usageRequests = metrics['unbrowser_usage_requests_total'] || [];
  const usageUnits = metrics['unbrowser_usage_units_total'] || [];

  for (const entry of usageRequests) {
    const tier = entry.labels?.tier;
    if (tier && usageByTier[tier]) {
      usageByTier[tier].requests += entry.value;
    }
  }

  for (const entry of usageUnits) {
    const tier = entry.labels?.tier;
    if (tier && usageByTier[tier]) {
      usageByTier[tier].units += entry.value;
    }
  }

  const totalRequests = Object.values(usageByTier).reduce((sum, t) => sum + t.requests, 0);
  const totalUnits = Object.values(usageByTier).reduce((sum, t) => sum + t.units, 0);

  // Calculate tier percentages
  const tierBreakdown = Object.entries(usageByTier).map(([tier, data]) => ({
    tier,
    requests: data.requests,
    units: data.units,
    requestPercent: totalRequests > 0 ? Math.round(data.requests / totalRequests * 100) : 0,
    unitPercent: totalUnits > 0 ? Math.round(data.units / totalUnits * 100) : 0,
  }));

  return c.json({
    success: true,
    data: {
      period: { start: startDate, end: endDate },
      totals: {
        requests: totalRequests,
        units: totalUnits,
      },
      byTier: tierBreakdown,
      costBreakdown: tierBreakdown.map((t) => ({
        tier: t.tier,
        units: t.units,
        // Approximate cost based on tier (intelligence=1, lightweight=5, playwright=25)
        estimatedCost: t.tier === 'intelligence' ? t.units * 0.0001 :
          t.tier === 'lightweight' ? t.units * 0.0005 :
            t.units * 0.0025,
      })),
    },
  });
});

// ============================================
// TENANT MANAGEMENT
// ============================================

/**
 * GET /tenants - List all tenants with usage stats
 */
dashboard.get('/tenants', async (c) => {
  const query = c.req.query();
  const limit = parseInt(query.limit || '20', 10);
  const offset = parseInt(query.offset || '0', 10);
  const plan = query.plan as 'FREE' | 'STARTER' | 'TEAM' | 'ENTERPRISE' | undefined;

  const tenantStore = getTenantStore();
  if (!tenantStore) {
    return c.json({
      success: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'Tenant store not configured',
      },
    }, 500);
  }

  try {
    const { tenants, total } = await tenantStore.list({ limit, offset, plan });

    // Get usage stats for each tenant
    const today = new Date().toISOString().split('T')[0];
    const tenantsWithUsage = tenants.map((tenant) => {
      const usage = getUsageStats(tenant.id);
      return {
        ...tenant,
        usage: {
          today: {
            requests: usage.requests,
            units: usage.units,
          },
        },
      };
    });

    return c.json({
      success: true,
      data: {
        tenants: tenantsWithUsage,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + tenants.length < total,
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to list tenants',
      },
    }, 500);
  }
});

/**
 * GET /tenants/:id - Get detailed tenant info with full usage history
 */
dashboard.get('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id');
  const query = c.req.query();

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const startDate = query.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const tenantStore = getTenantStore();
  if (!tenantStore) {
    return c.json({
      success: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'Tenant store not configured',
      },
    }, 500);
  }

  try {
    const tenant = await tenantStore.findById(tenantId);
    if (!tenant) {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Tenant ${tenantId} not found`,
        },
      }, 404);
    }

    // Get usage history
    const usage = exportUsage(tenantId, startDate, today);

    // Get recent requests from logs
    const logger = getRequestLogger();
    const recentLogs = logger.query({
      tenantId,
      limit: 10,
    });

    return c.json({
      success: true,
      data: {
        tenant,
        usage,
        recentRequests: recentLogs,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get tenant',
      },
    }, 500);
  }
});

// ============================================
// ERROR ANALYSIS
// ============================================

/**
 * GET /errors - Get error analysis and trends
 */
dashboard.get('/errors', (c) => {
  const query = c.req.query();
  const limit = parseInt(query.limit || '50', 10);

  const logger = getRequestLogger();

  // Get error logs (4xx and 5xx)
  const clientErrors = logger.query({
    statusRange: { min: 400, max: 499 },
    limit,
  });

  const serverErrors = logger.query({
    statusRange: { min: 500, max: 599 },
    limit,
  });

  // Aggregate errors by path
  const errorsByPath = new Map<string, { count: number; statuses: Record<string, number> }>();

  for (const log of [...clientErrors, ...serverErrors]) {
    const path = log.path;
    const status = log.status.toString();

    if (!errorsByPath.has(path)) {
      errorsByPath.set(path, { count: 0, statuses: {} });
    }

    const entry = errorsByPath.get(path)!;
    entry.count++;
    entry.statuses[status] = (entry.statuses[status] || 0) + 1;
  }

  // Sort by error count
  const topErrors = Array.from(errorsByPath.entries())
    .map(([path, data]) => ({ path, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return c.json({
    success: true,
    data: {
      summary: {
        clientErrors: clientErrors.length,
        serverErrors: serverErrors.length,
        total: clientErrors.length + serverErrors.length,
      },
      topErrorPaths: topErrors,
      recentClientErrors: clientErrors.slice(0, 10),
      recentServerErrors: serverErrors.slice(0, 10),
    },
  });
});

// ============================================
// SYSTEM HEALTH
// ============================================

/**
 * GET /system - Get detailed system metrics
 */
dashboard.get('/system', (c) => {
  const mem = process.memoryUsage();
  const metrics = getMetricsJson();

  return c.json({
    success: true,
    data: {
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        uptimeHuman: formatUptime(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
        rssMB: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      },
      metrics,
    },
  });
});

/**
 * GET /system/prometheus - Get Prometheus-format metrics
 */
dashboard.get('/system/prometheus', (c) => {
  const prometheusMetrics = getPrometheusMetrics();
  return c.text(prometheusMetrics, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
});

// ============================================
// PROXY STATUS
// ============================================

/**
 * GET /proxy - Get proxy pool status
 */
dashboard.get('/proxy', (c) => {
  if (!hasProxiesConfigured()) {
    return c.json({
      success: true,
      data: {
        configured: false,
        message: 'No proxies configured',
      },
    });
  }

  try {
    const proxyManager = getProxyManager();
    const poolStats = proxyManager.getPoolStats();

    return c.json({
      success: true,
      data: {
        configured: true,
        hasProxies: proxyManager.hasProxies(),
        pools: poolStats,
        proxiesInCooldown: proxyManager.getProxiesInCooldown(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get proxy status',
      },
    }, 500);
  }
});

/**
 * GET /proxy/risk/:domain - Get domain risk assessment
 */
dashboard.get('/proxy/risk/:domain', (c) => {
  const domain = c.req.param('domain');

  if (!hasProxiesConfigured()) {
    return c.json({
      success: true,
      data: {
        configured: false,
        message: 'No proxies configured',
      },
    });
  }

  try {
    const proxyManager = getProxyManager();
    const risk = proxyManager.getDomainRisk(domain);
    const delay = proxyManager.getRecommendedDelay(domain);

    return c.json({
      success: true,
      data: {
        domain,
        risk,
        recommendedDelayMs: delay,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get domain risk',
      },
    }, 500);
  }
});

// ============================================
// HELPERS
// ============================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
