/**
 * Proxy Health Tracker
 *
 * Monitors proxy health, tracks success/failure rates per domain,
 * and manages cooldown periods for blocked proxies.
 */

import type {
  ProxyTier,
  FailureReason,
  DomainStats,
  ProxyHealth,
  HealthTrackerConfig,
} from './proxy-types.js';

/** Default configuration values */
const DEFAULT_CONFIG: Required<HealthTrackerConfig> = {
  healthWindow: 100, // Track last 100 requests
  cooldownMinutes: 60, // 1 hour cooldown
  blockThreshold: 0.3, // 30% failure rate triggers cooldown
  consecutiveFailureThreshold: 3, // 3 consecutive failures = blocked
};

/** Request outcome for tracking */
interface RequestOutcome {
  timestamp: Date;
  success: boolean;
  latencyMs?: number;
  domain: string;
  failureReason?: FailureReason;
}

/**
 * Tracks health metrics for proxies
 */
export class ProxyHealthTracker {
  private config: Required<HealthTrackerConfig>;

  // Proxy health data: proxyId -> ProxyHealth
  private healthData: Map<string, ProxyHealth> = new Map();

  // Request history: proxyId -> RequestOutcome[]
  private requestHistory: Map<string, RequestOutcome[]> = new Map();

  // Sticky sessions: sessionId -> proxyId
  private stickySessions: Map<string, string> = new Map();

  constructor(config: HealthTrackerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize health tracking for a proxy
   */
  initializeProxy(proxyId: string, poolId: string, tier: ProxyTier): void {
    if (this.healthData.has(proxyId)) {
      return; // Already initialized
    }

    const health: ProxyHealth = {
      proxyId,
      poolId,
      tier,
      successRate: 1.0, // Start optimistic
      avgLatencyMs: 0,
      lastUsed: null,
      domainStats: new Map(),
      blockedDomains: [],
      cooldownUntil: null,
      cooldownReason: null,
      createdAt: new Date(),
      totalRequests: 0,
      totalFailures: 0,
      isHealthy: true,
      isInCooldown: false,
    };

    this.healthData.set(proxyId, health);
    this.requestHistory.set(proxyId, []);
  }

  /**
   * Record a successful request
   */
  recordSuccess(proxyId: string, domain: string, latencyMs: number): void {
    const health = this.healthData.get(proxyId);
    if (!health) {
      return;
    }

    // Record outcome
    this.addOutcome(proxyId, {
      timestamp: new Date(),
      success: true,
      latencyMs,
      domain,
    });

    // Update domain stats
    const domainStats = this.getOrCreateDomainStats(health, domain);
    domainStats.successCount++;
    domainStats.lastSuccess = new Date();
    domainStats.consecutiveFailures = 0;

    // If was blocked, check if should unblock
    if (domainStats.isBlocked && domainStats.consecutiveFailures === 0) {
      domainStats.isBlocked = false;
      domainStats.blockDetectedAt = null;
      health.blockedDomains = health.blockedDomains.filter((d) => d !== domain);
    }

    // Update overall stats
    health.lastUsed = new Date();
    health.totalRequests++;
    this.recalculateHealth(health);
  }

  /**
   * Record a failed request
   */
  recordFailure(proxyId: string, domain: string, reason: FailureReason): void {
    const health = this.healthData.get(proxyId);
    if (!health) {
      return;
    }

    // Record outcome
    this.addOutcome(proxyId, {
      timestamp: new Date(),
      success: false,
      domain,
      failureReason: reason,
    });

    // Update domain stats
    const domainStats = this.getOrCreateDomainStats(health, domain);
    domainStats.failureCount++;
    domainStats.lastFailure = new Date();
    domainStats.consecutiveFailures++;

    // Check if should mark as blocked for this domain
    if (
      domainStats.consecutiveFailures >= this.config.consecutiveFailureThreshold &&
      (reason === 'blocked' || reason === 'captcha' || reason === 'rate_limited')
    ) {
      domainStats.isBlocked = true;
      domainStats.blockDetectedAt = new Date();
      if (!health.blockedDomains.includes(domain)) {
        health.blockedDomains.push(domain);
      }
    }

    // Update overall stats
    health.lastUsed = new Date();
    health.totalRequests++;
    health.totalFailures++;
    this.recalculateHealth(health);

    // Check if should enter cooldown
    if (health.successRate < 1 - this.config.blockThreshold) {
      this.enterCooldown(health, reason);
    }
  }

  /**
   * Get health status for a proxy
   */
  getHealth(proxyId: string): ProxyHealth | null {
    const health = this.healthData.get(proxyId);
    if (!health) {
      return null;
    }

    // Update cooldown status
    this.updateCooldownStatus(health);

    return { ...health };
  }

  /**
   * Check if proxy is healthy for a specific domain
   */
  isHealthyForDomain(proxyId: string, domain: string): boolean {
    const health = this.healthData.get(proxyId);
    if (!health) {
      return false;
    }

    this.updateCooldownStatus(health);

    // Check overall health
    if (!health.isHealthy || health.isInCooldown) {
      return false;
    }

    // Check domain-specific blocking
    const domainStats = health.domainStats.get(domain);
    if (domainStats?.isBlocked) {
      return false;
    }

    return true;
  }

  /**
   * Get all healthy proxies for a domain
   */
  getHealthyProxiesForDomain(domain: string, tier?: ProxyTier): string[] {
    const healthy: string[] = [];

    for (const [proxyId, health] of this.healthData) {
      // Filter by tier if specified
      if (tier && health.tier !== tier) {
        continue;
      }

      if (this.isHealthyForDomain(proxyId, domain)) {
        healthy.push(proxyId);
      }
    }

    return healthy;
  }

  /**
   * Get proxies blocked for a specific domain
   */
  getBlockedProxiesForDomain(domain: string): ProxyHealth[] {
    const blocked: ProxyHealth[] = [];

    for (const health of this.healthData.values()) {
      const domainStats = health.domainStats.get(domain);
      if (domainStats?.isBlocked) {
        blocked.push({ ...health });
      }
    }

    return blocked;
  }

  /**
   * Get all proxies in cooldown
   */
  getProxiesInCooldown(): ProxyHealth[] {
    const inCooldown: ProxyHealth[] = [];

    for (const health of this.healthData.values()) {
      this.updateCooldownStatus(health);
      if (health.isInCooldown) {
        inCooldown.push({ ...health });
      }
    }

    return inCooldown;
  }

  /**
   * Force a proxy into cooldown
   */
  forceCooldown(proxyId: string, reason: FailureReason, durationMinutes?: number): void {
    const health = this.healthData.get(proxyId);
    if (!health) {
      return;
    }

    this.enterCooldown(health, reason, durationMinutes);
  }

  /**
   * Clear cooldown for a proxy
   */
  clearCooldown(proxyId: string): void {
    const health = this.healthData.get(proxyId);
    if (!health) {
      return;
    }

    health.cooldownUntil = null;
    health.cooldownReason = null;
    health.isInCooldown = false;
    health.isHealthy = health.successRate >= 1 - this.config.blockThreshold;
  }

  /**
   * Clear blocked status for a domain on all proxies
   */
  clearDomainBlocks(domain: string): void {
    for (const health of this.healthData.values()) {
      const domainStats = health.domainStats.get(domain);
      if (domainStats) {
        domainStats.isBlocked = false;
        domainStats.blockDetectedAt = null;
        domainStats.consecutiveFailures = 0;
      }
      health.blockedDomains = health.blockedDomains.filter((d) => d !== domain);
    }
  }

  /**
   * Get or set sticky session proxy
   */
  getStickyProxy(sessionId: string): string | null {
    return this.stickySessions.get(sessionId) || null;
  }

  setStickyProxy(sessionId: string, proxyId: string): void {
    this.stickySessions.set(sessionId, proxyId);
  }

  clearStickyProxy(sessionId: string): void {
    this.stickySessions.delete(sessionId);
  }

  /**
   * Get aggregate stats for all proxies
   */
  getAggregateStats(): {
    totalProxies: number;
    healthyProxies: number;
    inCooldown: number;
    avgSuccessRate: number;
    avgLatencyMs: number;
    byTier: Map<ProxyTier, { count: number; healthy: number; avgSuccessRate: number }>;
  } {
    let totalProxies = 0;
    let healthyProxies = 0;
    let inCooldown = 0;
    let totalSuccessRate = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    const byTier = new Map<ProxyTier, { count: number; healthy: number; avgSuccessRate: number }>();

    for (const health of this.healthData.values()) {
      this.updateCooldownStatus(health);
      totalProxies++;
      totalSuccessRate += health.successRate;

      if (health.avgLatencyMs > 0) {
        totalLatency += health.avgLatencyMs;
        latencyCount++;
      }

      if (health.isHealthy && !health.isInCooldown) {
        healthyProxies++;
      }

      if (health.isInCooldown) {
        inCooldown++;
      }

      // Aggregate by tier
      const tierStats = byTier.get(health.tier) || { count: 0, healthy: 0, avgSuccessRate: 0 };
      tierStats.count++;
      tierStats.avgSuccessRate =
        (tierStats.avgSuccessRate * (tierStats.count - 1) + health.successRate) / tierStats.count;
      if (health.isHealthy && !health.isInCooldown) {
        tierStats.healthy++;
      }
      byTier.set(health.tier, tierStats);
    }

    return {
      totalProxies,
      healthyProxies,
      inCooldown,
      avgSuccessRate: totalProxies > 0 ? totalSuccessRate / totalProxies : 0,
      avgLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
      byTier,
    };
  }

  /**
   * Reset all health data (for testing)
   */
  reset(): void {
    this.healthData.clear();
    this.requestHistory.clear();
    this.stickySessions.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private addOutcome(proxyId: string, outcome: RequestOutcome): void {
    const history = this.requestHistory.get(proxyId);
    if (!history) {
      return;
    }

    history.push(outcome);

    // Keep only the last N requests
    while (history.length > this.config.healthWindow) {
      history.shift();
    }
  }

  private getOrCreateDomainStats(health: ProxyHealth, domain: string): DomainStats {
    let stats = health.domainStats.get(domain);
    if (!stats) {
      stats = {
        domain,
        successCount: 0,
        failureCount: 0,
        lastSuccess: null,
        lastFailure: null,
        isBlocked: false,
        blockDetectedAt: null,
        consecutiveFailures: 0,
      };
      health.domainStats.set(domain, stats);
    }
    return stats;
  }

  private recalculateHealth(health: ProxyHealth): void {
    const history = this.requestHistory.get(health.proxyId);
    if (!history || history.length === 0) {
      health.successRate = 1.0;
      health.avgLatencyMs = 0;
      health.isHealthy = true;
      return;
    }

    // Calculate success rate
    const successCount = history.filter((o) => o.success).length;
    health.successRate = successCount / history.length;

    // Calculate average latency (only from successful requests)
    const latencies = history.filter((o) => o.success && o.latencyMs).map((o) => o.latencyMs!);
    health.avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    // Update health status
    health.isHealthy = health.successRate >= 1 - this.config.blockThreshold && !health.isInCooldown;
  }

  private enterCooldown(health: ProxyHealth, reason: FailureReason, durationMinutes?: number): void {
    const duration = durationMinutes ?? this.config.cooldownMinutes;
    health.cooldownUntil = new Date(Date.now() + duration * 60 * 1000);
    health.cooldownReason = reason;
    health.isInCooldown = true;
    health.isHealthy = false;
  }

  private updateCooldownStatus(health: ProxyHealth): void {
    if (health.cooldownUntil && new Date() >= health.cooldownUntil) {
      // Cooldown expired
      health.cooldownUntil = null;
      health.cooldownReason = null;
      health.isInCooldown = false;
      health.isHealthy = health.successRate >= 1 - this.config.blockThreshold;
    } else if (health.cooldownUntil) {
      health.isInCooldown = true;
    }
  }
}

// Singleton instance
let healthTrackerInstance: ProxyHealthTracker | null = null;

/**
 * Get the singleton health tracker instance
 */
export function getHealthTracker(config?: HealthTrackerConfig): ProxyHealthTracker {
  if (!healthTrackerInstance) {
    healthTrackerInstance = new ProxyHealthTracker(config);
  }
  return healthTrackerInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetHealthTracker(): void {
  if (healthTrackerInstance) {
    healthTrackerInstance.reset();
  }
  healthTrackerInstance = null;
}
