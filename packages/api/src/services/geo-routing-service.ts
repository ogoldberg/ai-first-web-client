/**
 * Geographic Routing Service (FEAT-006)
 *
 * Intelligent geographic proxy selection based on:
 * - Learned domain preferences
 * - TLD country hints
 * - Region restriction detection
 * - Success/failure tracking per country
 */

import type {
  CountryCode,
  Continent,
  DomainGeoPreference,
  GeoRoutingRequest,
  GeoRoutingRecommendation,
  GeoRoutingResult,
  GeoRoutingStrategy,
  GeoRoutingStats,
  DetectionConfidence,
} from './geo-routing-types.js';
import { COUNTRY_TO_CONTINENT, TLD_COUNTRY_HINTS } from './geo-routing-types.js';

/**
 * Service for learning and recommending geographic routing
 */
export class GeoRoutingService {
  private preferences: Map<string, DomainGeoPreference> = new Map();
  private stats: GeoRoutingStats = {
    totalRequests: 0,
    requestsByCountry: {} as Record<CountryCode, number>,
    successByCountry: {} as Record<CountryCode, number>,
    restrictionsDetected: 0,
    domainsWithPreferences: 0,
    avgResponseTimeByCountry: {} as Record<CountryCode, number>,
  };

  /**
   * Get routing recommendation for a domain
   */
  getRecommendation(request: GeoRoutingRequest): GeoRoutingRecommendation {
    const domain = this.extractDomain(request.url);
    const strategy = request.strategy || 'auto';

    // Get learned preference
    const domainPref = this.preferences.get(domain);

    switch (strategy) {
      case 'auto':
        return this.recommendAuto(request, domain, domainPref);

      case 'match-target':
        return this.recommendMatchTarget(request, domain, domainPref);

      case 'prefer-user':
        return this.recommendPreferUser(request, domain, domainPref);

      case 'closest-region':
        return this.recommendClosestRegion(request, domain, domainPref);

      case 'fallback-chain':
        return this.recommendFallbackChain(request, domain, domainPref);

      case 'no-preference':
        return this.recommendNoPreference(request);

      default:
        return this.recommendAuto(request, domain, domainPref);
    }
  }

  /**
   * Auto strategy: User preference first, then learned preferences, fall back to TLD hint
   */
  private recommendAuto(
    request: GeoRoutingRequest,
    domain: string,
    domainPref?: DomainGeoPreference
  ): GeoRoutingRecommendation {
    // 1. Check user preference first (explicit user intent takes priority)
    if (request.preferredCountry) {
      return {
        country: request.preferredCountry,
        confidence: 'high',
        reason: 'User preference',
        fallbacks: this.buildFallbackChain(request.preferredCountry, request.avoidCountries),
        strategyUsed: 'auto',
      };
    }

    // 2. Check required country (e.g., geo-locked content)
    if (domainPref?.restrictions?.requiredCountry) {
      return {
        country: domainPref.restrictions.requiredCountry,
        confidence: 'high',
        reason: 'Domain requires specific country',
        fallbacks: [],
        learnedPreference: true,
        strategyUsed: 'auto',
      };
    }

    // 3. Check learned preferences
    if (domainPref && domainPref.preferredCountries.length > 0) {
      const best = domainPref.preferredCountries[0];
      if (best.successRate > 0.7) {
        return {
          country: best.country,
          confidence: domainPref.confidence,
          reason: `Learned preference: ${(best.successRate * 100).toFixed(0)}% success rate`,
          fallbacks: domainPref.preferredCountries.slice(1, 4).map(c => ({
            country: c.country,
            reason: `Fallback: ${(c.successRate * 100).toFixed(0)}% success`,
          })),
          learnedPreference: true,
          domainHistory: {
            totalRequests: domainPref.sampleSize,
            successRate: best.successRate,
            bestCountries: domainPref.preferredCountries.slice(0, 3).map(c => c.country),
          },
          strategyUsed: 'auto',
        };
      }
    }

    // 4. Use TLD hint
    const tldHint = this.extractTldCountry(request.url);
    if (tldHint) {
      return {
        country: tldHint,
        confidence: 'medium',
        reason: `TLD suggests ${tldHint.toUpperCase()}`,
        fallbacks: this.buildFallbackChain(tldHint, request.avoidCountries),
        strategyUsed: 'auto',
      };
    }

    // 5. Default to US
    return {
      country: 'us',
      confidence: 'low',
      reason: 'Default (no preference)',
      fallbacks: this.buildFallbackChain('us', request.avoidCountries),
      strategyUsed: 'auto',
    };
  }

  /**
   * Match target strategy: Use TLD-based hint
   */
  private recommendMatchTarget(
    request: GeoRoutingRequest,
    domain: string,
    domainPref?: DomainGeoPreference
  ): GeoRoutingRecommendation {
    const tldHint = this.extractTldCountry(request.url);
    const country = tldHint || 'us';

    return {
      country,
      confidence: tldHint ? 'high' : 'low',
      reason: tldHint ? `Matched TLD: ${tldHint}` : 'No TLD hint, using default',
      fallbacks: this.buildFallbackChain(country, request.avoidCountries),
      strategyUsed: 'match-target',
    };
  }

  /**
   * Prefer user strategy: Use user's preferred country
   */
  private recommendPreferUser(
    request: GeoRoutingRequest,
    domain: string,
    domainPref?: DomainGeoPreference
  ): GeoRoutingRecommendation {
    const country = request.preferredCountry || 'us';

    return {
      country,
      confidence: request.preferredCountry ? 'high' : 'low',
      reason: request.preferredCountry ? 'User preference' : 'No user preference, using default',
      fallbacks: this.buildFallbackChain(country, request.avoidCountries),
      strategyUsed: 'prefer-user',
    };
  }

  /**
   * Closest region strategy: Use geographic proximity
   */
  private recommendClosestRegion(
    request: GeoRoutingRequest,
    domain: string,
    domainPref?: DomainGeoPreference
  ): GeoRoutingRecommendation {
    // If user has continent preference, use that
    if (request.preferredContinent) {
      const country = this.getRepresentativeCountry(request.preferredContinent);
      return {
        country,
        confidence: 'medium',
        reason: `Representative of ${request.preferredContinent}`,
        fallbacks: this.buildContinentFallbacks(request.preferredContinent, request.avoidCountries),
        strategyUsed: 'closest-region',
      };
    }

    // Otherwise use TLD hint's continent
    const tldHint = this.extractTldCountry(request.url);
    if (tldHint) {
      const continent = COUNTRY_TO_CONTINENT[tldHint];
      return {
        country: tldHint,
        confidence: 'medium',
        reason: `Same region as target (${continent})`,
        fallbacks: this.buildContinentFallbacks(continent, request.avoidCountries),
        strategyUsed: 'closest-region',
      };
    }

    // Default to US
    return {
      country: 'us',
      confidence: 'low',
      reason: 'Default region (North America)',
      fallbacks: this.buildContinentFallbacks('north-america', request.avoidCountries),
      strategyUsed: 'closest-region',
    };
  }

  /**
   * Fallback chain strategy: Build extensive fallback list
   */
  private recommendFallbackChain(
    request: GeoRoutingRequest,
    domain: string,
    domainPref?: DomainGeoPreference
  ): GeoRoutingRecommendation {
    const tldHint = this.extractTldCountry(request.url);
    const country = request.preferredCountry || tldHint || 'us';

    return {
      country,
      confidence: 'medium',
      reason: 'Primary in fallback chain',
      fallbacks: this.buildExtensiveFallbacks(country, request.avoidCountries),
      strategyUsed: 'fallback-chain',
    };
  }

  /**
   * No preference strategy: Just use default
   */
  private recommendNoPreference(request: GeoRoutingRequest): GeoRoutingRecommendation {
    return {
      country: 'us',
      confidence: 'low',
      reason: 'No geographic preference',
      fallbacks: [],
      strategyUsed: 'no-preference',
    };
  }

  /**
   * Record the result of a geo-routed request
   */
  recordResult(domain: string, result: GeoRoutingResult): void {
    if (!result.shouldRecord) {
      return;
    }

    this.stats.totalRequests++;
    this.stats.requestsByCountry[result.country] = (this.stats.requestsByCountry[result.country] || 0) + 1;

    if (result.success) {
      this.stats.successByCountry[result.country] = (this.stats.successByCountry[result.country] || 0) + 1;
    }

    if (result.restrictionDetected) {
      this.stats.restrictionsDetected++;
    }

    // Update or create domain preference
    const pref = this.preferences.get(domain) || this.createDefaultPreference(domain);

    // Find or create country entry
    let countryEntry = pref.preferredCountries.find(c => c.country === result.country);
    if (!countryEntry) {
      countryEntry = {
        country: result.country,
        successRate: 0,
        totalAttempts: 0,
        successCount: 0, // Track successes per country
      };
      pref.preferredCountries.push(countryEntry);
    }

    // Update stats
    countryEntry.totalAttempts++;
    if (result.success) {
      countryEntry.successCount = (countryEntry.successCount || 0) + 1;
      countryEntry.lastSuccess = Date.now();
    } else {
      countryEntry.lastFailure = Date.now();
    }

    // Recalculate success rate for this country
    countryEntry.successRate = (countryEntry.successCount || 0) / countryEntry.totalAttempts;

    // Sort by success rate
    pref.preferredCountries.sort((a, b) => b.successRate - a.successRate);

    // Update metadata
    pref.sampleSize++;
    pref.lastUpdated = Date.now();
    pref.confidence = this.calculateConfidence(pref.sampleSize);

    // Handle restrictions
    if (result.restrictionDetected && result.restriction) {
      pref.restrictions = pref.restrictions || { blockedCountries: [] };
      if (!pref.restrictions.blockedCountries.includes(result.country)) {
        pref.restrictions.blockedCountries.push(result.country);
      }
    }

    this.preferences.set(domain, pref);
    this.stats.domainsWithPreferences = this.preferences.size;
  }

  /**
   * Get statistics for geo-routing
   */
  getStats(): GeoRoutingStats {
    return { ...this.stats };
  }

  /**
   * Get preference for a domain
   */
  getPreference(domain: string): DomainGeoPreference | undefined {
    return this.preferences.get(domain);
  }

  /**
   * Clear all preferences (for testing)
   */
  clearPreferences(): void {
    this.preferences.clear();
    this.stats = {
      totalRequests: 0,
      requestsByCountry: {} as Record<CountryCode, number>,
      successByCountry: {} as Record<CountryCode, number>,
      restrictionsDetected: 0,
      domainsWithPreferences: 0,
      avgResponseTimeByCountry: {} as Record<CountryCode, number>,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return url;
    }
  }

  private extractTldCountry(url: string): CountryCode | undefined {
    const hostname = this.extractDomain(url);
    for (const [tld, country] of Object.entries(TLD_COUNTRY_HINTS)) {
      if (hostname.endsWith(tld)) {
        return country;
      }
    }
    return undefined;
  }

  private buildFallbackChain(primary: CountryCode, avoid?: CountryCode[]): Array<{ country: CountryCode; reason: string }> {
    const common: CountryCode[] = ['us', 'gb', 'de', 'ca', 'fr', 'nl', 'au'];
    const filtered = common
      .filter(c => c !== primary && !avoid?.includes(c))
      .slice(0, 3);

    return filtered.map(c => ({
      country: c,
      reason: `Common fallback: ${c.toUpperCase()}`,
    }));
  }

  private buildContinentFallbacks(continent: Continent, avoid?: CountryCode[]): Array<{ country: CountryCode; reason: string }> {
    const continentCountries: Record<Continent, CountryCode[]> = {
      'north-america': ['us', 'ca', 'mx'],
      'europe': ['gb', 'de', 'fr', 'nl', 'it', 'es'],
      'asia': ['jp', 'sg', 'hk', 'kr', 'in'],
      'oceania': ['au', 'nz'],
      'south-america': ['br', 'ar'],
      'africa': ['za'],
      'middle-east': ['ae', 'il'],
    };

    const countries = continentCountries[continent] || [];
    const filtered = countries.filter(c => !avoid?.includes(c)).slice(0, 3);

    return filtered.map(c => ({
      country: c,
      reason: `${continent} region`,
    }));
  }

  private buildExtensiveFallbacks(primary: CountryCode, avoid?: CountryCode[]): Array<{ country: CountryCode; reason: string }> {
    const all: CountryCode[] = ['us', 'gb', 'de', 'fr', 'ca', 'nl', 'au', 'jp', 'sg', 'it'];
    const filtered = all
      .filter(c => c !== primary && !avoid?.includes(c))
      .slice(0, 5);

    return filtered.map((c, i) => ({
      country: c,
      reason: `Fallback #${i + 1}`,
    }));
  }

  private getRepresentativeCountry(continent: Continent): CountryCode {
    const representatives: Record<Continent, CountryCode> = {
      'north-america': 'us',
      'europe': 'gb',
      'asia': 'sg',
      'oceania': 'au',
      'south-america': 'br',
      'africa': 'za',
      'middle-east': 'ae',
    };
    return representatives[continent] || 'us';
  }

  private createDefaultPreference(domain: string): DomainGeoPreference {
    return {
      domain,
      preferredCountries: [],
      lastUpdated: Date.now(),
      confidence: 'low',
      sampleSize: 0,
    };
  }

  private calculateConfidence(sampleSize: number): DetectionConfidence {
    if (sampleSize >= 20) return 'high';
    if (sampleSize >= 5) return 'medium';
    return 'low';
  }
}

/**
 * Singleton instance
 */
let serviceInstance: GeoRoutingService | null = null;

/**
 * Get the global service instance
 */
export function getGeoRoutingService(): GeoRoutingService {
  if (!serviceInstance) {
    serviceInstance = new GeoRoutingService();
  }
  return serviceInstance;
}

/**
 * Reset service instance (for testing)
 */
export function resetGeoRoutingService(): void {
  serviceInstance = null;
}
