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
import { SmartBrowser } from './core/smart-browser.js';
import { BrowseTool } from './tools/browse-tool.js';
import { ApiCallTool } from './tools/api-call-tool.js';
import { AuthWorkflow } from './core/auth-workflow.js';
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
          },
          required: ['url'],
        },
      },

      // ============================================
      // DOMAIN INTELLIGENCE
      // ============================================
      {
        name: 'get_domain_intelligence',
        description: `Get intelligence summary for a domain.

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
        description: `Get comprehensive capability summary for a domain (CX-011).

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
      // LEARNING MANAGEMENT
      // ============================================
      {
        name: 'get_learning_stats',
        description: `Get comprehensive statistics about the browser's learning.

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
        description: `Get comprehensive learning effectiveness metrics (LI-003).

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
      // PROCEDURAL MEMORY (Skills)
      // ============================================
      {
        name: 'get_procedural_memory_stats',
        description: `Get statistics about learned browsing skills (procedural memory).

Shows:
- Total skills learned
- Skills by domain
- Average success rate
- Most used skills
- Recent trajectories

The browser learns reusable "skills" from successful browsing sessions.
Skills are multi-step action sequences that can be applied to similar pages.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_learning_progress',
        description: `Get comprehensive learning progress statistics.

Shows a combined view of the browser's learning state:
- **Skills**: Total skills, success rates, top performers, recently created
- **Anti-patterns**: Things the browser learned NOT to do
- **Coverage**: Which domains have skills vs need them
- **Trajectories**: Browsing session outcomes

This is the most comprehensive view of the browser's learning progress.
Use it to understand overall learning health and identify areas for improvement.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'find_applicable_skills',
        description: `Find browsing skills that might be applicable for a URL.

Returns skills that match the page context based on:
- Domain patterns
- URL patterns
- Page type
- Similarity to learned patterns

Use this to preview what skills might be applied before browsing.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to find skills for',
            },
            topK: {
              type: 'number',
              description: 'Maximum number of skills to return (default: 3)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'get_skill_details',
        description: `Get detailed information about a specific learned skill.

Shows:
- Skill name and description
- Preconditions (when it applies)
- Action sequence
- Performance metrics
- Source domain`,
        inputSchema: {
          type: 'object',
          properties: {
            skillId: {
              type: 'string',
              description: 'The ID of the skill to get details for',
            },
          },
          required: ['skillId'],
        },
      },
      {
        name: 'manage_skills',
        description: `Manage browsing skills: export, import, prune, or reset.

Actions:
- export: Export all skills as JSON for backup/sharing
- import: Import skills from JSON (merge by default)
- prune: Remove low-performing skills
- reset: Clear all skills (use with caution)
- coverage: Get active learning coverage stats and suggestions
- workflows: List detected potential workflows`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['export', 'import', 'prune', 'reset', 'coverage', 'workflows'],
              description: 'The management action to perform',
            },
            data: {
              type: 'string',
              description: 'JSON data for import action',
            },
            minSuccessRate: {
              type: 'number',
              description: 'Minimum success rate for pruning (default: 0.3)',
            },
          },
          required: ['action'],
        },
      },

      // ============================================
      // SKILL VERSIONING & ROLLBACK
      // ============================================
      {
        name: 'get_skill_versions',
        description: `Get version history for a skill.

Shows all recorded versions of a skill including:
- Version number and when it was created
- What triggered the version (merge, update, rollback)
- Metrics snapshot at each version
- Best performing version

Use this to understand how a skill has evolved and identify the best version.`,
        inputSchema: {
          type: 'object',
          properties: {
            skillId: {
              type: 'string',
              description: 'The ID of the skill to get versions for',
            },
          },
          required: ['skillId'],
        },
      },
      {
        name: 'rollback_skill',
        description: `Rollback a skill to a previous version.

If performance has degraded, rollback to a better-performing version.
By default rolls back to the previous version, or specify a target version number.`,
        inputSchema: {
          type: 'object',
          properties: {
            skillId: {
              type: 'string',
              description: 'The ID of the skill to rollback',
            },
            targetVersion: {
              type: 'number',
              description: 'Target version number to rollback to (optional, defaults to previous)',
            },
          },
          required: ['skillId'],
        },
      },

      // ============================================
      // USER FEEDBACK
      // ============================================
      {
        name: 'rate_skill_application',
        description: `Rate the application of a skill (thumbs up/down).

Provide feedback on whether a skill worked well or not. This feedback:
- Updates the skill's success/failure metrics
- May trigger auto-rollback if too many negative ratings
- Helps improve skill selection over time

Use this after a skill is applied to help the browser learn.`,
        inputSchema: {
          type: 'object',
          properties: {
            skillId: {
              type: 'string',
              description: 'The ID of the skill that was applied',
            },
            rating: {
              type: 'string',
              enum: ['positive', 'negative'],
              description: 'Thumbs up (positive) or down (negative)',
            },
            url: {
              type: 'string',
              description: 'The URL where the skill was applied',
            },
            reason: {
              type: 'string',
              description: 'Optional reason for the rating',
            },
          },
          required: ['skillId', 'rating', 'url'],
        },
      },

      // ============================================
      // SKILL EXPLANATION
      // ============================================
      {
        name: 'get_skill_explanation',
        description: `Get a human-readable explanation of what a skill does.

Returns:
- Plain English summary of the skill
- Step-by-step breakdown of actions
- When/where the skill is applicable
- Reliability information
- Tips for best results`,
        inputSchema: {
          type: 'object',
          properties: {
            skillId: {
              type: 'string',
              description: 'The ID of the skill to explain',
            },
          },
          required: ['skillId'],
        },
      },

      // ============================================
      // ANTI-PATTERNS
      // ============================================
      {
        name: 'get_anti_patterns',
        description: `Get learned anti-patterns (things to avoid).

Anti-patterns are actions that have been learned NOT to do on specific domains.
Shows what actions cause problems and should be avoided.

Use this to understand known issues with a domain.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Filter anti-patterns by domain (optional)',
            },
          },
        },
      },

      // ============================================
      // SKILL DEPENDENCIES & FALLBACKS
      // ============================================
      {
        name: 'manage_skill_dependencies',
        description: `Manage skill dependencies and fallback chains.

Actions:
- add_fallbacks: Add fallback skills that run if the primary fails
- add_prerequisites: Add skills that must run before this one
- get_chain: Get the full dependency chain for a skill

This enables building complex multi-skill workflows with error recovery.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add_fallbacks', 'add_prerequisites', 'get_chain'],
              description: 'The dependency action to perform',
            },
            skillId: {
              type: 'string',
              description: 'The skill to manage dependencies for',
            },
            relatedSkillIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Skill IDs to add as fallbacks or prerequisites',
            },
          },
          required: ['action', 'skillId'],
        },
      },

      // ============================================
      // BOOTSTRAP
      // ============================================
      {
        name: 'bootstrap_skills',
        description: `Bootstrap procedural memory with common skill templates.

Initializes the browser with basic skills for common tasks:
- Cookie banner dismissal
- Pagination navigation
- Form extraction
- Table extraction

Use this when starting fresh to get basic capabilities quickly.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ============================================
      // DEPRECATED TOOLS (Backward Compatibility)
      // These tools are deprecated and will be removed in a future version.
      // Users should migrate to smart_browse for browsing operations.
      // ============================================
      {
        name: 'browse',
        description: `[DEPRECATED] Basic browse - use smart_browse instead.

DEPRECATION WARNING: This tool is deprecated since 2025-01-01 and will be removed in a future version.
Use "smart_browse" for better results with learning, API discovery, and tiered rendering.

Browses a URL with network capture but without learning features.`,
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to browse' },
            waitFor: {
              type: 'string',
              enum: ['load', 'domcontentloaded', 'networkidle'],
            },
            timeout: { type: 'number' },
            sessionProfile: { type: 'string' },
          },
          required: ['url'],
        },
      },
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
      {
        name: 'save_session',
        description: `Save browser session for authenticated access.

Captures cookies, localStorage, sessionStorage for future requests.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Domain to save session for' },
            sessionProfile: { type: 'string' },
          },
          required: ['domain'],
        },
      },
      {
        name: 'list_sessions',
        description: 'List all saved sessions.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_session_health',
        description: `Check the health status of saved sessions.

Detects:
- Expired sessions (auth cookies expired)
- Expiring soon (within 24 hours)
- Stale sessions (unused for 30+ days)
- Healthy sessions

Use this to proactively identify sessions that need re-authentication.
Can check a specific domain or all sessions.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Domain to check (optional - if not provided, checks all sessions)',
            },
            profile: {
              type: 'string',
              description: 'Session profile (default: "default")',
            },
          },
        },
      },
      {
        name: 'get_knowledge_stats',
        description: '[LEGACY] Use get_learning_stats instead for more detail.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_learned_patterns',
        description: '[LEGACY] Use get_domain_intelligence instead.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
          },
          required: ['domain'],
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
      // TIERED RENDERING
      // ============================================
      {
        name: 'get_tiered_fetcher_stats',
        description: `Get statistics about tiered rendering performance.

The browser uses a tiered approach for fetching:
- Tier 1 (intelligence): Content Intelligence (~50-200ms)
  - Framework data extraction (Next.js, Nuxt, Gatsby, Remix)
  - Structured data (JSON-LD, OpenGraph)
  - API prediction and direct calling
  - Google Cache / Archive.org fallbacks
  - Static HTML parsing
- Tier 2 (lightweight): HTTP + JS execution (~200-500ms) - for simple dynamic pages
- Tier 3 (playwright): Full browser (~2-5s) - OPTIONAL, for complex SPAs

Playwright is OPTIONAL - if not installed, the system gracefully skips it.

Shows:
- Domains using each tier
- Average response times per tier
- Whether Playwright is available

Use this to understand rendering efficiency.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'set_domain_tier',
        description: `Manually set the preferred rendering tier for a domain.

Use this to override automatic tier selection:
- 'intelligence' for most sites (fastest, uses multiple strategies)
- 'lightweight' for sites needing simple JS execution
- 'playwright' for sites requiring full browser (if available)

The setting persists until the browser learns differently or is reset.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'The domain to configure',
            },
            tier: {
              type: 'string',
              enum: ['intelligence', 'lightweight', 'playwright'],
              description: 'The rendering tier to use',
            },
          },
          required: ['domain', 'tier'],
        },
      },
      {
        name: 'get_tier_usage_by_domain',
        description: `Get detailed tier usage analytics broken down by domain.

Shows which rendering tier is used for each domain, including:
- Preferred tier per domain
- Success and failure counts
- Average response time per domain
- Last access timestamp

This helps understand:
- Which domains require full browser rendering
- Which domains are optimized for fast intelligence-based fetching
- Which domains have reliability issues (high failure counts)

Options:
- filterTier: Only show domains using a specific tier
- sortBy: Sort by 'domain', 'tier', 'successRate', 'responseTime', or 'lastUsed'
- limit: Maximum number of domains to return (default: 50)`,
        inputSchema: {
          type: 'object',
          properties: {
            filterTier: {
              type: 'string',
              enum: ['intelligence', 'lightweight', 'playwright'],
              description: 'Filter to show only domains using this tier',
            },
            sortBy: {
              type: 'string',
              enum: ['domain', 'tier', 'successRate', 'responseTime', 'lastUsed'],
              description: 'Sort results by this field (default: lastUsed)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of domains to return (default: 50)',
            },
          },
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
      // API AUTHENTICATION WORKFLOW
      // ============================================
      {
        name: 'get_api_auth_status',
        description: `Get authentication status for a domain's discovered APIs.

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
        description: `Configure API authentication credentials for a domain.

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
        description: `Complete OAuth 2.0 authorization_code flow after user authorization.

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
        description: `Get guidance for configuring a specific auth type.

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
        description: `Delete stored API authentication credentials.

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
        description: `List all domains with configured API authentication.

Shows which domains have auth configured and what types.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ============================================
      // DEBUG TRACE RECORDING (O-005)
      // ============================================
      {
        name: 'get_debug_traces',
        description: `Query recorded debug traces for failure analysis and replay.

Debug traces capture comprehensive information about browse operations:
- Tier decisions (which tiers were tried and why)
- Selector attempts (which selectors succeeded/failed)
- Network activity (API requests, failures)
- Validation results
- Errors encountered
- Skills applied
- Anomalies detected

Use this to debug failures and understand what happened during a browse operation.

Traces are stored persistently and can be exported for sharing.`,
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Filter by domain (e.g., "example.com")',
            },
            urlPattern: {
              type: 'string',
              description: 'Filter by URL pattern (regex)',
            },
            success: {
              type: 'boolean',
              description: 'Filter by success/failure status',
            },
            errorType: {
              type: 'string',
              enum: ['timeout', 'network', 'selector', 'validation', 'bot_challenge', 'rate_limit', 'auth', 'unknown'],
              description: 'Filter by error type',
            },
            tier: {
              type: 'string',
              enum: ['intelligence', 'lightweight', 'playwright'],
              description: 'Filter by final tier used',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default: 20)',
            },
            offset: {
              type: 'number',
              description: 'Offset for pagination',
            },
          },
        },
      },
      {
        name: 'get_debug_trace',
        description: `Get a specific debug trace by ID.

Returns the full trace with all captured data for detailed analysis.`,
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The trace ID to retrieve',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_debug_trace_stats',
        description: `Get statistics about recorded debug traces.

Shows:
- Total traces stored
- Traces by domain
- Traces by tier
- Success/failure counts
- Storage size
- Oldest/newest trace timestamps`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'configure_debug_recording',
        description: `Configure debug trace recording.

Control when and how traces are recorded:
- Enable/disable globally
- Set domains to always or never record
- Record only failures
- Set retention limits (max traces, max age)

Recording is disabled by default to avoid overhead. Enable it when debugging.`,
        inputSchema: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Enable/disable recording globally',
            },
            onlyRecordFailures: {
              type: 'boolean',
              description: 'Only record failed operations',
            },
            alwaysRecordDomain: {
              type: 'string',
              description: 'Add a domain to always-record list',
            },
            neverRecordDomain: {
              type: 'string',
              description: 'Add a domain to never-record list',
            },
            maxTraces: {
              type: 'number',
              description: 'Maximum traces to retain (default: 1000)',
            },
            maxAgeHours: {
              type: 'number',
              description: 'Maximum age of traces in hours (default: 168 = 7 days)',
            },
          },
        },
      },
      {
        name: 'export_debug_traces',
        description: `Export debug traces for sharing or replay.

Exports the specified traces to a portable format that can be shared
for debugging or used to replay operations.`,
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of trace IDs to export',
            },
          },
          required: ['ids'],
        },
      },
      {
        name: 'delete_debug_trace',
        description: `Delete a debug trace by ID.`,
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The trace ID to delete',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'clear_debug_traces',
        description: `Clear all recorded debug traces.

Use with caution - this permanently deletes all stored traces.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // ============================================
      // USAGE METERING (GTM-001)
      // ============================================
      {
        name: 'get_usage_summary',
        description: `Get usage and cost summary for the LLM Browser.

Returns comprehensive usage statistics including:
- Total requests and cost units
- Success rate and average cost per request
- Breakdown by tier (intelligence, lightweight, playwright)
- Top domains by cost and request count
- Fallback rate (how often requests fell back to heavier tiers)

Cost units reflect computational cost:
- Intelligence tier: 1 unit (fastest, no browser)
- Lightweight tier: 5 units (simple JS execution)
- Playwright tier: 25 units (full browser rendering)

Use period filters to focus on recent usage or get all-time totals.`,
        inputSchema: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'all'],
              description: 'Time period to summarize (default: all)',
            },
            domain: {
              type: 'string',
              description: 'Filter to specific domain',
            },
            tier: {
              type: 'string',
              enum: ['intelligence', 'lightweight', 'playwright'],
              description: 'Filter to specific tier',
            },
            tenantId: {
              type: 'string',
              description: 'Filter to specific tenant (for multi-tenant deployments)',
            },
          },
        },
      },
      {
        name: 'get_usage_by_period',
        description: `Get usage breakdown by time period.

Returns usage aggregates for each period (hourly or daily),
allowing you to see trends over time.

Each period includes:
- Request count and total cost units
- Success rate
- Tier breakdown
- Fallback rate`,
        inputSchema: {
          type: 'object',
          properties: {
            granularity: {
              type: 'string',
              enum: ['hour', 'day'],
              description: 'Time granularity for periods (default: day)',
            },
            periods: {
              type: 'number',
              description: 'Number of periods to return (default: 7 for days, 24 for hours)',
            },
            domain: {
              type: 'string',
              description: 'Filter to specific domain',
            },
          },
        },
      },
      {
        name: 'get_cost_breakdown',
        description: `Get detailed cost breakdown by tier.

Returns cost analysis including:
- Total cost units
- Cost per tier with percentages
- Estimated monthly cost (based on current period usage)
- Recommendations for cost optimization

Useful for understanding where computational resources are being spent
and identifying opportunities to optimize.`,
        inputSchema: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'all'],
              description: 'Time period for breakdown (default: day)',
            },
            domain: {
              type: 'string',
              description: 'Filter to specific domain',
            },
          },
        },
      },
      {
        name: 'reset_usage_meters',
        description: `Reset all usage meters.

Clears all recorded usage events. Use with caution - this permanently
deletes all usage history.

Useful for:
- Starting fresh after a testing period
- Clearing data before a new billing period
- Resetting after configuration changes`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
      // DOMAIN INTELLIGENCE
      // ============================================
      case 'get_domain_intelligence': {
        const intelligence = await smartBrowser.getDomainIntelligence(args.domain as string);

        return jsonResponse({
          domain: args.domain,
          ...intelligence,
          recommendations: getRecommendations(intelligence),
        });
      }

      case 'get_domain_capabilities': {
        const capabilities = await smartBrowser.getDomainCapabilities(args.domain as string);
        return jsonResponse(capabilities);
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
        });
      }

      // ============================================
      // PROCEDURAL MEMORY (Skills)
      // ============================================
      case 'get_procedural_memory_stats': {
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

      case 'get_learning_progress': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
        const learningEngine = smartBrowser.getLearningEngine();

        const progress = proceduralMemory.getLearningProgress();
        const learningStats = learningEngine.getStats();

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

      case 'find_applicable_skills': {
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

      case 'get_skill_details': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
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

      case 'manage_skills': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
        const action = args.action as string;

        switch (action) {
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
            return errorResponse(`Unknown action: ${action}`);
        }
      }

      // ============================================
      // SKILL VERSIONING & ROLLBACK
      // ============================================
      case 'get_skill_versions': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
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

      case 'rollback_skill': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
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

      // ============================================
      // USER FEEDBACK
      // ============================================
      case 'rate_skill_application': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
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

      // ============================================
      // SKILL EXPLANATION
      // ============================================
      case 'get_skill_explanation': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
        const skillId = args.skillId as string;

        const explanation = proceduralMemory.generateSkillExplanation(skillId);

        if (!explanation) {
          return errorResponse(`Skill not found: ${skillId}`);
        }

        return jsonResponse(explanation);
      }

      // ============================================
      // ANTI-PATTERNS
      // ============================================
      case 'get_anti_patterns': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
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

      // ============================================
      // SKILL DEPENDENCIES & FALLBACKS
      // ============================================
      case 'manage_skill_dependencies': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
        const action = args.action as string;
        const skillId = args.skillId as string;
        const relatedSkillIds = args.relatedSkillIds as string[] | undefined;

        switch (action) {
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
            return errorResponse(`Unknown action: ${action}`);
        }
      }

      // ============================================
      // BOOTSTRAP
      // ============================================
      case 'bootstrap_skills': {
        const proceduralMemory = smartBrowser.getProceduralMemory();
        const bootstrapped = await proceduralMemory.bootstrapFromTemplates();

        return jsonResponse({
          message: `Bootstrapped ${bootstrapped} skills from templates`,
          totalSkills: proceduralMemory.getStats().totalSkills,
          templates: ['cookie_banner_dismiss', 'pagination_navigate', 'form_extraction', 'table_extraction'],
        });
      }

      // ============================================
      // DEPRECATED TOOLS
      // Log deprecation warnings and include notices in responses
      // ============================================
      case 'browse': {
        // Log deprecation warning
        logger.server.warn('Deprecated tool called', {
          tool: 'browse',
          deprecatedSince: '2025-01-01',
          replacement: 'smart_browse',
          url: args.url as string,
        });

        const result = await browseTool.execute(args.url as string, {
          waitFor: args.waitFor as any,
          timeout: args.timeout as number,
          sessionProfile: args.sessionProfile as string,
        });

        // Include deprecation notice in response
        return jsonResponse({
          _deprecation: {
            warning: 'The "browse" tool is deprecated and will be removed in a future version.',
            replacement: 'Use "smart_browse" instead for better results with learning and API discovery.',
            deprecatedSince: '2025-01-01',
          },
          ...result,
        });
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

      case 'save_session': {
        const context = await browserManager.getContext((args.sessionProfile as string) || 'default');
        await sessionManager.saveSession(
          args.domain as string,
          context,
          (args.sessionProfile as string) || 'default'
        );

        return jsonResponse({ success: true, message: `Session saved for ${args.domain}` });
      }

      case 'list_sessions': {
        const sessions = sessionManager.listSessions();
        return jsonResponse({ sessions });
      }

      case 'get_session_health': {
        if (args.domain) {
          // Check specific domain
          const health = sessionManager.getSessionHealth(
            args.domain as string,
            (args.profile as string) || 'default'
          );
          return jsonResponse(health);
        } else {
          // Check all sessions
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

      case 'get_knowledge_stats': {
        const stats = learningEngine.getStats();
        return jsonResponse(stats);
      }

      case 'get_learned_patterns': {
        const patterns = learningEngine.getPatterns(args.domain as string);
        return jsonResponse({ domain: args.domain, patterns });
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
      // TIERED RENDERING
      // ============================================
      case 'get_tiered_fetcher_stats': {
        const tieredFetcher = smartBrowser.getTieredFetcher();
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

      case 'set_domain_tier': {
        const tieredFetcher = smartBrowser.getTieredFetcher();
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

      case 'get_tier_usage_by_domain': {
        const tieredFetcher = smartBrowser.getTieredFetcher();
        const preferences = tieredFetcher.exportPreferences();
        const filterTier = args.filterTier as string | undefined;
        const sortBy = (args.sortBy as string) || 'lastUsed';
        const limit = (args.limit as number) || 50;

        // Filter by tier if requested
        let filtered = preferences;
        if (filterTier) {
          filtered = preferences.filter(p => p.preferredTier === filterTier);
        }

        // Sort results
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
              return rateB - rateA; // Higher success rate first
            }
            case 'responseTime':
              return a.avgResponseTime - b.avgResponseTime; // Faster first
            case 'lastUsed':
            default:
              return b.lastUsed - a.lastUsed; // Most recent first
          }
        });

        // Apply limit
        const limited = sorted.slice(0, limit);

        // Format results
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

        // Calculate summary by tier
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
      // API AUTHENTICATION WORKFLOW
      // ============================================
      case 'get_api_auth_status': {
        const status = await authWorkflow.getAuthStatus(
          args.domain as string,
          (args.profile as string) || 'default'
        );

        return jsonResponse({
          domain: status.domain,
          status: status.status,
          message: status.message,
          detectedAuth: status.detectedAuth,
          configuredCredentials: status.configuredCredentials,
          missingAuth: status.missingAuth.map(auth => ({
            type: auth.type,
            guidance: authWorkflow.getAuthGuidance(auth),
          })),
        });
      }

      case 'configure_api_auth': {
        const authType = args.authType as string;
        const rawCredentials = args.credentials as Record<string, unknown>;

        // Build typed credentials based on auth type
        let typedCredentials: any;
        switch (authType) {
          case 'api_key':
            typedCredentials = {
              type: 'api_key',
              in: rawCredentials.in || 'header',
              name: rawCredentials.name || 'X-API-Key',
              value: rawCredentials.value,
            };
            break;
          case 'bearer':
            typedCredentials = {
              type: 'bearer',
              token: rawCredentials.token,
              expiresAt: rawCredentials.expiresAt,
            };
            break;
          case 'basic':
            typedCredentials = {
              type: 'basic',
              username: rawCredentials.username,
              password: rawCredentials.password,
            };
            break;
          case 'oauth2':
            typedCredentials = {
              type: 'oauth2',
              flow: rawCredentials.flow || 'authorization_code',
              clientId: rawCredentials.clientId,
              clientSecret: rawCredentials.clientSecret,
              accessToken: rawCredentials.accessToken,
              refreshToken: rawCredentials.refreshToken,
              scopes: rawCredentials.scopes,
              urls: {
                authorizationUrl: rawCredentials.authorizationUrl,
                tokenUrl: rawCredentials.tokenUrl,
                refreshUrl: rawCredentials.refreshUrl,
              },
              username: rawCredentials.username,
              password: rawCredentials.password,
            };
            break;
          case 'cookie':
            typedCredentials = {
              type: 'cookie',
              name: rawCredentials.name,
              value: rawCredentials.value,
              expiresAt: rawCredentials.expiresAt,
            };
            break;
          default:
            return errorResponse(`Unknown auth type: ${authType}`);
        }

        const result = await authWorkflow.configureCredentials(
          args.domain as string,
          typedCredentials,
          (args.profile as string) || 'default',
          args.validate !== false
        );

        return jsonResponse({
          success: result.success,
          domain: result.domain,
          type: result.type,
          profile: result.profile,
          validated: result.validated,
          error: result.error,
          nextStep: result.nextStep,
        });
      }

      case 'complete_oauth': {
        const result = await authWorkflow.completeOAuthFlow(
          args.code as string,
          args.state as string
        );

        return jsonResponse({
          success: result.success,
          domain: result.domain,
          profile: result.profile,
          validated: result.validated,
          error: result.error,
          message: result.success
            ? 'OAuth authorization completed successfully. You can now make authenticated API calls.'
            : 'OAuth authorization failed. Please try again.',
        });
      }

      case 'get_auth_guidance': {
        const status = await authWorkflow.getAuthStatus(args.domain as string);
        const authType = args.authType as string | undefined;

        let guidance: Array<{ type: string; guidance: ReturnType<typeof authWorkflow.getAuthGuidance> }>;

        if (authType) {
          // Get guidance for specific type
          const authInfo = status.detectedAuth.find(a => a.type === authType) ||
            { type: authType as any, in: 'header', name: undefined };
          guidance = [{ type: authType, guidance: authWorkflow.getAuthGuidance(authInfo) }];
        } else {
          // Get guidance for all detected auth types
          guidance = status.detectedAuth.map(auth => ({
            type: auth.type,
            guidance: authWorkflow.getAuthGuidance(auth),
          }));

          // If no auth detected, show guidance for common types
          if (guidance.length === 0) {
            guidance = [
              { type: 'api_key', guidance: authWorkflow.getAuthGuidance({ type: 'api_key', in: 'header' }) },
              { type: 'bearer', guidance: authWorkflow.getAuthGuidance({ type: 'bearer' }) },
            ];
          }
        }

        return jsonResponse({
          domain: args.domain,
          detectedAuthTypes: status.detectedAuth.map(a => a.type),
          guidance,
        });
      }

      case 'delete_api_auth': {
        const deleted = await authWorkflow.deleteCredentials(
          args.domain as string,
          args.authType as any,
          (args.profile as string) || 'default'
        );

        return jsonResponse({
          success: deleted,
          domain: args.domain,
          authType: args.authType || 'all',
          profile: args.profile || 'default',
          message: deleted
            ? 'Credentials deleted successfully'
            : 'No matching credentials found',
        });
      }

      case 'list_configured_auth': {
        const configuredDomains = authWorkflow.listConfiguredDomains();

        return jsonResponse({
          totalDomains: configuredDomains.length,
          domains: configuredDomains,
        });
      }

      // ============================================
      // DEBUG TRACE RECORDING (O-005)
      // ============================================
      case 'get_debug_traces': {
        const debugRecorder = smartBrowser.getDebugRecorder();
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

      case 'get_debug_trace': {
        const debugRecorder = smartBrowser.getDebugRecorder();
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

      case 'get_debug_trace_stats': {
        const debugRecorder = smartBrowser.getDebugRecorder();
        const stats = await debugRecorder.getStats();

        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          ...stats,
          oldestTrace: stats.oldestTrace ? new Date(stats.oldestTrace).toISOString() : null,
          newestTrace: stats.newestTrace ? new Date(stats.newestTrace).toISOString() : null,
          storageSizeMB: Math.round(stats.storageSizeBytes / 1024 / 1024 * 100) / 100,
        });
      }

      case 'configure_debug_recording': {
        const debugRecorder = smartBrowser.getDebugRecorder();

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

      case 'export_debug_traces': {
        const debugRecorder = smartBrowser.getDebugRecorder();
        const ids = args.ids as string[];
        const exportData = await debugRecorder.exportTraces(ids);

        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          exportedAt: new Date(exportData.exportedAt).toISOString(),
          traceCount: exportData.traces.length,
          traces: exportData.traces,
        });
      }

      case 'delete_debug_trace': {
        const debugRecorder = smartBrowser.getDebugRecorder();
        const deleted = await debugRecorder.deleteTrace(args.id as string);

        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          success: deleted,
          id: args.id,
          message: deleted ? 'Trace deleted' : 'Trace not found',
        });
      }

      case 'clear_debug_traces': {
        const debugRecorder = smartBrowser.getDebugRecorder();
        const count = await debugRecorder.clearAll();

        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          success: true,
          deletedCount: count,
          message: `Deleted ${count} traces`,
        });
      }

      // ============================================
      // USAGE METERING (GTM-001)
      // ============================================

      case 'get_usage_summary': {
        const usageMeter = getUsageMeter();
        await usageMeter.initialize();

        const options: UsageQueryOptions = {
          period: (args.period as 'hour' | 'day' | 'week' | 'month' | 'all') || 'all',
          domain: args.domain as string | undefined,
          tier: args.tier as ('intelligence' | 'lightweight' | 'playwright') | undefined,
          tenantId: args.tenantId as string | undefined,
        };

        const summary = await usageMeter.getSummary(options);

        // Calculate success rate from currentPeriod counts
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

      case 'get_usage_by_period': {
        const usageMeter = getUsageMeter();
        await usageMeter.initialize();

        // Only 'hour' and 'day' are supported granularities
        const rawGranularity = args.granularity as string || 'day';
        const granularity: 'hour' | 'day' = rawGranularity === 'hour' ? 'hour' : 'day';
        const periods = (args.periods as number) || 7;
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

      case 'get_cost_breakdown': {
        const usageMeter = getUsageMeter();
        await usageMeter.initialize();

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

      case 'reset_usage_meters': {
        const usageMeter = getUsageMeter();
        await usageMeter.initialize();
        await usageMeter.reset();

        return jsonResponse({
          schemaVersion: addSchemaVersion({}).schemaVersion,
          success: true,
          message: 'Usage meters reset',
        });
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
