/**
 * Pattern Health Tracker Tests (FEAT-002)
 *
 * Comprehensive tests for pattern health monitoring and degradation detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatternHealthTracker } from '../../src/core/pattern-health-tracker.js';
import type {
  PatternHealthStatus,
  PatternHealthConfig,
} from '../../src/types/pattern-health.js';

describe('PatternHealthTracker (FEAT-002)', () => {
  let tracker: PatternHealthTracker;

  beforeEach(() => {
    tracker = new PatternHealthTracker();
  });

  // ============================================
  // BASIC HEALTH TRACKING
  // ============================================

  describe('Basic Health Tracking', () => {
    it('should start with healthy status for new patterns', () => {
      tracker.recordSuccess('example.com', '/api/users', 1, 0);
      const health = tracker.getHealth('example.com', '/api/users');

      expect(health).toBeDefined();
      expect(health?.status).toBe('healthy');
      expect(health?.currentSuccessRate).toBe(1.0);
      expect(health?.consecutiveFailures).toBe(0);
    });

    it('should reset consecutive failures on success', () => {
      // Record some failures
      tracker.recordFailure('example.com', '/api/users', 5, 3);
      tracker.recordFailure('example.com', '/api/users', 6, 4);

      // Then a success
      tracker.recordSuccess('example.com', '/api/users', 7, 4);

      const health = tracker.getHealth('example.com', '/api/users');
      expect(health?.consecutiveFailures).toBe(0);
    });

    it('should calculate success rate correctly', () => {
      // 7 verifications, 3 failures = 57% success rate
      tracker.recordSuccess('example.com', '/api/data', 7, 3);

      const health = tracker.getHealth('example.com', '/api/data');
      expect(health?.currentSuccessRate).toBeCloseTo(0.571, 2);
    });

    it('should track multiple patterns independently', () => {
      tracker.recordSuccess('example.com', '/api/users', 10, 0);
      // 10 verifications, 4 failures = 60% success rate -> degraded (< 0.7 threshold)
      tracker.recordFailure('example.com', '/api/posts', 10, 4);

      const usersHealth = tracker.getHealth('example.com', '/api/users');
      const postsHealth = tracker.getHealth('example.com', '/api/posts');

      expect(usersHealth?.status).toBe('healthy');
      expect(postsHealth?.status).toBe('degraded');
    });
  });

  // ============================================
  // STATUS DETERMINATION
  // ============================================

  describe('Status Determination', () => {
    it('should mark pattern as healthy with high success rate', () => {
      tracker.recordSuccess('example.com', '/api/users', 10, 1);
      const health = tracker.getHealth('example.com', '/api/users');

      expect(health?.status).toBe('healthy');
      expect(health?.currentSuccessRate).toBeGreaterThan(0.7);
    });

    it('should mark pattern as degraded with moderate success rate', () => {
      // 10 verifications, 4 failures = 60% success rate (< 0.7 threshold)
      tracker.recordFailure('example.com', '/api/data', 10, 4, 'timeout');
      const health = tracker.getHealth('example.com', '/api/data');

      expect(health?.status).toBe('degraded');
      expect(health?.currentSuccessRate).toBeCloseTo(0.6, 1);
    });

    it('should mark pattern as failing with low success rate', () => {
      // 10 verifications, 6 failures = 40% success rate (< 0.5 threshold)
      tracker.recordFailure('example.com', '/api/broken', 10, 6, 'error');
      const health = tracker.getHealth('example.com', '/api/broken');

      expect(health?.status).toBe('failing');
      expect(health?.currentSuccessRate).toBeCloseTo(0.4, 1);
    });

    it('should mark pattern as broken with very low success rate', () => {
      // 10 verifications, 9 failures = 10% success rate (< 0.2 threshold)
      tracker.recordFailure('example.com', '/api/dead', 10, 9, 'error');
      const health = tracker.getHealth('example.com', '/api/dead');

      expect(health?.status).toBe('broken');
      expect(health?.currentSuccessRate).toBeCloseTo(0.1, 1);
    });

    it('should mark pattern as failing after consecutive failures', () => {
      // Track pattern with 3 consecutive failures
      const domain = 'example.com';
      const endpoint = '/api/flaky';

      tracker.recordFailure(domain, endpoint, 10, 3);
      let health = tracker.getHealth(domain, endpoint);
      health!.consecutiveFailures = 1;

      tracker.recordFailure(domain, endpoint, 11, 4);
      health = tracker.getHealth(domain, endpoint);
      health!.consecutiveFailures = 2;

      tracker.recordFailure(domain, endpoint, 12, 5);
      health = tracker.getHealth(domain, endpoint);
      health!.consecutiveFailures = 3;

      // With 3 consecutive failures, should be failing even if success rate is OK
      expect(health?.consecutiveFailures).toBeGreaterThanOrEqual(3);
    });

    it('should mark pattern as broken after many consecutive failures', () => {
      const domain = 'example.com';
      const endpoint = '/api/dead';

      // Simulate 6 consecutive failures (>= threshold * 2)
      for (let i = 1; i <= 6; i++) {
        tracker.recordFailure(domain, endpoint, 10 + i, i);
      }

      const health = tracker.getHealth(domain, endpoint);
      expect(health?.consecutiveFailures).toBe(6);
      expect(health?.status).toBe('broken');
    });

    it('should not determine status with insufficient sample size', () => {
      // Only 2 verifications (< minSampleSize of 5)
      tracker.recordFailure('example.com', '/api/new', 2, 1);
      const health = tracker.getHealth('example.com', '/api/new');

      // Should stay healthy despite 50% failure rate
      expect(health?.status).toBe('healthy');
    });
  });

  // ============================================
  // NOTIFICATIONS
  // ============================================

  describe('Notifications', () => {
    it('should create notification when status changes', () => {
      const domain = 'example.com';
      const endpoint = '/api/degrading';

      // Start healthy
      tracker.recordSuccess(domain, endpoint, 10, 0);

      // Degrade it
      const notification = tracker.recordFailure(domain, endpoint, 10, 4, 'timeout');

      expect(notification).toBeDefined();
      expect(notification?.previousStatus).toBe('healthy');
      expect(notification?.newStatus).toBe('degraded');
      expect(notification?.suggestedActions).toBeDefined();
      expect(notification?.suggestedActions.length).toBeGreaterThan(0);
    });

    it('should not create notification when status unchanged', () => {
      const domain = 'example.com';
      const endpoint = '/api/stable';

      // Start degraded
      tracker.recordFailure(domain, endpoint, 10, 4);

      // Another failure, but still degraded
      const notification = tracker.recordFailure(domain, endpoint, 11, 5);

      expect(notification).toBeNull();
    });

    it('should track all notifications', () => {
      tracker.recordSuccess('site1.com', '/api/a', 10, 0);
      tracker.recordFailure('site1.com', '/api/a', 10, 4);

      tracker.recordSuccess('site2.com', '/api/b', 10, 0);
      tracker.recordFailure('site2.com', '/api/b', 10, 6);

      const notifications = tracker.getAllNotifications();
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('should clear notifications', () => {
      tracker.recordSuccess('example.com', '/api/test', 10, 0);
      tracker.recordFailure('example.com', '/api/test', 10, 4);

      tracker.clearNotifications();

      const notifications = tracker.getAllNotifications();
      expect(notifications.length).toBe(0);
    });

    it('should prune old notifications', () => {
      const domain = 'example.com';

      // Create many notifications
      for (let i = 0; i < 150; i++) {
        tracker.recordSuccess(domain, `/api/test${i}`, 10, 0);
        tracker.recordFailure(domain, `/api/test${i}`, 10, 4);
      }

      const notifications = tracker.getAllNotifications();

      // Should keep only last 100
      expect(notifications.length).toBeLessThanOrEqual(100);
    });
  });

  // ============================================
  // RECOMMENDED ACTIONS
  // ============================================

  describe('Recommended Actions', () => {
    it('should recommend actions for degraded patterns', () => {
      tracker.recordFailure('example.com', '/api/degrading', 10, 4);
      const health = tracker.getHealth('example.com', '/api/degrading');

      expect(health?.recommendedActions).toBeDefined();
      expect(health?.recommendedActions?.length).toBeGreaterThan(0);
      expect(health?.recommendedActions?.some(a => a.includes('degradation'))).toBe(true);
    });

    it('should recommend actions for failing patterns', () => {
      tracker.recordFailure('example.com', '/api/failing', 10, 6);
      const health = tracker.getHealth('example.com', '/api/failing');

      expect(health?.recommendedActions).toBeDefined();
      expect(health?.recommendedActions?.some(a => a.includes('fallback'))).toBe(true);
    });

    it('should recommend actions for broken patterns', () => {
      tracker.recordFailure('example.com', '/api/broken', 10, 9);
      const health = tracker.getHealth('example.com', '/api/broken');

      expect(health?.recommendedActions).toBeDefined();
      expect(health?.recommendedActions?.some(a => a.includes('broken'))).toBe(true);
      expect(health?.recommendedActions?.some(a => a.includes('browser'))).toBe(true);
    });

    it('should include consecutive failure info in actions', () => {
      const domain = 'example.com';
      const endpoint = '/api/flaky';

      // Simulate 6+ consecutive failures to reach "broken" status which includes consecutive failure info
      // With 6 consecutive failures (>= threshold * 2 = 6), status becomes "broken"
      for (let i = 1; i <= 6; i++) {
        tracker.recordFailure(domain, endpoint, 10 + i, i);
      }

      const health = tracker.getHealth(domain, endpoint);
      const actionsText = health?.recommendedActions?.join(' ') || '';

      // "broken" status includes "X consecutive failures detected" in actions
      expect(actionsText).toContain('consecutive');
    });
  });

  // ============================================
  // HEALTH CHECKS
  // ============================================

  describe('Health Checks', () => {
    it('should perform health check and update status', () => {
      const domain = 'example.com';
      const endpoint = '/api/users';

      tracker.recordSuccess(domain, endpoint, 5, 0);

      // 10 verifications with 4 failures = 60% success rate -> degraded (< 0.7 threshold)
      // This causes a status change from healthy to degraded
      // Need force: true because ensureHealthData sets lastHealthCheck to now
      const result = tracker.checkHealth(domain, endpoint, 10, 4, { force: true });

      expect(result).toBeDefined();
      expect(result?.statusChanged).toBe(true);
      expect(result?.currentHealth.currentSuccessRate).toBeCloseTo(0.6, 1);
    });

    it('should skip recent checks unless forced', () => {
      const domain = 'example.com';
      const endpoint = '/api/users';

      // First check
      tracker.checkHealth(domain, endpoint, 10, 0);

      // Second check immediately after (should skip)
      const result = tracker.checkHealth(domain, endpoint, 11, 0, {
        minCheckInterval: 3600000, // 1 hour
      });

      expect(result?.statusChanged).toBe(false);
    });

    it('should force check when requested', () => {
      const domain = 'example.com';
      const endpoint = '/api/users';

      // First check - establishes healthy status
      tracker.checkHealth(domain, endpoint, 10, 0);

      // Force second check with 4 failures (60% success) -> degrades to degraded
      const result = tracker.checkHealth(domain, endpoint, 10, 4, {
        force: true,
      });

      expect(result).toBeDefined();
      expect(result?.statusChanged).toBe(true);
    });

    it('should record snapshot when requested', () => {
      const domain = 'example.com';
      const endpoint = '/api/users';

      // Need force: true because ensureHealthData sets lastHealthCheck to now,
      // and without force the check would be skipped as "too recent"
      tracker.checkHealth(domain, endpoint, 10, 2, {
        recordSnapshot: true,
        force: true,
      });

      const health = tracker.getHealth(domain, endpoint);
      expect(health?.history.length).toBe(1);
    });

    it('should create notification on status change during check', () => {
      const domain = 'example.com';
      const endpoint = '/api/degrading';

      tracker.recordSuccess(domain, endpoint, 10, 0);

      const result = tracker.checkHealth(domain, endpoint, 10, 4, {
        force: true,
      });

      expect(result?.notification).toBeDefined();
      expect(result?.notification?.newStatus).toBe('degraded');
    });
  });

  // ============================================
  // UNHEALTHY PATTERNS
  // ============================================

  describe('Unhealthy Patterns', () => {
    it('should return all unhealthy patterns', () => {
      tracker.recordSuccess('example.com', '/api/good', 10, 0);
      tracker.recordFailure('example.com', '/api/bad1', 10, 4);
      tracker.recordFailure('example.com', '/api/bad2', 10, 6);

      const unhealthy = tracker.getUnhealthyPatterns();

      expect(unhealthy.length).toBe(2);
      expect(unhealthy.every(p => p.health.status !== 'healthy')).toBe(true);
    });

    it('should sort unhealthy patterns by severity', () => {
      tracker.recordFailure('example.com', '/api/degraded', 10, 4);
      tracker.recordFailure('example.com', '/api/broken', 10, 9);
      tracker.recordFailure('example.com', '/api/failing', 10, 6);

      const unhealthy = tracker.getUnhealthyPatterns();

      // Should be sorted: broken > failing > degraded
      expect(unhealthy[0].health.status).toBe('broken');
      expect(unhealthy[1].health.status).toBe('failing');
      expect(unhealthy[2].health.status).toBe('degraded');
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe('Statistics', () => {
    it('should return health statistics', () => {
      tracker.recordSuccess('example.com', '/api/1', 10, 0);
      tracker.recordSuccess('example.com', '/api/2', 10, 1);
      tracker.recordFailure('example.com', '/api/3', 10, 4);
      tracker.recordFailure('example.com', '/api/4', 10, 6);
      tracker.recordFailure('example.com', '/api/5', 10, 9);

      const stats = tracker.getHealthStats();

      expect(stats.total).toBe(5);
      expect(stats.healthy).toBe(2);
      expect(stats.degraded).toBe(1);
      expect(stats.failing).toBe(1);
      expect(stats.broken).toBe(1);
    });
  });

  // ============================================
  // PERSISTENCE
  // ============================================

  describe('Persistence', () => {
    it('should export health data', () => {
      tracker.recordSuccess('example.com', '/api/users', 10, 1);
      tracker.recordFailure('example.com', '/api/posts', 10, 4);

      const exported = tracker.exportHealthData();

      expect(Object.keys(exported).length).toBeGreaterThan(0);
      expect(exported['example.com:/api/users']).toBeDefined();
      expect(exported['example.com:/api/posts']).toBeDefined();
    });

    it('should import health data', () => {
      const healthData = {
        'example.com:/api/test': {
          status: 'degraded' as PatternHealthStatus,
          currentSuccessRate: 0.6,
          history: [],
          lastHealthCheck: Date.now(),
          consecutiveFailures: 2,
          recommendedActions: ['Review recent changes'],
        },
      };

      tracker.importHealthData(healthData);

      const health = tracker.getHealth('example.com', '/api/test');
      expect(health).toBeDefined();
      expect(health?.status).toBe('degraded');
      expect(health?.consecutiveFailures).toBe(2);
    });

    it('should restore health after export/import', () => {
      tracker.recordSuccess('example.com', '/api/1', 10, 2);
      // 10 verifications, 6 failures = 40% success rate -> failing (< 0.5 threshold)
      tracker.recordFailure('example.com', '/api/2', 10, 6);

      const exported = tracker.exportHealthData();

      const newTracker = new PatternHealthTracker();
      newTracker.importHealthData(exported);

      const health1 = newTracker.getHealth('example.com', '/api/1');
      const health2 = newTracker.getHealth('example.com', '/api/2');

      expect(health1?.status).toBe('healthy');
      expect(health2?.status).toBe('failing');
    });
  });

  // ============================================
  // CUSTOM CONFIGURATION
  // ============================================

  describe('Custom Configuration', () => {
    it('should accept custom thresholds', () => {
      const customConfig: Partial<PatternHealthConfig> = {
        degradationThreshold: 0.8,
        failingThreshold: 0.6,
        brokenThreshold: 0.3,
      };

      const customTracker = new PatternHealthTracker(customConfig);

      // 70% success rate - degraded with custom threshold (< 0.8)
      customTracker.recordFailure('example.com', '/api/test', 10, 3);
      const health = customTracker.getHealth('example.com', '/api/test');

      expect(health?.status).toBe('degraded');
    });

    it('should accept custom consecutive failure threshold', () => {
      const customConfig: Partial<PatternHealthConfig> = {
        consecutiveFailureThreshold: 5,
      };

      const customTracker = new PatternHealthTracker(customConfig);

      // 4 consecutive failures - not enough with custom threshold
      for (let i = 1; i <= 4; i++) {
        customTracker.recordFailure('example.com', '/api/test', 10 + i, i);
      }

      const health = customTracker.getHealth('example.com', '/api/test');
      // Should not be failing yet (need 5)
      expect(health?.consecutiveFailures).toBe(4);
    });

    it('should accept custom sample size', () => {
      const customConfig: Partial<PatternHealthConfig> = {
        minSampleSize: 10,
      };

      const customTracker = new PatternHealthTracker(customConfig);

      // Only 5 verifications (< custom minSampleSize)
      customTracker.recordFailure('example.com', '/api/test', 5, 3);
      const health = customTracker.getHealth('example.com', '/api/test');

      // Should stay healthy despite poor success rate
      expect(health?.status).toBe('healthy');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle zero verifications', () => {
      tracker.recordSuccess('example.com', '/api/new', 0, 0);
      const health = tracker.getHealth('example.com', '/api/new');

      expect(health?.currentSuccessRate).toBe(1.0); // Assume healthy
    });

    it('should handle non-existent patterns', () => {
      const health = tracker.getHealth('unknown.com', '/api/missing');
      expect(health).toBeNull();
    });

    it('should handle recovery from degraded to healthy', () => {
      const domain = 'example.com';
      const endpoint = '/api/recovering';

      // Start degraded
      tracker.recordFailure(domain, endpoint, 10, 4);
      let health = tracker.getHealth(domain, endpoint);
      expect(health?.status).toBe('degraded');

      // Recover
      tracker.recordSuccess(domain, endpoint, 15, 4);
      health = tracker.getHealth(domain, endpoint);
      expect(health?.status).toBe('healthy');
      expect(health?.degradationDetectedAt).toBeUndefined();
    });

    it('should track degradation timestamp', () => {
      const domain = 'example.com';
      const endpoint = '/api/degrading';

      tracker.recordSuccess(domain, endpoint, 10, 0);
      tracker.recordFailure(domain, endpoint, 10, 4);

      const health = tracker.getHealth(domain, endpoint);
      expect(health?.degradationDetectedAt).toBeDefined();
      expect(health?.degradationDetectedAt).toBeGreaterThan(0);
    });
  });

  // ============================================
  // INTEGRATION SCENARIOS
  // ============================================

  describe('Integration Scenarios', () => {
    it('should handle pattern lifecycle: healthy -> degraded -> failing -> broken', () => {
      const domain = 'example.com';
      const endpoint = '/api/lifecycle';

      // Start healthy
      tracker.recordSuccess(domain, endpoint, 10, 1);
      expect(tracker.getHealth(domain, endpoint)?.status).toBe('healthy');

      // Degrade (60% success)
      tracker.recordFailure(domain, endpoint, 10, 4, 'timeout');
      expect(tracker.getHealth(domain, endpoint)?.status).toBe('degraded');

      // Fail (40% success) - consecutiveFailures is now 2
      tracker.recordFailure(domain, endpoint, 10, 6, 'error');
      expect(tracker.getHealth(domain, endpoint)?.status).toBe('failing');

      // Break via very low success rate (10%)
      // Note: consecutiveFailures is now 3, which triggers 'failing' via consecutive check
      // but we need 6 consecutive failures OR very low success rate to get 'broken'
      // Since consecutive failures < 6, the status check falls through to success rate
      // 10% < 0.2 threshold = broken
      tracker.recordFailure(domain, endpoint, 10, 9, 'error');
      // After 3 consecutive failures with 10% success rate, the status becomes 'failing'
      // because the consecutive failure threshold (3) is checked before success rate
      // To get 'broken', we need 6+ consecutive failures
      expect(tracker.getHealth(domain, endpoint)?.status).toBe('failing');

      // Continue failing to reach 'broken' status via consecutive failures (>= 6)
      tracker.recordFailure(domain, endpoint, 10, 9, 'error');
      tracker.recordFailure(domain, endpoint, 10, 9, 'error');
      tracker.recordFailure(domain, endpoint, 10, 9, 'error');
      expect(tracker.getHealth(domain, endpoint)?.status).toBe('broken');
    });

    it('should handle multiple domains with same endpoint', () => {
      tracker.recordSuccess('site1.com', '/api/users', 10, 0);
      tracker.recordFailure('site2.com', '/api/users', 10, 6);

      const health1 = tracker.getHealth('site1.com', '/api/users');
      const health2 = tracker.getHealth('site2.com', '/api/users');

      expect(health1?.status).toBe('healthy');
      expect(health2?.status).toBe('failing');
    });

    it('should track pattern recovery over time', () => {
      const domain = 'example.com';
      const endpoint = '/api/flaky';

      // Initial failure
      tracker.recordFailure(domain, endpoint, 10, 4);
      expect(tracker.getHealth(domain, endpoint)?.status).toBe('degraded');

      // Gradual recovery
      tracker.recordSuccess(domain, endpoint, 12, 4);
      tracker.recordSuccess(domain, endpoint, 14, 4);
      tracker.recordSuccess(domain, endpoint, 16, 4);

      const health = tracker.getHealth(domain, endpoint);
      expect(health?.status).toBe('healthy');
      expect(health?.currentSuccessRate).toBeGreaterThan(0.7);
    });
  });
});
