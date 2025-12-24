/**
 * Domain Risk Classifier
 *
 * Classifies domains by their bot protection level and blocking risk.
 * Uses a combination of static rules, historical data, and real-time detection.
 */

import type {
  RiskLevel,
  BotProtection,
  DomainRisk,
  DomainRiskConfig,
  ProxyTier,
} from './proxy-types.js';
import { getRiskLevelFromBlockRate, getRecommendedTierForRisk } from './proxy-types.js';

/** Default configuration values */
const DEFAULT_CONFIG: Required<DomainRiskConfig> = {
  cacheDurationMinutes: 60,
  enableLearning: true,
  historicalWeight: 0.3, // 30% weight for historical data
};

/**
 * Static risk rules for known high-protection domains
 */
const STATIC_RISK_RULES: Array<{
  pattern: RegExp;
  riskLevel: RiskLevel;
  protection: BotProtection[];
  specialHandling?: string[];
}> = [
  // Search engines - extreme protection
  {
    pattern: /google\.(com|[a-z]{2,3})$/i,
    riskLevel: 'extreme',
    protection: ['unknown'],
    specialHandling: ['requires_residential', 'slow_requests', 'session_required'],
  },
  {
    pattern: /bing\.com$/i,
    riskLevel: 'high',
    protection: ['unknown'],
    specialHandling: ['session_required'],
  },

  // Social media - high protection
  {
    pattern: /(facebook|fb)\.com$/i,
    riskLevel: 'extreme',
    protection: ['unknown'],
    specialHandling: ['requires_residential', 'login_required'],
  },
  {
    pattern: /instagram\.com$/i,
    riskLevel: 'extreme',
    protection: ['unknown'],
    specialHandling: ['requires_residential', 'login_required'],
  },
  {
    pattern: /(twitter|x)\.com$/i,
    riskLevel: 'high',
    protection: ['unknown'],
    specialHandling: ['login_required'],
  },
  {
    pattern: /linkedin\.com$/i,
    riskLevel: 'high',
    protection: ['unknown'],
    specialHandling: ['login_required', 'session_required'],
  },
  {
    pattern: /tiktok\.com$/i,
    riskLevel: 'extreme',
    protection: ['unknown'],
    specialHandling: ['requires_residential'],
  },

  // E-commerce - high protection
  {
    pattern: /amazon\.(com|[a-z]{2,3})$/i,
    riskLevel: 'high',
    protection: ['unknown'],
    specialHandling: ['session_required', 'slow_requests'],
  },
  {
    pattern: /ebay\.(com|[a-z]{2,3})$/i,
    riskLevel: 'high',
    protection: ['unknown'],
    specialHandling: ['session_required'],
  },
  {
    pattern: /walmart\.com$/i,
    riskLevel: 'high',
    protection: ['perimeterx'],
  },
  {
    pattern: /target\.com$/i,
    riskLevel: 'high',
    protection: ['akamai'],
  },
  {
    pattern: /bestbuy\.com$/i,
    riskLevel: 'high',
    protection: ['akamai'],
  },

  // Financial - extreme protection
  {
    pattern: /paypal\.com$/i,
    riskLevel: 'extreme',
    protection: ['unknown'],
    specialHandling: ['requires_residential', 'login_required'],
  },
  {
    pattern: /chase\.com$/i,
    riskLevel: 'extreme',
    protection: ['unknown'],
    specialHandling: ['requires_residential', 'login_required'],
  },
  {
    pattern: /bankofamerica\.com$/i,
    riskLevel: 'extreme',
    protection: ['unknown'],
    specialHandling: ['requires_residential', 'login_required'],
  },

  // Travel - high protection
  {
    pattern: /booking\.com$/i,
    riskLevel: 'high',
    protection: ['perimeterx'],
  },
  {
    pattern: /airbnb\.com$/i,
    riskLevel: 'high',
    protection: ['unknown'],
    specialHandling: ['session_required'],
  },
  {
    pattern: /expedia\.com$/i,
    riskLevel: 'high',
    protection: ['akamai'],
  },
  {
    pattern: /(united|delta|americanairlines)\.com$/i,
    riskLevel: 'high',
    protection: ['akamai', 'perimeterx'],
  },

  // Ticketing - extreme protection
  {
    pattern: /ticketmaster\.(com|[a-z]{2,3})$/i,
    riskLevel: 'extreme',
    protection: ['datadome', 'perimeterx'],
    specialHandling: ['requires_residential'],
  },
  {
    pattern: /stubhub\.com$/i,
    riskLevel: 'extreme',
    protection: ['datadome'],
    specialHandling: ['requires_residential'],
  },

  // News sites using Cloudflare - medium protection
  {
    pattern: /bloomberg\.com$/i,
    riskLevel: 'high',
    protection: ['datadome'],
  },
  {
    pattern: /wsj\.com$/i,
    riskLevel: 'medium',
    protection: ['unknown'],
    specialHandling: ['paywall'],
  },
  {
    pattern: /nytimes\.com$/i,
    riskLevel: 'medium',
    protection: ['unknown'],
    specialHandling: ['paywall'],
  },

  // Developer/API sites - low protection
  {
    pattern: /github\.com$/i,
    riskLevel: 'low',
    protection: [],
  },
  {
    pattern: /githubusercontent\.com$/i,
    riskLevel: 'low',
    protection: [],
  },
  {
    pattern: /npmjs\.(com|org)$/i,
    riskLevel: 'low',
    protection: [],
  },
  {
    pattern: /pypi\.org$/i,
    riskLevel: 'low',
    protection: [],
  },
  {
    pattern: /docs\..*\.(com|org|io)$/i,
    riskLevel: 'low',
    protection: [],
  },

  // Cloudflare-protected sites (generic)
  {
    pattern: /\.cloudflare\.com$/i,
    riskLevel: 'medium',
    protection: ['cloudflare'],
  },
];

/**
 * Domain patterns that typically use specific protections
 */
const PROTECTION_INDICATORS: Array<{
  pattern: RegExp;
  protection: BotProtection;
}> = [
  { pattern: /cloudflare/i, protection: 'cloudflare' },
  { pattern: /datadome/i, protection: 'datadome' },
  { pattern: /perimeterx|px-/i, protection: 'perimeterx' },
  { pattern: /akamai/i, protection: 'akamai' },
  { pattern: /imperva|incapsula/i, protection: 'imperva' },
  { pattern: /kasada/i, protection: 'kasada' },
  { pattern: /shape/i, protection: 'shape' },
];

/**
 * Classifies domains by protection level and blocking risk
 */
export class DomainRiskClassifier {
  private config: Required<DomainRiskConfig>;

  // Cache: domain -> DomainRisk
  private cache: Map<string, DomainRisk> = new Map();

  // Historical data: domain -> { successes, failures }
  private historicalData: Map<string, { successes: number; failures: number }> = new Map();

  // Detected protections: domain -> BotProtection[]
  private detectedProtections: Map<string, BotProtection[]> = new Map();

  constructor(config: DomainRiskConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Classify risk level for a domain
   */
  classifyDomain(domain: string): DomainRisk {
    // Normalize domain
    const normalizedDomain = this.normalizeDomain(domain);

    // Check cache
    const cached = this.cache.get(normalizedDomain);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Build risk assessment
    const risk = this.buildRiskAssessment(normalizedDomain);

    // Cache result
    this.cache.set(normalizedDomain, risk);

    return risk;
  }

  /**
   * Get risk level for a URL
   */
  getRiskForUrl(url: string): DomainRisk {
    try {
      const parsed = new URL(url);
      return this.classifyDomain(parsed.hostname);
    } catch {
      // Invalid URL, return high risk as precaution
      return this.buildDefaultRisk(url);
    }
  }

  /**
   * Record a successful request (for learning)
   */
  recordSuccess(domain: string): void {
    if (!this.config.enableLearning) return;

    const normalized = this.normalizeDomain(domain);
    const data = this.historicalData.get(normalized) || { successes: 0, failures: 0 };
    data.successes++;
    this.historicalData.set(normalized, data);

    // Invalidate cache
    this.cache.delete(normalized);
  }

  /**
   * Record a failed request (for learning)
   */
  recordFailure(domain: string, wasBlocked: boolean = false): void {
    if (!this.config.enableLearning) return;

    const normalized = this.normalizeDomain(domain);
    const data = this.historicalData.get(normalized) || { successes: 0, failures: 0 };
    data.failures++;
    this.historicalData.set(normalized, data);

    // Invalidate cache
    this.cache.delete(normalized);
  }

  /**
   * Record detected protection for a domain
   */
  recordDetectedProtection(domain: string, protection: BotProtection): void {
    const normalized = this.normalizeDomain(domain);
    const protections = this.detectedProtections.get(normalized) || [];
    if (!protections.includes(protection)) {
      protections.push(protection);
      this.detectedProtections.set(normalized, protections);
    }

    // Invalidate cache
    this.cache.delete(normalized);
  }

  /**
   * Detect protection type from response headers or content
   */
  detectProtectionFromResponse(
    domain: string,
    headers: Record<string, string>,
    body?: string
  ): BotProtection | null {
    const normalized = this.normalizeDomain(domain);

    // Check headers
    const serverHeader = headers['server'] || headers['Server'] || '';
    const cfRay = headers['cf-ray'] || headers['CF-Ray'];
    const xDatadome = headers['x-datadome'] || headers['X-DataDome'];

    if (cfRay) {
      this.recordDetectedProtection(normalized, 'cloudflare');
      return 'cloudflare';
    }

    if (xDatadome) {
      this.recordDetectedProtection(normalized, 'datadome');
      return 'datadome';
    }

    if (serverHeader.toLowerCase().includes('akamai')) {
      this.recordDetectedProtection(normalized, 'akamai');
      return 'akamai';
    }

    // Check body for protection signatures
    if (body) {
      if (body.includes('cf-browser-verification') || body.includes('cloudflare')) {
        this.recordDetectedProtection(normalized, 'cloudflare');
        return 'cloudflare';
      }
      if (body.includes('datadome') || body.includes('dd.js')) {
        this.recordDetectedProtection(normalized, 'datadome');
        return 'datadome';
      }
      if (body.includes('px-captcha') || body.includes('_pxhd')) {
        this.recordDetectedProtection(normalized, 'perimeterx');
        return 'perimeterx';
      }
      if (body.includes('g-recaptcha') || body.includes('grecaptcha')) {
        this.recordDetectedProtection(normalized, 'recaptcha');
        return 'recaptcha';
      }
      if (body.includes('h-captcha') || body.includes('hcaptcha')) {
        this.recordDetectedProtection(normalized, 'hcaptcha');
        return 'hcaptcha';
      }
      if (body.includes('cf-turnstile') || body.includes('turnstile')) {
        this.recordDetectedProtection(normalized, 'turnstile');
        return 'turnstile';
      }
    }

    return null;
  }

  /**
   * Get recommended delay between requests for a domain
   */
  getRecommendedDelay(domain: string): number {
    const risk = this.classifyDomain(domain);
    return risk.recommendedDelayMs;
  }

  /**
   * Check if domain requires residential proxies
   */
  requiresResidential(domain: string): boolean {
    const risk = this.classifyDomain(domain);
    return risk.factors.requiresResidential;
  }

  /**
   * Get all known high-risk domains
   */
  getHighRiskDomains(): string[] {
    const highRisk: string[] = [];

    // From static rules
    for (const rule of STATIC_RISK_RULES) {
      if (rule.riskLevel === 'high' || rule.riskLevel === 'extreme') {
        // Extract domain pattern (simplified)
        const match = rule.pattern.source.match(/([a-z0-9-]+)\\.(?:com|org|[a-z]{2,3})/i);
        if (match) {
          highRisk.push(match[0].replace(/\\/g, ''));
        }
      }
    }

    // From learned data
    for (const [domain, data] of this.historicalData) {
      const total = data.successes + data.failures;
      if (total >= 10) {
        const blockRate = data.failures / total;
        if (blockRate >= 0.4) {
          highRisk.push(domain);
        }
      }
    }

    return [...new Set(highRisk)];
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.cache.clear();
    this.historicalData.clear();
    this.detectedProtections.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/^www\./, '');
  }

  private isCacheValid(risk: DomainRisk): boolean {
    const ageMinutes = (Date.now() - risk.assessedAt.getTime()) / 1000 / 60;
    return ageMinutes < this.config.cacheDurationMinutes;
  }

  private buildRiskAssessment(domain: string): DomainRisk {
    // Start with static rules
    const staticRisk = this.getStaticRisk(domain);

    // Get historical data
    const historical = this.historicalData.get(domain);
    const totalHistorical = historical ? historical.successes + historical.failures : 0;
    const historicalBlockRate = totalHistorical > 0 ? historical!.failures / totalHistorical : 0;

    // Get detected protections
    const detectedProtections = this.detectedProtections.get(domain) || [];

    // Combine protections
    const allProtections = [...new Set([...(staticRisk?.protection || []), ...detectedProtections])];

    // Calculate combined risk level
    let riskLevel: RiskLevel = staticRisk?.riskLevel || 'low';
    let confidence = staticRisk ? 0.8 : 0.3;

    // Adjust based on historical data
    if (totalHistorical >= 10) {
      const historicalRisk = getRiskLevelFromBlockRate(historicalBlockRate);
      // Weighted combination
      riskLevel = this.combineRiskLevels(riskLevel, historicalRisk, this.config.historicalWeight);
      confidence = Math.min(0.95, confidence + 0.1);
    }

    // Adjust based on detected protections
    if (detectedProtections.length > 0) {
      const protectionRisk = this.getRiskFromProtections(detectedProtections);
      riskLevel = this.combineRiskLevels(riskLevel, protectionRisk, 0.4);
      confidence = Math.min(0.95, confidence + 0.15);
    }

    // Determine special handling
    const specialHandling = staticRisk?.specialHandling || [];

    // Calculate recommendations
    const recommendedProxyTier = this.getRecommendedTier(riskLevel, allProtections);
    const recommendedDelayMs = this.getDelayForRisk(riskLevel);

    return {
      domain,
      riskLevel,
      confidence,
      factors: {
        knownProtection: allProtections,
        historicalBlockRate,
        requiresResidential:
          riskLevel === 'extreme' ||
          specialHandling.includes('requires_residential') ||
          allProtections.some((p) => ['datadome', 'perimeterx', 'kasada'].includes(p)),
        requiresSession: specialHandling.includes('session_required'),
        geoRestrictions: [],
      },
      recommendedProxyTier,
      recommendedDelayMs,
      specialHandling,
      assessedAt: new Date(),
      source: staticRisk ? 'static' : historical ? 'historical' : 'realtime',
    };
  }

  private getStaticRisk(
    domain: string
  ): { riskLevel: RiskLevel; protection: BotProtection[]; specialHandling?: string[] } | null {
    for (const rule of STATIC_RISK_RULES) {
      if (rule.pattern.test(domain)) {
        return {
          riskLevel: rule.riskLevel,
          protection: rule.protection,
          specialHandling: rule.specialHandling,
        };
      }
    }
    return null;
  }

  private getRiskFromProtections(protections: BotProtection[]): RiskLevel {
    // Certain protections always mean high risk
    const extremeProtections: BotProtection[] = ['datadome', 'perimeterx', 'kasada', 'shape'];
    const highProtections: BotProtection[] = ['akamai', 'imperva', 'cloudflare'];

    if (protections.some((p) => extremeProtections.includes(p))) {
      return 'extreme';
    }
    if (protections.some((p) => highProtections.includes(p))) {
      return 'high';
    }
    if (protections.some((p) => ['recaptcha', 'hcaptcha', 'turnstile'].includes(p))) {
      return 'medium';
    }
    return 'low';
  }

  private combineRiskLevels(primary: RiskLevel, secondary: RiskLevel, secondaryWeight: number): RiskLevel {
    const levels: RiskLevel[] = ['low', 'medium', 'high', 'extreme'];
    const primaryIndex = levels.indexOf(primary);
    const secondaryIndex = levels.indexOf(secondary);

    // Weighted average, rounded up for safety
    const combinedIndex = Math.ceil(primaryIndex * (1 - secondaryWeight) + secondaryIndex * secondaryWeight);
    return levels[Math.min(combinedIndex, levels.length - 1)];
  }

  private getRecommendedTier(riskLevel: RiskLevel, protections: BotProtection[]): ProxyTier {
    // Start with base recommendation
    let tier = getRecommendedTierForRisk(riskLevel);

    // Escalate for certain protections
    if (protections.some((p) => ['datadome', 'perimeterx', 'kasada'].includes(p))) {
      if (tier === 'datacenter') tier = 'residential';
      else if (tier === 'isp') tier = 'residential';
    }

    return tier;
  }

  private getDelayForRisk(riskLevel: RiskLevel): number {
    switch (riskLevel) {
      case 'extreme':
        return 5000; // 5 seconds
      case 'high':
        return 2000; // 2 seconds
      case 'medium':
        return 1000; // 1 second
      case 'low':
      default:
        return 500; // 500ms
    }
  }

  private buildDefaultRisk(domain: string): DomainRisk {
    return {
      domain,
      riskLevel: 'high', // Default to high for safety
      confidence: 0.1,
      factors: {
        knownProtection: [],
        historicalBlockRate: 0,
        requiresResidential: false,
        requiresSession: false,
        geoRestrictions: [],
      },
      recommendedProxyTier: 'isp',
      recommendedDelayMs: 2000,
      specialHandling: [],
      assessedAt: new Date(),
      source: 'realtime',
    };
  }
}

// Singleton instance
let classifierInstance: DomainRiskClassifier | null = null;

/**
 * Get the singleton domain risk classifier
 */
export function getDomainRiskClassifier(config?: DomainRiskConfig): DomainRiskClassifier {
  if (!classifierInstance) {
    classifierInstance = new DomainRiskClassifier(config);
  }
  return classifierInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetDomainRiskClassifier(): void {
  if (classifierInstance) {
    classifierInstance.reset();
  }
  classifierInstance = null;
}
