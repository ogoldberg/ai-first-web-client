/**
 * Tests for Domain Presets with Pagination Configuration (INT-005)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  findPreset,
  getPaginationPreset,
  hasPaginationPreset,
  getDomainsWithPagination,
  ALL_PRESETS,
  LEGAL_PRESETS,
  SPAIN_PRESETS,
  EU_PRESETS,
  presetRegistry,
  type PaginationPresetConfig,
} from '../../src/utils/domain-presets.js';

// ============================================
// PAGINATION PRESET INTERFACE TESTS
// ============================================

describe('PaginationPresetConfig Interface', () => {
  describe('LEGAL_PRESETS', () => {
    it('should have pagination configuration for all legal presets', () => {
      for (const preset of LEGAL_PRESETS) {
        expect(preset.pagination).toBeDefined();
        expect(preset.pagination!.type).toBeDefined();
      }
    });

    it('should include expected legal document sites', () => {
      const legalDomains = LEGAL_PRESETS.map((p) => p.domain);
      expect(legalDomains).toContain('legislation.gov.uk');
      expect(legalDomains).toContain('gesetze-im-internet.de');
      expect(legalDomains).toContain('legifrance.gouv.fr');
      expect(legalDomains).toContain('normattiva.it');
      expect(legalDomains).toContain('rechtspraak.nl');
      expect(legalDomains).toContain('curia.europa.eu');
    });
  });

  describe('SPAIN_PRESETS with pagination', () => {
    it('should have pagination configuration for BOE', () => {
      const boe = SPAIN_PRESETS.find((p) => p.domain === 'boe.es');
      expect(boe).toBeDefined();
      expect(boe!.pagination).toBeDefined();
      expect(boe!.pagination!.paramName).toBe('p');
      expect(boe!.pagination!.type).toBe('query_param');
      expect(boe!.pagination!.startValue).toBe(1);
      expect(boe!.pagination!.increment).toBe(1);
    });

    it('should have date configuration for BOE', () => {
      const boe = SPAIN_PRESETS.find((p) => p.domain === 'boe.es');
      expect(boe!.pagination!.dateConfig).toBeDefined();
      expect(boe!.pagination!.dateConfig!.paramName).toBe('f');
      expect(boe!.pagination!.dateConfig!.format).toBe('YYYYMMDD');
      expect(boe!.pagination!.dateConfig!.direction).toBe('newest_first');
    });
  });

  describe('EU_PRESETS with pagination', () => {
    it('should have pagination configuration for EUR-Lex', () => {
      const eurlex = EU_PRESETS.find((p) => p.domain === 'eur-lex.europa.eu');
      expect(eurlex).toBeDefined();
      expect(eurlex!.pagination).toBeDefined();
      expect(eurlex!.pagination!.paramName).toBe('page');
      expect(eurlex!.pagination!.responseDataPath).toBe('results');
      expect(eurlex!.pagination!.totalCountPath).toBe('totalHits');
      expect(eurlex!.pagination!.hasMorePath).toBe('hasMore');
    });

    it('should have date configuration for EUR-Lex', () => {
      const eurlex = EU_PRESETS.find((p) => p.domain === 'eur-lex.europa.eu');
      expect(eurlex!.pagination!.dateConfig).toBeDefined();
      expect(eurlex!.pagination!.dateConfig!.paramName).toBe('DD');
      expect(eurlex!.pagination!.dateConfig!.format).toBe('YYYY-MM-DD');
    });
  });
});

// ============================================
// HELPER FUNCTION TESTS
// ============================================

describe('getPaginationPreset', () => {
  it('should return pagination config for BOE', () => {
    const preset = getPaginationPreset('https://www.boe.es/buscar/');
    expect(preset).toBeDefined();
    expect(preset!.paramName).toBe('p');
    expect(preset!.type).toBe('query_param');
  });

  it('should return pagination config for EUR-Lex', () => {
    const preset = getPaginationPreset('https://eur-lex.europa.eu/search.html');
    expect(preset).toBeDefined();
    expect(preset!.paramName).toBe('page');
    expect(preset!.responseDataPath).toBe('results');
  });

  it('should return pagination config for legal presets', () => {
    const legislationUK = getPaginationPreset('https://www.legislation.gov.uk/');
    expect(legislationUK).toBeDefined();
    expect(legislationUK!.itemsPerPage).toBe(20);

    const legifrance = getPaginationPreset('https://www.legifrance.gouv.fr/');
    expect(legifrance).toBeDefined();
    expect(legifrance!.paramName).toBe('page');
  });

  it('should return undefined for domains without pagination config', () => {
    const preset = getPaginationPreset('https://www.google.com/');
    expect(preset).toBeUndefined();
  });

  it('should handle subdomains correctly', () => {
    // sede.boe.es should match boe.es
    const preset = getPaginationPreset('https://sede.boe.es/buscar/');
    expect(preset).toBeDefined();
  });
});

describe('hasPaginationPreset', () => {
  it('should return true for domains with pagination presets', () => {
    expect(hasPaginationPreset('https://www.boe.es/')).toBe(true);
    expect(hasPaginationPreset('https://eur-lex.europa.eu/')).toBe(true);
    expect(hasPaginationPreset('https://www.legislation.gov.uk/')).toBe(true);
    expect(hasPaginationPreset('https://curia.europa.eu/')).toBe(true);
  });

  it('should return false for domains without pagination presets', () => {
    expect(hasPaginationPreset('https://www.google.com/')).toBe(false);
    expect(hasPaginationPreset('https://www.example.com/')).toBe(false);
    // USCIS has a preset but no pagination config
    expect(hasPaginationPreset('https://www.uscis.gov/')).toBe(false);
  });
});

describe('getDomainsWithPagination', () => {
  it('should return list of domains with pagination presets', () => {
    const domains = getDomainsWithPagination();
    expect(domains).toContain('boe.es');
    expect(domains).toContain('eur-lex.europa.eu');
    expect(domains).toContain('legislation.gov.uk');
    expect(domains).toContain('legifrance.gouv.fr');
    expect(domains).toContain('normattiva.it');
    expect(domains).toContain('rechtspraak.nl');
    expect(domains).toContain('curia.europa.eu');
    expect(domains).toContain('gesetze-im-internet.de');
  });

  it('should not include domains without pagination config', () => {
    const domains = getDomainsWithPagination();
    // USCIS has a preset but no pagination
    expect(domains).not.toContain('uscis.gov');
    // Europa portal has no pagination config
    expect(domains).not.toContain('europa.eu');
  });
});

// ============================================
// PAGINATION TYPES TESTS
// ============================================

describe('Pagination Types', () => {
  describe('query_param type', () => {
    it('should be used for most legal sites', () => {
      const queryParamSites = ALL_PRESETS.filter(
        (p) => p.pagination?.type === 'query_param'
      );
      expect(queryParamSites.length).toBeGreaterThan(5);
    });
  });

  describe('reference_based type', () => {
    it('should be used for German law site', () => {
      const gesetze = LEGAL_PRESETS.find((p) => p.domain === 'gesetze-im-internet.de');
      expect(gesetze!.pagination!.type).toBe('reference_based');
    });
  });

  describe('date_range type', () => {
    it('should be available as a type option', () => {
      // date_range is defined but may not be used yet
      const boe = SPAIN_PRESETS.find((p) => p.domain === 'boe.es');
      // BOE uses query_param with dateConfig, not date_range type
      expect(boe!.pagination!.type).toBe('query_param');
      expect(boe!.pagination!.dateConfig).toBeDefined();
    });
  });
});

// ============================================
// NEXT BUTTON SELECTOR TESTS
// ============================================

describe('Next Button Selectors', () => {
  it('should define next button selectors for sites with button-based pagination', () => {
    const boe = SPAIN_PRESETS.find((p) => p.domain === 'boe.es');
    expect(boe!.pagination!.nextButtonSelector).toBeDefined();
    expect(boe!.pagination!.nextButtonSelector).toContain('siguiente');

    const eurlex = EU_PRESETS.find((p) => p.domain === 'eur-lex.europa.eu');
    expect(eurlex!.pagination!.nextButtonSelector).toBeDefined();
    expect(eurlex!.pagination!.nextButtonSelector).toContain('pagination-next');
  });
});

// ============================================
// ITEMS PER PAGE TESTS
// ============================================

describe('Items Per Page Configuration', () => {
  it('should define itemsPerPage for legal sites', () => {
    const legislationUK = LEGAL_PRESETS.find((p) => p.domain === 'legislation.gov.uk');
    expect(legislationUK!.pagination!.itemsPerPage).toBe(20);

    const normattiva = LEGAL_PRESETS.find((p) => p.domain === 'normattiva.it');
    expect(normattiva!.pagination!.itemsPerPage).toBe(20);

    const boe = SPAIN_PRESETS.find((p) => p.domain === 'boe.es');
    expect(boe!.pagination!.itemsPerPage).toBe(10);
  });
});

// ============================================
// PRESET REGISTRY WITH PAGINATION
// ============================================

describe('PresetRegistry with pagination', () => {
  beforeEach(() => {
    // Clear custom presets
    const domains = ['custom-legal.example.com'];
    for (const domain of domains) {
      presetRegistry.remove(domain);
    }
  });

  it('should allow adding custom presets with pagination', () => {
    presetRegistry.add({
      domain: 'custom-legal.example.com',
      name: 'Custom Legal Site',
      selectors: {
        content: 'main',
      },
      pagination: {
        type: 'query_param',
        paramName: 'seite',
        startValue: 0,
        increment: 1,
        itemsPerPage: 25,
        notes: 'Custom pagination for testing',
      },
    });

    const found = presetRegistry.find('https://custom-legal.example.com/search');
    expect(found).toBeDefined();
    expect(found!.pagination).toBeDefined();
    expect(found!.pagination!.paramName).toBe('seite');
    expect(found!.pagination!.startValue).toBe(0);
  });

  it('should find built-in presets with pagination through registry', () => {
    const boe = presetRegistry.find('https://www.boe.es/');
    expect(boe).toBeDefined();
    expect(boe!.pagination).toBeDefined();
    expect(boe!.pagination!.paramName).toBe('p');
  });
});
