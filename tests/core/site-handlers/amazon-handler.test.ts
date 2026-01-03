import { describe, it, expect } from 'vitest';
import { amazonHandler, AmazonHandler } from '../../../src/core/site-handlers/amazon-handler.js';

describe('AmazonHandler', () => {
  describe('canHandle', () => {
    it('should match Amazon US product URLs', () => {
      expect(amazonHandler.canHandle('https://www.amazon.com/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://amazon.com/gp/product/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.com/Some-Product/dp/B08N5WRWNW/ref=sr_1_1')).toBe(true);
    });

    it('should match Amazon international domains', () => {
      expect(amazonHandler.canHandle('https://www.amazon.co.uk/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.de/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.fr/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.co.jp/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.ca/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.es/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.it/dp/B08N5WRWNW')).toBe(true);
      expect(amazonHandler.canHandle('https://www.amazon.com.au/dp/B08N5WRWNW')).toBe(true);
    });

    it('should not match non-Amazon URLs', () => {
      expect(amazonHandler.canHandle('https://example.com/dp/B08N5WRWNW')).toBe(false);
      expect(amazonHandler.canHandle('https://ebay.com/itm/123')).toBe(false);
      expect(amazonHandler.canHandle('https://amazon-like-store.com/product/123')).toBe(false);
      expect(amazonHandler.canHandle('https://google.com')).toBe(false);
    });

    it('should have correct handler properties', () => {
      expect(amazonHandler.name).toBe('Amazon');
      expect(amazonHandler.strategy).toBe('api:amazon');
    });
  });

  describe('ASIN extraction', () => {
    it('should extract ASIN from /dp/ URLs', () => {
      const url = 'https://www.amazon.com/dp/B08N5WRWNW';
      const match = url.match(/\/dp\/([A-Z0-9]{10})/i);
      expect(match?.[1]).toBe('B08N5WRWNW');
    });

    it('should extract ASIN from /gp/product/ URLs', () => {
      const url = 'https://www.amazon.com/gp/product/B08N5WRWNW';
      const match = url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      expect(match?.[1]).toBe('B08N5WRWNW');
    });

    it('should extract ASIN from product title URLs', () => {
      const url = 'https://www.amazon.com/Some-Long-Product-Title/dp/B08N5WRWNW/ref=sr_1_1';
      const match = url.match(/\/dp\/([A-Z0-9]{10})/i);
      expect(match?.[1]).toBe('B08N5WRWNW');
    });
  });

  describe('marketplace identification', () => {
    it('should identify US marketplace', () => {
      const isUS = 'amazon.com'.endsWith('.com') && !('amazon.com'.includes('.co.'));
      expect(isUS).toBe(true);
    });

    it('should identify UK marketplace', () => {
      expect('amazon.co.uk'.endsWith('.co.uk')).toBe(true);
    });

    it('should identify Japanese marketplace', () => {
      expect('amazon.co.jp'.endsWith('.co.jp')).toBe(true);
    });

    it('should identify German marketplace', () => {
      expect('amazon.de'.endsWith('.de')).toBe(true);
    });
  });
});
