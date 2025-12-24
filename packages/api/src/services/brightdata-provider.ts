/**
 * Bright Data Proxy Provider
 *
 * Implements session-based rotation for Bright Data proxies.
 * Each request gets a unique session ID, resulting in a different IP.
 *
 * Bright Data URL format:
 * http://{username}-zone-{zone}-session-{session}-country-{country}:{password}@brd.superproxy.io:22225
 *
 * Features:
 * - Session-based IP rotation (each session = different IP)
 * - Multi-country support with rotation
 * - Zone support (residential, unblocker, datacenter)
 */

import type { ProxyEndpoint, ProxyTier } from './proxy-types.js';

/**
 * Bright Data zone types
 */
export type BrightDataZone = 'residential' | 'unblocker' | 'datacenter' | 'isp';

/**
 * Bright Data configuration
 */
export interface BrightDataConfig {
  /** Customer ID:password format */
  auth: string;
  /** Default zone (residential, unblocker, etc.) */
  zone?: BrightDataZone;
  /** Countries to rotate through (ISO 2-letter codes) */
  countries?: string[];
  /** Whether to use session-based rotation */
  sessionRotation?: boolean;
  /** Custom port (default: 22225) */
  port?: number;
}

/**
 * Session counter for generating unique session IDs
 */
let sessionCounter = 0;

/**
 * Country rotation counter
 */
let countryCounter = 0;

/**
 * Generate a unique session ID for Bright Data
 * Format: timestamp-counter-random
 */
export function generateSessionId(): string {
  sessionCounter++;
  const timestamp = Date.now().toString(36);
  const counter = sessionCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 6);
  return `s${timestamp}${counter}${random}`;
}

/**
 * Get the next country from the rotation
 */
export function getNextCountry(countries: string[]): string {
  if (countries.length === 0) return '';
  const country = countries[countryCounter % countries.length];
  countryCounter++;
  return country;
}

/**
 * Build a Bright Data proxy URL with session rotation
 */
export function buildBrightDataUrl(
  config: BrightDataConfig,
  options?: {
    sessionId?: string;
    country?: string;
    zone?: BrightDataZone;
  }
): string {
  const [customerId, password] = config.auth.split(':');
  if (!customerId || !password) {
    throw new Error('Invalid Bright Data auth format. Expected customer_id:password');
  }

  const zone = options?.zone || config.zone || 'residential';
  const port = config.port || 22225;

  // Build username with zone and optional parameters
  let username = `${customerId}-zone-${zone}`;

  // Add session for IP rotation
  if (config.sessionRotation !== false) {
    const sessionId = options?.sessionId || generateSessionId();
    username += `-session-${sessionId}`;
  }

  // Add country targeting
  const country = options?.country || (config.countries?.length ? getNextCountry(config.countries) : undefined);
  if (country) {
    username += `-country-${country}`;
  }

  return `http://${username}:${password}@brd.superproxy.io:${port}`;
}

/**
 * Map Bright Data zone to proxy tier
 */
export function zoneToTier(zone: BrightDataZone): ProxyTier {
  switch (zone) {
    case 'unblocker':
      return 'premium';
    case 'residential':
      return 'residential';
    case 'isp':
      return 'isp';
    case 'datacenter':
      return 'datacenter';
    default:
      return 'residential';
  }
}

/**
 * Create a proxy endpoint with session-based rotation
 */
export function createBrightDataEndpoint(
  config: BrightDataConfig,
  options?: {
    id?: string;
    country?: string;
    zone?: BrightDataZone;
  }
): ProxyEndpoint {
  const zone = options?.zone || config.zone || 'residential';
  const country = options?.country;
  const id = options?.id || `brightdata-${zone}-${country || 'global'}-${sessionCounter}`;

  return {
    id,
    url: buildBrightDataUrl(config, { country, zone }),
    country: country,
    isResidential: zone === 'residential' || zone === 'unblocker',
  };
}

/**
 * Create a dynamic proxy endpoint that generates a new session on each getUrl() call
 * This is used for pools where we want different IPs for each request
 */
export class RotatingBrightDataEndpoint implements ProxyEndpoint {
  readonly id: string;
  readonly country?: string;
  readonly city?: string;
  readonly isp?: string;
  readonly isResidential: boolean;

  private config: BrightDataConfig;
  private zone: BrightDataZone;

  constructor(
    config: BrightDataConfig,
    options?: {
      id?: string;
      zone?: BrightDataZone;
      country?: string;
    }
  ) {
    this.config = config;
    this.zone = options?.zone || config.zone || 'residential';
    this.country = options?.country;
    this.id = options?.id || `brightdata-${this.zone}-${this.country || 'rotating'}`;
    this.isResidential = this.zone === 'residential' || this.zone === 'unblocker';
  }

  /**
   * Get the proxy URL - generates a new session each time for IP rotation
   */
  get url(): string {
    return buildBrightDataUrl(this.config, {
      zone: this.zone,
      country: this.country,
    });
  }
}

/**
 * Create multiple endpoints for different countries
 */
export function createBrightDataEndpoints(
  config: BrightDataConfig,
  options?: {
    zone?: BrightDataZone;
    endpointsPerCountry?: number;
  }
): ProxyEndpoint[] {
  const endpoints: ProxyEndpoint[] = [];
  const zone = options?.zone || config.zone || 'residential';
  const perCountry = options?.endpointsPerCountry || 1;
  const countries = config.countries || [''];

  for (const country of countries) {
    for (let i = 0; i < perCountry; i++) {
      const id = country
        ? `brightdata-${zone}-${country}-${i}`
        : `brightdata-${zone}-global-${i}`;

      // Use rotating endpoint for session-based rotation
      if (config.sessionRotation !== false) {
        endpoints.push(
          new RotatingBrightDataEndpoint(config, { id, zone, country: country || undefined })
        );
      } else {
        endpoints.push(
          createBrightDataEndpoint(config, { id, zone, country: country || undefined })
        );
      }
    }
  }

  return endpoints;
}

/**
 * Parse Bright Data configuration from environment variables
 */
export function parseBrightDataConfig(): BrightDataConfig | null {
  const auth = process.env.BRIGHTDATA_AUTH;
  if (!auth) return null;

  const zone = (process.env.BRIGHTDATA_ZONE as BrightDataZone) || 'residential';
  const countriesStr = process.env.BRIGHTDATA_COUNTRIES || process.env.BRIGHTDATA_COUNTRY;
  const countries = countriesStr ? countriesStr.split(',').map((c) => c.trim().toLowerCase()) : undefined;
  const sessionRotation = process.env.BRIGHTDATA_SESSION_ROTATION !== 'false';
  const portStr = process.env.BRIGHTDATA_PORT;
  const port = portStr ? parseInt(portStr, 10) : undefined;

  return {
    auth,
    zone,
    countries,
    sessionRotation,
    port: port && !isNaN(port) ? port : undefined,
  };
}

/**
 * Reset session counter (for testing)
 */
export function resetBrightDataCounters(): void {
  sessionCounter = 0;
  countryCounter = 0;
}
