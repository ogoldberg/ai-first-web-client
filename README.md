# LLM Browser MCP Server v0.3

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
8. **Browsing Skills** - Reusable action sequences learned from successful trajectories (v0.3)

### Procedural Memory (v0.3)

The procedural memory system learns reusable browsing skills from successful interactions:

```
User: "Extract data from this government form"

Claude: smart_browse("https://example.gov/forms/application")

Behind the scenes:
1. Record browsing trajectory (actions taken)
2. Create vector embedding of page context
3. Match against existing skills (cosine similarity)
4. If successful, extract and store as new skill
5. Skills are automatically applied to similar pages
```

**Key Features:**
- **Embedding-based skill matching** - Find relevant skills across different domains
- **Automatic skill extraction** - Learn from successful browsing sessions
- **Skill composition** - Combine skills into multi-step workflows
- **Active learning** - Identify coverage gaps and suggest improvements
- **Decay and pruning** - Remove stale or failing skills automatically

**MCP Tools:**
- `get_procedural_memory_stats` - View learned skills and metrics
- `find_applicable_skills` - Find skills for a given URL
- `get_skill_details` - Inspect a specific skill
- `manage_skills` - Export, import, prune, or reset skills

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
     +------------------------+------------------------+
     |                        |                        |
Learning Engine      Procedural Memory         Smart Browser
     |                        |                        |
+----+----+            +------+------+          +------+------+
|         |            |             |          |             |
Selector Pattern     Skill        Skill       Content      API
Chains  Validator  Embeddings   Workflows    Extractor   Calls
     |         |            |             |          |             |
     +---------+------------+-------------+----------+-------------+
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
- Records browsing trajectories

**LearningEngine** (`src/core/learning-engine.ts`)
- Stores and retrieves learned patterns
- Applies confidence decay
- Transfers patterns across domain groups
- Tracks failure contexts

**ProceduralMemory** (`src/core/procedural-memory.ts`)
- Learns reusable browsing skills from trajectories
- Vector embedding-based skill retrieval
- Skill composition into workflows
- Active learning for coverage gaps
- Automatic decay and pruning

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
- `./procedural-memory.json` - Learned browsing skills and workflows

## Roadmap

### Completed (v0.1 - v0.2)
- Smart browsing with automatic learning
- Selector fallback chains
- Cross-domain pattern transfer
- Response validation
- Confidence decay
- Pagination detection
- Change frequency tracking
- Failure context learning

### Completed (v0.3)
- Procedural memory with embedding-based skill retrieval
- Automatic skill extraction from successful trajectories
- Skill decay and pruning for maintenance
- Page context detection (forms, tables, pagination)
- Skill composition into workflows
- Active learning for coverage gap identification
- MCP tools for skill management (export/import/prune/reset)

### Planned - High Impact

| Feature | Description | Status |
|---------|-------------|--------|
| **Skill Versioning & Rollback** | Track skill evolution over time, revert if performance degrades | Planned |
| **Real Neural Embeddings** | Use sentence-transformers or similar for semantic embeddings instead of hash-based | Planned |
| **Negative Skills (Anti-patterns)** | Learn what NOT to do on certain sites (e.g., "never click this popup") | Planned |
| **Skill Explanation** | Generate human-readable descriptions of what a skill does and why it matched | Planned |
| **User Feedback Loop** | Allow explicit thumbs up/down on skill applications to accelerate learning | Planned |

### Planned - Medium Impact

| Feature | Description | Status |
|---------|-------------|--------|
| **Fallback Skill Chains** | Define ordered fallback skills when primary fails | Planned |
| **Skill Generalization** | Automatically abstract domain-specific skills to work cross-domain | Planned |
| **Temporal Patterns** | Learn time-based behaviors (sites that update at specific times, rate limits by hour) | Planned |
| **Skill Dependencies** | Define prerequisite skills (e.g., "login" before "access dashboard") | Planned |
| **Performance Benchmarking Dashboard** | Track metrics over time with trend analysis | Planned |

### Planned - Nice to Have

| Feature | Description | Status |
|---------|-------------|--------|
| **Skill Sharing/Community Repository** | Import/export skills from a central catalog | Planned |
| **A/B Testing for Skills** | Test skill variations to find optimal approaches | Planned |
| **Skill Decomposition** | Automatically break complex skills into reusable atomic sub-skills | Planned |
| **Visual Skill Editor** | UI to view/edit skill action sequences | Planned |
| **Confidence Calibration** | Ensure similarity scores actually correlate with success probability | Planned |

### Other Planned Features
- Natural language selectors
- Stealth mode for anti-bot sites
- Multi-browser support (Firefox, WebKit)
- Distributed learning across instances

## License

MIT
