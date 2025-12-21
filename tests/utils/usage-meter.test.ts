/**
 * Tests for Usage Metering & Tier Cost Reporting (GTM-001)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UsageMeter,
  TIER_COST_UNITS,
  TIER_LATENCY_ESTIMATES,
  getUsageMeter,
  resetUsageMeterInstance,
} from '../../src/utils/usage-meter.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('UsageMeter', () => {
  let meter: UsageMeter;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for persistence tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-meter-test-'));
    meter = new UsageMeter({
      persistPath: path.join(tempDir, 'usage.json'),
      maxEvents: 1000,
    });
    await meter.initialize();
  });

  afterEach(async () => {
    await meter.flush();
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    resetUsageMeterInstance();
  });

  describe('cost configuration', () => {
    it('should have correct tier cost units', () => {
      expect(TIER_COST_UNITS.intelligence).toBe(1);
      expect(TIER_COST_UNITS.lightweight).toBe(5);
      expect(TIER_COST_UNITS.playwright).toBe(25);
    });

    it('should have latency estimates for all tiers', () => {
      for (const tier of ['intelligence', 'lightweight', 'playwright'] as const) {
        expect(TIER_LATENCY_ESTIMATES[tier]).toBeDefined();
        expect(TIER_LATENCY_ESTIMATES[tier].min).toBeLessThan(TIER_LATENCY_ESTIMATES[tier].max);
        expect(TIER_LATENCY_ESTIMATES[tier].typical).toBeGreaterThanOrEqual(TIER_LATENCY_ESTIMATES[tier].min);
        expect(TIER_LATENCY_ESTIMATES[tier].typical).toBeLessThanOrEqual(TIER_LATENCY_ESTIMATES[tier].max);
      }
    });

    it('should have increasing costs from intelligence to playwright', () => {
      expect(TIER_COST_UNITS.intelligence).toBeLessThan(TIER_COST_UNITS.lightweight);
      expect(TIER_COST_UNITS.lightweight).toBeLessThan(TIER_COST_UNITS.playwright);
    });
  });

  describe('record()', () => {
    it('should record a usage event', async () => {
      const event = await meter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 150,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      expect(event.id).toBeDefined();
      expect(event.costUnits).toBe(TIER_COST_UNITS.intelligence);
      expect(meter.getEventCount()).toBe(1);
    });

    it('should calculate cost for single tier', async () => {
      const event = await meter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'playwright',
        success: true,
        durationMs: 3000,
        tiersAttempted: ['playwright'],
        fellBack: false,
      });

      expect(event.costUnits).toBe(TIER_COST_UNITS.playwright);
    });

    it('should calculate cost for fallback (multiple tiers attempted)', async () => {
      const event = await meter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'playwright',
        success: true,
        durationMs: 3500,
        tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
        fellBack: true,
      });

      // Intelligence failed (50% cost) + Lightweight failed (50% cost) + Playwright succeeded (100% cost)
      const expectedCost =
        Math.ceil(TIER_COST_UNITS.intelligence * 0.5) +
        Math.ceil(TIER_COST_UNITS.lightweight * 0.5) +
        TIER_COST_UNITS.playwright;

      expect(event.costUnits).toBe(expectedCost);
    });

    it('should include tenant ID when provided', async () => {
      const event = await meter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
        tenantId: 'tenant-123',
      });

      expect(event.tenantId).toBe('tenant-123');
    });

    it('should trim old events when exceeding maxEvents', async () => {
      const smallMeter = new UsageMeter({
        persistPath: path.join(tempDir, 'small-usage.json'),
        maxEvents: 5,
      });
      await smallMeter.initialize();

      // Record 7 events
      for (let i = 0; i < 7; i++) {
        await smallMeter.record({
          timestamp: Date.now() + i,
          domain: `domain${i}.com`,
          url: `https://domain${i}.com/page`,
          tier: 'intelligence',
          success: true,
          durationMs: 100,
          tiersAttempted: ['intelligence'],
          fellBack: false,
        });
      }

      expect(smallMeter.getEventCount()).toBe(5);
      await smallMeter.flush();
    });
  });

  describe('getSummary()', () => {
    beforeEach(async () => {
      // Record some test events
      const now = Date.now();

      await meter.record({
        timestamp: now - 1000,
        domain: 'fast.com',
        url: 'https://fast.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      await meter.record({
        timestamp: now - 500,
        domain: 'medium.com',
        url: 'https://medium.com/page',
        tier: 'lightweight',
        success: true,
        durationMs: 300,
        tiersAttempted: ['intelligence', 'lightweight'],
        fellBack: true,
      });

      await meter.record({
        timestamp: now,
        domain: 'slow.com',
        url: 'https://slow.com/page',
        tier: 'playwright',
        success: false,
        durationMs: 3000,
        tiersAttempted: ['playwright'],
        fellBack: false,
      });
    });

    it('should return summary with correct totals', async () => {
      const summary = await meter.getSummary({ period: 'all' });

      expect(summary.totalRequests).toBe(3);
      expect(summary.totalCostUnits).toBeGreaterThan(0);
      expect(summary.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate avgCostPerRequest', async () => {
      const summary = await meter.getSummary({ period: 'all' });

      expect(summary.avgCostPerRequest).toBe(summary.totalCostUnits / summary.totalRequests);
    });

    it('should include currentPeriod aggregate', async () => {
      const summary = await meter.getSummary({ period: 'hour' });

      expect(summary.currentPeriod).toBeDefined();
      expect(summary.currentPeriod.requestCount).toBe(3);
      expect(summary.currentPeriod.byTier.intelligence).toBeDefined();
      expect(summary.currentPeriod.byTier.lightweight).toBeDefined();
      expect(summary.currentPeriod.byTier.playwright).toBeDefined();
    });

    it('should filter by domain', async () => {
      const summary = await meter.getSummary({ domain: 'fast.com', period: 'all' });

      expect(summary.totalRequests).toBe(1);
    });

    it('should filter by tier', async () => {
      const summary = await meter.getSummary({ tier: 'intelligence', period: 'all' });

      expect(summary.totalRequests).toBe(1);
    });

    it('should filter by tenant ID', async () => {
      await meter.record({
        timestamp: Date.now(),
        domain: 'tenant.com',
        url: 'https://tenant.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
        tenantId: 'special-tenant',
      });

      const summary = await meter.getSummary({ tenantId: 'special-tenant', period: 'all' });

      expect(summary.totalRequests).toBe(1);
    });
  });

  describe('getUsageByPeriod()', () => {
    it('should return aggregates for multiple periods', async () => {
      const now = Date.now();

      // Record events over multiple hours
      for (let i = 0; i < 5; i++) {
        await meter.record({
          timestamp: now - i * 60 * 60 * 1000, // Each hour back
          domain: 'example.com',
          url: 'https://example.com/page',
          tier: 'intelligence',
          success: true,
          durationMs: 100,
          tiersAttempted: ['intelligence'],
          fellBack: false,
        });
      }

      const periods = await meter.getUsageByPeriod('hour', { periods: 6 });

      expect(periods.length).toBe(6);
      expect(periods.every(p => p.periodStart < p.periodEnd)).toBe(true);
    });

    it('should return daily aggregates', async () => {
      const periods = await meter.getUsageByPeriod('day', { periods: 7 });

      expect(periods.length).toBe(7);
    });
  });

  describe('getCostBreakdown()', () => {
    beforeEach(async () => {
      const now = Date.now();

      // Intelligence requests
      for (let i = 0; i < 10; i++) {
        await meter.record({
          timestamp: now,
          domain: 'fast.com',
          url: 'https://fast.com/page',
          tier: 'intelligence',
          success: true,
          durationMs: 100,
          tiersAttempted: ['intelligence'],
          fellBack: false,
        });
      }

      // Playwright requests (fewer but more expensive)
      for (let i = 0; i < 2; i++) {
        await meter.record({
          timestamp: now,
          domain: 'slow.com',
          url: 'https://slow.com/page',
          tier: 'playwright',
          success: true,
          durationMs: 3000,
          tiersAttempted: ['playwright'],
          fellBack: false,
        });
      }
    });

    it('should return cost breakdown by tier', async () => {
      const breakdown = await meter.getCostBreakdown({ period: 'all' });

      expect(breakdown.total).toBeGreaterThan(0);
      expect(breakdown.byTier.intelligence.cost).toBe(10 * TIER_COST_UNITS.intelligence);
      expect(breakdown.byTier.playwright.cost).toBe(2 * TIER_COST_UNITS.playwright);
    });

    it('should calculate percentages correctly', async () => {
      const breakdown = await meter.getCostBreakdown({ period: 'all' });

      const totalPercentage =
        breakdown.byTier.intelligence.percentage +
        breakdown.byTier.lightweight.percentage +
        breakdown.byTier.playwright.percentage;

      expect(totalPercentage).toBeCloseTo(1, 5);
    });

    it('should estimate monthly cost', async () => {
      const breakdown = await meter.getCostBreakdown({ period: 'day' });

      expect(breakdown.estimatedMonthlyCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('aggregation', () => {
    it('should track top domains by cost', async () => {
      const now = Date.now();

      // Expensive domain
      await meter.record({
        timestamp: now,
        domain: 'expensive.com',
        url: 'https://expensive.com/page',
        tier: 'playwright',
        success: true,
        durationMs: 3000,
        tiersAttempted: ['playwright'],
        fellBack: false,
      });

      // Cheap domain
      await meter.record({
        timestamp: now,
        domain: 'cheap.com',
        url: 'https://cheap.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      const summary = await meter.getSummary({ period: 'all' });

      expect(summary.currentPeriod.topDomainsByCost[0].domain).toBe('expensive.com');
    });

    it('should track top domains by request count', async () => {
      const now = Date.now();

      // Many requests to one domain
      for (let i = 0; i < 5; i++) {
        await meter.record({
          timestamp: now,
          domain: 'popular.com',
          url: 'https://popular.com/page',
          tier: 'intelligence',
          success: true,
          durationMs: 100,
          tiersAttempted: ['intelligence'],
          fellBack: false,
        });
      }

      // Single request to another
      await meter.record({
        timestamp: now,
        domain: 'rare.com',
        url: 'https://rare.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      const summary = await meter.getSummary({ period: 'all' });

      expect(summary.currentPeriod.topDomainsByRequests[0].domain).toBe('popular.com');
      expect(summary.currentPeriod.topDomainsByRequests[0].requestCount).toBe(5);
    });

    it('should calculate fallback rate', async () => {
      const now = Date.now();

      // No fallback
      await meter.record({
        timestamp: now,
        domain: 'fast.com',
        url: 'https://fast.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      // With fallback
      await meter.record({
        timestamp: now,
        domain: 'slow.com',
        url: 'https://slow.com/page',
        tier: 'playwright',
        success: true,
        durationMs: 3000,
        tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
        fellBack: true,
      });

      const summary = await meter.getSummary({ period: 'all' });

      expect(summary.currentPeriod.fallbackRate).toBe(0.5);
    });
  });

  describe('persistence', () => {
    it('should persist events to disk', async () => {
      await meter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      await meter.flush();

      // Create new meter with same path
      const newMeter = new UsageMeter({
        persistPath: path.join(tempDir, 'usage.json'),
      });
      await newMeter.initialize();

      expect(newMeter.getEventCount()).toBe(1);
      await newMeter.flush();
    });

    it('should handle missing persistence file', async () => {
      const freshMeter = new UsageMeter({
        persistPath: path.join(tempDir, 'nonexistent.json'),
      });
      await freshMeter.initialize();

      expect(freshMeter.getEventCount()).toBe(0);
      await freshMeter.flush();
    });
  });

  describe('reset()', () => {
    it('should clear all events', async () => {
      await meter.record({
        timestamp: Date.now(),
        domain: 'example.com',
        url: 'https://example.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      expect(meter.getEventCount()).toBe(1);

      await meter.reset();

      expect(meter.getEventCount()).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      resetUsageMeterInstance();
      const meter1 = getUsageMeter();
      const meter2 = getUsageMeter();

      expect(meter1).toBe(meter2);
    });

    it('should reset instance', () => {
      const meter1 = getUsageMeter();
      resetUsageMeterInstance();
      const meter2 = getUsageMeter();

      expect(meter1).not.toBe(meter2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty data', async () => {
      const summary = await meter.getSummary({ period: 'all' });

      expect(summary.totalRequests).toBe(0);
      expect(summary.totalCostUnits).toBe(0);
      expect(summary.successRate).toBe(0);
      expect(summary.avgCostPerRequest).toBe(0);
    });

    it('should handle period with no data', async () => {
      const now = Date.now();

      // Record event in the past (outside current hour)
      await meter.record({
        timestamp: now - 2 * 60 * 60 * 1000, // 2 hours ago
        domain: 'old.com',
        url: 'https://old.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      const summary = await meter.getSummary({ period: 'hour' });

      expect(summary.currentPeriod.requestCount).toBe(0);
      expect(summary.totalRequests).toBe(1); // Still in all-time totals
    });

    it('should handle custom time range', async () => {
      const now = Date.now();
      const startTime = now - 5000;
      const endTime = now - 1000;

      // Record event within range
      await meter.record({
        timestamp: now - 3000,
        domain: 'inrange.com',
        url: 'https://inrange.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      // Record event outside range
      await meter.record({
        timestamp: now,
        domain: 'outrange.com',
        url: 'https://outrange.com/page',
        tier: 'intelligence',
        success: true,
        durationMs: 100,
        tiersAttempted: ['intelligence'],
        fellBack: false,
      });

      const summary = await meter.getSummary({ startTime, endTime });

      expect(summary.currentPeriod.requestCount).toBe(1);
    });
  });
});
