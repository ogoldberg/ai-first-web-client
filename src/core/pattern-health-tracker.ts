/**
 * Pattern Health Tracker (FEAT-002)
 *
 * Monitors learned pattern health over time and detects degradation.
 * Provides notifications when patterns start failing so users can
 * re-learn or investigate issues.
 *
 * Features:
 * - Success rate tracking
 * - Degradation detection
 * - Health status classification
 * - Historical trend analysis
 * - Actionable recommendations
 *
 * @example
 * ```typescript
 * const tracker = new PatternHealthTracker();
 *
 * // Record pattern usage
 * tracker.recordSuccess(domain, endpoint);
 * tracker.recordFailure(domain, endpoint, failureType);
 *
 * // Check health
 * const health = tracker.getHealth(domain, endpoint);
 * if (health.status === 'degraded') {
 *   console.log('Pattern degraded:', health.recommendedActions);
 * }
 *
 * // Get notifications for all degraded patterns
 * const notifications = tracker.getAllNotifications();
 * ```
 */

import type {
  PatternHealth,
  PatternHealthStatus,
  PatternHealthSnapshot,
  PatternHealthConfig,
  PatternHealthNotification,
  HealthCheckOptions,
  HealthCheckResult,
} from '../types/pattern-health.js';
import { logger } from '../utils/logger.js';

const log = logger.create('PatternHealthTracker');

/**
 * Default health configuration
 */
const DEFAULT_HEALTH_CONFIG: PatternHealthConfig = {
  degradationThreshold: 0.7,
  failingThreshold: 0.5,
  brokenThreshold: 0.2,
  consecutiveFailureThreshold: 3,
  minSampleSize: 5,
  maxHistoryLength: 30,
  historyRetentionDays: 30,
};

/**
 * Tracks pattern health and detects degradation.
 */
export class PatternHealthTracker {
  /** Health data for each pattern (keyed by domain:endpoint) */
  private healthData: Map<string, PatternHealth> = new Map();

  /** Recent notifications (for deduplication) */
  private recentNotifications: PatternHealthNotification[] = [];

  /** Configuration */
  private config: PatternHealthConfig;

  constructor(config: Partial<PatternHealthConfig> = {}) {
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
  }

  /**
   * Generate key for pattern lookup
   */
  private getKey(domain: string, endpoint: string): string {
    return `${domain}:${endpoint}`;
  }

  /**
   * Initialize health data for a pattern if not exists
   */
  private ensureHealthData(domain: string, endpoint: string): PatternHealth {
    const key = this.getKey(domain, endpoint);
    let health = this.healthData.get(key);

    if (!health) {
      health = {
        status: 'healthy',
        currentSuccessRate: 1.0,
        history: [],
        lastHealthCheck: Date.now(),
        consecutiveFailures: 0,
      };
      this.healthData.set(key, health);
    }

    return health;
  }

  /**
   * Calculate success rate from verification and failure counts
   */
  private calculateSuccessRate(verificationCount: number, failureCount: number): number {
    if (verificationCount === 0) return 1.0; // No data yet, assume healthy
    return Math.max(0, Math.min(1, (verificationCount - failureCount) / verificationCount));
  }

  /**
   * Determine health status based on success rate and consecutive failures
   */
  private determineStatus(
    successRate: number,
    consecutiveFailures: number,
    sampleSize: number
  ): PatternHealthStatus {
    // Not enough data to determine health
    if (sampleSize < this.config.minSampleSize) {
      return 'healthy'; // Benefit of the doubt
    }

    // Check consecutive failures first
    if (consecutiveFailures >= this.config.consecutiveFailureThreshold) {
      if (consecutiveFailures >= this.config.consecutiveFailureThreshold * 2) {
        return 'broken';
      }
      return 'failing';
    }

    // Check success rate
    if (successRate < this.config.brokenThreshold) {
      return 'broken';
    }
    if (successRate < this.config.failingThreshold) {
      return 'failing';
    }
    if (successRate < this.config.degradationThreshold) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get recommended actions based on health status
   */
  private getRecommendedActions(
    status: PatternHealthStatus,
    successRate: number,
    consecutiveFailures: number
  ): string[] {
    const actions: string[] = [];

    switch (status) {
      case 'broken':
        actions.push('Pattern is broken - use full browser rendering');
        actions.push('Investigate site changes or API modifications');
        actions.push('Consider re-learning pattern from scratch');
        if (consecutiveFailures > 0) {
          actions.push(`${consecutiveFailures} consecutive failures detected`);
        }
        break;

      case 'failing':
        actions.push('Pattern reliability declining - consider fallback tier');
        actions.push('Monitor closely or trigger re-learning');
        if (successRate < 0.3) {
          actions.push('Success rate very low - verify site is accessible');
        }
        break;

      case 'degraded':
        actions.push('Pattern showing signs of degradation');
        actions.push('Review recent site changes');
        if (consecutiveFailures > 0) {
          actions.push('Some consecutive failures detected');
        }
        break;

      case 'healthy':
        // No actions needed
        break;
    }

    return actions;
  }

  /**
   * Create a health snapshot for historical tracking
   */
  private createSnapshot(
    successRate: number,
    sampleSize: number,
    totalVerifications: number,
    totalFailures: number
  ): PatternHealthSnapshot {
    return {
      timestamp: Date.now(),
      successRate,
      sampleSize,
      totalVerifications,
      totalFailures,
    };
  }

  /**
   * Prune old snapshots based on retention policy
   */
  private pruneHistory(history: PatternHealthSnapshot[]): PatternHealthSnapshot[] {
    const cutoffTime = Date.now() - (this.config.historyRetentionDays * 24 * 60 * 60 * 1000);

    // Remove snapshots older than retention period
    let pruned = history.filter(snapshot => snapshot.timestamp > cutoffTime);

    // If still too many, keep only the most recent
    if (pruned.length > this.config.maxHistoryLength) {
      pruned = pruned.slice(-this.config.maxHistoryLength);
    }

    return pruned;
  }

  /**
   * Record a successful pattern use
   */
  recordSuccess(domain: string, endpoint: string, verificationCount: number, failureCount: number): void {
    const health = this.ensureHealthData(domain, endpoint);

    // Reset consecutive failures on success
    health.consecutiveFailures = 0;

    // Update success rate
    health.currentSuccessRate = this.calculateSuccessRate(verificationCount, failureCount);

    // Check for status change
    const previousStatus = health.status;
    health.status = this.determineStatus(
      health.currentSuccessRate,
      health.consecutiveFailures,
      verificationCount
    );

    // Update recommended actions
    health.recommendedActions = this.getRecommendedActions(
      health.status,
      health.currentSuccessRate,
      health.consecutiveFailures
    );

    // If status improved, clear degradation timestamp
    if (previousStatus !== 'healthy' && health.status === 'healthy') {
      health.degradationDetectedAt = undefined;
      log.info('Pattern health recovered', { domain, endpoint, previousStatus });
    }

    log.debug('Recorded pattern success', {
      domain,
      endpoint,
      successRate: health.currentSuccessRate.toFixed(3),
      status: health.status,
    });
  }

  /**
   * Record a pattern failure
   */
  recordFailure(
    domain: string,
    endpoint: string,
    verificationCount: number,
    failureCount: number,
    failureType?: string
  ): PatternHealthNotification | null {
    const health = this.ensureHealthData(domain, endpoint);

    // Increment consecutive failures
    health.consecutiveFailures++;

    // Update success rate
    const previousSuccessRate = health.currentSuccessRate;
    health.currentSuccessRate = this.calculateSuccessRate(verificationCount, failureCount);

    // Check for status change
    const previousStatus = health.status;
    health.status = this.determineStatus(
      health.currentSuccessRate,
      health.consecutiveFailures,
      verificationCount
    );

    // Update recommended actions
    health.recommendedActions = this.getRecommendedActions(
      health.status,
      health.currentSuccessRate,
      health.consecutiveFailures
    );

    // Set degradation timestamp if newly degraded
    if (previousStatus === 'healthy' && health.status !== 'healthy') {
      health.degradationDetectedAt = Date.now();
    }

    log.warn('Pattern failure recorded', {
      domain,
      endpoint,
      consecutiveFailures: health.consecutiveFailures,
      successRate: health.currentSuccessRate.toFixed(3),
      status: health.status,
      failureType,
    });

    // Create notification if status changed
    if (previousStatus !== health.status) {
      const notification: PatternHealthNotification = {
        domain,
        endpoint,
        previousStatus,
        newStatus: health.status,
        timestamp: Date.now(),
        successRate: health.currentSuccessRate,
        suggestedActions: health.recommendedActions || [],
        context: {
          consecutiveFailures: health.consecutiveFailures,
          lastFailureType: failureType,
        },
      };

      this.recentNotifications.push(notification);
      this.pruneNotifications();

      log.warn('Pattern health changed', {
        domain,
        endpoint,
        from: previousStatus,
        to: health.status,
        actions: notification.suggestedActions,
      });

      return notification;
    }

    return null;
  }

  /**
   * Perform health check for a pattern
   */
  checkHealth(
    domain: string,
    endpoint: string,
    verificationCount: number,
    failureCount: number,
    options: HealthCheckOptions = {}
  ): HealthCheckResult {
    const health = this.ensureHealthData(domain, endpoint);
    const previousHealth = { ...health };

    // Check if we should skip this check
    const minInterval = options.minCheckInterval || 60 * 60 * 1000; // 1 hour default
    const timeSinceLastCheck = Date.now() - health.lastHealthCheck;

    if (!options.force && timeSinceLastCheck < minInterval) {
      log.debug('Skipping health check (too recent)', {
        domain,
        endpoint,
        timeSinceLastCheck,
        minInterval,
      });

      return {
        domain,
        endpoint,
        previousHealth,
        currentHealth: health,
        statusChanged: false,
      };
    }

    // Update health data
    health.currentSuccessRate = this.calculateSuccessRate(verificationCount, failureCount);
    const previousStatus = health.status;
    health.status = this.determineStatus(
      health.currentSuccessRate,
      health.consecutiveFailures,
      verificationCount
    );
    health.recommendedActions = this.getRecommendedActions(
      health.status,
      health.currentSuccessRate,
      health.consecutiveFailures
    );
    health.lastHealthCheck = Date.now();

    // Record snapshot if requested
    if (options.recordSnapshot) {
      const snapshot = this.createSnapshot(
        health.currentSuccessRate,
        verificationCount,
        verificationCount,
        failureCount
      );
      health.history.push(snapshot);
      health.history = this.pruneHistory(health.history);
    }

    // Create notification if status changed
    let notification: PatternHealthNotification | undefined;
    if (previousStatus !== health.status) {
      notification = {
        domain,
        endpoint,
        previousStatus,
        newStatus: health.status,
        timestamp: Date.now(),
        successRate: health.currentSuccessRate,
        suggestedActions: health.recommendedActions || [],
      };

      this.recentNotifications.push(notification);
      this.pruneNotifications();
    }

    log.info('Health check completed', {
      domain,
      endpoint,
      status: health.status,
      successRate: health.currentSuccessRate.toFixed(3),
      statusChanged: previousStatus !== health.status,
    });

    return {
      domain,
      endpoint,
      previousHealth,
      currentHealth: health,
      statusChanged: previousStatus !== health.status,
      notification,
    };
  }

  /**
   * Get current health for a pattern
   */
  getHealth(domain: string, endpoint: string): PatternHealth | null {
    const key = this.getKey(domain, endpoint);
    return this.healthData.get(key) || null;
  }

  /**
   * Get all patterns with non-healthy status
   */
  getUnhealthyPatterns(): Array<{ domain: string; endpoint: string; health: PatternHealth }> {
    const unhealthy: Array<{ domain: string; endpoint: string; health: PatternHealth }> = [];

    for (const [key, health] of this.healthData.entries()) {
      if (health.status !== 'healthy') {
        const [domain, endpoint] = key.split(':', 2);
        unhealthy.push({ domain, endpoint, health });
      }
    }

    return unhealthy.sort((a, b) => {
      // Sort by severity: broken > failing > degraded
      const severityOrder = { broken: 3, failing: 2, degraded: 1, healthy: 0 };
      return severityOrder[b.health.status] - severityOrder[a.health.status];
    });
  }

  /**
   * Get all recent notifications
   */
  getAllNotifications(): PatternHealthNotification[] {
    return [...this.recentNotifications];
  }

  /**
   * Clear all notifications
   */
  clearNotifications(): void {
    this.recentNotifications = [];
  }

  /**
   * Prune old notifications (keep last 100, last 24 hours)
   */
  private pruneNotifications(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    // Remove old notifications
    this.recentNotifications = this.recentNotifications
      .filter(n => n.timestamp > cutoffTime)
      .slice(-100); // Keep last 100
  }

  /**
   * Export all health data for persistence
   */
  exportHealthData(): Record<string, PatternHealth> {
    const data: Record<string, PatternHealth> = {};
    for (const [key, health] of this.healthData.entries()) {
      data[key] = health;
    }
    return data;
  }

  /**
   * Import health data from persistence
   */
  importHealthData(data: Record<string, PatternHealth>): void {
    this.healthData.clear();
    for (const [key, health] of Object.entries(data)) {
      this.healthData.set(key, health);
    }

    log.info('Imported health data', { patternCount: this.healthData.size });
  }

  /**
   * Get health statistics summary
   */
  getHealthStats(): {
    total: number;
    healthy: number;
    degraded: number;
    failing: number;
    broken: number;
  } {
    const stats = {
      total: this.healthData.size,
      healthy: 0,
      degraded: 0,
      failing: 0,
      broken: 0,
    };

    for (const health of this.healthData.values()) {
      stats[health.status]++;
    }

    return stats;
  }
}
