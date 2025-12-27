/**
 * Government Portal Skill Pack (INT-007)
 *
 * Exportable skill pack for EU government portals with pre-built patterns
 * for Spain, Portugal, and Germany. Integrates with:
 * - Domain presets for content extraction
 * - Workflow templates for research workflows
 * - Verification presets for content validation
 * - Procedural memory for skill sharing
 *
 * @example
 * ```typescript
 * import { GOVERNMENT_SKILL_PACK, installSkillPack, getSkillsForCountry } from 'llm-browser/sdk';
 *
 * // Install the skill pack
 * await installSkillPack(browser, GOVERNMENT_SKILL_PACK);
 *
 * // Get skills for a specific country
 * const spainSkills = getSkillsForCountry('ES');
 * ```
 */

import type { ResearchTopic } from '../sdk.js';
import type { PublishedPattern, PatternCategory, PatternType } from '../types/pattern-marketplace.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A pre-built skill for government portal interaction
 */
export interface GovernmentSkill {
  /** Unique skill identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode: string;
  /** Country name */
  countryName: string;
  /** Service category */
  category: GovernmentServiceCategory;
  /** Target domains */
  targetDomains: string[];
  /** Research topic for verification */
  topic: ResearchTopic;
  /** Step-by-step workflow */
  steps: GovernmentSkillStep[];
  /** Expected output fields */
  expectedFields: string[];
  /** Tips and notes */
  notes?: string[];
  /** Related skills */
  relatedSkills?: string[];
  /** Language(s) supported */
  languages: string[];
  /** Version */
  version: string;
}

/**
 * A step in a government skill workflow
 */
export interface GovernmentSkillStep {
  /** Step identifier */
  id: string;
  /** Step name */
  name: string;
  /** What this step does */
  description: string;
  /** URL pattern or template */
  urlPattern: string;
  /** Content type to extract */
  contentType: 'requirements' | 'documents' | 'fees' | 'timeline' | 'forms' | 'contact' | 'general';
  /** Fields to extract */
  extractFields: string[];
  /** Whether this step is critical */
  critical?: boolean;
  /** Delay before step (ms) */
  delayMs?: number;
  /** Notes about this step */
  notes?: string;
}

/**
 * Categories of government services
 */
export type GovernmentServiceCategory =
  | 'visa_residence'
  | 'work_permit'
  | 'tax_registration'
  | 'social_security'
  | 'healthcare'
  | 'drivers_license'
  | 'vehicle_registration'
  | 'business_registration'
  | 'property'
  | 'education'
  | 'family'
  | 'citizenship'
  | 'legal_documents'
  | 'customs'
  | 'general';

/**
 * A skill pack containing multiple related skills
 */
export interface GovernmentSkillPack {
  /** Pack identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Version (semver) */
  version: string;
  /** Countries covered */
  countries: string[];
  /** All skills in this pack */
  skills: GovernmentSkill[];
  /** Pack metadata */
  metadata: {
    author: string;
    createdAt: number;
    updatedAt: number;
    license: string;
    homepage?: string;
  };
}

// =============================================================================
// SPAIN SKILLS
// =============================================================================

/**
 * Spain government portal skills
 */
export const SPAIN_SKILLS: GovernmentSkill[] = [
  {
    id: 'es_nie_registration',
    name: 'NIE (Tax ID) Registration',
    description: 'Navigate the NIE (Numero de Identidad de Extranjero) application process for foreigners in Spain',
    countryCode: 'ES',
    countryName: 'Spain',
    category: 'tax_registration',
    targetDomains: ['extranjeria.inclusion.gob.es', 'sede.administracionespublicas.gob.es'],
    topic: 'visa_immigration',
    languages: ['es', 'en'],
    version: '1.0.0',
    expectedFields: ['requirements', 'documents', 'fees', 'appointment', 'forms'],
    steps: [
      {
        id: 'requirements',
        name: 'Get NIE Requirements',
        description: 'Extract eligibility requirements for NIE',
        urlPattern: 'https://extranjeria.inclusion.gob.es/es/informacion-institucional/procedimientos/NIE',
        contentType: 'requirements',
        extractFields: ['eligibility', 'conditions', 'who_can_apply'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Get list of documents needed for NIE application',
        urlPattern: 'https://extranjeria.inclusion.gob.es/es/informacion-institucional/procedimientos/NIE/documentacion',
        contentType: 'documents',
        extractFields: ['passport', 'photos', 'proof_of_reason', 'forms'],
        critical: true,
      },
      {
        id: 'fees',
        name: 'Application Fees',
        description: 'Get current NIE application fees',
        urlPattern: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/folletos-informativos/modelo_790.html',
        contentType: 'fees',
        extractFields: ['amount', 'payment_method', 'modelo_790'],
        critical: false,
      },
      {
        id: 'appointment',
        name: 'Book Appointment',
        description: 'Information about booking NIE appointment (cita previa)',
        urlPattern: 'https://sede.administracionespublicas.gob.es/icpplus/index.html',
        contentType: 'general',
        extractFields: ['booking_system', 'locations', 'availability'],
        critical: true,
        notes: 'Appointments are often difficult to get - check early morning',
      },
    ],
    notes: [
      'NIE is mandatory for all foreigners who need to work, buy property, or open a bank account in Spain',
      'The modelo 790 tax form must be paid before the appointment',
      'Appointments (cita previa) are released at midnight Spanish time',
    ],
    relatedSkills: ['es_digital_nomad_visa', 'es_social_security'],
  },
  {
    id: 'es_digital_nomad_visa',
    name: 'Digital Nomad Visa',
    description: 'Navigate the Spanish Digital Nomad Visa (Visa para teletrabajo de caracter internacional) application',
    countryCode: 'ES',
    countryName: 'Spain',
    category: 'visa_residence',
    targetDomains: ['extranjeria.inclusion.gob.es', 'www.inclusion.gob.es'],
    topic: 'visa_immigration',
    languages: ['es', 'en'],
    version: '1.0.0',
    expectedFields: ['eligibility', 'income_requirements', 'documents', 'fees', 'timeline'],
    steps: [
      {
        id: 'overview',
        name: 'Digital Nomad Visa Overview',
        description: 'Get overview of the Digital Nomad Visa program',
        urlPattern: 'https://www.inclusion.gob.es/es/web/migraciones/teletrabajo',
        contentType: 'requirements',
        extractFields: ['program_description', 'duration', 'benefits'],
        critical: true,
      },
      {
        id: 'eligibility',
        name: 'Eligibility Requirements',
        description: 'Get detailed eligibility criteria',
        urlPattern: 'https://extranjeria.inclusion.gob.es/es/informacion-institucional/procedimientos/residencia-no-lucrativa',
        contentType: 'requirements',
        extractFields: ['income_minimum', 'remote_work_proof', 'employer_relationship', 'freelance_conditions'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Complete document checklist',
        urlPattern: 'https://extranjeria.inclusion.gob.es/es/informacion-institucional/procedimientos/teletrabajo/documentacion',
        contentType: 'documents',
        extractFields: ['passport', 'criminal_record', 'health_insurance', 'income_proof', 'work_contract'],
        critical: true,
      },
      {
        id: 'fees',
        name: 'Application Fees',
        description: 'Get current visa fees',
        urlPattern: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/folletos-informativos/modelo_790.html',
        contentType: 'fees',
        extractFields: ['visa_fee', 'residence_card_fee', 'total'],
        critical: false,
      },
    ],
    notes: [
      'Income requirement is approximately 200% of Spanish minimum wage',
      'Can be applied from outside Spain (consulate) or inside (oficina de extranjeria)',
      'Initial visa is for 1 year, renewable for 2 more years',
    ],
    relatedSkills: ['es_nie_registration', 'es_social_security', 'es_tax_residency'],
  },
  {
    id: 'es_social_security',
    name: 'Social Security Registration',
    description: 'Register with Spanish Social Security (Seguridad Social) for healthcare and benefits',
    countryCode: 'ES',
    countryName: 'Spain',
    category: 'social_security',
    targetDomains: ['www.seg-social.es', 'sede.seg-social.gob.es'],
    topic: 'government_portal',
    languages: ['es'],
    version: '1.0.0',
    expectedFields: ['registration_types', 'documents', 'benefits', 'contributions'],
    steps: [
      {
        id: 'registration_types',
        name: 'Registration Types',
        description: 'Understand different registration regimes',
        urlPattern: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/Afiliacion',
        contentType: 'requirements',
        extractFields: ['employed', 'self_employed', 'special_regimes'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Documents needed for registration',
        urlPattern: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/Afiliacion/10817',
        contentType: 'documents',
        extractFields: ['nie', 'work_contract', 'ta_forms'],
        critical: true,
      },
      {
        id: 'contributions',
        name: 'Contribution Rates',
        description: 'Current social security contribution rates',
        urlPattern: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/CotizacionRecaudacionTrabajadores',
        contentType: 'fees',
        extractFields: ['employer_rate', 'employee_rate', 'self_employed_rate', 'bases'],
        critical: false,
      },
    ],
    notes: [
      'Self-employed (autonomo) must register with RETA regime',
      'Minimum contribution base changes yearly',
      'Healthcare coverage starts immediately upon registration',
    ],
    relatedSkills: ['es_nie_registration', 'es_tax_residency'],
  },
  {
    id: 'es_tax_residency',
    name: 'Tax Residency & Beckham Law',
    description: 'Understand Spanish tax residency rules and the Beckham Law special regime for expats',
    countryCode: 'ES',
    countryName: 'Spain',
    category: 'tax_registration',
    targetDomains: ['sede.agenciatributaria.gob.es', 'www.agenciatributaria.es'],
    topic: 'tax_finance',
    languages: ['es', 'en'],
    version: '1.0.0',
    expectedFields: ['residency_rules', 'beckham_law', 'tax_rates', 'filing_deadlines'],
    steps: [
      {
        id: 'residency_rules',
        name: 'Tax Residency Determination',
        description: 'Understand when you become a Spanish tax resident',
        urlPattern: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/IRPF/residencia-fiscal.html',
        contentType: 'requirements',
        extractFields: ['183_day_rule', 'center_of_interests', 'family_ties'],
        critical: true,
      },
      {
        id: 'beckham_law',
        name: 'Beckham Law (Special Regime)',
        description: 'Special tax regime for new residents - flat 24% rate',
        urlPattern: 'https://sede.agenciatributaria.gob.es/Sede/procedimientos/regimen-especial-trabajadores-desplazados.html',
        contentType: 'requirements',
        extractFields: ['eligibility', 'tax_rate', 'duration', 'application_deadline'],
        critical: true,
      },
      {
        id: 'filing',
        name: 'Tax Filing Requirements',
        description: 'Annual tax filing deadlines and requirements',
        urlPattern: 'https://sede.agenciatributaria.gob.es/Sede/irpf/campana-renta.html',
        contentType: 'timeline',
        extractFields: ['filing_period', 'modelo_100', 'payment_methods'],
        critical: false,
      },
    ],
    notes: [
      'Beckham Law must be applied within 6 months of first registration',
      'The 183-day rule counts any part of a day as a full day',
      'World-wide income is taxed once you become a tax resident',
    ],
    relatedSkills: ['es_nie_registration', 'es_social_security'],
  },
];

// =============================================================================
// PORTUGAL SKILLS
// =============================================================================

/**
 * Portugal government portal skills
 */
export const PORTUGAL_SKILLS: GovernmentSkill[] = [
  {
    id: 'pt_nif_registration',
    name: 'NIF (Tax Number) Registration',
    description: 'Get a Portuguese NIF (Numero de Identificacao Fiscal) tax number',
    countryCode: 'PT',
    countryName: 'Portugal',
    category: 'tax_registration',
    targetDomains: ['www.portaldasfinancas.gov.pt', 'eportugal.gov.pt'],
    topic: 'government_portal',
    languages: ['pt', 'en'],
    version: '1.0.0',
    expectedFields: ['requirements', 'documents', 'process', 'fiscal_representative'],
    steps: [
      {
        id: 'requirements',
        name: 'NIF Requirements',
        description: 'Understand NIF application requirements',
        urlPattern: 'https://eportugal.gov.pt/servicos/pedir-a-atribuicao-de-numero-de-identificacao-fiscal-para-pessoas-singulares',
        contentType: 'requirements',
        extractFields: ['who_needs_nif', 'eu_vs_non_eu', 'fiscal_representative'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Documents needed for NIF application',
        urlPattern: 'https://eportugal.gov.pt/servicos/pedir-a-atribuicao-de-numero-de-identificacao-fiscal-para-pessoas-singulares',
        contentType: 'documents',
        extractFields: ['passport', 'proof_of_address', 'representative_authorization'],
        critical: true,
      },
      {
        id: 'process',
        name: 'Application Process',
        description: 'How to apply for NIF',
        urlPattern: 'https://www.portaldasfinancas.gov.pt/at/html/index.html',
        contentType: 'general',
        extractFields: ['in_person', 'online', 'processing_time'],
        critical: true,
      },
    ],
    notes: [
      'Non-EU citizens need a fiscal representative (representante fiscal)',
      'NIF can be obtained before arriving in Portugal',
      'Required for opening bank accounts, buying property, signing contracts',
    ],
    relatedSkills: ['pt_d7_visa', 'pt_digital_nomad_visa'],
  },
  {
    id: 'pt_d7_visa',
    name: 'D7 Passive Income Visa',
    description: 'Apply for the Portuguese D7 visa for retirees and passive income earners',
    countryCode: 'PT',
    countryName: 'Portugal',
    category: 'visa_residence',
    targetDomains: ['aima.gov.pt', 'vistos.mne.gov.pt', 'eportugal.gov.pt'],
    topic: 'visa_immigration',
    languages: ['pt', 'en'],
    version: '1.0.0',
    expectedFields: ['eligibility', 'income_requirements', 'documents', 'fees', 'timeline'],
    steps: [
      {
        id: 'overview',
        name: 'D7 Visa Overview',
        description: 'Understand the D7 visa program',
        urlPattern: 'https://aima.gov.pt/visto-de-residencia/visto-d7',
        contentType: 'requirements',
        extractFields: ['program_description', 'benefits', 'duration'],
        critical: true,
      },
      {
        id: 'income',
        name: 'Income Requirements',
        description: 'Minimum income requirements for D7',
        urlPattern: 'https://aima.gov.pt/visto-de-residencia/visto-d7/requisitos',
        contentType: 'requirements',
        extractFields: ['minimum_income', 'passive_income_types', 'family_additional'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Complete document checklist for D7 visa',
        urlPattern: 'https://vistos.mne.gov.pt/pt/vistos-nacionais/documentos-instrutores/visto-de-residencia',
        contentType: 'documents',
        extractFields: ['passport', 'criminal_record', 'health_insurance', 'income_proof', 'housing'],
        critical: true,
      },
      {
        id: 'fees',
        name: 'Visa and Permit Fees',
        description: 'Current D7 visa and residence permit fees',
        urlPattern: 'https://aima.gov.pt/taxas',
        contentType: 'fees',
        extractFields: ['visa_fee', 'residence_permit_fee', 'renewal_fee'],
        critical: false,
      },
    ],
    notes: [
      'Income must be passive (pensions, dividends, rental income, etc.)',
      'Minimum is Portuguese minimum wage - currently around 760/month',
      'NHR (Non-Habitual Resident) tax regime can be applied after residency',
    ],
    relatedSkills: ['pt_nif_registration', 'pt_nhr_tax_regime', 'pt_digital_nomad_visa'],
  },
  {
    id: 'pt_nhr_tax_regime',
    name: 'NHR (Non-Habitual Resident) Tax Regime',
    description: 'Apply for the Portuguese NHR tax regime for favorable tax treatment',
    countryCode: 'PT',
    countryName: 'Portugal',
    category: 'tax_registration',
    targetDomains: ['www.portaldasfinancas.gov.pt', 'info.portaldasfinancas.gov.pt'],
    topic: 'tax_finance',
    languages: ['pt', 'en'],
    version: '1.0.0',
    expectedFields: ['eligibility', 'tax_benefits', 'application_process', 'deadline'],
    steps: [
      {
        id: 'eligibility',
        name: 'NHR Eligibility',
        description: 'Check eligibility for NHR regime',
        urlPattern: 'https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Folhetos_informativos/Documents/IRS_RNH.pdf',
        contentType: 'requirements',
        extractFields: ['residency_requirement', 'non_resident_period', 'application_window'],
        critical: true,
      },
      {
        id: 'benefits',
        name: 'Tax Benefits',
        description: 'Understand NHR tax benefits',
        urlPattern: 'https://www.portaldasfinancas.gov.pt/at/html/index.html',
        contentType: 'requirements',
        extractFields: ['flat_rate', 'foreign_income', 'exempt_income_types', 'duration'],
        critical: true,
      },
      {
        id: 'application',
        name: 'How to Apply',
        description: 'Application process for NHR',
        urlPattern: 'https://sitfiscal.portaldasfinancas.gov.pt/geral/dashboard',
        contentType: 'general',
        extractFields: ['online_application', 'required_documents', 'processing_time'],
        critical: true,
      },
    ],
    notes: [
      'Must not have been a Portuguese tax resident in the previous 5 years',
      'Application must be made by March 31 of the year following residency',
      'NHR status lasts for 10 years and cannot be renewed',
      'Note: NHR program closed for new applicants in 2024 but existing holders keep benefits',
    ],
    relatedSkills: ['pt_nif_registration', 'pt_d7_visa'],
  },
  {
    id: 'pt_digital_nomad_visa',
    name: 'Digital Nomad Visa',
    description: 'Apply for the Portuguese Digital Nomad Visa for remote workers',
    countryCode: 'PT',
    countryName: 'Portugal',
    category: 'visa_residence',
    targetDomains: ['aima.gov.pt', 'vistos.mne.gov.pt'],
    topic: 'visa_immigration',
    languages: ['pt', 'en'],
    version: '1.0.0',
    expectedFields: ['eligibility', 'income_requirements', 'documents', 'fees'],
    steps: [
      {
        id: 'overview',
        name: 'Digital Nomad Visa Overview',
        description: 'Understand the Digital Nomad Visa program',
        urlPattern: 'https://aima.gov.pt/visto-de-residencia/visto-para-trabalho-remoto',
        contentType: 'requirements',
        extractFields: ['program_description', 'duration', 'benefits'],
        critical: true,
      },
      {
        id: 'income',
        name: 'Income Requirements',
        description: 'Minimum income for Digital Nomad Visa',
        urlPattern: 'https://aima.gov.pt/visto-de-residencia/visto-para-trabalho-remoto/requisitos',
        contentType: 'requirements',
        extractFields: ['minimum_income', 'income_proof', 'contract_requirements'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Complete document checklist',
        urlPattern: 'https://vistos.mne.gov.pt/pt/vistos-nacionais/documentos-instrutores/visto-de-residencia',
        contentType: 'documents',
        extractFields: ['passport', 'work_proof', 'health_insurance', 'criminal_record'],
        critical: true,
      },
    ],
    notes: [
      'Minimum income is 4x Portuguese minimum wage (approximately 3,040/month)',
      'Must prove remote work for non-Portuguese company',
      'Can lead to permanent residency after 5 years',
    ],
    relatedSkills: ['pt_nif_registration', 'pt_d7_visa'],
  },
];

// =============================================================================
// GERMANY SKILLS
// =============================================================================

/**
 * Germany government portal skills
 */
export const GERMANY_SKILLS: GovernmentSkill[] = [
  {
    id: 'de_anmeldung',
    name: 'Residence Registration (Anmeldung)',
    description: 'Register your residence in Germany - mandatory within 14 days of moving',
    countryCode: 'DE',
    countryName: 'Germany',
    category: 'general',
    targetDomains: ['www.berlin.de', 'stadt.muenchen.de', 'www.service-bw.de'],
    topic: 'government_portal',
    languages: ['de', 'en'],
    version: '1.0.0',
    expectedFields: ['requirements', 'documents', 'appointment', 'certificate'],
    steps: [
      {
        id: 'requirements',
        name: 'Anmeldung Requirements',
        description: 'Understand registration requirements',
        urlPattern: 'https://www.berlin.de/labo/buergerdienste/wohnen/anmelden/',
        contentType: 'requirements',
        extractFields: ['deadline', 'who_must_register', 'exceptions'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Documents needed for registration',
        urlPattern: 'https://www.berlin.de/labo/buergerdienste/wohnen/anmelden/artikel.35044.php',
        contentType: 'documents',
        extractFields: ['id_document', 'anmeldeformular', 'wohnungsgeberbestaetigung', 'landlord_form'],
        critical: true,
      },
      {
        id: 'appointment',
        name: 'Book Appointment',
        description: 'Information about booking Burgeramt appointment',
        urlPattern: 'https://service.berlin.de/terminvereinbarung/',
        contentType: 'general',
        extractFields: ['booking_system', 'locations', 'wait_times'],
        critical: true,
        notes: 'Appointments can be difficult to get - check multiple districts',
      },
    ],
    notes: [
      'Anmeldung must be done within 14 days of moving to a new address',
      'The landlord confirmation (Wohnungsgeberbestaetigung) is mandatory',
      'The Anmeldebestaetigung is needed for many other registrations',
    ],
    relatedSkills: ['de_tax_id', 'de_health_insurance', 'de_freelance_visa'],
  },
  {
    id: 'de_freelance_visa',
    name: 'Freelance Visa (Freiberufler)',
    description: 'Apply for the German Freelance Visa for self-employed professionals',
    countryCode: 'DE',
    countryName: 'Germany',
    category: 'visa_residence',
    targetDomains: ['www.bamf.de', 'www.auswaertiges-amt.de', 'www.berlin.de'],
    topic: 'visa_immigration',
    languages: ['de', 'en'],
    version: '1.0.0',
    expectedFields: ['eligibility', 'business_plan', 'documents', 'fees'],
    steps: [
      {
        id: 'overview',
        name: 'Freelance Visa Overview',
        description: 'Understand the Freelance Visa requirements',
        urlPattern: 'https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwsuchenderAufenthalt/Selbststaendige/selbststaendige-node.html',
        contentType: 'requirements',
        extractFields: ['freiberufler_vs_gewerbetreibende', 'eligible_professions', 'requirements'],
        critical: true,
      },
      {
        id: 'professions',
        name: 'Eligible Professions',
        description: 'List of recognized freelance professions',
        urlPattern: 'https://www.auswaertiges-amt.de/en/visa-service/buergerservice/faq/19-freiberufliche-taetigkeit/606878',
        contentType: 'requirements',
        extractFields: ['katalogberufe', 'artistic', 'teaching', 'consulting'],
        critical: true,
      },
      {
        id: 'documents',
        name: 'Required Documents',
        description: 'Complete document checklist',
        urlPattern: 'https://www.berlin.de/einwanderung/aufenthalt/erwerbstaetigkeit/selbstaendige/',
        contentType: 'documents',
        extractFields: ['passport', 'business_plan', 'qualifications', 'client_letters', 'financial_proof'],
        critical: true,
      },
      {
        id: 'business_plan',
        name: 'Business Plan Requirements',
        description: 'What to include in your business plan',
        urlPattern: 'https://www.berlin.de/einwanderung/aufenthalt/erwerbstaetigkeit/selbstaendige/',
        contentType: 'documents',
        extractFields: ['structure', 'financials', 'market_analysis', 'local_benefit'],
        critical: true,
        notes: 'Business plan should demonstrate local economic benefit',
      },
    ],
    notes: [
      'Freiberufler (liberal professions) have easier requirements than Gewerbetreibende (trade businesses)',
      'Letters of intent from German clients strengthen the application',
      'Health insurance is mandatory and must be proven',
    ],
    relatedSkills: ['de_anmeldung', 'de_tax_id', 'de_health_insurance'],
  },
  {
    id: 'de_tax_id',
    name: 'Tax ID (Steuer-ID) & Tax Number',
    description: 'Understand German tax identification numbers and registration',
    countryCode: 'DE',
    countryName: 'Germany',
    category: 'tax_registration',
    targetDomains: ['www.bzst.de', 'www.finanzamt.de', 'www.elster.de'],
    topic: 'tax_finance',
    languages: ['de', 'en'],
    version: '1.0.0',
    expectedFields: ['steuer_id', 'steuernummer', 'registration', 'elster'],
    steps: [
      {
        id: 'tax_ids',
        name: 'Types of Tax IDs',
        description: 'Understand Steuer-ID vs Steuernummer',
        urlPattern: 'https://www.bzst.de/DE/Privatpersonen/StesuerlicheIdentifikationsnummer/steueridnr_node.html',
        contentType: 'requirements',
        extractFields: ['steuer_id_purpose', 'steuernummer_purpose', 'when_needed'],
        critical: true,
      },
      {
        id: 'get_steuer_id',
        name: 'Get Your Steuer-ID',
        description: 'How to obtain your tax ID',
        urlPattern: 'https://www.bzst.de/DE/Privatpersonen/SteuerlicheIdentifikationsnummer/FAQ/faq_node.html',
        contentType: 'general',
        extractFields: ['automatic_assignment', 'lost_id', 'request_process'],
        critical: true,
        notes: 'Steuer-ID is sent automatically after Anmeldung',
      },
      {
        id: 'elster',
        name: 'ELSTER Registration',
        description: 'Register for online tax filing',
        urlPattern: 'https://www.elster.de/eportal/registrierung-auswahl',
        contentType: 'general',
        extractFields: ['registration_process', 'certificate', 'tax_filing'],
        critical: false,
      },
    ],
    notes: [
      'Steuer-ID is sent by mail 2-3 weeks after Anmeldung',
      'Steuernummer is assigned by your local Finanzamt',
      'Freelancers need a Steuernummer to issue invoices',
    ],
    relatedSkills: ['de_anmeldung', 'de_freelance_visa'],
  },
  {
    id: 'de_health_insurance',
    name: 'Health Insurance Registration',
    description: 'Understand and register for German health insurance (Krankenversicherung)',
    countryCode: 'DE',
    countryName: 'Germany',
    category: 'healthcare',
    targetDomains: ['www.bundesgesundheitsministerium.de', 'www.krankenkassen.de'],
    topic: 'government_portal',
    languages: ['de', 'en'],
    version: '1.0.0',
    expectedFields: ['public_vs_private', 'eligibility', 'costs', 'providers'],
    steps: [
      {
        id: 'overview',
        name: 'Health Insurance Overview',
        description: 'Understand German health insurance system',
        urlPattern: 'https://www.bundesgesundheitsministerium.de/themen/krankenversicherung.html',
        contentType: 'requirements',
        extractFields: ['mandatory_coverage', 'public_gesetzlich', 'private_privat'],
        critical: true,
      },
      {
        id: 'eligibility',
        name: 'Public vs Private Eligibility',
        description: 'Who can choose private insurance',
        urlPattern: 'https://www.krankenkassen.de/gesetzliche-krankenkassen/system-gesetzliche-krankenversicherung/',
        contentType: 'requirements',
        extractFields: ['income_threshold', 'self_employed_rules', 'employee_rules'],
        critical: true,
      },
      {
        id: 'providers',
        name: 'Compare Providers',
        description: 'Compare public health insurance providers',
        urlPattern: 'https://www.krankenkassen.de/krankenkassen-vergleich/',
        contentType: 'general',
        extractFields: ['major_providers', 'additional_benefits', 'contribution_rates'],
        critical: false,
      },
    ],
    notes: [
      'Health insurance is mandatory in Germany',
      'Public insurance contribution is ~15% of income (split employer/employee)',
      'Private insurance is only for those earning above threshold or self-employed',
    ],
    relatedSkills: ['de_anmeldung', 'de_freelance_visa'],
  },
];

// =============================================================================
// SKILL PACK
// =============================================================================

/**
 * EU Government Portal Skill Pack
 *
 * Contains all skills for Spain, Portugal, and Germany.
 */
export const GOVERNMENT_SKILL_PACK: GovernmentSkillPack = {
  id: 'eu-government-portals',
  name: 'EU Government Portal Skills',
  description: 'Pre-built skills for navigating government portals in Spain, Portugal, and Germany. Covers visa applications, tax registration, social security, and more.',
  version: '1.0.0',
  countries: ['ES', 'PT', 'DE'],
  skills: [...SPAIN_SKILLS, ...PORTUGAL_SKILLS, ...GERMANY_SKILLS],
  metadata: {
    author: 'Unbrowser',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    license: 'MIT',
    homepage: 'https://github.com/ogoldberg/ai-first-web-client',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all skills for a specific country
 */
export function getSkillsForCountry(countryCode: string): GovernmentSkill[] {
  const code = countryCode.toUpperCase();
  return GOVERNMENT_SKILL_PACK.skills.filter((s) => s.countryCode === code);
}

/**
 * Get a specific skill by ID
 */
export function getSkillById(skillId: string): GovernmentSkill | undefined {
  return GOVERNMENT_SKILL_PACK.skills.find((s) => s.id === skillId);
}

/**
 * Get skills by service category
 */
export function getSkillsByCategory(category: GovernmentServiceCategory): GovernmentSkill[] {
  return GOVERNMENT_SKILL_PACK.skills.filter((s) => s.category === category);
}

/**
 * Get skills for a specific domain
 */
export function getSkillsForDomain(domain: string): GovernmentSkill[] {
  const normalizedDomain = domain.replace(/^www\./, '');
  return GOVERNMENT_SKILL_PACK.skills.filter((s) =>
    s.targetDomains.some((d) => d.includes(normalizedDomain) || normalizedDomain.includes(d.replace(/^www\./, '')))
  );
}

/**
 * Search skills by text
 */
export function searchSkills(query: string): GovernmentSkill[] {
  const lowerQuery = query.toLowerCase();
  return GOVERNMENT_SKILL_PACK.skills.filter(
    (s) =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.description.toLowerCase().includes(lowerQuery) ||
      s.expectedFields.some((f) => f.toLowerCase().includes(lowerQuery))
  );
}

/**
 * List all available skills with metadata
 */
export function listGovernmentSkills(): Array<{
  id: string;
  name: string;
  country: string;
  category: GovernmentServiceCategory;
  description: string;
}> {
  return GOVERNMENT_SKILL_PACK.skills.map((s) => ({
    id: s.id,
    name: s.name,
    country: s.countryName,
    category: s.category,
    description: s.description,
  }));
}

/**
 * Convert a GovernmentSkill to a PublishedPattern for marketplace
 */
export function skillToPattern(skill: GovernmentSkill): Omit<PublishedPattern, 'id'> {
  return {
    patternType: 'skill' as PatternType,
    patternData: skill,
    name: skill.name,
    description: skill.description,
    category: 'government' as PatternCategory,
    tags: [skill.countryCode.toLowerCase(), skill.category, ...skill.languages],
    authorId: 'unbrowser',
    authorName: 'Unbrowser',
    domain: skill.targetDomains[0] || '',
    targetSite: skill.countryName,
    version: skill.version,
    installCount: 0,
    ratingCount: 0,
    moderationStatus: 'approved',
    publishedAt: Date.now(),
    updatedAt: Date.now(),
    isOfficial: true,
  };
}

/**
 * Export the skill pack as JSON for sharing
 */
export function exportSkillPack(): string {
  return JSON.stringify(GOVERNMENT_SKILL_PACK, null, 2);
}

/**
 * Import a skill pack from JSON
 */
export function importSkillPack(json: string): GovernmentSkillPack {
  const pack = JSON.parse(json) as GovernmentSkillPack;
  // Validate required fields
  if (!pack.id || !pack.name || !Array.isArray(pack.skills)) {
    throw new Error('Invalid skill pack format: missing required fields');
  }
  return pack;
}

/**
 * Get summary of the skill pack
 */
export function getSkillPackSummary(): {
  totalSkills: number;
  byCountry: Record<string, number>;
  byCategory: Record<string, number>;
  version: string;
} {
  const byCountry: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const skill of GOVERNMENT_SKILL_PACK.skills) {
    byCountry[skill.countryCode] = (byCountry[skill.countryCode] || 0) + 1;
    byCategory[skill.category] = (byCategory[skill.category] || 0) + 1;
  }

  return {
    totalSkills: GOVERNMENT_SKILL_PACK.skills.length,
    byCountry,
    byCategory,
    version: GOVERNMENT_SKILL_PACK.version,
  };
}
