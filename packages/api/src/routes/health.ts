/**
 * Health Check Routes
 *
 * Provides health check endpoints for monitoring.
 * No authentication required.
 */

import { Hono } from 'hono';

const health = new Hono();

// Health check function - can be replaced with actual DB check when deployed
let healthCheckFn: () => Promise<boolean> = async () => true;

/**
 * Set the health check function (e.g., for database connectivity)
 */
export function setHealthCheck(fn: () => Promise<boolean>): void {
  healthCheckFn = fn;
}

/**
 * GET /health
 * Basic health check
 */
health.get('/', async (c) => {
  const startTime = Date.now();

  // Check configured health checks
  let status = 'healthy';
  const checks: Record<string, string> = {};

  try {
    const isHealthy = await healthCheckFn();
    checks.core = isHealthy ? 'healthy' : 'unhealthy';
    if (!isHealthy) status = 'degraded';
  } catch {
    checks.core = 'unhealthy';
    status = 'degraded';
  }

  const uptime = process.uptime();

  return c.json({
    status,
    version: process.env.npm_package_version || '0.1.0',
    uptime: Math.floor(uptime),
    checks,
    responseTime: Date.now() - startTime,
  });
});

/**
 * GET /health/ready
 * Readiness probe for Kubernetes
 */
health.get('/ready', async (c) => {
  try {
    const isHealthy = await healthCheckFn();
    if (isHealthy) {
      return c.json({ ready: true });
    }
    return c.json({ ready: false }, 503);
  } catch {
    return c.json({ ready: false }, 503);
  }
});

/**
 * GET /health/live
 * Liveness probe for Kubernetes
 */
health.get('/live', (c) => {
  return c.json({ alive: true });
});

export { health };
