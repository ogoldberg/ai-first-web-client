/**
 * Error Handling Examples for Unbrowser Connect
 *
 * This file demonstrates comprehensive error handling patterns:
 * - All error codes and their meanings
 * - Recovery strategies for each error type
 * - Retry logic with exponential backoff
 * - Error logging and monitoring integration
 * - Graceful degradation patterns
 *
 * Run with: npx tsx examples/error-handling.ts
 */

import {
  createConnect,
  type FetchResult,
  type FetchError,
  type ConnectError,
  type ConnectErrorCode,
} from '@unbrowser/connect';

// =============================================================================
// Configuration with Error Handling
// =============================================================================

const connect = createConnect({
  appId: 'error-handling-example',
  apiKey: process.env.UNBROWSER_API_KEY || 'ub_test_demo',
  debug: true,

  ui: {
    showProgress: true,
    showErrors: true, // Built-in error toasts
    errorDuration: 5000,
  },

  // Global error handler - catches all errors
  onError: (error: ConnectError) => {
    // Log to your error tracking service
    logToErrorService(error);
  },
});

// =============================================================================
// Error Logging (simulated)
// =============================================================================

function logToErrorService(error: ConnectError): void {
  // In production, send to Sentry, DataDog, etc.
  console.log('[ErrorService]', {
    code: error.code,
    message: error.message,
    timestamp: new Date().toISOString(),
    // Add context like user ID, session ID, etc.
  });
}

// =============================================================================
// Type Guards and Helpers
// =============================================================================

function isSuccess(result: FetchResult | FetchError): result is FetchResult {
  return result.success === true;
}

function isError(result: FetchResult | FetchError): result is FetchError {
  return result.success === false;
}

// =============================================================================
// Error Code Reference
// =============================================================================

/**
 * Complete reference of all error codes and their meanings.
 */
const ERROR_CODES: Record<ConnectErrorCode, {
  description: string;
  recoverable: boolean;
  suggestedAction: string;
}> = {
  NETWORK_ERROR: {
    description: 'Network request failed (DNS, connection, etc.)',
    recoverable: true,
    suggestedAction: 'Retry with exponential backoff',
  },
  TIMEOUT: {
    description: 'Request exceeded the configured timeout',
    recoverable: true,
    suggestedAction: 'Retry with longer timeout or reduce extraction scope',
  },
  IFRAME_BLOCKED: {
    description: 'Site blocks iframe embedding (X-Frame-Options)',
    recoverable: true,
    suggestedAction: 'Automatically escalated to popup mode',
  },
  POPUP_BLOCKED: {
    description: 'Browser popup blocker prevented window opening',
    recoverable: true,
    suggestedAction: 'Ensure fetch is called from user gesture (click)',
  },
  POPUP_CLOSED: {
    description: 'User closed popup before content was extracted',
    recoverable: true,
    suggestedAction: 'Ask user to try again and complete the flow',
  },
  USER_CANCELLED: {
    description: 'User cancelled the auth prompt',
    recoverable: false,
    suggestedAction: 'Respect user choice, offer alternative or try later',
  },
  EXTRACTION_FAILED: {
    description: 'Could not extract content from page',
    recoverable: true,
    suggestedAction: 'Check selectors, try different extraction method',
  },
  INVALID_URL: {
    description: 'Provided URL is malformed',
    recoverable: false,
    suggestedAction: 'Validate URL before calling fetch',
  },
  INIT_FAILED: {
    description: 'SDK initialization failed',
    recoverable: true,
    suggestedAction: 'Check API key, network connectivity',
  },
};

// =============================================================================
// Example 1: Basic Error Handling
// =============================================================================

async function example1_basicErrorHandling(): Promise<void> {
  console.log('\n=== Example 1: Basic Error Handling ===\n');

  const result = await connect.fetch({
    url: 'https://example.com',
    extract: { text: true },
  });

  if (isSuccess(result)) {
    console.log('Success! Title:', result.content.title);
  } else {
    // Always handle errors explicitly
    console.error('Error:', result.error.code, '-', result.error.message);

    // Log to error service
    logToErrorService(result.error);
  }
}

// =============================================================================
// Example 2: Comprehensive Error Switch
// =============================================================================

async function example2_comprehensiveErrorSwitch(): Promise<void> {
  console.log('\n=== Example 2: Comprehensive Error Handling ===\n');

  const result = await connect.fetch({
    url: 'https://protected-site.example.com',
    mode: 'popup',
    timeout: 10000,
    extract: { markdown: true },
  });

  if (isSuccess(result)) {
    console.log('Content fetched successfully');
    return;
  }

  // Handle each error type appropriately
  const { code, message } = result.error;
  const errorInfo = ERROR_CODES[code];

  console.log(`Error: ${code}`);
  console.log(`Description: ${errorInfo.description}`);
  console.log(`Recoverable: ${errorInfo.recoverable}`);
  console.log(`Suggested Action: ${errorInfo.suggestedAction}`);

  switch (code) {
    case 'NETWORK_ERROR':
      console.log('\nAction: Will retry automatically...');
      // Retry logic shown in Example 3
      break;

    case 'TIMEOUT':
      console.log('\nAction: Increasing timeout and retrying...');
      // Could retry with longer timeout
      break;

    case 'IFRAME_BLOCKED':
      console.log('\nAction: Connect handles this automatically by switching to popup');
      break;

    case 'POPUP_BLOCKED':
      console.log('\nAction: Show message asking user to allow popups');
      // showNotification('Please allow popups for this site to continue');
      break;

    case 'POPUP_CLOSED':
      console.log('\nAction: User closed popup - offer retry');
      // showRetryDialog('You closed the window before completing. Try again?');
      break;

    case 'USER_CANCELLED':
      console.log('\nAction: User chose not to proceed - respect their choice');
      // Show alternative content or graceful fallback
      break;

    case 'EXTRACTION_FAILED':
      console.log('\nAction: Try simpler extraction');
      // Retry with just text extraction
      break;

    case 'INVALID_URL':
      console.log('\nAction: Fix the URL before retrying');
      break;

    case 'INIT_FAILED':
      console.log('\nAction: Check configuration and network');
      break;

    default:
      console.log('\nAction: Unknown error - log and alert user');
      // Exhaustive check - TypeScript will catch unhandled codes
      const _exhaustive: never = code;
  }
}

// =============================================================================
// Example 3: Retry with Exponential Backoff
// =============================================================================

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCodes: ConnectErrorCode[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableCodes: ['NETWORK_ERROR', 'TIMEOUT', 'EXTRACTION_FAILED'],
};

async function fetchWithRetry(
  url: string,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<FetchResult | FetchError> {
  let lastError: FetchError | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (attempt > 0) {
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        options.maxDelayMs
      );
      console.log(`Retry ${attempt}/${options.maxRetries} after ${Math.round(delay)}ms...`);
      await sleep(delay);
    }

    const result = await connect.fetch({
      url,
      timeout: 15000 + (attempt * 5000), // Increase timeout on retries
      extract: { markdown: true },
    });

    if (isSuccess(result)) {
      if (attempt > 0) {
        console.log(`Succeeded on retry ${attempt}`);
      }
      return result;
    }

    lastError = result;

    // Check if error is retryable
    if (!options.retryableCodes.includes(result.error.code)) {
      console.log(`Error ${result.error.code} is not retryable`);
      return result;
    }

    console.log(`Attempt ${attempt + 1} failed: ${result.error.code}`);
  }

  console.log('All retries exhausted');
  return lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function example3_retryWithBackoff(): Promise<void> {
  console.log('\n=== Example 3: Retry with Exponential Backoff ===\n');

  const result = await fetchWithRetry('https://flaky-server.example.com/data');

  if (isSuccess(result)) {
    console.log('Eventually succeeded!');
  } else {
    console.log('Failed after all retries:', result.error.code);
  }
}

// =============================================================================
// Example 4: Graceful Degradation
// =============================================================================

interface ContentResult {
  source: 'full' | 'partial' | 'cached' | 'fallback';
  content: string;
}

async function fetchWithDegradation(url: string): Promise<ContentResult> {
  // Try full extraction first
  let result = await connect.fetch({
    url,
    extract: {
      markdown: true,
      selectors: {
        title: 'h1',
        content: 'article, .main-content, main',
        author: '.author, [rel="author"]',
        date: 'time, .date, .published',
      },
    },
  });

  if (isSuccess(result) && result.content.selectors?.content) {
    return {
      source: 'full',
      content: result.content.markdown || result.content.text || '',
    };
  }

  // Degrade to simpler extraction
  console.log('Full extraction failed, trying simple markdown...');
  result = await connect.fetch({
    url,
    extract: { markdown: true },
  });

  if (isSuccess(result) && result.content.markdown) {
    return {
      source: 'partial',
      content: result.content.markdown,
    };
  }

  // Degrade to text only
  console.log('Markdown failed, trying text only...');
  result = await connect.fetch({
    url,
    extract: { text: true },
  });

  if (isSuccess(result) && result.content.text) {
    return {
      source: 'partial',
      content: result.content.text,
    };
  }

  // Check cache (simulated)
  console.log('Live fetch failed, checking cache...');
  const cached = checkCache(url);
  if (cached) {
    return {
      source: 'cached',
      content: cached,
    };
  }

  // Return fallback
  console.log('No cache available, using fallback...');
  return {
    source: 'fallback',
    content: `Unable to fetch content from ${url}. Please try again later.`,
  };
}

function checkCache(url: string): string | null {
  // In real app, check localStorage, IndexedDB, or in-memory cache
  return null;
}

async function example4_gracefulDegradation(): Promise<void> {
  console.log('\n=== Example 4: Graceful Degradation ===\n');

  const result = await fetchWithDegradation('https://example.com');

  console.log('Result source:', result.source);
  console.log('Content preview:', result.content.slice(0, 100) + '...');
}

// =============================================================================
// Example 5: Circuit Breaker Pattern
// =============================================================================

class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private resetTimeMs: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeMs) {
        this.state = 'half-open';
        console.log('[CircuitBreaker] Entering half-open state');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      console.log('[CircuitBreaker] Circuit closed');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      console.log('[CircuitBreaker] Circuit opened after', this.failures, 'failures');
    }
  }

  getState(): string {
    return this.state;
  }
}

async function example5_circuitBreaker(): Promise<void> {
  console.log('\n=== Example 5: Circuit Breaker Pattern ===\n');

  const breaker = new CircuitBreaker(3, 5000); // Open after 3 failures, reset after 5s

  async function safeFetch(url: string): Promise<FetchResult | null> {
    try {
      return await breaker.execute(async () => {
        const result = await connect.fetch({
          url,
          timeout: 5000,
          extract: { text: true },
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        return result;
      });
    } catch (error) {
      console.log('Fetch failed:', (error as Error).message);
      console.log('Circuit state:', breaker.getState());
      return null;
    }
  }

  // Simulate multiple requests
  const urls = [
    'https://example.com',
    'https://failing-site.example.com',
    'https://another-site.example.com',
  ];

  for (const url of urls) {
    console.log(`\nFetching: ${url}`);
    const result = await safeFetch(url);
    if (result) {
      console.log('Success:', result.content.title);
    }
  }
}

// =============================================================================
// Example 6: Error Aggregation for Batch Operations
// =============================================================================

interface BatchErrorSummary {
  total: number;
  succeeded: number;
  failed: number;
  errorsByCode: Record<string, number>;
  criticalErrors: FetchError[];
}

async function example6_batchErrorAggregation(): Promise<void> {
  console.log('\n=== Example 6: Batch Error Aggregation ===\n');

  const urls = [
    'https://example.com',
    'https://httpbin.org/html',
    'https://invalid-domain-xyz.com', // Will fail
    'https://example.org',
  ];

  const batchResult = await connect.batchFetch({
    urls,
    options: { extract: { text: true } },
    concurrency: 2,
    continueOnError: true,
  });

  // Aggregate errors for analysis
  const summary: BatchErrorSummary = {
    total: batchResult.total,
    succeeded: batchResult.succeeded,
    failed: batchResult.failed,
    errorsByCode: {},
    criticalErrors: [],
  };

  for (const result of batchResult.results) {
    if (isError(result)) {
      const code = result.error.code;
      summary.errorsByCode[code] = (summary.errorsByCode[code] || 0) + 1;

      // Track critical errors for alerting
      if (['INIT_FAILED', 'INVALID_URL'].includes(code)) {
        summary.criticalErrors.push(result);
      }
    }
  }

  console.log('Batch Summary:');
  console.log(`  Total: ${summary.total}`);
  console.log(`  Succeeded: ${summary.succeeded}`);
  console.log(`  Failed: ${summary.failed}`);
  console.log('  Errors by code:', summary.errorsByCode);

  if (summary.criticalErrors.length > 0) {
    console.log('\nCritical errors that need attention:');
    for (const err of summary.criticalErrors) {
      console.log(`  - ${err.error.code}: ${err.error.message}`);
    }
  }
}

// =============================================================================
// Example 7: Custom Error Types for Application Logic
// =============================================================================

// Application-specific error classification
type AppErrorType = 'auth_required' | 'content_unavailable' | 'rate_limited' | 'unknown';

function classifyError(error: FetchError): AppErrorType {
  switch (error.error.code) {
    case 'USER_CANCELLED':
    case 'POPUP_BLOCKED':
    case 'POPUP_CLOSED':
      return 'auth_required';

    case 'EXTRACTION_FAILED':
    case 'TIMEOUT':
      return 'content_unavailable';

    case 'NETWORK_ERROR':
      // Check message for rate limiting indicators
      if (error.error.message.toLowerCase().includes('429') ||
          error.error.message.toLowerCase().includes('rate limit')) {
        return 'rate_limited';
      }
      return 'content_unavailable';

    default:
      return 'unknown';
  }
}

async function example7_customErrorTypes(): Promise<void> {
  console.log('\n=== Example 7: Custom Error Classification ===\n');

  const result = await connect.fetch({
    url: 'https://example.com/protected',
    mode: 'popup',
    extract: { text: true },
  });

  if (isSuccess(result)) {
    console.log('Success!');
    return;
  }

  const errorType = classifyError(result);

  switch (errorType) {
    case 'auth_required':
      console.log('Application action: Show login prompt');
      // showLoginModal();
      break;

    case 'content_unavailable':
      console.log('Application action: Show cached content or placeholder');
      // showCachedContent();
      break;

    case 'rate_limited':
      console.log('Application action: Wait and retry, show "please wait"');
      // showRateLimitMessage();
      break;

    case 'unknown':
      console.log('Application action: Log error, show generic message');
      // showGenericError();
      break;
  }
}

// =============================================================================
// Run All Examples
// =============================================================================

async function main(): Promise<void> {
  console.log('Unbrowser Connect - Error Handling Examples');
  console.log('===========================================\n');

  try {
    await connect.init();

    await example1_basicErrorHandling();
    await example2_comprehensiveErrorSwitch();
    await example3_retryWithBackoff();
    await example4_gracefulDegradation();
    await example5_circuitBreaker();
    await example6_batchErrorAggregation();
    await example7_customErrorTypes();

    console.log('\n===========================================');
    console.log('Error handling examples completed!');
  } catch (error) {
    console.error('Unexpected error:', error);
  } finally {
    connect.destroy();
  }
}

main();
