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
 * Admin tools - require ADMIN_MODE=1
 */
export const ADMIN_TOOLS = [
  // TC-005: Analytics tools
  'get_performance_metrics',
  'usage_analytics',
  'get_analytics_dashboard',
  'get_system_status',
  // TC-006: Infrastructure tools
  'get_browser_providers',
  'tier_management',
  // TC-007: Content tracking tool
  'content_tracking',
  // TC-010: Tool selection metrics
  'tool_selection_metrics',
  // TC-008: Deprecated tools
  'get_domain_intelligence',
  'get_domain_capabilities',
  'get_learning_stats',
  'get_learning_effectiveness',
  'skill_management',
  'get_api_auth_status',
  'configure_api_auth',
  'complete_oauth',
  'get_auth_guidance',
  'delete_api_auth',
  'list_configured_auth',
];

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
  description: `Query and manage debug traces for failure analysis and replay.

Actions:
- list: Query traces with filters
- get: Get a specific trace by ID
- stats: Get statistics about stored traces
- configure: Configure recording settings
- export: Export traces for sharing
- delete: Delete a trace by ID
- clear: Clear all traces

Debug traces capture tier decisions, selectors, network activity, validation, errors, and skills.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'stats', 'configure', 'export', 'delete', 'clear'],
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
      id: { type: 'string', description: 'Trace ID (get/delete actions)' },
      ids: { type: 'array', items: { type: 'string' }, description: 'Trace IDs to export' },
      enabled: { type: 'boolean', description: 'Enable/disable recording (configure action)' },
      onlyRecordFailures: { type: 'boolean', description: 'Only record failures (configure action)' },
      alwaysRecordDomain: { type: 'string', description: 'Domain to always record (configure action)' },
      neverRecordDomain: { type: 'string', description: 'Domain to never record (configure action)' },
      maxTraces: { type: 'number', description: 'Max traces to retain (configure action)' },
      maxAgeHours: { type: 'number', description: 'Max age in hours (configure action)' },
    },
    required: ['action'],
  },
};

// ==========================================================================
// ADMIN TOOLS
// ==========================================================================

/**
 * Domain intelligence tool schema (deprecated)
 */
export const getDomainIntelligenceSchema: Tool = {
  name: 'get_domain_intelligence',
  description: `[DEPRECATED - Use smart_browse with includeInsights=true instead]

Get intelligence summary for a domain.`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Domain to check' },
    },
    required: ['domain'],
  },
};

/**
 * Domain capabilities tool schema (deprecated)
 */
export const getDomainCapabilitiesSchema: Tool = {
  name: 'get_domain_capabilities',
  description: `[DEPRECATED - Use smart_browse with includeInsights=true instead]

Get comprehensive capability summary for a domain.`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Domain to check' },
    },
    required: ['domain'],
  },
};

/**
 * Learning stats tool schema (deprecated)
 */
export const getLearningStatsSchema: Tool = {
  name: 'get_learning_stats',
  description: `[DEPRECATED] Get comprehensive statistics about the browser's learning.`,
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Learning effectiveness tool schema (deprecated)
 */
export const getLearningEffectivenessSchema: Tool = {
  name: 'get_learning_effectiveness',
  description: `[DEPRECATED] Get comprehensive learning effectiveness metrics.`,
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Skill management tool schema (deprecated)
 */
export const skillManagementSchema: Tool = {
  name: 'skill_management',
  description: `[DEPRECATED] Manage learned browsing skills. Skills are now automatically applied during smart_browse.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['stats', 'progress', 'find', 'details', 'explain', 'versions', 'rollback', 'rate', 'anti_patterns', 'dependencies', 'bootstrap', 'export', 'import', 'pack_stats', 'manage'],
        description: 'Action to perform',
      },
      url: { type: 'string' },
      topK: { type: 'number' },
      skillId: { type: 'string' },
      targetVersion: { type: 'number' },
      rating: { type: 'string', enum: ['positive', 'negative'] },
      reason: { type: 'string' },
      domain: { type: 'string' },
      dependencyAction: { type: 'string', enum: ['add_fallbacks', 'add_prerequisites', 'get_chain'] },
      relatedSkillIds: { type: 'array', items: { type: 'string' } },
      domainPatterns: { type: 'array', items: { type: 'string' } },
      verticals: { type: 'array', items: { type: 'string' } },
      includeAntiPatterns: { type: 'boolean' },
      includeWorkflows: { type: 'boolean' },
      minSuccessRate: { type: 'number' },
      minUsageCount: { type: 'number' },
      packName: { type: 'string' },
      packDescription: { type: 'string' },
      skillPackJson: { type: 'string' },
      conflictResolution: { type: 'string', enum: ['skip', 'overwrite', 'merge', 'rename'] },
      domainFilter: { type: 'array', items: { type: 'string' } },
      importAntiPatterns: { type: 'boolean' },
      importWorkflows: { type: 'boolean' },
      resetMetrics: { type: 'boolean' },
      namePrefix: { type: 'string' },
      manageAction: { type: 'string', enum: ['export', 'import', 'prune', 'reset', 'coverage', 'workflows'] },
      data: { type: 'string' },
    },
    required: ['action'],
  },
};

/**
 * Browser providers tool schema
 */
export const getBrowserProvidersSchema: Tool = {
  name: 'get_browser_providers',
  description: `Get information about available browser providers.

Shows which remote browser services are configured:
- Local: Uses installed Playwright (default)
- Browserless.io: Standard CDP endpoint
- Bright Data: Anti-bot focused with CAPTCHA solving
- Custom: Any CDP-compatible endpoint`,
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Tier management tool schema
 */
export const tierManagementSchema: Tool = {
  name: 'tier_management',
  description: `Manage tiered rendering for domains.

Actions:
- stats: Get tiered fetcher statistics
- set: Set preferred tier for a domain
- usage: Get tier usage analytics by domain

Tiers: intelligence (~50-200ms), lightweight (~200-500ms), playwright (~2-5s).`,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['stats', 'set', 'usage'], description: 'Action to perform' },
      domain: { type: 'string', description: 'Domain (set/usage actions)' },
      tier: { type: 'string', enum: ['intelligence', 'lightweight', 'playwright'] },
      sortBy: { type: 'string', enum: ['domain', 'tier', 'successRate', 'responseTime', 'lastUsed'] },
      limit: { type: 'number', description: 'Max domains (default: 50)' },
    },
    required: ['action'],
  },
};

/**
 * Performance metrics tool schema
 */
export const getPerformanceMetricsSchema: Tool = {
  name: 'get_performance_metrics',
  description: `Get comprehensive performance metrics for all tiers.

Returns detailed timing statistics including:
- System-wide performance summary
- Per-tier percentile statistics (p50, p95, p99)
- Component breakdown
- Top fastest and slowest domains`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Get metrics for a specific domain' },
      sortBy: { type: 'string', enum: ['avgTime', 'p95', 'successRate'] },
      order: { type: 'string', enum: ['asc', 'desc'] },
      limit: { type: 'number', description: 'Maximum domains to return (default: 20)' },
    },
  },
};

/**
 * Content tracking tool schema
 */
export const contentTrackingSchema: Tool = {
  name: 'content_tracking',
  description: `Track and detect content changes on websites.

Actions:
- track: Start tracking a URL
- check: Check if tracked content has changed
- list: List tracked URLs
- history: Get change history
- untrack: Stop tracking a URL
- stats: Get tracking statistics`,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['track', 'check', 'list', 'history', 'untrack', 'stats'] },
      url: { type: 'string' },
      label: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      domain: { type: 'string' },
      hasChanges: { type: 'boolean' },
      limit: { type: 'number' },
    },
    required: ['action'],
  },
};

/**
 * Usage analytics tool schema
 */
export const usageAnalyticsSchema: Tool = {
  name: 'usage_analytics',
  description: `Get usage statistics and cost analysis for the LLM Browser.

Actions:
- summary: Get comprehensive usage stats
- by_period: Get usage breakdown by time period
- cost_breakdown: Get detailed cost breakdown by tier
- reset: Reset all usage meters

Cost units: Intelligence=1, Lightweight=5, Playwright=25.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['summary', 'by_period', 'cost_breakdown', 'reset'] },
      period: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'all'] },
      domain: { type: 'string' },
      tier: { type: 'string', enum: ['intelligence', 'lightweight', 'playwright'] },
      tenantId: { type: 'string' },
      granularity: { type: 'string', enum: ['hour', 'day'] },
      periods: { type: 'number' },
    },
    required: ['action'],
  },
};

/**
 * Analytics dashboard tool schema
 */
export const getAnalyticsDashboardSchema: Tool = {
  name: 'get_analytics_dashboard',
  description: `Get a comprehensive analytics dashboard for the LLM Browser.

Provides a unified view of system analytics including:
- Summary metrics (requests, costs, success rate, latency)
- System health assessment with recommendations
- Per-tier breakdown
- Top domains by cost, requests, and latency
- Time series data for trend visualization`,
  inputSchema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'all'] },
      topDomainsLimit: { type: 'number' },
      timeSeriesPoints: { type: 'number' },
      domain: { type: 'string' },
      tenantId: { type: 'string' },
    },
  },
};

/**
 * System status tool schema
 */
export const getSystemStatusSchema: Tool = {
  name: 'get_system_status',
  description: `Get a quick system status check.

Returns a compact summary suitable for health monitoring:
- Overall status (healthy, degraded, unhealthy)
- 24-hour request count
- Success rate
- Average latency
- Cost units consumed`,
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Tool selection metrics tool schema
 */
export const toolSelectionMetricsSchema: Tool = {
  name: 'tool_selection_metrics',
  description: `Get metrics about tool selection patterns.

Actions:
- stats: Get tool usage statistics
- confusion: Get confusion indicators

Tracks which tools are used most frequently and identifies potential confusion.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['stats', 'confusion'] },
      period: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'all'] },
      tool: { type: 'string' },
      category: { type: 'string', enum: ['core', 'debug', 'admin', 'deprecated', 'unknown'] },
      sessionId: { type: 'string' },
      tenantId: { type: 'string' },
    },
    required: ['action'],
  },
};

// ==========================================================================
// DEPRECATED AUTH TOOLS (kept for backward compatibility)
// ==========================================================================

export const getApiAuthStatusSchema: Tool = {
  name: 'get_api_auth_status',
  description: `[DEPRECATED - Use api_auth with action='status']`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      profile: { type: 'string' },
    },
    required: ['domain'],
  },
};

export const configureApiAuthSchema: Tool = {
  name: 'configure_api_auth',
  description: `[DEPRECATED - Use api_auth with action='configure']`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      authType: { type: 'string', enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'] },
      credentials: { type: 'object' },
      profile: { type: 'string' },
      validate: { type: 'boolean' },
    },
    required: ['domain', 'authType', 'credentials'],
  },
};

export const completeOauthSchema: Tool = {
  name: 'complete_oauth',
  description: `[DEPRECATED - Use api_auth with action='complete_oauth']`,
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      state: { type: 'string' },
    },
    required: ['code', 'state'],
  },
};

export const getAuthGuidanceSchema: Tool = {
  name: 'get_auth_guidance',
  description: `[DEPRECATED - Use api_auth with action='guidance']`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      authType: { type: 'string', enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'] },
    },
    required: ['domain'],
  },
};

export const deleteApiAuthSchema: Tool = {
  name: 'delete_api_auth',
  description: `[DEPRECATED - Use api_auth with action='delete']`,
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      authType: { type: 'string', enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'] },
      profile: { type: 'string' },
    },
    required: ['domain'],
  },
};

export const listConfiguredAuthSchema: Tool = {
  name: 'list_configured_auth',
  description: `[DEPRECATED - Use api_auth with action='list']`,
  inputSchema: {
    type: 'object',
    properties: {},
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
    // Debug tools
    captureScreenshotSchema,
    exportHarSchema,
    debugTracesSchema,
    // Admin/deprecated tools
    getDomainIntelligenceSchema,
    getDomainCapabilitiesSchema,
    getLearningStatsSchema,
    getLearningEffectivenessSchema,
    skillManagementSchema,
    getBrowserProvidersSchema,
    tierManagementSchema,
    getPerformanceMetricsSchema,
    contentTrackingSchema,
    usageAnalyticsSchema,
    getAnalyticsDashboardSchema,
    getSystemStatusSchema,
    toolSelectionMetricsSchema,
    // Deprecated auth tools
    getApiAuthStatusSchema,
    configureApiAuthSchema,
    completeOauthSchema,
    getAuthGuidanceSchema,
    deleteApiAuthSchema,
    listConfiguredAuthSchema,
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
