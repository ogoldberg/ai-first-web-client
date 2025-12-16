# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **LLM Browser MCP Server** - an intelligent browser designed specifically for LLM interactions, not humans. Unlike traditional web scraping tools that just extract content, this learns from browsing patterns, discovers API endpoints automatically, and progressively optimizes to bypass browser rendering entirely.

### Core Philosophy: "Browser Minimizer"

The goal is to **progressively eliminate the need for rendering**:

- **First visit**: Use Content Intelligence (fastest) or lightweight rendering
- **Learning**: Discover APIs, learn patterns, build procedural skills
- **Future visits**: Direct API calls or cached patterns = 10x faster

### Key Features

1. **Tiered Rendering**: Intelligence (~50-200ms) -> Lightweight (~200-500ms) -> Playwright (~2-5s, optional)
2. **Content Intelligence**: Framework extraction (Next.js, etc.), structured data, API prediction
3. **Procedural Memory**: Learns and replays browsing skills with versioning and rollback
4. **API Discovery**: Automatically discovers and caches API patterns
5. **Session Management**: Persistent authenticated sessions
6. **Anomaly Detection**: Identifies bot challenges, error pages, rate limiting

### Design Principles

- **Smart Execution, Dumb Orchestration**: Server is smart about HOW, LLM controls WHAT
- **Tools, Not Agents**: Provides intelligent primitives that LLMs compose
- **Playwright Optional**: Works without full browser for most sites

## Development Commands

```bash
# Install dependencies
npm install
npx playwright install chromium  # Optional - works without Playwright

# Build TypeScript
npm run build

# Run tests
npm test

# Development (watch mode)
npm run dev

# Start server
npm start

# Manual testing scripts (in scripts/ directory)
node scripts/dogfood.js browse https://example.com
```

## Architecture

### The Hybrid Intelligence Layer

The system uses **confidence scoring** to decide when to bypass rendering:

```
High Confidence → Direct API Call (fast, no rendering)
├─ Simple REST endpoints with predictable patterns
├─ Standard authentication (cookies, bearer tokens)
└─ Static request structures

Medium Confidence → Lightweight JS Execution
├─ Some client-side logic required
└─ Try to extract and replay JS functions

Low Confidence → Full Browser Rendering
├─ Complex JS-generated request signatures
├─ Anti-bot measures requiring full browser fingerprint
└─ State-dependent payloads
```

**The JS-Heavy Challenge**: Some sites require rendering to understand request generation logic. The system learns which sites can be bypassed and which require the full browser, optimizing over time.

### Core Components (src/core/)

1. **SmartBrowser** (`smart-browser.ts`)
   - Main orchestrator for intelligent browsing
   - Integrates learning, procedural memory, and tiered rendering
   - Handles anomaly detection and bot challenges

2. **TieredFetcher** (`tiered-fetcher.ts`)
   - Manages the rendering tier cascade (intelligence -> lightweight -> playwright)
   - Tracks domain preferences and success rates
   - Falls back gracefully when tiers fail

3. **ContentIntelligence** (`content-intelligence.ts`)
   - Fastest tier: extracts data without browser rendering
   - Framework detection (Next.js, Nuxt, Gatsby, Remix)
   - Structured data extraction (JSON-LD, OpenGraph)
   - API prediction and Google Cache fallbacks

4. **LightweightRenderer** (`lightweight-renderer.ts`)
   - Medium tier: linkedom + Node VM for simple JS execution
   - Handles pages needing basic JavaScript
   - Much faster than full browser

5. **ProceduralMemory** (`procedural-memory.ts`)
   - Learns browsing skills from trajectories
   - Skill versioning with rollback support
   - Anti-patterns (what NOT to do)
   - User feedback integration

6. **LearningEngine** (`learning-engine.ts`)
   - API pattern discovery and validation
   - Selector learning with fallback chains
   - Content change detection
   - Anomaly detection (bot challenges, errors)

7. **BrowserManager**, **SessionManager**, **KnowledgeBase**, **ApiAnalyzer**
   - Core infrastructure components

### Directory Structure

```text
src/
├── core/           # Core components
├── tools/          # MCP tool implementations
├── types/          # TypeScript type definitions
└── utils/          # Utility functions (cache, retry, rate-limiter)

tests/              # Vitest test suites
scripts/            # Manual testing tools
docs/               # Project documentation
```

## MCP Integration

This server is designed to be used with Claude Desktop. Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "llm-browser": {
      "command": "node",
      "args": ["/absolute/path/to/ai-first-web-client/dist/index.js"]
    }
  }
}
```

After changes, rebuild (`npm run build`) and restart Claude Desktop.

## TypeScript Configuration

- **Module System**: ES2022 with Node16 module resolution
- **Output**: Compiled to `dist/` directory
- **Import Extensions**: All imports use `.js` extension (even for `.ts` files) due to Node16 module resolution
- **Strict Mode**: Enabled

## Data Flow

1. **Browse Request** → BrowseTool → BrowserManager (creates Page with listeners) → page navigates → captures network/console → ContentExtractor (HTML→markdown) → ApiAnalyzer (discovers patterns) → KnowledgeBase (stores patterns) → SessionManager (checks for saved session) → returns BrowseResult

2. **API Call Request** → ApiCallTool → SessionManager (loads session cookies) → BrowserManager (gets context) → makes direct request with auth → returns response (bypassing rendering)

## How It Works in Practice

### Example: First Visit to E-commerce Site
```
User: "Get products from example.com"

1. BrowseTool loads page in browser (full rendering)
2. BrowserManager captures all network traffic
3. ApiAnalyzer discovers: GET /api/products?page=1
4. KnowledgeBase stores pattern with confidence: "high"
5. Returns: page content + discovered APIs
```

### Example: Subsequent Visit (Optimized)
```
User: "Get more products from example.com"

1. BrowseTool checks KnowledgeBase
2. Finds high-confidence pattern: /api/products
3. ApiCallTool makes direct API call (no rendering!)
4. Returns: data in ~200ms vs ~3s for full render
5. Result: 15x faster, no browser overhead
```

### Example: Authenticated Access
```
User: "Get my dashboard data from app.com"

1. First time: Manual login, SessionManager saves cookies
2. Future requests: Automatically loads saved session
3. Access authenticated APIs directly
4. No re-login needed
```

## What Makes This Different

### vs Traditional Scraping Tools (Jina, Firecrawl)
- **They return**: Clean markdown/HTML from full page renders every time
- **We return**: Content + network data + discovered APIs, then bypass rendering when possible
- **Result**: They're fast for one-offs, we're optimized for repeated access

### vs Browser Automation (Puppeteer, Playwright)
- **They provide**: Browser control APIs requiring code generation
- **We provide**: MCP tools that LLMs use naturally with built-in intelligence
- **Result**: No code generation needed, automatic optimization over time

### vs Chrome DevTools MCP
- **They expose**: Network requests and console logs for debugging
- **We add**: API discovery, pattern learning, direct API execution, session management
- **Result**: Not just inspection, but progressive optimization

## Important Notes

- Sessions and knowledge base are gitignored - they contain potentially sensitive auth data
- Browser contexts are profile-specific - multiple sessions can coexist
- API discovery is automatic and passive - no explicit analysis needed
- JSON responses and common API URL patterns are automatically flagged
- Console logs include source location when available
- The system learns from every browse operation and gets smarter over time
- First render of a site is slower (learning phase), subsequent accesses are much faster
