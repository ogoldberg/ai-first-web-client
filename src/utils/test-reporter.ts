/**
 * Test Reporter Utilities
 *
 * Formats verification results in standard test output formats
 * for CI/CD integration (JUnit XML, TAP, JSON).
 */

import type { VerificationResult, VerificationCheckResult } from '../types/verification.js';

/**
 * Test case for reporting
 */
export interface TestCase {
  name: string;
  url: string;
  passed: boolean;
  duration: number;
  verification?: VerificationResult;
  error?: string;
}

/**
 * Test suite for reporting
 */
export interface TestSuite {
  name: string;
  timestamp: Date;
  tests: TestCase[];
}

/**
 * JUnit XML Reporter
 *
 * Generates JUnit XML format compatible with:
 * - GitHub Actions
 * - Jenkins
 * - CircleCI
 * - GitLab CI
 * - Azure DevOps
 */
export class JUnitReporter {
  /**
   * Generate JUnit XML from a test suite
   */
  static generate(suite: TestSuite): string {
    const passed = suite.tests.filter((t) => t.passed).length;
    const failed = suite.tests.length - passed;
    const totalTime = suite.tests.reduce((sum, t) => sum + t.duration, 0) / 1000;

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites name="${this.escapeXml(suite.name)}" tests="${suite.tests.length}" failures="${failed}" time="${totalTime.toFixed(3)}">`,
      `  <testsuite name="${this.escapeXml(suite.name)}" tests="${suite.tests.length}" failures="${failed}" time="${totalTime.toFixed(3)}" timestamp="${suite.timestamp.toISOString()}">`,
    ];

    for (const test of suite.tests) {
      const testTime = (test.duration / 1000).toFixed(3);

      if (test.passed) {
        lines.push(`    <testcase name="${this.escapeXml(test.name)}" classname="${this.escapeXml(test.url)}" time="${testTime}"/>`);
      } else {
        lines.push(`    <testcase name="${this.escapeXml(test.name)}" classname="${this.escapeXml(test.url)}" time="${testTime}">`);

        if (test.error) {
          lines.push(`      <failure message="${this.escapeXml(test.error)}" type="VerificationError">`);
          lines.push(`        ${this.escapeXml(this.formatFailureDetails(test))}`);
          lines.push('      </failure>');
        } else if (test.verification) {
          const failedChecks = test.verification.checks.filter((c) => !c.passed);
          const message = failedChecks.map((c) => c.message).join('; ');
          lines.push(`      <failure message="${this.escapeXml(message)}" type="VerificationFailure">`);
          lines.push(`        ${this.escapeXml(this.formatVerificationDetails(test.verification))}`);
          lines.push('      </failure>');
        }

        lines.push('    </testcase>');
      }
    }

    lines.push('  </testsuite>');
    lines.push('</testsuites>');

    return lines.join('\n');
  }

  /**
   * Create a test case from a browse result
   */
  static createTestCase(
    name: string,
    url: string,
    verification: VerificationResult | undefined,
    duration: number,
    error?: string
  ): TestCase {
    return {
      name,
      url,
      passed: error ? false : (verification?.passed ?? true),
      duration,
      verification,
      error,
    };
  }

  /**
   * Create a test suite
   */
  static createSuite(name: string, tests: TestCase[]): TestSuite {
    return {
      name,
      timestamp: new Date(),
      tests,
    };
  }

  private static escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private static formatFailureDetails(test: TestCase): string {
    const lines: string[] = [];
    lines.push(`URL: ${test.url}`);
    if (test.error) {
      lines.push(`Error: ${test.error}`);
    }
    return lines.join('\n');
  }

  private static formatVerificationDetails(verification: VerificationResult): string {
    const lines: string[] = [];
    lines.push(`Confidence: ${(verification.confidence * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('Checks:');

    for (const check of verification.checks) {
      const status = check.passed ? 'PASS' : 'FAIL';
      const severity = check.severity.toUpperCase();
      lines.push(`  [${status}] [${severity}] ${check.message}`);
    }

    if (verification.errors && verification.errors.length > 0) {
      lines.push('');
      lines.push('Errors:');
      for (const error of verification.errors) {
        lines.push(`  - ${error}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * TAP (Test Anything Protocol) Reporter
 *
 * Simple text format supported by many test tools
 */
export class TAPReporter {
  /**
   * Generate TAP output from a test suite
   */
  static generate(suite: TestSuite): string {
    const lines: string[] = [
      `TAP version 14`,
      `1..${suite.tests.length}`,
    ];

    suite.tests.forEach((test, index) => {
      const testNum = index + 1;

      if (test.passed) {
        lines.push(`ok ${testNum} - ${test.name}`);
      } else {
        lines.push(`not ok ${testNum} - ${test.name}`);
        lines.push('  ---');
        lines.push(`  url: ${test.url}`);
        lines.push(`  duration: ${test.duration}ms`);

        if (test.error) {
          lines.push(`  error: ${test.error}`);
        }

        if (test.verification) {
          lines.push(`  confidence: ${(test.verification.confidence * 100).toFixed(1)}%`);
          const failedChecks = test.verification.checks.filter((c) => !c.passed);
          if (failedChecks.length > 0) {
            lines.push('  failures:');
            for (const check of failedChecks) {
              lines.push(`    - ${check.message}`);
            }
          }
        }

        lines.push('  ...');
      }
    });

    return lines.join('\n');
  }
}

/**
 * JSON Reporter
 *
 * Structured JSON output for custom processing
 */
export class JSONReporter {
  /**
   * Generate JSON output from a test suite
   */
  static generate(suite: TestSuite): string {
    const summary = {
      name: suite.name,
      timestamp: suite.timestamp.toISOString(),
      total: suite.tests.length,
      passed: suite.tests.filter((t) => t.passed).length,
      failed: suite.tests.filter((t) => !t.passed).length,
      duration: suite.tests.reduce((sum, t) => sum + t.duration, 0),
    };

    const output = {
      summary,
      tests: suite.tests.map((test) => ({
        name: test.name,
        url: test.url,
        passed: test.passed,
        duration: test.duration,
        confidence: test.verification?.confidence,
        error: test.error,
        checks: test.verification?.checks.map((c) => ({
          type: c.type,
          passed: c.passed,
          message: c.message,
          severity: c.severity,
        })),
      })),
    };

    return JSON.stringify(output, null, 2);
  }
}

/**
 * Console Reporter
 *
 * Human-readable console output with colors (when supported)
 */
export class ConsoleReporter {
  /**
   * Generate console output from a test suite
   */
  static generate(suite: TestSuite, useColors = true): string {
    const green = useColors ? '\x1b[32m' : '';
    const red = useColors ? '\x1b[31m' : '';
    const yellow = useColors ? '\x1b[33m' : '';
    const reset = useColors ? '\x1b[0m' : '';
    const bold = useColors ? '\x1b[1m' : '';

    const lines: string[] = [];
    const passed = suite.tests.filter((t) => t.passed).length;
    const failed = suite.tests.length - passed;

    lines.push(`${bold}${suite.name}${reset}`);
    lines.push('');

    for (const test of suite.tests) {
      const status = test.passed ? `${green}PASS${reset}` : `${red}FAIL${reset}`;
      const duration = `(${test.duration}ms)`;

      lines.push(`  ${status} ${test.name} ${duration}`);

      if (!test.passed) {
        if (test.error) {
          lines.push(`       ${red}Error: ${test.error}${reset}`);
        }

        if (test.verification) {
          const failedChecks = test.verification.checks.filter((c) => !c.passed);
          for (const check of failedChecks) {
            const severity = check.severity === 'critical' ? red : yellow;
            lines.push(`       ${severity}[${check.severity.toUpperCase()}] ${check.message}${reset}`);
          }
        }
      }
    }

    lines.push('');
    lines.push(`${bold}Summary:${reset} ${green}${passed} passed${reset}, ${failed > 0 ? red : ''}${failed} failed${reset}`);

    return lines.join('\n');
  }
}

/**
 * Generate test report in specified format
 */
export function generateTestReport(
  suite: TestSuite,
  format: 'junit' | 'tap' | 'json' | 'console' = 'console'
): string {
  switch (format) {
    case 'junit':
      return JUnitReporter.generate(suite);
    case 'tap':
      return TAPReporter.generate(suite);
    case 'json':
      return JSONReporter.generate(suite);
    case 'console':
    default:
      return ConsoleReporter.generate(suite);
  }
}
