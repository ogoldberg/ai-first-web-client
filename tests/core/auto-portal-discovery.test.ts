/**
 * Tests for Auto Portal Discovery (INT-016)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AutoPortalDiscovery,
  getPortalDiscovery,
  resetPortalDiscovery,
  discoverPortals,
  getSupportedCountries,
  type PortalDiscoveryResult,
  type DiscoveredPortal,
  type SupportedCountryCode,
} from '../../src/core/auto-portal-discovery.js';
import { resetGlobalDiscoveryCache } from '../../src/utils/discovery-cache.js';

describe('AutoPortalDiscovery', () => {
  let discovery: AutoPortalDiscovery;

  beforeEach(() => {
    resetGlobalDiscoveryCache();
    resetPortalDiscovery();
    discovery = new AutoPortalDiscovery();
  });

  afterEach(() => {
    resetGlobalDiscoveryCache();
    resetPortalDiscovery();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(discovery).toBeInstanceOf(AutoPortalDiscovery);
    });
  });

  describe('getSupportedCountries', () => {
    it('should return list of supported countries', () => {
      const countries = discovery.getSupportedCountries();

      expect(countries).toBeInstanceOf(Array);
      expect(countries.length).toBeGreaterThan(20);

      // Check some known countries
      expect(countries).toContainEqual({ code: 'ES', name: 'Spain' });
      expect(countries).toContainEqual({ code: 'US', name: 'United States' });
      expect(countries).toContainEqual({ code: 'GB', name: 'United Kingdom' });
      expect(countries).toContainEqual({ code: 'DE', name: 'Germany' });
      expect(countries).toContainEqual({ code: 'FR', name: 'France' });
      expect(countries).toContainEqual({ code: 'PT', name: 'Portugal' });
    });

    it('should include EU countries', () => {
      const countries = discovery.getSupportedCountries();
      const euCountries = ['ES', 'PT', 'DE', 'FR', 'IT', 'NL', 'BE', 'AT', 'PL', 'GR'];

      for (const code of euCountries) {
        expect(countries.some(c => c.code === code)).toBe(true);
      }
    });
  });

  describe('isCountrySupported', () => {
    it('should return true for supported countries', () => {
      expect(discovery.isCountrySupported('ES')).toBe(true);
      expect(discovery.isCountrySupported('US')).toBe(true);
      expect(discovery.isCountrySupported('de')).toBe(true); // Case insensitive
    });

    it('should return false for unsupported countries', () => {
      expect(discovery.isCountrySupported('XX')).toBe(false);
      expect(discovery.isCountrySupported('ZZ')).toBe(false);
    });
  });

  describe('getCountryInfo', () => {
    it('should return country info for supported country', () => {
      const info = discovery.getCountryInfo('ES');

      expect(info).toBeDefined();
      expect(info?.code).toBe('ES');
      expect(info?.name).toBe('Spain');
      expect(info?.languages).toContain('es');
      expect(info?.govTlds).toContain('.gob.es');
      expect(info?.knownMainPortal).toBeDefined();
    });

    it('should return undefined for unsupported country', () => {
      expect(discovery.getCountryInfo('XX')).toBeUndefined();
    });
  });

  describe('discoverPortals', () => {
    it('should discover Spanish government portals', async () => {
      const result = await discovery.discoverPortals('ES');

      expect(result).toBeDefined();
      expect(result.countryCode).toBe('ES');
      expect(result.countryName).toBe('Spain');
      expect(result.portals).toBeInstanceOf(Array);
      expect(result.portals.length).toBeGreaterThan(0);
      expect(result.fromCache).toBe(false);
      expect(result.durationMs).toBeGreaterThan(0);

      // Check for known Spanish portals
      const domains = result.portals.map(p => p.domain);
      expect(domains).toContain('administracion.gob.es');
    });

    it('should discover US government portals', async () => {
      const result = await discovery.discoverPortals('US');

      expect(result.countryCode).toBe('US');
      expect(result.countryName).toBe('United States');
      expect(result.portals.length).toBeGreaterThan(0);

      // Check for known US portals
      const domains = result.portals.map(p => p.domain);
      expect(domains).toContain('usa.gov');
    });

    it('should discover UK government portals', async () => {
      const result = await discovery.discoverPortals('GB');

      expect(result.countryCode).toBe('GB');
      expect(result.portals.length).toBeGreaterThan(0);

      const domains = result.portals.map(p => p.domain);
      expect(domains).toContain('www.gov.uk');
    });

    it('should handle lowercase country codes', async () => {
      const result = await discovery.discoverPortals('es');

      expect(result.countryCode).toBe('ES');
      expect(result.portals.length).toBeGreaterThan(0);
    });

    it('should cache results', async () => {
      // First call
      const result1 = await discovery.discoverPortals('ES');
      expect(result1.fromCache).toBe(false);

      // Second call should be cached
      const result2 = await discovery.discoverPortals('ES');
      expect(result2.fromCache).toBe(true);
      expect(result2.portals.length).toBe(result1.portals.length);
    });

    it('should skip cache when requested', async () => {
      // First call
      await discovery.discoverPortals('ES');

      // Second call with skip cache
      const result = await discovery.discoverPortals('ES', { skipCache: true });
      expect(result.fromCache).toBe(false);
    });

    it('should handle unknown country gracefully', async () => {
      const result = await discovery.discoverPortals('XX');

      expect(result.countryCode).toBe('XX');
      expect(result.countryName).toBe('XX'); // Falls back to code
      expect(result.portals).toBeInstanceOf(Array);
      // May have some portals from skill pack or heuristics
    });

    it('should group portals by category', async () => {
      const result = await discovery.discoverPortals('ES');

      expect(result.byCategory).toBeDefined();
      expect(result.byCategory.visa_residence).toBeInstanceOf(Array);
      expect(result.byCategory.tax_registration).toBeInstanceOf(Array);
      expect(result.byCategory.general).toBeInstanceOf(Array);
    });

    it('should filter by category', async () => {
      const result = await discovery.discoverPortals('ES', {
        categories: ['tax_registration'],
      });

      // All portals should have tax_registration category
      for (const portal of result.portals) {
        expect(portal.categories).toContain('tax_registration');
      }
    });

    it('should filter by minimum confidence', async () => {
      const result = await discovery.discoverPortals('ES', {
        minConfidence: 0.9,
      });

      for (const portal of result.portals) {
        expect(portal.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('should include sources used', async () => {
      const result = await discovery.discoverPortals('ES');

      expect(result.sourcesUsed).toBeInstanceOf(Array);
      expect(result.sourcesUsed.length).toBeGreaterThan(0);
      expect(result.sourcesUsed).toContain('known_database');
    });
  });

  describe('portal properties', () => {
    it('should have required properties on discovered portals', async () => {
      const result = await discovery.discoverPortals('ES');
      const portal = result.portals[0];

      expect(portal).toHaveProperty('domain');
      expect(portal).toHaveProperty('url');
      expect(portal).toHaveProperty('name');
      expect(portal).toHaveProperty('description');
      expect(portal).toHaveProperty('countryCode');
      expect(portal).toHaveProperty('languages');
      expect(portal).toHaveProperty('categories');
      expect(portal).toHaveProperty('confidence');
      expect(portal).toHaveProperty('discoverySource');
      expect(portal).toHaveProperty('verified');
    });

    it('should have valid URLs', async () => {
      const result = await discovery.discoverPortals('ES');

      for (const portal of result.portals) {
        expect(portal.url).toMatch(/^https?:\/\//);
        expect(() => new URL(portal.url)).not.toThrow();
      }
    });

    it('should have confidence between 0 and 1', async () => {
      const result = await discovery.discoverPortals('ES');

      for (const portal of result.portals) {
        expect(portal.confidence).toBeGreaterThanOrEqual(0);
        expect(portal.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should have valid discovery source', async () => {
      const result = await discovery.discoverPortals('ES');
      const validSources = [
        'known_database',
        'dns_probe',
        'web_search',
        'link_discovery',
        'heuristics_config',
        'user_provided',
      ];

      for (const portal of result.portals) {
        expect(validSources).toContain(portal.discoverySource);
      }
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific country', async () => {
      // Populate cache
      await discovery.discoverPortals('ES');
      await discovery.discoverPortals('US');

      // Clear ES cache
      await discovery.clearCache('ES');

      // ES should not be cached
      const esResult = await discovery.discoverPortals('ES');
      expect(esResult.fromCache).toBe(false);

      // US should still be cached
      const usResult = await discovery.discoverPortals('US');
      expect(usResult.fromCache).toBe(true);
    });

    it('should clear all cache when no country specified', async () => {
      // Populate cache
      await discovery.discoverPortals('ES');
      await discovery.discoverPortals('US');

      // Clear all
      await discovery.clearCache();

      // Neither should be cached
      const esResult = await discovery.discoverPortals('ES');
      expect(esResult.fromCache).toBe(false);

      const usResult = await discovery.discoverPortals('US');
      expect(usResult.fromCache).toBe(false);
    });
  });

  describe('DNS probing', () => {
    it('should discover additional portals with DNS probing enabled', async () => {
      const withoutDns = await discovery.discoverPortals('ES', {
        skipCache: true,
        enableDnsProbing: false,
      });

      await discovery.clearCache('ES');

      const withDns = await discovery.discoverPortals('ES', {
        skipCache: true,
        enableDnsProbing: true,
        includeUnverified: true, // DNS probed portals are unverified
      });

      // With DNS probing should discover more (or equal) portals
      expect(withDns.portals.length).toBeGreaterThanOrEqual(withoutDns.portals.length);

      if (withDns.sourcesUsed.includes('dns_probe')) {
        // At least one DNS-probed portal should have lower confidence
        const dnsPortals = withDns.portals.filter(p => p.discoverySource === 'dns_probe');
        for (const portal of dnsPortals) {
          expect(portal.confidence).toBeLessThan(0.9);
          expect(portal.verified).toBe(false);
        }
      }
    });
  });

  describe('singleton', () => {
    it('should return same instance from getPortalDiscovery', () => {
      const instance1 = getPortalDiscovery();
      const instance2 = getPortalDiscovery();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton with resetPortalDiscovery', () => {
      const instance1 = getPortalDiscovery();
      resetPortalDiscovery();
      const instance2 = getPortalDiscovery();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('convenience functions', () => {
    it('discoverPortals should work', async () => {
      const result = await discoverPortals('ES');

      expect(result.countryCode).toBe('ES');
      expect(result.portals.length).toBeGreaterThan(0);
    });

    it('getSupportedCountries should work', () => {
      const countries = getSupportedCountries();

      expect(countries.length).toBeGreaterThan(0);
      expect(countries).toContainEqual({ code: 'ES', name: 'Spain' });
    });
  });

  describe('multiple country discovery', () => {
    it('should discover portals for multiple EU countries', async () => {
      const euCountries: SupportedCountryCode[] = ['ES', 'PT', 'DE', 'FR'];
      const results = await Promise.all(euCountries.map(code => discovery.discoverPortals(code)));

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        expect(result.countryCode).toBe(euCountries[i]);
        expect(result.portals.length).toBeGreaterThan(0);
      }
    });

    it('should maintain isolation between countries', async () => {
      const esResult = await discovery.discoverPortals('ES');
      const usResult = await discovery.discoverPortals('US');

      // ES portals should be different from US portals
      const esDomains = new Set(esResult.portals.map(p => p.domain));
      const usDomains = new Set(usResult.portals.map(p => p.domain));

      // Very little overlap expected (except maybe some .gov domains)
      const overlap = [...esDomains].filter(d => usDomains.has(d));
      expect(overlap.length).toBeLessThan(Math.min(esDomains.size, usDomains.size));
    });
  });

  describe('category inference', () => {
    it('should infer tax category from domain', async () => {
      const result = await discovery.discoverPortals('ES');

      // Find a tax-related portal
      const taxPortals = result.portals.filter(
        p => p.domain.includes('tributar') || p.domain.includes('agencia')
      );

      if (taxPortals.length > 0) {
        expect(taxPortals[0].categories).toContain('tax_registration');
      }
    });

    it('should infer visa category from domain', async () => {
      const result = await discovery.discoverPortals('ES');

      const visaPortals = result.portals.filter(p => p.domain.includes('extranjeria'));

      if (visaPortals.length > 0) {
        expect(visaPortals[0].categories).toContain('visa_residence');
      }
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and continue', async () => {
      // Even if one source fails, others should work
      const result = await discovery.discoverPortals('ES');

      expect(result).toBeDefined();
      expect(result.portals).toBeInstanceOf(Array);
    });
  });

  describe('performance', () => {
    it('should complete discovery within reasonable time', async () => {
      const startTime = Date.now();
      await discovery.discoverPortals('ES');
      const duration = Date.now() - startTime;

      // Should complete in under 5 seconds (no network calls in basic discovery)
      expect(duration).toBeLessThan(5000);
    });

    it('should return cached results quickly', async () => {
      // First call to populate cache
      await discovery.discoverPortals('ES');

      // Second call should be very fast
      const startTime = Date.now();
      await discovery.discoverPortals('ES');
      const duration = Date.now() - startTime;

      // Cached result should return in under 50ms
      expect(duration).toBeLessThan(50);
    });
  });
});
