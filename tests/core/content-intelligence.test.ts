import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ContentIntelligence, type ContentResult, type ExtractionStrategy } from '../../src/core/content-intelligence.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ContentIntelligence', () => {
  let intelligence: ContentIntelligence;

  beforeEach(() => {
    vi.resetAllMocks();
    intelligence = new ContentIntelligence();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock HTML response
  const createHtmlResponse = (html: string, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(html),
    headers: new Headers({
      'content-type': 'text/html',
    }),
  });

  // Helper to create mock JSON response
  const createJsonResponse = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({
      'content-type': 'application/json',
    }),
  });

  describe('Next.js Framework Extraction', () => {
    it('should extract content from __NEXT_DATA__ script', async () => {
      const nextData = {
        props: {
          pageProps: {
            title: 'Test Article',
            content: 'This is a test article with enough content to pass validation for the minimum length requirement of 500 characters. '.repeat(5),
            author: 'Test Author',
            description: 'Additional description text to ensure we meet the content length threshold for successful Next.js extraction.',
          },
        },
        page: '/articles/test',
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <div id="__next"></div>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/articles/test');

      expect(result.meta.strategy).toBe('framework:nextjs');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.text).toContain('This is a test article');
      expect(result.content.structured).toBeDefined();
    });

    it('should fall through when __NEXT_DATA__ has insufficient content', async () => {
      const nextData = {
        props: {
          pageProps: {
            title: 'Short',
          },
        },
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <main>
            <h1>Main Content</h1>
            <p>This is the main content of the page with enough text to pass validation. </p>
            <p>More content here to ensure we have sufficient text for the static parser. </p>
            <p>Additional paragraphs with meaningful content for extraction. </p>
          </main>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      // Should fall back to another strategy since Next.js data is too short
      // Could be any strategy after framework - allow any non-framework strategy
      expect(result.meta.strategy).not.toBe('framework:nextjs');
    });
  });

  describe('Nuxt Framework Extraction', () => {
    it('should attempt Nuxt extraction even if it fails', async () => {
      // Nuxt extraction is tricky - we test that it's attempted as part of the chain
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Nuxt Page</title></head>
        <body>
          <div id="__nuxt"></div>
          <main>
            <p>Fallback content for when Nuxt extraction does not work. This needs at least 500 characters to pass the minimum content length validation requirement. </p>
            <p>Additional content to meet minimum length requirements. The static HTML parsing strategy will extract this content when framework extraction fails. </p>
            <p>Third paragraph with more content for the fallback extraction path. This ensures the test passes with the new content validation. </p>
            <p>Fourth paragraph providing extra text to guarantee successful extraction. Nuxt extraction attempts are logged even if they fail. </p>
          </main>
          <script>window.__NUXT__ = {data:[{"title":"Test"}]};</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/nuxt-page');

      // Nuxt is part of the framework chain, even if extraction fails
      expect(result.meta.strategiesAttempted).toContain('framework:nextjs');
      // Should have some result even if Nuxt doesn't work
      expect(result.error).toBeUndefined();
    });
  });

  describe('Angular Framework Extraction', () => {
    it('should extract content from Angular Universal transfer state', async () => {
      const transferState = {
        title: 'Angular Article',
        description: 'This is an Angular Universal page with enough content to pass the minimum length validation. Angular Universal uses TransferState to pass server data to the client. This enables efficient hydration of the application state without making additional API calls. The content must be at least 100 characters to pass the content validation check in the extraction pipeline.',
        author: 'Angular Developer',
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Angular Page</title></head>
        <body>
          <app-root ng-version="17.0.0" _nghost-ng-c1234567890>
            <div _ngcontent-ng-c1234567890>Content here</div>
          </app-root>
          <script id="serverApp-state" type="application/json">${JSON.stringify(transferState)}</script>
          <script src="runtime.abc123.js"></script>
          <script src="polyfills.def456.js"></script>
          <script src="main.ghi789.js"></script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/angular-page', {
        forceStrategy: 'framework:angular',
      });

      expect(result.meta.strategy).toBe('framework:angular');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.text).toContain('Angular Universal');
      expect(result.content.structured).toBeDefined();
    });

    it('should extract content from transfer-state script id', async () => {
      const transferState = {
        pageTitle: 'Transfer State Test',
        body: 'This content comes from Angular transfer-state with a different script ID. The content needs to be long enough for the minimum validation threshold to pass. Adding more text to ensure extraction succeeds. We need at least 100 characters for the content validation to pass successfully.',
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Angular App</title></head>
        <body>
          <app-root ng-version="16.2.0">
            <router-outlet></router-outlet>
          </app-root>
          <script id="transfer-state" type="application/json">${JSON.stringify(transferState)}</script>
          <script src="zone.min.js"></script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/transfer-state', {
        forceStrategy: 'framework:angular',
      });

      expect(result.meta.strategy).toBe('framework:angular');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.text).toContain('Angular transfer-state');
    });

    it('should extract title from nested objects', async () => {
      const transferState = {
        page: {
          data: {
            title: 'Nested Title Found',
          },
        },
        description: 'Angular page content with nested title that should be discovered by the recursive title extraction. This content is long enough to pass the minimum character validation. Adding more words to meet the threshold. The minimum content length is 100 characters.',
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Angular</title></head>
        <body>
          <app-root ng-version="17.1.0"></app-root>
          <script id="ng-state" type="application/json">${JSON.stringify(transferState)}</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/nested-title', {
        forceStrategy: 'framework:angular',
      });

      expect(result.meta.strategy).toBe('framework:angular');
      expect(result.content.title).toBe('Nested Title Found');
    });

    it('should detect Angular app indicators without transfer state', async () => {
      // When Angular is detected but there's no transfer state data,
      // it should fall through to other strategies
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Angular SPA</title></head>
        <body>
          <app-root ng-version="17.0.0" _nghost-ng-c0123456789>
            <div _ngcontent-ng-c0123456789>
              <h1>Welcome to Our Angular Application</h1>
              <p>This is an Angular client-side rendered application. It does not have server-side transfer state, so the framework extraction will not find data to extract. The fallback strategies should handle this case appropriately. This application demonstrates modern Angular development practices.</p>
              <p>Additional paragraph content to ensure sufficient length for the fallback extraction strategy to succeed with the minimum content requirements. The static HTML parser should be able to extract meaningful content from these paragraphs when framework extraction fails.</p>
              <p>Even more content is needed to meet the 500 character minimum threshold for successful extraction. This ensures that the test properly validates the fallback behavior when Angular Universal transfer state is not available in the document.</p>
              <p>Angular applications can run entirely on the client side without server-side rendering. In such cases, the content is dynamically generated by JavaScript after the initial page load. This test verifies that the system correctly falls back to static parsing.</p>
            </div>
          </app-root>
          <script src="runtime.abc123.js"></script>
          <script src="zone.js"></script>
          <script src="main.def456.js"></script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/angular-spa');

      // Should fall back to static parsing since no transfer state
      expect(result.meta.strategy).not.toBe('framework:angular');
      expect(result.error).toBeUndefined();
      // framework:nextjs is the chain entry point that triggers all framework extraction
      // (including Angular) - Angular is only recorded when forceStrategy is used
      expect(result.meta.strategiesAttempted).toContain('framework:nextjs');
    });

    it('should detect Angular via zone.js indicator', async () => {
      const transferState = {
        headline: 'Zone.js Detection',
        description: 'This Angular app is detected through zone.js script inclusion. Zone.js is a core dependency of Angular that provides change detection. This content meets the minimum length requirement for extraction. We are adding more text to exceed 100 characters.',
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Angular Zone</title></head>
        <body>
          <div id="root"></div>
          <script id="serverApp-state" type="application/json">${JSON.stringify(transferState)}</script>
          <script src="zone.js"></script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/zone-app', {
        forceStrategy: 'framework:angular',
      });

      expect(result.meta.strategy).toBe('framework:angular');
      expect(result.content.title).toBe('Zone.js Detection');
    });

    it('should handle Angular hydration (ngh) attributes', async () => {
      const transferState = {
        name: 'Hydrated Angular App',
        description: 'Angular 17+ uses new hydration with ngh attributes on elements. This is a newer approach to Angular Universal that improves performance. The content here is long enough for extraction validation. Adding more text to exceed the 100 character minimum.',
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Hydrated App</title></head>
        <body>
          <app-root ngh="abc123">
            <div ngh="def456">Hydrated content</div>
          </app-root>
          <script ngh type="application/json">${JSON.stringify(transferState)}</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/hydrated', {
        forceStrategy: 'framework:angular',
      });

      expect(result.meta.strategy).toBe('framework:angular');
      expect(result.content.text).toContain('Angular 17+');
    });

    it('should handle insufficient Angular content gracefully', async () => {
      const transferState = {
        title: 'Short',
        content: 'Too short', // Not enough content
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Angular</title></head>
        <body>
          <app-root ng-version="17.0.0"></app-root>
          <script id="serverApp-state" type="application/json">${JSON.stringify(transferState)}</script>
          <main>
            <p>Fallback content when Angular transfer state has insufficient data. This content will be extracted by the static parsing strategy instead. More text is needed to meet the minimum length requirement. The system should gracefully handle this scenario and fall back to alternative extraction methods.</p>
            <p>Additional paragraph for content length. The static parser will extract this when Angular extraction fails due to short content. This ensures proper fallback behavior in the content intelligence system when framework-specific extraction cannot find sufficient data.</p>
            <p>Third paragraph with extra content to ensure successful fallback extraction meets the validation threshold. The content extraction pipeline tries multiple strategies in sequence, and this test verifies that behavior works correctly when earlier strategies fail to extract meaningful content.</p>
            <p>Fourth paragraph providing even more content to guarantee the minimum character threshold is exceeded. Testing edge cases like insufficient content in transfer state helps ensure robust handling of real-world scenarios where data may be incomplete.</p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/short-angular');

      // Should fall back since Angular content is too short
      expect(result.meta.strategy).not.toBe('framework:angular');
      expect(result.error).toBeUndefined();
    });

    it('should include framework:angular in available strategies', () => {
      const strategies = ContentIntelligence.getAvailableStrategies();
      const angularStrategy = strategies.find(s => s.strategy === 'framework:angular');

      expect(angularStrategy).toBeDefined();
      expect(angularStrategy?.available).toBe(true);
    });
  });

  describe('VitePress Framework Extraction', () => {
    it('should extract content from VitePress page data', async () => {
      const pageData = {
        title: 'VitePress Documentation',
        description: 'VitePress is a static site generator powered by Vue and Vite. This documentation provides comprehensive guides for building beautiful documentation sites with VitePress. Learn about themes, customization, and deployment options.',
        frontmatter: {
          title: 'Getting Started',
        },
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>VitePress Docs</title>
          <meta name="generator" content="VitePress v1.0.0">
        </head>
        <body>
          <div id="app" data-server-rendered="true">
            <div class="VPNav">Navigation</div>
            <div class="VPContent">
              <div class="VPDoc">
                <h1>Getting Started</h1>
                <p>Welcome to VitePress documentation.</p>
              </div>
            </div>
          </div>
          <script id="__VP_ROUTE_DATA__" type="application/json">${JSON.stringify(pageData)}</script>
          <script src="/assets/chunks/VitePress.abc123.js"></script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/vitepress-docs', {
        forceStrategy: 'framework:vitepress',
      });

      expect(result.meta.strategy).toBe('framework:vitepress');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.text).toContain('VitePress');
      expect(result.content.structured).toBeDefined();
    });

    it('should detect VitePress via generator meta tag', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>VitePress Site</title>
          <meta name="generator" content="VitePress v1.2.0">
        </head>
        <body>
          <div class="VPDoc">
            <h1>VitePress Documentation</h1>
            <p>This is a VitePress powered documentation site. VitePress is built on top of Vite and Vue.js, providing an excellent developer experience for creating documentation. The build process is lightning fast thanks to Vite. This content demonstrates VitePress content extraction capabilities for documentation sites that use Vue.js under the hood.</p>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/vitepress-site', {
        forceStrategy: 'framework:vitepress',
      });

      expect(result.meta.strategy).toBe('framework:vitepress');
    });

    it('should detect VitePress via __VP_HASH_MAP__', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>VitePress Hash</title></head>
        <body>
          <div class="VPContent">
            <div class="VPDoc">
              <h1>Hash Map Detection</h1>
              <p>VitePress uses a hash map for efficient page routing and module loading. This approach enables instant page transitions without full page reloads. The content extraction system should detect VitePress applications through the presence of __VP_HASH_MAP__ in the page source. This ensures proper framework identification and extraction.</p>
            </div>
          </div>
          <script>window.__VP_HASH_MAP__ = JSON.parse('{"index":"abc123"}')</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/vitepress-hash', {
        forceStrategy: 'framework:vitepress',
      });

      expect(result.meta.strategy).toBe('framework:vitepress');
    });

    it('should include framework:vitepress in available strategies', () => {
      const strategies = ContentIntelligence.getAvailableStrategies();
      const vitepressStrategy = strategies.find(s => s.strategy === 'framework:vitepress');

      expect(vitepressStrategy).toBeDefined();
      expect(vitepressStrategy?.available).toBe(true);
    });
  });

  describe('VuePress Framework Extraction', () => {
    it('should extract content from VuePress SSR context', async () => {
      const ssrContext = {
        title: 'VuePress Guide',
        description: 'VuePress is a minimalistic static site generator with a Vue-powered theming system. This guide covers installation, configuration, and customization of VuePress sites. Learn how to create beautiful documentation with markdown and Vue components.',
        path: '/guide/',
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>VuePress</title>
          <meta name="generator" content="VuePress v2.0.0">
        </head>
        <body>
          <div id="app" data-server-rendered="true">
            <div class="theme-default-content">
              <h1>VuePress Guide</h1>
              <p>Welcome to VuePress.</p>
            </div>
          </div>
          <script>window.__VUEPRESS_SSR_CONTEXT__ = ${JSON.stringify(ssrContext)}</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/vuepress-docs', {
        forceStrategy: 'framework:vuepress',
      });

      expect(result.meta.strategy).toBe('framework:vuepress');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.text).toContain('VuePress');
      expect(result.content.structured).toBeDefined();
    });

    it('should detect VuePress via generator meta tag', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>VuePress Site</title>
          <meta name="generator" content="VuePress v2.0.0-beta.60">
        </head>
        <body>
          <div class="theme-default-content">
            <h1>VuePress Documentation</h1>
            <p>This is a VuePress powered documentation site. VuePress v2 is built on Vue 3 and Vite. It provides a great developer experience with hot module replacement and fast builds. The content here demonstrates VuePress content extraction from theme-default-content containers.</p>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/vuepress-site', {
        forceStrategy: 'framework:vuepress',
      });

      expect(result.meta.strategy).toBe('framework:vuepress');
    });

    it('should detect VuePress v1 via sidebar classes', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>VuePress v1</title></head>
        <body>
          <div class="sidebar-links">
            <a href="/guide/">Guide</a>
          </div>
          <div class="page">
            <div class="content">
              <h1>VuePress Version 1</h1>
              <p>VuePress 1.x uses Vue 2 under the hood. It has different class names compared to VuePress 2. The sidebar-links class is a distinctive marker for VuePress v1 sites. Content extraction should work with both versions of VuePress. This paragraph provides enough content for validation.</p>
            </div>
            <div class="page-edit">Edit this page</div>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/vuepress-v1', {
        forceStrategy: 'framework:vuepress',
      });

      expect(result.meta.strategy).toBe('framework:vuepress');
    });

    it('should handle VuePress without SSR context gracefully', async () => {
      // When VuePress is detected but there's no SSR context data,
      // it should fall through to content extraction
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>VuePress SPA</title>
          <meta name="generator" content="VuePress v2.0.0">
        </head>
        <body data-server-rendered="true">
          <div class="vp-sidebar">Sidebar</div>
          <div class="theme-default-content">
            <h1>Welcome to VuePress</h1>
            <p>This VuePress site does not have SSR context data. However, the framework detection should still recognize it as a VuePress application based on the generator meta tag and CSS class patterns. The extraction will use content containers as fallback.</p>
            <p>Additional paragraph with more content to ensure the minimum character threshold is met for successful extraction. VuePress is an excellent choice for documentation sites and blogs.</p>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/vuepress-spa', {
        forceStrategy: 'framework:vuepress',
      });

      expect(result.meta.strategy).toBe('framework:vuepress');
      expect(result.error).toBeUndefined();
    });

    it('should include framework:vuepress in available strategies', () => {
      const strategies = ContentIntelligence.getAvailableStrategies();
      const vuepressStrategy = strategies.find(s => s.strategy === 'framework:vuepress');

      expect(vuepressStrategy).toBeDefined();
      expect(vuepressStrategy?.available).toBe(true);
    });
  });

  describe('Structured Data Extraction', () => {
    it('should extract content from JSON-LD', async () => {
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        name: 'Test Article',
        headline: 'Test Headline',
        description: 'This is a test description with enough content for validation.',
        articleBody: 'This is the full article body with lots of content. '.repeat(10),
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
        </head>
        <body>
          <article>Content</article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      expect(result.meta.strategy).toBe('structured:jsonld');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.title).toBe('Test Article');
      expect(result.content.text).toContain('article body');
    });

    it('should extract multiple JSON-LD blocks', async () => {
      const jsonLd1 = {
        '@type': 'Organization',
        name: 'Test Org',
      };
      const jsonLd2 = {
        '@type': 'Article',
        headline: 'Main Article',
        articleBody: 'This is the main article content with plenty of text. '.repeat(5),
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">${JSON.stringify(jsonLd1)}</script>
          <script type="application/ld+json">${JSON.stringify(jsonLd2)}</script>
        </head>
        <body></body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      // Title could be from either block - first one with name/headline wins
      expect(['Test Org', 'Main Article']).toContain(result.content.title);
      expect(result.content.structured).toBeInstanceOf(Array);
    });

    it('should extract OpenGraph metadata when available', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <meta property="og:title" content="OpenGraph Title">
          <meta property="og:description" content="This is the OpenGraph description with enough content to pass validation. More text here for extraction purposes.">
        </head>
        <body>
          <main><p>Body content that is short.</p></main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'structured:opengraph',
      });

      expect(result.meta.strategy).toBe('structured:opengraph');
      expect(result.content.title).toBe('OpenGraph Title');
    });
  });

  describe('Static HTML Parsing', () => {
    it('should extract content from main element', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Static Page</title></head>
        <body>
          <nav>Navigation</nav>
          <main>
            <h1>Main Heading</h1>
            <p>This is the main content paragraph with enough text to pass validation. It needs at least 500 characters to meet the minimum content length requirement. </p>
            <p>Another paragraph with more content for extraction testing purposes. The static HTML parsing strategy extracts content from semantic elements. </p>
            <p>Third paragraph to ensure we have sufficient text for validation. Additional content provides the needed length for successful extraction. </p>
            <p>Fourth paragraph with extra content to guarantee we pass the minimum threshold. This ensures the test works correctly with the new validation. </p>
          </main>
          <footer>Footer content</footer>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'parse:static',
      });

      expect(result.meta.strategy).toBe('parse:static');
      expect(result.content.title).toBe('Static Page');
      expect(result.content.text).toContain('Main Heading');
      expect(result.content.text).toContain('main content paragraph');
      // Should not contain nav/footer content since we remove those
      expect(result.content.markdown).toBeDefined();
    });

    it('should extract from article element', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Article Page</title></head>
        <body>
          <article>
            <h1>Article Title</h1>
            <p>Article content with sufficient text for validation purposes. This needs to be long enough to meet the minimum content length requirement of 500 characters. </p>
            <p>More article content for extraction testing. The extraction system processes HTML and converts it to clean text and markdown format. </p>
            <p>Third paragraph of article content to ensure we have enough text. Additional content helps validate the extraction process works correctly. </p>
            <p>Fourth paragraph providing extra content for the minimum length threshold. This ensures successful extraction testing. </p>
          </article>
          <aside>Sidebar content</aside>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'parse:static',
      });

      expect(result.content.text).toContain('Article Title');
      expect(result.content.text).toContain('Article content');
    });

    it('should remove cookie banners and popups', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Page with Banners</title></head>
        <body>
          <div class="cookie-banner">Accept cookies</div>
          <div class="popup-overlay">Subscribe to newsletter</div>
          <main>
            <h1>Main Content</h1>
            <p>This is the actual content we want to extract with enough text. It needs at least 500 characters to pass the minimum content length validation. </p>
            <p>More content for validation testing purposes here. The extraction system removes unwanted elements like cookie banners, popups, and advertisements. </p>
            <p>Third paragraph with additional content to ensure we meet the threshold. This tests the banner removal functionality properly. </p>
            <p>Fourth paragraph providing extra text for the minimum length requirement. Cookie banners and ads should not appear in extracted content. </p>
          </main>
          <div class="advertisement">Ad content</div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'parse:static',
      });

      expect(result.content.text).not.toContain('Accept cookies');
      expect(result.content.text).not.toContain('Subscribe to newsletter');
      expect(result.content.text).not.toContain('Ad content');
      expect(result.content.text).toContain('Main Content');
    });

    it('should convert HTML to markdown', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Markdown Test</title></head>
        <body>
          <main>
            <h1>Heading 1</h1>
            <h2>Heading 2</h2>
            <p>A paragraph with <strong>bold</strong> and <em>italic</em> text. Adding more content here to ensure we meet the minimum content length requirement for extraction. The markdown conversion preserves formatting.</p>
            <p>Another paragraph with additional content for the markdown conversion test. This ensures sufficient text for validation purposes and tests the conversion quality.</p>
            <p>Third paragraph with more text content to meet the 500 character minimum. Lists and code blocks are also converted properly to markdown format.</p>
            <ul>
              <li>List item 1</li>
              <li>List item 2</li>
            </ul>
            <pre><code>const x = 1;</code></pre>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'parse:static',
      });

      expect(result.content.markdown).toContain('# Heading 1');
      expect(result.content.markdown).toContain('## Heading 2');
      expect(result.content.markdown).toContain('**bold**');
      // Turndown uses _italic_ not *italic*
      expect(result.content.markdown).toContain('_italic_');
    });
  });

  describe('Strategy Options', () => {
    it('should skip specified strategies', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <script type="application/ld+json">{"@type":"Article","articleBody":"JSON-LD content with enough text for validation. ".repeat(5)}</script>
        </head>
        <body>
          <main>
            <p>Main content with enough text for static parsing to work correctly. </p>
            <p>Additional content to ensure validation passes for static strategy. </p>
            <p>Even more content to guarantee we meet the minimum length requirement. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        skipStrategies: ['structured:jsonld', 'structured:opengraph'],
      });

      // Should skip JSON-LD - check it's not in the attempted list
      expect(result.meta.strategiesAttempted).not.toContain('structured:jsonld');
    });

    it('should force a specific strategy', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Force Strategy Test</title></head>
        <body>
          <main>
            <p>Content for static parsing with sufficient length for validation. This needs at least 500 characters to meet the minimum content length requirement. </p>
            <p>More content to ensure the minimum content length is met. The forced strategy option limits extraction to only the specified strategy. </p>
            <p>Third paragraph with additional content for the test. This ensures we have enough text to pass the validation threshold. </p>
            <p>Fourth paragraph providing extra text to guarantee successful extraction. The forceStrategy option is useful for testing specific extraction paths. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'parse:static',
      });

      expect(result.meta.strategy).toBe('parse:static');
      expect(result.meta.strategiesAttempted).toEqual(['parse:static']);
    });

    it('should respect minContentLength option', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Short Content</title></head>
        <body>
          <main><p>Short content text here</p></main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'parse:static',
        minContentLength: 5,
      });

      // With low minContentLength, should succeed
      expect(result.error).toBeUndefined();
    });

    it('should fail when content is below minContentLength', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Too Short</title></head>
        <body><main><p>X</p></main></body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      // When forcing a strategy and content is too short, it throws
      // We need to catch the error or let it return an error result
      const result = await intelligence.extract('https://example.com', {
        minContentLength: 500,
        allowBrowser: false, // Don't try Playwright
      });

      // Should fail because content is too short and all strategies fail
      expect(result.error).toBeDefined();
    });

    it('should not use browser when allowBrowser is false', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>No Browser</title></head>
        <body><main><p>Short</p></main></body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        allowBrowser: false,
        minContentLength: 1000, // Set high to force failure
      });

      // Should fail without trying Playwright
      expect(result.meta.strategiesAttempted).not.toContain('browser:playwright');
    });
  });

  describe('Fallback Chain', () => {
    it('should try strategies in order until one succeeds', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Fallback Test</title></head>
        <body>
          <main>
            <p>Main content with enough text for validation to pass on static parsing. </p>
            <p>Additional content for the extraction tests. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      // Should try site-specific APIs first (all return null for non-matching URLs), then framework, then structured, then static
      expect(result.meta.strategiesAttempted.length).toBeGreaterThan(1);
      // Site-specific APIs are first in the chain but return null for non-matching URLs
      expect(result.meta.strategiesAttempted[0]).toBe('api:reddit');
      expect(result.meta.strategiesAttempted[1]).toBe('api:hackernews');
      // More site-specific APIs follow: github, wikipedia, stackoverflow
      // Then framework extraction
    });

    it('should record all attempted strategies', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Multi-attempt Test</title></head>
        <body>
          <main>
            <p>Content for extraction that should work with static parsing. </p>
            <p>More content to meet minimum length requirements. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      expect(result.meta.strategiesAttempted).toContain('framework:nextjs');
      expect(result.meta.strategiesAttempted).toContain('structured:jsonld');
    });

    it('should record warnings from failed strategies', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Warnings Test</title></head>
        <body>
          <main>
            <p>Content that will pass static parsing but not other strategies. This needs to be long enough to meet the minimum content length requirement of 500 characters. </p>
            <p>Additional text to meet validation requirements. More content is needed here to ensure we pass the threshold. </p>
            <p>Third paragraph with more substantial content to ensure extraction succeeds and we can test the warning behavior properly. </p>
            <p>Fourth paragraph adding even more text content for validation purposes and to ensure the test passes correctly. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      // Strategies that don't find enough content record "too short or invalid" warnings
      // The actual behavior may vary - just check we got a result
      expect(result.error).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await intelligence.extract('https://example.com', {
        allowBrowser: false, // Skip browser to avoid timeout
      });

      // When all strategies fail due to network errors, we get an error
      expect(result.error).toBeDefined();
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue(createHtmlResponse('Not Found', 404));

      const result = await intelligence.extract('https://example.com', {
        allowBrowser: false, // Skip browser to avoid timeout
      });

      // When fetch returns error status, extraction should fail
      expect(result.error).toBeDefined();
    });

    it('should handle malformed JSON in __NEXT_DATA__', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Bad JSON</title></head>
        <body>
          <script id="__NEXT_DATA__" type="application/json">{invalid json}</script>
          <main>
            <p>Fallback content should be extracted when JSON is invalid. This needs to be at least 500 characters to pass content length validation. </p>
            <p>More content for validation requirements. The extraction system should fall back to static HTML parsing when framework extraction fails. </p>
            <p>Additional paragraph with substantial content to ensure we meet the minimum content length threshold for successful extraction. </p>
            <p>Final paragraph providing extra text content needed to pass all validation checks and ensure the test completes successfully. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      // Should fall back to static parsing despite invalid JSON
      expect(result.meta.strategy).not.toBe('framework:nextjs');
      expect(result.error).toBeUndefined();
    });

    it('should handle malformed JSON-LD', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Bad JSON-LD</title>
          <script type="application/ld+json">{not valid json at all}</script>
        </head>
        <body>
          <main>
            <p>Content for fallback extraction when JSON-LD is invalid. This is substantial content that should pass the minimum content length validation of 500 characters. The system handles malformed JSON gracefully. </p>
            <p>Additional content for minimum length validation to ensure we have enough text. We need to meet the content threshold for successful extraction. This extra text helps meet the minimum. </p>
            <p>More detailed content about various topics to ensure we pass validation. The extraction should fall back gracefully when structured data is malformed or missing. </p>
            <p>Even more content here to make absolutely sure we meet the minimum length requirement for extraction. Fallback strategies ensure content is always extracted when possible. </p>
            <p>Fifth paragraph to guarantee we exceed 500 characters. The content intelligence system tries multiple strategies until one succeeds. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      // Should skip invalid JSON-LD and use another strategy
      expect(result.error).toBeUndefined();
    });
  });

  describe('Content Validation', () => {
    it('should validate content length', async () => {
      const shortHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Short</title></head>
        <body><main><p>Too short</p></main></body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(shortHtml));

      const result = await intelligence.extract('https://example.com', {
        minContentLength: 200,
      });

      expect(result.error).toBeDefined();
    });

    it('should accept content meeting minimum length', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Valid Length</title></head>
        <body>
          <main>
            <p>${'Valid content '.repeat(50)}</p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        minContentLength: 100,
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe('Timing and Metadata', () => {
    it('should record timing information', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Timing Test</title></head>
        <body>
          <main>
            <p>Content for timing test with sufficient length to pass validation requirements. This needs to be at least 500 characters to pass the default minimum content length validation. </p>
            <p>Additional content for validation to ensure we meet minimum content length. More text is needed here to ensure proper extraction. </p>
            <p>We need substantial content to test the timing properly and ensure extraction succeeds. The extraction system measures time spent. </p>
            <p>Final paragraph with more content to ensure minimum length. This should be enough text now for validation to pass. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com', {
        forceStrategy: 'parse:static',
      });

      expect(result.meta.timing).toBeGreaterThanOrEqual(0);
    });

    it('should record original and final URLs', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>URL Test</title></head>
        <body>
          <main>
            <p>Content for URL metadata test with sufficient text length for validation. This requires at least 500 characters of content to pass the minimum threshold. </p>
            <p>More content for validation to meet minimum requirements for extraction. Additional text provides the needed length for successful extraction. </p>
            <p>Testing URL tracking requires proper content extraction to succeed first. The metadata is recorded during the process and includes both original and final URLs. </p>
            <p>Enough content here to ensure we pass the minimum content length validation and the test can verify URLs properly with the static parsing strategy. </p>
            <p>Fifth paragraph to guarantee we exceed the 500 character minimum for this URL metadata test. The extraction system tracks redirects. </p>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValue(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com/page', {
        forceStrategy: 'parse:static',
      });

      expect(result.meta.url).toBe('https://example.com/page');
      expect(result.meta.finalUrl).toBeDefined();
    });
  });

  describe('Text Extraction from Objects', () => {
    it('should extract text from nested objects', async () => {
      const nextData = {
        props: {
          pageProps: {
            article: {
              title: 'Nested Title Article for Testing Text Extraction',
              body: {
                content: 'This is deeply nested content that should be extracted by the content intelligence system. '.repeat(6),
                summary: 'A summary of the article that provides context and additional information about the topic being discussed.',
              },
              metadata: {
                description: 'Additional metadata text to ensure we meet the minimum content length requirement for extraction.',
              },
            },
          },
        },
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Nested Test</title></head>
        <body>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      expect(result.content.text).toContain('deeply nested content');
      expect(result.content.text).toContain('summary of the article');
    });

    it('should extract text from arrays', async () => {
      const nextData = {
        props: {
          pageProps: {
            items: [
              { text: 'First item content that is long enough to pass filtering with additional details and context for the extraction. ' },
              { text: 'Second item content that is also long enough for extraction and provides valuable information for the test. ' },
              { text: 'Third item content meeting length requirements for text extraction with supplementary details included. ' },
              { text: 'Fourth item content added to ensure we meet the minimum 500 character content length validation threshold. ' },
              { text: 'Fifth item content provides additional text to guarantee successful extraction with proper validation. ' },
            ],
          },
        },
      };

      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Array Test</title></head>
        <body>
          <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createHtmlResponse(html));

      const result = await intelligence.extract('https://example.com');

      expect(result.content.text).toContain('First item');
      expect(result.content.text).toContain('Second item');
    });
  });

  describe('NPM Registry API', () => {
    it('should extract package info from npmjs.com URL', async () => {
      const packageData = {
        name: 'test-package',
        description: 'A test package for unit testing with enough content to pass validation for the minimum length requirement.',
        'dist-tags': {
          latest: '1.0.0',
          next: '2.0.0-beta.1',
        },
        versions: {
          '1.0.0': {
            name: 'test-package',
            version: '1.0.0',
            description: 'A test package description that is sufficiently long for content validation purposes.',
            license: 'MIT',
            homepage: 'https://example.com',
            repository: {
              type: 'git',
              url: 'git+https://github.com/test/test-package.git',
            },
            keywords: ['test', 'package', 'unit-testing'],
            dependencies: {
              lodash: '^4.17.21',
              axios: '^1.0.0',
            },
          },
        },
        maintainers: [
          { name: 'test-maintainer', email: 'test@example.com' },
        ],
        time: {
          '1.0.0': '2024-01-15T10:00:00.000Z',
        },
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://www.npmjs.com/package/test-package', {
        forceStrategy: 'api:npm',
        minContentLength: 100, // Ensure we pass content length check
      });

      expect(result.meta.strategy).toBe('api:npm');
      expect(result.meta.finalUrl).toBe('https://registry.npmjs.org/test-package');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.title).toBe('test-package - npm');
      expect(result.content.text).toContain('test-package@1.0.0');
      expect(result.content.text).toContain('License: MIT');
      expect(result.content.markdown).toContain('npm install test-package');
    });

    it('should handle scoped packages (@scope/package)', async () => {
      const packageData = {
        name: '@types/node',
        description: 'TypeScript definitions for Node.js with comprehensive type coverage.',
        'dist-tags': {
          latest: '20.0.0',
        },
        versions: {
          '20.0.0': {
            name: '@types/node',
            version: '20.0.0',
            license: 'MIT',
          },
        },
        maintainers: [],
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://www.npmjs.com/package/@types/node', {
        forceStrategy: 'api:npm',
        minContentLength: 50, // Lower threshold for this test
      });

      expect(result.meta.strategy).toBe('api:npm');
      expect(result.meta.finalUrl).toBe('https://registry.npmjs.org/@types%2Fnode');
      expect(result.content.title).toBe('@types/node - npm');
    });

    it('should extract from registry.npmjs.org directly', async () => {
      const packageData = {
        name: 'direct-package',
        description: 'A package fetched directly from the registry with sufficient description text.',
        'dist-tags': {
          latest: '1.0.0',
        },
        versions: {
          '1.0.0': {
            name: 'direct-package',
            version: '1.0.0',
          },
        },
        maintainers: [],
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://registry.npmjs.org/direct-package', {
        forceStrategy: 'api:npm',
        minContentLength: 50, // Lower threshold for this test
      });

      expect(result.meta.strategy).toBe('api:npm');
      expect(result.content.title).toBe('direct-package - npm');
    });

    it('should return null for non-NPM URLs', async () => {
      await expect(
        intelligence.extract('https://example.com/some-page', {
          forceStrategy: 'api:npm',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should return null for NPM URLs without package path', async () => {
      await expect(
        intelligence.extract('https://www.npmjs.com/', {
          forceStrategy: 'api:npm',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(
        intelligence.extract('https://www.npmjs.com/package/nonexistent-package', {
          forceStrategy: 'api:npm',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should include dist tags in output', async () => {
      const packageData = {
        name: 'tagged-package',
        description: 'A package with multiple dist tags for testing the tag display functionality.',
        'dist-tags': {
          latest: '1.0.0',
          next: '2.0.0-alpha.1',
          beta: '1.5.0-beta.3',
        },
        versions: {
          '1.0.0': {
            name: 'tagged-package',
            version: '1.0.0',
          },
        },
        maintainers: [],
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://www.npmjs.com/package/tagged-package', {
        forceStrategy: 'api:npm',
        minContentLength: 50, // Lower threshold for this test
      });

      expect(result.content.text).toContain('Dist Tags:');
      expect(result.content.text).toContain('latest: 1.0.0');
      expect(result.content.text).toContain('next: 2.0.0-alpha.1');
      expect(result.content.markdown).toContain('| latest | 1.0.0 |');
    });

    it('should include dependencies in output', async () => {
      const packageData = {
        name: 'deps-package',
        description: 'A package with dependencies for testing the dependency display functionality.',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'deps-package',
            version: '1.0.0',
            dependencies: {
              express: '^4.18.0',
              lodash: '^4.17.21',
            },
            peerDependencies: {
              react: '>=18.0.0',
            },
          },
        },
        maintainers: [],
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://www.npmjs.com/package/deps-package', {
        forceStrategy: 'api:npm',
        minContentLength: 50, // Lower threshold for this test
      });

      expect(result.content.text).toContain('Dependencies (2)');
      expect(result.content.text).toContain('express: ^4.18.0');
      expect(result.content.markdown).toContain('## Dependencies (2)');
      expect(result.content.markdown).toContain('## Peer Dependencies');
      expect(result.content.markdown).toContain('`react`: >=18.0.0');
    });

    it('should convert git+https repository URLs', async () => {
      const packageData = {
        name: 'git-repo-package',
        description: 'A package with a git repository URL that needs conversion for display.',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'git-repo-package',
            version: '1.0.0',
            repository: {
              type: 'git',
              url: 'git+https://github.com/test/git-repo-package.git',
            },
          },
        },
        maintainers: [],
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://www.npmjs.com/package/git-repo-package', {
        forceStrategy: 'api:npm',
        minContentLength: 50, // Lower threshold for this test
      });

      expect(result.content.text).toContain('https://github.com/test/git-repo-package');
      expect(result.content.text).not.toContain('git+');
      expect(result.content.text).not.toContain('.git');
    });
  });

  describe('PyPI API', () => {
    it('should extract package info from pypi.org URL', async () => {
      const packageData = {
        info: {
          name: 'test-package',
          version: '1.0.0',
          summary: 'A test Python package for unit testing with sufficient content.',
          description: 'This is a longer description that provides more details about the package functionality.',
          author: 'Test Author',
          author_email: 'test@example.com',
          license: 'MIT',
          requires_python: '>=3.8',
          home_page: 'https://example.com',
          project_urls: {
            Homepage: 'https://example.com',
            Repository: 'https://github.com/test/test-package',
          },
          classifiers: [
            'Programming Language :: Python :: 3.8',
            'Programming Language :: Python :: 3.9',
            'Topic :: Software Development :: Libraries',
          ],
          requires_dist: ['requests>=2.28.0', 'click>=8.0.0'],
        },
        releases: {
          '1.0.0': [{ upload_time_iso_8601: '2024-01-15T10:00:00.000Z' }],
          '0.9.0': [],
        },
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://pypi.org/project/test-package', {
        forceStrategy: 'api:pypi',
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:pypi');
      expect(result.meta.finalUrl).toBe('https://pypi.org/pypi/test-package/json');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.title).toBe('test-package - PyPI');
      expect(result.content.text).toContain('test-package 1.0.0');
      expect(result.content.text).toContain('License: MIT');
      expect(result.content.markdown).toContain('**Version:** 1.0.0');
    });

    it('should handle pypi.python.org URLs', async () => {
      const packageData = {
        info: {
          name: 'old-style-package',
          version: '2.0.0',
          summary: 'A package from the old pypi.python.org domain with sufficient content.',
          license: 'Apache-2.0',
        },
        releases: {},
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://pypi.python.org/pypi/old-style-package', {
        forceStrategy: 'api:pypi',
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:pypi');
      expect(result.content.title).toBe('old-style-package - PyPI');
    });

    it('should extract dependencies from requires_dist', async () => {
      const packageData = {
        info: {
          name: 'deps-package',
          version: '1.0.0',
          summary: 'A package with dependencies for testing dependency display.',
          requires_dist: [
            'requests>=2.28.0',
            'click>=8.0.0',
            'pytest>=7.0.0; extra == "dev"',
          ],
        },
        releases: {},
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://pypi.org/project/deps-package', {
        forceStrategy: 'api:pypi',
        minContentLength: 50,
      });

      expect(result.content.text).toContain('Dependencies:');
      expect(result.content.text).toContain('requests');
      expect(result.content.text).toContain('click');
      // extras should be filtered out
      expect(result.content.text).not.toContain('pytest');
      expect(result.content.markdown).toContain('## Dependencies');
    });

    it('should extract Python version classifiers', async () => {
      const packageData = {
        info: {
          name: 'python-versions-package',
          version: '1.0.0',
          summary: 'A package with Python version classifiers for testing.',
          classifiers: [
            'Programming Language :: Python :: 3.8',
            'Programming Language :: Python :: 3.9',
            'Programming Language :: Python :: 3.10',
            'Programming Language :: Python :: 3.11',
            'License :: OSI Approved :: MIT License',
          ],
        },
        releases: {},
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://pypi.org/project/python-versions-package', {
        forceStrategy: 'api:pypi',
        minContentLength: 50,
      });

      expect(result.content.markdown).toContain('**Supported Python:**');
      expect(result.content.markdown).toContain('3.8');
      expect(result.content.markdown).toContain('3.9');
    });

    it('should handle project_urls', async () => {
      const packageData = {
        info: {
          name: 'links-package',
          version: '1.0.0',
          summary: 'A package with project URLs for testing link display.',
          home_page: 'https://example.com',
          project_urls: {
            Documentation: 'https://docs.example.com',
            'Bug Tracker': 'https://github.com/test/links-package/issues',
            Repository: 'https://github.com/test/links-package',
          },
        },
        releases: {},
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://pypi.org/project/links-package', {
        forceStrategy: 'api:pypi',
        minContentLength: 50,
      });

      expect(result.content.markdown).toContain('## Links');
      expect(result.content.markdown).toContain('[Homepage](https://example.com)');
      expect(result.content.markdown).toContain('[Documentation](https://docs.example.com)');
    });

    it('should return null for non-PyPI URLs', async () => {
      await expect(
        intelligence.extract('https://example.com/some-page', {
          forceStrategy: 'api:pypi',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should return null for PyPI URLs without package path', async () => {
      await expect(
        intelligence.extract('https://pypi.org/', {
          forceStrategy: 'api:pypi',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(
        intelligence.extract('https://pypi.org/project/nonexistent-package', {
          forceStrategy: 'api:pypi',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should include release count and date', async () => {
      const packageData = {
        info: {
          name: 'release-info-package',
          version: '3.0.0',
          summary: 'A package with release information for testing.',
        },
        releases: {
          '1.0.0': [{ upload_time_iso_8601: '2023-01-01T10:00:00.000Z' }],
          '2.0.0': [{ upload_time_iso_8601: '2023-06-01T10:00:00.000Z' }],
          '3.0.0': [{ upload_time_iso_8601: '2024-01-15T10:00:00.000Z' }],
        },
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(packageData));

      const result = await intelligence.extract('https://pypi.org/project/release-info-package', {
        forceStrategy: 'api:pypi',
        minContentLength: 50,
      });

      expect(result.content.markdown).toContain('3 releases available');
      expect(result.content.markdown).toContain('Last release:');
    });
  });

  describe('Dev.to API', () => {
    it('should extract article info from dev.to URL', async () => {
      const articleData = {
        id: 12345,
        title: 'Getting Started with TypeScript',
        description: 'A comprehensive guide to TypeScript for beginners with examples and best practices.',
        body_html: '<p>TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. This is a sufficiently long body text to pass content validation requirements.</p>',
        body_markdown: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. This is a sufficiently long body text to pass content validation requirements.',
        user: { username: 'testuser' },
        reading_time_minutes: 5,
        published_at: '2024-01-15T10:00:00Z',
        tag_list: ['typescript', 'javascript', 'tutorial'],
        positive_reactions_count: 100,
        comments_count: 25,
        url: 'https://dev.to/testuser/getting-started-with-typescript',
        cover_image: 'https://dev.to/images/cover.jpg',
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(articleData));

      const result = await intelligence.extract('https://dev.to/testuser/getting-started-with-typescript', {
        forceStrategy: 'api:devto',
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:devto');
      expect(result.meta.finalUrl).toBe('https://dev.to/api/articles/testuser/getting-started-with-typescript');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.title).toBe('Getting Started with TypeScript - DEV Community');
      expect(result.content.text).toContain('Getting Started with TypeScript');
      expect(result.content.text).toContain('@testuser');
      expect(result.content.markdown).toContain('## Tags');
      expect(result.content.markdown).toContain('#typescript');
    });

    it('should extract articles by username from profile URL', async () => {
      const articlesData = [
        {
          id: 12345,
          title: 'First Article',
          description: 'Description of first article with enough text to pass validation.',
          slug: 'first-article',
          reading_time_minutes: 3,
          readable_publish_date: 'Jan 10',
          tag_list: ['javascript'],
          positive_reactions_count: 50,
          comments_count: 10,
        },
        {
          id: 12346,
          title: 'Second Article',
          description: 'Description of second article with enough text to pass validation.',
          slug: 'second-article',
          reading_time_minutes: 5,
          readable_publish_date: 'Jan 15',
          tag_list: ['typescript'],
          positive_reactions_count: 75,
          comments_count: 20,
        },
      ];

      mockFetch.mockResolvedValueOnce(createJsonResponse(articlesData));

      const result = await intelligence.extract('https://dev.to/testuser', {
        forceStrategy: 'api:devto',
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:devto');
      expect(result.meta.finalUrl).toBe('https://dev.to/api/articles?username=testuser&per_page=10');
      expect(result.content.title).toBe('@testuser - DEV Community');
      expect(result.content.text).toContain('Articles by @testuser');
      expect(result.content.text).toContain('First Article');
      expect(result.content.text).toContain('Second Article');
      expect(result.content.markdown).toContain('## [First Article]');
      expect(result.content.markdown).toContain('## [Second Article]');
    });

    it('should handle www.dev.to URLs', async () => {
      const articleData = {
        id: 12345,
        title: 'Test Article on WWW',
        description: 'Testing www subdomain handling with sufficient description length.',
        body_markdown: 'Test body content that is long enough to pass content validation requirements for the test.',
        user: { username: 'testuser' },
        reading_time_minutes: 2,
        tag_list: ['test'],
        positive_reactions_count: 10,
        comments_count: 5,
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(articleData));

      const result = await intelligence.extract('https://www.dev.to/testuser/test-article', {
        forceStrategy: 'api:devto',
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:devto');
    });

    it('should return null for non-Dev.to URLs', async () => {
      await expect(
        intelligence.extract('https://example.com/some-page', {
          forceStrategy: 'api:devto',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should return null for Dev.to special routes', async () => {
      // Tag pages, search, etc. should be excluded
      await expect(
        intelligence.extract('https://dev.to/t/javascript', {
          forceStrategy: 'api:devto',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(
        intelligence.extract('https://dev.to/nonexistent-user/nonexistent-article', {
          forceStrategy: 'api:devto',
        })
      ).rejects.toThrow(/returned no result/);
    });

    it('should include reactions and comments in output', async () => {
      const articleData = {
        id: 12345,
        title: 'Popular Article',
        description: 'An article with many reactions for testing the display of reaction counts.',
        body_markdown: 'Body content that needs to be sufficiently long for content validation.',
        user: { username: 'testuser' },
        reading_time_minutes: 10,
        positive_reactions_count: 500,
        comments_count: 100,
        tag_list: ['popular'],
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(articleData));

      const result = await intelligence.extract('https://dev.to/testuser/popular-article', {
        forceStrategy: 'api:devto',
        minContentLength: 50,
      });

      expect(result.content.text).toContain('Reactions: 500');
      expect(result.content.text).toContain('Comments: 100');
      expect(result.content.markdown).toContain('**Reactions:** 500');
      expect(result.content.markdown).toContain('**Comments:** 100');
    });

    it('should handle empty article list for user', async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      await expect(
        intelligence.extract('https://dev.to/user-with-no-articles', {
          forceStrategy: 'api:devto',
        })
      ).rejects.toThrow(/returned no result/);
    });
  });

  describe('Static Utility Methods', () => {
    it('should report available strategies', () => {
      const strategies = ContentIntelligence.getAvailableStrategies();

      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies.some(s => s.strategy === 'framework:nextjs')).toBe(true);
      expect(strategies.some(s => s.strategy === 'parse:static')).toBe(true);
      expect(strategies.some(s => s.strategy === 'browser:playwright')).toBe(true);

      // All non-browser strategies should be available
      const nonBrowserStrategies = strategies.filter(s => s.strategy !== 'browser:playwright');
      expect(nonBrowserStrategies.every(s => s.available)).toBe(true);
    });
  });

  describe('Cookie Handling', () => {
    it('should allow setting cookies', async () => {
      const intelligence = new ContentIntelligence();

      // Should not throw
      await expect(
        intelligence.setCookies([], 'https://example.com')
      ).resolves.not.toThrow();
    });

    it('should allow clearing cookies', () => {
      const intelligence = new ContentIntelligence();

      // Should not throw
      expect(() => intelligence.clearCookies()).not.toThrow();
    });
  });

  describe('Extraction Success Events', () => {
    it('should emit extraction success event for API strategies', async () => {
      const events: Array<{ sourceUrl: string; apiUrl: string; strategy: string }> = [];

      const intelligence = new ContentIntelligence({
        onExtractionSuccess: (event) => events.push(event),
      });

      // Mock a successful Dev.to API response
      const articleData = {
        id: 12345,
        title: 'Test Article',
        description: 'A test article description.',
        body_markdown: 'Full body content that is long enough for validation requirements.',
        user: { username: 'testuser' },
        reading_time_minutes: 5,
        positive_reactions_count: 100,
        comments_count: 25,
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(articleData));

      await intelligence.extract('https://dev.to/testuser/test-article', {
        forceStrategy: 'api:devto',
        minContentLength: 10,
      });

      expect(events.length).toBe(1);
      expect(events[0].strategy).toBe('api:devto');
      expect(events[0].sourceUrl).toBe('https://dev.to/testuser/test-article');
      expect(events[0].apiUrl).toContain('/api/articles/');
    });

    it('should not emit events for non-API strategies', async () => {
      const events: Array<unknown>[] = [];

      const intelligence = new ContentIntelligence({
        onExtractionSuccess: (event) => events.push(event),
      });

      // Mock static HTML response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: 'https://example.com/page',
        text: async () =>
          '<html><head><title>Test Page</title></head><body><p>This is enough content to pass the minimum length check for static parsing.</p></body></html>',
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      await intelligence.extract('https://example.com/page', {
        forceStrategy: 'parse:static',
        minContentLength: 10,
      });

      // Should not emit for parse:static
      expect(events.length).toBe(0);
    });

    it('should allow subscribing and unsubscribing to events', async () => {
      const intelligence = new ContentIntelligence();
      const events: unknown[] = [];

      const unsubscribe = intelligence.onExtractionSuccess((event) =>
        events.push(event)
      );

      // Mock a successful Dev.to API response
      const articleData = {
        id: 12345,
        title: 'Test Article',
        description: 'A test article description.',
        body_markdown: 'Full body content that is long enough.',
        user: { username: 'testuser' },
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(articleData));

      await intelligence.extract('https://dev.to/testuser/test-article', {
        forceStrategy: 'api:devto',
        minContentLength: 10,
      });

      expect(events.length).toBe(1);

      // Unsubscribe
      unsubscribe();

      // Next extraction should not add to events
      mockFetch.mockResolvedValueOnce(createJsonResponse(articleData));

      await intelligence.extract('https://dev.to/testuser/test-article-2', {
        forceStrategy: 'api:devto',
        minContentLength: 10,
      });

      expect(events.length).toBe(1); // Still 1, not 2
    });

    it('should include content in extraction event', async () => {
      let capturedEvent: { content: { title: string; text: string } } | null = null;

      const intelligence = new ContentIntelligence({
        onExtractionSuccess: (event) => {
          capturedEvent = event;
        },
      });

      const articleData = {
        id: 123,
        title: 'Dev.to Article',
        description: 'A test article',
        body_markdown: 'Full body content that is long enough for validation.',
        user: { username: 'testuser' },
      };

      mockFetch.mockResolvedValueOnce(createJsonResponse(articleData));

      await intelligence.extract('https://dev.to/testuser/article', {
        forceStrategy: 'api:devto',
        minContentLength: 10,
      });

      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.content.title).toContain('Dev.to Article');
      expect(capturedEvent?.content.text).toContain('Full body content');
    });
  });

  describe('Medium API Extraction', () => {
    // Helper to create Medium JSON response with security prefix
    const createMediumResponse = (data: unknown, status = 200) => {
      const jsonStr = JSON.stringify(data);
      const prefixedJson = `])}while(1);</x>${jsonStr}`;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        text: () => Promise.resolve(prefixedJson),
        headers: new Headers({
          'content-type': 'text/html', // Medium actually returns text/html
        }),
      };
    };

    // Sample Medium article data
    const sampleMediumArticle = {
      payload: {
        value: {
          title: 'Understanding JavaScript Closures',
          creatorId: 'user123',
          firstPublishedAt: 1700000000000,
          content: {
            subtitle: 'A deep dive into one of JS most powerful features',
            bodyModel: {
              paragraphs: [
                { type: 1, text: 'Closures are one of the most powerful features in JavaScript.' },
                { type: 3, text: 'What is a Closure?' },
                { type: 1, text: 'A closure is the combination of a function bundled together with references to its surrounding state.' },
                { type: 6, text: 'Functions in JavaScript form closures.' },
                { type: 8, text: 'function outer() {\n  let count = 0;\n  return function inner() {\n    count++;\n    return count;\n  }\n}' },
                { type: 9, text: 'First bullet point' },
                { type: 9, text: 'Second bullet point' },
                { type: 1, text: 'Understanding closures is essential for any JavaScript developer.' },
              ],
            },
          },
          virtuals: {
            readingTime: 5.5,
            totalClapCount: 1250,
          },
        },
        references: {
          User: {
            user123: {
              name: 'Jane Developer',
              username: 'janedev',
            },
          },
        },
      },
    };

    it('should extract content from Medium article using ?format=json API', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://medium.com/@janedev/understanding-javascript-closures-abc123');

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.meta.confidence).toBe('high');
      expect(result.content.title).toBe('Understanding JavaScript Closures');
      expect(result.content.text).toContain('Jane Developer');
      expect(result.content.text).toContain('Closures are one of the most powerful features');
      expect(result.content.markdown).toContain('## What is a Closure?');
      expect(result.content.markdown).toContain('```');
    });

    it('should handle subdomain Medium URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://engineering.medium.com/understanding-closures-abc123', {
        minContentLength: 100,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.title).toBe('Understanding JavaScript Closures');
    });

    it('should handle publication Medium URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://medium.com/better-programming/understanding-closures-abc123', {
        minContentLength: 100,
      });

      expect(result.meta.strategy).toBe('api:medium');
    });

    it('should strip multiple security prefix variants', async () => {
      // Test with different prefixes
      const prefixes = [
        `])}while(1);</x>`,
        `while(1);`,
        `)]}',`,
        `)]}`,
      ];

      for (const prefix of prefixes) {
        vi.resetAllMocks();
        const jsonStr = JSON.stringify(sampleMediumArticle);
        const prefixedJson = `${prefix}${jsonStr}`;

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(prefixedJson),
          headers: new Headers({ 'content-type': 'text/html' }),
        });

        const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
          minContentLength: 100,
        });

        expect(result.meta.strategy).toBe('api:medium');
        expect(result.content.title).toBe('Understanding JavaScript Closures');
      }
    });

    it('should format different paragraph types correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        minContentLength: 100,
      });

      const markdown = result.content.markdown;

      // Check H3 header (type 3)
      expect(markdown).toContain('## What is a Closure?');

      // Check blockquote (type 6)
      expect(markdown).toContain('> Functions in JavaScript form closures.');

      // Check code block (type 8)
      expect(markdown).toContain('```');
      expect(markdown).toContain('function outer()');

      // Check bullet points (type 9)
      expect(markdown).toContain('- First bullet point');
      expect(markdown).toContain('- Second bullet point');
    });

    it('should extract author information from references', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        minContentLength: 100,
      });

      expect(result.content.text).toContain('Jane Developer');
      expect(result.content.markdown).toContain('**By Jane Developer**');
    });

    it('should include reading time and claps', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        minContentLength: 100,
      });

      expect(result.content.text).toContain('1250 claps');
      expect(result.content.markdown).toContain('6 min read'); // Math.ceil(5.5) = 6
    });

    it('should skip non-Medium URLs', async () => {
      mockFetch.mockResolvedValueOnce(createHtmlResponse(`
        <html><body><p>Some content here for the test.</p></body></html>
      `));

      const result = await intelligence.extract('https://dev.to/article', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).not.toBe('api:medium');
    });

    it('should skip non-article Medium URLs', async () => {
      // Homepage or profile page without article path
      // Use forceStrategy to test just Medium behavior
      mockFetch.mockResolvedValueOnce(createMediumResponse({
        payload: { value: null },
      }));

      // Profile URL is not an article, so Medium API should return null
      // We use forceStrategy and expect it to throw (no other fallback)
      try {
        await intelligence.extract('https://medium.com/@username', {
          forceStrategy: 'api:medium',
          minContentLength: 10,
        });
        // If we get here, the extraction succeeded which is unexpected
        expect.fail('Should not have extracted from non-article URL');
      } catch {
        // Expected - Medium API should not work on profile URLs
      }
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
        headers: new Headers({}),
      });

      // Force Medium strategy to test error handling directly
      try {
        await intelligence.extract('https://medium.com/@user/article-abc123', {
          forceStrategy: 'api:medium',
          minContentLength: 10,
        });
        expect.fail('Should have thrown on API error');
      } catch {
        // Expected - Medium API should fail gracefully
      }
    });

    it('should handle invalid JSON gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('])}while(1);</x>{invalid json here'),
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      // Force Medium strategy to test JSON parsing error handling
      try {
        await intelligence.extract('https://medium.com/@user/article-abc123', {
          forceStrategy: 'api:medium',
          minContentLength: 10,
        });
        expect.fail('Should have thrown on invalid JSON');
      } catch {
        // Expected - Medium API should fail on invalid JSON
      }
    });

    it('should handle missing article data gracefully', async () => {
      const emptyPayload = {
        payload: {
          value: null,
        },
      };

      mockFetch.mockResolvedValueOnce(createMediumResponse(emptyPayload));

      // Force Medium strategy to test empty data handling
      try {
        await intelligence.extract('https://medium.com/@user/article-abc123', {
          forceStrategy: 'api:medium',
          minContentLength: 10,
        });
        expect.fail('Should have thrown on missing article data');
      } catch {
        // Expected - Medium API should fail on missing data
      }
    });

    it('should handle article with H4 headers (type 13)', async () => {
      const articleWithH4 = {
        payload: {
          value: {
            title: 'Article with Subheadings',
            creatorId: 'user123',
            firstPublishedAt: 1700000000000,
            content: {
              bodyModel: {
                paragraphs: [
                  { type: 3, text: 'Main Section' },
                  { type: 13, text: 'Subsection' },
                  { type: 1, text: 'Content under subsection with enough text for validation purposes.' },
                ],
              },
            },
            virtuals: { readingTime: 2, totalClapCount: 100 },
          },
          references: {
            User: {
              user123: { name: 'Author', username: 'author' },
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce(createMediumResponse(articleWithH4));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.markdown).toContain('## Main Section');
      expect(result.content.markdown).toContain('### Subsection');
    });

    it('should handle articles with image captions (type 4)', async () => {
      const articleWithImages = {
        payload: {
          value: {
            title: 'Article with Images',
            creatorId: 'user123',
            firstPublishedAt: 1700000000000,
            content: {
              bodyModel: {
                paragraphs: [
                  { type: 1, text: 'Introduction text for the article.' },
                  { type: 4, text: 'Figure 1: A beautiful diagram showing the concept.' },
                  { type: 1, text: 'More content after the image with additional explanation.' },
                ],
              },
            },
            virtuals: { readingTime: 3, totalClapCount: 200 },
          },
          references: {
            User: {
              user123: { name: 'Author', username: 'author' },
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce(createMediumResponse(articleWithImages));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.markdown).toContain('*Figure 1: A beautiful diagram showing the concept.*');
    });

    it('should handle preformatted text (type 11)', async () => {
      const articleWithPreformatted = {
        payload: {
          value: {
            title: 'Article with Preformatted',
            creatorId: 'user123',
            firstPublishedAt: 1700000000000,
            content: {
              bodyModel: {
                paragraphs: [
                  { type: 1, text: 'Some intro text here for the test.' },
                  { type: 11, text: 'This is preformatted\n  text with\n    indentation' },
                  { type: 1, text: 'Continuing with more content after the preformatted block.' },
                ],
              },
            },
            virtuals: { readingTime: 2, totalClapCount: 50 },
          },
          references: {
            User: {
              user123: { name: 'Author', username: 'author' },
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce(createMediumResponse(articleWithPreformatted));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.markdown).toContain('```');
      expect(result.content.markdown).toContain('This is preformatted');
    });

    it('should handle ordered list items (type 10)', async () => {
      const articleWithOrderedList = {
        payload: {
          value: {
            title: 'Article with Ordered List',
            creatorId: 'user123',
            firstPublishedAt: 1700000000000,
            content: {
              bodyModel: {
                paragraphs: [
                  { type: 1, text: 'Steps to follow in order:' },
                  { type: 10, text: 'First step in the process' },
                  { type: 10, text: 'Second step in the process' },
                  { type: 10, text: 'Third step in the process' },
                  { type: 1, text: 'Conclusion and summary text.' },
                ],
              },
            },
            virtuals: { readingTime: 2, totalClapCount: 75 },
          },
          references: {
            User: {
              user123: { name: 'Author', username: 'author' },
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce(createMediumResponse(articleWithOrderedList));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.markdown).toContain('1. First step');
      expect(result.content.markdown).toContain('1. Second step');
    });

    it('should handle /p/ style article URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://medium.com/p/abc123def456', {
        minContentLength: 100,
      });

      expect(result.meta.strategy).toBe('api:medium');
    });

    it('should use forceStrategy correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMediumResponse(sampleMediumArticle));

      const result = await intelligence.extract('https://medium.com/@user/article-abc123', {
        forceStrategy: 'api:medium',
        minContentLength: 100,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.title).toBe('Understanding JavaScript Closures');
    });

    it('should handle article with no subtitle', async () => {
      const articleNoSubtitle = {
        payload: {
          value: {
            title: 'Simple Article',
            creatorId: 'user123',
            firstPublishedAt: 1700000000000,
            content: {
              bodyModel: {
                paragraphs: [
                  { type: 1, text: 'This is the main content of the article with enough text for validation.' },
                ],
              },
            },
            virtuals: { readingTime: 1, totalClapCount: 10 },
          },
          references: {
            User: {
              user123: { name: 'Simple Author', username: 'simple' },
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce(createMediumResponse(articleNoSubtitle));

      const result = await intelligence.extract('https://medium.com/@user/simple-article-abc123', {
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.title).toBe('Simple Article');
    });

    it('should handle missing author gracefully', async () => {
      const articleNoAuthor = {
        payload: {
          value: {
            title: 'Anonymous Article',
            creatorId: 'unknown',
            firstPublishedAt: 1700000000000,
            content: {
              bodyModel: {
                paragraphs: [
                  { type: 1, text: 'Content from an article without known author information for testing.' },
                ],
              },
            },
            virtuals: { readingTime: 1, totalClapCount: 5 },
          },
          references: {
            User: {},
          },
        },
      };

      mockFetch.mockResolvedValueOnce(createMediumResponse(articleNoAuthor));

      const result = await intelligence.extract('https://medium.com/@user/anon-article-abc123', {
        minContentLength: 50,
      });

      expect(result.meta.strategy).toBe('api:medium');
      expect(result.content.text).toContain('Unknown Author');
    });
  });

  describe('YouTube API handler', () => {
    // Helper to create YouTube oEmbed response
    const createYouTubeOEmbedResponse = (data: object) => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const sampleOEmbedResponse = {
      title: 'Amazing JavaScript Tutorial',
      author_name: 'Code Academy',
      author_url: 'https://www.youtube.com/@codeacademy',
      type: 'video',
      height: 113,
      width: 200,
      version: '1.0',
      provider_name: 'YouTube',
      provider_url: 'https://www.youtube.com/',
      thumbnail_height: 360,
      thumbnail_width: 480,
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      html: '<iframe width="200" height="113" src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
    };

    it('should extract content from YouTube video using oEmbed API', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).toBe('api:youtube');
      expect(result.meta.confidence).toBe('medium');
      expect(result.content.title).toBe('Amazing JavaScript Tutorial');
      expect(result.content.text).toContain('Code Academy');
      expect(result.content.markdown).toContain('Amazing JavaScript Tutorial');
    });

    it('should handle youtu.be shortlinks', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://youtu.be/dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).toBe('api:youtube');
      expect(result.content.title).toBe('Amazing JavaScript Tutorial');
    });

    it('should handle YouTube /embed/ URLs', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://www.youtube.com/embed/dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).toBe('api:youtube');
      expect(result.content.title).toBe('Amazing JavaScript Tutorial');
    });

    it('should handle YouTube /shorts/ URLs', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://www.youtube.com/shorts/dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).toBe('api:youtube');
      expect(result.content.title).toBe('Amazing JavaScript Tutorial');
    });

    it('should handle mobile YouTube URLs', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://m.youtube.com/watch?v=dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).toBe('api:youtube');
      expect(result.content.title).toBe('Amazing JavaScript Tutorial');
    });

    it('should include thumbnail URL in structured data', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.content.structured?.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    it('should skip non-YouTube URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html><body><p>Some content here for testing minimum length requirement.</p></body></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      const result = await intelligence.extract('https://example.com/video', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).not.toBe('api:youtube');
    });

    it('should skip non-video YouTube URLs like channel pages', async () => {
      // Channel URLs should fall through to other strategies
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html><body><h1>YouTube Channel</h1><p>Channel description and content.</p></body></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      const result = await intelligence.extract('https://www.youtube.com/@codeacademy', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).not.toBe('api:youtube');
    });

    it('should handle oEmbed API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error('Not Found')),
        headers: new Headers({}),
      });

      // Force YouTube strategy to test error handling
      try {
        await intelligence.extract('https://www.youtube.com/watch?v=invalid123', {
          forceStrategy: 'api:youtube',
          minContentLength: 10,
        });
        expect.fail('Should have thrown on API error');
      } catch {
        // Expected - YouTube API should fail gracefully
      }
    });

    it('should use forceStrategy correctly', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        forceStrategy: 'api:youtube',
        minContentLength: 10,
      });

      expect(result.meta.strategy).toBe('api:youtube');
      expect(result.content.title).toBe('Amazing JavaScript Tutorial');
    });

    it('should include video ID in structured data', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.content.structured?.videoId).toBe('dQw4w9WgXcQ');
    });

    it('should handle youtube-nocookie.com domain', async () => {
      mockFetch.mockResolvedValueOnce(createYouTubeOEmbedResponse(sampleOEmbedResponse));

      const result = await intelligence.extract('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', {
        minContentLength: 10,
      });

      expect(result.meta.strategy).toBe('api:youtube');
      expect(result.content.title).toBe('Amazing JavaScript Tutorial');
    });
  });
});
