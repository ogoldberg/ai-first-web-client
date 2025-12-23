# @llm-browser/core

Core SDK for LLM Browser - intelligent web browsing for machines.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Getting Started Guide](#getting-started-guide)
  - [Your First Browse](#your-first-browse)
  - [Understanding Results](#understanding-results)
  - [Initialization Status](#initialization-status)
- [Core Concepts](#core-concepts)
  - [Tiered Rendering](#tiered-rendering)
  - [Learning System](#learning-system)
  - [Procedural Memory (Skills)](#procedural-memory-skills)
  - [Session Management](#session-management)
- [API Reference](#api-reference)
  - [Factory Functions](#factory-functions)
  - [LLMBrowserClient](#llmbrowserclient)
  - [Configuration Options](#configuration-options)
  - [Browse Options](#browse-options)
  - [Browse Result](#browse-result)
- [Use Case Tutorials](#use-case-tutorials)
  - [Web Scraping](#web-scraping)
  - [API Discovery](#api-discovery)
  - [Authenticated Browsing](#authenticated-browsing)
  - [Batch Processing](#batch-processing)
  - [Content Monitoring](#content-monitoring)
- [Advanced Topics](#advanced-topics)
  - [Stealth Mode](#stealth-mode)
  - [Error Handling](#error-handling)
  - [Performance Optimization](#performance-optimization)
  - [Multi-Tenant Usage](#multi-tenant-usage)
  - [Custom Learning](#custom-learning)
- [TypeScript Support](#typescript-support)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

The LLM Browser SDK provides programmatic access to intelligent web browsing capabilities designed specifically for AI agents and automation. Unlike traditional web scraping tools that just extract content, this SDK:

- **Learns from browsing patterns** - Discovers API endpoints, learns selectors, builds reusable skills
- **Gets faster over time** - Uses learned patterns to bypass browser rendering when possible
- **Handles complexity automatically** - Cookie banners, pagination, authentication, rate limiting
- **Works without Playwright** - Optional browser dependency; falls back to lightweight rendering

### Use Cases

- **Research Agents**: Extract structured data from any website
- **Automation**: Build reliable web workflows that adapt to site changes
- **API Discovery**: Automatically find and use APIs instead of scraping HTML
- **Monitoring**: Track content changes across multiple sites

---

## Installation

```bash
npm install @llm-browser/core
```

### Optional Dependencies

For full browser rendering (recommended for complex sites):

```bash
npm install playwright
npx playwright install chromium
```

For semantic pattern matching (improves cross-domain learning):

```bash
npm install @xenova/transformers @lancedb/lancedb better-sqlite3
```

For stealth mode (anti-bot evasion):

```bash
npm install playwright-extra puppeteer-extra-plugin-stealth
```

---

## Quick Start

```typescript
import { createLLMBrowser } from '@llm-browser/core';

// Create and initialize browser
const browser = await createLLMBrowser();

// Browse a URL
const result = await browser.browse('https://example.com');
console.log(result.content.markdown);

// Clean up when done
await browser.cleanup();
```

---

## Getting Started Guide

### Your First Browse

The SDK provides a high-level `LLMBrowserClient` class that handles all the complexity:

```typescript
import { createLLMBrowser } from '@llm-browser/core';

async function main() {
  // Create browser with configuration
  const browser = await createLLMBrowser({
    sessionsDir: './my-sessions',       // Where to store session data
    enableLearning: true,               // Learn patterns from browsing
    enableProceduralMemory: true,       // Learn reusable browsing skills
  });

  try {
    // Browse with options
    const result = await browser.browse('https://news.ycombinator.com', {
      timeout: 30000,                   // 30 second timeout
      enableLearning: true,             // Learn from this request
    });

    // Access extracted content
    console.log('Title:', result.title);
    console.log('Content:', result.content.markdown.slice(0, 500));

    // Check discovered APIs (for future direct access)
    if (result.discoveredApis.length > 0) {
      console.log('APIs found:', result.discoveredApis.map(a => a.endpoint));
    }

    // Check which rendering tier was used
    console.log('Rendered via:', result.learning.renderTier);

  } finally {
    await browser.cleanup();
  }
}

main();
```

### Understanding Results

The `browse()` method returns a `SmartBrowseResult` with rich information:

```typescript
interface SmartBrowseResult {
  // Basic info
  url: string;
  title: string;

  // Extracted content in multiple formats
  content: {
    html: string;       // Raw HTML
    markdown: string;   // Clean markdown
    text: string;       // Plain text
  };

  // Extracted tables as structured JSON
  tables?: Array<{
    headers: string[];
    data: Record<string, string>[];
    caption?: string;
  }>;

  // Network requests captured during browsing
  network: NetworkRequest[];

  // Console messages from the page
  console: ConsoleMessage[];

  // API endpoints discovered (for future direct access)
  discoveredApis: ApiPattern[];

  // Page metadata
  metadata: {
    loadTime: number;
    timestamp: number;
    finalUrl: string;   // After redirects
    language?: string;
    fromCache?: boolean;
  };

  // Learning insights (what the system learned)
  learning: {
    renderTier: 'intelligence' | 'lightweight' | 'playwright';
    confidenceLevel: 'high' | 'medium' | 'low' | 'unknown';
    selectorsUsed: string[];
    skillsMatched?: SkillMatch[];
    // ... more fields
  };

  // Per-field confidence scores (optional)
  fieldConfidence?: BrowseFieldConfidence;

  // Decision trace for debugging (optional)
  decisionTrace?: DecisionTrace;
}
```

### Initialization Status

Check what features are active after initialization:

```typescript
const browser = await createLLMBrowser();

const status = browser.getInitializationStatus();
console.log(status.message);
// "Initialized with: playwright ON, semantic matching OFF, learning ON"

if (!status.playwrightAvailable) {
  console.log('Running in lightweight mode only');
}

console.log('Playwright:', status.playwrightAvailable);
console.log('Semantic matching:', status.semanticMatchingEnabled);
console.log('Sessions loaded:', status.sessionsLoaded);
console.log('Domains with patterns:', status.domainsWithPatterns);
```

---

## Core Concepts

### Tiered Rendering

The SDK uses three rendering tiers, automatically selecting the fastest one that works:

| Tier | Speed | Description | When Used |
|------|-------|-------------|-----------|
| **Intelligence** | ~50-200ms | No rendering. Extracts framework data (Next.js, etc.), structured data (JSON-LD), or calls learned APIs directly. | Static sites, SSG frameworks, sites with known APIs |
| **Lightweight** | ~200-500ms | HTTP fetch + linkedom DOM parsing. Executes simple JavaScript. | Most sites that don't need full browser |
| **Playwright** | ~2-5s | Full Chromium browser. Required for complex JavaScript, login flows. | SPAs, sites with anti-bot protection, complex interactions |

Control tier selection:

```typescript
// Force a specific tier
const result = await browser.browse(url, {
  forceTier: 'playwright',  // Always use full browser
});

// Set budget constraints
const result = await browser.browse(url, {
  maxCostTier: 'lightweight',  // Never use playwright
  maxLatencyMs: 1000,          // Give up if > 1 second
});

// Check which tier was used
console.log('Tier used:', result.learning.renderTier);
console.log('Fell back:', result.learning.tierFellBack);
```

### Learning System

The SDK learns patterns from successful browsing to optimize future requests:

```typescript
// Get learning statistics
const stats = browser.getLearningStats();
console.log(`Learned from ${stats.totalDomains} domains`);
console.log(`${stats.bypassablePatterns} API patterns (can skip browser)`);

// Get domain-specific intelligence
const intel = await browser.getDomainIntelligence('example.com');
console.log('Known patterns:', intel.knownPatterns);
console.log('Success rate:', intel.successRate);
console.log('Domain group:', intel.domainGroup); // e.g., 'spanish_gov'
```

**What gets learned:**
- API endpoints that return the same data as rendered pages
- CSS selectors that reliably extract specific content types
- Pagination patterns (query params, infinite scroll, etc.)
- Validation rules (expected content length, required text)
- Domain groups (sites that share similar patterns)

### Procedural Memory (Skills)

Skills are reusable browsing sequences learned from successful operations:

```typescript
// Find skills applicable to a URL
const skills = browser.findApplicableSkills('https://example.com/product/123');
console.log('Matching skills:', skills.map(s => s.skill.name));

// Get skill statistics
const skillStats = browser.getProceduralMemoryStats();
console.log('Total skills:', skillStats.totalSkills);
console.log('By domain:', skillStats.skillsByDomain);
```

Skills are automatically applied when browsing if they match the URL pattern.

### Session Management

Persist authenticated sessions across requests:

```typescript
// Check session health
const health = browser.getSessionHealth('example.com');
console.log('Status:', health.status); // 'healthy' | 'expiring_soon' | 'expired' | 'stale'
console.log('Authenticated:', health.isAuthenticated);

// Get all sessions
const allHealth = browser.getAllSessionHealth();
allHealth.forEach(s => {
  console.log(`${s.domain}: ${s.status}`);
});
```

Sessions are automatically loaded when browsing domains with saved sessions.

---

## API Reference

### Factory Functions

#### `createLLMBrowser(config?)`

Creates and initializes an LLM Browser client.

```typescript
import { createLLMBrowser, type LLMBrowserConfig } from '@llm-browser/core';

const config: LLMBrowserConfig = {
  sessionsDir: './sessions',
  enableLearning: true,
  enableProceduralMemory: true,
};

const browser = await createLLMBrowser(config);
```

**Returns:** `Promise<LLMBrowserClient>`

#### `createContentFetcher()`

Creates a lightweight content fetcher without full browser capabilities.

```typescript
import { createContentFetcher } from '@llm-browser/core';

const fetcher = createContentFetcher();

// Tiered fetch
const result = await fetcher.fetch('https://example.com');
console.log(result.content.text);

// Extract content from HTML
const extracted = fetcher.extract('<html>...</html>', 'https://example.com');
console.log(extracted.markdown);
```

### LLMBrowserClient

The main SDK client class.

#### `browse(url, options?)`

Browse a URL with intelligent learning and optimization.

```typescript
const result = await browser.browse('https://example.com', {
  timeout: 30000,
  enableLearning: true,
});
```

**Parameters:**
- `url: string` - URL to browse
- `options?: SmartBrowseOptions` - Browse options (see below)

**Returns:** `Promise<SmartBrowseResult>`

#### `fetch(url, options?)`

Fast content fetching using tiered rendering.

```typescript
const result = await browser.fetch('https://example.com', {
  forceTier: 'intelligence',
});
```

**Parameters:**
- `url: string` - URL to fetch
- `options?: TieredFetchOptions` - Fetch options

**Returns:** `Promise<TieredFetchResult>`

#### `getDomainIntelligence(domain)`

Get learned patterns and intelligence for a domain.

```typescript
const intel = await browser.getDomainIntelligence('example.com');
```

**Returns:**
```typescript
{
  knownPatterns: number;         // API patterns learned
  selectorChains: number;        // Content selectors learned
  validators: number;            // Validation rules learned
  paginationPatterns: number;    // Pagination patterns detected
  recentFailures: number;        // Recent failure count
  successRate: number;           // Overall success rate (0-1)
  domainGroup: string | null;    // Domain group (e.g., 'spanish_gov')
  recommendedWaitStrategy: string; // Suggested wait strategy
  shouldUseSession: boolean;     // Whether session is recommended
}
```

#### `findApplicableSkills(url, topK?)`

Find browsing skills that match a URL.

```typescript
const skills = browser.findApplicableSkills('https://example.com', 3);
```

**Parameters:**
- `url: string` - URL to match
- `topK?: number` - Maximum skills to return (default: 3)

**Returns:** `SkillMatch[]`

#### `getProceduralMemoryStats()`

Get statistics about learned skills.

```typescript
const stats = browser.getProceduralMemoryStats();
```

**Returns:**
```typescript
{
  totalSkills: number;
  totalTrajectories: number;
  skillsByDomain: Record<string, number>;
  avgSuccessRate: number;
  mostUsedSkills: Array<{ name: string; uses: number }>;
}
```

#### `getLearningStats()`

Get statistics about the learning system.

```typescript
const stats = browser.getLearningStats();
```

**Returns:**
```typescript
{
  totalDomains: number;
  totalApiPatterns: number;
  bypassablePatterns: number;
  totalSelectors: number;
  totalValidators: number;
  domainGroups: string[];
  recentLearningEvents: Array<{ type: string; domain: string; timestamp: number }>;
}
```

#### `getTieredFetcherStats()`

Get statistics about tiered fetching.

```typescript
const stats = browser.getTieredFetcherStats();
```

**Returns:**
```typescript
{
  totalDomains: number;
  byTier: Record<string, number>;     // Requests per tier
  avgResponseTimes: Record<string, number>;  // Avg time per tier
  playwrightAvailable: boolean;
}
```

#### `getSessionHealth(domain, profile?)`

Check health of a session.

```typescript
const health = browser.getSessionHealth('example.com', 'default');
```

**Returns:** `SessionHealth`

#### `getAllSessionHealth()`

Get health of all sessions.

```typescript
const allHealth = browser.getAllSessionHealth();
```

**Returns:** `SessionHealth[]`

#### `getInitializationStatus()`

Get detailed initialization status.

```typescript
const status = browser.getInitializationStatus();
```

**Returns:**
```typescript
{
  initialized: boolean;
  playwrightAvailable: boolean;
  semanticMatchingEnabled: boolean;
  learningEnabled: boolean;
  proceduralMemoryEnabled: boolean;
  sessionsLoaded: number;
  domainsWithPatterns: number;
  message: string;  // Human-readable summary
}
```

#### `cleanup()`

Release browser resources.

```typescript
await browser.cleanup();
```

#### Component Accessors

For advanced usage, access underlying components:

```typescript
const smartBrowser = browser.getSmartBrowser();
const learningEngine = browser.getLearningEngine();
const proceduralMemory = browser.getProceduralMemory();
const tieredFetcher = browser.getTieredFetcher();
const contentExtractor = browser.getContentExtractor();
const sessionManager = browser.getSessionManager();
```

### Configuration Options

#### LLMBrowserConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sessionsDir` | `string` | `'./sessions'` | Directory for session data |
| `learningEnginePath` | `string` | `'./enhanced-knowledge-base.json'` | Path to learning data file |
| `browser` | `BrowserConfig` | See below | Browser configuration |
| `enableProceduralMemory` | `boolean` | `true` | Enable skill learning |
| `enableLearning` | `boolean` | `true` | Enable API pattern learning |

#### BrowserConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headless` | `boolean` | `true` | Run browser in headless mode |
| `screenshotDir` | `string` | `'/tmp/browser-screenshots'` | Screenshot directory |
| `slowMo` | `number` | `0` | Slow down actions (ms, for debugging) |
| `devtools` | `boolean` | `false` | Open Chrome DevTools |
| `provider` | `BrowserProviderConfig` | auto-detected | Browser provider config |

### Browse Options

Options for the `browse()` method, grouped by concern:

#### Essential Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `forceTier` | `RenderTier` | auto | Force specific tier: `'intelligence'`, `'lightweight'`, `'playwright'` |
| `waitForSelector` | `string` | - | CSS selector to wait for before extraction |
| `timeout` | `number` | `30000` | Navigation timeout (ms) |
| `minContentLength` | `number` | - | Minimum content length for tier validation |
| `contentType` | `string` | - | Expected content type hint |

#### Learning Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableLearning` | `boolean` | `true` | Learn patterns from this request |
| `useSkills` | `boolean` | `true` | Apply learned browsing skills |
| `recordTrajectory` | `boolean` | `true` | Record for skill learning |
| `includeDecisionTrace` | `boolean` | `false` | Include detailed decision trace |
| `recordDebugTrace` | `boolean` | `false` | Record debug trace for analysis |

#### Validation & Content Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extractContent` | `boolean` | `true` | Extract content from page |
| `validateContent` | `boolean` | - | Validate against learned patterns |
| `checkForChanges` | `boolean` | - | Check for content changes |
| `followPagination` | `boolean` | `false` | Auto-follow pagination |
| `maxPages` | `number` | - | Max pages when paginating |

#### Budget Controls

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxLatencyMs` | `number` | - | Stop tier fallback when exceeded |
| `maxCostTier` | `RenderTier` | `'playwright'` | Most expensive tier allowed |
| `freshnessRequirement` | `'realtime' \| 'cached' \| 'any'` | `'any'` | Content freshness control |

#### Browser Behavior

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `waitFor` | `string` | `'load'` | Wait strategy: `'load'`, `'domcontentloaded'`, `'networkidle'` |
| `captureNetwork` | `boolean` | `true` | Capture network requests |
| `captureConsole` | `boolean` | `true` | Capture console messages |
| `sessionProfile` | `string` | - | Session profile for auth |
| `dismissCookieBanner` | `boolean` | - | Auto-dismiss cookie banners |
| `scrollToLoad` | `boolean` | - | Scroll for lazy content |
| `useRateLimiting` | `boolean` | `true` | Apply rate limiting |
| `retryOnError` | `boolean` | `true` | Retry on transient errors |

#### LLM-Assisted Retry

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retryWith` | `RetryConfig` | - | Config from LLM after problem response |

### Browse Result

Full `SmartBrowseResult` interface:

```typescript
interface SmartBrowseResult {
  url: string;
  title: string;
  content: {
    html: string;
    markdown: string;
    text: string;
  };
  tables?: ExtractedTableResult[];
  network: NetworkRequest[];
  console: ConsoleMessage[];
  discoveredApis: ApiPattern[];
  metadata: {
    loadTime: number;
    timestamp: number;
    finalUrl: string;
    language?: string;
    fromCache?: boolean;
    retryCount?: number;
  };
  learning: {
    renderTier?: RenderTier;
    tierFellBack?: boolean;
    tiersAttempted?: RenderTier[];
    tierReason?: string;
    tierTiming?: Record<RenderTier, number>;
    confidenceLevel: 'high' | 'medium' | 'low' | 'unknown';
    selectorsUsed: string[];
    selectorsSucceeded: string[];
    selectorsFailed: string[];
    validationResult?: { valid: boolean; reasons: string[] };
    paginationDetected?: PaginationPattern;
    contentChanged?: boolean;
    recommendedRefreshHours?: number;
    domainGroup?: string;
    skillsMatched?: SkillMatch[];
    skillApplied?: string;
    skillExecutionTrace?: SkillExecutionTrace;
    trajectoryRecorded?: boolean;
    anomalyDetected?: boolean;
    anomalyType?: string;
    budgetInfo?: {
      latencyExceeded: boolean;
      tiersSkipped: RenderTier[];
      maxCostTierEnforced?: RenderTier;
      usedCache: boolean;
      freshnessApplied?: FreshnessRequirement;
    };
    domainCapabilities?: DomainCapabilitiesSummary;
    domainKnowledge?: DomainKnowledgeSummary;
    problemResponse?: ProblemResponse;
  };
  fieldConfidence?: BrowseFieldConfidence;
  decisionTrace?: DecisionTrace;
  additionalPages?: Array<{
    url: string;
    content: { html: string; markdown: string; text: string };
  }>;
}
```

---

## Use Case Tutorials

### Web Scraping

Extract structured data from websites:

```typescript
import { createLLMBrowser } from '@llm-browser/core';

async function scrapeProducts() {
  const browser = await createLLMBrowser();

  try {
    const result = await browser.browse('https://shop.example.com/products', {
      waitForSelector: '.product-card',  // Wait for content to load
      enableLearning: true,              // Learn patterns for next time
    });

    // Extract tables (product listings often use tables)
    if (result.tables && result.tables.length > 0) {
      console.log('Found product table:');
      result.tables[0].data.forEach(row => {
        console.log(`  ${row.name}: ${row.price}`);
      });
    }

    // Check if APIs were discovered (faster next time)
    const apis = result.discoveredApis.filter(a => a.canBypass);
    if (apis.length > 0) {
      console.log('\nAPI found! Next time will be faster:');
      apis.forEach(api => {
        console.log(`  ${api.method} ${api.endpoint}`);
      });
    }

  } finally {
    await browser.cleanup();
  }
}
```

### API Discovery

Find and use APIs instead of scraping:

```typescript
import { createLLMBrowser } from '@llm-browser/core';

async function discoverApis() {
  const browser = await createLLMBrowser();

  try {
    // First browse captures network traffic and discovers APIs
    const result = await browser.browse('https://api.example.com/docs');

    // Show discovered endpoints
    console.log('Discovered APIs:');
    result.discoveredApis.forEach(api => {
      console.log(`  [${api.confidence}] ${api.method} ${api.endpoint}`);
      console.log(`    Can bypass browser: ${api.canBypass}`);
      if (api.authType) {
        console.log(`    Auth: ${api.authType}`);
      }
    });

    // Get domain intelligence
    const intel = await browser.getDomainIntelligence('api.example.com');
    console.log(`\nDomain Intelligence:`);
    console.log(`  Known patterns: ${intel.knownPatterns}`);
    console.log(`  Success rate: ${(intel.successRate * 100).toFixed(1)}%`);
    console.log(`  Bypassable: ${intel.knownPatterns > 0 ? 'Yes' : 'No'}`);

  } finally {
    await browser.cleanup();
  }
}
```

### Authenticated Browsing

Work with sites that require login:

```typescript
import { createLLMBrowser, AuthWorkflow } from '@llm-browser/core';

async function authenticatedBrowse() {
  const browser = await createLLMBrowser({
    sessionsDir: './sessions',
  });

  try {
    // Check session health
    const health = browser.getSessionHealth('secure.example.com');

    if (health.status === 'expired' || health.status === 'stale') {
      console.log('Session expired, need to re-authenticate');
      // Perform login flow...
    } else {
      console.log(`Session status: ${health.status}`);
    }

    // Browse with session
    const result = await browser.browse('https://secure.example.com/dashboard', {
      sessionProfile: 'default',
    });

    console.log('Dashboard content:', result.content.text.slice(0, 500));

  } finally {
    await browser.cleanup();
  }
}
```

### Batch Processing

Browse multiple URLs efficiently:

```typescript
import { createLLMBrowser, SmartBrowser } from '@llm-browser/core';

async function batchBrowse() {
  const browser = await createLLMBrowser();

  try {
    const urls = [
      'https://example.com/page1',
      'https://example.com/page2',
      'https://example.com/page3',
    ];

    // Access SmartBrowser for batch operations
    const smartBrowser = browser.getSmartBrowser();

    // Batch browse with controlled concurrency
    const results = await smartBrowser.batchBrowse(urls, {
      concurrency: 3,           // Max parallel requests
      perUrlTimeoutMs: 30000,   // Per-URL timeout
      continueOnRateLimit: true, // Don't stop on rate limits
    });

    // Process results
    results.forEach((item, i) => {
      if (item.status === 'success' && item.result) {
        console.log(`[${i}] ${item.url}: ${item.result.title}`);
      } else {
        console.log(`[${i}] ${item.url}: ${item.status} - ${item.error}`);
      }
    });

    // Summary
    const successful = results.filter(r => r.status === 'success').length;
    console.log(`\nCompleted: ${successful}/${results.length}`);

  } finally {
    await browser.cleanup();
  }
}
```

### Content Monitoring

Track content changes over time:

```typescript
import { createLLMBrowser, ContentChangeTracker } from '@llm-browser/core';

async function monitorContent() {
  const browser = await createLLMBrowser();
  const tracker = new ContentChangeTracker();
  await tracker.initialize();

  try {
    const url = 'https://news.example.com';

    // Browse and track
    const result = await browser.browse(url, {
      checkForChanges: true,
    });

    // Register for tracking
    await tracker.trackUrl(url, result.content.text, {
      label: 'News Homepage',
      tags: ['news', 'monitoring'],
    });

    // Later, check for changes
    const changeResult = await tracker.checkForChanges(url, result.content.text);

    if (changeResult.changed) {
      console.log('Content changed!');
      console.log('Significance:', changeResult.significance);
      console.log('Change summary:', changeResult.summary);
    }

    // Get tracking statistics
    const stats = tracker.getStats();
    console.log(`Tracking ${stats.totalUrls} URLs`);
    console.log(`${stats.changedUrls} have changed`);

  } finally {
    await browser.cleanup();
  }
}
```

---

## Advanced Topics

### Stealth Mode

For sites with bot detection, use stealth features:

```typescript
import {
  createLLMBrowser,
  generateFingerprint,
  getStealthFetchHeaders,
  BehavioralDelays,
  launchStealthBrowser,
  isStealthAvailable,
} from '@llm-browser/core';

// 1. Fingerprint generation (works everywhere)
const fingerprint = generateFingerprint('example.com');
console.log('User Agent:', fingerprint.userAgent);
console.log('Viewport:', fingerprint.viewport);
console.log('Locale:', fingerprint.locale);

// 2. Stealth headers for HTTP requests (all tiers)
const headers = getStealthFetchHeaders({
  fingerprintSeed: 'example.com',
  extraHeaders: { 'Authorization': 'Bearer token' },
});

// 3. Behavioral delays
await BehavioralDelays.sleep(100, 500);  // Random 100-500ms
const delay = BehavioralDelays.jitteredDelay(1000, 0.3);  // 1s +/- 30%

// 4. Full stealth browser (requires playwright-extra)
if (isStealthAvailable()) {
  const { browser, fingerprint, stealthEnabled } = await launchStealthBrowser({
    fingerprintSeed: 'example.com',
  });
  // Use browser...
  await browser.close();
}
```

**What stealth provides:**

- User agent rotation from realistic Chrome versions
- Matching Accept-Language and locale headers
- sec-ch-ua client hints
- navigator.webdriver removal (Playwright only)
- Plugin/mimeTypes spoofing (Playwright only)

**Limitations:**
- CAPTCHAs still require human solving
- Datacenter IPs may be blocklisted
- Advanced fingerprinting may still detect bots

### Error Handling

Handle errors with structured error types:

```typescript
import {
  createLLMBrowser,
  validateUrlOrThrow,
  UrlSafetyError,
  StructuredError,
  classifyFailure,
} from '@llm-browser/core';

async function handleErrors() {
  const browser = await createLLMBrowser();

  try {
    // URL validation (SSRF protection)
    validateUrlOrThrow(url);

    const result = await browser.browse(url);

    // Check for problem response (LLM-assisted solving)
    if (result.learning.problemResponse) {
      const problem = result.learning.problemResponse;
      console.log(`Problem: ${problem.problemType}`);
      console.log(`Reason: ${problem.reason}`);
      console.log(`Research query: ${problem.researchSuggestion.searchQuery}`);
      console.log(`Retry params: ${problem.researchSuggestion.retryParameters}`);

      // Can retry with suggested config
      const retryResult = await browser.browse(url, {
        retryWith: {
          useFullBrowser: true,
          delayMs: 2000,
        },
      });
    }

  } catch (error) {
    if (error instanceof UrlSafetyError) {
      // Blocked by SSRF protection
      console.error(`Blocked URL: ${error.message}`);
      console.error(`Category: ${error.category}`);
    } else if (error instanceof StructuredError) {
      // Structured browse error
      console.error(`Browse failed: ${error.code}`);
      console.error(`Message: ${error.message}`);
      console.error(`Severity: ${error.severity}`);
      console.error(`Retryable: ${error.retryable}`);
      if (error.recommendedActions) {
        console.error(`Actions: ${error.recommendedActions.join(', ')}`);
      }
    } else {
      // Classify unknown error
      const classified = classifyFailure(undefined, error);
      console.error(`Error category: ${classified.category}`);
    }
  } finally {
    await browser.cleanup();
  }
}
```

### Performance Optimization

Optimize for speed and efficiency:

```typescript
import { createLLMBrowser } from '@llm-browser/core';

async function optimizedBrowse() {
  const browser = await createLLMBrowser({
    enableLearning: true,  // Learn patterns for faster future access
  });

  try {
    // 1. Use budget controls to avoid slow tiers
    const fastResult = await browser.browse(url, {
      maxCostTier: 'lightweight',  // Skip playwright
      maxLatencyMs: 2000,          // Give up after 2s
    });

    // 2. Force fast tier for known static sites
    const staticResult = await browser.browse('https://static.example.com', {
      forceTier: 'intelligence',
    });

    // 3. Check if domain can bypass browser
    const intel = await browser.getDomainIntelligence('example.com');
    if (intel.knownPatterns > 0) {
      console.log('This domain has learned API patterns - will be fast');
    }

    // 4. Get tier statistics
    const stats = browser.getTieredFetcherStats();
    console.log('Average times by tier:', stats.avgResponseTimes);

  } finally {
    await browser.cleanup();
  }
}
```

### Multi-Tenant Usage

For applications serving multiple users:

```typescript
import {
  TenantStore,
  MultiTenantStore,
  SharedPatternPool,
  EmbeddedStore,
} from '@llm-browser/core';

async function multiTenant() {
  // Create embedded store
  const baseStore = await EmbeddedStore.create({
    dataDir: './data',
    tenant: 'system',
  });

  // Create multi-tenant manager
  const multiTenant = new MultiTenantStore(baseStore);
  await multiTenant.initialize();

  // Create tenant with shared pool access
  const tenantStore = await multiTenant.getOrCreateTenant('user-123', {
    sharePatterns: true,   // Contribute patterns to shared pool
    consumeShared: true,   // Use patterns from shared pool
  });

  // Each tenant has isolated storage
  await tenantStore.set('my-data', { value: 1 });
  const data = await tenantStore.get('my-data');

  // Shared pool allows cross-tenant pattern sharing
  const sharedPool = new SharedPatternPool(baseStore);
  await sharedPool.initialize();

  // Contribute a learned pattern
  await sharedPool.contributePattern(
    { /* pattern data */ },
    'user-123',
    0.95  // confidence
  );

  // Get shared patterns (excludes own contributions)
  const patterns = await sharedPool.getSharedPatterns('other-user');
}
```

### Custom Learning

Extend the learning system:

```typescript
import { createLLMBrowser, ApiPatternRegistry, PATTERN_TEMPLATES } from '@llm-browser/core';

async function customLearning() {
  const browser = await createLLMBrowser();
  const learningEngine = browser.getLearningEngine();

  // Get the pattern registry
  const registry = learningEngine.getPatternRegistry();

  // Manually register a pattern
  registry.registerPattern({
    id: 'my-custom-pattern',
    domain: 'api.myservice.com',
    templateId: 'rest-resource',
    endpoint: '/api/v1/items/{id}',
    method: 'GET',
    confidence: 'high',
    canBypass: true,
    contentMapping: {
      title: 'data.name',
      content: 'data.description',
    },
    source: 'bootstrap',
    createdAt: Date.now(),
    lastVerified: Date.now(),
  });

  // Check pattern templates
  console.log('Available templates:', Object.keys(PATTERN_TEMPLATES));

  // Get learning effectiveness metrics
  const effectiveness = await learningEngine.getEffectivenessMetrics();
  console.log('Pattern hit rate:', effectiveness.patternHitRate);
  console.log('Confidence accuracy:', effectiveness.confidenceAccuracy);

  await browser.cleanup();
}
```

---

## TypeScript Support

The SDK is written in TypeScript and provides comprehensive type definitions:

```typescript
import {
  // Factory functions
  createLLMBrowser,
  createContentFetcher,

  // Main client
  LLMBrowserClient,

  // Configuration types
  type LLMBrowserConfig,
  type BrowserConfig,

  // Browse types
  type SmartBrowseOptions,
  type SmartBrowseResult,
  type TieredFetchOptions,
  type TieredFetchResult,
  type RenderTier,

  // Result types
  type NetworkRequest,
  type ConsoleMessage,
  type ApiPattern,
  type BrowseResult,

  // Learning types
  type BrowsingSkill,
  type SkillMatch,
  type SkillExecutionTrace,

  // Error types
  type StructuredError,
  UrlSafetyError,

  // Session types
  type SessionHealth,

  // Core classes (for advanced usage)
  SmartBrowser,
  LearningEngine,
  ProceduralMemory,
  TieredFetcher,
  ContentExtractor,
  SessionManager,
} from '@llm-browser/core';
```

Full TypeScript example:

```typescript
import {
  createLLMBrowser,
  type LLMBrowserConfig,
  type SmartBrowseOptions,
  type SmartBrowseResult,
} from '@llm-browser/core';

const config: LLMBrowserConfig = {
  sessionsDir: './sessions',
  enableLearning: true,
};

const options: SmartBrowseOptions = {
  timeout: 30000,
  forceTier: 'lightweight',
  enableLearning: true,
};

async function typedExample(): Promise<void> {
  const browser = await createLLMBrowser(config);

  try {
    const result: SmartBrowseResult = await browser.browse(
      'https://example.com',
      options
    );

    // TypeScript knows all the fields
    console.log(result.title);
    console.log(result.content.markdown);
    console.log(result.learning.renderTier);

    if (result.fieldConfidence) {
      console.log('Title confidence:', result.fieldConfidence.title.score);
    }

  } finally {
    await browser.cleanup();
  }
}
```

---

## Troubleshooting

### Common Issues

#### "Playwright not available"

Install Playwright and browser:
```bash
npm install playwright
npx playwright install chromium
```

#### "Semantic matching disabled"

Install optional dependencies:
```bash
npm install @xenova/transformers @lancedb/lancedb better-sqlite3
```

#### "Request blocked by SSRF protection"

The SDK blocks requests to private IP ranges by default. For testing:
```typescript
import { configureUrlSafety } from '@llm-browser/core';

// WARNING: Only for testing, not production
configureUrlSafety({
  allowPrivateIPs: true,
  allowLocalhost: true,
});
```

#### "Rate limited"

The SDK applies per-domain rate limiting. Adjust or disable:
```typescript
const result = await browser.browse(url, {
  useRateLimiting: false,  // Disable rate limiting (not recommended)
});
```

### Debug Logging

Enable verbose logging:
```typescript
import { configureLogger } from '@llm-browser/core';

configureLogger({
  level: 'debug',  // 'trace' | 'debug' | 'info' | 'warn' | 'error'
});
```

### Getting Help

- Check the [examples](./examples/) directory for runnable code
- File issues at the [GitHub repository](https://github.com/anthropics/llm-browser/issues)
- See [SDK_ARCHITECTURE.md](../../docs/SDK_ARCHITECTURE.md) for internals

---

## License

MIT
