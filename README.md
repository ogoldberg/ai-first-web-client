# LLM Browser MCP Server

An intelligent browser designed specifically for LLM interactions. Unlike traditional web scraping tools, this MCP server learns from your browsing patterns, discovers API endpoints, and progressively optimizes web access by bypassing unnecessary rendering.

## What Makes This Different?

**Traditional Tools (Jina, Firecrawl, etc.):**
- Return clean markdown/HTML
- Every request = full page render
- No memory of previous visits
- No API discovery

**LLM Browser:**
- Returns content + network traffic + console logs
- Discovers underlying APIs automatically
- Learns patterns to bypass rendering
- Session management for authenticated access
- Gets smarter over time

## Key Features

### 🧠 **Intelligent API Discovery**
Automatically analyzes network traffic to discover API endpoints. After the first visit, it can often bypass the browser entirely and call APIs directly.

### 🔐 **Session Management**
Save authentication sessions (cookies, localStorage) and reuse them across requests. Access authenticated content without re-logging in.

### 📊 **Network Transparency**
Unlike browser automation tools that hide network traffic, this exposes everything:
- All HTTP requests and responses
- Console logs and errors
- API patterns and authentication flows

### 🚀 **Progressive Optimization**
- **First visit:** Full browser render, capture everything, learn APIs
- **Second visit:** Use learned patterns when possible
- **Future visits:** Direct API calls = 10x faster

### 🎯 **LLM-Native Design**
Built as an MCP server that LLMs can use naturally. No code generation required.

## Installation

On your Mac M2:

\`\`\`bash
# Clone/navigate to the project
cd ai-first-web-client

# Install dependencies
npm install

# Install Chromium for Playwright
npx playwright install chromium

# Build the TypeScript code
npm run build
\`\`\`

## Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

\`\`\`json
{
  "mcpServers": {
    "llm-browser": {
      "command": "node",
      "args": ["/absolute/path/to/ai-first-web-client/dist/index.js"]
    }
  }
}
\`\`\`

Then restart Claude Desktop.

## Usage Examples

### Basic Browsing

\`\`\`
User: "Browse example.com and show me the main content"

Claude: → browse("https://example.com")

Returns:
- Clean markdown content
- All network requests (including hidden APIs)
- Console logs
- Discovered API patterns
\`\`\`

### API Discovery

\`\`\`
User: "Get product data from shop.com"

Claude: → browse("https://shop.com/products")

Response shows:
- Page content
- Discovered: GET /api/products endpoint
- Can be called directly next time

User: "Get more products"

Claude: → execute_api_call("https://shop.com/api/products?page=2")
(Much faster - no browser rendering!)
\`\`\`

### Session Management

\`\`\`
User: "Browse my GitHub dashboard"

Claude: → browse("https://github.com")
User manually logs in...

Claude: → save_session("github.com")

Later:
User: "Check my GitHub notifications"

Claude: → browse("https://github.com/notifications")
(Automatically uses saved session - no re-login!)
\`\`\`

### Knowledge Base

\`\`\`
User: "What APIs have you learned?"

Claude: → get_knowledge_stats()

Returns:
- 15 domains with learned patterns
- 47 total API patterns
- 23 can bypass browser rendering
- Top domains: github.com, api.stripe.com, etc.
\`\`\`

## Available Tools

### \`browse\`
Browse a URL with full intelligence.

**Parameters:**
- \`url\` (required): URL to browse
- \`waitFor\`: Wait strategy - 'load', 'domcontentloaded', or 'networkidle' (default)
- \`timeout\`: Timeout in ms (default: 30000)
- \`sessionProfile\`: Session profile to use (default: 'default')

**Returns:**
- Page content (markdown, HTML, text)
- All network requests
- Console logs
- Discovered API patterns
- Load time and metadata

### \`execute_api_call\`
Make a direct API call using saved session authentication.

**Parameters:**
- \`url\` (required): API endpoint
- \`method\`: HTTP method (default: GET)
- \`headers\`: Additional headers
- \`body\`: Request body (for POST/PUT)
- \`sessionProfile\`: Session profile to use

**Returns:**
- Response status and headers
- Response body (parsed JSON or text)
- Request duration

### \`save_session\`
Save the current browser session for future use.

**Parameters:**
- \`domain\` (required): Domain to save session for
- \`sessionProfile\`: Profile name (default: 'default')

### \`list_sessions\`
List all saved sessions.

### \`get_knowledge_stats\`
Get statistics about learned API patterns.

### \`get_learned_patterns\`
Get all learned patterns for a specific domain.

**Parameters:**
- \`domain\` (required): Domain to query

## Architecture

\`\`\`
┌─────────────────────────────────────┐
│  MCP Tools                          │
│  - browse                           │
│  - execute_api_call                 │
│  - save_session                     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Intelligence Layer                 │
│  ┌────────────────────────────────┐ │
│  │ API Analyzer                   │ │
│  │ - Detects API patterns         │ │
│  │ - Scores confidence            │ │
│  │ - Identifies auth types        │ │
│  └────────────────────────────────┘ │
│  ┌────────────────────────────────┐ │
│  │ Knowledge Base                 │ │
│  │ - Stores learned patterns      │ │
│  │ - Tracks success rates         │ │
│  │ - Optimizes over time          │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Core Services                      │
│  - Browser Manager (Playwright)     │
│  - Session Manager (cookies, etc.)  │
│  - Content Extractor (HTML→MD)      │
└─────────────────────────────────────┘
\`\`\`

## Comparison with Existing Tools

| Feature | Jina/Firecrawl | Puppeteer/Playwright | LLM Browser |
|---------|---------------|---------------------|-------------|
| Clean content extraction | ✅ | ❌ | ✅ |
| Network inspection | ❌ | Manual | ✅ Automatic |
| Console logs | ❌ | Manual | ✅ Automatic |
| API discovery | ❌ | ❌ | ✅ |
| Session persistence | ❌ | Manual | ✅ |
| Progressive optimization | ❌ | ❌ | ✅ |
| LLM-native (MCP) | ❌ | ❌ | ✅ |

## Technical Details

**Built with:**
- TypeScript for type safety
- Playwright for browser automation
- Model Context Protocol (MCP) SDK
- Cheerio & Turndown for content extraction

**Storage:**
- Sessions stored in \`./sessions/\` (gitignored)
- Knowledge base in \`./knowledge-base.json\` (gitignored)

**Performance:**
- First browse: ~2-5 seconds (full render)
- Optimized API call: ~200-500ms (no render)

## Development

\`\`\`bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Build
npm run build

# Run
npm start

# Debug
npm run inspect
\`\`\`

## Roadmap

**Phase 2 (Coming Soon):**
- [ ] Change detection & monitoring
- [ ] Action recording/replay
- [ ] Pagination intelligence
- [ ] Visual debugging mode
- [ ] Data validation

**Phase 3:**
- [ ] Pattern marketplace
- [ ] Multi-site workflows
- [ ] Stealth mode
- [ ] Natural language selectors

## Contributing

This is a prototype/MVP. Contributions welcome!

## License

MIT

## Why This Matters

Current LLM web tools force a choice:
- **Search APIs** (OpenAI, Anthropic): Good for public info, can't access authenticated content
- **Scraping tools** (Jina, Firecrawl): Fast for one-off tasks, but don't learn or optimize
- **Browser automation** (Puppeteer): Powerful but requires code, no intelligence

**LLM Browser bridges the gap:** Intelligent, learning, authenticated access with an LLM-native interface.

It's not just a scraping tool - it's web intelligence infrastructure for AI agents.
