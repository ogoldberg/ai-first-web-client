/**
 * Verification Types
 *
 * Types for the verification loops feature that automatically validates
 * browse results and learns which checks prevent failures.
 *
 * ## Overview
 *
 * The verification system provides a declarative way to validate browse results.
 * Checks can verify content structure, HTTP responses, or state via secondary requests.
 *
 * ## Usage Example
 *
 * ```typescript
 * import type { VerifyOptions, VerificationCheck } from 'llm-browser';
 *
 * const options: VerifyOptions = {
 *   enabled: true,
 *   mode: 'standard',
 *   checks: [
 *     {
 *       type: 'content',
 *       assertion: { fieldExists: ['price', 'title'] },
 *       severity: 'error',
 *       retryable: true
 *     }
 *   ],
 *   onFailure: 'retry'
 * };
 * ```
 *
 * @see {@link VerificationEngine} for the implementation
 * @module verification
 */

/**
 * Configuration options for verification during browse operations.
 *
 * Controls whether verification runs, which built-in checks apply,
 * and how failures are handled.
 *
 * @example
 * ```typescript
 * // Basic verification - just sanity checks
 * const basic: VerifyOptions = { enabled: true, mode: 'basic' };
 *
 * // Standard verification - catches common errors
 * const standard: VerifyOptions = { enabled: true, mode: 'standard' };
 *
 * // Thorough verification with custom checks and retry on failure
 * const thorough: VerifyOptions = {
 *   enabled: true,
 *   mode: 'thorough',
 *   checks: [
 *     { type: 'content', assertion: { fieldExists: ['data'] }, severity: 'error', retryable: true }
 *   ],
 *   onFailure: 'retry'
 * };
 *
 * // Schema validation (FEAT-001)
 * const schemaValidation: VerifyOptions = {
 *   enabled: true,
 *   mode: 'standard',
 *   validateSchema: true,
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       price: { type: 'number' },
 *       title: { type: 'string' }
 *     },
 *     required: ['price', 'title']
 *   }
 * };
 * ```
 */
export interface VerifyOptions {
  /**
   * Whether verification is enabled.
   * When false, no checks run and verification always passes.
   * @default true for basic mode, false for advanced
   */
  enabled: boolean;

  /**
   * Verification mode controlling built-in checks.
   *
   * - `basic`: Status 200, content >= 50 chars
   * - `standard`: + excludes "access denied", "rate limit exceeded"
   * - `thorough`: + content >= 100 chars (warning)
   */
  mode: 'basic' | 'standard' | 'thorough';

  /**
   * Additional custom checks to run after built-in checks.
   * These are appended to the check list.
   */
  checks?: VerificationCheck[];

  /**
   * Action to take when verification fails.
   *
   * - `retry`: Retry the browse operation (only for retryable failures)
   * - `fallback`: Fall back to higher-cost tier
   * - `report`: Just report the failure, don't retry
   */
  onFailure?: 'retry' | 'fallback' | 'report';

  /**
   * Whether to validate the response against a JSON schema (FEAT-001).
   * When true, uses the `schema` option to validate extracted content.
   * @default false
   */
  validateSchema?: boolean;

  /**
   * JSON Schema (draft-07) for validating the response structure (FEAT-001).
   * Used when `validateSchema: true`.
   *
   * Schema is validated against `result.content.structuredData` if present,
   * otherwise against `result.content` itself.
   *
   * @example
   * ```typescript
   * schema: {
   *   type: 'object',
   *   properties: {
   *     price: { type: 'number', minimum: 0 },
   *     title: { type: 'string', minLength: 1 },
   *     inStock: { type: 'boolean' }
   *   },
   *   required: ['price', 'title']
   * }
   * ```
   */
  schema?: JSONSchema;
}

/**
 * Definition of a single verification check.
 *
 * Checks are composable units that verify one aspect of a browse result.
 * They specify what to check (assertion), how severe a failure is (severity),
 * and whether the operation can be retried (retryable).
 *
 * @example
 * ```typescript
 * // Content check - verify fields exist
 * const fieldCheck: VerificationCheck = {
 *   type: 'content',
 *   assertion: { fieldExists: ['price', 'title'], fieldNotEmpty: ['price'] },
 *   severity: 'error',
 *   retryable: true
 * };
 *
 * // Action check - verify HTTP status
 * const statusCheck: VerificationCheck = {
 *   type: 'action',
 *   assertion: { statusCode: 200 },
 *   severity: 'critical',
 *   retryable: true
 * };
 *
 * // State check - verify by browsing another URL
 * const stateCheck: VerificationCheck = {
 *   type: 'state',
 *   assertion: { checkUrl: 'https://example.com/order/123' },
 *   severity: 'critical',
 *   retryable: false
 * };
 *
 * // Custom check - arbitrary validation logic
 * const customCheck: VerificationCheck = {
 *   type: 'custom',
 *   assertion: {
 *     customValidator: async (result) => result.content?.price > 0
 *   },
 *   severity: 'warning',
 *   retryable: false
 * };
 * ```
 */
export interface VerificationCheck {
  /**
   * Type of verification check.
   *
   * - `content`: Validates extracted content structure
   * - `action`: Validates HTTP response characteristics
   * - `state`: Validates via secondary request (browse or API)
   * - `custom`: Runs a custom validator function
   */
  type: 'content' | 'action' | 'state' | 'custom';

  /**
   * The assertion to evaluate.
   * Contains the specific conditions to check.
   */
  assertion: VerificationAssertion;

  /**
   * Severity level of a check failure.
   *
   * - `critical`: Stops verification immediately, major failure
   * - `error`: Recorded as failure, continues checking
   * - `warning`: Noted but doesn't affect pass/fail status
   */
  severity: 'warning' | 'error' | 'critical';

  /**
   * Whether the browse operation can be retried if this check fails.
   * Used when `onFailure: 'retry'` is configured.
   */
  retryable: boolean;
}

/**
 * Assertion conditions for verification checks.
 *
 * Contains the specific conditions to evaluate. Different fields
 * apply to different check types:
 *
 * - **Content checks**: fieldExists, fieldNotEmpty, fieldMatches, minLength, maxLength
 * - **Action checks**: statusCode, containsText, excludesText
 * - **State checks**: checkUrl, checkSelector, checkApi
 * - **Custom checks**: customValidator
 *
 * @example
 * ```typescript
 * // Content assertion with multiple conditions
 * const contentAssertion: VerificationAssertion = {
 *   fieldExists: ['product.price', 'product.title'],
 *   fieldNotEmpty: ['product.price'],
 *   fieldMatches: { 'product.currency': /^(USD|EUR|GBP)$/ },
 *   minLength: 200
 * };
 *
 * // Action assertion for error detection
 * const errorAssertion: VerificationAssertion = {
 *   statusCode: 200,
 *   excludesText: 'access denied'
 * };
 *
 * // State assertion for form submission verification
 * const stateAssertion: VerificationAssertion = {
 *   checkUrl: 'https://example.com/order/confirmation',
 *   checkSelector: '#order-id'
 * };
 * ```
 */
export interface VerificationAssertion {
  // ============ Content Verification ============

  /**
   * Fields that must exist in the content (supports dot notation).
   * Check passes if all fields are present (not undefined/null).
   *
   * @example `['price', 'product.title', 'reviews.0.rating']`
   */
  fieldExists?: string[];

  /**
   * Fields that must exist and be non-empty (supports dot notation).
   * Check passes if all fields have truthy values or non-empty arrays.
   *
   * @example `['price', 'images']`
   */
  fieldNotEmpty?: string[];

  /**
   * Fields that must match specific values or patterns.
   * Keys are field paths (dot notation), values are exact strings or RegExp.
   *
   * @example `{ 'currency': 'USD', 'status': /^(active|pending)$/ }`
   */
  fieldMatches?: { [field: string]: string | RegExp };

  /**
   * Minimum content length in characters.
   * Uses the longer of markdown or text content.
   *
   * @example 200
   */
  minLength?: number;

  /**
   * Maximum content length in characters.
   * Uses the longer of markdown or text content.
   *
   * @example 50000
   */
  maxLength?: number;

  // ============ Action Verification ============

  /**
   * Expected HTTP status code for the main request.
   * Checks against the document request's response status.
   *
   * @example 200
   */
  statusCode?: number;

  /**
   * Text that must be present in the content.
   * Case-insensitive search in markdown content.
   *
   * @example 'Add to Cart'
   */
  containsText?: string;

  /**
   * Text that must NOT be present in the content.
   * Case-insensitive search in markdown content.
   * Commonly used to detect error pages.
   *
   * @example 'access denied'
   */
  excludesText?: string;

  // ============ State Verification ============

  /**
   * URL to browse for state verification (COMP-013).
   * Requires `setBrowser()` on VerificationEngine.
   * Verifies that browsing this URL succeeds with content.
   *
   * @example 'https://example.com/order/123'
   */
  checkUrl?: string;

  /**
   * CSS selector that must exist in checkUrl result.
   * Requires checkUrl to be set. Checks HTML for selector pattern.
   *
   * @example '#order-confirmation'
   */
  checkSelector?: string;

  /**
   * API endpoint to call for state verification (COMP-013).
   * Requires `setApiCaller()` on VerificationEngine.
   * Verifies that API returns 2xx status with data.
   *
   * @example 'https://api.example.com/orders/123'
   */
  checkApi?: string;

  // ============ Custom Verification ============

  /**
   * Custom async validation function.
   * Receives the full browse result and returns true if valid.
   *
   * @example
   * ```typescript
   * customValidator: async (result) => {
   *   const price = result.content?.price;
   *   return typeof price === 'number' && price > 0;
   * }
   * ```
   */
  customValidator?: (result: any) => Promise<boolean>;
}

/**
 * Result of running verification on a browse result.
 *
 * Contains the overall pass/fail status, individual check results,
 * error/warning messages, and a confidence score.
 *
 * @example
 * ```typescript
 * const result: VerificationResult = await engine.verify(browseResult, options);
 *
 * if (!result.passed) {
 *   console.log('Verification failed!');
 *   console.log('Errors:', result.errors);
 *   console.log('Warnings:', result.warnings);
 *   console.log('Confidence:', result.confidence);
 *
 *   // Check schema validation errors (FEAT-001)
 *   if (result.schemaErrors && result.schemaErrors.length > 0) {
 *     console.log('Schema validation failed:');
 *     result.schemaErrors.forEach(err => {
 *       console.log(`  ${err.path}: ${err.message}`);
 *     });
 *   }
 *
 *   // Inspect individual check results
 *   for (const check of result.checks) {
 *     if (!check.passed) {
 *       console.log(`${check.type}: ${check.message}`);
 *     }
 *   }
 * }
 * ```
 */
export interface VerificationResult {
  /**
   * Whether all non-warning checks passed.
   * True if no error or critical checks failed.
   */
  passed: boolean;

  /**
   * Individual results for each check that ran.
   * Includes both passed and failed checks.
   */
  checks: VerificationCheckResult[];

  /**
   * Error messages from failed checks with 'error' severity.
   * Empty array if no errors.
   */
  errors?: string[];

  /**
   * Warning messages from failed checks with 'warning' severity.
   * Empty array if no warnings.
   */
  warnings?: string[];

  /**
   * Overall confidence score (0-1) based on check results.
   *
   * Calculated as:
   * - Base: (passed checks / total checks)
   * - Critical failure: multiplied by 0.3
   * - Error failure: multiplied by 0.6
   *
   * Higher values indicate more reliable results.
   */
  confidence: number;

  /**
   * Schema validation errors (FEAT-001).
   * Present only when schema validation is enabled and fails.
   * Empty array if schema validation passed or was not run.
   */
  schemaErrors?: SchemaValidationError[];
}

/**
 * Schema validation error details (FEAT-001).
 *
 * Describes a specific validation failure when verifying content
 * against a JSON schema.
 *
 * @example
 * ```typescript
 * const error: SchemaValidationError = {
 *   path: '/price',
 *   message: 'must be number',
 *   keyword: 'type',
 *   params: { type: 'number' }
 * };
 * ```
 */
export interface SchemaValidationError {
  /**
   * JSON path to the failing property.
   * Uses JSON Pointer format (RFC 6901).
   * @example '/price', '/product/title', '/items/0/id'
   */
  path: string;

  /**
   * Human-readable error message.
   * @example 'must be number', 'must be >= 0', 'must have required property price'
   */
  message: string;

  /**
   * JSON Schema keyword that failed validation.
   * @example 'type', 'minimum', 'required', 'pattern'
   */
  keyword: string;

  /**
   * Additional error parameters from the schema validator.
   * Content depends on the failing keyword.
   */
  params?: Record<string, any>;
}

/**
 * Result of a single verification check.
 *
 * Provides details about what was checked and whether it passed.
 *
 * @example
 * ```typescript
 * const checkResult: VerificationCheckResult = {
 *   type: 'content',
 *   passed: false,
 *   message: 'Missing required fields: price, title',
 *   severity: 'error'
 * };
 * ```
 */
export interface VerificationCheckResult {
  /**
   * Type of check that was run.
   * Corresponds to the check's type field.
   */
  type: string;

  /**
   * Whether the check passed.
   */
  passed: boolean;

  /**
   * Human-readable message describing the result.
   * Includes specific details like actual vs expected values.
   */
  message: string;

  /**
   * Severity level of this check.
   * Determines impact on overall pass/fail and confidence.
   */
  severity: 'warning' | 'error' | 'critical';
}

/**
 * Verification check learned from ProceduralMemory.
 *
 * When verification fails and then succeeds with different checks,
 * the engine learns which checks are effective for each domain.
 * These learned checks are automatically included in future verifications.
 *
 * @example
 * ```typescript
 * const learnedCheck: LearnedVerification = {
 *   domain: 'example.com',
 *   check: {
 *     type: 'content',
 *     assertion: { excludesText: 'rate limit exceeded' },
 *     severity: 'error',
 *     retryable: true
 *   },
 *   learnedFrom: 'failure',
 *   successCount: 15,
 *   totalAttempts: 16,
 *   confidence: 0.94,
 *   lastUsed: Date.now()
 * };
 * ```
 */
export interface LearnedVerification {
  /**
   * Domain this verification applies to.
   * @example 'example.com'
   */
  domain: string;

  /**
   * The verification check definition.
   */
  check: VerificationCheck;

  /**
   * How this verification was learned.
   *
   * - `success`: Learned from successful browse that used this check
   * - `failure`: Learned from failure that could have been caught by this check
   * - `manual`: Manually configured by user
   */
  learnedFrom: 'success' | 'failure' | 'manual';

  /**
   * Number of times this check correctly identified issues.
   */
  successCount: number;

  /**
   * Total number of times this check was applied.
   */
  totalAttempts: number;

  /**
   * Confidence score (0-1) based on success rate.
   * Checks below 0.7 are excluded from automatic application.
   */
  confidence: number;

  /**
   * Timestamp when this check was last used.
   */
  lastUsed: number;
}

/**
 * JSON Schema definition (draft-07 compatible).
 *
 * Used for validating extracted content structure. Supports the full
 * JSON Schema draft-07 specification.
 *
 * @see https://json-schema.org/draft-07/schema
 *
 * @example
 * ```typescript
 * const productSchema: JSONSchema = {
 *   type: 'object',
 *   properties: {
 *     id: { type: 'string', pattern: '^[0-9]+$' },
 *     price: { type: 'number', minimum: 0 },
 *     title: { type: 'string', minLength: 1 },
 *     tags: { type: 'array', items: { type: 'string' } },
 *     inStock: { type: 'boolean' }
 *   },
 *   required: ['id', 'price', 'title']
 * };
 * ```
 */
export interface JSONSchema {
  /** The data type */
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | string[];

  /** Object properties (for type: 'object') */
  properties?: { [key: string]: JSONSchema };

  /** Required properties (for type: 'object') */
  required?: string[];

  /** Array item schema (for type: 'array') */
  items?: JSONSchema | JSONSchema[];

  /** Minimum value (for type: 'number' | 'integer') */
  minimum?: number;

  /** Maximum value (for type: 'number' | 'integer') */
  maximum?: number;

  /** Minimum length (for type: 'string' | 'array') */
  minLength?: number;

  /** Maximum length (for type: 'string' | 'array') */
  maxLength?: number;

  /** Minimum number of items (for type: 'array') */
  minItems?: number;

  /** Maximum number of items (for type: 'array') */
  maxItems?: number;

  /** Pattern to match (for type: 'string') */
  pattern?: string;

  /** Enum values */
  enum?: any[];

  /** Constant value */
  const?: any;

  /** Description of the field */
  description?: string;

  /** Default value */
  default?: any;

  /** Additional properties allowed (for type: 'object') */
  additionalProperties?: boolean | JSONSchema;

  /** All of these schemas must match */
  allOf?: JSONSchema[];

  /** Any of these schemas must match */
  anyOf?: JSONSchema[];

  /** Exactly one of these schemas must match */
  oneOf?: JSONSchema[];

  /** Must not match this schema */
  not?: JSONSchema;
}
