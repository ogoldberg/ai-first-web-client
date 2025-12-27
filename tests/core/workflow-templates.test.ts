/**
 * Tests for Research Workflow Templates (INT-006)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WORKFLOW_TEMPLATES,
  COUNTRY_PORTALS,
  VISA_TYPE_PATHS,
  VISA_RESEARCH_TEMPLATE,
  DOCUMENT_EXTRACTION_TEMPLATE,
  FEE_TRACKING_TEMPLATE,
  CROSS_COUNTRY_COMPARISON_TEMPLATE,
  TAX_OBLIGATIONS_TEMPLATE,
  resolveUrlTemplate,
  prepareVariables,
  validateVariables,
  extractFindings,
  buildWorkflowSummary,
  listTemplates,
  getTemplate,
  type WorkflowTemplate,
  type WorkflowTemplateStep,
  type WorkflowTemplateStepResult,
  type ResearchResult,
} from '../../src/sdk.js';

// ============================================
// WORKFLOW TEMPLATE STRUCTURE TESTS
// ============================================

describe('Workflow Templates Structure', () => {
  describe('WORKFLOW_TEMPLATES constant', () => {
    it('should contain all expected templates', () => {
      expect(WORKFLOW_TEMPLATES.visaResearch).toBeDefined();
      expect(WORKFLOW_TEMPLATES.documentExtraction).toBeDefined();
      expect(WORKFLOW_TEMPLATES.feeTracking).toBeDefined();
      expect(WORKFLOW_TEMPLATES.crossCountryComparison).toBeDefined();
      expect(WORKFLOW_TEMPLATES.taxObligations).toBeDefined();
    });

    it('should have 5 templates total', () => {
      const templateCount = Object.keys(WORKFLOW_TEMPLATES).length;
      expect(templateCount).toBe(5);
    });
  });

  describe('VISA_RESEARCH_TEMPLATE', () => {
    it('should have required properties', () => {
      expect(VISA_RESEARCH_TEMPLATE.id).toBe('visa_research');
      expect(VISA_RESEARCH_TEMPLATE.name).toBe('Visa Research Workflow');
      expect(VISA_RESEARCH_TEMPLATE.description).toBeDefined();
      expect(VISA_RESEARCH_TEMPLATE.tags).toContain('visa');
      expect(VISA_RESEARCH_TEMPLATE.tags).toContain('immigration');
    });

    it('should require country and visaType variables', () => {
      expect(VISA_RESEARCH_TEMPLATE.requiredVariables).toContain('country');
      expect(VISA_RESEARCH_TEMPLATE.requiredVariables).toContain('visaType');
    });

    it('should have expected steps', () => {
      const stepIds = VISA_RESEARCH_TEMPLATE.steps.map((s) => s.id);
      expect(stepIds).toContain('requirements');
      expect(stepIds).toContain('documents');
      expect(stepIds).toContain('fees');
      expect(stepIds).toContain('timeline');
      expect(stepIds).toContain('application');
    });

    it('should mark requirements and documents as critical', () => {
      const requirementsStep = VISA_RESEARCH_TEMPLATE.steps.find((s) => s.id === 'requirements');
      const documentsStep = VISA_RESEARCH_TEMPLATE.steps.find((s) => s.id === 'documents');
      const feesStep = VISA_RESEARCH_TEMPLATE.steps.find((s) => s.id === 'fees');

      expect(requirementsStep?.critical).toBe(true);
      expect(documentsStep?.critical).toBe(true);
      expect(feesStep?.critical).toBe(false);
    });

    it('should have visa_immigration as default topic', () => {
      expect(VISA_RESEARCH_TEMPLATE.defaultTopic).toBe('visa_immigration');
    });
  });

  describe('DOCUMENT_EXTRACTION_TEMPLATE', () => {
    it('should have required properties', () => {
      expect(DOCUMENT_EXTRACTION_TEMPLATE.id).toBe('document_extraction');
      expect(DOCUMENT_EXTRACTION_TEMPLATE.tags).toContain('legal');
      expect(DOCUMENT_EXTRACTION_TEMPLATE.tags).toContain('documents');
    });

    it('should require country and documentType variables', () => {
      expect(DOCUMENT_EXTRACTION_TEMPLATE.requiredVariables).toContain('country');
      expect(DOCUMENT_EXTRACTION_TEMPLATE.requiredVariables).toContain('documentType');
    });

    it('should have legal_document as default topic', () => {
      expect(DOCUMENT_EXTRACTION_TEMPLATE.defaultTopic).toBe('legal_document');
    });
  });

  describe('FEE_TRACKING_TEMPLATE', () => {
    it('should have required properties', () => {
      expect(FEE_TRACKING_TEMPLATE.id).toBe('fee_tracking');
      expect(FEE_TRACKING_TEMPLATE.tags).toContain('fees');
      expect(FEE_TRACKING_TEMPLATE.tags).toContain('costs');
    });

    it('should require country and procedureType variables', () => {
      expect(FEE_TRACKING_TEMPLATE.requiredVariables).toContain('country');
      expect(FEE_TRACKING_TEMPLATE.requiredVariables).toContain('procedureType');
    });

    it('should have year as optional variable', () => {
      expect(FEE_TRACKING_TEMPLATE.optionalVariables?.year).toBeDefined();
    });

    it('should have tax_finance as default topic', () => {
      expect(FEE_TRACKING_TEMPLATE.defaultTopic).toBe('tax_finance');
    });
  });

  describe('CROSS_COUNTRY_COMPARISON_TEMPLATE', () => {
    it('should support parallel execution', () => {
      expect(CROSS_COUNTRY_COMPARISON_TEMPLATE.maxConcurrency).toBe(3);
    });

    it('should require countries and comparisonType variables', () => {
      expect(CROSS_COUNTRY_COMPARISON_TEMPLATE.requiredVariables).toContain('countries');
      expect(CROSS_COUNTRY_COMPARISON_TEMPLATE.requiredVariables).toContain('comparisonType');
    });
  });

  describe('TAX_OBLIGATIONS_TEMPLATE', () => {
    it('should have tax-related steps', () => {
      const stepIds = TAX_OBLIGATIONS_TEMPLATE.steps.map((s) => s.id);
      expect(stepIds).toContain('residency_rules');
      expect(stepIds).toContain('filing_requirements');
      expect(stepIds).toContain('special_regimes');
      expect(stepIds).toContain('treaties');
    });

    it('should have tax_finance as default topic', () => {
      expect(TAX_OBLIGATIONS_TEMPLATE.defaultTopic).toBe('tax_finance');
    });
  });
});

// ============================================
// COUNTRY PORTALS TESTS
// ============================================

describe('COUNTRY_PORTALS', () => {
  it('should have portal URLs for major countries', () => {
    expect(COUNTRY_PORTALS.ES).toBeDefined();
    expect(COUNTRY_PORTALS.PT).toBeDefined();
    expect(COUNTRY_PORTALS.FR).toBeDefined();
    expect(COUNTRY_PORTALS.DE).toBeDefined();
    expect(COUNTRY_PORTALS.IT).toBeDefined();
    expect(COUNTRY_PORTALS.NL).toBeDefined();
    expect(COUNTRY_PORTALS.US).toBeDefined();
    expect(COUNTRY_PORTALS.UK).toBeDefined();
  });

  it('should have immigration URLs for all countries', () => {
    for (const [code, portals] of Object.entries(COUNTRY_PORTALS)) {
      expect(portals.immigration).toBeDefined();
      expect(portals.immigration).toMatch(/^https?:\/\//);
    }
  });

  it('should have tax URLs for major countries', () => {
    expect(COUNTRY_PORTALS.ES.tax).toBeDefined();
    expect(COUNTRY_PORTALS.PT.tax).toBeDefined();
    expect(COUNTRY_PORTALS.US.tax).toBeDefined();
    expect(COUNTRY_PORTALS.DE.tax).toBeDefined();
  });

  it('should have legal gazette URLs for EU countries', () => {
    expect(COUNTRY_PORTALS.ES.legalGazette).toBeDefined();
    expect(COUNTRY_PORTALS.FR.legalGazette).toBeDefined();
    expect(COUNTRY_PORTALS.DE.legalGazette).toBeDefined();
    expect(COUNTRY_PORTALS.UK.legalGazette).toBeDefined();
    expect(COUNTRY_PORTALS.IT.legalGazette).toBeDefined();
  });
});

// ============================================
// VISA TYPE PATHS TESTS
// ============================================

describe('VISA_TYPE_PATHS', () => {
  it('should have visa paths for Spain', () => {
    expect(VISA_TYPE_PATHS.ES).toBeDefined();
    expect(VISA_TYPE_PATHS.ES.digital_nomad).toBeDefined();
    expect(VISA_TYPE_PATHS.ES.golden_visa).toBeDefined();
    expect(VISA_TYPE_PATHS.ES.work).toBeDefined();
    expect(VISA_TYPE_PATHS.ES.student).toBeDefined();
    expect(VISA_TYPE_PATHS.ES.non_lucrative).toBeDefined();
  });

  it('should have visa paths for Portugal', () => {
    expect(VISA_TYPE_PATHS.PT).toBeDefined();
    expect(VISA_TYPE_PATHS.PT.digital_nomad).toBeDefined();
    expect(VISA_TYPE_PATHS.PT.golden_visa).toBeDefined();
    expect(VISA_TYPE_PATHS.PT.d7).toBeDefined();
  });

  it('should have visa paths for Germany', () => {
    expect(VISA_TYPE_PATHS.DE).toBeDefined();
    expect(VISA_TYPE_PATHS.DE.freelance).toBeDefined();
    expect(VISA_TYPE_PATHS.DE.work).toBeDefined();
    expect(VISA_TYPE_PATHS.DE.student).toBeDefined();
  });

  it('should have visa paths for Netherlands', () => {
    expect(VISA_TYPE_PATHS.NL).toBeDefined();
    expect(VISA_TYPE_PATHS.NL.highly_skilled).toBeDefined();
    expect(VISA_TYPE_PATHS.NL.startup).toBeDefined();
  });
});

// ============================================
// URL TEMPLATE RESOLUTION TESTS
// ============================================

describe('resolveUrlTemplate', () => {
  it('should replace simple variables', () => {
    const template = 'https://{{domain}}/{{path}}';
    const result = resolveUrlTemplate(template, { domain: 'example.com', path: 'page' });
    expect(result).toBe('https://example.com/page');
  });

  it('should replace multiple occurrences of the same variable', () => {
    const template = '{{base}}/api/{{base}}/v1';
    const result = resolveUrlTemplate(template, { base: 'test' });
    expect(result).toBe('test/api/test/v1');
  });

  it('should handle numeric variables', () => {
    const template = '{{url}}/year/{{year}}';
    const result = resolveUrlTemplate(template, { url: 'https://example.com', year: 2025 });
    expect(result).toBe('https://example.com/year/2025');
  });

  it('should leave unmatched variables unchanged', () => {
    const template = '{{known}}/{{unknown}}';
    const result = resolveUrlTemplate(template, { known: 'value' });
    expect(result).toBe('value/{{unknown}}');
  });
});

// ============================================
// VARIABLE PREPARATION TESTS
// ============================================

describe('prepareVariables', () => {
  it('should expand country code to portal URLs for Spain', () => {
    const vars = prepareVariables(VISA_RESEARCH_TEMPLATE, { country: 'ES', visaType: 'digital_nomad' });

    expect(vars.immigrationUrl).toBe('https://extranjeria.inclusion.gob.es');
    expect(vars.baseUrl).toBe('https://extranjeria.inclusion.gob.es');
    expect(vars.taxUrl).toBe('https://sede.agenciatributaria.gob.es');
    expect(vars.socialSecurityUrl).toBe('https://www.seg-social.es');
    expect(vars.gazetteUrl).toBe('https://www.boe.es');
  });

  it('should expand country code to portal URLs for Portugal', () => {
    const vars = prepareVariables(VISA_RESEARCH_TEMPLATE, { country: 'PT', visaType: 'd7' });

    expect(vars.immigrationUrl).toBe('https://aima.gov.pt');
    expect(vars.taxUrl).toBe('https://www.portaldasfinancas.gov.pt');
  });

  it('should expand visa type to path', () => {
    const vars = prepareVariables(VISA_RESEARCH_TEMPLATE, { country: 'ES', visaType: 'digital_nomad' });
    expect(vars.visaPath).toBe('/es/informacion-institucional/procedimientos/NIE');
  });

  it('should use default path for unknown visa types', () => {
    const vars = prepareVariables(VISA_RESEARCH_TEMPLATE, { country: 'ES', visaType: 'custom_visa' });
    expect(vars.visaPath).toBe('/custom-visa');
  });

  it('should merge optional variables with defaults', () => {
    const vars = prepareVariables(VISA_RESEARCH_TEMPLATE, { country: 'ES', visaType: 'work' });
    expect(vars.language).toBe('en'); // From optionalVariables
  });

  it('should allow overriding optional variables', () => {
    const vars = prepareVariables(VISA_RESEARCH_TEMPLATE, {
      country: 'ES',
      visaType: 'work',
      language: 'es',
    });
    expect(vars.language).toBe('es');
  });

  it('should handle cross-country comparison variables', () => {
    const vars = prepareVariables(CROSS_COUNTRY_COMPARISON_TEMPLATE, {
      countries: 'ES,PT,DE',
      comparisonType: 'visa',
    });

    expect(vars.country1_url).toBe('https://extranjeria.inclusion.gob.es');
    expect(vars.country2_url).toBe('https://aima.gov.pt');
    expect(vars.country3_url).toBe('https://www.bamf.de');
  });
});

// ============================================
// VARIABLE VALIDATION TESTS
// ============================================

describe('validateVariables', () => {
  it('should return valid when all required variables are provided', () => {
    const result = validateVariables(VISA_RESEARCH_TEMPLATE, {
      country: 'ES',
      visaType: 'digital_nomad',
    });

    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('should return invalid when required variables are missing', () => {
    const result = validateVariables(VISA_RESEARCH_TEMPLATE, { country: 'ES' });

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('visaType');
  });

  it('should return invalid when no variables are provided', () => {
    const result = validateVariables(VISA_RESEARCH_TEMPLATE, {});

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('country');
    expect(result.missing).toContain('visaType');
  });

  it('should treat empty strings as missing', () => {
    const result = validateVariables(VISA_RESEARCH_TEMPLATE, {
      country: 'ES',
      visaType: '',
    });

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('visaType');
  });
});

// ============================================
// EXTRACT FINDINGS TESTS
// ============================================

describe('extractFindings', () => {
  const createMockResult = (content: string): ResearchResult => ({
    url: 'https://example.com',
    title: 'Test',
    content: {
      html: content,
      markdown: content,
      text: content,
    },
    network: [],
    console: [],
    discoveredApis: [],
    metadata: {
      loadTime: 100,
      timestamp: Date.now(),
      finalUrl: 'https://example.com',
    },
    learning: {
      selectorsUsed: [],
      selectorsSucceeded: [],
      selectorsFailed: [],
      confidenceLevel: 'medium',
    },
    research: {
      topic: 'visa_immigration',
      verificationSummary: {
        passed: true,
        confidence: 0.8,
        checkedFields: [],
        missingFields: [],
      },
    },
  });

  it('should extract fee findings', () => {
    // The regex requires "fee", "cost", "tarifa", etc. followed by optional space/colon then number and currency
    const result = createMockResult('The fee: 150 EUR for this service');
    const findings = extractFindings(result, 'test_step');

    expect(findings.some((f) => f.category === 'fee')).toBe(true);
    expect(findings.find((f) => f.category === 'fee')?.sourceStepId).toBe('test_step');
  });

  it('should extract timeline findings', () => {
    // The regex requires "timeline", "processing", "plazo", etc. followed by optional space/colon then number and time unit
    const result = createMockResult('The processing: 30 days for completion');
    const findings = extractFindings(result, 'test_step');

    expect(findings.some((f) => f.category === 'timeline')).toBe(true);
  });

  it('should extract document requirement findings', () => {
    const result = createMockResult('Required document: passport');
    const findings = extractFindings(result, 'test_step');

    expect(findings.some((f) => f.category === 'document')).toBe(true);
  });

  it('should return empty array for content without findings', () => {
    const result = createMockResult('No relevant information here');
    const findings = extractFindings(result, 'test_step');

    expect(findings).toHaveLength(0);
  });

  it('should limit document findings to 3', () => {
    const result = createMockResult(
      'Required document: passport\n' +
        'Required document: photo\n' +
        'Required document: form\n' +
        'Required document: certificate\n' +
        'Required document: proof'
    );
    const findings = extractFindings(result, 'test_step');
    const docFindings = findings.filter((f) => f.category === 'document');

    expect(docFindings.length).toBeLessThanOrEqual(3);
  });
});

// ============================================
// BUILD WORKFLOW SUMMARY TESTS
// ============================================

describe('buildWorkflowSummary', () => {
  const createMockStepResult = (
    stepId: string,
    success: boolean,
    content = '',
    confidence = 0.8
  ): WorkflowTemplateStepResult => {
    const result: WorkflowTemplateStepResult = {
      stepId,
      stepName: `Step ${stepId}`,
      url: 'https://example.com',
      success,
      duration: 100,
    };

    if (success) {
      result.result = {
        url: 'https://example.com',
        title: 'Test',
        content: {
          html: content,
          markdown: content,
          text: content,
        },
        network: [],
        console: [],
        discoveredApis: [],
        metadata: {
          loadTime: 100,
          timestamp: Date.now(),
          finalUrl: 'https://example.com',
        },
        learning: {
          selectorsUsed: [],
          selectorsSucceeded: [],
          selectorsFailed: [],
          confidenceLevel: 'medium',
        },
        research: {
          topic: 'visa_immigration',
          verificationSummary: {
            passed: true,
            confidence,
            checkedFields: ['requirements', 'documents'],
            missingFields: ['fees'],
          },
        },
      };
    }

    return result;
  };

  it('should count successful and failed steps', () => {
    const stepResults = [
      createMockStepResult('step1', true),
      createMockStepResult('step2', true),
      createMockStepResult('step3', false),
    ];

    const summary = buildWorkflowSummary(stepResults);

    expect(summary.successfulSteps).toBe(2);
    expect(summary.failedSteps).toBe(1);
  });

  it('should aggregate verification statistics', () => {
    const stepResults = [
      createMockStepResult('step1', true, 'content', 0.8),
      createMockStepResult('step2', true, 'content', 0.6),
    ];

    const summary = buildWorkflowSummary(stepResults);

    expect(summary.verificationSummary.totalChecks).toBe(6); // 3 fields per step x 2 steps
    expect(summary.verificationSummary.passedChecks).toBe(4); // 2 checked fields per step x 2 steps
    expect(summary.verificationSummary.averageConfidence).toBeCloseTo(0.7, 1);
  });

  it('should extract findings from successful steps', () => {
    const stepResults = [
      // Fee pattern: keyword + colon/space + number + currency
      createMockStepResult('step1', true, 'The fee: 100 EUR for the application'),
      // Timeline pattern: keyword + colon/space + number + time unit
      createMockStepResult('step2', true, 'The processing: 30 days to complete'),
    ];

    const summary = buildWorkflowSummary(stepResults);

    expect(summary.findings.length).toBeGreaterThan(0);
    expect(summary.findings.some((f) => f.category === 'fee')).toBe(true);
    expect(summary.findings.some((f) => f.category === 'timeline')).toBe(true);
  });

  it('should handle all failed steps', () => {
    const stepResults = [
      createMockStepResult('step1', false),
      createMockStepResult('step2', false),
    ];

    const summary = buildWorkflowSummary(stepResults);

    expect(summary.successfulSteps).toBe(0);
    expect(summary.failedSteps).toBe(2);
    expect(summary.findings).toHaveLength(0);
    expect(summary.verificationSummary.averageConfidence).toBe(0);
  });
});

// ============================================
// TEMPLATE LISTING AND RETRIEVAL TESTS
// ============================================

describe('listTemplates', () => {
  it('should return all templates with metadata', () => {
    const templates = listTemplates();

    expect(templates.length).toBe(5);
    expect(templates.every((t) => t.id && t.name && t.description)).toBe(true);
  });

  it('should include required variables for each template', () => {
    const templates = listTemplates();

    for (const template of templates) {
      expect(template.requiredVariables).toBeDefined();
      expect(Array.isArray(template.requiredVariables)).toBe(true);
    }
  });

  it('should include tags for filtering', () => {
    const templates = listTemplates();

    for (const template of templates) {
      expect(template.tags).toBeDefined();
      expect(Array.isArray(template.tags)).toBe(true);
      expect(template.tags.length).toBeGreaterThan(0);
    }
  });
});

describe('getTemplate', () => {
  it('should return template by ID', () => {
    const template = getTemplate('visa_research');
    expect(template).toBeDefined();
    expect(template?.name).toBe('Visa Research Workflow');
  });

  it('should return undefined for unknown ID', () => {
    const template = getTemplate('unknown_template');
    expect(template).toBeUndefined();
  });

  it('should find all template IDs', () => {
    const ids = ['visa_research', 'document_extraction', 'fee_tracking', 'cross_country_comparison', 'tax_obligations'];

    for (const id of ids) {
      const template = getTemplate(id);
      expect(template).toBeDefined();
      expect(template?.id).toBe(id);
    }
  });
});

// ============================================
// WORKFLOW STEP TESTS
// ============================================

describe('WorkflowTemplateStep', () => {
  it('should have all required step properties', () => {
    for (const template of Object.values(WORKFLOW_TEMPLATES)) {
      for (const step of template.steps) {
        expect(step.id).toBeDefined();
        expect(step.name).toBeDefined();
        expect(step.description).toBeDefined();
        expect(step.urlTemplate).toBeDefined();
        expect(step.topic).toBeDefined();
      }
    }
  });

  it('should have valid topics for all steps', () => {
    const validTopics = [
      'government_portal',
      'legal_document',
      'visa_immigration',
      'tax_finance',
      'official_registry',
      'general_research',
    ];

    for (const template of Object.values(WORKFLOW_TEMPLATES)) {
      for (const step of template.steps) {
        expect(validTopics).toContain(step.topic);
      }
    }
  });

  it('should use URL template variables consistently', () => {
    // Check that URL templates use {{variable}} format
    for (const template of Object.values(WORKFLOW_TEMPLATES)) {
      for (const step of template.steps) {
        const hasTemplateVars = step.urlTemplate.includes('{{');
        expect(hasTemplateVars).toBe(true);
      }
    }
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('Template Integration', () => {
  it('should resolve visa research template URLs for Spain', () => {
    const vars = prepareVariables(VISA_RESEARCH_TEMPLATE, {
      country: 'ES',
      visaType: 'digital_nomad',
    });

    for (const step of VISA_RESEARCH_TEMPLATE.steps) {
      const url = resolveUrlTemplate(step.urlTemplate, vars);
      expect(url).not.toContain('{{');
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it('should resolve fee tracking template URLs', () => {
    const vars = prepareVariables(FEE_TRACKING_TEMPLATE, {
      country: 'ES',
      procedureType: 'visa',
    });

    // At least the critical step should resolve
    const criticalStep = FEE_TRACKING_TEMPLATE.steps.find((s) => s.critical);
    if (criticalStep) {
      const url = resolveUrlTemplate(criticalStep.urlTemplate, vars);
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it('should validate and prepare variables correctly', () => {
    const userVars = { country: 'PT', visaType: 'd7' };

    // First validate
    const validation = validateVariables(VISA_RESEARCH_TEMPLATE, userVars);
    expect(validation.valid).toBe(true);

    // Then prepare
    const prepared = prepareVariables(VISA_RESEARCH_TEMPLATE, userVars);
    expect(prepared.immigrationUrl).toBeDefined();
    expect(prepared.visaPath).toBeDefined();

    // Then resolve URLs
    const firstStep = VISA_RESEARCH_TEMPLATE.steps[0];
    const url = resolveUrlTemplate(firstStep.urlTemplate, prepared);
    expect(url).toContain('aima.gov.pt');
  });
});
