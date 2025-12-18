# llm-browser

> **This is NOT an AI-enhanced browser for humans.**
> This is a web browser where **the user is an LLM**.

A browser that AI agents control directly via MCP. It learns from every interaction, discovers APIs automatically, and progressively optimizes to bypass rendering entirely. Machine-first, not human-first.

## What This Actually Does

When an LLM browses with `llm-browser`:

1. **First visit**: Uses tiered rendering (fastest method that works)
2. **Learning**: Discovers APIs, learns selectors, builds reusable skills
3. **Future visits**: Often skips browser rendering entirely for 10x faster access

```text
First visit:  LLM -> smart_browse -> Full render (~2-5s) -> Content + learned patterns
Next visit:   LLM -> smart_browse -> API call (~200ms)   -> Same content, much faster
```

## What This Does NOT Do

- **Not a visual browser** - No screenshots, no visual rendering for humans
- **Not magic** - Complex JS-heavy sites still need the browser
- **Not stealth** - Sites with aggressive bot detection may block it
- **No code generation** - LLMs use MCP tools directly, no Puppeteer scripts needed

## Installation

```bash
npm install llm-browser
```

### Optional Dependencies

Both of these are optional and the package works without them:

```bash
# For full browser rendering (recommended for best compatibility)
npm install playwright
npx playwright install chromium

# For neural embeddings (better cross-domain skill transfer)
npm install @xenova/transformers
```

Without Playwright, the browser uses Content Intelligence and Lightweight rendering tiers only. Without transformers, it falls back to hash-based embeddings.

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "llm-browser": {
      "command": "npx",
      "args": ["llm-browser"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "llm-browser": {
      "command": "llm-browser"
    }
  }
}
```

Then restart Claude Desktop. The browser tools will be available.

## Programmatic Usage

```typescript
import { createLLMBrowser } from 'llm-browser/sdk';

const browser = await createLLMBrowser();

// Browse a page (learns from the interaction)
const result = await browser.browse('https://example.com');
console.log(result.content.markdown);
console.log(result.discoveredApis);

// On subsequent visits, may use learned APIs directly
const result2 = await browser.browse('https://example.com/page2');

await browser.cleanup();
```

## How It Works

### Tiered Rendering

The browser tries the fastest approach first, falling back only when needed:

| Tier | Speed | What It Does | When It's Used |
|------|-------|--------------|----------------|
| **Content Intelligence** | ~50-200ms | Static HTML + framework extraction | Sites with server-rendered content |
| **Lightweight** | ~200-500ms | linkedom + Node VM | Sites needing basic JavaScript |
| **Playwright** | ~2-5s | Full browser | Sites requiring complex JS or interactions |

The system remembers which tier works for each domain and uses it next time.

### Learning System

Every browse operation teaches the system:

- **Selector patterns**: Which CSS selectors reliably extract content
- **API endpoints**: Discovered APIs that can bypass rendering
- **Validation rules**: What valid content looks like (to detect errors)
- **Browsing skills**: Reusable action sequences (click, fill, extract)

### Semantic Embeddings

Skills are matched using neural embeddings (when `@xenova/transformers` is installed) or hash-based embeddings (fallback). This enables:

- Skills learned on one site can apply to similar sites
- Automatic domain similarity detection
- Cross-domain pattern transfer

## MCP Tools

### Primary Tool

**`smart_browse`** - The main tool. Automatically applies all learned intelligence.

```text
Parameters:
- url (required): URL to browse
- contentType: Hint for extraction ('main_content', 'table', 'form', etc.)
- followPagination: Follow detected pagination
- waitForSelector: CSS selector to wait for (SPAs)
- scrollToLoad: Scroll to trigger lazy content
- sessionProfile: Use saved authentication session
```

### Intelligence Tools

| Tool | Purpose |
|------|---------|
| `get_domain_intelligence` | Check what the browser knows about a domain |
| `get_learning_stats` | Overall learning statistics |
| `get_tiered_fetcher_stats` | Rendering tier performance |

### Skill Management Tools

| Tool | Purpose |
|------|---------|
| `get_procedural_memory_stats` | View learned skills |
| `find_applicable_skills` | Find skills for a URL |
| `get_skill_explanation` | Human-readable skill description |
| `rate_skill_application` | Feedback (thumbs up/down) |
| `bootstrap_skills` | Initialize with common templates |

### Session Tools

| Tool | Purpose |
|------|---------|
| `save_session` | Save authenticated session |
| `list_sessions` | List saved sessions |
| `get_session_health` | Check session validity |

## Configuration

Environment variables:

```bash
LOG_LEVEL=info          # debug, info, warn, error, silent
LOG_PRETTY=true         # Pretty print logs (dev mode)
```

## Storage

The browser stores learned patterns in the current directory:

- `./sessions/` - Saved authentication sessions
- `./enhanced-knowledge-base.json` - Learned patterns and validators
- `./procedural-memory.json` - Browsing skills and workflows
- `./embedding-cache.json` - Cached embeddings (when using transformers)

## Comparison with Alternatives

| Feature | Jina/Firecrawl | Puppeteer | llm-browser |
|---------|---------------|-----------|-------------|
| Clean content extraction | Yes | No | Yes |
| API discovery | No | No | Yes |
| Learning over time | No | No | Yes |
| Selector fallbacks | No | No | Yes |
| MCP integration | No | No | Yes |
| Works without browser | No | No | Yes (partial) |
| Progressive optimization | No | No | Yes |

## Limitations

Be honest about what this can and can't do:

**Works well for:**

- Government websites, documentation sites
- E-commerce product listings
- News and content sites
- Sites with discoverable APIs

**May struggle with:**

- Heavy SPAs that require complex interaction flows
- Sites with aggressive bot detection (Cloudflare challenges)
- Sites requiring visual verification (CAPTCHAs)
- Real-time applications (chat, streaming)

## Development

```bash
git clone https://github.com/anthropics/llm-browser
cd llm-browser
npm install
npm run build
npm test
```

## License

MIT
