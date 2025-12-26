# Unbrowser Examples

This directory contains comprehensive examples demonstrating Unbrowser's intelligent web browsing capabilities.

## What is Unbrowser?

Unbrowser is an AI-first web browsing API that learns from every interaction to progressively eliminate rendering overhead. It combines:

- **Tiered Rendering**: Intelligence (~50ms) → Lightweight (~200-500ms) → Playwright (~2-5s)
- **API Discovery**: Automatically discovers and caches API patterns
- **Content Intelligence**: Framework extraction, structured data, article detection
- **Procedural Memory**: Learns and replays browsing skills
- **Session Management**: Persistent authenticated sessions

## Prerequisites

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Optional: Install Playwright for full rendering tier
npx playwright install chromium
```

## Running Examples

### 1. Using the MCP Server (Claude Desktop)

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "unbrowser": {
      "command": "npx",
      "args": ["llm-browser"]
    }
  }
}
```

Then use the examples in conversation with Claude.

### 2. Using the SDK Directly (Local)

For local processing where all browsing intelligence runs on your machine:

```typescript
// Published npm package usage (for end users)
import { createLLMBrowser } from 'llm-browser/sdk';

// Note: Example files in this directory use relative imports
// (e.g., '../src/sdk.js') for development - end users should
// use the npm package import shown above.

const browser = await createLLMBrowser();
const result = await browser.browse('https://example.com');
console.log(result.content.markdown);
```

### 3. Using the Cloud API

```bash
# Set your API key
export UNBROWSER_API_KEY=ub_live_xxxxx

# Use the SDK
npm install @unbrowser/core
```

```typescript
import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: process.env.UNBROWSER_API_KEY,
});

const result = await client.browse('https://example.com');
console.log(result.content.markdown);
```

## Example Workflows

| Example | Description | Features Demonstrated |
|---------|-------------|----------------------|
| [Article Extraction](./article-extraction.ts) | Extract article content from news sites | Content Intelligence, Article Detection |
| [GitHub Intelligence](./github-intelligence.ts) | Extract repository data and discover APIs | API Discovery, Multi-page Navigation |
| [E-commerce Monitoring](./ecommerce-monitoring.ts) | Monitor product prices and availability | Skill Learning, Change Detection |
| [LinkedIn Extraction](./linkedin-extraction.ts) | Extract profile data (skill pack demo) | Skill Packs, Procedural Memory |
| [Company Research](./company-research.ts) | Multi-page company data gathering | Workflow Orchestration, Data Aggregation |
| [Playwright Debug](./playwright-debug.ts) | Visual debugging with screenshots | Debug Mode, Teaching Mode |
| [API Fuzzing](./api-fuzzing.ts) | Discover hidden API endpoints | Fuzzing Discovery, Pattern Learning |
| [E2E API Testing](./e2e-api-testing.ts) | **QA Use Case**: Full API test suite | API Testing, JUnit Reports, Regression Detection |
| [Content Validation Suite](./content-validation-suite.ts) | **QA Use Case**: Content validation tests | Verification Checks, Vitest Integration, Confidence Thresholds |
| [Multi-Site Regression](./multi-site-regression.ts) | **QA Use Case**: Cross-site pattern testing | Baseline Comparison, Regression Detection, Pattern Reuse |
| [Workflow Recording/Replay](./workflow-recording-replay.ts) | **QA Use Case**: Record and replay browsing sessions | Workflow Recording, Variable Substitution, Test Automation |
| [API Change Detection](./api-change-detection.ts) | **QA Use Case**: Detect API response changes | Schema Extraction, Breaking Changes, Baseline Comparison |

## Key Features Demonstrated

### Tiered Rendering Strategy

Unbrowser automatically selects the fastest tier that can satisfy your request:

1. **Intelligence Tier (~50ms)**: Cached patterns, framework data, OpenAPI specs
2. **Lightweight Tier (~200-500ms)**: Minimal JS execution with linkedom + Node VM
3. **Playwright Tier (~2-5s)**: Full browser rendering when needed

**The more you use it, the faster it gets!** Patterns learned on first visit enable faster subsequent accesses.

### Content Intelligence

Automatically extracts:
- Next.js/React framework data (`__NEXT_DATA__`, `__REACT_APP_STATE__`)
- Structured data (Schema.org, OpenGraph, JSON-LD)
- Article metadata (author, publish date, tags, reading time)
- API patterns from network traffic

### API Discovery

Discovers APIs through:
- OpenAPI/Swagger spec detection
- AsyncAPI spec parsing
- Network traffic analysis
- Fuzzing common paths (`/api`, `/v1`, `/graphql`)

Once discovered, APIs are used directly, bypassing rendering entirely.

### Procedural Memory (Skills)

Learns multi-step browsing patterns:
- Cookie banner dismissal
- Pagination navigation
- Form filling sequences
- Table extraction workflows

Skills are versioned, rolled back on failure, and shared across domains.

### Session Management

Maintains authenticated sessions:
- Cookie persistence
- Token management
- OAuth flow completion
- Session health checks

## Progressive Learning

Unbrowser gets smarter over time:

| Visit | Strategy | Speed | Learning |
|-------|----------|-------|----------|
| First | Playwright (full render) | ~2-5s | Discover APIs, learn patterns |
| Second | Lightweight (minimal JS) | ~200-500ms | Apply learned selectors |
| Third+ | Intelligence (cached/API) | ~50ms | Direct API calls, cached data |

**10x speedup after learning!**

## License

MIT

## Support

- [GitHub Issues](https://github.com/ogoldberg/ai-first-web-client/issues)
- [Documentation](../docs/)
- [API Reference](../docs/api/)
