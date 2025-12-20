# LLM Browser Task Backlog

## How to Use This Backlog

Tasks are organized by priority and category. Each task includes:
- **Priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
- **Effort**: S (Small, <1 day), M (Medium, 1-2 days), L (Large, 3-5 days), XL (Extra Large, 5+ days)
- **Category**: Testing, Reliability, Performance, Features, Documentation, Debt

---

## P0: Critical (Do First)

### Runtime & Packaging Bugs

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| B-001 | Fix ESM require.resolve usage | S | Debt | `browser-manager.ts` and `content-intelligence.ts` use `require.resolve('playwright')` which fails in ESM. Use `createRequire(import.meta.url)` (DONE) |
| B-002 | Add missing LICENSE file | S | Debt | `package.json` lists LICENSE in files but no LICENSE exists at repo root (DONE) |
| B-003 | Fix npm packaging hygiene | S | Debt | Prevent `.DS_Store` and stray artifacts in npm tarballs; add `.npmignore` (DONE) |

### Security

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| S-001 | Add URL safety policy controls | M | Security | Block private IP ranges (RFC1918), link-local, metadata endpoints, `file://`. Secure defaults with opt-out (DONE) |
| S-002 | Redact secrets in logs | S | Security | Use Pino's `redact` option for `authorization`, `cookie`, token-like strings, localStorage (DONE) |

---

## P1: High Priority (Do Soon)

### Architecture & Reliability

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| A-001 | Unify learning persistence | M | Debt | Merge `KnowledgeBase` and `LearningEngine` into one canonical store with migration (DONE) |
| A-002 | Debounced + atomic persistence | M | Reliability | Debounce saves, batch updates, write atomically (temp + rename) to avoid corruption (DONE) |
| A-003 | Add output size controls | M | Features | Add `maxChars`, `includeTables`, `includeNetwork`, `includeConsole` flags; smaller defaults (DONE) |
| A-004 | Deprecate legacy tools | S | Debt | Mark legacy browsing tools as deprecated; funnel users to `smart_browse` (DONE) |

### Security (Continued)

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| S-003 | Encrypt sessions at rest | M | Security | Pluggable crypto with user-supplied key (env var) or OS keychain integration (DONE) |

### Testing

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| T-004 | Add tests for procedural memory | L | Testing | Skills, versioning, rollback (DONE) |
| T-005 | Add tests for learning engine | L | Testing | API discovery, selectors (DONE) |
| T-008 | Live tests for site API handlers | M | Testing | Verify Reddit, HN, GitHub, Wikipedia, SO handlers against real URLs (DONE) |

---

## P1.5: API Learning System (Next Major Initiative)

See [API_LEARNING_PLAN.md](API_LEARNING_PLAN.md) for the full plan and architecture.

**Goal:** Shift from hardcoded site-specific handlers to a generalized learning system that can discover and apply API patterns automatically.

| ID | Phase | Task | Effort | Status | Notes |
|----|-------|------|--------|--------|-------|
| L-001 | 1 | Pattern Extraction | L | DONE | Extract templates from 8 existing handlers (json-suffix, registry-lookup, rest-resource, etc.) |
| L-002 | 1 | Pattern Registry | M | DONE | Create storage and lookup for learned API patterns |
| L-003 | 2 | Learning From Success | L | DONE | Auto-learn patterns when API extraction succeeds |
| L-004 | 3 | Pattern Application | L | DONE | Apply learned patterns to new sites (supersedes I-003) |
| L-005 | 4 | Cross-Site Transfer | M | DONE | Transfer patterns to similar sites (supersedes I-004) |
| L-006 | 5 | OpenAPI Discovery | L | DONE | Auto-detect and use OpenAPI/Swagger specs (supersedes I-011) |
| L-007 | 6 | Failure Learning | M | | Learn from mistakes, build anti-patterns |

**Related existing items:** I-003, I-004, I-005, I-011 are superseded by phases above.

---

## P1.5: API Documentation Discovery (New Initiative)

See [API_DOCUMENTATION_DISCOVERY_PLAN.md](API_DOCUMENTATION_DISCOVERY_PLAN.md) for the full plan and architecture.

**Goal:** Automatically detect and leverage documented APIs instead of learning through observation. Why learn what's already documented?

| ID | Phase | Task | Effort | Status | Notes |
|----|-------|------|--------|--------|-------|
| D-001 | 1 | GraphQL Introspection | L | DONE | Auto-discover GraphQL schema via `__schema` query (supersedes I-012) |
| D-002 | 2 | API Docs Page Detection | L | | Parse HTML API documentation (/docs, /developers, etc.) |
| D-003 | 3 | Link Relation Discovery | M | | RFC 8288 Link headers, HTML `<link>` tags, HATEOAS |
| D-004 | 4 | OpenAPI Enhancement | M | | $ref resolution, POST/PUT/DELETE support, better YAML |
| D-005 | 5 | AsyncAPI Discovery | M | | WebSocket, MQTT, Kafka event-driven APIs |
| D-006 | 6 | Alt Spec Formats | M | | RAML, API Blueprint, WADL parsing |
| D-007 | 7 | Robots/Sitemap Analysis | S | | Extract API hints from robots.txt/sitemap.xml |
| D-008 | 8 | Discovery Orchestrator | L | | Unified pipeline with caching and prioritization |
| D-009 | 9 | Auth Workflow Helper | L | | Guided authentication setup for discovered APIs (supersedes I-013) |

**Supersedes:** I-012 (GraphQL introspection), I-013 (Authentication workflow helper)

---

## P2: Medium Priority (Plan For)

### Debugging & Observability

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| O-005 | Add debug/replay trace recording | M | Features | Record tier decisions, selectors tried, validation reasons for failure reproduction |
| O-006 | Extraction quality benchmarking | L | Testing | Offline corpus + regression suite for content extraction and table parsing |

### Features

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| F-001 | Batch browse operations | L | Features | Multiple URLs in one call |
| F-002 | Parallel request handling | L | Features | Concurrent browsing |
| F-003 | Content change detection alerts | M | Features | Notify when content changes |
| F-004 | Skill composition (chain skills) | L | Features | Combine skills into workflows |
| F-005 | Screenshot capture on demand | M | Features | Visual debugging |
| F-006 | HAR file export | M | Features | Network debugging |
| F-012 | Skill sharing + portability | M | Features | Export/import skill packs by domain vertical (gov, ecommerce, docs) |

### Intelligence

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| I-001 | Angular framework support | M | Features | Add to Content Intelligence |
| I-002 | Vue.js framework support | M | Features | Add to Content Intelligence |
| I-003 | Better API prediction heuristics | L | Performance | Superseded by L-004 (API Learning System Phase 3) |
| I-004 | Cross-domain skill transfer | M | Features | Superseded by L-005 (API Learning System Phase 4) |
| I-005 | Automatic skill discovery | L | Features | Superseded by L-003 (API Learning System Phase 2) |
| I-006 | NPM registry API handler | S | Features | `registry.npmjs.org/package/json` (DONE) |
| I-007 | PyPI API handler | S | Features | `pypi.org/pypi/{package}/json` (DONE) |
| I-008 | Dev.to API handler | S | Features | `dev.to/api/articles` (DONE) |
| I-009 | Medium API handler | M | Features | Undocumented but discoverable |
| I-010 | YouTube API handler | M | Features | Requires API key configuration |
| I-011 | OpenAPI spec discovery | L | Features | Superseded by L-006 (API Learning System Phase 5) |
| I-012 | GraphQL introspection | L | Features | Superseded by D-001 (API Documentation Discovery) |
| I-013 | Authentication workflow helper | L | Features | Superseded by D-009 (API Documentation Discovery) |

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
| F-013 | Human-in-the-loop inspection UI | L | Features | Minimal UI to see selectors, extracted content, tier decisions |
| F-014 | Advanced anti-bot strategies | L | Features | Rotating user agents, smarter wait strategies, proxy provider integration |

### Technical Debt

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| D-005 | Configuration file support | M | Debt | .llmbrowserrc |
| D-006 | Dependency injection refactor | L | Debt | Better testability |
| D-007 | Improve URL pattern matching | M | Debt | Regex/wildcards |
| D-008 | Session encryption improvement | M | Debt | Use OS keychain (superseded by S-003) |
| D-009 | Type-safe configuration | S | Debt | Validate config at runtime |
| D-010 | Split large god files | M | Debt | `src/index.ts` and `content-intelligence.ts` are too large; refactor into smaller modules |
| D-011 | Clean up untracked src files | S | Debt | `skill-generalizer.ts`, `embedding-provider.ts` should be committed or removed |

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
| L-005 | Cross-Site Transfer | 2025-12-19 | Transfer patterns to similar sites. API domain groups, site similarity scoring, pattern transfer with confidence decay, auto-transfer, outcome tracking. 30 tests. PR #43. |
| L-004 | Pattern Application | 2025-12-19 | Apply learned patterns to new sites. tryLearnedPatterns strategy, handlePatternFailure helper, HTML content conversion, confidence thresholds. 17 tests. PR #42. |
| L-003 | Learning From Success | 2025-12-19 | Auto-learn patterns when API extraction succeeds. ApiExtractionSuccess events, learnFromExtraction(), content mapping inference. 15 tests. PR #41. |
| S-003 | Encrypt sessions at rest | 2025-12-18 | AES-256-GCM encryption with PBKDF2 key derivation. Set LLM_BROWSER_SESSION_KEY env var. Auto-migration from unencrypted. 28 tests. |
| A-001 | Unify learning persistence | 2025-12-18 | LearningEngine now the canonical store. Added KnowledgeBase compatibility methods (getPatterns, getBypassablePatterns, findPattern, updateSuccessRate, learn, clear). Automatic migration from knowledge-base.json. KnowledgeBase deprecated with warnings. |
| A-002 | Debounced + atomic persistence | 2025-12-18 | PersistentStore utility with debouncing and atomic writes (temp + rename). Applied to KnowledgeBase, LearningEngine, ProceduralMemory, SessionManager. 33 tests. |
| T-008 | Live tests for site API handlers | 2025-12-18 | 25 tests against real APIs (Reddit, HN, GitHub, Wikipedia, StackOverflow) - run with LIVE_TESTS=true |
| A-003 | Add output size controls | 2025-12-18 | maxChars truncation, includeTables/includeNetwork/includeConsole/includeHtml flags for smart_browse |
| A-004 | Deprecate legacy tools | 2025-12-18 | Added deprecation warnings to browse tool, logs deprecation at runtime, suggests smart_browse |
| S-001 | Add URL safety policy controls | 2025-12-18 | SSRF protection: blocks RFC1918, localhost, link-local, metadata endpoints, dangerous protocols. 56 tests. |
| T-005 | Add tests for learning engine | 2025-12-17 | 64 tests for API discovery, selectors, validation, anomaly detection, pagination, persistence |
| O-004 | Add learning progress stats | 2025-12-17 | get_learning_progress MCP tool with skills, anti-patterns, coverage, trajectories, PR #22 |
| I-014 | HackerNews API handler | 2025-12-17 | Firebase JSON API for items and top stories |
| I-015 | GitHub API handler | 2025-12-17 | Repos, users, issues, PRs via public REST API |
| I-016 | Wikipedia API handler | 2025-12-17 | REST v1 summary API, multi-language support |
| I-017 | StackOverflow API handler | 2025-12-17 | SE API 2.3 for questions + answers, all SE network sites |
| I-018 | Reddit API handler | 2025-12-17 | JSON URL transformation for posts and subreddits |
| O-002 | Add performance timing to all tiers | 2025-12-17 | PerformanceTracker utility with percentile stats, get_performance_metrics MCP tool |
| O-001 | Replace console.error with structured logging | 2025-12-17 | Pino-based logger with component child loggers, PR #20 |
| T-007 | Add tests for lightweight renderer | 2025-12-17 | 43 tests covering linkedom integration, script execution, anti-bot detection, PR #17 |
| T-006 | Add tests for content intelligence | 2025-12-17 | 31 tests covering framework extraction, structured data, fallbacks, PR #16 |
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
