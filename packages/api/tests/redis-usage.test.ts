/**
 * Tests for Redis-backed Usage Tracking Service
 *
 * These tests run against the in-memory fallback when Redis is not available.
 * For full Redis tests, set REDIS_URL environment variable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordUsage,
  getUsageStats,
  getTodayUnits,
  getUsageRange,
  exportUsage,
  clearUsageStore,
  resetRedisCheck,
} from '../src/services/redis-usage.js';

// Mock Redis client to not be available for unit tests
vi.mock('../src/services/redis-client.js', () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  isRedisAvailable: vi.fn().mockResolvedValue(false),
  buildKey: (...parts: string[]) => parts.join(':'),
}));

describe('Redis Usage Service (in-memory fallback)', () => {
  beforeEach(async () => {
    resetRedisCheck();
    await clearUsageStore();
  });

  describe('recordUsage', () => {
    it('should record intelligence tier usage', async () => {
      await recordUsage('tenant1', 'intelligence');
      const units = await getTodayUnits('tenant1');
      expect(units).toBe(1);
    });

    it('should record lightweight tier usage', async () => {
      await recordUsage('tenant1', 'lightweight');
      const units = await getTodayUnits('tenant1');
      expect(units).toBe(5);
    });

    it('should record playwright tier usage', async () => {
      await recordUsage('tenant1', 'playwright');
      const units = await getTodayUnits('tenant1');
      expect(units).toBe(25);
    });

    it('should accumulate usage across multiple requests', async () => {
      await recordUsage('tenant1', 'intelligence');
      await recordUsage('tenant1', 'lightweight');
      await recordUsage('tenant1', 'playwright');
      const units = await getTodayUnits('tenant1');
      expect(units).toBe(31); // 1 + 5 + 25
    });

    it('should track usage separately per tenant', async () => {
      await recordUsage('tenant1', 'intelligence');
      await recordUsage('tenant2', 'playwright');

      const units1 = await getTodayUnits('tenant1');
      const units2 = await getTodayUnits('tenant2');

      expect(units1).toBe(1);
      expect(units2).toBe(25);
    });
  });

  describe('getUsageStats', () => {
    it('should return empty stats for new tenant', async () => {
      const stats = await getUsageStats('newTenant');
      expect(stats.requests).toBe(0);
      expect(stats.units).toBe(0);
      expect(stats.byTier.intelligence.requests).toBe(0);
    });

    it('should return correct breakdown by tier', async () => {
      await recordUsage('tenant1', 'intelligence');
      await recordUsage('tenant1', 'intelligence');
      await recordUsage('tenant1', 'lightweight');

      const stats = await getUsageStats('tenant1');
      expect(stats.requests).toBe(3);
      expect(stats.units).toBe(7); // 1 + 1 + 5
      expect(stats.byTier.intelligence.requests).toBe(2);
      expect(stats.byTier.intelligence.units).toBe(2);
      expect(stats.byTier.lightweight.requests).toBe(1);
      expect(stats.byTier.lightweight.units).toBe(5);
    });
  });

  describe('getTodayUnits', () => {
    it('should return 0 for tenant with no usage', async () => {
      const units = await getTodayUnits('noUsage');
      expect(units).toBe(0);
    });

    it('should return correct total units', async () => {
      await recordUsage('tenant1', 'playwright');
      await recordUsage('tenant1', 'playwright');

      const units = await getTodayUnits('tenant1');
      expect(units).toBe(50);
    });
  });

  describe('getUsageRange', () => {
    it('should return empty array for no data', async () => {
      const range = await getUsageRange('tenant1', '2024-01-01', '2024-01-31');
      expect(range).toEqual([]);
    });

    it('should return records within date range', async () => {
      // Record today's usage
      await recordUsage('tenant1', 'intelligence');

      const today = new Date().toISOString().split('T')[0];
      const range = await getUsageRange('tenant1', today, today);

      expect(range.length).toBe(1);
      expect(range[0].date).toBe(today);
      expect(range[0].units).toBe(1);
    });
  });

  describe('exportUsage', () => {
    it('should export usage with correct totals', async () => {
      await recordUsage('tenant1', 'intelligence');
      await recordUsage('tenant1', 'lightweight');

      const today = new Date().toISOString().split('T')[0];
      const data = await exportUsage('tenant1', today, today);

      expect(data.tenantId).toBe('tenant1');
      expect(data.totals.requests).toBe(2);
      expect(data.totals.units).toBe(6);
      expect(data.byTier.intelligence.requests).toBe(1);
      expect(data.byTier.lightweight.requests).toBe(1);
    });
  });

  describe('clearUsageStore', () => {
    it('should clear all usage data', async () => {
      await recordUsage('tenant1', 'intelligence');
      await recordUsage('tenant2', 'playwright');

      await clearUsageStore();

      expect(await getTodayUnits('tenant1')).toBe(0);
      expect(await getTodayUnits('tenant2')).toBe(0);
    });
  });
});
