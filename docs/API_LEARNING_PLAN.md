# API Learning System Enhancement Plan

**Created:** 2025-12-19
**Status:** Planning
**Goal:** Shift from hardcoded site-specific API handlers to a generalized learning system

**Related Documents:**
- [BACKLOG.md](BACKLOG.md) - Task IDs L-001 through L-007 track implementation
- [PROJECT_STATUS.md](PROJECT_STATUS.md) - Phase 3 roadmap section

---

## Executive Summary

We have 8 working site-specific API handlers (Reddit, HN, GitHub, Wikipedia, StackOverflow, NPM, PyPI, Dev.to) that demonstrate common patterns for API discovery and extraction. Rather than continuing to add individual handlers, we should build a **Generalized API Learning Layer** that can:

1. Learn API patterns from successful extractions
2. Apply learned patterns to new, similar sites
3. Discover and validate APIs automatically
4. Handle failures gracefully with learned fallbacks

---

## Current State

### What We Have

| Component | Purpose | Strength | Gap |
|-----------|---------|----------|-----|
| **LearningEngine** | Track API patterns with confidence | Knows endpoints exist | Doesn't learn HOW to use them |
| **ProceduralMemory** | Learn action sequences | Great at browsing skills | No API integration |
| **ContentIntelligence** | Site-specific extraction | 8 working handlers | Hardcoded, doesn't scale |
| **ApiAnalyzer** | Classify network requests | Detects API calls | Doesn't learn parameters |

### Existing Handler Patterns

Our 8 handlers demonstrate these generalizable patterns:

```
1. URL Suffix Transformation
   Reddit: url → url + ".json"

2. Path-Based Resource Lookup
   NPM: /package/{name} → registry.npmjs.org/{name}
   PyPI: /project/{name} → pypi.org/pypi/{name}/json
   Dev.to: /{user}/{slug} → api/articles/{user}/{slug}

3. Query Param APIs
   StackOverflow: ?site=stackoverflow&filter=withbody
   Dev.to: ?username={user}&per_page=10

4. Firebase-Style REST
   HackerNews: /item/{id}.json

5. Versioned REST APIs
   GitHub: api.github.com/repos/{owner}/{repo}
   Wikipedia: {lang}.wikipedia.org/api/rest_v1/page/summary/{title}
```

---

## Proposed Architecture

### New Component: ApiPatternLearner

A unified system that connects LearningEngine, ProceduralMemory, and ContentIntelligence:

```
                    ┌─────────────────────────────────┐
                    │       ApiPatternLearner         │
                    │                                 │
                    │  ┌───────────┐ ┌────────────┐  │
                    │  │ Pattern   │ │ Template   │  │
                    │  │ Detector  │ │ Generator  │  │
                    │  └─────┬─────┘ └─────┬──────┘  │
                    │        │             │         │
                    │  ┌─────▼─────────────▼─────┐   │
                    │  │    Pattern Registry     │   │
                    │  │  (learned API patterns) │   │
                    │  └─────────────────────────┘   │
                    └─────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ LearningEngine│         │ProceduralMemory │         │ContentIntelligence│
│ (confidence)  │         │ (skills)        │         │ (extraction)     │
└───────────────┘         └─────────────────┘         └─────────────────┘
```

### Core Data Structures

```typescript
// Learned API pattern - generalized from handlers
interface LearnedApiPattern {
  id: string;

  // URL matching
  urlPatterns: RegExp[];           // e.g., /pypi\.org\/project\/([^/]+)/

  // API endpoint construction
  endpointTemplate: string;        // e.g., "https://pypi.org/pypi/{package}/json"
  extractors: {                    // How to extract template variables
    [varName: string]: {
      source: 'path' | 'query' | 'subdomain';
      pattern: RegExp;
      group: number;
    };
  };

  // Request configuration
  method: 'GET' | 'POST';
  headers?: Record<string, string>;

  // Response handling
  responseFormat: 'json' | 'xml' | 'html';
  contentMapping: {                // How to extract content from response
    title: string;                 // JSONPath or selector
    description: string;
    body?: string;
    metadata?: Record<string, string>;
  };

  // Validation
  validators: {
    requiredFields: string[];      // Response must have these fields
    minContentLength: number;
  };

  // Learning metrics
  metrics: {
    successCount: number;
    failureCount: number;
    lastUsed: number;
    confidence: number;
    domains: string[];             // Domains this pattern works for
  };

  // Fallbacks
  fallbackPatterns?: string[];     // IDs of patterns to try if this fails
}

// Pattern template - abstracted from specific implementations
interface ApiPatternTemplate {
  name: string;                    // e.g., "json-suffix", "rest-v1", "registry-lookup"
  description: string;

  // How to detect this pattern type
  indicators: {
    urlPatterns?: RegExp[];
    responseIndicators?: string[]; // Fields that suggest this pattern
  };

  // How to construct endpoints from this template
  endpointStrategies: Array<{
    template: string;
    priority: number;
  }>;

  // Known sites using this pattern
  knownImplementations: string[];  // Used for training
}
```

---

## Implementation Phases

### Phase 1: Pattern Extraction (Foundation)

**Goal:** Extract patterns from existing 8 handlers into learnable templates

**Tasks:**
1. Create `ApiPatternTemplate` definitions for each pattern type:
   - `json-suffix` (Reddit pattern)
   - `registry-lookup` (NPM, PyPI pattern)
   - `rest-resource` (GitHub, Wikipedia pattern)
   - `firebase-rest` (HackerNews pattern)
   - `query-api` (StackOverflow, Dev.to pattern)

2. Build pattern detector that can identify which template fits a new site

3. Create pattern registry for storing learned patterns

**Deliverables:**
- `src/core/api-pattern-learner.ts` - Core learning component
- `src/types/api-patterns.ts` - Type definitions
- Tests validating patterns match existing handlers

### Phase 2: Learning From Success

**Goal:** When an extraction succeeds, learn the pattern

**Tasks:**
1. Hook into successful API extractions in ContentIntelligence
2. Analyze URL → API URL transformation
3. Analyze response structure (what fields exist, what we extracted)
4. Store as LearnedApiPattern with confidence scoring

**Learning triggers:**
- Successful `tryPredictedAPI` call
- Successful site-specific handler call
- Manual skill recording with API calls

**Deliverables:**
- Pattern learning on successful extractions
- Confidence scoring based on verification count
- Pattern persistence to disk

### Phase 3: Pattern Application

**Goal:** Apply learned patterns to new sites

**Tasks:**
1. Before trying hardcoded handlers, check learned patterns
2. Match URL to known pattern templates
3. Generate candidate API endpoints
4. Try endpoints in confidence order
5. Update confidence based on success/failure

**Strategy order:**
1. Exact domain match (highest confidence)
2. Similar domain pattern match
3. Template-based prediction
4. JavaScript extraction (existing)
5. Generic predictions (existing)

**Deliverables:**
- `tryLearnedPatterns()` method in ContentIntelligence
- Pattern matching and ranking logic
- Fallback chain execution

### Phase 4: Cross-Site Transfer

**Goal:** Apply patterns learned on one site to similar sites

**Tasks:**
1. Identify site similarity (same platform, same structure)
2. Transfer patterns with reduced confidence
3. Track which transfers succeed

**Similarity indicators:**
- Same technology stack (detected via framework extraction)
- Similar URL structure
- Similar response format
- Same domain group (existing LearningEngine feature)

**Deliverables:**
- Site similarity scoring
- Pattern transfer with confidence decay
- Learning from transferred pattern success/failure

### Phase 5: OpenAPI/Swagger Discovery

**Goal:** Automatically discover and use API specifications

**Tasks:**
1. Probe common OpenAPI locations:
   - `/openapi.json`, `/openapi.yaml`
   - `/swagger.json`, `/swagger.yaml`
   - `/api-docs`, `/docs/api`
   - `/.well-known/openapi.json`

2. Parse OpenAPI 3.x and Swagger 2.x specs

3. Generate patterns from spec:
   - Extract endpoints and methods
   - Extract required parameters
   - Extract response schemas

4. Store as high-confidence learned patterns

**Deliverables:**
- OpenAPI spec discovery and parsing
- Automatic pattern generation from specs
- Integration with pattern registry

### Phase 6: Failure Learning

**Goal:** Learn from failures to avoid repeating mistakes

**Tasks:**
1. Track which patterns fail for which domains
2. Learn failure conditions (rate limiting, auth required, etc.)
3. Build anti-patterns (things NOT to try)
4. Implement smart retry with backoff

**Failure categories:**
- 401/403: Needs authentication
- 429: Rate limited
- 404: Wrong endpoint structure
- 5xx: Server issues (retry later)
- Timeout: Slow API (increase timeout)
- Parse error: Wrong response format

**Deliverables:**
- Failure tracking and categorization
- Anti-pattern storage
- Smart retry strategies

---

## Using Existing Handlers as Training Data

The 8 existing handlers serve as **ground truth** for pattern learning:

```typescript
// Bootstrap learned patterns from hardcoded handlers
const BOOTSTRAP_PATTERNS: LearnedApiPattern[] = [
  {
    id: 'reddit-json-suffix',
    urlPatterns: [/reddit\.com/],
    endpointTemplate: '{url}.json',
    extractors: {},
    method: 'GET',
    responseFormat: 'json',
    contentMapping: {
      title: '$.data.children[0].data.title',
      description: '$.data.children[0].data.selftext',
    },
    validators: {
      requiredFields: ['data', 'kind'],
      minContentLength: 100,
    },
    metrics: {
      successCount: 1000,  // Bootstrapped high
      failureCount: 0,
      lastUsed: Date.now(),
      confidence: 1.0,
      domains: ['reddit.com', 'old.reddit.com'],
    },
  },
  // ... similar for other 7 handlers
];
```

**Validation approach:**
1. Generate pattern from existing handler logic
2. Test pattern against known working URLs
3. Compare output to handler output
4. Adjust pattern until match

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern coverage | 90% of API extractions use learned patterns | Track strategy used |
| New site success | 50% success rate on first visit to new sites | Track first-visit outcomes |
| Pattern reuse | Average pattern used on 5+ domains | Count domains per pattern |
| Learning speed | New pattern learned in <3 successful extractions | Track learning events |
| Fallback effectiveness | 80% recovery when primary pattern fails | Track fallback success |

---

## Migration Strategy

### Backward Compatibility

1. Keep existing handlers as fallbacks
2. Learned patterns tried BEFORE hardcoded handlers
3. Hardcoded handlers still work if learning fails
4. Gradual confidence building for learned patterns

### Deprecation Path

1. Phase 1-2: Learning runs alongside handlers
2. Phase 3: Learned patterns take priority
3. Phase 4+: Handlers become bootstrap data only
4. Eventually: Remove handler code, keep as pattern definitions

---

## Open Questions

1. **How to handle authentication?** Some APIs need keys. Learn from successful authenticated calls? Prompt user?

2. **Rate limiting strategy?** Per-domain? Per-pattern? Global?

3. **Pattern versioning?** APIs change. How to detect and update patterns?

4. **Cold start problem?** New installation has no learned patterns. Bootstrap from existing handlers + community-shared patterns?

5. **Privacy considerations?** Learned patterns may contain sensitive URL structures. How to handle sharing?

---

## Next Steps

1. Review this plan and identify priority phase
2. Create detailed design for Phase 1
3. Set up pattern registry infrastructure
4. Begin extracting patterns from existing handlers

---

## Appendix: Handler Pattern Analysis

### Reddit
- **Detection:** `reddit.com` hostname
- **Transformation:** Append `.json` to URL
- **Auth:** None required
- **Response:** Nested JSON with `data.children[]`

### HackerNews
- **Detection:** `news.ycombinator.com`
- **Transformation:** Extract item ID, call Firebase API
- **Auth:** None required
- **Response:** Flat JSON with `title`, `text`, `score`

### GitHub
- **Detection:** `github.com`
- **Transformation:** Map path to api.github.com equivalent
- **Auth:** Optional token for rate limits
- **Response:** Varies by endpoint type

### Wikipedia
- **Detection:** `*.wikipedia.org`
- **Transformation:** Extract title, call REST API
- **Auth:** None required
- **Response:** JSON with `extract`, `thumbnail`

### StackOverflow
- **Detection:** `stackoverflow.com`
- **Transformation:** Extract question ID, call SE API
- **Auth:** Optional key for limits
- **Response:** JSON with `items[]`

### NPM
- **Detection:** `npmjs.com/package/*`
- **Transformation:** Extract package name, call registry
- **Auth:** None required
- **Response:** JSON with `name`, `versions`, `dist-tags`

### PyPI
- **Detection:** `pypi.org/project/*`
- **Transformation:** Extract package name, call JSON API
- **Auth:** None required
- **Response:** JSON with `info`, `releases`

### Dev.to
- **Detection:** `dev.to/{user}/*`
- **Transformation:** Extract user/slug, call API
- **Auth:** None required
- **Response:** JSON with `title`, `body_markdown`, `user`
