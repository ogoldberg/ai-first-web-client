# API Documentation Discovery Plan

**Created:** 2025-12-19
**Status:** Planning
**Goal:** Automatically detect and leverage documented APIs instead of learning them through observation

**Related Documents:**
- [API_LEARNING_PLAN.md](API_LEARNING_PLAN.md) - Original learning system plan
- [BACKLOG.md](BACKLOG.md) - Task tracking

---

## Executive Summary

Currently, the system assumes APIs are undocumented and learns them through network observation. However, many APIs are **already well-documented** through various standards and conventions:

| Discovery Method | Example | Potential Impact |
|-----------------|---------|------------------|
| OpenAPI/Swagger | `/swagger.json` | 60%+ of enterprise APIs |
| GraphQL Introspection | `__schema` query | All GraphQL APIs |
| API Documentation Pages | `/docs`, `/developers` | Most public APIs |
| Link Relations | `Link` headers, `<link>` tags | RESTful APIs |
| AsyncAPI | Event-driven APIs | Microservices |
| RAML/API Blueprint | Alternative specs | Some enterprise APIs |

**Key Insight:** Checking for documentation first can save significant learning time and provide higher-quality patterns than observation-based learning.

---

## Current State (Post L-006)

### What We Have

| Feature | Status | Coverage |
|---------|--------|----------|
| OpenAPI 3.x/Swagger 2.0 Discovery | DONE | 16 probe locations |
| Pattern Generation from Specs | DONE | GET endpoints only |
| Caching | DONE | 1-hour TTL |
| Security Scheme Extraction | DONE | Bearer, API key, OAuth2 |

### What's Missing

1. **GraphQL** - No introspection support
2. **HTML Documentation** - No parsing of human-readable docs
3. **Link Discovery** - No RFC 8288 / HTML link parsing
4. **Other Spec Formats** - No RAML, API Blueprint, AsyncAPI
5. **$ref Resolution** - OpenAPI schemas not fully dereferenced
6. **POST/PUT/DELETE** - Only GET patterns generated

---

## Proposed Architecture

### Documentation Discovery Layer

```
                    ┌─────────────────────────────────────────────┐
                    │        ApiDocumentationDiscovery            │
                    │                                             │
                    │  ┌─────────────┐  ┌─────────────────────┐  │
                    │  │ Spec        │  │ Documentation       │  │
                    │  │ Discovery   │  │ Page Parser         │  │
                    │  └──────┬──────┘  └──────────┬──────────┘  │
                    │         │                    │              │
                    │  ┌──────▼────────────────────▼──────────┐  │
                    │  │         Unified Pattern Generator     │  │
                    │  └──────────────────────────────────────┘  │
                    └─────────────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────┐
        ▼                               ▼                           ▼
┌───────────────┐             ┌─────────────────┐         ┌─────────────────┐
│ OpenAPI       │             │ GraphQL         │         │ Link            │
│ Discovery     │             │ Introspection   │         │ Discovery       │
│ (existing)    │             │ (new)           │         │ (new)           │
└───────────────┘             └─────────────────┘         └─────────────────┘
```

### Discovery Priority Order

When encountering a new domain, check documentation sources in this order:

```
1. OpenAPI/Swagger Specs     (highest confidence: 0.95)
2. GraphQL Introspection     (highest confidence: 0.95)
3. API Documentation Pages   (high confidence: 0.85)
4. Link Headers/Tags         (medium confidence: 0.75)
5. AsyncAPI Specs            (high confidence: 0.90)
6. RAML/API Blueprint        (high confidence: 0.90)
7. robots.txt/sitemap hints  (low confidence: 0.50)
8. Learned Patterns          (varies by history)
9. Network Observation       (lowest: must verify)
```

---

## Implementation Phases

### Phase D-001: GraphQL Introspection
**Priority:** P1.5 | **Effort:** L (3-5 days) | **Extends:** I-012

**Goal:** Automatically discover and query GraphQL schemas

**Why GraphQL First:**
- GraphQL APIs are self-documenting by design
- Single introspection query reveals entire schema
- ~20% of modern APIs are GraphQL
- High-value targets (GitHub, Shopify, Contentful, etc.)

**Tasks:**

1. **GraphQL Endpoint Detection**
   - Probe common locations: `/graphql`, `/api/graphql`, `/v1/graphql`
   - Check for `application/graphql` content-type in responses
   - Look for GraphQL errors in response format

2. **Introspection Query**
   ```graphql
   query IntrospectionQuery {
     __schema {
       types { name kind fields { name type { name kind } } }
       queryType { name }
       mutationType { name }
       subscriptionType { name }
     }
   }
   ```

3. **Schema Analysis**
   - Extract query types and their arguments
   - Identify entity types (User, Post, Product, etc.)
   - Map relationships between types
   - Detect pagination patterns (Relay, offset, cursor)

4. **Pattern Generation**
   - Generate query templates for common operations
   - Store field selections for each type
   - Track required vs optional arguments

**Deliverables:**
- `src/core/graphql-introspection.ts` - Discovery and parsing
- Integration with `ContentIntelligence`
- 30+ tests for schema parsing

**Success Criteria:**
- Successfully introspect GitHub GraphQL API
- Generate working query patterns
- 95% schema coverage on test APIs

---

### Phase D-002: API Documentation Page Detection
**Priority:** P2 | **Effort:** L (3-5 days)

**Goal:** Find and parse human-readable API documentation

**Why This Matters:**
- Many APIs document endpoints in HTML/Markdown
- Often more complete than machine-readable specs
- Can extract examples, rate limits, auth instructions

**Common Documentation Locations:**
```
/docs, /documentation, /api-docs
/developers, /developer, /dev
/api, /api/v1, /api/v2
/reference, /api-reference
/help/api, /support/api
```

**Detection Strategies:**

1. **Link Discovery**
   - Check navigation for "API", "Developers", "Documentation"
   - Look for `<link rel="api">` or similar
   - Parse footer links common to developer portals

2. **Content Analysis**
   - Identify code blocks with API examples
   - Extract URL patterns from documentation
   - Parse request/response examples

3. **Structure Recognition**
   - Detect sidebar navigation patterns (ReadMe, Slate, Docusaurus)
   - Identify endpoint tables
   - Extract parameter descriptions

**Pattern Extraction from Docs:**
```typescript
interface DocumentedEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;                    // e.g., "/users/{id}"
  parameters: DocumentedParam[];
  exampleRequest?: string;
  exampleResponse?: string;
  description: string;
  authentication?: string;
  rateLimit?: string;
}
```

**Deliverables:**
- `src/core/docs-page-discovery.ts` - Page detection and parsing
- Support for common doc frameworks (ReadMe, Slate, Swagger UI, Redoc)
- 25+ tests

---

### Phase D-003: Link Relation Discovery
**Priority:** P2 | **Effort:** M (1-2 days)

**Goal:** Discover APIs through HTTP Link headers and HTML link elements

**RFC 8288 Web Linking:**
APIs often advertise related resources through Link headers:

```http
Link: </api/openapi.json>; rel="describedby"
Link: </api/users?page=2>; rel="next"
Link: </api>; rel="service"
```

**HTML Link Elements:**
```html
<link rel="api" href="/api/v2">
<link rel="alternate" type="application/json" href="/api/posts.json">
<link rel="describedby" href="/swagger.json">
```

**HATEOAS Discovery:**
RESTful APIs often embed links in responses:
```json
{
  "_links": {
    "self": { "href": "/users/123" },
    "posts": { "href": "/users/123/posts" },
    "api-docs": { "href": "/docs/api" }
  }
}
```

**Tasks:**
1. Parse `Link` response headers
2. Extract `<link>` elements from HTML
3. Detect HAL, JSON:API, and Siren hypermedia formats
4. Follow link relations to discover API structure

**Deliverables:**
- `src/core/link-discovery.ts` - Link parsing and following
- Integration with existing fetch pipeline
- 20+ tests

---

### Phase D-004: OpenAPI Enhancement
**Priority:** P2 | **Effort:** M (2-3 days)

**Goal:** Improve existing OpenAPI discovery

**Current Gaps:**

1. **$ref Resolution**
   - Current: Doesn't dereference `$ref` pointers
   - Enhancement: Resolve local and remote references
   ```json
   { "$ref": "#/components/schemas/User" }
   ```

2. **POST/PUT/DELETE Support**
   - Current: Only GET endpoints converted to patterns
   - Enhancement: Support mutation operations with request body schemas

3. **Rate Limit Extraction**
   - Current: Not parsed from specs
   - Enhancement: Extract `x-ratelimit-*` extensions

4. **Better YAML Parsing**
   - Current: Basic custom parser
   - Enhancement: Handle anchors, aliases, multi-line strings

5. **Response Schema Validation**
   - Current: Basic required field check
   - Enhancement: Deep schema validation

**Deliverables:**
- Enhanced `src/core/openapi-discovery.ts`
- `src/utils/json-ref-resolver.ts` - $ref resolution
- 20+ additional tests

---

### Phase D-005: AsyncAPI Discovery
**Priority:** P3 | **Effort:** M (2-3 days)

**Goal:** Discover event-driven APIs via AsyncAPI specs

**Why AsyncAPI:**
- Standard for WebSocket, MQTT, Kafka, etc.
- Growing adoption in microservices
- Similar structure to OpenAPI

**Common Locations:**
```
/asyncapi.json, /asyncapi.yaml
/docs/asyncapi, /api/asyncapi
/.well-known/asyncapi
```

**Key Features to Extract:**
- Channels (topics/queues)
- Message schemas
- Server connection details
- Security schemes

**Deliverables:**
- `src/core/asyncapi-discovery.ts`
- WebSocket endpoint patterns
- 15+ tests

---

### Phase D-006: Alternative Spec Formats
**Priority:** P3 | **Effort:** M (2-3 days)

**Goal:** Support RAML, API Blueprint, and WADL

**RAML (RESTful API Modeling Language):**
```yaml
#%RAML 1.0
title: Example API
/users:
  get:
    responses:
      200:
        body:
          application/json:
            type: User[]
```

**API Blueprint:**
```markdown
# Users [/users]
## List Users [GET]
+ Response 200 (application/json)
    + Attributes (array[User])
```

**WADL (Web Application Description Language):**
```xml
<application>
  <resources base="https://api.example.com">
    <resource path="/users">
      <method name="GET"/>
    </resource>
  </resources>
</application>
```

**Probe Locations:**
- RAML: `/api.raml`, `/docs/api.raml`
- API Blueprint: `/api.apib`, `/docs/api.md`
- WADL: `/application.wadl`, `/api/wadl`

**Deliverables:**
- `src/core/raml-discovery.ts`
- `src/core/api-blueprint-discovery.ts`
- `src/core/wadl-discovery.ts`
- 25+ tests total

---

### Phase D-007: Robots.txt & Sitemap Analysis
**Priority:** P3 | **Effort:** S (1 day)

**Goal:** Extract API hints from robots.txt and sitemap.xml

**robots.txt Analysis:**
```
# API endpoints often disallowed for crawlers
Disallow: /api/
Disallow: /v1/
Disallow: /graphql

# Or explicitly allowed
Allow: /api/public/
```

**Sitemap Analysis:**
```xml
<url>
  <loc>https://example.com/api/docs</loc>
  <changefreq>weekly</changefreq>
</url>
```

**Deliverables:**
- `src/core/robots-sitemap-discovery.ts`
- Integration with discovery pipeline
- 10+ tests

---

### Phase D-008: Unified Discovery Orchestrator
**Priority:** P1.5 | **Effort:** L (3-5 days)

**Goal:** Orchestrate all discovery methods with intelligent prioritization

**Discovery Pipeline:**
```typescript
interface DiscoveryResult {
  source: 'openapi' | 'graphql' | 'docs-page' | 'links' | 'asyncapi' | 'raml' | 'observed';
  confidence: number;
  patterns: LearnedApiPattern[];
  metadata: {
    specVersion?: string;
    rateLimit?: RateLimitInfo;
    authentication?: AuthInfo[];
    baseUrl?: string;
  };
}

class ApiDocumentationDiscovery {
  async discover(domain: string): Promise<DiscoveryResult[]> {
    // Run discoveries in parallel with priority
    const results = await Promise.allSettled([
      this.openapi.discover(domain),
      this.graphql.discover(domain),
      this.docsPage.discover(domain),
      this.links.discover(domain),
      this.asyncapi.discover(domain),
    ]);

    // Merge and deduplicate patterns
    return this.mergeResults(results);
  }
}
```

**Caching Strategy:**
- Cache discovery results per domain (1 hour default)
- Invalidate on 404/error
- Background refresh for active domains

**Deliverables:**
- `src/core/api-documentation-discovery.ts` - Unified orchestrator
- Integration with `ContentIntelligence.tryAPIDiscovery()`
- Caching and invalidation logic
- 30+ tests

---

### Phase D-009: Authentication Workflow Helper
**Priority:** P2 | **Effort:** L (3-5 days) | **Extends:** I-013

**Goal:** Guide users through API authentication setup

**Detected Auth Types:**
- API Key (header, query param, cookie)
- Bearer Token / JWT
- OAuth 2.0 (authorization code, client credentials)
- Basic Auth
- Session/Cookie based

**Workflow:**
1. Detect required authentication from spec/docs
2. Prompt user for credentials
3. Store securely in SessionManager
4. Auto-refresh tokens when expired

**Deliverables:**
- `src/core/auth-workflow.ts`
- MCP tool: `configure_api_auth`
- OAuth flow support
- 25+ tests

---

## Integration Points

### ContentIntelligence Updates

```typescript
// Updated extraction strategy order
const EXTRACTION_STRATEGIES = [
  'cache',                    // Check cache first
  'api:documented',           // NEW: Check for documented APIs
  'api:openapi',              // OpenAPI specs
  'api:graphql',              // NEW: GraphQL introspection
  'api:links',                // NEW: Link discovery
  'framework:nextjs',         // Existing framework extractors
  'framework:nuxt',
  'api:learned',              // Learned patterns
  'api:predicted',            // Heuristic prediction
  'structured:jsonld',        // Structured data
  'fallback:html',            // Raw HTML extraction
];
```

### SmartBrowser Integration

```typescript
// Add documentation discovery to browse flow
async browse(url: string, options: BrowseOptions) {
  const domain = new URL(url).hostname;

  // Check for documented APIs before rendering
  if (!options.skipDocDiscovery) {
    const docs = await this.docDiscovery.discover(domain);
    if (docs.length > 0) {
      this.patternRegistry.addPatterns(docs.flatMap(d => d.patterns));
    }
  }

  // Continue with normal browse flow...
}
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Documentation detection rate | 70% of API-having sites | Track `source` in DiscoveryResult |
| Pattern quality | 90%+ success on first call | Track pattern success rate |
| Discovery latency | <500ms average | Time documentation discovery |
| GraphQL coverage | 100% of introspectable APIs | Track introspection success |
| Auth detection | 80% of APIs requiring auth | Track auth scheme detection |

---

## Testing Strategy

### Unit Tests
- Spec parsing (OpenAPI, GraphQL, RAML, etc.)
- Pattern generation accuracy
- Link parsing

### Integration Tests
- Discovery pipeline end-to-end
- Caching behavior
- Fallback handling

### Live Tests (LIVE_TESTS=true)
```typescript
// Test against real APIs with documentation
const DOCUMENTED_APIS = [
  { url: 'https://api.github.com', expected: 'openapi' },
  { url: 'https://api.github.com/graphql', expected: 'graphql' },
  { url: 'https://petstore.swagger.io', expected: 'openapi' },
  { url: 'https://api.stripe.com', expected: 'openapi' },
];
```

---

## Implementation Order

Based on impact and dependencies:

| Order | Phase | Effort | Impact | Dependencies |
|-------|-------|--------|--------|--------------|
| 1 | D-001 GraphQL | L | High | None |
| 2 | D-008 Orchestrator | L | High | D-001 |
| 3 | D-004 OpenAPI Enhancement | M | Medium | None |
| 4 | D-003 Link Discovery | M | Medium | None |
| 5 | D-002 Docs Page Detection | L | Medium | D-003 |
| 6 | D-009 Auth Workflow | L | High | D-001, D-004 |
| 7 | D-005 AsyncAPI | M | Low | D-008 |
| 8 | D-006 Alt Spec Formats | M | Low | D-008 |
| 9 | D-007 Robots/Sitemap | S | Low | None |

**Estimated Total Effort:** 4-6 weeks

---

## Backlog Updates

Add these to BACKLOG.md under P1.5/P2:

```markdown
### API Documentation Discovery (New Initiative)

| ID | Phase | Task | Effort | Status | Notes |
|----|-------|------|--------|--------|-------|
| D-001 | 1 | GraphQL Introspection | L | | Auto-discover GraphQL schema |
| D-002 | 2 | Docs Page Detection | L | | Parse HTML API documentation |
| D-003 | 3 | Link Discovery | M | | RFC 8288 / HATEOAS |
| D-004 | 4 | OpenAPI Enhancement | M | | $ref resolution, POST support |
| D-005 | 5 | AsyncAPI Discovery | M | | Event-driven APIs |
| D-006 | 6 | Alt Spec Formats | M | | RAML, API Blueprint, WADL |
| D-007 | 7 | Robots/Sitemap Analysis | S | | Hint extraction |
| D-008 | 8 | Discovery Orchestrator | L | | Unified pipeline |
| D-009 | 9 | Auth Workflow Helper | L | | Guided authentication setup |
```

---

## Open Questions

1. **GraphQL Mutations:** Should we support write operations or stay read-only?

2. **Private APIs:** How to handle APIs that disable introspection or require auth for docs?

3. **Documentation Freshness:** How often to re-check for documentation updates?

4. **Spec Conflicts:** What if OpenAPI and GraphQL both exist? Which takes priority?

5. **Rate Limits:** Should we respect rate limit info from specs proactively?

---

## Next Steps

1. **Review this plan** - Get feedback on priorities and scope
2. **Start D-001** - GraphQL introspection is highest impact
3. **Update BACKLOG.md** - Add new tasks
4. **Create tracking issues** - One per phase
