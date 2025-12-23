/**
 * Error Taxonomy Types and Classification (CX-004)
 *
 * Provides structured error responses with:
 * - Error categories for high-level classification
 * - Error codes for programmatic handling
 * - Recommended actions for LLM recovery strategies
 * - Retryability indicators
 */

/**
 * High-level error categories for classification
 */
export type ErrorCategory =
  | 'network'      // Connection failures, timeouts, DNS issues
  | 'http'         // HTTP status code errors (4xx, 5xx)
  | 'auth'         // Authentication/authorization issues
  | 'rate_limit'   // Rate limiting/throttling
  | 'content'      // Content extraction failures
  | 'validation'   // Content validation failures
  | 'security'     // URL safety / SSRF protection
  | 'browser'      // Playwright/browser issues
  | 'config'       // Configuration errors
  | 'site_change'  // Site structure changed
  | 'blocked'      // Bot detection/blocking
  | 'internal';    // Server-side internal errors

/**
 * Machine-readable error codes for programmatic handling
 */
export type ErrorCode =
  // Network errors
  | 'NETWORK_TIMEOUT'
  | 'NETWORK_CONNECTION_REFUSED'
  | 'NETWORK_DNS_FAILURE'
  | 'NETWORK_SOCKET_ERROR'
  | 'NETWORK_UNREACHABLE'
  // HTTP errors
  | 'HTTP_BAD_REQUEST'           // 400
  | 'HTTP_UNAUTHORIZED'          // 401
  | 'HTTP_FORBIDDEN'             // 403
  | 'HTTP_NOT_FOUND'             // 404
  | 'HTTP_METHOD_NOT_ALLOWED'    // 405
  | 'HTTP_GONE'                  // 410
  | 'HTTP_TOO_MANY_REQUESTS'     // 429
  | 'HTTP_SERVER_ERROR'          // 500
  | 'HTTP_BAD_GATEWAY'           // 502
  | 'HTTP_SERVICE_UNAVAILABLE'   // 503
  | 'HTTP_GATEWAY_TIMEOUT'       // 504
  // Auth errors
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_CREDENTIALS_MISSING'
  | 'AUTH_CREDENTIALS_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  // Rate limit errors
  | 'RATE_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_BACKOFF_REQUIRED'
  // Content errors
  | 'CONTENT_EMPTY'
  | 'CONTENT_REQUIRES_JS'
  | 'CONTENT_EXTRACTION_FAILED'
  | 'CONTENT_FORMAT_UNEXPECTED'
  // Validation errors
  | 'VALIDATION_CONTENT_TOO_SHORT'
  | 'VALIDATION_PATTERN_MISMATCH'
  | 'VALIDATION_MISSING_ELEMENTS'
  | 'VALIDATION_INCOMPLETE_RENDER'
  // Security errors
  | 'SECURITY_PRIVATE_IP'
  | 'SECURITY_LOCALHOST'
  | 'SECURITY_METADATA_ENDPOINT'
  | 'SECURITY_BLOCKED_PROTOCOL'
  | 'SECURITY_BLOCKED_HOSTNAME'
  // Browser errors
  | 'BROWSER_NOT_INSTALLED'
  | 'BROWSER_CRASHED'
  | 'BROWSER_ELEMENT_NOT_FOUND'
  | 'BROWSER_NAVIGATION_FAILED'
  | 'BROWSER_TIMEOUT'
  // Config errors
  | 'CONFIG_MISSING_ARGUMENT'
  | 'CONFIG_INVALID_OPTION'
  | 'CONFIG_UNKNOWN_TOOL'
  | 'CONFIG_INVALID_URL'
  // Site change errors
  | 'SITE_STRUCTURE_CHANGED'
  | 'SITE_SELECTORS_OUTDATED'
  | 'SITE_API_CHANGED'
  // Blocked errors
  | 'BLOCKED_CAPTCHA'
  | 'BLOCKED_CHALLENGE_PAGE'
  | 'BLOCKED_BOT_DETECTION'
  | 'BLOCKED_GEO_RESTRICTED'
  // Internal errors
  | 'INTERNAL_ERROR'
  | 'INTERNAL_SKILL_ERROR';

/**
 * Actionable recommendation for LLM clients
 */
export interface RecommendedAction {
  /** Action identifier (e.g., "retry", "wait", "refresh_session") */
  action: string;

  /** Human-readable description of what to do */
  description: string;

  /** Suggested wait time in milliseconds before action */
  suggestedDelayMs?: number;

  /** MCP tool that might help resolve the issue */
  toolToUse?: string;

  /** Suggested parameters for the tool */
  parameters?: Record<string, unknown>;

  /** Priority of this action (lower = try first) */
  priority: number;
}

/**
 * Context about the error
 */
export interface ErrorContext {
  url?: string;
  domain?: string;
  tier?: string;
  strategy?: string;
  attemptNumber?: number;
  elapsed?: number;
}

/**
 * Structured error response with taxonomy and recommendations
 */
export interface StructuredError {
  /** Human-readable error message (backward compatible) */
  error: string;

  /** High-level error category */
  category: ErrorCategory;

  /** Specific error code for programmatic handling */
  code: ErrorCode;

  /** HTTP status code if applicable */
  httpStatus?: number;

  /** Whether this error is retryable */
  retryable: boolean;

  /** Recommended actions for recovery */
  recommendedActions: RecommendedAction[];

  /** Additional context about the error */
  context?: ErrorContext;
}

/**
 * Result of error classification
 */
export interface ErrorClassification {
  category: ErrorCategory;
  code: ErrorCode;
  httpStatus?: number;
}

/**
 * Classify an HTTP status code into category and code
 */
function classifyHttpStatus(status: number): ErrorClassification {
  switch (status) {
    case 400: return { category: 'http', code: 'HTTP_BAD_REQUEST', httpStatus: status };
    case 401: return { category: 'auth', code: 'AUTH_CREDENTIALS_INVALID', httpStatus: status };
    case 403: return { category: 'http', code: 'HTTP_FORBIDDEN', httpStatus: status };
    case 404: return { category: 'http', code: 'HTTP_NOT_FOUND', httpStatus: status };
    case 405: return { category: 'http', code: 'HTTP_METHOD_NOT_ALLOWED', httpStatus: status };
    case 410: return { category: 'http', code: 'HTTP_GONE', httpStatus: status };
    case 429: return { category: 'rate_limit', code: 'RATE_LIMIT_EXCEEDED', httpStatus: status };
    case 500: return { category: 'http', code: 'HTTP_SERVER_ERROR', httpStatus: status };
    case 502: return { category: 'http', code: 'HTTP_BAD_GATEWAY', httpStatus: status };
    case 503: return { category: 'http', code: 'HTTP_SERVICE_UNAVAILABLE', httpStatus: status };
    case 504: return { category: 'http', code: 'HTTP_GATEWAY_TIMEOUT', httpStatus: status };
    default:
      if (status >= 400 && status < 500) return { category: 'http', code: 'HTTP_BAD_REQUEST', httpStatus: status };
      if (status >= 500) return { category: 'http', code: 'HTTP_SERVER_ERROR', httpStatus: status };
      return { category: 'internal', code: 'INTERNAL_ERROR', httpStatus: status };
  }
}

/**
 * Map UrlSafetyError category to error classification
 */
function mapSecurityCategory(category: string): ErrorClassification | null {
  switch (category) {
    case 'private_ip': return { category: 'security', code: 'SECURITY_PRIVATE_IP' };
    case 'localhost': return { category: 'security', code: 'SECURITY_LOCALHOST' };
    case 'link_local':
    case 'metadata': return { category: 'security', code: 'SECURITY_METADATA_ENDPOINT' };
    case 'protocol': return { category: 'security', code: 'SECURITY_BLOCKED_PROTOCOL' };
    case 'blocked_hostname': return { category: 'security', code: 'SECURITY_BLOCKED_HOSTNAME' };
    default: return null;
  }
}

/**
 * Context for error classification
 */
export interface ClassificationContext {
  httpStatus?: number;
  securityCategory?: string;
}

/**
 * Classify an error into category and code based on message patterns
 */
export function classifyError(
  error: Error | string,
  context?: ClassificationContext
): ErrorClassification {
  const message = (error instanceof Error ? error.message : error).toLowerCase();

  // Check for HTTP status first (most specific)
  if (context?.httpStatus) {
    return classifyHttpStatus(context.httpStatus);
  }

  // Security errors (from UrlSafetyError)
  if (context?.securityCategory) {
    const securityResult = mapSecurityCategory(context.securityCategory);
    if (securityResult) return securityResult;
  }

  // Pattern matching for error messages

  // HTTP status in message (check first for more specific classification)
  const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1]);
    return classifyHttpStatus(status);
  }

  // Network errors
  if ((message.includes('timeout') || message.includes('timed out')) && !message.includes('gateway')) {
    return { category: 'network', code: 'NETWORK_TIMEOUT' };
  }
  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return { category: 'network', code: 'NETWORK_CONNECTION_REFUSED' };
  }
  if (message.includes('dns') || message.includes('getaddrinfo') || message.includes('enotfound')) {
    return { category: 'network', code: 'NETWORK_DNS_FAILURE' };
  }
  if (message.includes('socket') || message.includes('econnreset') || message.includes('epipe')) {
    return { category: 'network', code: 'NETWORK_SOCKET_ERROR' };
  }
  if (message.includes('net::')) {
    return { category: 'network', code: 'NETWORK_UNREACHABLE' };
  }

  // Security errors
  if (message.includes('private ip')) {
    return { category: 'security', code: 'SECURITY_PRIVATE_IP' };
  }
  if (message.includes('localhost') || message.includes('loopback')) {
    return { category: 'security', code: 'SECURITY_LOCALHOST' };
  }
  if (message.includes('metadata endpoint')) {
    return { category: 'security', code: 'SECURITY_METADATA_ENDPOINT' };
  }
  if (message.includes('blocked protocol')) {
    return { category: 'security', code: 'SECURITY_BLOCKED_PROTOCOL' };
  }

  // Browser errors
  if (message.includes('playwright') && (message.includes('not installed') || message.includes('not available'))) {
    return { category: 'browser', code: 'BROWSER_NOT_INSTALLED' };
  }
  if (message.includes('element not found') || message.includes('no element')) {
    return { category: 'browser', code: 'BROWSER_ELEMENT_NOT_FOUND' };
  }
  if (message.includes('navigation failed') || message.includes('page crashed')) {
    return { category: 'browser', code: 'BROWSER_NAVIGATION_FAILED' };
  }

  // Content errors
  if (message.includes('content too short') || message.includes('empty content') || message.includes('no content')) {
    return { category: 'content', code: 'CONTENT_EMPTY' };
  }
  if (message.includes('requires full browser') || message.includes('requires javascript') || message.includes('javascript required')) {
    return { category: 'content', code: 'CONTENT_REQUIRES_JS' };
  }
  if (message.includes('extraction') && message.includes('failed')) {
    return { category: 'content', code: 'CONTENT_EXTRACTION_FAILED' };
  }

  // Validation errors
  if (message.includes('validation') && message.includes('short')) {
    return { category: 'validation', code: 'VALIDATION_CONTENT_TOO_SHORT' };
  }
  if (message.includes('incomplete marker') || message.includes('loading...') || message.includes('incomplete render')) {
    return { category: 'validation', code: 'VALIDATION_INCOMPLETE_RENDER' };
  }

  // Auth errors
  if (message.includes('session') && (message.includes('expired') || message.includes('invalid'))) {
    return { category: 'auth', code: 'AUTH_SESSION_EXPIRED' };
  }
  if (message.includes('credentials') && message.includes('missing')) {
    return { category: 'auth', code: 'AUTH_CREDENTIALS_MISSING' };
  }
  if (message.includes('unauthorized') || message.includes('authentication required')) {
    return { category: 'auth', code: 'AUTH_CREDENTIALS_INVALID' };
  }

  // Rate limit
  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('throttl')) {
    return { category: 'rate_limit', code: 'RATE_LIMIT_EXCEEDED' };
  }

  // Config errors
  if (message.includes('missing argument') || message.includes('required parameter')) {
    return { category: 'config', code: 'CONFIG_MISSING_ARGUMENT' };
  }
  if (message.includes('unknown tool')) {
    return { category: 'config', code: 'CONFIG_UNKNOWN_TOOL' };
  }
  if (message.includes('invalid') && message.includes('url')) {
    return { category: 'config', code: 'CONFIG_INVALID_URL' };
  }
  if (message.includes('invalid') && (message.includes('option') || message.includes('parameter'))) {
    return { category: 'config', code: 'CONFIG_INVALID_OPTION' };
  }

  // Blocked
  if (message.includes('captcha')) {
    return { category: 'blocked', code: 'BLOCKED_CAPTCHA' };
  }
  if (message.includes('challenge') || message.includes('verify you are human')) {
    return { category: 'blocked', code: 'BLOCKED_CHALLENGE_PAGE' };
  }
  if (message.includes('blocked') || message.includes('bot detection') || message.includes('access denied')) {
    return { category: 'blocked', code: 'BLOCKED_BOT_DETECTION' };
  }

  // Site change
  if (message.includes('selector') && (message.includes('outdated') || message.includes('not found'))) {
    return { category: 'site_change', code: 'SITE_SELECTORS_OUTDATED' };
  }
  if (message.includes('structure') && message.includes('changed')) {
    return { category: 'site_change', code: 'SITE_STRUCTURE_CHANGED' };
  }

  // Skill errors
  if (message.includes('skill') && (message.includes('failed') || message.includes('error'))) {
    return { category: 'internal', code: 'INTERNAL_SKILL_ERROR' };
  }

  // Default to internal error
  return { category: 'internal', code: 'INTERNAL_ERROR' };
}

/**
 * Determine if an error is retryable based on category and code
 */
export function isRetryable(category: ErrorCategory, code: ErrorCode): boolean {
  // Not retryable
  if (category === 'security') return false;
  if (category === 'config') return false;
  if (code === 'HTTP_NOT_FOUND' || code === 'HTTP_GONE') return false;
  if (code === 'BROWSER_NOT_INSTALLED') return false;

  // Retryable
  if (category === 'network') return true;
  if (category === 'rate_limit') return true;
  if (code === 'HTTP_BAD_GATEWAY' || code === 'HTTP_SERVICE_UNAVAILABLE' || code === 'HTTP_GATEWAY_TIMEOUT') return true;
  if (code === 'AUTH_SESSION_EXPIRED') return true;
  if (category === 'content' || category === 'validation') return true;
  if (category === 'blocked') return true;
  if (category === 'site_change') return true;

  return false;
}

/**
 * Get recommended actions based on error category and code
 */
export function getRecommendedActions(
  category: ErrorCategory,
  code: ErrorCode,
  context?: ErrorContext
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  switch (category) {
    case 'network':
      actions.push({
        action: 'retry',
        description: 'Retry the request after a brief delay',
        suggestedDelayMs: 2000,
        priority: 1,
      });
      if (code === 'NETWORK_TIMEOUT') {
        actions.push({
          action: 'increase_timeout',
          description: 'Try with a longer timeout setting',
          priority: 2,
        });
      }
      actions.push({
        action: 'use_cache',
        description: 'Check if cached content is available',
        toolToUse: 'smart_browse',
        parameters: { checkForChanges: true },
        priority: 3,
      });
      break;

    case 'http':
      if (code === 'HTTP_BAD_GATEWAY' || code === 'HTTP_SERVICE_UNAVAILABLE' || code === 'HTTP_GATEWAY_TIMEOUT') {
        actions.push({
          action: 'retry_with_backoff',
          description: 'Server is temporarily unavailable. Retry with exponential backoff.',
          suggestedDelayMs: 5000,
          priority: 1,
        });
      }
      if (code === 'HTTP_NOT_FOUND' || code === 'HTTP_GONE') {
        actions.push({
          action: 'verify_url',
          description: 'Verify the URL is correct and the resource exists',
          priority: 1,
        });
        actions.push({
          action: 'try_archive',
          description: 'Try retrieving from web archive',
          priority: 2,
        });
      }
      if (code === 'HTTP_FORBIDDEN') {
        actions.push({
          action: 'use_session',
          description: 'Try with authenticated session',
          toolToUse: 'get_session_health',
          priority: 1,
        });
      }
      break;

    case 'auth':
      if (code === 'AUTH_CREDENTIALS_MISSING') {
        // For missing credentials, configure auth is the primary action
        actions.push({
          action: 'configure_auth',
          description: 'Configure API authentication credentials',
          toolToUse: 'configure_api_auth',
          parameters: context?.domain ? { domain: context.domain } : undefined,
          priority: 1,
        });
      } else {
        // For other auth errors (session expired, invalid token, etc.)
        actions.push({
          action: 'refresh_session',
          description: 'Refresh or re-establish the session',
          toolToUse: 'save_session',
          priority: 1,
        });
      }
      actions.push({
        action: 'check_session_health',
        description: 'Check the health status of saved sessions',
        toolToUse: 'get_session_health',
        parameters: context?.domain ? { domain: context.domain } : undefined,
        priority: 2,
      });
      break;

    case 'rate_limit':
      actions.push({
        action: 'wait_and_retry',
        description: 'Wait before retrying to respect rate limits',
        suggestedDelayMs: 30000,
        priority: 1,
      });
      actions.push({
        action: 'reduce_frequency',
        description: 'Reduce request frequency for this domain',
        priority: 2,
      });
      actions.push({
        action: 'configure_api_key',
        description: 'Configure API key for higher rate limits',
        toolToUse: 'configure_api_auth',
        priority: 3,
      });
      break;

    case 'content':
      if (code === 'CONTENT_REQUIRES_JS') {
        actions.push({
          action: 'use_browser_tier',
          description: 'Use Playwright browser tier for JavaScript-heavy sites',
          toolToUse: 'set_domain_tier',
          parameters: context?.domain ? { domain: context.domain, tier: 'playwright' } : undefined,
          priority: 1,
        });
      }
      if (code === 'CONTENT_EMPTY') {
        actions.push({
          action: 'wait_for_content',
          description: 'Wait longer for content to load',
          toolToUse: 'smart_browse',
          parameters: { waitForSelector: 'article, main, .content' },
          priority: 1,
        });
        actions.push({
          action: 'scroll_to_load',
          description: 'Scroll to trigger lazy-loaded content',
          toolToUse: 'smart_browse',
          parameters: { scrollToLoad: true },
          priority: 2,
        });
      }
      if (code === 'CONTENT_EXTRACTION_FAILED') {
        actions.push({
          action: 'try_different_selector',
          description: 'Try using different content selectors',
          priority: 1,
        });
      }
      break;

    case 'validation':
      actions.push({
        action: 'try_different_selector',
        description: 'Try using different content selectors',
        toolToUse: 'smart_browse',
        parameters: { contentType: 'main_content' },
        priority: 1,
      });
      if (code === 'VALIDATION_INCOMPLETE_RENDER') {
        actions.push({
          action: 'use_higher_tier',
          description: 'Use a higher rendering tier for complete content',
          priority: 2,
        });
      }
      break;

    case 'security':
      actions.push({
        action: 'use_public_url',
        description: 'Use a publicly accessible URL instead of private/internal addresses',
        priority: 1,
      });
      break;

    case 'browser':
      if (code === 'BROWSER_NOT_INSTALLED') {
        actions.push({
          action: 'install_playwright',
          description: 'Install Playwright: npm install playwright && npx playwright install chromium',
          priority: 1,
        });
        actions.push({
          action: 'use_lightweight_tier',
          description: 'Use lightweight rendering tier instead',
          toolToUse: 'set_domain_tier',
          parameters: context?.domain ? { domain: context.domain, tier: 'lightweight' } : undefined,
          priority: 2,
        });
      }
      if (code === 'BROWSER_ELEMENT_NOT_FOUND') {
        actions.push({
          action: 'wait_for_selector',
          description: 'Wait for specific DOM selector to appear',
          toolToUse: 'smart_browse',
          parameters: { waitForSelector: 'body' },
          priority: 1,
        });
      }
      if (code === 'BROWSER_CRASHED' || code === 'BROWSER_NAVIGATION_FAILED') {
        actions.push({
          action: 'retry',
          description: 'Retry the request',
          suggestedDelayMs: 2000,
          priority: 1,
        });
      }
      break;

    case 'config':
      actions.push({
        action: 'check_parameters',
        description: 'Review the tool parameters and ensure required fields are provided',
        priority: 1,
      });
      break;

    case 'site_change':
      actions.push({
        action: 'clear_patterns',
        description: 'Clear learned patterns for this domain and re-learn',
        priority: 1,
      });
      actions.push({
        action: 'browse_fresh',
        description: 'Browse the page again with learning enabled to discover new patterns',
        toolToUse: 'smart_browse',
        parameters: { enableLearning: true },
        priority: 2,
      });
      break;

    case 'blocked':
      actions.push({
        action: 'use_session',
        description: 'Try with authenticated session to avoid bot detection',
        toolToUse: 'save_session',
        priority: 1,
      });
      actions.push({
        action: 'wait_longer',
        description: 'Wait longer before retrying',
        suggestedDelayMs: 60000,
        priority: 2,
      });
      if (code === 'BLOCKED_CAPTCHA') {
        actions.push({
          action: 'manual_intervention',
          description: 'Manual intervention may be required to solve CAPTCHA',
          priority: 3,
        });
      }
      break;

    case 'internal':
      actions.push({
        action: 'retry',
        description: 'Retry the request',
        suggestedDelayMs: 1000,
        priority: 1,
      });
      actions.push({
        action: 'report_issue',
        description: 'If the error persists, report this issue for investigation',
        priority: 2,
      });
      break;
  }

  return actions;
}

/**
 * Build a structured error response from an error
 */
export function buildStructuredError(
  error: Error | string,
  classificationContext?: ClassificationContext,
  errorContext?: ErrorContext
): StructuredError {
  const message = error instanceof Error ? error.message : error;
  const classification = classifyError(error, classificationContext);
  const retryable = isRetryable(classification.category, classification.code);
  const recommendedActions = getRecommendedActions(classification.category, classification.code, errorContext);

  return {
    error: message,
    category: classification.category,
    code: classification.code,
    httpStatus: classification.httpStatus,
    retryable,
    recommendedActions,
    context: errorContext,
  };
}
