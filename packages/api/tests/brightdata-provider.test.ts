/**
 * Tests for Bright Data Proxy Provider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateSessionId,
  getNextCountry,
  buildBrightDataUrl,
  createBrightDataEndpoint,
  RotatingBrightDataEndpoint,
  createBrightDataEndpoints,
  parseBrightDataConfig,
  zoneToTier,
  resetBrightDataCounters,
} from '../src/services/brightdata-provider.js';

describe('Bright Data Provider', () => {
  beforeEach(() => {
    resetBrightDataCounters();
    // Clear environment variables
    delete process.env.BRIGHTDATA_AUTH;
    delete process.env.BRIGHTDATA_ZONE;
    delete process.env.BRIGHTDATA_COUNTRY;
    delete process.env.BRIGHTDATA_COUNTRIES;
    delete process.env.BRIGHTDATA_SESSION_ROTATION;
    delete process.env.BRIGHTDATA_PORT;
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      const id3 = generateSessionId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).toMatch(/^s[a-z0-9]+$/);
    });

    it('should generate session IDs with consistent format', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^s[a-z0-9]+$/);
      expect(id.length).toBeGreaterThan(10);
    });
  });

  describe('getNextCountry', () => {
    it('should rotate through countries', () => {
      resetBrightDataCounters();
      const countries = ['us', 'uk', 'de'];

      expect(getNextCountry(countries)).toBe('us');
      expect(getNextCountry(countries)).toBe('uk');
      expect(getNextCountry(countries)).toBe('de');
      expect(getNextCountry(countries)).toBe('us'); // Wraps around
    });

    it('should return empty string for empty array', () => {
      expect(getNextCountry([])).toBe('');
    });
  });

  describe('buildBrightDataUrl', () => {
    const baseConfig = { auth: 'customer123:password456' };

    it('should build basic residential URL', () => {
      const url = buildBrightDataUrl(baseConfig, { sessionId: 'test123' });
      expect(url).toBe(
        'http://customer123-zone-residential-session-test123:password456@brd.superproxy.io:22225'
      );
    });

    it('should include country when specified', () => {
      const url = buildBrightDataUrl(baseConfig, { sessionId: 'test123', country: 'us' });
      expect(url).toBe(
        'http://customer123-zone-residential-session-test123-country-us:password456@brd.superproxy.io:22225'
      );
    });

    it('should support different zones', () => {
      const url = buildBrightDataUrl(baseConfig, { sessionId: 'test123', zone: 'unblocker' });
      expect(url).toContain('-zone-unblocker-');
    });

    it('should auto-generate session ID when not provided', () => {
      const url1 = buildBrightDataUrl(baseConfig);
      const url2 = buildBrightDataUrl(baseConfig);
      expect(url1).not.toBe(url2); // Different session IDs
    });

    it('should skip session when sessionRotation is false', () => {
      const config = { ...baseConfig, sessionRotation: false };
      const url = buildBrightDataUrl(config);
      expect(url).not.toContain('-session-');
    });

    it('should use custom port when specified', () => {
      const config = { ...baseConfig, port: 33333 };
      const url = buildBrightDataUrl(config, { sessionId: 'test' });
      expect(url).toContain(':33333');
    });

    it('should throw on invalid auth format', () => {
      expect(() => buildBrightDataUrl({ auth: 'invalid' })).toThrow('Invalid Bright Data auth format');
    });
  });

  describe('createBrightDataEndpoint', () => {
    const baseConfig = { auth: 'customer123:password456', sessionRotation: false };

    it('should create endpoint with correct properties', () => {
      const endpoint = createBrightDataEndpoint(baseConfig, { country: 'us' });

      expect(endpoint.id).toContain('brightdata-residential-us');
      expect(endpoint.url).toContain('customer123');
      expect(endpoint.country).toBe('us');
      expect(endpoint.isResidential).toBe(true);
    });

    it('should mark unlocker zone as residential', () => {
      const endpoint = createBrightDataEndpoint(baseConfig, { zone: 'unblocker' });
      expect(endpoint.isResidential).toBe(true);
    });

    it('should not mark datacenter as residential', () => {
      const endpoint = createBrightDataEndpoint(baseConfig, { zone: 'datacenter' });
      expect(endpoint.isResidential).toBe(false);
    });
  });

  describe('RotatingBrightDataEndpoint', () => {
    const baseConfig = { auth: 'customer123:password456' };

    it('should generate different URLs each time', () => {
      const endpoint = new RotatingBrightDataEndpoint(baseConfig);

      const url1 = endpoint.url;
      const url2 = endpoint.url;

      // URLs should be different due to session rotation
      expect(url1).not.toBe(url2);
    });

    it('should preserve other properties', () => {
      const endpoint = new RotatingBrightDataEndpoint(baseConfig, {
        id: 'test-id',
        country: 'uk',
        zone: 'residential',
      });

      expect(endpoint.id).toBe('test-id');
      expect(endpoint.country).toBe('uk');
      expect(endpoint.isResidential).toBe(true);
    });
  });

  describe('createBrightDataEndpoints', () => {
    const baseConfig = { auth: 'customer123:password456', countries: ['us', 'uk'] };

    it('should create endpoints for each country', () => {
      const endpoints = createBrightDataEndpoints(baseConfig, { endpointsPerCountry: 1 });

      expect(endpoints.length).toBe(2);
      expect(endpoints[0].country).toBe('us');
      expect(endpoints[1].country).toBe('uk');
    });

    it('should create multiple endpoints per country', () => {
      const endpoints = createBrightDataEndpoints(baseConfig, { endpointsPerCountry: 3 });

      expect(endpoints.length).toBe(6);
    });

    it('should create global endpoint when no countries specified', () => {
      const config = { auth: 'customer123:password456' };
      const endpoints = createBrightDataEndpoints(config, { endpointsPerCountry: 2 });

      expect(endpoints.length).toBe(2);
      expect(endpoints[0].id).toContain('global');
    });

    it('should use RotatingBrightDataEndpoint when session rotation enabled', () => {
      const config = { auth: 'customer123:password456', sessionRotation: true };
      const endpoints = createBrightDataEndpoints(config, { endpointsPerCountry: 1 });

      expect(endpoints[0]).toBeInstanceOf(RotatingBrightDataEndpoint);
    });
  });

  describe('parseBrightDataConfig', () => {
    it('should return null when BRIGHTDATA_AUTH not set', () => {
      expect(parseBrightDataConfig()).toBeNull();
    });

    it('should parse basic configuration', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';

      const config = parseBrightDataConfig();

      expect(config).not.toBeNull();
      expect(config?.auth).toBe('customer:password');
      expect(config?.zone).toBe('residential');
      expect(config?.sessionRotation).toBe(true);
    });

    it('should parse zone from environment', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_ZONE = 'unblocker';

      const config = parseBrightDataConfig();

      expect(config?.zone).toBe('unblocker');
    });

    it('should parse single country', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_COUNTRY = 'us';

      const config = parseBrightDataConfig();

      expect(config?.countries).toEqual(['us']);
    });

    it('should parse multiple countries', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_COUNTRIES = 'us, uk, de';

      const config = parseBrightDataConfig();

      expect(config?.countries).toEqual(['us', 'uk', 'de']);
    });

    it('should handle trailing commas in countries list', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_COUNTRIES = 'us, uk, de,';

      const config = parseBrightDataConfig();

      expect(config?.countries).toEqual(['us', 'uk', 'de']);
    });

    it('should handle leading commas in countries list', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_COUNTRIES = ',us, uk';

      const config = parseBrightDataConfig();

      expect(config?.countries).toEqual(['us', 'uk']);
    });

    it('should handle multiple consecutive commas in countries list', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_COUNTRIES = 'us,, uk,,de';

      const config = parseBrightDataConfig();

      expect(config?.countries).toEqual(['us', 'uk', 'de']);
    });

    it('should handle whitespace-only entries in countries list', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_COUNTRIES = 'us,   , uk';

      const config = parseBrightDataConfig();

      expect(config?.countries).toEqual(['us', 'uk']);
    });

    it('should parse session rotation setting', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_SESSION_ROTATION = 'false';

      const config = parseBrightDataConfig();

      expect(config?.sessionRotation).toBe(false);
    });

    it('should parse custom port', () => {
      process.env.BRIGHTDATA_AUTH = 'customer:password';
      process.env.BRIGHTDATA_PORT = '33333';

      const config = parseBrightDataConfig();

      expect(config?.port).toBe(33333);
    });
  });

  describe('zoneToTier', () => {
    it('should map zones to correct tiers', () => {
      expect(zoneToTier('residential')).toBe('residential');
      expect(zoneToTier('unblocker')).toBe('premium');
      expect(zoneToTier('isp')).toBe('isp');
      expect(zoneToTier('datacenter')).toBe('datacenter');
    });
  });
});
