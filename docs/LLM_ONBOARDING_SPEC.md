# LLM Client Onboarding Specification

This document defines the trust contract between the Unbrowser MCP Server and LLM clients. It explains how to interpret confidence scores, handle errors, understand pattern lifecycle, and make decisions based on response metadata.

## Table of Contents

1. [Trust Contract](#trust-contract)
2. [Confidence Framework](#confidence-framework)
3. [Error Recovery Protocol](#error-recovery-protocol)
4. [Pattern Lifecycle](#pattern-lifecycle)
5. [Response Structure Reference](#response-structure-reference)
6. [Decision Transparency](#decision-transparency)
7. [Budget and Performance](#budget-and-performance)
8. [Quick Reference](#quick-reference)

---

## Trust Contract

### Schema Versioning

All responses include a `schemaVersion` field (format: `MAJOR.MINOR`, e.g., `"1.0"`).

**Compatibility Rules:**

| Server Version | Client Version | Compatible? | Action |
|----------------|----------------|-------------|--------|
| 1.0 | 1.0 | Yes | Full compatibility |
| 1.5 | 1.0 | Yes | Client ignores new fields |
| 2.0 | 1.0 | No | Client should refuse response |
| 1.0 | 1.5 | Yes | Server lacks fields client expects |

**Client Implementation:**

```typescript
// Check compatibility before processing response
const [serverMajor] = response.schemaVersion.split('.').map(Number);
const [clientMajor] = CLIENT_VERSION.split('.').map(Number);

if (serverMajor !== clientMajor) {
  throw new Error(`Incompatible schema: server=${response.schemaVersion}, client=${CLIENT_VERSION}`);
}
```

**Guarantees:**

- Same major version = always compatible
- Minor version additions are backward-compatible (new optional fields only)
- Breaking changes require major version bump
- Current version: `1.0`

---

## Confidence Framework

### Confidence Scale

Confidence scores range from `0.0` to `1.0`. Use this interpretation guide:

| Score Range | Level | Interpretation | Recommended Action |
|-------------|-------|----------------|-------------------|
| 0.90 - 1.00 | Very High | Extracted from structured data or validated API | Trust completely |
| 0.75 - 0.89 | High | Strong selector match, validated | Trust for most uses |
| 0.60 - 0.74 | Medium | Selector match, partially validated | Verify critical data |
| 0.40 - 0.59 | Low | Heuristic extraction | Cross-reference recommended |
| 0.20 - 0.39 | Very Low | Fallback extraction | Use with caution |
| 0.00 - 0.19 | Minimal | Best-effort guess | Do not rely on |

### Extraction Source Baselines

Different extraction methods have inherent confidence baselines:

| Source | Baseline | Why |
|--------|----------|-----|
| `structured_data` | 0.95 | JSON-LD, Schema.org, OpenGraph - machine-readable |
| `api_response` | 0.95 | Direct API call with validated response |
| `graphql` | 0.90 | GraphQL introspection - typed schema |
| `framework_data` | 0.90 | Next.js `__NEXT_DATA__`, Nuxt, Gatsby |
| `selector_match` | 0.75 | CSS/XPath selector hit |
| `learned_pattern` | 0.70 | Previously successful pattern |
| `meta_tags` | 0.65 | HTML meta tags |
| `heuristic` | 0.50 | Algorithmic extraction |
| `fallback` | 0.30 | Last-resort extraction |
| `unknown` | 0.20 | Source not tracked |

### Per-Field Confidence

Browse results include field-level confidence when available:

```typescript
interface BrowseResult {
  // ... content fields ...
  fieldConfidence?: {
    title: { score: 0.95, level: 'very_high', source: 'framework_data' };
    content: { score: 0.75, level: 'high', source: 'selector_match' };
    tables?: [{ score: 0.80, level: 'high', source: 'structured_data' }];
    discoveredApis?: [{ score: 0.70, level: 'medium', source: 'learned_pattern' }];
    overall: { score: 0.82, level: 'high', source: 'aggregated' };
  };
}
```

### Confidence Decision Matrix

| Task | Minimum Confidence | Rationale |
|------|-------------------|-----------|
| Display to user | 0.40 | User can verify |
| Store in database | 0.60 | Needs reasonable accuracy |
| Financial decisions | 0.85 | High accuracy required |
| Automated actions | 0.75 | Should be reliable |
| Fact extraction | 0.80 | Need trusted data |

---

## Error Recovery Protocol

### Error Categories

Every error includes a `category` for high-level classification:

| Category | Description | Typically Retryable |
|----------|-------------|---------------------|
| `network` | Connection failures, timeouts, DNS | Yes (with backoff) |
| `http` | HTTP status code errors (4xx, 5xx) | Depends on status |
| `auth` | Authentication/authorization issues | Sometimes |
| `rate_limit` | Rate limiting/throttling | Yes (with delay) |
| `content` | Content extraction failures | Sometimes |
| `validation` | Response validation failures | Sometimes |
| `security` | URL safety / SSRF protection | No |
| `browser` | Playwright/browser issues | Sometimes |
| `config` | Configuration errors | No |
| `site_change` | Site structure changed | Yes (with relearning) |
| `blocked` | Bot detection/blocking | Sometimes |
| `internal` | Server-side internal errors | Yes |

### Error Codes Reference

Common error codes and their meaning:

**Network Errors:**
- `NETWORK_TIMEOUT` - Request timed out
- `NETWORK_CONNECTION_FAILED` - Could not connect
- `NETWORK_DNS_FAILED` - DNS resolution failed

**HTTP Errors:**
- `HTTP_NOT_FOUND` (404) - Resource not found
- `HTTP_FORBIDDEN` (403) - Access denied
- `HTTP_SERVICE_UNAVAILABLE` (503) - Server overloaded
- `HTTP_BAD_GATEWAY` (502) - Upstream failure

**Auth Errors:**
- `AUTH_SESSION_EXPIRED` - Session needs refresh
- `AUTH_INVALID_CREDENTIALS` - Bad credentials
- `AUTH_MISSING_SESSION` - No session exists

**Content Errors:**
- `CONTENT_REQUIRES_JS` - Needs browser rendering
- `CONTENT_EMPTY` - No content extracted
- `CONTENT_TOO_SHORT` - Content below minimum

**Blocked Errors:**
- `BLOCKED_BOT_DETECTION` - Cloudflare, reCAPTCHA, etc.
- `BLOCKED_RATE_LIMITED` - Too many requests
- `BLOCKED_GEO_RESTRICTED` - Geographic restriction

### Structured Error Response

```typescript
interface StructuredError {
  error: string;                    // Human-readable message
  category: ErrorCategory;          // High-level classification
  code: ErrorCode;                  // Machine-readable code
  httpStatus?: number;              // HTTP status if applicable
  retryable: boolean;               // Can LLM retry?
  recommendedActions: RecommendedAction[];
  context?: {
    url?: string;
    domain?: string;
    tier?: string;
    attemptNumber?: number;
  };
}
```

### Recommended Actions

Each error includes actionable recovery suggestions:

```typescript
interface RecommendedAction {
  action: string;           // e.g., 'retry', 'refresh_session', 'use_browser_tier'
  description: string;      // Human-readable explanation
  priority: number;         // Lower = try first (1, 2, 3...)
  suggestedDelayMs?: number;  // Wait before action
  toolToUse?: string;       // MCP tool to call
  parameters?: object;      // Suggested tool parameters
}
```

**Example Error with Actions:**

```json
{
  "error": "Rate limited by example.com",
  "category": "rate_limit",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryable": true,
  "recommendedActions": [
    {
      "action": "wait_and_retry",
      "description": "Wait 60 seconds then retry the request",
      "priority": 1,
      "suggestedDelayMs": 60000
    },
    {
      "action": "reduce_frequency",
      "description": "Reduce request frequency for this domain",
      "priority": 2
    }
  ]
}
```

### Retry Decision Tree

```
Is error retryable?
    No  --> Report error to user
    Yes --> Check error category:

        rate_limit:
            Wait suggestedDelayMs (default: 60s)
            Retry with exponential backoff

        network:
            Wait 1-5 seconds
            Retry up to 3 times

        auth:
            If AUTH_SESSION_EXPIRED:
                Call refresh_session tool
                Retry original request
            Else:
                Report auth failure

        blocked:
            If BLOCKED_BOT_DETECTION:
                Try with forceTier: 'playwright'
            Else:
                Wait and retry with backoff

        site_change:
            Clear cached patterns for domain
            Retry with fresh extraction

        content:
            If CONTENT_REQUIRES_JS:
                Retry with forceTier: 'lightweight' or 'playwright'
            Else:
                Report extraction failure
```

---

## Pattern Lifecycle

### Pattern Sources

Learned API patterns include provenance metadata indicating how they were discovered:

| Source | Confidence Boost | Description |
|--------|-----------------|-------------|
| `bootstrap` | +0.15 | Pre-seeded from known implementations |
| `openapi_discovery` | +0.20 | From OpenAPI/Swagger spec |
| `graphql_introspection` | +0.20 | From GraphQL schema |
| `api_extraction` | +0.00 | Learned from successful extraction |
| `asyncapi_discovery` | +0.15 | From AsyncAPI spec |
| `docs_page_detection` | +0.10 | From API documentation page |
| `link_discovery` | +0.05 | From RFC 8288 links or HATEOAS |
| `backend_fingerprinting` | +0.10 | Inferred from framework detection |
| `cross_site_transfer` | -0.10 | Transferred from similar site |
| `user_feedback` | +0.10 | User-provided correction |
| `manual` | +0.15 | Manually configured |

### Confidence Decay

Patterns decay over time if not verified:

| Decay Reason | Confidence Penalty | When Applied |
|--------------|-------------------|--------------|
| `time_decay` | -0.05/week | No verification in 7+ days |
| `repeated_failures` | -0.15 | 3+ consecutive failures |
| `validation_failures` | -0.10 | Response validation failed |
| `site_structure_changed` | -0.20 | Site structure changed |
| `rate_limited` | -0.05 | Caused rate limiting |
| `auth_expired` | -0.10 | Authentication expired |

### Pattern Trust Assessment

```typescript
function shouldTrustPattern(pattern: ApiPattern): TrustLevel {
  const { confidence, provenance } = pattern;

  // Check age
  const daysSinceVerified = provenance?.lastVerifiedAt
    ? (Date.now() - provenance.lastVerifiedAt) / (1000 * 60 * 60 * 24)
    : Infinity;

  // Fresh high-confidence patterns
  if (confidence >= 0.80 && daysSinceVerified < 7) {
    return 'high';
  }

  // Verified patterns from trusted sources
  if (confidence >= 0.70 && ['openapi_discovery', 'graphql_introspection'].includes(provenance?.source)) {
    return 'high';
  }

  // Moderate confidence, recently used
  if (confidence >= 0.50 && daysSinceVerified < 14) {
    return 'medium';
  }

  // Old or low confidence
  return 'low';
}
```

### Pattern Usage Guidelines

| Trust Level | Recommended Usage |
|-------------|-------------------|
| High | Use directly, skip rendering when possible |
| Medium | Use with fallback to rendering |
| Low | Prefer rendering, use pattern as hint only |

---

## Response Structure Reference

### Browse Result

```typescript
interface BrowseResult {
  // Core content
  url: string;                      // Original URL
  title: string;                    // Page title
  content: {
    html: string;                   // Raw HTML (if requested)
    markdown: string;               // Markdown conversion
    text: string;                   // Plain text
  };

  // Structured data
  tables?: ExtractedTable[];        // Extracted tables
  discoveredApis?: ApiPattern[];    // Learned API endpoints

  // Network data (if requested)
  network?: NetworkRequest[];       // Captured requests
  console?: ConsoleMessage[];       // Console logs

  // Metadata
  metadata: {
    loadTime: number;               // Total load time (ms)
    timestamp: number;              // Unix timestamp
    finalUrl: string;               // After redirects
    language?: string;              // Detected language
    fromCache?: boolean;            // Served from cache
    retryCount?: number;            // Retry attempts
    tier: 'intelligence' | 'lightweight' | 'playwright';
  };

  // Trust indicators
  schemaVersion: string;            // e.g., "1.0"
  fieldConfidence?: BrowseFieldConfidence;
  decisionTrace?: DecisionTrace;    // If requested

  // Learning insights
  learningInsights?: {
    patternsLearned: number;
    patternsApplied: number;
    skillsUsed: string[];
  };
}
```

### API Pattern

```typescript
interface ApiPattern {
  endpoint: string;                 // Full URL pattern
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  confidence: 'high' | 'medium' | 'low';
  canBypass: boolean;               // Can skip browser rendering?

  // Authentication
  authType?: 'cookie' | 'bearer' | 'header' | 'session';
  authHeaders?: Record<string, string>;

  // Response info
  responseType?: string;            // e.g., 'application/json'

  // Request parameters
  params?: Record<string, any>;

  // Explanation
  reason?: string;                  // Why this confidence level

  // Lifecycle
  provenance?: ProvenanceMetadata;
}
```

### Network Request

```typescript
interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  requestHeaders: Record<string, string>;
  contentType?: string;
  responseBody?: unknown;           // JSON responses parsed
  timestamp: number;
  duration?: number;                // Request duration (ms)
}
```

---

## Decision Transparency

### Decision Trace

When `includeDecisionTrace: true`, responses include detailed execution history:

```typescript
interface DecisionTrace {
  tiers: TierAttempt[];             // Rendering tier attempts
  selectors: SelectorAttempt[];     // Content extraction attempts
  title: TitleAttempt[];            // Title extraction attempts
  summary: {
    totalTiersAttempted: number;
    successfulTier: string;
    totalSelectorsAttempted: number;
    selectedSelector: string;
    totalDurationMs: number;
  };
}
```

### Interpreting Tier Attempts

```typescript
interface TierAttempt {
  tier: 'intelligence' | 'lightweight' | 'playwright';
  success: boolean;
  durationMs: number;
  failureReason?: string;           // If failed
  validationDetails?: {
    contentLength: number;
    hasSemanticMarkers: boolean;    // Has main/article tags
    hasIncompleteMarkers: boolean;  // Has loading indicators
    meetsMinLength: boolean;
  };
}
```

**Example trace interpretation:**

```json
{
  "tiers": [
    {
      "tier": "intelligence",
      "success": false,
      "durationMs": 150,
      "failureReason": "Content too short (45 chars, min 500)"
    },
    {
      "tier": "lightweight",
      "success": false,
      "durationMs": 350,
      "failureReason": "Page requires full browser: WebGL detected"
    },
    {
      "tier": "playwright",
      "success": true,
      "durationMs": 2500
    }
  ]
}
```

This trace shows:
1. Intelligence tier found only 45 characters (JavaScript-rendered content)
2. Lightweight tier detected WebGL requirement
3. Full Playwright browser succeeded

### Selector Attempts

```typescript
interface SelectorAttempt {
  selector: string;                 // CSS selector
  source: string;                   // Category (main, article, role_main, etc.)
  matched: boolean;                 // Found elements?
  contentLength: number;            // Content size
  confidenceScore: number;          // 0.0-1.0
  selected: boolean;                // Was this used?
  skipReason?: string;              // Why skipped
}
```

---

## Budget and Performance

### Tier Selection Strategy

The system tries tiers from fastest to slowest:

| Tier | Typical Latency | Cost | Best For |
|------|-----------------|------|----------|
| `intelligence` | 50-200ms | Lowest | Static sites, framework sites, APIs |
| `lightweight` | 200-500ms | Medium | Simple JavaScript sites |
| `playwright` | 2-5s | Highest | SPAs, complex JS, anti-bot |

### Budget Controls

Use these parameters to control cost/latency tradeoffs:

```typescript
interface BrowseOptions {
  // Maximum acceptable latency
  maxLatencyMs?: number;            // Stop if exceeded

  // Maximum tier to use
  maxCostTier?: 'intelligence' | 'lightweight' | 'playwright';

  // Freshness requirement
  freshnessRequirement?: 'realtime' | 'cached' | 'any';
}
```

**Examples:**

```typescript
// Fast, cheap: only intelligence tier
{ maxCostTier: 'intelligence', maxLatencyMs: 500 }

// Balanced: allow lightweight, but not full browser
{ maxCostTier: 'lightweight', maxLatencyMs: 2000 }

// Complete: full browser if needed
{ maxCostTier: 'playwright' }  // default

// Allow cached data
{ freshnessRequirement: 'any' }

// Always fetch fresh
{ freshnessRequirement: 'realtime' }
```

### Performance Expectations

| Domain Type | Expected Tier | Latency |
|-------------|---------------|---------|
| News sites | intelligence | 100-300ms |
| E-commerce | lightweight | 300-800ms |
| SPAs (React/Vue) | lightweight/playwright | 500ms-3s |
| Social media | playwright | 2-5s |
| Gov/edu sites | intelligence | 100-300ms |

---

## Quick Reference

### Response Fields to Always Check

1. **`schemaVersion`** - Ensure compatibility before processing
2. **`fieldConfidence.overall.score`** - Overall trust level
3. **`metadata.tier`** - Which rendering tier was used
4. **`discoveredApis`** - Available for direct API access

### Error Handling Checklist

1. Check `retryable` flag first
2. Follow `recommendedActions` in priority order
3. Respect `suggestedDelayMs` for rate limits
4. Use `toolToUse` and `parameters` hints

### Confidence Quick Checks

```typescript
// Is data trustworthy?
const trustworthy = result.fieldConfidence?.overall?.score >= 0.70;

// Should I use this API pattern?
const usePattern = pattern.confidence === 'high' && pattern.canBypass;

// Is this extraction reliable?
const reliable = result.fieldConfidence?.content?.source === 'structured_data';
```

### Tier Selection Quick Guide

```
Need speed? --> maxCostTier: 'intelligence'
Need accuracy? --> maxCostTier: 'playwright'
Balanced? --> maxCostTier: 'lightweight'
Don't care about freshness? --> freshnessRequirement: 'any'
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-21 | Initial specification |
