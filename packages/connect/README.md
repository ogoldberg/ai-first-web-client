# Unbrowser Connect SDK

**Browser-side content fetching for B2B SaaS applications.**

Unbrowser Connect enables your web application to fetch content from third-party websites through your users' browsers. This bypasses bot detection, leverages users' existing authentication, and works where server-side fetching fails.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Fetch Options](#fetch-options)
- [UI Components](#ui-components)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [TypeScript Support](#typescript-support)
- [Troubleshooting](#troubleshooting)

---

## Installation

```bash
npm install @unbrowser/connect
```

```bash
yarn add @unbrowser/connect
```

```bash
pnpm add @unbrowser/connect
```

### Browser Requirements

- Modern browsers (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- JavaScript enabled
- For popup mode: popup blockers may need to allow your domain

---

## Quick Start

```typescript
import { createConnect } from '@unbrowser/connect';

// 1. Initialize the SDK
const connect = createConnect({
  appId: 'your-app-id',
  apiKey: 'ub_live_your_api_key',
});

// 2. Initialize (loads patterns, sets up message handlers)
await connect.init();

// 3. Fetch content
const result = await connect.fetch({
  url: 'https://example.com/page',
  mode: 'background',
  extract: {
    text: true,
    markdown: true,
  },
});

// 4. Handle the result
if (result.success) {
  console.log('Title:', result.content.title);
  console.log('Content:', result.content.markdown);
} else {
  console.error('Error:', result.error.code, result.error.message);
}

// 5. Cleanup when done
connect.destroy();
```

---

## Core Concepts

### Fetch Modes

Unbrowser Connect supports two fetch modes:

| Mode | How It Works | Best For | User Visibility |
|------|--------------|----------|-----------------|
| `background` | Hidden iframe | Public content, no auth needed | Invisible |
| `popup` | Visible popup window | Auth-required content, login flows | User sees and interacts |

### Automatic Escalation

When using `background` mode, if the target site blocks iframes (via X-Frame-Options), Connect automatically escalates to `popup` mode.

```typescript
// This will try iframe first, then popup if blocked
const result = await connect.fetch({
  url: 'https://protected-site.com',
  mode: 'background', // Will escalate to popup if needed
});
```

### Content Extraction

Connect can extract content in multiple formats:

| Format | Description |
|--------|-------------|
| `text` | Plain text content |
| `markdown` | Markdown-formatted content |
| `html` | Raw HTML |
| `selectors` | Content from specific CSS selectors |

---

## API Reference

### `createConnect(config)`

Factory function to create a Connect instance.

```typescript
function createConnect(config: ConnectConfig): UnbrowserConnect
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `config` | `ConnectConfig` | Yes | Configuration object |

**Returns:** `UnbrowserConnect` instance

---

### `connect.init()`

Initialize the SDK. Must be called before fetching.

```typescript
async init(): Promise<void>
```

**Behavior:**
- Sets up cross-origin message handlers
- Syncs extraction patterns from server (non-blocking)
- Calls `onReady` callback when complete
- Safe to call multiple times (no-op if already initialized)

---

### `connect.fetch(options)`

Fetch content from a URL.

```typescript
async fetch(options: FetchOptions): Promise<FetchResult | FetchError>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `options` | `FetchOptions` | Yes | Fetch configuration |

**Returns:** `FetchResult` on success, `FetchError` on failure

**FetchResult structure:**

```typescript
{
  success: true,
  url: string,           // Final URL (after redirects)
  content: {
    title: string,       // Page title
    text?: string,       // Plain text (if requested)
    markdown?: string,   // Markdown (if requested)
    html?: string,       // HTML (if requested)
    selectors?: Record<string, string | string[]>, // Selector results
  },
  meta: {
    fetchedAt: string,   // ISO timestamp
    duration: number,    // Milliseconds
    mode: 'background' | 'popup',
    patternUsed?: string,
  }
}
```

**FetchError structure:**

```typescript
{
  success: false,
  error: {
    code: ConnectErrorCode,
    message: string,
  }
}
```

---

### `connect.batchFetch(options)`

Fetch multiple URLs with concurrency control.

```typescript
async batchFetch(options: BatchFetchOptions): Promise<BatchFetchResult>
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urls` | `string[]` | Yes | - | URLs to fetch |
| `options` | `FetchOptions` | No | `{}` | Options applied to all fetches |
| `concurrency` | `number` | No | `3` | Max concurrent fetches |
| `continueOnError` | `boolean` | No | `true` | Continue if one fails |
| `onProgress` | `function` | No | - | Progress callback |

**Returns:**

```typescript
{
  total: number,      // Total URLs
  succeeded: number,  // Successful fetches
  failed: number,     // Failed fetches
  results: (FetchResult | FetchError)[]
}
```

---

### `connect.canFetchBackground(url)`

Check if a URL can be fetched via background mode (iframe).

```typescript
async canFetchBackground(url: string): Promise<boolean>
```

**Returns:** `true` if iframe embedding is allowed, `false` if blocked

---

### `connect.syncPatterns()`

Force sync extraction patterns from server.

```typescript
async syncPatterns(): Promise<void>
```

---

### `connect.destroy()`

Cleanup all resources.

```typescript
destroy(): void
```

**Behavior:**
- Removes message handlers
- Closes any open iframes/popups
- Removes UI components
- Resets initialization state

---

## Configuration

### ConnectConfig

Full configuration options for `createConnect()`:

```typescript
interface ConnectConfig {
  // Required
  appId: string;           // Your application ID
  apiKey: string;          // Your API key (ub_live_* or ub_test_*)

  // Optional
  apiUrl?: string;         // API endpoint (default: 'https://api.unbrowser.ai')
  debug?: boolean;         // Enable console logging (default: false)
  theme?: ConnectTheme;    // UI theme customization
  ui?: GlobalUIOptions;    // Built-in UI component options

  // Callbacks
  onReady?: () => void;              // Called when SDK is initialized
  onError?: (error: ConnectError) => void;  // Called on errors
}
```

### ConnectTheme

Customize the appearance of UI components:

```typescript
interface ConnectTheme {
  primaryColor?: string;      // Button and accent color (default: '#6366f1')
  backgroundColor?: string;   // Modal/overlay background (default: '#ffffff')
  textColor?: string;         // Text color (default: '#1f2937')
  borderRadius?: string;      // Border radius (default: '8px')
  fontFamily?: string;        // Font stack (default: system fonts)
}
```

**Example:**

```typescript
const connect = createConnect({
  appId: 'my-app',
  apiKey: 'ub_live_xxx',
  theme: {
    primaryColor: '#0066cc',
    backgroundColor: '#f8f9fa',
    textColor: '#212529',
    borderRadius: '4px',
    fontFamily: '"Inter", sans-serif',
  },
});
```

### GlobalUIOptions

Configure built-in UI components:

```typescript
interface GlobalUIOptions {
  showProgress?: boolean;    // Show progress overlay (default: false)
  showErrors?: boolean;      // Show error toasts (default: false)
  errorDuration?: number;    // Toast duration in ms (default: 5000)
  container?: HTMLElement;   // Mount container (default: document.body)
}
```

---

## Fetch Options

### FetchOptions

Complete options for `connect.fetch()`:

```typescript
interface FetchOptions {
  // Required
  url: string;                    // URL to fetch

  // Mode and behavior
  mode?: 'background' | 'popup';  // Fetch mode (default: 'background')
  requiresAuth?: boolean;         // Force popup for auth (default: false)
  timeout?: number;               // Timeout in ms (default: 30000)

  // Content extraction
  extract?: ExtractionOptions;    // What content to extract

  // UI options (per-fetch)
  ui?: FetchUIOptions;            // UI configuration for this fetch

  // Legacy (still supported)
  authPrompt?: string;            // Simple auth prompt message

  // Callbacks
  onProgress?: (progress: FetchProgress) => void;  // Progress updates
}
```

### ExtractionOptions

Configure what content to extract:

```typescript
interface ExtractionOptions {
  text?: boolean;           // Extract plain text
  markdown?: boolean;       // Extract as markdown
  html?: boolean;           // Extract raw HTML
  selectors?: Record<string, string>;  // CSS selectors to extract
  usePatterns?: boolean;    // Use learned patterns (default: true)
}
```

**Selectors example:**

```typescript
const result = await connect.fetch({
  url: 'https://example.com/product',
  extract: {
    selectors: {
      title: 'h1.product-title',
      price: '.price-value',
      description: '.product-description',
      images: 'img.product-image',  // Returns array if multiple matches
    },
  },
});

// Access extracted data
console.log(result.content.selectors.title);  // "Product Name"
console.log(result.content.selectors.price);  // "$99.99"
```

### FetchProgress

Progress callback receives:

```typescript
interface FetchProgress {
  stage: 'initializing' | 'loading' | 'waiting_auth' | 'extracting' | 'complete';
  percent: number;    // 0-100
  message: string;    // Human-readable status
}
```

---

## UI Components

Unbrowser Connect includes optional built-in UI components. All are **disabled by default**.

### Enabling UI Components

```typescript
const connect = createConnect({
  appId: 'my-app',
  apiKey: 'ub_live_xxx',
  ui: {
    showProgress: true,   // Enable progress overlay
    showErrors: true,     // Enable error toasts
    errorDuration: 5000,  // Toast duration (ms)
  },
});
```

### Progress Overlay

Shows a modal with:
- Spinning loader animation
- Current stage (Initializing, Loading, Extracting, etc.)
- Percentage complete
- Status message

**Per-fetch override:**

```typescript
// Disable progress for this specific fetch
const result = await connect.fetch({
  url: 'https://example.com',
  ui: { showProgress: false },
});
```

### Auth Modal

Prompts user before opening a popup for authentication:

```typescript
const result = await connect.fetch({
  url: 'https://requires-login.com',
  mode: 'popup',
  ui: {
    authPrompt: {
      title: 'Sign In Required',
      message: 'Please sign in to access this content.',
      buttonText: 'Continue',
      cancelText: 'Cancel',
      showCancel: true,
    },
  },
});
```

**AuthPromptConfig:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `title` | `string` | `'Sign In Required'` | Modal title |
| `message` | `string` | `'A popup window will open...'` | Explanation text |
| `buttonText` | `string` | `'Continue'` | Primary button text |
| `cancelText` | `string` | `'Cancel'` | Cancel button text |
| `showCancel` | `boolean` | `true` | Show cancel button |

### Error Toast

Displays dismissable error notifications in the bottom-right corner.

**Error codes displayed:**

| Code | Description |
|------|-------------|
| `NETWORK_ERROR` | Network request failed |
| `TIMEOUT` | Request timed out |
| `IFRAME_BLOCKED` | Site blocks iframes |
| `POPUP_BLOCKED` | Browser blocked popup |
| `USER_CANCELLED` | User cancelled auth |
| `EXTRACTION_FAILED` | Content extraction failed |
| `INVALID_URL` | Invalid URL provided |

### Custom Container

Mount UI components in a specific element:

```typescript
const container = document.getElementById('unbrowser-container');

const connect = createConnect({
  appId: 'my-app',
  apiKey: 'ub_live_xxx',
  ui: {
    showProgress: true,
    container: container,  // Mount here instead of document.body
  },
});
```

---

## Examples

### Basic Content Fetch

```typescript
import { createConnect } from '@unbrowser/connect';

const connect = createConnect({
  appId: 'my-app',
  apiKey: 'ub_live_xxx',
});

await connect.init();

const result = await connect.fetch({
  url: 'https://news.ycombinator.com',
  extract: {
    text: true,
    selectors: {
      headlines: '.titleline > a',
      scores: '.score',
    },
  },
});

if (result.success) {
  console.log('Headlines:', result.content.selectors.headlines);
}
```

### Authenticated Content

```typescript
const result = await connect.fetch({
  url: 'https://app.example.com/dashboard',
  mode: 'popup',
  requiresAuth: true,
  ui: {
    authPrompt: {
      title: 'Login to Example',
      message: 'Sign in to fetch your dashboard data.',
    },
  },
  onProgress: (progress) => {
    if (progress.stage === 'waiting_auth') {
      console.log('Waiting for user to authenticate...');
    }
  },
});
```

### Batch Fetching

```typescript
const urls = [
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3',
];

const results = await connect.batchFetch({
  urls,
  options: {
    extract: { markdown: true },
    timeout: 15000,
  },
  concurrency: 2,  // Fetch 2 at a time
  onProgress: (completed, total, results) => {
    console.log(`Progress: ${completed}/${total}`);
  },
});

console.log(`Success: ${results.succeeded}, Failed: ${results.failed}`);
```

### With Progress Tracking

```typescript
const connect = createConnect({
  appId: 'my-app',
  apiKey: 'ub_live_xxx',
  ui: { showProgress: true },
});

await connect.init();

const result = await connect.fetch({
  url: 'https://example.com',
  onProgress: (progress) => {
    // Update your own UI alongside built-in overlay
    updateProgressBar(progress.percent);
    updateStatusText(progress.message);
  },
});
```

### React Integration

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { createConnect, UnbrowserConnect } from '@unbrowser/connect';

export function useUnbrowserConnect(appId: string, apiKey: string) {
  const connectRef = useRef<UnbrowserConnect | null>(null);

  useEffect(() => {
    const connect = createConnect({
      appId,
      apiKey,
      ui: { showProgress: true, showErrors: true },
    });

    connect.init().then(() => {
      connectRef.current = connect;
    });

    return () => {
      connect.destroy();
    };
  }, [appId, apiKey]);

  const fetch = useCallback(async (url: string) => {
    if (!connectRef.current) {
      throw new Error('Connect not initialized');
    }
    return connectRef.current.fetch({ url, extract: { markdown: true } });
  }, []);

  return { fetch };
}

// Usage in component
function MyComponent() {
  const { fetch } = useUnbrowserConnect('my-app', 'ub_live_xxx');

  const handleFetch = async () => {
    const result = await fetch('https://example.com');
    if (result.success) {
      setContent(result.content.markdown);
    }
  };

  return <button onClick={handleFetch}>Fetch Content</button>;
}
```

---

## Error Handling

### Error Codes

All errors include a `code` and `message`:

| Code | Description | Recovery |
|------|-------------|----------|
| `NETWORK_ERROR` | Network request failed | Retry, check connectivity |
| `TIMEOUT` | Request exceeded timeout | Increase timeout, retry |
| `IFRAME_BLOCKED` | X-Frame-Options prevents embedding | Use popup mode |
| `POPUP_BLOCKED` | Browser blocked popup | User must allow popups |
| `POPUP_CLOSED` | User closed popup before completion | Retry with user consent |
| `USER_CANCELLED` | User cancelled auth prompt | Handle gracefully |
| `EXTRACTION_FAILED` | Could not extract content | Check selectors, try different extraction |
| `INVALID_URL` | URL is malformed | Validate URL before fetching |
| `INIT_FAILED` | SDK initialization failed | Check API key, network |

### Error Handling Pattern

```typescript
const result = await connect.fetch({ url: 'https://example.com' });

if (!result.success) {
  const { code, message } = result.error;

  switch (code) {
    case 'TIMEOUT':
      // Retry with longer timeout
      return connect.fetch({ url, timeout: 60000 });

    case 'POPUP_BLOCKED':
      // Inform user to allow popups
      showNotification('Please allow popups for this site');
      break;

    case 'USER_CANCELLED':
      // User chose not to authenticate
      break;

    default:
      console.error(`Fetch failed: ${code} - ${message}`);
  }
}
```

### Global Error Handler

```typescript
const connect = createConnect({
  appId: 'my-app',
  apiKey: 'ub_live_xxx',
  onError: (error) => {
    // Log to your error tracking service
    Sentry.captureException(new Error(error.message), {
      tags: { errorCode: error.code },
    });
  },
});
```

---

## TypeScript Support

Unbrowser Connect is written in TypeScript and provides full type definitions.

### Importing Types

```typescript
import {
  createConnect,
  UnbrowserConnect,
  type ConnectConfig,
  type ConnectTheme,
  type FetchOptions,
  type FetchResult,
  type FetchError,
  type FetchProgress,
  type BatchFetchOptions,
  type BatchFetchResult,
  type ConnectError,
  type ConnectErrorCode,
  type ExtractionOptions,
} from '@unbrowser/connect';
```

### Type Guards

```typescript
function isFetchSuccess(result: FetchResult | FetchError): result is FetchResult {
  return result.success === true;
}

const result = await connect.fetch({ url: 'https://example.com' });

if (isFetchSuccess(result)) {
  // TypeScript knows result is FetchResult
  console.log(result.content.title);
} else {
  // TypeScript knows result is FetchError
  console.error(result.error.code);
}
```

---

## Troubleshooting

### "Popup was blocked"

**Cause:** Browser's popup blocker prevented the popup from opening.

**Solutions:**
1. Ensure `connect.fetch()` is called in response to a user action (click)
2. Ask users to allow popups for your domain
3. Use `background` mode when possible

```typescript
// Good: Called in click handler
button.onclick = async () => {
  await connect.fetch({ url, mode: 'popup' });
};

// Bad: Called without user action
setTimeout(async () => {
  await connect.fetch({ url, mode: 'popup' }); // May be blocked
}, 1000);
```

### "Iframe blocked"

**Cause:** Target site sends `X-Frame-Options: DENY` or CSP frame-ancestors directive.

**Solution:** Use `popup` mode for these sites:

```typescript
const result = await connect.fetch({
  url: 'https://blocked-site.com',
  mode: 'popup',  // User will see the page in a popup
});
```

### Content not extracting correctly

**Cause:** Selectors don't match or content is dynamically loaded.

**Solutions:**

1. Verify selectors in browser DevTools
2. Increase timeout for dynamic content
3. Use more specific selectors

```typescript
const result = await connect.fetch({
  url: 'https://spa-site.com',
  timeout: 30000,  // Allow time for JS to load
  extract: {
    selectors: {
      // Use specific, stable selectors
      content: '[data-testid="main-content"]',
    },
  },
});
```

### SDK not initializing

**Cause:** Invalid API key or network issues.

**Debug steps:**

```typescript
const connect = createConnect({
  appId: 'my-app',
  apiKey: 'ub_live_xxx',
  debug: true,  // Enable console logging
  onReady: () => console.log('SDK ready'),
  onError: (err) => console.error('SDK error:', err),
});

await connect.init();
```

### Memory leaks

**Cause:** Not calling `destroy()` when done.

**Solution:** Always cleanup:

```typescript
// In React useEffect
useEffect(() => {
  const connect = createConnect({ ... });
  connect.init();

  return () => {
    connect.destroy();  // Cleanup on unmount
  };
}, []);
```

---

## Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome | 80+ | Full support |
| Firefox | 75+ | Full support |
| Safari | 13+ | Full support |
| Edge | 80+ | Full support (Chromium) |
| IE | Not supported | - |

---

## Security Considerations

1. **API Keys:** Never expose API keys in client-side code in production. Use environment variables and server-side proxying for sensitive keys.

2. **Content Security Policy:** If your site uses CSP, ensure it allows:
   - `frame-src` for target domains (background mode)
   - Popups for target domains (popup mode)

3. **Same-Origin Policy:** Connect uses `postMessage` for cross-origin communication. Ensure your CSP allows this.

---

## Support

- **Documentation:** https://docs.unbrowser.ai
- **GitHub Issues:** https://github.com/unbrowser/connect/issues
- **Email:** support@unbrowser.ai

---

## License

MIT License - see LICENSE file for details.
