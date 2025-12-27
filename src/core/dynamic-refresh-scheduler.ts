/**
 * Dynamic Refresh Scheduler (INT-008)
 *
 * Provides intelligent refresh scheduling for government content based on observed
 * update patterns. Replaces fixed staleness thresholds (e.g., 90 days) with dynamic
 * schedules learned from actual content changes.
 *
 * Features:
 * - Content type presets (regulations, fees, forms, etc.)
 * - Domain-specific pattern learning
 * - Optimal refresh interval recommendations
 * - Government-specific update patterns (fiscal years, legislative sessions)
 *
 * @example
 * ```typescript
 * const scheduler = new DynamicRefreshScheduler();
 *
 * // Record content observation
 * scheduler.recordContentCheck(
 *   'https://exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/NIE.aspx',
 *   'abc123hash',
 *   true, // content changed
 *   'government_forms'
 * );
 *
 * // Get refresh recommendation
 * const schedule = scheduler.getRefreshSchedule(
 *   'https://exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/NIE.aspx'
 * );
 * console.log(schedule.recommendedRefreshHours); // e.g., 168 (weekly)
 * console.log(schedule.nextCheckAt); // timestamp
 * ```
 */

import { ContentChangePredictor } from './content-change-predictor.js';
import type {
  ContentChangePattern,
  ContentChangeAnalysis,
  PollRecommendation,
  ContentChangePredictionConfig,
} from '../types/content-change.js';

/**
 * Content type presets for government content
 */
export type GovernmentContentType =
  | 'regulations'        // Laws, regulations - change rarely (legislative cycles)
  | 'fees'               // Fee schedules - typically annual updates
  | 'forms'              // Application forms - quarterly/monthly updates
  | 'requirements'       // Eligibility requirements - change with policy
  | 'procedures'         // Step-by-step procedures - moderate frequency
  | 'contact_info'       // Contact details, office hours - infrequent
  | 'news'               // News, announcements - frequent updates
  | 'deadlines'          // Deadlines, important dates - calendar-based
  | 'portal_status';     // Service availability - real-time/hourly

/**
 * Preset configuration for a content type
 */
export interface ContentTypePreset {
  /** Content type identifier */
  type: GovernmentContentType;
  /** Default refresh interval in hours if no pattern detected */
  defaultRefreshHours: number;
  /** Minimum refresh interval in hours */
  minRefreshHours: number;
  /** Maximum refresh interval in hours */
  maxRefreshHours: number;
  /** Expected update pattern description */
  expectedPattern: string;
  /** Typical update triggers */
  updateTriggers: string[];
}

/**
 * Presets for different government content types
 */
export const CONTENT_TYPE_PRESETS: Record<GovernmentContentType, ContentTypePreset> = {
  regulations: {
    type: 'regulations',
    defaultRefreshHours: 720, // 30 days
    minRefreshHours: 168,     // 1 week
    maxRefreshHours: 2160,    // 90 days
    expectedPattern: 'Changes with legislative sessions, major policy updates',
    updateTriggers: ['new_legislation', 'policy_reform', 'annual_review'],
  },
  fees: {
    type: 'fees',
    defaultRefreshHours: 168, // 1 week
    minRefreshHours: 24,      // 1 day
    maxRefreshHours: 720,     // 30 days
    expectedPattern: 'Typically annual updates, sometimes fiscal year aligned',
    updateTriggers: ['fiscal_year_start', 'budget_approval', 'inflation_adjustment'],
  },
  forms: {
    type: 'forms',
    defaultRefreshHours: 336, // 2 weeks
    minRefreshHours: 24,      // 1 day
    maxRefreshHours: 720,     // 30 days
    expectedPattern: 'Quarterly or monthly form revisions',
    updateTriggers: ['version_update', 'regulation_change', 'format_revision'],
  },
  requirements: {
    type: 'requirements',
    defaultRefreshHours: 168, // 1 week
    minRefreshHours: 24,      // 1 day
    maxRefreshHours: 720,     // 30 days
    expectedPattern: 'Changes with policy updates, typically quarterly',
    updateTriggers: ['policy_change', 'new_requirements', 'eligibility_update'],
  },
  procedures: {
    type: 'procedures',
    defaultRefreshHours: 336, // 2 weeks
    minRefreshHours: 48,      // 2 days
    maxRefreshHours: 720,     // 30 days
    expectedPattern: 'Updates when processes change, moderate frequency',
    updateTriggers: ['process_optimization', 'system_update', 'new_service_channel'],
  },
  contact_info: {
    type: 'contact_info',
    defaultRefreshHours: 720, // 30 days
    minRefreshHours: 168,     // 1 week
    maxRefreshHours: 2160,    // 90 days
    expectedPattern: 'Rarely changes except for office moves/reorganization',
    updateTriggers: ['office_relocation', 'staff_change', 'hours_update'],
  },
  news: {
    type: 'news',
    defaultRefreshHours: 24,  // 1 day
    minRefreshHours: 1,       // 1 hour
    maxRefreshHours: 168,     // 1 week
    expectedPattern: 'Frequent updates, often daily for active portals',
    updateTriggers: ['new_announcement', 'press_release', 'event_notification'],
  },
  deadlines: {
    type: 'deadlines',
    defaultRefreshHours: 24,  // 1 day
    minRefreshHours: 1,       // 1 hour
    maxRefreshHours: 168,     // 1 week
    expectedPattern: 'Calendar-driven, critical near deadline dates',
    updateTriggers: ['deadline_approaching', 'deadline_extension', 'new_deadline'],
  },
  portal_status: {
    type: 'portal_status',
    defaultRefreshHours: 1,   // 1 hour
    minRefreshHours: 0.25,    // 15 minutes
    maxRefreshHours: 24,      // 1 day
    expectedPattern: 'Real-time or near-real-time for service availability',
    updateTriggers: ['maintenance_window', 'outage', 'service_restored'],
  },
};

/**
 * Domain-specific update patterns for known government portals
 */
export interface DomainPattern {
  /** Domain name pattern (regex) */
  domainPattern: string;
  /** Country code */
  country: string;
  /** Default content type for this domain */
  defaultContentType: GovernmentContentType;
  /** Known update schedule */
  knownSchedule?: string;
  /** Fiscal year start month (1-12) */
  fiscalYearStartMonth?: number;
}

/**
 * Known domain patterns for government portals
 */
export const KNOWN_DOMAIN_PATTERNS: DomainPattern[] = [
  // Spain
  {
    domainPattern: 'exteriores\\.gob\\.es',
    country: 'ES',
    defaultContentType: 'requirements',
    knownSchedule: 'Updates with visa policy changes',
  },
  {
    domainPattern: 'agenciatributaria\\.gob\\.es',
    country: 'ES',
    defaultContentType: 'fees',
    fiscalYearStartMonth: 1, // Calendar year
    knownSchedule: 'Tax forms update annually in January',
  },
  {
    domainPattern: 'seg-social\\.es',
    country: 'ES',
    defaultContentType: 'requirements',
    knownSchedule: 'Social security rates update annually',
  },
  {
    domainPattern: 'boe\\.es',
    country: 'ES',
    defaultContentType: 'regulations',
    knownSchedule: 'Daily publication of official gazette',
  },
  // Portugal
  {
    domainPattern: 'sef\\.pt|aima\\.gov\\.pt',
    country: 'PT',
    defaultContentType: 'requirements',
    knownSchedule: 'Updates with immigration policy changes',
  },
  {
    domainPattern: 'portaldasfinancas\\.gov\\.pt',
    country: 'PT',
    defaultContentType: 'fees',
    fiscalYearStartMonth: 1,
    knownSchedule: 'Tax updates in January/February',
  },
  // Germany
  {
    domainPattern: 'auswaertiges-amt\\.de',
    country: 'DE',
    defaultContentType: 'requirements',
    knownSchedule: 'Updates with visa/entry policy changes',
  },
  {
    domainPattern: 'make-it-in-germany\\.com',
    country: 'DE',
    defaultContentType: 'procedures',
    knownSchedule: 'Updated regularly for immigration guidance',
  },
  // UK
  {
    domainPattern: 'gov\\.uk',
    country: 'UK',
    defaultContentType: 'procedures',
    fiscalYearStartMonth: 4, // UK fiscal year starts April
    knownSchedule: 'Continuous updates with editorial calendar',
  },
  // USA
  {
    domainPattern: 'uscis\\.gov',
    country: 'US',
    defaultContentType: 'requirements',
    fiscalYearStartMonth: 10, // US federal fiscal year starts October
    knownSchedule: 'Updates with immigration policy changes',
  },
];

/**
 * Refresh schedule result
 */
export interface RefreshSchedule {
  /** URL being scheduled */
  url: string;
  /** Domain extracted from URL */
  domain: string;
  /** Detected or inferred content type */
  contentType: GovernmentContentType;
  /** Recommended refresh interval in hours */
  recommendedRefreshHours: number;
  /** Recommended refresh interval in milliseconds */
  recommendedRefreshMs: number;
  /** Next recommended check timestamp */
  nextCheckAt: number;
  /** Confidence in the schedule (0-1) */
  confidence: number;
  /** Whether this is based on learned patterns */
  isLearned: boolean;
  /** Reason for this schedule */
  reason: string;
  /** Underlying pattern analysis (if available) */
  pattern?: ContentChangePattern;
  /** Preset used (if applicable) */
  preset?: ContentTypePreset;
  /** Domain pattern match (if applicable) */
  domainMatch?: DomainPattern;
}

/**
 * Configuration for DynamicRefreshScheduler
 */
export interface DynamicRefreshSchedulerConfig {
  /** ContentChangePredictor configuration */
  predictorConfig?: Partial<ContentChangePredictionConfig>;
  /** Whether to use domain pattern hints */
  useDomainPatterns: boolean;
  /** Whether to apply content type presets */
  useContentTypePresets: boolean;
  /** Default content type if not detected */
  defaultContentType: GovernmentContentType;
}

const DEFAULT_SCHEDULER_CONFIG: DynamicRefreshSchedulerConfig = {
  useDomainPatterns: true,
  useContentTypePresets: true,
  defaultContentType: 'requirements',
};

/**
 * URL content tracking entry
 */
interface UrlTracking {
  url: string;
  domain: string;
  urlPattern: string;
  contentType: GovernmentContentType;
  lastContentHash?: string;
  lastCheckAt: number;
  checkCount: number;
  changeCount: number;
}

/**
 * Dynamic Refresh Scheduler
 *
 * Provides intelligent refresh scheduling for government content.
 */
export class DynamicRefreshScheduler {
  private predictor: ContentChangePredictor;
  private config: DynamicRefreshSchedulerConfig;
  private urlTracking: Map<string, UrlTracking> = new Map();

  constructor(config: Partial<DynamicRefreshSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.predictor = new ContentChangePredictor(this.config.predictorConfig);
  }

  /**
   * Record a content check observation
   */
  recordContentCheck(
    url: string,
    contentHash: string,
    changed: boolean,
    contentType?: GovernmentContentType
  ): RefreshSchedule {
    const { domain, urlPattern } = this.parseUrl(url);
    const detectedType = contentType || this.detectContentType(url, domain);

    // Update URL tracking
    let tracking = this.urlTracking.get(url);
    if (!tracking) {
      tracking = {
        url,
        domain,
        urlPattern,
        contentType: detectedType,
        lastCheckAt: Date.now(),
        checkCount: 0,
        changeCount: 0,
      };
      this.urlTracking.set(url, tracking);
    }

    tracking.lastCheckAt = Date.now();
    tracking.checkCount++;
    tracking.contentType = detectedType;

    if (changed) {
      tracking.changeCount++;
    }
    tracking.lastContentHash = contentHash;

    // Record with predictor
    this.predictor.recordObservation(domain, urlPattern, contentHash, changed);

    // Return updated schedule
    return this.getRefreshSchedule(url, detectedType);
  }

  /**
   * Get refresh schedule for a URL
   */
  getRefreshSchedule(url: string, contentType?: GovernmentContentType): RefreshSchedule {
    const { domain, urlPattern } = this.parseUrl(url);
    const detectedType = contentType || this.detectContentType(url, domain);
    const preset = this.config.useContentTypePresets ? CONTENT_TYPE_PRESETS[detectedType] : undefined;
    const domainMatch = this.config.useDomainPatterns ? this.matchDomain(domain) : undefined;

    // Try to get learned pattern
    const analysis = this.predictor.analyzePattern(domain, urlPattern);
    const pattern = analysis.pattern;
    const hasLearnedPattern = analysis.hasEnoughData && pattern.patternConfidence > 0.3;

    // Get poll recommendation
    const pollRecommendation = this.predictor.shouldCheckNow(domain, urlPattern);

    let recommendedRefreshHours: number;
    let confidence: number;
    let reason: string;
    let isLearned: boolean;

    if (hasLearnedPattern) {
      // Use learned pattern
      recommendedRefreshHours = pattern.recommendedPollIntervalMs / (1000 * 60 * 60);
      confidence = pattern.patternConfidence;
      reason = analysis.summary;
      isLearned = true;

      // Clamp to preset bounds if available
      if (preset) {
        recommendedRefreshHours = Math.max(
          preset.minRefreshHours,
          Math.min(preset.maxRefreshHours, recommendedRefreshHours)
        );
      }
    } else if (preset) {
      // Use content type preset
      recommendedRefreshHours = preset.defaultRefreshHours;
      confidence = 0.5; // Medium confidence for presets
      reason = `Default for ${detectedType}: ${preset.expectedPattern}`;
      isLearned = false;
    } else {
      // Fallback to generic default
      recommendedRefreshHours = 168; // 1 week
      confidence = 0.3;
      reason = 'Default refresh interval (no pattern detected)';
      isLearned = false;
    }

    const recommendedRefreshMs = recommendedRefreshHours * 60 * 60 * 1000;
    const tracking = this.urlTracking.get(url);
    const lastCheck = tracking?.lastCheckAt || Date.now();
    const nextCheckAt = pollRecommendation.shouldPoll
      ? Date.now()
      : Math.max(pollRecommendation.nextCheckAt, lastCheck + recommendedRefreshMs);

    return {
      url,
      domain,
      contentType: detectedType,
      recommendedRefreshHours,
      recommendedRefreshMs,
      nextCheckAt,
      confidence,
      isLearned,
      reason,
      pattern: hasLearnedPattern ? pattern : undefined,
      preset,
      domainMatch,
    };
  }

  /**
   * Check if a URL should be refreshed now
   */
  shouldRefreshNow(url: string, contentType?: GovernmentContentType): PollRecommendation {
    const { domain, urlPattern } = this.parseUrl(url);
    return this.predictor.shouldCheckNow(domain, urlPattern);
  }

  /**
   * Get all tracked URLs with their schedules
   */
  getAllSchedules(): RefreshSchedule[] {
    return Array.from(this.urlTracking.keys()).map(url =>
      this.getRefreshSchedule(url)
    );
  }

  /**
   * Get URLs that need refresh now
   */
  getUrlsNeedingRefresh(): Array<{ url: string; schedule: RefreshSchedule; recommendation: PollRecommendation }> {
    const results: Array<{ url: string; schedule: RefreshSchedule; recommendation: PollRecommendation }> = [];

    for (const url of this.urlTracking.keys()) {
      const schedule = this.getRefreshSchedule(url);
      const { domain, urlPattern } = this.parseUrl(url);
      const recommendation = this.predictor.shouldCheckNow(domain, urlPattern);

      if (recommendation.shouldPoll) {
        results.push({ url, schedule, recommendation });
      }
    }

    // Sort by confidence (higher priority first)
    return results.sort((a, b) => b.recommendation.confidence - a.recommendation.confidence);
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns(): {
    patterns: Record<string, ContentChangePattern>;
    tracking: Array<UrlTracking>;
  } {
    return {
      patterns: this.predictor.exportPatterns(),
      tracking: Array.from(this.urlTracking.values()),
    };
  }

  /**
   * Import patterns from persistence
   */
  importPatterns(data: {
    patterns: Record<string, ContentChangePattern>;
    tracking?: Array<UrlTracking>;
  }): void {
    this.predictor.importPatterns(data.patterns);

    if (data.tracking) {
      this.urlTracking.clear();
      for (const track of data.tracking) {
        this.urlTracking.set(track.url, track);
      }
    }
  }

  /**
   * Get content type preset
   */
  getPreset(contentType: GovernmentContentType): ContentTypePreset {
    return CONTENT_TYPE_PRESETS[contentType];
  }

  /**
   * Get all presets
   */
  getAllPresets(): ContentTypePreset[] {
    return Object.values(CONTENT_TYPE_PRESETS);
  }

  /**
   * Get pattern analysis for a URL
   */
  analyzeUrl(url: string): ContentChangeAnalysis {
    const { domain, urlPattern } = this.parseUrl(url);
    return this.predictor.analyzePattern(domain, urlPattern);
  }

  /**
   * Parse URL into domain and pattern
   */
  private parseUrl(url: string): { domain: string; urlPattern: string } {
    try {
      const parsed = new URL(url);
      return {
        domain: parsed.hostname,
        urlPattern: parsed.pathname + parsed.search,
      };
    } catch {
      return {
        domain: 'unknown',
        urlPattern: url,
      };
    }
  }

  /**
   * Detect content type from URL and domain
   */
  private detectContentType(url: string, domain: string): GovernmentContentType {
    const urlLower = url.toLowerCase();
    const pathLower = urlLower.split('?')[0];

    // Check for known domain patterns first
    const domainMatch = this.matchDomain(domain);
    if (domainMatch) {
      // Override based on URL path hints
      if (this.matchesNewsPattern(pathLower)) return 'news';
      if (this.matchesFeePattern(pathLower)) return 'fees';
      if (this.matchesFormPattern(pathLower)) return 'forms';
      if (this.matchesDeadlinePattern(pathLower)) return 'deadlines';

      return domainMatch.defaultContentType;
    }

    // Infer from URL path patterns
    if (this.matchesNewsPattern(pathLower)) return 'news';
    if (this.matchesFeePattern(pathLower)) return 'fees';
    if (this.matchesFormPattern(pathLower)) return 'forms';
    if (this.matchesRegulationPattern(pathLower)) return 'regulations';
    if (this.matchesProcedurePattern(pathLower)) return 'procedures';
    if (this.matchesContactPattern(pathLower)) return 'contact_info';
    if (this.matchesDeadlinePattern(pathLower)) return 'deadlines';
    if (this.matchesStatusPattern(pathLower)) return 'portal_status';

    return this.config.defaultContentType;
  }

  /**
   * Match domain against known patterns
   */
  private matchDomain(domain: string): DomainPattern | undefined {
    for (const pattern of KNOWN_DOMAIN_PATTERNS) {
      const regex = new RegExp(pattern.domainPattern, 'i');
      if (regex.test(domain)) {
        return pattern;
      }
    }
    return undefined;
  }

  // URL pattern matchers
  private matchesNewsPattern(path: string): boolean {
    return /\/(news|noticias|actualidad|novedades|comunicados|press)\//.test(path) ||
           /\/(blog|announcements|updates)\//.test(path);
  }

  private matchesFeePattern(path: string): boolean {
    return /\/(fees|tasas|tarifas|precios|costes|pricing|rates)/.test(path) ||
           /\/(payment|pago|coste)/.test(path);
  }

  private matchesFormPattern(path: string): boolean {
    return /\/(forms|formularios|solicitud|application|impresos)/.test(path) ||
           /\/(download|descargas).*\.(pdf|doc)/.test(path);
  }

  private matchesRegulationPattern(path: string): boolean {
    return /\/(legislation|legislacion|normativa|regulations|laws|leyes)/.test(path) ||
           /\/(boe|dof|gazette|diario-oficial)/.test(path);
  }

  private matchesProcedurePattern(path: string): boolean {
    return /\/(procedures|procedimientos|tramites|how-to|guide|como)/.test(path) ||
           /\/(steps|pasos|proceso)/.test(path);
  }

  private matchesContactPattern(path: string): boolean {
    return /\/(contact|contacto|office|oficina|location|ubicacion)/.test(path) ||
           /\/(hours|horario|schedule)/.test(path);
  }

  private matchesDeadlinePattern(path: string): boolean {
    return /\/(deadlines|plazos|fechas|calendar|calendario)/.test(path) ||
           /\/(important-dates|dates)/.test(path);
  }

  private matchesStatusPattern(path: string): boolean {
    return /\/(status|estado|availability|disponibilidad|service-status)/.test(path) ||
           /\/(maintenance|mantenimiento)/.test(path);
  }
}

/**
 * Create a DynamicRefreshScheduler instance
 */
export function createDynamicRefreshScheduler(
  config?: Partial<DynamicRefreshSchedulerConfig>
): DynamicRefreshScheduler {
  return new DynamicRefreshScheduler(config);
}

// Export types and presets
export { ContentChangePredictor };
export type {
  ContentChangePattern,
  ContentChangeAnalysis,
  PollRecommendation,
  ContentChangePredictionConfig,
};
