# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Unbrowser** (npm: `llm-browser`) is an intelligent web browsing API for AI agents. It learns from browsing patterns, discovers API endpoints automatically, and progressively optimizes to bypass browser rendering entirely.

### Two Deployment Architectures

This project supports **two distinct deployment modes** with different use cases:

#### 1. Local MCP Server (PRODUCTION - v0.5.0)

The primary, production-ready architecture for local deployment.

- **Package**: `llm-browser` on npm
- **Use Cases**: Claude Desktop MCP integration, local Node.js embedding
- **Factory Function**: `createLLMBrowser()` from `llm-browser/sdk`
- **Components**: Full SmartBrowser, TieredFetcher, LearningEngine, ProceduralMemory (all in `src/core/`)
- **Storage**: Local filesystem (`./sessions/`, `./enhanced-knowledge-base.json`, etc.)
- **Status**: ✅ **Production Ready** (2340+ tests passing)

```typescript
// Local SDK usage
import { createLLMBrowser } from 'llm-browser/sdk';
const browser = await createLLMBrowser();
const result = await browser.browse('https://example.com');
```

```json
// Claude Desktop MCP config
{
  "mcpServers": {
    "unbrowser": {
      "command": "npx",
      "args": ["llm-browser"]
    }
  }
}
```

#### 2. Cloud API (ALPHA - In Development)

A cloud-hosted SaaS deployment for multi-tenant access.

- **Package**: `@unbrowser/core` on npm (HTTP client wrapper)
- **Use Cases**: REST API access, multi-tenant SaaS, platform-agnostic usage (Python, Ruby, etc.)
- **Factory Function**: `createUnbrowser()` from `@unbrowser/core`
- **Components**: HTTP client wrapper (thin) - server runs Architecture #1 in cloud
- **Storage**: Cloud database (Supabase/Postgres), multi-tenant isolation
- **Status**: 🚧 **Alpha** (API server functional, see BACKLOG.md tasks API-001 through API-017)

```typescript
// Cloud SDK usage (HTTP wrapper)
import { createUnbrowser } from '@unbrowser/core';
const client = createUnbrowser({
  apiKey: process.env.UNBROWSER_API_KEY,
});
const result = await client.browse('https://example.com');
```

```bash
# Direct REST API usage
curl -X POST https://api.unbrowser.ai/v1/browse \
  -H "Authorization: Bearer $UNBROWSER_API_KEY" \
  -d '{"url": "https://example.com"}'
```

#### Which Should You Use?

**Most users**: Use the **Local MCP Server** (`llm-browser`)
- Works with Claude Desktop out of the box
- All data stays local (privacy)
- No API keys or billing required
- Full feature set available

**Cloud API** users need:
- Multi-tenant isolation
- Usage-based billing and quotas
- Platform-agnostic access (non-Node.js languages)
- No local setup/dependencies
- Centralized learning (shared pattern pool across tenants)

### Current Focus: Cloud API Launch

We're building a cloud-hosted API at `api.unbrowser.ai` where all intelligence runs server-side. The cloud deployment uses the Local MCP Server architecture internally but exposes it via REST API for multi-tenant access.

**Three access methods to cloud API:**
1. **REST API** - Direct HTTP calls at `api.unbrowser.ai`
2. **SDK** - `@unbrowser/core` npm package (thin HTTP client)
3. **MCP** - `@unbrowser/mcp` for Claude Desktop (planned - SDK-009)

### Core Philosophy: "Browser Minimizer"

The goal is to **progressively eliminate the need for rendering**:

- **First visit**: Use Content Intelligence (fastest) or lightweight rendering
- **Learning**: Discover APIs, learn patterns, build procedural skills
- **Future visits**: Direct API calls or cached patterns = 10x faster
- **Collective intelligence**: Patterns learned by all users benefit everyone

### Key Features

1. **Tiered Rendering**: Intelligence (~50-200ms) -> Lightweight (~200-500ms) -> Playwright (~2-5s, optional)
2. **Content Intelligence**: Framework extraction (Next.js, etc.), structured data, API prediction
3. **Procedural Memory**: Learns and replays browsing skills with versioning and rollback
4. **API Discovery**: Automatically discovers and caches API patterns
5. **Session Management**: Persistent authenticated sessions
6. **Stealth Mode**: Fingerprint evasion, behavioral delays, bot detection avoidance
7. **Collective Learning**: Shared pattern pool across tenants
8. **Verification Engine**: Built-in assertions, confidence scoring, content validation

### QA & Testing Use Cases

**Unbrowser is excellent for testing scenarios focused on content validation and API testing.** Use it when:

| Use Case | Why Unbrowser |
|----------|---------------|
| **E2E API testing** | Auto-discovers APIs from sites, validates responses, detects API changes |
| **Content validation** | Built-in verification with `fieldExists`, `fieldMatches`, `minLength`, etc. |
| **Multi-site regression** | Learned patterns transfer across similar sites automatically |
| **Workflow automation** | Record and replay workflows with validation |

**Key QA Features:**

```typescript
// Content validation with assertions
const result = await browser.browse(url, {
  verify: {
    mode: 'thorough',  // 'basic', 'standard', 'thorough'
    checks: [{
      type: 'content',
      assertion: {
        fieldExists: ['title', 'price'],
        fieldMatches: { price: /\$[\d,]+/ },
        minLength: 500,
      },
      severity: 'critical',  // 'warning', 'error', 'critical'
    }],
  },
});
// result.verification.passed, result.verification.confidence
```

```typescript
// Automatic API discovery and testing
const discovery = await browser.browse('https://api.example.com', {
  includeNetwork: true,
});
for (const api of discovery.discoveredApis) {
  const result = await browser.executeApiCall({ url: api.url, method: api.method });
  console.log(`${api.method} ${api.url}: ${result.status}`);
}
```

**When NOT to use Unbrowser for QA:**
- Visual regression testing (use Playwright snapshots)
- Interactive UI testing (use Playwright locators)
- Mobile/cross-browser testing (use Playwright device emulation)

See **[docs/QA_TESTING_GUIDE.md](docs/QA_TESTING_GUIDE.md)** for comprehensive QA documentation.

## Package Manager and Workspaces

**IMPORTANT**: This project uses **npm workspaces** (NOT pnpm).

- The root `package.json` has `"workspaces": ["packages/*"]`
- Some packages (like `@unbrowser/mcp`) use `workspace:*` syntax for local dependencies
- This `workspace:*` syntax is pnpm-compatible but npm also understands it in recent versions
- If you see errors about `workspace:*`, run `npm install` from the root directory
- Do NOT create `pnpm-workspace.yaml` - the project uses npm

```bash
# Correct: Install from root
npm install

# Correct: Build a specific package
npm run build -w packages/core

# Wrong: Don't use pnpm
# pnpm install  # Don't do this
```

## Architecture

### Cloud API Architecture (Current Focus)

```
+------------------+     +------------------+     +------------------+
|   Claude/LLM     |     |   SDK Users      |     |   Direct API     |
|   via MCP        |     |   (Node.js)      |     |   (curl/fetch)   |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         v                        v                        v
+------------------------------------------------------------------------+
|                         @unbrowser/core                                 |
|                    UnbrowserClient (HTTP)                               |
+------------------------------------------------------------------------+
                                  |
                                  v
+------------------------------------------------------------------------+
|                    Unbrowser Cloud API                                  |
|                    api.unbrowser.ai                                     |
|  +---------------+  +---------------+  +---------------+               |
|  | /v1/browse    |  | /v1/batch     |  | /v1/fetch     |               |
|  +---------------+  +---------------+  +---------------+               |
|  +---------------+  +---------------+  +---------------+               |
|  | Auth (API Key)|  | Rate Limiting |  | Usage Tracking|               |
|  +---------------+  +---------------+  +---------------+               |
+------------------------------------------------------------------------+
                                  |
         +------------------------+------------------------+
         |                        |                        |
         v                        v                        v
+----------------+      +------------------+      +------------------+
| SmartBrowser   |      | LearningEngine   |      | SharedPatterns   |
| TieredFetcher  |      | ProceduralMemory |      | (Collective AI)  |
+----------------+      +------------------+      +------------------+
```

### Package Structure

```
packages/
  api/           # Cloud API server (Hono + Node.js) - NO Prisma dependency yet
  core/          # SDK with HTTP client
  mcp/           # MCP server (thin wrapper around SDK)
```

**Note on packages/api**: The API package uses an abstracted `ApiKeyStore` interface for database operations. This allows:
- Running without a database for development/testing (in-memory store)
- Adding Prisma or other database backends later
- Easy testing with mock stores

### API Endpoints

**Core Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/browse` | Browse URL, extract content |
| `POST` | `/v1/browse/preview` | Preview execution plan without running (COMP-002) |
| `POST` | `/v1/batch` | Browse multiple URLs |
| `POST` | `/v1/fetch` | Fast tiered fetch |
| `GET` | `/v1/domains/:domain/intelligence` | Domain learning summary |
| `GET` | `/v1/usage` | Usage stats for billing period |
| `GET` | `/v1/proxy/stats` | Proxy pool statistics |
| `GET` | `/v1/proxy/risk/:domain` | Domain risk assessment |
| `GET` | `/health` | Health check |

**Workflow Management (COMP-009):**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/workflows/record/start` | Start workflow recording session |
| `POST` | `/v1/workflows/record/:id/stop` | Stop recording and save workflow |
| `POST` | `/v1/workflows/record/:id/annotate` | Annotate workflow step |
| `POST` | `/v1/workflows/:id/replay` | Replay saved workflow |
| `GET` | `/v1/workflows` | List saved workflows |
| `GET` | `/v1/workflows/:id` | Get workflow details |
| `DELETE` | `/v1/workflows/:id` | Delete workflow |

**Admin & Management:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/tenants` | Create new tenant (API-005) |
| `GET` | `/v1/tenants/:id` | Get tenant details |
| `PATCH` | `/v1/tenants/:id` | Update tenant settings |
| `POST` | `/v1/billing/webhook` | Stripe webhook handler (API-007) |
| `GET` | `/v1/admin/dashboard` | Admin dashboard data (API-008) |
| `GET` | `/admin` | Admin UI (HTML) |
| `GET` | `/docs` | API documentation (Swagger UI) (API-011) |
| `GET` | `/pricing` | Pricing calculator (API-016) |

**Complete API specification:** See [`docs/api/openapi.yaml`](docs/api/openapi.yaml) for full OpenAPI 3.1 spec with request/response schemas.

## Development Commands

```bash
# Install dependencies (from root - uses npm workspaces)
npm install
npx playwright install chromium  # Optional - works without Playwright

# Build all packages
npm run build

# Build specific package
npm run build -w packages/core
npm run build -w packages/api

# Run tests
npm test

# Development (watch mode)
npm run dev

# Start API server (packages/api)
cd packages/api && npm start

# Manual testing
cd packages/api && npx tsx scripts/test-e2e.ts
```

## Core Components

### API Server (packages/api/)

- **app.ts** - Hono app with middleware
- **routes/browse.ts** - Browse, batch, fetch endpoints
- **routes/health.ts** - Health checks
- **middleware/auth.ts** - API key authentication (SHA-256 hashing)
- **middleware/rate-limit.ts** - Per-tenant rate limiting (in-memory)
- **middleware/types.ts** - Shared types (Tenant, ApiKey, Plan)

### SDK HTTP Client (packages/core/)

- **http-client.ts** - `UnbrowserClient` class for API access
- **createUnbrowser()** - Factory function for client creation

```typescript
import { createUnbrowser } from '@unbrowser/core';

const client = createUnbrowser({
  apiKey: process.env.UNBROWSER_API_KEY,
});

const result = await client.browse('https://example.com');
console.log(result.content.markdown);
```

### Core Intelligence (src/core/)

1. **SmartBrowser** - Main orchestrator for intelligent browsing
2. **TieredFetcher** - Tier cascade (intelligence -> lightweight -> playwright)
3. **ContentIntelligence** - Framework extraction, structured data, API prediction
4. **LightweightRenderer** - linkedom + Node VM for simple JS
5. **ProceduralMemory** - Skill learning with versioning
6. **LearningEngine** - API pattern discovery, selector learning

## Environment Variables

### API Server (Production)

```bash
DATABASE_URL=postgresql://...@supabase.co:5432/postgres
NODE_ENV=production
PORT=3001
```

### SDK/MCP (Client-side)

```bash
UNBROWSER_API_KEY=ub_live_xxxxx
UNBROWSER_API_URL=https://api.unbrowser.ai  # optional, default
```

### Local Development

```bash
# Use local SQLite instead of Postgres
# Just don't set DATABASE_URL

# Optional stealth mode
LLM_BROWSER_STEALTH=true
```

### Proxy Configuration (IP Blocking Prevention)

The API supports intelligent proxy routing to prevent IP blocking. Proxies are optional - the system works without them but may face blocking on high-protection sites.

```bash
# Datacenter proxies (cheapest, for low-risk sites)
PROXY_DATACENTER_URLS=http://user:pass@dc1.proxy.com:8080,http://user:pass@dc2.proxy.com:8080

# ISP proxies (mid-tier, better reputation)
PROXY_ISP_URLS=http://user:pass@isp1.proxy.com:8080

# Bright Data proxies (best for high-protection sites)
BRIGHTDATA_AUTH=customer_id:password
BRIGHTDATA_ZONE=residential              # residential, unblocker, isp, datacenter
BRIGHTDATA_COUNTRY=us                    # Optional single country
BRIGHTDATA_COUNTRIES=us,uk,de            # Optional multi-country rotation
BRIGHTDATA_SESSION_ROTATION=true         # Enable IP rotation per request (default: true)
BRIGHTDATA_PORT=22225                    # Custom port (default: 22225)

# Health tracking settings
PROXY_HEALTH_WINDOW=100        # Requests to track per proxy
PROXY_COOLDOWN_MINUTES=60      # Cooldown after blocking
PROXY_BLOCK_THRESHOLD=0.3      # Failure rate to trigger cooldown

# Domain risk settings
DOMAIN_RISK_CACHE_MINUTES=60   # Cache risk assessments
DOMAIN_RISK_LEARNING=true      # Learn from failures
```

**Proxy Tiers by Plan:**
| Plan | Available Tiers |
|------|-----------------|
| FREE | Datacenter only |
| STARTER | Datacenter, ISP |
| TEAM | Datacenter, ISP, Residential |
| ENTERPRISE | All tiers including Premium |

**How it works:**
1. Domain risk is assessed (static rules + learned patterns)
2. Appropriate proxy tier is selected based on risk + plan
3. Health is tracked per-proxy per-domain
4. Failing proxies enter cooldown, requests escalate to higher tiers
5. Learning from blocks improves future routing

See [docs/PROXY_MANAGEMENT_PLAN.md](docs/PROXY_MANAGEMENT_PLAN.md) for full architecture.

## TypeScript Configuration

- **Module System**: ES2022 with Node16 module resolution
- **Output**: Compiled to `dist/` directory
- **Import Extensions**: All imports use `.js` extension (Node16 requirement)
- **Strict Mode**: Enabled

## Key Documentation

- **[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)** - Current implementation status
- **[docs/ROADMAP.md](docs/ROADMAP.md)** - Development roadmap and milestones
- **[docs/BACKLOG.md](docs/BACKLOG.md)** - Task backlog with priorities (P0-P3)
- **[docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md)** - Business strategy
- **[docs/PRICING.md](docs/PRICING.md)** - Pricing tiers
- **[docs/api/API_DESIGN.md](docs/api/API_DESIGN.md)** - REST API design
- **[docs/api/openapi.yaml](docs/api/openapi.yaml)** - OpenAPI 3.1 specification
- **[docs/QA_TESTING_GUIDE.md](docs/QA_TESTING_GUIDE.md)** - E2E API testing and QA automation guide

## Current Sprint: Cloud API Launch

Priority tasks from BACKLOG.md P0 section:

1. **API-002**: Implement API authentication (IN PROGRESS)
2. **API-003**: Implement rate limiting
3. **CLOUD-001**: Wire SmartBrowser to browse endpoint
4. **CLOUD-002**: Add usage tracking service
5. **DEPLOY-001**: Set up Supabase production database

## Important Notes

- API keys use format `ub_live_xxx` or `ub_test_xxx`
- Only the SHA-256 hash of API keys is stored
- Sessions and patterns are tenant-isolated
- Collective learning is opt-in per tenant
- The system learns from every browse operation
- First render is slower (learning phase), subsequent accesses are faster
- The API package currently uses in-memory stores - Prisma will be added for production
