/**
 * Domain Selector Presets - Pre-configured selectors for common government sites
 *
 * These presets help extract content more reliably from known government
 * websites by specifying the correct selectors for their structure.
 */

/**
 * Pagination configuration for domain presets
 */
export interface PaginationPresetConfig {
  /** Pagination type */
  type: 'query_param' | 'path_segment' | 'date_range' | 'reference_based';
  /** Parameter name for pagination (e.g., 'page', 'offset', 'cursor') */
  paramName?: string;
  /** Starting value for first page */
  startValue?: number | string;
  /** Increment for page/offset types */
  increment?: number;
  /** CSS selector for next button (for button-based pagination) */
  nextButtonSelector?: string;
  /** API endpoint for paginated results (if different from page URL) */
  apiEndpoint?: string;
  /** Path to data array in API response */
  responseDataPath?: string;
  /** Path to total count in API response */
  totalCountPath?: string;
  /** Path to has-more indicator in API response */
  hasMorePath?: string;
  /** Path to next cursor/token in API response */
  nextCursorPath?: string;
  /** Items per page (for calculating total pages) */
  itemsPerPage?: number;
  /** Date-based pagination config (for legal document registries) */
  dateConfig?: {
    /** Date parameter name */
    paramName: string;
    /** Date format (e.g., 'YYYY-MM-DD', 'YYYYMMDD') */
    format: string;
    /** Start from newest or oldest */
    direction: 'newest_first' | 'oldest_first';
  };
  /** Notes about pagination behavior */
  notes?: string;
}

export interface DomainPreset {
  domain: string;
  name: string;
  selectors: {
    content: string; // Main content area
    title?: string;
    navigation?: string; // To remove
    footer?: string; // To remove
    sidebar?: string; // To remove
    breadcrumb?: string;
    lastUpdated?: string;
    tables?: string; // Specific table selectors
  };
  waitStrategy?: 'load' | 'domcontentloaded' | 'networkidle';
  cookies?: { name: string; value: string; domain: string }[];
  /** Pagination configuration for multi-page content */
  pagination?: PaginationPresetConfig;
  notes?: string;
}

/**
 * Spanish government site presets
 */
export const SPAIN_PRESETS: DomainPreset[] = [
  {
    domain: 'boe.es',
    name: 'Boletin Oficial del Estado',
    selectors: {
      content: '#documento, .documento, article',
      title: 'h1, .titulo-documento',
      navigation: 'nav, #menu, .menu',
      footer: 'footer, #pie',
      lastUpdated: '.fecha-publicacion, .fechaPublicacion',
    },
    waitStrategy: 'networkidle',
    pagination: {
      type: 'query_param',
      paramName: 'p',
      startValue: 1,
      increment: 1,
      itemsPerPage: 10,
      nextButtonSelector: '.paginador a.siguiente, a[rel="next"]',
      dateConfig: {
        paramName: 'f',
        format: 'YYYYMMDD',
        direction: 'newest_first',
      },
      notes: 'BOE uses page-based pagination for search results. Date filter via f parameter (YYYYMMDD format). Document IDs follow BOE-A-YYYY-NNNNN format.',
    },
    notes: 'Official gazette - contains legal texts, laws, regulations',
  },
  {
    domain: 'extranjeria.inclusion.gob.es',
    name: 'Secretaria de Estado de Migraciones',
    selectors: {
      content: '.cuerpo_documento, .contenido_documento, main',
      title: 'h1.titulo',
      navigation: 'nav, #menu-lateral',
      footer: 'footer',
      breadcrumb: '.migaspan, .breadcrumb',
    },
    waitStrategy: 'networkidle',
    notes: 'Immigration office - visa requirements, procedures',
  },
  {
    domain: 'sede.administracionespublicas.gob.es',
    name: 'Sede Electronica PAE',
    selectors: {
      content: '#contenido, .contenido-principal',
      title: 'h1',
      navigation: '#menu, nav',
      footer: '#pie, footer',
    },
    waitStrategy: 'networkidle',
    notes: 'E-government portal',
  },
  {
    domain: 'agenciatributaria.es',
    name: 'Agencia Tributaria',
    selectors: {
      content: '#contenido, .contenido, main',
      title: 'h1',
      tables: 'table.tablaDatos, table.tabla',
      navigation: '#menu',
      footer: '#pie',
    },
    waitStrategy: 'networkidle',
    notes: 'Tax agency - tax forms, deadlines, rates',
  },
  {
    domain: 'seg-social.es',
    name: 'Seguridad Social',
    selectors: {
      content: '#contenido, .contenido-principal',
      title: 'h1',
      navigation: 'nav, #menuPrincipal',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    notes: 'Social security - healthcare, pensions',
  },
  {
    domain: 'mjusticia.gob.es',
    name: 'Ministerio de Justicia',
    selectors: {
      content: '#content, .content, main',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'load',
    notes: 'Justice ministry - criminal records, legalization',
  },
];

/**
 * US government site presets
 */
export const US_PRESETS: DomainPreset[] = [
  {
    domain: 'uscis.gov',
    name: 'US Citizenship and Immigration Services',
    selectors: {
      content: '.main-content, main, #main-content',
      title: 'h1',
      navigation: 'nav, .navigation',
      footer: 'footer',
      lastUpdated: '.last-updated, .modified-date',
    },
    waitStrategy: 'networkidle',
    notes: 'Immigration services - visa categories, forms, fees',
  },
  {
    domain: 'irs.gov',
    name: 'Internal Revenue Service',
    selectors: {
      content: '.field--body, main, #main',
      title: 'h1',
      tables: 'table',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'load',
    notes: 'Tax authority - forms, deadlines, FBAR requirements',
  },
  {
    domain: 'state.gov',
    name: 'US Department of State',
    selectors: {
      content: '.content-block, main, article',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    notes: 'Passport, embassy info, travel advisories',
  },
  {
    domain: 'ssa.gov',
    name: 'Social Security Administration',
    selectors: {
      content: '#content, main',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'load',
    notes: 'Social security benefits, international agreements',
  },
];

/**
 * EU and international presets
 */
export const EU_PRESETS: DomainPreset[] = [
  {
    domain: 'ec.europa.eu',
    name: 'European Commission',
    selectors: {
      content: '.ecl-container main, main, .content',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    notes: 'EU regulations, directives, policies',
  },
  {
    domain: 'europa.eu',
    name: 'Europa Portal',
    selectors: {
      content: 'main, .ecl-page-content',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    notes: 'General EU information',
  },
  {
    domain: 'eur-lex.europa.eu',
    name: 'EUR-Lex - EU Law Database',
    selectors: {
      content: '#document, .documentContent, .eli-main-title',
      title: 'h1, .title-document',
      navigation: '.navbar, nav',
      footer: 'footer',
      tables: 'table.eli-table, table',
      lastUpdated: '.eli-modified-date, .modification-date',
    },
    waitStrategy: 'networkidle',
    pagination: {
      type: 'query_param',
      paramName: 'page',
      startValue: 1,
      increment: 1,
      itemsPerPage: 10,
      nextButtonSelector: '.pagination-next a, a[rel="next"]',
      responseDataPath: 'results',
      totalCountPath: 'totalHits',
      hasMorePath: 'hasMore',
      dateConfig: {
        paramName: 'DD',
        format: 'YYYY-MM-DD',
        direction: 'newest_first',
      },
      notes: 'EUR-Lex uses page-based pagination. CELEX document identifiers. Date filter via DD parameter. Supports QDR (date range) and DTS (document type) filters.',
    },
    notes: 'EU legislation database - directives, regulations, case law, consolidated texts',
  },
];

/**
 * Legal document site presets with specialized pagination patterns
 */
export const LEGAL_PRESETS: DomainPreset[] = [
  {
    domain: 'legislation.gov.uk',
    name: 'UK Legislation',
    selectors: {
      content: '#content, .LegSnippet',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    pagination: {
      type: 'query_param',
      paramName: 'page',
      startValue: 1,
      increment: 1,
      itemsPerPage: 20,
      nextButtonSelector: '.pagination .next a',
      notes: 'UK legislation with chronological and subject-based browsing',
    },
    notes: 'Official UK legislation database - acts, statutory instruments, etc.',
  },
  {
    domain: 'gesetze-im-internet.de',
    name: 'Gesetze im Internet',
    selectors: {
      content: '#paddingLR12, .jnhtml',
      title: 'h1, .jninhalt h2',
      navigation: 'nav, #nav',
      footer: 'footer',
    },
    waitStrategy: 'load',
    pagination: {
      type: 'reference_based',
      nextButtonSelector: 'a.jnnav, a[title*="chst"]',
      notes: 'German federal laws - alphabetical and chronological navigation',
    },
    notes: 'German federal laws - BGB, StGB, GG, etc.',
  },
  {
    domain: 'legifrance.gouv.fr',
    name: 'Legifrance',
    selectors: {
      content: '.article-style, .main-content',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    pagination: {
      type: 'query_param',
      paramName: 'page',
      startValue: 1,
      increment: 1,
      itemsPerPage: 10,
      nextButtonSelector: '.pagination-next, a[rel="next"]',
      notes: 'French official legal texts database',
    },
    notes: 'French official legal texts - Code civil, Code penal, etc.',
  },
  {
    domain: 'normattiva.it',
    name: 'Normattiva',
    selectors: {
      content: '#dettaglio, .corpus',
      title: 'h1, .titolo-atto',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    pagination: {
      type: 'query_param',
      paramName: 'page',
      startValue: 1,
      increment: 1,
      itemsPerPage: 20,
      nextButtonSelector: '.paginazione a.successivo',
      notes: 'Italian official gazette - Gazzetta Ufficiale',
    },
    notes: 'Italian legislation database',
  },
  {
    domain: 'rechtspraak.nl',
    name: 'Rechtspraak.nl',
    selectors: {
      content: '.uitspraak-document, .content',
      title: 'h1',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    pagination: {
      type: 'query_param',
      paramName: 'pagina',
      startValue: 1,
      increment: 1,
      itemsPerPage: 10,
      nextButtonSelector: '.pagination .volgende a',
      notes: 'Dutch court decisions database',
    },
    notes: 'Dutch case law database',
  },
  {
    domain: 'curia.europa.eu',
    name: 'Court of Justice of the EU (CURIA)',
    selectors: {
      content: '.doc-content, .outputECLI, article',
      title: 'h1, .title-doc',
      navigation: 'nav',
      footer: 'footer',
    },
    waitStrategy: 'networkidle',
    pagination: {
      type: 'query_param',
      paramName: 'page',
      startValue: 1,
      increment: 1,
      itemsPerPage: 10,
      responseDataPath: 'results',
      nextButtonSelector: '.pagination-next',
      notes: 'EU court decisions - ECLI identifiers',
    },
    notes: 'EU Court of Justice case law',
  },
];

/**
 * All presets combined
 */
export const ALL_PRESETS: DomainPreset[] = [
  ...SPAIN_PRESETS,
  ...US_PRESETS,
  ...EU_PRESETS,
  ...LEGAL_PRESETS,
];

/**
 * Find the best preset for a URL
 */
export function findPreset(url: string): DomainPreset | undefined {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');

    // Exact match
    let preset = ALL_PRESETS.find((p) => p.domain === hostname);
    if (preset) return preset;

    // Subdomain match (e.g., sede.boe.es -> boe.es)
    preset = ALL_PRESETS.find((p) => hostname.endsWith(`.${p.domain}`));
    if (preset) return preset;

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get content selector for a URL (falls back to common selectors)
 */
export function getContentSelector(url: string): string {
  const preset = findPreset(url);
  if (preset) {
    return preset.selectors.content;
  }

  // Generic fallback
  return 'main, article, [role="main"], .content, #content, .main-content';
}

/**
 * Get wait strategy for a URL
 */
export function getWaitStrategy(url: string): 'load' | 'domcontentloaded' | 'networkidle' {
  const preset = findPreset(url);
  return preset?.waitStrategy || 'networkidle';
}

/**
 * Get pagination preset configuration for a URL
 */
export function getPaginationPreset(url: string): PaginationPresetConfig | undefined {
  const preset = findPreset(url);
  return preset?.pagination;
}

/**
 * Check if a domain has a pagination preset configured
 */
export function hasPaginationPreset(url: string): boolean {
  return getPaginationPreset(url) !== undefined;
}

/**
 * Get all domains that have pagination presets configured
 */
export function getDomainsWithPagination(): string[] {
  return ALL_PRESETS
    .filter((p) => p.pagination !== undefined)
    .map((p) => p.domain);
}

/**
 * Get elements to remove for cleaner extraction
 */
export function getRemovalSelectors(url: string): string[] {
  const preset = findPreset(url);
  const selectors: string[] = [];

  if (preset) {
    if (preset.selectors.navigation) selectors.push(preset.selectors.navigation);
    if (preset.selectors.footer) selectors.push(preset.selectors.footer);
    if (preset.selectors.sidebar) selectors.push(preset.selectors.sidebar);
  }

  // Always remove these
  selectors.push('script', 'style', 'noscript', 'iframe', '.cookie-banner', '#cookie-consent');

  return selectors;
}

/**
 * Registry for adding custom presets at runtime
 */
class PresetRegistry {
  private customPresets: DomainPreset[] = [];

  add(preset: DomainPreset): void {
    // Remove existing preset for same domain
    this.customPresets = this.customPresets.filter((p) => p.domain !== preset.domain);
    this.customPresets.push(preset);
  }

  remove(domain: string): boolean {
    const before = this.customPresets.length;
    this.customPresets = this.customPresets.filter((p) => p.domain !== domain);
    return this.customPresets.length < before;
  }

  find(url: string): DomainPreset | undefined {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');

      let preset = this.customPresets.find((p) => p.domain === hostname);
      if (preset) return preset;

      preset = this.customPresets.find((p) => hostname.endsWith(`.${p.domain}`));
      if (preset) return preset;

      return findPreset(url);
    } catch {
      return undefined;
    }
  }

  list(): DomainPreset[] {
    return [...this.customPresets, ...ALL_PRESETS];
  }
}

export const presetRegistry = new PresetRegistry();
