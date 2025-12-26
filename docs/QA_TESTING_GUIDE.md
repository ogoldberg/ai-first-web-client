# QA & Testing Guide

Unbrowser is a powerful tool for **E2E API testing**, **content validation**, **regression testing**, and **workflow automation testing**. This guide shows how to use Unbrowser as part of your QA strategy.

## When to Use Unbrowser for QA

Unbrowser excels at testing scenarios where you need to verify **extracted content is correct** or **APIs behave as expected**, not whether UI elements behave correctly.

| Use Case | Unbrowser | Playwright Test | Why |
|----------|-----------|-----------------|-----|
| **E2E API testing** | **Best** | Manual | Auto-discovers APIs from sites, validates responses, learns patterns |
| Content extraction validation | **Best** | Good | Built-in verification engine, confidence scoring |
| Multi-site regression testing | **Best** | Limited | Cross-domain pattern transfer, learned patterns |
| API discovery & validation | **Best** | N/A | Auto-discovers APIs, validates responses |
| Workflow automation testing | **Good** | Best | Records workflows, replays with validation |
| Visual regression testing | N/A | **Best** | Unbrowser doesn't do pixel comparisons |
| Interactive UI testing | N/A | **Best** | Unbrowser focuses on extraction, not clicks |

**Bottom line**: If your tests ask "did we extract the right data?" or "does this API work correctly?", use Unbrowser. If they ask "did the button click work?", use Playwright Test.

---

## Quick Start: Content Validation Test

```typescript
import { createLLMBrowser } from 'llm-browser/sdk';

const browser = await createLLMBrowser();

// Test that a product page has required fields
const result = await browser.browse('https://shop.example.com/product/123', {
  verify: {
    mode: 'thorough',
    checks: [{
      type: 'content',
      assertion: {
        fieldExists: ['title', 'price', 'description'],
        fieldMatches: {
          price: /\$[\d,]+(\.\d{2})?/,
          title: /.{10,}/,  // At least 10 characters
        },
        minLength: 500,  // Page has substantial content
      },
      severity: 'critical',
    }],
  },
});

// Check results
console.log('Verification passed:', result.verification.passed);
console.log('Confidence:', result.verification.confidence);

if (!result.verification.passed) {
  console.log('Failed checks:', result.verification.checks.filter(c => !c.passed));
}

await browser.cleanup();
```

---

## E2E API Testing (Top Use Case)

Unbrowser's **killer feature for QA** is automatic API discovery and testing. Traditional E2E API testing requires:

1. Knowing all the endpoints
2. Writing tests for each endpoint
3. Maintaining tests when APIs change

Unbrowser automates all of this.

### Automatic API Discovery & Testing

```typescript
import { createLLMBrowser } from 'llm-browser/sdk';

const browser = await createLLMBrowser();

// Step 1: Discover APIs by browsing the site
const discovery = await browser.browse('https://api.example.com', {
  includeNetwork: true,
  includeInsights: true,
});

console.log('Discovered APIs:', discovery.discoveredApis.length);

// Step 2: Automatically test each discovered endpoint
const testResults = [];

for (const api of discovery.discoveredApis) {
  const result = await browser.executeApiCall({
    url: api.url,
    method: api.method,
    headers: api.headers,
  });

  testResults.push({
    endpoint: `${api.method} ${api.url}`,
    status: result.status,
    hasData: !!result.data,
    responseTime: result.duration,
    passed: result.status >= 200 && result.status < 300,
  });
}

// Report results
const passed = testResults.filter(t => t.passed).length;
console.log(`API Tests: ${passed}/${testResults.length} passed`);

for (const test of testResults) {
  console.log(`  ${test.passed ? 'PASS' : 'FAIL'} ${test.endpoint} (${test.responseTime}ms)`);
}

await browser.cleanup();
```

### Test APIs You Didn't Know Existed

Unbrowser discovers APIs that aren't documented. This is great for:

- **Finding undocumented endpoints** that still need testing
- **Discovering internal APIs** used by the frontend
- **Detecting API changes** when the docs don't get updated

```typescript
// Browse the frontend to discover all APIs it uses
const result = await browser.browse('https://app.example.com/dashboard', {
  includeNetwork: true,
  scrollToLoad: true,  // Trigger lazy-loaded content
});

// These are the APIs the frontend actually calls
console.log('APIs used by dashboard:');
for (const api of result.discoveredApis) {
  console.log(`  ${api.method} ${api.url}`);
  console.log(`    Pattern: ${api.templateType}`);
  console.log(`    Auth required: ${api.authRequired || 'unknown'}`);
}
```

### GraphQL API Testing

Unbrowser can discover GraphQL endpoints. The `discoveredApis` array will include GraphQL endpoints with their patterns:

```typescript
const result = await browser.browse('https://api.example.com/graphql', {
  includeNetwork: true,
});

// Check for GraphQL in discovered APIs
const graphqlApis = result.discoveredApis.filter(api =>
  api.url.includes('/graphql') || api.templateType === 'graphql'
);

if (graphqlApis.length > 0) {
  console.log('GraphQL endpoints found:', graphqlApis.length);

  // Test the GraphQL endpoint with introspection
  const introspectionResult = await browser.executeApiCall({
    url: graphqlApis[0].url,
    method: 'POST',
    body: {
      query: '{ __schema { types { name } } }'
    },
  });

  if (introspectionResult.status === 200 && introspectionResult.data?.__schema) {
    console.log('GraphQL introspection successful');
    console.log('Types:', introspectionResult.data.__schema.types.length);
  }
}
```

> **Note**: Full GraphQL schema exposure in `result.graphql` is coming soon. For now, use the `discoveredApis` array to find GraphQL endpoints.

### OpenAPI/Swagger Validation

Unbrowser can discover OpenAPI specs. Use the API discovery orchestrator for comprehensive spec detection:

```typescript
// Check for OpenAPI in discovered APIs
const result = await browser.browse('https://api.example.com', {
  includeNetwork: true,
});

// Look for OpenAPI spec URLs in discovered APIs
const specUrls = result.discoveredApis.filter(api =>
  api.url.includes('openapi') ||
  api.url.includes('swagger') ||
  api.url.endsWith('.json') ||
  api.url.endsWith('.yaml')
);

if (specUrls.length > 0) {
  console.log('Potential OpenAPI specs found:', specUrls.map(s => s.url));

  // Fetch and parse the spec
  const specResult = await browser.executeApiCall({
    url: specUrls[0].url,
    method: 'GET',
  });

  if (specResult.data?.openapi || specResult.data?.swagger) {
    console.log('OpenAPI spec version:', specResult.data.openapi || specResult.data.swagger);
    console.log('Title:', specResult.data.info?.title);
    console.log('Endpoints:', Object.keys(specResult.data.paths || {}).length);
  }
}
```

> **Note**: OpenAPI spec parsing is handled internally. The `discoveredApis` array includes endpoints found via OpenAPI discovery.

### API Regression Testing

Unbrowser learns API patterns and detects when they change:

```typescript
// First run: Learn the APIs
await browser.browse('https://api.example.com/v1/products', {
  includeNetwork: true,
});

// Later runs: Detect changes
const result = await browser.browse('https://api.example.com/v1/products', {
  checkForChanges: true,
  includeNetwork: true,
});

if (result.apiChanges) {
  console.log('API changes detected!');
  for (const change of result.apiChanges) {
    console.log(`  ${change.type}: ${change.endpoint}`);
    console.log(`    Was: ${JSON.stringify(change.previous)}`);
    console.log(`    Now: ${JSON.stringify(change.current)}`);
  }
}
```

### Multi-Environment API Testing

Test APIs across environments:

```typescript
const environments = {
  dev: 'https://dev-api.example.com',
  staging: 'https://staging-api.example.com',
  prod: 'https://api.example.com',
};

const results = {};

for (const [env, baseUrl] of Object.entries(environments)) {
  // Discover APIs in this environment
  const discovery = await browser.browse(baseUrl, {
    includeNetwork: true,
  });

  results[env] = {
    apiCount: discovery.discoveredApis.length,
    endpoints: discovery.discoveredApis.map(a => a.url),
  };
}

// Compare environments
console.log('API count by environment:');
for (const [env, data] of Object.entries(results)) {
  console.log(`  ${env}: ${data.apiCount} endpoints`);
}

// Find missing endpoints
const prodEndpoints = new Set(results.prod.endpoints);
const stagingEndpoints = new Set(results.staging.endpoints);

const missingInStaging = [...prodEndpoints].filter(e => !stagingEndpoints.has(e));
if (missingInStaging.length > 0) {
  console.log('Endpoints in prod but not staging:', missingInStaging);
}
```

### API Performance Baselines

Track API performance over time:

```typescript
const endpoints = [
  'https://api.example.com/v1/users',
  'https://api.example.com/v1/products',
  'https://api.example.com/v1/orders',
];

const perfResults = [];

for (const url of endpoints) {
  const result = await browser.executeApiCall({ url, method: 'GET' });

  perfResults.push({
    endpoint: url,
    responseTime: result.duration,
    status: result.status,
  });
}

// Check against baselines
const baselines = { '/v1/users': 200, '/v1/products': 150, '/v1/orders': 300 };

for (const perf of perfResults) {
  const path = new URL(perf.endpoint).pathname;
  const baseline = baselines[path];

  if (perf.responseTime > baseline * 1.5) {
    console.warn(`SLOW: ${path} took ${perf.responseTime}ms (baseline: ${baseline}ms)`);
  }
}
```

---

## Verification Engine

Unbrowser includes a built-in verification engine (`src/core/verification-engine.ts`) with three modes:

### Verification Modes

| Mode | What It Checks | Use Case |
|------|---------------|----------|
| `basic` | HTTP 200, minimum content length | Smoke tests |
| `standard` | Basic + error detection, missing fields | Regular tests |
| `thorough` | Standard + confidence scoring, all assertions | Critical paths |

### Assertion Types

#### Field Assertions

```typescript
{
  type: 'content',
  assertion: {
    // Field presence
    fieldExists: ['title', 'price', 'sku'],
    fieldNotEmpty: ['title', 'description'],

    // Pattern matching
    fieldMatches: {
      price: /\$\d+/,
      sku: /^SKU-\d{6}$/,
      email: /^[\w.]+@[\w.]+$/,
    },

    // Content constraints
    minLength: 100,
    maxLength: 50000,
    containsText: ['Add to Cart', 'In Stock'],
    excludesText: ['Error', '404', 'Not Found'],
  },
  severity: 'error',  // 'warning', 'error', 'critical'
  retryable: true,    // Retry on failure
}
```

#### Status Code Assertions

```typescript
{
  type: 'action',
  assertion: {
    statusCode: 200,  // or [200, 201, 204]
  },
  severity: 'critical',
}
```

#### Cross-URL Verification

```typescript
{
  type: 'state',
  assertion: {
    // Browse another URL to verify state
    checkUrl: {
      url: 'https://api.example.com/product/123',
      fieldExists: ['id', 'title'],
    },
    // Or call an API directly
    checkApi: {
      url: 'https://api.example.com/stock/123',
      method: 'GET',
      fieldMatches: {
        quantity: /^\d+$/,
      },
    },
  },
}
```

#### Custom Validators

```typescript
{
  type: 'content',
  assertion: {
    customValidator: async (content) => {
      const price = parseFloat(content.match(/\$(\d+)/)?.[1] || '0');
      return price > 0 && price < 10000;
    },
  },
}
```

---

## Regression Testing with Confidence Scores

Unbrowser provides **field-level confidence scores** that help you understand extraction reliability:

```typescript
const result = await browser.browse(url);

// Overall confidence
console.log('Overall confidence:', result.confidence.overall);

// Per-field confidence
console.log('Markdown confidence:', result.confidence.content.markdown);
console.log('Tables confidence:', result.confidence.content.tables);
console.log('API discovery confidence:', result.confidence.api?.discoveredEndpoints);
```

### Confidence Sources

| Source | Baseline Confidence | Notes |
|--------|-------------------|-------|
| Playwright (full browser) | 0.95 | Most reliable |
| Lightweight (linkedom) | 0.80 | Good for static sites |
| Intelligence (fetch) | 0.70 | Fast but limited |
| Learned patterns | 0.85-0.95 | Depends on pattern age |

### Using Confidence in Tests

```typescript
const result = await browser.browse(url);

// Assert high confidence
expect(result.confidence.overall).toBeGreaterThan(0.9);

// Different thresholds for different data
expect(result.confidence.content.markdown).toBeGreaterThan(0.8);
expect(result.confidence.content.tables).toBeGreaterThan(0.95);
```

---

## Workflow Testing

Unbrowser can record and replay workflows, making it useful for testing multi-step processes.

### Recording a Workflow

```typescript
import { WorkflowRecorder } from 'llm-browser/sdk';

const recorder = new WorkflowRecorder(browser);

// Start recording
const recordingId = await recorder.startRecording({
  name: 'Product Search Flow',
  domain: 'shop.example.com',
});

// Perform actions (these get recorded)
await browser.browse('https://shop.example.com');
await browser.browse('https://shop.example.com/search?q=laptop');
await browser.browse('https://shop.example.com/product/123');

// Stop and save
const workflow = await recorder.stopRecording(recordingId);
console.log('Workflow saved:', workflow.id);
```

### Replaying with Validation

```typescript
// Replay the workflow with different parameters
const result = await browser.replayWorkflow(workflow.id, {
  params: { searchQuery: 'tablet' },
  verify: {
    mode: 'standard',
    checks: [{
      type: 'content',
      assertion: { fieldExists: ['title', 'price'] },
    }],
  },
});

console.log('Workflow replay:', result.success);
console.log('All steps passed:', result.stepsCompleted);
```

### Workflow Versioning

Workflows are stored with versioning support in ProceduralMemory:

```typescript
// List all workflows
const workflows = await browser.listWorkflows();

// Get workflow details
const workflow = await browser.getWorkflow(workflowId);
console.log('Workflow:', workflow.name);
console.log('Steps:', workflow.steps.length);

// Delete a workflow
await browser.deleteWorkflow(workflowId);
```

> **Coming Soon**: Workflow version comparison and rollback methods (`getWorkflowVersions`, `rollbackWorkflow`, `compareWorkflowVersions`) are planned for future releases.

---

## Multi-Domain Testing

Unbrowser's learning system enables testing patterns across similar sites:

```typescript
// Test the same extraction pattern across multiple sites
const ecommerceSites = [
  'https://shop1.example.com/product/123',
  'https://shop2.example.com/item/456',
  'https://shop3.example.com/p/789',
];

const results = await browser.batchBrowse(ecommerceSites, {
  concurrency: 2,
  verify: {
    mode: 'standard',
    checks: [{
      type: 'content',
      assertion: {
        fieldExists: ['title', 'price'],
        fieldMatches: { price: /[\$\u20AC\u00A3][\d,]+/ },
      },
    }],
  },
});

// Analyze results
for (const r of results.results) {
  console.log(`${r.url}: ${r.result?.verification?.passed ? 'PASS' : 'FAIL'}`);
}
```

### Domain Group Testing

Unbrowser automatically detects similar domains and transfers learned patterns:

```typescript
// Patterns learned from reddit.com apply to similar sites
const result = await browser.browse('https://old.reddit.com/r/programming');

// Check if patterns were transferred
console.log('Pattern source:', result.decisionTrace.patternSource);
console.log('Cross-domain transfer:', result.decisionTrace.crossDomainTransfer);
```

---

## API Validation Testing

Test discovered APIs and their responses:

```typescript
// Discover APIs
const browseResult = await browser.browse('https://api.example.com/docs', {
  includeNetwork: true,
});

// Validate discovered endpoints
for (const api of browseResult.discoveredApis) {
  const apiResult = await browser.executeApiCall({
    url: api.url,
    method: api.method,
    headers: api.headers,
  });

  // Verify API response
  expect(apiResult.status).toBe(200);
  expect(apiResult.data).toBeDefined();

  console.log(`API ${api.url}: ${apiResult.status}`);
}
```

### GraphQL Schema Validation

```typescript
// Unbrowser auto-discovers GraphQL endpoints
const result = await browser.browse('https://api.example.com/graphql', {
  includeInsights: true,
});

// Check discovered schema
if (result.graphql) {
  console.log('Types discovered:', result.graphql.types.length);
  console.log('Queries:', result.graphql.queries);
  console.log('Mutations:', result.graphql.mutations);
}
```

---

## Content Change Detection

Monitor sites for unexpected changes:

```typescript
// First visit establishes baseline
await browser.browse('https://example.com/pricing', {
  checkForChanges: true,
});

// Later visits detect changes
const result = await browser.browse('https://example.com/pricing', {
  checkForChanges: true,
});

if (result.contentChanged) {
  console.log('Content changed!');
  console.log('Change summary:', result.changeDetails.summary);
  console.log('Changed fields:', result.changeDetails.fields);
}
```

### Scheduled Monitoring

```typescript
// Set up monitoring with webhooks
await browser.configureMonitoring({
  url: 'https://example.com/pricing',
  interval: '1h',
  webhook: 'https://your-server.com/webhook',
  notify: {
    onContentChange: true,
    onError: true,
    onConfidenceDropped: 0.7,  // Alert if confidence drops below 70%
  },
});
```

---

## Integration with Test Frameworks

### With Vitest

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLLMBrowser, type LLMBrowserClient } from 'llm-browser/sdk';

describe('Product Page Tests', () => {
  let browser: LLMBrowserClient;

  beforeAll(async () => {
    browser = await createLLMBrowser();
  });

  afterAll(async () => {
    await browser.cleanup();
  });

  it('should extract product details correctly', async () => {
    const result = await browser.browse('https://shop.example.com/product/123', {
      verify: {
        mode: 'standard',
        checks: [{
          type: 'content',
          assertion: {
            fieldExists: ['title', 'price', 'description'],
            fieldMatches: { price: /\$\d+/ },
          },
        }],
      },
    });

    expect(result.verification.passed).toBe(true);
    expect(result.confidence.overall).toBeGreaterThan(0.8);
  });

  it('should detect content changes', async () => {
    const result = await browser.browse('https://shop.example.com/pricing', {
      checkForChanges: true,
    });

    // Alert if critical content changed
    if (result.contentChanged) {
      console.warn('Pricing page changed:', result.changeDetails);
    }

    expect(result.success).toBe(true);
  });
});
```

### With Jest

```typescript
import { createLLMBrowser } from 'llm-browser/sdk';

describe('API Discovery Tests', () => {
  let browser;

  beforeAll(async () => {
    browser = await createLLMBrowser();
  });

  afterAll(async () => {
    await browser.cleanup();
  });

  test('discovers expected API endpoints', async () => {
    const result = await browser.browse('https://api.example.com', {
      includeNetwork: true,
    });

    expect(result.discoveredApis).toBeDefined();
    expect(result.discoveredApis.length).toBeGreaterThan(0);

    const endpoints = result.discoveredApis.map(a => a.url);
    expect(endpoints).toContain('/api/v1/users');
    expect(endpoints).toContain('/api/v1/products');
  });
});
```

---

## Debugging Test Failures

### Decision Traces

```typescript
const result = await browser.browse(url, {
  includeDecisionTrace: true,
});

if (!result.verification.passed) {
  console.log('Tier attempts:', result.decisionTrace.tierAttempts);
  console.log('Selectors tried:', result.decisionTrace.selectorAttempts);
  console.log('Validators applied:', result.decisionTrace.validators);
  console.log('Fallback chain:', result.decisionTrace.fallbacks);
}
```

### Visual Debugging

```typescript
// Enable visual debugging for failing tests
const result = await browser.browse(url, {
  debug: {
    visible: true,           // Show browser window
    slowMotion: 150,         // Slow down for visibility
    screenshots: true,       // Capture screenshots
    consoleLogs: true,       // Capture console
  },
});

// Access debug data
console.log('Screenshots:', result.debug.screenshots.length);
console.log('Console logs:', result.debug.consoleLogs);
```

### HAR Export

```typescript
// Export network traffic for analysis
const harResult = await browser.exportHar(url, {
  includeResponseBodies: true,
});

// Save for external analysis
fs.writeFileSync('debug.har', JSON.stringify(harResult.har, null, 2));
```

---

## Test Reporters for CI/CD

Unbrowser includes test reporters that output results in standard formats for CI/CD pipelines.

### JUnit XML Output

```typescript
import { createLLMBrowser } from 'llm-browser/sdk';
import { JUnitReporter, generateTestReport } from 'llm-browser/testing';

const browser = await createLLMBrowser();
const tests = [];

// Run your tests
for (const url of urls) {
  const startTime = Date.now();
  try {
    const result = await browser.browse(url, {
      verify: { mode: 'standard' }
    });
    tests.push(JUnitReporter.createTestCase(
      `Test ${url}`,
      url,
      result.verification,
      Date.now() - startTime
    ));
  } catch (error) {
    tests.push(JUnitReporter.createTestCase(
      `Test ${url}`,
      url,
      undefined,
      Date.now() - startTime,
      error.message
    ));
  }
}

// Generate JUnit XML
const suite = JUnitReporter.createSuite('API Tests', tests);
const xml = generateTestReport(suite, 'junit');

// Write to file for CI/CD
fs.writeFileSync('test-results.xml', xml);
```

### Available Formats

| Format | Function | Use Case |
|--------|----------|----------|
| `junit` | `generateTestReport(suite, 'junit')` | GitHub Actions, Jenkins, GitLab CI |
| `tap` | `generateTestReport(suite, 'tap')` | TAP consumers, simple parsers |
| `json` | `generateTestReport(suite, 'json')` | Custom processing, dashboards |
| `console` | `generateTestReport(suite, 'console')` | Human-readable output |

### GitHub Actions Integration

```yaml
# .github/workflows/api-tests.yml
- name: Run API Tests
  run: node test-apis.js

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: test-results.xml

- name: Publish Test Results
  uses: EnricoMi/publish-unit-test-result-action@v2
  if: always()
  with:
    files: test-results.xml
```

---

## Best Practices

### 1. Use Appropriate Verification Modes

- **Smoke tests**: Use `basic` mode (fast, checks HTTP 200)
- **Regular tests**: Use `standard` mode (balanced)
- **Critical paths**: Use `thorough` mode (comprehensive)

### 2. Set Meaningful Confidence Thresholds

```typescript
// Production-critical data needs high confidence
if (result.confidence.overall < 0.95) {
  console.warn('Low confidence extraction - consider manual review');
}
```

### 3. Test Pattern Stability

```typescript
// Track pattern age and staleness
const stats = await browser.getPatternStats(domain);
console.log('Pattern age:', stats.daysSinceVerified);
console.log('Success rate:', stats.successRate);

if (stats.daysSinceVerified > 7) {
  console.warn('Patterns may be stale - consider re-verification');
}
```

### 4. Use Learned Verification Patterns

```typescript
// The verification engine learns from success/failure
// High-value patterns are automatically prioritized
const result = await browser.browse(url, {
  verify: {
    mode: 'thorough',
    useLearnedPatterns: true,  // Apply learned verifications
  },
});
```

### 5. Handle Rate Limits Gracefully

```typescript
const results = await browser.batchBrowse(urls, {
  concurrency: 2,           // Don't overwhelm target
  delayBetweenRequests: 500,  // Be polite
  respectRobotsTxt: true,
});
```

---

## Comparison: Unbrowser vs Playwright Test

| Feature | Unbrowser | Playwright Test |
|---------|-----------|-----------------|
| **Content assertion** | `fieldExists`, `fieldMatches`, `minLength` | Manual parsing + expect() |
| **Confidence scoring** | Built-in (0-1 per field) | N/A |
| **Multi-site patterns** | Auto-transfers across domains | Per-site setup |
| **API discovery** | Automatic | Manual |
| **Workflow recording** | Built-in with versioning | Codegen (one-time) |
| **Visual testing** | N/A | Built-in snapshots |
| **Interactive testing** | Limited | Full support |
| **Cross-browser** | Chromium only | Chromium, Firefox, WebKit |
| **Speed** | 50ms-5s (tiered) | 2-5s (always full browser) |

---

## When NOT to Use Unbrowser for QA

- **Visual regression testing** - Use Playwright's screenshot comparison
- **Interactive UI flows** - Use Playwright's locators and actions
- **Mobile testing** - Use Playwright's device emulation
- **Accessibility testing** - Use dedicated a11y tools
- **Performance testing** - Use Lighthouse or WebPageTest
- **Cross-browser testing** - Use Playwright with multiple browsers

---

## Next Steps

- [Verification Engine API](./api/verification-engine.md) - Full API reference
- [Workflow Recording](./api/workflow-recorder.md) - Recording and replay guide
- [Decision Traces](./api/decision-trace.md) - Debugging guide
- [LLM Onboarding Spec](./LLM_ONBOARDING_SPEC.md) - Client integration
