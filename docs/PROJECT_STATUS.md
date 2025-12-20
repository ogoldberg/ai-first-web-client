# LLM Browser MCP Server - Project Status

**Last Updated:** 2025-12-20
**Version:** 0.5.0
**Current Phase:** Production Readiness (Phase 2)
**Total Code:** ~16,000 lines TypeScript
**Tests:** 1278 passing + 44 live tests

---

## Executive Summary

The LLM Browser MCP Server is an intelligent browser designed specifically for LLM interactions. It learns from browsing patterns, discovers API endpoints automatically, and progressively optimizes to bypass browser rendering entirely.

**Core Philosophy:** "Browser Minimizer" - Start with full rendering, learn the patterns, then bypass the browser for 10x faster access.

---

## LLM Customer Journey Review

**New doc:** `docs/LLM_CUSTOMER_JOURNEY_REVIEW.md`

Key themes:
- Add a response contract (schema versioning, field-level confidence, decision trace)
- Improve learning integrity (provenance, isolation, embedded store)
- Provide LLM control knobs (latency/cost/freshness) and domain capability summaries

These items are tracked as CX-001 through CX-012 in `docs/BACKLOG.md` and `docs/ROADMAP.md`.

---

## Current Implementation Status

### Phase 1: Core MVP - COMPLETE

| Feature | Status | Location |
|---------|--------|----------|
| Browser Management | Complete | `src/core/browser-manager.ts` |
| API Discovery | Complete | `src/core/api-analyzer.ts` |
| Session Management | Complete | `src/core/session-manager.ts` |
| Knowledge Base | Complete | `src/core/knowledge-base.ts` |
| Content Extraction | Complete | `src/utils/content-extractor.ts` |
| MCP Integration | Complete | `src/index.ts` |

### Phase 1.5: Advanced Features - COMPLETE

| Feature | Status | Location |
|---------|--------|----------|
| **Tiered Rendering** | Complete | `src/core/tiered-fetcher.ts` |
| - Intelligence Tier (~50-200ms) | Complete | Content Intelligence, no rendering |
| - Lightweight Tier (~200-500ms) | Complete | linkedom DOM parsing |
| - Playwright Tier (~2-5s) | Complete | Full browser rendering |
| **Content Intelligence** | Complete | `src/core/content-intelligence.ts` |
| - Framework detection | Complete | Next.js, Nuxt, Gatsby |
| - Structured data extraction | Complete | JSON-LD, Schema.org |
| - API prediction | Complete | Based on page analysis |
| **Procedural Memory** | Complete | `src/core/procedural-memory.ts` |
| - Skill storage & replay | Complete | Domain-specific actions |
| - Skill versioning | Complete | Multiple versions per skill |
| - Rollback support | Complete | Restore previous versions |
| - Anti-patterns | Complete | Track what doesn't work |
| - User feedback | Complete | Improve from corrections |
| - Confidence decay | Complete | Patterns degrade over time |
| **Learning Engine** | Complete | `src/core/learning-engine.ts` |
| - API discovery | Complete | Automatic endpoint detection |
| - Selector learning | Complete | CSS/XPath pattern recognition |
| - Validation rules | Complete | Data quality checks |
| **Bot Detection** | Complete | `src/core/smart-browser.ts` |
| - Challenge detection | Complete | CAPTCHA, Cloudflare, etc. |
| - Content anomalies | Complete | Detect blocking/soft blocks |

### Phase 2: Production Readiness - IN PROGRESS

| Feature | Status | Notes |
|---------|--------|-------|
| Integration Tests | Complete | 40 tests for MCP tools (PR #12) |
| End-to-End Tests | Complete | 13 tests for SmartBrowser (PR #11) |
| Tiered Fetcher Tests | Complete | 24 tests (PR #10) |
| Content Intelligence Tests | Complete | 49 tests (PR #16, PR #37, PR #38) |
| Lightweight Renderer Tests | Complete | 43 tests (PR #17) |
| Structured Logging | Complete | Pino-based logger (PR #20) |
| Error Boundaries | Complete | SmartBrowser error handling (PR #9) |
| Session Health Monitoring | Complete | Auto-refresh callbacks (PR #15) |
| Timeout Configuration | Complete | Central config (PR #14) |
| Tier Usage Analytics | Complete | get_tier_usage_by_domain tool (PR #13) |
| Performance Timing | Complete | PerformanceTracker utility, get_performance_metrics tool |
| Site-Specific APIs | Complete | Reddit, HN, GitHub, Wikipedia, StackOverflow, NPM, PyPI, Dev.to |
| Site API Live Tests | Complete | 44 tests against real endpoints (LIVE_TESTS=true) |
| URL Safety (SSRF Protection) | Complete | Blocks RFC1918, localhost, metadata endpoints, dangerous protocols |

---

## Architecture Overview

```text
                    +-------------------------------------+
                    |         MCP Tool Interface          |
                    |  smart_browse, skills, patterns...  |
                    +-----------------+-------------------+
                                      |
                    +-----------------v-------------------+
                    |         Strategy Layer              |
                    |  Route requests to optimal path     |
                    +-----------------+-------------------+
                                      |
          +---------------------------+---------------------------+
          |                           |                           |
    +-----v-----+             +-------v-------+           +-------v-------+
    | Intelligence|             |  Lightweight   |           |   Playwright   |
    |   Tier      |             |     Tier       |           |     Tier       |
    | (~100ms)    |             |   (~300ms)     |           |   (~2-5s)      |
    +-------------+             +---------------+           +---------------+
          |                           |                           |
    +-----v-----------------------------------------------------------+
    |                    Learning & Memory Layer                       |
    |  Procedural Memory | Knowledge Base | Anti-patterns | Sessions   |
    +------------------------------------------------------------------+
```

---

## MCP Tools Available

| Tool | Description | Category |
|------|-------------|----------|
| `smart_browse` | Intelligent browsing with tier selection | Core |
| `execute_api_call` | Direct API calls bypassing browser | Core |
| `save_session` | Persist authentication for domain | Session |
| `list_sessions` | View all saved sessions | Session |
| `get_knowledge_stats` | View learning statistics | Knowledge |
| `get_learned_patterns` | Get patterns for domain | Knowledge |
| `record_skill` | Start recording a skill | Skills |
| `stop_recording` | Complete skill recording | Skills |
| `execute_skill` | Replay a recorded skill | Skills |
| `list_skills` | View available skills | Skills |
| `rollback_skill` | Restore previous skill version | Skills |
| `provide_feedback` | Improve skill from user feedback | Skills |
| `get_learning_stats` | View learning engine stats | Learning |
| `get_domain_insights` | Get insights for domain | Learning |

---

## Test Coverage

| Category | Tests | Notes |
|----------|-------|-------|
| Utilities (cache, retry, rate-limiter) | 25+ | Vitest unit tests |
| Content Extractor | 10+ | Unit tests |
| Content Intelligence | 57 | Framework extraction, structured data, API handlers |
| Lightweight Renderer | 43 | linkedom integration, script execution |
| Tiered Fetcher | 24 | Tier cascade and fallback |
| SmartBrowser E2E | 13 | Full browse cycle |
| MCP Tools | 40 | smart_browse and related tools |
| Procedural Memory | 71 | Skills, versioning, rollback, workflows |
| Learning Engine | 64 | API discovery, selectors, validation, anomaly detection |
| Logger | 10 | Secret redaction, log levels, component loggers |
| URL Safety | 56 | SSRF protection, protocol blocking, IP range validation |
| PersistentStore | 33 | Debounced writes, atomic persistence, statistics |
| SessionCrypto | 28 | AES-256-GCM encryption, key derivation, migration |
| SessionManager | 27 | Session health, auto-refresh, encryption support |
| Failure Learning | 59 | Failure classification, anti-patterns, retry strategies |
| GraphQL Introspection | 49 | Endpoint detection, schema parsing, pattern generation |
| Discovery Orchestrator | 39 | Cache, source discovery, aggregation, error handling |
| Link Discovery | 87 | RFC 8288 headers, HTML links, HATEOAS (HAL, JSON:API, Siren, Collection+JSON, Hydra) |
| Docs Page Discovery | 89 | Framework detection, endpoint extraction, pattern generation |
| Auth Workflow | 43 | Credential management, OAuth flows, token refresh |
| Site API Live Tests | 44 | Real API requests (Reddit, HN, GitHub, Wikipedia, StackOverflow, NPM, PyPI, Dev.to) |
| **Total** | **1072 + 44 live** | All passing |

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @modelcontextprotocol/sdk | ^0.6.0 | MCP server framework |
| playwright | ^1.48.0 | Browser automation |
| linkedom | ^0.18.12 | Lightweight DOM parsing |
| cheerio | ^1.0.0 | HTML parsing |
| turndown | ^7.2.0 | HTML to Markdown |
| pdf-parse | ^1.1.1 | PDF content extraction |
| tough-cookie | ^6.0.0 | Cookie management |

---

## Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Large god files | Low | `src/index.ts` and `content-intelligence.ts` need splitting (D-010) |

### Resolved Issues

| Issue | Resolution |
|-------|------------|
| Session encryption basic | S-003: AES-256-GCM encryption with PBKDF2 key derivation. Set LLM_BROWSER_SESSION_KEY env var. |
| Dual knowledge stores | A-001: LearningEngine is now the canonical store. KnowledgeBase deprecated with automatic migration. |
| Legacy tools not marked deprecated | Added deprecation warnings to browse tool with runtime logging in PR #31 |
| No SSRF protection | URL safety module with comprehensive SSRF protection in PR #30 |
| Secrets in logs | Pino redact configuration in PR #29 |
| npm packaging hygiene | Added .npmignore in PR #28 |
| Missing LICENSE file | Added MIT LICENSE in PR #27 |
| ESM require.resolve bug | createRequire fix in PR #26 |
| Rate limiter potential deadlock | Fixed in PR #3 |
| No structured logging | Pino logger in PR #20 |
| No error boundaries | SmartBrowser error handling in PR #9 |

---

## File Organization

```text
ai-first-web-client/
+-- src/
|   +-- core/           # Core components
|   +-- tools/          # MCP tool implementations
|   +-- utils/          # Utility functions
|   +-- types/          # TypeScript interfaces
|   +-- index.ts        # Main entry point
+-- tests/              # Test files
+-- docs/               # Documentation
|   +-- VISION.md       # Project vision
|   +-- ROADMAP.md      # Development roadmap
|   +-- BACKLOG.md      # Task backlog
|   +-- PROJECT_STATUS.md
+-- scripts/            # Utility scripts
+-- sessions/           # Saved sessions (gitignored)
+-- dist/               # Compiled output
```

---

## Quick Links

- [Vision & Strategy](VISION.md)
- [Development Roadmap](ROADMAP.md)
- [Task Backlog](BACKLOG.md)
- [API Learning Plan](API_LEARNING_PLAN.md) - Generalized API pattern learning system
- [Main README](../README.md)
- [Development Guide](../CLAUDE.md)

---

## What's Next

See [BACKLOG.md](BACKLOG.md) for the detailed task backlog with priorities and effort estimates.

### Phase 3: API Learning System - IN PROGRESS

Building a **Generalized API Learning Layer** that shifts from hardcoded site-specific handlers to learned patterns. See [API_LEARNING_PLAN.md](API_LEARNING_PLAN.md) for the full plan.

| Phase | Goal | Status |
|-------|------|--------|
| 1. Pattern Extraction | Extract patterns from 8 existing handlers | Complete |
| 2. Learning From Success | Auto-learn when API extraction succeeds | Complete |
| 3. Pattern Application | Apply learned patterns to new sites | Complete |
| 4. Cross-Site Transfer | Transfer patterns to similar sites | Complete |
| 5. OpenAPI Discovery | Auto-detect and use API specifications | Complete |
| 6. Failure Learning | Learn from mistakes, build anti-patterns | Complete |

### Phase 4: API Documentation Discovery - IN PROGRESS

Building a **Documentation-First Discovery Layer** that leverages existing API documentation. See [API_DOCUMENTATION_DISCOVERY_PLAN.md](API_DOCUMENTATION_DISCOVERY_PLAN.md) for the full plan.

Note: "Order" reflects the implementation sequence, optimized for dependencies and impact.

| ID | Order | Goal | Status |
|----|-------|------|--------|
| D-001 | 1 | GraphQL Introspection | Complete |
| D-008 | 2 | Discovery Orchestrator | Complete |
| D-004 | 3 | OpenAPI Enhancement | Complete |
| D-003 | 4 | Link Discovery | Complete |
| D-002 | 5 | Docs Page Detection | Complete |
| D-009 | 6 | Auth Workflow Helper | Complete |
| D-005 | 7 | AsyncAPI Discovery | Complete |
| D-006 | 8 | Alt Spec Formats | Complete |
| D-007 | 9 | Robots/Sitemap Analysis | Complete |
| D-010 | 10 | Backend Framework Fingerprinting | Complete |

---

## Current Task: CX-002 Field-level Confidence Map

**Status:** In Progress

Adding per-field confidence scores to MCP tool responses for content, APIs, and tables.

---

## Changelog

### v0.5.0 (2025-12-20)

- Added CX-001: Response Schema Versioning - All MCP tool responses now include schemaVersion field
- Added API Documentation Discovery Phase 10: Backend Framework Fingerprinting (D-010)
  - New core module `src/core/backend-framework-fingerprinting.ts` for framework detection
  - Detects 8 backend frameworks: Rails, Django, Phoenix, FastAPI, Spring Boot, Laravel, Express, ASP.NET Core
  - HTTP header analysis for framework signatures (X-Powered-By, X-Runtime, Server, etc.)
  - Cookie pattern detection for framework-specific session cookies
  - HTML analysis for CSRF tokens, framework-specific scripts, and meta tags
  - Convention-based API pattern generation for each framework
  - Integration with Discovery Orchestrator as 'backend-framework' source
  - Caching support with 2-hour TTL
  - 57 new tests for framework fingerprinting
- Added API Documentation Discovery Phase 9: Robots/Sitemap Analysis (D-007)
  - New core module `src/core/robots-sitemap-discovery.ts` for API hint extraction
  - robots.txt parsing with Disallow/Allow directive analysis
  - sitemap.xml parsing with URL pattern detection
  - API path hints extraction (api-path, graphql, spec-file, documentation, developer-portal)
  - Integration with Discovery Orchestrator as 'robots-sitemap' source
  - Caching support with configurable TTL
  - 45 new tests for robots/sitemap discovery
- Added API Documentation Discovery Phase 8: Alt Spec Formats (D-006)
  - New core module `src/core/alt-spec-discovery.ts` for alternative API specification discovery
  - RAML (RESTful API Modeling Language) parsing with YAML support
  - API Blueprint (Markdown-based) parsing with regex extraction
  - WADL (Web Application Description Language/XML) parsing
  - Discovery at common locations (/api.raml, /api.apib, /application.wadl, etc.)
  - Endpoint extraction with path parameters, query parameters, and descriptions
  - Security scheme parsing for all formats
  - Pattern generation for use with Learning Engine
  - Integration with Discovery Orchestrator as 'alt-spec' source
  - 39 new tests for alt-spec discovery
- Added API Documentation Discovery Phase 7: AsyncAPI Discovery (D-005)
  - New core module `src/core/asyncapi-discovery.ts` for event-driven API discovery
  - Support for AsyncAPI 2.x and 3.x specifications
  - Discovery at common locations (/asyncapi.json, /asyncapi.yaml, /.well-known/asyncapi, etc.)
  - Protocol support: WebSocket (ws/wss), MQTT, Kafka, AMQP, and more
  - Channel, server, and message schema extraction
  - Security scheme parsing (apiKey, oauth2, userPassword, etc.)
  - Pattern generation for WebSocket endpoints
  - Integration with Discovery Orchestrator as 'asyncapi' source
  - 41 new tests for AsyncAPI discovery
- Added API Documentation Discovery Phase 6: Auth Workflow Helper (D-009)
  - New core module `src/core/auth-workflow.ts` for guided API authentication
  - Support for multiple auth types: API Key (header/query/cookie), Bearer, Basic, OAuth 2.0, Cookie
  - OAuth 2.0 flows: authorization_code, client_credentials, password
  - Token expiration detection and auto-refresh for OAuth tokens
  - Credential validation and persistence to `api-credentials.json`
  - 6 new MCP tools: get_api_auth_status, configure_api_auth, complete_oauth, get_auth_guidance, delete_api_auth, list_configured_auth
  - Multiple profile support for multiple accounts per domain
  - Integration with API documentation discovery for auth requirement detection
  - 43 new tests for auth workflow
- Added API Documentation Discovery Phase 5: Docs Page Detection (D-002)
  - Documentation URL probing at common locations (/docs, /api-docs, /developers, etc.)
  - Framework detection for Swagger UI, Redoc, ReadMe, Slate, Docusaurus, GitBook, Mintlify, Stoplight
  - Endpoint extraction from HTML tables, code blocks (curl, HTTP examples, fetch/axios), and headings
  - Navigation link extraction for API documentation discovery
  - API base URL and authentication instructions extraction
  - Pattern generation from documented endpoints
  - Integration with Discovery Orchestrator as 'docs-page' source
  - 89 new tests for docs page discovery
- Added API Documentation Discovery Phase 1: GraphQL Introspection (D-001)
  - Automatic GraphQL endpoint detection (probes /graphql, /api/graphql, etc.)
  - Full introspection query to discover schema types, queries, mutations
  - Schema parsing with type extraction and relationship mapping
  - Pagination pattern detection (Relay, offset, cursor, page-based)
  - Query pattern generation with field selection and argument handling
  - Integration with ContentIntelligence as 'api:graphql' strategy
  - 49 new tests for GraphQL introspection
- Added API Documentation Discovery Phase 2: Discovery Orchestrator (D-008)
  - Unified discovery pipeline that orchestrates all discovery sources
  - Parallel execution of OpenAPI and GraphQL discovery
  - Result caching with configurable TTL (default 1 hour)
  - Pattern deduplication and priority-based ordering
  - Metadata aggregation from multiple sources
  - 39 new tests for discovery orchestrator
- Added API Documentation Discovery Phase 3: OpenAPI Enhancement (D-004)
  - Full YAML parsing with js-yaml library (anchors, aliases, multi-line strings)
  - $ref resolution for local JSON pointers with circular reference handling
  - POST/PUT/DELETE pattern support with request body schema extraction
  - Rate limit extraction from x-ratelimit extensions
  - Request body content type handling (JSON, form-data, etc.)
  - 18 new tests for OpenAPI enhancements
- Added API Documentation Discovery Phase 4: Link Discovery (D-003)
  - RFC 8288 Link header parsing for API and documentation discovery
  - HTML `<link>` element extraction with type and rel attribute handling
  - HATEOAS hypermedia format detection (HAL, JSON:API, Siren, Collection+JSON, Hydra)
  - Link extraction from HAL _links, JSON:API links, Siren links and entities
  - Pattern generation from discovered API links
  - Pagination link extraction (next, prev, first, last)
  - Integration with Discovery Orchestrator as 'links' source
  - 69 new tests for link discovery
- Added API Pattern Learning System Phase 6: Failure Learning (L-007)
  - Failure classification by category (auth, rate limit, timeout, server error, etc.)
  - Anti-pattern creation from repeated failures to avoid wasting requests
  - Smart retry strategies based on failure type (backoff, skip_domain, increase_timeout)
  - Integration with ContentIntelligence pattern application flow
  - Anti-pattern matching to skip URLs with active anti-patterns
  - Failure tracking with category counts and recent failure history
  - Pattern health analysis to determine unhealthy patterns
  - 59 new tests for failure learning
- Added API Pattern Learning System Phase 5: OpenAPI Discovery (L-006)
  - Automatic discovery of OpenAPI/Swagger specifications from common locations
  - Support for OpenAPI 3.x and Swagger 2.x formats
  - Pattern generation from discovered API endpoints
  - Integration with ContentIntelligence as 'api:openapi' strategy
  - Discovery caching to avoid repeated probing
  - 31 new tests for OpenAPI discovery
- Added API Pattern Learning System Phase 4: Cross-Site Pattern Transfer (L-005)
  - API domain groups for categorizing similar sites (package_registries, code_hosting, qa_forums, etc.)
  - Site similarity scoring based on URL structure, response format, template type, and domain group
  - Pattern transfer with configurable confidence decay
  - Auto-transfer of applicable patterns to new domains
  - Transfer outcome tracking with confidence adjustments
  - 30 new tests for cross-site transfer
- Added API Pattern Learning System Phase 3: Pattern Application (L-004)
  - tryLearnedPatterns() strategy in ContentIntelligence extraction pipeline
  - applyLearnedPattern() method for fetching and validating learned API endpoints
  - handlePatternFailure() helper for consistent failure handling and metrics updates
  - HTML content detection and conversion to plain text/markdown
  - Confidence thresholds as named constants for maintainability
  - 17 new tests for pattern application
- Added API Pattern Learning System Phase 2: Learning From Success (L-003)
  - Auto-learn patterns when API extraction succeeds
  - ApiExtractionSuccess event type and listeners in ContentIntelligence
  - learnFromExtraction() method in ApiPatternRegistry
  - Automatic template type inference (json-suffix, registry-lookup, rest-resource, etc.)
  - Content mapping inference with JSON path finding
  - 15 new tests for pattern learning
- Added API Pattern Learning System Phase 1: Pattern Extraction (L-001/L-002)
  - 5 pattern template types: json-suffix, registry-lookup, rest-resource, firebase-rest, query-api
  - 8 bootstrap patterns from existing handlers (Reddit, NPM, PyPI, GitHub, Wikipedia, HackerNews, StackOverflow, Dev.to)
  - ApiPatternRegistry for storing, matching, and learning patterns with persistence
  - 63 tests for pattern learning system
- Added PyPI API handler for pypi.org and pypi.python.org URLs
- Added NPM registry API handler for npmjs.com and registry.npmjs.org URLs
- Added session encryption at rest using AES-256-GCM with PBKDF2 key derivation
- Set LLM_BROWSER_SESSION_KEY environment variable to enable encryption
- Automatic migration from unencrypted to encrypted sessions
- Added SessionCrypto utility with 28 tests
- Unified learning persistence: LearningEngine is now the canonical store, KnowledgeBase deprecated
- Added automatic migration from legacy knowledge-base.json to LearningEngine
- Added KnowledgeBase compatibility methods to LearningEngine (getPatterns, findPattern, learn, etc.)
- Added PersistentStore utility with debounced writes and atomic persistence (temp file + rename)
- Applied debounced/atomic persistence to KnowledgeBase, LearningEngine, ProceduralMemory, SessionManager
- Added output size controls to smart_browse (maxChars, includeTables, includeNetwork, includeConsole, includeHtml)
- Deprecated legacy "browse" tool with runtime warnings (use "smart_browse" instead)
- Added URL safety module with comprehensive SSRF protection (56 tests)
- Added secret redaction in logs using Pino redact configuration
- Added site-specific API handlers (Reddit, HN, GitHub, Wikipedia, StackOverflow)
- Added performance timing with PerformanceTracker and get_performance_metrics tool
- Added structured Pino logging with component child loggers
- Added session health monitoring with auto-refresh callbacks
- Added tier usage analytics with get_tier_usage_by_domain tool
- Added centralized timeout configuration
- Added 473 tests covering all major components
- Added comprehensive tests for LearningEngine (64 tests)
- Added comprehensive tests for ProceduralMemory (71 tests)
- Added comprehensive tests for PersistentStore (33 tests)
- Improved error handling with error boundaries in SmartBrowser

### v0.4.0 (2024-12-16)

- Added tiered rendering (Intelligence -> Lightweight -> Playwright)
- Added Content Intelligence with framework detection
- Added Procedural Memory with skill versioning
- Added Learning Engine with API discovery
- Added bot challenge detection
- Reorganized project structure

### v0.3.0

- Added Procedural Memory system
- Added anti-pattern tracking
- Added user feedback integration

### v0.2.0

- Added Knowledge Base
- Added session management
- Added API discovery

### v0.1.0

- Initial MVP release
- Basic browsing with Playwright
- Content extraction
