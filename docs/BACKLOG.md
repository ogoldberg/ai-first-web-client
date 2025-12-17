# LLM Browser Task Backlog

## How to Use This Backlog

Tasks are organized by priority and category. Each task includes:
- **Priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
- **Effort**: S (Small, <1 day), M (Medium, 1-2 days), L (Large, 3-5 days), XL (Extra Large, 5+ days)
- **Category**: Testing, Reliability, Performance, Features, Documentation, Debt

---

## P0: Critical (Do First)

No P0 tasks remaining - all critical items completed.

---

## P1: High Priority (Do Soon)

### Observability

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| O-001 | Replace console.error with structured logging | M | Debt | Use Pino or similar |
| O-002 | Add performance timing to all tiers | M | Performance | Track and expose metrics |
| O-004 | Add learning progress stats | M | Features | Skills, patterns, anti-patterns |

### Testing (Continued)

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| T-004 | Add tests for procedural memory | L | Testing | Skills, versioning, rollback |
| T-005 | Add tests for learning engine | L | Testing | API discovery, selectors |
| T-006 | Add tests for content intelligence | M | Testing | Framework extraction |
| T-007 | Add tests for lightweight renderer | M | Testing | linkedom integration |

---

## P2: Medium Priority (Plan For)

### Features

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| F-001 | Batch browse operations | L | Features | Multiple URLs in one call |
| F-002 | Parallel request handling | L | Features | Concurrent browsing |
| F-003 | Content change detection alerts | M | Features | Notify when content changes |
| F-004 | Skill composition (chain skills) | L | Features | Combine skills into workflows |
| F-005 | Screenshot capture on demand | M | Features | Visual debugging |
| F-006 | HAR file export | M | Features | Network debugging |

### Intelligence

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| I-001 | Angular framework support | M | Features | Add to Content Intelligence |
| I-002 | Vue.js framework support | M | Features | Add to Content Intelligence |
| I-003 | Better API prediction heuristics | L | Performance | Smarter pattern matching |
| I-004 | Cross-domain skill transfer | M | Features | Apply skills to similar sites |
| I-005 | Automatic skill discovery | L | Features | Learn without explicit recording |

### Documentation

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| D-001 | Update PROJECT_STATUS.md | S | Documentation | Reflect current state |
| D-002 | API documentation for MCP tools | M | Documentation | Clear parameter docs |
| D-003 | Architecture diagrams | M | Documentation | Visual system overview |
| D-004 | Usage examples and tutorials | L | Documentation | Getting started guide |

---

## P3: Low Priority (Nice to Have)

### Features

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| F-007 | Pattern import/export | M | Features | Share learned patterns |
| F-008 | Debug mode toggle | S | Features | Verbose output mode |
| F-009 | Trace visualization | L | Features | Visual request flow |
| F-010 | Diff generation for changes | M | Features | Show what changed |
| F-011 | Webhook notifications | L | Features | External integrations |

### Technical Debt

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| D-005 | Configuration file support | M | Debt | .llmbrowserrc |
| D-006 | Dependency injection refactor | L | Debt | Better testability |
| D-007 | Improve URL pattern matching | M | Debt | Regex/wildcards |
| D-008 | Session encryption improvement | M | Debt | Use OS keychain |
| D-009 | Type-safe configuration | S | Debt | Validate config at runtime |

### Performance

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| P-001 | Response caching optimization | M | Performance | Smarter TTL |
| P-002 | Pattern lookup optimization | S | Performance | O(1) instead of O(N) |
| P-003 | Memory usage optimization | M | Performance | Large skill stores |
| P-004 | Connection pooling | M | Performance | Reuse HTTP connections |

---

## Completed Tasks

| ID | Task | Completed | Notes |
|----|------|-----------|-------|
| R-004 | Session health monitoring | 2025-12-17 | Included in R-005 (PR #15) |
| R-005 | Auto-refresh expired sessions | 2025-12-17 | Session health check + auto-refresh callback, PR #15 |
| R-006 | Connection timeout optimization | 2025-12-17 | Central timeout config in src/utils/timeouts.ts, PR #14 |
| O-003 | Create tier usage analytics | 2025-12-17 | get_tier_usage_by_domain MCP tool, PR #13 |
| T-001 | Add integration tests for smart_browse tool | 2025-12-17 | 40 tests for smart_browse and related MCP tools, PR #12 |
| T-003 | End-to-end test: full browse cycle | 2025-12-16 | 13 tests for SmartBrowser browse flow, PR #11 |
| T-002 | Add integration tests for tiered fetcher | 2025-12-16 | 24 tests for tier cascade and fallback, PR #10 |
| R-002 | Add error boundaries to SmartBrowser | 2025-12-16 | Wrap non-critical ops in try-catch, PR #9 |
| R-003 | Graceful degradation when Playwright missing | 2024-12-16 | Lazy loading, clear errors, tier fallback |
| R-001 | Fix rate limiter potential deadlock | 2024-12-16 | Removed lock check from acquire() |
| - | Vitest test framework setup | 2024-12-16 | PR #4 |
| - | Cache eviction LRU fix | 2024-12-16 | PR #4 |
| - | Procedural memory rollback metrics | 2024-12-16 | PR #3 |
| - | Circular dependency DFS check | 2024-12-16 | PR #3 |
| - | Configurable magic numbers | 2024-12-16 | PR #3 |
| - | Bot challenge detection | 2024-12-16 | PR #2 |
| - | Content anomaly detection | 2024-12-16 | PR #2 |
| - | Tiered rendering | 2024-12-16 | PR #5 |
| - | Content Intelligence | 2024-12-16 | PR #5 |
| - | Project file organization | 2024-12-16 | Moved to docs/, scripts/ |

---

## Sprint Planning Template

### Sprint [N]: [Name]

**Duration**: 2 weeks
**Goal**: [One sentence goal]

#### Committed Tasks

| ID | Task | Owner | Status |
|----|------|-------|--------|
| | | | |

#### Stretch Tasks

| ID | Task | Owner | Status |
|----|------|-------|--------|
| | | | |

#### Definition of Done

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] No new technical debt

---

## Task Categories Explained

### Testing
Unit tests, integration tests, end-to-end tests, test infrastructure

### Reliability
Error handling, graceful degradation, recovery, monitoring

### Performance
Speed optimization, caching, resource usage, efficiency

### Features
New capabilities, user-facing functionality

### Documentation
Docs, comments, examples, tutorials

### Debt
Code cleanup, refactoring, removing hacks, improving architecture
