/**
 * Tests for ProxyManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProxyManager, resetProxyManager } from '../src/services/proxy-manager.js';
import { resetHealthTracker } from '../src/services/proxy-health.js';
import { resetDomainRiskClassifier } from '../src/services/domain-risk.js';
import { resetProxySelector } from '../src/services/proxy-selector.js';

describe('ProxyManager', () => {
  let manager: ProxyManager;

  beforeEach(() => {
    // Reset all singletons
    resetProxyManager();
    resetHealthTracker();
    resetDomainRiskClassifier();
    resetProxySelector();

    manager = new ProxyManager();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('initialize', () => {
    it('should initialize without proxies if not configured', () => {
      manager.initialize({});

      expect(manager.hasProxies()).toBe(false);
    });

    it('should initialize datacenter proxies from config', () => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080,http://user:pass@dc2.com:8080',
      });

      expect(manager.hasProxies()).toBe(true);
      const stats = manager.getPoolStats();
      expect(stats.length).toBe(1);
      expect(stats[0].tier).toBe('datacenter');
      expect(stats[0].totalProxies).toBe(2);
    });

    it('should initialize ISP proxies from config', () => {
      manager.initialize({
        ispUrls: 'http://user:pass@isp1.com:8080',
      });

      expect(manager.hasProxies()).toBe(true);
      const stats = manager.getPoolStats();
      expect(stats.find(s => s.tier === 'isp')).toBeDefined();
    });

    it('should initialize Bright Data proxies from config', () => {
      manager.initialize({
        brightdataAuth: 'customer123:secretpass',
        brightdataZone: 'residential',
        brightdataCountry: 'us',
      });

      expect(manager.hasProxies()).toBe(true);
      const stats = manager.getPoolStats();

      // Should have both residential and premium (unlocker)
      expect(stats.find(s => s.tier === 'residential')).toBeDefined();
      expect(stats.find(s => s.tier === 'premium')).toBeDefined();
    });

    it('should only initialize once', () => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080',
      });

      manager.initialize({
        datacenterUrls: 'http://user:pass@dc2.com:8080,http://user:pass@dc3.com:8080',
      });

      // Should still have only 1 proxy from first init
      const stats = manager.getPoolStats();
      expect(stats[0].totalProxies).toBe(1);
    });
  });

  describe('getProxy', () => {
    beforeEach(() => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080',
        ispUrls: 'http://user:pass@isp1.com:8080',
      });
    });

    it('should get proxy for domain', async () => {
      const result = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      expect(result.proxy).toBeDefined();
      expect(result.tier).toBeDefined();
      expect(result.riskAssessment).toBeDefined();
    });

    it('should include risk assessment', async () => {
      // Test with a domain that can use available tiers
      const result = await manager.getProxy({
        domain: 'github.com', // Low risk, can use datacenter
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      expect(result.riskAssessment.riskLevel).toBe('low');
      expect(result.riskAssessment.recommendedProxyTier).toBeDefined();
    });

    it('should get risk assessment for extreme risk domains', () => {
      // Test risk assessment without actually getting a proxy
      const risk = manager.getDomainRisk('google.com');
      expect(risk.riskLevel).toBe('extreme');
      expect(risk.recommendedProxyTier).toBe('premium');
    });

    it('should respect proxy options', async () => {
      const result = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
        proxyOptions: {
          preferredTier: 'isp',
        },
      });

      expect(result.tier).toBe('isp');
    });
  });

  describe('health reporting', () => {
    beforeEach(() => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080',
      });
    });

    it('should report success', async () => {
      const result = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      manager.reportSuccess(result.proxy.id, 'example.com', 150);

      const health = manager.getProxyHealth(result.proxy.id);
      expect(health!.totalRequests).toBe(1);
      expect(health!.successRate).toBe(1);
    });

    it('should report failure', async () => {
      const result = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      manager.reportFailure(result.proxy.id, 'example.com', 'blocked');

      const health = manager.getProxyHealth(result.proxy.id);
      expect(health!.totalFailures).toBe(1);
    });

    it('should report protection detected', () => {
      manager.reportProtectionDetected('example.com', { 'cf-ray': 'abc123' });

      const risk = manager.getDomainRisk('example.com');
      expect(risk.factors.knownProtection).toContain('cloudflare');
    });
  });

  describe('getFallbackProxy', () => {
    beforeEach(() => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080,http://user:pass@dc2.com:8080',
        ispUrls: 'http://user:pass@isp1.com:8080',
      });
    });

    it('should get fallback proxy', async () => {
      const original = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      const fallback = await manager.getFallbackProxy(
        original.proxy,
        'example.com',
        'TEAM'
      );

      expect(fallback).not.toBeNull();
      expect(fallback!.id).not.toBe(original.proxy.id);
    });
  });

  describe('pool management', () => {
    it('should add custom proxy pool', () => {
      manager.initialize({});

      manager.addProxyPool({
        id: 'custom-pool',
        tier: 'datacenter',
        name: 'Custom Pool',
        proxies: [{ id: 'custom-1', url: 'http://user:pass@custom.com:8080' }],
      });

      expect(manager.hasProxies()).toBe(true);
    });

    it('should remove proxy pool', () => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080',
      });

      manager.removeProxyPool('datacenter-default');

      expect(manager.hasProxies()).toBe(false);
    });
  });

  describe('domain risk', () => {
    it('should get domain risk', () => {
      manager.initialize({});

      const risk = manager.getDomainRisk('google.com');
      expect(risk.riskLevel).toBe('extreme');
    });

    it('should get recommended delay', () => {
      manager.initialize({});

      const delay = manager.getRecommendedDelay('google.com');
      expect(delay).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('cooldown management', () => {
    beforeEach(() => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080',
      });
    });

    it('should force proxy cooldown', async () => {
      const result = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      manager.forceProxyCooldown(result.proxy.id, 'blocked');

      const health = manager.getProxyHealth(result.proxy.id);
      expect(health!.isInCooldown).toBe(true);
    });

    it('should clear proxy cooldown', async () => {
      const result = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      manager.forceProxyCooldown(result.proxy.id, 'blocked');
      manager.clearProxyCooldown(result.proxy.id);

      const health = manager.getProxyHealth(result.proxy.id);
      expect(health!.isInCooldown).toBe(false);
    });

    it('should clear domain blocks', async () => {
      const result = await manager.getProxy({
        domain: 'example.com',
        tenantId: 'tenant-1',
        tenantPlan: 'TEAM',
      });

      // Cause blocking
      for (let i = 0; i < 5; i++) {
        manager.reportFailure(result.proxy.id, 'example.com', 'blocked');
      }

      manager.clearDomainBlocks('example.com');

      const blocked = manager.getBlockedProxiesForDomain('example.com');
      expect(blocked.length).toBe(0);
    });
  });

  describe('getAvailableTiers', () => {
    it('should return available tiers for plan', () => {
      manager.initialize({
        datacenterUrls: 'http://user:pass@dc1.com:8080',
        ispUrls: 'http://user:pass@isp1.com:8080',
      });

      const freeTiers = manager.getAvailableTiers('FREE');
      expect(freeTiers).toContain('datacenter');
      expect(freeTiers).not.toContain('isp');

      const teamTiers = manager.getAvailableTiers('TEAM');
      expect(teamTiers).toContain('datacenter');
      expect(teamTiers).toContain('isp');
    });
  });

  describe('calculateRequestCost', () => {
    it('should return correct cost multiplier', () => {
      expect(manager.calculateRequestCost('datacenter')).toBe(1);
      expect(manager.calculateRequestCost('isp')).toBe(5);
      expect(manager.calculateRequestCost('residential')).toBe(25);
      expect(manager.calculateRequestCost('premium')).toBe(100);
    });
  });
});
