# SDK Architecture Audit

This document analyzes the codebase structure for SDK extraction, identifying what belongs in the SDK vs MCP wrapper layers.

## Executive Summary

The project has **excellent separation of concerns** between MCP boilerplate and pure business logic:

- **100% of core logic is MCP-agnostic** (28 core modules + 29 utility modules)
- Only `src/index.ts` has MCP SDK imports
- Existing `src/sdk.ts` already provides a production-ready SDK client
- The codebase is ready for multi-protocol support (REST API, CLI, etc.)

## Project Structure

```
src/
├── index.ts              # MCP server (3,535 lines) - Protocol-specific
├── sdk.ts                # SDK client (337 lines) - Protocol-agnostic
├── core/                 # Core modules (28 files) - Protocol-agnostic
│   ├── smart-browser.ts      # Main orchestrator
│   ├── tiered-fetcher.ts     # Content fetching
│   ├── learning-engine.ts    # API pattern learning
│   ├── procedural-memory.ts  # Skill learning
│   ├── browser-manager.ts    # Browser lifecycle
│   ├── session-manager.ts    # Session handling
│   ├── content-intelligence.ts # Framework extraction
│   ├── auth-workflow.ts      # Authentication
│   └── ...                   # 20+ more modules
├── utils/                # Utility modules (29 files) - Protocol-agnostic
│   ├── content-extractor.ts  # HTML to markdown
│   ├── persistent-store.ts   # JSON persistence
│   ├── logger.ts             # Logging
│   └── ...                   # 25+ more utilities
├── types/                # Type definitions - Protocol-agnostic
└── tools/                # Tool helpers (3 files) - Mixed
    ├── browse-tool.ts        # Browsing wrapper
    ├── api-call-tool.ts      # API execution wrapper
    └── auth-helpers.ts       # Auth management
```

## Dependency Analysis

### MCP Dependency

**Only `src/index.ts` imports MCP SDK:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
```

**Core modules have zero MCP imports** - completely portable.

### Package Dependencies

| Dependency | Purpose | SDK Needs It? |
|------------|---------|---------------|
| @modelcontextprotocol/sdk | MCP protocol | No |
| playwright | Browser automation | Yes (optional) |
| cheerio | HTML parsing | Yes |
| linkedom | Lightweight DOM | Yes |
| pino | Logging | Yes |
| turndown | HTML to markdown | Yes |
| tough-cookie | Cookie handling | Yes |

## Layer Analysis

### Layer 1: Pure Business Logic (SDK Core)

**28 Core Modules** - All MCP-agnostic:

| Module | Purpose | Lines |
|--------|---------|-------|
| smart-browser.ts | Main orchestrator | 92K |
| content-intelligence.ts | Fast content extraction | 148K |
| procedural-memory.ts | Skill-based learning | 102K |
| learning-engine.ts | API pattern discovery | 70K |
| tiered-fetcher.ts | Tier cascade (intel->light->playwright) | 30K |
| session-manager.ts | Session persistence | 19K |
| auth-workflow.ts | Authentication | 30K |
| browser-manager.ts | Browser lifecycle | 13K |
| ... | 20 more modules | ... |

**29 Utility Modules** - All MCP-agnostic:

| Module | Purpose |
|--------|---------|
| content-extractor.ts | HTML to markdown conversion |
| persistent-store.ts | Debounced JSON persistence |
| usage-meter.ts | Usage tracking |
| rate-limiter.ts | Per-domain rate limiting |
| cache.ts | Content caching |
| logger.ts | Pino-based logging |
| ... | 23 more utilities |

### Layer 2: Protocol Adapters (MCP-Specific)

**Only 1 file with MCP imports:**

- **`src/index.ts`** - MCP server entry point
  - Tool schema definitions (~1,200 lines)
  - CallTool request handlers (~2,089 lines)
  - MCP server setup (~200 lines)

### Layer 3: SDK Client (Already Exists)

**`src/sdk.ts`** - Production-ready SDK client:

```typescript
// Factory function
export async function createLLMBrowser(config): Promise<LLMBrowserClient>;

// SDK Client Class
export class LLMBrowserClient {
  // Core methods
  async browse(url, options): Promise<SmartBrowseResult>;
  async fetch(url, options): Promise<TieredFetchResult>;
  async getDomainIntelligence(domain): Promise<DomainIntelligence>;

  // Statistics
  getProceduralMemoryStats(): ProceduralStats;
  getLearningStats(): LearningStats;
  getTieredFetcherStats(): TierStats;

  // Component access (advanced)
  getSmartBrowser(): SmartBrowser;
  getLearningEngine(): LearningEngine;
  getProceduralMemory(): ProceduralMemory;

  // Lifecycle
  async cleanup(): Promise<void>;
}
```

## index.ts Breakdown

| Section | Lines | % | Classification |
|---------|-------|---|----------------|
| Imports & helpers | 180 | 5% | Boilerplate |
| Component init | 30 | 1% | Business logic |
| Tool definitions | 1,200 | 34% | Boilerplate |
| Tool handlers | 2,089 | 59% | Mixed |
| Startup | 36 | 1% | Boilerplate |
| **Total** | **3,535** | **100%** | |

**Handler Pattern (consistent across all tools):**
```typescript
case 'smart_browse': {
  // 5 lines: Delegate to core
  const result = await smartBrowser.browse(url, options);

  // 150 lines: Format response for LLM
  // (truncation, insights, tables, etc.)

  return jsonResponse(formattedResult);
}
```

## SDK Extraction Feasibility

### Already Done (No Work Needed)

1. **Core logic separation** - All in `src/core/` and `src/utils/`
2. **SDK client** - Exists in `src/sdk.ts`
3. **Type exports** - Available in `src/types/`
4. **Zero MCP coupling** - Core has no MCP imports

### To Create @llm-browser/core Package

1. **Package structure:**
   ```
   packages/core/
   ├── src/
   │   ├── core/           # Copy from src/core/
   │   ├── utils/          # Copy from src/utils/
   │   ├── types/          # Copy from src/types/
   │   └── index.ts        # Re-export from sdk.ts
   ├── package.json
   └── tsconfig.json
   ```

2. **Entry point (index.ts):**
   ```typescript
   // Re-export SDK client
   export { LLMBrowserClient, createLLMBrowser, createContentFetcher } from './sdk';

   // Re-export core classes
   export { SmartBrowser } from './core/smart-browser';
   export { TieredFetcher } from './core/tiered-fetcher';
   export { LearningEngine } from './core/learning-engine';
   // ... more exports

   // Re-export types
   export * from './types';
   ```

3. **MCP package becomes thin wrapper:**
   ```typescript
   // packages/mcp/src/index.ts
   import { createLLMBrowser } from '@llm-browser/core';
   import { Server } from '@modelcontextprotocol/sdk/server/index.js';

   // Tool definitions + handlers only
   ```

### Effort Estimate

| Task | Effort | Notes |
|------|--------|-------|
| SDK-001: Audit (this doc) | S | Complete |
| SDK-002: Package structure | S | 2-4 hours |
| SDK-003: Extract SmartBrowser | M | Already clean |
| SDK-004: Extract learning | M | Already clean |
| SDK-005: Extract session/auth | M | Already clean |
| SDK-006: Type definitions | S | Already exported |
| SDK-007: Usage examples | M | New work |
| SDK-008: Documentation | L | New work |
| SDK-009: Refactor MCP tools | L | Major refactor |
| SDK-010: Publish to npm | S | 2-4 hours |

**Total: 2-3 days of focused work**

## Recommendations

### For SDK-002 (Next Step)

1. Create monorepo structure with npm workspaces
2. Move core modules to `packages/core/`
3. Keep MCP server in `packages/mcp/`
4. Share types via workspace dependencies

### For SDK-009 (MCP Refactor)

The current MCP server could be simplified to:
```typescript
// Each tool handler becomes ~10 lines instead of 50-150
case 'smart_browse': {
  const result = await sdk.browse(url, options);
  return formatForMCP(result, 'browse');
}
```

### Long-Term Architecture

```
@llm-browser/core          # SDK (no MCP dependency)
  └── SmartBrowser, LearningEngine, etc.

@llm-browser/mcp           # MCP server (thin wrapper)
  └── import { createLLMBrowser } from '@llm-browser/core'

@llm-browser/rest          # REST API (future)
  └── import { createLLMBrowser } from '@llm-browser/core'

@llm-browser/cli           # CLI tool (future)
  └── import { createLLMBrowser } from '@llm-browser/core'
```

## Conclusion

The codebase is **architecturally mature and ready for SDK extraction**:

- Core logic is completely MCP-agnostic
- SDK client already exists and is production-ready
- Clear separation of concerns throughout
- Zero vendor lock-in to MCP

The SDK extraction is primarily a **packaging exercise** rather than a refactoring effort. The hard work of separating concerns has already been done.
