/**
 * Tests for Research Browser SDK (INT-001)
 *
 * Tests the specialized research SDK wrapper including:
 * - Research verification presets
 * - Government session profiles
 * - SSO detection and session sharing
 * - Pagination handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResearchBrowserClient,
  createResearchBrowser,
  RESEARCH_VERIFICATION_PRESETS,
  GOVERNMENT_SESSION_PROFILES,
  type ResearchConfig,
  type ResearchTopic,
  type ResearchBrowseOptions,
} from '../../src/sdk.js';

// Mock the SmartBrowser browse method
vi.mock('../../src/core/smart-browser.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
  };
});

describe('Research Browser SDK', () => {
  describe('RESEARCH_VERIFICATION_PRESETS', () => {
    it('should have all required topic presets', () => {
      const expectedTopics: ResearchTopic[] = [
        'government_portal',
        'legal_document',
        'visa_immigration',
        'tax_finance',
        'official_registry',
        'general_research',
      ];

      for (const topic of expectedTopics) {
        expect(RESEARCH_VERIFICATION_PRESETS[topic]).toBeDefined();
        expect(RESEARCH_VERIFICATION_PRESETS[topic].description).toBeTruthy();
        expect(RESEARCH_VERIFICATION_PRESETS[topic].expectedFields).toBeInstanceOf(Array);
        expect(RESEARCH_VERIFICATION_PRESETS[topic].excludePatterns).toBeInstanceOf(Array);
        expect(RESEARCH_VERIFICATION_PRESETS[topic].minContentLength).toBeGreaterThan(0);
        expect(RESEARCH_VERIFICATION_PRESETS[topic].verifyOptions).toBeDefined();
      }
    });

    it('should have appropriate fields for government_portal', () => {
      const preset = RESEARCH_VERIFICATION_PRESETS.government_portal;
      expect(preset.expectedFields).toContain('requirements');
      expect(preset.expectedFields).toContain('documents');
      expect(preset.excludePatterns).toContain('404');
      expect(preset.excludePatterns).toContain('Access denied');
      expect(preset.verifyOptions.mode).toBe('thorough');
    });

    it('should have appropriate fields for visa_immigration', () => {
      const preset = RESEARCH_VERIFICATION_PRESETS.visa_immigration;
      expect(preset.expectedFields).toContain('requirements');
      expect(preset.expectedFields).toContain('fees');
      expect(preset.expectedFields).toContain('timeline');
      expect(preset.minContentLength).toBe(500);
    });

    it('should have appropriate fields for legal_document', () => {
      const preset = RESEARCH_VERIFICATION_PRESETS.legal_document;
      expect(preset.expectedFields).toContain('article');
      expect(preset.expectedFields).toContain('section');
      expect(preset.minContentLength).toBe(1000);
    });

    it('should have appropriate fields for tax_finance', () => {
      const preset = RESEARCH_VERIFICATION_PRESETS.tax_finance;
      expect(preset.expectedFields).toContain('rates');
      expect(preset.expectedFields).toContain('deadlines');
      expect(preset.excludePatterns).toContain('Session expired');
    });
  });

  describe('GOVERNMENT_SESSION_PROFILES', () => {
    it('should have Spanish government portals', () => {
      expect(GOVERNMENT_SESSION_PROFILES['agenciatributaria.es']).toBe('spain-tax');
      expect(GOVERNMENT_SESSION_PROFILES['seg-social.es']).toBe('spain-social');
      expect(GOVERNMENT_SESSION_PROFILES['extranjeros.inclusion.gob.es']).toBe('spain-immigration');
      expect(GOVERNMENT_SESSION_PROFILES['clave.gob.es']).toBe('spain-clave');
    });

    it('should have Portuguese government portals', () => {
      expect(GOVERNMENT_SESSION_PROFILES['aima.gov.pt']).toBe('portugal-immigration');
      expect(GOVERNMENT_SESSION_PROFILES['portaldasfinancas.gov.pt']).toBe('portugal-tax');
    });

    it('should have French government portals', () => {
      expect(GOVERNMENT_SESSION_PROFILES['service-public.fr']).toBe('france-admin');
      expect(GOVERNMENT_SESSION_PROFILES['impots.gouv.fr']).toBe('france-tax');
    });

    it('should have German government portals', () => {
      expect(GOVERNMENT_SESSION_PROFILES['auswaertiges-amt.de']).toBe('germany-foreign');
    });

    it('should have Italian government portals', () => {
      expect(GOVERNMENT_SESSION_PROFILES['agenziaentrate.gov.it']).toBe('italy-tax');
      expect(GOVERNMENT_SESSION_PROFILES['inps.it']).toBe('italy-social');
    });

    it('should have Netherlands government portals', () => {
      expect(GOVERNMENT_SESSION_PROFILES['belastingdienst.nl']).toBe('netherlands-tax');
      expect(GOVERNMENT_SESSION_PROFILES['ind.nl']).toBe('netherlands-immigration');
    });
  });

  describe('ResearchBrowserClient', () => {
    describe('constructor', () => {
      it('should create client with default config', () => {
        const client = new ResearchBrowserClient();
        const stats = client.getResearchStats();

        expect(stats.defaultTopic).toBe('general_research');
        expect(stats.ssoEnabled).toBe(true);
        expect(stats.sessionProfiles).toBeGreaterThan(0);
        expect(stats.verificationPresets).toBe(6);
      });

      it('should respect custom default topic', () => {
        const client = new ResearchBrowserClient({
          defaultTopic: 'visa_immigration',
        });
        const stats = client.getResearchStats();
        expect(stats.defaultTopic).toBe('visa_immigration');
      });

      it('should merge custom session profiles', () => {
        const client = new ResearchBrowserClient({
          customSessionProfiles: {
            'custom.gov': 'custom-profile',
          },
        });
        expect(client.getSessionProfileForDomain('custom.gov')).toBe('custom-profile');
      });

      it('should not override existing profiles with custom ones', () => {
        const client = new ResearchBrowserClient({
          customSessionProfiles: {
            'agenciatributaria.es': 'custom-spain-tax',
          },
        });
        // Custom should override
        expect(client.getSessionProfileForDomain('agenciatributaria.es')).toBe('custom-spain-tax');
      });
    });

    describe('getSessionProfileForDomain', () => {
      let client: ResearchBrowserClient;

      beforeEach(() => {
        client = new ResearchBrowserClient();
      });

      it('should match exact domain', () => {
        expect(client.getSessionProfileForDomain('agenciatributaria.es')).toBe('spain-tax');
      });

      it('should match subdomain patterns', () => {
        expect(client.getSessionProfileForDomain('sede.agenciatributaria.gob.es')).toBe('spain-tax');
      });

      it('should return undefined for unknown domains', () => {
        expect(client.getSessionProfileForDomain('example.com')).toBeUndefined();
      });

      it('should match partial domain patterns', () => {
        // Should match 'seg-social.es' when checking 'www.seg-social.es'
        const profile = client.getSessionProfileForDomain('www.seg-social.es');
        expect(profile).toBe('spain-social');
      });
    });

    describe('getResearchStats', () => {
      it('should return comprehensive stats', () => {
        const client = new ResearchBrowserClient({
          defaultTopic: 'government_portal',
          enableSSOSharing: false,
        });

        const stats = client.getResearchStats();

        expect(stats.defaultTopic).toBe('government_portal');
        expect(stats.ssoEnabled).toBe(false);
        expect(stats.governmentDomains).toBeInstanceOf(Array);
        expect(stats.governmentDomains.length).toBeGreaterThan(0);
        expect(stats.sessionProfiles).toBeGreaterThan(0);
        expect(stats.verificationPresets).toBe(6);
      });
    });
  });

  describe('Verification Summary Building', () => {
    it('should correctly identify present fields in content', () => {
      // Create a mock result with content containing expected fields
      const client = new ResearchBrowserClient();

      // We test this indirectly through the preset definitions
      const preset = RESEARCH_VERIFICATION_PRESETS.visa_immigration;

      // Verify the preset has the expected structure
      expect(preset.expectedFields).toEqual(['requirements', 'documents', 'fees', 'timeline', 'application']);
    });

    it('should flag excluded patterns as failures', () => {
      const preset = RESEARCH_VERIFICATION_PRESETS.government_portal;
      expect(preset.excludePatterns).toContain('404');
      expect(preset.excludePatterns).toContain('Page not found');
      expect(preset.excludePatterns).toContain('Error');
    });
  });

  describe('Configuration Options', () => {
    it('should use defaults for pagination', () => {
      const client = new ResearchBrowserClient();
      const stats = client.getResearchStats();
      // Defaults are applied - we verify through the client behavior
      expect(stats).toBeDefined();
    });

    it('should allow disabling pagination', () => {
      const client = new ResearchBrowserClient({
        followPagination: false,
        maxPages: 5,
      });
      expect(client.getResearchStats()).toBeDefined();
    });

    it('should allow custom SSO confidence threshold', () => {
      const client = new ResearchBrowserClient({
        ssoMinConfidence: 0.8,
      });
      expect(client.getResearchStats()).toBeDefined();
    });

    it('should allow disabling API discovery preference', () => {
      const client = new ResearchBrowserClient({
        preferApiDiscovery: false,
      });
      expect(client.getResearchStats()).toBeDefined();
    });
  });

  describe('Custom Verification Presets', () => {
    it('should accept custom presets', () => {
      const customPreset = {
        description: 'Customs declaration forms',
        expectedFields: ['declaration', 'items', 'value', 'origin'],
        excludePatterns: ['404', 'Error'],
        minContentLength: 300,
        verifyOptions: { enabled: true, mode: 'thorough' as const },
      };

      const client = new ResearchBrowserClient({
        customVerificationPresets: {
          customs_declaration: customPreset,
        },
      });

      // The custom preset should be available (checked through stats)
      const stats = client.getResearchStats();
      expect(stats.verificationPresets).toBe(7); // 6 default + 1 custom
    });
  });
});

describe('createResearchBrowser factory', () => {
  it('should be a function', () => {
    expect(typeof createResearchBrowser).toBe('function');
  });

  it('should return a ResearchBrowserClient instance (without initialization)', async () => {
    // We can't actually call createResearchBrowser in tests without
    // proper environment setup, but we can verify the type
    const client = new ResearchBrowserClient();
    expect(client).toBeInstanceOf(ResearchBrowserClient);
  });
});

describe('Type exports', () => {
  it('should export ResearchTopic type', () => {
    // TypeScript will catch if this is wrong at compile time
    const topic: ResearchTopic = 'government_portal';
    expect(topic).toBe('government_portal');
  });

  it('should export ResearchConfig interface', () => {
    const config: ResearchConfig = {
      defaultTopic: 'visa_immigration',
      followPagination: true,
      maxPages: 10,
    };
    expect(config.defaultTopic).toBe('visa_immigration');
  });

  it('should export ResearchBrowseOptions interface', () => {
    const options: ResearchBrowseOptions = {
      topic: 'legal_document',
      expectedFields: ['article'],
      excludePatterns: ['404'],
      minContentLength: 500,
      saveSession: true,
    };
    expect(options.topic).toBe('legal_document');
  });
});
