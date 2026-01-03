# Unbrowser Connect Architecture

**Version**: 0.3.0
**Status**: Alpha Implementation
**Last Updated**: 2026-01-02

---

## Executive Summary

Unbrowser Connect is a JavaScript SDK that enables B2B SaaS applications to fetch web content through their users' browsers, bypassing bot detection and accessing content that would otherwise be blocked from cloud-based scraping.

### The Problem

B2B SaaS applications need to fetch content from third-party websites. Traditional cloud-based approaches fail because:

1. **Bot detection** blocks datacenter IPs (Cloudflare, DataDome, PerimeterX)
2. **Residential proxies** are expensive ($15-50/GB) and still get blocked
3. **Browser extensions** require user installation (friction kills adoption)
4. **Official APIs** often don't exist, are rate-limited, or require paid access

### The Solution

Unbrowser Connect embeds a lightweight JavaScript SDK in the SaaS application's frontend. When content is needed:

1. The SDK opens a hidden iframe (or popup for auth-required content)
2. The request originates from the **user's real browser** (residential IP, real fingerprint)
3. Content is extracted using Unbrowser's intelligence engine (running in-browser)
4. Structured data is returned to the SaaS application

**Result**: Zero bot detection issues. No user installation. Invisible for public content.

---

## Reference Customer: Move Ahead

**Move Ahead** is an AI-powered relocation assistant that helps people navigate moving to a new country. It demonstrates both primary use cases for Unbrowser Connect.

### Move Ahead's Content Needs

| Source Type | Examples | Challenge | Solution |
|-------------|----------|-----------|----------|
| **Official Sources** | Embassy visa requirements, tax authority guidelines, healthcare registration | Government sites block datacenter IPs | Background iframe fetch |
| **Community Experiences** | Reddit threads about visa processes, expat forum discussions | Reddit blocks API access, rate limits | Background or popup fetch |

### The Dual-Source Paradigm

Move Ahead combines **official information** with **community experiences** to give users complete, accurate answers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   User: "What's it really like getting a Spain non-lucrative visa?"        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────┐    ┌─────────────────────────────┐       │
│   │   OFFICIAL SOURCES          │    │   COMMUNITY EXPERIENCES     │       │
│   │   (Background iframe)       │    │   (Reddit/forums)           │       │
│   │                             │    │                             │       │
│   │   - Embassy requirements    │    │   - "It took me 6 months"   │       │
│   │   - Document checklist      │    │   - "They asked for X too"  │       │
│   │   - Processing times        │    │   - "Avoid this notary"     │       │
│   │   - Fee schedule            │    │   - "Here's what worked"    │       │
│   │                             │    │                             │       │
│   │   exteriores.gob.es         │    │   r/SpainExpats             │       │
│   │   aeat.es (tax)             │    │   r/IWantOut                │       │
│   │   seg-social.es             │    │   r/digitalnomad            │       │
│   └─────────────────────────────┘    └─────────────────────────────┘       │
│                                                                             │
│   Combined AI Response:                                                     │
│   "The official requirements are X, Y, Z with a 3-month processing time.   │
│    However, based on 47 community reports from the past 6 months, expect   │
│    4-6 months and bring extra bank statements - 23 people reported being   │
│    asked for additional documentation beyond the official list."           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

| Source | Strengths | Weaknesses |
|--------|-----------|------------|
| Official only | Authoritative, accurate | Often incomplete, outdated, bureaucratic language |
| Community only | Practical, current, real experiences | Anecdotal, may be outdated, varies by case |
| **Combined** | Complete picture, verified + practical | Best of both worlds |

---

## Architecture Overview

```
                                   ┌─────────────────────────────┐
                                   │       SaaS Application      │
                                   │       (e.g., Move Ahead)    │
                                   └─────────────────────────────┘
                                                 │
                                                 │ Embeds SDK
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                          USER'S BROWSER                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SaaS Application Frontend                         │   │
│  │                                                                      │   │
│  │   ┌────────────────────────────────────────────────────────────┐    │   │
│  │   │                  UNBROWSER CONNECT SDK                      │    │   │
│  │   │                                                             │    │   │
│  │   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │    │   │
│  │   │  │   Core      │ │  Fetchers   │ │ Extraction  │          │    │   │
│  │   │  │             │ │             │ │   Engine    │          │    │   │
│  │   │  │ - Init      │ │ - Iframe    │ │             │          │    │   │
│  │   │  │ - Config    │ │ - Popup     │ │ - Patterns  │          │    │   │
│  │   │  │ - State     │ │ - Tab       │ │ - Selectors │          │    │   │
│  │   │  └─────────────┘ └─────────────┘ └─────────────┘          │    │   │
│  │   │         │                │               │                 │    │   │
│  │   │         └────────────────┼───────────────┘                 │    │   │
│  │   │                          │                                 │    │   │
│  │   │                          ▼                                 │    │   │
│  │   │  ┌─────────────────────────────────────────────────────┐  │    │   │
│  │   │  │              Communication Layer                     │  │    │   │
│  │   │  │              (postMessage API)                       │  │    │   │
│  │   │  └─────────────────────────────────────────────────────┘  │    │   │
│  │   │                          │                                 │    │   │
│  │   └──────────────────────────┼─────────────────────────────────┘    │   │
│  │                              │                                       │   │
│  └──────────────────────────────┼───────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼───────────────────────────────────────┐   │
│  │                              ▼                                       │   │
│  │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │   │
│  │    │   Hidden    │    │   Popup     │    │   New Tab   │            │   │
│  │    │   Iframe    │    │   Window    │    │             │            │   │
│  │    │             │    │             │    │             │            │   │
│  │    │ Gov portals │    │ Reddit      │    │ Complex     │            │   │
│  │    │ Public info │    │ Auth flows  │    │ Multi-step  │            │   │
│  │    │             │    │             │    │             │            │   │
│  │    │ (invisible) │    │ (minimal UI)│    │ (user ctrl) │            │   │
│  │    └─────────────┘    └─────────────┘    └─────────────┘            │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ REST/WebSocket
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                      UNBROWSER CONNECT CLOUD                                │
│                      (api.unbrowser.ai/connect)                             │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   Pattern   │  │  Analytics  │  │   Billing   │  │  Fallback   │       │
│  │    Sync     │  │  & Metrics  │  │   & Quota   │  │   Fetch     │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Two Operational Modes

### Mode 1: Background Fetch (Invisible)

For **public content** that doesn't require authentication.

```javascript
// User asks about Spain visa requirements
// SDK fetches invisibly - user sees nothing

const visaInfo = await UnbrowserConnect.fetch({
  url: 'https://www.exteriores.gob.es/Consulados/miami/en/Paginas/Visas.aspx',
  mode: 'background',
  extract: {
    selectors: {
      requirements: '.visa-requirements',
      documents: '.required-documents',
      fees: '.visa-fees',
      processingTime: '.processing-time'
    }
  }
});

// User never knows a fetch happened
// Answer is enriched with fresh, accurate data
```

**Use Cases:**
- Government portals (embassies, tax authorities, immigration)
- Public Reddit threads (old.reddit.com HTML)
- News articles and blog posts
- Public business listings

**User Experience:** Completely invisible. No popups, no prompts.

### Mode 2: Popup Fetch (Visible)

For **content that requires authentication** or sites that block iframes.

```javascript
// User wants personalized Reddit recommendations
// SDK opens popup for user to log in

const redditData = await UnbrowserConnect.fetch({
  url: 'https://reddit.com/r/SpainExpats/search?q=non-lucrative+visa',
  mode: 'popup',
  requiresAuth: true,
  authPrompt: 'Log into Reddit to access community experiences',
  extract: {
    posts: { limit: 20 },
    comments: { depth: 2 }
  }
});
```

**Use Cases:**
- Reddit (when auth required or rate-limited)
- LinkedIn profiles
- Private forums
- Sites that block iframes (X-Frame-Options: deny)

**User Experience:** OAuth-like popup. User logs in, popup closes, data appears.

### Automatic Mode Selection

```javascript
// Let the SDK decide based on site characteristics
const result = await UnbrowserConnect.fetch({
  url: targetUrl,
  mode: 'auto',  // SDK chooses best approach
  fallback: 'popup'  // If background fails, try popup
});
```

**Selection Logic:**
1. Check if site allows iframes (X-Frame-Options header)
2. Check domain risk level (known to block, require auth)
3. Check if auth is required for the specific content
4. Start with background, escalate to popup if needed

---

## Reddit-Specific Handling

Reddit is a critical source for Move Ahead (and many B2B apps) but presents unique challenges.

### Reddit Challenges

| Challenge | Cause | Solution |
|-----------|-------|----------|
| JSON API requires auth | Reddit blocked unauthenticated API access (2023) | Use old.reddit.com HTML |
| Rate limiting | Aggressive rate limits for unauthenticated requests | User's browser = residential IP = less limiting |
| Bot detection | Cloudflare protection | Real browser fingerprint bypasses |
| Content in comments | Valuable info is in discussions, not just posts | Deep extraction patterns |

### Reddit Extraction Pattern

```typescript
// Pre-built pattern for Reddit extraction
const redditPattern: SitePattern = {
  domain: 'reddit.com',
  version: 3,

  // Use old.reddit.com for reliable HTML structure
  urlTransform: (url) => url.replace('www.reddit.com', 'old.reddit.com'),

  // Ensure trailing slash to avoid 301 redirects
  urlNormalize: (url) => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('/')) {
      parsed.pathname += '/';
    }
    return parsed.toString();
  },

  selectors: {
    // Subreddit listing
    posts: 'div.thing.link:not(.promoted)',
    postTitle: 'a.title',
    postAuthor: 'a.author',
    postScore: 'div.score.unvoted',
    postComments: 'a.bylink.comments',
    postUrl: 'data-url',

    // Post detail page
    postBody: 'div.usertext-body',
    comments: 'div.comment',
    commentAuthor: 'a.author',
    commentScore: 'span.score.unvoted',
    commentBody: 'div.usertext-body',
  },

  // Transform raw extractions
  transforms: {
    postScore: (s) => parseInt(s) || 0,
    commentScore: (s) => parseInt(s.replace(' points', '')) || 0,
  },

  // Pagination for search results
  pagination: {
    nextSelector: 'span.next-button a',
    maxPages: 5
  }
};
```

### Reddit Integration in Move Ahead

```typescript
// In Move Ahead's RAG enrichment pipeline

async function enrichWithCommunityExperiences(
  query: string,
  destination: string
): Promise<CommunityInsight[]> {

  // 1. Identify relevant subreddits
  const subreddits = getSubredditsForDestination(destination);
  // e.g., ['SpainExpats', 'IWantOut', 'digitalnomad', 'expats']

  // 2. Build search URLs
  const searches = subreddits.map(sub => ({
    url: `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(query)}&restrict_sr=on&sort=relevance&t=year`,
    subreddit: sub
  }));

  // 3. Fetch via user's browser
  const results = await UnbrowserConnect.batchFetch({
    urls: searches.map(s => s.url),
    options: {
      mode: 'background',
      fallback: 'popup',
      extract: {
        posts: true,
        comments: { depth: 2, limit: 10 }
      }
    },
    concurrency: 3
  });

  // 4. Process and rank by relevance
  return results
    .flatMap(r => r.content.posts)
    .map(post => ({
      source: 'reddit',
      subreddit: post.subreddit,
      title: post.title,
      score: post.score,
      commentCount: post.comments.length,
      topComments: post.comments.slice(0, 3),
      date: post.date,
      url: post.url
    }))
    .sort((a, b) => b.score - a.score);
}
```

---

## Government Portal Handling

Government websites are essential for Move Ahead but often have:
- Outdated technology (poor JavaScript support)
- Complex navigation (deep linking required)
- Frequent structural changes (selectors break)
- Multiple languages (localization challenges)

### Government Portal Strategy

```typescript
// Pattern for Spanish embassy sites
const spainEmbassyPattern: SitePattern = {
  domain: 'exteriores.gob.es',
  version: 2,

  selectors: {
    // Visa requirements page
    visaTypes: '.visa-type-list li',
    requirements: '.requirements-section',
    documents: '.document-list li',
    fees: '.fee-table td',
    processingTime: '.processing-info',

    // Contact information
    address: '.embassy-address',
    phone: '.contact-phone',
    email: '.contact-email',
    hours: '.office-hours'
  },

  // Handle multiple languages
  languageSelector: {
    es: '/es/',
    en: '/en/',
    detect: 'html[lang]'
  },

  // Content validation
  validation: {
    minContentLength: 200,
    requiredFields: ['requirements', 'documents'],
    freshnessIndicators: ['.last-updated', '.modification-date']
  }
};
```

### Freshness Detection

```typescript
// Detect if content has changed since last fetch
async function checkContentFreshness(
  url: string,
  lastHash: string
): Promise<{ fresh: boolean; newHash: string }> {

  const result = await UnbrowserConnect.fetch({
    url,
    mode: 'background',
    extract: {
      contentHash: true,  // SHA-256 of main content
      lastModified: '.last-updated',
      version: 'meta[name="version"]'
    }
  });

  return {
    fresh: result.content.contentHash !== lastHash,
    newHash: result.content.contentHash
  };
}
```

---

## Components

### 1. Frontend SDK (`@unbrowser/connect`)

#### 1.1 Core Module

```typescript
class UnbrowserConnect {
  private config: ConnectConfig;
  private patterns: PatternCache;
  private fetchers: FetcherManager;

  // Initialize the SDK
  static init(config: ConnectConfig): Promise<UnbrowserConnect>;

  // Single fetch
  fetch(options: FetchOptions): Promise<FetchResult>;

  // Batch fetch with concurrency control
  batchFetch(options: BatchFetchOptions): Promise<BatchFetchResult>;

  // Preload patterns for expected domains
  prefetch(urls: string[]): Promise<void>;

  // Check if a URL can be fetched in background mode
  canFetchBackground(url: string): Promise<boolean>;

  // Clear cached patterns
  clearCache(): void;
}
```

#### 1.2 Fetcher Module

| Fetcher | Visibility | Sites | Auth | CORS |
|---------|------------|-------|------|------|
| `IframeFetcher` | Hidden | Gov portals, public Reddit | No | Limited |
| `PopupFetcher` | Small popup | Reddit auth, LinkedIn | Yes | Full |
| `TabFetcher` | New tab | Complex multi-step | Yes | Full |

#### 1.3 Extraction Engine

Runs in the fetcher window (iframe/popup/tab):

```typescript
class ExtractionEngine {
  // Load site-specific patterns
  async loadPatterns(domain: string): Promise<void>;

  // Extract using patterns
  extractWithPattern(pattern: SitePattern): ExtractionResult;

  // Generic extraction (no pattern)
  extractGeneric(): ExtractionResult;

  // Reddit-specific extraction
  extractReddit(options: RedditExtractionOptions): RedditResult;

  // Government portal extraction
  extractGovernment(options: GovExtractionOptions): GovResult;
}
```

#### 1.4 Communication Layer

Secure message passing via postMessage:

```typescript
interface ConnectMessage {
  type: 'CONNECT_INIT' | 'CONNECT_FETCH' | 'CONNECT_RESULT' | 'CONNECT_ERROR';
  id: string;  // Request correlation ID
  payload: unknown;
  timestamp: number;
}
```

### 2. Connect Cloud API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/connect/init` | POST | Validate session token, return config |
| `/connect/patterns/:domain` | GET | Get extraction patterns for domain |
| `/connect/patterns` | POST | Submit pattern improvements |
| `/connect/analytics` | POST | Submit usage analytics |
| `/connect/fallback` | POST | Cloud fetch fallback (residential proxy) |

### 3. Pattern Distribution

```typescript
// Patterns are cached locally and synced from cloud
interface PatternCache {
  // Check local cache first
  get(domain: string): Promise<SitePattern | null>;

  // Fetch from cloud if not cached
  fetchFromCloud(domain: string): Promise<SitePattern>;

  // Store pattern locally (IndexedDB)
  store(domain: string, pattern: SitePattern): Promise<void>;

  // Check if pattern is stale
  isStale(pattern: CachedPattern): boolean;
}
```

---

## Data Flow

### Background Fetch Flow (Government Portals)

```
User asks about Spain visa
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Move Ahead Frontend                                              │
│                                                                  │
│  1. SDK creates hidden iframe                                    │
│  2. Iframe loads exteriores.gob.es                              │
│  3. Embassy sees: residential IP, real browser                   │
│  4. Page loads successfully (no bot detection)                   │
│  5. Extraction engine runs in iframe                             │
│  6. Structured data returned via postMessage                     │
│  7. Iframe destroyed                                             │
│                                                                  │
│  Total time: ~2-5 seconds                                        │
│  User sees: Nothing (invisible)                                  │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
AI responds with fresh visa requirements
```

### Popup Fetch Flow (Reddit with Auth)

```
User asks for community experiences
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Move Ahead Frontend                                              │
│                                                                  │
│  1. SDK opens popup to old.reddit.com                           │
│  2. If user not logged in: Reddit login page shown              │
│  3. User logs in (directly to Reddit - we see nothing)          │
│  4. SDK detects auth complete (URL change)                       │
│  5. Navigate to search results                                   │
│  6. Extract posts and comments                                   │
│  7. Return data, close popup                                     │
│                                                                  │
│  Total time: ~5-15 seconds (depends on user)                     │
│  User sees: Small popup, closes automatically                    │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
AI responds with community insights
```

---

## Security Considerations

### What We CAN'T Access (Browser Security)

| Data | Accessible? | Why |
|------|-------------|-----|
| User's Reddit password | No | Cross-origin isolation |
| Session cookies | No | HttpOnly, cross-origin |
| Keystrokes in popup | No | Separate browsing context |
| Other tabs | No | Tab isolation |

### What We CAN Access

| Data | Accessible? | When |
|------|-------------|------|
| Page content after load | Yes | After page fully loads |
| DOM structure | Yes | For extraction |
| Visible text | Yes | Public content |
| Network timing | Limited | For performance |

### API Key Security

```typescript
// Never expose API keys in frontend code
// Use server-generated session tokens instead

// SaaS Backend
app.get('/api/unbrowser-token', async (req, res) => {
  const token = await unbrowserConnect.createSessionToken({
    appId: process.env.UNBROWSER_APP_ID,
    userId: req.user.id,
    allowedDomains: ['reddit.com', 'exteriores.gob.es', '*.gov'],
    expiresIn: '1h'
  });
  res.json({ token });
});

// SaaS Frontend
const { token } = await fetch('/api/unbrowser-token').then(r => r.json());
await UnbrowserConnect.init({ sessionToken: token });
```

---

## Error Handling

| Error | Cause | Auto-Recovery | User Action |
|-------|-------|---------------|-------------|
| `IFRAME_BLOCKED` | X-Frame-Options: deny | Try popup | None |
| `POPUP_BLOCKED` | Browser blocked popup | Prompt | Click to allow |
| `RATE_LIMITED` | Too many requests | Backoff + retry | Wait |
| `TIMEOUT` | Slow page | Retry with longer timeout | Retry |
| `EXTRACTION_FAILED` | Pattern mismatch | Generic extraction | Report |
| `SITE_DOWN` | Target unreachable | Cloud fallback | None |

### Retry Strategy

```typescript
const strategies = [
  { mode: 'background', timeout: 10000 },  // Try iframe first
  { mode: 'background', timeout: 20000 },  // Retry with longer timeout
  { mode: 'popup', timeout: 30000 },       // Escalate to popup
  { mode: 'fallback', timeout: 45000 }     // Cloud fallback (last resort)
];
```

---

## Integration Example: Move Ahead

### Complete Integration

```typescript
// lib/unbrowser.ts - Move Ahead's Unbrowser integration

import { UnbrowserConnect } from '@unbrowser/connect';

let connectInstance: UnbrowserConnect | null = null;

export async function initUnbrowser(sessionToken: string) {
  connectInstance = await UnbrowserConnect.init({
    sessionToken,
    patterns: {
      preload: ['reddit.com', 'exteriores.gob.es', 'aeat.es']
    },
    onError: (error) => {
      console.error('Unbrowser error:', error);
      // Send to error tracking
    }
  });
}

export async function fetchOfficialSource(url: string) {
  if (!connectInstance) throw new Error('Unbrowser not initialized');

  return connectInstance.fetch({
    url,
    mode: 'background',
    extract: {
      structured: true,
      markdown: true
    }
  });
}

export async function fetchCommunityExperiences(
  query: string,
  subreddits: string[]
) {
  if (!connectInstance) throw new Error('Unbrowser not initialized');

  const urls = subreddits.map(sub =>
    `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(query)}&restrict_sr=on&sort=relevance&t=year`
  );

  return connectInstance.batchFetch({
    urls,
    options: {
      mode: 'background',
      fallback: 'popup',
      extract: {
        posts: true,
        comments: { depth: 2, limit: 5 }
      }
    },
    concurrency: 2
  });
}
```

### Usage in RAG Pipeline

```typescript
// lib/rag/enrichment.ts

export async function enrichQueryWithLiveData(
  query: string,
  destination: string
): Promise<EnrichedContext> {

  // 1. Fetch official sources (invisible to user)
  const officialData = await fetchOfficialSources(destination);

  // 2. Fetch community experiences (invisible or popup)
  const communityData = await fetchCommunityExperiences(
    query,
    getSubredditsForDestination(destination)
  );

  // 3. Combine and rank
  return {
    official: officialData,
    community: communityData,
    combinedContext: mergeAndRank(officialData, communityData)
  };
}
```

---

## Pricing Model

### Usage-Based Pricing

| Tier | Monthly Base | Included Fetches | Overage | Features |
|------|--------------|------------------|---------|----------|
| Starter | $49/mo | 5,000 | $0.01/fetch | Background mode |
| Growth | $199/mo | 25,000 | $0.008/fetch | + Popup mode, webhooks |
| Scale | $499/mo | 100,000 | $0.005/fetch | + Priority patterns, SLA |
| Enterprise | Custom | Custom | Custom | + Custom patterns, support |

### What Counts as a Fetch

- Successful background fetch: 1 fetch
- Successful popup fetch: 1 fetch
- Failed (our fault): 0 fetches
- Failed (site down): 0.25 fetches
- Cloud fallback used: 2 fetches (more expensive)

---

## Implementation Backlog

### Phase 1: MVP Core (Priority: P0)

**Goal**: Basic SDK that can fetch Reddit and government portals via background iframe.

| Task ID | Task | Complexity | Dependencies |
|---------|------|------------|--------------|
| CONN-001 | Project setup (tsup, TypeScript, package.json) | S | None |
| CONN-002 | Core SDK class with init() and basic config | M | CONN-001 |
| CONN-003 | Iframe fetcher implementation | L | CONN-002 |
| CONN-004 | postMessage communication layer | M | CONN-003 |
| CONN-005 | Basic extraction engine (text, HTML, selectors) | L | CONN-004 |
| CONN-006 | Reddit pattern (old.reddit.com) | M | CONN-005 |
| CONN-007 | Error handling framework | M | CONN-003 |
| CONN-008 | Basic retry logic | S | CONN-007 |

**Deliverable**: SDK can fetch Reddit threads invisibly.

### Phase 2: Popup Mode (Priority: P0)

**Goal**: Handle sites that block iframes or require authentication.

| Task ID | Task | Complexity | Dependencies |
|---------|------|------------|--------------|
| CONN-009 | X-Frame-Options detection | M | CONN-003 |
| CONN-010 | Popup fetcher implementation | L | CONN-004 |
| CONN-011 | Auth detection (URL change monitoring) | M | CONN-010 |
| CONN-012 | Auto-close popup on completion | S | CONN-011 |
| CONN-013 | Fallback: iframe -> popup | M | CONN-009, CONN-010 |
| CONN-014 | User-facing auth prompt UI | M | CONN-010 |

**Deliverable**: SDK can handle Reddit auth and blocked iframes.

### Phase 3: Pattern System (Priority: P1)

**Goal**: Site-specific extraction patterns with caching.

| Task ID | Task | Complexity | Dependencies |
|---------|------|------------|--------------|
| CONN-015 | Pattern schema definition | M | CONN-005 |
| CONN-016 | IndexedDB pattern cache | M | CONN-015 |
| CONN-017 | Pattern loading from cloud | M | CONN-016 |
| CONN-018 | Government portal patterns (Spain) | L | CONN-015 |
| CONN-019 | Pattern versioning and updates | M | CONN-016 |
| CONN-020 | Generic fallback extraction | M | CONN-005 |

**Deliverable**: Patterns cached locally, auto-updated from cloud.

### Phase 4: Cloud API (Priority: P1)

**Goal**: Backend services for pattern sync, analytics, and fallback.

| Task ID | Task | Complexity | Dependencies |
|---------|------|------------|--------------|
| CONN-021 | Session token generation endpoint | M | None |
| CONN-022 | Pattern sync endpoint | M | CONN-015 |
| CONN-023 | Analytics collection endpoint | M | None |
| CONN-024 | Usage tracking and quotas | L | CONN-023 |
| CONN-025 | Cloud fallback fetch (residential proxy) | L | None |
| CONN-026 | Rate limiting per app | M | CONN-024 |

**Deliverable**: Full cloud infrastructure supporting SDK.

### Phase 5: Move Ahead Integration (Priority: P1)

**Goal**: Integrate with Move Ahead as first customer.

| Task ID | Task | Complexity | Dependencies |
|---------|------|------------|--------------|
| CONN-027 | Move Ahead SDK integration | M | Phase 1-2 |
| CONN-028 | Spain embassy patterns | L | CONN-018 |
| CONN-029 | RAG enrichment with live data | L | CONN-027 |
| CONN-030 | Reddit community fetch in chat | M | CONN-027 |
| CONN-031 | Performance optimization | M | CONN-027 |
| CONN-032 | Error handling in Move Ahead UI | M | CONN-027 |

**Deliverable**: Move Ahead using Connect for live data.

### Phase 6: Polish & Launch (Priority: P2)

**Goal**: Production-ready SDK with documentation.

| Task ID | Task | Complexity | Dependencies |
|---------|------|------------|--------------|
| CONN-033 | Comprehensive documentation | L | Phase 1-4 |
| CONN-034 | React hook examples | M | CONN-033 |
| CONN-035 | TypeScript types package | M | CONN-033 |
| CONN-036 | CDN distribution (connect.js) | M | Phase 1 |
| CONN-037 | npm package publication | M | Phase 1 |
| CONN-038 | Error message improvements | S | CONN-007 |
| CONN-039 | Performance benchmarks | M | Phase 1-3 |

**Deliverable**: Public launch-ready SDK.

### Phase 7: Dashboard (Priority: P2)

**Goal**: Web UI for customers to manage integration.

| Task ID | Task | Complexity | Dependencies |
|---------|------|------------|--------------|
| CONN-040 | Dashboard UI scaffold | L | Phase 4 |
| CONN-041 | API key management | M | CONN-040 |
| CONN-042 | Usage analytics display | M | CONN-040 |
| CONN-043 | Pattern testing tool | L | CONN-040 |
| CONN-044 | Webhook configuration | M | CONN-040 |
| CONN-045 | Billing integration | L | CONN-040 |

**Deliverable**: Self-service dashboard for customers.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Background fetch success | >95% | Successful / total background attempts |
| Popup fetch success | >90% | Successful / total popup attempts |
| Average latency (background) | <3s | Time from fetch() to result |
| Average latency (popup) | <15s | Including user auth time |
| Pattern coverage | Top 100 sites | Sites with dedicated patterns |
| Move Ahead adoption | 100% of live fetches | Percentage using Connect vs cloud |

---

## Open Questions

1. **Popup UX on mobile**: Popups are problematic on mobile. Consider overlay mode?

2. **Offline capability**: Should extraction work offline with cached patterns?

3. **Multi-language patterns**: How to handle sites in multiple languages?

4. **Pattern contribution**: Should customers be able to contribute patterns?

5. **Fallback pricing**: Cloud fallback is expensive. Separate pricing tier?

---

*Document Version: 0.2.0*
*Last Updated: 2026-01-02*
