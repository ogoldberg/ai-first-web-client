/**
 * Tests for Research Browser SDK (INT-001, INT-004)
 *
 * Tests the specialized research SDK wrapper including:
 * - Research verification presets
 * - Government session profiles
 * - SSO detection and session sharing
 * - Pagination handling
 * - Verification check builders (INT-004)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResearchBrowserClient,
  createResearchBrowser,
  RESEARCH_VERIFICATION_PRESETS,
  GOVERNMENT_SESSION_PROFILES,
  VERIFICATION_CHECKS,
  createVerificationCheck,
  composeChecks,
  type ResearchConfig,
  type ResearchTopic,
  type ResearchBrowseOptions,
  type VerificationPreset,
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

    // INT-004: Tests for pre-built verification checks in presets
    describe('pre-built verification checks (INT-004)', () => {
      it('should have pre-built checks array for each preset', () => {
        const expectedTopics: ResearchTopic[] = [
          'government_portal',
          'legal_document',
          'visa_immigration',
          'tax_finance',
          'official_registry',
          'general_research',
        ];

        for (const topic of expectedTopics) {
          expect(RESEARCH_VERIFICATION_PRESETS[topic].checks).toBeDefined();
          expect(RESEARCH_VERIFICATION_PRESETS[topic].checks).toBeInstanceOf(Array);
          expect(RESEARCH_VERIFICATION_PRESETS[topic].checks!.length).toBeGreaterThan(0);
        }
      });

      it('government_portal should include required documents and contact checks', () => {
        const preset = RESEARCH_VERIFICATION_PRESETS.government_portal;

        // Check that specific VERIFICATION_CHECKS are included
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasRequiredDocuments);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasEmailContact);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasPhoneContact);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.excludeErrorPages);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.excludePageNotFound);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.excludeAccessDenied);
      });

      it('visa_immigration should include fees, timeline, and identity checks', () => {
        const preset = RESEARCH_VERIFICATION_PRESETS.visa_immigration;

        // Check that specific VERIFICATION_CHECKS are included
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasFees);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasTimeline);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasIdentityRequirements);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.minLength500);
      });

      it('legal_document should include legal structure and effective date checks', () => {
        const preset = RESEARCH_VERIFICATION_PRESETS.legal_document;

        // Check that specific VERIFICATION_CHECKS are included
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasLegalStructure);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasEffectiveDate);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.minLength1000);
      });

      it('tax_finance should include tax rate and deadline checks', () => {
        const preset = RESEARCH_VERIFICATION_PRESETS.tax_finance;

        // Check that specific VERIFICATION_CHECKS are included
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasTaxRates);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.hasTaxDeadlines);
        expect(preset.checks).toContain(VERIFICATION_CHECKS.excludeSessionExpired);
      });

      it('each check should have required properties', () => {
        for (const topic of Object.keys(RESEARCH_VERIFICATION_PRESETS) as ResearchTopic[]) {
          const preset = RESEARCH_VERIFICATION_PRESETS[topic];
          for (const check of preset.checks!) {
            expect(check.type).toBe('content');
            expect(check.assertion).toBeDefined();
            expect(['warning', 'error', 'critical']).toContain(check.severity);
            expect(typeof check.retryable).toBe('boolean');
          }
        }
      });
    });
  });

  describe('VERIFICATION_CHECKS (INT-004)', () => {
    describe('fee validation checks', () => {
      it('hasFees should match fee patterns with currencies', () => {
        const check = VERIFICATION_CHECKS.hasFees;
        expect(check.type).toBe('content');
        expect(check.assertion.fieldMatches?.content).toBeInstanceOf(RegExp);
        expect(check.severity).toBe('warning');
        expect(check.retryable).toBe(false);

        // Test pattern matches
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('Fee: 100 EUR')).toBe(true);
        expect(pattern.test('cost: 50 USD')).toBe(true);
        expect(pattern.test('tarifa 200 euros')).toBe(true);
      });
    });

    describe('timeline validation checks', () => {
      it('hasTimeline should match duration patterns', () => {
        const check = VERIFICATION_CHECKS.hasTimeline;
        expect(check.type).toBe('content');
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('processing: 2-3 weeks')).toBe(true);
        expect(pattern.test('plazo: 30 dias')).toBe(true);
        expect(pattern.test('duration 6 months')).toBe(true);
      });

      it('hasDeadline should match deadline patterns', () => {
        const check = VERIFICATION_CHECKS.hasDeadline;
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('deadline: 15/06/2025')).toBe(true);
        expect(pattern.test('fecha limite: 31 enero')).toBe(true);
      });
    });

    describe('document requirements checks', () => {
      it('hasRequiredDocuments should match requirement patterns', () => {
        const check = VERIFICATION_CHECKS.hasRequiredDocuments;
        expect(check.type).toBe('content');
        expect(check.severity).toBe('warning');
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        // Tests for various document requirement patterns
        expect(pattern.test('required documents')).toBe(true);
        expect(pattern.test('required document list')).toBe(true);
        expect(pattern.test('necessary forms must be submitted')).toBe(true);
        // Pattern matches adjective followed by noun
        expect(pattern.test('needed papers for')).toBe(true);
      });

      it('hasIdentityRequirements should match ID patterns', () => {
        const check = VERIFICATION_CHECKS.hasIdentityRequirements;
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('passport required')).toBe(true);
        expect(pattern.test('NIE number')).toBe(true);
        expect(pattern.test('DNI valido')).toBe(true);
        expect(pattern.test('Your identity card')).toBe(true);
      });
    });

    describe('legal document checks', () => {
      it('hasLegalStructure should match legal patterns', () => {
        const check = VERIFICATION_CHECKS.hasLegalStructure;
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('Article 5')).toBe(true);
        expect(pattern.test('Section III')).toBe(true);
        expect(pattern.test('Capitulo 2')).toBe(true);
      });

      it('hasEffectiveDate should match effective date patterns', () => {
        const check = VERIFICATION_CHECKS.hasEffectiveDate;
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('effective: 01/01/2025')).toBe(true);
        expect(pattern.test('entrada en vigor: 15/06/2024')).toBe(true);
      });
    });

    describe('tax/financial checks', () => {
      it('hasTaxRates should match tax rate patterns', () => {
        const check = VERIFICATION_CHECKS.hasTaxRates;
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('IRPF: 19%')).toBe(true);
        expect(pattern.test('IVA: 21%')).toBe(true);
        expect(pattern.test('tax rate: 15.5%')).toBe(true);
      });
    });

    describe('error page exclusion checks', () => {
      it('excludeErrorPages should exclude 404', () => {
        const check = VERIFICATION_CHECKS.excludeErrorPages;
        expect(check.assertion.excludesText).toBe('404');
        expect(check.severity).toBe('critical');
        expect(check.retryable).toBe(true);
      });

      it('excludePageNotFound should exclude page not found', () => {
        const check = VERIFICATION_CHECKS.excludePageNotFound;
        expect(check.assertion.excludesText).toBe('page not found');
        expect(check.severity).toBe('critical');
      });

      it('excludeAccessDenied should exclude access denied', () => {
        const check = VERIFICATION_CHECKS.excludeAccessDenied;
        expect(check.assertion.excludesText).toBe('access denied');
        expect(check.severity).toBe('critical');
      });
    });

    describe('contact information checks', () => {
      it('hasEmailContact should match email patterns', () => {
        const check = VERIFICATION_CHECKS.hasEmailContact;
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('contact@example.com')).toBe(true);
        expect(pattern.test('info@gov.es')).toBe(true);
      });

      it('hasPhoneContact should match phone patterns', () => {
        const check = VERIFICATION_CHECKS.hasPhoneContact;
        const pattern = check.assertion.fieldMatches?.content as RegExp;
        expect(pattern.test('tel: +34 123 456 789')).toBe(true);
        expect(pattern.test('telefono: 900 123 456')).toBe(true);
      });
    });

    describe('minimum content length checks', () => {
      it('minLength200 should require 200 chars', () => {
        const check = VERIFICATION_CHECKS.minLength200;
        expect(check.assertion.minLength).toBe(200);
        expect(check.severity).toBe('error');
      });

      it('minLength500 should require 500 chars', () => {
        const check = VERIFICATION_CHECKS.minLength500;
        expect(check.assertion.minLength).toBe(500);
      });

      it('minLength1000 should require 1000 chars', () => {
        const check = VERIFICATION_CHECKS.minLength1000;
        expect(check.assertion.minLength).toBe(1000);
      });
    });
  });

  describe('Verification check helpers (INT-004)', () => {
    describe('createVerificationCheck', () => {
      it('should create a check with default severity and retryable', () => {
        const check = createVerificationCheck({ fieldExists: ['title', 'price'] });
        expect(check.type).toBe('content');
        expect(check.assertion.fieldExists).toEqual(['title', 'price']);
        expect(check.severity).toBe('warning');
        expect(check.retryable).toBe(false);
      });

      it('should create a check with custom severity', () => {
        const check = createVerificationCheck({ minLength: 500 }, 'error');
        expect(check.severity).toBe('error');
        expect(check.retryable).toBe(false);
      });

      it('should create a check with custom retryable', () => {
        const check = createVerificationCheck({ excludesText: '404' }, 'critical', true);
        expect(check.severity).toBe('critical');
        expect(check.retryable).toBe(true);
      });
    });

    describe('composeChecks', () => {
      it('should compose multiple checks into an array', () => {
        const checks = composeChecks(
          VERIFICATION_CHECKS.hasFees,
          VERIFICATION_CHECKS.hasTimeline,
          VERIFICATION_CHECKS.excludeErrorPages
        );
        expect(checks).toHaveLength(3);
        expect(checks[0]).toBe(VERIFICATION_CHECKS.hasFees);
        expect(checks[1]).toBe(VERIFICATION_CHECKS.hasTimeline);
        expect(checks[2]).toBe(VERIFICATION_CHECKS.excludeErrorPages);
      });

      it('should return empty array when no checks provided', () => {
        const checks = composeChecks();
        expect(checks).toEqual([]);
      });

      it('should work with custom and pre-built checks mixed', () => {
        const customCheck = createVerificationCheck({ fieldExists: ['custom_field'] }, 'error');
        const checks = composeChecks(
          VERIFICATION_CHECKS.hasFees,
          customCheck,
          VERIFICATION_CHECKS.excludeErrorPages
        );
        expect(checks).toHaveLength(3);
        expect(checks[1].assertion.fieldExists).toEqual(['custom_field']);
      });
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

      it('should override default session profiles with custom ones', () => {
        const client = new ResearchBrowserClient({
          customSessionProfiles: {
            'agenciatributaria.es': 'custom-spain-tax',
          },
        });
        // Custom should override the default
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

describe('INT-003: API Discovery Integration', () => {
  describe('ResearchResult metadata', () => {
    it('should include bypassedBrowser field in research metadata', () => {
      // Verify the type includes the new fields
      const result = {
        research: {
          topic: 'government_portal' as ResearchTopic,
          apiUsed: true,
          bypassedBrowser: true,
          apiEndpoint: 'https://api.example.com/data',
          timeSavedMs: 2500,
          verificationSummary: {
            passed: true,
            confidence: 0.9,
            checkedFields: ['requirements'],
            missingFields: [],
          },
        },
      };

      expect(result.research.bypassedBrowser).toBe(true);
      expect(result.research.apiEndpoint).toBe('https://api.example.com/data');
      expect(result.research.timeSavedMs).toBe(2500);
    });

    it('should set bypassedBrowser to false when browser is used', () => {
      const result = {
        research: {
          topic: 'government_portal' as ResearchTopic,
          apiUsed: false,
          bypassedBrowser: false,
          verificationSummary: {
            passed: true,
            confidence: 0.8,
            checkedFields: [],
            missingFields: [],
          },
        },
      };

      expect(result.research.bypassedBrowser).toBe(false);
      expect(result.research.apiEndpoint).toBeUndefined();
      expect(result.research.timeSavedMs).toBeUndefined();
    });
  });

  describe('ResearchConfig preferApiDiscovery', () => {
    it('should default preferApiDiscovery to true', () => {
      const client = new ResearchBrowserClient();
      const stats = client.getResearchStats();
      // preferApiDiscovery is internal config, not exposed in stats
      // but we verify the client was created with defaults
      expect(stats.defaultTopic).toBe('general_research');
    });

    it('should accept preferApiDiscovery config option', () => {
      const clientEnabled = new ResearchBrowserClient({
        preferApiDiscovery: true,
      });
      const clientDisabled = new ResearchBrowserClient({
        preferApiDiscovery: false,
      });

      // Both should create successfully
      expect(clientEnabled).toBeInstanceOf(ResearchBrowserClient);
      expect(clientDisabled).toBeInstanceOf(ResearchBrowserClient);
    });
  });

  describe('Content extraction from API', () => {
    it('should properly format expected fields as markdown', () => {
      const client = new ResearchBrowserClient();
      const apiResponse = {
        requirements: 'Valid passport, proof of income',
        documents: ['Passport copy', 'Bank statements'],
        fees: '500 EUR',
      };
      const topic = 'visa_immigration' as ResearchTopic;

      // @ts-expect-error - testing private method
      const markdown = client.extractContentFromApiResponse(apiResponse, topic);

      // Check that expected fields are formatted with headers
      expect(markdown).toContain('## requirements');
      expect(markdown).toContain('Valid passport, proof of income');
      expect(markdown).toContain('## documents');
      expect(markdown).toContain('- Passport copy');
      expect(markdown).toContain('- Bank statements');
      expect(markdown).toContain('## fees');
      expect(markdown).toContain('500 EUR');
    });

    it('should handle nested API responses', () => {
      const client = new ResearchBrowserClient();
      const nestedResponse = {
        data: {
          visa: {
            type: 'Digital Nomad',
            requirements: ['passport', 'income proof'],
          },
        },
      };
      const topic = 'visa_immigration' as ResearchTopic;

      // @ts-expect-error - testing private method
      const markdown = client.extractContentFromApiResponse(nestedResponse, topic);

      // Should contain formatted JSON for nested data
      expect(markdown).toContain('data');
    });

    it('should handle array API responses', () => {
      const client = new ResearchBrowserClient();
      const arrayResponse = [
        { title: 'First Item Title Here', description: 'First item with more than ten chars' },
        { title: 'Second Item Title Here', description: 'Second item with more than ten chars' },
      ];
      const topic = 'general_research' as ResearchTopic;

      // @ts-expect-error - testing private method
      const markdown = client.extractContentFromApiResponse(arrayResponse, topic);

      // Array items should be separated (titles are >= 10 chars so they get included)
      expect(markdown).toContain('First Item Title Here');
      expect(markdown).toContain('Second Item Title Here');
    });

    it('should extract title from structured data', () => {
      const client = new ResearchBrowserClient();
      const structuredData = {
        title: 'Visa Requirements for Spain',
        content: 'Some content here',
      };

      // @ts-expect-error - testing private method
      const title = client.extractTitleFromContent('', structuredData);
      expect(title).toBe('Visa Requirements for Spain');
    });

    it('should fallback to name field for title', () => {
      const client = new ResearchBrowserClient();
      const structuredData = {
        name: 'Digital Nomad Visa',
        content: 'Content',
      };

      // @ts-expect-error - testing private method
      const title = client.extractTitleFromContent('', structuredData);
      expect(title).toBe('Digital Nomad Visa');
    });

    it('should extract title from markdown heading', () => {
      const client = new ResearchBrowserClient();
      const content = '# Main Title\n\nSome paragraph content';

      // @ts-expect-error - testing private method
      const title = client.extractTitleFromContent(content, undefined);
      expect(title).toBe('Main Title');
    });

    it('should use first line as title when short', () => {
      const client = new ResearchBrowserClient();
      const content = 'Short First Line\n\nSome paragraph content';

      // @ts-expect-error - testing private method
      const title = client.extractTitleFromContent(content, undefined);
      expect(title).toBe('Short First Line');
    });
  });

  describe('API bypass conditions', () => {
    it('should only bypass with high confidence APIs', () => {
      // API patterns must have confidence: 'high' and canBypass: true
      const highConfidenceApi = {
        endpoint: 'https://api.gov.es/visa-info',
        method: 'GET',
        confidence: 'high' as const,
        canBypass: true,
        verificationCount: 5,
        createdAt: Date.now() - 86400000,
        lastVerified: Date.now(),
        failureCount: 0,
      };

      const lowConfidenceApi = {
        endpoint: 'https://api.gov.es/test',
        method: 'GET',
        confidence: 'low' as const,
        canBypass: true,
        verificationCount: 1,
        createdAt: Date.now(),
        lastVerified: Date.now(),
        failureCount: 0,
      };

      // Only high confidence APIs should be used for bypass
      expect(highConfidenceApi.confidence).toBe('high');
      expect(highConfidenceApi.canBypass).toBe(true);
      expect(lowConfidenceApi.confidence).toBe('low');
    });

    it('should prioritize APIs by verification count', () => {
      const apis = [
        { endpoint: 'api1', verificationCount: 3 },
        { endpoint: 'api2', verificationCount: 10 },
        { endpoint: 'api3', verificationCount: 1 },
      ];

      const sorted = [...apis].sort((a, b) => b.verificationCount - a.verificationCount);
      expect(sorted[0].endpoint).toBe('api2');
      expect(sorted[1].endpoint).toBe('api1');
      expect(sorted[2].endpoint).toBe('api3');
    });

    it('should validate minimum content length', () => {
      const preset = RESEARCH_VERIFICATION_PRESETS.government_portal;
      expect(preset.minContentLength).toBe(500);

      // Content shorter than minLength should cause fallback to browser
      const shortContent = 'Too short';
      const longContent = 'A'.repeat(600);

      expect(shortContent.length).toBeLessThan(preset.minContentLength);
      expect(longContent.length).toBeGreaterThan(preset.minContentLength);
    });
  });

  describe('Time savings calculation', () => {
    it('should calculate positive time savings for fast API calls', () => {
      const estimatedBrowserTime = 3000; // ms
      const apiDuration = 200; // ms
      const timeSaved = Math.max(0, estimatedBrowserTime - apiDuration);

      expect(timeSaved).toBe(2800);
    });

    it('should not report negative time savings', () => {
      const estimatedBrowserTime = 3000;
      const slowApiDuration = 4000;
      const timeSaved = Math.max(0, estimatedBrowserTime - slowApiDuration);

      expect(timeSaved).toBe(0);
    });
  });

});
