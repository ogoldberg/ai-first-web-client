/**
 * Tests for Stealth Learning Integration (LR-006)
 *
 * Tests the integration of research-assisted retry configuration
 * with the stealth learning system. When an LLM researches bypass
 * techniques and provides a retryConfig, successful browses should
 * persist what worked for future use.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LearningEngine } from '../../src/core/learning-engine.js';
import type { RetryConfig } from '../../src/types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Stealth Learning Integration (LR-006)', () => {
  let engine: LearningEngine;
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stealth-learning-test-'));
    filePath = path.join(tempDir, 'learning-engine.json');
    engine = new LearningEngine(filePath);
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('recordStealthSuccess', () => {
    it('should create stealth profile for new domain', () => {
      const domain = 'example.com';

      engine.recordStealthSuccess(domain, {
        userAgent: 'Mozilla/5.0 Chrome/120',
        platform: 'Windows',
      });

      const entry = engine.getEntry(domain);
      expect(entry).toBeDefined();
      expect(entry?.successProfile?.stealthProfile).toBeDefined();
      expect(entry?.successProfile?.stealthProfile?.workingUserAgent).toBe('Mozilla/5.0 Chrome/120');
      expect(entry?.successProfile?.stealthProfile?.workingPlatform).toBe('Windows');
    });

    it('should track fingerprint seed', () => {
      const domain = 'protected.site';
      const fingerprintSeed = 'test-seed-123';

      engine.recordStealthSuccess(domain, {
        fingerprintSeed,
        usedFullBrowser: true,
      });

      const entry = engine.getEntry(domain);
      expect(entry?.successProfile?.stealthProfile?.fingerprintSeed).toBe(fingerprintSeed);
      expect(entry?.successProfile?.stealthProfile?.requiresFullBrowser).toBe(true);
    });

    it('should accumulate custom headers', () => {
      const domain = 'headers-test.com';

      // First success with some headers
      engine.recordStealthSuccess(domain, {
        headers: {
          'Accept-Language': 'en-US',
          'X-Custom': 'value1',
        },
      });

      // Second success with more headers
      engine.recordStealthSuccess(domain, {
        headers: {
          'X-Custom': 'value2', // Override existing
          'X-New': 'value3',   // Add new
        },
      });

      const entry = engine.getEntry(domain);
      const headers = entry?.successProfile?.stealthProfile?.requiredHeaders;
      expect(headers).toBeDefined();
      expect(headers?.['Accept-Language']).toBe('en-US'); // Kept from first
      expect(headers?.['X-Custom']).toBe('value2');       // Overridden
      expect(headers?.['X-New']).toBe('value3');          // Added
    });

    it('should increment success count', () => {
      const domain = 'counter.test';

      // First call initializes with 1, then increments to 2
      engine.recordStealthSuccess(domain, { userAgent: 'UA1' });
      // Second call increments to 3
      engine.recordStealthSuccess(domain, { userAgent: 'UA1' });
      // Third call increments to 4
      engine.recordStealthSuccess(domain, { userAgent: 'UA1' });

      const entry = engine.getEntry(domain);
      // Initial value is 1, plus 3 increments = 4
      expect(entry?.successProfile?.stealthProfile?.successCount).toBe(4);
    });

    it('should calculate success rate correctly', () => {
      const domain = 'rate.test';

      // Two successes: first initializes with 1 and increments to 2, second increments to 3
      engine.recordStealthSuccess(domain, { userAgent: 'UA1' });
      engine.recordStealthSuccess(domain, { userAgent: 'UA1' });

      // One failure: initializes with 1 (since stealthProfile already exists, it just increments)
      engine.recordStealthFailure(domain, {
        detectionType: 'cloudflare',
      });

      const entry = engine.getEntry(domain);
      // 3 successes, 1 failure = 3/4 = 0.75
      expect(entry?.successProfile?.stealthProfile?.successRate).toBeCloseTo(0.75, 1);
    });
  });

  describe('recordStealthFailure', () => {
    it('should track detection type', () => {
      const domain = 'blocked.site';

      engine.recordStealthFailure(domain, {
        detectionType: 'datadome',
      });

      const entry = engine.getEntry(domain);
      expect(entry?.successProfile?.stealthProfile?.detectionTypes).toContain('datadome');
      expect(entry?.successProfile?.stealthProfile?.required).toBe(true);
    });

    it('should track suggested delays', () => {
      const domain = 'rate-limited.site';

      engine.recordStealthFailure(domain, {
        detectionType: 'unknown',
        suggestedDelay: 5000,
      });

      const entry = engine.getEntry(domain);
      expect(entry?.successProfile?.stealthProfile?.minDelayMs).toBe(5000);
    });

    it('should track full browser requirement', () => {
      const domain = 'js-heavy.site';

      engine.recordStealthFailure(domain, {
        detectionType: 'cloudflare',
        requiresFullBrowser: true,
      });

      const entry = engine.getEntry(domain);
      expect(entry?.successProfile?.stealthProfile?.requiresFullBrowser).toBe(true);
    });

    it('should increment failure count', () => {
      const domain = 'failing.site';

      // First call initializes with 1, then increments to 2
      engine.recordStealthFailure(domain, { detectionType: 'cloudflare' });
      // Second call increments to 3
      engine.recordStealthFailure(domain, { detectionType: 'cloudflare' });

      const entry = engine.getEntry(domain);
      // Initial value is 1, plus 2 increments = 3
      expect(entry?.successProfile?.stealthProfile?.failureCount).toBe(3);
    });
  });

  describe('getStealthProfile', () => {
    it('should return null for unknown domain', () => {
      const profile = engine.getStealthProfile('unknown.com');
      expect(profile).toBeNull();
    });

    it('should return stealth profile for known domain', () => {
      const domain = 'known.site';

      engine.recordStealthSuccess(domain, {
        userAgent: 'TestAgent',
        platform: 'macOS',
      });

      const profile = engine.getStealthProfile(domain);
      expect(profile).toBeDefined();
      expect(profile?.workingUserAgent).toBe('TestAgent');
      expect(profile?.workingPlatform).toBe('macOS');
    });
  });

  describe('requiresStealth', () => {
    it('should return false for unknown domain', () => {
      expect(engine.requiresStealth('unknown.com')).toBe(false);
    });

    it('should return true after failure', () => {
      const domain = 'needs-stealth.site';

      engine.recordStealthFailure(domain, {
        detectionType: 'perimeterx',
      });

      expect(engine.requiresStealth(domain)).toBe(true);
    });
  });

  describe('requiresFullBrowser', () => {
    it('should return false for unknown domain', () => {
      expect(engine.requiresFullBrowser('unknown.com')).toBe(false);
    });

    it('should return true when full browser was required', () => {
      const domain = 'js-site.com';

      engine.recordStealthSuccess(domain, {
        usedFullBrowser: true,
      });

      expect(engine.requiresFullBrowser(domain)).toBe(true);
    });
  });

  describe('getRecommendedDelay', () => {
    it('should return null for unknown domain', () => {
      expect(engine.getRecommendedDelay('unknown.com')).toBeNull();
    });

    it('should return delay range after failures', () => {
      const domain = 'slow.site';

      engine.recordStealthFailure(domain, {
        detectionType: 'akamai',
        suggestedDelay: 3000,
      });

      const delay = engine.getRecommendedDelay(domain);
      expect(delay).toBeDefined();
      expect(delay?.min).toBe(3000);
    });
  });

  describe('RetryConfig integration', () => {
    it('should handle all RetryConfig fields', () => {
      const domain = 'full-config.test';

      const retryConfig: RetryConfig = {
        userAgent: 'CustomAgent/1.0',
        headers: {
          'Accept': 'text/html',
          'Accept-Language': 'en-GB',
        },
        useFullBrowser: true,
        delayMs: 2000,
        fingerprintSeed: 'seed-xyz',
        platform: 'Linux',
        retryAttempt: 2,
        researchDepth: 1,
        waitForSelector: '.content',
        scrollToLoad: true,
        timeout: 30000,
        extractionStrategy: 'framework:nextjs',
        customSelectors: { main: 'article' },
      };

      // Simulate successful retry with this config
      engine.recordStealthSuccess(domain, {
        userAgent: retryConfig.userAgent,
        platform: retryConfig.platform,
        fingerprintSeed: retryConfig.fingerprintSeed,
        headers: retryConfig.headers,
        usedFullBrowser: retryConfig.useFullBrowser,
      });

      const profile = engine.getStealthProfile(domain);
      expect(profile).toBeDefined();
      expect(profile?.workingUserAgent).toBe('CustomAgent/1.0');
      expect(profile?.workingPlatform).toBe('Linux');
      expect(profile?.fingerprintSeed).toBe('seed-xyz');
      expect(profile?.requiredHeaders?.['Accept-Language']).toBe('en-GB');
      expect(profile?.requiresFullBrowser).toBe(true);
    });

    it('should learn from multiple retry attempts', () => {
      const domain = 'learning.test';

      // First attempt fails: initializes with failureCount=1, then increments to 2
      engine.recordStealthFailure(domain, {
        detectionType: 'cloudflare',
      });

      // Second attempt with basic config fails: increments to 3
      engine.recordStealthFailure(domain, {
        detectionType: 'cloudflare',
        requiresFullBrowser: true,
      });

      // Third attempt with full browser succeeds: stealthProfile exists, just increments successCount
      // successCount was 0 initially, so after this it's 1
      engine.recordStealthSuccess(domain, {
        usedFullBrowser: true,
        userAgent: 'Chrome/120',
      });

      const profile = engine.getStealthProfile(domain);
      // failureCount: init 1 + 2 calls = 3
      expect(profile?.failureCount).toBe(3);
      // successCount: was 0, then 1 call increments it to 1
      expect(profile?.successCount).toBe(1);
      expect(profile?.requiresFullBrowser).toBe(true);
      expect(profile?.workingUserAgent).toBe('Chrome/120');
      // Detection type should still be tracked
      expect(profile?.detectionTypes).toContain('cloudflare');
    });
  });

  describe('Persistence', () => {
    it('should persist stealth profiles', async () => {
      const domain = 'persist.test';

      engine.recordStealthSuccess(domain, {
        userAgent: 'PersistTest/1.0',
        platform: 'Windows',
      });

      // Force flush to ensure data is written
      await engine.flush();

      // Create new engine from same file
      const engine2 = new LearningEngine(filePath);
      await engine2.initialize();

      const profile = engine2.getStealthProfile(domain);
      expect(profile?.workingUserAgent).toBe('PersistTest/1.0');
      expect(profile?.workingPlatform).toBe('Windows');
    });
  });
});
