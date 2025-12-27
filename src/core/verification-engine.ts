/**
 * Verification Engine
 *
 * Automatically validates browse results with built-in and learned checks.
 * Provides fast verification using intelligence tier (<100ms vs 2-5s browser).
 *
 * ## Overview
 *
 * The VerificationEngine validates browse results to ensure data quality and
 * detect failures early. It supports three types of verification:
 *
 * 1. **Content Verification** - Validates extracted content (fields, patterns, length)
 * 2. **Action Verification** - Validates HTTP responses (status codes, error text)
 * 3. **State Verification** - Validates by making secondary requests (browse URL, API call)
 *
 * ## Key Features
 *
 * - **Built-in Checks**: Basic sanity checks always run (status 200, content exists)
 * - **Verification Modes**: `basic`, `standard`, `thorough` - progressively more checks
 * - **Learned Verifications**: Integrates with ProceduralMemory to apply domain-specific checks
 * - **Confidence Scoring**: Calculates 0-1 confidence based on check results
 * - **Graceful Degradation**: State verification skips if dependencies not configured
 *
 * ## Usage Example
 *
 * ```typescript
 * import { VerificationEngine } from 'llm-browser';
 *
 * const verifier = new VerificationEngine();
 *
 * // Basic usage with built-in checks
 * const result = await verifier.verify(browseResult, {
 *   enabled: true,
 *   mode: 'standard'
 * });
 *
 * if (!result.passed) {
 *   console.log('Verification failed:', result.errors);
 * }
 *
 * // Custom checks for specific content
 * const customResult = await verifier.verify(browseResult, {
 *   enabled: true,
 *   mode: 'basic',
 *   checks: [
 *     {
 *       type: 'content',
 *       assertion: { fieldExists: ['price', 'title'] },
 *       severity: 'error',
 *       retryable: true
 *     }
 *   ]
 * });
 * ```
 *
 * ## Integration with ProceduralMemory
 *
 * The engine can learn domain-specific verifications from past successes/failures:
 *
 * ```typescript
 * verifier.setProceduralMemory(proceduralMemory);
 * // Now verify() will include learned checks for the domain
 * ```
 *
 * ## State Verification (COMP-013)
 *
 * For critical operations, verify state by making secondary requests:
 *
 * ```typescript
 * verifier.setBrowser(smartBrowser);
 * verifier.setApiCaller(apiExecutor);
 *
 * const result = await verifier.verify(submitResult, {
 *   enabled: true,
 *   mode: 'thorough',
 *   checks: [{
 *     type: 'state',
 *     assertion: { checkUrl: 'https://example.com/order/123' },
 *     severity: 'critical',
 *     retryable: false
 *   }]
 * });
 * ```
 *
 * @see {@link VerifyOptions} for verification configuration
 * @see {@link VerificationResult} for the result structure
 * @see {@link VerificationCheck} for custom check definitions
 */

import type {
  VerifyOptions,
  VerificationCheck,
  VerificationAssertion,
  VerificationResult,
  VerificationCheckResult,
  SchemaValidationError,
  JSONSchema,
} from '../types/verification.js';
import type { SmartBrowseResult } from './smart-browser.js';
import type { ProceduralMemory } from './procedural-memory.js';
import { logger } from '../utils/logger.js';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { ValidateFunction, ErrorObject } from 'ajv';

// Handle CommonJS/ESM interop
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

/**
 * Browser interface for state verification.
 *
 * This minimal interface allows VerificationEngine to make secondary browse
 * requests for state verification without creating a circular dependency
 * with SmartBrowser.
 *
 * @example
 * ```typescript
 * const browser: StateVerificationBrowser = {
 *   browse: async (url, options) => smartBrowser.browse(url, options)
 * };
 * verificationEngine.setBrowser(browser);
 * ```
 */
export interface StateVerificationBrowser {
  /**
   * Browse a URL and return the result.
   *
   * @param url - The URL to browse for state verification
   * @param options - Optional browse options (typically maxCostTier: 'intelligence' for speed)
   * @returns Promise resolving to the browse result
   */
  browse(url: string, options?: { maxCostTier?: string }): Promise<SmartBrowseResult>;
}

/**
 * API caller interface for state verification.
 *
 * This interface allows VerificationEngine to make API calls for state
 * verification, confirming that actions (form submissions, etc.) succeeded.
 *
 * @example
 * ```typescript
 * const apiCaller: StateVerificationApiCaller = {
 *   executeApiCall: async (opts) => {
 *     const response = await fetch(opts.url, { method: opts.method || 'GET' });
 *     return { status: response.status, data: await response.json() };
 *   }
 * };
 * verificationEngine.setApiCaller(apiCaller);
 * ```
 */
export interface StateVerificationApiCaller {
  /**
   * Execute an API call for state verification.
   *
   * @param options - API call options
   * @param options.url - The API endpoint URL
   * @param options.method - HTTP method (defaults to GET)
   * @returns Promise resolving to status code and optional response data
   */
  executeApiCall(options: { url: string; method?: string }): Promise<{ status: number; data?: unknown }>;
}

/**
 * Minimum confidence threshold for including learned verifications.
 * Checks below this threshold are skipped to avoid false positives.
 */
const MIN_LEARNED_VERIFICATION_CONFIDENCE = 0.7;

/**
 * Engine for verifying browse results with configurable checks.
 *
 * The VerificationEngine combines built-in checks, learned domain-specific
 * checks, and custom user-defined checks to validate browse results.
 *
 * ## Verification Flow
 *
 * 1. Built-in checks run based on verification mode (basic/standard/thorough)
 * 2. Learned checks from ProceduralMemory are applied (if configured)
 * 3. User-provided custom checks run
 * 4. Results are aggregated with confidence scoring
 *
 * ## Error Handling
 *
 * - Critical check failures stop verification immediately
 * - Error check failures are recorded but don't stop execution
 * - Warning check failures are noted but don't affect pass/fail
 * - Check execution errors are captured with 'error' severity
 *
 * @example
 * ```typescript
 * const engine = new VerificationEngine();
 *
 * // Configure for full verification capabilities
 * engine.setProceduralMemory(memory);
 * engine.setBrowser(browser);
 * engine.setApiCaller(apiCaller);
 *
 * // Verify with thorough mode
 * const result = await engine.verify(browseResult, {
 *   enabled: true,
 *   mode: 'thorough',
 *   checks: [
 *     { type: 'content', assertion: { fieldExists: ['data'] }, severity: 'error', retryable: true }
 *   ]
 * });
 *
 * console.log(`Passed: ${result.passed}, Confidence: ${result.confidence}`);
 * ```
 */
export class VerificationEngine {
  /** ProceduralMemory instance for accessing learned verifications */
  private proceduralMemory?: ProceduralMemory;

  /** Browser instance for state verification via secondary URL browse */
  private browser?: StateVerificationBrowser;

  /** API caller instance for state verification via API calls */
  private apiCaller?: StateVerificationApiCaller;

  /** AJV validator instance for JSON Schema validation (FEAT-001) */
  private ajv: any;

  /**
   * Initialize VerificationEngine with AJV validator for schema validation.
   */
  constructor() {
    // Initialize AJV with draft-07 schema and common formats
    this.ajv = new Ajv({
      allErrors: true, // Collect all errors, not just the first
      verbose: true, // Include schema and data in errors
      strict: false, // Allow unknown keywords
    });
    addFormats(this.ajv); // Add format validation (email, url, date, etc.)
  }

  /**
   * Connect ProceduralMemory for learned verifications.
   *
   * When set, the engine will query ProceduralMemory for domain-specific
   * verification checks that have been learned from past successes and failures.
   * Only checks with confidence >= 0.7 are included.
   *
   * This enables COMP-014 (Verification Learning) - the engine learns which
   * checks prevent failures on specific domains.
   *
   * @param memory - ProceduralMemory instance with learned verifications
   *
   * @example
   * ```typescript
   * const memory = new ProceduralMemory();
   * await memory.initialize();
   * verificationEngine.setProceduralMemory(memory);
   *
   * // Now verify() includes learned checks for the domain
   * const result = await verificationEngine.verify(browseResult, { mode: 'standard' });
   * ```
   */
  setProceduralMemory(memory: ProceduralMemory): void {
    this.proceduralMemory = memory;
  }

  /**
   * Connect browser for state verification via secondary URL browse.
   *
   * Required for `checkUrl` assertions in state verification checks.
   * When a check includes `assertion.checkUrl`, the engine browses that URL
   * and validates the response to confirm state changes.
   *
   * This enables COMP-013 (State Verification) - verifying that actions
   * like form submissions actually succeeded by checking the resulting page.
   *
   * @param browser - Browser interface for making secondary browse requests
   *
   * @example
   * ```typescript
   * verificationEngine.setBrowser({
   *   browse: (url, opts) => smartBrowser.browse(url, opts)
   * });
   *
   * // Now state verification can browse secondary URLs
   * const result = await verificationEngine.verify(submitResult, {
   *   mode: 'thorough',
   *   checks: [{
   *     type: 'state',
   *     assertion: { checkUrl: 'https://example.com/orders/123' },
   *     severity: 'critical',
   *     retryable: false
   *   }]
   * });
   * ```
   */
  setBrowser(browser: StateVerificationBrowser): void {
    this.browser = browser;
  }

  /**
   * Connect API caller for state verification via API endpoint calls.
   *
   * Required for `checkApi` assertions in state verification checks.
   * When a check includes `assertion.checkApi`, the engine calls that API
   * endpoint and validates the response confirms expected state.
   *
   * This enables COMP-013 (State Verification) - verifying that actions
   * succeeded by checking an API endpoint (faster than full page browse).
   *
   * @param apiCaller - API caller interface for making verification API calls
   *
   * @example
   * ```typescript
   * verificationEngine.setApiCaller({
   *   executeApiCall: async ({ url, method }) => {
   *     const response = await fetch(url, { method: method || 'GET' });
   *     return { status: response.status, data: await response.json() };
   *   }
   * });
   *
   * // Now state verification can call API endpoints
   * const result = await verificationEngine.verify(submitResult, {
   *   mode: 'thorough',
   *   checks: [{
   *     type: 'state',
   *     assertion: { checkApi: 'https://api.example.com/orders/123' },
   *     severity: 'critical',
   *     retryable: false
   *   }]
   * });
   * ```
   */
  setApiCaller(apiCaller: StateVerificationApiCaller): void {
    this.apiCaller = apiCaller;
  }

  /**
   * Verify a browse result against configured checks.
   *
   * This is the main entry point for verification. It runs all applicable
   * checks and returns a comprehensive result with pass/fail status,
   * individual check results, and confidence scoring.
   *
   * ## Check Execution Order
   *
   * 1. **Built-in checks** based on `options.mode`:
   *    - `basic`: Status 200, content >= 50 chars
   *    - `standard`: + excludes "access denied", "rate limit exceeded"
   *    - `thorough`: + content >= 100 chars (warning)
   *
   * 2. **Learned checks** from ProceduralMemory (if configured):
   *    - Domain-specific checks with confidence >= 0.7
   *    - Automatically updated based on past success/failure
   *
   * 3. **User-provided checks** from `options.checks`:
   *    - Custom content, action, state, or validator checks
   *
   * ## Severity Handling
   *
   * - `critical`: Stops verification immediately on failure
   * - `error`: Recorded as failure, continues checking
   * - `warning`: Noted but doesn't affect pass/fail
   *
   * @param result - The browse result to verify
   * @param options - Verification configuration (mode, custom checks, etc.)
   * @returns Promise resolving to comprehensive verification result
   *
   * @example
   * ```typescript
   * // Basic verification
   * const result = await engine.verify(browseResult, {
   *   enabled: true,
   *   mode: 'basic'
   * });
   *
   * if (!result.passed) {
   *   console.log('Errors:', result.errors);
   *   console.log('Warnings:', result.warnings);
   * }
   *
   * // With custom content checks
   * const productResult = await engine.verify(productPage, {
   *   enabled: true,
   *   mode: 'standard',
   *   checks: [
   *     {
   *       type: 'content',
   *       assertion: {
   *         fieldExists: ['price', 'title', 'description'],
   *         fieldNotEmpty: ['price'],
   *         minLength: 200
   *       },
   *       severity: 'error',
   *       retryable: true
   *     }
   *   ]
   * });
   *
   * console.log(`Confidence: ${productResult.confidence}`);
   * ```
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

    // 4. Schema validation (FEAT-001)
    let schemaErrors: SchemaValidationError[] | undefined;
    if (options.validateSchema && options.schema) {
      schemaErrors = this.validateSchema(result, options.schema);

      if (schemaErrors.length > 0) {
        // Add a check result for schema validation failure
        checkResults.push({
          type: 'schema',
          passed: false,
          message: `Schema validation failed: ${schemaErrors.length} error(s)`,
          severity: 'error',
        });
      } else {
        // Add a check result for schema validation success
        checkResults.push({
          type: 'schema',
          passed: true,
          message: 'Schema validation passed',
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
      schemaErrors,
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

    // Handle class selector: .foo -> class="...foo..." with word boundaries
    // Use (?:^|\\s) and (?:\\s|$|['\"]) to match complete class names
    // This prevents .button from matching "submit-button"
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return new RegExp(`class=['"][^'"]*(?:^|\\s)${this.escapeRegex(className)}(?:\\s|['"])[^'"]*['"]`, 'i');
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

  /**
   * Validate content against JSON Schema (FEAT-001).
   *
   * Validates `result.content.structuredData` if present, otherwise
   * validates `result.content` itself. Returns an array of validation
   * errors, or empty array if validation passed.
   *
   * @param result - The browse result to validate
   * @param schema - The JSON Schema to validate against
   * @returns Array of schema validation errors (empty if validation passed)
   *
   * @example
   * ```typescript
   * const schema = {
   *   type: 'object',
   *   properties: { price: { type: 'number' } },
   *   required: ['price']
   * };
   *
   * const errors = engine.validateSchema(result, schema);
   * if (errors.length > 0) {
   *   console.log('Validation failed:', errors);
   * }
   * ```
   */
  private validateSchema(result: SmartBrowseResult, schema: JSONSchema): SchemaValidationError[] {
    // Validate the result content
    const dataToValidate = result.content;

    if (!dataToValidate) {
      logger.verificationEngine.warn('Schema validation skipped: no content to validate');
      return [{
        path: '',
        message: 'No content available for schema validation',
        keyword: 'content',
        params: {},
      }];
    }

    // Compile and validate schema
    const validate = this.ajv.compile(schema);
    const valid = validate(dataToValidate);

    if (valid) {
      logger.verificationEngine.debug('Schema validation passed');
      return [];
    }

    // Convert AJV errors to our SchemaValidationError format
    const errors: SchemaValidationError[] = (validate.errors || []).map((error: ErrorObject) => ({
      path: error.instancePath || '/',
      message: error.message || 'Schema validation failed',
      keyword: error.keyword,
      params: error.params,
    }));

    logger.verificationEngine.debug('Schema validation failed', {
      errorCount: errors.length,
      errors: errors.map((e) => `${e.path}: ${e.message}`),
    });

    return errors;
  }
}
