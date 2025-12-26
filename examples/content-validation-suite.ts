/**
 * Content Validation Test Suite Example (QA-002)
 *
 * Demonstrates using Unbrowser's verification engine for content validation:
 * - Field existence and pattern matching
 * - Content constraints (length, text presence)
 * - Custom validators for complex logic
 * - Integration with Vitest/Jest test frameworks
 * - Confidence-based assertions
 *
 * This example shows how to build a content validation test suite
 * that validates extracted data meets quality requirements.
 */

import { createLLMBrowser, type LLMBrowserClient } from '../src/sdk.js';
import type { VerificationCheck, VerificationResult } from '../src/types/verification.js';

// ============================================
// TYPES
// ============================================

interface ContentTest {
  name: string;
  url: string;
  checks: VerificationCheck[];
  minConfidence?: number;
}

interface ContentTestResult {
  name: string;
  url: string;
  passed: boolean;
  verification: VerificationResult;
  duration: number;
  error?: string;
}

interface TestSuiteResult {
  name: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: ContentTestResult[];
}

// ============================================
// VERIFICATION CHECK BUILDERS
// ============================================

/**
 * Create a check for required fields
 */
function requireFields(...fields: string[]): VerificationCheck {
  return {
    type: 'content',
    assertion: {
      fieldExists: fields,
    },
    severity: 'error',
    retryable: true,
  };
}

/**
 * Create a check for non-empty fields
 */
function requireNonEmpty(...fields: string[]): VerificationCheck {
  return {
    type: 'content',
    assertion: {
      fieldNotEmpty: fields,
    },
    severity: 'error',
    retryable: true,
  };
}

/**
 * Create a check for field patterns
 */
function matchPatterns(patterns: Record<string, RegExp>): VerificationCheck {
  return {
    type: 'content',
    assertion: {
      fieldMatches: patterns,
    },
    severity: 'error',
    retryable: false,
  };
}

/**
 * Create a check for minimum content length
 */
function minLength(length: number, severity: 'warning' | 'error' = 'error'): VerificationCheck {
  return {
    type: 'content',
    assertion: {
      minLength: length,
    },
    severity,
    retryable: true,
  };
}

/**
 * Create a check for maximum content length
 */
function maxLength(length: number): VerificationCheck {
  return {
    type: 'content',
    assertion: {
      maxLength: length,
    },
    severity: 'warning',
    retryable: false,
  };
}

/**
 * Create a check for required text
 */
function containsText(text: string): VerificationCheck {
  return {
    type: 'content',
    assertion: {
      containsText: text,
    },
    severity: 'error',
    retryable: true,
  };
}

/**
 * Create a check for forbidden text (error indicators)
 */
function excludesText(text: string): VerificationCheck {
  return {
    type: 'content',
    assertion: {
      excludesText: text,
    },
    severity: 'error',
    retryable: true,
  };
}

/**
 * Create a check for HTTP status code
 */
function statusCode(code: number): VerificationCheck {
  return {
    type: 'action',
    assertion: {
      statusCode: code,
    },
    severity: 'critical',
    retryable: true,
  };
}

/**
 * Create a custom validation check
 */
function customCheck(
  validator: (result: any) => Promise<boolean>,
  severity: 'warning' | 'error' | 'critical' = 'error'
): VerificationCheck {
  return {
    type: 'custom',
    assertion: {
      customValidator: validator,
    },
    severity,
    retryable: false,
  };
}

// ============================================
// TEST SUITE RUNNER
// ============================================

/**
 * Run a single content validation test
 */
async function runContentTest(
  browser: LLMBrowserClient,
  test: ContentTest
): Promise<ContentTestResult> {
  const startTime = Date.now();

  try {
    const result = await browser.browse(test.url, {
      verify: {
        enabled: true,
        mode: 'thorough',
        checks: test.checks,
      },
    });

    const verification = result.verification;
    const duration = Date.now() - startTime;

    // Check confidence threshold if specified
    let passed = verification.passed;
    if (passed && test.minConfidence !== undefined) {
      if (verification.confidence < test.minConfidence) {
        passed = false;
      }
    }

    return {
      name: test.name,
      url: test.url,
      passed,
      verification,
      duration,
    };
  } catch (error) {
    return {
      name: test.name,
      url: test.url,
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
 * Run a full content validation test suite
 */
async function runContentTestSuite(
  browser: LLMBrowserClient,
  suiteName: string,
  tests: ContentTest[]
): Promise<TestSuiteResult> {
  const startTime = Date.now();
  const results: ContentTestResult[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Content Validation Suite: ${suiteName}`);
  console.log('='.repeat(60));

  for (const test of tests) {
    console.log(`\nRunning: ${test.name}`);
    console.log(`  URL: ${test.url}`);

    const result = await runContentTest(browser, test);
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
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const duration = Date.now() - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('Suite Summary:');
  console.log('='.repeat(60));
  console.log(`Total:    ${results.length}`);
  console.log(`Passed:   ${passed}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Duration: ${duration}ms`);

  return {
    name: suiteName,
    total: results.length,
    passed,
    failed,
    skipped: 0,
    duration,
    results,
  };
}

// ============================================
// EXAMPLE TEST SUITES
// ============================================

/**
 * Product page validation tests
 */
function createProductPageTests(urls: string[]): ContentTest[] {
  return urls.map((url, i) => ({
    name: `Product Page ${i + 1}`,
    url,
    minConfidence: 0.8,
    checks: [
      // Required fields
      requireFields('title', 'price'),
      requireNonEmpty('title', 'description'),

      // Pattern validation
      matchPatterns({
        price: /[\$\u20AC\u00A3][\d,]+(\.\d{2})?/, // Currency with optional cents
        title: /.{5,}/, // At least 5 characters
      }),

      // Content constraints
      minLength(200, 'warning'),

      // No error indicators
      excludesText('out of stock'),
      excludesText('page not found'),

      // HTTP success
      statusCode(200),
    ],
  }));
}

/**
 * Article page validation tests
 */
function createArticlePageTests(urls: string[]): ContentTest[] {
  return urls.map((url, i) => ({
    name: `Article ${i + 1}`,
    url,
    minConfidence: 0.85,
    checks: [
      // Required fields
      requireFields('title'),
      requireNonEmpty('title'),

      // Content constraints
      minLength(500), // Articles should have substantial content

      // Pattern validation
      matchPatterns({
        title: /.{10,}/, // At least 10 characters
      }),

      // Custom: Check for readable content
      customCheck(async (result) => {
        const markdown = result.content?.markdown || '';
        // Check for paragraph-like content (multiple sentences)
        const sentences = markdown.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
        return sentences.length >= 3;
      }, 'warning'),
    ],
  }));
}

/**
 * API documentation page validation tests
 */
function createApiDocsTests(urls: string[]): ContentTest[] {
  return urls.map((url, i) => ({
    name: `API Docs ${i + 1}`,
    url,
    checks: [
      // Should have code examples
      containsText('```'),

      // Content constraints
      minLength(300),

      // No error pages
      excludesText('404'),
      excludesText('not found'),

      // Custom: Check for API-like content
      customCheck(async (result) => {
        const markdown = result.content?.markdown || '';
        const hasEndpoint = /\/(api|v\d+|graphql)/i.test(markdown);
        const hasMethod = /(GET|POST|PUT|DELETE|PATCH)/i.test(markdown);
        return hasEndpoint || hasMethod;
      }),
    ],
  }));
}

// ============================================
// VITEST/JEST INTEGRATION EXAMPLE
// ============================================

/**
 * Example of how to integrate with Vitest/Jest
 *
 * Usage in a test file:
 * ```typescript
 * import { describe, it, expect, beforeAll, afterAll } from 'vitest';
 * import { createLLMBrowser } from 'llm-browser/sdk';
 * import { createProductPageTests, runContentTest } from './content-validation-suite';
 *
 * describe('Product Page Validation', () => {
 *   let browser;
 *
 *   beforeAll(async () => {
 *     browser = await createLLMBrowser();
 *   });
 *
 *   afterAll(async () => {
 *     await browser.cleanup();
 *   });
 *
 *   const tests = createProductPageTests([
 *     'https://shop.example.com/product/1',
 *     'https://shop.example.com/product/2',
 *   ]);
 *
 *   tests.forEach(test => {
 *     it(test.name, async () => {
 *       const result = await runContentTest(browser, test);
 *       expect(result.passed).toBe(true);
 *       expect(result.verification.confidence).toBeGreaterThan(0.8);
 *     });
 *   });
 * });
 * ```
 */

/**
 * Generate Vitest/Jest compatible test code
 */
function generateTestCode(suiteName: string, tests: ContentTest[]): string {
  const testCode = `
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLLMBrowser, type LLMBrowserClient } from 'llm-browser/sdk';

describe('${suiteName}', () => {
  let browser: LLMBrowserClient;

  beforeAll(async () => {
    browser = await createLLMBrowser();
  });

  afterAll(async () => {
    await browser.cleanup();
  });

${tests.map(test => `
  it('${test.name}', async () => {
    const result = await browser.browse('${test.url}', {
      verify: {
        enabled: true,
        mode: 'thorough',
        checks: ${JSON.stringify(test.checks, null, 6).replace(/"customValidator":\s*"[^"]*"/g, '"customValidator": async (result) => true')},
      },
    });

    expect(result.verification.passed).toBe(true);
    ${test.minConfidence ? `expect(result.verification.confidence).toBeGreaterThan(${test.minConfidence});` : ''}
  });
`).join('')}
});
`;

  return testCode;
}

// ============================================
// MAIN EXAMPLE
// ============================================

async function main() {
  console.log('Content Validation Test Suite Example (QA-002)');
  console.log('Demonstrates content validation with verification checks\n');

  const browser = await createLLMBrowser();

  try {
    // Example 1: Product page validation
    console.log('\n[Example 1] Product Page Validation\n');
    const productTests = createProductPageTests([
      'https://jsonplaceholder.typicode.com/posts/1', // Mock API endpoint for testing
    ]);
    await runContentTestSuite(browser, 'Product Pages', productTests);

    // Example 2: Using check builders
    console.log('\n\n[Example 2] Check Builder Pattern\n');
    console.log('Available check builders:');
    console.log('  requireFields("title", "price")     - Field existence');
    console.log('  requireNonEmpty("title")            - Non-empty fields');
    console.log('  matchPatterns({ price: /\\$\\d+/ }) - Pattern matching');
    console.log('  minLength(200)                      - Minimum length');
    console.log('  maxLength(50000)                    - Maximum length');
    console.log('  containsText("Add to Cart")         - Required text');
    console.log('  excludesText("Error")               - Forbidden text');
    console.log('  statusCode(200)                     - HTTP status');
    console.log('  customCheck(validator)              - Custom logic');

    // Example 3: Generate Vitest code
    console.log('\n\n[Example 3] Vitest Integration\n');
    console.log('Generated test code for Vitest:');
    console.log('-'.repeat(60));
    const testCode = generateTestCode('Product Validation', productTests.slice(0, 1));
    console.log(testCode.substring(0, 800) + '...\n');

    // Example 4: Confidence thresholds
    console.log('\n[Example 4] Confidence Thresholds\n');
    console.log('Confidence sources by tier:');
    console.log('  Intelligence: 0.70 baseline');
    console.log('  Lightweight:  0.80 baseline');
    console.log('  Playwright:   0.95 baseline');
    console.log('\nRecommended thresholds:');
    console.log('  Smoke tests:    0.70+ (basic sanity)');
    console.log('  Standard tests: 0.80+ (normal quality)');
    console.log('  Critical tests: 0.90+ (high assurance)');

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('Key Takeaways:');
    console.log('='.repeat(60));
    console.log('1. Check Builders: Composable verification check factories');
    console.log('2. Test Suites: Group related tests with shared configuration');
    console.log('3. Confidence: Use thresholds based on test criticality');
    console.log('4. Custom Validators: Complex logic for domain-specific checks');
    console.log('5. Framework Integration: Generate Vitest/Jest compatible tests');

    console.log('\nUsage Tips:');
    console.log('-'.repeat(60));
    console.log('1. Start with basic checks, add complexity as needed');
    console.log('2. Use severity levels: warning < error < critical');
    console.log('3. Set minConfidence based on data criticality');
    console.log('4. Combine multiple checks for comprehensive validation');
    console.log('5. Use excludesText for error detection patterns');
  } finally {
    await browser.cleanup();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  // Check builders
  requireFields,
  requireNonEmpty,
  matchPatterns,
  minLength,
  maxLength,
  containsText,
  excludesText,
  statusCode,
  customCheck,
  // Test runners
  runContentTest,
  runContentTestSuite,
  // Test suite creators
  createProductPageTests,
  createArticlePageTests,
  createApiDocsTests,
  // Code generation
  generateTestCode,
  // Types
  type ContentTest,
  type ContentTestResult,
  type TestSuiteResult,
};
