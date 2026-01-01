/**
 * Browser Provider Abstraction
 *
 * Supports multiple remote browser services:
 * - Browserless.io: Standard CDP-compatible endpoint
 * - Bright Data: Anti-bot focused with proxy-based approach
 * - Custom: Any CDP-compatible WebSocket endpoint
 *
 * Usage:
 *   Set BROWSER_PROVIDER=browserless and BROWSERLESS_TOKEN=xxx
 *   Or BROWSER_PROVIDER=brightdata and BRIGHTDATA_AUTH=user:pass
 *   Or BROWSER_ENDPOINT=wss://your-custom-endpoint
 */

import { logger } from '../utils/logger.js';
import {
  BrowserlessRateLimiter,
  getDefaultRateLimiter,
  BROWSERLESS_PLANS,
  type BrowserlessPlanLimits,
  type BrowserlessUsageStats,
} from './browserless-rate-limiter.js';

export type BrowserProviderType = 'local' | 'browserless' | 'brightdata' | 'custom';

export interface BrowserProviderConfig {
  type: BrowserProviderType;
  // Browserless options
  browserlessToken?: string;
  browserlessUrl?: string; // Default: wss://chrome.browserless.io
  browserlessPlan?: keyof typeof BROWSERLESS_PLANS; // Plan tier for rate limiting
  // Bright Data options
  brightdataAuth?: string; // format: username:password
  brightdataZone?: string; // Scraping Browser zone
  brightdataCountry?: string; // Country code for geo-targeting
  // Custom endpoint
  customEndpoint?: string;
  // Common options
  timeout?: number;
}

export interface ProviderCapabilities {
  antiBot: boolean;
  geoTargeting: boolean;
  sessionPersistence: boolean;
  residential: boolean;
  unlimitedBandwidth: boolean;
}

export interface BrowserProvider {
  readonly name: string;
  readonly type: BrowserProviderType;
  readonly capabilities: ProviderCapabilities;

  /**
   * Get the WebSocket endpoint URL for Playwright connect
   */
  getEndpoint(): string;

  /**
   * Validate that required credentials are configured
   */
  validate(): { valid: boolean; error?: string };

  /**
   * Get additional connection options if needed
   */
  getConnectionOptions(): Record<string, unknown>;

  /**
   * Acquire a connection slot (for rate-limited providers)
   * Returns a release function to call when done
   */
  acquireSlot?(sessionId: string): Promise<() => void>;

  /**
   * Get rate limiting stats (for rate-limited providers)
   */
  getUsageStats?(): BrowserlessUsageStats;

  /**
   * Get plan limits (for rate-limited providers)
   */
  getPlanLimits?(): BrowserlessPlanLimits;
}

/**
 * Local browser - uses installed Playwright
 */
class LocalProvider implements BrowserProvider {
  static readonly capabilities: ProviderCapabilities = {
    antiBot: false,
    geoTargeting: false,
    sessionPersistence: true,
    residential: false,
    unlimitedBandwidth: true,
  };

  readonly name = 'Local Playwright';
  readonly type: BrowserProviderType = 'local';
  readonly capabilities = LocalProvider.capabilities;

  getEndpoint(): string {
    return ''; // Empty means local launch
  }

  validate(): { valid: boolean; error?: string } {
    return { valid: true };
  }

  getConnectionOptions(): Record<string, unknown> {
    return {};
  }
}

/**
 * Browserless.io - Standard CDP-compatible hosted browser
 * https://browserless.io
 *
 * Free Plan Limits:
 * - 1,000 units/month (1 unit = 30 seconds)
 * - 1 max concurrent browser
 * - 1 minute max session time
 *
 * @see https://www.browserless.io/pricing
 */
class BrowserlessProvider implements BrowserProvider {
  static readonly capabilities: ProviderCapabilities = {
    antiBot: false, // Basic, no special anti-bot handling
    geoTargeting: false,
    sessionPersistence: false,
    residential: false,
    unlimitedBandwidth: false, // Metered
  };

  readonly name = 'Browserless.io';
  readonly type: BrowserProviderType = 'browserless';
  readonly capabilities = BrowserlessProvider.capabilities;

  private token: string;
  private baseUrl: string;
  private timeout: number;
  private rateLimiter: BrowserlessRateLimiter;

  constructor(config: BrowserProviderConfig) {
    this.token = config.browserlessToken || process.env.BROWSERLESS_TOKEN || '';
    this.baseUrl = config.browserlessUrl || process.env.BROWSERLESS_URL || 'wss://chrome.browserless.io';

    // Determine plan from config or env
    const plan = config.browserlessPlan ||
      (process.env.BROWSERLESS_PLAN as keyof typeof BROWSERLESS_PLANS) ||
      'free';

    // Get rate limiter (use shared instance for consistent tracking)
    this.rateLimiter = getDefaultRateLimiter();
    this.rateLimiter.setPlan(plan);

    // Use plan-specific timeout
    const planLimits = this.rateLimiter.getLimits();
    this.timeout = config.timeout || planLimits.connectionTimeout;

    logger.browser.debug('BrowserlessProvider initialized', {
      plan,
      timeout: this.timeout,
      maxConcurrent: planLimits.maxConcurrent,
      maxSessionDuration: planLimits.maxSessionDuration,
    });
  }

  getEndpoint(): string {
    const url = new URL(this.baseUrl);
    url.searchParams.set('token', this.token);
    // Add stealth mode for better anti-detection
    url.searchParams.set('stealth', 'true');
    // Block ads for faster loading
    url.searchParams.set('blockAds', 'true');
    // Set timeout based on plan's max session duration
    const limits = this.rateLimiter.getLimits();
    url.searchParams.set('timeout', String(limits.maxSessionDuration));
    return url.toString();
  }

  validate(): { valid: boolean; error?: string } {
    if (!this.token) {
      return {
        valid: false,
        error: 'Browserless token not configured. Set BROWSERLESS_TOKEN environment variable.',
      };
    }

    // Check if we have units available
    if (!this.rateLimiter.hasUnitsAvailable()) {
      const stats = this.rateLimiter.getStats();
      return {
        valid: false,
        error: `Monthly unit quota exceeded (${stats.unitsUsed}/${stats.unitsUsed + stats.unitsRemaining} units). ` +
          `Quota resets on ${stats.quotaResetDate.toISOString().split('T')[0]}.`,
      };
    }

    return { valid: true };
  }

  getConnectionOptions(): Record<string, unknown> {
    return { timeout: this.timeout };
  }

  /**
   * Acquire a connection slot with rate limiting
   * @param sessionId Unique identifier for this session
   * @returns Release function to call when done
   */
  async acquireSlot(sessionId: string): Promise<() => void> {
    return this.rateLimiter.acquire(sessionId);
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): BrowserlessUsageStats {
    return this.rateLimiter.getStats();
  }

  /**
   * Get plan limits
   */
  getPlanLimits(): BrowserlessPlanLimits {
    return this.rateLimiter.getLimits();
  }
}

/**
 * Bright Data Scraping Browser - Anti-bot focused
 * https://brightdata.com/products/scraping-browser
 *
 * Uses a proxy-based approach with built-in:
 * - CAPTCHA solving
 * - Browser fingerprinting
 * - Residential IP rotation
 * - Geo-targeting
 */
class BrightDataProvider implements BrowserProvider {
  static readonly capabilities: ProviderCapabilities = {
    antiBot: true, // Full anti-bot with CAPTCHA solving
    geoTargeting: true, // Can target specific countries
    sessionPersistence: true, // Supports sticky sessions
    residential: true, // Uses residential IPs
    unlimitedBandwidth: false, // Pay per GB
  };

  readonly name = 'Bright Data Scraping Browser';
  readonly type: BrowserProviderType = 'brightdata';
  readonly capabilities = BrightDataProvider.capabilities;

  private auth: string;
  private zone: string;
  private country?: string;
  private timeout: number;

  constructor(config: BrowserProviderConfig) {
    this.auth = config.brightdataAuth || process.env.BRIGHTDATA_AUTH || '';
    this.zone = config.brightdataZone || process.env.BRIGHTDATA_ZONE || 'scraping_browser';
    this.country = config.brightdataCountry || process.env.BRIGHTDATA_COUNTRY;
    this.timeout = config.timeout || 60000; // Longer timeout for anti-bot
  }

  getEndpoint(): string {
    // Bright Data Scraping Browser WebSocket endpoint
    // Format: wss://brd-customer-{customer_id}-zone-{zone}:{password}@brd.superproxy.io:9222
    const [username, password] = this.auth.split(':');

    if (!username || !password) {
      throw new Error('Invalid BRIGHTDATA_AUTH format. Expected: customer_id:password');
    }

    let endpoint = `wss://${username}-zone-${this.zone}`;

    // Add country targeting if specified
    if (this.country) {
      endpoint += `-country-${this.country}`;
    }

    endpoint += `:${password}@brd.superproxy.io:9222`;

    return endpoint;
  }

  validate(): { valid: boolean; error?: string } {
    if (!this.auth) {
      return {
        valid: false,
        error: 'Bright Data auth not configured. Set BRIGHTDATA_AUTH=customer_id:password environment variable.',
      };
    }

    const parts = this.auth.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        valid: false,
        error: 'Invalid BRIGHTDATA_AUTH format. Expected: customer_id:password',
      };
    }

    return { valid: true };
  }

  getConnectionOptions(): Record<string, unknown> {
    return { timeout: this.timeout };
  }
}

/**
 * Custom provider - any CDP-compatible WebSocket endpoint
 */
class CustomProvider implements BrowserProvider {
  static readonly capabilities: ProviderCapabilities = {
    antiBot: false, // Unknown
    geoTargeting: false,
    sessionPersistence: false,
    residential: false,
    unlimitedBandwidth: true,
  };

  readonly name = 'Custom Endpoint';
  readonly type: BrowserProviderType = 'custom';
  readonly capabilities = CustomProvider.capabilities;

  private endpoint: string;
  private timeout: number;

  constructor(config: BrowserProviderConfig) {
    this.endpoint = config.customEndpoint || process.env.BROWSER_ENDPOINT || '';
    this.timeout = config.timeout || 30000;
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  validate(): { valid: boolean; error?: string } {
    if (!this.endpoint) {
      return {
        valid: false,
        error: 'Custom endpoint not configured. Set BROWSER_ENDPOINT environment variable.',
      };
    }

    try {
      new URL(this.endpoint);
    } catch {
      return {
        valid: false,
        error: 'Invalid endpoint URL format. Expected WebSocket URL (wss://...)',
      };
    }

    return { valid: true };
  }

  getConnectionOptions(): Record<string, unknown> {
    return { timeout: this.timeout };
  }
}

/**
 * Create a browser provider based on configuration
 */
export function createProvider(config?: Partial<BrowserProviderConfig>): BrowserProvider {
  const providerType = config?.type ||
    (process.env.BROWSER_PROVIDER as BrowserProviderType) ||
    detectProviderFromEnv();

  const fullConfig: BrowserProviderConfig = {
    type: providerType,
    ...config,
  };

  logger.browser.debug('Creating browser provider', { type: providerType });

  switch (providerType) {
    case 'browserless':
      return new BrowserlessProvider(fullConfig);
    case 'brightdata':
      return new BrightDataProvider(fullConfig);
    case 'custom':
      return new CustomProvider(fullConfig);
    case 'local':
    default:
      return new LocalProvider();
  }
}

/**
 * Auto-detect provider from environment variables
 */
function detectProviderFromEnv(): BrowserProviderType {
  if (process.env.BRIGHTDATA_AUTH) {
    return 'brightdata';
  }
  if (process.env.BROWSERLESS_TOKEN || process.env.BROWSERLESS_URL) {
    return 'browserless';
  }
  if (process.env.BROWSER_ENDPOINT) {
    return 'custom';
  }
  return 'local';
}

/**
 * Get information about all available providers
 */
export function getProviderInfo(): Array<{
  type: BrowserProviderType;
  name: string;
  configured: boolean;
  capabilities: ProviderCapabilities;
  envVars: string[];
}> {
  return [
    {
      type: 'local',
      name: 'Local Playwright',
      configured: true, // Always available if Playwright is installed
      capabilities: LocalProvider.capabilities,
      envVars: [],
    },
    {
      type: 'browserless',
      name: 'Browserless.io',
      configured: !!(process.env.BROWSERLESS_TOKEN || process.env.BROWSERLESS_URL),
      capabilities: BrowserlessProvider.capabilities,
      envVars: ['BROWSERLESS_TOKEN', 'BROWSERLESS_URL'],
    },
    {
      type: 'brightdata',
      name: 'Bright Data Scraping Browser',
      configured: !!process.env.BRIGHTDATA_AUTH,
      capabilities: BrightDataProvider.capabilities,
      envVars: ['BRIGHTDATA_AUTH', 'BRIGHTDATA_ZONE', 'BRIGHTDATA_COUNTRY'],
    },
    {
      type: 'custom',
      name: 'Custom Endpoint',
      configured: !!process.env.BROWSER_ENDPOINT,
      capabilities: CustomProvider.capabilities,
      envVars: ['BROWSER_ENDPOINT'],
    },
  ];
}
