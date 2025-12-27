/**
 * Geographic Restriction Detector (FEAT-006)
 *
 * Detects when a website is blocking or restricting access based on
 * geographic location. Analyzes HTTP responses, page content, and headers
 * to identify geo-blocking.
 */

import type {
  RegionRestriction,
  RestrictionReason,
  DetectionConfidence,
  CountryCode,
  GeoBlockPattern,
} from './geo-routing-types.js';
import { GEO_BLOCK_PATTERNS } from './geo-routing-types.js';

/**
 * HTTP response for analysis
 */
export interface HttpResponse {
  url: string;
  finalUrl?: string; // After redirects
  statusCode: number;
  headers: Record<string, string>;
  body?: string; // Page content (HTML/text)
}

/**
 * Detector for geographic restrictions
 */
export class GeoRestrictionDetector {
  /**
   * Analyze an HTTP response for geo-blocking indicators
   */
  detect(response: HttpResponse): RegionRestriction {
    const indicators: Array<{
      detected: boolean;
      confidence: DetectionConfidence;
      reason?: RestrictionReason;
      message?: string;
    }> = [];

    // Check HTTP status code
    indicators.push(this.checkStatusCode(response));

    // Check URL patterns
    indicators.push(this.checkUrl(response));

    // Check headers
    indicators.push(this.checkHeaders(response));

    // Check page content
    if (response.body) {
      indicators.push(this.checkContent(response.body));
    }

    // Aggregate indicators
    return this.aggregateIndicators(indicators);
  }

  /**
   * Check HTTP status code for geo-blocking
   */
  private checkStatusCode(response: HttpResponse): {
    detected: boolean;
    confidence: DetectionConfidence;
    reason?: RestrictionReason;
    message?: string;
  } {
    // 451 Unavailable For Legal Reasons (standard geo-block status)
    if (response.statusCode === 451) {
      return {
        detected: true,
        confidence: 'high',
        reason: 'compliance',
        message: 'HTTP 451: Unavailable For Legal Reasons',
      };
    }

    // 403 Forbidden (common for geo-blocking, but less specific)
    if (response.statusCode === 403) {
      return {
        detected: true,
        confidence: 'medium',
        reason: 'geo-block',
        message: 'HTTP 403: Forbidden (possible geo-block)',
      };
    }

    return { detected: false, confidence: 'low' };
  }

  /**
   * Check URL for geo-blocking indicators
   */
  private checkUrl(response: HttpResponse): {
    detected: boolean;
    confidence: DetectionConfidence;
    reason?: RestrictionReason;
    message?: string;
  } {
    const url = response.finalUrl || response.url;

    // Check against URL patterns
    for (const pattern of GEO_BLOCK_PATTERNS.filter(p => p.type === 'url')) {
      if (this.matchesPattern(url, pattern.pattern)) {
        return {
          detected: true,
          confidence: pattern.confidence,
          reason: pattern.reason,
          message: `URL contains geo-block indicator: ${pattern.pattern}`,
        };
      }
    }

    return { detected: false, confidence: 'low' };
  }

  /**
   * Check HTTP headers for geo-blocking
   */
  private checkHeaders(response: HttpResponse): {
    detected: boolean;
    confidence: DetectionConfidence;
    reason?: RestrictionReason;
    message?: string;
  } {
    // Normalize header names to lowercase
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      headers[key.toLowerCase()] = value;
    }

    // Check against header patterns
    for (const pattern of GEO_BLOCK_PATTERNS.filter(p => p.type === 'header')) {
      const headerName = String(pattern.pattern).toLowerCase();
      if (headers[headerName]) {
        return {
          detected: true,
          confidence: pattern.confidence,
          reason: pattern.reason,
          message: `Header indicates geo-block: ${headerName}`,
        };
      }
    }

    // Check for specific header values
    if (headers['x-geo-restricted'] === 'true') {
      return {
        detected: true,
        confidence: 'high',
        reason: 'geo-block',
        message: 'X-Geo-Restricted header present',
      };
    }

    return { detected: false, confidence: 'low' };
  }

  /**
   * Check page content for geo-blocking messages
   */
  private checkContent(body: string): {
    detected: boolean;
    confidence: DetectionConfidence;
    reason?: RestrictionReason;
    message?: string;
  } {
    // Check against content patterns
    for (const pattern of GEO_BLOCK_PATTERNS.filter(p => p.type === 'content')) {
      const match = this.matchesPattern(body, pattern.pattern);
      if (match) {
        // Extract the matched message if it's a regex
        const message = typeof pattern.pattern === 'string'
          ? pattern.pattern
          : typeof match === 'object' && match[0]
            ? match[0]
            : 'Geo-blocking pattern detected in content';

        return {
          detected: true,
          confidence: pattern.confidence,
          reason: pattern.reason,
          message,
        };
      }
    }

    return { detected: false, confidence: 'low' };
  }

  /**
   * Match a string against a pattern (string or regex)
   */
  private matchesPattern(text: string, pattern: string | RegExp): RegExpMatchArray | boolean {
    if (typeof pattern === 'string') {
      return text.toLowerCase().includes(pattern.toLowerCase());
    } else {
      return text.match(pattern) || false;
    }
  }

  /**
   * Aggregate multiple indicators into a single result
   */
  private aggregateIndicators(indicators: Array<{
    detected: boolean;
    confidence: DetectionConfidence;
    reason?: RestrictionReason;
    message?: string;
  }>): RegionRestriction {
    // Filter detected indicators
    const detected = indicators.filter(i => i.detected);

    if (detected.length === 0) {
      return {
        detected: false,
        confidence: 'low',
      };
    }

    // Use highest confidence indicator
    const sorted = detected.sort((a, b) => {
      const confidenceOrder = { low: 1, medium: 2, high: 3 };
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    });

    const primary = sorted[0];

    return {
      detected: true,
      confidence: primary.confidence,
      reason: primary.reason,
      message: primary.message,
    };
  }

  /**
   * Extract country hints from restriction message
   * (e.g., "Not available in your region" + URL contains ".co.uk" → suggests gb)
   */
  extractCountryHints(restriction: RegionRestriction, url: string): {
    suggestedCountry?: CountryCode;
    blockedCountries?: CountryCode[];
    allowedCountries?: CountryCode[];
  } {
    const hints: {
      suggestedCountry?: CountryCode;
      blockedCountries?: CountryCode[];
      allowedCountries?: CountryCode[];
    } = {};

    // Extract TLD hint
    const tldHint = this.extractTldCountry(url);
    if (tldHint) {
      hints.suggestedCountry = tldHint;
    }

    // Parse message for country names (future enhancement)
    // e.g., "Not available in the United States" → blocked: ['us']

    return hints;
  }

  /**
   * Extract country code from TLD
   */
  private extractTldCountry(url: string): CountryCode | undefined {
    try {
      const hostname = new URL(url).hostname.toLowerCase();

      // Check country-code TLDs
      const tldPatterns: Record<string, CountryCode> = {
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
      };

      for (const [tld, country] of Object.entries(tldPatterns)) {
        if (hostname.endsWith(tld)) {
          return country;
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Singleton instance
 */
let detectorInstance: GeoRestrictionDetector | null = null;

/**
 * Get the global detector instance
 */
export function getGeoRestrictionDetector(): GeoRestrictionDetector {
  if (!detectorInstance) {
    detectorInstance = new GeoRestrictionDetector();
  }
  return detectorInstance;
}

/**
 * Reset detector instance (for testing)
 */
export function resetGeoRestrictionDetector(): void {
  detectorInstance = null;
}
