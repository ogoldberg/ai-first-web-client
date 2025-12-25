# Unbrowser - Project Status

**Last Updated:** 2025-12-24
**Version:** 0.5.0
**Current Phase:** Production Readiness (Phase 2)
**Total Code:** ~20,000 lines TypeScript
**Tests:** 2340+ passing + 44 live tests

---

## Executive Summary

Unbrowser is an intelligent web browsing API for AI agents. It learns from browsing patterns, discovers API endpoints automatically, and progressively optimizes to bypass browser rendering entirely.

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
| Site-Specific APIs | Complete | Reddit, HN, GitHub, Wikipedia, StackOverflow, NPM, PyPI, Dev.to, Medium, YouTube |
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

Unbrowser exposes **5 core tools** by default (TC-001 through TC-008), designed to minimize cognitive load for LLMs.

### Core Tools (Always Visible)

| Tool | Description |
|------|-------------|
| `smart_browse` | Intelligent browsing with automatic learning and optimization |
| `batch_browse` | Browse multiple URLs in a single call with controlled concurrency |
| `execute_api_call` | Direct API calls using discovered patterns (bypasses browser) |
| `session_management` | Manage sessions for authenticated access (save, list, health) |
| `api_auth` | Configure API authentication (API keys, OAuth, bearer tokens, etc.) |

### Debug Tools (LLM_BROWSER_DEBUG_MODE=1)

| Tool | Description |
|------|-------------|
| `capture_screenshot` | Capture screenshots for visual debugging |
| `export_har` | Export HAR files for network debugging |
| `debug_traces` | Query and manage debug traces for failure analysis |

### Admin Tools (LLM_BROWSER_ADMIN_MODE=1)

| Tool | Description |
|------|-------------|
| `get_performance_metrics` | Comprehensive performance metrics for all tiers |
| `usage_analytics` | Usage statistics and cost analysis |
| `get_analytics_dashboard` | Unified analytics dashboard |
| `get_system_status` | Quick system health check |
| `get_browser_providers` | Information about available browser providers |
| `tier_management` | Manage tiered rendering for domains |
| `content_tracking` | Track and detect content changes on websites |

### Deprecated Tools (LLM_BROWSER_ADMIN_MODE=1)

These tools are deprecated and hidden by default. Use the consolidated alternatives:

| Deprecated Tool | Use Instead |
|-----------------|-------------|
| `get_domain_intelligence` | `smart_browse` with `includeInsights=true` |
| `get_domain_capabilities` | `smart_browse` with `includeInsights=true` |
| `get_learning_stats` | Admin analytics tools |
| `get_learning_effectiveness` | Admin analytics tools |
| `skill_management` | Skills are auto-applied during `smart_browse` |
| `get_api_auth_status` | `api_auth` with `action='status'` |
| `configure_api_auth` | `api_auth` with `action='configure'` |
| `complete_oauth` | `api_auth` with `action='complete_oauth'` |
| `get_auth_guidance` | `api_auth` with `action='guidance'` |
| `delete_api_auth` | `api_auth` with `action='delete'` |
| `list_configured_auth` | `api_auth` with `action='list'` |

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
| Pattern Validation Live Tests | 32 | Bootstrap patterns, learned patterns, cross-domain transfer, metrics |
| Tenant Store | 64 | Tenant isolation, shared pool, usage tracking, persistence |
| **Total** | **1883 + 76 live** | All passing |

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

### Strategic Direction: Multi-Interface Architecture

**Key Insight:** One interface (MCP) cannot optimally serve both use cases (scraping and research). Moving to hybrid architecture with SDK foundation and multiple interface layers.

**Target Use Cases:**
1. **Research/Exploration** → Skills (easiest) or simplified MCP (flexible)
2. **Scraping/Automation** → SDK (direct) or hosted API (managed)

### Phase 3: API Learning System - COMPLETE ✅

Built a **Generalized API Learning Layer** that shifts from hardcoded site-specific handlers to learned patterns. See [API_LEARNING_PLAN.md](API_LEARNING_PLAN.md) for the full plan.

| Phase | Goal | Status |
|-------|------|--------|
| 1. Pattern Extraction | Extract patterns from 8 existing handlers | Complete |
| 2. Learning From Success | Auto-learn when API extraction succeeds | Complete |
| 3. Pattern Application | Apply learned patterns to new sites | Complete |
| 4. Cross-Site Transfer | Transfer patterns to similar sites | Complete |
| 5. OpenAPI Discovery | Auto-detect and use API specifications | Complete |
| 6. Failure Learning | Learn from mistakes, build anti-patterns | Complete |

### Phase 4: API Documentation Discovery - COMPLETE ✅

Built a **Documentation-First Discovery Layer** that leverages existing API documentation. See [API_DOCUMENTATION_DISCOVERY_PLAN.md](API_DOCUMENTATION_DISCOVERY_PLAN.md) for the full plan.

All 10 phases complete:
- GraphQL Introspection, Discovery Orchestrator, OpenAPI Enhancement
- Link Discovery, Docs Page Detection, Auth Workflow Helper
- AsyncAPI Discovery, Alt Spec Formats, Robots/Sitemap Analysis
- Backend Framework Fingerprinting

### Phase 5: Interface Simplification & Expansion - NEXT

**Problem:** 25 MCP tools overwhelm LLMs. Need multiple interfaces for different use cases.

**Four Parallel Initiatives:**

#### 1. MCP Tool Consolidation (TC-001 to TC-010)
**Goal:** 25 tools → 5 core tools

| Priority | Initiative | Status |
|----------|-----------|--------|
| P0 | Consolidate 6 auth tools → 1 | Complete |
| P0 | Auto-embed domain insights in smart_browse | Complete |
| P0 | Auto-apply skills (remove skill_management) | Complete |
| P1 | Move debug tools to DEBUG_MODE | Complete |
| P1 | Remove analytics/infrastructure tools from MCP | Complete |
| P1 | Auto-track content or add checkForChanges flag | Complete |
| P1 | Hide deprecated tools behind ADMIN_MODE | Complete |

**Target Tools:**
1. `smart_browse` - Intelligent browsing with auto-learning
2. `execute_api_call` - Direct API calls
3. `api_auth` - Consolidated authentication (action-based)
4. `session_management` - Session/cookie management
5. `batch_browse` - Batch operations (optional)

#### 2. SDK Extraction (SDK-001 to SDK-012)
**Goal:** Extract core into `@llm-browser/core` npm package

| Priority | Initiative | Status |
|----------|-----------|--------|
| P0 | Audit dependencies and create package structure (SDK-001, SDK-002) | Complete |
| P0 | Extract SmartBrowser, learning, session components (SDK-003, SDK-004, SDK-005) | Complete |
| P0 | Create SDK type definitions (SDK-006) | Complete |
| P1 | Add SDK usage examples (SDK-007) | Complete |
| P1 | Write SDK documentation (SDK-008) | Complete |
| P1 | Refactor MCP tools as thin wrappers (SDK-009) | Complete |
| P1 | Publish to npm (SDK-010) | Complete |
| P1 | Create SDK migration guide (SDK-011) | Complete |
| P1 | Add SDK integration tests (SDK-012) | Complete |

**Benefits:** Enables direct programmatic use, foundation for all interfaces

#### 3. Skills & Prompts (SK-001 to SK-011)
**Goal:** 5-10 Claude skills for easiest UX

| Priority | Initiative | Status |
|----------|-----------|--------|
| P1 | Design skill templates | Complete |
| P1 | Create 5 core skills (Research, Monitor, Scrape, Discover, Compare) | Complete |
| P2 | Test with users and submit to directory | Not Started |

**Benefits:** Simplest entry point, drives MCP adoption

#### 4. Hosted API Preparation (API-001 to API-017)
**Goal:** Production-ready REST API for monetization

| Priority | Initiative | Status |
|----------|-----------|--------|
| P1 | Design endpoints, auth, rate limiting (API-001) | Complete |
| P1 | Implement API authentication (API-002) | Complete |
| P1 | Add per-tenant rate limiting (API-003) | Complete |
| P1 | Wire SmartBrowser to browse endpoints (CLOUD-001) | Complete |
| P1 | Add proxy management for IP blocking (CLOUD-003) | Complete |
| P1 | Implement usage metering and billing (CLOUD-002) | Complete |
| P2 | Add Supabase/Postgres persistence (CLOUD-004) | Complete |
| P2 | Production infrastructure and monitoring | Not Started |
| P2 | Beta program launch | Not Started |
| P2 | Admin dashboard (API-008) | In Progress |
| P3 | Type-safe configuration validation (D-009) | Complete |

**Benefits:** Platform-agnostic access, primary revenue stream

---

## Recently Completed: YouTube API Handler (I-010)

**Status:** Complete (PR #99)

**Goal:** Add YouTube API handler for extracting video metadata via oEmbed API (no auth required) with optional Data API v3 enhancement (when YOUTUBE_API_KEY env var is set).

**Implementation:**

- YouTube URL detection (youtube.com, youtu.be, m.youtube.com, youtube-nocookie.com)
- Video URL patterns (/watch?v=, /embed/, /shorts/, /v/, youtu.be shortlinks)
- Video ID extraction from all URL formats
- oEmbed API integration (no API key required) for basic video info:
  - Title, author/channel name, channel URL
  - Thumbnail URL and dimensions
  - Provider info
- Optional YouTube Data API v3 enhancement (when YOUTUBE_API_KEY is set):
  - Description, view count, like count, comment count
  - Published date, duration (ISO 8601 parsing)
  - Tags and category info
  - Channel details
- Confidence levels: 'high' with Data API, 'medium' with oEmbed only
- 14 comprehensive tests

| ID    | Task                | Priority | Effort | Status   |
|-------|---------------------|----------|--------|----------|
| I-010 | YouTube API handler | Medium   | M      | Complete |

---

## Recently Completed: Medium API Handler (I-009)

**Status:** Complete (PR #96)

**Goal:** Add Medium.com API handler for extracting article content via their undocumented `?format=json` API.

**Implementation:**

- Medium URL detection (medium.com, subdomains like engineering.medium.com, publications)
- Article path detection (/@username/slug, /p/hexid, /publication/slug patterns)
- JSON hijacking protection prefix stripping (])}while(1);</x> and variants)
- Nested JSON structure parsing for title, subtitle, author, content
- Paragraph type formatting:
  - Type 3: H3 headers -> ## Markdown
  - Type 13: H4 headers -> ### Markdown
  - Type 6/7: Blockquotes/Pull quotes -> > Markdown
  - Type 8/11: Code blocks/Preformatted -> ``` Markdown
  - Type 9: Bulleted lists -> - Markdown
  - Type 10: Ordered lists -> 1. Markdown
  - Type 4: Image captions -> *caption* Markdown
- Metadata extraction (reading time, claps, published date)
- 20 comprehensive tests

| ID    | Task               | Priority | Effort | Status   |
|-------|--------------------|----------|--------|----------|
| I-009 | Medium API handler | Medium   | M      | Complete |

---

## Recently Completed: Batch Browse Operations (F-001)

**Status:** Complete

**Goal:** Enable browsing multiple URLs in a single call for improved LLM workflow efficiency.

**Implementation:**

- New `batch_browse` MCP tool accepting array of URLs
- SmartBrowser.batchBrowse() method with controlled concurrency
- Configurable concurrency (default: 3 parallel requests)
- Per-URL and total timeout controls
- Individual error handling (one failure doesn't stop others)
- Rate limiting detection with separate status
- SSRF protection on all URLs (pre-validation)
- Results maintain original URL order
- Shared session and pattern usage across batch
- Output controls (maxChars, includeTables, includeNetwork, etc.)
- 23 comprehensive tests

| ID    | Task                    | Priority | Effort | Status   |
|-------|-------------------------|----------|--------|----------|
| F-001 | Batch browse operations | Medium   | L      | Complete |

---

## Recently Completed: Fix Bootstrap Pattern Tests (T-009)

**Status:** Complete

**Goal:** Fix 8 failing tests in learned-pattern-application.test.ts where bootstrap patterns are not loading correctly after initialization.

**Root Cause:**
- Bootstrap patterns were only loaded when the registry was empty
- After the first run, persisted learned patterns existed in `learned-patterns.json`
- Since `patterns.size > 0`, the `bootstrap()` method was skipped
- This meant bootstrap patterns (reddit, npm, pypi, github, etc.) were never loaded

**Fix:**
- Added `ensureBootstrapPatterns()` method that checks for and adds missing bootstrap patterns
- This method is called on every `initialize()` regardless of persisted patterns
- Only adds bootstrap patterns that don't already exist (by ID)
- Preserves any existing patterns while ensuring all bootstrap patterns are available

| ID    | Task                         | Priority | Effort | Status   |
|-------|------------------------------|----------|--------|----------|
| T-009 | Fix bootstrap pattern tests  | Critical | M      | Complete |

---

## Recently Completed: Content Change Detection Alerts (F-003)

**Status:** Complete (PR #94)

**Goal:** Detect and notify when website content changes between visits, allowing LLM clients to know if they're working with stale data.

**Implementation:**

- ContentChangeTracker class with persistent storage using PersistentStore
- Content fingerprinting using MD5 hash, text length, word count, and structure hash
- Change significance classification (low, medium, high) based on content delta
- Change history tracking with summary and fingerprint comparison
- URL tracking with labels and tags for categorization
- Filtering by domain, tags, and change status
- 6 new MCP tools:
  - `track_url_for_changes` - Start tracking a URL for changes
  - `check_content_changes` - Check if tracked content has changed
  - `list_tracked_urls` - List all tracked URLs with filtering
  - `get_change_history` - Get history of detected changes
  - `untrack_url` - Stop tracking a URL
  - `get_change_tracker_stats` - Get tracking statistics
- Integration with SmartBrowser for automatic content extraction
- 33 comprehensive tests for ContentChangeTracker

| ID    | Task                            | Priority | Effort | Status   |
|-------|---------------------------------|----------|--------|----------|
| F-003 | Content change detection alerts | Medium   | M      | Complete |

---

## Recently Completed: Skill Sharing + Portability (F-012)

**Status:** Complete (PR #93)

**Goal:** Enable export/import of skill packs by domain vertical (gov, ecommerce, docs), allowing users to share learned skills across instances and domains.

**Implementation:**

- SkillPack types with metadata, versioning, and compatibility info
- SkillVertical categorization (government, ecommerce, documentation, developer, etc.)
- ProceduralMemory.exportSkillPack() with domain/vertical/performance filtering
- ProceduralMemory.importSkillPack() with conflict resolution (skip, overwrite, merge, rename)
- Domain pattern matching (glob-like) and vertical inference from domains
- MCP tools: `export_skills`, `import_skills`, `get_skill_pack_stats`
- Include/exclude anti-patterns and workflows in exports
- Reset metrics and name prefix options for imports
- 40 comprehensive tests for skill sharing functionality

| ID    | Task                        | Priority | Effort | Status   |
|-------|-----------------------------| ---------|--------|----------|
| F-012 | Skill sharing + portability | Medium   | M      | Complete |

---

## Recently Completed: HAR File Export (F-006)

**Status:** Complete (PR #92)

**Goal:** Add HAR (HTTP Archive) file export for network debugging, allowing LLM clients to capture and export network traffic during browsing sessions.

**Implementation:**

- SmartBrowser.exportHar() method with configurable options (includeResponseBodies, maxBodySize, pageTitle)
- New MCP tool `export_har` returning HAR JSON data in HAR 1.2 format
- HAR type definitions with full HAR 1.2 spec compliance
- HAR converter utility with byte-accurate size calculations (Buffer.from for proper byte size)
- Dynamic package version loading from package.json
- Proper resource cleanup with try...finally pattern
- SSRF protection for URL validation
- 13 comprehensive test cases for HAR converter

| ID    | Task            | Priority | Effort | Status   |
|-------|-----------------|----------|--------|----------|
| F-006 | HAR file export | Medium   | M      | Complete |

---

## Recently Completed: Screenshot Capture on Demand (F-005)

**Status:** Complete (PR #91)

**Goal:** Add screenshot capture functionality for visual debugging, allowing LLM clients to capture screenshots of rendered pages on demand.

**Implementation:**

- SmartBrowser.captureScreenshot() method with configurable options (fullPage, viewport, element selector)
- New MCP tool `capture_screenshot` returning base64-encoded PNG image data
- ScreenshotOptions and ScreenshotResult interfaces for clean API
- Proper resource cleanup with try...finally pattern
- Uses TIMEOUTS.SELECTOR_WAIT constant for consistency
- Include metadata (timestamp, URL, viewport dimensions) with screenshots
- 10 comprehensive test cases

| ID    | Task                         | Priority | Effort | Status   |
|-------|------------------------------|----------|--------|----------|
| F-005 | Screenshot capture on demand | Medium   | M      | Complete |

---

## Recently Completed: Vue.js Framework Support (I-002)

**Status:** Complete (PR #90)

**Goal:** Add Vue.js ecosystem framework detection to Content Intelligence, enabling data extraction from VitePress and VuePress sites.

**Implementation:**

- VitePress (Vue 3 SSG) detection via generator meta, __VP_HASH_MAP__, VPDoc classes
- VuePress (Vue 2/3 SSG) detection via generator meta, __VUEPRESS_SSR_CONTEXT__, theme classes
- Support for both VuePress v1 and v2 patterns
- Comprehensive JavaScript string escape handling for embedded JSON
- 9 comprehensive test cases covering all extraction scenarios

| ID    | Task                     | Priority | Effort | Status   |
|-------|--------------------------|----------|--------|----------|
| I-002 | Vue.js framework support | Medium   | M      | Complete |

---

## Recently Completed: Angular Framework Support (I-001)

**Status:** Complete (PR #89)

**Goal:** Add Angular framework detection to Content Intelligence, enabling data extraction from Angular and Angular Universal (SSR) applications.

**Implementation:**

- Angular Universal TransferState extraction (serverApp-state, transfer-state, ng-state)
- Angular app detection via indicators (app-root, ng-version, zone.js, ngh attributes)
- Recursive title extraction with cycle detection for nested data structures
- Optimized RegExp creation for Angular state ID matching
- Debug logging for JSON parse failures
- 8 comprehensive test cases covering all extraction scenarios

| ID    | Task                      | Priority | Effort | Status   |
|-------|---------------------------|----------|--------|----------|
| I-001 | Angular framework support | Medium   | M      | Complete |

---

## Recently Completed: Hosted Alpha Checklist (GTM-003)

**Status:** Complete

**Goal:** Document infrastructure, auth, rate limiting, logging, and onboarding requirements for a hosted alpha deployment.

| ID      | Task                    | Priority | Effort | Status   |
|---------|-------------------------|----------|--------|----------|
| GTM-003 | Hosted alpha checklist  | Medium   | S      | Complete |

**Implementation:**
- New comprehensive checklist document: `docs/HOSTED_ALPHA_CHECKLIST.md`
- 10 sections covering infrastructure, auth, rate limiting, logging, reliability, onboarding, security, deployment, pre-launch, and post-alpha
- Tracks existing completed items (session encryption, SSRF protection, multi-tenant isolation, structured logging)
- Defines TODO items for hosted deployment (container image, API key auth, customer rate limits, etc.)
- Includes alpha success criteria and metrics targets

---

## Recently Completed: SLA/Support Policy Draft (GTM-005)

**Status:** Complete

**Goal:** Define enterprise support and uptime targets for the hosted service.

| ID      | Task                     | Priority | Effort | Status   |
|---------|--------------------------|----------|--------|----------|
| GTM-005 | SLA/support policy draft | Medium   | S      | Complete |

**Implementation:**
- New comprehensive SLA/support policy document: `docs/SLA_SUPPORT_POLICY.md`
- Uptime commitments by tier (99.0% Starter, 99.5% Team, 99.9% Enterprise)
- Service credit schedule for Enterprise
- Support response times by tier and priority level
- Issue priority definitions (P1-P4) with response expectations
- Escalation procedures (internal and customer)
- Scheduled maintenance windows and notification policies
- Incident communication timeline and post-incident reports
- Data retention, backup, and recovery policies
- Security incident response timeline

---

## Recently Completed: Pricing & Packaging Doc (GTM-004)

**Status:** Complete

**Goal:** Document public-facing pricing tiers and usage model for the hosted service.

| ID      | Task                    | Priority | Effort | Status   |
|---------|-------------------------|----------|--------|----------|
| GTM-004 | Pricing & packaging doc | Medium   | S      | Complete |

**Implementation:**
- New comprehensive pricing document: `docs/PRICING.md`
- Four tiers: Free, Starter, Team, Enterprise
- Usage-based pricing model with request units (Intelligence=1, Lightweight=5, Playwright=25)
- Feature comparison matrix
- Add-ons, billing, and FAQ sections
- Support tier matrix

---

## Recently Completed: Basic Analytics Dashboard (GTM-002)

**Status:** Complete (PR #85)

**Goal:** Aggregate latency, tier usage, and success rate into a basic analytics dashboard.

| ID      | Task                          | Priority | Effort | Status   |
|---------|-------------------------------|----------|--------|----------|
| GTM-002 | Basic analytics dashboard     | Medium   | M      | Complete |

**Implementation:**
- New AnalyticsDashboard utility for unified analytics view
- Aggregates usage (UsageMeter) and performance (PerformanceTracker) data
- System health assessment with issues and recommendations
- Per-tier breakdown (intelligence, lightweight, playwright)
- Top domains by cost, requests, and latency
- Time series data for trend visualization
- Period-over-period trends
- Wired UsageMeter recording into TieredFetcher
- MCP tools: get_analytics_dashboard, get_system_status
- 21 new tests

---

## Recently Completed: Usage Metering & Tier Cost Reporting (GTM-001)

**Status:** Complete (PR #84)

**Goal:** Collect per-request tier usage and cost signals for analytics and billing.

| ID      | Task                               | Priority | Effort | Status   |
|---------|------------------------------------|----------|--------|----------|
| GTM-001 | Usage metering & tier cost reporting | Medium   | M      | Complete |

**Implementation:**
- UsageMeter utility for tracking per-request tier usage and cost
- Cost units per tier (intelligence=1, lightweight=5, playwright=25)
- Aggregation by domain, tier, and time period
- MCP tools: get_usage_summary, get_usage_by_period, get_cost_breakdown, reset_usage_meters

---

## Recently Completed: Extraction Quality Benchmarking (O-006)

**Status:** Complete (PR #83)

**Goal:** Create an offline corpus and regression suite for content extraction and table parsing quality benchmarking.

| ID    | Task                            | Priority | Effort | Status   |
|-------|---------------------------------|----------|--------|----------|
| O-006 | Extraction quality benchmarking | Medium   | L      | Complete |

---

## Recently Completed: Debug/Replay Trace Recording (O-005)

**Status:** Complete (PR #82)

**Goal:** Add debug/replay trace recording capability for failure reproduction. This enables recording tier decisions, selectors tried, and validation reasons to persistent storage for later analysis and debugging.

| ID    | Task                         | Priority | Effort | Status   |
|-------|------------------------------|----------|--------|----------|
| O-005 | Debug/replay trace recording | Medium   | M      | Complete |

---

## Previous Task: Learning System Integration & Validation (Complete)

| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| LI-001 | Enable semantic matching by default | High | S | Completed |
| LI-002 | Wire feedback loops for anti-patterns | Medium | M | Complete |
| LI-003 | Add learning effectiveness metrics | High | M | Completed |
| LI-004 | Real-world pattern validation suite | High | L | Complete |
| LI-005 | Dynamic domain group learning | Medium | M | Complete |
| LI-006 | Semantic skill retrieval integration | Medium | S | Complete (PR #78) |

**Evaluated and Rejected:**
- Adding ML/neural network capabilities (jax-js, TensorFlow.js) - overkill for heuristic pattern matching
- Training models on browsing data - LLM does reasoning, system caches patterns

**Recently completed:**

- LI-002: Wire feedback loops for anti-patterns - DONE
- LI-006: Semantic skill retrieval integration - DONE (PR #78)
- LI-004: Real-world pattern validation suite - DONE
- LI-003: Add learning effectiveness metrics - DONE
- LI-001: Enable semantic matching by default - DONE
- CX-012: LLM Onboarding Spec - DONE
- CX-009: Tier Parity Learning - DONE
- CX-005: Budget Knobs (maxLatencyMs, maxCostTier, freshnessRequirement) - DONE
- CX-011: Domain Capability Summary - DONE
- CX-010: Config-driven Heuristics - DONE
- V-004: Extended Features (Skill similarity, error matching, content dedup, analytics) - DONE
- V-003: Query Integration (SemanticPatternMatcher + LearningEngine integration) - DONE
- V-002: Embedding Pipeline (EmbeddingProvider + ingestion + migration) - DONE
- V-001: VectorStore Core (LanceDB integration) - DONE
- CX-008: Memory Isolation + Shared Pool - DONE
- CX-007: Embedded Store Migration - DONE
- CX-006: Learning Provenance Metadata - DONE
- CX-004: Error Taxonomy + Action Hints - DONE
- CX-003: Decision Trace in Responses - DONE
- CX-002: Field-level Confidence Map - DONE
- CX-001: Response Schema Versioning - DONE

### Phase 5: Vector Embedding Storage - IN PROGRESS

See [VECTOR_EMBEDDING_STORAGE_PLAN.md](VECTOR_EMBEDDING_STORAGE_PLAN.md) for full design.

**Goal:** Add semantic similarity search using LanceDB as a complementary vector database to SQLite.

| ID | Phase | Task | Status |
|----|-------|------|--------|
| V-001 | 1 | VectorStore Core | DONE |
| V-002 | 2 | Embedding Pipeline | DONE |
| V-003 | 3 | Query Integration | DONE |
| V-004 | 4 | Extended Features | DONE |

---

## Changelog

### v0.5.0 (2025-12-24)

- Added CLOUD-003: Proxy management for IP blocking prevention
  - ProxyManager: Central orchestrator for proxy selection and health tracking
  - ProxyHealthTracker: Per-proxy, per-domain success/failure tracking with cooldowns
  - DomainRiskClassifier: Static rules + learning for 30+ high-risk domains (Google, Amazon, social media, etc.)
  - ProxySelector: Smart tier-based selection with fallback escalation
  - 4 proxy tiers: datacenter ($), ISP ($$), residential ($$$), premium ($$$$)
  - Plan-based tier access (FREE=datacenter, STARTER+=ISP, TEAM+=residential, ENTERPRISE=all)
  - Sticky sessions for consistent browsing
  - New API endpoints: GET /v1/proxy/stats, GET /v1/proxy/risk/:domain
  - Environment configuration: PROXY_DATACENTER_URLS, PROXY_ISP_URLS, BRIGHTDATA_AUTH
  - 125 new tests across 4 test files
  - See docs/PROXY_MANAGEMENT_PLAN.md for full architecture

### v0.5.0 (2025-12-22)

- Added TC-005/TC-006/TC-007/TC-008: Hide non-essential and deprecated tools behind ADMIN_MODE
  - LLM_BROWSER_ADMIN_MODE environment variable (set to 1 or true to enable)
  - Analytics tools hidden: get_performance_metrics, usage_analytics, get_analytics_dashboard, get_system_status
  - Infrastructure tools hidden: get_browser_providers, tier_management
  - Content tracking tool hidden: content_tracking (use smart_browse with checkForChanges instead)
  - Deprecated tools hidden: get_domain_intelligence, get_domain_capabilities, get_learning_stats,
    get_learning_effectiveness, skill_management, get_api_auth_status, configure_api_auth,
    complete_oauth, get_auth_guidance, delete_api_auth, list_configured_auth
  - All tools remain fully functional when ADMIN_MODE is enabled
  - Reduces cognitive load for LLMs by hiding 18 non-essential/deprecated tools

### v0.5.0 (2025-12-21)

- Added O-006: Extraction quality benchmarking
  - New ExtractionBenchmark class for offline corpus-based regression testing
  - CorpusEntry type for defining test cases with expected extraction results
  - Quality metrics: title accuracy, content validation, table matching, link checks
  - Fuzzy matching for title and content validation
  - Table header accuracy and row count validation with double-match prevention
  - Confidence level calibration checks
  - Human-readable benchmark reports
  - Built-in standard corpus with 8 representative test cases
  - Tag-based filtering for selective benchmark runs
  - 35 new tests
- Added O-005: Debug/replay trace recording
  - New DebugTraceRecorder utility for recording browse/API call traces
  - Records tier decisions, selectors tried, validation reasons, errors
  - Configurable retention policies (max traces, max age)
  - Query API for filtering traces by domain, URL pattern, success/failure, error type, tier
  - Integration with SmartBrowser for automatic recording
  - 7 new MCP tools: get_debug_traces, get_trace_details, export_trace, clear_debug_traces, get_trace_stats, search_trace_errors, replay_trace
  - 18 new tests for debug trace recorder
- Added LI-005: Dynamic domain group learning
  - New DomainGroupLearner module that learns domain groups from successful cross-domain transfers
  - Tracks transfer history between domains and builds relationship graph
  - Union-Find algorithm finds connected components to form domain groups
  - Groups auto-register with heuristics-config when confidence threshold met
  - New pattern_transferred event type for tracking transfer outcomes
  - Persistence via PersistentStore for surviving restarts
  - suggestRelatedDomains() for finding domains with successful transfers
  - mergeIntoGroup() for expanding existing groups
  - subscribeToRegistry() for automatic learning from ApiPatternRegistry events
  - 27 new tests covering all learning and persistence functionality
- Added LI-002: Wire feedback loops for anti-patterns
  - LearningEngine persists high-confidence anti-patterns (MIN_FAILURES_FOR_PERSISTENCE: 5)
  - Only persists permanent failure categories: auth_required, wrong_endpoint, validation_failed
  - New recordPatternFailure() method in LearningEngine for pattern confidence decay
  - Pattern confidence downgrades from high->medium->low based on failure count and severity
  - subscribeToPatternRegistry() for receiving anti_pattern_created events
  - loadPersistedAntiPatternsInto() restores anti-patterns on startup
  - wireToContentIntelligence() convenience method for full integration
  - ApiPatternRegistry.importAntiPattern() for loading persisted anti-patterns
  - 11 new tests covering persistence, expiry, registry subscription, and wiring
- Added LI-006: Semantic skill retrieval integration
  - Wire ProceduralMemory to VectorStore for consistent semantic skill retrieval
  - Add setVectorStore() and hasVectorStoreIntegration() methods for opt-in integration
  - Implement retrieveSkillsAsync() that uses VectorStore's 384-dim semantic embeddings when available
  - Skills are automatically indexed into VectorStore when added via addSkill() or addManualSkill()
  - Fall back gracefully to existing 64-dim hash-based embeddings when VectorStore is not configured
- Added LI-004: Real-world pattern validation suite
  - Live test suite (32 tests) for validating learned patterns against real sites
  - Bootstrap pattern validation: json-suffix, registry-lookup, rest-resource, firebase-rest, query-api
  - Learned pattern application testing with programmatic pattern creation
  - Cross-domain pattern transfer validation with domain group coverage
  - Pattern metrics and staleness detection infrastructure
  - End-to-end pattern application via ContentIntelligence extraction pipeline
  - Regression tracking infrastructure for monitoring pattern health over time
- Added LI-003: Add learning effectiveness metrics
  - New learning-effectiveness.ts module with comprehensive metrics
  - Tracks pattern hit rate, confidence accuracy, tier optimization, skill reuse
  - New MCP tool: get_learning_effectiveness
  - Health score (0-100) with actionable insights
- Added LI-001: Enable semantic matching by default
  - New semantic-init.ts module for zero-config auto-initialization
  - Checks for @xenova/transformers, @lancedb/lancedb, better-sqlite3 availability
  - SmartBrowser.initialize() now auto-enables semantic matching when dependencies available
  - Graceful fallback when dependencies unavailable (logs debug message, continues without semantic matching)
  - New isSemanticMatchingEnabled() and getSemanticInfrastructure() methods on SmartBrowser
  - EmbeddedStore.isAvailable() static method and createEmbeddedStore() factory function
  - 17 tests for semantic initialization
- Added CX-012: LLM Onboarding Spec documentation
  - Comprehensive trust contract (schema versioning compatibility rules)
  - Confidence framework (interpretation guide, source baselines, decision matrix)
  - Error recovery protocol (12 categories, 40+ error codes, retry decision tree)
  - Pattern lifecycle (sources, decay reasons, trust assessment)
  - Response structure reference (BrowseResult, ApiPattern, NetworkRequest)
  - Decision transparency (tier and selector trace interpretation)
  - Budget and performance controls (tier selection, latency expectations)
  - New doc: LLM_ONBOARDING_SPEC.md
- Added CX-009: Tier Parity Learning for API pattern discovery from non-Playwright tiers
  - Enhanced LightweightRenderer network tracking with request/response headers and bodies
  - Added tier-aware API analysis with confidence degradation (lightweight: -1 level, intelligence: -2 levels)
  - Wired TieredFetcher to discover APIs from lightweight tier network requests
  - ApiAnalyzer.convertLightweightRequests() for format conversion
  - ApiAnalyzer.analyzeRequestsWithTier() for tier-aware confidence adjustment
  - 23 tests for tier parity learning
- Added CX-005: Budget Knobs for LLM cost/latency control
  - New maxLatencyMs parameter: stop tier fallback when latency budget exceeded
  - New maxCostTier parameter: limit to cheaper tiers (intelligence < lightweight < playwright)
  - New freshnessRequirement parameter: control content freshness ('realtime', 'cached', 'any')
  - Budget tracking in response: latencyExceeded, tiersSkipped, maxCostTierEnforced, usedCache
  - 17 tests for budget controls in tiered-fetcher
- Added CX-011: Domain Capability Summary
  - New get_domain_capabilities MCP tool for LLM-friendly domain analysis
  - getDomainCapabilities() method on SmartBrowser
  - Boolean capability flags: canBypassBrowser, hasLearnedPatterns, hasActiveSession, hasSkills, hasPagination, hasContentSelectors
  - Confidence assessment with level (high/medium/low/unknown), score, and basis explanation
  - Performance info: preferred tier, avg response time, success rate
  - Actionable recommendations based on domain state
  - Detailed counts: patterns, skills, selectors, validators, pagination, failures
  - 19 tests for domain capability summary
- Added CX-010: Config-driven Heuristics
  - New heuristics-config.ts module for externalized domain/tier configuration
  - Domain groups (spanish_gov, us_gov, eu_gov) loaded from config instead of hardcoded
  - Tier routing rules (static domains, browser-required, content markers) externalized
  - Pattern compilation with caching for performance
  - API for runtime configuration updates (addDomainGroup, addPattern, etc.)
  - Import/export for configuration persistence
  - 52 tests for the config module
- Added V-004: Extended Features - Skill similarity, error matching, content dedup, analytics
  - New SemanticSearchExtended class for extended semantic search capabilities
  - Skill similarity search: find skills by query, action type, or domain
  - Error pattern matching: find similar errors and suggest retry strategies
  - Content deduplication: detect duplicate content and find near-duplicates
  - Content fingerprinting for quick similarity comparison
  - Analytics and reporting: embedding counts, search metrics, coverage reports
  - Similarity distribution tracking across search buckets
  - 45 new tests for extended semantic search
- Added V-003: Query Integration - Semantic pattern matching for LearningEngine
  - New SemanticPatternMatcher class for similarity-based pattern search
  - Converts URLs and content to embeddings for semantic matching
  - Integration with LearningEngine via findPatternAsync() and findSimilarPatterns()
  - Combined scoring: vector similarity (70%), pattern confidence (20%), recency (10%)
  - Graceful fallback when vector search unavailable
  - URL text extraction with ID filtering (strips numeric/UUID segments)
  - Domain-scoped and tenant-scoped search filters
  - 24 new tests for semantic pattern matcher
- Added CX-008: Memory Isolation + Shared Pool - Multi-tenant support for deployments
  - New TenantStore class that wraps EmbeddedStore with tenant-prefixed namespaces
  - Complete data isolation between tenants via namespace prefixing
  - SharedPatternPool for opt-in pattern sharing across tenants
  - MultiTenantStore for tenant lifecycle management (create, get, delete, purge)
  - Tenant configuration: sharePatterns (opt-in to contribute), consumeShared (opt-in to consume)
  - Usage tracking and attribution for shared patterns
  - Statistics: tenant counts, pattern usage, contributor/consumer metrics
  - LLM_BROWSER_TENANT_ID environment variable for default tenant
  - 64 new tests for tenant isolation, shared pool, and persistence
- Added CX-002: Field-Level Confidence Map - All smart_browse responses now include per-field confidence
  - New type definitions in `src/types/field-confidence.ts` for confidence tracking
  - ContentExtractor enhanced with `extractWithConfidence()` method
  - SmartBrowser now computes and includes `fieldConfidence` in browse results
  - Confidence scores for: title, content, tables, and discovered APIs
  - Extraction source tracking: structured_data, api_response, selector_match, heuristic, fallback
  - Helper functions: `createFieldConfidence()`, `aggregateConfidence()`, `boostForValidation()`
  - 40 new tests for field-level confidence
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
