# LLM Browser Development Roadmap

## Current State Summary

**Version**: 0.4.0
**Total Code**: ~12,500 lines TypeScript
**Test Coverage**: Utility functions (cache, retry, rate-limiter, content-extractor)

### Completed Features

- Tiered rendering (Intelligence -> Lightweight -> Playwright)
- Content Intelligence (framework extraction, structured data)
- Procedural Memory (skills, versioning, rollback, anti-patterns)
- Learning Engine (API discovery, selectors, validation)
- Bot challenge detection and anomaly detection
- Session management with persistence
- MCP integration with 15+ tools
- Vitest test framework

### Current Gaps

- No integration tests for MCP tools
- No end-to-end tests
- Limited error handling in some areas
- No structured logging
- PROJECT_STATUS.md is outdated

---

## New Initiative: LLM Customer Experience (CX)

**Goal**: Make the system predictable and trustworthy for LLMs as primary users.

### CX Sprint A: Response Contract & Trust (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| CX-001 Response schema versioning | High | 2 days | Not Started |
| CX-002 Field-level confidence map | High | 2 days | Not Started |
| CX-003 Decision trace in responses | High | 2 days | Not Started |
| CX-004 Error taxonomy + action hints | High | 2 days | Not Started |

**Success Criteria**:
- All responses include `schemaVersion`
- Confidence and decision trace are consistently present
- Failures include actionable recommendations

### CX Sprint B: Learning Integrity & Isolation (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| CX-006 Learning provenance metadata | High | 2 days | Not Started |
| CX-007 Embedded store migration | High | 4 days | Not Started |
| CX-008 Memory isolation + shared pool | Medium | 2 days | Not Started |

**Success Criteria**:
- Patterns carry provenance and verification metadata
- Storage supports concurrent access safely
- Multi-tenant learning is supported without cross-contamination

### CX Sprint C: LLM Control Knobs (1 week)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| CX-005 Budget knobs | Medium | 2 days | Not Started |
| CX-009 Tier parity learning | Medium | 2 days | Not Started |
| CX-010 Config-driven heuristics | Medium | 1 day | Not Started |
| CX-011 Domain capability summary | Medium | 1 day | Not Started |
| CX-012 LLM onboarding spec | Low | 1 day | Not Started |

**Success Criteria**:
- LLMs can express cost/latency preferences
- Tier 1/2 learn patterns where possible
- Domain capabilities are discoverable before browsing

---

## Phase 2: Production Readiness (Current)

**Goal**: Make the system reliable enough for daily use

### Sprint 2.1: Testing & Stability (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Integration tests for MCP tools | High | 3 days | Not Started |
| End-to-end browse tests | High | 2 days | Not Started |
| Error boundary implementation | High | 2 days | Not Started |
| Graceful degradation testing | Medium | 1 day | Not Started |
| Fix rate limiter deadlock | Medium | 1 day | Known Issue |

**Success Criteria**:
- 80%+ test coverage on core paths
- All MCP tools have integration tests
- Graceful failures for all error conditions

### Sprint 2.2: Observability (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Structured logging (Pino) | High | 2 days | Not Started |
| Performance metrics collection | High | 2 days | Not Started |
| Tier usage analytics | Medium | 1 day | Not Started |
| Learning stats dashboard | Medium | 2 days | Not Started |
| Error categorization | Medium | 1 day | Not Started |

**Success Criteria**:
- All operations have structured logs
- Can measure tier usage and response times
- Clear visibility into learning progress

### Sprint 2.3: Reliability (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Session health monitoring | High | 2 days | Not Started |
| Auto-refresh expired sessions | Medium | 1 day | Not Started |
| Improved rate limiting | Medium | 2 days | Not Started |
| Connection pooling | Medium | 2 days | Not Started |
| Timeout optimization | Low | 1 day | Not Started |

**Success Criteria**:
- 95%+ session persistence rate
- No rate limiting issues
- Predictable timeout behavior

---

## Phase 2.5: Learning System Integration & Validation

**Goal**: Complete integration of existing learning components and measure effectiveness

**Context**: The learning system is already sophisticated (~75% maturity) but needs integration polish and validation. This phase focuses on wiring components together and proving they work, not adding new capabilities.

### Sprint 2.5.1: Integration Polish (1 week)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| LI-001 Enable semantic matching by default | High | 1 day | Not Started |
| LI-006 Wire ProceduralMemory to VectorStore | Medium | 1 day | Complete (PR #78) |
| LI-002 Persist anti-patterns to LearningEngine | Medium | 2 days | Not Started |

**Success Criteria**:
- Semantic search works out of the box
- Skill retrieval uses shared vector infrastructure
- Anti-patterns persist beyond suppression window

### Sprint 2.5.2: Effectiveness Measurement (1 week)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| LI-003 Add learning effectiveness metrics | High | 2 days | Complete (PR #77) |
| LI-004 Real-world pattern validation suite | High | 3 days | Not Started |

**Success Criteria**:
- Can measure pattern hit rate and accuracy
- Regression tests validate patterns against live sites
- Dashboard shows learning trends over time

### Sprint 2.5.3: Self-Improvement (1 week)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| LI-005 Dynamic domain group learning | Medium | 2 days | Not Started |
| LI-002b Feedback loop from failures to patterns | Low | 2 days | Not Started |

**Success Criteria**:
- Domain groups can expand based on observed patterns
- Failed patterns improve future matching

---

## Phase 3: Enhanced Intelligence (6 weeks)

**Goal**: Make the learning system more powerful

### Sprint 3.1: Smarter Content Intelligence (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| More framework support (Angular, Vue) | High | 3 days | Not Started |
| Better API prediction | High | 3 days | Not Started |
| Improved structured data extraction | Medium | 2 days | Not Started |
| Multi-page content assembly | Medium | 2 days | Not Started |

### Sprint 3.2: Advanced Procedural Memory (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Skill composition (chain skills) | High | 3 days | Not Started |
| Automatic skill discovery | High | 3 days | Not Started |
| Cross-domain skill transfer | Medium | 2 days | Not Started |
| Skill confidence decay | Low | 1 day | Partially Done |

### Sprint 3.3: Pattern Optimization (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Pattern verification system | High | 3 days | Not Started |
| Stale pattern cleanup | Medium | 1 day | Not Started |
| Pattern import/export | Medium | 2 days | Not Started |
| Pattern quality scoring | Low | 2 days | Not Started |

---

## Phase 4: Advanced Features (8 weeks)

**Goal**: Add power-user capabilities

### Sprint 4.1: Batch & Parallel (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Batch browse operations | High | 3 days | Not Started |
| Parallel request handling | High | 3 days | Not Started |
| Queue management | Medium | 2 days | Not Started |
| Progress reporting | Medium | 2 days | Not Started |

### Sprint 4.2: Change Detection (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Content hash tracking | High | 2 days | Partially Done |
| Change notification system | High | 3 days | Not Started |
| Refresh scheduling | Medium | 2 days | Not Started |
| Diff generation | Medium | 2 days | Not Started |

### Sprint 4.3: Visual Debugging (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Screenshot capture | High | 2 days | Not Started |
| HAR file generation | Medium | 2 days | Not Started |
| Trace visualization | Medium | 3 days | Not Started |
| Debug mode toggle | Low | 1 day | Not Started |

### Sprint 4.4: Action Recording (2 weeks)

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Record browsing actions | High | 4 days | Partially Done |
| Replay recorded actions | High | 3 days | Partially Done |
| Parameterize recordings | Medium | 2 days | Not Started |
| Export/import recordings | Medium | 1 day | Not Started |

---

## Phase 5: Enterprise Features (12 weeks)

**Goal**: Support production deployments

### Areas to Address

1. **Multi-tenant support** - Isolated learning per user/org
2. **OAuth flows** - Complex authentication patterns
3. **Proxy support** - Residential, rotating proxies
4. **Webhook notifications** - Real-time updates
5. **API access** - Programmatic control beyond MCP
6. **Compliance** - robots.txt respect, rate limiting

---

## Technical Debt Tracker

### Critical

| Issue | Impact | Effort | Sprint |
|-------|--------|--------|--------|
| Rate limiter deadlock potential | High | 1 day | 2.1 |
| Missing error boundaries | High | 2 days | 2.1 |
| No integration tests | High | 3 days | 2.1 |

### High Priority

| Issue | Impact | Effort | Sprint |
|-------|--------|--------|--------|
| Console.error only logging | Medium | 2 days | 2.2 |
| Hardcoded timeouts | Medium | 1 day | 2.3 |
| Session encryption basic | Medium | 2 days | 5.x |

### Medium Priority

| Issue | Impact | Effort | Sprint |
|-------|--------|--------|--------|
| No config file support | Low | 1 day | 3.x |
| Basic URL pattern matching | Low | 2 days | 3.3 |
| No dependency injection | Low | 3 days | 4.x |

---

## Milestone Summary

| Milestone | Target | Key Deliverables |
|-----------|--------|------------------|
| **v0.5.0** | +2 weeks | Integration tests, error handling, logging |
| **v0.6.0** | +4 weeks | Session reliability, metrics, observability |
| **v0.7.0** | +8 weeks | Enhanced intelligence, skill composition |
| **v0.8.0** | +12 weeks | Batch operations, change detection |
| **v1.0.0** | +16 weeks | Production-ready, visual debugging, action recording |

---

## Risk Mitigation

### Technical Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bot detection increases | High | Stealth improvements, fallback to manual |
| Playwright deprecation | Low | Maintain lightweight alternatives |
| Site structure changes | High | Pattern verification, auto-update |
| Performance degradation | Medium | Continuous benchmarking |

### Resource Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope creep | High | Strict sprint planning, prioritization |
| Technical complexity | Medium | Incremental development, testing |
| External dependencies | Medium | Abstract interfaces, fallbacks |

---

## Next Actions

### Immediate (This Week)

1. Set up integration test infrastructure
2. Add first MCP tool tests (smart_browse)
3. Implement basic error boundaries
4. Fix rate limiter issue

### Short-term (Next 2 Weeks)

1. Complete Sprint 2.1 testing tasks
2. Add structured logging
3. Create observability dashboard
4. Update documentation

### Medium-term (Next Month)

1. Complete Phase 2 (Production Readiness)
2. Begin Phase 3 (Enhanced Intelligence)
3. Improve Content Intelligence coverage
4. Add skill composition
