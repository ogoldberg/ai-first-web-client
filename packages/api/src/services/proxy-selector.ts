/**
 * Proxy Selector
 *
 * Selects the optimal proxy based on domain risk, tenant plan,
 * and proxy health metrics.
 */

import type { Plan } from '../middleware/types.js';
import type {
  ProxyTier,
  ProxyInstance,
  ProxySelectionRequest,
  ProxySelectionResult,
  ProxyPoolConfig,
  ProxyEndpoint,
  ProxyError,
} from './proxy-types.js';
import {
  PROXY_TIER_ORDER,
  PLAN_PROXY_ACCESS,
  isTierAvailableForPlan,
  getNextTier,
  parseProxyUrl,
} from './proxy-types.js';
import { ProxyHealthTracker, getHealthTracker } from './proxy-health.js';
import { DomainRiskClassifier, getDomainRiskClassifier } from './domain-risk.js';

/**
 * Concrete implementation of ProxyInstance
 */
class ProxyInstanceImpl implements ProxyInstance {
  constructor(
    public readonly id: string,
    public readonly poolId: string,
    public readonly tier: ProxyTier,
    public readonly endpoint: ProxyEndpoint
  ) {}

  getProxyUrl(): string {
    return this.endpoint.url;
  }

  getPlaywrightProxy(): { server: string; username?: string; password?: string } {
    const parsed = parseProxyUrl(this.endpoint.url);
    return {
      server: `${parsed.protocol}://${parsed.host}:${parsed.port}`,
      username: parsed.username,
      password: parsed.password,
    };
  }
}

/**
 * Selection strategy for choosing proxies from a pool
 */
type SelectionStrategy = 'round-robin' | 'random' | 'least-used' | 'healthiest';

/**
 * Selects optimal proxies based on risk and availability
 */
export class ProxySelector {
  private healthTracker: ProxyHealthTracker;
  private riskClassifier: DomainRiskClassifier;

  // Proxy pools: tier -> ProxyPoolConfig[]
  private pools: Map<ProxyTier, ProxyPoolConfig[]> = new Map();

  // All proxies: proxyId -> ProxyInstance
  private proxies: Map<string, ProxyInstance> = new Map();

  // Round-robin counters: poolId -> index
  private roundRobinCounters: Map<string, number> = new Map();

  // Usage counters: proxyId -> count (for least-used strategy)
  private usageCounters: Map<string, number> = new Map();

  constructor(
    healthTracker?: ProxyHealthTracker,
    riskClassifier?: DomainRiskClassifier
  ) {
    this.healthTracker = healthTracker || getHealthTracker();
    this.riskClassifier = riskClassifier || getDomainRiskClassifier();
  }

  /**
   * Add a proxy pool
   */
  addPool(config: ProxyPoolConfig): void {
    // Get or create tier pools
    const tierPools = this.pools.get(config.tier) || [];
    tierPools.push(config);
    this.pools.set(config.tier, tierPools);

    // Register each proxy
    for (const endpoint of config.proxies) {
      const instance = new ProxyInstanceImpl(endpoint.id, config.id, config.tier, endpoint);
      this.proxies.set(endpoint.id, instance);
      this.healthTracker.initializeProxy(endpoint.id, config.id, config.tier);
      this.usageCounters.set(endpoint.id, 0);
    }

    // Initialize round-robin counter
    this.roundRobinCounters.set(config.id, 0);
  }

  /**
   * Remove a proxy pool
   */
  removePool(poolId: string): void {
    for (const [tier, pools] of this.pools) {
      const filtered = pools.filter((p) => p.id !== poolId);
      if (filtered.length !== pools.length) {
        this.pools.set(tier, filtered);

        // Remove proxies from this pool
        for (const pool of pools) {
          if (pool.id === poolId) {
            for (const endpoint of pool.proxies) {
              this.proxies.delete(endpoint.id);
              this.usageCounters.delete(endpoint.id);
            }
          }
        }
      }
    }
    this.roundRobinCounters.delete(poolId);
  }

  /**
   * Select the best proxy for a request
   */
  async selectProxy(request: ProxySelectionRequest): Promise<ProxySelectionResult> {
    const domain = this.extractDomain(request.domain);

    // Get risk assessment
    const riskAssessment = this.riskClassifier.classifyDomain(domain);

    // Check for sticky session
    if (request.stickySessionId) {
      const stickyProxyId = this.healthTracker.getStickyProxy(request.stickySessionId);
      if (stickyProxyId) {
        const stickyProxy = this.proxies.get(stickyProxyId);
        if (stickyProxy && this.healthTracker.isHealthyForDomain(stickyProxyId, domain)) {
          return {
            proxy: stickyProxy,
            riskAssessment,
            selectionReason: 'sticky_session',
            fallbacksAvailable: this.countFallbacks(stickyProxy.tier, domain, request.tenantPlan),
          };
        }
      }
    }

    // Determine target tier
    let targetTier = request.preferredTier || riskAssessment.recommendedProxyTier;

    // Ensure tier is available for plan
    if (!isTierAvailableForPlan(targetTier, request.tenantPlan)) {
      // Fall back to highest available tier for plan
      const availableTiers = PLAN_PROXY_ACCESS[request.tenantPlan];
      targetTier = availableTiers[availableTiers.length - 1];
    }

    // Try to find a proxy starting from target tier
    const result = await this.findProxyFromTier(
      targetTier,
      domain,
      request.tenantPlan,
      request.preferredCountry,
      request.requireFresh
    );

    if (result) {
      // Record sticky session if requested
      if (request.stickySessionId) {
        this.healthTracker.setStickyProxy(request.stickySessionId, result.proxy.id);
      }

      // Increment usage counter
      this.usageCounters.set(result.proxy.id, (this.usageCounters.get(result.proxy.id) || 0) + 1);

      return {
        ...result,
        riskAssessment,
      };
    }

    // No proxy available - throw error
    const error: ProxyError = {
      code: this.proxies.size === 0 ? 'NO_PROXY_CONFIGURED' : 'PROXY_EXHAUSTED',
      message: `No healthy proxy available for ${domain}`,
      domain,
      attemptedTiers: this.getAttemptedTiers(targetTier, request.tenantPlan),
      recommendation: this.getErrorRecommendation(targetTier, request.tenantPlan, riskAssessment),
    };

    throw error;
  }

  /**
   * Select a fallback proxy after failure
   */
  async selectFallback(
    originalProxy: ProxyInstance,
    domain: string,
    tenantPlan: Plan
  ): Promise<ProxyInstance | null> {
    // Try same tier first, excluding the failed proxy
    const sameTierProxy = await this.findProxyInTier(
      originalProxy.tier,
      domain,
      undefined,
      false,
      [originalProxy.id]
    );

    if (sameTierProxy) {
      return sameTierProxy.proxy;
    }

    // Try next tier
    const nextTier = getNextTier(originalProxy.tier);
    if (nextTier && isTierAvailableForPlan(nextTier, tenantPlan)) {
      const nextTierProxy = await this.findProxyInTier(nextTier, domain);
      if (nextTierProxy) {
        return nextTierProxy.proxy;
      }
    }

    return null;
  }

  /**
   * Get available tiers for a plan
   */
  getAvailableTiers(plan: Plan): ProxyTier[] {
    return PLAN_PROXY_ACCESS[plan].filter((tier) => this.hasTierProxies(tier));
  }

  /**
   * Check if a tier has any configured proxies
   */
  hasTierProxies(tier: ProxyTier): boolean {
    const pools = this.pools.get(tier) || [];
    return pools.some((pool) => pool.enabled !== false && pool.proxies.length > 0);
  }

  /**
   * Get count of healthy proxies for a tier
   */
  getHealthyProxyCount(tier: ProxyTier, domain?: string): number {
    const pools = this.pools.get(tier) || [];
    let count = 0;

    for (const pool of pools) {
      if (pool.enabled === false) continue;

      for (const endpoint of pool.proxies) {
        if (domain) {
          if (this.healthTracker.isHealthyForDomain(endpoint.id, domain)) {
            count++;
          }
        } else {
          const health = this.healthTracker.getHealth(endpoint.id);
          if (health?.isHealthy && !health.isInCooldown) {
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Get all pool statistics
   */
  getPoolStats(): Array<{
    poolId: string;
    tier: ProxyTier;
    totalProxies: number;
    healthyProxies: number;
    enabled: boolean;
  }> {
    const stats: Array<{
      poolId: string;
      tier: ProxyTier;
      totalProxies: number;
      healthyProxies: number;
      enabled: boolean;
    }> = [];

    for (const [tier, pools] of this.pools) {
      for (const pool of pools) {
        let healthyCount = 0;
        for (const endpoint of pool.proxies) {
          const health = this.healthTracker.getHealth(endpoint.id);
          if (health?.isHealthy && !health.isInCooldown) {
            healthyCount++;
          }
        }

        stats.push({
          poolId: pool.id,
          tier,
          totalProxies: pool.proxies.length,
          healthyProxies: healthyCount,
          enabled: pool.enabled !== false,
        });
      }
    }

    return stats;
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.pools.clear();
    this.proxies.clear();
    this.roundRobinCounters.clear();
    this.usageCounters.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private extractDomain(input: string): string {
    try {
      // Check if it's a URL
      if (input.startsWith('http://') || input.startsWith('https://')) {
        return new URL(input).hostname.replace(/^www\./, '');
      }
      return input.replace(/^www\./, '');
    } catch {
      return input;
    }
  }

  private async findProxyFromTier(
    startTier: ProxyTier,
    domain: string,
    plan: Plan,
    preferredCountry?: string,
    requireFresh?: boolean
  ): Promise<{ proxy: ProxyInstance; selectionReason: string; fallbacksAvailable: number } | null> {
    // Start from the target tier and escalate if needed
    const tierIndex = PROXY_TIER_ORDER.indexOf(startTier);

    for (let i = tierIndex; i < PROXY_TIER_ORDER.length; i++) {
      const tier = PROXY_TIER_ORDER[i];

      // Check if tier is available for plan
      if (!isTierAvailableForPlan(tier, plan)) {
        continue;
      }

      const result = await this.findProxyInTier(tier, domain, preferredCountry, requireFresh);
      if (result) {
        return {
          proxy: result.proxy,
          selectionReason: tier === startTier ? 'optimal_tier' : `escalated_from_${startTier}`,
          fallbacksAvailable: this.countFallbacks(tier, domain, plan),
        };
      }
    }

    return null;
  }

  private async findProxyInTier(
    tier: ProxyTier,
    domain: string,
    preferredCountry?: string,
    requireFresh?: boolean,
    excludeIds: string[] = []
  ): Promise<{ proxy: ProxyInstance; poolId: string } | null> {
    const pools = this.pools.get(tier) || [];

    for (const pool of pools) {
      if (pool.enabled === false) continue;

      const proxy = this.selectFromPool(pool, domain, preferredCountry, requireFresh, excludeIds);
      if (proxy) {
        return { proxy, poolId: pool.id };
      }
    }

    return null;
  }

  private selectFromPool(
    pool: ProxyPoolConfig,
    domain: string,
    preferredCountry?: string,
    requireFresh?: boolean,
    excludeIds: string[] = []
  ): ProxyInstance | null {
    // Get healthy proxies
    let candidates = pool.proxies.filter((endpoint) => {
      if (excludeIds.includes(endpoint.id)) return false;
      return this.healthTracker.isHealthyForDomain(endpoint.id, domain);
    });

    if (candidates.length === 0) {
      return null;
    }

    // Filter by country if requested
    if (preferredCountry) {
      const countryFiltered = candidates.filter(
        (e) => e.country?.toLowerCase() === preferredCountry.toLowerCase()
      );
      if (countryFiltered.length > 0) {
        candidates = countryFiltered;
      }
    }

    // Apply selection strategy
    const strategy = pool.rotationStrategy || 'round-robin';
    const selected = this.applyStrategy(strategy, pool.id, candidates);

    if (selected) {
      return this.proxies.get(selected.id) || null;
    }

    return null;
  }

  private applyStrategy(
    strategy: SelectionStrategy,
    poolId: string,
    candidates: ProxyEndpoint[]
  ): ProxyEndpoint | null {
    if (candidates.length === 0) return null;

    switch (strategy) {
      case 'random':
        return candidates[Math.floor(Math.random() * candidates.length)];

      case 'least-used': {
        let minUsage = Infinity;
        let selected = candidates[0];
        for (const candidate of candidates) {
          const usage = this.usageCounters.get(candidate.id) || 0;
          if (usage < minUsage) {
            minUsage = usage;
            selected = candidate;
          }
        }
        return selected;
      }

      case 'healthiest': {
        let bestHealth = -1;
        let selected = candidates[0];
        for (const candidate of candidates) {
          const health = this.healthTracker.getHealth(candidate.id);
          const score = health ? health.successRate : 0;
          if (score > bestHealth) {
            bestHealth = score;
            selected = candidate;
          }
        }
        return selected;
      }

      case 'round-robin':
      default: {
        const counter = this.roundRobinCounters.get(poolId) || 0;
        const selected = candidates[counter % candidates.length];
        this.roundRobinCounters.set(poolId, counter + 1);
        return selected;
      }
    }
  }

  private countFallbacks(currentTier: ProxyTier, domain: string, plan: Plan): number {
    let count = 0;
    const currentIndex = PROXY_TIER_ORDER.indexOf(currentTier);

    for (let i = currentIndex; i < PROXY_TIER_ORDER.length; i++) {
      const tier = PROXY_TIER_ORDER[i];
      if (isTierAvailableForPlan(tier, plan)) {
        count += this.getHealthyProxyCount(tier, domain);
      }
    }

    // Subtract 1 for the current selection
    return Math.max(0, count - 1);
  }

  private getAttemptedTiers(startTier: ProxyTier, plan: Plan): ProxyTier[] {
    const attempted: ProxyTier[] = [];
    const startIndex = PROXY_TIER_ORDER.indexOf(startTier);

    for (let i = startIndex; i < PROXY_TIER_ORDER.length; i++) {
      const tier = PROXY_TIER_ORDER[i];
      if (isTierAvailableForPlan(tier, plan)) {
        attempted.push(tier);
      }
    }

    return attempted;
  }

  private getErrorRecommendation(
    targetTier: ProxyTier,
    plan: Plan,
    riskAssessment: { riskLevel: string; recommendedProxyTier: ProxyTier }
  ): ProxyError['recommendation'] {
    const recommendation: ProxyError['recommendation'] = {};

    // Check if plan upgrade would help
    if (riskAssessment.recommendedProxyTier !== targetTier) {
      const neededTier = riskAssessment.recommendedProxyTier;
      if (!isTierAvailableForPlan(neededTier, plan)) {
        recommendation.upgradePlan = true;
        recommendation.alternativeApproach = `Upgrade to access ${neededTier} proxies for this domain`;
      }
    }

    // Suggest retry after cooldown
    recommendation.retryAfterMs = 60000; // 1 minute

    return recommendation;
  }
}

// Singleton instance
let selectorInstance: ProxySelector | null = null;

/**
 * Get the singleton proxy selector
 */
export function getProxySelector(): ProxySelector {
  if (!selectorInstance) {
    selectorInstance = new ProxySelector();
  }
  return selectorInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetProxySelector(): void {
  if (selectorInstance) {
    selectorInstance.reset();
  }
  selectorInstance = null;
}
