/**
 * Proxy Manager
 *
 * Central orchestrator for proxy management. Combines health tracking,
 * domain risk classification, and intelligent proxy selection.
 */

import type { Plan } from '../middleware/types.js';
import type {
  ProxyTier,
  ProxyInstance,
  ProxyPoolConfig,
  ProxyPoolStats,
  ProxyConfig,
  ProxyBrowseOptions,
  ProxyError,
  FailureReason,
  DomainRisk,
  ProxyEndpoint,
} from './proxy-types.js';
import { PROXY_TIER_COSTS, parseProxyUrl } from './proxy-types.js';
import { ProxyHealthTracker, getHealthTracker, resetHealthTracker } from './proxy-health.js';
import { DomainRiskClassifier, getDomainRiskClassifier, resetDomainRiskClassifier } from './domain-risk.js';
import { ProxySelector, getProxySelector, resetProxySelector } from './proxy-selector.js';
import {
  parseBrightDataConfig,
  createBrightDataEndpoints,
  zoneToTier,
  resetBrightDataCounters,
  type BrightDataZone,
} from './brightdata-provider.js';

/**
 * Result of a proxy request
 */
export interface ProxyRequestResult {
  proxy: ProxyInstance;
  riskAssessment: DomainRisk;
  tier: ProxyTier;
  poolId: string;
  selectionReason: string;
  fallbacksAvailable: number;
}

/**
 * Options for getting a proxy
 */
export interface GetProxyOptions {
  domain: string;
  tenantId: string;
  tenantPlan: Plan;
  proxyOptions?: ProxyBrowseOptions;
}

/**
 * Central proxy management service
 */
export class ProxyManager {
  private healthTracker: ProxyHealthTracker;
  private riskClassifier: DomainRiskClassifier;
  private proxySelector: ProxySelector;
  private initialized: boolean = false;

  constructor() {
    this.healthTracker = getHealthTracker();
    this.riskClassifier = getDomainRiskClassifier();
    this.proxySelector = getProxySelector();
  }

  /**
   * Initialize the proxy manager with configuration from environment
   */
  initialize(config?: ProxyConfig): void {
    if (this.initialized) {
      return;
    }

    const envConfig = this.loadConfigFromEnv(config);

    // Configure datacenter proxies
    if (envConfig.datacenterUrls) {
      const datacenterProxies = this.parseProxyUrls(envConfig.datacenterUrls, 'dc');
      if (datacenterProxies.length > 0) {
        this.proxySelector.addPool({
          id: 'datacenter-default',
          tier: 'datacenter',
          name: 'Default Datacenter Pool',
          proxies: datacenterProxies,
          rotationStrategy: 'round-robin',
        });
      }
    }

    // Configure ISP proxies
    if (envConfig.ispUrls) {
      const ispProxies = this.parseProxyUrls(envConfig.ispUrls, 'isp');
      if (ispProxies.length > 0) {
        this.proxySelector.addPool({
          id: 'isp-default',
          tier: 'isp',
          name: 'Default ISP Pool',
          proxies: ispProxies,
          rotationStrategy: 'least-used',
        });
      }
    }

    // Configure Bright Data proxies with session rotation
    const brightDataConfig = parseBrightDataConfig();
    if (brightDataConfig) {
      // Create residential endpoints with session-based rotation
      const residentialEndpoints = createBrightDataEndpoints(brightDataConfig, {
        zone: 'residential',
        endpointsPerCountry: 3, // Multiple endpoints for better distribution
      });

      if (residentialEndpoints.length > 0) {
        this.proxySelector.addPool({
          id: 'brightdata-residential',
          tier: 'residential',
          name: 'Bright Data Residential (Session Rotating)',
          proxies: residentialEndpoints,
          rotationStrategy: 'round-robin',
        });
      }

      // Create premium/unlocker endpoints
      const unlockerEndpoints = createBrightDataEndpoints(brightDataConfig, {
        zone: 'unblocker',
        endpointsPerCountry: 2,
      });

      if (unlockerEndpoints.length > 0) {
        this.proxySelector.addPool({
          id: 'brightdata-unlocker',
          tier: 'premium',
          name: 'Bright Data Unlocker (Premium)',
          proxies: unlockerEndpoints,
          rotationStrategy: 'round-robin',
        });
      }

      // If datacenter zone is configured, add datacenter pool from Bright Data
      if (brightDataConfig.zone === 'datacenter') {
        const datacenterEndpoints = createBrightDataEndpoints(brightDataConfig, {
          zone: 'datacenter',
          endpointsPerCountry: 5,
        });

        if (datacenterEndpoints.length > 0) {
          this.proxySelector.addPool({
            id: 'brightdata-datacenter',
            tier: 'datacenter',
            name: 'Bright Data Datacenter',
            proxies: datacenterEndpoints,
            rotationStrategy: 'round-robin',
          });
        }
      }

      // If ISP zone is configured, add ISP pool from Bright Data
      if (brightDataConfig.zone === 'isp') {
        const ispEndpoints = createBrightDataEndpoints(brightDataConfig, {
          zone: 'isp',
          endpointsPerCountry: 3,
        });

        if (ispEndpoints.length > 0) {
          this.proxySelector.addPool({
            id: 'brightdata-isp',
            tier: 'isp',
            name: 'Bright Data ISP',
            proxies: ispEndpoints,
            rotationStrategy: 'least-used',
          });
        }
      }
    } else if (envConfig.brightdataAuth) {
      // Legacy fallback: use old method if new config parsing fails
      const brightdataProxy = this.createBrightDataProxy(envConfig);
      this.proxySelector.addPool({
        id: 'brightdata-residential',
        tier: 'residential',
        name: 'Bright Data Residential',
        proxies: [brightdataProxy],
        rotationStrategy: 'round-robin',
      });

      const brightdataUnlocker = this.createBrightDataUnlockerProxy(envConfig);
      this.proxySelector.addPool({
        id: 'brightdata-unlocker',
        tier: 'premium',
        name: 'Bright Data Unlocker',
        proxies: [brightdataUnlocker],
        rotationStrategy: 'round-robin',
      });
    }

    this.initialized = true;
  }

  /**
   * Get a proxy for a browse request
   */
  async getProxy(options: GetProxyOptions): Promise<ProxyRequestResult> {
    if (!this.initialized) {
      this.initialize();
    }

    const result = await this.proxySelector.selectProxy({
      domain: options.domain,
      tenantId: options.tenantId,
      tenantPlan: options.tenantPlan,
      preferredTier: options.proxyOptions?.preferredTier,
      preferredCountry: options.proxyOptions?.preferredCountry,
      requireFresh: options.proxyOptions?.requireFresh,
      stickySessionId: options.proxyOptions?.stickySessionId,
    });

    return {
      proxy: result.proxy,
      riskAssessment: result.riskAssessment,
      tier: result.proxy.tier,
      poolId: result.proxy.poolId,
      selectionReason: result.selectionReason,
      fallbacksAvailable: result.fallbacksAvailable,
    };
  }

  /**
   * Get a fallback proxy after failure
   */
  async getFallbackProxy(
    originalProxy: ProxyInstance,
    domain: string,
    tenantPlan: Plan
  ): Promise<ProxyInstance | null> {
    return this.proxySelector.selectFallback(originalProxy, domain, tenantPlan);
  }

  /**
   * Report a successful request
   */
  reportSuccess(proxyId: string, domain: string, latencyMs: number): void {
    this.healthTracker.recordSuccess(proxyId, domain, latencyMs);
    this.riskClassifier.recordSuccess(domain);
  }

  /**
   * Report a failed request
   */
  reportFailure(proxyId: string, domain: string, reason: FailureReason): void {
    this.healthTracker.recordFailure(proxyId, domain, reason);
    this.riskClassifier.recordFailure(domain, reason === 'blocked');
  }

  /**
   * Report detected bot protection
   */
  reportProtectionDetected(
    domain: string,
    headers: Record<string, string>,
    body?: string
  ): void {
    this.riskClassifier.detectProtectionFromResponse(domain, headers, body);
  }

  /**
   * Add a custom proxy pool
   */
  addProxyPool(config: ProxyPoolConfig): void {
    this.proxySelector.addPool(config);
  }

  /**
   * Remove a proxy pool
   */
  removeProxyPool(poolId: string): void {
    this.proxySelector.removePool(poolId);
  }

  /**
   * Get statistics for all proxy pools
   */
  getPoolStats(): ProxyPoolStats[] {
    const selectorStats = this.proxySelector.getPoolStats();
    const healthStats = this.healthTracker.getAggregateStats();

    return selectorStats.map((pool) => {
      const tierStats = healthStats.byTier.get(pool.tier);
      return {
        poolId: pool.poolId,
        tier: pool.tier,
        totalProxies: pool.totalProxies,
        healthyProxies: pool.healthyProxies,
        blockedProxies: pool.totalProxies - pool.healthyProxies,
        inCooldown: 0, // Would need per-pool tracking
        avgSuccessRate: tierStats?.avgSuccessRate || 1,
        avgLatencyMs: healthStats.avgLatencyMs,
      };
    });
  }

  /**
   * Get health information for a specific proxy
   */
  getProxyHealth(proxyId: string) {
    return this.healthTracker.getHealth(proxyId);
  }

  /**
   * Get risk assessment for a domain
   */
  getDomainRisk(domain: string): DomainRisk {
    return this.riskClassifier.classifyDomain(domain);
  }

  /**
   * Get recommended delay for a domain
   */
  getRecommendedDelay(domain: string): number {
    return this.riskClassifier.getRecommendedDelay(domain);
  }

  /**
   * Check if any proxies are configured
   */
  hasProxies(): boolean {
    return this.proxySelector.getPoolStats().some((p) => p.totalProxies > 0);
  }

  /**
   * Get available proxy tiers for a plan
   */
  getAvailableTiers(plan: Plan): ProxyTier[] {
    return this.proxySelector.getAvailableTiers(plan);
  }

  /**
   * Calculate cost for a request (for usage tracking)
   */
  calculateRequestCost(tier: ProxyTier): number {
    return PROXY_TIER_COSTS[tier];
  }

  /**
   * Force a proxy into cooldown
   */
  forceProxyCooldown(proxyId: string, reason: FailureReason, durationMinutes?: number): void {
    this.healthTracker.forceCooldown(proxyId, reason, durationMinutes);
  }

  /**
   * Clear cooldown for a proxy
   */
  clearProxyCooldown(proxyId: string): void {
    this.healthTracker.clearCooldown(proxyId);
  }

  /**
   * Clear blocked status for a domain on all proxies
   */
  clearDomainBlocks(domain: string): void {
    this.healthTracker.clearDomainBlocks(domain);
    this.riskClassifier.clearCache();
  }

  /**
   * Get all proxies blocked for a domain
   */
  getBlockedProxiesForDomain(domain: string) {
    return this.healthTracker.getBlockedProxiesForDomain(domain);
  }

  /**
   * Get all proxies currently in cooldown
   */
  getProxiesInCooldown() {
    return this.healthTracker.getProxiesInCooldown();
  }

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    resetHealthTracker();
    resetDomainRiskClassifier();
    resetProxySelector();
    resetBrightDataCounters();
    this.healthTracker = getHealthTracker();
    this.riskClassifier = getDomainRiskClassifier();
    this.proxySelector = getProxySelector();
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private loadConfigFromEnv(override?: ProxyConfig): ProxyConfig {
    // Parse integer with validation (returns default if invalid)
    const safeParseInt = (value: string | undefined, defaultVal: number): number => {
      if (!value) return defaultVal;
      const parsed = parseInt(value, 10);
      return !isNaN(parsed) && parsed > 0 ? parsed : defaultVal;
    };

    // Parse float with validation (returns default if invalid)
    const safeParseFloat = (value: string | undefined, defaultVal: number): number => {
      if (!value) return defaultVal;
      const parsed = parseFloat(value);
      return !isNaN(parsed) && parsed >= 0 && parsed <= 1 ? parsed : defaultVal;
    };

    return {
      datacenterUrls: override?.datacenterUrls || process.env.PROXY_DATACENTER_URLS,
      ispUrls: override?.ispUrls || process.env.PROXY_ISP_URLS,
      brightdataAuth: override?.brightdataAuth || process.env.BRIGHTDATA_AUTH,
      brightdataZone: override?.brightdataZone || process.env.BRIGHTDATA_ZONE || 'residential',
      brightdataCountry: override?.brightdataCountry || process.env.BRIGHTDATA_COUNTRY,
      healthWindow: override?.healthWindow || safeParseInt(process.env.PROXY_HEALTH_WINDOW, 100),
      cooldownMinutes: override?.cooldownMinutes || safeParseInt(process.env.PROXY_COOLDOWN_MINUTES, 60),
      blockThreshold: override?.blockThreshold || safeParseFloat(process.env.PROXY_BLOCK_THRESHOLD, 0.3),
      riskCacheMinutes: override?.riskCacheMinutes || safeParseInt(process.env.DOMAIN_RISK_CACHE_MINUTES, 60),
      enableRiskLearning: override?.enableRiskLearning ?? process.env.DOMAIN_RISK_LEARNING !== 'false',
    };
  }

  private parseProxyUrls(urlString: string, prefix: string): ProxyEndpoint[] {
    const urls = urlString.split(',').map((u) => u.trim()).filter(Boolean);
    return urls.map((url, index) => ({
      id: `${prefix}-${index}`,
      url,
    }));
  }

  private createBrightDataProxy(config: ProxyConfig): ProxyEndpoint {
    const [username, password] = (config.brightdataAuth || '').split(':');
    const zone = config.brightdataZone || 'residential';
    const country = config.brightdataCountry;

    let proxyUrl = `http://${username}-zone-${zone}`;
    if (country) {
      proxyUrl += `-country-${country}`;
    }
    proxyUrl += `:${password}@brd.superproxy.io:22225`;

    return {
      id: 'brightdata-residential-1',
      url: proxyUrl,
      country: country,
      isResidential: true,
    };
  }

  private createBrightDataUnlockerProxy(config: ProxyConfig): ProxyEndpoint {
    const [username, password] = (config.brightdataAuth || '').split(':');
    const country = config.brightdataCountry;

    let proxyUrl = `http://${username}-zone-unblocker`;
    if (country) {
      proxyUrl += `-country-${country}`;
    }
    proxyUrl += `:${password}@brd.superproxy.io:22225`;

    return {
      id: 'brightdata-unlocker-1',
      url: proxyUrl,
      country: country,
      isResidential: true,
    };
  }
}

// Singleton instance
let proxyManagerInstance: ProxyManager | null = null;

/**
 * Get the singleton proxy manager
 */
export function getProxyManager(): ProxyManager {
  if (!proxyManagerInstance) {
    proxyManagerInstance = new ProxyManager();
  }
  return proxyManagerInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetProxyManager(): void {
  if (proxyManagerInstance) {
    proxyManagerInstance.reset();
  }
  proxyManagerInstance = null;
}

/**
 * Check if proxies are available (for optional proxy usage)
 */
export function hasProxiesConfigured(): boolean {
  return !!(
    process.env.PROXY_DATACENTER_URLS ||
    process.env.PROXY_ISP_URLS ||
    process.env.BRIGHTDATA_AUTH
  );
}
