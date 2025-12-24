/**
 * Health Check Routes
 *
 * Provides health check and metrics endpoints for monitoring.
 * No authentication required for health checks.
 *
 * Endpoints:
 * - GET /health - Comprehensive health status with service checks
 * - GET /health/ready - Kubernetes readiness probe
 * - GET /health/live - Kubernetes liveness probe
 * - GET /health/metrics - Prometheus metrics export
 */

import { Hono } from 'hono';
import { getRedisStatus, isRedisConfigured } from '../services/redis-client.js';
import {
  getPrometheusMetrics,
  getMetricsJson,
  setHealthStatus,
} from '../services/metrics.js';

const health = new Hono();

// Health check functions for different services
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  latencyMs?: number;
}

type HealthCheckFn = () => Promise<HealthCheckResult>;

// Registry of health check functions
const healthChecks: Map<string, HealthCheckFn> = new Map();

/**
 * Register a health check function
 */
export function registerHealthCheck(name: string, fn: HealthCheckFn): void {
  healthChecks.set(name, fn);
}

/**
 * Remove a health check function
 */
export function unregisterHealthCheck(name: string): void {
  healthChecks.delete(name);
}

/**
 * Set the core health check function (legacy support)
 */
export function setHealthCheck(fn: () => Promise<boolean>): void {
  registerHealthCheck('core', async () => {
    const start = Date.now();
    try {
      const isHealthy = await fn();
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - start,
      };
    }
  });
}

// Default core check
setHealthCheck(async () => true);

/**
 * Register Redis health check
 */
registerHealthCheck('redis', async () => {
  if (!isRedisConfigured()) {
    return { status: 'healthy', message: 'Not configured (using in-memory)' };
  }

  const start = Date.now();
  const status = getRedisStatus();

  if (status.connected) {
    return { status: 'healthy', latencyMs: Date.now() - start };
  }

  if (status.reconnecting) {
    return { status: 'degraded', message: 'Reconnecting', latencyMs: Date.now() - start };
  }

  return {
    status: 'unhealthy',
    message: status.lastError || 'Not connected',
    latencyMs: Date.now() - start,
  };
});

/**
 * Run all health checks
 */
async function runHealthChecks(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthCheckResult>;
  totalLatencyMs: number;
}> {
  const results: Record<string, HealthCheckResult> = {};
  const startTime = Date.now();
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Run all checks in parallel
  const checkPromises = Array.from(healthChecks.entries()).map(async ([name, fn]) => {
    try {
      const result = await fn();
      results[name] = result;
      setHealthStatus(name, result.status === 'healthy');

      // Determine overall status
      if (result.status === 'unhealthy') {
        overallStatus = 'unhealthy';
      } else if (result.status === 'degraded' && overallStatus !== 'unhealthy') {
        overallStatus = 'degraded';
      }
    } catch (error) {
      results[name] = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Check failed',
      };
      setHealthStatus(name, false);
      overallStatus = 'unhealthy';
    }
  });

  await Promise.all(checkPromises);

  return {
    status: overallStatus,
    checks: results,
    totalLatencyMs: Date.now() - startTime,
  };
}

/**
 * GET /health
 * Comprehensive health check with all service statuses
 */
health.get('/', async (c) => {
  const { status, checks, totalLatencyMs } = await runHealthChecks();

  // Get memory usage
  const mem = process.memoryUsage();
  const memoryMb = {
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
  };

  const response = {
    status,
    version: process.env.npm_package_version || '0.1.0',
    uptime: Math.floor(process.uptime()),
    checks,
    memory: memoryMb,
    responseTime: totalLatencyMs,
  };

  // Return 503 if unhealthy
  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return c.json(response, httpStatus);
});

/**
 * GET /health/ready
 * Kubernetes readiness probe
 * Returns 200 if all critical services are available
 */
health.get('/ready', async (c) => {
  const { status, checks } = await runHealthChecks();

  if (status === 'healthy' || status === 'degraded') {
    return c.json({
      ready: true,
      status,
      checks: Object.fromEntries(
        Object.entries(checks).map(([k, v]) => [k, v.status])
      ),
    });
  }

  return c.json(
    {
      ready: false,
      status,
      checks: Object.fromEntries(
        Object.entries(checks).map(([k, v]) => [k, v.status])
      ),
    },
    503
  );
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 * Returns 200 if the process is alive (always true if handler is reached)
 */
health.get('/live', (c) => {
  return c.json({
    alive: true,
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * GET /health/metrics
 * Prometheus metrics export
 */
health.get('/metrics', async (c) => {
  // Run health checks to update metrics
  await runHealthChecks();

  // Return metrics in Prometheus format
  c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return c.text(getPrometheusMetrics());
});

/**
 * GET /health/metrics/json
 * Metrics in JSON format for debugging
 */
health.get('/metrics/json', async (c) => {
  await runHealthChecks();
  return c.json(getMetricsJson());
});

export { health };
