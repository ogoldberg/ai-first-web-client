# @llm-browser/core

Core SDK for LLM Browser - intelligent web browsing for machines.

## Overview

This package provides programmatic access to all LLM Browser capabilities without requiring the MCP protocol. Use this for:

- Direct integration into Node.js applications
- Building custom web automation workflows
- Programmatic access to learning and API discovery

## Installation

```bash
npm install @llm-browser/core
```

## Quick Start

```typescript
import { createLLMBrowser } from '@llm-browser/core';

const browser = await createLLMBrowser();

// Browse a URL with automatic learning
const result = await browser.browse('https://example.com');
console.log(result.content.markdown);

// Get domain intelligence
const intelligence = await browser.getDomainIntelligence('example.com');
console.log(intelligence.knownPatterns);

// Clean up
await browser.cleanup();
```

## Features

- **Smart Browsing**: Automatic tier selection (static → lightweight → playwright)
- **API Discovery**: Learn API patterns from network traffic
- **Skill Learning**: Build reusable browsing skills from successful patterns
- **Session Management**: Persistent authenticated sessions
- **Content Intelligence**: Framework detection and structured data extraction

## API Reference

### `createLLMBrowser(config?)`

Factory function to create an initialized browser client.

```typescript
const browser = await createLLMBrowser({
  sessionsDir: './my-sessions',
  enableLearning: true,
  enableProceduralMemory: true,
});
```

### `LLMBrowserClient`

Main SDK client class with methods:

- `browse(url, options)` - Browse with automatic optimization
- `fetch(url, options)` - Fast content fetching
- `getDomainIntelligence(domain)` - Get learned patterns
- `findApplicableSkills(url)` - Find matching skills
- `getLearningStats()` - Get learning engine stats
- `cleanup()` - Release resources

## Status

This package is part of the SDK extraction effort (SDK-001 to SDK-012).
Current status: **SmartBrowser extracted** (SDK-003).

See [SDK_ARCHITECTURE.md](../../docs/SDK_ARCHITECTURE.md) for the full plan.

## License

MIT
