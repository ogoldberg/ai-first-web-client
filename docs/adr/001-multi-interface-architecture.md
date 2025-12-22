# ADR 001: Multi-Interface Architecture (SDK-First Design)

**Date:** 2025-12-22
**Status:** Proposed
**Deciders:** Architecture Review

## Context

The LLM Browser was initially built as an MCP-only server with 25 tools. Analysis of the two primary use cases (scraping and research) revealed fundamental mismatches between a single interface and diverse user needs.

### Problem Statement

**Two distinct use cases with conflicting requirements:**

1. **Research/Exploration**
   - Ad-hoc queries, different sites each time
   - LLM-driven decision making
   - Need: Simplicity, ease of use, discoverability
   - Frequency: One-off to occasional
   - Tolerate: Higher latency per request (LLM overhead acceptable)

2. **Scraping/Automation**
   - Repeated execution, same sites many times
   - Deterministic workflows
   - Need: Speed, low cost, programmability
   - Frequency: Thousands of requests
   - Cannot tolerate: LLM overhead on every request

**Current MCP-only approach fails both:**
- 25 tools → choice paralysis for researchers
- LLM required every request → too slow/expensive for scraping
- MCP server required → can't embed in applications
- Claude-only → locks out other LLM users

### Evidence

From GTM plan, 3 of 4 target customer segments need more than MCP:
1. LLM App Builders (agents, automations) → Need SDK
2. Data Pipeline Teams (web ingestion at scale) → Need API/SDK
3. Research/Analyst Orgs (repeatable access) → MCP works
4. Enterprises (compliance, private deployments) → Need SDK

## Decision

**Adopt a hybrid multi-interface architecture with SDK as foundation.**

### Architecture

```
┌──────────────────────────────────────────────────┐
│         @llm-browser/core (SDK)                  │
│  All intelligence: SmartBrowser, Learning,      │
│  API Discovery, Sessions, Content Extraction    │
│  - Zero interface dependencies                  │
│  - Standalone TypeScript library               │
│  - Published to npm                             │
└──────────────────────────────────────────────────┘
                        ↑
        ┌───────────────┼────────────────┬──────────────┐
        │               │                │              │
   ┌────▼─────┐   ┌────▼─────┐   ┌─────▼──────┐  ┌───▼────────┐
   │   MCP    │   │  Skills  │   │  REST API  │  │    CLI     │
   │ (5 tools)│   │ (prompts)│   │  (hosted)  │  │  (future)  │
   └──────────┘   └──────────┘   └────────────┘  └────────────┘
        │               │                │              │
        └───────────────┴────────────────┴──────────────┘
                        ↓
           ┌────────────────────────────┐
           │    User Choice by Need:    │
           │  - Research → Skills/MCP   │
           │  - Scraping → SDK/API      │
           │  - Automation → SDK        │
           │  - Production → API        │
           └────────────────────────────┘
```

### Interface Details

**1. SDK (@llm-browser/core)**
- Standalone npm package
- All core intelligence and learning
- Zero dependencies on MCP/API layers
- Full TypeScript types
- Can be embedded in any Node.js app

**2. MCP Server (Simplified)**
- Thin wrapper around SDK (5-6 tools)
- Consolidated from current 25 tools
- For Claude Desktop users
- Research-focused UX

**3. Claude Skills**
- Prompt templates guiding MCP usage
- Easiest UX for non-technical users
- 5-10 pre-built workflows
- Drives product-led growth

**4. Hosted REST API**
- HTTP endpoints wrapping SDK
- Multi-tenant with usage-based billing
- Platform-agnostic (any LLM)
- Primary monetization path

**5. CLI (Future)**
- Command-line wrapper of SDK
- For power users and scripts
- Complements MCP/API

## Consequences

### Positive

**For Research Users:**
- ✅ Simplified MCP (5 tools vs 25) = less confusion
- ✅ Skills provide easiest possible UX (just prompts)
- ✅ No coding required
- ✅ Learning happens automatically

**For Scraping Users:**
- ✅ SDK enables direct usage (no LLM overhead)
- ✅ ~100x cost reduction (no LLM tokens per request)
- ✅ ~10x latency reduction (no LLM roundtrip)
- ✅ Can embed in existing applications
- ✅ Full programmatic control

**For Business:**
- ✅ Multiple entry points (Skills → MCP → SDK → API)
- ✅ Multiple revenue streams (hosted API, enterprise SDK)
- ✅ Platform-agnostic (not locked to Anthropic)
- ✅ Broader addressable market
- ✅ Open-source SDK drives adoption
- ✅ Commercial API drives revenue

**For Architecture:**
- ✅ Single source of truth (SDK)
- ✅ Smaller API surface per interface
- ✅ Better testability (test SDK once)
- ✅ Clear separation of concerns
- ✅ Each interface optimized for its use case

### Negative

**Development Complexity:**
- ❌ More interfaces to maintain
- ❌ Need to coordinate releases across packages
- ❌ Documentation multiplied (SDK, MCP, API, Skills)
- ❌ More testing surfaces

**Migration Cost:**
- ❌ Existing MCP users need migration (deprecated tools)
- ❌ Refactoring effort to extract SDK
- ❌ Learning curve for SDK users

**Mitigation:**
- Keep deprecated MCP tools working for 2-3 releases
- Provide migration guides and examples
- Start with SDK extraction, layer interfaces gradually
- Automated tests for SDK prevent regression
- Generate docs from TypeScript types

### Neutral

- Interface choice creates some decision overhead for users
  - Mitigated by clear use-case-to-interface mapping
- SDK maintenance is additional work
  - But enables all other interfaces, so worth it

## Implementation Plan

**Phase 1: MCP Consolidation (Weeks 1-2)**
- Tasks: TC-001 to TC-010
- Outcome: 25 tools → 5-6 tools
- Benefit: Immediate improvement for research use case

**Phase 2: SDK Extraction (Weeks 3-5)**
- Tasks: SDK-001 to SDK-012
- Outcome: `@llm-browser/core` published to npm
- Benefit: Enables scraping use case

**Phase 3: Skills Creation (Week 5)**
- Tasks: SK-001 to SK-011
- Outcome: 5-10 skills submitted to Claude directory
- Benefit: Easiest UX, drives adoption

**Phase 4: Hosted API (Weeks 6-10)**
- Tasks: API-001 to API-017
- Outcome: Production REST API with billing
- Benefit: Monetization, platform-agnostic

**Phase 5: Ecosystem (Future)**
- CLI tool, Python SDK, integrations
- Expands market reach

## Alternatives Considered

### Alternative 1: MCP Only (Status Quo)
**Rejected because:**
- Doesn't serve scraping use case (too slow, too expensive)
- 25 tools overwhelm research users
- Locks to Anthropic ecosystem
- Can't embed in applications

### Alternative 2: API Only
**Rejected because:**
- Loses Claude Desktop integration
- Requires all users to run HTTP server
- Less discoverable than MCP/Skills
- Harder for non-technical users

### Alternative 3: SDK Only
**Rejected because:**
- Requires coding for all use cases
- Loses LLM composition benefits
- Not discoverable for researchers
- Higher barrier to entry

### Alternative 4: Separate Products (Scraping SDK + Research MCP)
**Rejected because:**
- Duplicates intelligence across codebases
- Maintenance nightmare
- Learning doesn't transfer between products
- Confusing brand/positioning

## Success Metrics

**Adoption:**
- SDK npm downloads
- MCP installs (should stay same or increase)
- Skills usage (new metric)
- API signups

**User Satisfaction:**
- MCP tool selection accuracy (expect improvement)
- First-browse success rate (expect improvement)
- SDK user feedback (qualitative)

**Business:**
- API revenue (primary monetization)
- Enterprise SDK deals
- Conversion rate: Skills → MCP → SDK → API

**Technical:**
- MCP tool count: 25 → 5-6 ✅
- SDK test coverage: >80%
- API uptime: >99.5%
- Support tickets re: "which tool to use" (expect decrease)

## References

- [BACKLOG.md](../BACKLOG.md) - Detailed task breakdown
- [PROJECT_STATUS.md](../PROJECT_STATUS.md) - Strategic overview
- [GO_TO_MARKET.md](../GO_TO_MARKET.md) - Business context
- Use case analysis (2025-12-22 discussion)
- Format analysis document

## Notes

This decision represents a strategic pivot from "MCP server" to "intelligent web access platform with multiple interfaces." The core value (learning, API discovery, tiered rendering) remains the same, but delivery is optimized per use case.

The SDK-first approach is inspired by successful multi-interface libraries like Playwright (library + CLI + test runner) and Next.js (framework + API routes + static export).

## Revision History

- 2025-12-22: Initial proposal (v1.0)
