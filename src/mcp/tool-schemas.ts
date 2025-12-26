/**
 * MCP Tool Schemas
 *
 * Tool definitions for the MCP server.
 * Separated from index.ts for maintainability.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Debug tools - require DEBUG_MODE=1
 */
export const DEBUG_TOOLS = ['capture_screenshot', 'export_har', 'debug_traces'];

/**
 * Admin tools - removed in favor of web dashboard
 * Admin functionality now handled through dedicated web UI
 */
export const ADMIN_TOOLS: string[] = [];

/**
 * Primary browsing tool schema
 */
export const smartBrowseSchema: Tool = {
  name: 'smart_browse',
  description: `Intelligently browse a URL with automatic learning and optimization.

This is the RECOMMENDED browsing tool. It automatically:
- Uses learned selectors for reliable content extraction
- Falls back through selector chains if primary fails
- Validates responses against learned patterns
- Learns from successes and failures
- Applies cross-domain patterns (e.g., Spanish gov sites share patterns)
- Detects pagination for multi-page content
- Tracks content change frequency
- Handles cookie banners automatically
- Retries with exponential backoff

Output size controls (use for large pages):
- maxChars: Truncate markdown content to this length
- includeTables: Include extracted tables (default: true)
- includeNetwork: Include network requests (default: false)
- includeConsole: Include console logs (default: false)
- includeHtml: Include raw HTML (default: false)

Budget controls - Control cost/latency tradeoffs:
- maxLatencyMs: Stop tier fallback if latency exceeds this value
- maxCostTier: Limit to cheaper tiers (intelligence < lightweight < playwright)
- freshnessRequirement: 'realtime' (always fresh), 'cached' (prefer cache), 'any' (default)

Returns: Content, tables, APIs discovered, learning insights, and budget tracking.`,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to browse' },
      contentType: {
        type: 'string',
        enum: ['main_content', 'requirements', 'fees', 'timeline', 'documents', 'contact', 'table'],
        description: 'Type of content to extract (helps select right selectors)',
      },
      followPagination: { type: 'boolean', description: 'Follow pagination to get all pages (default: false)' },
      maxPages: { type: 'number', description: 'Maximum pages to follow if pagination enabled (default: 5)' },
      checkForChanges: { type: 'boolean', description: 'Check if content changed since last visit (default: false)' },
      waitForSelector: { type: 'string', description: 'CSS selector to wait for (for SPAs)' },
      scrollToLoad: { type: 'boolean', description: 'Scroll to trigger lazy-loaded content (default: false)' },
      sessionProfile: { type: 'string', description: 'Session profile for authenticated access (default: "default")' },
      maxChars: { type: 'number', description: 'Maximum characters for markdown content (default: no limit)' },
      includeTables: { type: 'boolean', description: 'Include extracted tables in response (default: true)' },
      includeNetwork: { type: 'boolean', description: 'Include network request data (default: false)' },
      includeConsole: { type: 'boolean', description: 'Include browser console logs (default: false)' },
      includeHtml: { type: 'boolean', description: 'Include raw HTML in response (default: false)' },
      includeDecisionTrace: { type: 'boolean', description: 'Include detailed decision trace (default: false)' },
      maxLatencyMs: { type: 'number', description: 'Maximum acceptable latency in milliseconds' },
      maxCostTier: {
        type: 'string',
        enum: ['intelligence', 'lightweight', 'playwright'],
        description: 'Maximum cost tier to use',
      },
      freshnessRequirement: {
        type: 'string',
        enum: ['realtime', 'cached', 'any'],
        description: 'Content freshness requirement',
      },
      includeInsights: { type: 'boolean', description: 'Include domain capabilities and knowledge summary (default: true)' },
    },
    required: ['url'],
  },
};

/**
 * Batch browse tool schema
 */
export const batchBrowseSchema: Tool = {
  name: 'batch_browse',
  description: `Browse multiple URLs in a single call with controlled concurrency.

Use this tool when you need to:
- Fetch content from multiple URLs efficiently
- Compare content across multiple pages
- Gather data from a list of URLs
- Crawl related pages in parallel

Features:
- Configurable concurrency (default: 3 parallel requests)
- Per-URL and total timeout controls
- Individual error handling (one failure doesn't stop others)
- Shared session and pattern usage across batch
- SSRF protection on all URLs

Returns: Array of results with per-URL status, timing, and content.`,
  inputSchema: {
    type: 'object',
    properties: {
      urls: { type: 'array', items: { type: 'string' }, description: 'Array of URLs to browse' },
      concurrency: { type: 'number', description: 'Maximum parallel requests (default: 3)' },
      stopOnError: { type: 'boolean', description: 'Stop entire batch on first error (default: false)' },
      continueOnRateLimit: { type: 'boolean', description: 'Continue batch when rate limited (default: true)' },
      perUrlTimeoutMs: { type: 'number', description: 'Timeout per URL in milliseconds' },
      totalTimeoutMs: { type: 'number', description: 'Total batch timeout in milliseconds' },
      contentType: {
        type: 'string',
        enum: ['main_content', 'requirements', 'fees', 'timeline', 'documents', 'contact', 'table'],
        description: 'Type of content to extract from each URL',
      },
      waitForSelector: { type: 'string', description: 'CSS selector to wait for on each page' },
      scrollToLoad: { type: 'boolean', description: 'Scroll to trigger lazy-loaded content on each page' },
      sessionProfile: { type: 'string', description: 'Session profile for authenticated access' },
      maxChars: { type: 'number', description: 'Maximum characters for markdown content per URL' },
      includeTables: { type: 'boolean', description: 'Include extracted tables (default: true)' },
      includeNetwork: { type: 'boolean', description: 'Include network requests (default: false)' },
      includeConsole: { type: 'boolean', description: 'Include console logs (default: false)' },
      maxLatencyMs: { type: 'number', description: 'Maximum latency per URL in milliseconds' },
      maxCostTier: {
        type: 'string',
        enum: ['intelligence', 'lightweight', 'playwright'],
        description: 'Maximum cost tier to use per URL',
      },
    },
    required: ['urls'],
  },
};

/**
 * API call tool schema
 */
export const executeApiCallSchema: Tool = {
  name: 'execute_api_call',
  description: `Execute a direct API call using saved session authentication.

Bypasses browser rendering for discovered API endpoints.
Use after discovering an API with smart_browse.`,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The API endpoint URL' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      headers: { type: 'object' },
      body: { type: 'object' },
      sessionProfile: { type: 'string' },
    },
    required: ['url'],
  },
};

/**
 * Session management tool schema
 */
export const sessionManagementSchema: Tool = {
  name: 'session_management',
  description: `Manage browser sessions for authenticated access.

Actions:
- save: Capture cookies, localStorage, sessionStorage for a domain
- list: List all saved sessions
- health: Check session health (expired, expiring_soon, stale, healthy)

Sessions enable authenticated API calls without re-login.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['save', 'list', 'health'], description: 'Action to perform' },
      domain: { type: 'string', description: 'Domain (save/health actions)' },
      sessionProfile: { type: 'string', description: 'Session profile (default: "default")' },
    },
    required: ['action'],
  },
};

/**
 * API auth tool schema
 */
export const apiAuthSchema: Tool = {
  name: 'api_auth',
  description: `Unified API authentication management. Configure, manage, and inspect authentication credentials for API access.

Actions:
- status: Check auth status for a domain
- configure: Configure credentials for a domain
- complete_oauth: Complete OAuth2 authorization code flow
- guidance: Get help and examples for configuring authentication
- delete: Delete stored credentials for a domain
- list: List all domains with configured authentication`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'configure', 'complete_oauth', 'guidance', 'delete', 'list'],
        description: 'Action to perform',
      },
      domain: { type: 'string', description: 'Domain to operate on' },
      profile: { type: 'string', description: 'Auth profile name (default: "default")' },
      authType: {
        type: 'string',
        enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'],
        description: 'Authentication type',
      },
      credentials: { type: 'object', description: 'Credentials object (required for configure action)' },
      validate: { type: 'boolean', description: 'Whether to validate credentials (default: true)' },
      code: { type: 'string', description: 'OAuth authorization code (for complete_oauth action)' },
      state: { type: 'string', description: 'OAuth state parameter (for complete_oauth action)' },
    },
    required: ['action'],
  },
};

// ==========================================================================
// DEBUG TOOLS
// ==========================================================================

/**
 * Screenshot capture tool schema
 */
export const captureScreenshotSchema: Tool = {
  name: 'capture_screenshot',
  description: `Capture a screenshot of a webpage for visual debugging.

Requires Playwright to be installed (full browser rendering).

Options:
- fullPage: Capture entire page including scroll (default: true)
- element: CSS selector for specific element screenshot
- waitForSelector: Wait for element before capturing
- width/height: Custom viewport dimensions
- sessionProfile: Use authenticated session

Returns base64-encoded PNG image with metadata.`,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to screenshot' },
      fullPage: { type: 'boolean', description: 'Capture full page (default: true)' },
      element: { type: 'string', description: 'CSS selector for specific element' },
      waitForSelector: { type: 'string', description: 'CSS selector to wait for' },
      sessionProfile: { type: 'string', description: 'Session profile (default: "default")' },
      width: { type: 'number', description: 'Viewport width (default: 1920)' },
      height: { type: 'number', description: 'Viewport height (default: 1080)' },
    },
    required: ['url'],
  },
};

/**
 * HAR export tool schema
 */
export const exportHarSchema: Tool = {
  name: 'export_har',
  description: `Export HAR (HTTP Archive) file for network debugging.

Requires Playwright to be installed (full browser rendering).

Options:
- includeResponseBodies: Include response body content (default: true)
- maxBodySize: Maximum size for response bodies (default: 1MB)
- pageTitle: Custom title for the HAR page entry
- waitForSelector: Wait for element before capturing
- sessionProfile: Use authenticated session

Returns HAR 1.2 JSON with all network requests, responses, and timings.`,
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to browse and capture' },
      includeResponseBodies: { type: 'boolean', description: 'Include response bodies (default: true)' },
      maxBodySize: { type: 'number', description: 'Max body size in bytes (default: 1MB)' },
      pageTitle: { type: 'string', description: 'Custom title for HAR page entry' },
      waitForSelector: { type: 'string', description: 'CSS selector to wait for' },
      sessionProfile: { type: 'string', description: 'Session profile (default: "default")' },
    },
    required: ['url'],
  },
};

/**
 * Debug traces tool schema
 */
export const debugTracesSchema: Tool = {
  name: 'debug_traces',
  description: `Query, visualize, and manage debug traces for failure analysis and replay.

Actions:
- list: Query traces with filters
- get: Get a specific trace by ID
- stats: Get statistics about stored traces
- configure: Configure recording settings
- export: Export traces for sharing
- delete: Delete a trace by ID
- clear: Clear all traces
- visualize: Render a trace in visual format (ascii, compact, detailed, html, json)
- compare: Compare two traces side by side

Debug traces capture tier decisions, selectors, network activity, validation, errors, and skills.
Visualization formats (F-009):
- ascii: Full ASCII timeline with tier cascade, selectors, and summary
- compact: One-line summary (status, tier, duration, domain)
- detailed: Multi-section with full details including validation and anomalies
- html: Rich HTML document with styled tables and timeline
- json: Raw JSON (same as get action)`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'stats', 'configure', 'export', 'delete', 'clear', 'visualize', 'compare'],
        description: 'Action to perform',
      },
      domain: { type: 'string', description: 'Filter by domain (list action)' },
      urlPattern: { type: 'string', description: 'Filter by URL pattern regex (list action)' },
      success: { type: 'boolean', description: 'Filter by success/failure (list action)' },
      errorType: {
        type: 'string',
        enum: ['timeout', 'network', 'selector', 'validation', 'bot_challenge', 'rate_limit', 'auth', 'unknown'],
        description: 'Filter by error type (list action)',
      },
      tier: { type: 'string', enum: ['intelligence', 'lightweight', 'playwright'], description: 'Filter by tier' },
      limit: { type: 'number', description: 'Max results (default: 20)' },
      offset: { type: 'number', description: 'Pagination offset' },
      id: { type: 'string', description: 'Trace ID (get/delete/visualize actions)' },
      ids: { type: 'array', items: { type: 'string' }, description: 'Trace IDs to export' },
      enabled: { type: 'boolean', description: 'Enable/disable recording (configure action)' },
      onlyRecordFailures: { type: 'boolean', description: 'Only record failures (configure action)' },
      alwaysRecordDomain: { type: 'string', description: 'Domain to always record (configure action)' },
      neverRecordDomain: { type: 'string', description: 'Domain to never record (configure action)' },
      maxTraces: { type: 'number', description: 'Max traces to retain (configure action)' },
      maxAgeHours: { type: 'number', description: 'Max age in hours (configure action)' },
      // Visualization options (F-009)
      format: {
        type: 'string',
        enum: ['ascii', 'compact', 'detailed', 'html', 'json'],
        description: 'Visualization format (visualize action, default: ascii)',
      },
      includeNetwork: { type: 'boolean', description: 'Include network activity (visualize, default: true)' },
      includeSelectors: { type: 'boolean', description: 'Include selector attempts (visualize, default: true)' },
      includeTitle: { type: 'boolean', description: 'Include title extraction (visualize, default: false)' },
      includeErrors: { type: 'boolean', description: 'Include errors (visualize, default: true)' },
      includeSkills: { type: 'boolean', description: 'Include skills info (visualize, default: true)' },
      maxWidth: { type: 'number', description: 'Max width for ASCII output (visualize, default: 80)' },
      useColor: { type: 'boolean', description: 'Use ANSI color codes (visualize, default: true for non-html)' },
      // Compare options (F-009)
      id1: { type: 'string', description: 'First trace ID (compare action)' },
      id2: { type: 'string', description: 'Second trace ID (compare action)' },
    },
    required: ['action'],
  },
};

// ==========================================================================
// AI FEEDBACK TOOL
// ==========================================================================

/**
 * AI Feedback tool schema for reporting issues and providing feedback
 */
export const aiFeedbackSchema: Tool = {
  name: 'ai_feedback',
  description: `Report feedback about browsing quality, accuracy, and performance issues.

This tool allows AI users to provide feedback that helps improve the system:
- Report content quality issues (missing, garbled, incomplete)
- Flag accuracy problems (incorrect data, outdated content)
- Report performance issues (slow response, timeouts)
- Suggest feature improvements
- Report security concerns (always triggers human review)

Actions:
- submit: Submit new feedback about a browsing operation
- list: View recent feedback you've submitted
- stats: Get feedback statistics
- anomalies: View detected feedback anomalies (admin)

Feedback is processed in real-time when possible:
- Pattern confidence adjustments (capped at 5% per feedback)
- Tier routing hints for future requests
- Security alerts always escalate to human review

Rate limits: 10 per minute per session, 100 per hour per tenant.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['submit', 'list', 'stats', 'anomalies'],
        description: 'The action to perform',
      },
      // For submit action
      category: {
        type: 'string',
        enum: ['content_quality', 'accuracy', 'performance', 'functionality', 'security', 'feature_request'],
        description: 'High-level feedback category',
      },
      sentiment: {
        type: 'string',
        enum: ['positive', 'negative', 'neutral'],
        description: 'Overall sentiment of the feedback',
      },
      subtype: {
        type: 'string',
        enum: [
          'missing_content', 'garbled_content', 'incomplete_content', 'wrong_format',
          'incorrect_data', 'outdated_content', 'misattribution', 'hallucination',
          'slow_response', 'timeout', 'resource_exhaustion', 'rate_limited',
          'pattern_failure', 'api_discovery_miss', 'selector_broken', 'auth_failure',
          'credential_exposure', 'xss_detected', 'injection_risk',
          'new_capability', 'improvement', 'other',
        ],
        description: 'Specific subtype within the category',
      },
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Severity level of the issue',
      },
      url: {
        type: 'string',
        description: 'URL where the issue occurred (required for submit)',
      },
      domain: {
        type: 'string',
        description: 'Domain where the issue occurred',
      },
      message: {
        type: 'string',
        description: 'Free-form description of the issue (max 2000 chars)',
      },
      expectedBehavior: {
        type: 'string',
        description: 'What you expected to happen',
      },
      actualBehavior: {
        type: 'string',
        description: 'What actually happened',
      },
      patternId: {
        type: 'string',
        description: 'Pattern ID if feedback is about a specific pattern',
      },
      skillId: {
        type: 'string',
        description: 'Skill ID if feedback is about a specific skill',
      },
      requestId: {
        type: 'string',
        description: 'Request ID for correlation',
      },
      suggestedAction: {
        type: 'string',
        enum: ['adjust_pattern', 'disable_pattern', 'retry_with_render', 'report_only', 'escalate'],
        description: 'Suggested action for the system to take',
      },
      // Evidence fields
      contentSnippet: {
        type: 'string',
        description: 'Small sample of problematic content (max 500 chars)',
      },
      errorMessage: {
        type: 'string',
        description: 'Error message if applicable',
      },
      responseTime: {
        type: 'number',
        description: 'Response time in milliseconds',
      },
      statusCode: {
        type: 'number',
        description: 'HTTP status code if applicable',
      },
      // For list action
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (default: 50)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination',
      },
      filterCategory: {
        type: 'string',
        enum: ['content_quality', 'accuracy', 'performance', 'functionality', 'security', 'feature_request'],
        description: 'Filter by category',
      },
      filterSentiment: {
        type: 'string',
        enum: ['positive', 'negative', 'neutral'],
        description: 'Filter by sentiment',
      },
      // For stats action
      periodHours: {
        type: 'number',
        description: 'Period for statistics in hours (default: 24)',
      },
    },
    required: ['action'],
  },
};

// ==========================================================================
// WEBHOOK MANAGEMENT TOOL (F-011)
// ==========================================================================

/**
 * Webhook management tool schema for external integrations
 */
export const webhookManagementSchema: Tool = {
  name: 'webhook_management',
  description: `Manage webhook endpoints for external integrations.

This tool allows you to configure webhooks that receive notifications about:
- Browse operation events (completed, failed, tier escalation)
- Content change alerts (detected, significant changes)
- Pattern events (discovered, failed, updated)
- Error events (rate limits, bot detection, timeouts)
- Feedback events (submitted, escalated, anomalies)
- System events (health, quota warnings, maintenance)

Actions:
- create: Create a new webhook endpoint
- update: Update an existing endpoint
- delete: Delete an endpoint
- get: Get endpoint details
- list: List all endpoints
- enable: Enable a disabled endpoint
- disable: Disable an endpoint
- test: Send a test event to verify configuration
- history: Get delivery history for an endpoint
- stats: Get webhook delivery statistics

Security:
- All payloads are signed with HMAC-SHA256
- Secrets must be at least 32 characters
- Failed endpoints are automatically disabled after consecutive failures`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'update', 'delete', 'get', 'list', 'enable', 'disable', 'test', 'history', 'stats'],
        description: 'The action to perform',
      },
      // For create/update actions
      name: {
        type: 'string',
        description: 'Display name for the webhook endpoint',
      },
      description: {
        type: 'string',
        description: 'Optional description of the endpoint purpose',
      },
      url: {
        type: 'string',
        description: 'Target URL for webhook delivery (must be HTTPS in production)',
      },
      secret: {
        type: 'string',
        description: 'Secret for HMAC-SHA256 signature verification (min 32 characters)',
      },
      enabledEvents: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'browse.completed', 'browse.failed', 'browse.tier_escalation',
            'content_change.detected', 'content_change.significant',
            'pattern.discovered', 'pattern.failed', 'pattern.updated',
            'error.rate_limit', 'error.bot_detected', 'error.timeout', 'error.auth_failure',
            'feedback.submitted', 'feedback.escalated', 'feedback.anomaly',
            'system.health', 'system.quota_warning', 'system.maintenance',
          ],
        },
        description: 'Event types to receive (required for create)',
      },
      enabledCategories: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['browse', 'content_change', 'pattern', 'error', 'feedback', 'system'],
        },
        description: 'Optional category filter (receive all events in these categories)',
      },
      domainFilter: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional domain filter (only receive events for these domains)',
      },
      minSeverity: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Minimum severity level to receive (default: all)',
      },
      maxRetries: {
        type: 'number',
        description: 'Maximum retry attempts for failed deliveries (default: 3)',
      },
      initialRetryDelayMs: {
        type: 'number',
        description: 'Initial retry delay in milliseconds (default: 1000)',
      },
      maxRetryDelayMs: {
        type: 'number',
        description: 'Maximum retry delay in milliseconds (default: 60000)',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers to include in webhook requests',
      },
      // For get/update/delete/enable/disable/test/history actions
      endpointId: {
        type: 'string',
        description: 'Endpoint ID for get/update/delete/enable/disable/test/history actions',
      },
      // For history action
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (default: 20)',
      },
      // For stats action
      periodHours: {
        type: 'number',
        description: 'Period for statistics in hours (default: 24)',
      },
    },
    required: ['action'],
  },
};

// ==========================================================================
// TOOL LIST BUILDER
// ==========================================================================

/**
 * Get all tool schemas
 */
export function getAllToolSchemas(): Tool[] {
  return [
    // Primary tools
    smartBrowseSchema,
    batchBrowseSchema,
    executeApiCallSchema,
    sessionManagementSchema,
    apiAuthSchema,
    // Feedback & integration tools
    aiFeedbackSchema,
    webhookManagementSchema,
    // Debug tools (require DEBUG_MODE=1)
    captureScreenshotSchema,
    exportHarSchema,
    debugTracesSchema,
  ];
}

/**
 * Get filtered tool schemas based on mode flags
 */
export function getFilteredToolSchemas(debugMode: boolean, adminMode: boolean): Tool[] {
  return getAllToolSchemas().filter(tool => {
    if (!debugMode && DEBUG_TOOLS.includes(tool.name)) return false;
    if (!adminMode && ADMIN_TOOLS.includes(tool.name)) return false;
    return true;
  });
}
