# @llm-browser/mcp

MCP (Model Context Protocol) server for LLM Browser.

## Overview

This package provides the MCP interface for Claude and other LLM clients. It wraps `@llm-browser/core` to provide tool-based access to browsing capabilities.

For programmatic access without MCP, use `@llm-browser/core` directly.

## Installation

```bash
npm install @llm-browser/mcp
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "llm-browser": {
      "command": "npx",
      "args": ["@llm-browser/mcp"]
    }
  }
}
```

## Available Tools

### Core Tools (5)

| Tool | Purpose |
|------|---------|
| `smart_browse` | Intelligent browsing with automatic learning |
| `batch_browse` | Browse multiple URLs with controlled concurrency |
| `execute_api_call` | Direct API calls using discovered patterns |
| `session_management` | Manage authenticated sessions |
| `api_auth` | Configure API authentication |

### Debug Tools (set `LLM_BROWSER_DEBUG_MODE=1`)

- `capture_screenshot` - Visual debugging
- `export_har` - Network traffic analysis
- `debug_traces` - Failure analysis

### Admin Tools (set `LLM_BROWSER_ADMIN_MODE=1`)

- Performance metrics, usage analytics, tier management
- Deprecated tools for backward compatibility

## Status

This package is part of the SDK extraction effort (SDK-001 to SDK-012).
Current status: **Package structure created** (SDK-002).

The MCP tools will be refactored as thin wrappers in SDK-009.

See [SDK_ARCHITECTURE.md](../../docs/SDK_ARCHITECTURE.md) for the full plan.

## License

MIT
