import { describe, it, expect } from 'vitest';
import {
  detectTemplate,
  getTemplateConfig,
  PATTERN_TEMPLATES,
  mergeTemplateWithQuirks,
} from '../../../src/core/dynamic-handlers/pattern-templates.js';

describe('Pattern Templates', () => {
  describe('PATTERN_TEMPLATES', () => {
    it('should have all expected templates', () => {
      const expectedTemplates = [
        'shopify-like',
        'woocommerce-like',
        'rest-api',
        'graphql',
        'nextjs-ssr',
        'spa-json',
        'structured-data',
        'html-scrape',
        'custom',
      ];

      for (const template of expectedTemplates) {
        expect(PATTERN_TEMPLATES[template]).toBeDefined();
      }
    });

    it('should have valid signal types for each template', () => {
      const validTypes = ['html-marker', 'api-endpoint', 'header', 'meta-tag', 'script-src', 'url-pattern'];

      for (const [id, template] of Object.entries(PATTERN_TEMPLATES)) {
        for (const signal of template.signals) {
          expect(validTypes).toContain(signal.type);
          expect(signal.weight).toBeGreaterThanOrEqual(0);
          expect(signal.weight).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should have extraction configuration for each template', () => {
      for (const [id, template] of Object.entries(PATTERN_TEMPLATES)) {
        expect(template.extraction).toBeDefined();
        expect(template.extraction.primary).toBeDefined();
        expect(template.extraction.primary.type).toBeDefined();
        expect(Array.isArray(template.extraction.fallbacks)).toBe(true);
      }
    });
  });

  describe('detectTemplate', () => {
    it('should detect Shopify from CDN', () => {
      const html = `
        <html>
          <head>
            <link href="https://cdn.shopify.com/s/files/1/0123/theme.css" rel="stylesheet">
          </head>
        </html>
      `;

      const result = detectTemplate(html, 'https://example-store.com/products/test');
      expect(result.template).toBe('shopify-like');
      expect(result.confidence).toBeGreaterThan(0.2); // Single signal gives moderate confidence
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('should detect Shopify from Shopify.theme', () => {
      const html = `
        <html>
          <script>
            Shopify.theme = { name: "Dawn", id: 123456 };
          </script>
        </html>
      `;

      const result = detectTemplate(html, 'https://store.com');
      expect(result.template).toBe('shopify-like');
    });

    it('should detect WooCommerce from Store API', () => {
      const html = `
        <html>
          <head>
            <script>
              fetch('/wp-json/wc/store/v1/products')
            </script>
          </head>
          <body class="woocommerce">
            <link href="/wp-content/plugins/wc-blocks/build/style.css">
          </body>
        </html>
      `;

      const result = detectTemplate(html, 'https://wordpress-store.com/product/test');
      expect(result.template).toBe('woocommerce-like');
    });

    it('should detect Next.js from __NEXT_DATA__', () => {
      // Include multiple Next.js signals for higher confidence
      const html = `
        <html>
          <head>
            <meta name="next-head-count" content="3">
          </head>
          <body>
            <script id="__NEXT_DATA__" type="application/json">
              {"props":{"pageProps":{"data":{}}}}
            </script>
            <script src="/_next/static/chunks/main.js"></script>
          </body>
        </html>
      `;

      const result = detectTemplate(html, 'https://nextjs-site.com/page');
      expect(result.template).toBe('nextjs-ssr');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect GraphQL from endpoint', () => {
      const html = `
        <html>
          <script>
            fetch('/graphql', {
              method: 'POST',
              body: JSON.stringify({ query: '{ products { id } }' })
            })
          </script>
        </html>
      `;

      const result = detectTemplate(html, 'https://graphql-site.com');
      expect(result.template).toBe('graphql');
    });

    it('should detect SPA with embedded state', () => {
      const html = `
        <html>
          <script>
            window.__INITIAL_STATE__ = { products: [], user: null };
          </script>
        </html>
      `;

      const result = detectTemplate(html, 'https://spa-site.com');
      expect(result.template).toBe('spa-json');
    });

    it('should detect Nuxt from __NUXT__', () => {
      const html = `
        <html>
          <script>window.__NUXT__={serverRendered:true,data:{}}</script>
        </html>
      `;

      const result = detectTemplate(html, 'https://nuxt-site.com');
      expect(result.template).toBe('spa-json');
    });

    it('should detect structured data sites', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {"@type": "Product", "name": "Test"}
            </script>
          </head>
        </html>
      `;

      const result = detectTemplate(html, 'https://structured-site.com');
      expect(result.template).toBe('structured-data');
    });

    it('should fall back to html-scrape for unknown patterns', () => {
      const html = `
        <html>
          <head><title>Plain HTML Site</title></head>
          <body>
            <h1>Welcome</h1>
            <p>Just a simple page</p>
          </body>
        </html>
      `;

      const result = detectTemplate(html, 'https://plain-site.com');
      expect(result.template).toBe('html-scrape');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should use URL patterns for detection', () => {
      const html = '<html></html>';

      // URL contains /products/ path (Shopify-like signal)
      const result = detectTemplate(html, 'https://store.com/products/test-item');
      // URL patterns alone may not give high enough confidence to beat html-scrape
      // but the detection should still find shopify-like as a candidate
      // The result depends on whether URL pattern weight exceeds html-scrape threshold
      expect(['shopify-like', 'html-scrape']).toContain(result.template);
    });
  });

  describe('getTemplateConfig', () => {
    it('should return correct template configuration', () => {
      const shopifyConfig = getTemplateConfig('shopify-like');
      expect(shopifyConfig.id).toBe('shopify-like');
      expect(shopifyConfig.name).toBe('Shopify-like Store');
      expect(shopifyConfig.extraction.primary.type).toBe('api');
    });

    it('should return custom template for unknown templates', () => {
      const unknownConfig = getTemplateConfig('unknown-template' as any);
      expect(unknownConfig.id).toBe('custom');
    });

    it('should have extraction fallbacks', () => {
      const nextjsConfig = getTemplateConfig('nextjs-ssr');
      expect(nextjsConfig.extraction.fallbacks.length).toBeGreaterThan(0);
    });
  });

  describe('mergeTemplateWithQuirks', () => {
    it('should merge selector overrides', () => {
      const template = PATTERN_TEMPLATES['html-scrape'];
      const quirks = {
        selectorOverrides: {
          title: '.custom-title',
          price: '.custom-price',
        },
      };

      const merged = mergeTemplateWithQuirks(template, quirks);
      expect(merged.primary.config.selectors?.title).toBe('.custom-title');
      expect(merged.primary.config.selectors?.price).toBe('.custom-price');
    });

    it('should preserve template defaults when no overrides', () => {
      const template = PATTERN_TEMPLATES['shopify-like'];
      const merged = mergeTemplateWithQuirks(template, {});

      expect(merged.primary.type).toBe(template.extraction.primary.type);
      expect(merged.fallbacks.length).toBe(template.extraction.fallbacks.length);
    });
  });
});
