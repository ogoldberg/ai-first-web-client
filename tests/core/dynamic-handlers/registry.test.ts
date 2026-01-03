import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicHandlerRegistry } from '../../../src/core/dynamic-handlers/registry.js';
import type { ExtractionObservation } from '../../../src/core/dynamic-handlers/types.js';

describe('DynamicHandlerRegistry', () => {
  let registry: DynamicHandlerRegistry;

  beforeEach(() => {
    registry = new DynamicHandlerRegistry();
  });

  describe('recordObservation', () => {
    it('should store observations by domain', () => {
      const observation: ExtractionObservation = {
        url: 'https://example.com/products/test',
        domain: 'example.com',
        strategy: 'api:shopify',
        extracted: {
          title: 'Test Product',
          content: 'This is a test product description',
        },
        duration: 150,
        timestamp: Date.now(),
      };

      registry.recordObservation(observation);
      const stats = registry.getStats();
      expect(stats.totalObservations).toBe(1);
    });

    it('should learn from multiple observations', () => {
      // Record multiple observations for the same domain
      for (let i = 0; i < 5; i++) {
        const observation: ExtractionObservation = {
          url: `https://example.com/products/product-${i}`,
          domain: 'example.com',
          strategy: 'api:shopify',
          extracted: {
            title: `Product ${i}`,
            content: `Description for product ${i}`,
          },
          selectorsUsed: ['.product-title', '.product-price'],
          jsonPaths: ['$.product.title', '$.product.price'],
          duration: 100 + i * 10,
          timestamp: Date.now(),
        };

        registry.recordObservation(observation);
      }

      const stats = registry.getStats();
      expect(stats.totalObservations).toBe(5);
      // After 3 observations, a handler should be created
      expect(stats.totalHandlers).toBeGreaterThanOrEqual(1);
    });
  });

  describe('recordFailure', () => {
    it('should learn rate limit quirks from 429 errors', () => {
      registry.recordFailure(
        'https://example.com/api/products',
        'Too Many Requests',
        { statusCode: 429, strategy: 'api:predicted' }
      );

      const quirks = registry.getQuirks('example.com');
      expect(quirks).toBeDefined();
      expect(quirks?.rateLimit).toBeDefined();
      expect(quirks?.rateLimit?.requestsPerSecond).toBeLessThanOrEqual(1);
    });

    it('should learn stealth requirement from 403 errors', () => {
      registry.recordFailure(
        'https://example.com/api/products',
        'Forbidden',
        { statusCode: 403, strategy: 'api:predicted' }
      );

      const quirks = registry.getQuirks('example.com');
      expect(quirks).toBeDefined();
      expect(quirks?.stealth?.required).toBe(true);
    });

    it('should detect Cloudflare protection', () => {
      registry.recordFailure(
        'https://protected-site.com/products',
        'Blocked by Cloudflare challenge',
        { statusCode: 403 }
      );

      const quirks = registry.getQuirks('protected-site.com');
      expect(quirks).toBeDefined();
      expect(quirks?.antiBot?.type).toBe('cloudflare');
      expect(quirks?.antiBot?.severity).toBe('high');
    });
  });

  describe('findHandler', () => {
    it('should return null for unknown domains', () => {
      const match = registry.findHandler('https://unknown-site.com/page');
      expect(match).toBeNull();
    });

    it('should find handler after learning', () => {
      // Record enough observations to create a handler
      for (let i = 0; i < 5; i++) {
        registry.recordObservation({
          url: `https://shop.example.com/products/item-${i}`,
          domain: 'shop.example.com',
          strategy: 'api:shopify',
          extracted: {
            title: `Item ${i}`,
            content: `Description ${i}`,
          },
          duration: 100,
          timestamp: Date.now(),
        });
      }

      const match = registry.findHandler('https://shop.example.com/products/new-item');
      expect(match).not.toBeNull();
      expect(match?.handler.domain).toBe('shop.example.com');
    });
  });

  describe('getExtractionApproach', () => {
    it('should return default approach for unknown domains', () => {
      const approach = registry.getExtractionApproach('https://unknown.com/page');
      expect(approach.template).toBe('html-scrape');
      expect(approach.confidence).toBeLessThan(0.5);
    });

    it('should detect Shopify template from HTML', () => {
      const html = `
        <html>
          <head>
            <script src="https://cdn.shopify.com/s/files/1/theme.js"></script>
          </head>
          <body>
            <script>Shopify.theme = { id: 123 };</script>
          </body>
        </html>
      `;

      const approach = registry.getExtractionApproach(
        'https://example-store.com/products/test',
        html
      );

      expect(approach.template).toBe('shopify-like');
      expect(approach.confidence).toBeGreaterThan(0.3); // Multiple signals but normalized
    });

    it('should detect Next.js template from HTML', () => {
      const html = `
        <html>
          <head>
            <meta name="next-head-count" content="2">
          </head>
          <body>
            <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
            <script src="/_next/static/chunks/main.js"></script>
          </body>
        </html>
      `;

      const approach = registry.getExtractionApproach(
        'https://nextjs-site.com/page',
        html
      );

      expect(approach.template).toBe('nextjs-ssr');
      expect(approach.confidence).toBeGreaterThan(0.4); // Multiple signals
    });

    it('should return learned approach after observations', () => {
      // Record observations
      for (let i = 0; i < 5; i++) {
        registry.recordObservation({
          url: `https://learned-site.com/api/item-${i}`,
          domain: 'learned-site.com',
          strategy: 'api:predicted',
          extracted: {
            title: `Item ${i}`,
            content: `Content ${i}`,
          },
          apiCalls: [{
            url: `/api/items/${i}`,
            method: 'GET',
            status: 200,
            responseType: 'json',
          }],
          duration: 80,
          timestamp: Date.now(),
        });
      }

      const approach = registry.getExtractionApproach('https://learned-site.com/api/new-item');
      expect(approach.confidence).toBeGreaterThan(0.5);
      expect(approach.apis.length).toBeGreaterThan(0);
    });
  });

  describe('serialize/deserialize', () => {
    it('should serialize and deserialize correctly', () => {
      // Add some data
      for (let i = 0; i < 5; i++) {
        registry.recordObservation({
          url: `https://test-site.com/page-${i}`,
          domain: 'test-site.com',
          strategy: 'parse:static',
          extracted: {
            title: `Page ${i}`,
            content: `Content for page ${i}`,
          },
          duration: 100,
          timestamp: Date.now(),
        });
      }

      registry.recordFailure(
        'https://blocked-site.com/page',
        'Cloudflare challenge',
        { statusCode: 403 }
      );

      // Serialize
      const serialized = registry.serialize();

      // Create new registry and deserialize
      const newRegistry = new DynamicHandlerRegistry();
      newRegistry.deserialize(serialized);

      // Verify data was restored
      const stats = newRegistry.getStats();
      expect(stats.totalObservations).toBe(5);
      expect(stats.totalHandlers).toBeGreaterThanOrEqual(1);
      expect(stats.totalQuirks).toBeGreaterThanOrEqual(1);

      // Check quirks were preserved
      const quirks = newRegistry.getQuirks('blocked-site.com');
      expect(quirks?.antiBot?.type).toBe('cloudflare');
    });
  });

  describe('updateQuirks', () => {
    it('should manually update quirks', () => {
      registry.updateQuirks('custom-site.com', {
        requiredHeaders: {
          'X-API-Key': 'test-key',
        },
        stealth: {
          required: true,
          reason: 'Manual configuration',
        },
      });

      const quirks = registry.getQuirks('custom-site.com');
      expect(quirks?.requiredHeaders?.['X-API-Key']).toBe('test-key');
      expect(quirks?.stealth?.required).toBe(true);
    });

    it('should merge with existing quirks', () => {
      // First update
      registry.updateQuirks('merge-site.com', {
        rateLimit: { requestsPerSecond: 1 },
      });

      // Second update
      registry.updateQuirks('merge-site.com', {
        stealth: { required: true },
      });

      const quirks = registry.getQuirks('merge-site.com');
      expect(quirks?.rateLimit?.requestsPerSecond).toBe(1);
      expect(quirks?.stealth?.required).toBe(true);
    });
  });

  describe('hasLearnedDomain', () => {
    it('should return false for unknown domains', () => {
      expect(registry.hasLearnedDomain('unknown.com')).toBe(false);
    });

    it('should return true after learning', () => {
      registry.recordObservation({
        url: 'https://known.com/page',
        domain: 'known.com',
        strategy: 'parse:static',
        extracted: { title: 'Test', content: 'Content' },
        duration: 100,
        timestamp: Date.now(),
      });

      // Even with just one observation, we track the domain
      // (though a handler isn't created until minObservations is met)
      expect(registry.hasLearnedDomain('known.com')).toBe(false);

      // After recording quirks via failure
      registry.recordFailure('https://known.com/page', 'error', { statusCode: 403 });
      expect(registry.hasLearnedDomain('known.com')).toBe(true);
    });
  });
});
