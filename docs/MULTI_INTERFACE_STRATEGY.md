# Multi-Interface Strategy - Executive Summary

**Date:** 2025-12-22
**Status:** Approved for Implementation

## TL;DR

Moving from **MCP-only (25 tools)** to **multi-interface architecture** with SDK foundation:
- **Research users** → Skills (easiest) or MCP (5 tools)
- **Scraping users** → SDK or hosted API
- **Result:** Each use case gets optimal interface

## The Problem

**Current:** 25 MCP tools trying to serve both scraping AND research
- ❌ Research users overwhelmed by choice (25 tools)
- ❌ Scraping users pay LLM overhead on every request
- ❌ Can't embed in applications (MCP server required)
- ❌ Locked to Anthropic ecosystem

## The Solution

### Hybrid Architecture

```
          @unbrowser/core (SDK)
                  ↓
    ┌─────────────┼─────────────┬──────────┐
    ↓             ↓             ↓          ↓
  Skills        MCP         REST API     CLI
(easiest)   (flexible)    (hosted)   (power)
```

**One foundation, multiple interfaces**

### Four Initiatives

#### 1. MCP Tool Consolidation (TC-001 to TC-010)
**What:** 25 tools → 5 core tools
**Why:** Eliminate choice paralysis for researchers
**When:** Weeks 1-2 (immediate)

**Result:**
- `smart_browse` (auto-learning)
- `execute_api_call` (bypass rendering)
- `api_auth` (consolidated)
- `session_management` (cookies)
- `batch_browse` (optional)

#### 2. SDK Extraction (SDK-001 to SDK-012)
**What:** Extract core into `@unbrowser/core` npm package
**Why:** Enable scraping without LLM overhead
**When:** Weeks 3-5

**Result:**
```typescript
import { SmartBrowser } from '@unbrowser/core';
const browser = new SmartBrowser();
await browser.browse(url); // Learns once
await browser.executeApi(api); // 1000x fast
```

#### 3. Skills & Prompts (SK-001 to SK-011)
**What:** 5-10 Claude skills for common workflows
**Why:** Simplest possible UX for researchers
**When:** Week 5

**Examples:**
- "Research Product Information"
- "Monitor Website Changes"
- "Scrape Product Catalog"
- "Discover APIs"

#### 4. Hosted API (API-001 to API-017)
**What:** Production REST API with billing
**Why:** Monetization, platform-agnostic access
**When:** Weeks 6-10

**Result:**
```bash
curl -X POST api.llm-browser.com/browse \
  -H "Authorization: Bearer $KEY" \
  -d '{"url": "..."}'
```

## Benefits by Stakeholder

### For Research Users
- ✅ 80% fewer tools (25 → 5)
- ✅ Skills = just describe what you want
- ✅ No coding required
- ✅ Auto-learning, no manual management

### For Scraping Users
- ✅ SDK = no LLM overhead
- ✅ ~100x cost reduction
- ✅ ~10x latency reduction
- ✅ Full programmatic control

### For Business
- ✅ Multiple entry points (funnel: Skills → MCP → SDK → API)
- ✅ Multiple revenue streams (hosted API, enterprise)
- ✅ Platform-agnostic (not Anthropic-locked)
- ✅ Open SDK drives adoption, commercial API drives revenue

### For Architecture
- ✅ Single source of truth (SDK)
- ✅ Test once, works everywhere
- ✅ Clear separation of concerns
- ✅ Each interface optimized for its use case

## Task Breakdown

**Total:** 50 tasks across 4 initiatives

### MCP Consolidation (10 tasks)
- P0: Auth consolidation, auto-embed insights, auto-apply skills
- P1: Debug mode, remove analytics/infrastructure tools
- Effort: 2 weeks

### SDK Extraction (12 tasks)
- P0: Package setup, extract core components
- P1: Types, docs, examples, MCP refactor
- Effort: 3 weeks

### Skills (11 tasks)
- P1: Design templates, create 5 core skills
- P2: User testing, directory submission
- Effort: 1 week

### Hosted API (17 tasks)
- P1: Design, auth, rate limiting, billing
- P2: Infrastructure, monitoring, beta launch
- Effort: 4+ weeks

## Implementation Phases

**Phase 1 (Weeks 1-2): Fix MCP**
→ Immediate improvement for research use case

**Phase 2 (Weeks 3-5): Extract SDK**
→ Enable scraping use case

**Phase 3 (Week 5): Add Skills**
→ Simplest UX, drives adoption

**Phase 4 (Weeks 6-10): Launch API**
→ Monetization path

**Phase 5 (Future): Ecosystem**
→ CLI, Python SDK, integrations

## Success Metrics

**Adoption:**
- MCP tool selection accuracy ↑
- First-browse success rate ↑
- SDK npm downloads (new)
- API signups (new)

**Business:**
- API revenue (primary monetization)
- Enterprise SDK deals
- Conversion funnel: Skills → MCP → SDK → API

**Technical:**
- Tool count: 25 → 5 ✅
- SDK test coverage: >80%
- API uptime: >99.5%

## Key Documents

- **[BACKLOG.md](BACKLOG.md)** - All 50 tasks with IDs, effort, dependencies
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** - Strategic overview and progress
- **[ADR 001](adr/001-multi-interface-architecture.md)** - Architectural decision record
- **[GO_TO_MARKET.md](GO_TO_MARKET.md)** - Business context

## Questions & Decisions

### Q: Why not just fix MCP?
A: MCP alone can't serve scraping (too slow/expensive). Need SDK for that use case.

### Q: Why multiple interfaces instead of one perfect one?
A: Research needs simplicity (Skills/MCP), scraping needs speed (SDK/API). Conflicting requirements.

### Q: What about existing MCP users?
A: Deprecated tools work for 2-3 releases. Migration guides provided. Simplified MCP is better anyway.

### Q: Why SDK-first instead of API-first?
A: SDK enables self-hosting (enterprises), CLI, Python SDK, and serves as foundation for API. More flexible.

### Q: Won't this increase maintenance burden?
A: Yes for interfaces, but SDK centralizes intelligence. Test once, wrap many times.

## Timeline Summary

```
Week 1-2:  MCP Consolidation (25→5 tools)
Week 3-5:  SDK Extraction + Publish
Week 5:    Skills Creation + Submit
Week 6-10: Hosted API + Beta Launch
-------------------------------------------
Total: ~10 weeks to full multi-interface
```

## Approval

This strategy was developed through use case analysis (2025-12-22) and represents a shift from "MCP server" to "intelligent web access platform with multiple interfaces."

Core value (learning, API discovery, tiered rendering) remains the same. Delivery is optimized per use case.

**Next Steps:**
1. Start TC-001 (Consolidate auth tools)
2. Plan SDK package structure
3. Draft first skill templates
4. Begin API design document
