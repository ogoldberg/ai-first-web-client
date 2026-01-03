import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DynamicHandlerIntegration,
  applyQuirksToFetchOptions,
  templateToStrategy,
} from '../../../src/core/dynamic-handlers/integration.js';
import { DynamicHandlerRegistry } from '../../../src/core/dynamic-handlers/registry.js';
import type { SiteQuirks } from '../../../src/core/dynamic-handlers/types.js';
import type { ContentResult } from '../../../src/core/content-intelligence.js';

describe('DynamicHandlerIntegration', () => {
  let integration: DynamicHandlerIntegration;
  let registry: DynamicHandlerRegistry;

  beforeEach(() => {
    registry = new DynamicHandlerRegistry();
    integration = new DynamicHandlerIntegration(registry);
  });

  describe('getRecommendation', () => {
    it('should return default recommendation for unknown domain', () => {
      const recommendation = integration.getRecommendation({
        url: 'https://unknown.com/page',
        domain: 'unknown.com',
      });

      expect(recommendation.template).toBe('html-scrape');
      expect(recommendation.confidence).toBeLessThan(0.5);
      expect(recommendation.needsStealth).toBe(false);
    });

    it('should detect template from HTML', () => {
      const html = `
        <html>
          <head>
            <meta name="next-head-count" content="2">
          </head>
          <body>
            <script id="__NEXT_DATA__" type="application/json">
              {"props":{}}
            </script>
            <script src="/_next/static/chunks/main.js"></script>
          </body>
        </html>
      `;

      const recommendation = integration.getRecommendation({
        url: 'https://nextjs-site.com/page',
        domain: 'nextjs-site.com',
        html,
      });

      expect(recommendation.template).toBe('nextjs-ssr');
      expect(recommendation.confidence).toBeGreaterThan(0.4); // Multiple signals
    });

    it('should include learned quirks', () => {
      // Record a failure to learn quirks
      integration.recordFailure(
        'https://protected.com/api/data',
        'Access Denied',
        { statusCode: 403 }
      );

      const recommendation = integration.getRecommendation({
        url: 'https://protected.com/api/other',
        domain: 'protected.com',
      });

      expect(recommendation.quirks).toBeDefined();
      expect(recommendation.needsStealth).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    it('should record extraction success', () => {
      const result: ContentResult = {
        content: {
          title: 'Test Page',
          text: 'This is test content',
          markdown: '# Test Page\n\nThis is test content',
        },
        meta: {
          url: 'https://example.com/page',
          finalUrl: 'https://example.com/page',
          strategy: 'parse:static',
          strategiesAttempted: ['parse:static'],
          timing: 150,
          confidence: 'high',
        },
        warnings: [],
      };

      integration.recordSuccess(
        'https://example.com/page',
        'parse:static',
        result,
        {
          duration: 150,
          selectorsUsed: ['.content', '.title'],
        }
      );

      const stats = integration.getStats();
      expect(stats.totalObservations).toBe(1);
    });

    it('should learn from multiple successes', () => {
      for (let i = 0; i < 5; i++) {
        const result: ContentResult = {
          content: {
            title: `Product ${i}`,
            text: `Description for product ${i}`,
            markdown: `# Product ${i}`,
          },
          meta: {
            url: `https://shop.com/products/${i}`,
            finalUrl: `https://shop.com/products/${i}`,
            strategy: 'api:shopify',
            strategiesAttempted: ['api:shopify'],
            timing: 100,
            confidence: 'high',
          },
          warnings: [],
        };

        integration.recordSuccess(
          `https://shop.com/products/${i}`,
          'api:shopify',
          result,
          { duration: 100 }
        );
      }

      const stats = integration.getStats();
      expect(stats.totalObservations).toBe(5);
      expect(stats.totalHandlers).toBeGreaterThanOrEqual(1);
    });
  });

  describe('recordFailure', () => {
    it('should learn quirks from failures', () => {
      integration.recordFailure(
        'https://blocked.com/api',
        'Rate limited',
        { statusCode: 429 }
      );

      const quirks = integration.getQuirks('blocked.com');
      expect(quirks?.rateLimit).toBeDefined();
    });

    it('should detect anti-bot protection', () => {
      integration.recordFailure(
        'https://protected.com/page',
        'Cloudflare challenge detected',
        { statusCode: 403 }
      );

      const quirks = integration.getQuirks('protected.com');
      expect(quirks?.antiBot?.type).toBe('cloudflare');
      expect(quirks?.stealth?.required).toBe(true);
    });
  });

  describe('hasLearnedDomain', () => {
    it('should return false for new domains', () => {
      expect(integration.hasLearnedDomain('new.com')).toBe(false);
    });

    it('should return true after learning', () => {
      integration.recordFailure(
        'https://learned.com/page',
        'error',
        { statusCode: 500 }
      );

      // Note: quirks are stored even for server errors
      // Check if we have any knowledge about the domain
      expect(integration.hasLearnedDomain('learned.com')).toBe(true);
    });
  });

  describe('updateQuirks', () => {
    it('should manually set quirks', () => {
      integration.updateQuirks('custom.com', {
        requiredHeaders: {
          'Authorization': 'Bearer token',
        },
        rateLimit: {
          requestsPerSecond: 2,
        },
      });

      const quirks = integration.getQuirks('custom.com');
      expect(quirks?.requiredHeaders?.['Authorization']).toBe('Bearer token');
      expect(quirks?.rateLimit?.requestsPerSecond).toBe(2);
    });
  });
});

describe('applyQuirksToFetchOptions', () => {
  it('should return original options if no quirks', () => {
    const options = { headers: { 'Accept': 'text/html' } };
    const result = applyQuirksToFetchOptions(undefined, options);
    expect(result).toEqual(options);
  });

  it('should add required headers', () => {
    const quirks: SiteQuirks = {
      domain: 'test.com',
      requiredHeaders: {
        'X-Custom': 'value',
        'Authorization': 'key',
      },
      confidence: 0.8,
      learnedAt: Date.now(),
      lastVerified: Date.now(),
    };

    const result = applyQuirksToFetchOptions(quirks, {
      headers: { 'Accept': 'text/html' },
    });

    expect(result.headers?.['Accept']).toBe('text/html');
    expect(result.headers?.['X-Custom']).toBe('value');
    expect(result.headers?.['Authorization']).toBe('key');
  });

  it('should enable stealth mode when required', () => {
    const quirks: SiteQuirks = {
      domain: 'protected.com',
      stealth: {
        required: true,
        reason: 'Anti-bot detection',
      },
      confidence: 0.9,
      learnedAt: Date.now(),
      lastVerified: Date.now(),
    };

    const result = applyQuirksToFetchOptions(quirks, {});
    expect(result.stealth?.enabled).toBe(true);
  });

  it('should preserve existing options while adding quirks', () => {
    const quirks: SiteQuirks = {
      domain: 'site.com',
      requiredHeaders: { 'X-New': 'new' },
      stealth: { required: true },
      confidence: 0.8,
      learnedAt: Date.now(),
      lastVerified: Date.now(),
    };

    const result = applyQuirksToFetchOptions(quirks, {
      headers: { 'X-Existing': 'existing' },
      timeout: 5000,
    });

    expect(result.headers?.['X-Existing']).toBe('existing');
    expect(result.headers?.['X-New']).toBe('new');
    expect(result.timeout).toBe(5000);
  });
});

describe('templateToStrategy', () => {
  it('should map templates to strategies correctly', () => {
    expect(templateToStrategy('shopify-like')).toBe('api:shopify');
    expect(templateToStrategy('woocommerce-like')).toBe('api:woocommerce');
    expect(templateToStrategy('nextjs-ssr')).toBe('framework:nextjs');
    expect(templateToStrategy('graphql')).toBe('api:graphql');
    expect(templateToStrategy('structured-data')).toBe('structured:jsonld');
    expect(templateToStrategy('rest-api')).toBe('api:predicted');
    expect(templateToStrategy('html-scrape')).toBe('parse:static');
  });

  it('should return null for custom template', () => {
    expect(templateToStrategy('custom')).toBeNull();
  });
});
