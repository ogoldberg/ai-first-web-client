# Unbrowser Vision & Strategy

## Executive Vision

**Unbrowser is the intelligent interface between AI and the web** - a system that learns, adapts, and optimizes how AI agents interact with websites, progressively eliminating the need for heavy browser rendering while maintaining full capability.

### The Problem We Solve

Today's AI web access tools have fundamental limitations:

1. **Scraping tools** (Jina, Firecrawl) render every page fully, every time - no learning, no optimization
2. **Browser automation** (Puppeteer, Playwright) requires code generation for every action
3. **DevTools MCPs** expose raw browser internals but don't learn or optimize
4. **Full browsers are expensive** - 2-5 seconds per page, high memory, complex dependencies

### Our Solution

A **tiered, learning-based browser** that:

- Starts fast (Content Intelligence: 50-200ms)
- Falls back intelligently (Lightweight: 200-500ms, Playwright: 2-5s)
- Learns from every interaction (API discovery, skill building)
- Gets faster over time (pattern reuse, direct API calls)
- Works without Playwright for most sites

---

## Strategic Pillars

### 1. Speed Through Intelligence

**Goal**: Sub-second response for 80%+ of requests

**Strategy**:
- Content Intelligence extracts data without rendering
- Framework detection (Next.js, Nuxt, Gatsby) reveals hidden data
- API prediction eliminates need to render
- Caching with content-aware TTL

### 2. Learning That Compounds

**Goal**: Every interaction makes the system smarter

**Strategy**:
- Procedural Memory stores and replays successful patterns
- Anti-patterns prevent repeating mistakes
- Skill versioning enables safe experimentation
- Cross-domain pattern sharing

### 3. Playwright as Optional

**Goal**: Full functionality without browser dependency

**Strategy**:
- Lightweight DOM (linkedom) handles most JS
- Content Intelligence bypasses rendering entirely
- Graceful degradation when Playwright unavailable
- Clear feedback about what's possible

### 4. LLM-Native Design

**Goal**: Tools that feel natural to AI agents

**Strategy**:
- Structured JSON responses (not formatted text)
- Composable primitives (not monolithic commands)
- Confidence scoring for decision making
- Rich metadata for context

---

## Competitive Analysis

### Current Landscape

| Tool | Speed | Learning | LLM-Native | Complexity |
|------|-------|----------|------------|------------|
| Jina Reader | ~2s | None | Medium | Low |
| Firecrawl | ~3s | None | Medium | Low |
| Puppeteer MCP | ~3s | None | Low | High |
| Chrome DevTools MCP | ~1s | None | Low | Medium |
| **Unbrowser** | ~200ms* | Full | High | Medium |

*For optimized/cached requests

### Our Advantages

1. **Progressive optimization** - Gets faster with use
2. **No code generation** - LLM uses tools directly
3. **Optional Playwright** - Works on any system
4. **Rich learning** - Remembers successful patterns

### Our Challenges

1. **Complexity** - More moving parts than simple scrapers
2. **Anti-bot measures** - Can't bypass sophisticated protection
3. **JS-heavy SPAs** - May need Playwright for complex apps
4. **Cold start** - First visit is slower than subsequent

---

## Success Metrics

### Performance

| Metric | Current | 3 Month Target | 6 Month Target |
|--------|---------|----------------|----------------|
| Avg response (cached) | ~500ms | ~200ms | ~100ms |
| Intelligence tier usage | 40% | 60% | 75% |
| Playwright requirement | 30% | 20% | 10% |
| API bypass rate | 20% | 40% | 60% |

### Learning

| Metric | Current | 3 Month Target | 6 Month Target |
|--------|---------|----------------|----------------|
| Domains with patterns | ~50 | 200 | 500 |
| Skills learned | ~20 | 100 | 300 |
| Pattern reuse rate | 30% | 50% | 70% |
| Anti-patterns tracked | ~5 | 50 | 150 |

### Reliability

| Metric | Current | 3 Month Target | 6 Month Target |
|--------|---------|----------------|----------------|
| Success rate (top 100 sites) | 70% | 85% | 95% |
| Bot detection rate | 20% | 10% | 5% |
| Session persistence | 80% | 95% | 99% |
| Graceful degradation | 60% | 90% | 98% |

---

## User Personas

### 1. AI Agent Developer

**Needs**: Reliable web access for autonomous agents
**Pain points**: Unreliable scraping, slow responses, auth issues
**Our value**: Fast, learning-based access with session management

### 2. Data Pipeline Builder

**Needs**: Efficient batch web data collection
**Pain points**: Rate limiting, pattern changes, maintenance
**Our value**: Automatic pattern learning, change detection

### 3. LLM Application Developer

**Needs**: Web context for RAG/agents
**Pain points**: Token costs from verbose responses, slow rendering
**Our value**: Clean structured data, fast responses

### 4. Research/Analysis User

**Needs**: Ad-hoc web investigation
**Pain points**: Inconsistent extraction, missing content
**Our value**: Multiple extraction strategies, skill learning

---

## Technical Vision

### Architecture Principles

1. **Layered fallback** - Always have a backup strategy
2. **Learn from failures** - Every error improves the system
3. **Composable tools** - Small focused capabilities
4. **Transparent operation** - LLMs can see what's happening

### Future Architecture

```text
                    ┌─────────────────────────────────────┐
                    │         MCP Tool Interface           │
                    │  smart_browse, skills, patterns...   │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │         Strategy Layer               │
                    │  Route requests to optimal path      │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
    ┌─────▼─────┐             ┌───────▼───────┐           ┌───────▼───────┐
    │ Intelligence│             │  Lightweight   │           │   Playwright   │
    │   Tier      │             │     Tier       │           │     Tier       │
    │ (~100ms)    │             │   (~300ms)     │           │   (~2-5s)      │
    └─────────────┘             └───────────────┘           └───────────────┘
          │                           │                           │
    ┌─────▼─────────────────────────────────────────────────────────┐
    │                    Learning & Memory Layer                     │
    │  Procedural Memory | Knowledge Base | Anti-patterns | Sessions │
    └───────────────────────────────────────────────────────────────┘
```

---

## Long-Term Vision (12+ months)

### Phase 4: Autonomous Learning

- Self-improving pattern discovery
- Cross-user pattern sharing (opt-in)
- Automatic skill composition
- Predictive pre-fetching

### Phase 5: Specialized Domains

- E-commerce product extraction
- News/article optimization
- Social media patterns
- Government/enterprise sites

### Phase 6: Ecosystem

- Pattern marketplace
- Community contributions
- Plugin architecture
- Multi-platform support (beyond Claude)

---

## Key Decisions

### Already Made

1. **TypeScript** - Type safety, ecosystem compatibility
2. **MCP Protocol** - Claude Desktop native integration
3. **Tiered rendering** - Progressive optimization
4. **Playwright optional** - Broader compatibility

### Open Questions

1. **Pattern sharing** - How to share learned patterns safely?
2. **Authentication** - How to handle complex OAuth flows?
3. **Anti-bot** - How far to go with stealth measures?
4. **Pricing model** - How would a commercial version work?

---

## Guiding Principles

1. **Speed over features** - A fast tool beats a feature-rich slow one
2. **Learning compounds** - Invest in patterns that reuse
3. **Fail gracefully** - Always have a fallback
4. **LLM-first design** - Optimize for AI consumption
5. **Simplicity wins** - Avoid over-engineering
