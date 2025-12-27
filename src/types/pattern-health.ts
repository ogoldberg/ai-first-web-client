/**
 * Pattern Health Monitoring Types (FEAT-002)
 *
 * Tracks the health of learned patterns over time and detects degradation.
 */

/**
 * Health status of a learned pattern.
 */
export type PatternHealthStatus = 'healthy' | 'degraded' | 'failing' | 'broken';

/**
 * Snapshot of pattern health at a specific time.
 */
export interface PatternHealthSnapshot {
  /** Timestamp of this snapshot */
  timestamp: number;

  /** Success rate at this point (0-1) */
  successRate: number;

  /** Number of attempts in this sample */
  sampleSize: number;

  /** Total verification count at this point */
  totalVerifications: number;

  /** Total failure count at this point */
  totalFailures: number;
}

/**
 * Pattern health metadata tracked over time.
 */
export interface PatternHealth {
  /** Current health status */
  status: PatternHealthStatus;

  /** Current success rate (0-1) */
  currentSuccessRate: number;

  /** Historical health snapshots (last 30 days) */
  history: PatternHealthSnapshot[];

  /** Timestamp of last health check */
  lastHealthCheck: number;

  /** Timestamp when degradation was first detected (if degraded) */
  degradationDetectedAt?: number;

  /** Number of consecutive failures (resets on success) */
  consecutiveFailures: number;

  /** Recommended actions based on health status */
  recommendedActions?: string[];
}

/**
 * Configuration for pattern health thresholds.
 */
export interface PatternHealthConfig {
  /** Success rate below this is considered degraded (default: 0.7) */
  degradationThreshold: number;

  /** Success rate below this is considered failing (default: 0.5) */
  failingThreshold: number;

  /** Success rate below this is considered broken (default: 0.2) */
  brokenThreshold: number;

  /** Consecutive failures before marking degraded (default: 3) */
  consecutiveFailureThreshold: number;

  /** Minimum sample size before evaluating health (default: 5) */
  minSampleSize: number;

  /** Maximum history snapshots to keep (default: 30) */
  maxHistoryLength: number;

  /** Days of history to keep (default: 30) */
  historyRetentionDays: number;
}

/**
 * Notification about pattern health change.
 */
export interface PatternHealthNotification {
  /** Pattern that changed */
  domain: string;

  /** Endpoint of the pattern */
  endpoint: string;

  /** Previous health status */
  previousStatus: PatternHealthStatus;

  /** New health status */
  newStatus: PatternHealthStatus;

  /** Timestamp of the change */
  timestamp: number;

  /** Current success rate */
  successRate: number;

  /** Suggested actions */
  suggestedActions: string[];

  /** Additional context */
  context?: {
    consecutiveFailures?: number;
    lastFailureType?: string;
    recentFailures?: number;
  };
}

/**
 * Options for checking pattern health.
 */
export interface HealthCheckOptions {
  /** Force health check even if recently checked */
  force?: boolean;

  /** Minimum time since last check (ms, default: 1 hour) */
  minCheckInterval?: number;

  /** Whether to record snapshot in history */
  recordSnapshot?: boolean;
}

/**
 * Result of a pattern health check.
 */
export interface HealthCheckResult {
  /** Domain of the pattern */
  domain: string;

  /** Endpoint of the pattern */
  endpoint: string;

  /** Health before check */
  previousHealth: PatternHealth;

  /** Health after check */
  currentHealth: PatternHealth;

  /** Whether status changed */
  statusChanged: boolean;

  /** Notification if status changed */
  notification?: PatternHealthNotification;
}
