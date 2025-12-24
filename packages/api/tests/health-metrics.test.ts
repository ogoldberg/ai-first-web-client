/**
 * Health Check and Metrics Tests
 *
 * Tests for the health endpoints and Prometheus metrics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import {
  health,
  registerHealthCheck,
  unregisterHealthCheck,
  setHealthCheck,
} from '../src/routes/health.js';
import {
  recordHttpRequest,
  recordUsageMetrics,
  setActiveConnections,
  setHealthStatus,
  getPrometheusMetrics,
  getMetricsJson,
  resetMetrics,
} from '../src/services/metrics.js';

describe('Health Check Routes', () => {
  let app: Hono;

  beforeEach(() => {
    // Reset to default health check
    setHealthCheck(async () => true);
    // Unregister any custom checks from previous tests
    unregisterHealthCheck('test_service');
    unregisterHealthCheck('database');
    app = new Hono();
    app.route('/health', health);
  });

  describe('GET /health', () => {
    it('should return healthy status with all checks passing', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('healthy');
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.checks).toBeDefined();
      expect(body.checks.core).toBeDefined();
      expect(body.checks.core.status).toBe('healthy');
      expect(body.memory).toBeDefined();
      expect(body.memory.heapUsed).toBeGreaterThan(0);
      expect(body.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return degraded status when a check returns degraded', async () => {
      registerHealthCheck('test_service', async () => ({
        status: 'degraded',
        message: 'High latency',
      }));

      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('degraded');
      expect(body.checks.test_service.status).toBe('degraded');
      expect(body.checks.test_service.message).toBe('High latency');
    });

    it('should return unhealthy status (503) when a check fails', async () => {
      registerHealthCheck('database', async () => ({
        status: 'unhealthy',
        message: 'Connection refused',
      }));

      const res = await app.request('/health');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('unhealthy');
      expect(body.checks.database.status).toBe('unhealthy');
      expect(body.checks.database.message).toBe('Connection refused');
    });

    it('should handle check exceptions gracefully', async () => {
      registerHealthCheck('test_service', async () => {
        throw new Error('Service crashed');
      });

      const res = await app.request('/health');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('unhealthy');
      expect(body.checks.test_service.status).toBe('unhealthy');
      expect(body.checks.test_service.message).toBe('Service crashed');
    });

    it('should include latency for each check', async () => {
      registerHealthCheck('test_service', async () => {
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { status: 'healthy', latencyMs: 10 };
      });

      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.checks.test_service.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when all checks pass', async () => {
      const res = await app.request('/health/ready');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ready).toBe(true);
      expect(body.status).toBe('healthy');
    });

    it('should return ready when status is degraded', async () => {
      registerHealthCheck('test_service', async () => ({
        status: 'degraded',
        message: 'Slow',
      }));

      const res = await app.request('/health/ready');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ready).toBe(true);
      expect(body.status).toBe('degraded');
    });

    it('should return not ready (503) when unhealthy', async () => {
      setHealthCheck(async () => false);

      const res = await app.request('/health/ready');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ready).toBe(false);
    });
  });

  describe('GET /health/live', () => {
    it('should always return alive', async () => {
      const res = await app.request('/health/live');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alive).toBe(true);
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return alive even when checks fail', async () => {
      setHealthCheck(async () => false);

      const res = await app.request('/health/live');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alive).toBe(true);
    });
  });

  describe('GET /health/metrics', () => {
    it('should return Prometheus format metrics', async () => {
      const res = await app.request('/health/metrics');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');

      const body = await res.text();
      expect(body).toContain('unbrowser_uptime_seconds');
      expect(body).toContain('unbrowser_memory_usage_bytes');
    });
  });

  describe('GET /health/metrics/json', () => {
    it('should return JSON format metrics', async () => {
      const res = await app.request('/health/metrics/json');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
      expect(body.unbrowser_uptime_seconds).toBeDefined();
    });
  });
});

describe('Metrics Service', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('recordHttpRequest', () => {
    it('should record request count and duration', () => {
      recordHttpRequest('GET', '/v1/browse', 200, 150);
      recordHttpRequest('GET', '/v1/browse', 200, 250);
      recordHttpRequest('POST', '/v1/browse', 201, 100);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('unbrowser_http_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('path="/v1/browse"');
      expect(metrics).toContain('status="200"');
    });

    it('should record histogram buckets', () => {
      recordHttpRequest('GET', '/v1/browse', 200, 50);
      recordHttpRequest('GET', '/v1/browse', 200, 150);
      recordHttpRequest('GET', '/v1/browse', 200, 500);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('unbrowser_http_request_duration_ms_bucket');
      expect(metrics).toContain('unbrowser_http_request_duration_ms_sum');
      expect(metrics).toContain('unbrowser_http_request_duration_ms_count');
    });

    it('should normalize paths to reduce cardinality', () => {
      recordHttpRequest('GET', '/v1/tenants/tenant_abc123/keys', 200, 50);
      recordHttpRequest('GET', '/v1/users/12345', 200, 50);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain(':tenant_id');
      expect(metrics).toContain(':id');
    });
  });

  describe('recordUsageMetrics', () => {
    it('should record usage by tier', () => {
      recordUsageMetrics('intelligence', 1);
      recordUsageMetrics('lightweight', 5);
      recordUsageMetrics('playwright', 25);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('unbrowser_usage_units_total');
      expect(metrics).toContain('tier="intelligence"');
      expect(metrics).toContain('tier="lightweight"');
      expect(metrics).toContain('tier="playwright"');
    });

    it('should accumulate units correctly', () => {
      recordUsageMetrics('intelligence', 1);
      recordUsageMetrics('intelligence', 1);
      recordUsageMetrics('intelligence', 1);

      const json = getMetricsJson();
      const units = json.unbrowser_usage_units_total as Array<{
        value: number;
        labels: { tier: string };
      }>;
      const intelligenceUnits = units.find((u) => u.labels.tier === 'intelligence');
      expect(intelligenceUnits?.value).toBe(3);
    });
  });

  describe('setActiveConnections', () => {
    it('should set gauge value for service', () => {
      setActiveConnections('redis', 5);
      setActiveConnections('postgres', 10);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('unbrowser_active_connections');
      expect(metrics).toContain('service="redis"');
      expect(metrics).toContain('service="postgres"');
    });

    it('should update gauge value when called again', () => {
      setActiveConnections('redis', 5);
      setActiveConnections('redis', 3);

      const json = getMetricsJson();
      const connections = json.unbrowser_active_connections as Array<{
        value: number;
        labels: { service: string };
      }>;
      const redisConnections = connections.find((c) => c.labels.service === 'redis');
      expect(redisConnections?.value).toBe(3);
    });
  });

  describe('setHealthStatus', () => {
    it('should set health gauge (1 for healthy, 0 for unhealthy)', () => {
      setHealthStatus('core', true);
      setHealthStatus('redis', false);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('unbrowser_health_check');
      expect(metrics).toContain('service="core"');
      expect(metrics).toContain('service="redis"');
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should include all registered metric types', () => {
      recordHttpRequest('GET', '/test', 200, 100);
      setActiveConnections('redis', 1);
      setHealthStatus('core', true);

      const metrics = getPrometheusMetrics();

      // Should have HELP and TYPE comments
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');

      // Should have memory and uptime gauges
      expect(metrics).toContain('unbrowser_memory_usage_bytes');
      expect(metrics).toContain('unbrowser_uptime_seconds');
    });

    it('should escape label values correctly', () => {
      recordHttpRequest('GET', '/path/with"quotes', 200, 100);

      const metrics = getPrometheusMetrics();
      expect(metrics).toContain('path="/path/with\\"quotes"');
    });
  });

  describe('getMetricsJson', () => {
    it('should return metrics as JSON object', () => {
      recordHttpRequest('GET', '/test', 200, 100);

      const json = getMetricsJson();
      expect(json).toBeDefined();
      expect(json.unbrowser_http_requests_total).toBeDefined();
      expect(Array.isArray(json.unbrowser_http_requests_total)).toBe(true);
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metrics', () => {
      recordHttpRequest('GET', '/test', 200, 100);
      setActiveConnections('redis', 5);

      resetMetrics();

      const json = getMetricsJson();
      expect(json.unbrowser_http_requests_total).toBeUndefined();
      expect(json.unbrowser_active_connections).toBeUndefined();
    });
  });
});

describe('Health Check Registration', () => {
  let app: Hono;

  beforeEach(() => {
    setHealthCheck(async () => true);
    unregisterHealthCheck('custom');
    app = new Hono();
    app.route('/health', health);
  });

  afterEach(() => {
    unregisterHealthCheck('custom');
  });

  it('should allow registering custom health checks', async () => {
    registerHealthCheck('custom', async () => ({
      status: 'healthy',
      message: 'All good',
      latencyMs: 5,
    }));

    const res = await app.request('/health');
    const body = await res.json();

    expect(body.checks.custom).toBeDefined();
    expect(body.checks.custom.status).toBe('healthy');
    expect(body.checks.custom.message).toBe('All good');
  });

  it('should allow unregistering health checks', async () => {
    registerHealthCheck('custom', async () => ({
      status: 'healthy',
    }));

    // First verify it's registered
    let res = await app.request('/health');
    let body = await res.json();
    expect(body.checks.custom).toBeDefined();

    // Unregister
    unregisterHealthCheck('custom');

    // Verify it's gone
    res = await app.request('/health');
    body = await res.json();
    expect(body.checks.custom).toBeUndefined();
  });

  it('should run all checks in parallel', async () => {
    const startTimes: number[] = [];

    registerHealthCheck('slow1', async () => {
      startTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return { status: 'healthy' };
    });

    registerHealthCheck('slow2', async () => {
      startTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return { status: 'healthy' };
    });

    const start = Date.now();
    await app.request('/health');
    const duration = Date.now() - start;

    // If run in parallel, both should start within a few ms of each other
    // and total time should be ~50ms, not ~100ms
    expect(duration).toBeLessThan(100);

    unregisterHealthCheck('slow1');
    unregisterHealthCheck('slow2');
  });
});
