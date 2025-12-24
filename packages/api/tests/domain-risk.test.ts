/**
 * Tests for DomainRiskClassifier
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainRiskClassifier } from '../src/services/domain-risk.js';

describe('DomainRiskClassifier', () => {
  let classifier: DomainRiskClassifier;

  beforeEach(() => {
    classifier = new DomainRiskClassifier({
      cacheDurationMinutes: 60,
      enableLearning: true,
      historicalWeight: 0.3,
    });
  });

  describe('classifyDomain', () => {
    it('should classify known high-risk domains', () => {
      const googleRisk = classifier.classifyDomain('google.com');
      expect(googleRisk.riskLevel).toBe('extreme');
      expect(googleRisk.factors.requiresResidential).toBe(true);

      const amazonRisk = classifier.classifyDomain('amazon.com');
      expect(amazonRisk.riskLevel).toBe('high');
    });

    it('should classify known low-risk domains', () => {
      const githubRisk = classifier.classifyDomain('github.com');
      expect(githubRisk.riskLevel).toBe('low');
      expect(githubRisk.factors.requiresResidential).toBe(false);

      const npmRisk = classifier.classifyDomain('npmjs.com');
      expect(npmRisk.riskLevel).toBe('low');
    });

    it('should handle www prefix', () => {
      const risk1 = classifier.classifyDomain('www.google.com');
      const risk2 = classifier.classifyDomain('google.com');

      expect(risk1.riskLevel).toBe(risk2.riskLevel);
    });

    it('should cache results', () => {
      const risk1 = classifier.classifyDomain('example.com');
      const risk2 = classifier.classifyDomain('example.com');

      expect(risk1.assessedAt).toEqual(risk2.assessedAt);
    });

    it('should provide recommended tier based on risk', () => {
      const extremeRisk = classifier.classifyDomain('google.com');
      expect(['residential', 'premium']).toContain(extremeRisk.recommendedProxyTier);

      const lowRisk = classifier.classifyDomain('github.com');
      expect(lowRisk.recommendedProxyTier).toBe('datacenter');
    });

    it('should provide recommended delay based on risk', () => {
      const extremeRisk = classifier.classifyDomain('google.com');
      expect(extremeRisk.recommendedDelayMs).toBeGreaterThanOrEqual(5000);

      const lowRisk = classifier.classifyDomain('github.com');
      expect(lowRisk.recommendedDelayMs).toBeLessThanOrEqual(1000);
    });
  });

  describe('getRiskForUrl', () => {
    it('should extract domain from URL', () => {
      const risk = classifier.getRiskForUrl('https://www.github.com/user/repo');
      expect(risk.domain).toBe('github.com');
      expect(risk.riskLevel).toBe('low');
    });

    it('should handle invalid URLs', () => {
      const risk = classifier.getRiskForUrl('not-a-url');
      expect(risk.riskLevel).toBe('high'); // Default to high for safety
    });
  });

  describe('learning from history', () => {
    it('should learn from successes', () => {
      const domain = 'test-success.com';

      // Initial risk
      const initialRisk = classifier.classifyDomain(domain);

      // Record many successes
      for (let i = 0; i < 20; i++) {
        classifier.recordSuccess(domain);
      }

      // Risk should decrease or stay low
      const updatedRisk = classifier.classifyDomain(domain);
      expect(['low', 'medium']).toContain(updatedRisk.riskLevel);
    });

    it('should learn from failures', () => {
      const domain = 'test-failure.com';

      // Record many failures (100% block rate)
      for (let i = 0; i < 15; i++) {
        classifier.recordFailure(domain, true);
      }

      // Risk should reflect high block rate
      const risk = classifier.classifyDomain(domain);
      expect(risk.factors.historicalBlockRate).toBe(1); // 100% failures
      // The combined risk level depends on historical weight, but block rate should be tracked
      expect(risk.factors.historicalBlockRate).toBeGreaterThan(0);
    });
  });

  describe('detectProtectionFromResponse', () => {
    it('should detect Cloudflare from headers', () => {
      const protection = classifier.detectProtectionFromResponse(
        'example.com',
        { 'cf-ray': 'abc123' }
      );

      expect(protection).toBe('cloudflare');

      // Should be recorded
      const risk = classifier.classifyDomain('example.com');
      expect(risk.factors.knownProtection).toContain('cloudflare');
    });

    it('should detect DataDome from headers', () => {
      const protection = classifier.detectProtectionFromResponse(
        'example.com',
        { 'x-datadome': 'some-value' }
      );

      expect(protection).toBe('datadome');
    });

    it('should detect protection from body content', () => {
      const protection = classifier.detectProtectionFromResponse(
        'example.com',
        {},
        '<html><script src="captcha.js"></script><div class="g-recaptcha"></div></html>'
      );

      expect(protection).toBe('recaptcha');
    });

    it('should detect hCaptcha from body', () => {
      const protection = classifier.detectProtectionFromResponse(
        'example.com',
        {},
        '<div class="h-captcha" data-sitekey="123"></div>'
      );

      expect(protection).toBe('hcaptcha');
    });

    it('should detect PerimeterX from body', () => {
      const protection = classifier.detectProtectionFromResponse(
        'example.com',
        {},
        '<div id="px-captcha"></div>'
      );

      expect(protection).toBe('perimeterx');
    });

    it('should return null for no protection', () => {
      const protection = classifier.detectProtectionFromResponse(
        'example.com',
        { 'content-type': 'text/html' },
        '<html><body>Normal page</body></html>'
      );

      expect(protection).toBeNull();
    });
  });

  describe('getRecommendedDelay', () => {
    it('should return high delay for extreme risk domains', () => {
      const delay = classifier.getRecommendedDelay('google.com');
      expect(delay).toBeGreaterThanOrEqual(5000);
    });

    it('should return low delay for low risk domains', () => {
      const delay = classifier.getRecommendedDelay('github.com');
      expect(delay).toBeLessThanOrEqual(1000);
    });
  });

  describe('requiresResidential', () => {
    it('should return true for high-protection sites', () => {
      expect(classifier.requiresResidential('google.com')).toBe(true);
      expect(classifier.requiresResidential('facebook.com')).toBe(true);
      expect(classifier.requiresResidential('ticketmaster.com')).toBe(true);
    });

    it('should return false for low-protection sites', () => {
      expect(classifier.requiresResidential('github.com')).toBe(false);
      expect(classifier.requiresResidential('npmjs.com')).toBe(false);
    });
  });

  describe('getHighRiskDomains', () => {
    it('should return array of high-risk domains', () => {
      const highRisk = classifier.getHighRiskDomains();

      // Method should return an array
      expect(Array.isArray(highRisk)).toBe(true);
    });

    it('should include learned high-risk domains', () => {
      const testDomain = 'learned-risky.com';

      // Simulate learning with enough samples to be counted
      for (let i = 0; i < 15; i++) {
        classifier.recordFailure(testDomain, true);
      }

      const highRisk = classifier.getHighRiskDomains();
      expect(highRisk).toContain(testDomain);
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      const domain = 'cached-domain.com';

      // First call creates cache
      classifier.classifyDomain(domain);

      // Clear cache
      classifier.clearCache();

      // Record failure
      classifier.recordFailure(domain, true);

      // Should get fresh assessment
      const risk = classifier.classifyDomain(domain);
      expect(risk.factors.historicalBlockRate).toBeGreaterThan(0);
    });
  });

  describe('special handling', () => {
    it('should include special handling for social media', () => {
      const facebookRisk = classifier.classifyDomain('facebook.com');
      expect(facebookRisk.specialHandling).toContain('requires_residential');
      expect(facebookRisk.specialHandling).toContain('login_required');
    });

    it('should include session requirement for some sites', () => {
      const amazonRisk = classifier.classifyDomain('amazon.com');
      expect(amazonRisk.specialHandling).toContain('session_required');
    });
  });
});
