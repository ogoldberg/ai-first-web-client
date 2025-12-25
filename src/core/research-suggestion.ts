/**
 * Research Suggestion Generator
 *
 * Generates structured suggestions for LLM-assisted problem solving
 * when the browser encounters issues it can't resolve automatically.
 *
 * This enables a feedback loop where:
 * 1. Browser encounters a problem (blocking, extraction failure, etc.)
 * 2. Returns research suggestion to LLM
 * 3. LLM researches solutions using the browser
 * 4. LLM retries with new parameters or approach
 * 5. Success is learned for future use
 *
 * Problem types handled:
 * - Bot detection/blocking
 * - Content extraction failures
 * - API discovery issues
 * - Authentication challenges
 * - Rate limiting
 * - Complex page structures
 * - JavaScript-heavy sites
 * - Pagination issues
 * - Selector failures
 * - Timeouts
 */

import type {
  BotDetectionType,
  ProblemType,
  ResearchSuggestion,
  ProblemResponse,
  RetryConfig,
} from '../types/index.js';

/**
 * Maximum research depth (LR-005).
 * Limits LLM research attempts to prevent infinite loops.
 * After this many research-assisted retries, the problem should be
 * reported as unresolvable via automated means.
 */
export const MAX_RESEARCH_DEPTH = 2;

/**
 * Trusted sources for bypass research
 * These are curated to provide reliable, technical information
 */
export const TRUSTED_SOURCES = [
  'github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'web.dev',
  'playwright.dev',
  'puppeteer.github.io',
] as const;

/**
 * Get the current year dynamically for search queries
 */
function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Search queries by problem type
 */
function getSearchQueryForProblem(problemType: ProblemType, domain: string, detectionType?: BotDetectionType): string {
  const year = getCurrentYear();

  const queries: Record<ProblemType, string> = {
    bot_detection: detectionType
      ? getBotDetectionSearchQuery(detectionType, year)
      : `web scraping bot detection bypass ${year} ${domain}`,
    extraction_failure: `web scraping content extraction ${year} ${domain} selectors`,
    api_discovery: `${domain} api endpoints documentation ${year}`,
    authentication: `${domain} authentication api login ${year}`,
    rate_limiting: `bypass rate limiting web scraping ${year} best practices`,
    javascript_required: `scrape javascript rendered content ${year} playwright puppeteer`,
    dynamic_content: `scrape dynamic ajax content ${year} wait for element`,
    pagination: `scrape pagination ${year} next page detection`,
    selector_failure: `web scraping robust selectors ${year} fallback strategies`,
    timeout: `web scraping timeout handling ${year} retry strategies`,
    unknown: `web scraping troubleshooting ${year} ${domain}`,
  };

  return queries[problemType];
}

/**
 * Bot detection specific search queries
 */
function getBotDetectionSearchQuery(detectionType: BotDetectionType, year: number): string {
  const queries: Record<BotDetectionType, string> = {
    cloudflare: `bypass cloudflare bot detection ${year} node.js playwright`,
    datadome: `bypass datadome bot protection ${year} puppeteer stealth`,
    perimeterx: `bypass perimeterx human challenge ${year} automation`,
    akamai: `bypass akamai bot manager ${year} web scraping`,
    recaptcha: `handle recaptcha v3 ${year} automated testing playwright`,
    turnstile: `cloudflare turnstile challenge ${year} automation bypass`,
    unknown: `web scraping bot detection bypass ${year}`,
  };

  return queries[detectionType];
}

/**
 * Hints by problem type
 */
function getHintsForProblem(problemType: ProblemType, detectionType?: BotDetectionType): string[] {
  if (problemType === 'bot_detection' && detectionType) {
    return getBotDetectionHints(detectionType);
  }

  const hints: Record<ProblemType, string[]> = {
    bot_detection: [
      'Try with useFullBrowser: true for JavaScript-heavy detection',
      'Add delays between requests (1-3 seconds)',
      'Use realistic browser headers including client hints',
      'Try different User-Agent strings',
      'Check if the site has an API that might be easier to access',
    ],
    extraction_failure: [
      'The page structure may have changed - inspect current DOM',
      'Try multiple selector strategies (CSS, XPath, text content)',
      'Check if content is loaded dynamically via JavaScript',
      'Look for JSON-LD or other structured data alternatives',
      'Try extracting from Google Cache or Archive.org',
    ],
    api_discovery: [
      'Check Network tab for XHR/fetch requests',
      'Look for __NEXT_DATA__ or similar framework data',
      'Check for GraphQL endpoints (/graphql, /api/graphql)',
      'Look for REST patterns in network traffic',
      'Try common API paths: /api/v1/, /api/, /rest/',
    ],
    authentication: [
      'Check if cookies are being preserved across requests',
      'Look for required authentication headers (Authorization, X-API-Key)',
      'Session may have expired - try refreshing login',
      'Check for CSRF tokens that need to be included',
      'OAuth tokens may need to be refreshed',
    ],
    rate_limiting: [
      'Add delays between requests (exponential backoff)',
      'Rotate User-Agent strings',
      'Respect Retry-After headers',
      'Consider using residential proxies',
      'Check if there are API endpoints with higher limits',
    ],
    javascript_required: [
      'Use useFullBrowser: true to execute JavaScript',
      'Wait for specific selectors with waitForSelector',
      'Some frameworks expose data in __NEXT_DATA__ without JS',
      'Try the lightweight renderer before full browser',
      'Check for static versions of the page',
    ],
    dynamic_content: [
      'Use scrollToLoad: true to trigger lazy loading',
      'Wait for network idle with waitFor: networkidle',
      'Wait for specific content selectors',
      'Check for pagination or infinite scroll patterns',
      'Look for API calls that load the dynamic content',
    ],
    pagination: [
      'Look for next/prev buttons or links',
      'Check for page parameter in URL (?page=, &p=)',
      'Look for infinite scroll triggers',
      'Check for load more buttons',
      'API may support limit/offset parameters',
    ],
    selector_failure: [
      'Selectors may have changed - inspect current DOM',
      'Use more robust selectors (data attributes, ARIA labels)',
      'Try text-based selection as fallback',
      'Check if content is inside iframes',
      'Element may be hidden or not yet rendered',
    ],
    timeout: [
      'Increase timeout value',
      'Check if the site is slow or unavailable',
      'Try with waitFor: domcontentloaded instead of load',
      'The site may be blocking - check for bot detection',
      'Try during off-peak hours',
    ],
    unknown: [
      'Check browser console for JavaScript errors',
      'Inspect network requests for failed calls',
      'Try with full browser rendering',
      'Check if the site works in a regular browser',
      'Look for alternative data sources',
    ],
  };

  return hints[problemType];
}

/**
 * Bot detection specific hints
 */
function getBotDetectionHints(detectionType: BotDetectionType): string[] {
  const hints: Record<BotDetectionType, string[]> = {
    cloudflare: [
      'Cloudflare checks JavaScript execution - try useFullBrowser: true',
      'Cloudflare uses TLS fingerprinting - standard Node.js may be detected',
      'Try adding realistic headers like sec-ch-ua and sec-fetch-* headers',
      'Delays between requests can help avoid rate limiting',
      'Some Cloudflare challenges require solving - cannot be automated',
    ],
    datadome: [
      'DataDome uses behavioral analysis - add random delays',
      'DataDome checks mouse movements - requires full browser with realistic behavior',
      'Try different User-Agent strings, preferring mobile browsers',
      'DataDome blocks datacenter IPs - residential proxies may help',
      'Cookie handling is important - ensure cookies are preserved',
    ],
    perimeterx: [
      'PerimeterX uses advanced fingerprinting - stealth plugin recommended',
      'Try emulating different platforms (Windows vs macOS)',
      'PerimeterX analyzes request patterns - add jittered delays',
      'Full browser with devtools disabled is often required',
      'Some sites require solving a puzzle - cannot be fully automated',
    ],
    akamai: [
      'Akamai Bot Manager uses sensor data collection',
      'Try with full browser and longer page load times',
      'Akamai checks request timing patterns',
      'Adding realistic Referer headers can help',
      'Some Akamai challenges require JavaScript execution',
    ],
    recaptcha: [
      'reCAPTCHA v3 scores browser behavior - requires realistic interaction',
      'reCAPTCHA v2 checkbox sometimes passes with full browser',
      'Consider using a CAPTCHA solving service for production',
      'Audio challenges are an alternative but not automatable',
      'High v3 scores require realistic browsing patterns',
    ],
    turnstile: [
      "Turnstile is Cloudflare's CAPTCHA alternative",
      'Non-interactive mode may pass with full browser',
      'Interactive mode requires user action',
      'Try with different browser fingerprints',
      'Managed challenge mode depends on risk score',
    ],
    unknown: [
      'Try with useFullBrowser: true for JavaScript-heavy detection',
      'Add delays between requests (1-3 seconds)',
      'Use realistic browser headers including client hints',
      'Try different User-Agent strings',
      'Check if the site has an API that might be easier to access',
    ],
  };

  return hints[detectionType];
}

/**
 * Retry parameters by problem type
 */
function getRetryParameters(problemType: ProblemType, detectionType?: BotDetectionType): ResearchSuggestion['retryParameters'] {
  const params: Record<ProblemType, ResearchSuggestion['retryParameters']> = {
    bot_detection: ['userAgent', 'headers', 'useFullBrowser', 'delayMs', 'fingerprintSeed'],
    extraction_failure: ['waitForSelector', 'scrollToLoad', 'extractionStrategy'],
    api_discovery: ['headers', 'useFullBrowser'],
    authentication: ['headers'],
    rate_limiting: ['delayMs', 'userAgent'],
    javascript_required: ['useFullBrowser', 'waitForSelector', 'timeout'],
    dynamic_content: ['waitForSelector', 'scrollToLoad', 'useFullBrowser', 'timeout'],
    pagination: ['scrollToLoad', 'waitForSelector'],
    selector_failure: ['waitForSelector', 'extractionStrategy'],
    timeout: ['timeout', 'useFullBrowser'],
    unknown: ['useFullBrowser', 'headers', 'delayMs', 'timeout'],
  };

  // For advanced bot detection, add fingerprint seed
  if (problemType === 'bot_detection' && (detectionType === 'datadome' || detectionType === 'perimeterx')) {
    return [...params[problemType], 'fingerprintSeed'];
  }

  return params[problemType];
}

/**
 * Generate a research suggestion for any problem type
 */
export function generateResearchSuggestion(
  problemType: ProblemType,
  domain: string,
  detectionType?: BotDetectionType
): ResearchSuggestion {
  return {
    problemType,
    searchQuery: getSearchQueryForProblem(problemType, domain, detectionType),
    recommendedSources: [...TRUSTED_SOURCES],
    detectionType,
    retryParameters: getRetryParameters(problemType, detectionType),
    hints: getHintsForProblem(problemType, detectionType),
  };
}

/**
 * Detect the type of bot protection from response content
 */
export function detectBotProtection(
  html: string,
  statusCode?: number,
  headers?: Record<string, string>
): BotDetectionType {
  const lowerHtml = html.toLowerCase();

  // Cloudflare detection
  if (
    lowerHtml.includes('cloudflare') ||
    lowerHtml.includes('cf-browser-verification') ||
    lowerHtml.includes('checking your browser') ||
    lowerHtml.includes('just a moment...') ||
    headers?.['cf-ray']
  ) {
    // Check for Turnstile specifically
    if (lowerHtml.includes('turnstile') || lowerHtml.includes('challenges.cloudflare.com')) {
      return 'turnstile';
    }
    return 'cloudflare';
  }

  // DataDome detection
  if (
    lowerHtml.includes('datadome') ||
    lowerHtml.includes('dd.js') ||
    headers?.['x-datadome']
  ) {
    return 'datadome';
  }

  // PerimeterX detection
  if (
    lowerHtml.includes('perimeterx') ||
    lowerHtml.includes('px-captcha') ||
    lowerHtml.includes('human-challenge') ||
    headers?.['x-px-']
  ) {
    return 'perimeterx';
  }

  // Akamai detection
  if (
    lowerHtml.includes('akamai') ||
    lowerHtml.includes('_abck') ||
    lowerHtml.includes('bm_sz')
  ) {
    return 'akamai';
  }

  // reCAPTCHA detection
  if (
    lowerHtml.includes('recaptcha') ||
    lowerHtml.includes('grecaptcha') ||
    lowerHtml.includes('google.com/recaptcha')
  ) {
    return 'recaptcha';
  }

  return 'unknown';
}

/**
 * Classify a problem based on error characteristics
 */
export function classifyProblem(
  error?: Error | string,
  statusCode?: number,
  html?: string,
  attemptedStrategies: string[] = []
): ProblemType {
  const errorMessage = typeof error === 'string' ? error : error?.message || '';
  const lowerError = errorMessage.toLowerCase();
  const lowerHtml = (html || '').toLowerCase();

  // Check for bot detection first
  if (statusCode === 403 || statusCode === 503) {
    if (html && isBlockedByBotDetection(statusCode, html)) {
      return 'bot_detection';
    }
  }

  // Timeout
  if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
    return 'timeout';
  }

  // Rate limiting
  if (statusCode === 429 || lowerError.includes('rate limit') || lowerError.includes('too many requests')) {
    return 'rate_limiting';
  }

  // Authentication
  if (statusCode === 401 || lowerError.includes('unauthorized') || lowerError.includes('authentication')) {
    return 'authentication';
  }

  // Selector failures
  if (
    lowerError.includes('selector') ||
    lowerError.includes('element not found') ||
    lowerError.includes('no matching') ||
    attemptedStrategies.some(s => s.includes('selector'))
  ) {
    return 'selector_failure';
  }

  // JavaScript required
  if (
    lowerError.includes('javascript') ||
    lowerHtml.includes('enable javascript') ||
    lowerHtml.includes('javascript required') ||
    attemptedStrategies.includes('intelligence') && !attemptedStrategies.includes('playwright')
  ) {
    return 'javascript_required';
  }

  // Dynamic content
  if (
    lowerError.includes('dynamic') ||
    lowerError.includes('ajax') ||
    lowerError.includes('loading') ||
    lowerHtml.includes('loading...')
  ) {
    return 'dynamic_content';
  }

  // Extraction failure
  if (
    lowerError.includes('extract') ||
    lowerError.includes('parse') ||
    lowerError.includes('content') ||
    attemptedStrategies.length > 0
  ) {
    return 'extraction_failure';
  }

  // API discovery
  if (lowerError.includes('api') || lowerError.includes('endpoint')) {
    return 'api_discovery';
  }

  return 'unknown';
}

/**
 * Create a full problem response with research suggestion
 *
 * @param url - The URL that had the problem
 * @param problemType - Category of problem encountered
 * @param options - Additional options including research depth tracking
 */
export function createProblemResponse(
  url: string,
  problemType: ProblemType,
  options: {
    statusCode?: number;
    detectionType?: BotDetectionType;
    error?: Error | string;
    attemptedStrategies?: string[];
    partialContent?: string;
    /** Current research depth (LR-005) - incremented from previous attempt */
    researchDepth?: number;
  } = {}
): ProblemResponse {
  const domain = new URL(url).hostname;
  const {
    statusCode,
    detectionType,
    error,
    attemptedStrategies = [],
    partialContent,
    researchDepth = 0,
  } = options;

  // Calculate if max research depth has been reached (LR-005)
  const maxResearchDepthReached = researchDepth >= MAX_RESEARCH_DEPTH;

  // Generate reason with depth info if max reached
  let reason = generateProblemReason(problemType, detectionType, error);
  if (maxResearchDepthReached) {
    reason += ` Maximum research depth (${MAX_RESEARCH_DEPTH}) reached. Manual intervention may be required.`;
  }

  return {
    needsAssistance: true,
    problemType,
    statusCode,
    detectionType,
    reason,
    // Only provide research suggestions if depth limit not reached
    researchSuggestion: maxResearchDepthReached
      ? {
          problemType,
          searchQuery: '',
          recommendedSources: [],
          retryParameters: [],
          hints: [
            `Maximum research depth (${MAX_RESEARCH_DEPTH}) reached.`,
            'Automated research-based retries have been exhausted.',
            'Consider: manual browser inspection, contacting site owner, or using alternative data sources.',
          ],
        }
      : generateResearchSuggestion(problemType, domain, detectionType),
    attemptedStrategies,
    partialContent,
    url,
    domain,
    researchDepth,
    maxResearchDepthReached,
  };
}

/**
 * Generate a human-readable reason for the problem
 */
export function generateProblemReason(
  problemType: ProblemType,
  detectionType?: BotDetectionType,
  error?: Error | string
): string {
  const errorMessage = typeof error === 'string' ? error : error?.message;

  if (problemType === 'bot_detection' && detectionType) {
    const reasons: Record<BotDetectionType, string> = {
      cloudflare: 'Cloudflare bot protection detected. The site is checking if the request comes from a real browser.',
      datadome: 'DataDome bot protection detected. This service uses behavioral analysis and advanced fingerprinting.',
      perimeterx: 'PerimeterX Human Challenge detected. This protection requires advanced browser emulation.',
      akamai: 'Akamai Bot Manager detected. This service analyzes request patterns and browser behavior.',
      recaptcha: 'reCAPTCHA challenge detected. This may require human interaction or a solving service.',
      turnstile: "Cloudflare Turnstile challenge detected. This is a CAPTCHA alternative that checks browser behavior.",
      unknown: 'Bot protection detected but the specific type could not be identified.',
    };
    return reasons[detectionType];
  }

  const reasons: Record<ProblemType, string> = {
    bot_detection: 'Bot protection detected. The site is blocking automated access.',
    extraction_failure: `Failed to extract content from the page.${errorMessage ? ` Error: ${errorMessage}` : ''}`,
    api_discovery: 'Could not discover or access an API endpoint for this content.',
    authentication: 'Authentication is required or the current session has expired.',
    rate_limiting: 'Request was rate limited. Too many requests have been made.',
    javascript_required: 'The page requires JavaScript execution to render content.',
    dynamic_content: 'Content is loaded dynamically and was not available during extraction.',
    pagination: 'Unable to navigate pagination or load additional pages.',
    selector_failure: 'The expected selectors did not match any elements on the page.',
    timeout: 'The request timed out before content could be loaded.',
    unknown: `An unexpected error occurred.${errorMessage ? ` Error: ${errorMessage}` : ''}`,
  };

  return reasons[problemType];
}

/**
 * Check if a response indicates bot detection
 */
export function isBlockedByBotDetection(
  statusCode: number,
  html: string,
  headers?: Record<string, string>
): boolean {
  // Common blocking status codes
  if (statusCode === 403 || statusCode === 503 || statusCode === 429) {
    // Check for bot detection signatures
    const detectionType = detectBotProtection(html, statusCode, headers);
    return detectionType !== 'unknown' || isChallengeContent(html);
  }

  // Some challenges return 200 with a challenge page
  if (statusCode === 200 && isChallengeContent(html)) {
    return true;
  }

  return false;
}

/**
 * Check if HTML content is a challenge page rather than real content
 *
 * Challenge pages are characterized by:
 * 1. Very short content (typically under 2KB)
 * 2. Specific challenge-related phrases (not just generic words like "captcha")
 * 3. Often have distinctive HTML structure (no nav, header, footer)
 *
 * Many legitimate sites include words like "captcha" or "challenge" for their
 * reCAPTCHA integration or support chat, so we need to be careful.
 */
function isChallengeContent(html: string): boolean {
  const lowerHtml = html.toLowerCase();

  // Strong challenge indicators - these phrases specifically indicate blocking
  const strongIndicators = [
    'checking your browser before',
    'just a moment...',
    'please wait while we verify',
    'verify you are human',
    'complete the security check',
    'access denied',
    'bot detected',
    'automated access',
    'suspicious activity detected',
    'are you a robot',
    'please enable javascript to view',
    'browser check',
    'ddos protection',
    'ray id:',  // Cloudflare specific
    'performance & security by',  // Cloudflare footer
  ];

  // Challenge pages are very short - real pages with reCAPTCHA/Cloudflare
  // scripts are much larger (typically 50KB+)
  const isVeryShort = html.length < 3000;

  // For slightly longer pages (3KB-15KB), require strong indicators
  const isShort = html.length < 15000;

  // Check for strong indicators
  const hasStrongIndicator = strongIndicators.some(indicator => lowerHtml.includes(indicator));

  // Very short pages with any strong indicator = challenge
  if (isVeryShort && hasStrongIndicator) {
    return true;
  }

  // Short pages need multiple strong indicators to be flagged
  if (isShort && hasStrongIndicator) {
    const indicatorCount = strongIndicators.filter(ind => lowerHtml.includes(ind)).length;
    return indicatorCount >= 2;
  }

  return false;
}

/**
 * Suggest a RetryConfig based on problem type and research findings
 */
export function suggestRetryConfig(problemType: ProblemType, detectionType?: BotDetectionType): Partial<RetryConfig> {
  const configs: Record<ProblemType, Partial<RetryConfig>> = {
    bot_detection: {
      useFullBrowser: true,
      delayMs: 2000,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
    },
    extraction_failure: {
      useFullBrowser: true,
      waitForSelector: 'main, article, .content, #content',
      timeout: 30000,
    },
    api_discovery: {
      useFullBrowser: true,
    },
    authentication: {
      // Auth typically needs specific headers - LLM should research
    },
    rate_limiting: {
      delayMs: 5000,
      retryAttempt: 1,
    },
    javascript_required: {
      useFullBrowser: true,
      timeout: 30000,
    },
    dynamic_content: {
      useFullBrowser: true,
      scrollToLoad: true,
      waitForSelector: '[data-loaded], .loaded, main',
      timeout: 30000,
    },
    pagination: {
      scrollToLoad: true,
      waitForSelector: '.pagination, .next, [rel="next"]',
    },
    selector_failure: {
      useFullBrowser: true,
      waitForSelector: 'body',
    },
    timeout: {
      timeout: 60000,
      useFullBrowser: true,
    },
    unknown: {
      useFullBrowser: true,
      timeout: 30000,
    },
  };

  const config = { ...configs[problemType] };

  // Add detection-specific config for bot detection
  if (problemType === 'bot_detection' && detectionType) {
    if (detectionType === 'datadome' || detectionType === 'perimeterx') {
      config.delayMs = 3000;
      config.platform = 'Windows';
    }
  }

  return config;
}
