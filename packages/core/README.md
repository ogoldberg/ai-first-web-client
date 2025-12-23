# @llm-browser/core

Core SDK for LLM Browser - intelligent web browsing for machines.

## Overview

This package provides programmatic access to all LLM Browser capabilities without requiring the MCP protocol. Use this for:

- Direct integration into Node.js applications
- Building custom web automation workflows
- Programmatic access to learning and API discovery

## Installation

```bash
npm install @llm-browser/core
```

## Quick Start

```typescript
import { createLLMBrowser } from '@llm-browser/core';

const browser = await createLLMBrowser();

// Browse a URL with automatic learning
const result = await browser.browse('https://example.com');
console.log(result.content.markdown);

// Get domain intelligence
const intelligence = await browser.getDomainIntelligence('example.com');
console.log(intelligence.knownPatterns);

// Clean up
await browser.cleanup();
```

## TypeScript Examples

### Basic Usage with Types

```typescript
import {
  createLLMBrowser,
  type LLMBrowserConfig,
  type SmartBrowseOptions,
  type SmartBrowseResult,
} from '@llm-browser/core';

// Typed configuration
const config: LLMBrowserConfig = {
  sessionsDir: './my-sessions',
  enableLearning: true,
  enableProceduralMemory: true,
  browser: {
    headless: true,
    slowMo: 0,
  },
};

const browser = await createLLMBrowser(config);

// Typed browse options
const options: SmartBrowseOptions = {
  forceTier: 'lightweight',
  timeout: 15000,
  includeDecisionTrace: true,
};

const result: SmartBrowseResult = await browser.browse('https://example.com', options);

// Access typed fields
console.log(result.content.markdown);
console.log(result.learning.renderTier);
console.log(result.decisionTrace?.tierAttempts);
```

### Error Handling

```typescript
import {
  createLLMBrowser,
  validateUrlOrThrow,
  UrlSafetyError,
  StructuredError,
  classifyFailure,
} from '@llm-browser/core';

const browser = await createLLMBrowser();

try {
  // URL validation (SSRF protection)
  validateUrlOrThrow(url);

  const result = await browser.browse(url);
  console.log(result.content.markdown);
} catch (error) {
  if (error instanceof UrlSafetyError) {
    console.error(`Blocked URL: ${error.message} (${error.category})`);
  } else if (error instanceof StructuredError) {
    console.error(`Browse failed: ${error.code} - ${error.message}`);
    console.error(`Severity: ${error.severity}, Retryable: ${error.retryable}`);
  } else {
    // Classify unknown errors
    const classified = classifyFailure(undefined, error);
    console.error(`Error category: ${classified.category}`);
  }
} finally {
  await browser.cleanup();
}
```

### Working with Learning Systems

```typescript
import { createLLMBrowser } from '@llm-browser/core';

const browser = await createLLMBrowser({
  enableLearning: true,        // API pattern learning
  enableProceduralMemory: true, // Skill/trajectory learning
});

// Browse with learning enabled
const result = await browser.browse('https://example.com', {
  enableLearning: true,
  recordTrajectory: true,
});

// Check what was learned
console.log('Selectors used:', result.learning.selectorsUsed);
console.log('Tier used:', result.learning.renderTier);
console.log('Skills matched:', result.learning.skillsMatched);

// Get learning statistics
const stats = browser.getLearningStats();
console.log(`Learned patterns from ${stats.totalDomains} domains`);
console.log(`${stats.bypassablePatterns} patterns can bypass browser`);

// Get skill statistics
const skillStats = browser.getProceduralMemoryStats();
console.log(`${skillStats.totalSkills} learned skills`);
```

### Using the Content Fetcher (Lightweight)

```typescript
import { createContentFetcher } from '@llm-browser/core';

// Lightweight fetcher without full browser capabilities
const fetcher = createContentFetcher();

// Fast tiered fetching
const result = await fetcher.fetch('https://example.com', {
  forceTier: 'intelligence', // Fastest tier
  minContentLength: 100,
});

console.log(`Fetched via ${result.tier} tier in ${result.timing.total}ms`);
console.log(result.content.text);

// Extract content from raw HTML
const extracted = fetcher.extract('<html>...</html>', 'https://example.com');
console.log(extracted.markdown);
```

## Features

- **Smart Browsing**: Automatic tier selection (static → lightweight → playwright)
- **API Discovery**: Learn API patterns from network traffic
- **Skill Learning**: Build reusable browsing skills from successful patterns
- **Session Management**: Persistent authenticated sessions
- **Content Intelligence**: Framework detection and structured data extraction

## API Reference

### `createLLMBrowser(config?)`

Factory function to create an initialized browser client.

```typescript
import { createLLMBrowser, type LLMBrowserConfig } from '@llm-browser/core';

const browser = await createLLMBrowser({
  sessionsDir: './my-sessions',
  enableLearning: true,
  enableProceduralMemory: true,
});
```

### Configuration Reference

#### LLMBrowserConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sessionsDir` | `string` | `'./sessions'` | Directory for storing session data |
| `learningEnginePath` | `string` | `'./enhanced-knowledge-base.json'` | Path to learning engine JSON file |
| `browser` | `BrowserConfig` | See below | Browser configuration options |
| `enableProceduralMemory` | `boolean` | `true` | Enable skill learning from browsing patterns |
| `enableLearning` | `boolean` | `true` | Enable API pattern learning |

#### BrowserConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headless` | `boolean` | `true` | Run browser in headless mode |
| `screenshotDir` | `string` | `'/tmp/browser-screenshots'` | Directory for saving screenshots |
| `slowMo` | `number` | `0` | Slow down actions by this many ms (debugging) |
| `devtools` | `boolean` | `false` | Open Chrome DevTools on launch |
| `provider` | `BrowserProviderConfig` | auto-detected | Browser provider (local, browserless, brightdata) |

### Browse Options Reference

The `browse()` method accepts `SmartBrowseOptions`. Options are grouped by concern:

#### Essential Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `forceTier` | `RenderTier` | auto | Force a specific tier: `'intelligence'`, `'lightweight'`, `'playwright'` |
| `waitForSelector` | `string` | - | CSS selector to wait for before extracting content |
| `timeout` | `number` | 30000 | Navigation timeout in milliseconds |
| `minContentLength` | `number` | - | Minimum content length for tier validation |
| `contentType` | `string` | - | Expected content type: `'article'`, `'list'`, `'table'`, etc. |

#### Learning Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableLearning` | `boolean` | `true` | Learn patterns from this request |
| `useSkills` | `boolean` | `true` | Apply learned browsing skills |
| `recordTrajectory` | `boolean` | `true` | Record this session for skill learning |
| `includeDecisionTrace` | `boolean` | `false` | Include detailed decision trace in response |
| `recordDebugTrace` | `boolean` | `false` | Record debug trace for later analysis |

#### Validation & Content Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extractContent` | `boolean` | `true` | Extract content from page |
| `validateContent` | `boolean` | - | Validate response against learned patterns |
| `checkForChanges` | `boolean` | - | Check if content has changed since last visit |
| `followPagination` | `boolean` | `false` | Automatically follow pagination links |
| `maxPages` | `number` | - | Maximum pages to follow when paginating |

#### Budget Controls

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxLatencyMs` | `number` | - | Stop tier fallback if latency exceeds this |
| `maxCostTier` | `RenderTier` | `'playwright'` | Most expensive tier allowed |
| `freshnessRequirement` | `FreshnessRequirement` | `'any'` | `'realtime'`, `'cached'`, or `'any'` |

#### Browser Behavior Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `waitFor` | `string` | `'load'` | Wait strategy: `'load'`, `'domcontentloaded'`, `'networkidle'` |
| `captureNetwork` | `boolean` | `true` | Capture network requests |
| `captureConsole` | `boolean` | `true` | Capture console messages |
| `sessionProfile` | `string` | - | Session profile name for authenticated browsing |
| `dismissCookieBanner` | `boolean` | - | Auto-dismiss cookie consent banners |
| `scrollToLoad` | `boolean` | - | Scroll to trigger lazy-loaded content |
| `useRateLimiting` | `boolean` | `true` | Apply per-domain rate limiting |
| `retryOnError` | `boolean` | `true` | Retry on transient errors |

### LLMBrowserClient

Main SDK client class with methods:

- `browse(url, options)` - Browse with automatic optimization
- `fetch(url, options)` - Fast content fetching using tiered rendering
- `getDomainIntelligence(domain)` - Get learned patterns for a domain
- `findApplicableSkills(url)` - Find matching browsing skills
- `getLearningStats()` - Get learning engine statistics
- `getProceduralMemoryStats()` - Get skill learning statistics
- `getTieredFetcherStats()` - Get tiered fetcher statistics
- `cleanup()` - Release browser resources

## Status

This package is part of the SDK extraction effort (SDK-001 to SDK-012).
Current status: **SmartBrowser extracted** (SDK-003).

See [SDK_ARCHITECTURE.md](../../docs/SDK_ARCHITECTURE.md) for the full plan.

## License

MIT
