# SPA and Protected Site Handling Guide

This document explains how Unbrowser handles Single Page Apps (SPAs) and API-protected sites, and provides guidance for optimizing content extraction.

## Site Handler Architecture

Unbrowser uses a tiered extraction strategy with site-specific handlers for optimal content extraction:

```
ContentIntelligence.extract()
  |
  +-- Site-specific APIs (fastest, if available)
  |     +-- api:reddit      -> RedditHandler
  |     +-- api:hackernews  -> HackerNewsHandler
  |     +-- api:github      -> GitHubHandler
  |     +-- api:wikipedia   -> WikipediaHandler
  |     +-- api:stackoverflow -> StackOverflowHandler
  |     +-- api:npm         -> NpmHandler
  |     +-- api:pypi        -> PyPIHandler
  |     +-- api:devto       -> DevToHandler
  |     +-- api:medium      -> MediumHandler
  |     +-- api:youtube     -> YouTubeHandler
  |
  +-- Learned API patterns (from previous extractions)
  +-- Framework extraction (__NEXT_DATA__, __NUXT__, etc.)
  +-- Structured data (JSON-LD, OpenGraph)
  +-- Static HTML parsing
  +-- API prediction (discover and call APIs)
  +-- OpenAPI/GraphQL discovery
  +-- Cache fallbacks (Google Cache, Archive.org)
  +-- Full browser (Playwright, last resort)
```

## Site Handler Locations

Site handlers are located in:
- `src/core/site-handlers/` - Individual handler implementations
- `src/core/site-handlers/index.ts` - Registry and `findHandler()` function

## Known API Limitations by Site

### Reddit (REQUIRES UPDATE)

**Current Status:** The `.json` suffix API is now blocked without authentication.

**Error Message:**
```
"Your request has been blocked due to a network policy."
"If you're running a script or application, please register or sign in with your developer credentials"
```

**Working Alternatives:**
1. **old.reddit.com HTML** - Still works without auth
   ```
   https://old.reddit.com/r/programming/  -> HTML with all post data
   ```
2. **Reddit OAuth** - Requires app registration at https://www.reddit.com/prefs/apps

**Recommended Fix for RedditHandler:**
```typescript
// Instead of:
const jsonUrl = url.replace('www.reddit.com', 'www.reddit.com') + '.json';

// Use:
const oldUrl = url.replace('www.reddit.com', 'old.reddit.com');
// Then parse HTML using cheerio selectors for post titles, scores, etc.
```

### Amazon (Heavy Bot Protection)

**Status:** Aggressive bot detection, often requires residential proxies.

**Strategies:**
1. Use ISP/residential proxies (configured via `PROXY_ISP_URLS`, `BRIGHTDATA_*`)
2. Full browser with stealth mode (`LLM_BROWSER_STEALTH=true`)
3. Discovered product APIs (if learned from previous sessions)

**Common Errors:**
- Browser connection closed
- CAPTCHA challenges
- "Robot check" pages

### Etsy (Bot Protection)

Similar to Amazon - requires:
- Residential proxies
- Full browser with stealth
- Rate limiting between requests

### E-commerce Sites General Strategy

For e-commerce product pages:

1. **Product Schema First** - Most e-commerce sites include JSON-LD product schema:
   ```html
   <script type="application/ld+json">
     {"@type": "Product", "name": "...", "price": "..."}
   </script>
   ```

2. **Framework Data** - Many use Next.js with `__NEXT_DATA__` containing product info

3. **API Discovery** - The API discovery system can often find product APIs:
   - `/api/products/{id}`
   - `/api/v1/item/{id}`
   - GraphQL endpoints

## Framework-Specific Extraction

### Next.js Sites
Look for `__NEXT_DATA__` script tag containing page props:
```html
<script id="__NEXT_DATA__" type="application/json">
  {"props":{"pageProps":{...}}}
</script>
```

### Nuxt Sites
Look for `__NUXT__` or `window.__NUXT__`:
```html
<script>window.__NUXT__={data:{...}}</script>
```

### Gatsby Sites
Look for `___gatsby` or page-data files.

### React SPAs (General)
For generic React SPAs, the lightweight renderer attempts:
1. Execute inline scripts in Node VM
2. Parse resulting DOM with linkedom
3. Fall back to Playwright if JS is complex

## Adding New Site Handlers

Create a new handler in `src/core/site-handlers/`:

```typescript
// src/core/site-handlers/mysite-handler.ts
import { BaseSiteHandler, type SiteHandlerResult, type FetchFunction, type SiteHandlerOptions } from './base.js';

export class MySiteHandler extends BaseSiteHandler {
  readonly name = 'MySite';
  readonly strategy = 'api:mysite' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return /^(www\.)?mysite\.com$/i.test(parsed.hostname);
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    // 1. Try API endpoint
    const apiUrl = this.transformToApiUrl(url);
    const response = await fetch(apiUrl, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
      return null; // Fall back to next strategy
    }

    const data = await response.json();

    // 2. Format content for LLM consumption
    return {
      content: {
        title: data.title,
        text: this.formatAsText(data),
        markdown: this.formatAsMarkdown(data),
      },
      meta: {
        url,
        finalUrl: apiUrl,
        strategy: this.strategy,
        confidence: 'high',
      },
      warnings: [],
    };
  }
}
```

Then register in `src/core/site-handlers/index.ts`:

```typescript
import { MySiteHandler } from './mysite-handler.js';

export const mySiteHandler = new MySiteHandler();

export const siteHandlers = [
  // ... existing handlers
  mySiteHandler,
];
```

## Proxy Configuration for Protected Sites

For sites with heavy bot protection, configure proxies:

```bash
# Datacenter proxies (cheapest, low protection sites)
PROXY_DATACENTER_URLS=http://user:pass@dc.proxy.com:8080

# ISP proxies (better reputation)
PROXY_ISP_URLS=http://user:pass@isp.proxy.com:8080

# Bright Data residential (highest success rate)
BRIGHTDATA_AUTH=customer_id:password
BRIGHTDATA_ZONE=residential
BRIGHTDATA_COUNTRY=us
```

See `docs/PROXY_MANAGEMENT_PLAN.md` for full proxy configuration.

## API Pattern Learning

Unbrowser learns API patterns from successful extractions. Once an API is discovered:

1. Pattern is stored with domain and confidence level
2. Future requests check learned patterns first
3. High-confidence patterns can bypass browser entirely

Check learned patterns:
```typescript
const learningEngine = browser.getLearningEngine();
const patterns = learningEngine.getBypassablePatterns('example.com');
```

## Common Issues and Solutions

### "Browser closed" Errors
**Cause:** Playwright/Browserless connection terminated
**Solutions:**
1. Check Browserless.io quota (`BROWSERLESS_PLAN`)
2. Reduce concurrent connections
3. Use intelligence tier first (`forceTier: 'intelligence'`)

### Empty or Truncated Content
**Cause:** Content loaded via JavaScript not executed
**Solutions:**
1. Try lightweight renderer (handles basic JS)
2. Force Playwright tier for complex SPAs
3. Check for `__NEXT_DATA__` or similar framework data

### Rate Limiting
**Cause:** Too many requests to same domain
**Solutions:**
1. Enable rate limiting: `useRateLimiting: true`
2. Add delays between requests
3. Use proxy rotation

## Testing Site Handlers

Run the test suite:
```bash
npm test -- --grep "site-handlers"
```

Test individual sites:
```bash
# Via API
curl -X POST https://api.unbrowser.ai/v1/browse \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"url": "https://example.com"}'

# Via SDK
import { createLLMBrowser } from 'llm-browser/sdk';
const browser = await createLLMBrowser();
const result = await browser.browse('https://example.com');
console.log(result.content.markdown);
```
