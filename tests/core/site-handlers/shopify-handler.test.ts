import { describe, it, expect } from 'vitest';
import { shopifyHandler } from '../../../src/core/site-handlers/shopify-handler.js';

describe('ShopifyHandler', () => {
  describe('canHandle', () => {
    it('should match Shopify domain URLs', () => {
      expect(shopifyHandler.canHandle('https://example.myshopify.com/products/test-product')).toBe(true);
      expect(shopifyHandler.canHandle('https://store.myshopify.com/collections/all')).toBe(true);
      expect(shopifyHandler.canHandle('https://shop.myshopify.com/')).toBe(true);
    });

    it('should match URLs with /products/ path', () => {
      expect(shopifyHandler.canHandle('https://example.com/products/test')).toBe(true);
      expect(shopifyHandler.canHandle('https://anysite.com/products/widget')).toBe(true);
    });

    it('should match URLs with /collections/ path', () => {
      expect(shopifyHandler.canHandle('https://example.com/collections/all')).toBe(true);
      expect(shopifyHandler.canHandle('https://anysite.com/collections/summer')).toBe(true);
    });

    it('should not match unrelated URLs', () => {
      expect(shopifyHandler.canHandle('https://amazon.com/dp/B123')).toBe(false);
      expect(shopifyHandler.canHandle('https://example.com/')).toBe(false);
      expect(shopifyHandler.canHandle('https://google.com')).toBe(false);
      expect(shopifyHandler.canHandle('https://example.com/about')).toBe(false);
    });

    it('should have correct handler properties', () => {
      expect(shopifyHandler.name).toBe('Shopify');
      expect(shopifyHandler.strategy).toBe('api:shopify');
    });
  });

  describe('isShopifySite', () => {
    it('should detect Shopify by CDN presence', async () => {
      const { ShopifyHandler } = await import('../../../src/core/site-handlers/shopify-handler.js');
      const html = '<html><head><link href="https://cdn.shopify.com/s/files/1/theme.css"></head></html>';
      expect(ShopifyHandler.isShopifySite(html)).toBe(true);
    });

    it('should detect Shopify by Shopify.theme', async () => {
      const { ShopifyHandler } = await import('../../../src/core/site-handlers/shopify-handler.js');
      const html = '<script>Shopify.theme = { id: 123 };</script>';
      expect(ShopifyHandler.isShopifySite(html)).toBe(true);
    });

    it('should detect Shopify by ShopifyAnalytics', async () => {
      const { ShopifyHandler } = await import('../../../src/core/site-handlers/shopify-handler.js');
      const html = '<script>window.ShopifyAnalytics = {};</script>';
      expect(ShopifyHandler.isShopifySite(html)).toBe(true);
    });

    it('should not detect non-Shopify sites', async () => {
      const { ShopifyHandler } = await import('../../../src/core/site-handlers/shopify-handler.js');
      const html = '<html><head><title>Regular Site</title></head><body>Hello</body></html>';
      expect(ShopifyHandler.isShopifySite(html)).toBe(false);
    });
  });
});
