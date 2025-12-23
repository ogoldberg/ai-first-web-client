# @unbrowser/core

Official SDK for the Unbrowser cloud API - intelligent web browsing for AI agents.

## Installation

```bash
npm install @unbrowser/core
```

## Quick Start

```typescript
import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: process.env.UNBROWSER_API_KEY,
});

const result = await client.browse('https://example.com');
console.log(result.content.markdown);
```

## Features

- **Intelligent Rendering**: Automatically chooses the fastest rendering tier
- **Content Extraction**: Returns clean markdown, text, or HTML
- **API Discovery**: Automatically discovers API endpoints
- **Session Management**: Handles cookies and sessions
- **Batch Processing**: Browse multiple URLs in parallel
- **Progress Streaming**: Real-time progress updates via SSE

## API Reference

### `createUnbrowser(config)`

Create a new Unbrowser client.

```typescript
const client = createUnbrowser({
  apiKey: 'ub_live_xxxxx',     // Required: Your API key
  baseUrl: 'https://api.unbrowser.ai',  // Optional: Custom API URL
  timeout: 60000,               // Optional: Request timeout in ms
  retry: true,                  // Optional: Enable retries
  maxRetries: 3,                // Optional: Max retry attempts
});
```

### `client.browse(url, options?, session?)`

Browse a URL and extract content.

```typescript
const result = await client.browse('https://example.com', {
  contentType: 'markdown',      // 'markdown' | 'text' | 'html'
  waitForSelector: '.content',  // CSS selector to wait for
  maxChars: 50000,              // Max characters to return
  includeTables: true,          // Include tables in response
  maxLatencyMs: 5000,           // Skip slower tiers
  maxCostTier: 'lightweight',   // Max tier: 'intelligence' | 'lightweight' | 'playwright'
});

console.log(result.content.markdown);
console.log(result.metadata.tier);      // Which tier was used
console.log(result.discoveredApis);     // Found API endpoints
```

### `client.browseWithProgress(url, onProgress, options?, session?)`

Browse with real-time progress updates.

```typescript
const result = await client.browseWithProgress(
  'https://example.com',
  (event) => {
    console.log(`Stage: ${event.stage}, Tier: ${event.tier}, Elapsed: ${event.elapsed}ms`);
  },
);
```

### `client.batch(urls, options?, session?)`

Browse multiple URLs in parallel.

```typescript
const result = await client.batch([
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3',
]);

for (const item of result.results) {
  if (item.success) {
    console.log(`${item.url}: ${item.data.title}`);
  } else {
    console.error(`${item.url}: ${item.error.message}`);
  }
}
```

### `client.fetch(url, options?, session?)`

Fast content fetch using tiered rendering.

```typescript
const result = await client.fetch('https://example.com');
```

### `client.getDomainIntelligence(domain)`

Get learned patterns and capabilities for a domain.

```typescript
const intel = await client.getDomainIntelligence('example.com');
console.log(`Patterns: ${intel.knownPatterns}`);
console.log(`Success Rate: ${intel.successRate}%`);
```

### `client.getUsage()`

Get usage statistics for current billing period.

```typescript
const usage = await client.getUsage();
console.log(`Requests today: ${usage.requests.total}`);
console.log(`Remaining: ${usage.limits.remaining}`);
```

### `client.health()`

Check API health (no authentication required).

```typescript
const health = await client.health();
console.log(`Status: ${health.status}`);
```

## Session Management

Pass session data to maintain state across requests:

```typescript
const result = await client.browse('https://example.com', {}, {
  cookies: [
    { name: 'session', value: 'abc123', domain: 'example.com' }
  ],
  localStorage: {
    'user_pref': 'dark_mode'
  }
});

// New cookies set during the request
console.log(result.newCookies);
```

## Error Handling

```typescript
import { UnbrowserError } from '@unbrowser/core';

try {
  const result = await client.browse('https://example.com');
} catch (error) {
  if (error instanceof UnbrowserError) {
    console.error(`Error ${error.code}: ${error.message}`);
  }
}
```

Common error codes:
- `MISSING_API_KEY` - API key not provided
- `INVALID_API_KEY` - Invalid API key format
- `UNAUTHORIZED` - Invalid or expired API key
- `FORBIDDEN` - Access denied
- `RATE_LIMITED` - Too many requests
- `INVALID_URL` - Invalid URL provided
- `BROWSE_ERROR` - Browse operation failed

## TypeScript Support

Full TypeScript definitions included:

```typescript
import {
  createUnbrowser,
  UnbrowserClient,
  UnbrowserError,
  type UnbrowserConfig,
  type BrowseOptions,
  type BrowseResult,
  type BatchResult,
  type SessionData,
  type Cookie,
  type DomainIntelligence,
  type ProgressEvent,
  type ProgressCallback,
} from '@unbrowser/core';
```

## Links

- [Documentation](https://unbrowser.ai/docs)
- [API Reference](https://api.unbrowser.ai)
- [GitHub](https://github.com/ogoldberg/ai-first-web-client)

## License

MIT
