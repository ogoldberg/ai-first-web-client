/**
 * LLM Documentation Routes
 *
 * Provides documentation optimized for LLM ingestion.
 * Available at /llm.txt and /llm.md
 */

import { Hono } from 'hono';

export const llmDocs = new Hono();

const LLM_DOCS_CONTENT = `# Unbrowser API - LLM Reference

## Quick Facts
- Base URL: https://api.unbrowser.ai
- Auth: Bearer token (API key format: ub_live_xxx or ub_test_xxx)
- Content-Type: application/json
- Rate Limits: Plan-based (FREE: 100/day, STARTER: 1000/day, TEAM: 10000/day)

## Core Endpoint: POST /v1/browse

Browse a URL and extract content with intelligent tiering.

### Minimal Request
\`\`\`json
{"url": "https://example.com"}
\`\`\`

### Full Request Schema
\`\`\`json
{
  "url": "string (required)",
  "options": {
    "contentType": "markdown | html | text | json",
    "scrollToLoad": "boolean",
    "maxChars": "number",
    "includeTables": "boolean",
    "maxLatencyMs": "number",
    "maxCostTier": "intelligence | lightweight | playwright",
    "sessionProfile": "string",
    "verify": {
      "enabled": "boolean",
      "mode": "basic | standard | thorough"
    }
  }
}
\`\`\`

### Response Schema
\`\`\`json
{
  "success": true,
  "data": {
    "content": {
      "markdown": "string",
      "html": "string",
      "text": "string",
      "tables": []
    },
    "metadata": {
      "url": "string",
      "title": "string",
      "tier": "intelligence | lightweight | playwright",
      "duration": "number (ms)",
      "cached": "boolean"
    },
    "verification": {
      "passed": "boolean",
      "confidence": "number (0-1)",
      "checks": []
    }
  }
}
\`\`\`

## Other Endpoints

### POST /v1/batch
Browse multiple URLs in parallel.
Request: \`{"urls": ["url1", "url2"], "options": {...}}\`
Response: Array of browse results

### POST /v1/fetch
Fast tiered fetch without full browse options.
Request: \`{"url": "string"}\`
Response: Same as browse

### GET /v1/domains/{domain}/intelligence
Get learning summary for a domain.
Response: \`{"patterns": [...], "apis": [...], "successRate": number}\`

### GET /v1/usage
Get your current usage statistics.
Response: \`{"today": {"requests": n, "units": n}, "month": {...}}\`

### GET /health
Health check endpoint.
Response: \`{"status": "ok", "timestamp": "..."}\`

## Authentication
\`\`\`bash
curl -X POST https://api.unbrowser.ai/v1/browse \\
  -H "Authorization: Bearer ub_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'
\`\`\`

## Error Codes
- 400: Invalid request (check url format, required fields)
- 401: Invalid or missing API key
- 403: Permission denied or email not verified
- 429: Rate limit exceeded (check X-RateLimit-* headers)
- 500: Server error (retry with backoff)

## Rate Limit Headers
- X-RateLimit-Limit: Your daily limit
- X-RateLimit-Remaining: Requests remaining today
- X-RateLimit-Reset: Unix timestamp when limit resets

## Best Practices for AI Agents

1. **Use markdown output** - Set contentType: "markdown" for best LLM consumption
2. **Enable verification** - Use verify.enabled: true for important data extraction
3. **Session profiles** - Use sessionProfile for sites requiring login
4. **Check tier used** - metadata.tier shows actual rendering method and cost
5. **Batch requests** - Use /v1/batch for multiple URLs (more efficient)
6. **Handle rate limits** - Check 429 responses and X-RateLimit-Remaining header
7. **Prefer structured data** - Set includeTables: true to extract tables as JSON

## Rendering Tiers (Automatic Selection)

1. **Intelligence (1 unit)** - Fastest. Uses learned patterns, cached APIs
2. **Lightweight (5 units)** - Server-side DOM rendering
3. **Playwright (25 units)** - Full browser for complex sites

The system automatically selects the fastest tier that works. First requests may use slower tiers; subsequent requests get faster as patterns are learned.

## Rate Limits by Plan
| Plan | Daily | Monthly | Playwright |
|------|-------|---------|------------|
| FREE | 100 | 3,000 | No |
| STARTER | 1,000 | 30,000 | Yes |
| TEAM | 10,000 | 300,000 | Yes |
| ENTERPRISE | Custom | Custom | Priority |

## SDK Installation
\`\`\`bash
npm install @unbrowser/core
\`\`\`

## SDK Usage
\`\`\`typescript
import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: process.env.UNBROWSER_API_KEY
});

// Simple browse
const result = await client.browse('https://example.com');
console.log(result.content.markdown);

// With options
const result = await client.browse('https://example.com', {
  contentType: 'markdown',
  verify: { enabled: true, mode: 'thorough' }
});

// Batch browse
const results = await client.batch([
  'https://example1.com',
  'https://example2.com'
]);
\`\`\`

## MCP Server (Claude Desktop)

Add to claude_desktop_config.json:
\`\`\`json
{
  "mcpServers": {
    "unbrowser": {
      "command": "npx",
      "args": ["@unbrowser/mcp"],
      "env": {
        "UNBROWSER_API_KEY": "ub_live_xxx"
      }
    }
  }
}
\`\`\`

## Verification Options

### Assertion Types
- fieldExists: ["title", "price"] - Check fields exist
- fieldMatches: {"price": "\\\\$[\\\\d,]+"} - Regex matching
- minLength: 500 - Minimum content length
- contains: ["keyword"] - Content must include

### Severity Levels
- warning: Log but don't fail
- error: Mark verification failed
- critical: Stop processing

## Content Intelligence Features

### Framework Detection
Automatically detects and extracts from:
- Next.js (__NEXT_DATA__)
- Nuxt.js (__NUXT__)
- React (window.__REACT_QUERY_STATE__)
- And more

### Structured Data Extraction
Extracts:
- JSON-LD schema
- OpenGraph metadata
- Tables as JSON
- API responses

### API Discovery
Monitors network requests to discover:
- REST API endpoints
- GraphQL queries
- Pagination patterns

## Common Use Cases

### Extract article content
\`\`\`json
{
  "url": "https://blog.example.com/post",
  "options": {
    "contentType": "markdown",
    "verify": {
      "enabled": true,
      "checks": [{"type": "content", "assertion": {"minLength": 200}}]
    }
  }
}
\`\`\`

### Monitor product prices
\`\`\`json
{
  "url": "https://shop.example.com/product",
  "options": {
    "contentType": "json",
    "verify": {
      "enabled": true,
      "checks": [{
        "type": "content",
        "assertion": {"fieldExists": ["price", "title"]}
      }]
    }
  }
}
\`\`\`

### Browse authenticated site
\`\`\`json
{
  "url": "https://app.example.com/dashboard",
  "options": {
    "sessionProfile": "my-app-session",
    "maxCostTier": "playwright"
  }
}
\`\`\`

## Support
- Documentation: https://api.unbrowser.ai/docs
- Status: https://status.unbrowser.ai
- Email: hello@unbrowser.ai
`;

/**
 * GET /llm.txt - Plain text LLM documentation
 */
llmDocs.get('/llm.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.text(LLM_DOCS_CONTENT);
});

/**
 * GET /llm.md - Markdown LLM documentation
 */
llmDocs.get('/llm.md', (c) => {
  c.header('Content-Type', 'text/markdown; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.text(LLM_DOCS_CONTENT);
});

/**
 * GET /.well-known/ai-plugin.json - OpenAI plugin manifest (future)
 */
llmDocs.get('/.well-known/ai-plugin.json', (c) => {
  return c.json({
    schema_version: 'v1',
    name_for_human: 'Unbrowser',
    name_for_model: 'unbrowser',
    description_for_human: 'Intelligent web browsing API for AI agents. Extract content from any URL.',
    description_for_model: 'Use Unbrowser to browse web pages and extract content. Supports markdown, HTML, and structured data extraction. Learns patterns for faster subsequent requests.',
    auth: {
      type: 'service_http',
      authorization_type: 'bearer',
    },
    api: {
      type: 'openapi',
      url: 'https://api.unbrowser.ai/docs/openapi.yaml',
    },
    logo_url: 'https://api.unbrowser.ai/logo.png',
    contact_email: 'hello@unbrowser.ai',
    legal_info_url: 'https://api.unbrowser.ai/terms',
  });
});
