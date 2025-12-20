/**
 * Tests for docs-page-discovery.ts (D-002)
 *
 * Tests HTML API documentation parsing, framework detection,
 * endpoint extraction, and pattern generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectDocFramework,
  extractNavigationLinks,
  extractEndpointsFromTables,
  extractEndpointsFromCodeBlocks,
  extractEndpointsFromHeadings,
  extractApiBaseUrl,
  extractAuthInstructions,
  parseDocsPage,
  discoverDocs,
  generatePatternsFromDocs,
  DOCS_PROBE_LOCATIONS,
  type DocsDiscoveryResult,
  type DocFramework,
} from '../../src/core/docs-page-discovery.js';

// ============================================
// FRAMEWORK DETECTION TESTS
// ============================================

describe('detectDocFramework', () => {
  it('should detect Swagger UI', () => {
    const html = '<div class="swagger-ui"><div class="swagger-container"></div></div>';
    expect(detectDocFramework(html)).toBe('swagger-ui');
  });

  it('should detect Swagger UI with swagger-section', () => {
    const html = '<section class="swagger-section">API Docs</section>';
    expect(detectDocFramework(html)).toBe('swagger-ui');
  });

  it('should detect Redoc', () => {
    const html = '<div id="redoc"><div class="redoc-wrap menu-content"></div></div>';
    expect(detectDocFramework(html)).toBe('redoc');
  });

  it('should detect ReadMe', () => {
    const html = '<div class="readme-docs rdmd">Documentation</div>';
    expect(detectDocFramework(html)).toBe('readme');
  });

  it('should detect ReadMe with readme.io reference', () => {
    // The detection looks for "readme.io" string in the HTML
    const html = '<script src="https://readme.io/widget.js"></script>';
    expect(detectDocFramework(html)).toBe('readme');
  });

  it('should detect ReadMe with Next.js data', () => {
    const html = '<script id="__NEXT_DATA__">{"readme": true}</script>';
    expect(detectDocFramework(html)).toBe('readme');
  });

  it('should detect Slate', () => {
    const html = '<div class="slate"><nav class="tocify">TOC</nav><div class="content"></div></div>';
    expect(detectDocFramework(html)).toBe('slate');
  });

  it('should detect Docusaurus', () => {
    const html = '<div data-docusaurus><div class="docsearch"></div></div>';
    expect(detectDocFramework(html)).toBe('docusaurus');
  });

  it('should detect Docusaurus with context', () => {
    const html = '<script>const docusaurusContext = {};</script>';
    expect(detectDocFramework(html)).toBe('docusaurus');
  });

  it('should detect GitBook', () => {
    const html = '<div class="gitbook gb-root">Documentation</div>';
    expect(detectDocFramework(html)).toBe('gitbook');
  });

  it('should detect GitBook with GitBookPress', () => {
    const html = '<script>window.GitBookPress = {};</script>';
    expect(detectDocFramework(html)).toBe('gitbook');
  });

  it('should detect Mintlify', () => {
    const html = '<div class="mintlify">Docs</div>';
    expect(detectDocFramework(html)).toBe('mintlify');
  });

  it('should detect Mintlify with __MINTLIFY', () => {
    const html = '<script id="__MINTLIFY">config</script>';
    expect(detectDocFramework(html)).toBe('mintlify');
  });

  it('should detect Stoplight', () => {
    const html = '<div class="stoplight sl-container">API Reference</div>';
    expect(detectDocFramework(html)).toBe('stoplight');
  });

  it('should return unknown for unrecognized frameworks', () => {
    const html = '<html><body><h1>API Docs</h1></body></html>';
    expect(detectDocFramework(html)).toBe('unknown');
  });

  it('should be case-insensitive', () => {
    const html = '<div class="SWAGGER-UI">Docs</div>';
    expect(detectDocFramework(html)).toBe('swagger-ui');
  });
});

// ============================================
// NAVIGATION LINK EXTRACTION TESTS
// ============================================

describe('extractNavigationLinks', () => {
  const baseUrl = 'https://example.com';

  it('should extract API-related links from nav elements', () => {
    const html = `
      <nav>
        <a href="/api">API Reference</a>
        <a href="/docs">Documentation</a>
        <a href="/about">About Us</a>
      </nav>
    `;
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/api');
    expect(links).toContain('https://example.com/docs');
    expect(links).not.toContain('https://example.com/about');
  });

  it('should extract links from header elements', () => {
    const html = `
      <header>
        <a href="/developers">Developers</a>
      </header>
    `;
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/developers');
  });

  it('should extract links from aside elements', () => {
    const html = `
      <aside>
        <a href="/reference">Reference Guide</a>
      </aside>
    `;
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/reference');
  });

  it('should extract links from footer', () => {
    const html = `
      <footer>
        <a href="/developer-resources">Developer Resources</a>
      </footer>
    `;
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/developer-resources');
  });

  it('should extract links from div with nav-related classes', () => {
    const html = `
      <div class="main-navigation">
        <a href="/api-docs">API Docs</a>
      </div>
    `;
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/api-docs');
  });

  it('should handle absolute URLs', () => {
    const html = `
      <nav>
        <a href="https://api.example.com/docs">API Docs</a>
      </nav>
    `;
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://api.example.com/docs');
  });

  it('should deduplicate links', () => {
    const html = `
      <nav><a href="/api">API</a></nav>
      <footer><a href="/api">API Reference</a></footer>
    `;
    const links = extractNavigationLinks(html, baseUrl);
    const apiLinks = links.filter(l => l.includes('/api'));
    expect(apiLinks).toHaveLength(1);
  });

  it('should match REST API text', () => {
    const html = '<nav><a href="/rest">REST API Guide</a></nav>';
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/rest');
  });

  it('should match GraphQL text', () => {
    const html = '<nav><a href="/graphql">GraphQL Endpoint</a></nav>';
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/graphql');
  });

  it('should match integrations text', () => {
    const html = '<nav><a href="/connect">Integrations</a></nav>';
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toContain('https://example.com/connect');
  });

  it('should return empty array for no matching links', () => {
    const html = '<nav><a href="/about">About</a><a href="/contact">Contact</a></nav>';
    const links = extractNavigationLinks(html, baseUrl);
    expect(links).toHaveLength(0);
  });
});

// ============================================
// TABLE ENDPOINT EXTRACTION TESTS
// ============================================

describe('extractEndpointsFromTables', () => {
  it('should extract endpoints from a basic table', () => {
    const html = `
      <table>
        <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
        <tr><td>GET</td><td>/api/users</td><td>Get all users</td></tr>
        <tr><td>POST</td><td>/api/users</td><td>Create a new user</td></tr>
      </table>
    `;
    const endpoints = extractEndpointsFromTables(html);
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({
      method: 'GET',
      path: '/api/users',
      source: 'table',
    });
    expect(endpoints[1]).toMatchObject({
      method: 'POST',
      path: '/api/users',
      source: 'table',
    });
  });

  it('should extract path parameters', () => {
    const html = `
      <table>
        <tr><th>Endpoint</th><th>Method</th></tr>
        <tr><td>/api/users/{id}</td><td>GET</td></tr>
      </table>
    `;
    const endpoints = extractEndpointsFromTables(html);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].parameters).toHaveLength(1);
    expect(endpoints[0].parameters[0]).toMatchObject({
      name: 'id',
      location: 'path',
      required: true,
    });
  });

  it('should extract colon-style path parameters', () => {
    const html = `
      <table>
        <tr><th>URL</th><th>Method</th></tr>
        <tr><td>/api/users/:userId/posts/:postId</td><td>GET</td></tr>
      </table>
    `;
    const endpoints = extractEndpointsFromTables(html);
    expect(endpoints[0].parameters).toHaveLength(2);
    expect(endpoints[0].parameters.map(p => p.name)).toEqual(['userId', 'postId']);
  });

  it('should skip non-endpoint tables', () => {
    const html = `
      <table>
        <tr><th>Name</th><th>Price</th></tr>
        <tr><td>Widget</td><td>$10</td></tr>
      </table>
    `;
    const endpoints = extractEndpointsFromTables(html);
    expect(endpoints).toHaveLength(0);
  });

  it('should handle tables with path column header', () => {
    const html = `
      <table>
        <tr><th>Path</th><th>Method</th></tr>
        <tr><td>/api/orders</td><td>GET</td></tr>
      </table>
    `;
    const endpoints = extractEndpointsFromTables(html);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe('/api/orders');
  });

  it('should extract descriptions from longer cells', () => {
    const html = `
      <table>
        <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
        <tr>
          <td>DELETE</td>
          <td>/api/users/{id}</td>
          <td>Deletes a user by their unique identifier from the system</td>
        </tr>
      </table>
    `;
    const endpoints = extractEndpointsFromTables(html);
    expect(endpoints[0].description).toContain('Deletes a user');
  });

  it('should set confidence score for table extraction', () => {
    const html = `
      <table>
        <tr><th>Method</th><th>Endpoint</th></tr>
        <tr><td>GET</td><td>/api/test</td></tr>
      </table>
    `;
    const endpoints = extractEndpointsFromTables(html);
    expect(endpoints[0].confidence).toBe(0.85);
  });
});

// ============================================
// CODE BLOCK ENDPOINT EXTRACTION TESTS
// ============================================

describe('extractEndpointsFromCodeBlocks', () => {
  it('should extract endpoints from curl examples', () => {
    const html = `
      <pre><code>curl -X GET "https://api.example.com/users"</code></pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toMatchObject({
      method: 'GET',
      path: '/users',
      source: 'code-block',
    });
  });

  it('should extract POST from curl -X POST', () => {
    const html = `
      <pre><code>curl -X POST https://api.example.com/users -d '{"name": "test"}'</code></pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints[0].method).toBe('POST');
  });

  it('should default to GET for curl without method', () => {
    const html = `
      <pre><code>curl "https://api.example.com/status"</code></pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints[0].method).toBe('GET');
  });

  it('should extract endpoints from HTTP examples', () => {
    const html = `
      <pre>
        GET /api/products HTTP/1.1
        Host: api.example.com
      </pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toMatchObject({
      method: 'GET',
      path: '/api/products',
    });
  });

  it('should strip query strings from HTTP examples', () => {
    const html = `
      <pre>GET /api/search?q=test HTTP/1.1</pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints[0].path).toBe('/api/search');
  });

  it('should extract endpoints from fetch calls', () => {
    const html = `
      <pre><code class="language-javascript">
        fetch("/api/data")
          .then(response => response.json());
      </code></pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].path).toBe('/api/data');
  });

  it('should extract endpoints from axios calls', () => {
    const html = `
      <pre><code class="hljs-javascript">
        axios.post("/api/submit", data);
      </code></pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints[0].method).toBe('POST');
    expect(endpoints[0].path).toBe('/api/submit');
  });

  it('should deduplicate endpoints from multiple code blocks', () => {
    const html = `
      <pre><code>curl -X GET https://api.example.com/users</code></pre>
      <pre>GET /users HTTP/1.1</pre>
    `;
    const endpoints = extractEndpointsFromCodeBlocks(html);
    const userEndpoints = endpoints.filter(e => e.path === '/users');
    expect(userEndpoints).toHaveLength(1);
  });

  it('should set confidence for code block extraction', () => {
    const html = '<pre><code>curl https://api.example.com/test</code></pre>';
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints[0].confidence).toBe(0.75);
  });

  it('should include example request in extraction', () => {
    const html = '<pre><code>curl -X POST https://api.example.com/data -H "Content-Type: application/json"</code></pre>';
    const endpoints = extractEndpointsFromCodeBlocks(html);
    expect(endpoints[0].exampleRequest).toContain('curl');
  });
});

// ============================================
// HEADING ENDPOINT EXTRACTION TESTS
// ============================================

describe('extractEndpointsFromHeadings', () => {
  it('should extract endpoints from h2 headings', () => {
    const html = '<h2>GET /api/users</h2>';
    const endpoints = extractEndpointsFromHeadings(html);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toMatchObject({
      method: 'GET',
      path: '/api/users',
      source: 'heading',
    });
  });

  it('should extract endpoints from h3 headings', () => {
    const html = '<h3>POST /api/orders/{orderId}/items</h3>';
    const endpoints = extractEndpointsFromHeadings(html);
    expect(endpoints[0]).toMatchObject({
      method: 'POST',
      path: '/api/orders/{orderId}/items',
    });
    expect(endpoints[0].parameters).toHaveLength(1);
  });

  it('should extract from all heading levels', () => {
    const html = `
      <h1>DELETE /api/session</h1>
      <h4>PATCH /api/settings</h4>
      <h6>PUT /api/profile</h6>
    `;
    const endpoints = extractEndpointsFromHeadings(html);
    expect(endpoints).toHaveLength(3);
  });

  it('should use heading text as description', () => {
    const html = '<h2>GET /api/users - List all users</h2>';
    const endpoints = extractEndpointsFromHeadings(html);
    expect(endpoints[0].description).toContain('GET /api/users');
  });

  it('should set lower confidence for heading extraction', () => {
    const html = '<h2>GET /api/test</h2>';
    const endpoints = extractEndpointsFromHeadings(html);
    expect(endpoints[0].confidence).toBe(0.5);
  });

  it('should not extract from headings without method', () => {
    const html = '<h2>/api/users endpoint</h2>';
    const endpoints = extractEndpointsFromHeadings(html);
    expect(endpoints).toHaveLength(0);
  });

  it('should not extract from headings without path', () => {
    const html = '<h2>GET request handling</h2>';
    const endpoints = extractEndpointsFromHeadings(html);
    expect(endpoints).toHaveLength(0);
  });
});

// ============================================
// API BASE URL EXTRACTION TESTS
// ============================================

describe('extractApiBaseUrl', () => {
  it('should extract base URL from explicit pattern', () => {
    const html = '<p>Base URL: "https://api.example.com/v1"</p>';
    const baseUrl = extractApiBaseUrl(html, 'https://example.com/docs');
    expect(baseUrl).toBe('https://api.example.com/v1');
  });

  it('should extract API URL from code', () => {
    const html = '<code>const apiUrl = "https://api.service.com"</code>';
    const baseUrl = extractApiBaseUrl(html, 'https://example.com');
    expect(baseUrl).toBe('https://api.service.com');
  });

  it('should extract API subdomain pattern', () => {
    const html = '<p>Make requests to https://api.myservice.com/</p>';
    const baseUrl = extractApiBaseUrl(html, 'https://myservice.com');
    // The regex matches without trailing slash
    expect(baseUrl).toBe('https://api.myservice.com');
  });

  it('should extract /api path pattern', () => {
    const html = '<p>Endpoint: https://example.com/api/v2/users</p>';
    const baseUrl = extractApiBaseUrl(html, 'https://example.com');
    expect(baseUrl).toBe('https://example.com/api/v2');
  });

  it('should derive from page URL with api subdomain', () => {
    const html = '<html><body>Docs</body></html>';
    const baseUrl = extractApiBaseUrl(html, 'https://api.example.com/docs');
    expect(baseUrl).toBe('https://api.example.com');
  });

  it('should derive from page URL with /api path', () => {
    const html = '<html><body>Docs</body></html>';
    const baseUrl = extractApiBaseUrl(html, 'https://example.com/api/docs');
    expect(baseUrl).toBe('https://example.com');
  });

  it('should return undefined when no base URL found', () => {
    const html = '<html><body>No API info</body></html>';
    const baseUrl = extractApiBaseUrl(html, 'https://example.com/docs');
    expect(baseUrl).toBeUndefined();
  });
});

// ============================================
// AUTH INSTRUCTIONS EXTRACTION TESTS
// ============================================

describe('extractAuthInstructions', () => {
  it('should extract auth section by id', () => {
    const html = `
      <section id="authentication">
        <h2>Authentication</h2>
        <p>Use your API key in the Authorization header. Get your key from the dashboard.</p>
      </section>
    `;
    const auth = extractAuthInstructions(html);
    expect(auth).toContain('API key');
    expect(auth).toContain('Authorization header');
  });

  it('should extract auth section by class', () => {
    const html = `
      <div class="auth-section">
        <p>Bearer tokens are required for all authenticated endpoints. Tokens expire after 24 hours.</p>
      </div>
    `;
    const auth = extractAuthInstructions(html);
    expect(auth).toContain('Bearer tokens');
  });

  it('should extract from authentication heading', () => {
    const html = `
      <h2>Authentication</h2>
      <p>All requests must include an API key. Add it to the X-API-Key header for secure access.</p>
      <h2>Next Section</h2>
    `;
    const auth = extractAuthInstructions(html);
    expect(auth).toContain('API key');
  });

  it('should extract API key mentions', () => {
    const html = `
      <p>Include your API key in the request header.</p>
    `;
    const auth = extractAuthInstructions(html);
    expect(auth).toContain('API key');
  });

  it('should extract bearer token mentions', () => {
    const html = `
      <p>Use a bearer token for authentication.</p>
    `;
    const auth = extractAuthInstructions(html);
    expect(auth).toContain('bearer token');
  });

  it('should return undefined when no auth instructions found', () => {
    const html = '<html><body><p>General documentation text.</p></body></html>';
    const auth = extractAuthInstructions(html);
    expect(auth).toBeUndefined();
  });
});

// ============================================
// PARSE DOCS PAGE TESTS
// ============================================

describe('parseDocsPage', () => {
  it('should combine all extraction methods', () => {
    const html = `
      <html>
        <head><title>API Documentation</title></head>
        <body>
          <div class="swagger-ui">
            <nav><a href="/api-reference">API Reference</a></nav>
            <h2>GET /api/users</h2>
            <table>
              <tr><th>Method</th><th>Endpoint</th></tr>
              <tr><td>POST</td><td>/api/users</td></tr>
            </table>
            <pre><code>curl https://api.example.com/status</code></pre>
          </div>
        </body>
      </html>
    `;
    const result = parseDocsPage(html, 'https://example.com/docs');

    expect(result.framework).toBe('swagger-ui');
    expect(result.title).toBe('API Documentation');
    expect(result.navigationLinks.length).toBeGreaterThan(0);
    expect(result.endpoints.length).toBeGreaterThanOrEqual(2);
  });

  it('should deduplicate endpoints by method and path', () => {
    const html = `
      <h2>GET /api/users</h2>
      <table>
        <tr><th>Method</th><th>Endpoint</th></tr>
        <tr><td>GET</td><td>/api/users</td></tr>
      </table>
    `;
    const result = parseDocsPage(html, 'https://example.com/docs');
    const getUsers = result.endpoints.filter(e => e.method === 'GET' && e.path === '/api/users');
    expect(getUsers).toHaveLength(1);
  });

  it('should keep higher confidence endpoint on duplicate', () => {
    const html = `
      <h2>GET /api/data</h2>
      <table>
        <tr><th>Method</th><th>Endpoint</th></tr>
        <tr><td>GET</td><td>/api/data</td></tr>
      </table>
    `;
    const result = parseDocsPage(html, 'https://example.com/docs');
    const endpoint = result.endpoints.find(e => e.path === '/api/data');
    expect(endpoint?.confidence).toBe(0.85); // Table confidence is higher
  });

  it('should sort endpoints by confidence', () => {
    const html = `
      <h2>GET /api/low</h2>
      <table>
        <tr><th>Method</th><th>Endpoint</th></tr>
        <tr><td>GET</td><td>/api/high</td></tr>
      </table>
    `;
    const result = parseDocsPage(html, 'https://example.com/docs');
    expect(result.endpoints[0].path).toBe('/api/high');
  });

  it('should extract API base URL', () => {
    const html = '<p>Base URL: "https://api.service.com"</p>';
    const result = parseDocsPage(html, 'https://example.com/docs');
    expect(result.apiBaseUrl).toBe('https://api.service.com');
  });

  it('should extract auth instructions', () => {
    const html = '<p>Use your API key in the Authorization header.</p>';
    const result = parseDocsPage(html, 'https://example.com/docs');
    expect(result.authInstructions).toContain('API key');
  });
});

// ============================================
// DISCOVER DOCS TESTS
// ============================================

describe('discoverDocs', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should find docs at common location', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/docs')) {
        return Promise.resolve({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          text: () => Promise.resolve(`
            <html>
              <title>API Docs</title>
              <div class="swagger-ui"></div>
              <table>
                <tr><th>Method</th><th>Endpoint</th></tr>
                <tr><td>GET</td><td>/api/users</td></tr>
              </table>
            </html>
          `),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await discoverDocs('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(true);
    expect(result.docsUrl).toContain('/docs');
    expect(result.framework).toBe('swagger-ui');
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  it('should return not found when no docs exist', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const result = await discoverDocs('example.com', { fetchFn: mockFetch });

    expect(result.found).toBe(false);
    expect(result.endpoints).toHaveLength(0);
  });

  it('should respect maxProbes option', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    await discoverDocs('example.com', { fetchFn: mockFetch, maxProbes: 3 });

    // maxProbes limits probe locations, but may include additional homepage check
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4);
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('should skip non-HTML responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve('{"error": "not found"}'),
    });

    const result = await discoverDocs('example.com', { fetchFn: mockFetch, maxProbes: 2 });

    expect(result.found).toBe(false);
  });

  it('should follow navigation links when few endpoints found', async () => {
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          text: () => Promise.resolve(`
            <html>
              <nav><a href="/api-reference">API Reference</a></nav>
            </html>
          `),
        });
      }
      if (url.includes('/api-reference')) {
        return Promise.resolve({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          text: () => Promise.resolve(`
            <html>
              <table>
                <tr><th>Method</th><th>Endpoint</th></tr>
                <tr><td>GET</td><td>/api/users</td></tr>
                <tr><td>POST</td><td>/api/users</td></tr>
              </table>
            </html>
          `),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await discoverDocs('example.com', {
      fetchFn: mockFetch,
      followNavigation: true,
      maxProbes: 20,
    });

    expect(result.found).toBe(true);
    expect(result.docsUrl).toContain('/api-reference');
  });

  it('should track discovery time', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const result = await discoverDocs('example.com', { fetchFn: mockFetch, maxProbes: 1 });

    expect(result.discoveryTime).toBeGreaterThanOrEqual(0);
  });

  it('should include custom headers in requests', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    await discoverDocs('example.com', {
      fetchFn: mockFetch,
      headers: { 'X-Custom': 'value' },
      maxProbes: 1,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Custom': 'value' }),
      })
    );
  });
});

// ============================================
// PATTERN GENERATION TESTS
// ============================================

describe('generatePatternsFromDocs', () => {
  const baseResult: DocsDiscoveryResult = {
    found: true,
    docsUrl: 'https://example.com/docs',
    framework: 'swagger-ui',
    endpoints: [
      {
        method: 'GET',
        path: '/api/users',
        parameters: [],
        description: 'Get all users',
        source: 'table',
        confidence: 0.85,
      },
      {
        method: 'POST',
        path: '/api/users/{userId}',
        parameters: [{ name: 'userId', type: 'string', required: true, location: 'path' }],
        description: 'Create user',
        source: 'table',
        confidence: 0.85,
      },
    ],
    navigationLinks: [],
    discoveryTime: 100,
  };

  it('should generate patterns from endpoints', () => {
    const patterns = generatePatternsFromDocs(baseResult, 'example.com');

    expect(patterns).toHaveLength(2);
    expect(patterns[0].id).toContain('docs:example.com:GET:/api/users');
    expect(patterns[0].method).toBe('GET');
    expect(patterns[0].endpointTemplate).toBe('https://example.com/api/users');
  });

  it('should use apiBaseUrl when available', () => {
    const result = {
      ...baseResult,
      apiBaseUrl: 'https://api.example.com/v1',
    };

    const patterns = generatePatternsFromDocs(result, 'example.com');

    expect(patterns[0].endpointTemplate).toBe('https://api.example.com/v1/api/users');
  });

  it('should convert :param to {param} style', () => {
    const result = {
      ...baseResult,
      endpoints: [
        {
          method: 'GET' as const,
          path: '/api/users/:id/posts/:postId',
          parameters: [],
          description: 'Get posts',
          source: 'table' as const,
          confidence: 0.85,
        },
      ],
    };

    const patterns = generatePatternsFromDocs(result, 'example.com');

    expect(patterns[0].endpointTemplate).toBe('https://example.com/api/users/{id}/posts/{postId}');
  });

  it('should filter low confidence endpoints', () => {
    const result = {
      ...baseResult,
      endpoints: [
        {
          method: 'GET' as const,
          path: '/api/lowconf',
          parameters: [],
          description: 'Low confidence',
          source: 'heading' as const,
          confidence: 0.4,
        },
        {
          method: 'GET' as const,
          path: '/api/highconf',
          parameters: [],
          description: 'High confidence',
          source: 'table' as const,
          confidence: 0.85,
        },
      ],
    };

    const patterns = generatePatternsFromDocs(result, 'example.com');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].endpointTemplate).toContain('/api/highconf');
  });

  it('should convert PATCH to PUT method', () => {
    const result = {
      ...baseResult,
      endpoints: [
        {
          method: 'PATCH' as const,
          path: '/api/update',
          parameters: [],
          description: 'Update resource',
          source: 'table' as const,
          confidence: 0.85,
        },
      ],
    };

    const patterns = generatePatternsFromDocs(result, 'example.com');

    expect(patterns[0].method).toBe('PUT');
  });

  it('should set appropriate confidence on patterns', () => {
    const patterns = generatePatternsFromDocs(baseResult, 'example.com');

    // Docs patterns have 0.7x multiplier
    expect(patterns[0].metrics.confidence).toBeCloseTo(0.85 * 0.7, 2);
  });

  it('should return empty array when not found', () => {
    const result: DocsDiscoveryResult = {
      found: false,
      endpoints: [],
      navigationLinks: [],
      discoveryTime: 100,
    };

    const patterns = generatePatternsFromDocs(result, 'example.com');

    expect(patterns).toHaveLength(0);
  });

  it('should return empty array when no endpoints', () => {
    const result: DocsDiscoveryResult = {
      found: true,
      docsUrl: 'https://example.com/docs',
      endpoints: [],
      navigationLinks: [],
      discoveryTime: 100,
    };

    const patterns = generatePatternsFromDocs(result, 'example.com');

    expect(patterns).toHaveLength(0);
  });

  it('should create valid URL pattern regex', () => {
    const patterns = generatePatternsFromDocs(baseResult, 'example.com');

    const pattern = patterns[0].urlPatterns[0];
    const regex = new RegExp(pattern);

    expect(regex.test('https://example.com/api/users')).toBe(true);
    expect(regex.test('https://example.com/api/other')).toBe(false);
  });

  it('should include domain in metrics', () => {
    const patterns = generatePatternsFromDocs(baseResult, 'example.com');

    expect(patterns[0].metrics.domains).toContain('example.com');
  });
});

// ============================================
// CONSTANTS TESTS
// ============================================

describe('DOCS_PROBE_LOCATIONS', () => {
  it('should include common documentation paths', () => {
    expect(DOCS_PROBE_LOCATIONS).toContain('/docs');
    expect(DOCS_PROBE_LOCATIONS).toContain('/api-docs');
    expect(DOCS_PROBE_LOCATIONS).toContain('/developers');
    expect(DOCS_PROBE_LOCATIONS).toContain('/reference');
  });

  it('should include versioned API paths', () => {
    expect(DOCS_PROBE_LOCATIONS).toContain('/api/v1');
    expect(DOCS_PROBE_LOCATIONS).toContain('/api/v2');
  });
});
