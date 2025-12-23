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

## Stealth Mode (Anti-Bot Evasion)

The SDK includes built-in anti-bot evasion capabilities that work across all rendering tiers.

### Fingerprint Generation

Generate consistent browser fingerprints for stealth browsing:

```typescript
import {
  generateFingerprint,
  getStealthFetchHeaders,
  BehavioralDelays,
} from '@llm-browser/core';

// Generate a random fingerprint
const fingerprint = generateFingerprint();

// Or use a seed for consistency (e.g., same fingerprint for same domain)
const seededFingerprint = generateFingerprint('example.com');

console.log(fingerprint.userAgent);       // Chrome-like UA
console.log(fingerprint.viewport);        // { width: 1920, height: 1080 }
console.log(fingerprint.locale);          // 'en-US'
console.log(fingerprint.timezoneId);      // 'America/New_York'
console.log(fingerprint.clientHints);     // sec-ch-ua headers
```

### Stealth Headers for HTTP Requests

Apply stealth headers to any HTTP request (works without Playwright):

```typescript
import { getStealthFetchHeaders } from '@llm-browser/core';

// Get headers matching a realistic browser fingerprint
const headers = getStealthFetchHeaders({
  fingerprintSeed: 'example.com', // Consistent per-domain
});

// Use with fetch
const response = await fetch('https://example.com', { headers });

// Or merge with your own headers
const customHeaders = getStealthFetchHeaders({
  extraHeaders: {
    'Authorization': 'Bearer token',
    'X-Custom': 'value',
  },
});
```

### Behavioral Delays

Add human-like timing patterns:

```typescript
import { BehavioralDelays } from '@llm-browser/core';

// Random delay between actions
await BehavioralDelays.sleep(100, 500); // 100-500ms

// Jittered delay (for rate limiting)
const delay = BehavioralDelays.jitteredDelay(1000, 0.3); // 1s +/- 30%

// Exponential backoff with jitter
const backoff = BehavioralDelays.exponentialBackoff(2); // Attempt 2 = ~4s
```

### Playwright Stealth Mode

For full browser rendering, use stealth mode with playwright-extra:

```bash
# Install optional dependencies
npm install playwright-extra puppeteer-extra-plugin-stealth
```

```typescript
import {
  launchStealthBrowser,
  createStealthContext,
  isStealthAvailable,
} from '@llm-browser/core';

// Check if stealth is available
if (isStealthAvailable()) {
  // Launch browser with stealth plugin
  const { browser, fingerprint, stealthEnabled } = await launchStealthBrowser({
    fingerprintSeed: 'example.com',
  });

  // Create context with evasion scripts
  const context = await createStealthContext(browser, fingerprint);
  const page = await context.newPage();

  // Browse normally - evasion is automatic
  await page.goto('https://example.com');
}
```

### What Stealth Mode Provides

**HTTP-level (all tiers):**
- User agent rotation from realistic Chrome versions
- Matching Accept-Language and locale
- sec-ch-ua client hints headers
- Consistent viewport/platform combinations

**Browser-level (Playwright only):**
- navigator.webdriver removal
- chrome.runtime patching
- Plugin/mimeTypes array spoofing
- Permissions API patching
- Language consistency

### Limitations

Stealth mode helps with basic bot detection but cannot bypass:
- CAPTCHAs (reCAPTCHA, Turnstile) - require human solving
- Datacenter IP blocklists - require residential proxies
- Advanced fingerprinting - some sites use sophisticated detection

## Status

This package is part of the SDK extraction effort (SDK-001 to SDK-012).
Current status: **SmartBrowser extracted** (SDK-003).

See [SDK_ARCHITECTURE.md](../../docs/SDK_ARCHITECTURE.md) for the full plan.

## License

MIT
