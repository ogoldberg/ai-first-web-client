/**
 * LLM Browser Testing Utilities
 *
 * Test reporters and utilities for QA/testing use cases.
 * Use these to generate CI/CD compatible test reports from
 * Unbrowser verification results.
 *
 * Usage:
 * ```typescript
 * import { JUnitReporter, generateTestReport } from 'llm-browser/testing';
 *
 * const suite = JUnitReporter.createSuite('API Tests', tests);
 * const xml = generateTestReport(suite, 'junit');
 * fs.writeFileSync('test-results.xml', xml);
 * ```
 */

// Re-export all test reporter utilities
export {
  JUnitReporter,
  TAPReporter,
  JSONReporter,
  ConsoleReporter,
  generateTestReport,
  type TestCase,
  type TestSuite,
} from './utils/test-reporter.js';

// Re-export verification types for test assertions
export type {
  VerifyOptions,
  VerificationCheck,
  VerificationAssertion,
  VerificationResult,
  VerificationCheckResult,
} from './types/verification.js';

// Re-export the verification engine interfaces
export type {
  StateVerificationBrowser,
  StateVerificationApiCaller,
} from './core/verification-engine.js';

export { VerificationEngine } from './core/verification-engine.js';
