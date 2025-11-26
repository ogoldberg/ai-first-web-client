/**
 * Domain Selector Presets - Pre-configured selectors for common government sites
 *
 * These presets help extract content more reliably from known government
 * websites by specifying the correct selectors for their structure.
 */

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
];

/**
 * All presets combined
 */
export const ALL_PRESETS: DomainPreset[] = [...SPAIN_PRESETS, ...US_PRESETS, ...EU_PRESETS];

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
