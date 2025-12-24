/**
 * Tests for ProxySelector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProxySelector } from '../src/services/proxy-selector.js';
import { ProxyHealthTracker } from '../src/services/proxy-health.js';
import { DomainRiskClassifier } from '../src/services/domain-risk.js';
import type { ProxyPoolConfig } from '../src/services/proxy-types.js';

describe('ProxySelector', () => {
  let selector: ProxySelector;
  let healthTracker: ProxyHealthTracker;
  let riskClassifier: DomainRiskClassifier;

  const createDatacenterPool = (): ProxyPoolConfig => ({
    id: 'dc-pool',
    tier: 'datacenter',
    name: 'Datacenter Pool',
    proxies: [
      { id: 'dc-1', url: 'http://user:pass@dc1.proxy.com:8080' },
      { id: 'dc-2', url: 'http://user:pass@dc2.proxy.com:8080' },
    ],
    rotationStrategy: 'round-robin',
  });

  const createIspPool = (): ProxyPoolConfig => ({
    id: 'isp-pool',
    tier: 'isp',
    name: 'ISP Pool',
    proxies: [
      { id: 'isp-1', url: 'http://user:pass@isp1.proxy.com:8080', country: 'us' },
      { id: 'isp-2', url: 'http://user:pass@isp2.proxy.com:8080', country: 'uk' },
    ],
    rotationStrategy: 'least-used',
  });

  const createResidentialPool = (): ProxyPoolConfig => ({
    id: 'res-pool',
    tier: 'residential',
    name: 'Residential Pool',
    proxies: [
      { id: 'res-1', url: 'http://user:pass@res1.proxy.com:8080', isResidential: true },
    ],
    rotationStrategy: 'healthiest',
  });

  beforeEach(() => {
    healthTracker = new ProxyHealthTracker();
    riskClassifier = new DomainRiskClassifier();
    selector = new ProxySelector(healthTracker, riskClassifier);
  });

  describe('addPool', () => {
    it('should add a proxy pool', () => {
      selector.addPool(createDatacenterPool());

      expect(selector.hasTierProxies('datacenter')).toBe(true);
      expect(selector.getHealthyProxyCount('datacenter')).toBe(2);
    });

    it('should initialize proxy health', () => {
      selector.addPool(createDatacenterPool());

      const health = healthTracker.getHealth('dc-1');
      expect(health).not.toBeNull();
      expect(health!.tier).toBe('datacenter');
    });
  });

  describe('removePool', () => {
    it('should remove a proxy pool', () => {
      selector.addPool(createDatacenterPool());
      selector.removePool('dc-pool');

      expect(selector.hasTierProxies('datacenter')).toBe(false);
    });
  });

  describe('selectProxy', () => {
    it('should select proxy based on domain risk', async () => {
      selector.addPool(createDatacenterPool());
      selector.addPool(createIspPool());
      selector.addPool(createResidentialPool());

      // Low risk domain should get datacenter
      const lowRiskResult = await selector.selectProxy({
        domain: 'github.com',
        tenantId: 'tenant-1',
        tenantPlan: 'ENTERPRISE',
      });

      expect(lowRiskResult.proxy.tier).toBe('datacenter');
    });

    it('should respect tenant plan limits', async () => {
      selector.addPool(createDatacenterPool());
      selector.addPool(createIspPool());
      selector.addPool(createResidentialPool());

      // FREE plan can only use datacenter
      const freeResult = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'FREE',
      });

      expect(freeResult.proxy.tier).toBe('datacenter');
    });

    it('should use preferred tier if specified', async () => {
      selector.addPool(createDatacenterPool());
      selector.addPool(createIspPool());

      const result = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
        preferredTier: 'isp',
      });

      expect(result.proxy.tier).toBe('isp');
    });

    it('should filter by preferred country', async () => {
      selector.addPool(createIspPool());

      const result = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
        preferredTier: 'isp',
        preferredCountry: 'uk',
      });

      expect(result.proxy.endpoint.country).toBe('uk');
    });

    it('should use sticky session proxy', async () => {
      selector.addPool(createDatacenterPool());

      // First request with sticky session
      const result1 = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
        stickySessionId: 'session-1',
      });

      // Second request with same session
      const result2 = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
        stickySessionId: 'session-1',
      });

      expect(result1.proxy.id).toBe(result2.proxy.id);
      expect(result2.selectionReason).toBe('sticky_session');
    });

    it('should escalate tier when lower tier proxies unavailable', async () => {
      selector.addPool(createDatacenterPool());
      selector.addPool(createIspPool());

      // Block all datacenter proxies
      healthTracker.forceCooldown('dc-1', 'blocked');
      healthTracker.forceCooldown('dc-2', 'blocked');

      const result = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
        preferredTier: 'datacenter',
      });

      expect(result.proxy.tier).toBe('isp');
      expect(result.selectionReason).toContain('escalated');
    });

    it('should throw when no proxies available', async () => {
      selector.addPool(createDatacenterPool());

      // Block all proxies
      healthTracker.forceCooldown('dc-1', 'blocked');
      healthTracker.forceCooldown('dc-2', 'blocked');

      await expect(
        selector.selectProxy({
          domain: 'example.com',
          tenantId: 'tenant-1',
          tenantPlan: 'FREE', // Can only use datacenter
        })
      ).rejects.toMatchObject({
        code: 'PROXY_EXHAUSTED',
      });
    });

    it('should throw when no proxies configured', async () => {
      await expect(
        selector.selectProxy({
          domain: 'example.com',
          tenantId: 'tenant-1',
          tenantPlan: 'TEAM',
        })
      ).rejects.toMatchObject({
        code: 'NO_PROXY_CONFIGURED',
      });
    });
  });

  describe('selectFallback', () => {
    it('should select different proxy from same tier', async () => {
      selector.addPool(createDatacenterPool());

      const original = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      const fallback = await selector.selectFallback(
        original.proxy,
        'example.com',
        'TEAM'
      );

      expect(fallback).not.toBeNull();
      expect(fallback!.id).not.toBe(original.proxy.id);
      expect(fallback!.tier).toBe(original.proxy.tier);
    });

    it('should escalate to next tier if same tier exhausted', async () => {
      selector.addPool(createDatacenterPool());
      selector.addPool(createIspPool());

      const original = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      // Block remaining datacenter
      const otherId = original.proxy.id === 'dc-1' ? 'dc-2' : 'dc-1';
      healthTracker.forceCooldown(otherId, 'blocked');

      const fallback = await selector.selectFallback(
        original.proxy,
        'example.com',
        'TEAM'
      );

      expect(fallback).not.toBeNull();
      expect(fallback!.tier).toBe('isp');
    });

    it('should return null if no fallback available', async () => {
      selector.addPool(createDatacenterPool());

      const original = await selector.selectProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'FREE',
      });

      // Block all datacenter
      healthTracker.forceCooldown('dc-1', 'blocked');
      healthTracker.forceCooldown('dc-2', 'blocked');

      const fallback = await selector.selectFallback(
        original.proxy,
        'example.com',
        'FREE'
      );

      expect(fallback).toBeNull();
    });
  });

  describe('rotation strategies', () => {
    it('should rotate round-robin', async () => {
      selector.addPool(createDatacenterPool());

      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const result = await selector.selectProxy({
          domain: 'example.com',
          tenantId: 'tenant-1',
          tenantPlan: 'TEAM',
        });
        ids.push(result.proxy.id);
      }

      // Should alternate between dc-1 and dc-2
      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[0]).toBe(ids[2]);
      expect(ids[1]).toBe(ids[3]);
    });
  });

  describe('getPoolStats', () => {
    it('should return pool statistics', () => {
      selector.addPool(createDatacenterPool());
      selector.addPool(createIspPool());

      const stats = selector.getPoolStats();

      expect(stats.length).toBe(2);
      expect(stats.find(s => s.poolId === 'dc-pool')!.totalProxies).toBe(2);
      expect(stats.find(s => s.poolId === 'isp-pool')!.totalProxies).toBe(2);
    });

    it('should reflect health status', () => {
      selector.addPool(createDatacenterPool());

      healthTracker.forceCooldown('dc-1', 'blocked');

      const stats = selector.getPoolStats();
      const dcStats = stats.find(s => s.poolId === 'dc-pool')!;

      expect(dcStats.totalProxies).toBe(2);
      expect(dcStats.healthyProxies).toBe(1);
    });
  });

  describe('getAvailableTiers', () => {
    it('should return tiers with configured proxies for plan', () => {
      selector.addPool(createDatacenterPool());
      selector.addPool(createResidentialPool());

      const freeTiers = selector.getAvailableTiers('FREE');
      expect(freeTiers).toEqual(['datacenter']);

      const teamTiers = selector.getAvailableTiers('TEAM');
      expect(teamTiers).toContain('datacenter');
      expect(teamTiers).toContain('residential');
    });
  });
});
