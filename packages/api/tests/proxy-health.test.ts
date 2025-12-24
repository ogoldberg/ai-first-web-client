/**
 * Tests for ProxyHealthTracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProxyHealthTracker } from '../src/services/proxy-health.js';

describe('ProxyHealthTracker', () => {
  let tracker: ProxyHealthTracker;

  beforeEach(() => {
    tracker = new ProxyHealthTracker({
      healthWindow: 10,
      cooldownMinutes: 60,
      blockThreshold: 0.3,
      consecutiveFailureThreshold: 3,
    });
  });

  describe('initializeProxy', () => {
    it('should initialize a new proxy with healthy status', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');

      const health = tracker.getHealth('proxy-1');
      expect(health).not.toBeNull();
      expect(health!.proxyId).toBe('proxy-1');
      expect(health!.poolId).toBe('pool-1');
      expect(health!.tier).toBe('datacenter');
      expect(health!.successRate).toBe(1.0);
      expect(health!.isHealthy).toBe(true);
      expect(health!.isInCooldown).toBe(false);
    });

    it('should not reinitialize an existing proxy', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.recordSuccess('proxy-1', 'example.com', 100);

      // Try to reinitialize
      tracker.initializeProxy('proxy-1', 'pool-2', 'residential');

      // Should keep original data
      const health = tracker.getHealth('proxy-1');
      expect(health!.poolId).toBe('pool-1');
      expect(health!.tier).toBe('datacenter');
      expect(health!.totalRequests).toBe(1);
    });
  });

  describe('recordSuccess', () => {
    it('should update success metrics', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.recordSuccess('proxy-1', 'example.com', 150);

      const health = tracker.getHealth('proxy-1');
      expect(health!.totalRequests).toBe(1);
      expect(health!.successRate).toBe(1.0);
      expect(health!.avgLatencyMs).toBe(150);
      expect(health!.lastUsed).not.toBeNull();
    });

    it('should track domain-specific success', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.recordSuccess('proxy-1', 'example.com', 100);
      tracker.recordSuccess('proxy-1', 'example.com', 200);

      const health = tracker.getHealth('proxy-1');
      const domainStats = health!.domainStats.get('example.com');

      expect(domainStats).not.toBeUndefined();
      expect(domainStats!.successCount).toBe(2);
      expect(domainStats!.failureCount).toBe(0);
      expect(domainStats!.isBlocked).toBe(false);
    });

    it('should clear blocked status after success', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');

      // Cause blocking
      tracker.recordFailure('proxy-1', 'example.com', 'blocked');
      tracker.recordFailure('proxy-1', 'example.com', 'blocked');
      tracker.recordFailure('proxy-1', 'example.com', 'blocked');

      let health = tracker.getHealth('proxy-1');
      expect(health!.blockedDomains).toContain('example.com');

      // Success should clear block
      tracker.recordSuccess('proxy-1', 'example.com', 100);

      health = tracker.getHealth('proxy-1');
      expect(health!.blockedDomains).not.toContain('example.com');
    });
  });

  describe('recordFailure', () => {
    it('should update failure metrics', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.recordFailure('proxy-1', 'example.com', 'timeout');

      const health = tracker.getHealth('proxy-1');
      expect(health!.totalRequests).toBe(1);
      expect(health!.totalFailures).toBe(1);
      expect(health!.successRate).toBe(0);
    });

    it('should mark domain as blocked after consecutive failures', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');

      tracker.recordFailure('proxy-1', 'example.com', 'blocked');
      tracker.recordFailure('proxy-1', 'example.com', 'blocked');

      let health = tracker.getHealth('proxy-1');
      expect(health!.blockedDomains).not.toContain('example.com');

      tracker.recordFailure('proxy-1', 'example.com', 'blocked');

      health = tracker.getHealth('proxy-1');
      expect(health!.blockedDomains).toContain('example.com');
    });

    it('should enter cooldown when failure rate is too high', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');

      // 4 failures out of 10 = 40% failure rate > 30% threshold
      for (let i = 0; i < 4; i++) {
        tracker.recordFailure('proxy-1', 'example.com', 'blocked');
      }

      const health = tracker.getHealth('proxy-1');
      expect(health!.isInCooldown).toBe(true);
      expect(health!.isHealthy).toBe(false);
      expect(health!.cooldownReason).toBe('blocked');
    });
  });

  describe('isHealthyForDomain', () => {
    it('should return true for healthy proxy and unblocked domain', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');

      expect(tracker.isHealthyForDomain('proxy-1', 'example.com')).toBe(true);
    });

    it('should return false for blocked domain', () => {
      // Use a tracker with higher thresholds to test domain-specific blocking
      // without triggering overall cooldown
      const customTracker = new ProxyHealthTracker({
        healthWindow: 100,
        cooldownMinutes: 60,
        blockThreshold: 0.5, // 50% threshold - 3 failures out of 23 = 13% won't trigger
        consecutiveFailureThreshold: 3,
      });
      customTracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');

      // Add many successes to different domains first (20 successes)
      for (let i = 0; i < 20; i++) {
        customTracker.recordSuccess('proxy-1', 'good.com', 100);
      }

      // Then cause domain-specific blocking (3 failures = 3/23 = ~13% failure rate)
      customTracker.recordFailure('proxy-1', 'example.com', 'blocked');
      customTracker.recordFailure('proxy-1', 'example.com', 'blocked');
      customTracker.recordFailure('proxy-1', 'example.com', 'blocked');

      // Proxy should be blocked for example.com but healthy for other domains
      expect(customTracker.isHealthyForDomain('proxy-1', 'example.com')).toBe(false);
      expect(customTracker.isHealthyForDomain('proxy-1', 'other.com')).toBe(true);
    });

    it('should return false for proxy in cooldown', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.forceCooldown('proxy-1', 'blocked');

      expect(tracker.isHealthyForDomain('proxy-1', 'example.com')).toBe(false);
    });

    it('should return false for unknown proxy', () => {
      expect(tracker.isHealthyForDomain('unknown', 'example.com')).toBe(false);
    });
  });

  describe('getHealthyProxiesForDomain', () => {
    it('should return only healthy proxies for a domain', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.initializeProxy('proxy-2', 'pool-1', 'datacenter');
      tracker.initializeProxy('proxy-3', 'pool-1', 'datacenter');

      // Block proxy-1 for example.com
      tracker.recordFailure('proxy-1', 'example.com', 'blocked');
      tracker.recordFailure('proxy-1', 'example.com', 'blocked');
      tracker.recordFailure('proxy-1', 'example.com', 'blocked');

      // Put proxy-2 in cooldown
      tracker.forceCooldown('proxy-2', 'blocked');

      const healthy = tracker.getHealthyProxiesForDomain('example.com');
      expect(healthy).toEqual(['proxy-3']);
    });

    it('should filter by tier', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.initializeProxy('proxy-2', 'pool-2', 'residential');

      const datacenter = tracker.getHealthyProxiesForDomain('example.com', 'datacenter');
      const residential = tracker.getHealthyProxiesForDomain('example.com', 'residential');

      expect(datacenter).toEqual(['proxy-1']);
      expect(residential).toEqual(['proxy-2']);
    });
  });

  describe('sticky sessions', () => {
    it('should store and retrieve sticky proxy', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');

      tracker.setStickyProxy('session-1', 'proxy-1');

      expect(tracker.getStickyProxy('session-1')).toBe('proxy-1');
      expect(tracker.getStickyProxy('session-2')).toBeNull();
    });

    it('should clear sticky proxy', () => {
      tracker.setStickyProxy('session-1', 'proxy-1');
      tracker.clearStickyProxy('session-1');

      expect(tracker.getStickyProxy('session-1')).toBeNull();
    });
  });

  describe('cooldown management', () => {
    it('should force proxy into cooldown', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.forceCooldown('proxy-1', 'rate_limited', 30);

      const health = tracker.getHealth('proxy-1');
      expect(health!.isInCooldown).toBe(true);
      expect(health!.cooldownReason).toBe('rate_limited');
    });

    it('should clear cooldown', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.forceCooldown('proxy-1', 'blocked');
      tracker.clearCooldown('proxy-1');

      const health = tracker.getHealth('proxy-1');
      expect(health!.isInCooldown).toBe(false);
      expect(health!.cooldownReason).toBeNull();
    });

    it('should clear domain blocks', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.initializeProxy('proxy-2', 'pool-1', 'datacenter');

      // Block both for same domain
      for (let i = 0; i < 3; i++) {
        tracker.recordFailure('proxy-1', 'example.com', 'blocked');
        tracker.recordFailure('proxy-2', 'example.com', 'blocked');
      }

      tracker.clearDomainBlocks('example.com');

      expect(tracker.getHealth('proxy-1')!.blockedDomains).not.toContain('example.com');
      expect(tracker.getHealth('proxy-2')!.blockedDomains).not.toContain('example.com');
    });
  });

  describe('getAggregateStats', () => {
    it('should calculate aggregate statistics', () => {
      tracker.initializeProxy('proxy-1', 'pool-1', 'datacenter');
      tracker.initializeProxy('proxy-2', 'pool-1', 'datacenter');
      tracker.initializeProxy('proxy-3', 'pool-2', 'residential');

      tracker.recordSuccess('proxy-1', 'example.com', 100);
      tracker.recordSuccess('proxy-2', 'example.com', 200);
      tracker.forceCooldown('proxy-3', 'blocked');

      const stats = tracker.getAggregateStats();

      expect(stats.totalProxies).toBe(3);
      expect(stats.healthyProxies).toBe(2);
      expect(stats.inCooldown).toBe(1);
      expect(stats.byTier.get('datacenter')!.count).toBe(2);
      expect(stats.byTier.get('residential')!.count).toBe(1);
    });
  });
});
