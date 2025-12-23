/**
 * Heuristics Configuration Module (CX-010)
 *
 * Provides config-driven heuristics for domain groups and tier rules.
 * This externalizes previously hardcoded constants from learning-engine.ts
 * and tiered-fetcher.ts to enable easier customization and updates.
 */

import { logger } from './logger.js';
import type { DomainGroup } from '../types/index.js';

const log = logger.create('HeuristicsConfig');

/**
 * Pattern rule for domain classification
 * Can be a string (converted to RegExp) or RegExp pattern
 */
export interface DomainPattern {
  /** Pattern string (will be converted to RegExp) */
  pattern: string;
  /** Optional flags for RegExp (default: 'i' for case-insensitive) */
  flags?: string;
  /** Description of what this pattern matches */
  description?: string;
}

/**
 * Tier routing rules configuration
 */
export interface TierRulesConfig {
  /** Domains known to be static (prefer ContentIntelligence tier) */
  staticDomains: DomainPattern[];
  /** Domains requiring full browser rendering */
  browserRequired: DomainPattern[];
  /** HTML markers indicating content rendered properly */
  contentMarkers: DomainPattern[];
  /** HTML markers indicating incomplete JS rendering */
  incompleteMarkers: DomainPattern[];
}

/**
 * Complete heuristics configuration
 */
export interface HeuristicsConfig {
  /** Version of the config schema */
  version: string;
  /** Pre-configured domain groups for cross-domain pattern sharing */
  domainGroups: DomainGroup[];
  /** Tier routing rules */
  tierRules: TierRulesConfig;
}

/**
 * Default static domain patterns
 */
const DEFAULT_STATIC_DOMAINS: DomainPattern[] = [
  { pattern: '\\.gov$', description: 'Government sites' },
  { pattern: '\\.gov\\.\\w{2}$', description: 'International gov sites' },
  { pattern: '\\.edu$', description: 'Educational sites' },
  { pattern: 'docs\\.', description: 'Documentation sites' },
  { pattern: 'wiki', description: 'Wiki sites' },
  { pattern: 'github\\.io$', description: 'GitHub pages' },
  { pattern: 'readthedocs', description: 'ReadTheDocs' },
  { pattern: '\\.org$', description: 'Many org sites' },
  { pattern: 'blog\\.', description: 'Blog subdomains' },
];

/**
 * Default browser-required domain patterns
 */
const DEFAULT_BROWSER_REQUIRED: DomainPattern[] = [
  { pattern: 'twitter\\.com', description: 'Twitter/X' },
  { pattern: 'x\\.com', description: 'X (Twitter)' },
  { pattern: 'instagram\\.com', description: 'Instagram' },
  { pattern: 'facebook\\.com', description: 'Facebook' },
  { pattern: 'linkedin\\.com', description: 'LinkedIn' },
  { pattern: 'tiktok\\.com', description: 'TikTok' },
  { pattern: 'youtube\\.com', description: 'YouTube' },
  { pattern: 'reddit\\.com', description: 'Reddit' },
  { pattern: 'discord\\.com', description: 'Discord' },
];

/**
 * Default content markers (indicate page rendered properly)
 */
const DEFAULT_CONTENT_MARKERS: DomainPattern[] = [
  { pattern: '<article', flags: 'i', description: 'Article element' },
  { pattern: '<main', flags: 'i', description: 'Main element' },
  { pattern: 'class="content', flags: 'i', description: 'Content class' },
  { pattern: 'id="content', flags: 'i', description: 'Content ID' },
  { pattern: '<h1', flags: 'i', description: 'H1 heading' },
  { pattern: '<p[>\\s]', flags: 'i', description: 'Paragraph element' },
];

/**
 * Default incomplete markers (indicate JS hasn't finished)
 */
const DEFAULT_INCOMPLETE_MARKERS: DomainPattern[] = [
  { pattern: 'loading\\.\\.\\.', flags: 'i', description: 'Loading text' },
  { pattern: 'please wait', flags: 'i', description: 'Please wait text' },
  {
    pattern: '<div id="(root|app|__next)">\\s*</div>',
    flags: 'i',
    description: 'Empty SPA container',
  },
  { pattern: 'class="skeleton', flags: 'i', description: 'Skeleton loader' },
  { pattern: 'class="loading', flags: 'i', description: 'Loading class' },
];

/**
 * Default domain groups for cross-domain pattern sharing
 */
const DEFAULT_DOMAIN_GROUPS: DomainGroup[] = [
  {
    name: 'spanish_gov',
    domains: [
      'boe.es',
      'extranjeria.inclusion.gob.es',
      'agenciatributaria.es',
      'seg-social.es',
      'mites.gob.es',
      'inclusion.gob.es',
      'exteriores.gob.es',
      'policia.es',
    ],
    sharedPatterns: {
      cookieBannerSelectors: [
        '.aceptar-cookies',
        '#aceptarCookies',
        '.acepto-cookies',
        '[data-cookies-accept]',
        '.cookie-accept-btn',
      ],
      contentSelectors: [
        '#contenido',
        '.contenido-principal',
        '#main-content',
        'article.content',
        '.documento-contenido',
      ],
      navigationSelectors: [
        '.navegacion-principal',
        '#menu-principal',
        'nav.main-nav',
      ],
      commonAuthType: 'none',
      language: 'es',
    },
    lastUpdated: Date.now(),
  },
  {
    name: 'us_gov',
    domains: [
      'uscis.gov',
      'irs.gov',
      'state.gov',
      'ssa.gov',
      'dhs.gov',
      'travel.state.gov',
      'cbp.gov',
    ],
    sharedPatterns: {
      cookieBannerSelectors: [
        '#cookie-consent-accept',
        '.usa-banner__button',
        '[data-analytics="cookie-accept"]',
      ],
      contentSelectors: [
        'main#main-content',
        '.usa-layout-docs__main',
        'article.content',
        '#content',
      ],
      navigationSelectors: [
        '.usa-nav',
        '#nav-primary',
        'nav[aria-label="Primary navigation"]',
      ],
      commonAuthType: 'none',
      language: 'en',
    },
    lastUpdated: Date.now(),
  },
  {
    name: 'eu_gov',
    domains: ['ec.europa.eu', 'europa.eu', 'europarl.europa.eu'],
    sharedPatterns: {
      cookieBannerSelectors: [
        '#cookie-consent-banner .accept',
        '.cck-actions-accept',
        '[data-ecl-cookie-consent-accept]',
      ],
      contentSelectors: [
        '.ecl-page-body',
        'main.ecl-container',
        '#main-content',
        'article.ecl-article',
      ],
      navigationSelectors: ['.ecl-menu', '.ecl-navigation-menu'],
      commonAuthType: 'none',
      language: 'en',
    },
    lastUpdated: Date.now(),
  },
];

/**
 * Default heuristics configuration
 */
const DEFAULT_CONFIG: HeuristicsConfig = {
  version: '1.0.0',
  domainGroups: DEFAULT_DOMAIN_GROUPS,
  tierRules: {
    staticDomains: DEFAULT_STATIC_DOMAINS,
    browserRequired: DEFAULT_BROWSER_REQUIRED,
    contentMarkers: DEFAULT_CONTENT_MARKERS,
    incompleteMarkers: DEFAULT_INCOMPLETE_MARKERS,
  },
};

// Cached compiled RegExp patterns
let compiledStaticDomains: RegExp[] | null = null;
let compiledBrowserRequired: RegExp[] | null = null;
let compiledContentMarkers: RegExp[] | null = null;
let compiledIncompleteMarkers: RegExp[] | null = null;

// Current active configuration
let activeConfig: HeuristicsConfig = DEFAULT_CONFIG;

/**
 * Compile a DomainPattern to RegExp
 */
function compilePattern(pattern: DomainPattern): RegExp {
  try {
    return new RegExp(pattern.pattern, pattern.flags ?? 'i');
  } catch (error) {
    log.warn('Invalid pattern, using literal match', {
      pattern: pattern.pattern,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fall back to escaped literal match
    const escaped = pattern.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, pattern.flags ?? 'i');
  }
}

/**
 * Compile all patterns and cache them
 */
function compilePatterns(): void {
  const rules = activeConfig.tierRules;

  compiledStaticDomains = rules.staticDomains.map(compilePattern);
  compiledBrowserRequired = rules.browserRequired.map(compilePattern);
  compiledContentMarkers = rules.contentMarkers.map(compilePattern);
  compiledIncompleteMarkers = rules.incompleteMarkers.map(compilePattern);

  log.debug('Compiled heuristics patterns', {
    staticDomains: compiledStaticDomains.length,
    browserRequired: compiledBrowserRequired.length,
    contentMarkers: compiledContentMarkers.length,
    incompleteMarkers: compiledIncompleteMarkers.length,
  });
}

/**
 * Get the current heuristics configuration
 */
export function getConfig(): HeuristicsConfig {
  return activeConfig;
}

/**
 * Get compiled static domain patterns
 */
export function getStaticDomainPatterns(): RegExp[] {
  if (!compiledStaticDomains) {
    compilePatterns();
  }
  return compiledStaticDomains!;
}

/**
 * Get compiled browser-required domain patterns
 */
export function getBrowserRequiredPatterns(): RegExp[] {
  if (!compiledBrowserRequired) {
    compilePatterns();
  }
  return compiledBrowserRequired!;
}

/**
 * Get compiled content marker patterns
 */
export function getContentMarkerPatterns(): RegExp[] {
  if (!compiledContentMarkers) {
    compilePatterns();
  }
  return compiledContentMarkers!;
}

/**
 * Get compiled incomplete marker patterns
 */
export function getIncompleteMarkerPatterns(): RegExp[] {
  if (!compiledIncompleteMarkers) {
    compilePatterns();
  }
  return compiledIncompleteMarkers!;
}

/**
 * Get domain groups configuration
 */
export function getDomainGroups(): DomainGroup[] {
  return activeConfig.domainGroups;
}

/**
 * Find domain group by domain name
 */
export function findDomainGroup(domain: string): DomainGroup | undefined {
  const normalizedDomain = domain.toLowerCase();
  return activeConfig.domainGroups.find((group) =>
    group.domains.some(
      (d) =>
        normalizedDomain === d.toLowerCase() ||
        normalizedDomain.endsWith('.' + d.toLowerCase())
    )
  );
}

/**
 * Check if a domain matches static domain patterns
 */
export function isStaticDomain(domain: string): boolean {
  const patterns = getStaticDomainPatterns();
  return patterns.some((pattern) => pattern.test(domain));
}

/**
 * Check if a domain requires full browser rendering
 */
export function isBrowserRequired(domain: string): boolean {
  const patterns = getBrowserRequiredPatterns();
  return patterns.some((pattern) => pattern.test(domain));
}

/**
 * Check if HTML content has content markers
 */
export function hasContentMarkers(html: string): boolean {
  const patterns = getContentMarkerPatterns();
  return patterns.some((pattern) => pattern.test(html));
}

/**
 * Check if HTML content has incomplete markers
 */
export function hasIncompleteMarkers(html: string): boolean {
  const patterns = getIncompleteMarkerPatterns();
  return patterns.some((pattern) => pattern.test(html));
}

/**
 * Update the active configuration
 * Clears cached compiled patterns
 */
export function setConfig(config: HeuristicsConfig): void {
  activeConfig = config;
  // Clear cached patterns to force recompilation
  compiledStaticDomains = null;
  compiledBrowserRequired = null;
  compiledContentMarkers = null;
  compiledIncompleteMarkers = null;

  log.info('Heuristics configuration updated', {
    version: config.version,
    domainGroups: config.domainGroups.length,
    tierRules: {
      staticDomains: config.tierRules.staticDomains.length,
      browserRequired: config.tierRules.browserRequired.length,
    },
  });
}

/**
 * Merge additional configuration into the active config
 * Useful for adding custom domain groups or patterns
 */
export function mergeConfig(partial: Partial<HeuristicsConfig>): void {
  const merged: HeuristicsConfig = {
    ...activeConfig,
    ...partial,
    tierRules: {
      ...activeConfig.tierRules,
      ...partial.tierRules,
    },
  };

  // Merge domain groups (append, don't replace)
  if (partial.domainGroups) {
    const existingNames = new Set(activeConfig.domainGroups.map((g) => g.name));
    const newGroups = partial.domainGroups.filter(
      (g) => !existingNames.has(g.name)
    );
    merged.domainGroups = [...activeConfig.domainGroups, ...newGroups];
  }

  setConfig(merged);
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  setConfig(DEFAULT_CONFIG);
  log.info('Heuristics configuration reset to defaults');
}

/**
 * Add a new domain group
 */
export function addDomainGroup(group: DomainGroup): void {
  const existing = activeConfig.domainGroups.find((g) => g.name === group.name);
  if (existing) {
    log.warn('Domain group already exists, updating', { name: group.name });
    activeConfig.domainGroups = activeConfig.domainGroups.map((g) =>
      g.name === group.name ? group : g
    );
  } else {
    activeConfig.domainGroups.push(group);
  }
  log.debug('Domain group added', {
    name: group.name,
    domains: group.domains.length,
  });
}

/**
 * Add a static domain pattern
 */
export function addStaticDomainPattern(pattern: DomainPattern): void {
  activeConfig.tierRules.staticDomains.push(pattern);
  compiledStaticDomains = null; // Clear cache
  log.debug('Static domain pattern added', { pattern: pattern.pattern });
}

/**
 * Add a browser-required domain pattern
 */
export function addBrowserRequiredPattern(pattern: DomainPattern): void {
  activeConfig.tierRules.browserRequired.push(pattern);
  compiledBrowserRequired = null; // Clear cache
  log.debug('Browser-required pattern added', { pattern: pattern.pattern });
}

/**
 * Export configuration for serialization
 */
export function exportConfig(): HeuristicsConfig {
  return JSON.parse(JSON.stringify(activeConfig));
}

/**
 * Import configuration from serialized format
 */
export function importConfig(configJson: string): void {
  try {
    const config = JSON.parse(configJson) as HeuristicsConfig;
    if (!config.version || !config.tierRules || !config.domainGroups) {
      throw new Error('Invalid configuration format');
    }
    setConfig(config);
  } catch (error) {
    log.error('Failed to import configuration', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Initialize patterns on module load
compilePatterns();
