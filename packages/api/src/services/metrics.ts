/**
 * Metrics Service
 *
 * Collects and exposes metrics for monitoring and observability.
 * Designed to be exported in Prometheus format.
 *
 * Metrics collected:
 * - HTTP request counts (by path, method, status)
 * - HTTP request latencies (histogram)
 * - Usage metrics (units consumed by tier)
 * - Connection health (Redis, DB)
 */

import type { Tier } from './usage.js';

// Counter metric with labels
interface CounterValue {
  value: number;
  labels: Record<string, string>;
}

// Histogram metric with buckets
interface HistogramValue {
  buckets: Map<number, number>; // bucket threshold -> count
  sum: number;
  count: number;
  labels: Record<string, string>;
}

// Gauge metric (current value)
interface GaugeValue {
  value: number;
  labels: Record<string, string>;
}

// Metric types
type MetricType = 'counter' | 'gauge' | 'histogram';

interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
}

// Metric registry
class MetricsRegistry {
  private counters = new Map<string, CounterValue[]>();
  private histograms = new Map<string, HistogramValue[]>();
  private gauges = new Map<string, GaugeValue[]>();
  private definitions = new Map<string, MetricDefinition>();

  // Default histogram buckets for latency (in milliseconds)
  private readonly latencyBuckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

  /**
   * Register a metric definition
   */
  register(definition: MetricDefinition): void {
    this.definitions.set(definition.name, definition);
  }

  /**
   * Increment a counter
   */
  incCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, []);
    }

    const counters = this.counters.get(name)!;
    const labelKey = this.labelsToKey(labels);

    // Find existing counter with same labels
    let counter = counters.find((c) => this.labelsToKey(c.labels) === labelKey);
    if (!counter) {
      counter = { value: 0, labels };
      counters.push(counter);
    }
    counter.value += value;
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, []);
    }

    const gauges = this.gauges.get(name)!;
    const labelKey = this.labelsToKey(labels);

    // Find or create gauge with same labels
    let gauge = gauges.find((g) => this.labelsToKey(g.labels) === labelKey);
    if (!gauge) {
      gauge = { value: 0, labels };
      gauges.push(gauge);
    }
    gauge.value = value;
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    buckets: number[] = this.latencyBuckets
  ): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }

    const histograms = this.histograms.get(name)!;
    const labelKey = this.labelsToKey(labels);

    // Find or create histogram with same labels
    let histogram = histograms.find((h) => this.labelsToKey(h.labels) === labelKey);
    if (!histogram) {
      histogram = {
        buckets: new Map(buckets.map((b) => [b, 0])),
        sum: 0,
        count: 0,
        labels,
      };
      histograms.push(histogram);
    }

    // Update histogram
    histogram.sum += value;
    histogram.count++;

    // Update buckets
    for (const bucket of buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  /**
   * Convert labels to a unique key string
   */
  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels: Record<string, string>): string {
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${this.escapeLabel(v)}"`);

    return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
  }

  /**
   * Escape label values for Prometheus
   */
  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Export all metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Export counters
    for (const [name, values] of this.counters) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} counter`);
      }
      for (const counter of values) {
        lines.push(`${name}${this.formatLabels(counter.labels)} ${counter.value}`);
      }
    }

    // Export gauges
    for (const [name, values] of this.gauges) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} gauge`);
      }
      for (const gauge of values) {
        lines.push(`${name}${this.formatLabels(gauge.labels)} ${gauge.value}`);
      }
    }

    // Export histograms
    for (const [name, values] of this.histograms) {
      const def = this.definitions.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} histogram`);
      }
      for (const histogram of values) {
        const sortedBuckets = [...histogram.buckets.entries()].sort(([a], [b]) => a - b);
        let cumulativeCount = 0;

        for (const [le, count] of sortedBuckets) {
          cumulativeCount += count;
          const bucketLabels = { ...histogram.labels, le: le.toString() };
          lines.push(`${name}_bucket${this.formatLabels(bucketLabels)} ${cumulativeCount}`);
        }

        // Add +Inf bucket
        const infLabels = { ...histogram.labels, le: '+Inf' };
        lines.push(`${name}_bucket${this.formatLabels(infLabels)} ${histogram.count}`);

        // Add sum and count
        lines.push(`${name}_sum${this.formatLabels(histogram.labels)} ${histogram.sum}`);
        lines.push(`${name}_count${this.formatLabels(histogram.labels)} ${histogram.count}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON for internal use
   */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Counters
    for (const [name, values] of this.counters) {
      result[name] = values.map((v) => ({ value: v.value, labels: v.labels }));
    }

    // Gauges
    for (const [name, values] of this.gauges) {
      result[name] = values.map((v) => ({ value: v.value, labels: v.labels }));
    }

    // Histograms (simplified)
    for (const [name, values] of this.histograms) {
      result[name] = values.map((v) => ({
        count: v.count,
        sum: v.sum,
        labels: v.labels,
      }));
    }

    return result;
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

// Global metrics registry
const registry = new MetricsRegistry();

// Register metric definitions
registry.register({
  name: 'unbrowser_http_requests_total',
  help: 'Total number of HTTP requests',
  type: 'counter',
});

registry.register({
  name: 'unbrowser_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  type: 'histogram',
});

registry.register({
  name: 'unbrowser_usage_units_total',
  help: 'Total usage units consumed',
  type: 'counter',
});

registry.register({
  name: 'unbrowser_usage_requests_total',
  help: 'Total browse requests by tier',
  type: 'counter',
});

registry.register({
  name: 'unbrowser_active_connections',
  help: 'Number of active connections',
  type: 'gauge',
});

registry.register({
  name: 'unbrowser_memory_usage_bytes',
  help: 'Memory usage in bytes',
  type: 'gauge',
});

registry.register({
  name: 'unbrowser_uptime_seconds',
  help: 'Process uptime in seconds',
  type: 'gauge',
});

registry.register({
  name: 'unbrowser_health_check',
  help: 'Health check status (1 = healthy, 0 = unhealthy)',
  type: 'gauge',
});

// Convenience functions for recording metrics

/**
 * Record an HTTP request
 */
export function recordHttpRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number
): void {
  // Normalize path to avoid high cardinality
  const normalizedPath = normalizePath(path);

  const labels = {
    method,
    path: normalizedPath,
    status: status.toString(),
  };

  registry.incCounter('unbrowser_http_requests_total', labels);
  registry.observeHistogram('unbrowser_http_request_duration_ms', durationMs, labels);
}

/**
 * Record usage by tier
 */
export function recordUsageMetrics(tier: Tier, units: number): void {
  registry.incCounter('unbrowser_usage_units_total', { tier }, units);
  registry.incCounter('unbrowser_usage_requests_total', { tier });
}

/**
 * Update connection gauge
 */
export function setActiveConnections(service: string, count: number): void {
  registry.setGauge('unbrowser_active_connections', count, { service });
}

/**
 * Update memory usage
 */
export function updateMemoryMetrics(): void {
  const mem = process.memoryUsage();
  registry.setGauge('unbrowser_memory_usage_bytes', mem.heapUsed, { type: 'heap_used' });
  registry.setGauge('unbrowser_memory_usage_bytes', mem.heapTotal, { type: 'heap_total' });
  registry.setGauge('unbrowser_memory_usage_bytes', mem.rss, { type: 'rss' });
  registry.setGauge('unbrowser_memory_usage_bytes', mem.external, { type: 'external' });
}

/**
 * Update uptime
 */
export function updateUptimeMetrics(): void {
  registry.setGauge('unbrowser_uptime_seconds', process.uptime());
}

/**
 * Update health check status
 */
export function setHealthStatus(service: string, healthy: boolean): void {
  registry.setGauge('unbrowser_health_check', healthy ? 1 : 0, { service });
}

/**
 * Normalize path to reduce cardinality
 * Replaces IDs and dynamic segments with placeholders
 */
function normalizePath(path: string): string {
  return path
    // Remove query string
    .split('?')[0]
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    // Replace tenant/key IDs
    .replace(/tenant_[a-zA-Z0-9]+/g, ':tenant_id')
    .replace(/key_[a-zA-Z0-9]+/g, ':key_id')
    // Normalize trailing slashes
    .replace(/\/+$/, '');
}

/**
 * Get metrics in Prometheus format
 */
export function getPrometheusMetrics(): string {
  // Update dynamic gauges before export
  updateMemoryMetrics();
  updateUptimeMetrics();
  return registry.toPrometheus();
}

/**
 * Get metrics as JSON
 */
export function getMetricsJson(): Record<string, unknown> {
  updateMemoryMetrics();
  updateUptimeMetrics();
  return registry.toJSON();
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  registry.reset();
}

export { registry };
