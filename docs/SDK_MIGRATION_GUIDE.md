# SDK Migration Guide

This guide helps you migrate from MCP-only usage to direct SDK access with `@unbrowser/core`.

## Overview

**Before:** Using Unbrowser through MCP tools in Claude Desktop or other AI clients.

**After:** Direct programmatic access via the `@unbrowser/core` SDK for:
- Web applications
- Node.js scripts
- Automation pipelines
- Custom integrations

## Architecture

The `@unbrowser/core` SDK is a thin HTTP client wrapper for the Unbrowser cloud API at `api.unbrowser.ai`. All intelligence (tiered rendering, learning, pattern discovery) runs in the cloud.

```
Your Application
       |
       v
@unbrowser/core (HTTP client)
       |
       v
api.unbrowser.ai (Cloud service)
       |
       v
SmartBrowser, Learning, etc.
```

## Installation

```bash
npm install @unbrowser/core
```

No additional dependencies required - the SDK uses native `fetch`.

## Quick Start

```typescript
import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: process.env.UNBROWSER_API_KEY!, // ub_live_xxxxx
});

const result = await client.browse('https://example.com');
console.log(result.content.markdown);
```

## Migration Examples

### From `smart_browse` MCP Tool

**MCP (before):**
```
User: Browse https://news.ycombinator.com and get the headlines
Claude: [calls smart_browse tool with url parameter]
```

**SDK (after):**
```typescript
import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({ apiKey: process.env.UNBROWSER_API_KEY! });

const result = await client.browse('https://news.ycombinator.com', {
  maxChars: 10000,
  includeTables: true,
});

console.log(result.title);
console.log(result.content.markdown);
```

### From `batch_browse` MCP Tool

**MCP (before):**
```
User: Browse these 5 URLs and summarize each
Claude: [calls batch_browse tool with urls array]
```

**SDK (after):**
```typescript
const result = await client.batch([
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3',
]);

for (const item of result.results) {
  if (item.success && item.data) {
    console.log(`${item.url}: ${item.data.title}`);
  } else {
    console.error(`${item.url}: ${item.error?.message}`);
  }
}
```

### From `execute_api_call` MCP Tool

The SDK discovers APIs automatically during browsing. Use the `discoveredApis` field in browse results to find endpoints, then call them directly:

**MCP (before):**
```
User: Call the Reddit API for r/programming
Claude: [calls execute_api_call tool]
```

**SDK (after):**
```typescript
// First browse discovers the API
const result = await client.browse('https://reddit.com/r/programming');

// Check discovered APIs
if (result.discoveredApis) {
  for (const api of result.discoveredApis) {
    console.log(`Found: ${api.method} ${api.url}`);
  }
}

// For direct API calls, use fetch with the discovered endpoint
const apiResponse = await fetch('https://www.reddit.com/r/programming.json');
```

### From `session_management` MCP Tool

**MCP (before):**
```
User: Save my login session for github.com
Claude: [calls session_management tool with action='save']
```

**SDK (after):**
```typescript
// Pass session data with your browse request
const result = await client.browse('https://github.com/dashboard', {}, {
  cookies: [
    { name: '_gh_sess', value: 'your_session_cookie', domain: 'github.com' },
  ],
  localStorage: {
    'some_preference': 'value',
  },
});

// Capture new cookies from the response
if (result.newCookies) {
  console.log('New cookies:', result.newCookies);
  // Store these for future requests
}
```

### From `api_auth` MCP Tool

API authentication is managed at the cloud level via your API key. For site-specific authentication, pass credentials in session data.

**MCP (before):**
```
User: Configure API auth for the GitHub API
Claude: [calls api_auth tool with action='configure']
```

**SDK (after):**
```typescript
// For API endpoints that need auth, include headers via session
const result = await client.browse('https://api.github.com/user', {}, {
  cookies: [
    // Your auth cookies here
  ],
});

// Or call the API directly with auth headers
const response = await fetch('https://api.github.com/user', {
  headers: {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
  },
});
```

## API Reference

### `createUnbrowser(config)`

Creates a new Unbrowser client.

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

**Parameters:**
- `url` - URL to browse
- `options` - Browse options (see below)
- `session` - Session data (cookies, localStorage)

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `contentType` | `'markdown' \| 'text' \| 'html'` | `'markdown'` | Content format |
| `waitForSelector` | `string` | - | CSS selector to wait for |
| `scrollToLoad` | `boolean` | `false` | Scroll for lazy content |
| `maxChars` | `number` | - | Max characters to return |
| `includeTables` | `boolean` | `false` | Include tables |
| `maxLatencyMs` | `number` | - | Skip slower tiers |
| `maxCostTier` | `string` | - | Max tier to use |

**Returns:** `BrowseResult`

### `client.browseWithProgress(url, onProgress, options?, session?)`

Browse with real-time progress updates via SSE.

```typescript
const result = await client.browseWithProgress(
  'https://example.com',
  (event) => {
    console.log(`Stage: ${event.stage}, Tier: ${event.tier}`);
  },
);
```

### `client.batch(urls, options?, session?)`

Browse multiple URLs in parallel.

```typescript
const result = await client.batch([
  'https://example.com/page1',
  'https://example.com/page2',
]);

console.log(`Total time: ${result.totalTime}ms`);
```

### `client.fetch(url, options?, session?)`

Fast content fetch using tiered rendering.

### `client.getDomainIntelligence(domain)`

Get learned patterns and intelligence for a domain.

```typescript
const intel = await client.getDomainIntelligence('example.com');
console.log(`Patterns: ${intel.knownPatterns}`);
console.log(`Success Rate: ${intel.successRate}%`);
```

### `client.getUsage()`

Get usage statistics for the current billing period.

```typescript
const usage = await client.getUsage();
console.log(`Requests: ${usage.requests.total}`);
console.log(`Remaining: ${usage.limits.remaining}`);
```

### `client.health()`

Check API health (no authentication required).

```typescript
const health = await client.health();
console.log(`Status: ${health.status}`);
```

## Error Handling

```typescript
import { createUnbrowser, UnbrowserError } from '@unbrowser/core';

try {
  const result = await client.browse('https://example.com');
} catch (error) {
  if (error instanceof UnbrowserError) {
    console.error(`Error ${error.code}: ${error.message}`);

    switch (error.code) {
      case 'UNAUTHORIZED':
        // Invalid API key
        break;
      case 'RATE_LIMITED':
        // Too many requests
        break;
      case 'BROWSE_ERROR':
        // Browse operation failed
        break;
    }
  }
}
```

**Error Codes:**
- `MISSING_API_KEY` - API key not provided
- `INVALID_API_KEY` - Invalid API key format
- `UNAUTHORIZED` - Invalid or expired API key
- `FORBIDDEN` - Access denied
- `RATE_LIMITED` - Too many requests
- `INVALID_URL` - Invalid URL provided
- `BROWSE_ERROR` - Browse operation failed
- `REQUEST_ABORTED` - Request was aborted
- `SSE_ERROR` - SSE streaming error
- `HEALTH_CHECK_FAILED` - Health check failed

## TypeScript Support

Full TypeScript definitions are included:

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

## Common Patterns

### Polling for Changes

```typescript
async function checkForChanges(url: string, interval: number) {
  let lastContent = '';

  setInterval(async () => {
    const result = await client.browse(url);
    const content = result.content.text;

    if (content !== lastContent && lastContent) {
      console.log('Content changed!');
    }
    lastContent = content;
  }, interval);
}
```

### Handling Rate Limits

```typescript
async function browseWithBackoff(url: string, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.browse(url);
    } catch (error) {
      if (error instanceof UnbrowserError && error.code === 'RATE_LIMITED') {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max attempts exceeded');
}
```

### Progress Reporting

```typescript
const result = await client.browseWithProgress(
  'https://slow-loading-site.com',
  (event) => {
    // Update UI with progress
    progressBar.update({
      stage: event.stage,
      tier: event.tier,
      elapsed: event.elapsed,
    });
  },
);
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `UNBROWSER_API_KEY` | Your API key (required) |
| `UNBROWSER_API_URL` | Custom API URL (optional) |

## Comparison: MCP vs SDK

| Aspect | MCP | SDK |
|--------|-----|-----|
| Use case | AI-assisted browsing | Programmatic access |
| Interface | Tool calls via LLM | Direct function calls |
| Context | Conversation context | Application code |
| Overhead | LLM token cost | None |
| Best for | Research, exploration | Automation, scripts |

## When to Use Which

**Use MCP when:**
- You're working with Claude or another AI assistant
- You need natural language interaction
- Tasks require reasoning and interpretation
- You want conversational browsing

**Use SDK when:**
- Building automation scripts
- Integrating into applications
- Running scheduled jobs
- Need programmatic control
- Avoiding LLM token costs

## Getting Help

- [Documentation](https://unbrowser.ai/docs)
- [API Reference](https://api.unbrowser.ai)
- [GitHub Issues](https://github.com/ogoldberg/ai-first-web-client/issues)

## Changelog

### 0.1.0-alpha.1

- Initial SDK release
- HTTP client wrapper for cloud API
- Full TypeScript support
