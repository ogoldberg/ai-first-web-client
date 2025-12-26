/**
 * Multi-Site Regression Testing Example (QA-003)
 *
 * Demonstrates using Unbrowser for regression testing across multiple similar sites:
 * - Define a pattern once, test across many sites
 * - Detect regressions when sites change
 * - Compare results between sites
 * - Generate regression reports for CI/CD
 *
 * Use cases:
 * - Test the same product schema across multiple e-commerce sites
 * - Verify API patterns work across related domains
 * - Monitor for breaking changes in similar sites
 * - Cross-site content validation
 */

import { createLLMBrowser, type LLMBrowserClient } from '../src/sdk.js';
import { generateTestReport, type TestCase, type TestSuite } from '../src/testing.js';
import type { VerificationCheck, VerificationResult } from '../src/types/verification.js';

// ============================================
// TYPES
// ============================================

/**
 * A regression test pattern to apply across sites
 */
interface RegressionPattern {
  name: string;
  description: string;
  checks: VerificationCheck[];
  minConfidence?: number;
}

/**
 * A site to test with the pattern
 */
interface TestSite {
  name: string;
  url: string;
  expectedData?: Record<string, unknown>;
}

/**
 * Configuration for a multi-site regression test
 */
interface MultiSiteTestConfig {
  patternName: string;
  pattern: RegressionPattern;
  sites: TestSite[];
  options?: {
    concurrency?: number;
    timeout?: number;
    stopOnFirstFailure?: boolean;
  };
}

/**
 * Result of testing one site
 */
interface SiteTestResult {
  site: TestSite;
  passed: boolean;
  verification: VerificationResult;
  duration: number;
  error?: string;
  extractedData?: Record<string, unknown>;
}

/**
 * Result of running regression tests across all sites
 */
interface MultiSiteTestResult {
  patternName: string;
  totalSites: number;
  passed: number;
  failed: number;
  passRate: number;
  duration: number;
  results: SiteTestResult[];
  regressions: SiteTestResult[];
  timestamp: number;
}

/**
 * Baseline data for regression comparison
 */
interface RegressionBaseline {
  patternName: string;
  createdAt: number;
  sites: {
    [siteUrl: string]: {
      passed: boolean;
      confidence: number;
      extractedData?: Record<string, unknown>;
    };
  };
}

// ============================================
// PATTERN BUILDERS
// ============================================

/**
 * Create a product listing pattern for e-commerce sites
 */
function createProductListingPattern(): RegressionPattern {
  return {
    name: 'Product Listing',
    description: 'Verify product listings have consistent structure',
    minConfidence: 0.8,
    checks: [
      {
        type: 'content',
        assertion: {
          minLength: 500, // Page should have substantial content
        },
        severity: 'error',
        retryable: true,
      },
      {
        type: 'content',
        assertion: {
          fieldMatches: {
            // Match common price patterns across currencies
            price: /[\$\u20AC\u00A3\u00A5][\d,]+(\.\d{2})?/,
          },
        },
        severity: 'error',
        retryable: false,
      },
      {
        type: 'action',
        assertion: {
          statusCode: 200,
        },
        severity: 'critical',
        retryable: true,
      },
      {
        type: 'content',
        assertion: {
          // No error page indicators
          excludesText: '404',
        },
        severity: 'error',
        retryable: true,
      },
    ],
  };
}

/**
 * Create an API response pattern for REST APIs
 */
function createApiResponsePattern(): RegressionPattern {
  return {
    name: 'API Response Structure',
    description: 'Verify API responses follow expected structure',
    minConfidence: 0.85,
    checks: [
      {
        type: 'action',
        assertion: {
          statusCode: 200,
        },
        severity: 'critical',
        retryable: true,
      },
      {
        type: 'content',
        assertion: {
          minLength: 10, // Should have some content
        },
        severity: 'error',
        retryable: false,
      },
    ],
  };
}

/**
 * Create a content article pattern for news/blog sites
 */
function createArticlePattern(): RegressionPattern {
  return {
    name: 'Content Article',
    description: 'Verify article pages have expected structure',
    minConfidence: 0.75,
    checks: [
      {
        type: 'content',
        assertion: {
          minLength: 1000, // Articles should have substantial content
        },
        severity: 'error',
        retryable: true,
      },
      {
        type: 'action',
        assertion: {
          statusCode: 200,
        },
        severity: 'critical',
        retryable: true,
      },
      {
        type: 'content',
        assertion: {
          excludesText: 'Page not found',
        },
        severity: 'error',
        retryable: true,
      },
    ],
  };
}

// ============================================
// MULTI-SITE TEST RUNNER
// ============================================

/**
 * Test a single site against a pattern
 */
async function testSite(
  browser: LLMBrowserClient,
  site: TestSite,
  pattern: RegressionPattern
): Promise<SiteTestResult> {
  const startTime = Date.now();

  try {
    const result = await browser.browse(site.url, {
      verify: {
        enabled: true,
        mode: 'thorough',
        checks: pattern.checks,
      },
    });

    const verification = result.verification;
    const duration = Date.now() - startTime;

    // Check against minimum confidence
    let passed = verification.passed;
    if (passed && pattern.minConfidence !== undefined) {
      if (verification.confidence < pattern.minConfidence) {
        passed = false;
      }
    }

    return {
      site,
      passed,
      verification,
      duration,
      extractedData: {
        title: result.content?.title,
        contentLength: result.content?.markdown?.length || 0,
      },
    };
  } catch (error) {
    return {
      site,
      passed: false,
      verification: {
        passed: false,
        checks: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        confidence: 0,
      },
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run multi-site regression tests
 */
async function runMultiSiteTests(
  browser: LLMBrowserClient,
  config: MultiSiteTestConfig
): Promise<MultiSiteTestResult> {
  const startTime = Date.now();
  const results: SiteTestResult[] = [];
  const concurrency = config.options?.concurrency ?? 1;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Multi-Site Regression: ${config.patternName}`);
  console.log(`Pattern: ${config.pattern.description}`);
  console.log(`Sites: ${config.sites.length}`);
  console.log('='.repeat(60));

  // Run tests with specified concurrency
  if (concurrency === 1) {
    // Sequential execution
    for (const site of config.sites) {
      console.log(`\nTesting: ${site.name}`);
      console.log(`  URL: ${site.url}`);

      const result = await testSite(browser, site, config.pattern);
      results.push(result);

      const icon = result.passed ? 'PASS' : 'FAIL';
      console.log(`  [${icon}] ${result.duration}ms, confidence: ${(result.verification.confidence * 100).toFixed(1)}%`);

      if (!result.passed) {
        const failures = result.verification.checks.filter(c => !c.passed);
        for (const failure of failures) {
          console.log(`    - ${failure.message}`);
        }
        if (result.error) {
          console.log(`    - Error: ${result.error}`);
        }

        if (config.options?.stopOnFirstFailure) {
          console.log('\nStopping on first failure.');
          break;
        }
      }
    }
  } else {
    // Parallel execution with concurrency limit
    const batches = [];
    for (let i = 0; i < config.sites.length; i += concurrency) {
      batches.push(config.sites.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(site => testSite(browser, site, config.pattern))
      );

      for (const result of batchResults) {
        results.push(result);
        const icon = result.passed ? 'PASS' : 'FAIL';
        console.log(`[${icon}] ${result.site.name}: ${result.duration}ms`);
      }
    }
  }

  // Calculate summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const regressions = results.filter(r => !r.passed);
  const duration = Date.now() - startTime;
  const passRate = results.length > 0 ? passed / results.length : 0;

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  console.log(`Total Sites:  ${results.length}`);
  console.log(`Passed:       ${passed}`);
  console.log(`Failed:       ${failed}`);
  console.log(`Pass Rate:    ${(passRate * 100).toFixed(1)}%`);
  console.log(`Duration:     ${duration}ms`);

  if (regressions.length > 0) {
    console.log('\nRegressions:');
    console.log('-'.repeat(60));
    for (const r of regressions) {
      console.log(`  ${r.site.name} (${r.site.url})`);
      if (r.error) {
        console.log(`    Error: ${r.error}`);
      } else {
        const failures = r.verification.checks.filter(c => !c.passed);
        for (const f of failures) {
          console.log(`    - ${f.message}`);
        }
      }
    }
  }

  return {
    patternName: config.patternName,
    totalSites: results.length,
    passed,
    failed,
    passRate,
    duration,
    results,
    regressions,
    timestamp: Date.now(),
  };
}

// ============================================
// BASELINE COMPARISON
// ============================================

/**
 * Create a baseline from test results
 */
function createBaseline(result: MultiSiteTestResult): RegressionBaseline {
  const sites: RegressionBaseline['sites'] = {};

  for (const r of result.results) {
    sites[r.site.url] = {
      passed: r.passed,
      confidence: r.verification.confidence,
      extractedData: r.extractedData,
    };
  }

  return {
    patternName: result.patternName,
    createdAt: Date.now(),
    sites,
  };
}

/**
 * Compare current results to a baseline
 */
function compareToBaseline(
  current: MultiSiteTestResult,
  baseline: RegressionBaseline
): {
  newRegressions: SiteTestResult[];
  fixed: SiteTestResult[];
  unchanged: SiteTestResult[];
  newSites: SiteTestResult[];
} {
  const newRegressions: SiteTestResult[] = [];
  const fixed: SiteTestResult[] = [];
  const unchanged: SiteTestResult[] = [];
  const newSites: SiteTestResult[] = [];

  for (const result of current.results) {
    const baselineData = baseline.sites[result.site.url];

    if (!baselineData) {
      // New site not in baseline
      newSites.push(result);
    } else if (baselineData.passed && !result.passed) {
      // Was passing, now failing = regression
      newRegressions.push(result);
    } else if (!baselineData.passed && result.passed) {
      // Was failing, now passing = fixed
      fixed.push(result);
    } else {
      // Same status
      unchanged.push(result);
    }
  }

  return { newRegressions, fixed, unchanged, newSites };
}

/**
 * Print comparison report
 */
function printComparisonReport(
  comparison: ReturnType<typeof compareToBaseline>
): void {
  console.log('\n' + '='.repeat(60));
  console.log('Baseline Comparison:');
  console.log('='.repeat(60));

  if (comparison.newRegressions.length > 0) {
    console.log(`\nNEW REGRESSIONS (${comparison.newRegressions.length}):`);
    for (const r of comparison.newRegressions) {
      console.log(`  ${r.site.name}: Was PASSING, now FAILING`);
    }
  }

  if (comparison.fixed.length > 0) {
    console.log(`\nFIXED (${comparison.fixed.length}):`);
    for (const r of comparison.fixed) {
      console.log(`  ${r.site.name}: Was FAILING, now PASSING`);
    }
  }

  if (comparison.newSites.length > 0) {
    console.log(`\nNEW SITES (${comparison.newSites.length}):`);
    for (const r of comparison.newSites) {
      const icon = r.passed ? 'PASS' : 'FAIL';
      console.log(`  ${r.site.name}: [${icon}]`);
    }
  }

  console.log(`\nUNCHANGED: ${comparison.unchanged.length} sites`);
}

// ============================================
// REPORT GENERATION
// ============================================

/**
 * Generate JUnit XML report for CI/CD
 */
function generateJUnitReport(result: MultiSiteTestResult): string {
  const testCases: TestCase[] = result.results.map(r => {
    const testCase: TestCase = {
      name: r.site.name,
      className: result.patternName.replace(/\s+/g, '_'),
      time: r.duration / 1000,
    };

    if (!r.passed) {
      const failures = r.verification.checks.filter(c => !c.passed);
      const messages = failures.map(f => f.message).join('; ');
      testCase.failure = {
        message: r.error || messages || 'Verification failed',
        type: r.error ? 'Error' : 'AssertionError',
      };
    }

    return testCase;
  });

  const suite: TestSuite = {
    name: `Multi-Site Regression: ${result.patternName}`,
    tests: result.totalSites,
    failures: result.failed,
    errors: 0,
    skipped: 0,
    time: result.duration / 1000,
    timestamp: new Date(result.timestamp).toISOString(),
    testCases,
  };

  return generateTestReport(suite, 'junit');
}

// ============================================
// EXAMPLE SITE CONFIGURATIONS
// ============================================

/**
 * Example: Test product patterns across mock API endpoints
 */
function getExampleApiSites(): TestSite[] {
  return [
    {
      name: 'JSONPlaceholder Posts',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
    },
    {
      name: 'JSONPlaceholder Users',
      url: 'https://jsonplaceholder.typicode.com/users/1',
    },
    {
      name: 'JSONPlaceholder Comments',
      url: 'https://jsonplaceholder.typicode.com/comments/1',
    },
  ];
}

// ============================================
// MAIN EXAMPLE
// ============================================

async function main() {
  console.log('Multi-Site Regression Testing Example (QA-003)');
  console.log('Demonstrates testing patterns across multiple similar sites\n');

  const browser = await createLLMBrowser();

  try {
    // Example 1: Test API pattern across multiple endpoints
    console.log('\n[Example 1] API Regression Testing\n');
    const apiResult = await runMultiSiteTests(browser, {
      patternName: 'API Response Structure',
      pattern: createApiResponsePattern(),
      sites: getExampleApiSites(),
      options: { concurrency: 1 },
    });

    // Example 2: Create and use a baseline
    console.log('\n\n[Example 2] Baseline Creation\n');
    const baseline = createBaseline(apiResult);
    console.log('Baseline created with:');
    console.log(`  Pattern: ${baseline.patternName}`);
    console.log(`  Sites: ${Object.keys(baseline.sites).length}`);
    console.log(`  Created: ${new Date(baseline.createdAt).toISOString()}`);

    // Example 3: Run again and compare to baseline
    console.log('\n\n[Example 3] Baseline Comparison\n');
    console.log('Running tests again to compare...');
    const secondRun = await runMultiSiteTests(browser, {
      patternName: 'API Response Structure',
      pattern: createApiResponsePattern(),
      sites: getExampleApiSites(),
    });

    const comparison = compareToBaseline(secondRun, baseline);
    printComparisonReport(comparison);

    // Example 4: Generate JUnit report
    console.log('\n\n[Example 4] JUnit Report Generation\n');
    const junitXml = generateJUnitReport(apiResult);
    console.log('JUnit XML report generated:');
    console.log('-'.repeat(60));
    console.log(junitXml.substring(0, 600) + '...\n');

    // Example 5: Pattern library overview
    console.log('\n[Example 5] Available Pattern Builders\n');
    console.log('Pattern builders for common use cases:');
    console.log('  createProductListingPattern() - E-commerce product pages');
    console.log('  createApiResponsePattern()    - REST API responses');
    console.log('  createArticlePattern()        - News/blog articles');
    console.log('\nCustom patterns can be created with:');
    console.log('  { name, description, minConfidence, checks: [...] }');

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('Key Takeaways:');
    console.log('='.repeat(60));
    console.log('1. Pattern Reuse: Define once, test across many sites');
    console.log('2. Baselines: Track expected behavior and detect regressions');
    console.log('3. Comparison: Identify new regressions vs. fixed issues');
    console.log('4. CI/CD Integration: JUnit reports for build pipelines');
    console.log('5. Concurrency: Parallel testing for faster execution');

    console.log('\nUsage Tips:');
    console.log('-'.repeat(60));
    console.log('1. Group similar sites together (same industry/pattern)');
    console.log('2. Store baselines in version control');
    console.log('3. Run regression tests in CI on every deploy');
    console.log('4. Set appropriate minConfidence for each pattern');
    console.log('5. Use sequential testing for debugging, parallel for speed');
  } finally {
    await browser.cleanup();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  // Pattern builders
  createProductListingPattern,
  createApiResponsePattern,
  createArticlePattern,
  // Test runner
  runMultiSiteTests,
  testSite,
  // Baseline management
  createBaseline,
  compareToBaseline,
  printComparisonReport,
  // Reporting
  generateJUnitReport,
  // Types
  type RegressionPattern,
  type TestSite,
  type MultiSiteTestConfig,
  type SiteTestResult,
  type MultiSiteTestResult,
  type RegressionBaseline,
};
