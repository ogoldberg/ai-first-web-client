# Getting Started with Unbrowser

This guide will help you get up and running with Unbrowser, an intelligent web browsing API for AI agents.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Usage with Claude Desktop](#usage-with-claude-desktop)
5. [Programmatic SDK Usage](#programmatic-sdk-usage)
6. [Common Use Cases](#common-use-cases)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Unbrowser is designed for AI agents, not humans. It learns from every browsing interaction and progressively optimizes to bypass browser rendering entirely.

**How it works:**

```text
First visit:  AI -> smart_browse -> Full render (~2-5s) -> Content + learned patterns
Next visit:   AI -> smart_browse -> API call (~200ms)   -> Same content, much faster
```

**Key concepts:**

- **Tiered Rendering**: Automatically tries the fastest method first (Intelligence -> Lightweight -> Playwright)
- **Learning**: Discovers APIs, learns selectors, builds reusable patterns
- **Skills**: Learns browsing procedures and applies them to similar sites
- **Sessions**: Maintains authenticated sessions across browsing

---

## Installation

### From npm

```bash
npm install llm-browser
```

### From Source

```bash
git clone https://github.com/ogoldberg/ai-first-web-client
cd ai-first-web-client
npm install
npm run build  # Required - compiles TypeScript to dist/
```

### Optional Dependencies

```bash
# For full browser rendering (recommended)
npm install playwright
npx playwright install chromium

# For neural embeddings (better skill transfer)
npm install @xenova/transformers
```

Without Playwright, Unbrowser uses Intelligence and Lightweight tiers only.

---

## Quick Start

### 1. Claude Desktop (Recommended for LLMs)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "unbrowser": {
      "command": "npx",
      "args": ["llm-browser"]
    }
  }
}
```

Restart Claude Desktop. Then ask Claude:

> "Use Unbrowser to browse https://news.ycombinator.com and summarize the top 3 stories"

### 2. Programmatic Usage

```typescript
import { createLLMBrowser } from 'llm-browser/sdk';

const browser = await createLLMBrowser();

try {
  const result = await browser.browse('https://example.com');
  console.log(result.content.markdown);
  console.log('APIs discovered:', result.discoveredApis);
} finally {
  await browser.cleanup();
}
```

---

## Usage with Claude Desktop

### Available MCP Tools

Once configured, Claude has access to these tools:

| Tool | Description |
|------|-------------|
| `smart_browse` | Browse a URL with automatic learning |
| `batch_browse` | Browse multiple URLs in parallel |
| `execute_api_call` | Make direct API calls |
| `session_management` | Save/list authenticated sessions |
| `api_auth` | Configure API authentication |

### Example Prompts

**Basic browsing:**
> "Browse https://github.com/anthropics/claude-code and tell me what it does"

**Content extraction:**
> "Browse the Wikipedia page for 'Python programming language' and extract all the section headings"

**Batch operations:**
> "Browse these 3 URLs and compare their main content:
> - https://expressjs.com
> - https://fastify.dev
> - https://koajs.com"

**API discovery:**
> "Browse https://api.github.com and show me what API endpoints are available"

**Authenticated browsing:**
> "First configure Bearer token authentication for api.example.com, then fetch my user profile"

---

## Programmatic SDK Usage

### Basic Browsing

```typescript
import { createLLMBrowser } from 'llm-browser/sdk';

async function main() {
  const browser = await createLLMBrowser();

  try {
    // Simple browse
    const result = await browser.browse('https://example.com');

    console.log('Title:', result.content.title);
    console.log('Content:', result.content.markdown.substring(0, 500));
    console.log('Tier used:', result.tierUsed);
    console.log('Duration:', result.durationMs, 'ms');

    // Check for discovered APIs
    if (result.discoveredApis?.length) {
      console.log('APIs found:', result.discoveredApis);
    }
  } finally {
    await browser.cleanup();
  }
}

main().catch(console.error);
```

### Tier Control

Control which rendering tier is used:

```typescript
// Force intelligence tier only (fastest, but limited)
const result = await browser.browse('https://example.com', {
  maxCostTier: 'intelligence',
});

// Allow up to lightweight (medium speed)
const result2 = await browser.browse('https://example.com', {
  maxCostTier: 'lightweight',
});

// Full browser when needed (slowest, most compatible)
const result3 = await browser.browse('https://spa-app.com', {
  waitForSelector: '.main-content',
  scrollToLoad: true,
});
```

### Batch Browsing

Browse multiple URLs efficiently:

```typescript
const results = await browser.batchBrowse([
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3',
], {
  concurrency: 3,  // Parallel requests
  maxChars: 5000,  // Limit content per URL
});

for (const result of results.results) {
  if (result.success) {
    console.log(`${result.url}: ${result.result.content.title}`);
  } else {
    console.log(`${result.url}: Error - ${result.error}`);
  }
}
```

### Session Management

Save and restore authenticated sessions:

```typescript
// After logging in manually or via OAuth
await browser.saveSession('github.com', 'my-account');

// Later, use the saved session
const result = await browser.browse('https://github.com/settings/profile', {
  sessionProfile: 'my-account',
});

// Check session health
const health = await browser.checkSessionHealth('github.com', 'my-account');
console.log('Session status:', health.status); // healthy, stale, expired
```

### API Authentication

Configure API credentials:

```typescript
// Bearer token
await browser.configureAuth('api.example.com', 'bearer', {
  token: 'your-api-token',
});

// API key
await browser.configureAuth('api.example.com', 'api_key', {
  key: 'your-api-key',
  location: 'header',  // or 'query'
  name: 'X-API-Key',
});

// Now API calls are authenticated
const result = await browser.executeApiCall({
  url: 'https://api.example.com/v1/data',
  method: 'GET',
});
```

### Content Extraction

Extract specific content types:

```typescript
// Extract tables
const result = await browser.browse('https://example.com/data', {
  includeTables: true,
});
console.log('Tables:', result.tables);

// Limit content size
const result2 = await browser.browse('https://example.com/article', {
  maxChars: 10000,
  includeTables: false,
});
```

### Error Handling

```typescript
import {
  createLLMBrowser,
  UrlSafetyError,
  StructuredError,
  validateUrlOrThrow
} from 'llm-browser/sdk';

try {
  // Validate URL before browsing (SSRF protection)
  validateUrlOrThrow(userProvidedUrl);

  const result = await browser.browse(userProvidedUrl);
} catch (error) {
  if (error instanceof UrlSafetyError) {
    console.error('URL blocked for safety:', error.message);
  } else if (error instanceof StructuredError) {
    console.error('Structured error:', {
      code: error.code,
      severity: error.severity,
      retryable: error.retryable,
      recommendations: error.recommendations,
    });
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Common Use Cases

### 1. Web Scraping

```typescript
// Scrape product data
const result = await browser.browse('https://shop.example.com/products', {
  contentType: 'main_content',
  includeTables: true,
  maxChars: 50000,
});

// The browser learns patterns for future visits
// Next time, it may use discovered APIs instead of rendering
```

### 2. Research and Aggregation

```typescript
// Research a topic across multiple sources
const sources = [
  'https://en.wikipedia.org/wiki/Machine_learning',
  'https://arxiv.org/abs/2301.00001',
  'https://openai.com/research',
];

const results = await browser.batchBrowse(sources, {
  concurrency: 2,
  contentType: 'main_content',
});

// Combine and analyze results
const combinedContent = results.results
  .filter(r => r.success)
  .map(r => r.result.content.markdown)
  .join('\n\n---\n\n');
```

### 3. API Discovery

```typescript
// Discover API endpoints from a website
const result = await browser.browse('https://api.example.com', {
  includeNetwork: true,
  includeInsights: true,
});

if (result.discoveredApis) {
  for (const api of result.discoveredApis) {
    console.log(`Found API: ${api.method} ${api.url}`);
    console.log(`Pattern: ${api.templateType}`);
  }
}

// Future requests can use discovered APIs directly
const apiResult = await browser.executeApiCall({
  url: result.discoveredApis[0].url,
  method: result.discoveredApis[0].method,
});
```

### 4. Content Monitoring

```typescript
// Track content changes
const result = await browser.browse('https://news.example.com', {
  checkForChanges: true,
});

if (result.contentChanged) {
  console.log('Content has changed since last visit!');
  console.log('Changes:', result.changeDetails);
}
```

### 5. Authenticated Access

```typescript
// Configure OAuth2 for an API
await browser.configureAuth('api.github.com', 'oauth2', {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: ['repo', 'user'],
});

// Browse authenticated pages
const result = await browser.browse('https://api.github.com/user/repos');
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_BROWSER_DEBUG_MODE` | Enable debug tools | `false` |
| `LLM_BROWSER_ADMIN_MODE` | Enable admin tools | `false` |
| `LLM_BROWSER_STEALTH` | Enable stealth mode | `false` |
| `LLM_BROWSER_SESSION_KEY` | Encryption key for sessions | None |
| `LLM_BROWSER_TENANT_ID` | Multi-tenant identifier | None |

### SDK Options

```typescript
const browser = await createLLMBrowser({
  // Storage
  sessionsDir: './sessions',        // Where to store sessions
  dataDir: './data',                // Where to store learned data

  // Features
  enableLearning: true,             // Learn from browsing
  enableProceduralMemory: true,     // Enable skill learning
  enableStealth: false,             // Bot evasion mode

  // Browser settings
  browser: {
    headless: true,
    slowMo: 0,
  },
});
```

### Browse Options

```typescript
await browser.browse(url, {
  // Content control
  contentType: 'main_content',      // What to extract
  maxChars: 10000,                  // Max content length
  includeTables: true,              // Include tables
  includeNetwork: false,            // Include network data
  includeInsights: true,            // Include learning insights

  // Rendering control
  maxCostTier: 'playwright',        // Max tier to use
  maxLatencyMs: 5000,               // Max acceptable latency
  freshnessRequirement: 'any',      // 'realtime', 'cached', 'any'

  // Browser interaction
  waitForSelector: '.content',      // Wait for element
  scrollToLoad: false,              // Scroll for lazy content

  // Session
  sessionProfile: 'default',        // Which session to use

  // Learning
  checkForChanges: false,           // Track content changes
  includeDecisionTrace: false,      // Include tier decisions
});
```

---

## Troubleshooting

### "Cannot find module 'llm-browser/sdk'"

Make sure you've built the project:

```bash
npm run build
```

### "Playwright not found"

Install Playwright for full browser support:

```bash
npm install playwright
npx playwright install chromium
```

### "SSRF protection blocked URL"

The URL safety module blocks potentially dangerous URLs (localhost, internal IPs, etc.). This is intentional for security.

### "Rate limited"

The site has detected too many requests. Try:
- Enabling stealth mode: `LLM_BROWSER_STEALTH=true`
- Adding delays between requests
- Using the `retryWith` parameter

### "Bot detection / Cloudflare challenge"

Some sites have aggressive bot protection. Options:
- Enable stealth mode
- Use `maxCostTier: 'playwright'` for full browser
- Check the `researchSuggestion` in the response for bypass tips

### "Session expired"

Check session health and re-authenticate:

```typescript
const health = await browser.checkSessionHealth(domain);
if (health.status === 'expired') {
  // Re-login or refresh tokens
}
```

---

## Next Steps

- **[MCP Tools API Reference](MCP_TOOLS_API.md)** - Complete tool documentation
- **[Architecture Overview](ARCHITECTURE.md)** - System design diagrams
- **[LLM Onboarding Spec](LLM_ONBOARDING_SPEC.md)** - Client integration guide
- **[Project Status](PROJECT_STATUS.md)** - Current features and roadmap

---

## Examples Repository

For more examples, see the `/packages/core/examples/` directory:

| Example | Description |
|---------|-------------|
| `01-basic-browse.mjs` | Simple URL browsing |
| `02-tier-control.mjs` | Control rendering tiers |
| `03-api-discovery.mjs` | Automatic API discovery |
| `04-session-management.mjs` | Authenticated sessions |
| `05-batch-browsing.mjs` | Parallel URL processing |
| `06-content-extraction.mjs` | Tables, links, data |
| `07-stealth-mode.mjs` | Bot evasion |
| `08-error-handling.mjs` | Error patterns |
| `09-content-change-tracking.mjs` | Monitor changes |
| `10-procedural-memory.mjs` | Skill learning |
| `11-analytics-dashboard.mjs` | Usage tracking |
| `12-typescript-usage.ts` | Full TypeScript example |

> **Note**: These examples may need import path fixes. See the examples README for details.
