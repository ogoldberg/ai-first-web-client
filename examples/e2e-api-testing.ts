/**
 * E2E API Testing Example (QA-001)
 *
 * Demonstrates using Unbrowser for comprehensive E2E API testing:
 * - Automatic API discovery from browsing
 * - Endpoint validation and testing
 * - Response structure verification
 * - Performance baseline tracking
 * - Test report generation
 *
 * This example shows the primary QA use case: discovering and testing
 * APIs without manually maintaining endpoint lists.
 */

import { createLLMBrowser, type LLMBrowserClient } from '../src/sdk.js';
import { JUnitReporter, generateTestReport, type TestCase, type TestSuite } from '../src/testing.js';

// ============================================
// TYPES
// ============================================

interface ApiTestResult {
  endpoint: string;
  method: string;
  passed: boolean;
  statusCode: number;
  responseTime: number;
  hasData: boolean;
  dataType?: 'array' | 'object' | 'string';
  error?: string;
}

interface ApiTestSuiteResult {
  domain: string;
  totalEndpoints: number;
  passed: number;
  failed: number;
  totalDuration: number;
  results: ApiTestResult[];
  discoveryTime: number;
}

interface PerformanceBaseline {
  [endpoint: string]: {
    avgResponseTime: number;
    maxResponseTime: number;
    samples: number;
  };
}

// ============================================
// API TESTING FUNCTIONS
// ============================================

/**
 * Discover APIs by browsing a URL and analyzing network traffic
 */
async function discoverApis(
  browser: LLMBrowserClient,
  url: string
): Promise<{ apis: Array<{ url: string; method: string }>; duration: number }> {
  const startTime = Date.now();

  console.log(`\nDiscovering APIs from: ${url}`);
  console.log('-'.repeat(60));

  const result = await browser.browse(url, {
    includeNetwork: true,
    includeInsights: true,
    scrollToLoad: true, // Trigger lazy-loaded content
  });

  const apis = result.discoveredApis || [];
  const duration = Date.now() - startTime;

  console.log(`Found ${apis.length} API endpoints in ${duration}ms`);

  return {
    apis: apis.map((api: { url: string; method?: string }) => ({
      url: api.url,
      method: api.method || 'GET',
    })),
    duration,
  };
}

/**
 * Test a single API endpoint
 */
async function testEndpoint(
  browser: LLMBrowserClient,
  endpoint: { url: string; method: string },
  baseline?: PerformanceBaseline
): Promise<ApiTestResult> {
  const startTime = Date.now();

  try {
    const response = await browser.executeApiCall({
      url: endpoint.url,
      method: endpoint.method,
    });

    const responseTime = Date.now() - startTime;
    const hasData = response.data !== undefined && response.data !== null;

    // Determine data type
    let dataType: 'array' | 'object' | 'string' | undefined;
    if (hasData) {
      if (Array.isArray(response.data)) {
        dataType = 'array';
      } else if (typeof response.data === 'object') {
        dataType = 'object';
      } else {
        dataType = 'string';
      }
    }

    // Check if response time exceeds baseline
    const baselineData = baseline?.[endpoint.url];
    const exceedsBaseline = baselineData
      ? responseTime > baselineData.maxResponseTime * 1.5
      : false;

    // Determine pass/fail
    const passed =
      response.status >= 200 &&
      response.status < 300 &&
      hasData &&
      !exceedsBaseline;

    return {
      endpoint: endpoint.url,
      method: endpoint.method,
      passed,
      statusCode: response.status,
      responseTime,
      hasData,
      dataType,
      error: exceedsBaseline
        ? `Response time ${responseTime}ms exceeds baseline ${baselineData?.maxResponseTime}ms`
        : undefined,
    };
  } catch (error) {
    return {
      endpoint: endpoint.url,
      method: endpoint.method,
      passed: false,
      statusCode: 0,
      responseTime: Date.now() - startTime,
      hasData: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run full API test suite for a domain
 */
async function runApiTestSuite(
  browser: LLMBrowserClient,
  url: string,
  options: {
    baseline?: PerformanceBaseline;
    maxEndpoints?: number;
    filterPattern?: RegExp;
  } = {}
): Promise<ApiTestSuiteResult> {
  const domain = new URL(url).hostname;
  const startTime = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`E2E API Test Suite: ${domain}`);
  console.log('='.repeat(60));

  // Step 1: Discover APIs
  const discovery = await discoverApis(browser, url);

  // Filter and limit endpoints
  let apis = discovery.apis;
  if (options.filterPattern) {
    apis = apis.filter((api) => options.filterPattern!.test(api.url));
    console.log(`Filtered to ${apis.length} endpoints matching pattern`);
  }
  if (options.maxEndpoints && apis.length > options.maxEndpoints) {
    apis = apis.slice(0, options.maxEndpoints);
    console.log(`Limited to ${options.maxEndpoints} endpoints`);
  }

  // Step 2: Test each endpoint
  console.log(`\nTesting ${apis.length} endpoints...`);
  console.log('-'.repeat(60));

  const results: ApiTestResult[] = [];

  for (const api of apis) {
    const result = await testEndpoint(browser, api, options.baseline);
    results.push(result);

    // Log progress
    const statusIcon = result.passed ? 'PASS' : 'FAIL';
    console.log(
      `[${statusIcon}] ${result.method} ${result.endpoint} ` +
        `(${result.statusCode}, ${result.responseTime}ms)`
    );

    if (!result.passed && result.error) {
      console.log(`       Error: ${result.error}`);
    }
  }

  // Calculate summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = Date.now() - startTime;

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary:');
  console.log('='.repeat(60));
  console.log(`Total Endpoints: ${results.length}`);
  console.log(`Passed:          ${passed}`);
  console.log(`Failed:          ${failed}`);
  console.log(`Pass Rate:       ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log(`Discovery Time:  ${discovery.duration}ms`);
  console.log(`Total Duration:  ${totalDuration}ms`);

  if (failed > 0) {
    console.log('\nFailed Endpoints:');
    console.log('-'.repeat(60));
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ${r.method} ${r.endpoint}`);
        if (r.error) {
          console.log(`    Reason: ${r.error}`);
        } else if (r.statusCode !== 200) {
          console.log(`    Reason: HTTP ${r.statusCode}`);
        } else if (!r.hasData) {
          console.log(`    Reason: No data returned`);
        }
      });
  }

  return {
    domain,
    totalEndpoints: results.length,
    passed,
    failed,
    totalDuration,
    results,
    discoveryTime: discovery.duration,
  };
}

/**
 * Generate JUnit XML report for CI/CD integration
 */
function generateJUnitReport(suiteResult: ApiTestSuiteResult): string {
  const testCases: TestCase[] = suiteResult.results.map((result) => {
    const testCase: TestCase = {
      name: `${result.method} ${new URL(result.endpoint).pathname}`,
      className: suiteResult.domain,
      time: result.responseTime / 1000,
    };

    if (!result.passed) {
      testCase.failure = {
        message: result.error || `HTTP ${result.statusCode}`,
        type: result.statusCode === 0 ? 'NetworkError' : 'AssertionError',
      };
    }

    return testCase;
  });

  const suite: TestSuite = {
    name: `API Tests: ${suiteResult.domain}`,
    tests: suiteResult.results.length,
    failures: suiteResult.failed,
    errors: 0,
    skipped: 0,
    time: suiteResult.totalDuration / 1000,
    timestamp: new Date().toISOString(),
    testCases,
  };

  return generateTestReport(suite, 'junit');
}

/**
 * Compare API test results between two runs
 */
function compareTestRuns(
  baseline: ApiTestSuiteResult,
  current: ApiTestSuiteResult
): void {
  console.log('\n' + '='.repeat(60));
  console.log('Test Run Comparison:');
  console.log('='.repeat(60));

  console.log('\n| Metric          | Baseline | Current | Change |');
  console.log('|-----------------|----------|---------|--------|');

  // Pass rate comparison
  const baselineRate = (baseline.passed / baseline.totalEndpoints) * 100;
  const currentRate = (current.passed / current.totalEndpoints) * 100;
  const rateChange = currentRate - baselineRate;
  const rateIcon = rateChange >= 0 ? '+' : '';

  console.log(
    `| Pass Rate       | ${baselineRate.toFixed(1)}%    | ${currentRate.toFixed(1)}%   | ${rateIcon}${rateChange.toFixed(1)}% |`
  );

  // Duration comparison
  const durationChange =
    ((current.totalDuration - baseline.totalDuration) / baseline.totalDuration) *
    100;
  const durationIcon = durationChange <= 0 ? '' : '+';

  console.log(
    `| Total Duration  | ${baseline.totalDuration}ms   | ${current.totalDuration}ms  | ${durationIcon}${durationChange.toFixed(1)}% |`
  );

  // Find regressions
  const regressions = current.results.filter((curr) => {
    const baseResult = baseline.results.find((b) => b.endpoint === curr.endpoint);
    return baseResult && baseResult.passed && !curr.passed;
  });

  if (regressions.length > 0) {
    console.log('\nRegressions Detected:');
    console.log('-'.repeat(60));
    regressions.forEach((r) => {
      console.log(`  ${r.method} ${r.endpoint}`);
      console.log(`    Error: ${r.error || `HTTP ${r.statusCode}`}`);
    });
  }

  // Find improvements
  const improvements = current.results.filter((curr) => {
    const baseResult = baseline.results.find((b) => b.endpoint === curr.endpoint);
    return baseResult && !baseResult.passed && curr.passed;
  });

  if (improvements.length > 0) {
    console.log('\nImprovements:');
    console.log('-'.repeat(60));
    improvements.forEach((r) => {
      console.log(`  ${r.method} ${r.endpoint} now passing`);
    });
  }
}

/**
 * Build performance baseline from test results
 */
function buildBaseline(result: ApiTestSuiteResult): PerformanceBaseline {
  const baseline: PerformanceBaseline = {};

  for (const r of result.results) {
    if (r.passed) {
      baseline[r.endpoint] = {
        avgResponseTime: r.responseTime,
        maxResponseTime: r.responseTime * 1.5, // 50% buffer
        samples: 1,
      };
    }
  }

  return baseline;
}

// ============================================
// EXAMPLE USAGE
// ============================================

async function main() {
  console.log('E2E API Testing Example (QA-001)');
  console.log('Demonstrates automatic API discovery and testing\n');

  // Initialize browser
  const browser = await createLLMBrowser();

  try {
    // Example 1: Basic API test suite
    console.log('\n[Example 1] Basic API Test Suite\n');
    const suiteResult = await runApiTestSuite(
      browser,
      'https://jsonplaceholder.typicode.com',
      { maxEndpoints: 10 }
    );

    // Example 2: Generate JUnit report
    console.log('\n[Example 2] JUnit Report Generation\n');
    const junitXml = generateJUnitReport(suiteResult);
    console.log('JUnit XML report generated:');
    console.log('-'.repeat(60));
    console.log(junitXml.substring(0, 500) + '...\n');

    // Example 3: Build performance baseline
    console.log('\n[Example 3] Performance Baseline\n');
    const baseline = buildBaseline(suiteResult);
    console.log('Performance baseline built:');
    console.log('-'.repeat(60));
    Object.entries(baseline)
      .slice(0, 5)
      .forEach(([endpoint, data]) => {
        console.log(
          `  ${new URL(endpoint).pathname}: ` +
            `avg=${data.avgResponseTime}ms, max=${data.maxResponseTime.toFixed(0)}ms`
        );
      });

    // Example 4: Regression testing (compare two runs)
    console.log('\n[Example 4] Regression Testing\n');
    console.log('Running second test pass for comparison...');
    const secondRun = await runApiTestSuite(
      browser,
      'https://jsonplaceholder.typicode.com',
      { maxEndpoints: 10, baseline }
    );
    compareTestRuns(suiteResult, secondRun);

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('Key Takeaways:');
    console.log('='.repeat(60));
    console.log('1. API Discovery: Automatically finds endpoints from browsing');
    console.log('2. Endpoint Testing: Validates response status and data');
    console.log('3. Performance Baselines: Detects response time regressions');
    console.log('4. JUnit Reports: Integrates with CI/CD pipelines');
    console.log('5. Regression Detection: Compares runs to find problems');

    console.log('\nIntegration Tips:');
    console.log('-'.repeat(60));
    console.log('1. Run discovery once, cache endpoints for repeated tests');
    console.log('2. Store baselines in version control');
    console.log('3. Use JUnit output with GitHub Actions, Jenkins, etc.');
    console.log('4. Filter endpoints with regex for focused testing');
    console.log('5. Combine with content verification for full coverage');
  } finally {
    await browser.cleanup();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  discoverApis,
  testEndpoint,
  runApiTestSuite,
  generateJUnitReport,
  compareTestRuns,
  buildBaseline,
  type ApiTestResult,
  type ApiTestSuiteResult,
  type PerformanceBaseline,
};
