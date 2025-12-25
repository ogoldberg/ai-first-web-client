# Unbrowser Task Backlog

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

### Testing

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| T-009 | Fix bootstrap pattern tests | M | Testing | 8 failing tests in `learned-pattern-application.test.ts` - bootstrap patterns not loading correctly after initialization (DONE - PR #98) |

---

## P1: High Priority (Do Soon)

### Architecture & Reliability

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| A-001 | Unify learning persistence | M | Debt | Merge `KnowledgeBase` and `LearningEngine` into one canonical store with migration (DONE) |
| A-002 | Debounced + atomic persistence | M | Reliability | Debounce saves, batch updates, write atomically (temp + rename) to avoid corruption (DONE) |
| A-003 | Add output size controls | M | Features | Add `maxChars`, `includeTables`, `includeNetwork`, `includeConsole` flags; smaller defaults (DONE) |
| A-004 | Deprecate legacy tools | S | Debt | Mark legacy browsing tools as deprecated; funnel users to `smart_browse` (DONE) |

### LLM Customer Experience

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| CX-001 | Response schema versioning | M | Features | Add `schemaVersion` to all tool outputs; document compatibility (DONE) |
| CX-002 | Field-level confidence map | M | Reliability | Per-field confidence for content, APIs, tables (DONE) |
| CX-003 | Decision trace in responses | M | Reliability | Include tier attempts, selectors tried, validators, fallbacks (DONE) |
| CX-004 | Error taxonomy + action hints | M | Reliability | Standardize error codes and `recommendedActions` (DONE) |
| CX-006 | Learning provenance metadata | M | Reliability | Pattern source, last verified, decay reason (DONE) |
| CX-007 | Embedded store migration | L | Reliability | Replace JSON persistence with SQLite (or similar) (DONE) |
| CX-008 | Memory isolation + shared pool | M | Architecture | Per-tenant store with opt-in shared pool (DONE) |

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
| L-007 | 6 | Failure Learning | M | DONE | Learn from mistakes, build anti-patterns |

**Related existing items:** I-003, I-004, I-005, I-011 are superseded by phases above.

---

## P1.5: API Documentation Discovery (New Initiative)

See [API_DOCUMENTATION_DISCOVERY_PLAN.md](API_DOCUMENTATION_DISCOVERY_PLAN.md) for the full plan and architecture.

**Goal:** Automatically detect and leverage documented APIs instead of learning through observation. Why learn what's already documented?

Note: "Order" reflects the implementation sequence from the plan document, optimized for dependencies and impact.

| ID | Order | Task | Effort | Status | Notes |
|----|-------|------|--------|--------|-------|
| D-001 | 1 | GraphQL Introspection | L | DONE | Auto-discover GraphQL schema via `__schema` query |
| D-008 | 2 | Discovery Orchestrator | L | DONE | Unified pipeline with caching and prioritization |
| D-004 | 3 | OpenAPI Enhancement | M | DONE | $ref resolution, POST/PUT/DELETE support, better YAML |
| D-003 | 4 | Link Discovery | M | DONE | RFC 8288 Link headers, HTML `<link>` tags, HATEOAS |
| D-002 | 5 | Docs Page Detection | L | DONE | Parse HTML API documentation (/docs, /developers, etc.) |
| D-009 | 6 | Auth Workflow Helper | L | DONE | Guided authentication setup for discovered APIs |
| D-005 | 7 | AsyncAPI Discovery | M | DONE | WebSocket, MQTT, Kafka event-driven APIs |
| D-006 | 8 | Alt Spec Formats | M | DONE | RAML, API Blueprint, WADL parsing |
| D-007 | 9 | Robots/Sitemap Analysis | S | DONE | Extract API hints from robots.txt/sitemap.xml |
| D-010 | 10 | Backend Framework Fingerprinting | M | DONE | Detect Rails, Django, Phoenix, FastAPI, Spring Boot, Laravel, Express, ASP.NET Core from headers/HTML and apply convention-based API patterns |

**Supersedes:** I-012 (GraphQL introspection), I-013 (Authentication workflow helper)

---

## P1.5: Vector Embedding Storage (New Initiative)

See [VECTOR_EMBEDDING_STORAGE_PLAN.md](VECTOR_EMBEDDING_STORAGE_PLAN.md) for the full design.

**Goal:** Add semantic similarity search for patterns, skills, and content using LanceDB as a complementary vector database to SQLite, enabling "find similar patterns" instead of just exact/template matching.

**Architecture:** SQLite (structured data, ACID) + LanceDB (vector search, KNN) linked by ID. Embeddings generated via `@xenova/transformers` (already in project).

| ID | Phase | Task | Effort | Status | Notes |
|----|-------|------|--------|--------|-------|
| V-001 | 1 | VectorStore Core | L | DONE | Install LanceDB, create VectorStore class with CRUD ops, unit tests |
| V-002 | 2 | Embedding Pipeline | L | DONE | Connect EmbeddingProvider to VectorStore, ingestion pipeline, auto-index patterns, migration utility |
| V-003 | 3 | Query Integration | M | DONE | SemanticPatternMatcher, LearningEngine integration, fallback logic, performance tuning |
| V-004 | 4 | Extended Features | M | DONE | Skill similarity, error pattern matching, content dedup, analytics |

**Benefits:**
- Find semantically similar patterns even with different text
- Cross-domain pattern transfer based on meaning, not just URL structure
- Better error matching for known issues
- Foundation for future LLM-assisted learning

---

## P2: Learning System Integration & Validation (New Initiative)

**Goal:** Complete integration of existing learning components and validate effectiveness. The learning system is sophisticated but needs wiring and real-world validation.

**Context:** Evaluation concluded that the learning system is already advanced (~75% maturity) with temporal decay, skill versioning, cross-domain transfer, anti-patterns, and vector embeddings. However, components aren't fully integrated, and there's no way to measure effectiveness. Focus on finishing what's built rather than adding complexity.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| LI-001 | Enable semantic matching by default | S | Completed | SemanticPatternMatcher (V-003) exists but requires explicit initialization. Auto-initialize when VectorStore available, graceful fallback when not. |
| LI-002 | Wire feedback loops for anti-patterns | M | Complete | FailureLearning creates anti-patterns, LearningEngine persists high-confidence ones. Pattern failures feed back via recordPatternFailure(). Registry subscription, ContentIntelligence wiring via wireToContentIntelligence(). 11 new tests. |
| LI-003 | Add learning effectiveness metrics | M | Complete (PR #77) | Track: pattern hit rate, confidence accuracy (predicted vs actual success), tier optimization savings, skill reuse rate. New MCP tool: `get_learning_effectiveness`. |
| LI-004 | Real-world pattern validation suite | L | Complete | Live test suite (32 tests) for validating bootstrap patterns, learned pattern application, cross-domain transfer, pattern metrics, and regression tracking infrastructure. Run with LIVE_TESTS=true. |
| LI-005 | Dynamic domain group learning | M | Complete | Domain groups are hardcoded in heuristics-config.ts. Learn groups from successful cross-domain transfers. Suggest new groupings based on pattern similarity. |
| LI-006 | Semantic skill retrieval integration | S | Complete (PR #78) | ProceduralMemory has 64-dim embeddings but uses custom cosine similarity. Wire to VectorStore for consistent semantic search. |

**Success Criteria:**
- Semantic matching enabled by default with zero-config
- Pattern failures feed back to improve future matching
- Dashboard showing learning effectiveness over time
- Validated patterns with real-world test coverage
- Domain groups can expand based on observed patterns

**Non-Goals (Evaluated and Rejected):**
- Adding ML/neural network capabilities (jax-js, TensorFlow.js) - overkill for heuristic pattern matching
- Training models on browsing data - LLM does the reasoning, system just caches patterns
- Complex NLP for content understanding - current structured data extraction is sufficient

---

## P1.5: MCP Tool Consolidation (New Initiative)

**Goal:** Reduce tool count from 25 to 5 core tools to eliminate LLM choice paralysis and simplify the user experience.

**Context:** Current 25-tool interface overwhelms LLMs with too many choices. For the two main use cases (scraping and research), users need 3-5 tools max. Most complexity should be automatic or hidden in debug mode.

**Success Criteria:**
- Tool count: 25 → 5 (80% reduction)
- Clear mental model: "browse, call API, configure auth"
- Learning intelligence auto-applied, not manually queried
- Developer/analytics tools separated from user-facing tools

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| TC-001 | Consolidate 6 auth tools into 1 | M | Complete | Merge get_api_auth_status, configure_api_auth, complete_oauth, get_auth_guidance, delete_api_auth, list_configured_auth into single `api_auth` tool with actions |
| TC-002 | Auto-embed domain insights in smart_browse | M | Complete | Remove get_domain_intelligence, get_domain_capabilities, get_learning_stats, get_learning_effectiveness - include insights in browse response metadata |
| TC-003 | Auto-apply skills (remove skill_management) | L | Complete | Skills should be automatically applied based on URL patterns. Remove manual skill_management tool. Add skill application trace to browse response |
| TC-004 | Move debug tools to DEBUG_MODE | S | Complete | Hide capture_screenshot, export_har, debug_traces behind LLM_BROWSER_DEBUG_MODE env var |
| TC-005 | Remove analytics tools from MCP | M | Complete | Hide get_performance_metrics, usage_analytics, get_analytics_dashboard, get_system_status behind LLM_BROWSER_ADMIN_MODE env var |
| TC-006 | Remove infrastructure tools | S | Complete | Hide get_browser_providers, tier_management behind LLM_BROWSER_ADMIN_MODE env var |
| TC-007 | Auto-track content or add flag | S | Complete | Hide content_tracking behind ADMIN_MODE; use smart_browse with checkForChanges flag instead |
| TC-008 | Hide deprecated tools behind ADMIN_MODE | S | Complete | Hide 11 deprecated tools behind ADMIN_MODE (domain intelligence, learning, skills, old auth) |
| TC-009 | Update documentation for 5-tool interface | M | Complete | Rewrite docs to focus on core tools only. Move debug/admin tools to "Advanced" section |
| TC-010 | Measure LLM tool selection improvement | S | Complete | Track metrics: tool selection accuracy, first-browse success rate, user confusion indicators |

**Target Tool Count: 5-6 Core Tools**
1. `smart_browse` - Intelligent browsing (includes learning feedback in response)
2. `execute_api_call` - Direct API calls
3. `api_auth` - Auth configuration (consolidated, action-based)
4. `session_management` - Session/cookie management
5. `batch_browse` - Batch operations (optional convenience)

**Non-Goals:**
- ❌ Remove functionality (just consolidate access)
- ❌ Break existing integrations immediately
- ❌ Hide necessary capabilities

---

## P1.5: SDK Extraction (New Initiative)

**Goal:** Extract core intelligence into standalone SDK to enable programmatic use cases (scraping, automation) and serve as foundation for all interfaces.

**Context:** Current MCP-only architecture limits use cases. Scraping/automation users need direct SDK access without LLM overhead. SDK-first design allows building multiple interfaces (MCP, API, CLI, Skills) on single foundation.

**Success Criteria:**
- Core published as `@llm-browser/core` npm package
- MCP tools are thin wrappers (<50 lines each)
- Full TypeScript types and documentation
- Zero interface-specific code in core
- Users can embed in Node.js apps directly

**Dependencies:**
- Should follow TC-001 to TC-010 (simplified MCP is cleaner wrapper)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| SDK-001 | Audit core dependencies and interfaces | S | Complete | Identify what belongs in SDK vs wrappers. Document current coupling between core and MCP. See [SDK_ARCHITECTURE.md](SDK_ARCHITECTURE.md) |
| SDK-002 | Create @unbrowser/core package structure | S | Complete | Set up npm workspaces monorepo with packages/core and packages/mcp |
| SDK-003 | Extract SmartBrowser as SDK entry point | M | **Partial** | HTTP client wrapper created (packages/core/src/http-client.ts). Full SmartBrowser still in root src/core/ - not extracted |
| SDK-004 | Extract learning components to SDK | M | **Not Started** | LearningEngine, ProceduralMemory still in root src/core/. Current SDK is HTTP wrapper only |
| SDK-005 | Extract session and auth to SDK | M | **Not Started** | SessionManager still in root src/core/. Current SDK delegates to cloud API |
| SDK-006 | Create SDK type definitions | S | **Partial** | Basic types in packages/core/src/index.ts (47 lines). Full types still in root src/types/ |
| SDK-007 | Add SDK usage examples | M | Complete | 12 examples in packages/core/examples/ |
| SDK-008 | Write SDK documentation | L | Complete | Comprehensive README in packages/core/ |
| SDK-009 | Refactor MCP tools as thin wrappers | L | Complete | Modular MCP architecture: tool-schemas.ts, response-formatters.ts, sdk-client.ts, handlers/ directory |
| SDK-010 | Publish SDK to npm | S | Complete | Branch `practical-williams-backup` builds and tests pass (2340 tests). Ready for npm publish as HTTP client SDK |
| SDK-011 | Create SDK migration guide | M | Complete | docs/SDK_MIGRATION_GUIDE.md |
| SDK-012 | Add SDK integration tests | M | Complete | tests/sdk/http-client.test.ts |

**Note:** The current SDK (@unbrowser/core) is an **HTTP client wrapper** that calls the cloud API. The core intelligence (SmartBrowser, LearningEngine, ProceduralMemory) remains in root src/core/ and runs server-side. This is the intended architecture for the cloud-first approach - SDK-003 through SDK-006 were scoped for HTTP client, not full extraction.

**Benefits:**
- Scraping users can use SDK directly (no LLM overhead)
- Foundation for REST API, CLI, Python SDK
- Better testability (SDK tested independently)
- Clearer architectural boundaries
- Self-hosting becomes easier (just npm install)

---

## P1.5: Skills & Prompts (New Initiative)

**Goal:** Create Claude skills (prompt templates) to provide simplest possible UX for research use cases.

**Context:** Skills are easiest entry point for non-technical users. They guide MCP tool usage without requiring users to know tool names or parameters. Perfect for research workflows where LLM composes operations.

**Success Criteria:**
- 5-10 high-quality skills published
- Each skill guides a specific use case
- Skills work with simplified MCP (5-6 tools)
- Clear value demonstrated in examples
- Submitted to Claude skills directory

**Dependencies:**
- Should follow TC-001 to TC-010 (simplified MCP is easier to guide)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| SK-001 | Design skill templates | M | Complete | Research Product, Monitor Changes, Scrape Catalog, Discover APIs, Compare Sources. Map to simplified MCP tools. Created docs/SKILL_TEMPLATES.md and 5 YAML skill definitions |
| SK-002 | Create "Research Product Information" skill | S | Complete | Prompt: Browse product pages, extract structured data (price, features, reviews), compare across sites. Created skills/prompts/research-product.md |
| SK-003 | Create "Monitor Website Changes" skill | S | Complete | Prompt: Track URL for updates, alert on changes, provide diff summary. Created skills/prompts/monitor-changes.md |
| SK-004 | Create "Scrape Product Catalog" skill | S | Complete | Prompt: Use pagination to get all items, extract consistent fields, handle rate limiting. Created skills/prompts/scrape-catalog.md |
| SK-005 | Create "Discover APIs" skill | S | Complete | Prompt: Browse site, identify API endpoints, test access, document patterns. Created skills/prompts/discover-apis.md |
| SK-006 | Create "Compare Information Sources" skill | S | Complete | Prompt: Multi-site research, cross-reference facts, identify discrepancies. Created skills/prompts/compare-sources.md |
| SK-007 | Create "Extract Government Forms" skill | S | Complete | Prompt: Navigate gov sites, extract requirements, fees, timelines, documents. Created skills/prompts/extract-government-forms.md |
| SK-008 | Create "Track Competitor Sites" skill | S | Complete | Prompt: Monitor multiple competitor sites, extract key metrics, detect changes. Created skills/prompts/track-competitors.md |
| SK-009 | Test skills with real users | M | Not Started | Get feedback from 5-10 users. Iterate on prompts based on usage patterns |
| SK-010 | Submit to Claude skills directory | S | Not Started | Package and submit approved skills. Include examples and documentation |
| SK-011 | Create skill usage analytics | M | In Progress | Track which skills are most used, success rates, common modifications |

**Benefits:**
- Easiest UX (just describe what you want)
- No tool knowledge required
- Drives MCP adoption organically
- Creates templates for common workflows
- Differentiates from generic web scraping

---

## P1.5: Hosted API Preparation (New Initiative)

**Goal:** Prepare infrastructure and features for launching hosted API service (primary monetization path).

**Context:** GTM plan calls for hosted API with usage-based pricing. This requires multi-tenant isolation, API authentication, rate limiting, billing integration, and production reliability. Builds on SDK foundation.

**Success Criteria:**
- REST API endpoints wrapping SDK
- Multi-tenant isolation with usage tracking
- API key authentication
- Rate limiting per tenant tier
- Billing integration (Stripe or similar)
- 99.5%+ uptime SLA capability

**Dependencies:**
- Requires SDK-001 to SDK-010 (API wraps SDK)
- Builds on CX-008 (multi-tenant store)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| API-001 | Design REST API endpoints | M | Complete | POST /browse, POST /api-call, GET /patterns, etc. Map to SDK methods. OpenAPI spec. Created docs/api/openapi.yaml and docs/api/API_DESIGN.md |
| API-002 | Implement API authentication | M | Complete | API key auth with SHA-256 hashing, permission middleware, in-memory store for testing. packages/api with Hono server, 39 tests |
| API-003 | Add per-tenant rate limiting | M | Complete | In-memory rate limiter with plan-based limits (FREE=100/day, STARTER=1000, TEAM=10000, ENTERPRISE=100000) |
| API-004 | Implement usage metering for billing | L | Complete | Track requests by tier (intelligence=1, lightweight=5, playwright=25). Usage tracking service with per-tenant aggregation. Commit 77d63c0 |
| API-005 | Create tenant management endpoints | M | Complete | POST /tenants, GET /tenants/:id, PATCH /tenants/:id. Admin API for managing customers. Merged in PR #132 |
| API-006 | Add API request/response logging | M | Complete | Request logging middleware with unique IDs, timing, redaction. Admin log endpoints. 28 tests. PR #135 |
| API-007 | Implement billing integration | L | Complete | Stripe integration with customer/subscription management, usage-based billing via Meter Events API, webhook handling. PR #144 |
| API-008 | Create admin dashboard | L | Not Started | Web UI for monitoring usage, managing tenants, viewing errors. Analytics charts |
| API-009 | Set up production infrastructure | XL | Not Started | Docker containers, orchestration (K8s or ECS), load balancing, auto-scaling |
| API-010 | Implement health checks and monitoring | M | Complete | Comprehensive /health with service checks, Prometheus metrics at /health/metrics, K8s probes (/ready, /live). 27 tests |
| API-011 | Add API documentation | L | Complete | OpenAPI/Swagger UI at /docs, getting started guide, code examples (curl, Python, Node.js). 25 tests. PR #145 |
| API-012 | Create API client libraries | L | Complete | TypeScript SDK in packages/core, Python client in clients/python with full type hints, dataclasses, error handling. 25 Python tests. PR #146 |
| API-013 | Set up CI/CD pipeline | M | Complete | GitHub Actions CI workflow: type checking, tests on PR/push. Deployment to staging/production TBD |
| API-014 | Load testing and optimization | L | Complete | Autocannon load tests: 17k+ req/s health, 8k+ req/s browse/fetch. Baseline, stress, full suites. PR #149 |
| API-015 | Security audit | M | Complete | Cryptographic key gen, auth enumeration prevention, SSRF protection, webhook idempotency. PR #148 |
| API-016 | Create pricing calculator | M | Not Started | Help users estimate costs based on usage patterns. Interactive tool on website |
| API-017 | Beta program launch | M | Not Started | Private beta with 10-20 users. Gather feedback, fix critical issues |

### Cloud Operations (New)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| CLOUD-001 | Wire SmartBrowser to browse endpoints | M | Complete | Connect API routes to SmartBrowser. JSON/SSE responses. packages/api/src/services/browser.ts |
| CLOUD-002 | Add usage tracking service | M | Complete | Track per-tenant requests, tier usage, costs. Foundation for billing. Implemented in packages/api/src/services/usage.ts |
| CLOUD-003 | Implement proxy management for IP blocking | L | Complete | ProxyManager, ProxyHealthTracker, DomainRiskClassifier, ProxySelector. 4 tiers: datacenter, ISP, residential, premium. Plan-based access, health tracking, smart routing. 125 tests. See docs/PROXY_MANAGEMENT_PLAN.md |
| CLOUD-004 | Add Supabase/Postgres persistence | L | Complete | Recovered Postgres files (PR #138), integrated and fixed types (PR #139). database-config.ts, postgres-embedded-store.ts, postgres-vector-store.ts, unified-store.ts now in build |
| CLOUD-005 | Implement Redis caching layer | M | Complete | redis-client.ts, redis-usage.ts, redis-session.ts with graceful fallback (PR #140) |
| CLOUD-006 | Add external proxy integration | M | Complete | brightdata-provider.ts with session-based IP rotation, multi-country support (PR #141) |
| CLOUD-007 | Implement usage billing export | M | Complete | Usage exported via Stripe Billing Meter Events API. Included in API-007 |

**Benefits:**
- Primary monetization path
- Platform-agnostic (any LLM can use)
- Usage-based revenue scales with customer success
- Centralized learning (shared pattern pool)
- Enterprise-ready (SLA, support, security)

---

## P1.5: Developer Experience (New Initiative)

**Goal:** Improve SDK usability based on PM sweep findings. See [PM_IMPROVEMENT_RECOMMENDATIONS.md](PM_IMPROVEMENT_RECOMMENDATIONS.md) for full analysis.

**Context:** SDK documentation is minimal, initialization is non-obvious, and advanced features are hidden. Quick wins can significantly improve developer onboarding.

**Success Criteria:**
- README has config options table and TypeScript examples
- Initialization status is visible (not silent failures)
- Cache management API available
- Method naming clarified in JSDoc

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| DX-001 | Add LLMBrowserConfig options table to README | S | DONE | Document all config options with types, defaults, descriptions |
| DX-002 | Add TypeScript import examples to README | S | DONE | Show proper type imports for SmartBrowseResult, options, errors |
| DX-003 | Add SmartBrowseOptions grouped reference | M | DONE | Group 30+ options by concern: Essential, Learning, Validation, Advanced (added to README) |
| DX-004 | Add cache management API to LLMBrowserClient | S | Complete | clearCache(domain?), getCacheStats() methods. 45 tests. PR #150 |
| DX-005 | Expose getSessionHealth() on LLMBrowserClient | S | DONE | Convenience method wrapping SessionManager |
| DX-006 | Add getInitializationStatus() method | S | DONE | Return what features are active (semantic, playwright, etc.) |
| DX-007 | Clarify maxAttempts JSDoc in retry.ts | S | DONE | Add note: "maxAttempts is total attempts, not retries" |
| DX-008 | Add initialization status logging | S | DONE | Log INFO on init: "Initialized with: semantic ON/OFF, playwright ON/OFF" |
| DX-009 | Add onProgress callback to browse() | M | Complete | Optional progress indication for long operations. PR #151 |
| DX-010 | Improve error messages with suggestions | M | Complete | Actionable error messages with install commands and suggestions. PR #152 |

**Quick Wins (completed):** DX-001, DX-002, DX-003, DX-005, DX-006, DX-007, DX-008, DX-009, DX-010

---

## P2: Competitive Feature Parity (From Competitive Analysis)

See [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md) for context on why these features matter.

**Goal:** Add features identified from competitive analysis of Anthropic Chrome extension while maintaining our speed advantage.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| COMP-002 | Plan Preview | M | Complete | Show users what will happen before execution. PR #136 |
| COMP-007 | Workflow Recording Core | L | Complete | Record browse operations as replayable workflows. `src/core/workflow-recorder.ts`. PR #136 |
| COMP-008 | Workflow ProceduralMemory Integration | M | Complete | Store workflows in ProceduralMemory for persistence. PR #136 |
| COMP-009 | Workflow API Endpoints | M | Complete | POST /v1/workflows/record/start, stop, replay. `packages/api/src/routes/workflows.ts`. PR #136 |
| COMP-010 | Workflow SDK Methods | M | Complete | SDK methods for workflow recording. `packages/core/src/http-client.ts`. PR #136 |
| COMP-014 | Verification Learning | M | Complete | Learn which checks prevent failures. `src/core/verification-engine.ts`. PR #136 |
| COMP-015 | Verification API Options | S | Complete | Add verify options to browse API. PR #136 |

**Notes:**
- All COMP tasks in this section implemented in PR #136
- Fixed ESM dynamic import issues for VerificationEngine
- Tests passing, TypeScript builds cleanly

---

## P2: Medium Priority (Plan For)

### Debugging & Observability

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| O-005 | Add debug/replay trace recording | M | Features | DONE (PR #82) |
| O-006 | Extraction quality benchmarking | L | Testing | DONE (PR #83) |

### Go-To-Market (GTM)

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| GTM-001 | Usage metering & tier cost reporting | M | Features | Collect per-request tier usage and cost signals (DONE) |
| GTM-002 | Basic analytics dashboard | M | Features | DONE (PR #85) |
| GTM-003 | Hosted alpha checklist | S | Documentation | Infra, auth, rate limiting, logging, onboarding (DONE) |
| GTM-004 | Pricing & packaging doc | S | Documentation | Public-facing pricing tiers and usage model (DONE) |
| GTM-005 | SLA/support policy draft | S | Documentation | Define enterprise support and uptime targets (DONE) |

### LLM Customer Experience

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| CX-005 | Budget knobs | M | Features | Add `maxLatencyMs`, `maxCostTier`, `freshnessRequirement` parameters (DONE) |
| CX-009 | Tier parity learning | M | Features | Learn APIs/structure from intelligence/lightweight tiers (DONE) |
| CX-010 | Config-driven heuristics | S | Debt | Domain groups/tier rules loaded from config (DONE) |
| CX-011 | Domain capability summary | S | Features | Tool or response section summarizing capabilities (DONE) |
| CX-012 | LLM onboarding spec | S | Documentation | Explain confidence, error taxonomy, trust contract (DONE) |

### Features

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| F-001 | Batch browse operations | L | Features | Multiple URLs in one call (DONE - PR #97) |
| F-002 | Parallel request handling | L | Features | Concurrent browsing |
| F-003 | Content change detection alerts | M | Features | Notify when content changes (DONE - PR #94) |
| F-004 | Skill composition (chain skills) | L | Features | Combine skills into workflows |
| F-005 | Screenshot capture on demand | M | Features | Visual debugging (DONE - PR #91) |
| F-006 | HAR file export | M | Features | Network debugging (DONE - PR #92) |
| F-012 | Skill sharing + portability | M | Features | Export/import skill packs by domain vertical (gov, ecommerce, docs) (DONE - PR #93) |

### Intelligence

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| I-001 | Angular framework support | M | Features | Add to Content Intelligence (DONE - PR #89) |
| I-002 | Vue.js framework support | M | Features | Add to Content Intelligence (DONE - PR #90) |
| I-003 | Better API prediction heuristics | L | Performance | Superseded by L-004 (API Learning System Phase 3) |
| I-004 | Cross-domain skill transfer | M | Features | Superseded by L-005 (API Learning System Phase 4) |
| I-005 | Automatic skill discovery | L | Features | Superseded by L-003 (API Learning System Phase 2) |
| I-006 | NPM registry API handler | S | Features | `registry.npmjs.org/package/json` (DONE) |
| I-007 | PyPI API handler | S | Features | `pypi.org/pypi/{package}/json` (DONE) |
| I-008 | Dev.to API handler | S | Features | `dev.to/api/articles` (DONE) |
| I-009 | Medium API handler | M | Features | Undocumented JSON API - ?format=json (DONE - PR #96) |
| I-010 | YouTube API handler | M | Features | oEmbed + optional Data API v3 (DONE - PR #99) |
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

## P2: Anti-Bot Evasion (New Initiative)

**Goal:** Improve bot detection evasion using open-source techniques only - no third-party services required.

**Context:** Current implementation has good bot detection (identifies Cloudflare, CAPTCHAs, rate limiting) but limited evasion. The system detects challenges but doesn't prevent them. These improvements use open-source npm packages and built-in code only.

**What counts as third-party services (NOT included):**
- Bright Data, Luminati (proxy services)
- 2Captcha, Anti-Captcha (CAPTCHA solving)
- Browserless.io (hosted browser)
- ScrapingBee, ScraperAPI (scraping services)

**What's fair game (included):**
- Open-source npm packages (playwright-extra, stealth plugin)
- Built-in code we write ourselves
- Browser configuration options

**Success Criteria:**
- Stealth plugin integrated as optional dependency
- Fingerprint randomization system with consistent profiles
- Context initialization scripts for common evasion
- Request headers match browser fingerprints
- Behavioral patterns configurable

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| AB-001 | Integrate playwright-extra + stealth plugin | M | Complete | Optional dep. launchStealthBrowser() wraps playwright-extra with stealth plugin |
| AB-002 | Create fingerprint randomization system | M | Complete | generateFingerprint() with UA pool, viewport sizes, timezone/locale, client hints |
| AB-003 | Add context initialization scripts | S | Complete | EVASION_SCRIPTS for webdriver, permissions, plugins, mimeTypes, chrome.runtime, languages |
| AB-004 | Request header hardening | S | Complete | getStealthFetchHeaders() with Accept-Language, sec-ch-ua. Works for all tiers |
| AB-005 | Behavioral delay patterns | S | Complete | BehavioralDelays.randomDelay(), sleep(), jitteredDelay(), exponentialBackoff() |
| AB-006 | Stealth mode configuration | S | Complete | StealthConfig interface, getStealthConfig(), LLM_BROWSER_STEALTH env var |
| AB-007 | Add stealth features to documentation | S | Complete | README section, landing page updated with Stealth Mode feature |
| AB-008 | Test stealth effectiveness | M | Complete | 30 unit tests + test-stealth.js script. Verified with httpbin.org |

**Limitations (require third-party services):**
- CAPTCHAs (reCAPTCHA/Turnstile) - require human solving or solving services
- Residential IPs - datacenter IPs often blocklisted
- Advanced fingerprinting - some sites use sophisticated device fingerprinting

**Architecture Notes:**
- Stealth plugin wraps Playwright launch, no code changes to BrowserManager internals
- Fingerprint generator produces consistent profiles (UA + viewport + timezone all match)
- Evasion is optional - works with or without stealth enabled
- Falls back gracefully if stealth deps not installed

---

## P2: LLM-Assisted Bypass Research (New Initiative)

**Goal:** Create a self-improving feedback loop where Unbrowser can research its own bypass techniques when blocked.

**Concept:**
1. Unbrowser gets blocked on a site (Cloudflare, DataDome, etc.)
2. Returns structured response with research suggestions
3. LLM uses Unbrowser to search for bypass techniques
4. LLM synthesizes research into actionable parameters
5. LLM retries with new parameters
6. If successful, Unbrowser learns and persists what worked

**Why This Matters:**
- Dynamic adaptation without code changes
- Site-specific solutions researched on-demand
- Leverages LLM reasoning to interpret nuanced advice
- Self-documenting through conversation history

**Success Criteria:**
- Blocked responses include structured research suggestions
- Search queries are detection-type specific
- LLM can pass retry parameters back to browse tool
- Successful retries are learned for future use

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| LR-001 | Add ResearchSuggestion to blocked response | S | DONE | Include searchQuery, recommendedSources, detectionType. Expanded to ProblemResponse with all problem types. |
| LR-002 | Generate detection-specific search queries | M | DONE | Detection-specific queries for all bot protection types plus problem-type queries |
| LR-003 | Add retryWith parameter to browse tool | M | DONE | RetryConfig support in SmartBrowseOptions with userAgent, headers, delays, etc. |
| LR-004 | Curate trusted source list | S | DONE | TRUSTED_SOURCES: github.com, stackoverflow.com, MDN, web.dev, playwright.dev |
| LR-005 | Add recursion depth limit | S | Complete | Max 2 research attempts per blocked site. PR #153 |
| LR-006 | Integrate successful retries with stealth learning | M | Complete | Persist what worked via recordStealthSuccess(). PR #154 |

**Example Flow:**
```
LLM: "Browse bloomberg.com"
Browser: {
  blocked: true,
  detectionType: "datadome",
  researchSuggestion: {
    searchQuery: "bypass datadome bot detection 2025 node.js",
    recommendedSources: ["github.com", "stackoverflow.com"],
    retryParameters: ["userAgent", "headers", "useFullBrowser", "delayMs"]
  }
}
LLM: "Search for datadome bypass techniques"
Browser: [returns search results/articles]
LLM: "Retry bloomberg.com with { useFullBrowser: true, delayMs: 2000 }"
Browser: { success: true, ... }  // Learns this for future
```

**Safeguards:**
- Only activates on explicit blocks (403, challenge pages), not general errors
- Curated source list avoids low-quality or malicious advice
- Recursion limit prevents infinite loops
- Does not bypass authentication or access controls

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
| F-014 | Advanced anti-bot strategies | L | Features | Superseded by AB-001 through AB-008 (Anti-Bot Evasion initiative) |

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
| LI-006 | Semantic skill retrieval integration | 2025-12-21 | Wire ProceduralMemory to VectorStore for semantic skill retrieval. Add setVectorStore() and hasVectorStoreIntegration() methods. Implement retrieveSkillsAsync() with 384-dim embeddings. Auto-index skills on add. Graceful fallback to 64-dim hash-based embeddings. PR #78. |
| LI-004 | Real-world pattern validation suite | 2025-12-21 | Live test suite (32 tests) for validating learned patterns against real sites. Bootstrap pattern validation (json-suffix, registry-lookup, rest-resource, firebase-rest, query-api). Cross-domain pattern transfer, pattern metrics, staleness detection, regression tracking infrastructure. Run with LIVE_TESTS=true. |
| LI-001 | Enable semantic matching by default | 2025-12-21 | Auto-initialize semantic infrastructure (EmbeddingProvider, VectorStore, EmbeddedStore, SemanticPatternMatcher) on SmartBrowser.initialize(). Graceful fallback when dependencies unavailable. New semantic-init.ts module. 17 tests. PR #76. |
| CX-012 | LLM Onboarding Spec | 2025-12-21 | Comprehensive LLM client onboarding document. Covers trust contract (schema versioning), confidence framework (interpretation guide, source baselines, decision matrix), error recovery protocol (categories, codes, recommended actions, retry decision tree), pattern lifecycle (sources, decay, trust assessment), response structure reference, decision transparency (tier and selector traces), and budget/performance controls. New doc: LLM_ONBOARDING_SPEC.md. |
| CX-009 | Tier Parity Learning | 2025-12-21 | Enable API pattern learning from lightweight tier with confidence degradation. Enhanced LightweightRenderer network tracking with request/response headers and bodies. Added tier-aware API analysis with confidence degradation (lightweight: -1 level, intelligence: -2 levels). Wired TieredFetcher to discover APIs from lightweight tier. 23 tests. |
| CX-008 | Memory Isolation + Shared Pool | 2025-12-20 | Multi-tenant support with TenantStore (namespace-prefixed isolation), SharedPatternPool (opt-in pattern sharing), and MultiTenantStore (tenant lifecycle). Tenant config: sharePatterns, consumeShared. Usage tracking, attribution, statistics. LLM_BROWSER_TENANT_ID env var. 64 tests. |
| CX-007 | Embedded Store Migration | 2025-12-20 | SQLite-based persistence layer with EmbeddedStore class. ACID transactions, concurrent reads (WAL mode), namespaced storage, JSON fallback. SqlitePersistentStore adapter for gradual migration from PersistentStore. Auto-migration from JSON files. 66 tests. |
| CX-006 | Learning Provenance Metadata | 2025-12-20 | Track pattern origins (bootstrap, api_extraction, openapi_discovery, etc.), last verified timestamps, and confidence decay history. Created provenance.ts with PatternSource, ConfidenceDecayReason types, DecayEvent/ProvenanceMetadata interfaces. Utility functions: createProvenance, recordVerification, recordUsage, recordDecay, isStale, getDaysSinceVerification, getProvenanceSummary. Integrated with LearningEngine and ApiPatternLearner. 25 tests. |
| CX-001 | Response Schema Versioning | 2025-12-20 | Added schemaVersion field to all MCP tool responses for LLM client compatibility. Created schema-version.ts with helpers (addSchemaVersion, withSchemaVersion, parseSchemaVersion, isSchemaCompatible). Version format: MAJOR.MINOR with backward compatibility rules. Initial version: 1.0. 27 tests. |
| D-010 | Backend Framework Fingerprinting | 2025-12-20 | Detect Rails, Django, Phoenix, FastAPI, Spring Boot, Laravel, Express, ASP.NET Core from headers/HTML. HTTP header analysis, cookie patterns, HTML CSRF tokens and scripts. Convention-based API pattern generation. Integrated with Discovery Orchestrator. 57 tests. |
| D-003 | Link Discovery | 2025-12-19 | RFC 8288 Link header parsing, HTML `<link>` extraction, HATEOAS detection (HAL, JSON:API, Siren). Pattern generation, pagination link extraction. Integrated with Discovery Orchestrator. 69 tests. |
| D-001 | GraphQL Introspection | 2025-12-19 | Auto-discover GraphQL APIs via introspection. Endpoint detection, schema parsing, pagination pattern detection, query/mutation pattern generation, ContentIntelligence integration. 49 tests. |
| L-007 | Failure Learning | 2025-12-19 | Learn from mistakes, build anti-patterns. Failure classification by category, anti-pattern creation, smart retry strategies, integration with pattern application. 59 tests. |
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
