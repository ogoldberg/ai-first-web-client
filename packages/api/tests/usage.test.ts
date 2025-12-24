/**
 * Usage Service Tests
 *
 * Tests for usage tracking and metering functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordUsage,
  getUsageStats,
  getTodayUnits,
  getTodayRequests,
  getTierCost,
  canAfford,
  clearUsageStore,
  exportUsage,
} from '../src/services/usage.js';

describe('Usage Service', () => {
  beforeEach(() => {
    clearUsageStore();
  });

  describe('getTierCost', () => {
    it('should return correct cost for intelligence tier', () => {
      expect(getTierCost('intelligence')).toBe(1);
    });

    it('should return correct cost for lightweight tier', () => {
      expect(getTierCost('lightweight')).toBe(5);
    });

    it('should return correct cost for playwright tier', () => {
      expect(getTierCost('playwright')).toBe(25);
    });
  });

  describe('recordUsage', () => {
    it('should record a request with correct units', () => {
      recordUsage('tenant_1', 'intelligence');

      expect(getTodayRequests('tenant_1')).toBe(1);
      expect(getTodayUnits('tenant_1')).toBe(1);
    });

    it('should accumulate multiple requests', () => {
      recordUsage('tenant_1', 'intelligence');
      recordUsage('tenant_1', 'intelligence');
      recordUsage('tenant_1', 'intelligence');

      expect(getTodayRequests('tenant_1')).toBe(3);
      expect(getTodayUnits('tenant_1')).toBe(3);
    });

    it('should track different tiers separately', () => {
      recordUsage('tenant_1', 'intelligence');
      recordUsage('tenant_1', 'lightweight');
      recordUsage('tenant_1', 'playwright');

      const stats = getUsageStats('tenant_1');
      expect(stats.requests).toBe(3);
      expect(stats.units).toBe(31); // 1 + 5 + 25
      expect(stats.byTier.intelligence.requests).toBe(1);
      expect(stats.byTier.intelligence.units).toBe(1);
      expect(stats.byTier.lightweight.requests).toBe(1);
      expect(stats.byTier.lightweight.units).toBe(5);
      expect(stats.byTier.playwright.requests).toBe(1);
      expect(stats.byTier.playwright.units).toBe(25);
    });

    it('should track separate tenants independently', () => {
      recordUsage('tenant_1', 'intelligence');
      recordUsage('tenant_1', 'playwright');
      recordUsage('tenant_2', 'lightweight');

      expect(getTodayUnits('tenant_1')).toBe(26); // 1 + 25
      expect(getTodayUnits('tenant_2')).toBe(5);
    });
  });

  describe('getUsageStats', () => {
    it('should return empty stats for new tenant', () => {
      const stats = getUsageStats('new_tenant');

      expect(stats.requests).toBe(0);
      expect(stats.units).toBe(0);
      expect(stats.byTier.intelligence.requests).toBe(0);
      expect(stats.byTier.lightweight.requests).toBe(0);
      expect(stats.byTier.playwright.requests).toBe(0);
    });

    it('should return correct date', () => {
      const stats = getUsageStats('tenant_1');
      const today = new Date().toISOString().split('T')[0];

      expect(stats.date).toBe(today);
    });
  });

  describe('canAfford', () => {
    it('should return true when under limit', () => {
      recordUsage('tenant_1', 'intelligence');

      expect(canAfford('tenant_1', 'intelligence', 100)).toBe(true);
      expect(canAfford('tenant_1', 'playwright', 100)).toBe(true);
    });

    it('should return false when at limit', () => {
      // Record 100 units
      for (let i = 0; i < 100; i++) {
        recordUsage('tenant_1', 'intelligence');
      }

      expect(canAfford('tenant_1', 'intelligence', 100)).toBe(false);
    });

    it('should account for tier cost when checking limit', () => {
      // Record 90 units (90 intelligence requests)
      for (let i = 0; i < 90; i++) {
        recordUsage('tenant_1', 'intelligence');
      }

      // Can afford 10 more intelligence (1 unit each) with 100 limit
      expect(canAfford('tenant_1', 'intelligence', 100)).toBe(true);

      // Cannot afford playwright (25 units) with only 10 remaining
      expect(canAfford('tenant_1', 'playwright', 100)).toBe(false);

      // Can afford lightweight (5 units) with 10 remaining
      expect(canAfford('tenant_1', 'lightweight', 100)).toBe(true);

      // Cannot afford lightweight (5 units) with only 4 remaining (94 limit - 90 used = 4 remaining)
      expect(canAfford('tenant_1', 'lightweight', 94)).toBe(false);
    });
  });

  describe('exportUsage', () => {
    it('should export usage for a tenant', () => {
      recordUsage('tenant_1', 'intelligence');
      recordUsage('tenant_1', 'lightweight');
      recordUsage('tenant_1', 'playwright');

      const today = new Date().toISOString().split('T')[0];
      const exported = exportUsage('tenant_1', today, today);

      expect(exported.tenantId).toBe('tenant_1');
      expect(exported.period.start).toBe(today);
      expect(exported.period.end).toBe(today);
      expect(exported.totals.requests).toBe(3);
      expect(exported.totals.units).toBe(31);
      expect(exported.byTier.intelligence.requests).toBe(1);
      expect(exported.byTier.lightweight.requests).toBe(1);
      expect(exported.byTier.playwright.requests).toBe(1);
      expect(exported.daily).toHaveLength(1);
    });

    it('should return empty export for tenant with no usage', () => {
      const today = new Date().toISOString().split('T')[0];
      const exported = exportUsage('no_usage_tenant', today, today);

      expect(exported.totals.requests).toBe(0);
      expect(exported.totals.units).toBe(0);
      expect(exported.daily).toHaveLength(0);
    });
  });
});
