/**
 * Tests for heuristics configuration module (CX-010)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getConfig,
  setConfig,
  resetConfig,
  mergeConfig,
  getDomainGroups,
  findDomainGroup,
  isStaticDomain,
  isBrowserRequired,
  hasContentMarkers,
  hasIncompleteMarkers,
  getStaticDomainPatterns,
  getBrowserRequiredPatterns,
  getContentMarkerPatterns,
  getIncompleteMarkerPatterns,
  addDomainGroup,
  addStaticDomainPattern,
  addBrowserRequiredPattern,
  exportConfig,
  importConfig,
  type HeuristicsConfig,
  type DomainPattern,
} from '../../src/utils/heuristics-config.js';
import type { DomainGroup } from '../../src/types/index.js';

describe('HeuristicsConfig', () => {
  // Reset config before each test to ensure isolation
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  describe('getConfig', () => {
    it('should return the current configuration', () => {
      const config = getConfig();
      expect(config).toBeDefined();
      expect(config.version).toBe('1.0.0');
      expect(config.domainGroups).toBeInstanceOf(Array);
      expect(config.tierRules).toBeDefined();
    });

    it('should include default domain groups', () => {
      const config = getConfig();
      const groupNames = config.domainGroups.map((g) => g.name);
      expect(groupNames).toContain('spanish_gov');
      expect(groupNames).toContain('us_gov');
      expect(groupNames).toContain('eu_gov');
    });

    it('should include default tier rules', () => {
      const config = getConfig();
      expect(config.tierRules.staticDomains.length).toBeGreaterThan(0);
      expect(config.tierRules.browserRequired.length).toBeGreaterThan(0);
      expect(config.tierRules.contentMarkers.length).toBeGreaterThan(0);
      expect(config.tierRules.incompleteMarkers.length).toBeGreaterThan(0);
    });
  });

  describe('getDomainGroups', () => {
    it('should return all domain groups', () => {
      const groups = getDomainGroups();
      expect(groups.length).toBeGreaterThanOrEqual(3);
    });

    it('should include Spanish government domains', () => {
      const groups = getDomainGroups();
      const spanishGov = groups.find((g) => g.name === 'spanish_gov');
      expect(spanishGov).toBeDefined();
      expect(spanishGov!.domains).toContain('boe.es');
      expect(spanishGov!.sharedPatterns.language).toBe('es');
    });
  });

  describe('findDomainGroup', () => {
    it('should find group by exact domain match', () => {
      const group = findDomainGroup('boe.es');
      expect(group).toBeDefined();
      expect(group!.name).toBe('spanish_gov');
    });

    it('should find group by subdomain match', () => {
      const group = findDomainGroup('www.boe.es');
      expect(group).toBeDefined();
      expect(group!.name).toBe('spanish_gov');
    });

    it('should return undefined for unknown domain', () => {
      const group = findDomainGroup('example.com');
      expect(group).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      const group = findDomainGroup('BOE.ES');
      expect(group).toBeDefined();
      expect(group!.name).toBe('spanish_gov');
    });
  });

  describe('isStaticDomain', () => {
    it('should identify .gov domains as static', () => {
      expect(isStaticDomain('example.gov')).toBe(true);
    });

    it('should identify .edu domains as static', () => {
      expect(isStaticDomain('university.edu')).toBe(true);
    });

    it('should identify docs.* subdomains as static', () => {
      expect(isStaticDomain('docs.example.com')).toBe(true);
    });

    it('should identify github.io domains as static', () => {
      expect(isStaticDomain('user.github.io')).toBe(true);
    });

    it('should not match regular domains as static', () => {
      expect(isStaticDomain('twitter.com')).toBe(false);
    });
  });

  describe('isBrowserRequired', () => {
    it('should identify Twitter as browser-required', () => {
      expect(isBrowserRequired('twitter.com')).toBe(true);
    });

    it('should identify x.com as browser-required', () => {
      expect(isBrowserRequired('x.com')).toBe(true);
    });

    it('should identify LinkedIn as browser-required', () => {
      expect(isBrowserRequired('linkedin.com')).toBe(true);
    });

    it('should identify YouTube as browser-required', () => {
      expect(isBrowserRequired('youtube.com')).toBe(true);
    });

    it('should not match regular domains as browser-required', () => {
      expect(isBrowserRequired('example.com')).toBe(false);
    });

    it('should not match .gov domains as browser-required', () => {
      expect(isBrowserRequired('uscis.gov')).toBe(false);
    });
  });

  describe('hasContentMarkers', () => {
    it('should detect article tags', () => {
      const html = '<html><body><article>Content</article></body></html>';
      expect(hasContentMarkers(html)).toBe(true);
    });

    it('should detect main tags', () => {
      const html = '<html><body><main>Content</main></body></html>';
      expect(hasContentMarkers(html)).toBe(true);
    });

    it('should detect content class', () => {
      const html = '<html><body><div class="content">Content</div></body></html>';
      expect(hasContentMarkers(html)).toBe(true);
    });

    it('should detect h1 tags', () => {
      const html = '<html><body><h1>Title</h1></body></html>';
      expect(hasContentMarkers(html)).toBe(true);
    });

    it('should detect paragraph tags', () => {
      const html = '<html><body><p>Text</p></body></html>';
      expect(hasContentMarkers(html)).toBe(true);
    });

    it('should not match empty shell HTML', () => {
      const html = '<html><body><div id="root"></div></body></html>';
      expect(hasContentMarkers(html)).toBe(false);
    });
  });

  describe('hasIncompleteMarkers', () => {
    it('should detect loading text', () => {
      const html = '<html><body>Loading...</body></html>';
      expect(hasIncompleteMarkers(html)).toBe(true);
    });

    it('should detect please wait text', () => {
      const html = '<html><body>Please wait</body></html>';
      expect(hasIncompleteMarkers(html)).toBe(true);
    });

    it('should detect empty React root', () => {
      const html = '<html><body><div id="root"></div></body></html>';
      expect(hasIncompleteMarkers(html)).toBe(true);
    });

    it('should detect empty Next.js container', () => {
      const html = '<html><body><div id="__next"> </div></body></html>';
      expect(hasIncompleteMarkers(html)).toBe(true);
    });

    it('should detect skeleton loaders', () => {
      const html = '<html><body><div class="skeleton-loader"></div></body></html>';
      expect(hasIncompleteMarkers(html)).toBe(true);
    });

    it('should not match complete content', () => {
      const html = '<html><body><article><h1>Title</h1><p>Content</p></article></body></html>';
      expect(hasIncompleteMarkers(html)).toBe(false);
    });
  });

  describe('compiled patterns', () => {
    it('should return static domain patterns as RegExp array', () => {
      const patterns = getStaticDomainPatterns();
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toBeInstanceOf(RegExp);
    });

    it('should return browser-required patterns as RegExp array', () => {
      const patterns = getBrowserRequiredPatterns();
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toBeInstanceOf(RegExp);
    });

    it('should return content marker patterns as RegExp array', () => {
      const patterns = getContentMarkerPatterns();
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toBeInstanceOf(RegExp);
    });

    it('should return incomplete marker patterns as RegExp array', () => {
      const patterns = getIncompleteMarkerPatterns();
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toBeInstanceOf(RegExp);
    });

    it('should cache compiled patterns', () => {
      const patterns1 = getStaticDomainPatterns();
      const patterns2 = getStaticDomainPatterns();
      expect(patterns1).toBe(patterns2); // Same reference
    });
  });

  describe('setConfig', () => {
    it('should update the active configuration', () => {
      const newConfig: HeuristicsConfig = {
        version: '2.0.0',
        domainGroups: [],
        tierRules: {
          staticDomains: [],
          browserRequired: [],
          contentMarkers: [],
          incompleteMarkers: [],
        },
      };
      setConfig(newConfig);
      expect(getConfig().version).toBe('2.0.0');
    });

    it('should clear cached patterns after update', () => {
      // Get initial patterns
      const initialPatterns = getStaticDomainPatterns();
      expect(initialPatterns.length).toBeGreaterThan(0);

      // Update config with empty patterns
      const newConfig: HeuristicsConfig = {
        version: '2.0.0',
        domainGroups: [],
        tierRules: {
          staticDomains: [],
          browserRequired: [],
          contentMarkers: [],
          incompleteMarkers: [],
        },
      };
      setConfig(newConfig);

      // Should get new (empty) patterns
      const newPatterns = getStaticDomainPatterns();
      expect(newPatterns.length).toBe(0);
    });
  });

  describe('mergeConfig', () => {
    it('should merge partial configuration', () => {
      const initialVersion = getConfig().version;
      mergeConfig({ version: '1.1.0' });
      expect(getConfig().version).toBe('1.1.0');
    });

    it('should append new domain groups', () => {
      const initialCount = getDomainGroups().length;
      const newGroup: DomainGroup = {
        name: 'test_group',
        domains: ['test.com'],
        sharedPatterns: {
          cookieBannerSelectors: [],
          contentSelectors: [],
          navigationSelectors: [],
        },
        lastUpdated: Date.now(),
      };
      mergeConfig({ domainGroups: [newGroup] });
      expect(getDomainGroups().length).toBe(initialCount + 1);
    });

    it('should not duplicate existing domain groups', () => {
      const initialCount = getDomainGroups().length;
      const existingGroup = getDomainGroups()[0];
      mergeConfig({ domainGroups: [existingGroup] });
      expect(getDomainGroups().length).toBe(initialCount);
    });
  });

  describe('addDomainGroup', () => {
    it('should add a new domain group', () => {
      const initialCount = getDomainGroups().length;
      const newGroup: DomainGroup = {
        name: 'custom_group',
        domains: ['custom.com', 'custom.org'],
        sharedPatterns: {
          cookieBannerSelectors: ['.cookie-accept'],
          contentSelectors: ['main'],
          navigationSelectors: ['nav'],
        },
        lastUpdated: Date.now(),
      };
      addDomainGroup(newGroup);
      expect(getDomainGroups().length).toBe(initialCount + 1);
      expect(findDomainGroup('custom.com')).toBeDefined();
    });

    it('should update existing domain group', () => {
      const initialCount = getDomainGroups().length;
      const updatedGroup: DomainGroup = {
        name: 'spanish_gov',
        domains: ['boe.es', 'new-domain.es'],
        sharedPatterns: {
          cookieBannerSelectors: ['.updated-cookie'],
          contentSelectors: ['main'],
          navigationSelectors: ['nav'],
        },
        lastUpdated: Date.now(),
      };
      addDomainGroup(updatedGroup);
      // Should replace, not add
      expect(getDomainGroups().length).toBe(initialCount);
      const group = findDomainGroup('new-domain.es');
      expect(group).toBeDefined();
      expect(group!.name).toBe('spanish_gov');
    });
  });

  describe('addStaticDomainPattern', () => {
    it('should add a new static domain pattern', () => {
      const initialCount = getStaticDomainPatterns().length;
      addStaticDomainPattern({
        pattern: '\\.custom$',
        description: 'Custom TLD',
      });
      // Reset cache by getting new patterns
      resetConfig();
      // Re-add pattern
      addStaticDomainPattern({
        pattern: '\\.custom$',
        description: 'Custom TLD',
      });
      expect(isStaticDomain('example.custom')).toBe(true);
    });
  });

  describe('addBrowserRequiredPattern', () => {
    it('should add a new browser-required pattern', () => {
      addBrowserRequiredPattern({
        pattern: 'newsite\\.com',
        description: 'New browser-required site',
      });
      expect(isBrowserRequired('newsite.com')).toBe(true);
    });
  });

  describe('exportConfig and importConfig', () => {
    it('should export configuration as JSON', () => {
      const exported = exportConfig();
      expect(exported).toBeDefined();
      expect(exported.version).toBe('1.0.0');
    });

    it('should import configuration from JSON', () => {
      const config: HeuristicsConfig = {
        version: '3.0.0',
        domainGroups: [],
        tierRules: {
          staticDomains: [{ pattern: '\\.test$', description: 'Test' }],
          browserRequired: [],
          contentMarkers: [],
          incompleteMarkers: [],
        },
      };
      importConfig(JSON.stringify(config));
      expect(getConfig().version).toBe('3.0.0');
      expect(isStaticDomain('example.test')).toBe(true);
    });

    it('should throw on invalid config JSON', () => {
      expect(() => importConfig('invalid json')).toThrow();
    });

    it('should throw on missing required fields', () => {
      expect(() => importConfig('{}')).toThrow('Invalid configuration format');
    });
  });

  describe('resetConfig', () => {
    it('should reset to default configuration', () => {
      setConfig({
        version: '99.0.0',
        domainGroups: [],
        tierRules: {
          staticDomains: [],
          browserRequired: [],
          contentMarkers: [],
          incompleteMarkers: [],
        },
      });
      expect(getConfig().version).toBe('99.0.0');

      resetConfig();
      expect(getConfig().version).toBe('1.0.0');
      expect(getDomainGroups().length).toBeGreaterThan(0);
    });
  });

  describe('pattern compilation error handling', () => {
    it('should handle invalid regex patterns gracefully', () => {
      const config: HeuristicsConfig = {
        version: '1.0.0',
        domainGroups: [],
        tierRules: {
          staticDomains: [{ pattern: '[invalid', description: 'Invalid regex' }],
          browserRequired: [],
          contentMarkers: [],
          incompleteMarkers: [],
        },
      };
      // Should not throw
      setConfig(config);
      const patterns = getStaticDomainPatterns();
      expect(patterns.length).toBe(1);
      // Should compile as escaped literal
      expect(patterns[0].test('[invalid')).toBe(true);
    });
  });
});
