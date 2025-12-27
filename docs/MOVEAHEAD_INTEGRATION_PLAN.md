# MoveAhead.ai Integration Plan

## Overview

This document outlines the strategic integration between **Unbrowser** (llm-browser) and **MoveAhead.ai** to create exceptional research capabilities for relocation assistance.

**Goal:** Maximize MoveAhead's research capabilities by fully leveraging Unbrowser's intelligent browsing, learning, and automation features.

---

## Current State

### MoveAhead.ai Has:
| Component | File | Description |
|-----------|------|-------------|
| MCP Client | `apps/ingestion-cli/src/mcp-client.ts` | Spawns Unbrowser via stdio, supports `smart_browse`, `getDomainIntelligence` |
| Research Flow | `apps/ingestion-cli/src/research-flow.ts` | Topic-based research with URL fallback, keyword matching |
| Content Refresher | `apps/ingestion-cli/src/content-refresher.ts` | Staleness detection, LLM-based change detection |
| MicroStep Seeder | `apps/ingestion-cli/src/seed-microsteps.ts` | Web search + AI extraction for bureaucratic processes |
| Skill Guidance | `apps/ingestion-cli/src/skill-guidance.ts` | Portal-specific guidance, credibility assessment |

### Unbrowser Features Not Yet Leveraged:
| Feature | Status | Potential Impact |
|---------|--------|------------------|
| Workflow Recording (COMP-007-010) | Available | Record and replay research patterns |
| Verification Engine | Available | Structured content validation with confidence |
| Form Automation (GAP-001) | Available | Learn and replay form submissions |
| Auth Flow Detection (GAP-003) | Available | Detect and resolve authentication |
| Pagination Discovery (GAP-005) | Available | Learn pagination patterns |
| API Discovery | Available | Auto-discover and document APIs |
| Procedural Memory | Available | Cross-domain skill transfer |
| SSO Detection (GAP-009) | Planned | Multi-domain login reuse |

---

## Integration Opportunities

### 1. Workflow Recording for Research Patterns

**Problem:** `research-flow.ts` has hardcoded Spain sources and manual URL fallback logic.

**Solution:** Use Unbrowser's workflow recording to capture and replay research patterns.

```typescript
// Record successful research as replayable workflow
const session = await unbrowser.workflows.startRecording({
  metadata: { topic: 'digital_nomad_visa', country: 'ES', type: 'research' }
});

// Research flow captured automatically
await performResearch(topic);

// Save for future replay
await unbrowser.workflows.stopRecording(session.id);

// Later - replay with 10x speed improvement
const result = await unbrowser.workflows.replay(workflowId, {
  variables: { topic: 'golden_visa', country: 'PT' }
});
```

**Benefits:**
- Research patterns become replayable and transferable
- Success rates tracked and optimized
- New countries leverage learned patterns from similar jurisdictions

---

### 2. Verification Engine for Content Quality

**Problem:** `content-refresher.ts` uses simple hash comparison + LLM for change detection.

**Solution:** Use Unbrowser's VerificationEngine for structured validation.

```typescript
const result = await unbrowser.browse(sourceUrl, {
  verify: {
    enabled: true,
    mode: 'thorough',
    checks: [
      { type: 'content', assertion: { fieldExists: ['requirements', 'fees', 'timeline'] } },
      { type: 'content', assertion: { containsText: 'visa', excludesText: '404' } },
      { type: 'content', assertion: { minLength: 500 } }
    ],
    learnFromResults: true
  }
});

if (result.verification.passed && result.verification.confidence > 0.8) {
  await saveToKnowledgeBase(result);
}
```

**Benefits:**
- Structured validation instead of ad-hoc checks
- Learned verifications improve over time
- Confidence scores for content quality

---

### 3. API Discovery for Government Portals

**Problem:** MoveAhead scrapes HTML even when APIs exist.

**Solution:** Let Unbrowser discover APIs automatically.

```typescript
const intelligence = await unbrowser.getDomainIntelligence('exteriores.gob.es');

const api = intelligence.discoveredApis.find(a =>
  a.canBypassBrowser && a.confidence === 'high'
);

if (api) {
  // Use API directly - 10-50x faster
  return await unbrowser.executeApiCall(api.endpoint);
}
```

**Benefits:**
- 10-50x speed improvements for API vs browser
- Lower blocking/CAPTCHA rates
- More reliable data extraction

---

### 4. Session Management and SSO Reuse

**Problem:** Each research session starts fresh, requiring repeated logins.

**Solution:** Use Unbrowser's session management + SSO detection (GAP-009).

```typescript
// Save authenticated session
await unbrowser.saveSession('agenciatributaria.es', 'tax-portal');

// Reuse across related domains (GAP-009)
// If logged into agenciatributaria.es with cl@ve,
// automatically reuse for seg-social.es (same SSO)
const result = await unbrowser.smartBrowse(
  'https://sede.agenciatributaria.gob.es/protected-area',
  { sessionProfile: 'tax-portal' }
);
```

---

### 5. Procedural Memory for Cross-Country Transfer

**Problem:** Each country's research is implemented from scratch.

**Solution:** Use Unbrowser's skill transfer for similar portals.

```typescript
// Skills learned for Spain's government portals transfer to Portugal
const result = await unbrowser.smartBrowse('https://aima.gov.pt/vistos', {
  applySkillsFrom: ['gov-portal-eu']
});
```

---

### 6. Pagination Discovery for Catalog Extraction

**Problem:** `research-flow.ts` doesn't handle paginated content well.

**Solution:** Use Unbrowser's pagination discovery.

```typescript
const result = await unbrowser.smartBrowse(
  'https://boe.es/legislacion/codigos/',
  {
    followPagination: true,
    maxPages: 10
    // Unbrowser learns pagination patterns automatically
  }
);
```

---

### 7. Content Change Prediction

**Problem:** Fixed 90-day staleness threshold in `content-refresher.ts`.

**Solution:** Use Unbrowser's learned refresh recommendations.

```typescript
const result = await unbrowser.smartBrowse(sourceUrl, {
  checkForChanges: true
});

// Dynamic refresh based on observed patterns
const refreshHours = result.intelligence.recommendedRefreshHours;
```

---

## Architecture Recommendation

### Current: MCP Server via stdio
```typescript
// MoveAhead spawns Unbrowser as subprocess
const server = spawn('node', [LLM_BROWSER_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
```

### Recommended: Embedded SDK
```typescript
import { createLLMBrowser } from 'llm-browser/sdk';

const browser = await createLLMBrowser({
  storage: './moveahead-unbrowser-data',
  sharedPatternPool: true  // Benefit from all MoveAhead users' learnings
});
```

**Benefits:**
- No process management overhead
- Direct TypeScript types
- Shared learning across instances
- Easier debugging and testing

---

## Implementation Phases

### Phase 1: Foundation (Priority: Critical)
| Task | Effort | Impact |
|------|--------|--------|
| Migrate from MCP to SDK | M | High - Direct API access |
| Add session persistence | S | High - Reduce auth friction |
| Integrate API discovery | M | Very High - 10-50x speedup |

### Phase 2: Research Enhancement (Priority: High)
| Task | Effort | Impact |
|------|--------|--------|
| Add Verification Engine | M | High - Better content quality |
| Implement pagination discovery | S | Medium - Complete data extraction |
| Add workflow recording | L | Very High - Replayable research |

### Phase 3: Intelligence (Priority: Medium)
| Task | Effort | Impact |
|------|--------|--------|
| Enable procedural memory transfer | M | High - Faster country expansion |
| Add content change prediction | S | Medium - Smarter refresh |
| Implement SSO detection (GAP-009) | M | High - Multi-portal auth |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Research speed (per topic) | ~30s | <5s with API discovery |
| Content validation accuracy | ~70% (LLM guess) | >90% with VerificationEngine |
| Session reuse rate | 0% | >80% with session management |
| Cross-country pattern reuse | 0% | >50% with procedural memory |
| Research workflow replay success | N/A | >85% with workflow recording |

---

## Related Tasks

### In Unbrowser Backlog:
- **GAP-009**: Multi-Domain Login Reuse (directly benefits MoveAhead)
- **INT-001 to INT-007**: New integration tasks (see BACKLOG.md)

### In MoveAhead Backlog:
- **UNB-001 to UNB-007**: Unbrowser integration tasks (see MoveAhead BACKLOG.md)

---

## References

- [Unbrowser CLAUDE.md](/Users/og/src/ai-first-web-client/CLAUDE.md)
- [MoveAhead ARCHITECTURE.md](/Users/og/src/move-abroad-ai/docs/ARCHITECTURE.md)
- [Workflow Recording API](docs/api/openapi.yaml)
- [Verification Engine](src/core/verification-engine.ts)
- [Procedural Memory](src/core/procedural-memory.ts)
