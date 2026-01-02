# Unbrowser Task Backlog

## How to Use This Backlog

Tasks are organized by priority and category. Each task includes:
- **Priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
- **Effort**: S (Small, <1 day), M (Medium, 1-2 days), L (Large, 3-5 days), XL (Extra Large, 5+ days)
- **Category**: Testing, Reliability, Performance, Features, Documentation, Debt

---

## P0: Critical (Do First)

### Phase 2 Integration Issues (2025-12-26)

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| PHASE2-001 | Fix TypeScript build errors | M | Debt | Prisma and vector store imports fail compilation. Make optional features truly optional with conditional imports (DONE - fixed in PR #179) |
| PHASE2-002 | Runtime test Phase 2 examples | M | Testing | Examples written but not executed. Run `npm install && npm build` then test all 7 examples against real URLs (DONE - Fixed API property names, all 6 examples tested against real URLs) |
| PHASE2-003 | Add Phase 2 to OpenAPI spec | S | Documentation | Add `/v1/browse` debug option and `/v1/discover/fuzz` endpoint to `docs/api/openapi.yaml` (DONE) |
| PHASE2-004 | Update main README | S | Documentation | Add PLAY-001 and FUZZ-001 feature descriptions to README.md (DONE - already completed in prior PR) |

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
- Core published as `@unbrowser/core` npm package
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
| SK-011 | Create skill usage analytics | M | Complete | Track which skills are most used, success rates, common modifications. PR #155 |

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
| API-008 | Create admin dashboard | L | Complete | Web UI at /admin with dashboard API at /v1/admin/dashboard. Usage analytics, tenant management, error analysis. 26 tests. PR #158 |
| API-009 | Set up production infrastructure | XL | N/A | Using Railway PaaS - handles containers, scaling, load balancing automatically via railway.toml |
| API-010 | Implement health checks and monitoring | M | Complete | Comprehensive /health with service checks, Prometheus metrics at /health/metrics, K8s probes (/ready, /live). 27 tests |
| API-011 | Add API documentation | L | Complete | OpenAPI/Swagger UI at /docs, getting started guide, code examples (curl, Python, Node.js). 25 tests. PR #145 |
| API-012 | Create API client libraries | L | Complete | TypeScript SDK in packages/core, Python client in clients/python with full type hints, dataclasses, error handling. 25 Python tests. PR #146 |
| API-013 | Set up CI/CD pipeline | M | Complete | GitHub Actions CI workflow: type checking, tests on PR/push. Deployment to staging/production TBD |
| API-014 | Load testing and optimization | L | Complete | Autocannon load tests: 17k+ req/s health, 8k+ req/s browse/fetch. Baseline, stress, full suites. PR #149 |
| API-015 | Security audit | M | Complete | Cryptographic key gen, auth enumeration prevention, SSRF protection, webhook idempotency. PR #148 |
| API-016 | Create pricing calculator | M | Complete | Help users estimate costs based on usage patterns. Interactive tool at /pricing with API endpoint. 19 tests |
| API-017 | Beta program launch | M | Complete | Waitlist management, invite code system (BETA-XXXX-XXXX-XXXX), feedback collection, admin UI. 53 tests |

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
| CLOUD-008 | Unify discovery caches for multi-instance | L | Complete | Unified DiscoveryCache class with pluggable backends, tenant isolation via key prefixes, LRU eviction, failed domain tracking with exponential backoff. All 6 discovery modules migrated. 40 cache tests + updated module tests (262 passing). |

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

## P2: Progressive Optimization Gaps (New Initiative)

**Goal:** Fully utilize "Browser Minimizer" philosophy by connecting existing learning infrastructure to progressive optimization.

**Context:** Analysis revealed that we have all primitives for form automation and mutation learning, but key integrations are missing. See [CAPABILITY_GAPS_ANALYSIS.md](CAPABILITY_GAPS_ANALYSIS.md) for full analysis.

**Success Criteria:**
- Forms submit 10-25x faster after first learning pass
- POST/PUT/DELETE patterns learned and reused
- Auth workflows auto-replay when sessions expire
- Multi-step workflows progressively optimized

### Phase 1: Forms & Mutations (Current Sprint)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| GAP-001 | Form Submission Learning | L | Complete | FormSubmissionLearner: learns POST patterns from browser submissions, replays via direct API. Handles dynamic fields (CSRF, user IDs, nonces). See [FORM_AUTOMATION_IMPLEMENTATION.md](FORM_AUTOMATION_IMPLEMENTATION.md) |
| GAP-002 | POST/PUT/DELETE API Learning | S | Complete | Enhanced ApiAnalyzer to score mutations equally with GET. Adds REST-compliant status code detection (201, 204) |
| GAP-003 | Auth Flow Automation | M | Complete | AuthFlowDetector: detects 401/403, login redirects, session expiration, auth messages. Resolution via workflow replay, stored credentials, or user callback. PR #183 |

### Phase 2: Workflows (Next Sprint)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| GAP-004 | Multi-Step Workflow Optimization | L | Complete | WorkflowOptimizer: detects API shortcuts and data sufficiency, tracks metrics, auto-promotes after 90%+ success. PR #184 |
| GAP-005 | Pagination API Discovery | M | Complete | PaginationDiscovery: detects page/offset/cursor/token params, learns response structure (data path, total, has-more, next cursor), generates page URLs, tracks usage metrics. PR #185 |
| GAP-006 | Search Query Optimization | M | Complete | SearchQueryOptimizer: learns search API patterns from network traffic, detects query params (q, query, search), analyzes response structure, generates optimized URLs. 40 tests. PR #186 |

### Phase 3: Resilience (Following Sprint)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| GAP-007 | CAPTCHA Challenge Detection | M | Complete | CaptchaHandler integrates challenge-detector with SmartBrowser: auto-wait for JS challenges, auto-solve checkboxes, user callback for manual solving. 18 tests. PR #187 |
| GAP-008 | Dynamic Content Loading | M | Complete | ContentLoadingDetector analyzes XHR/fetch for content patterns: URL patterns, response structure, trigger timing. LearningEngine integration with pattern persistence. 24 tests. PR #188 |
| GAP-010 | Rate Limit Learning | S | ✅ Implemented | Detects 429 responses and rate limit headers (X-RateLimit-*, Retry-After), tracks quota per domain, automatic retry with exponential backoff (max 3 retries), pre-emptive wait checks, warns at 20% remaining quota. See [RATE_LIMITING_SUPPORT.md](RATE_LIMITING_SUPPORT.md) |

### Future Opportunities

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| GAP-009 | Multi-Domain Login Reuse | M | Complete | Detect SSO flows, reuse credentials across domains. Full implementation with SSOFlowDetector, DomainCorrelator, SessionSharingService integrated into SmartBrowser and SDK. 47 tests. See [MULTI_DOMAIN_LOGIN_REUSE.md](MULTI_DOMAIN_LOGIN_REUSE.md) |
| GAP-011 | Content Change Prediction | M | Complete | Learn update patterns (hourly, daily, weekly, etc.), predict next changes, optimize polling. ContentChangePredictor with 38 tests. See [GAP-011-IMPLEMENTATION-SUMMARY.md](GAP-011-IMPLEMENTATION-SUMMARY.md) |

### Phase 4: Protocol & Format Support

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| GAP-012 | File Upload Support | L | ✅ Implemented | Handles multipart/form-data, detects file fields, learns upload patterns. Supports Buffer/base64/filePath. See [FILE_UPLOAD_SUPPORT.md](FILE_UPLOAD_SUPPORT.md) |
| GAP-013 | GraphQL Mutation Learning | M | ✅ Implemented | Integrated with GraphQL introspection, detects mutations in forms, maps form fields to GraphQL variables. See [GRAPHQL_FORM_SUPPORT.md](GRAPHQL_FORM_SUPPORT.md) |
| GAP-014 | Two-Factor Auth Support | L | ✅ Implemented | Detects OTP challenges (SMS/email/TOTP), pauses workflow, prompts user via callback, learns OTP patterns. Unblocks ~50% of auth flows. See [TWO_FACTOR_AUTH_SUPPORT.md](TWO_FACTOR_AUTH_SUPPORT.md) |
| GAP-015 | WebSocket Form Submissions | M | ✅ Implemented | Detects WebSocket/Socket.IO/SockJS patterns via CDP, learns event payloads with intelligent scoring, direct WebSocket replay. 20-30x speedup for real-time forms. See [WEBSOCKET_FORM_SUPPORT.md](WEBSOCKET_FORM_SUPPORT.md) |
| GAP-016 | Server Action Support | M | ✅ Implemented | Detects Next.js Server Actions (Next-Action header) and Remix Actions (_action field), learns framework-specific patterns, direct replay with 10-15x speedup. Handles redirects, JSON responses, and React Flight Streams. See [SERVER_ACTION_SUPPORT.md](SERVER_ACTION_SUPPORT.md) |
| GAP-017 | JSON-RPC Form Patterns | S | ✅ Implemented | Detects JSON-RPC 1.0 and 2.0 method calls, learns RPC method and params mapping, direct replay with timestamp IDs. Supports both named and positional parameters. 15-20x speedup. See [JSON_RPC_SUPPORT.md](JSON_RPC_SUPPORT.md) |
| GAP-018 | OAuth Flow Automation | L | 🚧 Foundation Implemented | OAuth detection via URL parameters, flow type identification (Authorization Code/PKCE/Implicit), data structures for flow tracking. Foundation complete - full automation (redirect tracking, token exchange, PKCE generation, replay) requires Phases 2-5. See [OAUTH_FLOW_SUPPORT.md](OAUTH_FLOW_SUPPORT.md) |

**Expected Impact:**
- 10-25x speedup for form submissions
- 50-100x speedup for paginated scraping
- Higher success rates with auth challenges
- Automatic adaptation to rate limits

**Related Docs:**
- [CAPABILITY_GAPS_ANALYSIS.md](CAPABILITY_GAPS_ANALYSIS.md) - Full gap analysis
- [FORM_AUTOMATION_IMPLEMENTATION.md](FORM_AUTOMATION_IMPLEMENTATION.md) - Implementation details

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

## P1.5: Competitive Feature Enhancements (New Initiative)

**Goal:** Incorporate valuable features from competitors (Firecrawl, Browse AI, mitmproxy, Apify, ScraperAPI) while maintaining our core "browser minimizer" philosophy.

**Context:** Analysis of competitive tools identified 6 features that enhance Unbrowser's value proposition without scope creep. These features extend existing capabilities and align with progressive optimization.

### High Priority (Extend Core Capabilities)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| FEAT-001 | Schema validation for API discovery | M | Complete | Extend VerificationEngine with JSON schema validation. Define expected response schema, get typed validation errors. Natural extension of API-015. Implementation complete, tests passing (30+ test cases), example created. Ready for review. |
| FEAT-002 | Change monitoring for learned patterns | M | Complete | Detect when learned API patterns break. Track pattern health, notify on failures, suggest re-learning. Builds on ProceduralMemory versioning. Implementation complete, 40+ tests passing, example created, LearningEngine integration done. Ready for review. |
| FEAT-003 | WebSocket API support | L | ✅ Complete (2025-12-27) | Discover and replay WebSocket/Socket.IO/SSE real-time APIs. Detect WS endpoints, learn message patterns, direct replay. Completes API discovery. Full integration complete (browser capture, LearningEngine storage, TieredFetcher, SmartBrowser replay). See docs/FEAT-003-IMPLEMENTATION-SUMMARY.md |

### Medium Priority (Advanced Features)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| FEAT-004 | Scheduled workflow runs with webhooks | L | ✅ Complete (2025-12-27) | Schedule recorded workflows (cron), POST results to webhooks. Natural extension of COMP-009 (workflow recording). Makes workflows production-ready. Full implementation with cron scheduling, variable substitution, HMAC webhooks. See docs/FEAT-004-IMPLEMENTATION-SUMMARY.md |
| FEAT-005 | Community pattern marketplace | XL | ✅ Complete (2025-12-27) | User-published patterns, discovery/install, rating system, categories. Amplifies collective learning. Full implementation with publishing, versioning, search, ratings, moderation, installation tracking. 34 tests passing. See docs/FEAT-005-IMPLEMENTATION-SUMMARY.md |
| FEAT-006 | Geographic proxy routing | M | ✅ Complete (2025-12-27) | Smart geo routing based on site requirements. Auto-detect region restrictions, select optimal proxy location. Extends CLOUD-003 (proxy management). Full implementation with learning, TLD hints, restriction detection. 24 tests passing. See docs/FEAT-006-IMPLEMENTATION-SUMMARY.md |

**Success Criteria:**
- Schema validation integrated with browse verification options
- Pattern health monitoring with automated alerts
- WebSocket APIs discovered and replayed like REST APIs
- Workflows schedulable with webhook delivery
- Public pattern marketplace with 50+ shared patterns
- Geo-aware proxy routing reduces blocking by 30%+

**Dependencies:**
- FEAT-001 depends on API-015 (Enhanced Verification) - Complete
- FEAT-002 depends on ProceduralMemory + LearningEngine - Complete
- FEAT-003 depends on API discovery infrastructure - Complete
- FEAT-004 depends on COMP-009 (Workflow Recording) - Complete
- FEAT-005 depends on SDK-010 (npm publish), API-002 (auth) - Complete
- FEAT-006 depends on CLOUD-003 (proxy management) - Complete

**Benefits:**
- **Schema validation**: Type-safe API responses, better LLM integration
- **Change monitoring**: Proactive pattern maintenance, higher reliability
- **WebSocket support**: Modern real-time API coverage
- **Scheduled workflows**: Production automation use cases
- **Pattern marketplace**: Network effects, faster adoption, community growth
- **Geo routing**: Lower blocking rates, better performance

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
| F-002 | Parallel request handling | L | Features | Concurrent browsing (DONE - included in F-001/batch_browse with configurable concurrency) |
| F-003 | Content change detection alerts | M | Features | Notify when content changes (DONE - PR #94) |
| F-004 | Skill composition (chain skills) | L | Features | Combine skills into workflows (DONE - PR #164) |
| F-005 | Screenshot capture on demand | M | Features | Visual debugging (DONE - PR #91) |
| F-006 | HAR file export | M | Features | Network debugging (DONE - PR #92) |
| F-007 | Pattern import/export for knowledge bases | M | Features | Export/import API patterns and learning data (DONE - PR #165) |
| F-008 | AI Feedback System | L | Features | Secure feedback system for AI users to report issues. Includes rate limiting, anomaly detection, real-time adjustments (capped at 5%), webhook notifications with HMAC signing. MCP tool: `ai_feedback` (DONE) |
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

| ID | Task | Effort | Category | Status | Notes |
|----|------|--------|----------|--------|-------|
| D-001 | Update PROJECT_STATUS.md | S | Documentation | Complete | Updated with 2025-12-25 audit results |
| D-002 | API documentation for MCP tools | M | Documentation | Complete | Clear parameter docs - see docs/MCP_TOOLS_API.md |
| D-003 | Architecture diagrams | M | Documentation | Complete | Visual system overview - see docs/ARCHITECTURE.md |
| D-004 | Usage examples and tutorials | L | Documentation | Complete | Getting started guide - see docs/GETTING_STARTED.md |
| **DOC-001** | **Documentation audit** | **L** | **Documentation** | **Complete** | Comprehensive audit completed 2025-12-25. Report: `docs/DOCUMENTATION_AUDIT_2025-12-25.md`. Fixed critical issues (import paths, package names, architecture overview). 22 issues identified and tracked. |
| DOC-002 | Fix package name references | M | Documentation | Complete | Global find-replace `@llm-browser/*` → `@unbrowser/*` in 11 doc files |
| DOC-003 | Mark outdated examples | S | Documentation | Complete | Added warning to `packages/core/examples/README.md` about wrong imports |
| DOC-004 | Document all API endpoints | S | Documentation | Complete | Updated CLAUDE.md with complete endpoint list + openapi.yaml reference |
| DOC-005 | Add build warning to README | S | Documentation | Complete | Added note about running `npm run build` after cloning |

---

## P2: QA & Testing Use Cases (New Initiative)

**Goal:** Position Unbrowser as a QA/testing tool for E2E API testing, content validation, and regression testing.

**Context:** Unbrowser has strong QA capabilities (VerificationEngine, confidence scoring, workflow recording) that aren't well-documented. Better documentation and examples will help AI agents and developers recognize when to use Unbrowser for testing.

**Documentation Status:**
- ✅ Created `docs/QA_TESTING_GUIDE.md` - Comprehensive QA documentation
- ✅ Updated `CLAUDE.md` - QA use cases section for AI agents
- ✅ Updated `README.md` - Added QA to "Works well for" section
- ✅ Updated `GETTING_STARTED.md` - E2E API testing and content validation examples

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| QA-001 | Create E2E API testing example | M | Complete | Full example: discover APIs, test each endpoint, report results. See `examples/e2e-api-testing.ts` |
| QA-002 | Create content validation test suite example | M | Complete | Example using verify options with Vitest/Jest integration. See `examples/content-validation-suite.ts` |
| QA-003 | Create multi-site regression example | M | Complete | Test same patterns across multiple similar sites. See `examples/multi-site-regression.ts` |
| QA-004 | Create workflow recording/replay example | M | Complete | Record workflow, replay with different params, validate results. See `examples/workflow-recording-replay.ts` |
| QA-005 | Create API change detection example | S | Complete | Detect when API responses change from baseline. See `examples/api-change-detection.ts` |
| QA-006 | Add verification engine JSDoc | S | Complete | Document VerificationEngine API with TypeDoc |
| QA-007 | Create QA-focused MCP skill prompts | M | Complete | Skills for QA workflows: validate-site.md, test-apis.md, regression-test.md |
| QA-008 | Add QA video walkthrough | L | Not Started | Screen recording showing E2E API testing workflow |

**Success Criteria:**
- AI agents can easily identify Unbrowser as a QA tool from docs
- 4+ working QA examples in packages/core/examples/
- QA use cases mentioned in tool descriptions
- Skill prompts for common QA workflows

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
| F-007 | Pattern import/export | M | Features | DONE | Share learned patterns (PR #165) |
| F-008 | Debug mode toggle | S | Features | Verbose output mode (DONE - LLM_BROWSER_DEBUG_MODE=1 enables debug tools) |
| F-015 | AI feedback system | L | Features | DONE | Secure feedback for AI users to report browsing quality issues. Rate limiting, anomaly detection, real-time adjustments (5% cap). MCP tool: ai_feedback (PR #167) |
| F-009 | Trace visualization | L | Features | DONE | Visual request flow with multiple formats (ASCII, compact, detailed, HTML, JSON). Adds visualize/compare actions to debug_traces MCP tool. 40 tests (PR #169) |
| F-010 | Diff generation for changes | M | Features | DONE | Line-level diff generation with unified diff format, side-by-side view, inline word-level diffs. Integrated with content_tracking MCP tool (PR #168) |
| F-011 | Webhook notifications | L | Features | DONE | General-purpose webhook system for external integrations. HMAC-SHA256 signing, retry with exponential backoff, circuit breaker, event filtering. MCP tool: webhook_management (PR #170) |
| F-013 | Human-in-the-loop inspection UI | L | Features | DONE | Web UI at /inspect showing tier cascade, selector attempts, content extraction, decision traces. 18 tests (PR #177) |
| F-014 | Advanced anti-bot strategies | L | Features | N/A - Superseded by AB-001 through AB-008 (DONE - playwright-extra stealth, fingerprinting, behavioral delays) |

### Technical Debt

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| D-005 | Configuration file support | M | Debt | DONE | .llmbrowserrc/.unbrowserrc config file support with Zod validation. Env vars take precedence (PR #171) |
| D-006 | Dependency injection refactor | L | Debt | DONE | ServiceContainer with singleton/transient lifetimes, factory-based lazy init, test isolation via resetInstances() (PR #176) |
| D-007 | Improve URL pattern matching | M | Debt | DONE | Centralized url-pattern-matcher.ts with regex, glob, substring matching, caching, variable extraction (PR #175) |
| D-008 | Session encryption improvement | M | Debt | N/A - Superseded by S-003 (AES-256-GCM encryption with PBKDF2 key derivation) |
| D-009 | Type-safe configuration | S | Debt | Validate config at runtime (DONE - PR #157) |
| D-010 | Split large god files | M | DONE | Extracted js-api-extractor.ts and content-extraction-utils.ts from content-intelligence.ts (~300 lines reduction) |
| D-011 | Clean up untracked src files | S | N/A | Files are already tracked in git (skill-generalizer.ts in src/core/, embedding-provider.ts in src/utils/) |

### Performance

| ID | Task | Effort | Category | Notes |
|----|------|--------|----------|-------|
| P-001 | Response caching optimization | M | Performance | Smarter TTL (DONE) |
| P-002 | Pattern lookup optimization | S | Performance | O(1) instead of O(N) (DONE - PR #156) |
| P-003 | Memory usage optimization | M | Performance | Large skill stores (DONE) |
| P-004 | Connection pooling | M | Performance | Reuse HTTP connections (DONE) |

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

## P2: MoveAhead.ai Integration (New Initiative)

**Goal:** Enable MoveAhead.ai (relocation assistant) to fully leverage Unbrowser's capabilities for exceptional research.

**Context:** MoveAhead.ai already uses Unbrowser via MCP for government portal research, but only uses basic `smart_browse`. This initiative documents and enables full integration including workflow recording, verification, API discovery, and session management.

**Documentation:** See [MOVEAHEAD_INTEGRATION_PLAN.md](MOVEAHEAD_INTEGRATION_PLAN.md) for full integration strategy.

**Success Criteria:**
- MoveAhead migrates from MCP to SDK for direct integration
- Research workflows are recorded and replayable
- API discovery used before browser fallback (10-50x speedup)
- Session persistence enables cross-portal authentication
- Procedural memory enables cross-country pattern transfer

### Phase 1: Foundation (Priority: Critical)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| INT-001 | Create SDK wrapper for research use case | M | Complete | Specialized factory function with research presets (verification, pagination, session). See [MOVEAHEAD_INTEGRATION_PLAN.md](MOVEAHEAD_INTEGRATION_PLAN.md) |
| INT-002 | Enhance session persistence for multi-portal | S | Complete | Extend session management to track SSO relationships (builds on GAP-009) |
| INT-003 | Integrate API discovery for gov portals | M | Complete | Check for APIs before browser fallback - 10-50x speedup for sites with APIs |

### Phase 2: Research Enhancement (Priority: High)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| INT-004 | Add VerificationEngine presets | M | Complete | Pre-configured verification checks for government content (requirements, fees, timeline fields). 19 pre-built VERIFICATION_CHECKS with helper functions. PR #206 |
| INT-005 | Add pagination learning for legal docs | S | Complete | Pagination presets for BOE, EUR-Lex, UK Legislation, Legifrance, Normattiva, Rechtspraak, CURIA, Gesetze im Internet. PaginationPresetConfig interface with date-based filtering. PR #208 |
| INT-006 | Add research workflow templates | M | Complete | 5 pre-built workflow templates (visaResearch, documentExtraction, feeTracking, crossCountryComparison, taxObligations) with country portal mappings, variable validation, and executeTemplate method |

### Phase 3: Intelligence (Priority: Medium)

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| INT-007 | Create government portal skill pack | M | Complete | 12 skills for ES, PT, DE covering visa, tax, social security, healthcare. Includes GOVERNMENT_SKILL_PACK export/import, skill-to-pattern conversion, search/filter functions. 66 tests |
| INT-008 | Add content change prediction | S | Complete | DynamicRefreshScheduler with 9 content type presets (regulations, fees, forms, requirements, procedures, contact_info, news, deadlines, portal_status), 10 domain patterns for ES/PT/DE/UK/US gov sites. Replaces fixed 90-day staleness with intelligent scheduling. 67 tests |
| INT-009 | Create MoveAhead example integration | L | Complete | Full example in `examples/moveahead-integration.ts` showing HTTP API usage for relocation research pipeline. Demos workflow recording, skill packs, API discovery, domain intelligence. Works with and without API key (demo mode) |

**Dependencies:**
- GAP-009 (Multi-Domain Login Reuse) - Complete, enables INT-002
- F-012 (Skill sharing) - Complete, enables INT-007
- COMP-014/015 (Verification Engine) - Complete, enables INT-004
- COMP-007-010 (Workflow Recording) - Complete, enables INT-006

**Documentation:**
- Full integration strategy: [MOVEAHEAD_INTEGRATION_PLAN.md](MOVEAHEAD_INTEGRATION_PLAN.md)
- MoveAhead implementation guide: `/Users/og/src/move-abroad-ai/docs/UNBROWSER_INTEGRATION.md`

### Phase 4: Advanced Integration (Priority: Medium-Low)

These features are designed for MoveAhead but extensible to other government/regulatory research use cases.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| INT-010 | Guided authentication workflow | L | Complete | GuidedAuthWorkflow class with user callbacks for MFA/email/CAPTCHA, step-by-step progress with screenshots, session capture. 22 tests. PR #217 |
| INT-011 | Language-aware extraction | M | Complete | Auto-detect page language. Language-specific content parsing. Multi-language field mapping (e.g., "Requisitos" = "Requirements"). Extensible to any international content. |
| INT-012 | Structured government data extractor | L | Complete | Schema for common gov data: fees, requirements, timelines, documents. Auto-extract structured data from unstructured pages. Validation against expected fields. Extensible to any government/regulatory content. |
| INT-013 | Appointment availability detection | M | Complete | Detect "cita previa" and similar appointment systems. Check for available slots. Monitor for openings. Extensible to any scheduling/booking systems. |
| INT-014 | Field-level change tracking | M | Complete | Track specific field changes (fee increased, deadline moved). Structured diff output (before/after). Severity classification (breaking vs minor). Extensible to any content monitoring. |
| INT-015 | Cross-source verification | M | Complete | Compare same topic across multiple sources. Detect contradictions. Confidence scoring based on agreement. Extensible to any fact-checking use case. |
| INT-016 | Auto portal discovery | L | Complete | AutoPortalDiscovery class with 45+ country database, multiple discovery strategies (known DB, skill pack, heuristics, DNS probing), category-based grouping, caching. 36 tests. PR #218 |
| INT-017 | Form/PDF field extraction | L | Complete | Extract AcroForm fields from PDFs (text, checkbox, radio, dropdown, optionList). Parse document requirements. Detect form numbers (Modelo, Cerfa, Form I-94). API endpoint POST /v1/pdf/extract-forms. 22 tests. |
| INT-018 | Enhanced content change prediction | M | Complete | Calendar-based triggers (detect Jan 1 annual updates), seasonal patterns (month/day probability), prediction accuracy tracking, urgency levels (0-3 with poll interval optimization), API endpoint GET /v1/predictions with urgency filtering. 51 tests. |

**Potential Users Beyond MoveAhead:**
- Immigration/visa services and consultants
- Regulatory compliance (financial, healthcare, environmental)
- Government contract research
- Legal research and due diligence
- International business expansion
- Tax advisory services

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
