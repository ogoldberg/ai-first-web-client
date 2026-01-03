# Dynamic Handler System

The Dynamic Handler System is a yt-dlp inspired pattern learning system that automatically learns how to extract content from websites. Instead of maintaining static extractors for each site, the system learns from every browse operation and builds up knowledge about site patterns and quirks.

## Overview

The system learns two types of information:

1. **Repeatable Patterns** - Site templates like Shopify, WooCommerce, Next.js SSR that can be detected and applied instantly
2. **Site-Specific Quirks** - Learned requirements like stealth mode, rate limits, required headers, anti-bot detection

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ContentIntelligence                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │   extract()  │───▶│ recordSuccess│───▶│ DynamicHandler  │   │
│  └──────────────┘    └──────────────┘    │   Integration   │   │
│                                          └────────┬────────┘   │
│  ┌──────────────┐    ┌──────────────┐             │            │
│  │fetchWithCook │───▶│ applyQuirks  │◀────────────┘            │
│  │    ies()     │    └──────────────┘                          │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DynamicHandlerRegistry                         │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │ Pattern         │  │ Site Quirks      │  │ Observations │   │
│  │ Templates       │  │ (per-domain)     │  │ History      │   │
│  │ (Shopify, etc)  │  │                  │  │              │   │
│  └─────────────────┘  └──────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Persistence Layer                            │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │ Auto-Save       │  │ Debounced Writes │  │ JSON Storage │   │
│  │ Registry        │  │                  │  │              │   │
│  └─────────────────┘  └──────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Pattern Templates

The system comes with built-in templates for common site patterns:

| Template | Description | Signals |
|----------|-------------|---------|
| `shopify-like` | E-commerce stores with /products.json API | cdn.shopify.com, Shopify.theme |
| `woocommerce-like` | WordPress e-commerce with WC Store API | wp-json/wc/store, woocommerce class |
| `nextjs-ssr` | Next.js sites with SSR data | __NEXT_DATA__, /_next/static |
| `spa-json` | SPAs with embedded JSON state | __INITIAL_STATE__, __NUXT__ |
| `graphql` | Sites with GraphQL endpoints | /graphql endpoint |
| `structured-data` | Sites with JSON-LD markup | application/ld+json |
| `rest-api` | Sites with REST API patterns | /api/ endpoints |
| `html-scrape` | Basic HTML extraction | Fallback for unknown sites |

Templates are automatically detected from HTML content and URL patterns.

## Site Quirks

Quirks are learned from failures and applied to future requests:

### Stealth Mode
When a site returns 403 with Cloudflare or similar detection, the system learns to use stealth mode:
- TLS fingerprint impersonation
- Browser-like headers
- Behavioral delays

### Rate Limits
When a site returns 429 (Too Many Requests), the system learns:
- Requests per second limit
- Minimum delay between requests
- Automatically enforced via the rate limiter

### Required Headers
Some sites require specific headers:
- Authorization tokens
- Custom X-* headers
- Referer requirements

### Anti-Bot Detection
The system learns about anti-bot protection:
- Cloudflare
- Akamai
- Custom WAF solutions

## Usage

### Automatic Integration

The system is automatically integrated with `ContentIntelligence`. Every browse operation:

1. **Before fetch**: Applies learned quirks (stealth, headers, rate limits)
2. **On success**: Records the extraction pattern for future use
3. **On failure**: Learns quirks from error responses (403, 429, 503)

### SDK Usage

```typescript
import {
  initializeDynamicHandlers,
  dynamicHandlerIntegration,
  shutdownDynamicHandlers,
} from 'llm-browser/sdk';

// Initialize at app startup (loads persisted handlers)
initializeDynamicHandlers();

// Get recommendations for a URL
const recommendation = dynamicHandlerIntegration.getRecommendation({
  url: 'https://example-store.com/products/test',
  domain: 'example-store.com',
});

console.log(`Template: ${recommendation.template}`);
console.log(`Needs stealth: ${recommendation.needsStealth}`);
console.log(`Rate limit: ${recommendation.rateLimit} req/s`);

// Get learned stats
const stats = dynamicHandlerIntegration.getStats();
console.log(`Learned handlers: ${stats.totalHandlers}`);
console.log(`Quirks learned: ${stats.totalQuirks}`);

// Manually update quirks
dynamicHandlerIntegration.updateQuirks('api.example.com', {
  requiredHeaders: {
    'Authorization': 'Bearer token123',
  },
  rateLimit: {
    requestsPerSecond: 2,
  },
});

// Shutdown gracefully (saves handlers)
shutdownDynamicHandlers();
```

### MCP Tool

Use the `dynamic_handler_stats` MCP tool to inspect learned patterns:

**Get overall stats:**

```json
{
  "name": "dynamic_handler_stats",
  "arguments": { "action": "stats" }
}
```

**Get quirks for a domain:**

```json
{
  "name": "dynamic_handler_stats",
  "arguments": {
    "action": "quirks",
    "domain": "protected-site.com"
  }
}
```

**Get extraction recommendation:**

```json
{
  "name": "dynamic_handler_stats",
  "arguments": {
    "action": "recommendation",
    "url": "https://example-store.com/products/test"
  }
}
```

**Export learned data:**

```json
{
  "name": "dynamic_handler_stats",
  "arguments": { "action": "export" }
}
```

## Persistence

Learned handlers are automatically persisted to disk:

- **File**: `./dynamic-handlers.json` (configurable)
- **Auto-save**: Debounced writes (default 5 seconds)
- **Format**: JSON serialization of all handlers, quirks, and observations

### Custom Persistence

```typescript
import { createPersistentRegistry, dynamicHandlerRegistry } from 'llm-browser/sdk';

const { registry, autoSave } = createPersistentRegistry(dynamicHandlerRegistry, {
  path: './my-handlers.json',
  saveDelayMs: 10000,  // 10 second debounce
  autoLoad: true,
});
```

## Rate Limit Enforcement

Learned rate limits are automatically synced to the rate limiter:

1. When a 429 error is recorded, rate limits are learned and applied
2. On initialization, all learned rate limits are synced
3. When quirks are manually updated, rate limits are synced

The rate limiter enforces:
- Requests per minute limit
- Minimum delay between requests
- Per-domain request queuing

## Pattern Detection

Templates are detected by analyzing HTML for signals:

```typescript
import { detectTemplate } from 'llm-browser/sdk';

const html = await fetch('https://example-store.com').then(r => r.text());
const detection = detectTemplate(html, 'https://example-store.com');

console.log(`Template: ${detection.template}`);
console.log(`Confidence: ${detection.confidence}`);
console.log(`Signals matched: ${detection.signals}`);
```

Signal types:
- `html-marker`: HTML content patterns (cdn.shopify.com, __NEXT_DATA__)
- `api-endpoint`: API URL patterns (/products.json, /graphql)
- `meta-tag`: Meta tag patterns (shopify-checkout)
- `script-src`: Script URL patterns (/_next/static)
- `url-pattern`: URL path patterns (/products/, /collections/)

## Files

| File | Purpose |
|------|---------|
| `src/core/dynamic-handlers/types.ts` | Type definitions |
| `src/core/dynamic-handlers/registry.ts` | Main registry class |
| `src/core/dynamic-handlers/pattern-templates.ts` | Template library |
| `src/core/dynamic-handlers/integration.ts` | ContentIntelligence integration |
| `src/core/dynamic-handlers/persistence.ts` | Auto-save persistence |
| `src/core/dynamic-handlers/index.ts` | Module exports |
| `src/mcp/handlers/dynamic-handlers-handler.ts` | MCP tool handler |

## Testing

```bash
# Run dynamic handler tests
npm test -- tests/core/dynamic-handlers
```

Test files:
- `tests/core/dynamic-handlers/registry.test.ts` - Registry functionality
- `tests/core/dynamic-handlers/pattern-templates.test.ts` - Template detection
- `tests/core/dynamic-handlers/integration.test.ts` - Integration tests
