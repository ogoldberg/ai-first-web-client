#!/usr/bin/env node

/**
 * LLM Browser MCP Server
 *
 * An intelligent browser designed for LLM interactions with:
 * - Automatic API discovery and learning
 * - Content structure learning with selector fallbacks
 * - Cross-domain pattern transfer
 * - Response validation
 * - Pagination detection
 * - Change frequency tracking
 * - Session management
 *
 * The browser gets smarter over time, learning from every interaction.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { BrowserManager } from './core/browser-manager.js';
import { ContentExtractor } from './utils/content-extractor.js';
import { ApiAnalyzer } from './core/api-analyzer.js';
import { SessionManager } from './core/session-manager.js';
import { LearningEngine } from './core/learning-engine.js';
import {
  SmartBrowser,
  type DomainCapabilitiesSummary,
  type DomainKnowledgeSummary,
} from './core/smart-browser.js';
import { BrowseTool } from './tools/browse-tool.js';
import { ApiCallTool } from './tools/api-call-tool.js';
import { AuthWorkflow } from './core/auth-workflow.js';
import {
  type AuthType,
  buildTypedCredentials,
  handleAuthStatus,
  handleAuthConfigure,
  handleOAuthComplete,
  handleAuthGuidance,
  handleAuthDelete,
  handleAuthList,
} from './tools/auth-helpers.js';
import { logger } from './utils/logger.js';
import { computeLearningEffectiveness } from './core/learning-effectiveness.js';
import { addSchemaVersion } from './types/schema-version.js';
import {
  buildStructuredError,
  type ErrorContext,
  type ClassificationContext,
} from './types/errors.js';
import { UrlSafetyError } from './utils/url-safety.js';
import { getUsageMeter, type UsageQueryOptions } from './utils/usage-meter.js';
import { generateDashboard, getQuickStatus } from './utils/analytics-dashboard.js';
import { getContentChangeTracker } from './utils/content-change-tracker.js';

/**
 * TC-004: Debug mode flag
 * When false, debug tools (capture_screenshot, export_har, debug_traces) are hidden from tool list
 * Set LLM_BROWSER_DEBUG_MODE=1 or LLM_BROWSER_DEBUG_MODE=true to enable
 */
const DEBUG_MODE = ['1', 'true'].includes(
  (process.env.LLM_BROWSER_DEBUG_MODE || '').toLowerCase()
);

/**
 * List of tool names that require DEBUG_MODE to be enabled
 */
const DEBUG_TOOLS = ['capture_screenshot', 'export_har', 'debug_traces'];

/**
 * TC-005/TC-006: Admin mode flag
 * When false, analytics and infrastructure tools are hidden from tool list
 * Set LLM_BROWSER_ADMIN_MODE=1 or LLM_BROWSER_ADMIN_MODE=true to enable
 *
 * Hidden tools:
 * - Analytics: get_performance_metrics, usage_analytics, get_analytics_dashboard, get_system_status
 * - Infrastructure: get_browser_providers, tier_management
 */
const ADMIN_MODE = ['1', 'true'].includes(
  (process.env.LLM_BROWSER_ADMIN_MODE || '').toLowerCase()
);

/**
 * List of tool names that require ADMIN_MODE to be enabled
 */
const ADMIN_TOOLS = [
  // TC-005: Analytics tools
  'get_performance_metrics',
  'usage_analytics',
  'get_analytics_dashboard',
  'get_system_status',
  // TC-006: Infrastructure tools
  'get_browser_providers',
  'tier_management',
];

/**
 * Create a versioned JSON response for MCP tools
 * All successful responses include schemaVersion for client compatibility
 */
function jsonResponse(data: object, indent: number = 2): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(addSchemaVersion(data), null, indent) }],
  };
}

/**
 * Create a structured error response for MCP tools (CX-004)
 *
 * Returns a structured error with:
 * - category: High-level error category (network, auth, content, etc.)
 * - code: Specific error code for programmatic handling
 * - retryable: Whether the error is likely to succeed on retry
 * - recommendedActions: Suggested actions for LLM recovery
 * - context: Additional context about the error
 *
 * Note: Errors don't include schema version for backward compatibility
 */
function errorResponse(
  error: Error | string,
  classificationContext?: ClassificationContext,
  errorContext?: ErrorContext
): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  // Extract security category from UrlSafetyError if applicable
  const securityCategory = error instanceof UrlSafetyError ? error.category : undefined;

  // Build classification context with security category
  const fullClassificationContext: ClassificationContext = {
    ...classificationContext,
    securityCategory: securityCategory || classificationContext?.securityCategory,
  };

  // Build structured error
  const structuredError = buildStructuredError(error, fullClassificationContext, errorContext);

  return {
    content: [{ type: 'text', text: JSON.stringify(structuredError) }],
    isError: true,
  };
}

// Initialize core components
const browserManager = new BrowserManager();
const contentExtractor = new ContentExtractor();
const apiAnalyzer = new ApiAnalyzer();
const sessionManager = new SessionManager('./sessions');
const learningEngine = new LearningEngine('./enhanced-knowledge-base.json');

// Initialize smart browser (unified intelligent browsing)
const smartBrowser = new SmartBrowser(
  browserManager,
  contentExtractor,
  apiAnalyzer,
  sessionManager
);

// Initialize legacy tools (for backward compatibility)
const browseTool = new BrowseTool(
  browserManager,
  contentExtractor,
  apiAnalyzer,
  sessionManager,
  learningEngine
);
const apiCallTool = new ApiCallTool(browserManager);

// Initialize auth workflow
const authWorkflow = new AuthWorkflow(sessionManager);

// Create MCP server
const server = new Server(
  {
    name: 'llm-browser',
    version: '0.5.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ============================================
      // PRIMARY TOOL: Smart Browse (Recommended)
      // ============================================
      {
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

The browser gets smarter with every use. For government sites like boe.es,
extranjeria.gob.es, uscis.gov, etc., it has pre-configured patterns.

Output size controls (use for large pages):
- maxChars: Truncate markdown content to this length
- includeTables: Include extracted tables (default: true)
- includeNetwork: Include network requests (default: false)
- includeConsole: Include console logs (default: false)
- includeHtml: Include raw HTML (default: false)

Budget controls (CX-005) - Control cost/latency tradeoffs:
- maxLatencyMs: Stop tier fallback if latency exceeds this value
- maxCostTier: Limit to cheaper tiers (intelligence < lightweight < playwright)
- freshnessRequirement: 'realtime' (always fresh), 'cached' (prefer cache), 'any' (default)

Returns: Content, tables, APIs discovered, learning insights, and budget tracking.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to browse',
            },
            contentType: {
              type: 'string',
              enum: ['main_content', 'requirements', 'fees', 'timeline', 'documents', 'contact', 'table'],
              description: 'Type of content to extract (helps select right selectors)',
            },
            followPagination: {
              type: 'boolean',
              description: 'Follow pagination to get all pages (default: false)',
            },
            maxPages: {
              type: 'number',
              description: 'Maximum pages to follow if pagination enabled (default: 5)',
            },
            checkForChanges: {
              type: 'boolean',
              description: 'Check if content changed since last visit (default: false)',
            },
            waitForSelector: {
              type: 'string',
              description: 'CSS selector to wait for (for SPAs)',
            },
            scrollToLoad: {
              type: 'boolean',
              description: 'Scroll to trigger lazy-loaded content (default: false)',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile for authenticated access (default: "default")',
            },
            // Output size controls
            maxChars: {
              type: 'number',
              description: 'Maximum characters for markdown content (default: no limit). Use for large pages.',
            },
            includeTables: {
              type: 'boolean',
              description: 'Include extracted tables in response (default: true)',
            },
            includeNetwork: {
              type: 'boolean',
              description: 'Include network request data (default: false). Can be large.',
            },
            includeConsole: {
              type: 'boolean',
              description: 'Include browser console logs (default: false)',
            },
            includeHtml: {
              type: 'boolean',
              description: 'Include raw HTML in response (default: false). Can be very large.',
            },
            includeDecisionTrace: {
              type: 'boolean',
              description: 'Include detailed decision trace showing tier attempts, selector attempts, and fallbacks (default: false). Useful for debugging and understanding extraction decisions.',
            },
            // Budget controls (CX-005)
            maxLatencyMs: {
              type: 'number',
              description: 'Maximum acceptable latency in milliseconds. If exceeded, tier fallback stops early. Use to limit response time.',
            },
            maxCostTier: {
              type: 'string',
              enum: ['intelligence', 'lightweight', 'playwright'],
              description: 'Maximum cost tier to use. "intelligence" = cheapest (no browser), "lightweight" = allow basic JS, "playwright" = allow full browser. More expensive tiers will be skipped.',
            },
            freshnessRequirement: {
              type: 'string',
              enum: ['realtime', 'cached', 'any'],
              description: 'Content freshness requirement. "realtime" = always fetch fresh, "cached" = prefer cache, "any" = use cache if available (default).',
            },
            // Domain insights (TC-002)
            includeInsights: {
              type: 'boolean',
              description: 'Include domain capabilities and knowledge summary in response (default: true). Set to false to reduce response size.',
            },
          },
          required: ['url'],
        },
      },

      // ============================================
      // BATCH BROWSE (F-001)
      // ============================================
      {
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

All smart_browse options (contentType, maxChars, etc.) can be applied to each URL.

Returns: Array of results with per-URL status, timing, and content.`,
        inputSchema: {
          type: 'object',
          properties: {
            urls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of URLs to browse',
            },
            // Batch options
            concurrency: {
              type: 'number',
              description: 'Maximum parallel requests (default: 3). Higher values are faster but may trigger rate limits.',
            },
            stopOnError: {
              type: 'boolean',
              description: 'Stop entire batch on first error (default: false). When false, errors are recorded but processing continues.',
            },
            continueOnRateLimit: {
              type: 'boolean',
              description: 'Continue batch when rate limited (default: true). Rate-limited URLs are marked as such.',
            },
            perUrlTimeoutMs: {
              type: 'number',
              description: 'Timeout per URL in milliseconds. Overrides default browse timeout.',
            },
            totalTimeoutMs: {
              type: 'number',
              description: 'Total batch timeout in milliseconds. Remaining URLs are skipped when exceeded.',
            },
            // Browse options (applied to each URL)
            contentType: {
              type: 'string',
              enum: ['main_content', 'requirements', 'fees', 'timeline', 'documents', 'contact', 'table'],
              description: 'Type of content to extract from each URL',
            },
            waitForSelector: {
              type: 'string',
              description: 'CSS selector to wait for on each page',
            },
            scrollToLoad: {
              type: 'boolean',
              description: 'Scroll to trigger lazy-loaded content on each page',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile for authenticated access',
            },
            // Output controls
            maxChars: {
              type: 'number',
              description: 'Maximum characters for markdown content per URL',
            },
            includeTables: {
              type: 'boolean',
              description: 'Include extracted tables (default: true)',
            },
            includeNetwork: {
              type: 'boolean',
              description: 'Include network requests (default: false)',
            },
            includeConsole: {
              type: 'boolean',
              description: 'Include console logs (default: false)',
            },
            // Budget controls
            maxLatencyMs: {
              type: 'number',
              description: 'Maximum latency per URL in milliseconds',
            },
            maxCostTier: {
              type: 'string',
              enum: ['intelligence', 'lightweight', 'playwright'],
              description: 'Maximum cost tier to use per URL',
            },
          },
          required: ['urls'],
        },
      },

      // ============================================
      // DOMAIN INTELLIGENCE
      // ============================================
      {
        name: 'get_domain_intelligence',
        description: `[DEPRECATED - Use smart_browse with includeInsights=true instead. Domain insights are now automatically included in browse responses.]

Get intelligence summary for a domain.

Shows what the browser has learned about a domain:
- Known API patterns
- Learned content selectors
- Validation rules
- Pagination patterns
- Recent failure patterns
- Success rate
- Domain group (spanish_gov, us_gov, eu_gov)
- Recommended strategies

Use this to understand how well the browser knows a domain before browsing.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Domain to check (e.g., "boe.es", "uscis.gov")',
            },
          },
          required: ['domain'],
        },
      },
      {
        name: 'get_domain_capabilities',
        description: `[DEPRECATED - Use smart_browse with includeInsights=true instead. Domain capabilities are now automatically included in browse responses.]

Get comprehensive capability summary for a domain (CX-011).

Returns an LLM-friendly summary of what the browser can do for a domain:

**Capabilities** (boolean flags):
- canBypassBrowser: Can make direct API calls without rendering
- hasLearnedPatterns: Has discovered API patterns
- hasActiveSession: Has saved authentication
- hasSkills: Has learned procedural skills
- hasPagination: Can navigate paginated content
- hasContentSelectors: Has learned content extraction patterns

**Confidence**:
- level: high/medium/low/unknown
- score: 0.0-1.0 success rate
- basis: Explanation of confidence assessment

**Performance**:
- preferredTier: intelligence/lightweight/playwright
- avgResponseTimeMs: Average response time
- successRate: Overall success rate

**Recommendations**:
- Actionable suggestions for best results

Use this before browsing to understand domain capabilities and choose optimal strategies.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Domain to check (e.g., "boe.es", "uscis.gov")',
            },
          },
          required: ['domain'],
        },
      },

      // ============================================
      // SCREENSHOT CAPTURE
      // ============================================
      {
        name: 'capture_screenshot',
        description: `Capture a screenshot of a webpage for visual debugging.

This tool navigates to a URL and captures a screenshot, returning the image as base64-encoded PNG.
Useful for:
- Debugging rendering issues
- Verifying page content visually
- Capturing evidence of page state
- Understanding layout and visual elements

**Requirements:**
- Requires Playwright to be installed (full browser rendering)
- Cannot use intelligence or lightweight tiers

**Options:**
- fullPage: Capture entire page including scroll (default: true)
- element: CSS selector for specific element screenshot
- waitForSelector: Wait for element before capturing
- width/height: Custom viewport dimensions
- sessionProfile: Use authenticated session

Returns base64-encoded PNG image with metadata (URL, title, viewport, timing).`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to screenshot',
            },
            fullPage: {
              type: 'boolean',
              description: 'Capture full page including scrolled content (default: true)',
            },
            element: {
              type: 'string',
              description: 'CSS selector to screenshot specific element instead of full page',
            },
            waitForSelector: {
              type: 'string',
              description: 'CSS selector to wait for before capturing screenshot',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile for authenticated pages (default: "default")',
            },
            width: {
              type: 'number',
              description: 'Custom viewport width in pixels (default: 1920)',
            },
            height: {
              type: 'number',
              description: 'Custom viewport height in pixels (default: 1080)',
            },
          },
          required: ['url'],
        },
      },

      // ============================================
      // HAR EXPORT
      // ============================================
      {
        name: 'export_har',
        description: `Export HAR (HTTP Archive) file for network debugging.

This tool navigates to a URL and captures all network traffic, returning it in HAR 1.2 format.
Useful for:
- Network debugging and analysis
- Performance profiling
- Identifying slow requests
- Capturing API call patterns
- Debugging authentication flows

**Requirements:**
- Requires Playwright to be installed (full browser rendering)
- Cannot use intelligence or lightweight tiers

**Options:**
- includeResponseBodies: Include response body content (default: true)
- maxBodySize: Maximum size for response bodies (default: 1MB)
- pageTitle: Custom title for the HAR page entry
- waitForSelector: Wait for element before capturing
- sessionProfile: Use authenticated session

Returns HAR 1.2 JSON with all network requests, responses, and timings.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to browse and capture network traffic',
            },
            includeResponseBodies: {
              type: 'boolean',
              description: 'Include response body content in HAR (default: true)',
            },
            maxBodySize: {
              type: 'number',
              description: 'Maximum size in bytes for response bodies (default: 1MB)',
            },
            pageTitle: {
              type: 'string',
              description: 'Custom title for the HAR page entry',
            },
            waitForSelector: {
              type: 'string',
              description: 'CSS selector to wait for before capturing HAR',
            },
            sessionProfile: {
              type: 'string',
              description: 'Session profile for authenticated pages (default: "default")',
            },
          },
          required: ['url'],
        },
      },

      // ============================================
      // LEARNING MANAGEMENT
      // ============================================
      {
        name: 'get_learning_stats',
        description: `[DEPRECATED - Domain-specific insights are now included in smart_browse responses. This global stats tool will be moved to a debug/admin interface.]

Get comprehensive statistics about the browser's learning.

Shows:
- Total domains with learned patterns
- API patterns discovered (and how many can bypass rendering)
- Learned content selectors
- Validation rules
- Domain groups
- Recent learning events

Use this to understand the browser's overall intelligence level.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_learning_effectiveness',
        description: `[DEPRECATED - Domain-specific insights are now included in smart_browse responses. This comprehensive metrics tool will be moved to a debug/admin interface.]

Get comprehensive learning effectiveness metrics (LI-003).

Shows how well the learning system is performing:

**Pattern Effectiveness**:
- Hit rate: How often discovered patterns are successfully used
- Confidence accuracy: High/medium/low confidence patterns and their actual success rates
- Bypassable patterns: Patterns that can skip browser rendering

**Confidence Accuracy**:
- Overall accuracy: How well predicted confidence matches actual success
- Confidence gap: Over/under-confident patterns
- Calibration by level: Accuracy at each confidence tier

**Tier Optimization**:
- First tier success rate: How often the first tier choice is correct
- Time saved: Milliseconds saved by intelligent tier selection
- Tier distribution: Usage counts for intelligence/lightweight/playwright

**Skill Effectiveness**:
- Reuse rate: How often learned skills are reused
- Success rate: Average skill execution success
- Anti-patterns: Things learned NOT to do

**Health Score**: 0-100 overall learning health

**Insights**: Actionable recommendations for improvement

Use this to assess learning ROI and identify areas for improvement.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ============================================
      // PROCEDURAL MEMORY (Skills) - Consolidated
      // ============================================
      {
        name: 'skill_management',
        description: `[DEPRECATED] Manage learned browsing skills (procedural memory).

NOTE: This tool is deprecated as of TC-003. Skills are now automatically applied
during smart_browse operations when a matching skill is found. The browse response
includes a skillExecutionTrace field with details about any skill that was applied.

For most use cases, you no longer need to call this tool - just use smart_browse
and skills will be applied automatically.

Actions (deprecated, kept for advanced use cases):
- stats: Get skill statistics (total, by domain, success rates, most used)
- progress: Comprehensive learning progress (skills, anti-patterns, coverage)
- find: Find applicable skills for a URL
- details: Get detailed info about a specific skill
- explain: Get human-readable explanation of a skill
- versions: Get version history for a skill
- rollback: Rollback a skill to a previous version
- rate: Rate skill application (positive/negative feedback)
- anti_patterns: Get learned anti-patterns (things to avoid)
- dependencies: Manage skill dependencies and fallback chains
- bootstrap: Initialize with common skill templates
- export: Export skills as portable skill pack
- import: Import skills from skill pack
- pack_stats: Get statistics about current skill pack
- manage: Export/import/prune/reset/coverage/workflows

The browser learns reusable skills from successful browsing sessions.
Skills are multi-step action sequences that can be applied to similar pages.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['stats', 'progress', 'find', 'details', 'explain', 'versions', 'rollback', 'rate', 'anti_patterns', 'dependencies', 'bootstrap', 'export', 'import', 'pack_stats', 'manage'],
              description: 'Action to perform',
            },
            // For find action
            url: { type: 'string', description: 'URL for find/rate actions' },
            topK: { type: 'number', description: 'Max skills to return (find action, default: 3)' },
            // For details/explain/versions/rollback/rate/dependencies actions
            skillId: { type: 'string', description: 'Skill ID for details/explain/versions/rollback/rate/dependencies actions' },
            targetVersion: { type: 'number', description: 'Target version for rollback action' },
            // For rate action
            rating: { type: 'string', enum: ['positive', 'negative'], description: 'Rating for rate action' },
            reason: { type: 'string', description: 'Reason for rating' },
            // For anti_patterns action
            domain: { type: 'string', description: 'Domain filter for anti_patterns action' },
            // For dependencies action
            dependencyAction: { type: 'string', enum: ['add_fallbacks', 'add_prerequisites', 'get_chain'], description: 'Dependency action type' },
            relatedSkillIds: { type: 'array', items: { type: 'string' }, description: 'Related skill IDs for dependencies' },
            // For export action
            domainPatterns: { type: 'array', items: { type: 'string' }, description: 'Filter by domain patterns for export' },
            verticals: {
              type: 'array',
              items: { type: 'string', enum: ['government', 'ecommerce', 'documentation', 'social', 'news', 'developer', 'finance', 'travel', 'healthcare', 'education', 'general'] },
              description: 'Filter by verticals for export/import',
            },
            includeAntiPatterns: { type: 'boolean', description: 'Include anti-patterns in export' },
            includeWorkflows: { type: 'boolean', description: 'Include workflows in export' },
            minSuccessRate: { type: 'number', description: 'Min success rate for export/prune' },
            minUsageCount: { type: 'number', description: 'Min usage count for export' },
            packName: { type: 'string', description: 'Name for skill pack' },
            packDescription: { type: 'string', description: 'Description for skill pack' },
            // For import action
            skillPackJson: { type: 'string', description: 'Skill pack JSON for import' },
            conflictResolution: { type: 'string', enum: ['skip', 'overwrite', 'merge', 'rename'], description: 'Conflict resolution for import' },
            domainFilter: { type: 'array', items: { type: 'string' }, description: 'Domain filter for import' },
            importAntiPatterns: { type: 'boolean', description: 'Import anti-patterns' },
            importWorkflows: { type: 'boolean', description: 'Import workflows' },
            resetMetrics: { type: 'boolean', description: 'Reset metrics on import' },
            namePrefix: { type: 'string', description: 'Prefix for imported skill names' },
            // For manage action
            manageAction: { type: 'string', enum: ['export', 'import', 'prune', 'reset', 'coverage', 'workflows'], description: 'Management action' },
            data: { type: 'string', description: 'JSON data for manage import' },
          },
          required: ['action'],
        },
      },

      // ============================================
      // API & SESSION TOOLS
      // ============================================
      {
        name: 'execute_api_call',
        description: `Execute a direct API call using saved session authentication.

Bypasses browser rendering for discovered API endpoints.
Use after discovering an API with smart_browse.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The API endpoint URL' },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            },
            headers: { type: 'object' },
            body: { type: 'object' },
            sessionProfile: { type: 'string' },
          },
          required: ['url'],
        },
      },
      // ============================================
      // SESSION MANAGEMENT - Consolidated
      // ============================================
      {
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
      },

      // ============================================
      // BROWSER PROVIDERS
      // ============================================
      {
        name: 'get_browser_providers',
        description: `Get information about available browser providers.

Shows which remote browser services are configured and available:
- Local: Uses installed Playwright (default)
- Browserless.io: Standard CDP endpoint (BROWSERLESS_TOKEN)
- Bright Data: Anti-bot focused with CAPTCHA solving (BRIGHTDATA_AUTH)
- Custom: Any CDP-compatible endpoint (BROWSER_ENDPOINT)

Each provider has different capabilities:
- antiBot: Handles CAPTCHAs, Cloudflare, etc.
- geoTargeting: Can target specific countries
- residential: Uses residential IPs
- sessionPersistence: Maintains browser sessions

Use this to understand your browser infrastructure options.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ============================================
      // TIERED RENDERING - Consolidated
      // ============================================
      {
        name: 'tier_management',
        description: `Manage tiered rendering for domains.

Actions:
- stats: Get tiered fetcher statistics (domains by tier, response times, playwright availability)
- set: Set preferred tier for a domain (intelligence, lightweight, playwright)
- usage: Get tier usage analytics by domain (success/failure, response times)

Tiers: intelligence (~50-200ms), lightweight (~200-500ms), playwright (~2-5s, optional).`,
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['stats', 'set', 'usage'], description: 'Action to perform' },
            domain: { type: 'string', description: 'Domain (set/usage actions)' },
            tier: { type: 'string', enum: ['intelligence', 'lightweight', 'playwright'], description: 'Tier to set (set action) or filter (usage action)' },
            sortBy: { type: 'string', enum: ['domain', 'tier', 'successRate', 'responseTime', 'lastUsed'], description: 'Sort field (usage action)' },
            limit: { type: 'number', description: 'Max domains (usage action, default: 50)' },
          },
          required: ['action'],
        },
      },

      // ============================================
      // PERFORMANCE METRICS
      // ============================================
      {
        name: 'get_performance_metrics',
        description: `Get comprehensive performance metrics for all tiers.

Returns detailed timing statistics including:
- System-wide performance summary (total requests, success rate)
- Per-tier percentile statistics (p50, p95, p99, min, max, avg)
- Component breakdown (network, parsing, JS execution times)
- Top fastest and slowest domains
- Per-domain detailed metrics

Options:
- domain: Get metrics for a specific domain (optional)
- sortBy: Sort domains by 'avgTime', 'p95', or 'successRate' (default: avgTime)
- order: 'asc' or 'desc' (default: asc for time, desc for successRate)
- limit: Maximum domains to return in ranking (default: 20)

Use this to:
- Identify performance bottlenecks
- Compare tier efficiency
- Find slow or unreliable domains
- Monitor overall system health`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Get detailed metrics for a specific domain (optional)',
            },
            sortBy: {
              type: 'string',
              enum: ['avgTime', 'p95', 'successRate'],
              description: 'Sort domain rankings by this metric (default: avgTime)',
            },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order (default: asc for time metrics, desc for successRate)',
            },
            limit: {
              type: 'number',
              description: 'Maximum domains to return in rankings (default: 20)',
            },
          },
        },
      },

      // ============================================
      // CONTENT CHANGE TRACKING (F-003)
      // ============================================
      {
        name: 'content_tracking',
        description: `Track and detect content changes on websites.

Actions:
- track: Start tracking a URL (browses and stores fingerprint)
- check: Check if tracked content has changed (auto-tracks if new)
- list: List tracked URLs with filtering
- history: Get change history
- untrack: Stop tracking a URL
- stats: Get tracking statistics

Use cases: Monitor government sites, track pricing, detect regulatory updates.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['track', 'check', 'list', 'history', 'untrack', 'stats'],
              description: 'Action to perform',
            },
            url: {
              type: 'string',
              description: 'URL (required for track, check, untrack; optional filter for history)',
            },
            label: {
              type: 'string',
              description: 'Label for tracked URL (track action)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization (track action) or filtering (list action)',
            },
            domain: {
              type: 'string',
              description: 'Filter by domain (list action)',
            },
            hasChanges: {
              type: 'boolean',
              description: 'Filter by change status (list action)',
            },
            limit: {
              type: 'number',
              description: 'Max results (list, history actions)',
            },
          },
          required: ['action'],
        },
      },

      // ============================================
      // API AUTHENTICATION WORKFLOW
      // ============================================
      {
        name: 'get_api_auth_status',
        description: `[DEPRECATED - Use api_auth with action='status'] Get authentication status for a domain's discovered APIs.

Shows:
- Detected authentication requirements (from API documentation)
- Currently configured credentials
- Missing authentication that needs configuration
- Overall status (not_configured, partially_configured, configured, expired)

Use this before making API calls to understand what auth is needed.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'The domain to check auth status for',
            },
            profile: {
              type: 'string',
              description: 'Auth profile name (default: "default")',
            },
          },
          required: ['domain'],
        },
      },
      {
        name: 'configure_api_auth',
        description: `[DEPRECATED - Use api_auth with action='configure'] Configure API authentication credentials for a domain.

Supports multiple auth types:
- api_key: API key in header, query param, or cookie
- bearer: Bearer token authentication
- basic: Username/password basic auth
- oauth2: OAuth 2.0 flows (authorization_code, client_credentials, password)
- cookie: Cookie-based session authentication

For OAuth 2.0 authorization_code flow, this will return a URL to visit.
After authorizing, use complete_oauth to finish the flow.

Credentials are stored securely and persist across sessions.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'The domain to configure auth for',
            },
            authType: {
              type: 'string',
              enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'],
              description: 'The type of authentication',
            },
            credentials: {
              type: 'object',
              description: 'The credentials (varies by authType). See get_auth_guidance for required fields.',
            },
            profile: {
              type: 'string',
              description: 'Auth profile name (default: "default"). Use different profiles for multiple accounts.',
            },
            validate: {
              type: 'boolean',
              description: 'Whether to validate credentials (default: true)',
            },
          },
          required: ['domain', 'authType', 'credentials'],
        },
      },
      {
        name: 'complete_oauth',
        description: `[DEPRECATED - Use api_auth with action='complete_oauth'] Complete OAuth 2.0 authorization_code flow after user authorization.

After configure_api_auth with oauth2 authorization_code flow returns a URL,
the user visits that URL and authorizes. They receive a code.
Use this tool with that code and state to complete the flow.`,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The authorization code received after user authorization',
            },
            state: {
              type: 'string',
              description: 'The state parameter from the original authorization URL',
            },
          },
          required: ['code', 'state'],
        },
      },
      {
        name: 'get_auth_guidance',
        description: `[DEPRECATED - Use api_auth with action='guidance'] Get guidance for configuring a specific auth type.

Returns:
- Instructions for what credentials are needed
- Required and optional fields
- Example configuration

Use this to understand what credentials to provide before calling configure_api_auth.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'The domain to get auth guidance for',
            },
            authType: {
              type: 'string',
              enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'],
              description: 'The auth type to get guidance for (optional - shows all detected if not specified)',
            },
          },
          required: ['domain'],
        },
      },
      {
        name: 'delete_api_auth',
        description: `[DEPRECATED - Use api_auth with action='delete'] Delete stored API authentication credentials.

Removes credentials for a domain. Can delete specific auth type or all credentials.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'The domain to delete auth for',
            },
            authType: {
              type: 'string',
              enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'],
              description: 'Specific auth type to delete (optional - deletes all if not specified)',
            },
            profile: {
              type: 'string',
              description: 'Auth profile name (default: "default")',
            },
          },
          required: ['domain'],
        },
      },
      {
        name: 'list_configured_auth',
        description: `[DEPRECATED - Use api_auth with action='list'] List all domains with configured API authentication.

Shows which domains have auth configured and what types.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ============================================
      // UNIFIED API AUTH TOOL (TC-001)
      // ============================================
      {
        name: 'api_auth',
        description: `Unified API authentication management. Configure, manage, and inspect authentication credentials for API access.

Actions:
- status: Check auth status for a domain (shows detected requirements, configured credentials, missing auth)
- configure: Configure credentials for a domain (api_key, bearer, basic, oauth2, cookie)
- complete_oauth: Complete OAuth2 authorization code flow after user authorization
- guidance: Get help and examples for configuring authentication
- delete: Delete stored credentials for a domain
- list: List all domains with configured authentication

This tool consolidates all auth operations into a single interface.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['status', 'configure', 'complete_oauth', 'guidance', 'delete', 'list'],
              description: 'Action to perform',
            },
            domain: {
              type: 'string',
              description: 'Domain to operate on (required for status, configure, guidance, delete)',
            },
            profile: {
              type: 'string',
              description: 'Auth profile name (default: "default")',
            },
            authType: {
              type: 'string',
              enum: ['api_key', 'bearer', 'basic', 'oauth2', 'cookie'],
              description: 'Authentication type (required for configure, optional for guidance/delete)',
            },
            credentials: {
              type: 'object',
              description: 'Credentials object (required for configure action). Structure depends on authType.',
            },
            validate: {
              type: 'boolean',
              description: 'Whether to validate credentials (default: true, for configure action)',
            },
            code: {
              type: 'string',
              description: 'OAuth authorization code (required for complete_oauth action)',
            },
            state: {
              type: 'string',
              description: 'OAuth state parameter (required for complete_oauth action)',
            },
          },
          required: ['action'],
        },
      },

      // ============================================
      // DEBUG TRACE RECORDING (O-005) - Consolidated
      // ============================================
      {
        name: 'debug_traces',
        description: `Query and manage debug traces for failure analysis and replay.

Actions:
- list: Query traces with filters (domain, urlPattern, success, errorType, tier)
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
            // For list action
            domain: { type: 'string', description: 'Filter by domain (list action)' },
            urlPattern: { type: 'string', description: 'Filter by URL pattern regex (list action)' },
            success: { type: 'boolean', description: 'Filter by success/failure (list action)' },
            errorType: {
              type: 'string',
              enum: ['timeout', 'network', 'selector', 'validation', 'bot_challenge', 'rate_limit', 'auth', 'unknown'],
              description: 'Filter by error type (list action)',
            },
            tier: { type: 'string', enum: ['intelligence', 'lightweight', 'playwright'], description: 'Filter by tier (list action)' },
            limit: { type: 'number', description: 'Max results (list action, default: 20)' },
            offset: { type: 'number', description: 'Pagination offset (list action)' },
            // For get/delete actions
            id: { type: 'string', description: 'Trace ID (get/delete actions)' },
            // For export action
            ids: { type: 'array', items: { type: 'string' }, description: 'Trace IDs to export' },
            // For configure action
            enabled: { type: 'boolean', description: 'Enable/disable recording (configure action)' },
            onlyRecordFailures: { type: 'boolean', description: 'Only record failures (configure action)' },
            alwaysRecordDomain: { type: 'string', description: 'Domain to always record (configure action)' },
            neverRecordDomain: { type: 'string', description: 'Domain to never record (configure action)' },
            maxTraces: { type: 'number', description: 'Max traces to retain (configure action)' },
            maxAgeHours: { type: 'number', description: 'Max age in hours (configure action)' },
          },
          required: ['action'],
        },
      },

      // ============================================
      // USAGE METERING (GTM-001) - Consolidated
      // ============================================
      {
        name: 'usage_analytics',
        description: `Get usage statistics and cost analysis for the LLM Browser.

Actions:
- summary: Get comprehensive usage stats (requests, costs, success rate, tier breakdown)
- by_period: Get usage breakdown by time period (hourly/daily trends)
- cost_breakdown: Get detailed cost breakdown by tier with recommendations
- reset: Reset all usage meters (use with caution)

Cost units: Intelligence=1, Lightweight=5, Playwright=25 units.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['summary', 'by_period', 'cost_breakdown', 'reset'],
              description: 'Action to perform',
            },
            period: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'all'], description: 'Time period (summary/cost_breakdown)' },
            domain: { type: 'string', description: 'Filter by domain' },
            tier: { type: 'string', enum: ['intelligence', 'lightweight', 'playwright'], description: 'Filter by tier (summary)' },
            tenantId: { type: 'string', description: 'Filter by tenant (summary)' },
            granularity: { type: 'string', enum: ['hour', 'day'], description: 'Time granularity (by_period)' },
            periods: { type: 'number', description: 'Number of periods (by_period)' },
          },
          required: ['action'],
        },
      },

      // ============================================
      // ANALYTICS DASHBOARD (GTM-002)
      // ============================================
      {
        name: 'get_analytics_dashboard',
        description: `Get a comprehensive analytics dashboard for the LLM Browser.

Provides a unified view of system analytics including:
- Summary metrics (requests, costs, success rate, latency)
- System health assessment with recommendations
- Per-tier breakdown (intelligence, lightweight, playwright)
- Top domains by cost, requests, and latency
- Time series data for trend visualization
- Period-over-period trends

This is the primary tool for understanding system performance and usage.

Parameters:
- period: Time period for analysis (hour, day, week, month, all)
- topDomainsLimit: Number of top domains to include (default: 10)
- timeSeriesPoints: Number of time series data points
- domain: Filter to a specific domain
- tenantId: Filter to a specific tenant`,
        inputSchema: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'all'],
              description: 'Time period for analysis (default: day)',
            },
            topDomainsLimit: {
              type: 'number',
              description: 'Number of top domains to include (default: 10)',
            },
            timeSeriesPoints: {
              type: 'number',
              description: 'Number of time series data points',
            },
            domain: {
              type: 'string',
              description: 'Filter to specific domain',
            },
            tenantId: {
              type: 'string',
              description: 'Filter to specific tenant',
            },
          },
        },
      },
      {
        name: 'get_system_status',
        description: `Get a quick system status check.

Returns a compact summary suitable for health monitoring:
- Overall status (healthy, degraded, unhealthy)
- 24-hour request count
- Success rate
- Average latency
- Cost units consumed

Use this for quick health checks. For detailed analytics, use get_analytics_dashboard.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    // TC-004: Filter out debug tools if DEBUG_MODE is disabled
    // TC-005/TC-006: Filter out admin tools if ADMIN_MODE is disabled
    ].filter(tool => {
      if (!DEBUG_MODE && DEBUG_TOOLS.includes(tool.name)) return false;
      if (!ADMIN_MODE && ADMIN_TOOLS.includes(tool.name)) return false;
      return true;
    }),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // TC-004: Block debug tools if DEBUG_MODE is disabled (safety check)
  if (!DEBUG_MODE && DEBUG_TOOLS.includes(name)) {
    return errorResponse(
      `${name} is a debug tool and requires LLM_BROWSER_DEBUG_MODE=1 to be set. ` +
      'Debug tools are hidden by default to reduce cognitive load for LLMs.'
    );
  }

  // TC-005/TC-006: Block admin tools if ADMIN_MODE is disabled (safety check)
  if (!ADMIN_MODE && ADMIN_TOOLS.includes(name)) {
    return errorResponse(
      `${name} is an admin tool and requires LLM_BROWSER_ADMIN_MODE=1 to be set. ` +
      'Admin tools (analytics, infrastructure) are hidden by default to reduce cognitive load for LLMs.'
    );
  }

  try {
    if (!args) {
      throw new Error('Missing arguments');
    }

    switch (name) {
      // ============================================
      // SMART BROWSE (Primary Tool)
      // ============================================
      case 'smart_browse': {
        const result = await smartBrowser.browse(args.url as string, {
          contentType: args.contentType as any,
          followPagination: args.followPagination as boolean,
          maxPages: args.maxPages as number,
          checkForChanges: args.checkForChanges as boolean,
          waitForSelector: args.waitForSelector as string,
          scrollToLoad: args.scrollToLoad as boolean,
          sessionProfile: args.sessionProfile as string,
          validateContent: true,
          enableLearning: true,
          includeDecisionTrace: args.includeDecisionTrace as boolean,
          // Budget controls (CX-005)
          maxLatencyMs: args.maxLatencyMs as number | undefined,
          maxCostTier: args.maxCostTier as 'intelligence' | 'lightweight' | 'playwright' | undefined,
          freshnessRequirement: args.freshnessRequirement as 'realtime' | 'cached' | 'any' | undefined,
        });

        // Output size control options (with sensible defaults for smaller responses)
        const maxChars = args.maxChars as number | undefined;
        const includeTables = args.includeTables !== false; // Default: true
        const includeNetwork = args.includeNetwork === true; // Default: false
        const includeConsole = args.includeConsole === true; // Default: false
        const includeHtml = args.includeHtml === true; // Default: false

        // Apply maxChars truncation to markdown content
        let markdown = result.content.markdown;
        let wasTruncated = false;
        if (maxChars && markdown.length > maxChars) {
          markdown = markdown.substring(0, maxChars);
          // Try to break at a word/sentence boundary
          const lastSpace = markdown.lastIndexOf(' ');
          const lastNewline = markdown.lastIndexOf('\n');
          const breakPoint = Math.max(lastSpace, lastNewline);
          if (breakPoint > maxChars * 0.8) {
            markdown = markdown.substring(0, breakPoint);
          }
          markdown += '\n\n[Content truncated - reached maxChars limit]';
          wasTruncated = true;
        }

        // Build content object based on flags
        const contentOutput: Record<string, unknown> = {
          markdown,
          textLength: result.content.text.length,
        };
        if (wasTruncated) {
          contentOutput.truncated = true;
          contentOutput.originalLength = result.content.markdown.length;
        }
        if (includeHtml) {
          contentOutput.html = result.content.html;
        }

        // Extract domain for insights
        const includeInsights = args.includeInsights !== false; // Default: true
        const domain = new URL(result.url).hostname;

        // Fetch domain insights if requested (TC-002)
        let domainCapabilities: DomainCapabilitiesSummary | undefined;
        let domainKnowledge: DomainKnowledgeSummary | undefined;

        if (includeInsights) {
          try {
            const [capabilities, intelligence] = await Promise.all([
              smartBrowser.getDomainCapabilities(domain),
              smartBrowser.getDomainIntelligence(domain),
            ]);

            // Use capabilities directly - same structure as DomainCapabilitiesSummary
            domainCapabilities = capabilities.capabilities;

            domainKnowledge = {
              patternCount: intelligence.knownPatterns,
              successRate: intelligence.successRate,
              recommendedWaitStrategy: intelligence.recommendedWaitStrategy,
              recommendations: capabilities.recommendations.slice(0, 3),
            };
          } catch (error) {
            // Don't fail the browse if insights fail - log and continue
            logger.server.warn('Failed to fetch domain insights', { domain, error });
          }
        }

        // Format result for LLM consumption
        const formattedResult: Record<string, unknown> = {
          url: result.url,
          title: result.title,
          content: contentOutput,
          metadata: result.metadata,
          // Learning insights (key differentiator)
          intelligence: {
            confidenceLevel: result.learning.confidenceLevel,
            domainGroup: result.learning.domainGroup,
            validationPassed: result.learning.validationResult?.valid,
            validationIssues: result.learning.validationResult?.reasons,
            contentChanged: result.learning.contentChanged,
            recommendedRefreshHours: result.learning.recommendedRefreshHours,
            paginationAvailable: !!result.learning.paginationDetected,
            selectorsSucceeded: result.learning.selectorsSucceeded.length,
            selectorsFailed: result.learning.selectorsFailed.length,
            // Procedural memory insights
            skillApplied: result.learning.skillApplied,
            skillsMatched: result.learning.skillsMatched?.length || 0,
            trajectoryRecorded: result.learning.trajectoryRecorded,
            // Tiered rendering insights
            renderTier: result.learning.renderTier,
            tierFellBack: result.learning.tierFellBack,
            tierReason: result.learning.tierReason,
            // Budget tracking (CX-005)
            budgetInfo: result.learning.budgetInfo,
            // Domain insights (TC-002)
            domainCapabilities,
            domainKnowledge,
          },
          // Discovered APIs for future direct access
          discoveredApis: result.discoveredApis.map(api => ({
            endpoint: api.endpoint,
            method: api.method,
            canBypassBrowser: api.canBypass,
            confidence: api.confidence,
          })),
        };

        // Conditionally include tables
        if (includeTables && result.tables && result.tables.length > 0) {
          formattedResult.tables = result.tables;
        }

        // Conditionally include network data
        if (includeNetwork && result.network && result.network.length > 0) {
          formattedResult.network = result.network.map(req => ({
            url: req.url,
            method: req.method,
            status: req.status,
            contentType: req.contentType,
            duration: req.duration,
          }));
        }

        // Conditionally include console logs
        if (includeConsole && result.console && result.console.length > 0) {
          formattedResult.console = result.console;
        }

        // Additional pages if pagination was followed
        if (result.additionalPages && result.additionalPages.length > 0) {
          formattedResult.additionalPages = result.additionalPages.map(page => ({
            url: page.url,
            textLength: page.content.text.length,
          }));
        }

        // Conditionally include decision trace (CX-003)
        if (result.decisionTrace) {
          formattedResult.decisionTrace = result.decisionTrace;
        }

        return jsonResponse(formattedResult);
      }

      // ============================================
      // BATCH BROWSE (F-001)
      // ============================================
      case 'batch_browse': {
        const urls = args.urls as string[];

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          return errorResponse(new Error('urls must be a non-empty array of strings'));
        }

        // Build browse options from args
        const browseOptions = {
          contentType: args.contentType as any,
          waitForSelector: args.waitForSelector as string | undefined,
          scrollToLoad: args.scrollToLoad as boolean | undefined,
          sessionProfile: args.sessionProfile as string | undefined,
          validateContent: true,
          enableLearning: true,
          maxLatencyMs: args.maxLatencyMs as number | undefined,
          maxCostTier: args.maxCostTier as 'intelligence' | 'lightweight' | 'playwright' | undefined,
        };

        // Build batch options from args
        const batchOptions = {
          concurrency: args.concurrency as number | undefined,
          stopOnError: args.stopOnError as boolean | undefined,
          continueOnRateLimit: args.continueOnRateLimit as boolean | undefined,
          perUrlTimeoutMs: args.perUrlTimeoutMs as number | undefined,
          totalTimeoutMs: args.totalTimeoutMs as number | undefined,
        };

        // Output size control options
        const maxChars = args.maxChars as number | undefined;
        const includeTables = args.includeTables !== false;
        const includeNetwork = args.includeNetwork === true;
        const includeConsole = args.includeConsole === true;

        const batchResults = await smartBrowser.batchBrowse(urls, browseOptions, batchOptions);

        // Format each result for LLM consumption
        const formattedResults = batchResults.map(item => {
          const formatted: Record<string, unknown> = {
            url: item.url,
            status: item.status,
            durationMs: item.durationMs,
            index: item.index,
          };

          if (item.error) {
            formatted.error = item.error;
            formatted.errorCode = item.errorCode;
          }

          if (item.result) {
            // Apply maxChars truncation
            let markdown = item.result.content.markdown;
            let wasTruncated = false;
            if (maxChars && markdown.length > maxChars) {
              markdown = markdown.substring(0, maxChars);
              const lastSpace = markdown.lastIndexOf(' ');
              const lastNewline = markdown.lastIndexOf('\n');
              const breakPoint = Math.max(lastSpace, lastNewline);
              if (breakPoint > maxChars * 0.8) {
                markdown = markdown.substring(0, breakPoint);
              }
              markdown += '\n\n[Content truncated]';
              wasTruncated = true;
            }

            formatted.title = item.result.title;
            formatted.content = {
              markdown,
              textLength: item.result.content.text.length,
              ...(wasTruncated ? { truncated: true } : {}),
            };
            formatted.metadata = item.result.metadata;
            formatted.intelligence = {
              confidenceLevel: item.result.learning.confidenceLevel,
              renderTier: item.result.learning.renderTier,
              tierFellBack: item.result.learning.tierFellBack,
            };
            formatted.discoveredApis = item.result.discoveredApis.map(api => ({
              endpoint: api.endpoint,
              method: api.method,
              canBypassBrowser: api.canBypass,
              confidence: api.confidence,
            }));

            if (includeTables && item.result.tables && item.result.tables.length > 0) {
              formatted.tables = item.result.tables;
            }

            if (includeNetwork && item.result.network && item.result.network.length > 0) {
              formatted.network = item.result.network.map(req => ({
                url: req.url,
                method: req.method,
                status: req.status,
                contentType: req.contentType,
              }));
            }

            if (includeConsole && item.result.console && item.result.console.length > 0) {
              formatted.console = item.result.console;
            }
          }

          return formatted;
        });

        // Summary statistics
        const summary = {
          totalUrls: urls.length,
          successful: batchResults.filter(r => r.status === 'success').length,
          failed: batchResults.filter(r => r.status === 'error').length,
          skipped: batchResults.filter(r => r.status === 'skipped').length,
          rateLimited: batchResults.filter(r => r.status === 'rate_limited').length,
          totalDurationMs: batchResults.reduce((sum, r) => sum + r.durationMs, 0),
        };

        return jsonResponse({
          summary,
          results: formattedResults,
        });
      }

      // ============================================
      // DOMAIN INTELLIGENCE
      // ============================================
      case 'get_domain_intelligence': {
        const intelligence = await smartBrowser.getDomainIntelligence(args.domain as string);

        return jsonResponse({
          domain: args.domain,
          ...intelligence,
          recommendations: getRecommendations(intelligence),
          deprecation_notice: 'This tool is deprecated. Domain insights are now automatically included in smart_browse responses with includeInsights=true (default).',
        });
      }

      case 'get_domain_capabilities': {
        const capabilities = await smartBrowser.getDomainCapabilities(args.domain as string);
        return jsonResponse({
          ...capabilities,
          deprecation_notice: 'This tool is deprecated. Domain capabilities are now automatically included in smart_browse responses with includeInsights=true (default).',
        });
      }

      // ============================================
      // SCREENSHOT CAPTURE
      // ============================================
      case 'capture_screenshot': {
        const result = await smartBrowser.captureScreenshot(args.url as string, {
          fullPage: args.fullPage as boolean | undefined,
          element: args.element as string | undefined,
          waitForSelector: args.waitForSelector as string | undefined,
          sessionProfile: args.sessionProfile as string | undefined,
          width: args.width as number | undefined,
          height: args.height as number | undefined,
        });

        if (!result.success) {
          return errorResponse(result.error || 'Screenshot capture failed');
        }

        // Return image data with metadata
        // Note: For MCP, we return the base64 image in the response
        // LLM clients can decode and display/save the image
        return jsonResponse({
          url: result.url,
          finalUrl: result.finalUrl,
          title: result.title,
          image: result.image,
          mimeType: result.mimeType,
          viewport: result.viewport,
          timestamp: result.timestamp,
          durationMs: result.durationMs,
        });
      }

      // ============================================
      // HAR EXPORT
      // ============================================
      case 'export_har': {
        const result = await smartBrowser.exportHar(args.url as string, {
          includeResponseBodies: args.includeResponseBodies as boolean | undefined,
          maxBodySize: args.maxBodySize as number | undefined,
          pageTitle: args.pageTitle as string | undefined,
          waitForSelector: args.waitForSelector as string | undefined,
          sessionProfile: args.sessionProfile as string | undefined,
        });

        if (!result.success) {
          return errorResponse(result.error || 'HAR export failed');
        }

        // Return HAR data with metadata
        return jsonResponse({
          url: result.url,
          finalUrl: result.finalUrl,
          title: result.title,
          har: result.har,
          entriesCount: result.entriesCount,
          timestamp: result.timestamp,
          durationMs: result.durationMs,
        });
      }

      // ============================================
      // LEARNING STATS
      // ============================================
      case 'get_learning_stats': {
        const learningEngine = smartBrowser.getLearningEngine();
        const stats = learningEngine.getStats();

        return jsonResponse({
          summary: {
            totalDomains: stats.totalDomains,
            totalApiPatterns: stats.totalApiPatterns,
            bypassablePatterns: stats.bypassablePatterns,
            totalSelectors: stats.totalSelectors,
            totalValidators: stats.totalValidators,
            domainGroups: stats.domainGroups,
          },
          recentLearning: stats.recentLearningEvents.slice(-5).map(e => ({
            type: e.type,
            domain: e.domain,
            timestamp: new Date(e.timestamp).toISOString(),
          })),
          deprecation_notice: 'This tool is deprecated. Domain-specific insights are now included in smart_browse responses. This global stats tool will be moved to a debug/admin interface.',
        });
      }

      case 'get_learning_effectiveness': {
        const learningEngine = smartBrowser.getLearningEngine();
        const tieredFetcher = smartBrowser.getTieredFetcher();
        const proceduralMemory = smartBrowser.getProceduralMemory();

        // Helper for percent formatting
        const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;
        const formatPercentDecimal = (value: number): string => `${(value * 100).toFixed(1)}%`;

        const report = await computeLearningEffectiveness(
          learningEngine,
          tieredFetcher,
          proceduralMemory
        );

        return jsonResponse({
          generatedAt: new Date(report.generatedAt).toISOString(),
          healthScore: report.healthScore,
          patterns: {
            totalDiscovered: report.patterns.totalDiscovered,
            patternsUsed: report.patterns.patternsUsed,
            hitRate: formatPercent(report.patterns.hitRate),
            bypassablePatterns: report.patterns.bypassablePatterns,
            recentlyFailedPatterns: report.patterns.recentlyFailedPatterns,
            byConfidence: {
              high: {
                count: report.patterns.byConfidence.high.count,
                successRate: formatPercent(report.patterns.byConfidence.high.successRate),
              },
              medium: {
                count: report.patterns.byConfidence.medium.count,
                successRate: formatPercent(report.patterns.byConfidence.medium.successRate),
              },
              low: {
                count: report.patterns.byConfidence.low.count,
                successRate: formatPercent(report.patterns.byConfidence.low.successRate),
              },
            },
          },
          confidence: {
            overallAccuracy: formatPercent(report.confidence.overallAccuracy),
            highConfidenceAccuracy: formatPercent(report.confidence.highConfidenceAccuracy),
            mediumConfidenceAccuracy: formatPercent(report.confidence.mediumConfidenceAccuracy),
            lowConfidenceAccuracy: formatPercent(report.confidence.lowConfidenceAccuracy),
            confidenceGap: formatPercentDecimal(report.confidence.confidenceGap),
            overConfidentPatterns: report.confidence.overConfidentPatterns,
            underConfidentPatterns: report.confidence.underConfidentPatterns,
          },
          tiers: {
            firstTierSuccessRate: formatPercent(report.tiers.firstTierSuccessRate),
            timeSavedMs: Math.round(report.tiers.timeSavedMs),
            optimizationRatio: formatPercent(report.tiers.optimizationRatio),
            tierDistribution: {
              intelligence: report.tiers.tierDistribution.intelligence.count,
              lightweight: report.tiers.tierDistribution.lightweight.count,
              playwright: report.tiers.tierDistribution.playwright.count,
            },
          },
          skills: {
            totalSkills: report.skills.totalSkills,
            reusedSkills: report.skills.reusedSkills,
            reuseRate: formatPercent(report.skills.reuseRate),
            avgSuccessRate: formatPercent(report.skills.avgSuccessRate),
            highPerformingSkills: report.skills.highPerformingSkills,
            antiPatterns: report.skills.antiPatterns,
          },
          selectors: {
            totalSelectors: report.selectors.totalSelectors,
            highPrioritySelectors: report.selectors.highPrioritySelectors,
            avgSuccessRate: formatPercent(report.selectors.avgSuccessRate),
            avgFallbackChainLength: report.selectors.avgFallbackChainLength.toFixed(1),
          },
          domains: {
            totalDomains: report.domains.totalDomains,
            domainsWithPatterns: report.domains.domainsWithPatterns,
            domainsWithSelectors: report.domains.domainsWithSelectors,
            highSuccessDomains: report.domains.highSuccessDomains,
            avgDomainSuccessRate: formatPercent(report.domains.avgDomainSuccessRate),
            crossDomainBeneficiaries: report.domains.crossDomainBeneficiaries,
          },
          trend24h: {
            recentEvents: report.trend24h.recentEvents,
            newPatterns: report.trend24h.newPatterns,
            verifications: report.trend24h.verifications,
            failures: report.trend24h.failures,
            eventsPerHour: report.trend24h.eventsPerHour.toFixed(1),
          },
          insights: report.insights,
          deprecation_notice: 'This tool is deprecated. Domain-specific insights are now included in smart_browse responses. This comprehensive metrics tool will be moved to a debug/admin interface.',
        });
      }

      // ============================================
      // PROCEDURAL MEMORY (Skills) - Consolidated Handler
      // ============================================
      case 'skill_management': {
        // TC-003: Log deprecation warning
        logger.server.warn(
          '[DEPRECATED] skill_management tool is deprecated. ' +
          'Skills are now automatically applied during smart_browse operations. ' +
          'Use smart_browse and check skillExecutionTrace in the response.'
        );
        const proceduralMemory = smartBrowser.getProceduralMemory();
        const action = args.action as string;

        switch (action) {
          case 'stats': {
            const proceduralStats = smartBrowser.getProceduralMemoryStats();
            return jsonResponse({
              summary: {
                totalSkills: proceduralStats.totalSkills,
                totalTrajectories: proceduralStats.totalTrajectories,
                avgSuccessRate: Math.round(proceduralStats.avgSuccessRate * 100) + '%',
              },
              skillsByDomain: proceduralStats.skillsByDomain,
              mostUsedSkills: proceduralStats.mostUsedSkills.slice(0, 5),
            });
          }

          case 'progress': {
            const learningEngineLocal = smartBrowser.getLearningEngine();
            const progress = proceduralMemory.getLearningProgress();
            const learningStats = learningEngineLocal.getStats();

            return jsonResponse({
              summary: {
                totalSkills: progress.skills.total,
                totalAntiPatterns: progress.antiPatterns.total,
                totalApiPatterns: learningStats.totalApiPatterns,
                coveredDomains: progress.coverage.coveredDomains,
                trajectorySuccessRate: progress.trajectories.total > 0
                  ? Math.round((progress.trajectories.successful / progress.trajectories.total) * 100) + '%'
                  : 'N/A',
              },
              skills: {
                byDomain: progress.skills.byDomain,
                avgSuccessRate: Math.round(progress.skills.avgSuccessRate * 100) + '%',
                topPerformers: progress.skills.topPerformers.map(s => ({
                  name: s.name,
                  successRate: Math.round(s.successRate * 100) + '%',
                  uses: s.uses,
                })),
                recentlyCreated: progress.skills.recentlyCreated.map(s => ({
                  name: s.name,
                  domain: s.domain,
                  createdAt: new Date(s.createdAt).toISOString(),
                })),
              },
              antiPatterns: {
                total: progress.antiPatterns.total,
                byDomain: progress.antiPatterns.byDomain,
              },
              patterns: {
                totalApiPatterns: learningStats.totalApiPatterns,
                bypassablePatterns: learningStats.bypassablePatterns,
                totalSelectors: learningStats.totalSelectors,
                totalValidators: learningStats.totalValidators,
              },
              coverage: {
                coveredDomains: progress.coverage.coveredDomains,
                uncoveredDomains: progress.coverage.uncoveredDomains,
                suggestions: progress.coverage.suggestions,
              },
              trajectories: {
                total: progress.trajectories.total,
                successful: progress.trajectories.successful,
                failed: progress.trajectories.failed,
              },
            });
          }

          case 'find': {
            if (!args.url) {
              return errorResponse('URL is required for find action');
            }
            const skills = smartBrowser.findApplicableSkills(
              args.url as string,
              (args.topK as number) || 3
            );

            return jsonResponse({
              url: args.url,
              matchedSkills: skills.map(match => ({
                skillId: match.skill.id,
                name: match.skill.name,
                description: match.skill.description,
                similarity: Math.round(match.similarity * 100) + '%',
                preconditionsMet: match.preconditionsMet,
                reason: match.reason,
                timesUsed: match.skill.metrics.timesUsed,
                successRate: match.skill.metrics.successCount > 0
                  ? Math.round((match.skill.metrics.successCount / match.skill.metrics.timesUsed) * 100) + '%'
                  : 'N/A',
              })),
            });
          }

          case 'details': {
            if (!args.skillId) {
              return errorResponse('skillId is required for details action');
            }
            const skill = proceduralMemory.getSkill(args.skillId as string);
            if (!skill) {
              return errorResponse(`Skill not found: ${args.skillId}`);
            }

            return jsonResponse({
              id: skill.id,
              name: skill.name,
              description: skill.description,
              preconditions: skill.preconditions,
              actionSequence: skill.actionSequence.map(a => ({
                type: a.type,
                selector: a.selector,
                success: a.success,
              })),
              metrics: {
                successCount: skill.metrics.successCount,
                failureCount: skill.metrics.failureCount,
                successRate: skill.metrics.timesUsed > 0
                  ? Math.round((skill.metrics.successCount / skill.metrics.timesUsed) * 100) + '%'
                  : 'N/A',
                avgDuration: Math.round(skill.metrics.avgDuration) + 'ms',
                timesUsed: skill.metrics.timesUsed,
                lastUsed: new Date(skill.metrics.lastUsed).toISOString(),
              },
              sourceDomain: skill.sourceDomain,
              createdAt: new Date(skill.createdAt).toISOString(),
            });
          }

          case 'explain': {
            if (!args.skillId) {
              return errorResponse('skillId is required for explain action');
            }
            const explanation = proceduralMemory.generateSkillExplanation(args.skillId as string);
            if (!explanation) {
              return errorResponse(`Skill not found: ${args.skillId}`);
            }
            return jsonResponse(explanation);
          }

          case 'versions': {
            if (!args.skillId) {
              return errorResponse('skillId is required for versions action');
            }
            const skillId = args.skillId as string;
            const skill = proceduralMemory.getSkill(skillId);
            if (!skill) {
              return errorResponse(`Skill not found: ${skillId}`);
            }

            const versions = proceduralMemory.getVersionHistory(skillId);
            const bestVersion = proceduralMemory.getBestVersion(skillId);

            return jsonResponse({
              skillId,
              skillName: skill.name,
              totalVersions: versions.length,
              versions: versions.map(v => ({
                version: v.version,
                createdAt: new Date(v.createdAt).toISOString(),
                changeReason: v.changeReason,
                changeDescription: v.changeDescription,
                successRate: Math.round(v.metricsSnapshot.successRate * 100) + '%',
                timesUsed: v.metricsSnapshot.timesUsed,
              })),
              bestVersion: bestVersion ? {
                version: bestVersion.version,
                successRate: Math.round(bestVersion.metricsSnapshot.successRate * 100) + '%',
              } : null,
            });
          }

          case 'rollback': {
            if (!args.skillId) {
              return errorResponse('skillId is required for rollback action');
            }
            const skillId = args.skillId as string;
            const targetVersion = args.targetVersion as number | undefined;

            const success = await proceduralMemory.rollbackSkill(skillId, targetVersion);
            if (!success) {
              return errorResponse('Rollback failed - check skill ID and version history');
            }

            const skill = proceduralMemory.getSkill(skillId);
            return jsonResponse({
              message: `Successfully rolled back skill ${skill?.name}`,
              newSuccessRate: skill ? Math.round((skill.metrics.successCount / Math.max(skill.metrics.timesUsed, 1)) * 100) + '%' : 'N/A',
            });
          }

          case 'rate': {
            if (!args.skillId || !args.rating || !args.url) {
              return errorResponse('skillId, rating, and url are required for rate action');
            }
            const skillId = args.skillId as string;
            const rating = args.rating as 'positive' | 'negative';
            const url = args.url as string;
            const reason = args.reason as string | undefined;

            const domain = new URL(url).hostname;
            await proceduralMemory.recordFeedback(skillId, rating, { url, domain }, reason);

            const feedbackSummary = proceduralMemory.getFeedbackSummary(skillId);
            const skill = proceduralMemory.getSkill(skillId);

            return jsonResponse({
              message: `Recorded ${rating} feedback for skill ${skill?.name || skillId}`,
              feedbackSummary: {
                positive: feedbackSummary.positive,
                negative: feedbackSummary.negative,
                commonIssues: feedbackSummary.commonIssues,
              },
              currentSuccessRate: skill ? Math.round((skill.metrics.successCount / Math.max(skill.metrics.timesUsed, 1)) * 100) + '%' : 'N/A',
            });
          }

          case 'anti_patterns': {
            const domain = args.domain as string | undefined;
            const antiPatterns = domain
              ? proceduralMemory.getAntiPatternsForDomain(domain)
              : proceduralMemory.getAllAntiPatterns();

            return jsonResponse({
              totalAntiPatterns: antiPatterns.length,
              antiPatterns: antiPatterns.map(ap => ({
                id: ap.id,
                name: ap.name,
                description: ap.description,
                domain: ap.sourceDomain,
                avoidActions: ap.avoidActions,
                occurrenceCount: ap.occurrenceCount,
                consequences: ap.consequences,
                lastUpdated: new Date(ap.updatedAt).toISOString(),
              })),
            });
          }

          case 'dependencies': {
            if (!args.skillId || !args.dependencyAction) {
              return errorResponse('skillId and dependencyAction are required for dependencies action');
            }
            const skillId = args.skillId as string;
            const depAction = args.dependencyAction as string;
            const relatedSkillIds = args.relatedSkillIds as string[] | undefined;

            switch (depAction) {
              case 'add_fallbacks': {
                if (!relatedSkillIds || relatedSkillIds.length === 0) {
                  return errorResponse('No fallback skill IDs provided');
                }
                const success = await proceduralMemory.addFallbackSkills(skillId, relatedSkillIds);
                return jsonResponse({
                  success,
                  message: success ? `Added ${relatedSkillIds.length} fallback skills` : 'Failed to add fallbacks',
                });
              }

              case 'add_prerequisites': {
                if (!relatedSkillIds || relatedSkillIds.length === 0) {
                  return errorResponse('No prerequisite skill IDs provided');
                }
                const success = await proceduralMemory.addPrerequisites(skillId, relatedSkillIds);
                return jsonResponse({
                  success,
                  message: success ? `Added ${relatedSkillIds.length} prerequisite skills` : 'Failed to add prerequisites (check for circular dependencies)',
                });
              }

              case 'get_chain': {
                const skill = proceduralMemory.getSkill(skillId);
                if (!skill) {
                  return errorResponse(`Skill not found: ${skillId}`);
                }

                const prerequisites = proceduralMemory.getPrerequisiteSkills(skillId);
                const fallbacks = proceduralMemory.getFallbackSkills(skillId);

                return jsonResponse({
                  skill: { id: skill.id, name: skill.name },
                  prerequisites: prerequisites.map(s => ({ id: s.id, name: s.name })),
                  fallbacks: fallbacks.map(s => ({ id: s.id, name: s.name })),
                  executionOrder: [
                    ...prerequisites.map(s => `[prereq] ${s.name}`),
                    `[main] ${skill.name}`,
                    ...fallbacks.map(s => `[fallback] ${s.name}`),
                  ],
                });
              }

              default:
                return errorResponse(`Unknown dependency action: ${depAction}`);
            }
          }

          case 'bootstrap': {
            const bootstrapped = await proceduralMemory.bootstrapFromTemplates();
            return jsonResponse({
              message: `Bootstrapped ${bootstrapped} skills from templates`,
              totalSkills: proceduralMemory.getStats().totalSkills,
              templates: ['cookie_banner_dismiss', 'pagination_navigate', 'form_extraction', 'table_extraction'],
            });
          }

          case 'export': {
            const pack = proceduralMemory.exportSkillPack({
              domainPatterns: args.domainPatterns as string[] | undefined,
              verticals: args.verticals as import('./types/index.js').SkillVertical[] | undefined,
              includeAntiPatterns: args.includeAntiPatterns as boolean | undefined,
              includeWorkflows: args.includeWorkflows as boolean | undefined,
              minSuccessRate: args.minSuccessRate as number | undefined,
              minUsageCount: args.minUsageCount as number | undefined,
              packName: args.packName as string | undefined,
              packDescription: args.packDescription as string | undefined,
            });

            return jsonResponse({
              skillPack: pack,
              serialized: proceduralMemory.serializeSkillPack(pack),
            });
          }

          case 'import': {
            if (!args.skillPackJson) {
              return errorResponse('skillPackJson is required for import action');
            }
            const result = await proceduralMemory.importSkillPack(
              args.skillPackJson as string,
              {
                conflictResolution: args.conflictResolution as import('./types/index.js').SkillConflictResolution | undefined,
                domainFilter: args.domainFilter as string[] | undefined,
                verticalFilter: args.verticals as import('./types/index.js').SkillVertical[] | undefined,
                importAntiPatterns: args.importAntiPatterns as boolean | undefined,
                importWorkflows: args.importWorkflows as boolean | undefined,
                resetMetrics: args.resetMetrics as boolean | undefined,
                namePrefix: args.namePrefix as string | undefined,
              }
            );

            if (!result.success) {
              return errorResponse(result.errors.join('; '));
            }

            return jsonResponse({
              ...result,
              message: `Imported ${result.skillsImported} skills, ${result.antiPatternsImported} anti-patterns, ${result.workflowsImported} workflows`,
            });
          }

          case 'pack_stats': {
            const stats = proceduralMemory.getSkillPackStats();
            return jsonResponse({
              ...stats,
              verticalBreakdown: Object.entries(stats.byVertical)
                .filter(([, count]) => count > 0)
                .map(([vertical, count]) => ({ vertical, count })),
            });
          }

          case 'manage': {
            const manageAction = args.manageAction as string;
            if (!manageAction) {
              return errorResponse('manageAction is required for manage action');
            }

            switch (manageAction) {
              case 'export': {
                const exported = await proceduralMemory.exportMemory();
                return jsonResponse({
                  message: 'Skills exported successfully',
                  data: JSON.parse(exported),
                });
              }

              case 'import': {
                if (!args.data) {
                  return errorResponse('No data provided for import');
                }
                const imported = await proceduralMemory.importSkills(args.data as string);
                return jsonResponse({
                  message: `Imported ${imported} skills`,
                  totalSkills: proceduralMemory.getStats().totalSkills,
                });
              }

              case 'prune': {
                const minRate = (args.minSuccessRate as number) || 0.3;
                const pruned = proceduralMemory.pruneFailedSkills(minRate);
                return jsonResponse({
                  message: `Pruned ${pruned} low-performing skills`,
                  remainingSkills: proceduralMemory.getStats().totalSkills,
                });
              }

              case 'reset': {
                await proceduralMemory.reset();
                return jsonResponse({ message: 'All skills have been reset' });
              }

              case 'coverage': {
                const coverage = proceduralMemory.getCoverageStats();
                return jsonResponse({
                  coverage: {
                    coveredDomains: coverage.coveredDomains.length,
                    coveredPageTypes: coverage.coveredPageTypes,
                    uncoveredDomains: coverage.uncoveredDomains.slice(0, 10),
                    uncoveredPageTypes: coverage.uncoveredPageTypes,
                  },
                  suggestions: coverage.suggestions,
                });
              }

              case 'workflows': {
                const potentialWorkflows = proceduralMemory.detectPotentialWorkflows();
                const existingWorkflows = proceduralMemory.getAllWorkflows();
                return jsonResponse({
                  existingWorkflows: existingWorkflows.map(w => ({
                    id: w.id,
                    name: w.name,
                    skills: w.skillIds.length,
                    timesUsed: w.metrics.timesUsed,
                  })),
                  potentialWorkflows: potentialWorkflows.slice(0, 5),
                });
              }

              default:
                return errorResponse(`Unknown manage action: ${manageAction}`);
            }
          }

          default:
            return errorResponse(`Unknown skill_management action: ${action}`);
        }
      }

      case 'execute_api_call': {
        const result = await apiCallTool.execute(args.url as string, {
          method: args.method as string,
          headers: args.headers as Record<string, string>,
          body: args.body,
          sessionProfile: args.sessionProfile as string,
        });

        return jsonResponse(result);
      }

      // ============================================
      // SESSION MANAGEMENT - Consolidated Handler
      // ============================================
      case 'session_management': {
        const action = args.action as string;

        switch (action) {
          case 'save': {
            if (!args.domain) {
              return errorResponse('domain is required for save action');
            }
            const context = await browserManager.getContext((args.sessionProfile as string) || 'default');
            await sessionManager.saveSession(
              args.domain as string,
              context,
              (args.sessionProfile as string) || 'default'
            );
            return jsonResponse({ success: true, message: `Session saved for ${args.domain}` });
          }

          case 'list': {
            const sessions = sessionManager.listSessions();
            return jsonResponse({ sessions });
          }

          case 'health': {
            if (args.domain) {
              const health = sessionManager.getSessionHealth(
                args.domain as string,
                (args.sessionProfile as string) || 'default'
              );
              return jsonResponse(health);
            } else {
              const allHealth = sessionManager.getAllSessionHealth();
              const summary = {
                total: allHealth.length,
                healthy: allHealth.filter((h) => h.status === 'healthy').length,
                expiringSoon: allHealth.filter((h) => h.status === 'expiring_soon').length,
                expired: allHealth.filter((h) => h.status === 'expired').length,
                stale: allHealth.filter((h) => h.status === 'stale').length,
              };
              return jsonResponse({ summary, sessions: allHealth });
            }
          }

          default:
            return errorResponse(`Unknown session_management action: ${action}`);
        }
      }

      // ============================================
      // BROWSER PROVIDERS
      // ============================================
      case 'get_browser_providers': {
        const providers = BrowserManager.getAvailableProviders();
        const currentProvider = browserManager.getProvider();

        return jsonResponse({
          current: {
            type: currentProvider.type,
            name: currentProvider.name,
            capabilities: currentProvider.capabilities,
          },
          available: providers.map(p => ({
            type: p.type,
            name: p.name,
            configured: p.configured,
            capabilities: p.capabilities,
            envVars: p.envVars,
          })),
          recommendations: {
            antiBot: 'Use Bright Data (BRIGHTDATA_AUTH) for sites with Cloudflare, CAPTCHAs, or aggressive anti-bot',
            costEffective: 'Use Browserless.io (BROWSERLESS_TOKEN) for standard hosted browser needs',
            noRemote: 'Use Local Playwright for development or when data privacy is critical',
          },
        });
      }

      // ============================================
      // TIERED RENDERING - Consolidated Handler
      // ============================================
      case 'tier_management': {
        const tieredFetcher = smartBrowser.getTieredFetcher();
        const action = args.action as string;

        switch (action) {
          case 'stats': {
            const tierStats = tieredFetcher.getStats();
            return jsonResponse({
              summary: {
                totalDomains: tierStats.totalDomains,
                domainsByTier: tierStats.byTier,
                playwrightAvailable: tierStats.playwrightAvailable,
              },
              performance: {
                avgResponseTimes: {
                  intelligence: Math.round(tierStats.avgResponseTimes.intelligence) + 'ms',
                  lightweight: Math.round(tierStats.avgResponseTimes.lightweight) + 'ms',
                  playwright: Math.round(tierStats.avgResponseTimes.playwright) + 'ms',
                },
              },
              efficiency: {
                intelligencePercent: tierStats.totalDomains > 0
                  ? Math.round((tierStats.byTier.intelligence / tierStats.totalDomains) * 100) + '%'
                  : '0%',
                lightweightPercent: tierStats.totalDomains > 0
                  ? Math.round((tierStats.byTier.lightweight / tierStats.totalDomains) * 100) + '%'
                  : '0%',
                playwrightPercent: tierStats.totalDomains > 0
                  ? Math.round((tierStats.byTier.playwright / tierStats.totalDomains) * 100) + '%'
                  : '0%',
                message: tierStats.byTier.intelligence + tierStats.byTier.lightweight > tierStats.byTier.playwright
                  ? 'Good! Most requests are using lightweight rendering'
                  : tierStats.playwrightAvailable
                  ? 'Consider optimizing - many requests still require full browser'
                  : 'Playwright not installed - using lightweight strategies only',
              },
            });
          }

          case 'set': {
            if (!args.domain || !args.tier) {
              return errorResponse('domain and tier are required for set action');
            }
            const domain = args.domain as string;
            const tier = args.tier as 'intelligence' | 'lightweight' | 'playwright';

            tieredFetcher.setDomainPreference(domain, tier);

            return jsonResponse({
              success: true,
              message: `Set ${domain} to use ${tier} tier`,
              note: tier === 'intelligence'
                ? 'Content Intelligence - tries framework extraction, API prediction, caches, then static parsing'
                : tier === 'lightweight'
                ? 'Lightweight JS - executes scripts without full browser'
                : 'Full browser - handles all pages but slowest (requires Playwright)',
            });
          }

          case 'usage': {
            const preferences = tieredFetcher.exportPreferences();
            const filterTier = args.tier as string | undefined;
            const sortBy = (args.sortBy as string) || 'lastUsed';
            const limit = (args.limit as number) || 50;

            let filtered = preferences;
            if (filterTier) {
              filtered = preferences.filter(p => p.preferredTier === filterTier);
            }

            const sorted = [...filtered].sort((a, b) => {
              switch (sortBy) {
                case 'domain':
                  return a.domain.localeCompare(b.domain);
                case 'tier':
                  return a.preferredTier.localeCompare(b.preferredTier);
                case 'successRate': {
                  const rateA = a.successCount + a.failureCount > 0
                    ? a.successCount / (a.successCount + a.failureCount)
                    : 0;
                  const rateB = b.successCount + b.failureCount > 0
                    ? b.successCount / (b.successCount + b.failureCount)
                    : 0;
                  return rateB - rateA;
                }
                case 'responseTime':
                  return a.avgResponseTime - b.avgResponseTime;
                case 'lastUsed':
                default:
                  return b.lastUsed - a.lastUsed;
              }
            });

            const limited = sorted.slice(0, limit);

            const formatted = limited.map(p => {
              const totalAttempts = p.successCount + p.failureCount;
              const successRate = totalAttempts > 0
                ? Math.round((p.successCount / totalAttempts) * 100)
                : 0;
              return {
                domain: p.domain,
                tier: p.preferredTier,
                successCount: p.successCount,
                failureCount: p.failureCount,
                successRate: `${successRate}%`,
                avgResponseTime: `${Math.round(p.avgResponseTime)}ms`,
                lastUsed: new Date(p.lastUsed).toISOString(),
              };
            });

            const summary = {
              intelligence: filtered.filter(p => p.preferredTier === 'intelligence').length,
              lightweight: filtered.filter(p => p.preferredTier === 'lightweight').length,
              playwright: filtered.filter(p => p.preferredTier === 'playwright').length,
            };

            return jsonResponse({
              totalDomains: preferences.length,
              filteredCount: filtered.length,
              showing: limited.length,
              filter: filterTier || 'none',
              sortedBy: sortBy,
              summary: filterTier ? undefined : summary,
              domains: formatted,
            });
          }

          default:
            return errorResponse(`Unknown tier_management action: ${action}`);
        }
      }

      // ============================================
      // PERFORMANCE METRICS
      // ============================================
      case 'get_performance_metrics': {
        const tieredFetcher = smartBrowser.getTieredFetcher();
        const tracker = tieredFetcher.getPerformanceTracker();
        const domain = args.domain as string | undefined;
        const sortBy = (args.sortBy as 'avgTime' | 'p95' | 'successRate') || 'avgTime';
        const order = (args.order as 'asc' | 'desc') || (sortBy === 'successRate' ? 'desc' : 'asc');
        const limit = (args.limit as number) || 20;

        // Format percentile stats helper - defined once for reuse
        const formatStats = (stats: { p50: number; p95: number; p99: number; min: number; max: number; avg: number; count: number } | null) => {
          if (!stats) return null;
          return {
            p50: `${Math.round(stats.p50)}ms`,
            p95: `${Math.round(stats.p95)}ms`,
            p99: `${Math.round(stats.p99)}ms`,
            min: `${Math.round(stats.min)}ms`,
            max: `${Math.round(stats.max)}ms`,
            avg: `${Math.round(stats.avg)}ms`,
            count: stats.count,
          };
        };

        // If specific domain requested, return detailed metrics
        if (domain) {
          const domainPerf = tracker.getDomainPerformance(domain);
          if (!domainPerf) {
            return jsonResponse({
              error: `No performance data found for domain: ${domain}`,
              suggestion: 'This domain may not have been accessed yet. Try browsing it first with smart_browse.',
            });
          }

          return jsonResponse({
            domain: domainPerf.domain,
            totalRequests: domainPerf.totalRequests,
            successRate: `${Math.round(domainPerf.successRate * 100)}%`,
            preferredTier: domainPerf.preferredTier,
            lastUpdated: new Date(domainPerf.lastUpdated).toISOString(),
            overall: formatStats(domainPerf.overall),
            byTier: {
              intelligence: formatStats(domainPerf.byTier.intelligence),
              lightweight: formatStats(domainPerf.byTier.lightweight),
              playwright: formatStats(domainPerf.byTier.playwright),
            },
          });
        }

        // Return system-wide metrics
        const systemPerf = tracker.getSystemPerformance();
        const componentBreakdown = tracker.getComponentBreakdown();
        const domainRankings = tracker.getDomainsByPerformance(sortBy, order, limit);

        return jsonResponse({
          summary: {
            totalRequests: systemPerf.totalRequests,
            totalDomains: systemPerf.totalDomains,
            successRate: `${Math.round(systemPerf.successRate * 100)}%`,
          },
          overall: formatStats(systemPerf.overall),
          byTier: {
            intelligence: formatStats(systemPerf.byTier.intelligence),
            lightweight: formatStats(systemPerf.byTier.lightweight),
            playwright: formatStats(systemPerf.byTier.playwright),
          },
          componentBreakdown: {
            network: formatStats(componentBreakdown.network),
            parsing: formatStats(componentBreakdown.parsing),
            jsExecution: formatStats(componentBreakdown.jsExecution),
            extraction: formatStats(componentBreakdown.extraction),
          },
          topFastestDomains: systemPerf.topFastDomains.map(d => ({
            domain: d.domain,
            avgTime: `${d.avgTime}ms`,
          })),
          topSlowestDomains: systemPerf.topSlowDomains.map(d => ({
            domain: d.domain,
            avgTime: `${d.avgTime}ms`,
          })),
          domainRankings: domainRankings.map(d => ({
            domain: d.domain,
            requests: d.totalRequests,
            successRate: `${Math.round(d.successRate * 100)}%`,
            avgTime: `${Math.round(d.overall.avg)}ms`,
            p95: `${Math.round(d.overall.p95)}ms`,
            preferredTier: d.preferredTier,
          })),
        });
      }

      // ============================================
      // CONTENT CHANGE TRACKING (F-003)
      // ============================================
      case 'content_tracking': {
        const tracker = getContentChangeTracker();
        const action = args.action as string;
        const url = args.url as string | undefined;

        switch (action) {
          case 'track': {
            if (!url) throw new Error('url is required for track action');
            const result = await smartBrowser.browse(url, {
              validateContent: true,
              enableLearning: true,
            });
            const tracked = await tracker.trackUrl(url, result.content.markdown, {
              label: args.label as string | undefined,
              tags: args.tags as string[] | undefined,
            });
            return jsonResponse({
              action: 'track',
              message: 'URL is now being tracked for content changes',
              url: tracked.url,
              domain: tracked.domain,
              fingerprint: {
                hash: tracked.fingerprint.hash.substring(0, 12) + '...',
                textLength: tracked.fingerprint.textLength,
                wordCount: tracked.fingerprint.wordCount,
              },
              trackedSince: new Date(tracked.trackedSince).toISOString(),
              label: tracked.label,
              tags: tracked.tags,
              pageTitle: result.title,
            });
          }

          case 'check': {
            if (!url) throw new Error('url is required for check action');
            const result = await smartBrowser.browse(url, {
              validateContent: true,
              enableLearning: true,
            });
            const checkResult = await tracker.checkForChanges(url, result.content.markdown);

            if (checkResult.isFirstCheck || !checkResult.isTracked) {
              const tracked = await tracker.trackUrl(url, result.content.markdown);
              return jsonResponse({
                action: 'check',
                message: 'URL was not tracked - now tracking for future comparisons',
                url: tracked.url,
                isTracked: true,
                isFirstCheck: true,
                hasChanged: false,
                fingerprint: {
                  hash: tracked.fingerprint.hash.substring(0, 12) + '...',
                  textLength: tracked.fingerprint.textLength,
                  wordCount: tracked.fingerprint.wordCount,
                },
                pageTitle: result.title,
              });
            }

            const response: Record<string, unknown> = {
              action: 'check',
              url,
              isTracked: true,
              hasChanged: checkResult.hasChanged,
              checkCount: checkResult.trackedUrl?.checkCount,
              changeCount: checkResult.trackedUrl?.changeCount,
              lastChecked: checkResult.trackedUrl?.lastChecked
                ? new Date(checkResult.trackedUrl.lastChecked).toISOString()
                : undefined,
              pageTitle: result.title,
            };

            if (checkResult.hasChanged && checkResult.changeReport) {
              response.changeDetails = {
                significance: checkResult.changeReport.overallSignificance,
                summary: checkResult.changeReport.summary,
                previousFingerprint: {
                  textLength: checkResult.changeReport.oldFingerprint.textLength,
                  wordCount: checkResult.changeReport.oldFingerprint.wordCount,
                },
                newFingerprint: {
                  textLength: checkResult.changeReport.newFingerprint.textLength,
                  wordCount: checkResult.changeReport.newFingerprint.wordCount,
                },
                textLengthDiff:
                  checkResult.changeReport.newFingerprint.textLength -
                  checkResult.changeReport.oldFingerprint.textLength,
                wordCountDiff:
                  checkResult.changeReport.newFingerprint.wordCount -
                  checkResult.changeReport.oldFingerprint.wordCount,
              };
            }
            return jsonResponse(response);
          }

          case 'list': {
            const urls = await tracker.listTrackedUrls({
              domain: args.domain as string | undefined,
              tags: args.tags as string[] | undefined,
              hasChanges: args.hasChanges as boolean | undefined,
              limit: (args.limit as number) || 50,
            });
            return jsonResponse({
              action: 'list',
              count: urls.length,
              trackedUrls: urls.map(u => ({
                url: u.url,
                domain: u.domain,
                label: u.label,
                tags: u.tags,
                trackedSince: new Date(u.trackedSince).toISOString(),
                lastChecked: new Date(u.lastChecked).toISOString(),
                checkCount: u.checkCount,
                changeCount: u.changeCount,
                hasChanges: u.changeCount > 0,
                fingerprint: {
                  textLength: u.fingerprint.textLength,
                  wordCount: u.fingerprint.wordCount,
                },
              })),
            });
          }

          case 'history': {
            const history = await tracker.getChangeHistory(
              url,
              (args.limit as number) || 50
            );
            return jsonResponse({
              action: 'history',
              count: history.length,
              changes: history.map(r => ({
                url: r.url,
                timestamp: new Date(r.timestamp).toISOString(),
                significance: r.significance,
                summary: r.summary,
                sectionsAdded: r.sectionsAdded,
                sectionsRemoved: r.sectionsRemoved,
                sectionsModified: r.sectionsModified,
                previousLength: r.previousFingerprint.textLength,
                newLength: r.newFingerprint.textLength,
                lengthChange: r.newFingerprint.textLength - r.previousFingerprint.textLength,
              })),
            });
          }

          case 'untrack': {
            if (!url) throw new Error('url is required for untrack action');
            const wasTracked = await tracker.untrackUrl(url);
            return jsonResponse({
              action: 'untrack',
              message: wasTracked ? 'URL is no longer being tracked' : 'URL was not being tracked',
              url,
              untracked: wasTracked,
            });
          }

          case 'stats': {
            const stats = await tracker.getStats();
            return jsonResponse({
              action: 'stats',
              totalTracked: stats.totalTracked,
              urlsWithChanges: stats.urlsWithChanges,
              totalChanges: stats.totalChanges,
              changesBySignificance: stats.changesBySignificance,
              recentChanges: stats.recentChanges.map(c => ({
                url: c.url,
                timestamp: new Date(c.timestamp).toISOString(),
                significance: c.significance,
              })),
            });
          }

          default:
            throw new Error(`Unknown content_tracking action: ${action}`);
        }
      }

      // ============================================
      // API AUTHENTICATION WORKFLOW
      // ============================================
      case 'get_api_auth_status': {
        const result = await handleAuthStatus(
          authWorkflow,
          args.domain as string,
          (args.profile as string) || 'default'
        );
        return jsonResponse({
          ...result,
          deprecation_notice: "This tool is deprecated. Use api_auth with action='status' instead.",
        });
      }

      case 'configure_api_auth': {
        const result = await handleAuthConfigure(
          authWorkflow,
          args.domain as string,
          args.authType as string,
          args.credentials as Record<string, unknown>,
          (args.profile as string) || 'default',
          args.validate !== false
        );
        if ('error' in result && !('success' in result)) {
          return errorResponse(result.error);
        }
        return jsonResponse({
          ...result,
          deprecation_notice: "This tool is deprecated. Use api_auth with action='configure' instead.",
        });
      }

      case 'complete_oauth': {
        const result = await handleOAuthComplete(
          authWorkflow,
          args.code as string,
          args.state as string
        );
        return jsonResponse({
          ...result,
          deprecation_notice: "This tool is deprecated. Use api_auth with action='complete_oauth' instead.",
        });
      }

      case 'get_auth_guidance': {
        const result = await handleAuthGuidance(
          authWorkflow,
          args.domain as string,
          args.authType as string | undefined
        );
        return jsonResponse({
          ...result,
          deprecation_notice: "This tool is deprecated. Use api_auth with action='guidance' instead.",
        });
      }

      case 'delete_api_auth': {
        const result = await handleAuthDelete(
          authWorkflow,
          args.domain as string,
          args.authType as AuthType | undefined,
          (args.profile as string) || 'default'
        );
        return jsonResponse({
          ...result,
          deprecation_notice: "This tool is deprecated. Use api_auth with action='delete' instead.",
        });
      }

      case 'list_configured_auth': {
        const result = handleAuthList(authWorkflow);
        return jsonResponse({
          ...result,
          deprecation_notice: "This tool is deprecated. Use api_auth with action='list' instead.",
        });
      }

      // ============================================
      // UNIFIED API AUTH TOOL (TC-001) - Consolidated Handler
      // ============================================
      case 'api_auth': {
        const action = args.action as string;

        switch (action) {
          case 'status': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'status'");
            }
            const result = await handleAuthStatus(
              authWorkflow,
              args.domain as string,
              (args.profile as string) || 'default'
            );
            return jsonResponse(result);
          }

          case 'configure': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'configure'");
            }
            if (!args.authType) {
              return errorResponse("Missing required parameter 'authType' for action 'configure'");
            }
            if (!args.credentials) {
              return errorResponse("Missing required parameter 'credentials' for action 'configure'");
            }
            const result = await handleAuthConfigure(
              authWorkflow,
              args.domain as string,
              args.authType as string,
              args.credentials as Record<string, unknown>,
              (args.profile as string) || 'default',
              args.validate !== false
            );
            if ('error' in result && !('success' in result)) {
              return errorResponse(result.error);
            }
            return jsonResponse(result);
          }

          case 'complete_oauth': {
            if (!args.code) {
              return errorResponse("Missing required parameter 'code' for action 'complete_oauth'");
            }
            if (!args.state) {
              return errorResponse("Missing required parameter 'state' for action 'complete_oauth'");
            }
            const result = await handleOAuthComplete(
              authWorkflow,
              args.code as string,
              args.state as string
            );
            return jsonResponse(result);
          }

          case 'guidance': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'guidance'");
            }
            const result = await handleAuthGuidance(
              authWorkflow,
              args.domain as string,
              args.authType as string | undefined
            );
            return jsonResponse(result);
          }

          case 'delete': {
            if (!args.domain) {
              return errorResponse("Missing required parameter 'domain' for action 'delete'");
            }
            const result = await handleAuthDelete(
              authWorkflow,
              args.domain as string,
              args.authType as AuthType | undefined,
              (args.profile as string) || 'default'
            );
            return jsonResponse(result);
          }

          case 'list': {
            const result = handleAuthList(authWorkflow);
            return jsonResponse(result);
          }

          default:
            return errorResponse(`Unknown action: ${action}. Valid actions: status, configure, complete_oauth, guidance, delete, list`);
        }
      }

      // ============================================
      // DEBUG TRACE RECORDING (O-005) - Consolidated Handler
      // ============================================
      case 'debug_traces': {
        const debugRecorder = smartBrowser.getDebugRecorder();
        const action = args.action as string;

        switch (action) {
          case 'list': {
            const traces = await debugRecorder.query({
              domain: args.domain as string | undefined,
              urlPattern: args.urlPattern as string | undefined,
              success: args.success as boolean | undefined,
              errorType: args.errorType as ('timeout' | 'network' | 'selector' | 'validation' | 'bot_challenge' | 'rate_limit' | 'auth' | 'unknown') | undefined,
              tier: args.tier as ('intelligence' | 'lightweight' | 'playwright') | undefined,
              limit: (args.limit as number) ?? 20,
              offset: args.offset as number | undefined,
            });

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              count: traces.length,
              traces: traces.map(t => ({
                id: t.id,
                timestamp: new Date(t.timestamp).toISOString(),
                url: t.url,
                domain: t.domain,
                success: t.success,
                durationMs: t.durationMs,
                tier: t.tiers.finalTier,
                fellBack: t.tiers.fellBack,
                errorCount: t.errors.length,
                contentLength: t.content.textLength,
              })),
            });
          }

          case 'get': {
            if (!args.id) {
              return errorResponse('id is required for get action');
            }
            const trace = await debugRecorder.getTrace(args.id as string);

            if (!trace) {
              return jsonResponse({
                schemaVersion: addSchemaVersion({}).schemaVersion,
                error: `Trace not found: ${args.id}`,
              });
            }

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              trace,
            });
          }

          case 'stats': {
            const stats = await debugRecorder.getStats();

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              ...stats,
              oldestTrace: stats.oldestTrace ? new Date(stats.oldestTrace).toISOString() : null,
              newestTrace: stats.newestTrace ? new Date(stats.newestTrace).toISOString() : null,
              storageSizeMB: Math.round(stats.storageSizeBytes / 1024 / 1024 * 100) / 100,
            });
          }

          case 'configure': {
            if (args.enabled !== undefined) {
              if (args.enabled) {
                debugRecorder.enable();
              } else {
                debugRecorder.disable();
              }
            }

            if (args.alwaysRecordDomain) {
              debugRecorder.alwaysRecord(args.alwaysRecordDomain as string);
            }

            if (args.neverRecordDomain) {
              debugRecorder.neverRecord(args.neverRecordDomain as string);
            }

            if (args.onlyRecordFailures !== undefined || args.maxTraces !== undefined || args.maxAgeHours !== undefined) {
              debugRecorder.updateConfig({
                onlyRecordFailures: args.onlyRecordFailures as boolean | undefined,
                maxTraces: args.maxTraces as number | undefined,
                maxAgeHours: args.maxAgeHours as number | undefined,
              });
            }

            const config = debugRecorder.getConfig();
            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              message: 'Configuration updated',
              config: {
                enabled: config.enabled,
                onlyRecordFailures: config.onlyRecordFailures,
                alwaysRecordDomains: config.alwaysRecordDomains,
                neverRecordDomains: config.neverRecordDomains,
                maxTraces: config.maxTraces,
                maxAgeHours: config.maxAgeHours,
              },
            });
          }

          case 'export': {
            if (!args.ids || (args.ids as string[]).length === 0) {
              return errorResponse('ids are required for export action');
            }
            const ids = args.ids as string[];
            const exportData = await debugRecorder.exportTraces(ids);

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              exportedAt: new Date(exportData.exportedAt).toISOString(),
              traceCount: exportData.traces.length,
              traces: exportData.traces,
            });
          }

          case 'delete': {
            if (!args.id) {
              return errorResponse('id is required for delete action');
            }
            const deleted = await debugRecorder.deleteTrace(args.id as string);

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              success: deleted,
              id: args.id,
              message: deleted ? 'Trace deleted' : 'Trace not found',
            });
          }

          case 'clear': {
            const count = await debugRecorder.clearAll();

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              success: true,
              deletedCount: count,
              message: `Deleted ${count} traces`,
            });
          }

          default:
            return errorResponse(`Unknown debug_traces action: ${action}`);
        }
      }

      // ============================================
      // USAGE METERING (GTM-001) - Consolidated Handler
      // ============================================
      case 'usage_analytics': {
        const usageMeter = getUsageMeter();
        await usageMeter.initialize();
        const action = args.action as string;

        switch (action) {
          case 'summary': {
            const options: UsageQueryOptions = {
              period: (args.period as 'hour' | 'day' | 'week' | 'month' | 'all') || 'all',
              domain: args.domain as string | undefined,
              tier: args.tier as ('intelligence' | 'lightweight' | 'playwright') | undefined,
              tenantId: args.tenantId as string | undefined,
            };

            const summary = await usageMeter.getSummary(options);
            const periodSuccessRate = summary.currentPeriod.requestCount > 0
              ? summary.currentPeriod.successCount / summary.currentPeriod.requestCount
              : 0;

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              period: options.period,
              totalRequests: summary.totalRequests,
              totalCostUnits: summary.totalCostUnits,
              successRate: Math.round(summary.successRate * 100) / 100,
              avgCostPerRequest: Math.round(summary.avgCostPerRequest * 100) / 100,
              currentPeriod: {
                requestCount: summary.currentPeriod.requestCount,
                totalCostUnits: summary.currentPeriod.totalCostUnits,
                successRate: Math.round(periodSuccessRate * 100) / 100,
                fallbackRate: Math.round(summary.currentPeriod.fallbackRate * 100) / 100,
                byTier: summary.currentPeriod.byTier,
                topDomainsByCost: summary.currentPeriod.topDomainsByCost.slice(0, 5),
                topDomainsByRequests: summary.currentPeriod.topDomainsByRequests.slice(0, 5),
              },
              filters: {
                domain: options.domain,
                tier: options.tier,
                tenantId: options.tenantId,
              },
            });
          }

          case 'by_period': {
            const rawGranularity = args.granularity as string || 'day';
            const granularity: 'hour' | 'day' = rawGranularity === 'hour' ? 'hour' : 'day';
            const periods = (args.periods as number) || (granularity === 'hour' ? 24 : 7);
            const domain = args.domain as string | undefined;

            const periodData = await usageMeter.getUsageByPeriod(granularity, { periods, domain });

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              granularity,
              periods: periodData.map(p => {
                const successRate = p.requestCount > 0 ? p.successCount / p.requestCount : 0;
                return {
                  periodStart: new Date(p.periodStart).toISOString(),
                  periodEnd: new Date(p.periodEnd).toISOString(),
                  requestCount: p.requestCount,
                  totalCostUnits: p.totalCostUnits,
                  successRate: Math.round(successRate * 100) / 100,
                  fallbackRate: Math.round(p.fallbackRate * 100) / 100,
                  byTier: p.byTier,
                };
              }),
            });
          }

          case 'cost_breakdown': {
            const period = (args.period as 'hour' | 'day' | 'week' | 'month' | 'all') || 'day';
            const domain = args.domain as string | undefined;

            const breakdown = await usageMeter.getCostBreakdown({ period, domain });

            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              period,
              total: breakdown.total,
              estimatedMonthlyCost: Math.round(breakdown.estimatedMonthlyCost * 100) / 100,
              byTier: {
                intelligence: {
                  cost: breakdown.byTier.intelligence.cost,
                  percentage: Math.round(breakdown.byTier.intelligence.percentage * 100),
                  requests: breakdown.byTier.intelligence.requests,
                },
                lightweight: {
                  cost: breakdown.byTier.lightweight.cost,
                  percentage: Math.round(breakdown.byTier.lightweight.percentage * 100),
                  requests: breakdown.byTier.lightweight.requests,
                },
                playwright: {
                  cost: breakdown.byTier.playwright.cost,
                  percentage: Math.round(breakdown.byTier.playwright.percentage * 100),
                  requests: breakdown.byTier.playwright.requests,
                },
              },
              recommendations: generateCostRecommendations(breakdown),
            });
          }

          case 'reset': {
            await usageMeter.reset();
            return jsonResponse({
              schemaVersion: addSchemaVersion({}).schemaVersion,
              success: true,
              message: 'Usage meters reset',
            });
          }

          default:
            return errorResponse(`Unknown usage_analytics action: ${action}`);
        }
      }

      // ============================================
      // ANALYTICS DASHBOARD (GTM-002)
      // ============================================

      case 'get_analytics_dashboard': {
        const usageMeter = getUsageMeter();
        await usageMeter.initialize();

        const dashboard = await generateDashboard({
          period: (args.period as 'hour' | 'day' | 'week' | 'month' | 'all') ?? 'day',
          topDomainsLimit: args.topDomainsLimit as number | undefined,
          timeSeriesPoints: args.timeSeriesPoints as number | undefined,
          domain: args.domain as string | undefined,
          tenantId: args.tenantId as string | undefined,
        });

        return jsonResponse(dashboard);
      }

      case 'get_system_status': {
        const usageMeter = getUsageMeter();
        await usageMeter.initialize();

        const status = await getQuickStatus();
        return jsonResponse(status);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Extract URL and domain from request args for error context
    const url = typeof args?.url === 'string' ? args.url : undefined;
    let domain: string | undefined;
    if (url) {
      try {
        domain = new URL(url).hostname;
      } catch {
        // Invalid URL, leave domain undefined
      }
    }

    // Use structured error response with context
    return errorResponse(
      error instanceof Error ? error : new Error(String(error)),
      undefined,
      { url, domain }
    );
  }
});

/**
 * Generate recommendations based on domain intelligence
 */
function getRecommendations(intelligence: Awaited<ReturnType<typeof smartBrowser.getDomainIntelligence>>): string[] {
  const recommendations: string[] = [];

  if (intelligence.knownPatterns === 0) {
    recommendations.push('First visit to this domain - learning will begin automatically');
  }

  if (intelligence.successRate < 0.7) {
    recommendations.push('Low success rate - consider using a session or adjusting wait strategy');
  }

  if (intelligence.recentFailures > 5) {
    recommendations.push('Many recent failures - site may be rate limiting or blocking');
  }

  if (intelligence.shouldUseSession) {
    recommendations.push('This domain benefits from session persistence - use save_session after authentication');
  }

  if (intelligence.domainGroup) {
    recommendations.push(`Part of ${intelligence.domainGroup} group - shared patterns will be applied`);
  }

  if (intelligence.selectorChains > 0) {
    recommendations.push(`${intelligence.selectorChains} learned selectors available for reliable extraction`);
  }

  if (intelligence.paginationPatterns > 0) {
    recommendations.push('Pagination patterns learned - use followPagination for multi-page content');
  }

  return recommendations;
}

/**
 * Generate cost optimization recommendations
 */
function generateCostRecommendations(breakdown: {
  total: number;
  byTier: {
    intelligence: { cost: number; percentage: number; requests: number };
    lightweight: { cost: number; percentage: number; requests: number };
    playwright: { cost: number; percentage: number; requests: number };
  };
}): string[] {
  const recommendations: string[] = [];

  // Check if Playwright usage is high
  if (breakdown.byTier.playwright.percentage > 0.5) {
    recommendations.push(
      'Over 50% of cost is from Playwright tier - consider investigating if some sites could use lighter tiers'
    );
  }

  // Check if fallback is common
  const totalRequests =
    breakdown.byTier.intelligence.requests +
    breakdown.byTier.lightweight.requests +
    breakdown.byTier.playwright.requests;

  if (totalRequests > 10 && breakdown.byTier.playwright.requests > breakdown.byTier.intelligence.requests) {
    recommendations.push(
      'More Playwright requests than Intelligence - learning may help optimize tier selection over time'
    );
  }

  // Check if intelligence tier is underutilized
  if (breakdown.byTier.intelligence.percentage < 0.2 && totalRequests > 10) {
    recommendations.push(
      'Low Intelligence tier usage - ensure Content Intelligence is enabled for compatible sites'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Cost distribution looks healthy - tier selection is working efficiently');
  }

  return recommendations;
}

// Initialize and start server
async function main() {
  await sessionManager.initialize();
  await learningEngine.initialize();
  await smartBrowser.initialize();
  await authWorkflow.initialize();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.server.info('LLM Browser MCP Server started', {
    version: '0.5.0',
    primaryTool: 'smart_browse',
    features: ['Tiered rendering', 'Semantic embeddings', 'Cross-domain learning', 'API discovery', 'Procedural memory'],
    tiers: { intelligence: '~50ms', lightweight: '~200-500ms', playwright: '~2-5s' },
  });

  // Cleanup on exit
  process.on('SIGINT', async () => {
    logger.server.info('Shutting down');
    await browserManager.cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.server.error('Fatal error', { error });
  process.exit(1);
});
