/**
 * Auto Portal Discovery (INT-016)
 *
 * Given a country code, discovers official government portals automatically.
 * Uses multiple discovery strategies:
 * 1. Known portal database (built-in knowledge)
 * 2. Web search for official sites
 * 3. DNS pattern probing (common gov TLDs)
 * 4. Link discovery from found portals
 *
 * Integrates with:
 * - GovernmentSkillPack for known portals
 * - DomainPresets for pre-configured selectors
 * - HeuristicsConfig for domain grouping
 * - DiscoveryCache for result caching
 *
 * @example
 * ```typescript
 * import { AutoPortalDiscovery } from 'llm-browser/sdk';
 *
 * const discovery = new AutoPortalDiscovery();
 * const portals = await discovery.discoverPortals('ES');
 * console.log(portals.portals); // All discovered Spanish government portals
 * ```
 */

import { logger } from '../utils/logger.js';
import {
  getDiscoveryCache,
  type DiscoveryCache,
  type DiscoverySource as CacheDiscoverySource,
} from '../utils/discovery-cache.js';
import {
  getSkillsForCountry,
  type GovernmentSkill,
  type GovernmentServiceCategory,
} from './government-skill-pack.js';
import { getConfig } from '../utils/heuristics-config.js';

// Use a custom source for portal discovery since it's not a standard API discovery source
const PORTAL_DISCOVERY_SOURCE: CacheDiscoverySource = 'links'; // Use 'links' as closest match

// Cache TTL for portal discovery results (24 hours)
const PORTAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const discoveryLogger = logger.create('AutoPortalDiscovery');

// =============================================================================
// TYPES
// =============================================================================

/**
 * ISO 3166-1 alpha-2 country codes supported for discovery
 */
export type SupportedCountryCode =
  | 'ES' // Spain
  | 'PT' // Portugal
  | 'DE' // Germany
  | 'FR' // France
  | 'IT' // Italy
  | 'NL' // Netherlands
  | 'BE' // Belgium
  | 'AT' // Austria
  | 'CH' // Switzerland
  | 'GB' // United Kingdom
  | 'IE' // Ireland
  | 'US' // United States
  | 'CA' // Canada
  | 'AU' // Australia
  | 'NZ' // New Zealand
  | 'SE' // Sweden
  | 'NO' // Norway
  | 'DK' // Denmark
  | 'FI' // Finland
  | 'PL' // Poland
  | 'CZ' // Czech Republic
  | 'GR' // Greece
  | 'HR' // Croatia
  | 'RO' // Romania
  | 'BG' // Bulgaria
  | 'HU' // Hungary
  | 'SK' // Slovakia
  | 'SI' // Slovenia
  | 'EE' // Estonia
  | 'LV' // Latvia
  | 'LT' // Lithuania
  | 'CY' // Cyprus
  | 'MT' // Malta
  | 'LU' // Luxembourg
  | 'MX' // Mexico
  | 'BR' // Brazil
  | 'AR' // Argentina
  | 'CL' // Chile
  | 'CO' // Colombia
  | 'JP' // Japan
  | 'KR' // South Korea
  | 'SG' // Singapore
  | 'IN' // India
  | 'AE' // United Arab Emirates
  | 'IL' // Israel
  | 'ZA'; // South Africa

/**
 * A discovered government portal
 */
export interface DiscoveredPortal {
  /** Portal domain */
  domain: string;
  /** Full URL to portal */
  url: string;
  /** Human-readable name */
  name: string;
  /** Description of the portal */
  description: string;
  /** Country code */
  countryCode: string;
  /** Primary language(s) */
  languages: string[];
  /** Service categories available */
  categories: GovernmentServiceCategory[];
  /** Confidence score (0-1) */
  confidence: number;
  /** How this portal was discovered */
  discoverySource: PortalDiscoverySource;
  /** Whether portal has been verified as accessible */
  verified: boolean;
  /** Last verification timestamp */
  verifiedAt?: number;
  /** Related portals (links to/from) */
  relatedPortals?: string[];
  /** Portal sections identified */
  sections?: PortalSection[];
}

/**
 * A section within a portal
 */
export interface PortalSection {
  /** Section name */
  name: string;
  /** Section URL */
  url: string;
  /** Service category */
  category: GovernmentServiceCategory;
  /** Description */
  description?: string;
}

/**
 * How a portal was discovered
 */
export type PortalDiscoverySource =
  | 'known_database' // From built-in knowledge (government-skill-pack)
  | 'dns_probe' // DNS pattern probing
  | 'web_search' // Web search results
  | 'link_discovery' // Discovered from links on another portal
  | 'heuristics_config' // From heuristics configuration
  | 'user_provided'; // Provided by user

/**
 * Portal discovery result
 */
export interface PortalDiscoveryResult {
  /** Country code queried */
  countryCode: string;
  /** Country name */
  countryName: string;
  /** All discovered portals */
  portals: DiscoveredPortal[];
  /** Portals grouped by category */
  byCategory: Record<GovernmentServiceCategory, DiscoveredPortal[]>;
  /** Discovery timestamp */
  discoveredAt: number;
  /** Time taken in ms */
  durationMs: number;
  /** Cache status */
  fromCache: boolean;
  /** Discovery sources used */
  sourcesUsed: PortalDiscoverySource[];
  /** Any errors encountered */
  errors?: string[];
}

/**
 * Discovery options
 */
export interface PortalDiscoveryOptions {
  /** Skip cache lookup */
  skipCache?: boolean;
  /** Include unverified portals */
  includeUnverified?: boolean;
  /** Filter by specific categories */
  categories?: GovernmentServiceCategory[];
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  /** Enable DNS probing (slower but discovers more) */
  enableDnsProbing?: boolean;
  /** Enable web search (requires browser) */
  enableWebSearch?: boolean;
  /** Timeout for discovery (ms) */
  timeoutMs?: number;
}

// =============================================================================
// COUNTRY DATA
// =============================================================================

/**
 * Country information for portal discovery
 */
interface CountryInfo {
  code: SupportedCountryCode;
  name: string;
  languages: string[];
  govTlds: string[]; // Common government TLD patterns
  searchTerms: string[]; // Terms for web search
  knownMainPortal?: string; // Main government portal URL
}

/**
 * Database of country information for discovery
 */
const COUNTRY_DATABASE: Record<string, CountryInfo> = {
  ES: {
    code: 'ES',
    name: 'Spain',
    languages: ['es'],
    govTlds: ['.gob.es', '.gov.es', '.es'],
    searchTerms: ['gobierno espana portal', 'sede electronica', 'tramites'],
    knownMainPortal: 'https://administracion.gob.es',
  },
  PT: {
    code: 'PT',
    name: 'Portugal',
    languages: ['pt'],
    govTlds: ['.gov.pt', '.pt'],
    searchTerms: ['governo portugal portal', 'eportugal', 'servicos publicos'],
    knownMainPortal: 'https://eportugal.gov.pt',
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    languages: ['de'],
    govTlds: ['.bund.de', '.de'],
    searchTerms: ['bundesregierung portal', 'verwaltung online', 'behoerden'],
    knownMainPortal: 'https://www.bund.de',
  },
  FR: {
    code: 'FR',
    name: 'France',
    languages: ['fr'],
    govTlds: ['.gouv.fr', '.fr'],
    searchTerms: ['gouvernement france portail', 'service public', 'demarches'],
    knownMainPortal: 'https://www.service-public.fr',
  },
  IT: {
    code: 'IT',
    name: 'Italy',
    languages: ['it'],
    govTlds: ['.gov.it', '.it'],
    searchTerms: ['governo italia portale', 'servizi pubblici', 'anagrafe'],
    knownMainPortal: 'https://www.italia.it',
  },
  NL: {
    code: 'NL',
    name: 'Netherlands',
    languages: ['nl'],
    govTlds: ['.overheid.nl', '.rijksoverheid.nl', '.nl'],
    searchTerms: ['overheid nederland portal', 'rijksdiensten', 'gemeentes'],
    knownMainPortal: 'https://www.rijksoverheid.nl',
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    languages: ['en'],
    govTlds: ['.gov.uk', '.uk'],
    searchTerms: ['uk government services', 'gov.uk'],
    knownMainPortal: 'https://www.gov.uk',
  },
  US: {
    code: 'US',
    name: 'United States',
    languages: ['en'],
    govTlds: ['.gov', '.mil', '.fed.us'],
    searchTerms: ['usa government services', 'federal agencies'],
    knownMainPortal: 'https://www.usa.gov',
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    languages: ['en', 'fr'],
    govTlds: ['.gc.ca', '.canada.ca'],
    searchTerms: ['canada government services', 'services canada'],
    knownMainPortal: 'https://www.canada.ca',
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    languages: ['en'],
    govTlds: ['.gov.au', '.australia.gov.au'],
    searchTerms: ['australia government services', 'myGov'],
    knownMainPortal: 'https://www.australia.gov.au',
  },
  IE: {
    code: 'IE',
    name: 'Ireland',
    languages: ['en', 'ga'],
    govTlds: ['.gov.ie', '.ie'],
    searchTerms: ['ireland government services', 'citizens information'],
    knownMainPortal: 'https://www.gov.ie',
  },
  BE: {
    code: 'BE',
    name: 'Belgium',
    languages: ['nl', 'fr', 'de'],
    govTlds: ['.belgium.be', '.fgov.be'],
    searchTerms: ['belgium government services', 'diensten belgie'],
    knownMainPortal: 'https://www.belgium.be',
  },
  AT: {
    code: 'AT',
    name: 'Austria',
    languages: ['de'],
    govTlds: ['.gv.at', '.at'],
    searchTerms: ['oesterreich regierung portal', 'behoerden'],
    knownMainPortal: 'https://www.oesterreich.gv.at',
  },
  CH: {
    code: 'CH',
    name: 'Switzerland',
    languages: ['de', 'fr', 'it', 'rm'],
    govTlds: ['.admin.ch', '.ch.ch'],
    searchTerms: ['schweiz regierung portal', 'bundesverwaltung'],
    knownMainPortal: 'https://www.ch.ch',
  },
  SE: {
    code: 'SE',
    name: 'Sweden',
    languages: ['sv'],
    govTlds: ['.gov.se', '.se'],
    searchTerms: ['sverige regering portal', 'myndigheter'],
    knownMainPortal: 'https://www.sweden.se',
  },
  NO: {
    code: 'NO',
    name: 'Norway',
    languages: ['no', 'nb', 'nn'],
    govTlds: ['.regjeringen.no', '.no'],
    searchTerms: ['norge regjering portal', 'offentlige tjenester'],
    knownMainPortal: 'https://www.regjeringen.no',
  },
  DK: {
    code: 'DK',
    name: 'Denmark',
    languages: ['da'],
    govTlds: ['.gov.dk', '.dk'],
    searchTerms: ['danmark regering portal', 'borger.dk'],
    knownMainPortal: 'https://www.borger.dk',
  },
  FI: {
    code: 'FI',
    name: 'Finland',
    languages: ['fi', 'sv'],
    govTlds: ['.gov.fi', '.fi'],
    searchTerms: ['suomi hallitus portaali', 'viranomaiset'],
    knownMainPortal: 'https://www.suomi.fi',
  },
  PL: {
    code: 'PL',
    name: 'Poland',
    languages: ['pl'],
    govTlds: ['.gov.pl', '.pl'],
    searchTerms: ['polska rzad portal', 'urzedy'],
    knownMainPortal: 'https://www.gov.pl',
  },
  JP: {
    code: 'JP',
    name: 'Japan',
    languages: ['ja'],
    govTlds: ['.go.jp', '.lg.jp'],
    searchTerms: ['japan government portal', 'e-gov'],
    knownMainPortal: 'https://www.e-gov.go.jp',
  },
  KR: {
    code: 'KR',
    name: 'South Korea',
    languages: ['ko'],
    govTlds: ['.go.kr', '.kr'],
    searchTerms: ['korea government portal', 'gov.kr'],
    knownMainPortal: 'https://www.gov.kr',
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    languages: ['en', 'zh', 'ms', 'ta'],
    govTlds: ['.gov.sg', '.sg'],
    searchTerms: ['singapore government services', 'singpass'],
    knownMainPortal: 'https://www.gov.sg',
  },
  IN: {
    code: 'IN',
    name: 'India',
    languages: ['en', 'hi'],
    govTlds: ['.gov.in', '.nic.in'],
    searchTerms: ['india government portal', 'digital india'],
    knownMainPortal: 'https://www.india.gov.in',
  },
  AE: {
    code: 'AE',
    name: 'United Arab Emirates',
    languages: ['ar', 'en'],
    govTlds: ['.gov.ae', '.ae'],
    searchTerms: ['uae government portal', 'emirates services'],
    knownMainPortal: 'https://u.ae',
  },
  MX: {
    code: 'MX',
    name: 'Mexico',
    languages: ['es'],
    govTlds: ['.gob.mx', '.mx'],
    searchTerms: ['mexico gobierno portal', 'tramites'],
    knownMainPortal: 'https://www.gob.mx',
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    languages: ['pt'],
    govTlds: ['.gov.br', '.br'],
    searchTerms: ['brasil governo portal', 'servicos publicos'],
    knownMainPortal: 'https://www.gov.br',
  },
  NZ: {
    code: 'NZ',
    name: 'New Zealand',
    languages: ['en', 'mi'],
    govTlds: ['.govt.nz', '.nz'],
    searchTerms: ['new zealand government services'],
    knownMainPortal: 'https://www.govt.nz',
  },
  IL: {
    code: 'IL',
    name: 'Israel',
    languages: ['he', 'ar', 'en'],
    govTlds: ['.gov.il', '.il'],
    searchTerms: ['israel government portal', 'misrad'],
    knownMainPortal: 'https://www.gov.il',
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    languages: ['en', 'af', 'zu'],
    govTlds: ['.gov.za', '.za'],
    searchTerms: ['south africa government services'],
    knownMainPortal: 'https://www.gov.za',
  },
  CZ: {
    code: 'CZ',
    name: 'Czech Republic',
    languages: ['cs'],
    govTlds: ['.gov.cz', '.cz'],
    searchTerms: ['cesko vlada portal', 'portaly verejne spravy'],
    knownMainPortal: 'https://portal.gov.cz',
  },
  GR: {
    code: 'GR',
    name: 'Greece',
    languages: ['el'],
    govTlds: ['.gov.gr', '.gr'],
    searchTerms: ['ellada kyvernisi portal', 'gov.gr'],
    knownMainPortal: 'https://www.gov.gr',
  },
  HU: {
    code: 'HU',
    name: 'Hungary',
    languages: ['hu'],
    govTlds: ['.gov.hu', '.hu'],
    searchTerms: ['magyarorszag kormany portal'],
    knownMainPortal: 'https://www.kormany.hu',
  },
  RO: {
    code: 'RO',
    name: 'Romania',
    languages: ['ro'],
    govTlds: ['.gov.ro', '.ro'],
    searchTerms: ['romania guvern portal', 'servicii publice'],
    knownMainPortal: 'https://www.gov.ro',
  },
  BG: {
    code: 'BG',
    name: 'Bulgaria',
    languages: ['bg'],
    govTlds: ['.government.bg', '.bg'],
    searchTerms: ['bulgaria pravitelstvo portal'],
    knownMainPortal: 'https://www.gov.bg',
  },
  HR: {
    code: 'HR',
    name: 'Croatia',
    languages: ['hr'],
    govTlds: ['.gov.hr', '.hr'],
    searchTerms: ['hrvatska vlada portal', 'e-gradani'],
    knownMainPortal: 'https://gov.hr',
  },
  SK: {
    code: 'SK',
    name: 'Slovakia',
    languages: ['sk'],
    govTlds: ['.gov.sk', '.sk'],
    searchTerms: ['slovensko vlada portal', 'slovensko.sk'],
    knownMainPortal: 'https://www.slovensko.sk',
  },
  SI: {
    code: 'SI',
    name: 'Slovenia',
    languages: ['sl'],
    govTlds: ['.gov.si', '.si'],
    searchTerms: ['slovenija vlada portal', 'e-uprava'],
    knownMainPortal: 'https://e-uprava.gov.si',
  },
  EE: {
    code: 'EE',
    name: 'Estonia',
    languages: ['et'],
    govTlds: ['.gov.ee', '.ee'],
    searchTerms: ['eesti valitsus portal', 'e-estonia'],
    knownMainPortal: 'https://www.eesti.ee',
  },
  LV: {
    code: 'LV',
    name: 'Latvia',
    languages: ['lv'],
    govTlds: ['.gov.lv', '.lv'],
    searchTerms: ['latvija valdiba portal', 'latvija.lv'],
    knownMainPortal: 'https://www.latvija.lv',
  },
  LT: {
    code: 'LT',
    name: 'Lithuania',
    languages: ['lt'],
    govTlds: ['.gov.lt', '.lt'],
    searchTerms: ['lietuva vyriausybe portal', 'e.valdzia'],
    knownMainPortal: 'https://www.e-tar.lt',
  },
  CY: {
    code: 'CY',
    name: 'Cyprus',
    languages: ['el', 'tr'],
    govTlds: ['.gov.cy', '.cy'],
    searchTerms: ['cyprus government portal'],
    knownMainPortal: 'https://www.gov.cy',
  },
  MT: {
    code: 'MT',
    name: 'Malta',
    languages: ['mt', 'en'],
    govTlds: ['.gov.mt', '.mt'],
    searchTerms: ['malta government services', 'servizz.gov.mt'],
    knownMainPortal: 'https://www.gov.mt',
  },
  LU: {
    code: 'LU',
    name: 'Luxembourg',
    languages: ['lb', 'fr', 'de'],
    govTlds: ['.public.lu', '.gouvernement.lu'],
    searchTerms: ['luxembourg gouvernement portal', 'guichet.lu'],
    knownMainPortal: 'https://guichet.public.lu',
  },
  AR: {
    code: 'AR',
    name: 'Argentina',
    languages: ['es'],
    govTlds: ['.gob.ar', '.ar'],
    searchTerms: ['argentina gobierno portal', 'tramites'],
    knownMainPortal: 'https://www.argentina.gob.ar',
  },
  CL: {
    code: 'CL',
    name: 'Chile',
    languages: ['es'],
    govTlds: ['.gob.cl', '.cl'],
    searchTerms: ['chile gobierno portal', 'chileatiende'],
    knownMainPortal: 'https://www.gob.cl',
  },
  CO: {
    code: 'CO',
    name: 'Colombia',
    languages: ['es'],
    govTlds: ['.gov.co', '.co'],
    searchTerms: ['colombia gobierno portal', 'tramites'],
    knownMainPortal: 'https://www.gov.co',
  },
};

/**
 * Known portal database organized by category
 */
const KNOWN_PORTALS_BY_COUNTRY: Record<
  string,
  Array<{
    domain: string;
    name: string;
    description: string;
    categories: GovernmentServiceCategory[];
    url: string;
  }>
> = {
  ES: [
    {
      domain: 'extranjeria.inclusion.gob.es',
      name: 'Extranjeria',
      description: 'Immigration and residence permits',
      categories: ['visa_residence', 'work_permit'],
      url: 'https://extranjeria.inclusion.gob.es',
    },
    {
      domain: 'sede.agenciatributaria.gob.es',
      name: 'Agencia Tributaria',
      description: 'Tax authority',
      categories: ['tax_registration'],
      url: 'https://sede.agenciatributaria.gob.es',
    },
    {
      domain: 'sede.seg-social.gob.es',
      name: 'Seguridad Social',
      description: 'Social security',
      categories: ['social_security'],
      url: 'https://sede.seg-social.gob.es',
    },
    {
      domain: 'www.policia.es',
      name: 'Policia Nacional',
      description: 'National police (NIE, passport)',
      categories: ['visa_residence'],
      url: 'https://www.policia.es',
    },
    {
      domain: 'www.dgt.es',
      name: 'DGT',
      description: 'Traffic authority (driving license)',
      categories: ['drivers_license', 'vehicle_registration'],
      url: 'https://www.dgt.es',
    },
    {
      domain: 'administracion.gob.es',
      name: 'Administracion Electronica',
      description: 'Central government portal',
      categories: ['general'],
      url: 'https://administracion.gob.es',
    },
  ],
  PT: [
    {
      domain: 'eportugal.gov.pt',
      name: 'ePortugal',
      description: 'Central services portal',
      categories: ['general', 'visa_residence'],
      url: 'https://eportugal.gov.pt',
    },
    {
      domain: 'aima.gov.pt',
      name: 'AIMA',
      description: 'Immigration agency (formerly SEF)',
      categories: ['visa_residence', 'work_permit'],
      url: 'https://aima.gov.pt',
    },
    {
      domain: 'portaldasfinancas.gov.pt',
      name: 'Portal das Financas',
      description: 'Tax authority',
      categories: ['tax_registration'],
      url: 'https://www.portaldasfinancas.gov.pt',
    },
    {
      domain: 'seg-social.pt',
      name: 'Seguranca Social',
      description: 'Social security',
      categories: ['social_security'],
      url: 'https://www.seg-social.pt',
    },
  ],
  DE: [
    {
      domain: 'bamf.de',
      name: 'BAMF',
      description: 'Federal migration agency',
      categories: ['visa_residence', 'work_permit'],
      url: 'https://www.bamf.de',
    },
    {
      domain: 'www.berlin.de',
      name: 'Berlin Portal',
      description: 'Berlin city services',
      categories: ['general', 'visa_residence'],
      url: 'https://www.berlin.de',
    },
    {
      domain: 'elster.de',
      name: 'ELSTER',
      description: 'Tax filing portal',
      categories: ['tax_registration'],
      url: 'https://www.elster.de',
    },
    {
      domain: 'bund.de',
      name: 'Bund.de',
      description: 'Federal government portal',
      categories: ['general'],
      url: 'https://www.bund.de',
    },
  ],
  FR: [
    {
      domain: 'service-public.fr',
      name: 'Service Public',
      description: 'Central services portal',
      categories: ['general'],
      url: 'https://www.service-public.fr',
    },
    {
      domain: 'impots.gouv.fr',
      name: 'Impots.gouv',
      description: 'Tax authority',
      categories: ['tax_registration'],
      url: 'https://www.impots.gouv.fr',
    },
    {
      domain: 'france-visas.gouv.fr',
      name: 'France Visas',
      description: 'Visa applications',
      categories: ['visa_residence'],
      url: 'https://france-visas.gouv.fr',
    },
    {
      domain: 'ameli.fr',
      name: 'Ameli',
      description: 'Health insurance',
      categories: ['healthcare'],
      url: 'https://www.ameli.fr',
    },
  ],
  GB: [
    {
      domain: 'www.gov.uk',
      name: 'GOV.UK',
      description: 'Central government portal',
      categories: ['general'],
      url: 'https://www.gov.uk',
    },
    {
      domain: 'www.gov.uk',
      name: 'UK Visas',
      description: 'Visa and immigration',
      categories: ['visa_residence', 'work_permit'],
      url: 'https://www.gov.uk/browse/visas-immigration',
    },
    {
      domain: 'www.gov.uk',
      name: 'HMRC',
      description: 'Tax authority',
      categories: ['tax_registration'],
      url: 'https://www.gov.uk/government/organisations/hm-revenue-customs',
    },
    {
      domain: 'nhs.uk',
      name: 'NHS',
      description: 'National Health Service',
      categories: ['healthcare'],
      url: 'https://www.nhs.uk',
    },
  ],
  US: [
    {
      domain: 'usa.gov',
      name: 'USA.gov',
      description: 'Central government portal',
      categories: ['general'],
      url: 'https://www.usa.gov',
    },
    {
      domain: 'uscis.gov',
      name: 'USCIS',
      description: 'Immigration services',
      categories: ['visa_residence', 'work_permit'],
      url: 'https://www.uscis.gov',
    },
    {
      domain: 'irs.gov',
      name: 'IRS',
      description: 'Internal Revenue Service',
      categories: ['tax_registration'],
      url: 'https://www.irs.gov',
    },
    {
      domain: 'ssa.gov',
      name: 'SSA',
      description: 'Social Security Administration',
      categories: ['social_security'],
      url: 'https://www.ssa.gov',
    },
    {
      domain: 'state.gov',
      name: 'State Department',
      description: 'Passports and travel',
      categories: ['visa_residence'],
      url: 'https://www.state.gov',
    },
  ],
};

// =============================================================================
// AUTO PORTAL DISCOVERY CLASS
// =============================================================================

/**
 * Auto Portal Discovery service
 *
 * Discovers government portals for a given country using multiple strategies.
 */
export class AutoPortalDiscovery {
  private cache: DiscoveryCache;
  // Use 'links' as the discovery source type since it's closest to portal discovery
  private readonly cacheSource: CacheDiscoverySource = 'links';

  constructor() {
    this.cache = getDiscoveryCache();
  }

  /**
   * Discover portals for a given country code
   */
  async discoverPortals(
    countryCode: string,
    options: PortalDiscoveryOptions = {}
  ): Promise<PortalDiscoveryResult> {
    const startTime = Date.now();
    const normalizedCode = countryCode.toUpperCase();

    discoveryLogger.info('Starting portal discovery', { countryCode: normalizedCode, options });

    // Check cache first
    if (!options.skipCache) {
      const cached = await this.cache.get(this.cacheSource, `portal:${normalizedCode}`);
      if (cached && typeof cached === 'object' && 'portals' in cached) {
        discoveryLogger.info('Returning cached discovery result', { countryCode: normalizedCode });
        return {
          ...(cached as PortalDiscoveryResult),
          fromCache: true,
          durationMs: Date.now() - startTime,
        };
      }
    }

    const countryInfo = COUNTRY_DATABASE[normalizedCode];
    const portals: DiscoveredPortal[] = [];
    const errors: string[] = [];
    const sourcesUsed: PortalDiscoverySource[] = [];

    // Strategy 1: Known database
    try {
      const knownPortals = await this.discoverFromKnownDatabase(normalizedCode, countryInfo);
      portals.push(...knownPortals);
      if (knownPortals.length > 0) {
        sourcesUsed.push('known_database');
      }
    } catch (error) {
      errors.push(`Known database: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Strategy 2: Government skill pack
    try {
      const skillPackPortals = await this.discoverFromSkillPack(normalizedCode);
      // Merge without duplicates
      for (const portal of skillPackPortals) {
        if (!portals.some(p => p.domain === portal.domain)) {
          portals.push(portal);
        }
      }
      if (skillPackPortals.length > 0 && !sourcesUsed.includes('known_database')) {
        sourcesUsed.push('known_database');
      }
    } catch (error) {
      errors.push(`Skill pack: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Strategy 3: Heuristics config
    try {
      const heuristicsPortals = await this.discoverFromHeuristicsConfig(normalizedCode);
      for (const portal of heuristicsPortals) {
        if (!portals.some(p => p.domain === portal.domain)) {
          portals.push(portal);
        }
      }
      if (heuristicsPortals.length > 0) {
        sourcesUsed.push('heuristics_config');
      }
    } catch (error) {
      errors.push(`Heuristics: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Strategy 4: DNS probing (if enabled)
    if (options.enableDnsProbing && countryInfo) {
      try {
        const dnsPortals = await this.discoverViaDnsProbing(normalizedCode, countryInfo);
        for (const portal of dnsPortals) {
          if (!portals.some(p => p.domain === portal.domain)) {
            portals.push(portal);
          }
        }
        if (dnsPortals.length > 0) {
          sourcesUsed.push('dns_probe');
        }
      } catch (error) {
        errors.push(`DNS probing: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Apply filters
    let filteredPortals = portals;

    if (options.minConfidence !== undefined) {
      filteredPortals = filteredPortals.filter(p => p.confidence >= options.minConfidence!);
    }

    if (!options.includeUnverified) {
      // Only include verified portals from known sources
      filteredPortals = filteredPortals.filter(
        p =>
          p.verified ||
          p.discoverySource === 'known_database' ||
          p.discoverySource === 'heuristics_config'
      );
    }

    if (options.categories && options.categories.length > 0) {
      filteredPortals = filteredPortals.filter(p =>
        p.categories.some(c => options.categories!.includes(c))
      );
    }

    // Group by category
    const byCategory = this.groupByCategory(filteredPortals);

    const result: PortalDiscoveryResult = {
      countryCode: normalizedCode,
      countryName: countryInfo?.name || normalizedCode,
      portals: filteredPortals,
      byCategory,
      discoveredAt: Date.now(),
      durationMs: Date.now() - startTime,
      fromCache: false,
      sourcesUsed,
      errors: errors.length > 0 ? errors : undefined,
    };

    // Cache result
    await this.cache.set(this.cacheSource, `portal:${normalizedCode}`, result, PORTAL_CACHE_TTL_MS);

    discoveryLogger.info('Portal discovery complete', {
      countryCode: normalizedCode,
      portalsFound: filteredPortals.length,
      sourcesUsed,
      durationMs: result.durationMs,
    });

    return result;
  }

  /**
   * Get supported country codes
   */
  getSupportedCountries(): Array<{ code: string; name: string }> {
    return Object.values(COUNTRY_DATABASE).map(c => ({
      code: c.code,
      name: c.name,
    }));
  }

  /**
   * Check if a country is supported
   */
  isCountrySupported(countryCode: string): boolean {
    return countryCode.toUpperCase() in COUNTRY_DATABASE;
  }

  /**
   * Get country info
   */
  getCountryInfo(countryCode: string): CountryInfo | undefined {
    return COUNTRY_DATABASE[countryCode.toUpperCase()];
  }

  /**
   * Clear discovery cache for a country
   */
  async clearCache(countryCode?: string): Promise<void> {
    if (countryCode) {
      await this.cache.delete(this.cacheSource, `portal:${countryCode.toUpperCase()}`);
    } else {
      await this.cache.clear(this.cacheSource);
    }
  }

  // ==========================================================================
  // PRIVATE DISCOVERY STRATEGIES
  // ==========================================================================

  private async discoverFromKnownDatabase(
    countryCode: string,
    countryInfo?: CountryInfo
  ): Promise<DiscoveredPortal[]> {
    const portals: DiscoveredPortal[] = [];

    // Add main portal if known
    if (countryInfo?.knownMainPortal) {
      try {
        const url = new URL(countryInfo.knownMainPortal);
        portals.push({
          domain: url.hostname,
          url: countryInfo.knownMainPortal,
          name: `${countryInfo.name} Government Portal`,
          description: 'Main government services portal',
          countryCode,
          languages: countryInfo.languages,
          categories: ['general'],
          confidence: 1.0,
          discoverySource: 'known_database',
          verified: true,
          verifiedAt: Date.now(),
        });
      } catch {
        // Invalid URL, skip
      }
    }

    // Add known portals from database
    const knownPortals = KNOWN_PORTALS_BY_COUNTRY[countryCode] || [];
    for (const portal of knownPortals) {
      portals.push({
        domain: portal.domain,
        url: portal.url,
        name: portal.name,
        description: portal.description,
        countryCode,
        languages: countryInfo?.languages || ['en'],
        categories: portal.categories,
        confidence: 0.95,
        discoverySource: 'known_database',
        verified: true,
        verifiedAt: Date.now(),
      });
    }

    return portals;
  }

  private async discoverFromSkillPack(countryCode: string): Promise<DiscoveredPortal[]> {
    const portals: DiscoveredPortal[] = [];
    const skills = getSkillsForCountry(countryCode);

    for (const skill of skills) {
      for (const domain of skill.targetDomains) {
        // Check if already in portals
        const existing = portals.find(p => p.domain === domain);
        if (existing) {
          // Merge category
          if (!existing.categories.includes(skill.category)) {
            existing.categories.push(skill.category);
          }
          continue;
        }

        portals.push({
          domain,
          url: `https://${domain}`,
          name: this.inferPortalName(domain, skill),
          description: skill.description,
          countryCode,
          languages: skill.languages,
          categories: [skill.category],
          confidence: 0.9,
          discoverySource: 'known_database',
          verified: true,
          verifiedAt: Date.now(),
        });
      }
    }

    return portals;
  }

  private async discoverFromHeuristicsConfig(countryCode: string): Promise<DiscoveredPortal[]> {
    const portals: DiscoveredPortal[] = [];
    const config = getConfig();

    // Find domain groups that match the country
    const countryGroupPatterns: Record<string, string[]> = {
      ES: ['spanish', 'spain', 'espana'],
      US: ['us_', 'american', 'usa'],
      GB: ['uk_', 'british'],
      DE: ['german', 'germany', 'deutsch'],
      FR: ['french', 'france'],
      PT: ['portugal', 'portuguese'],
    };

    const patterns = countryGroupPatterns[countryCode] || [countryCode.toLowerCase()];

    for (const group of config.domainGroups) {
      const groupNameLower = group.name.toLowerCase();
      if (patterns.some(p => groupNameLower.includes(p))) {
        for (const domain of group.domains) {
          if (!portals.some(p => p.domain === domain)) {
            const languages = this.getLanguagesFromSharedPatterns(group.sharedPatterns?.language);
            portals.push({
              domain,
              url: `https://${domain}`,
              name: this.inferPortalNameFromDomain(domain),
              description: `Part of ${group.name} domain group`,
              countryCode,
              languages,
              categories: this.inferCategoriesFromDomain(domain),
              confidence: 0.8,
              discoverySource: 'heuristics_config',
              verified: false,
            });
          }
        }
      }
    }

    return portals;
  }

  private async discoverViaDnsProbing(
    countryCode: string,
    countryInfo: CountryInfo
  ): Promise<DiscoveredPortal[]> {
    // Placeholder for DNS probing - would need actual HTTP requests
    // For now, generate candidate URLs based on patterns
    const portals: DiscoveredPortal[] = [];

    const commonPrefixes = ['www', 'portal', 'services', 'gov', 'government', 'admin', 'e-'];
    const commonPaths = ['', '/en', '/services', '/citizens'];

    for (const tld of countryInfo.govTlds) {
      for (const prefix of commonPrefixes) {
        const domain = prefix + tld;
        if (!portals.some(p => p.domain === domain)) {
          portals.push({
            domain,
            url: `https://${domain}`,
            name: this.inferPortalNameFromDomain(domain),
            description: 'Discovered via DNS pattern',
            countryCode,
            languages: countryInfo.languages,
            categories: ['general'],
            confidence: 0.5,
            discoverySource: 'dns_probe',
            verified: false,
          });
        }
      }
    }

    return portals;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private inferPortalName(domain: string, skill: GovernmentSkill): string {
    // Use skill name if it's specific to this domain
    if (skill.targetDomains.length === 1) {
      return skill.name;
    }

    // Extract meaningful part from domain
    return this.inferPortalNameFromDomain(domain);
  }

  private inferPortalNameFromDomain(domain: string): string {
    // Remove common TLDs and prefixes
    let name = domain
      .replace(/^www\./, '')
      .replace(/\.gov\.?\w*$/, '')
      .replace(/\.gob\.?\w*$/, '')
      .replace(/\.\w{2,3}$/, '');

    // Convert hyphens and dots to spaces
    name = name.replace(/[-_.]/g, ' ');

    // Title case
    name = name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return name || domain;
  }

  /**
   * Get languages array from shared patterns language setting
   */
  private getLanguagesFromSharedPatterns(language: string | undefined): string[] {
    switch (language) {
      case 'es':
        return ['es'];
      case 'de':
        return ['de'];
      case 'fr':
        return ['fr'];
      case 'pt':
        return ['pt'];
      default:
        return ['en'];
    }
  }

  private inferCategoriesFromDomain(domain: string): GovernmentServiceCategory[] {
    const domainLower = domain.toLowerCase();
    const categories: GovernmentServiceCategory[] = [];

    const categoryPatterns: [string[], GovernmentServiceCategory][] = [
      [['tax', 'impot', 'tributar', 'finanz', 'revenue', 'irs', 'hacienda'], 'tax_registration'],
      [['visa', 'immigration', 'extranjeria', 'bamf', 'uscis', 'aima', 'sef'], 'visa_residence'],
      [['social', 'seg-social', 'seguridad', 'sozial', 'ssa'], 'social_security'],
      [['health', 'nhs', 'ameli', 'salud', 'saude', 'gesundheit'], 'healthcare'],
      [['driver', 'vehicle', 'dgt', 'dmv', 'transport'], 'drivers_license'],
      [['business', 'empresa', 'company', 'registro'], 'business_registration'],
      [['property', 'catastro', 'registro', 'immobil'], 'property'],
    ];

    for (const [patterns, category] of categoryPatterns) {
      if (patterns.some(p => domainLower.includes(p))) {
        categories.push(category);
      }
    }

    // Default to general if no specific category found
    if (categories.length === 0) {
      categories.push('general');
    }

    return categories;
  }

  private groupByCategory(
    portals: DiscoveredPortal[]
  ): Record<GovernmentServiceCategory, DiscoveredPortal[]> {
    const grouped: Record<GovernmentServiceCategory, DiscoveredPortal[]> = {
      visa_residence: [],
      work_permit: [],
      tax_registration: [],
      social_security: [],
      healthcare: [],
      drivers_license: [],
      vehicle_registration: [],
      business_registration: [],
      property: [],
      education: [],
      family: [],
      citizenship: [],
      legal_documents: [],
      customs: [],
      general: [],
    };

    for (const portal of portals) {
      for (const category of portal.categories) {
        if (grouped[category]) {
          grouped[category].push(portal);
        }
      }
    }

    return grouped;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

/** Singleton instance */
let portalDiscoveryInstance: AutoPortalDiscovery | undefined;

/**
 * Get the portal discovery singleton
 */
export function getPortalDiscovery(): AutoPortalDiscovery {
  if (!portalDiscoveryInstance) {
    portalDiscoveryInstance = new AutoPortalDiscovery();
  }
  return portalDiscoveryInstance;
}

/**
 * Reset the portal discovery singleton (for testing)
 */
export function resetPortalDiscovery(): void {
  portalDiscoveryInstance = undefined;
}

/**
 * Discover portals for a country (convenience function)
 */
export async function discoverPortals(
  countryCode: string,
  options?: PortalDiscoveryOptions
): Promise<PortalDiscoveryResult> {
  return getPortalDiscovery().discoverPortals(countryCode, options);
}

/**
 * Get supported countries (convenience function)
 */
export function getSupportedCountries(): Array<{ code: string; name: string }> {
  return getPortalDiscovery().getSupportedCountries();
}
