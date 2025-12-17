/**
 * Central Timeout Configuration
 *
 * All timeout values should be imported from this module to ensure
 * consistent behavior across the codebase.
 *
 * Timeout categories:
 * - PAGE: Full page load operations
 * - TIER: Individual tier attempts in tiered fetcher
 * - SELECTOR: Waiting for DOM elements
 * - SCRIPT: Script execution in lightweight renderer
 * - NETWORK: HTTP fetch operations
 * - BOT_CHALLENGE: Waiting for bot challenges to resolve
 * - UI_INTERACTION: Small delays for UI interactions
 */

/**
 * Default timeout values in milliseconds
 */
export const TIMEOUTS = {
  /**
   * Full page load timeout (Playwright, full browse operations)
   * Used when loading a complete page with all resources
   */
  PAGE_LOAD: 30000,

  /**
   * Tier attempt timeout
   * Maximum time for a single tier (intelligence, lightweight, playwright) to complete
   */
  TIER_ATTEMPT: 30000,

  /**
   * Selector wait timeout
   * Time to wait for a specific DOM selector to appear
   */
  SELECTOR_WAIT: 5000,

  /**
   * Script execution timeout (lightweight renderer)
   * Maximum time for a single script to execute
   */
  SCRIPT_EXECUTION: 5000,

  /**
   * Network fetch timeout
   * Time for HTTP fetch operations (Content Intelligence, API calls)
   */
  NETWORK_FETCH: 30000,

  /**
   * Bot challenge timeout
   * Maximum time to wait for bot challenge resolution
   */
  BOT_CHALLENGE: 30000,

  /**
   * Cookie banner dismissal delay
   * Wait time after clicking cookie accept button
   */
  COOKIE_BANNER: 500,

  /**
   * Scroll load delay
   * Wait time between scroll steps for lazy-loaded content
   */
  SCROLL_STEP: 300,

  /**
   * Post-scroll delay
   * Wait time after scrolling for content to settle
   */
  SCROLL_SETTLE: 500,

  /**
   * Bot challenge check interval
   * Interval between bot challenge status checks
   */
  BOT_CHECK_INTERVAL: 1000,

  /**
   * Post-click delay
   * Wait time after clicking navigation elements
   */
  POST_CLICK: 500,

  /**
   * Initial page stabilization delay
   * Brief wait after page load for initial scripts to execute
   */
  PAGE_STABILIZE: 1000,

  /**
   * Post-challenge delay (Cloudflare)
   * Wait time after Cloudflare challenge detected
   */
  CLOUDFLARE_WAIT: 2000,

  /**
   * Post-CAPTCHA delay
   * Wait time after CAPTCHA detected (requires manual intervention)
   */
  CAPTCHA_WAIT: 1000,

  /**
   * Failure backoff delay
   * Extra delay when recent failures detected for a domain
   */
  FAILURE_BACKOFF: 5000,

  /**
   * Max bot challenge wait time
   * Maximum time to wait for bot challenge resolution
   */
  BOT_CHALLENGE_MAX: 15000,
} as const;

/**
 * Type for timeout keys
 */
export type TimeoutKey = keyof typeof TIMEOUTS;

/**
 * Get a timeout value with optional override
 *
 * @param key - The timeout key
 * @param override - Optional override value (if provided, takes precedence)
 * @returns The timeout value in milliseconds
 */
export function getTimeout(key: TimeoutKey, override?: number): number {
  return override ?? TIMEOUTS[key];
}

/**
 * Create a timeout configuration object from options
 *
 * @param options - Object with optional timeout overrides
 * @returns Object with resolved timeout values
 */
export function resolveTimeouts(options: {
  timeout?: number;
  tierTimeout?: number;
  selectorTimeout?: number;
  scriptTimeout?: number;
} = {}): {
  pageLoad: number;
  tierAttempt: number;
  selectorWait: number;
  scriptExecution: number;
} {
  return {
    pageLoad: options.timeout ?? TIMEOUTS.PAGE_LOAD,
    tierAttempt: options.tierTimeout ?? options.timeout ?? TIMEOUTS.TIER_ATTEMPT,
    selectorWait: options.selectorTimeout ?? TIMEOUTS.SELECTOR_WAIT,
    scriptExecution: options.scriptTimeout ?? TIMEOUTS.SCRIPT_EXECUTION,
  };
}
