/**
 * Load Test Runner
 *
 * Main entry point for running load tests.
 * Uses autocannon for HTTP load testing.
 */

import { createRequire } from 'module';
import type { Options, Result } from 'autocannon';
import { defaultConfig, type LoadTestConfig, getServerUrl } from './config.js';

// autocannon is CommonJS, use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const autocannon = require('autocannon') as (options: Options) => Promise<Result>;

// Extend autocannon's Histogram type to include p95 which exists at runtime
type LatencyWithP95 = Result['latency'] & { p95?: number };

export interface LoadTestScenario {
  name: string;
  description: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;
  duration: number;
  connections: number;
  pipelining?: number;
}

export interface LoadTestResult {
  scenario: string;
  duration: number;
  connections: number;
  totalRequests: number;
  requestsPerSec: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    max: number;
  };
  throughput: {
    bytesPerSec: number;
    totalBytes: number;
  };
  errors: number;
  timeouts: number;
  statusCodes: Record<string, number>;
  passed: boolean;
  failures: string[];
}

/**
 * Run a single load test scenario
 */
export async function runScenario(
  scenario: LoadTestScenario,
  config: LoadTestConfig = defaultConfig
): Promise<LoadTestResult> {
  const url = `${getServerUrl(config)}${scenario.path}`;

  const options: Options = {
    url,
    method: scenario.method,
    headers: scenario.headers,
    body: typeof scenario.body === 'object' ? JSON.stringify(scenario.body) : scenario.body,
    duration: scenario.duration,
    connections: scenario.connections,
    pipelining: scenario.pipelining || 1,
  };

  console.log(`\n--- Running: ${scenario.name} ---`);
  console.log(`URL: ${url}`);
  console.log(`Connections: ${scenario.connections}, Duration: ${scenario.duration}s`);

  const result = await autocannon(options);

  return formatResult(scenario, result, config);
}

/**
 * Format autocannon result into our standard format
 */
function formatResult(
  scenario: LoadTestScenario,
  result: Result,
  config: LoadTestConfig
): LoadTestResult {
  const failures: string[] = [];
  const latency = result.latency as LatencyWithP95;

  // p95 exists at runtime but may not be in types - interpolate if missing
  const p95 = latency.p95 ?? Math.round((latency.p50 + latency.p99) / 2);

  // Check thresholds
  if (p95 > config.thresholds.p95LatencyMs) {
    failures.push(
      `p95 latency ${p95}ms exceeds threshold ${config.thresholds.p95LatencyMs}ms`
    );
  }
  if (result.latency.p99 > config.thresholds.p99LatencyMs) {
    failures.push(
      `p99 latency ${result.latency.p99}ms exceeds threshold ${config.thresholds.p99LatencyMs}ms`
    );
  }

  const errorRate =
    result.errors > 0 ? (result.errors / (result.requests.total || 1)) * 100 : 0;
  if (errorRate > config.thresholds.errorRatePercent) {
    failures.push(
      `Error rate ${errorRate.toFixed(2)}% exceeds threshold ${config.thresholds.errorRatePercent}%`
    );
  }

  const reqPerSec = result.requests.average || 0;
  if (reqPerSec < config.thresholds.minRequestsPerSec) {
    failures.push(
      `Request rate ${reqPerSec.toFixed(0)}/s below threshold ${config.thresholds.minRequestsPerSec}/s`
    );
  }

  // Count status codes
  const statusCodes: Record<string, number> = {};
  if (result['1xx']) statusCodes['1xx'] = result['1xx'];
  if (result['2xx']) statusCodes['2xx'] = result['2xx'];
  if (result['3xx']) statusCodes['3xx'] = result['3xx'];
  if (result['4xx']) statusCodes['4xx'] = result['4xx'];
  if (result['5xx']) statusCodes['5xx'] = result['5xx'];

  return {
    scenario: scenario.name,
    duration: scenario.duration,
    connections: scenario.connections,
    totalRequests: result.requests.total,
    requestsPerSec: result.requests.average || 0,
    latency: {
      p50: latency.p50,
      p95,
      p99: latency.p99,
      mean: latency.mean,
      max: latency.max,
    },
    throughput: {
      bytesPerSec: result.throughput.average || 0,
      totalBytes: result.throughput.total,
    },
    errors: result.errors,
    timeouts: result.timeouts,
    statusCodes,
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Print result summary to console
 */
export function printResult(result: LoadTestResult): void {
  console.log(`\n=== Results: ${result.scenario} ===`);
  console.log(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Total Requests: ${result.totalRequests}`);
  console.log(`Requests/sec: ${result.requestsPerSec.toFixed(2)}`);
  console.log(`Latency (ms): p50=${result.latency.p50}, p95=${result.latency.p95}, p99=${result.latency.p99}, max=${result.latency.max}`);
  console.log(`Errors: ${result.errors}, Timeouts: ${result.timeouts}`);
  console.log(`Status Codes: ${JSON.stringify(result.statusCodes)}`);

  if (result.failures.length > 0) {
    console.log(`Failures:`);
    result.failures.forEach((f) => console.log(`  - ${f}`));
  }
}

/**
 * Run multiple scenarios and collect results
 */
export async function runAllScenarios(
  scenarios: LoadTestScenario[],
  config: LoadTestConfig = defaultConfig
): Promise<LoadTestResult[]> {
  const results: LoadTestResult[] = [];

  for (const scenario of scenarios) {
    try {
      const result = await runScenario(scenario, config);
      results.push(result);
      printResult(result);
    } catch (error) {
      console.error(`Error running scenario ${scenario.name}:`, error);
      results.push({
        scenario: scenario.name,
        duration: scenario.duration,
        connections: scenario.connections,
        totalRequests: 0,
        requestsPerSec: 0,
        latency: { p50: 0, p95: 0, p99: 0, mean: 0, max: 0 },
        throughput: { bytesPerSec: 0, totalBytes: 0 },
        errors: 1,
        timeouts: 0,
        statusCodes: {},
        passed: false,
        failures: [`Scenario failed with error: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
  }

  return results;
}

/**
 * Generate summary report
 */
export function generateSummary(results: LoadTestResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  let summary = `\n${'='.repeat(60)}\n`;
  summary += `LOAD TEST SUMMARY\n`;
  summary += `${'='.repeat(60)}\n`;
  summary += `Total Scenarios: ${total}\n`;
  summary += `Passed: ${passed}\n`;
  summary += `Failed: ${failed}\n`;
  summary += `${'='.repeat(60)}\n\n`;

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    summary += `[${status}] ${result.scenario}\n`;
    summary += `  Requests: ${result.totalRequests} (${result.requestsPerSec.toFixed(0)}/s)\n`;
    summary += `  Latency: p95=${result.latency.p95}ms, p99=${result.latency.p99}ms\n`;
    if (result.failures.length > 0) {
      summary += `  Issues:\n`;
      result.failures.forEach((f) => (summary += `    - ${f}\n`));
    }
    summary += '\n';
  }

  return summary;
}
