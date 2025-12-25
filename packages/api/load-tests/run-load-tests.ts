#!/usr/bin/env npx tsx
/**
 * Load Test Entry Point
 *
 * Run load tests against the Unbrowser API.
 *
 * Usage:
 *   npx tsx load-tests/run-load-tests.ts [suite] [options]
 *
 * Suites:
 *   baseline  - Quick baseline tests (default)
 *   stress    - Comprehensive stress tests
 *   full      - All scenarios
 *   health    - Health endpoint only
 *   browse    - Browse endpoint only
 *   batch     - Batch endpoint only
 *   fetch     - Fetch endpoint only
 *   auth      - Authentication tests
 *   ratelimit - Rate limiting tests
 *   usage     - Usage endpoint tests
 *   mixed     - Mixed workload simulation
 *
 * Options:
 *   --url URL      - Server URL (default: http://localhost:3001)
 *   --duration N   - Override test duration in seconds
 *   --connections N - Override connection count
 *   --json         - Output results as JSON
 */

import { runAllScenarios, generateSummary, type LoadTestResult } from './runner.js';
import {
  getBaselineScenarios,
  getStressScenarios,
  getAllScenarios,
  healthScenarios,
  browseScenarios,
  batchScenarios,
  fetchScenarios,
  authScenarios,
  rateLimitScenarios,
  usageScenarios,
  mixedWorkloadScenarios,
} from './scenarios.js';
import { defaultConfig, type LoadTestConfig } from './config.js';
import type { LoadTestScenario } from './runner.js';

// Parse command line arguments
function parseArgs(): {
  suite: string;
  url?: string;
  duration?: number;
  connections?: number;
  json: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    suite: 'baseline',
    url: undefined as string | undefined,
    duration: undefined as number | undefined,
    connections: undefined as number | undefined,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--url' && args[i + 1]) {
      result.url = args[++i];
    } else if (arg === '--duration' && args[i + 1]) {
      result.duration = parseInt(args[++i], 10);
    } else if (arg === '--connections' && args[i + 1]) {
      result.connections = parseInt(args[++i], 10);
    } else if (arg === '--json') {
      result.json = true;
    } else if (!arg.startsWith('--')) {
      result.suite = arg;
    }
  }

  return result;
}

// Get scenarios for the specified suite
function getScenariosForSuite(suite: string): LoadTestScenario[] {
  switch (suite) {
    case 'baseline':
      return getBaselineScenarios();
    case 'stress':
      return getStressScenarios();
    case 'full':
      return getAllScenarios();
    case 'health':
      return healthScenarios;
    case 'browse':
      return browseScenarios;
    case 'batch':
      return batchScenarios;
    case 'fetch':
      return fetchScenarios;
    case 'auth':
      return authScenarios;
    case 'ratelimit':
      return rateLimitScenarios;
    case 'usage':
      return usageScenarios;
    case 'mixed':
      return mixedWorkloadScenarios;
    default:
      console.error(`Unknown suite: ${suite}`);
      console.error('Available suites: baseline, stress, full, health, browse, batch, fetch, auth, ratelimit, usage, mixed');
      process.exit(1);
  }
}

// Apply overrides to scenarios
function applyOverrides(
  scenarios: LoadTestScenario[],
  duration?: number,
  connections?: number
): LoadTestScenario[] {
  if (!duration && !connections) {
    return scenarios;
  }

  return scenarios.map((scenario) => ({
    ...scenario,
    duration: duration || scenario.duration,
    connections: connections || scenario.connections,
  }));
}

// Main function
async function main() {
  const args = parseArgs();
  const scenarios = getScenariosForSuite(args.suite);
  const adjustedScenarios = applyOverrides(scenarios, args.duration, args.connections);

  // Build config with URL override
  const config: LoadTestConfig = {
    ...defaultConfig,
  };

  if (args.url) {
    const url = new URL(args.url);
    config.baseUrl = `${url.protocol}//${url.hostname}`;
    config.port = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);
  }

  if (!args.json) {
    console.log('='.repeat(60));
    console.log('UNBROWSER API LOAD TESTS');
    console.log('='.repeat(60));
    console.log(`Suite: ${args.suite}`);
    console.log(`Target: ${config.baseUrl}:${config.port}`);
    console.log(`Scenarios: ${adjustedScenarios.length}`);
    console.log('='.repeat(60));
  }

  // Run scenarios
  const results = await runAllScenarios(adjustedScenarios, config);

  // Output results
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const summary = generateSummary(results);
    console.log(summary);

    // Exit with error code if any tests failed
    const allPassed = results.every((r) => r.passed);
    if (!allPassed) {
      console.log('\nSome load tests FAILED. See above for details.');
      process.exit(1);
    } else {
      console.log('\nAll load tests PASSED!');
    }
  }
}

main().catch((error) => {
  console.error('Load test failed:', error);
  process.exit(1);
});
