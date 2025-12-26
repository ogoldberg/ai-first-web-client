/**
 * Verification Engine
 *
 * Automatically validates browse results with built-in and learned checks.
 * Provides fast verification using intelligence tier (<100ms vs 2-5s browser).
 *
 * Key features:
 * - Built-in sanity checks (always enabled)
 * - Content validation (field existence, patterns, length)
 * - State verification (secondary browse for confirmation)
 * - Learned verifications from failure patterns
 * - Confidence scoring
 */

import type {
  VerifyOptions,
  VerificationCheck,
  VerificationAssertion,
  VerificationResult,
  VerificationCheckResult,
} from '../types/verification.js';
import type { SmartBrowseResult } from './smart-browser.js';
import type { ProceduralMemory } from './procedural-memory.js';
import { logger } from '../utils/logger.js';

/**
 * Browser interface for state verification
 * Minimal interface to avoid circular dependencies with SmartBrowser
 */
export interface StateVerificationBrowser {
  browse(url: string, options?: { maxCostTier?: string }): Promise<SmartBrowseResult>;
}

/**
 * API caller interface for state verification
 */
export interface StateVerificationApiCaller {
  executeApiCall(options: { url: string; method?: string }): Promise<{ status: number; data?: unknown }>;
}

// Minimum confidence threshold for learned verifications
const MIN_LEARNED_VERIFICATION_CONFIDENCE = 0.7;

export class VerificationEngine {
  private proceduralMemory?: ProceduralMemory;
  private browser?: StateVerificationBrowser;
  private apiCaller?: StateVerificationApiCaller;

  /**
   * Set ProceduralMemory for learned verifications (COMP-014)
   */
  setProceduralMemory(memory: ProceduralMemory): void {
    this.proceduralMemory = memory;
  }

  /**
   * Set browser for state verification (COMP-013)
   * Required for checkUrl assertions that need to browse a secondary URL
   */
  setBrowser(browser: StateVerificationBrowser): void {
    this.browser = browser;
  }

  /**
   * Set API caller for state verification (COMP-013)
   * Required for checkApi assertions that need to call an API endpoint
   */
  setApiCaller(apiCaller: StateVerificationApiCaller): void {
    this.apiCaller = apiCaller;
  }

  /**
   * Verify a browse result
   */
  async verify(
    result: SmartBrowseResult,
    options: VerifyOptions
  ): Promise<VerificationResult> {
    // Extract domain from result URL
    const domain = result.url ? new URL(result.url).hostname : '';

    const checks: VerificationCheck[] = [
      // 1. Built-in checks (based on mode)
      ...this.getBuiltInChecks(options.mode),

      // 2. Learned checks from ProceduralMemory (COMP-014)
      ...(this.proceduralMemory && domain ? this.proceduralMemory.getLearnedVerifications(domain, MIN_LEARNED_VERIFICATION_CONFIDENCE) : []),

      // 3. User-specified checks
      ...(options.checks || []),
    ];

    const checkResults: VerificationCheckResult[] = [];
    let criticalFailure = false;

    for (const check of checks) {
      try {
        const passed = await this.runCheck(result, check);

        checkResults.push({
          type: check.type,
          passed,
          message: this.generateCheckMessage(check, passed, result),
          severity: check.severity,
        });

        // If critical check fails, stop immediately
        if (!passed && check.severity === 'critical') {
          criticalFailure = true;
          break;
        }
      } catch (error) {
        checkResults.push({
          type: check.type,
          passed: false,
          message: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
        });
      }
    }

    const passed = checkResults.every((c) => c.passed || c.severity === 'warning');
    const confidence = this.calculateConfidence(checkResults);

    return {
      passed,
      checks: checkResults,
      errors: checkResults
        .filter((c) => !c.passed && c.severity === 'error')
        .map((c) => c.message),
      warnings: checkResults
        .filter((c) => !c.passed && c.severity === 'warning')
        .map((c) => c.message),
      confidence,
    };
  }

  /**
   * Get built-in checks based on verification mode
   */
  private getBuiltInChecks(mode: 'basic' | 'standard' | 'thorough'): VerificationCheck[] {
    const checks: VerificationCheck[] = [];

    // Basic: Response sanity
    checks.push({
      type: 'action',
      assertion: {
        statusCode: 200,
      },
      severity: 'error',
      retryable: true,
    });

    // Basic: Content exists
    checks.push({
      type: 'content',
      assertion: {
        minLength: 50,
      },
      severity: 'error',
      retryable: true,
    });

    if (mode === 'standard' || mode === 'thorough') {
      // Standard: Check for error indicators
      checks.push({
        type: 'content',
        assertion: {
          excludesText: 'access denied',
        },
        severity: 'error',
        retryable: true,
      });

      checks.push({
        type: 'content',
        assertion: {
          excludesText: 'rate limit exceeded',
        },
        severity: 'error',
        retryable: true,
      });
    }

    if (mode === 'thorough') {
      // Thorough: Content completeness
      checks.push({
        type: 'content',
        assertion: {
          minLength: 100,
        },
        severity: 'warning',
        retryable: false,
      });
    }

    return checks;
  }

  /**
   * Run individual verification check
   */
  private async runCheck(
    result: SmartBrowseResult,
    check: VerificationCheck
  ): Promise<boolean> {
    switch (check.type) {
      case 'content':
        return this.verifyContent(result, check.assertion);

      case 'action':
        return this.verifyAction(result, check.assertion);

      case 'state':
        return this.verifyState(result, check.assertion);

      case 'custom':
        if (check.assertion.customValidator) {
          return check.assertion.customValidator(result);
        }
        return true;

      default:
        logger.verificationEngine.warn('Unknown check type', { type: check.type });
        return false;
    }
  }

  /**
   * Verify content assertions
   */
  private verifyContent(
    result: SmartBrowseResult,
    assertion: VerificationAssertion
  ): boolean {
    const content = result.content;

    // Check field existence
    if (assertion.fieldExists) {
      for (const field of assertion.fieldExists) {
        if (!this.hasField(content, field)) {
          return false;
        }
      }
    }

    // Check field non-empty
    if (assertion.fieldNotEmpty) {
      for (const field of assertion.fieldNotEmpty) {
        const value = this.getNestedValue(content, field);
        if (!value || (Array.isArray(value) && value.length === 0)) {
          return false;
        }
      }
    }

    // Check field patterns
    if (assertion.fieldMatches) {
      for (const [field, pattern] of Object.entries(assertion.fieldMatches)) {
        const value = String(this.getNestedValue(content, field) || '');
        if (pattern instanceof RegExp) {
          if (!pattern.test(value)) return false;
        } else {
          if (value !== pattern) return false;
        }
      }
    }

    // Check length constraints
    const contentLength = this.getContentLength(result);

    if (assertion.minLength && contentLength < assertion.minLength) {
      return false;
    }

    if (assertion.maxLength && contentLength > assertion.maxLength) {
      return false;
    }

    // Check text presence/absence
    const markdown = content.markdown || '';

    if (assertion.containsText && !markdown.toLowerCase().includes(assertion.containsText.toLowerCase())) {
      return false;
    }

    if (assertion.excludesText && markdown.toLowerCase().includes(assertion.excludesText.toLowerCase())) {
      return false;
    }

    return true;
  }

  /**
   * Verify action assertions
   */
  private verifyAction(
    result: SmartBrowseResult,
    assertion: VerificationAssertion
  ): boolean {
    // Check status code from network requests
    if (assertion.statusCode) {
      // Find the main document request (usually the first or matching the URL)
      const mainRequest = result.network.find(
        (req) => req.url === result.url || req.url === result.metadata?.finalUrl
      ) || result.network[0];

      if (!mainRequest || mainRequest.status !== assertion.statusCode) {
        return false;
      }
    }

    // Text checks are handled in verifyContent for now
    return true;
  }

  /**
   * Verify state assertions (COMP-013)
   *
   * State verification performs secondary requests to confirm state:
   * - checkUrl: Browse another URL and verify content
   * - checkApi: Call an API endpoint and verify response
   * - checkSelector: Check if element exists (requires checkUrl)
   */
  private async verifyState(
    result: SmartBrowseResult,
    assertion: VerificationAssertion
  ): Promise<boolean> {
    // Verify via secondary URL browse
    if (assertion.checkUrl) {
      if (!this.browser) {
        logger.verificationEngine.warn('State verification: browser not set, cannot verify checkUrl', {
          checkUrl: assertion.checkUrl,
          hint: 'Call verificationEngine.setBrowser() to enable state verification',
        });
        return true; // Graceful degradation - don't fail if browser not configured
      }

      try {
        const stateResult = await this.browser.browse(assertion.checkUrl, {
          maxCostTier: 'intelligence', // Use fastest tier for verification
        });

        // Check if the page loaded successfully
        if (!stateResult.content?.markdown || stateResult.content.markdown.length < 50) {
          logger.verificationEngine.debug('State verification failed: insufficient content from checkUrl', {
            checkUrl: assertion.checkUrl,
            contentLength: stateResult.content?.markdown?.length || 0,
          });
          return false;
        }

        // If checkSelector is specified, verify it exists in the result
        if (assertion.checkSelector) {
          // Check if the selector pattern appears in the HTML or content
          const html = stateResult.content.html || '';
          const selectorPattern = this.selectorToSearchPattern(assertion.checkSelector);
          if (!selectorPattern.test(html)) {
            logger.verificationEngine.debug('State verification failed: checkSelector not found', {
              checkUrl: assertion.checkUrl,
              checkSelector: assertion.checkSelector,
            });
            return false;
          }
        }

        logger.verificationEngine.debug('State verification passed via checkUrl', {
          checkUrl: assertion.checkUrl,
          checkSelector: assertion.checkSelector,
        });
        return true;
      } catch (error) {
        logger.verificationEngine.warn('State verification error during checkUrl browse', {
          checkUrl: assertion.checkUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }

    // Verify via API call
    if (assertion.checkApi) {
      if (!this.apiCaller) {
        logger.verificationEngine.warn('State verification: apiCaller not set, cannot verify checkApi', {
          checkApi: assertion.checkApi,
          hint: 'Call verificationEngine.setApiCaller() to enable API state verification',
        });
        return true; // Graceful degradation
      }

      try {
        const apiResult = await this.apiCaller.executeApiCall({
          url: assertion.checkApi,
          method: 'GET',
        });

        // Check for successful response
        if (apiResult.status < 200 || apiResult.status >= 300) {
          logger.verificationEngine.debug('State verification failed: API returned non-2xx status', {
            checkApi: assertion.checkApi,
            status: apiResult.status,
          });
          return false;
        }

        // Check for data presence
        if (!apiResult.data) {
          logger.verificationEngine.debug('State verification failed: API returned no data', {
            checkApi: assertion.checkApi,
          });
          return false;
        }

        logger.verificationEngine.debug('State verification passed via checkApi', {
          checkApi: assertion.checkApi,
          status: apiResult.status,
        });
        return true;
      } catch (error) {
        logger.verificationEngine.warn('State verification error during checkApi call', {
          checkApi: assertion.checkApi,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }

    // No state verification specified
    return true;
  }

  /**
   * Convert CSS selector to a search pattern for HTML content
   * This is a simple heuristic - works for common selectors
   */
  private selectorToSearchPattern(selector: string): RegExp {
    // Handle ID selector: #foo -> id="foo" or id='foo'
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return new RegExp(`id=['"]${this.escapeRegex(id)}['"]`, 'i');
    }

    // Handle class selector: .foo -> class="...foo..."
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return new RegExp(`class=['"][^'"]*${this.escapeRegex(className)}[^'"]*['"]`, 'i');
    }

    // Handle data attribute: [data-foo] or [data-foo="bar"]
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const attrMatch = selector.slice(1, -1).match(/^([^=]+)(?:="([^"]*)")?$/);
      if (attrMatch) {
        const attrName = attrMatch[1];
        const attrValue = attrMatch[2];
        if (attrValue) {
          return new RegExp(`${this.escapeRegex(attrName)}=['"]${this.escapeRegex(attrValue)}['"]`, 'i');
        }
        return new RegExp(`${this.escapeRegex(attrName)}=`, 'i');
      }
    }

    // Handle tag selector: div, span, etc.
    if (/^[a-z]+$/i.test(selector)) {
      return new RegExp(`<${selector}[\\s>]`, 'i');
    }

    // Fallback: just search for the selector text
    return new RegExp(this.escapeRegex(selector), 'i');
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if field exists in object (supports nested paths)
   */
  private hasField(obj: any, field: string): boolean {
    const value = this.getNestedValue(obj, field);
    return value !== undefined && value !== null;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Get content length from result
   */
  private getContentLength(result: SmartBrowseResult): number {
    const markdown = result.content?.markdown || '';
    const text = result.content?.text || '';
    return Math.max(markdown.length, text.length);
  }

  /**
   * Get status code from network requests
   */
  private getStatusCode(result: SmartBrowseResult): number | undefined {
    const mainRequest = result.network.find(
      (req) => req.url === result.url || req.url === result.metadata?.finalUrl
    ) || result.network[0];

    return mainRequest?.status;
  }

  /**
   * Generate check message
   */
  private generateCheckMessage(
    check: VerificationCheck,
    passed: boolean,
    result: SmartBrowseResult
  ): string {
    if (passed) {
      switch (check.type) {
        case 'content':
          if (check.assertion.minLength) {
            return `Content length ${this.getContentLength(result)} ≥ ${check.assertion.minLength}`;
          }
          if (check.assertion.fieldExists) {
            return `Required fields present: ${check.assertion.fieldExists.join(', ')}`;
          }
          return 'Content verification passed';

        case 'action':
          if (check.assertion.statusCode) {
            return `Status code ${this.getStatusCode(result)} = ${check.assertion.statusCode}`;
          }
          return 'Action verification passed';

        case 'state':
          return 'State verification passed';

        default:
          return 'Verification passed';
      }
    } else {
      switch (check.type) {
        case 'content':
          if (check.assertion.minLength) {
            return `Content too short: ${this.getContentLength(result)} < ${check.assertion.minLength}`;
          }
          if (check.assertion.fieldExists) {
            const missing = check.assertion.fieldExists.filter(
              (f) => !this.hasField(result.content, f)
            );
            return `Missing required fields: ${missing.join(', ')}`;
          }
          if (check.assertion.containsText) {
            return `Content missing expected text: "${check.assertion.containsText}"`;
          }
          if (check.assertion.excludesText) {
            return `Content contains error text: "${check.assertion.excludesText}"`;
          }
          return 'Content verification failed';

        case 'action':
          if (check.assertion.statusCode) {
            return `Status code ${this.getStatusCode(result)} ≠ ${check.assertion.statusCode}`;
          }
          return 'Action verification failed';

        case 'state':
          return 'State verification failed';

        default:
          return 'Verification failed';
      }
    }
  }

  /**
   * Calculate overall confidence from check results
   */
  private calculateConfidence(checks: VerificationCheckResult[]): number {
    if (checks.length === 0) return 0.5;

    const passedCount = checks.filter((c) => c.passed).length;
    const totalCount = checks.length;

    // Base confidence from pass rate
    let confidence = passedCount / totalCount;

    // Reduce confidence for critical/error failures
    const criticalFailures = checks.filter(
      (c) => !c.passed && c.severity === 'critical'
    ).length;
    const errorFailures = checks.filter((c) => !c.passed && c.severity === 'error').length;

    if (criticalFailures > 0) {
      confidence *= 0.3; // Major reduction for critical failures
    } else if (errorFailures > 0) {
      confidence *= 0.6; // Moderate reduction for errors
    }

    return Math.max(0, Math.min(1, confidence));
  }
}
