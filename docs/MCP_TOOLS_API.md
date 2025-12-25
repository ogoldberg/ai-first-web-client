# MCP Tools API Reference

This document provides comprehensive documentation for all MCP tools available in Unbrowser.

## Tool Visibility

Tools are organized into three categories based on visibility:

| Category | Environment Variable | Default |
|----------|---------------------|---------|
| **Core Tools** | Always visible | 5 tools |
| **Debug Tools** | `LLM_BROWSER_DEBUG_MODE=1` | Hidden |
| **Admin Tools** | `LLM_BROWSER_ADMIN_MODE=1` | Hidden |

---

## Core Tools

These tools are always available and represent the primary interface for LLM clients.

### smart_browse

Intelligently browse a URL with automatic learning and optimization.

**This is the RECOMMENDED browsing tool.** It automatically:
- Uses learned selectors for reliable content extraction
- Falls back through selector chains if primary fails
- Validates responses against learned patterns
- Learns from successes and failures
- Applies cross-domain patterns (e.g., Spanish gov sites share patterns)
- Detects pagination for multi-page content
- Handles cookie banners automatically
- Retries with exponential backoff

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | The URL to browse |
| `contentType` | string | No | - | Type of content to extract. One of: `main_content`, `requirements`, `fees`, `timeline`, `documents`, `contact`, `table` |
| `followPagination` | boolean | No | `false` | Follow pagination to get all pages |
| `maxPages` | number | No | `5` | Maximum pages to follow if pagination enabled |
| `checkForChanges` | boolean | No | `false` | Check if content changed since last visit |
| `waitForSelector` | string | No | - | CSS selector to wait for (useful for SPAs) |
| `scrollToLoad` | boolean | No | `false` | Scroll to trigger lazy-loaded content |
| `sessionProfile` | string | No | `"default"` | Session profile for authenticated access |

**Output Size Controls:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxChars` | number | unlimited | Truncate markdown content to this length |
| `includeTables` | boolean | `true` | Include extracted tables in response |
| `includeNetwork` | boolean | `false` | Include network request data |
| `includeConsole` | boolean | `false` | Include browser console logs |
| `includeHtml` | boolean | `false` | Include raw HTML in response |
| `includeInsights` | boolean | `true` | Include domain capabilities and knowledge summary |
| `includeDecisionTrace` | boolean | `false` | Include detailed decision trace |

**Budget Controls:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `maxLatencyMs` | number | Stop tier fallback if latency exceeds this value |
| `maxCostTier` | string | Limit to cheaper tiers. One of: `intelligence`, `lightweight`, `playwright` |
| `freshnessRequirement` | string | Content freshness. One of: `realtime` (always fresh), `cached` (prefer cache), `any` (default) |

#### Response

```typescript
{
  schemaVersion: string;          // e.g., "1.0"
  url: string;                    // Final URL after redirects
  title: string;                  // Page title
  markdown: string;               // Extracted content as markdown
  tables?: Table[];               // Extracted tables (if includeTables=true)
  apis?: DiscoveredApi[];         // Discovered API endpoints
  fieldConfidence?: FieldConfidence;  // Per-field confidence scores
  insights?: DomainInsights;      // Domain capabilities (if includeInsights=true)
  decisionTrace?: DecisionTrace;  // Tier/selector decisions (if includeDecisionTrace=true)
  budgetTracking?: {
    latencyExceeded: boolean;
    tiersSkipped: string[];
    maxCostTierEnforced: boolean;
    usedCache: boolean;
  };
}
```

#### Example

```json
{
  "url": "https://example.com/products",
  "contentType": "main_content",
  "maxChars": 5000,
  "includeTables": true,
  "maxCostTier": "lightweight"
}
```

---

### batch_browse

Browse multiple URLs in a single call with controlled concurrency.

Use this tool when you need to:
- Fetch content from multiple URLs efficiently
- Compare content across multiple pages
- Gather data from a list of URLs
- Crawl related pages in parallel

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | string[] | Yes | - | Array of URLs to browse |
| `concurrency` | number | No | `3` | Maximum parallel requests |
| `stopOnError` | boolean | No | `false` | Stop entire batch on first error |
| `continueOnRateLimit` | boolean | No | `true` | Continue batch when rate limited |
| `perUrlTimeoutMs` | number | No | - | Timeout per URL in milliseconds |
| `totalTimeoutMs` | number | No | - | Total batch timeout in milliseconds |
| `contentType` | string | No | - | Type of content to extract from each URL |
| `waitForSelector` | string | No | - | CSS selector to wait for on each page |
| `scrollToLoad` | boolean | No | `false` | Scroll to trigger lazy-loaded content |
| `sessionProfile` | string | No | `"default"` | Session profile for authenticated access |
| `maxChars` | number | No | unlimited | Maximum characters per URL |
| `includeTables` | boolean | No | `true` | Include extracted tables |
| `includeNetwork` | boolean | No | `false` | Include network requests |
| `includeConsole` | boolean | No | `false` | Include console logs |
| `maxLatencyMs` | number | No | - | Maximum latency per URL |
| `maxCostTier` | string | No | - | Maximum cost tier per URL |

#### Response

```typescript
{
  schemaVersion: string;
  results: Array<{
    url: string;
    success: boolean;
    status: 'success' | 'error' | 'rate_limited' | 'timeout';
    durationMs: number;
    result?: BrowseResult;  // Same as smart_browse response
    error?: string;
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    rateLimited: number;
    totalDurationMs: number;
  };
}
```

#### Example

```json
{
  "urls": [
    "https://example.com/page1",
    "https://example.com/page2",
    "https://example.com/page3"
  ],
  "concurrency": 5,
  "maxChars": 2000
}
```

---

### execute_api_call

Execute a direct API call using saved session authentication.

Bypasses browser rendering for discovered API endpoints. Use after discovering an API with `smart_browse`.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | The API endpoint URL |
| `method` | string | No | `"GET"` | HTTP method. One of: `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `headers` | object | No | - | Custom HTTP headers |
| `body` | object | No | - | Request body (for POST/PUT/PATCH) |
| `sessionProfile` | string | No | `"default"` | Session profile for authentication |

#### Response

```typescript
{
  schemaVersion: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
  durationMs: number;
}
```

#### Example

```json
{
  "url": "https://api.example.com/v1/users",
  "method": "GET",
  "headers": {
    "Accept": "application/json"
  }
}
```

---

### session_management

Manage browser sessions for authenticated access.

Sessions capture cookies, localStorage, and sessionStorage for a domain, enabling authenticated API calls without re-login.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | string | Yes | - | Action to perform. One of: `save`, `list`, `health` |
| `domain` | string | Depends | - | Domain (required for `save` and `health` actions) |
| `sessionProfile` | string | No | `"default"` | Session profile name |

#### Actions

**`save`** - Capture session data for a domain
- Requires: `domain`
- Captures: cookies, localStorage, sessionStorage

**`list`** - List all saved sessions
- Returns array of saved session profiles with domains and expiry info

**`health`** - Check session health
- Requires: `domain`
- Returns: `expired`, `expiring_soon`, `stale`, or `healthy`

#### Response

```typescript
// For 'save' action:
{
  schemaVersion: string;
  success: boolean;
  domain: string;
  profile: string;
  expiresAt?: string;
}

// For 'list' action:
{
  schemaVersion: string;
  sessions: Array<{
    domain: string;
    profile: string;
    createdAt: string;
    expiresAt?: string;
    cookieCount: number;
  }>;
}

// For 'health' action:
{
  schemaVersion: string;
  domain: string;
  status: 'expired' | 'expiring_soon' | 'stale' | 'healthy';
  details: string;
}
```

#### Example

```json
{
  "action": "save",
  "domain": "example.com",
  "sessionProfile": "work-account"
}
```

---

### api_auth

Unified API authentication management.

Configure, manage, and inspect authentication credentials for API access.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `action` | string | Yes | - | Action to perform (see below) |
| `domain` | string | Depends | - | Domain to operate on |
| `profile` | string | No | `"default"` | Auth profile name |
| `authType` | string | Depends | - | Authentication type: `api_key`, `bearer`, `basic`, `oauth2`, `cookie` |
| `credentials` | object | Depends | - | Credentials object (required for `configure`) |
| `validate` | boolean | No | `true` | Whether to validate credentials |
| `code` | string | Depends | - | OAuth authorization code (for `complete_oauth`) |
| `state` | string | Depends | - | OAuth state parameter (for `complete_oauth`) |

#### Actions

**`status`** - Check auth status for a domain
- Requires: `domain`

**`configure`** - Configure credentials for a domain
- Requires: `domain`, `authType`, `credentials`

**`complete_oauth`** - Complete OAuth2 authorization code flow
- Requires: `code`, `state`

**`guidance`** - Get help for configuring authentication
- Optional: `domain`, `authType`

**`delete`** - Delete stored credentials
- Requires: `domain`

**`list`** - List all configured authentication

#### Credential Formats by Auth Type

**`api_key`:**
```json
{
  "key": "your-api-key",
  "location": "header",  // or "query"
  "name": "X-API-Key"    // header name or query param
}
```

**`bearer`:**
```json
{
  "token": "your-bearer-token"
}
```

**`basic`:**
```json
{
  "username": "user",
  "password": "pass"
}
```

**`oauth2`:**
```json
{
  "clientId": "client-id",
  "clientSecret": "client-secret",
  "authorizationUrl": "https://auth.example.com/authorize",
  "tokenUrl": "https://auth.example.com/token",
  "scopes": ["read", "write"]
}
```

#### Example

```json
{
  "action": "configure",
  "domain": "api.example.com",
  "authType": "api_key",
  "credentials": {
    "key": "sk-1234567890",
    "location": "header",
    "name": "Authorization"
  }
}
```

---

## Debug Tools

These tools are hidden by default. Enable with `LLM_BROWSER_DEBUG_MODE=1`.

### capture_screenshot

Capture a screenshot of a webpage for visual debugging.

**Note:** Requires Playwright to be installed (full browser rendering).

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | URL to screenshot |
| `fullPage` | boolean | No | `true` | Capture entire page including scroll |
| `element` | string | No | - | CSS selector for specific element |
| `waitForSelector` | string | No | - | CSS selector to wait for before capture |
| `sessionProfile` | string | No | `"default"` | Session profile |
| `width` | number | No | `1920` | Viewport width |
| `height` | number | No | `1080` | Viewport height |

#### Response

```typescript
{
  schemaVersion: string;
  image: string;          // Base64-encoded PNG
  contentType: "image/png";
  width: number;
  height: number;
  url: string;
  timestamp: string;
}
```

---

### export_har

Export HAR (HTTP Archive) file for network debugging.

**Note:** Requires Playwright to be installed (full browser rendering).

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | URL to browse and capture |
| `includeResponseBodies` | boolean | No | `true` | Include response body content |
| `maxBodySize` | number | No | 1MB | Max body size in bytes |
| `pageTitle` | string | No | - | Custom title for HAR page entry |
| `waitForSelector` | string | No | - | CSS selector to wait for |
| `sessionProfile` | string | No | `"default"` | Session profile |

#### Response

Returns HAR 1.2 JSON with all network requests, responses, and timings.

---

### debug_traces

Query and manage debug traces for failure analysis and replay.

Debug traces capture tier decisions, selectors, network activity, validation, errors, and skills.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | One of: `list`, `get`, `stats`, `configure`, `export`, `delete`, `clear` |
| `domain` | string | No | Filter by domain (list action) |
| `urlPattern` | string | No | Filter by URL pattern regex (list action) |
| `success` | boolean | No | Filter by success/failure (list action) |
| `errorType` | string | No | Filter by error type: `timeout`, `network`, `selector`, `validation`, `bot_challenge`, `rate_limit`, `auth`, `unknown` |
| `tier` | string | No | Filter by tier: `intelligence`, `lightweight`, `playwright` |
| `limit` | number | No | Max results (default: 20) |
| `offset` | number | No | Pagination offset |
| `id` | string | No | Trace ID (get/delete actions) |
| `ids` | string[] | No | Trace IDs to export |
| `enabled` | boolean | No | Enable/disable recording (configure action) |
| `onlyRecordFailures` | boolean | No | Only record failures (configure action) |
| `maxTraces` | number | No | Max traces to retain (configure action) |
| `maxAgeHours` | number | No | Max age in hours (configure action) |

---

## Admin Tools

These tools are hidden by default. Enable with `LLM_BROWSER_ADMIN_MODE=1`.

### get_performance_metrics

Get comprehensive performance metrics for all tiers.

Returns detailed timing statistics including:
- System-wide performance summary
- Per-tier percentile statistics (p50, p95, p99)
- Component breakdown
- Top fastest and slowest domains

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `domain` | string | No | - | Get metrics for a specific domain |
| `sortBy` | string | No | - | Sort by: `avgTime`, `p95`, `successRate` |
| `order` | string | No | - | Sort order: `asc`, `desc` |
| `limit` | number | No | `20` | Maximum domains to return |

---

### usage_analytics

Get usage statistics and cost analysis.

**Cost units:** Intelligence=1, Lightweight=5, Playwright=25

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | One of: `summary`, `by_period`, `cost_breakdown`, `reset` |
| `period` | string | No | Time period: `hour`, `day`, `week`, `month`, `all` |
| `domain` | string | No | Filter by domain |
| `tier` | string | No | Filter by tier |
| `tenantId` | string | No | Filter by tenant |
| `granularity` | string | No | Time granularity: `hour`, `day` |
| `periods` | number | No | Number of periods to return |

---

### get_analytics_dashboard

Get a comprehensive analytics dashboard.

Provides a unified view including:
- Summary metrics (requests, costs, success rate, latency)
- System health assessment with recommendations
- Per-tier breakdown
- Top domains by cost, requests, and latency
- Time series data for trend visualization

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | string | No | `"day"` | Time period: `hour`, `day`, `week`, `month`, `all` |
| `topDomainsLimit` | number | No | `10` | Number of top domains to return |
| `timeSeriesPoints` | number | No | `24` | Number of time series data points |
| `domain` | string | No | - | Filter by specific domain |
| `tenantId` | string | No | - | Filter by tenant |

---

### get_system_status

Get a quick system status check.

Returns a compact summary suitable for health monitoring:
- Overall status: `healthy`, `degraded`, `unhealthy`
- 24-hour request count
- Success rate
- Average latency
- Cost units consumed

---

### tier_management

Manage tiered rendering for domains.

**Tiers:**
- `intelligence`: ~50-200ms (no rendering, API/structured data only)
- `lightweight`: ~200-500ms (linkedom DOM parsing)
- `playwright`: ~2-5s (full browser rendering)

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | One of: `stats`, `set`, `usage` |
| `domain` | string | No | Domain (set/usage actions) |
| `tier` | string | No | Target tier: `intelligence`, `lightweight`, `playwright` |
| `sortBy` | string | No | Sort by: `domain`, `tier`, `successRate`, `responseTime`, `lastUsed` |
| `limit` | number | No | Max domains (default: 50) |

---

### content_tracking

Track and detect content changes on websites.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | One of: `track`, `check`, `list`, `history`, `untrack`, `stats` |
| `url` | string | Depends | URL to track/check/untrack |
| `label` | string | No | Label for tracked URL |
| `tags` | string[] | No | Tags for categorization |
| `domain` | string | No | Filter by domain (list action) |
| `hasChanges` | boolean | No | Filter by change status (list action) |
| `limit` | number | No | Max results |

---

### get_browser_providers

Get information about available browser providers.

Shows which remote browser services are configured:
- **Local:** Uses installed Playwright (default)
- **Browserless.io:** Standard CDP endpoint
- **Bright Data:** Anti-bot focused with CAPTCHA solving
- **Custom:** Any CDP-compatible endpoint

---

### tool_selection_metrics

Get metrics about tool selection patterns.

Tracks which tools are used most frequently and identifies potential confusion.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | One of: `stats`, `confusion` |
| `period` | string | No | Time period: `hour`, `day`, `week`, `month`, `all` |
| `tool` | string | No | Filter by specific tool |
| `category` | string | No | Filter by category: `core`, `debug`, `admin`, `deprecated`, `unknown` |
| `sessionId` | string | No | Filter by session |
| `tenantId` | string | No | Filter by tenant |

---

## Deprecated Tools

These tools are deprecated and hidden behind `LLM_BROWSER_ADMIN_MODE=1`. Use the recommended alternatives.

| Deprecated Tool | Use Instead |
|-----------------|-------------|
| `get_domain_intelligence` | `smart_browse` with `includeInsights=true` |
| `get_domain_capabilities` | `smart_browse` with `includeInsights=true` |
| `get_learning_stats` | `get_analytics_dashboard` |
| `get_learning_effectiveness` | `get_analytics_dashboard` |
| `skill_management` | Skills are auto-applied during `smart_browse` |
| `get_api_auth_status` | `api_auth` with `action='status'` |
| `configure_api_auth` | `api_auth` with `action='configure'` |
| `complete_oauth` | `api_auth` with `action='complete_oauth'` |
| `get_auth_guidance` | `api_auth` with `action='guidance'` |
| `delete_api_auth` | `api_auth` with `action='delete'` |
| `list_configured_auth` | `api_auth` with `action='list'` |

---

## Response Conventions

All tool responses include:

1. **`schemaVersion`**: Version string (e.g., "1.0") for compatibility checking
2. **Consistent error format**: Errors return `{ error: string, code?: string, recommendations?: string[] }`
3. **Duration tracking**: Most responses include `durationMs` for performance monitoring

### Confidence Levels

When `fieldConfidence` is included, confidence levels are:
- `high`: Extracted from structured data or validated API response
- `medium`: Extracted from HTML with good selectors
- `low`: Heuristic extraction or fallback methods
- `unknown`: No confidence data available

### Tier Selection

The system automatically selects the optimal tier based on:
1. Domain patterns and learned preferences
2. Content requirements (SPAs need Playwright)
3. Budget constraints (`maxCostTier`, `maxLatencyMs`)
4. Previous success rates per domain

---

## Examples

### Basic Web Scraping

```json
{
  "name": "smart_browse",
  "arguments": {
    "url": "https://news.example.com",
    "contentType": "main_content",
    "maxChars": 10000
  }
}
```

### Authenticated API Access

```json
// Step 1: Configure authentication
{
  "name": "api_auth",
  "arguments": {
    "action": "configure",
    "domain": "api.example.com",
    "authType": "bearer",
    "credentials": {
      "token": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}

// Step 2: Make authenticated API calls
{
  "name": "execute_api_call",
  "arguments": {
    "url": "https://api.example.com/v1/data",
    "method": "GET"
  }
}
```

### Batch Data Collection

```json
{
  "name": "batch_browse",
  "arguments": {
    "urls": [
      "https://example.com/product/1",
      "https://example.com/product/2",
      "https://example.com/product/3"
    ],
    "concurrency": 3,
    "contentType": "main_content",
    "maxChars": 2000
  }
}
```

### Visual Debugging

```json
{
  "name": "capture_screenshot",
  "arguments": {
    "url": "https://example.com",
    "fullPage": true,
    "waitForSelector": ".main-content"
  }
}
```
