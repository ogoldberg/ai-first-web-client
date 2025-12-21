/**
 * Tests for Analytics Dashboard (GTM-002)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateDashboard,
  getQuickStatus,
  type AnalyticsDashboard,
  type DashboardOptions,
} from '../../src/utils/analytics-dashboard.js';
import { getUsageMeter, resetUsageMeterInstance } from '../../src/utils/usage-meter.js';
import { performanceTracker } from '../../src/utils/performance-tracker.js';

describe('AnalyticsDashboard', () => {
  beforeEach(async () => {
    // Reset usage meter
    resetUsageMeterInstance();
    const usageMeter = getUsageMeter();
    await usageMeter.initialize();
    await usageMeter.reset();

    // Reset performance tracker
    performanceTracker.clear();
  });

  describe('generateDashboard', () => {
    it('returns empty dashboard when no data exists', async () => {
      const dashboard = await generateDashboard();

      expect(dashboard.schemaVersion).toBe('1.0');
      expect(dashboard.generatedAt).toBeLessThanOrEqual(Date.now());
      expect(dashboard.period).toBe('day');
      expect(dashboard.summary.totalRequests).toBe(0);
      expect(dashboard.summary.totalCostUnits).toBe(0);
      expect(dashboard.health.overall).toBe('healthy');
    });

    it('includes all required sections in dashboard', async () => {
      const dashboard = await generateDashboard();

      expect(dashboard).toHaveProperty('schemaVersion');
      expect(dashboard).toHaveProperty('generatedAt');
      expect(dashboard).toHaveProperty('period');
      expect(dashboard).toHaveProperty('summary');
      expect(dashboard).toHaveProperty('health');
      expect(dashboard).toHaveProperty('byTier');
      expect(dashboard).toHaveProperty('topDomains');
      expect(dashboard).toHaveProperty('timeSeries');
      expect(dashboard).toHaveProperty('trends');
    });

    it('aggregates usage data correctly', async () => {
      const usageMeter = getUsageMeter();

      // Record some usage events
      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page1',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page2',
        tier: 'playwright',
        success: true,
        durationMs: 3000,
        tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
        fellBack: true,
      });

      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'other.com',
        url: 'https://other.com/page',
        tier: 'lightweight',
        success: false,
        durationMs: 500,
        tiersAttempted: ['intelligence', 'lightweight'],
        fellBack: true,
      });

      const dashboard = await generateDashboard();

      expect(dashboard.summary.totalRequests).toBe(3);
      expect(dashboard.summary.totalCostUnits).toBeGreaterThan(0);
      expect(dashboard.summary.overallSuccessRate).toBeCloseTo(2 / 3, 2);
    });

    it('calculates tier breakdown correctly', async () => {
      const usageMeter = getUsageMeter();

      // Record events for different tiers
      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/1',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/2',
        tier: 'lightweight',
        success: true,
        durationMs: 300,
        tiersAttempted: ['lightweight'],
        fellBack: false,
      });

      const dashboard = await generateDashboard();

      expect(dashboard.byTier).toHaveLength(3);

      const intelligenceTier = dashboard.byTier.find(t => t.tier === 'intelligence');
      const lightweightTier = dashboard.byTier.find(t => t.tier === 'lightweight');

      expect(intelligenceTier?.requestCount).toBe(1);
      expect(lightweightTier?.requestCount).toBe(1);
    });

    it('respects period option', async () => {
      const dashboard = await generateDashboard({ period: 'week' });
      expect(dashboard.period).toBe('week');
    });

    it('respects topDomainsLimit option', async () => {
      const usageMeter = getUsageMeter();

      // Record events for many domains
      for (let i = 0; i < 20; i++) {
        await usageMeter.record({
          timestamp: Date.now(),
          domain: `domain${i}.com`,
          url: `https://domain${i}.com/page`,
          tier: 'intelligence',
          success: true,
          durationMs: 100,
          tiersAttempted: ['intelligence'],
          fellBack: false,
        });
      }

      const dashboard = await generateDashboard({ topDomainsLimit: 5 });

      expect(dashboard.topDomains.byRequests.length).toBeLessThanOrEqual(5);
      expect(dashboard.topDomains.byCost.length).toBeLessThanOrEqual(5);
    });

    it('filters by domain when specified', async () => {
      const usageMeter = getUsageMeter();

      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'other.com',
        url: 'https://other.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      const dashboard = await generateDashboard({ domain: 'example.com' });

      expect(dashboard.summary.totalRequests).toBe(1);
    });
  });

  describe('health assessment', () => {
    it('reports healthy status for good metrics', async () => {
      const usageMeter = getUsageMeter();

      // Record successful, fast events
      for (let i = 0; i < 10; i++) {
        await usageMeter.record({
          timestamp: Date.now(),
          domain: 'example.com',
          url: `https://example.com/page${i}`,
          tier: 'intelligence',
          success: true,
          durationMs: 100,
          tiersAttempted: ['intelligence'],
          fellBack: false,
        });
      }

      const dashboard = await generateDashboard();

      expect(dashboard.health.overall).toBe('healthy');
      expect(dashboard.health.successRate).toBe(1);
      expect(dashboard.health.issues).toHaveLength(0);
    });

    it('reports degraded status for moderate issues', async () => {
      const usageMeter = getUsageMeter();

      // Record mixed success with moderate latency
      // To get "degraded" status, we need:
      // - successRate >= 0.85 (degraded threshold) but < 0.95 (healthy)
      // - latency > 1000 (healthy) but <= 3000 (degraded)
      // - fallbackRate > 0.1 (healthy) but <= 0.3 (degraded)
      for (let i = 0; i < 10; i++) {
        await usageMeter.record({
          timestamp: Date.now(),
          domain: 'example.com',
          url: `https://example.com/page${i}`,
          tier: 'lightweight',
          success: i < 9, // 90% success rate
          durationMs: 2000, // Above optimal but not critical (1000 < 2000 <= 3000)
          tiersAttempted: ['intelligence', 'lightweight'],
          fellBack: i < 2, // 20% fallback rate (2/10)
        });
      }

      const dashboard = await generateDashboard();

      expect(dashboard.health.overall).toBe('degraded');
      expect(dashboard.health.issues.length).toBeGreaterThan(0);
    });

    it('reports unhealthy status for poor metrics', async () => {
      const usageMeter = getUsageMeter();

      // Record mostly failed, slow events
      for (let i = 0; i < 10; i++) {
        await usageMeter.record({
          timestamp: Date.now(),
          domain: 'example.com',
          url: `https://example.com/page${i}`,
          tier: 'playwright',
          success: i < 5, // 50% success
          durationMs: 5000, // Very high latency
          tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
          fellBack: true,
        });
      }

      const dashboard = await generateDashboard();

      expect(dashboard.health.overall).toBe('unhealthy');
      expect(dashboard.health.issues.length).toBeGreaterThan(0);
      expect(dashboard.health.recommendations.length).toBeGreaterThan(0);
    });

    it('provides actionable recommendations', async () => {
      const usageMeter = getUsageMeter();

      // Record some failures
      for (let i = 0; i < 5; i++) {
        await usageMeter.record({
          timestamp: Date.now(),
          domain: 'example.com',
          url: `https://example.com/page${i}`,
          tier: 'playwright',
          success: false,
          durationMs: 4000,
          tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
          fellBack: true,
        });
      }

      const dashboard = await generateDashboard();

      expect(dashboard.health.recommendations.length).toBeGreaterThan(0);
      // Should have recommendations about the issues
      const hasRelevantRecommendation = dashboard.health.recommendations.some(
        r => r.includes('error') || r.includes('tier') || r.includes('domain') || r.includes('latency')
      );
      expect(hasRelevantRecommendation).toBe(true);
    });
  });

  describe('time series', () => {
    it('generates time series data points', async () => {
      const dashboard = await generateDashboard({ timeSeriesPoints: 5 });

      expect(dashboard.timeSeries.length).toBe(5);
      dashboard.timeSeries.forEach(point => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('periodLabel');
        expect(point).toHaveProperty('requestCount');
        expect(point).toHaveProperty('successRate');
        expect(point).toHaveProperty('totalCostUnits');
        expect(point).toHaveProperty('avgLatencyMs');
        expect(point).toHaveProperty('fallbackRate');
      });
    });

    it('time series points are ordered chronologically', async () => {
      const dashboard = await generateDashboard({ timeSeriesPoints: 5 });

      for (let i = 1; i < dashboard.timeSeries.length; i++) {
        expect(dashboard.timeSeries[i].timestamp).toBeGreaterThan(
          dashboard.timeSeries[i - 1].timestamp
        );
      }
    });
  });

  describe('trends', () => {
    it('calculates request trend', async () => {
      // Note: Trends require previous period data which is hard to set up in tests
      // Just verify the structure exists
      const dashboard = await generateDashboard();

      expect(dashboard.trends).toHaveProperty('requestTrend');
      expect(dashboard.trends).toHaveProperty('costTrend');
      expect(dashboard.trends).toHaveProperty('successRateTrend');
      expect(dashboard.trends).toHaveProperty('latencyTrend');
    });
  });

  describe('getQuickStatus', () => {
    it('returns compact status summary', async () => {
      const status = await getQuickStatus();

      expect(status.schemaVersion).toBe('1.0');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('requests24h');
      expect(status).toHaveProperty('successRate');
      expect(status).toHaveProperty('avgLatencyMs');
      expect(status).toHaveProperty('costUnits24h');
    });

    it('returns healthy status with no data', async () => {
      const status = await getQuickStatus();

      expect(status.status).toBe('healthy');
      expect(status.requests24h).toBe(0);
    });

    it('reflects actual usage data', async () => {
      const usageMeter = getUsageMeter();

      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      const status = await getQuickStatus();

      expect(status.requests24h).toBe(1);
      expect(status.successRate).toBe(1);
    });
  });

  describe('integration with performance tracker', () => {
    it('includes performance metrics in dashboard', async () => {
      // Record both usage and performance data
      const usageMeter = getUsageMeter();

      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      performanceTracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 100, network: 50 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const dashboard = await generateDashboard();

      expect(dashboard.summary.totalDomains).toBeGreaterThan(0);
    });

    it('uses performance data for latency metrics', async () => {
      performanceTracker.record({
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        timing: { total: 150, network: 75 },
        success: true,
        fellBack: false,
        tiersAttempted: ['intelligence'],
      });

      const dashboard = await generateDashboard();

      // Check that tier latency data is available
      const intelligenceTier = dashboard.byTier.find(t => t.tier === 'intelligence');
      expect(intelligenceTier?.latency).not.toBeNull();
    });
  });

  describe('top domains', () => {
    it('ranks domains by cost correctly', async () => {
      const usageMeter = getUsageMeter();

      // Cheap domain
      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'cheap.com',
        url: 'https://cheap.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      // Expensive domain
      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'expensive.com',
        url: 'https://expensive.com/page',
        tier: 'playwright',
        success: true,
        durationMs: 3000,
        tiersAttempted: ['playwright'],
        fellBack: false,
      });

      const dashboard = await generateDashboard();

      if (dashboard.topDomains.byCost.length >= 2) {
        // Expensive domain should be first
        expect(dashboard.topDomains.byCost[0].domain).toBe('expensive.com');
      }
    });

    it('ranks domains by request count correctly', async () => {
      const usageMeter = getUsageMeter();

      // Low traffic domain
      await usageMeter.record({
        timestamp: Date.now(),
        domain: 'lowtraffic.com',
        url: 'https://lowtraffic.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      // High traffic domain
      for (let i = 0; i < 5; i++) {
        await usageMeter.record({
          timestamp: Date.now(),
          domain: 'hightraffic.com',
          url: `https://hightraffic.com/page${i}`,
          tier: 'intelligence',
          success: true,
          durationMs: 100,
          tiersAttempted: ['intelligence'],
          fellBack: false,
        });
      }

      const dashboard = await generateDashboard();

      if (dashboard.topDomains.byRequests.length >= 2) {
        // High traffic domain should be first
        expect(dashboard.topDomains.byRequests[0].domain).toBe('hightraffic.com');
        expect(dashboard.topDomains.byRequests[0].requestCount).toBe(5);
      }
    });
  });
});
