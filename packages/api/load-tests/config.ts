/**
 * Load Testing Configuration
 *
 * Centralized configuration for load tests.
 * Modify these values to adjust test parameters.
 */

export interface LoadTestConfig {
  // Server configuration
  baseUrl: string;
  port: number;

  // Test API keys (generated for testing)
  apiKeys: {
    starter: string;
    team: string;
    enterprise: string;
  };

  // Test durations (in seconds)
  durations: {
    warmup: number;
    baseline: number;
    stress: number;
    spike: number;
  };

  // Concurrency levels
  concurrency: {
    low: number;
    medium: number;
    high: number;
    extreme: number;
  };

  // Thresholds for success
  thresholds: {
    p95LatencyMs: number;
    p99LatencyMs: number;
    errorRatePercent: number;
    minRequestsPerSec: number;
  };
}

export const defaultConfig: LoadTestConfig = {
  baseUrl: 'http://localhost',
  port: 3001,

  // These will be overridden by actual test setup
  apiKeys: {
    starter: 'ub_test_loadtest_starter_key_00001',
    team: 'ub_test_loadtest_team_key_000001',
    enterprise: 'ub_test_loadtest_enterprise_key',
  },

  durations: {
    warmup: 5, // 5 seconds warmup
    baseline: 30, // 30 seconds baseline test
    stress: 60, // 1 minute stress test
    spike: 10, // 10 seconds spike test
  },

  concurrency: {
    low: 10, // 10 concurrent connections
    medium: 50, // 50 concurrent connections
    high: 100, // 100 concurrent connections
    extreme: 500, // 500 concurrent connections
  },

  thresholds: {
    p95LatencyMs: 200, // p95 latency should be under 200ms
    p99LatencyMs: 500, // p99 latency should be under 500ms
    errorRatePercent: 1, // Error rate should be under 1%
    minRequestsPerSec: 100, // Minimum 100 requests per second
  },
};

export function getServerUrl(config: LoadTestConfig = defaultConfig): string {
  return `${config.baseUrl}:${config.port}`;
}
