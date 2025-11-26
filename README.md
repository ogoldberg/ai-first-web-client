# LLM Browser MCP Server v0.2

An intelligent, self-learning browser designed for AI agents. Unlike traditional web scraping tools, this MCP server learns from every interaction, building intelligence that makes it more effective over time.

## The Core Idea

**Traditional scraping tools** are stateless - every request starts from scratch.

**LLM Browser** is stateful and intelligent:
- Learns which selectors work for content extraction
- Discovers API endpoints and when they can bypass rendering
- Tracks which sites change frequently
- Applies learned patterns across similar domains
- Validates responses to detect errors
- Automatically handles pagination

The more you use it, the smarter it gets.

## Quick Start

```bash
# Install and build
cd ai-first-web-client
npm install
npx playwright install chromium
npm run build

# Add to Claude Desktop config
# ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "llm-browser": {
      "command": "node",
      "args": ["/path/to/ai-first-web-client/dist/index.js"]
    }
  }
}
```

## Primary Tool: `smart_browse`

This is the recommended tool for all browsing. It automatically applies all learned intelligence.

```
User: "Get visa requirements from extranjeria.gob.es"

Claude: smart_browse("https://extranjeria.gob.es/es/visados")

Returns:
{
  "content": { "markdown": "...", "textLength": 5234 },
  "tables": [{ "headers": ["Visa Type", "Fee"], "data": [...] }],
  "intelligence": {
    "confidenceLevel": "high",
    "domainGroup": "spanish_gov",
    "validationPassed": true,
    "paginationAvailable": true,
    "selectorsSucceeded": 3
  },
  "discoveredApis": [
    { "endpoint": "/api/visados", "canBypassBrowser": true }
  ]
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | URL to browse (required) |
| `contentType` | enum | Content type hint: `main_content`, `requirements`, `fees`, `timeline`, `documents`, `table` |
| `followPagination` | boolean | Follow detected pagination to get all pages |
| `maxPages` | number | Maximum pages to follow (default: 5) |
| `checkForChanges` | boolean | Compare with cached version to detect changes |
| `waitForSelector` | string | CSS selector to wait for (for SPAs) |
| `scrollToLoad` | boolean | Scroll to trigger lazy-loaded content |
| `sessionProfile` | string | Session profile for authenticated access |

## Learning System

### What It Learns

1. **Content Selectors** - Which CSS selectors reliably extract content for each domain
2. **Selector Fallbacks** - Backup selectors when primary fails
3. **API Patterns** - Discovered APIs that can bypass browser rendering
4. **Validation Rules** - What valid content looks like (to detect error pages)
5. **Change Frequency** - How often content updates (for refresh scheduling)
6. **Pagination Patterns** - How sites paginate their content
7. **Failure Patterns** - What causes failures (to avoid and recover)

### Domain Groups

Pre-configured patterns for government sites that share conventions:

**Spanish Government** (`spanish_gov`):
- boe.es, extranjeria.inclusion.gob.es, agenciatributaria.es, seg-social.es

**US Government** (`us_gov`):
- uscis.gov, irs.gov, state.gov, ssa.gov, travel.state.gov

**EU Government** (`eu_gov`):
- ec.europa.eu, europa.eu, europarl.europa.eu

When you browse a site in a domain group, learned patterns from similar sites are automatically applied.

### Confidence Decay

Learned patterns decay over time if not verified:
- Patterns have a 14-day grace period
- After grace period, confidence decreases weekly
- Low-confidence patterns are eventually archived
- Using a pattern resets its confidence

This prevents stale patterns from causing failures when sites change.

## Intelligence Tools

### `get_domain_intelligence`

Check what the browser knows about a domain before browsing:

```
Claude: get_domain_intelligence("boe.es")

Returns:
{
  "domain": "boe.es",
  "knownPatterns": 5,
  "selectorChains": 12,
  "validators": 3,
  "paginationPatterns": 2,
  "successRate": 0.95,
  "domainGroup": "spanish_gov",
  "recommendations": [
    "Part of spanish_gov group - shared patterns will be applied",
    "12 learned selectors available for reliable extraction",
    "Pagination patterns learned - use followPagination for multi-page content"
  ]
}
```

### `get_learning_stats`

Get overall learning statistics:

```
Claude: get_learning_stats()

Returns:
{
  "summary": {
    "totalDomains": 15,
    "totalApiPatterns": 47,
    "bypassablePatterns": 23,
    "totalSelectors": 89,
    "totalValidators": 12,
    "domainGroups": ["spanish_gov", "us_gov", "eu_gov"]
  },
  "recentLearning": [
    { "type": "selector_learned", "domain": "boe.es", "timestamp": "..." },
    { "type": "api_discovered", "domain": "uscis.gov", "timestamp": "..." }
  ]
}
```

## Architecture

```
                    smart_browse (Primary Interface)
                              |
          +-------------------+-------------------+
          |                   |                   |
    Learning Engine     Smart Browser       Utilities
          |                   |                   |
    +-----+-----+      +------+------+     +------+------+
    |           |      |             |     |             |
  Selector   Pattern  Content     API    Rate      Retry
  Chains    Validator Extractor  Calls  Limiter   Logic
    |           |      |             |     |             |
    +-----------+------+-------------+-----+-------------+
                              |
                    Browser Manager (Playwright)
                              |
                    Session Manager (Auth)
```

### Key Components

**SmartBrowser** (`src/core/smart-browser.ts`)
- Orchestrates all learning features
- Applies selector fallback chains
- Validates responses
- Handles pagination

**LearningEngine** (`src/core/learning-engine.ts`)
- Stores and retrieves learned patterns
- Applies confidence decay
- Transfers patterns across domain groups
- Tracks failure contexts

**BrowserManager** (`src/core/browser-manager.ts`)
- Playwright wrapper for browsing
- Network capture and API discovery
- Session and cookie management

## Utility Modules

All utilities are automatically used by `smart_browse`, but can also be used directly:

### Rate Limiting
```typescript
// Pre-configured for government sites
// boe.es: 10 req/min, extranjeria: 6 req/min
await rateLimiter.acquire(url);
```

### Retry with Backoff
```typescript
// Automatic retry on timeout/network errors
const result = await withRetry(operation, { maxAttempts: 3 });
```

### Content Extraction
```typescript
// HTML to markdown with table support
const { markdown, tables } = extractor.extract(html);
```

### PDF Extraction
```typescript
// Extract structured content from PDFs
const { sections, lists, keyValues } = await pdfExtractor.extractStructured(url);
```

## Comparison

| Feature | Jina/Firecrawl | Puppeteer | LLM Browser |
|---------|---------------|-----------|-------------|
| Clean content | Yes | No | Yes |
| API discovery | No | No | Yes |
| Learning | No | No | Yes |
| Selector fallbacks | No | No | Yes |
| Response validation | No | No | Yes |
| Cross-domain patterns | No | No | Yes |
| Pagination detection | No | No | Yes |
| Change tracking | No | No | Yes |
| Rate limiting | No | Manual | Automatic |
| Session persistence | No | Manual | Yes |
| LLM-native (MCP) | No | No | Yes |

## Development

```bash
npm run dev    # Watch mode
npm run build  # Build
npm start      # Run MCP server
```

## Storage

- `./sessions/` - Saved authentication sessions
- `./knowledge-base.json` - Legacy pattern storage
- `./enhanced-knowledge-base.json` - Full learning state

## Roadmap

**Completed:**
- Smart browsing with automatic learning
- Selector fallback chains
- Cross-domain pattern transfer
- Response validation
- Confidence decay
- Pagination detection
- Change frequency tracking
- Failure context learning

**Coming Soon:**
- Action recording/replay
- Natural language selectors
- Pattern export/import
- Stealth mode for anti-bot sites

## License

MIT
