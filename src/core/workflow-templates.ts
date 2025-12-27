/**
 * Research Workflow Templates (INT-006)
 *
 * Pre-built workflow templates for common research use cases.
 * These templates provide structured, repeatable research patterns
 * that can be customized with variables and executed against different targets.
 *
 * Use cases:
 * - Visa research across multiple countries
 * - Document extraction from government portals
 * - Fee tracking for immigration/tax procedures
 * - Cross-country comparison workflows
 *
 * @example
 * ```typescript
 * import { createResearchBrowser, WORKFLOW_TEMPLATES, executeTemplate } from 'llm-browser/sdk';
 *
 * const browser = await createResearchBrowser();
 *
 * // Execute a visa research workflow for Spain
 * const results = await executeTemplate(browser, WORKFLOW_TEMPLATES.visaResearch, {
 *   country: 'ES',
 *   visaType: 'digital_nomad',
 * });
 *
 * console.log(results.summary);
 * ```
 */

import type { VerificationCheck } from '../types/verification.js';
import type { ResearchTopic, ResearchBrowseOptions, ResearchResult } from '../sdk.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Step in a workflow template
 */
export interface WorkflowTemplateStep {
  /** Step identifier */
  id: string;
  /** Human-readable step name */
  name: string;
  /** Description of what this step does */
  description: string;
  /** URL template with {{variable}} placeholders */
  urlTemplate: string;
  /** Research topic for this step */
  topic: ResearchTopic;
  /** Optional: Fields expected in the result */
  expectedFields?: string[];
  /** Optional: Additional verification checks */
  additionalChecks?: VerificationCheck[];
  /** Optional: Whether this step is critical (failure stops workflow) */
  critical?: boolean;
  /** Optional: Delay in ms before executing this step */
  delayMs?: number;
  /** Optional: Custom options for this step */
  options?: Partial<ResearchBrowseOptions>;
}

/**
 * Workflow template definition
 */
export interface WorkflowTemplate {
  /** Template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Categories/tags for filtering */
  tags: string[];
  /** Required variables (must be provided when executing) */
  requiredVariables: string[];
  /** Optional variables with default values */
  optionalVariables?: Record<string, string | number>;
  /** Steps in execution order */
  steps: WorkflowTemplateStep[];
  /** Default research topic for all steps (can be overridden per-step) */
  defaultTopic?: ResearchTopic;
  /** Whether to continue on step failure */
  continueOnFailure?: boolean;
  /** Maximum concurrent steps (default: 1 for sequential) */
  maxConcurrency?: number;
  /** Notes about usage */
  notes?: string;
}

/**
 * Result of executing a workflow template step
 */
export interface WorkflowTemplateStepResult {
  /** Step ID from template */
  stepId: string;
  /** Step name */
  stepName: string;
  /** URL that was browsed */
  url: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Research result if successful */
  result?: ResearchResult;
  /** Duration in ms */
  duration: number;
}

/**
 * Result of executing a complete workflow template
 */
export interface WorkflowTemplateResult {
  /** Template ID */
  templateId: string;
  /** Template name */
  templateName: string;
  /** Variables used */
  variables: Record<string, string | number>;
  /** Results for each step */
  steps: WorkflowTemplateStepResult[];
  /** Overall success (all critical steps passed) */
  success: boolean;
  /** Total duration in ms */
  totalDuration: number;
  /** Timestamp when workflow started */
  startedAt: number;
  /** Timestamp when workflow completed */
  completedAt: number;
  /** Summary of extracted information */
  summary: WorkflowTemplateSummary;
}

/**
 * Summary extracted from workflow results
 */
export interface WorkflowTemplateSummary {
  /** Number of successful steps */
  successfulSteps: number;
  /** Number of failed steps */
  failedSteps: number;
  /** Key findings extracted from results */
  findings: WorkflowFinding[];
  /** Verification summary across all steps */
  verificationSummary: {
    totalChecks: number;
    passedChecks: number;
    averageConfidence: number;
  };
}

/**
 * A finding extracted from workflow results
 */
export interface WorkflowFinding {
  /** Category of finding */
  category: 'requirement' | 'fee' | 'timeline' | 'document' | 'contact' | 'warning' | 'general';
  /** Source step ID */
  sourceStepId: string;
  /** The finding text */
  text: string;
  /** Confidence level (0-1) */
  confidence: number;
}

// =============================================================================
// COUNTRY URL MAPPINGS
// =============================================================================

/**
 * Government portal URLs by country code
 */
export const COUNTRY_PORTALS: Record<string, {
  immigration?: string;
  tax?: string;
  socialSecurity?: string;
  justice?: string;
  foreignAffairs?: string;
  legalGazette?: string;
}> = {
  ES: {
    immigration: 'https://extranjeria.inclusion.gob.es',
    tax: 'https://sede.agenciatributaria.gob.es',
    socialSecurity: 'https://www.seg-social.es',
    justice: 'https://www.mjusticia.gob.es',
    foreignAffairs: 'https://www.exteriores.gob.es',
    legalGazette: 'https://www.boe.es',
  },
  PT: {
    immigration: 'https://aima.gov.pt',
    tax: 'https://www.portaldasfinancas.gov.pt',
    socialSecurity: 'https://www.seg-social.pt',
    foreignAffairs: 'https://www.portaldiplomatico.mne.gov.pt',
  },
  FR: {
    immigration: 'https://www.immigration.interieur.gouv.fr',
    tax: 'https://www.impots.gouv.fr',
    socialSecurity: 'https://www.ameli.fr',
    legalGazette: 'https://www.legifrance.gouv.fr',
  },
  DE: {
    immigration: 'https://www.bamf.de',
    tax: 'https://www.bundesfinanzministerium.de',
    foreignAffairs: 'https://www.auswaertiges-amt.de',
    legalGazette: 'https://www.gesetze-im-internet.de',
  },
  IT: {
    immigration: 'https://www.interno.gov.it/it/temi/immigrazione-e-asilo',
    tax: 'https://www.agenziaentrate.gov.it',
    socialSecurity: 'https://www.inps.it',
    legalGazette: 'https://www.normattiva.it',
  },
  NL: {
    immigration: 'https://ind.nl',
    tax: 'https://www.belastingdienst.nl',
  },
  US: {
    immigration: 'https://www.uscis.gov',
    tax: 'https://www.irs.gov',
    socialSecurity: 'https://www.ssa.gov',
    foreignAffairs: 'https://travel.state.gov',
  },
  UK: {
    immigration: 'https://www.gov.uk/browse/visas-immigration',
    tax: 'https://www.gov.uk/browse/tax',
    legalGazette: 'https://www.legislation.gov.uk',
  },
};

/**
 * Visa type URL paths by country and visa type
 */
export const VISA_TYPE_PATHS: Record<string, Record<string, string>> = {
  ES: {
    digital_nomad: '/es/informacion-institucional/procedimientos/NIE',
    golden_visa: '/es/informacion-institucional/procedimientos/investidores',
    work: '/es/informacion-institucional/procedimientos/trabajo',
    student: '/es/informacion-institucional/procedimientos/estudios',
    family: '/es/informacion-institucional/procedimientos/reagrupacion',
    non_lucrative: '/es/informacion-institucional/procedimientos/residencia-no-lucrativa',
  },
  PT: {
    digital_nomad: '/visto-de-residencia/visto-para-trabalho-remoto',
    golden_visa: '/ari',
    work: '/visto-de-residencia/visto-para-trabalho-subordinado',
    student: '/visto-de-residencia/visto-para-estudos',
    d7: '/visto-de-residencia/visto-d7',
  },
  DE: {
    freelance: '/visa-arten/selbststaendige',
    work: '/visa-arten/arbeitnehmer',
    student: '/visa-arten/studium',
    family: '/visa-arten/familiennachzug',
  },
  NL: {
    highly_skilled: '/en/residence-permits/work/highly-skilled-migrant',
    startup: '/en/residence-permits/work/startup-visa',
    student: '/en/residence-permits/study',
    family: '/en/residence-permits/family',
  },
};

// =============================================================================
// WORKFLOW TEMPLATES
// =============================================================================

/**
 * Visa Research Workflow Template
 *
 * Comprehensive research workflow for visa requirements, including:
 * - Requirements and eligibility
 * - Required documents
 * - Fees and costs
 * - Processing timeline
 * - Application process
 */
export const VISA_RESEARCH_TEMPLATE: WorkflowTemplate = {
  id: 'visa_research',
  name: 'Visa Research Workflow',
  description: 'Research visa requirements, documents, fees, and timeline for a specific country and visa type',
  tags: ['visa', 'immigration', 'research', 'government'],
  requiredVariables: ['country', 'visaType'],
  optionalVariables: {
    language: 'en',
  },
  defaultTopic: 'visa_immigration',
  continueOnFailure: true,
  steps: [
    {
      id: 'requirements',
      name: 'Visa Requirements',
      description: 'Get eligibility requirements and general overview',
      urlTemplate: '{{baseUrl}}{{visaPath}}',
      topic: 'visa_immigration',
      expectedFields: ['requirements', 'eligibility', 'conditions'],
      critical: true,
    },
    {
      id: 'documents',
      name: 'Required Documents',
      description: 'Get list of required documents for application',
      urlTemplate: '{{baseUrl}}{{visaPath}}/documentacion',
      topic: 'visa_immigration',
      expectedFields: ['documents', 'forms', 'certificates'],
      critical: true,
    },
    {
      id: 'fees',
      name: 'Fees and Costs',
      description: 'Get application fees and associated costs',
      urlTemplate: '{{baseUrl}}/tasas',
      topic: 'visa_immigration',
      expectedFields: ['fees', 'cost', 'payment'],
      critical: false,
    },
    {
      id: 'timeline',
      name: 'Processing Timeline',
      description: 'Get expected processing times',
      urlTemplate: '{{baseUrl}}{{visaPath}}/plazos',
      topic: 'visa_immigration',
      expectedFields: ['timeline', 'processing', 'duration'],
      critical: false,
    },
    {
      id: 'application',
      name: 'Application Process',
      description: 'Get step-by-step application instructions',
      urlTemplate: '{{baseUrl}}{{visaPath}}/procedimiento',
      topic: 'visa_immigration',
      expectedFields: ['application', 'steps', 'procedure'],
      critical: false,
    },
  ],
  notes: 'Uses country-specific portal URLs. Requires country code (ES, PT, DE, etc.) and visa type (digital_nomad, work, student, etc.)',
};

/**
 * Document Extraction Workflow Template
 *
 * Extract legal documents from official gazette and registry sites:
 * - Search for relevant legislation
 * - Extract document content
 * - Get effective dates and amendments
 */
export const DOCUMENT_EXTRACTION_TEMPLATE: WorkflowTemplate = {
  id: 'document_extraction',
  name: 'Legal Document Extraction',
  description: 'Extract legal documents from official gazettes and registries',
  tags: ['legal', 'documents', 'legislation', 'research'],
  requiredVariables: ['country', 'documentType'],
  optionalVariables: {
    searchTerm: '',
    dateFrom: '',
    dateTo: '',
  },
  defaultTopic: 'legal_document',
  continueOnFailure: true,
  steps: [
    {
      id: 'search',
      name: 'Document Search',
      description: 'Search for relevant documents in the legal database',
      urlTemplate: '{{gazetteUrl}}/buscar?texto={{searchTerm}}&tipo={{documentType}}',
      topic: 'legal_document',
      expectedFields: ['results', 'documents', 'count'],
      critical: true,
    },
    {
      id: 'recent',
      name: 'Recent Documents',
      description: 'Get recent documents of the specified type',
      urlTemplate: '{{gazetteUrl}}/ultimas-novedades/{{documentType}}',
      topic: 'legal_document',
      expectedFields: ['documents', 'date', 'title'],
      critical: false,
    },
    {
      id: 'consolidated',
      name: 'Consolidated Legislation',
      description: 'Get consolidated/codified legislation',
      urlTemplate: '{{gazetteUrl}}/codigos/{{documentType}}',
      topic: 'legal_document',
      expectedFields: ['articles', 'sections', 'effective_date'],
      critical: false,
    },
  ],
  notes: 'Document types vary by country: ES uses BOE references, PT uses Diario da Republica, etc.',
};

/**
 * Fee Tracking Workflow Template
 *
 * Track and compare fees for procedures across sources:
 * - Immigration fees
 * - Tax obligations
 * - Administrative costs
 * - Social security contributions
 */
export const FEE_TRACKING_TEMPLATE: WorkflowTemplate = {
  id: 'fee_tracking',
  name: 'Fee Tracking Workflow',
  description: 'Track and compare fees for immigration, tax, and administrative procedures',
  tags: ['fees', 'costs', 'financial', 'tracking'],
  requiredVariables: ['country', 'procedureType'],
  optionalVariables: {
    year: new Date().getFullYear(),
  },
  defaultTopic: 'tax_finance',
  continueOnFailure: true,
  steps: [
    {
      id: 'immigration_fees',
      name: 'Immigration Fees',
      description: 'Get immigration-related fees and costs',
      urlTemplate: '{{immigrationUrl}}/tasas-y-precios-{{year}}',
      topic: 'visa_immigration',
      expectedFields: ['fees', 'cost', 'payment'],
      critical: true,
    },
    {
      id: 'tax_rates',
      name: 'Tax Rates',
      description: 'Get relevant tax rates and obligations',
      urlTemplate: '{{taxUrl}}/tipos-impositivos/{{procedureType}}',
      topic: 'tax_finance',
      expectedFields: ['rates', 'tax', 'percentage'],
      critical: false,
    },
    {
      id: 'admin_fees',
      name: 'Administrative Fees',
      description: 'Get administrative and processing fees',
      urlTemplate: '{{gazetteUrl}}/tasas-administrativas',
      topic: 'government_portal',
      expectedFields: ['fees', 'administrative', 'processing'],
      critical: false,
    },
    {
      id: 'social_security',
      name: 'Social Security Contributions',
      description: 'Get social security contribution rates',
      urlTemplate: '{{socialSecurityUrl}}/cotizaciones/{{year}}',
      topic: 'tax_finance',
      expectedFields: ['contributions', 'rates', 'bases'],
      critical: false,
    },
  ],
  notes: 'Fee structures vary significantly by country. Some fees may require authentication.',
};

/**
 * Cross-Country Comparison Template
 *
 * Compare information across multiple countries:
 * - Visa requirements
 * - Cost of living factors
 * - Tax implications
 */
export const CROSS_COUNTRY_COMPARISON_TEMPLATE: WorkflowTemplate = {
  id: 'cross_country_comparison',
  name: 'Cross-Country Comparison',
  description: 'Compare visa, tax, and living information across multiple countries',
  tags: ['comparison', 'countries', 'research', 'analysis'],
  requiredVariables: ['countries', 'comparisonType'],
  optionalVariables: {
    visaType: 'digital_nomad',
  },
  defaultTopic: 'general_research',
  continueOnFailure: true,
  maxConcurrency: 3,
  steps: [
    {
      id: 'country_1',
      name: 'Country 1 Research',
      description: 'Research first country in comparison',
      urlTemplate: '{{country1_url}}',
      topic: 'visa_immigration',
      expectedFields: ['requirements', 'fees', 'timeline'],
      critical: true,
    },
    {
      id: 'country_2',
      name: 'Country 2 Research',
      description: 'Research second country in comparison',
      urlTemplate: '{{country2_url}}',
      topic: 'visa_immigration',
      expectedFields: ['requirements', 'fees', 'timeline'],
      critical: true,
    },
    {
      id: 'country_3',
      name: 'Country 3 Research',
      description: 'Research third country in comparison (if applicable)',
      urlTemplate: '{{country3_url}}',
      topic: 'visa_immigration',
      expectedFields: ['requirements', 'fees', 'timeline'],
      critical: false,
    },
  ],
  notes: 'Provide countries as comma-separated codes (e.g., "ES,PT,DE"). Up to 3 countries supported.',
};

/**
 * Tax Obligations Template
 *
 * Research tax obligations for expats/immigrants:
 * - Tax residency rules
 * - Filing requirements
 * - Double taxation treaties
 * - Special regimes
 */
export const TAX_OBLIGATIONS_TEMPLATE: WorkflowTemplate = {
  id: 'tax_obligations',
  name: 'Tax Obligations Research',
  description: 'Research tax obligations, residency rules, and special regimes',
  tags: ['tax', 'finance', 'residency', 'research'],
  requiredVariables: ['country'],
  optionalVariables: {
    taxpayerType: 'individual',
    originCountry: '',
  },
  defaultTopic: 'tax_finance',
  continueOnFailure: true,
  steps: [
    {
      id: 'residency_rules',
      name: 'Tax Residency Rules',
      description: 'Get tax residency determination rules',
      urlTemplate: '{{taxUrl}}/residencia-fiscal',
      topic: 'tax_finance',
      expectedFields: ['residency', 'days', 'criteria'],
      critical: true,
    },
    {
      id: 'filing_requirements',
      name: 'Filing Requirements',
      description: 'Get tax filing deadlines and requirements',
      urlTemplate: '{{taxUrl}}/declaraciones/calendario',
      topic: 'tax_finance',
      expectedFields: ['deadlines', 'forms', 'filing'],
      critical: true,
    },
    {
      id: 'special_regimes',
      name: 'Special Tax Regimes',
      description: 'Get information about special tax regimes (Beckham law, NHR, etc.)',
      urlTemplate: '{{taxUrl}}/regimenes-especiales/expatriados',
      topic: 'tax_finance',
      expectedFields: ['regime', 'benefits', 'eligibility'],
      critical: false,
    },
    {
      id: 'treaties',
      name: 'Double Taxation Treaties',
      description: 'Get information about applicable tax treaties',
      urlTemplate: '{{taxUrl}}/convenios/{{originCountry}}',
      topic: 'tax_finance',
      expectedFields: ['treaty', 'provisions', 'relief'],
      critical: false,
    },
  ],
  notes: 'Special regimes vary by country: ES has Beckham Law, PT has NHR, IT has new resident regime.',
};

/**
 * All workflow templates
 */
export const WORKFLOW_TEMPLATES = {
  visaResearch: VISA_RESEARCH_TEMPLATE,
  documentExtraction: DOCUMENT_EXTRACTION_TEMPLATE,
  feeTracking: FEE_TRACKING_TEMPLATE,
  crossCountryComparison: CROSS_COUNTRY_COMPARISON_TEMPLATE,
  taxObligations: TAX_OBLIGATIONS_TEMPLATE,
} as const;

// =============================================================================
// TEMPLATE EXECUTION
// =============================================================================

/**
 * Resolve URL template with variables
 */
export function resolveUrlTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  let resolved = template;
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return resolved;
}

/**
 * Prepare variables for a workflow template
 *
 * Expands country codes to actual URLs and paths based on the template requirements.
 */
export function prepareVariables(
  template: WorkflowTemplate,
  userVariables: Record<string, string | number>
): Record<string, string | number> {
  const variables: Record<string, string | number> = {
    ...template.optionalVariables,
    ...userVariables,
  };

  // Expand country code to portal URLs
  const countryCode = String(variables.country || '').toUpperCase();
  const portals = COUNTRY_PORTALS[countryCode];

  if (portals) {
    if (portals.immigration) {
      variables.immigrationUrl = portals.immigration;
      variables.baseUrl = portals.immigration;
    }
    if (portals.tax) variables.taxUrl = portals.tax;
    if (portals.socialSecurity) variables.socialSecurityUrl = portals.socialSecurity;
    if (portals.legalGazette) variables.gazetteUrl = portals.legalGazette;
    if (portals.foreignAffairs) variables.foreignAffairsUrl = portals.foreignAffairs;
  }

  // Expand visa type to path
  const visaType = String(variables.visaType || '');
  const visaPaths = VISA_TYPE_PATHS[countryCode];
  if (visaPaths && visaPaths[visaType]) {
    variables.visaPath = visaPaths[visaType];
  } else if (visaType) {
    // Default path pattern
    variables.visaPath = `/${visaType.replace(/_/g, '-')}`;
  }

  // Handle cross-country comparison
  if (variables.countries) {
    const countryCodes = String(variables.countries).split(',').map(c => c.trim().toUpperCase());
    countryCodes.forEach((code, index) => {
      const countryPortals = COUNTRY_PORTALS[code];
      if (countryPortals?.immigration) {
        variables[`country${index + 1}_url`] = countryPortals.immigration;
      }
    });
  }

  return variables;
}

/**
 * Validate that all required variables are provided
 */
export function validateVariables(
  template: WorkflowTemplate,
  variables: Record<string, string | number>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const required of template.requiredVariables) {
    if (!(required in variables) || variables[required] === '' || variables[required] === undefined) {
      missing.push(required);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Extract findings from a research result
 */
export function extractFindings(
  result: ResearchResult,
  stepId: string
): WorkflowFinding[] {
  const findings: WorkflowFinding[] = [];
  const content = result.content?.markdown || result.content?.text || '';

  // Extract fee-related findings
  const feeMatch = content.match(/(?:fee|cost|price|tarifa|tasa)[\s:]*([0-9.,]+)\s*(?:EUR|USD|GBP|\u20AC|\$)/gi);
  if (feeMatch) {
    findings.push({
      category: 'fee',
      sourceStepId: stepId,
      text: feeMatch[0],
      confidence: 0.8,
    });
  }

  // Extract timeline findings
  const timelineMatch = content.match(/(?:timeline|processing|plazo|tiempo)[\s:]*(\d+[-\s]?\d*)\s*(?:day|week|month|dia|semana|mes)/gi);
  if (timelineMatch) {
    findings.push({
      category: 'timeline',
      sourceStepId: stepId,
      text: timelineMatch[0],
      confidence: 0.8,
    });
  }

  // Extract document requirements
  const docMatch = content.match(/(?:required|necesario)[\s:]*(?:document|documento)[:\s]*([^\n.]+)/gi);
  if (docMatch) {
    for (const match of docMatch.slice(0, 3)) { // Limit to 3 findings
      findings.push({
        category: 'document',
        sourceStepId: stepId,
        text: match,
        confidence: 0.7,
      });
    }
  }

  return findings;
}

/**
 * Build workflow summary from step results
 */
export function buildWorkflowSummary(
  stepResults: WorkflowTemplateStepResult[]
): WorkflowTemplateSummary {
  const successfulSteps = stepResults.filter(s => s.success).length;
  const failedSteps = stepResults.filter(s => !s.success).length;

  // Collect findings from all successful steps
  const findings: WorkflowFinding[] = [];
  let totalChecks = 0;
  let passedChecks = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const step of stepResults) {
    if (step.success && step.result) {
      // Extract findings
      const stepFindings = extractFindings(step.result, step.stepId);
      findings.push(...stepFindings);

      // Aggregate verification data
      const verification = step.result.research?.verificationSummary;
      if (verification) {
        totalChecks += verification.checkedFields.length + verification.missingFields.length;
        passedChecks += verification.checkedFields.length;
        confidenceSum += verification.confidence;
        confidenceCount++;
      }
    }
  }

  return {
    successfulSteps,
    failedSteps,
    findings,
    verificationSummary: {
      totalChecks,
      passedChecks,
      averageConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
    },
  };
}

/**
 * Get list of available workflow templates
 */
export function listTemplates(): Array<{
  id: string;
  name: string;
  description: string;
  tags: string[];
  requiredVariables: string[];
}> {
  return Object.values(WORKFLOW_TEMPLATES).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tags: t.tags,
    requiredVariables: t.requiredVariables,
  }));
}

/**
 * Get a template by ID
 */
export function getTemplate(id: string): WorkflowTemplate | undefined {
  return Object.values(WORKFLOW_TEMPLATES).find(t => t.id === id);
}
