/**
 * Load Test Scenarios
 *
 * Defines various load testing scenarios for the Unbrowser API.
 * Each scenario tests different aspects of the API under load.
 */

import type { LoadTestScenario } from './runner.js';
import { defaultConfig } from './config.js';

/**
 * Health check scenarios - baseline performance
 */
export const healthScenarios: LoadTestScenario[] = [
  {
    name: 'Health Check - Low Load',
    description: 'Basic health check with minimal load',
    path: '/health',
    method: 'GET',
    duration: defaultConfig.durations.baseline,
    connections: defaultConfig.concurrency.low,
  },
  {
    name: 'Health Check - High Load',
    description: 'Health check under high concurrent load',
    path: '/health',
    method: 'GET',
    duration: defaultConfig.durations.stress,
    connections: defaultConfig.concurrency.high,
  },
  {
    name: 'Health Check - Extreme Load',
    description: 'Health check stress test at 500+ connections',
    path: '/health',
    method: 'GET',
    duration: defaultConfig.durations.stress,
    connections: defaultConfig.concurrency.extreme,
    pipelining: 10,
  },
];

/**
 * Browse endpoint scenarios - main API functionality
 */
export const browseScenarios: LoadTestScenario[] = [
  {
    name: 'Browse - Baseline',
    description: 'Standard browse requests with low concurrency',
    path: '/v1/browse',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    body: {
      url: 'https://example.com',
      options: {
        extractContent: true,
        screenshot: false,
      },
    },
    duration: defaultConfig.durations.baseline,
    connections: defaultConfig.concurrency.low,
  },
  {
    name: 'Browse - Medium Load',
    description: 'Browse requests under moderate load',
    path: '/v1/browse',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    body: {
      url: 'https://example.com',
      options: {
        extractContent: true,
        screenshot: false,
      },
    },
    duration: defaultConfig.durations.stress,
    connections: defaultConfig.concurrency.medium,
  },
  {
    name: 'Browse - High Load',
    description: 'Browse requests under high concurrent load',
    path: '/v1/browse',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.enterprise,
    },
    body: {
      url: 'https://example.com',
      options: {
        extractContent: true,
        screenshot: false,
      },
    },
    duration: defaultConfig.durations.stress,
    connections: defaultConfig.concurrency.high,
  },
];

/**
 * Batch endpoint scenarios
 */
export const batchScenarios: LoadTestScenario[] = [
  {
    name: 'Batch - Small Batches',
    description: 'Batch endpoint with 3 URLs per request',
    path: '/v1/batch',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    body: {
      urls: [
        'https://example.com',
        'https://example.org',
        'https://example.net',
      ],
      options: {
        extractContent: true,
        screenshot: false,
      },
    },
    duration: defaultConfig.durations.baseline,
    connections: defaultConfig.concurrency.low,
  },
  {
    name: 'Batch - Large Batches Under Load',
    description: 'Batch endpoint with 5 URLs, medium concurrency',
    path: '/v1/batch',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.enterprise,
    },
    body: {
      urls: [
        'https://example.com',
        'https://example.org',
        'https://example.net',
        'https://httpbin.org/html',
        'https://httpbin.org/json',
      ],
      options: {
        extractContent: true,
        screenshot: false,
      },
    },
    duration: defaultConfig.durations.stress,
    connections: defaultConfig.concurrency.medium,
  },
];

/**
 * Fetch endpoint scenarios - lightweight fetching
 */
export const fetchScenarios: LoadTestScenario[] = [
  {
    name: 'Fetch - Baseline',
    description: 'Fast fetch endpoint under low load',
    path: '/v1/fetch',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.starter,
    },
    body: {
      url: 'https://example.com',
    },
    duration: defaultConfig.durations.baseline,
    connections: defaultConfig.concurrency.low,
  },
  {
    name: 'Fetch - High Throughput',
    description: 'Fast fetch endpoint stressed for max throughput',
    path: '/v1/fetch',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    body: {
      url: 'https://example.com',
    },
    duration: defaultConfig.durations.stress,
    connections: defaultConfig.concurrency.high,
    pipelining: 5,
  },
];

/**
 * Rate limiting validation scenarios
 */
export const rateLimitScenarios: LoadTestScenario[] = [
  {
    name: 'Rate Limit - Starter Plan Burst',
    description: 'Test rate limiting for Starter plan (should hit limits)',
    path: '/v1/browse',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.starter,
    },
    body: {
      url: 'https://example.com',
    },
    duration: defaultConfig.durations.spike,
    connections: defaultConfig.concurrency.medium,
  },
  {
    name: 'Rate Limit - Enterprise High Volume',
    description: 'Test rate limiting for Enterprise plan under high load',
    path: '/v1/browse',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.enterprise,
    },
    body: {
      url: 'https://example.com',
    },
    duration: defaultConfig.durations.spike,
    connections: defaultConfig.concurrency.extreme,
  },
];

/**
 * Authentication scenarios
 */
export const authScenarios: LoadTestScenario[] = [
  {
    name: 'Auth - Valid Keys Under Load',
    description: 'Authenticated requests under load',
    path: '/v1/usage',
    method: 'GET',
    headers: {
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    duration: defaultConfig.durations.baseline,
    connections: defaultConfig.concurrency.medium,
  },
  {
    name: 'Auth - Invalid Keys (Rejection Performance)',
    description: 'Test auth rejection performance under load',
    path: '/v1/usage',
    method: 'GET',
    headers: {
      'X-API-Key': 'ub_test_invalid_key_for_load_test',
    },
    duration: defaultConfig.durations.baseline,
    connections: defaultConfig.concurrency.low,
  },
];

/**
 * Usage endpoint scenarios
 */
export const usageScenarios: LoadTestScenario[] = [
  {
    name: 'Usage Stats - Baseline',
    description: 'Usage endpoint under normal load',
    path: '/v1/usage',
    method: 'GET',
    headers: {
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    duration: defaultConfig.durations.baseline,
    connections: defaultConfig.concurrency.low,
  },
  {
    name: 'Usage Stats - High Load',
    description: 'Usage endpoint under high concurrent load',
    path: '/v1/usage',
    method: 'GET',
    headers: {
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    duration: defaultConfig.durations.stress,
    connections: defaultConfig.concurrency.medium,
  },
];

/**
 * Mixed workload scenario (simulates production traffic patterns)
 */
export const mixedWorkloadScenarios: LoadTestScenario[] = [
  // Mix of different endpoints
  {
    name: 'Mixed - Health Checks',
    description: 'Health checks as part of mixed workload',
    path: '/health',
    method: 'GET',
    duration: defaultConfig.durations.stress,
    connections: 20,
  },
  {
    name: 'Mixed - Browse Requests',
    description: 'Browse requests as part of mixed workload',
    path: '/v1/browse',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    body: {
      url: 'https://example.com',
    },
    duration: defaultConfig.durations.stress,
    connections: 30,
  },
  {
    name: 'Mixed - Fetch Requests',
    description: 'Fetch requests as part of mixed workload',
    path: '/v1/fetch',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    body: {
      url: 'https://example.com',
    },
    duration: defaultConfig.durations.stress,
    connections: 30,
  },
  {
    name: 'Mixed - Usage Checks',
    description: 'Usage checks as part of mixed workload',
    path: '/v1/usage',
    method: 'GET',
    headers: {
      'X-API-Key': defaultConfig.apiKeys.team,
    },
    duration: defaultConfig.durations.stress,
    connections: 20,
  },
];

/**
 * All scenarios grouped
 */
export const allScenarios = {
  health: healthScenarios,
  browse: browseScenarios,
  batch: batchScenarios,
  fetch: fetchScenarios,
  rateLimit: rateLimitScenarios,
  auth: authScenarios,
  usage: usageScenarios,
  mixed: mixedWorkloadScenarios,
};

/**
 * Get baseline scenarios (quick tests for CI/CD)
 */
export function getBaselineScenarios(): LoadTestScenario[] {
  return [
    healthScenarios[0], // Health Check - Low Load
    browseScenarios[0], // Browse - Baseline
    fetchScenarios[0], // Fetch - Baseline
    usageScenarios[0], // Usage Stats - Baseline
  ];
}

/**
 * Get stress test scenarios (comprehensive testing)
 */
export function getStressScenarios(): LoadTestScenario[] {
  return [
    ...healthScenarios,
    ...browseScenarios,
    ...fetchScenarios,
    ...usageScenarios,
  ];
}

/**
 * Get all scenarios for full load testing
 */
export function getAllScenarios(): LoadTestScenario[] {
  return [
    ...healthScenarios,
    ...browseScenarios,
    ...batchScenarios,
    ...fetchScenarios,
    ...rateLimitScenarios,
    ...authScenarios,
    ...usageScenarios,
    ...mixedWorkloadScenarios,
  ];
}
