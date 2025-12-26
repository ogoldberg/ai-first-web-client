/**
 * Form Submission Learner
 *
 * Learns API patterns from form submissions to enable direct POST requests
 * without browser rendering on future submissions.
 *
 * Progressive optimization:
 * - First submission: Use browser, capture POST request
 * - Learn: Field mapping, CSRF patterns, validation rules
 * - Future submissions: Direct POST (~10-25x faster)
 *
 * Part of the "Browser Minimizer" philosophy - progressively eliminate
 * the need for rendering by learning the underlying API patterns.
 */

import type { Page } from 'playwright';
import type {
  NetworkRequest,
  BrowsingAction,
} from '../types/index.js';
import type {
  LearnedApiPattern,
  ContentMapping,
  ApiExtractionSuccess,
} from '../types/api-patterns.js';
import { ApiPatternRegistry } from './api-pattern-learner.js';
import { logger } from '../utils/logger.js';

/**
 * Form field detected in HTML
 */
export interface FormField {
  name: string;
  type: string; // text, email, password, hidden, etc.
  required: boolean;
  value?: string;
  selector: string;
}

/**
 * Detected form structure
 */
export interface DetectedForm {
  action?: string; // Form action URL
  method: string; // GET or POST
  fields: FormField[];
  submitSelector: string;
  csrfFields: FormField[]; // Hidden fields that look like CSRF tokens
}

/**
 * Form submission data provided by user
 */
export interface FormSubmissionData {
  url: string; // URL of the page containing the form
  fields: Record<string, string | number | boolean>; // Field values to submit
  formSelector?: string; // Optional selector to identify specific form
  isMultiStep?: boolean; // Whether this is part of a multi-step form
  stepNumber?: number; // Current step number (1-indexed)
  previousStepData?: Record<string, any>; // Data from previous steps
}

/**
 * Result of a form submission
 */
export interface FormSubmissionResult {
  success: boolean;
  method: 'browser' | 'api'; // How the form was submitted
  responseUrl?: string;
  responseData?: any;
  duration: number;
  learned: boolean; // Whether a new pattern was learned
  error?: string;
}

/**
 * Dynamic field that needs to be fetched before each submission
 */
export interface DynamicField {
  fieldName: string; // API field name
  valueType: 'user_id' | 'session_id' | 'nonce' | 'timestamp' | 'uuid' | 'csrf_token' | 'custom';
  extractionStrategy: {
    type: 'dom' | 'api' | 'cookie' | 'url_param' | 'localStorage' | 'computed';
    selector?: string; // CSS selector for DOM extraction
    apiEndpoint?: string; // API to fetch value
    cookieName?: string; // Cookie name
    paramName?: string; // URL parameter name
    storageKey?: string; // localStorage key
    computeFn?: string; // JavaScript function to compute value (e.g., "Date.now()")
  };
  pattern?: RegExp; // Pattern to validate extracted value
}

/**
 * Learned form pattern that can be replayed
 */
export interface LearnedFormPattern {
  id: string;
  domain: string;
  formUrl: string; // URL where form appears
  formSelector?: string;

  // API details
  apiEndpoint: string;
  method: string; // POST, PUT, etc.

  // Field mapping
  fieldMapping: Record<string, string>; // formField → apiField

  // Dynamic fields that must be fetched before each submission
  dynamicFields: DynamicField[];

  // CSRF handling (special case of dynamic field)
  csrfTokenField?: string; // Field name for CSRF token
  csrfTokenSource?: 'meta' | 'hidden' | 'cookie'; // Where to get the token
  csrfTokenSelector?: string; // How to extract it

  // Validation
  requiredFields: string[];

  // Success indicators
  successIndicators: {
    statusCodes: number[];
    responseFields?: string[]; // Fields that indicate success
  };

  // Metadata
  learnedAt: number;
  timesUsed: number;
  successRate: number;
  lastUsed?: number;
}

/**
 * Options for form submission
 */
export interface SubmitFormOptions {
  timeout?: number;
  waitForNavigation?: boolean;
  csrfToken?: string; // Optional pre-fetched CSRF token
}

export class FormSubmissionLearner {
  private patternRegistry: ApiPatternRegistry;
  private formPatterns: Map<string, LearnedFormPattern> = new Map();

  constructor(patternRegistry: ApiPatternRegistry) {
    this.patternRegistry = patternRegistry;
  }

  /**
   * Submit a form with progressive optimization
   *
   * First attempt: Check for learned pattern
   * Fallback: Use browser and learn the pattern
   */
  async submitForm(
    data: FormSubmissionData,
    page: Page,
    options: SubmitFormOptions = {}
  ): Promise<FormSubmissionResult> {
    const startTime = Date.now();
    const domain = new URL(data.url).hostname;

    // Try learned pattern first
    const pattern = this.findMatchingPattern(data.url, data.formSelector);
    if (pattern) {
      logger.formLearner.info('Found learned form pattern, attempting direct API submission', {
        patternId: pattern.id,
        endpoint: pattern.apiEndpoint,
      });

      try {
        const result = await this.submitViaApi(data, pattern, options);

        // Update pattern metrics
        pattern.timesUsed++;
        pattern.lastUsed = Date.now();
        pattern.successRate = ((pattern.successRate * (pattern.timesUsed - 1)) + 1) / pattern.timesUsed;

        return {
          success: true,
          method: 'api',
          responseUrl: result.responseUrl,
          responseData: result.data,
          duration: Date.now() - startTime,
          learned: false,
        };
      } catch (error) {
        logger.formLearner.warn('Direct API submission failed, falling back to browser', {
          patternId: pattern.id,
          error: error instanceof Error ? error.message : String(error),
        });

        // Update failure rate
        pattern.successRate = ((pattern.successRate * (pattern.timesUsed - 1)) + 0) / pattern.timesUsed;
      }
    }

    // Fallback: Submit via browser and learn
    logger.formLearner.info('Submitting via browser to learn pattern', {
      url: data.url,
      hasExistingPattern: !!pattern,
    });

    return await this.submitViaBrowserAndLearn(data, page, domain, options, startTime);
  }

  /**
   * Submit form via learned API pattern
   */
  private async submitViaApi(
    data: FormSubmissionData,
    pattern: LearnedFormPattern,
    options: SubmitFormOptions
  ): Promise<{ responseUrl: string; data: any }> {
    // Build payload from field mapping
    const payload: Record<string, any> = {};

    for (const [formField, apiField] of Object.entries(pattern.fieldMapping)) {
      if (data.fields[formField] !== undefined) {
        payload[apiField] = data.fields[formField];
      }
    }

    // Fetch and add dynamic fields (user IDs, nonces, session tokens, etc.)
    for (const dynamicField of pattern.dynamicFields) {
      logger.formLearner.debug('Fetching dynamic field', {
        field: dynamicField.fieldName,
        type: dynamicField.valueType,
        strategy: dynamicField.extractionStrategy.type,
      });

      const value = await this.extractDynamicFieldValue(data.url, dynamicField);
      if (value) {
        payload[dynamicField.fieldName] = value;
        logger.formLearner.debug('Extracted dynamic field value', {
          field: dynamicField.fieldName,
          value: this.maskSensitiveValue(value, dynamicField.valueType),
        });
      } else {
        logger.formLearner.warn('Failed to extract dynamic field', {
          field: dynamicField.fieldName,
          type: dynamicField.valueType,
        });
      }
    }

    // Add CSRF token if required (legacy path, now handled by dynamicFields)
    if (pattern.csrfTokenField && !pattern.dynamicFields.some(f => f.fieldName === pattern.csrfTokenField)) {
      const csrfToken = options.csrfToken || await this.extractCsrfToken(data.url, pattern);
      if (csrfToken) {
        payload[pattern.csrfTokenField] = csrfToken;
      }
    }

    // Make the request
    const response = await fetch(pattern.apiEndpoint, {
      method: pattern.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    // Validate success
    if (!this.isSuccessResponse(response.status, responseData, pattern)) {
      throw new Error('Response does not match success indicators');
    }

    return {
      responseUrl: response.url,
      data: responseData,
    };
  }

  /**
   * Submit form via browser and learn the API pattern
   */
  private async submitViaBrowserAndLearn(
    data: FormSubmissionData,
    page: Page,
    domain: string,
    options: SubmitFormOptions,
    startTime: number
  ): Promise<FormSubmissionResult> {
    const networkRequests: NetworkRequest[] = [];

    // Capture network requests
    const requestListener = (request: any) => {
      request.response().then((response: any) => {
        const req: NetworkRequest = {
          url: request.url(),
          method: request.method(),
          status: response.status(),
          statusText: response.statusText(),
          headers: response.headers(),
          requestHeaders: request.headers(),
          contentType: response.headers()['content-type'],
          timestamp: Date.now(),
        };

        // Capture response body for mutation requests
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
          response.json().then((body: any) => {
            req.responseBody = body;
          }).catch(() => {
            // Not JSON, skip
          });
        }

        networkRequests.push(req);
      }).catch(() => {
        // Ignore failed requests
      });
    };

    page.on('request', requestListener);

    try {
      // Navigate to form page
      await page.goto(data.url, { waitUntil: 'networkidle' });

      // Detect form structure
      const form = await this.detectForm(page, data.formSelector);

      if (!form) {
        throw new Error('No form found on page');
      }

      // Fill form fields
      for (const [fieldName, value] of Object.entries(data.fields)) {
        const field = form.fields.find(f => f.name === fieldName);
        if (field) {
          await page.fill(field.selector, String(value));
        }
      }

      // Submit form
      await Promise.all([
        options.waitForNavigation !== false
          ? page.waitForNavigation({ waitUntil: 'networkidle' })
          : Promise.resolve(),
        page.click(form.submitSelector),
      ]);

      // Analyze network requests to learn the pattern
      const learnedPattern = this.analyzeFormSubmission(
        data.url,
        form,
        networkRequests,
        domain
      );

      if (learnedPattern) {
        this.formPatterns.set(learnedPattern.id, learnedPattern);
        logger.formLearner.info('Learned new form pattern', {
          patternId: learnedPattern.id,
          endpoint: learnedPattern.apiEndpoint,
          fieldsCount: Object.keys(learnedPattern.fieldMapping).length,
        });
      }

      return {
        success: true,
        method: 'browser',
        responseUrl: page.url(),
        duration: Date.now() - startTime,
        learned: !!learnedPattern,
      };
    } catch (error) {
      return {
        success: false,
        method: 'browser',
        duration: Date.now() - startTime,
        learned: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      page.off('request', requestListener);
    }
  }

  /**
   * Detect form structure on the page
   */
  private async detectForm(page: Page, formSelector?: string): Promise<DetectedForm | null> {
    return await page.evaluate((selector) => {
      const forms = selector
        ? [document.querySelector(selector) as HTMLFormElement]
        : Array.from(document.querySelectorAll('form'));

      const form = forms.find(f => f !== null);
      if (!form) return null;

      const fields: any[] = [];
      const csrfFields: any[] = [];

      // Extract all input, select, textarea elements
      const inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach((input: any) => {
        const field = {
          name: input.name || input.id,
          type: input.type || input.tagName.toLowerCase(),
          required: input.required || input.hasAttribute('required'),
          value: input.value,
          selector: this.getSelector(input),
        };

        fields.push(field);

        // Detect CSRF tokens (hidden fields with token-like names)
        if (
          input.type === 'hidden' &&
          (input.name.toLowerCase().includes('csrf') ||
           input.name.toLowerCase().includes('token') ||
           input.name.toLowerCase().includes('authenticity'))
        ) {
          csrfFields.push(field);
        }
      });

      // Find submit button
      const submitButton =
        form.querySelector('button[type="submit"]') ||
        form.querySelector('input[type="submit"]') ||
        form.querySelector('button');

      return {
        action: form.action,
        method: form.method.toUpperCase() || 'POST',
        fields,
        submitSelector: submitButton ? this.getSelector(submitButton) : 'button[type="submit"]',
        csrfFields,
      };

      // Helper to generate CSS selector
      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.name) return `[name="${el.name}"]`;
        return el.tagName.toLowerCase();
      }
    }, formSelector);
  }

  /**
   * Analyze form submission to learn the API pattern
   */
  private analyzeFormSubmission(
    formUrl: string,
    form: DetectedForm,
    networkRequests: NetworkRequest[],
    domain: string
  ): LearnedFormPattern | null {
    // Find mutation requests (POST/PUT/PATCH/DELETE) that are likely the form submission
    const submitRequests = networkRequests.filter(req =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.status >= 200 && req.status < 400
    );

    if (submitRequests.length === 0) {
      logger.formLearner.warn('No successful mutation requests (POST/PUT/PATCH/DELETE) found in form submission');
      return null;
    }

    // Use the first successful mutation (most likely the form submission)
    const submitRequest = submitRequests[0];

    // Try to extract field mapping from request body
    const fieldMapping = this.extractFieldMapping(form, submitRequest);

    if (Object.keys(fieldMapping).length === 0) {
      logger.formLearner.warn('Could not extract field mapping from request');
      return null;
    }

    // Detect CSRF token handling
    const csrfHandling = this.detectCsrfHandling(form);

    const pattern: LearnedFormPattern = {
      id: `form:${domain}:${Date.now()}`,
      domain,
      formUrl,
      apiEndpoint: submitRequest.url,
      method: submitRequest.method,
      fieldMapping,
      csrfTokenField: csrfHandling?.fieldName,
      csrfTokenSource: csrfHandling?.source,
      csrfTokenSelector: csrfHandling?.selector,
      requiredFields: form.fields.filter(f => f.required).map(f => f.name),
      successIndicators: {
        statusCodes: [submitRequest.status],
      },
      dynamicFields: [], // Will be populated by multi-submission learning
      learnedAt: Date.now(),
      timesUsed: 0,
      successRate: 1.0,
    };

    return pattern;
  }

  /**
   * Extract field mapping from form and request
   */
  private extractFieldMapping(
    form: DetectedForm,
    request: NetworkRequest
  ): Record<string, string> {
    const mapping: Record<string, string> = {};

    // Try to parse request body
    const requestBody = request.requestHeaders['content-type']?.includes('application/json')
      ? this.tryParseJson(String(request.requestHeaders))
      : null;

    if (!requestBody) {
      // Fallback: assume 1:1 mapping
      for (const field of form.fields) {
        if (field.name && field.type !== 'submit') {
          mapping[field.name] = field.name;
        }
      }
    } else {
      // Try to match form fields to API fields
      for (const field of form.fields) {
        if (field.name && field.type !== 'submit') {
          // Look for exact match
          if (field.name in requestBody) {
            mapping[field.name] = field.name;
          } else {
            // Look for camelCase/snake_case variations
            const variations = [
              field.name,
              this.toCamelCase(field.name),
              this.toSnakeCase(field.name),
            ];

            for (const variant of variations) {
              if (variant in requestBody) {
                mapping[field.name] = variant;
                break;
              }
            }
          }
        }
      }
    }

    return mapping;
  }

  /**
   * Detect CSRF token handling
   */
  private detectCsrfHandling(form: DetectedForm): {
    fieldName: string;
    source: 'meta' | 'hidden' | 'cookie';
    selector?: string;
  } | null {
    if (form.csrfFields.length > 0) {
      const csrfField = form.csrfFields[0];
      return {
        fieldName: csrfField.name,
        source: 'hidden',
        selector: csrfField.selector,
      };
    }

    return null;
  }

  /**
   * Extract CSRF token for learned pattern
   */
  private async extractCsrfToken(
    url: string,
    pattern: LearnedFormPattern
  ): Promise<string | null> {
    if (!pattern.csrfTokenSource || !pattern.csrfTokenSelector) {
      return null;
    }

    // Fetch the form page to get the token
    const response = await fetch(url);
    const html = await response.text();

    // Extract token from HTML
    if (pattern.csrfTokenSource === 'hidden' || pattern.csrfTokenSource === 'meta') {
      const match = html.match(new RegExp(`${pattern.csrfTokenSelector}[^>]*value=["']([^"']+)["']`));
      return match ? match[1] : null;
    }

    return null;
  }

  /**
   * Check if response indicates success
   */
  private isSuccessResponse(
    status: number,
    data: any,
    pattern: LearnedFormPattern
  ): boolean {
    // Check status code
    if (!pattern.successIndicators.statusCodes.includes(status)) {
      return false;
    }

    // Check response fields if defined
    if (pattern.successIndicators.responseFields) {
      for (const field of pattern.successIndicators.responseFields) {
        if (!(field in data)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Find matching learned pattern for a form
   */
  private findMatchingPattern(
    url: string,
    formSelector?: string
  ): LearnedFormPattern | null {
    const domain = new URL(url).hostname;

    for (const pattern of this.formPatterns.values()) {
      if (pattern.domain === domain && pattern.formUrl === url) {
        if (!formSelector || pattern.formSelector === formSelector) {
          return pattern;
        }
      }
    }

    return null;
  }

  /**
   * Get all learned patterns for a domain
   */
  getLearnedPatterns(domain: string): LearnedFormPattern[] {
    return Array.from(this.formPatterns.values())
      .filter(p => p.domain === domain);
  }

  /**
   * Helper: Try to parse JSON safely
   */
  private tryParseJson(str: string): any | null {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  /**
   * Helper: Convert to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/[_-](\w)/g, (_, c) => c.toUpperCase());
  }

  /**
   * Helper: Convert to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Extract value for a dynamic field
   */
  private async extractDynamicFieldValue(
    pageUrl: string,
    field: DynamicField
  ): Promise<string | number | null> {
    const strategy = field.extractionStrategy;

    try {
      switch (strategy.type) {
        case 'dom':
          return await this.extractFromDom(pageUrl, strategy.selector!);

        case 'api':
          return await this.extractFromApi(strategy.apiEndpoint!);

        case 'cookie':
          return this.extractFromCookie(strategy.cookieName!);

        case 'url_param':
          return this.extractFromUrlParam(pageUrl, strategy.paramName!);

        case 'localStorage':
          // localStorage extraction requires browser context
          logger.formLearner.warn('localStorage extraction not yet implemented, requires browser context');
          return null;

        case 'computed':
          return this.computeValue(strategy.computeFn!);

        default:
          logger.formLearner.warn('Unknown extraction strategy type', { type: strategy.type });
          return null;
      }
    } catch (error) {
      logger.formLearner.error('Failed to extract dynamic field value', {
        field: field.fieldName,
        strategy: strategy.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract value from DOM by fetching page and parsing HTML
   */
  private async extractFromDom(url: string, selector: string): Promise<string | null> {
    const response = await fetch(url);
    const html = await response.text();

    // Simple regex-based extraction (could use cheerio for more robust parsing)
    const regex = new RegExp(`${selector}[^>]*(?:value|data-value|data-id)=["']([^"']+)["']`, 'i');
    const match = html.match(regex);

    if (match) {
      return match[1];
    }

    // Try data attributes
    const dataRegex = new RegExp(`${selector}[^>]*>([^<]+)<`, 'i');
    const dataMatch = html.match(dataRegex);

    return dataMatch ? dataMatch[1].trim() : null;
  }

  /**
   * Extract value from an API endpoint
   */
  private async extractFromApi(apiUrl: string): Promise<string | number | null> {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    // Return first string/number value found
    if (typeof data === 'string' || typeof data === 'number') {
      return data;
    }

    // Look for common field names
    const commonFields = ['id', 'userId', 'user_id', 'sessionId', 'session_id', 'nonce', 'token'];
    for (const field of commonFields) {
      if (field in data && (typeof data[field] === 'string' || typeof data[field] === 'number')) {
        return data[field];
      }
    }

    return null;
  }

  /**
   * Extract value from cookie
   */
  private extractFromCookie(cookieName: string): string | null {
    // Note: In browser context, use document.cookie
    // In Node.js, we'd need the cookie jar from the session
    logger.formLearner.warn('Cookie extraction requires browser or session context');
    return null;
  }

  /**
   * Extract value from URL parameter
   */
  private extractFromUrlParam(url: string, paramName: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get(paramName);
    } catch {
      return null;
    }
  }

  /**
   * Compute value using a function string
   */
  private computeValue(computeFn: string): string | number {
    // Safe evaluation of simple expressions
    if (computeFn === 'Date.now()') {
      return Date.now();
    }

    if (computeFn === 'Math.random()') {
      return Math.random();
    }

    if (computeFn.startsWith('uuid()') || computeFn === 'UUID()') {
      return this.generateUUID();
    }

    logger.formLearner.warn('Unknown compute function', { computeFn });
    return '';
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Detect if a value is dynamic (changes between submissions)
   */
  private detectDynamicValue(
    fieldName: string,
    value: any,
    values: any[]
  ): { isDynamic: boolean; valueType?: DynamicField['valueType'] } {
    // If we've seen different values for this field, it's dynamic
    const uniqueValues = new Set(values);
    if (uniqueValues.size <= 1) {
      return { isDynamic: false };
    }

    // Detect value type based on name and format
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('csrf') || lowerName.includes('token')) {
      return { isDynamic: true, valueType: 'csrf_token' };
    }

    if (lowerName.includes('nonce')) {
      return { isDynamic: true, valueType: 'nonce' };
    }

    if (lowerName.includes('user') && lowerName.includes('id')) {
      return { isDynamic: true, valueType: 'user_id' };
    }

    if (lowerName.includes('session')) {
      return { isDynamic: true, valueType: 'session_id' };
    }

    // Check value format
    const stringValue = String(value);

    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stringValue)) {
      return { isDynamic: true, valueType: 'uuid' };
    }

    // Timestamp pattern
    if (/^\d{10,13}$/.test(stringValue)) {
      return { isDynamic: true, valueType: 'timestamp' };
    }

    return { isDynamic: true, valueType: 'custom' };
  }

  /**
   * Infer extraction strategy for a dynamic field
   */
  private inferExtractionStrategy(
    field: FormField,
    valueType: DynamicField['valueType']
  ): DynamicField['extractionStrategy'] {
    // CSRF tokens usually come from hidden fields or meta tags
    if (valueType === 'csrf_token') {
      if (field.type === 'hidden') {
        return {
          type: 'dom',
          selector: field.selector,
        };
      }
      return {
        type: 'dom',
        selector: 'meta[name="csrf-token"]',
      };
    }

    // Timestamps are computed
    if (valueType === 'timestamp') {
      return {
        type: 'computed',
        computeFn: 'Date.now()',
      };
    }

    // UUIDs are computed
    if (valueType === 'uuid') {
      return {
        type: 'computed',
        computeFn: 'uuid()',
      };
    }

    // User IDs might come from cookies, localStorage, or API
    if (valueType === 'user_id') {
      return {
        type: 'cookie',
        cookieName: 'user_id',
      };
    }

    // Default: try to extract from DOM
    return {
      type: 'dom',
      selector: field.selector,
    };
  }

  /**
   * Mask sensitive values for logging
   */
  private maskSensitiveValue(value: string | number, valueType: DynamicField['valueType']): string {
    const str = String(value);

    if (valueType === 'csrf_token' || valueType === 'session_id') {
      return str.substring(0, 8) + '...' + str.substring(str.length - 4);
    }

    return str;
  }

  /**
   * Analyze form to detect dynamic fields during learning
   */
  private detectDynamicFields(
    form: DetectedForm,
    submissions: Array<{ fields: FormField[]; request: NetworkRequest }>
  ): DynamicField[] {
    const dynamicFields: DynamicField[] = [];

    // Group field values across multiple submissions
    const fieldValues = new Map<string, any[]>();

    for (const submission of submissions) {
      for (const field of submission.fields) {
        if (!fieldValues.has(field.name)) {
          fieldValues.set(field.name, []);
        }
        fieldValues.get(field.name)!.push(field.value);
      }
    }

    // Detect which fields are dynamic
    for (const [fieldName, values] of fieldValues.entries()) {
      const detection = this.detectDynamicValue(fieldName, values[0], values);

      if (detection.isDynamic && detection.valueType) {
        const formField = form.fields.find(f => f.name === fieldName);
        if (formField) {
          const strategy = this.inferExtractionStrategy(formField, detection.valueType);

          dynamicFields.push({
            fieldName,
            valueType: detection.valueType,
            extractionStrategy: strategy,
          });
        }
      }
    }

    return dynamicFields;
  }
}
