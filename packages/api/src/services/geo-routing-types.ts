/**
 * Geographic Routing Types (FEAT-006)
 *
 * Types for intelligent geographic proxy selection based on:
 * - Site region requirements (e.g., BBC UK content needs UK proxy)
 * - Region restriction detection
 * - Learned patterns about optimal countries per domain
 */

/**
 * ISO 3166-1 alpha-2 country codes
 * Common countries for proxy routing
 */
export type CountryCode =
  | 'us' // United States
  | 'gb' // United Kingdom
  | 'ca' // Canada
  | 'au' // Australia
  | 'de' // Germany
  | 'fr' // France
  | 'nl' // Netherlands
  | 'it' // Italy
  | 'es' // Spain
  | 'jp' // Japan
  | 'kr' // South Korea
  | 'sg' // Singapore
  | 'hk' // Hong Kong
  | 'in' // India
  | 'br' // Brazil
  | 'mx' // Mexico
  | 'ar' // Argentina
  | 'se' // Sweden
  | 'no' // Norway
  | 'dk' // Denmark
  | 'fi' // Finland
  | 'pl' // Poland
  | 'cz' // Czech Republic
  | 'il' // Israel
  | 'ae' // United Arab Emirates
  | 'za' // South Africa
  | 'nz'; // New Zealand

/**
 * Continent groupings for fallback routing
 */
export type Continent =
  | 'north-america'
  | 'europe'
  | 'asia'
  | 'oceania'
  | 'south-america'
  | 'africa'
  | 'middle-east';

/**
 * Country to continent mapping
 */
export const COUNTRY_TO_CONTINENT: Record<CountryCode, Continent> = {
  us: 'north-america',
  ca: 'north-america',
  mx: 'north-america',
  gb: 'europe',
  de: 'europe',
  fr: 'europe',
  nl: 'europe',
  it: 'europe',
  es: 'europe',
  se: 'europe',
  no: 'europe',
  dk: 'europe',
  fi: 'europe',
  pl: 'europe',
  cz: 'europe',
  jp: 'asia',
  kr: 'asia',
  sg: 'asia',
  hk: 'asia',
  in: 'asia',
  au: 'oceania',
  nz: 'oceania',
  br: 'south-america',
  ar: 'south-america',
  za: 'africa',
  il: 'middle-east',
  ae: 'middle-east',
};

/**
 * Reason for region restriction
 */
export type RestrictionReason =
  | 'geo-block'         // Explicit geo-blocking message
  | 'content-unavailable' // Content not available in region
  | 'license'           // Licensing restrictions
  | 'compliance'        // Regulatory compliance (GDPR, etc.)
  | 'cdn-optimization'  // CDN redirects to regional version
  | 'unknown';          // Suspected but unconfirmed

/**
 * Detection confidence level
 */
export type DetectionConfidence = 'low' | 'medium' | 'high';

/**
 * Region restriction detection result
 */
export interface RegionRestriction {
  detected: boolean;
  confidence: DetectionConfidence;
  reason?: RestrictionReason;
  message?: string; // Extracted message from page
  blockedCountries?: CountryCode[]; // Known blocked countries
  allowedCountries?: CountryCode[]; // Known allowed countries
  suggestedCountry?: CountryCode; // Best country to use
}

/**
 * Domain's geographic preferences (learned)
 */
export interface DomainGeoPreference {
  domain: string;

  // Preferred countries (ordered by success rate)
  preferredCountries: Array<{
    country: CountryCode;
    successRate: number;
    totalAttempts: number;
    successCount?: number; // Count of successful attempts
    lastSuccess?: number;
    lastFailure?: number;
  }>;

  // Known restrictions
  restrictions?: {
    blockedCountries: CountryCode[];
    requiredCountry?: CountryCode; // Some sites require specific country
    allowedContinents?: Continent[];
  };

  // Metadata
  lastUpdated: number;
  confidence: DetectionConfidence;
  sampleSize: number; // Total requests analyzed
}

/**
 * Geo-routing strategy
 */
export type GeoRoutingStrategy =
  | 'auto'              // Automatically select based on domain + learning
  | 'match-target'      // Match target site's country (e.g., .co.uk → gb)
  | 'prefer-user'       // Prefer user's specified country
  | 'closest-region'    // Use closest geographic region
  | 'fallback-chain'    // Try multiple countries in order
  | 'no-preference';    // No geographic preference

/**
 * Request for geo-routing
 */
export interface GeoRoutingRequest {
  domain: string;
  url: string;

  // User preferences
  preferredCountry?: CountryCode;
  preferredContinent?: Continent;
  avoidCountries?: CountryCode[];

  // Strategy
  strategy?: GeoRoutingStrategy;

  // Context
  previousAttempts?: Array<{
    country: CountryCode;
    success: boolean;
    restrictionDetected?: boolean;
  }>;
}

/**
 * Geo-routing recommendation
 */
export interface GeoRoutingRecommendation {
  // Primary recommendation
  country: CountryCode;
  confidence: DetectionConfidence;
  reason: string;

  // Fallback chain
  fallbacks: Array<{
    country: CountryCode;
    reason: string;
  }>;

  // Learned preferences
  learnedPreference?: boolean;
  domainHistory?: {
    totalRequests: number;
    successRate: number;
    bestCountries: CountryCode[];
  };

  // Strategy used
  strategyUsed: GeoRoutingStrategy;
}

/**
 * Result of geo-routed request
 */
export interface GeoRoutingResult {
  success: boolean;
  country: CountryCode;
  restrictionDetected: boolean;
  restriction?: RegionRestriction;

  // Performance
  responseTime: number;
  statusCode?: number;

  // For learning
  shouldRecord: boolean; // Whether to record this for learning
}

/**
 * Patterns that indicate geo-blocking
 */
export interface GeoBlockPattern {
  type: 'url' | 'content' | 'header' | 'status';
  pattern: string | RegExp;
  confidence: DetectionConfidence;
  reason: RestrictionReason;
}

/**
 * Common geo-blocking patterns
 */
export const GEO_BLOCK_PATTERNS: GeoBlockPattern[] = [
  // URL patterns
  {
    type: 'url',
    pattern: /geo[-_]?block/i,
    confidence: 'high',
    reason: 'geo-block',
  },
  {
    type: 'url',
    pattern: /not[-_]?available/i,
    confidence: 'medium',
    reason: 'content-unavailable',
  },
  {
    type: 'url',
    pattern: /region[-_]?restrict/i,
    confidence: 'high',
    reason: 'geo-block',
  },

  // Content patterns
  {
    type: 'content',
    pattern: /not available in your (country|region|location)/i,
    confidence: 'high',
    reason: 'geo-block',
  },
  {
    type: 'content',
    pattern: /content (is )?not available/i,
    confidence: 'medium',
    reason: 'content-unavailable',
  },
  {
    type: 'content',
    pattern: /this (video|content|page) (is )?not available in your area/i,
    confidence: 'high',
    reason: 'geo-block',
  },
  {
    type: 'content',
    pattern: /geo[-_]?block/i,
    confidence: 'high',
    reason: 'geo-block',
  },
  {
    type: 'content',
    pattern: /licensing restrictions/i,
    confidence: 'high',
    reason: 'license',
  },
  {
    type: 'content',
    pattern: /gdpr/i,
    confidence: 'medium',
    reason: 'compliance',
  },
  {
    type: 'content',
    pattern: /region lock/i,
    confidence: 'high',
    reason: 'geo-block',
  },
  {
    type: 'content',
    pattern: /access denied.*location/i,
    confidence: 'high',
    reason: 'geo-block',
  },

  // Header patterns
  {
    type: 'header',
    pattern: 'x-geo-block',
    confidence: 'high',
    reason: 'geo-block',
  },
  {
    type: 'header',
    pattern: 'x-region-restricted',
    confidence: 'high',
    reason: 'geo-block',
  },
];

/**
 * Domain-to-country hints (common patterns)
 */
export const TLD_COUNTRY_HINTS: Record<string, CountryCode> = {
  '.uk': 'gb',
  '.co.uk': 'gb',
  '.de': 'de',
  '.fr': 'fr',
  '.it': 'it',
  '.es': 'es',
  '.ca': 'ca',
  '.au': 'au',
  '.jp': 'jp',
  '.kr': 'kr',
  '.in': 'in',
  '.br': 'br',
  '.mx': 'mx',
  '.nl': 'nl',
  '.se': 'se',
  '.no': 'no',
  '.dk': 'dk',
  '.fi': 'fi',
  '.pl': 'pl',
  '.cz': 'cz',
  '.nz': 'nz',
  '.za': 'za',
  '.sg': 'sg',
  '.hk': 'hk',
  '.ae': 'ae',
  '.il': 'il',
};

/**
 * Statistics for geo-routing
 */
export interface GeoRoutingStats {
  totalRequests: number;
  requestsByCountry: Record<CountryCode, number>;
  successByCountry: Record<CountryCode, number>;
  restrictionsDetected: number;
  domainsWithPreferences: number;
  avgResponseTimeByCountry: Record<CountryCode, number>;
}
