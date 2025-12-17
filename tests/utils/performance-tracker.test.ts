import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceTracker } from '../../src/utils/performance-tracker.js';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker();
  });

  describe('record', () => {
    it('should record timing events', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 150 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const counts = tracker.getRecordCount();
      expect(counts.total).toBe(1);
      expect(counts.byDomain).toBe(1);
    });

    it('should record multiple events for same domain', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page1',
        tier: 'intelligence',
        timing: { total: 100 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page2',
        tier: 'intelligence',
        timing: { total: 200 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const counts = tracker.getRecordCount();
      expect(counts.total).toBe(2);
      expect(counts.byDomain).toBe(1); // Same domain
    });

    it('should track different domains separately', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 100 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      tracker.record({
        domain: 'other.com',
        url: 'https://other.com/page',
        tier: 'lightweight',
        timing: { total: 300 },
        success: true,
        fellBack: false,
        tiersAttempted: ['lightweight'],
      });

      const counts = tracker.getRecordCount();
      expect(counts.total).toBe(2);
      expect(counts.byDomain).toBe(2);
    });
  });

  describe('getDomainPerformance', () => {
    it('should return null for unknown domain', () => {
      const result = tracker.getDomainPerformance('unknown.com');
      expect(result).toBeNull();
    });

    it('should return performance metrics for a domain', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 150 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const perf = tracker.getDomainPerformance('example.com');
      expect(perf).not.toBeNull();
      expect(perf!.domain).toBe('example.com');
      expect(perf!.totalRequests).toBe(1);
      expect(perf!.successRate).toBe(1);
      expect(perf!.preferredTier).toBe('intelligence');
    });

    it('should calculate correct success rate', () => {
      // Add 3 successes
      for (let i = 0; i < 3; i++) {
        tracker.record({
          domain: 'example.com',
          url: `https://example.com/page${i}`,
          tier: 'intelligence',
          timing: { total: 100 },
          success: true,
          fellBack: false,
          tiersAttempted: ['intelligence'],
        });
      }

      // Add 2 failures
      for (let i = 0; i < 2; i++) {
        tracker.record({
          domain: 'example.com',
          url: `https://example.com/fail${i}`,
          tier: 'playwright',
          timing: { total: 2000 },
          success: false,
          fellBack: true,
          tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
        });
      }

      const perf = tracker.getDomainPerformance('example.com');
      expect(perf!.totalRequests).toBe(5);
      expect(perf!.successRate).toBe(0.6); // 3/5
    });

    it('should calculate percentile statistics', () => {
      // Add various timing records
      const timings = [100, 150, 200, 250, 300, 350, 400, 450, 500, 1000];
      for (const total of timings) {
        tracker.record({
          domain: 'example.com',
          url: `https://example.com/page${total}`,
          tier: 'intelligence',
          timing: { total },
          success: true,
          fellBack: false,
          tiersAttempted: ['intelligence'],
        });
      }

      const perf = tracker.getDomainPerformance('example.com');
      expect(perf!.overall.count).toBe(10);
      expect(perf!.overall.min).toBe(100);
      expect(perf!.overall.max).toBe(1000);
      // p50 should be around 300-350
      expect(perf!.overall.p50).toBeGreaterThanOrEqual(200);
      expect(perf!.overall.p50).toBeLessThanOrEqual(400);
    });

    it('should track per-tier statistics', () => {
      // Add intelligence tier records
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/intel',
        tier: 'intelligence',
        timing: { total: 100 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      // Add lightweight tier records
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/light',
        tier: 'lightweight',
        timing: { total: 300 },
        success: true,
        fellBack: true,
        tiersAttempted: ['intelligence', 'lightweight'],
      });

      const perf = tracker.getDomainPerformance('example.com');
      expect(perf!.byTier.intelligence).not.toBeNull();
      expect(perf!.byTier.intelligence!.count).toBe(1);
      expect(perf!.byTier.lightweight).not.toBeNull();
      expect(perf!.byTier.lightweight!.count).toBe(1);
      expect(perf!.byTier.playwright).toBeNull();
    });
  });

  describe('getSystemPerformance', () => {
    it('should return system-wide metrics', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 100 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      tracker.record({
        domain: 'other.com',
        url: 'https://other.com/page',
        tier: 'lightweight',
        timing: { total: 300 },
        success: true,
        fellBack: false,
        tiersAttempted: ['lightweight'],
      });

      const perf = tracker.getSystemPerformance();
      expect(perf.totalRequests).toBe(2);
      expect(perf.totalDomains).toBe(2);
      expect(perf.successRate).toBe(1);
    });

    it('should track top fast and slow domains', () => {
      // Fast domain
      tracker.record({
        domain: 'fast.com',
        url: 'https://fast.com/page',
        tier: 'intelligence',
        timing: { total: 50 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      // Slow domain
      tracker.record({
        domain: 'slow.com',
        url: 'https://slow.com/page',
        tier: 'playwright',
        timing: { total: 5000 },
        success: true,
        fellBack: true,
        tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
      });

      const perf = tracker.getSystemPerformance();
      expect(perf.topFastDomains.length).toBeGreaterThan(0);
      expect(perf.topSlowDomains.length).toBeGreaterThan(0);
      expect(perf.topFastDomains[0].domain).toBe('fast.com');
      expect(perf.topSlowDomains[0].domain).toBe('slow.com');
    });
  });

  describe('getRecentTimings', () => {
    it('should return recent timing records', () => {
      for (let i = 0; i < 5; i++) {
        tracker.record({
          domain: 'example.com',
          url: `https://example.com/page${i}`,
          tier: 'intelligence',
          timing: { total: 100 + i * 10 },
          success: true,
          fellBack: false,
          tiersAttempted: ['intelligence'],
        });
      }

      const recent = tracker.getRecentTimings(3);
      expect(recent.length).toBe(3);
      // Most recent first
      expect(recent[0].timing.total).toBe(140);
      expect(recent[2].timing.total).toBe(120);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        tracker.record({
          domain: 'example.com',
          url: `https://example.com/page${i}`,
          tier: 'intelligence',
          timing: { total: 100 },
          success: true,
          fellBack: false,
          tiersAttempted: ['intelligence'],
        });
      }

      const recent = tracker.getRecentTimings(5);
      expect(recent.length).toBe(5);
    });
  });

  describe('getTierTimings', () => {
    it('should filter by tier', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/intel',
        tier: 'intelligence',
        timing: { total: 100 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/light',
        tier: 'lightweight',
        timing: { total: 300 },
        success: true,
        fellBack: false,
        tiersAttempted: ['lightweight'],
      });

      const intelTimings = tracker.getTierTimings('intelligence');
      expect(intelTimings.length).toBe(1);
      expect(intelTimings[0].tier).toBe('intelligence');

      const lightTimings = tracker.getTierTimings('lightweight');
      expect(lightTimings.length).toBe(1);
      expect(lightTimings[0].tier).toBe('lightweight');
    });
  });

  describe('getComponentBreakdown', () => {
    it('should aggregate component timings', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page1',
        tier: 'intelligence',
        timing: {
          total: 200,
          network: 100,
          parsing: 50,
          extraction: 50,
        },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page2',
        tier: 'intelligence',
        timing: {
          total: 300,
          network: 150,
          parsing: 100,
          extraction: 50,
        },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const breakdown = tracker.getComponentBreakdown();
      expect(breakdown.network).not.toBeNull();
      expect(breakdown.network!.count).toBe(2);
      expect(breakdown.network!.avg).toBe(125); // (100 + 150) / 2
      expect(breakdown.parsing).not.toBeNull();
      expect(breakdown.parsing!.count).toBe(2);
    });

    it('should handle missing component timings', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 100 }, // No component breakdown
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const breakdown = tracker.getComponentBreakdown();
      // Should all be null since no component data
      expect(breakdown.network).toBeNull();
      expect(breakdown.parsing).toBeNull();
      expect(breakdown.jsExecution).toBeNull();
      expect(breakdown.extraction).toBeNull();
    });
  });

  describe('getDomainsByPerformance', () => {
    beforeEach(() => {
      // Add domains with different performance characteristics
      for (let i = 0; i < 3; i++) {
        tracker.record({
          domain: 'fast.com',
          url: 'https://fast.com/page',
          tier: 'intelligence',
          timing: { total: 50 + i * 10 },
          success: true,
          fellBack: false,
          tiersAttempted: ['intelligence'],
        });
      }

      for (let i = 0; i < 3; i++) {
        tracker.record({
          domain: 'medium.com',
          url: 'https://medium.com/page',
          tier: 'lightweight',
          timing: { total: 300 + i * 50 },
          success: i < 2, // 2 successes, 1 failure
          fellBack: false,
          tiersAttempted: ['lightweight'],
        });
      }

      for (let i = 0; i < 3; i++) {
        tracker.record({
          domain: 'slow.com',
          url: 'https://slow.com/page',
          tier: 'playwright',
          timing: { total: 2000 + i * 500 },
          success: true,
          fellBack: true,
          tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
        });
      }
    });

    it('should sort by average time ascending', () => {
      const results = tracker.getDomainsByPerformance('avgTime', 'asc');
      expect(results[0].domain).toBe('fast.com');
      expect(results[results.length - 1].domain).toBe('slow.com');
    });

    it('should sort by average time descending', () => {
      const results = tracker.getDomainsByPerformance('avgTime', 'desc');
      expect(results[0].domain).toBe('slow.com');
      expect(results[results.length - 1].domain).toBe('fast.com');
    });

    it('should sort by success rate', () => {
      const results = tracker.getDomainsByPerformance('successRate', 'desc');
      // fast.com and slow.com have 100% success, medium.com has 66%
      expect(results[results.length - 1].domain).toBe('medium.com');
    });

    it('should respect limit parameter', () => {
      const results = tracker.getDomainsByPerformance('avgTime', 'asc', 2);
      expect(results.length).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all records', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 100 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      expect(tracker.getRecordCount().total).toBe(1);

      tracker.clear();

      expect(tracker.getRecordCount().total).toBe(0);
      expect(tracker.getRecordCount().byDomain).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty state gracefully', () => {
      const systemPerf = tracker.getSystemPerformance();
      expect(systemPerf.totalRequests).toBe(0);
      expect(systemPerf.totalDomains).toBe(0);
      expect(systemPerf.overall.count).toBe(0);
    });

    it('should handle single record percentiles', () => {
      tracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 100 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const perf = tracker.getDomainPerformance('example.com');
      // All percentiles should be the same value with single record
      expect(perf!.overall.p50).toBe(100);
      expect(perf!.overall.p95).toBe(100);
      expect(perf!.overall.p99).toBe(100);
      expect(perf!.overall.min).toBe(100);
      expect(perf!.overall.max).toBe(100);
      expect(perf!.overall.avg).toBe(100);
    });

    it('should handle all failures for a domain', () => {
      tracker.record({
        domain: 'failing.com',
        url: 'https://failing.com/page',
        tier: 'playwright',
        timing: { total: 5000 },
        success: false,
        fellBack: true,
        tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
      });

      const perf = tracker.getDomainPerformance('failing.com');
      expect(perf!.successRate).toBe(0);
      expect(perf!.preferredTier).toBeNull(); // No successful tier
    });
  });
});
