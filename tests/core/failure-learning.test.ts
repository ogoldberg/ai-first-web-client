/**
 * Tests for Failure Learning Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classifyFailure,
  createFailureRecord,
  createEmptyFailureCounts,
  incrementFailureCount,
  addFailureRecord,
  getRecentFailures,
  countRecentFailuresByCategory,
  createAntiPattern,
  isAntiPatternActive,
  matchAntiPatterns,
  updateAntiPattern,
  calculateRetryWait,
  shouldRetry,
  getRetryStrategy,
  analyzePatternHealth,
  logFailure,
  getFailureSummary,
} from '../../src/core/failure-learning.js';
import type {
  FailureCategory,
  FailureRecord,
  AntiPattern,
} from '../../src/types/api-patterns.js';
import {
  RETRY_CONFIGS,
  ANTI_PATTERN_THRESHOLDS,
} from '../../src/types/api-patterns.js';

// ============================================
// FAILURE CLASSIFICATION TESTS
// ============================================

describe('Failure Classification', () => {
  describe('classifyFailure', () => {
    describe('HTTP status code classification', () => {
      it('should classify 401 as auth_required', () => {
        const result = classifyFailure(401, 'Unauthorized');
        expect(result.category).toBe('auth_required');
        expect(result.confidence).toBe(1.0);
      });

      it('should classify 403 as auth_required', () => {
        const result = classifyFailure(403, 'Forbidden');
        expect(result.category).toBe('auth_required');
        expect(result.confidence).toBe(1.0);
      });

      it('should classify 429 as rate_limited', () => {
        const result = classifyFailure(429, 'Too Many Requests');
        expect(result.category).toBe('rate_limited');
        expect(result.confidence).toBe(1.0);
      });

      it('should classify 404 as wrong_endpoint', () => {
        const result = classifyFailure(404, 'Not Found');
        expect(result.category).toBe('wrong_endpoint');
        expect(result.confidence).toBe(1.0);
      });

      it('should classify 500 as server_error', () => {
        const result = classifyFailure(500, 'Internal Server Error');
        expect(result.category).toBe('server_error');
        expect(result.confidence).toBe(0.9);
      });

      it('should classify 502 as server_error', () => {
        const result = classifyFailure(502, 'Bad Gateway');
        expect(result.category).toBe('server_error');
        expect(result.confidence).toBe(0.9);
      });

      it('should classify 503 as server_error', () => {
        const result = classifyFailure(503, 'Service Unavailable');
        expect(result.category).toBe('server_error');
        expect(result.confidence).toBe(0.9);
      });
    });

    describe('error message classification', () => {
      it('should classify timeout errors', () => {
        const result = classifyFailure(undefined, 'Connection timed out');
        expect(result.category).toBe('timeout');
        expect(result.confidence).toBe(0.9);
      });

      it('should classify network errors', () => {
        const result = classifyFailure(undefined, 'ECONNREFUSED: Connection refused');
        expect(result.category).toBe('network_error');
        expect(result.confidence).toBe(0.9);
      });

      it('should classify rate limit messages', () => {
        const result = classifyFailure(undefined, 'Rate limit exceeded');
        expect(result.category).toBe('rate_limited');
        expect(result.confidence).toBe(0.8);
      });

      it('should classify auth messages', () => {
        const result = classifyFailure(undefined, 'Authentication required');
        expect(result.category).toBe('auth_required');
        expect(result.confidence).toBe(0.8);
      });

      it('should classify parse errors', () => {
        const result = classifyFailure(undefined, 'Unexpected token in JSON');
        expect(result.category).toBe('parse_error');
        expect(result.confidence).toBe(0.8);
      });

      it('should classify validation errors with missing field', () => {
        const result = classifyFailure(undefined, 'Missing required field: title');
        expect(result.category).toBe('validation_failed');
        expect(result.confidence).toBe(0.9);
      });

      it('should classify content too short errors', () => {
        const result = classifyFailure(undefined, 'Content too short');
        expect(result.category).toBe('content_too_short');
        expect(result.confidence).toBe(0.9);
      });

      it('should default to unknown for unrecognized errors', () => {
        const result = classifyFailure(undefined, 'Some random error');
        expect(result.category).toBe('unknown');
        expect(result.confidence).toBe(0.3);
      });
    });

    describe('classification metadata', () => {
      it('should include recommended strategy', () => {
        const result = classifyFailure(429, 'Rate limited');
        expect(result.recommendedStrategy).toBe('backoff');
      });

      it('should include suggested wait time for retryable errors', () => {
        const result = classifyFailure(429, 'Rate limited');
        expect(result.suggestedWaitMs).toBeDefined();
        expect(result.suggestedWaitMs).toBeGreaterThan(0);
      });

      it('should include shouldCreateAntiPattern flag', () => {
        // Auth errors should create anti-patterns
        const authResult = classifyFailure(401, 'Unauthorized');
        expect(authResult.shouldCreateAntiPattern).toBe(true);

        // Server errors should not create anti-patterns
        const serverResult = classifyFailure(500, 'Internal Server Error');
        expect(serverResult.shouldCreateAntiPattern).toBe(false);
      });
    });
  });
});

// ============================================
// FAILURE TRACKING TESTS
// ============================================

describe('Failure Tracking', () => {
  describe('createFailureRecord', () => {
    it('should create a complete failure record', () => {
      const classification = classifyFailure(404, 'Not Found');
      const record = createFailureRecord(
        classification,
        'example.com',
        'https://example.com/api/test',
        'pattern-123',
        404,
        150
      );

      expect(record.category).toBe('wrong_endpoint');
      expect(record.domain).toBe('example.com');
      expect(record.attemptedUrl).toBe('https://example.com/api/test');
      expect(record.patternId).toBe('pattern-123');
      expect(record.statusCode).toBe(404);
      expect(record.responseTime).toBe(150);
      expect(record.timestamp).toBeGreaterThan(0);
    });
  });

  describe('createEmptyFailureCounts', () => {
    it('should create an object with all categories set to 0', () => {
      const counts = createEmptyFailureCounts();
      expect(counts.auth_required).toBe(0);
      expect(counts.rate_limited).toBe(0);
      expect(counts.wrong_endpoint).toBe(0);
      expect(counts.server_error).toBe(0);
      expect(counts.timeout).toBe(0);
      expect(counts.parse_error).toBe(0);
      expect(counts.validation_failed).toBe(0);
      expect(counts.content_too_short).toBe(0);
      expect(counts.network_error).toBe(0);
      expect(counts.unknown).toBe(0);
    });
  });

  describe('incrementFailureCount', () => {
    it('should increment the specified category', () => {
      const counts = createEmptyFailureCounts();
      const updated = incrementFailureCount(counts, 'auth_required');
      expect(updated.auth_required).toBe(1);
      expect(updated.rate_limited).toBe(0);
    });

    it('should not mutate the original object', () => {
      const counts = createEmptyFailureCounts();
      incrementFailureCount(counts, 'auth_required');
      expect(counts.auth_required).toBe(0);
    });
  });

  describe('addFailureRecord', () => {
    it('should add a new record to the list', () => {
      const classification = classifyFailure(404, 'Not Found');
      const record = createFailureRecord(classification, 'example.com', '/test', 'p1');
      const records = addFailureRecord([], record);
      expect(records).toHaveLength(1);
    });

    it('should limit to MAX_RECENT_FAILURES records', () => {
      let records: FailureRecord[] = [];
      const classification = classifyFailure(404, 'Not Found');

      // Add 15 records
      for (let i = 0; i < 15; i++) {
        const record = createFailureRecord(classification, 'example.com', '/test', `p${i}`);
        records = addFailureRecord(records, record);
      }

      // Should be limited to 10 (MAX_RECENT_FAILURES)
      expect(records.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getRecentFailures', () => {
    it('should filter records by time window', () => {
      const now = Date.now();
      const oldRecord: FailureRecord = {
        timestamp: now - 2 * 60 * 60 * 1000, // 2 hours ago
        category: 'auth_required',
        message: 'Old failure',
        domain: 'example.com',
        attemptedUrl: '/test',
        patternId: 'p1',
      };
      const recentRecord: FailureRecord = {
        timestamp: now - 5 * 60 * 1000, // 5 minutes ago
        category: 'auth_required',
        message: 'Recent failure',
        domain: 'example.com',
        attemptedUrl: '/test',
        patternId: 'p2',
      };

      const records = [oldRecord, recentRecord];
      const recent = getRecentFailures(records, 60 * 60 * 1000); // 1 hour window

      expect(recent).toHaveLength(1);
      expect(recent[0].patternId).toBe('p2');
    });
  });

  describe('countRecentFailuresByCategory', () => {
    it('should count failures of a specific category', () => {
      const now = Date.now();
      const records: FailureRecord[] = [
        {
          timestamp: now - 1000,
          category: 'auth_required',
          message: 'Auth failure 1',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        },
        {
          timestamp: now - 2000,
          category: 'auth_required',
          message: 'Auth failure 2',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p2',
        },
        {
          timestamp: now - 3000,
          category: 'rate_limited',
          message: 'Rate limited',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p3',
        },
      ];

      const authCount = countRecentFailuresByCategory(records, 'auth_required');
      expect(authCount).toBe(2);

      const rateLimitCount = countRecentFailuresByCategory(records, 'rate_limited');
      expect(rateLimitCount).toBe(1);
    });
  });
});

// ============================================
// ANTI-PATTERN TESTS
// ============================================

describe('Anti-Pattern Management', () => {
  describe('createAntiPattern', () => {
    it('should return null if not enough failures', () => {
      const now = Date.now();
      const failures: FailureRecord[] = [
        {
          timestamp: now,
          category: 'auth_required',
          message: 'Unauthorized',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        },
      ];

      const antiPattern = createAntiPattern(failures, 'pattern-123');
      expect(antiPattern).toBeNull();
    });

    it('should create anti-pattern when threshold reached', () => {
      const now = Date.now();
      const failures: FailureRecord[] = [];

      // Add enough failures to reach threshold
      for (let i = 0; i < ANTI_PATTERN_THRESHOLDS.minFailures; i++) {
        failures.push({
          timestamp: now - i * 1000,
          category: 'auth_required',
          message: 'Unauthorized',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        });
      }

      const antiPattern = createAntiPattern(failures, 'pattern-123');
      expect(antiPattern).not.toBeNull();
      expect(antiPattern!.sourcePatternId).toBe('pattern-123');
      expect(antiPattern!.failureCategory).toBe('auth_required');
      expect(antiPattern!.domains).toContain('example.com');
    });

    it('should identify dominant failure category', () => {
      const now = Date.now();
      const failures: FailureRecord[] = [];

      // Add 2 auth failures
      for (let i = 0; i < 2; i++) {
        failures.push({
          timestamp: now - i * 1000,
          category: 'auth_required',
          message: 'Unauthorized',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        });
      }

      // Add 3 rate limit failures (dominant)
      for (let i = 0; i < 3; i++) {
        failures.push({
          timestamp: now - (i + 2) * 1000,
          category: 'rate_limited',
          message: 'Too many requests',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        });
      }

      const antiPattern = createAntiPattern(failures, 'pattern-123');
      expect(antiPattern).not.toBeNull();
      expect(antiPattern!.failureCategory).toBe('rate_limited');
    });

    it('should set appropriate suppression duration based on category', () => {
      const now = Date.now();
      const authFailures: FailureRecord[] = [];

      for (let i = 0; i < ANTI_PATTERN_THRESHOLDS.minFailures; i++) {
        authFailures.push({
          timestamp: now - i * 1000,
          category: 'auth_required',
          message: 'Unauthorized',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        });
      }

      const authAntiPattern = createAntiPattern(authFailures, 'auth-pattern');
      expect(authAntiPattern!.suppressionDurationMs).toBe(ANTI_PATTERN_THRESHOLDS.authSuppressionMs);

      const rateLimitFailures: FailureRecord[] = [];
      for (let i = 0; i < ANTI_PATTERN_THRESHOLDS.minFailures; i++) {
        rateLimitFailures.push({
          timestamp: now - i * 1000,
          category: 'rate_limited',
          message: 'Rate limited',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        });
      }

      const rateLimitAntiPattern = createAntiPattern(rateLimitFailures, 'rate-pattern');
      expect(rateLimitAntiPattern!.suppressionDurationMs).toBe(ANTI_PATTERN_THRESHOLDS.rateLimitSuppressionMs);
    });
  });

  describe('isAntiPatternActive', () => {
    it('should return true for non-expired anti-patterns', () => {
      const antiPattern: AntiPattern = {
        id: 'anti:test:auth_required:123',
        domains: ['example.com'],
        urlPatterns: ['^https?://example\\.com'],
        failureCategory: 'auth_required',
        reason: 'Test',
        recommendedAction: 'skip_domain',
        suppressionDurationMs: 60000,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
        failureCount: 3,
        lastFailure: Date.now(),
      };

      expect(isAntiPatternActive(antiPattern)).toBe(true);
    });

    it('should return false for expired anti-patterns', () => {
      const antiPattern: AntiPattern = {
        id: 'anti:test:auth_required:123',
        domains: ['example.com'],
        urlPatterns: ['^https?://example\\.com'],
        failureCategory: 'auth_required',
        reason: 'Test',
        recommendedAction: 'skip_domain',
        suppressionDurationMs: 60000,
        createdAt: Date.now() - 120000,
        expiresAt: Date.now() - 60000, // Expired
        failureCount: 3,
        lastFailure: Date.now() - 120000,
      };

      expect(isAntiPatternActive(antiPattern)).toBe(false);
    });

    it('should return true for never-expiring anti-patterns (expiresAt: 0)', () => {
      const antiPattern: AntiPattern = {
        id: 'anti:test:auth_required:123',
        domains: ['example.com'],
        urlPatterns: ['^https?://example\\.com'],
        failureCategory: 'auth_required',
        reason: 'Test',
        recommendedAction: 'skip_domain',
        suppressionDurationMs: 0,
        createdAt: Date.now() - 1000000,
        expiresAt: 0, // Never expires
        failureCount: 3,
        lastFailure: Date.now() - 1000000,
      };

      expect(isAntiPatternActive(antiPattern)).toBe(true);
    });
  });

  describe('matchAntiPatterns', () => {
    it('should match URL against active anti-patterns', () => {
      const antiPatterns: AntiPattern[] = [
        {
          id: 'anti:test:auth_required:123',
          domains: ['example.com'],
          urlPatterns: ['^https?://(www\\.)?example\\.com'],
          failureCategory: 'auth_required',
          reason: 'Test',
          recommendedAction: 'skip_domain',
          suppressionDurationMs: 60000,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          failureCount: 3,
          lastFailure: Date.now(),
        },
      ];

      const matches = matchAntiPatterns('https://example.com/api/test', antiPatterns);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('anti:test:auth_required:123');
    });

    it('should not match expired anti-patterns', () => {
      const antiPatterns: AntiPattern[] = [
        {
          id: 'anti:test:auth_required:123',
          domains: ['example.com'],
          urlPatterns: ['^https?://example\\.com'],
          failureCategory: 'auth_required',
          reason: 'Test',
          recommendedAction: 'skip_domain',
          suppressionDurationMs: 60000,
          createdAt: Date.now() - 120000,
          expiresAt: Date.now() - 60000, // Expired
          failureCount: 3,
          lastFailure: Date.now() - 120000,
        },
      ];

      const matches = matchAntiPatterns('https://example.com/api/test', antiPatterns);
      expect(matches).toHaveLength(0);
    });

    it('should not match URLs from different domains', () => {
      const antiPatterns: AntiPattern[] = [
        {
          id: 'anti:test:auth_required:123',
          domains: ['example.com'],
          urlPatterns: ['^https?://example\\.com'],
          failureCategory: 'auth_required',
          reason: 'Test',
          recommendedAction: 'skip_domain',
          suppressionDurationMs: 60000,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          failureCount: 3,
          lastFailure: Date.now(),
        },
      ];

      const matches = matchAntiPatterns('https://other.com/api/test', antiPatterns);
      expect(matches).toHaveLength(0);
    });
  });

  describe('updateAntiPattern', () => {
    it('should increment failure count', () => {
      const antiPattern: AntiPattern = {
        id: 'anti:test:auth_required:123',
        domains: ['example.com'],
        urlPatterns: ['^https?://example\\.com'],
        failureCategory: 'auth_required',
        reason: 'Test',
        recommendedAction: 'skip_domain',
        suppressionDurationMs: 60000,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
        failureCount: 3,
        lastFailure: Date.now(),
      };

      const newFailure: FailureRecord = {
        timestamp: Date.now(),
        category: 'auth_required',
        message: 'Still unauthorized',
        domain: 'example.com',
        attemptedUrl: '/test',
        patternId: 'p1',
      };

      const updated = updateAntiPattern(antiPattern, newFailure);
      expect(updated.failureCount).toBe(4);
    });

    it('should extend expiration time', () => {
      const now = Date.now();
      const antiPattern: AntiPattern = {
        id: 'anti:test:auth_required:123',
        domains: ['example.com'],
        urlPatterns: ['^https?://example\\.com'],
        failureCategory: 'auth_required',
        reason: 'Test',
        recommendedAction: 'skip_domain',
        suppressionDurationMs: 60000,
        createdAt: now - 30000,
        expiresAt: now + 30000, // 30 seconds left
        failureCount: 3,
        lastFailure: now - 10000,
      };

      const newFailure: FailureRecord = {
        timestamp: now,
        category: 'auth_required',
        message: 'Still unauthorized',
        domain: 'example.com',
        attemptedUrl: '/test',
        patternId: 'p1',
      };

      const updated = updateAntiPattern(antiPattern, newFailure);
      // New expiration should be extended
      expect(updated.expiresAt).toBeGreaterThan(antiPattern.expiresAt);
    });
  });
});

// ============================================
// RETRY STRATEGY TESTS
// ============================================

describe('Retry Strategies', () => {
  describe('calculateRetryWait', () => {
    it('should return initial delay for first attempt', () => {
      const wait = calculateRetryWait('rate_limited', 1);
      expect(wait).toBe(RETRY_CONFIGS.rate_limited.config!.initialDelayMs);
    });

    it('should apply exponential backoff', () => {
      const wait1 = calculateRetryWait('rate_limited', 1);
      const wait2 = calculateRetryWait('rate_limited', 2);
      const wait3 = calculateRetryWait('rate_limited', 3);

      expect(wait2).toBeGreaterThan(wait1);
      expect(wait3).toBeGreaterThan(wait2);
    });

    it('should return -1 when max retries exceeded', () => {
      const config = RETRY_CONFIGS.rate_limited.config!;
      const wait = calculateRetryWait('rate_limited', config.maxRetries + 1);
      expect(wait).toBe(-1);
    });

    it('should return 0 for non-retryable categories', () => {
      const wait = calculateRetryWait('auth_required', 1);
      expect(wait).toBe(0);
    });

    it('should cap wait time at maxDelayMs', () => {
      const config = RETRY_CONFIGS.rate_limited.config!;
      // Try a very high attempt number
      const wait = calculateRetryWait('rate_limited', 100);
      if (wait > 0) {
        expect(wait).toBeLessThanOrEqual(config.maxDelayMs);
      }
    });
  });

  describe('shouldRetry', () => {
    it('should return true for retryable categories within limit', () => {
      expect(shouldRetry('rate_limited', 1)).toBe(true);
      expect(shouldRetry('server_error', 1)).toBe(true);
      expect(shouldRetry('timeout', 1)).toBe(true);
    });

    it('should return false for non-retryable categories', () => {
      expect(shouldRetry('auth_required', 1)).toBe(false);
      expect(shouldRetry('wrong_endpoint', 1)).toBe(false);
    });

    it('should return false when max retries exceeded', () => {
      const config = RETRY_CONFIGS.rate_limited.config!;
      expect(shouldRetry('rate_limited', config.maxRetries + 1)).toBe(false);
    });
  });

  describe('getRetryStrategy', () => {
    it('should return correct strategy for each category', () => {
      expect(getRetryStrategy('rate_limited')).toBe('backoff');
      expect(getRetryStrategy('server_error')).toBe('backoff');
      expect(getRetryStrategy('timeout')).toBe('increase_timeout');
      expect(getRetryStrategy('auth_required')).toBe('none');
      expect(getRetryStrategy('wrong_endpoint')).toBe('none');
    });
  });
});

// ============================================
// PATTERN HEALTH ANALYSIS TESTS
// ============================================

describe('Pattern Health Analysis', () => {
  describe('analyzePatternHealth', () => {
    it('should mark pattern as healthy with high success rate', () => {
      const result = analyzePatternHealth([], 90, 10); // 90% success rate
      expect(result.isHealthy).toBe(true);
      expect(result.suggestedAction).toBe('none');
    });

    it('should mark pattern as unhealthy with low success rate', () => {
      const now = Date.now();
      const failures: FailureRecord[] = [];
      for (let i = 0; i < 5; i++) {
        failures.push({
          timestamp: now - i * 1000,
          category: 'auth_required',
          message: 'Unauthorized',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        });
      }

      const result = analyzePatternHealth(failures, 10, 90); // 10% success rate
      expect(result.isHealthy).toBe(false);
      expect(result.dominantFailureType).toBe('auth_required');
    });

    it('should identify dominant failure type', () => {
      const now = Date.now();
      const failures: FailureRecord[] = [
        {
          timestamp: now - 1000,
          category: 'rate_limited',
          message: 'Rate limited',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        },
        {
          timestamp: now - 2000,
          category: 'rate_limited',
          message: 'Rate limited',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        },
        {
          timestamp: now - 3000,
          category: 'auth_required',
          message: 'Unauthorized',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        },
      ];

      const result = analyzePatternHealth(failures, 10, 90);
      expect(result.dominantFailureType).toBe('rate_limited');
    });

    it('should suggest action based on dominant failure type', () => {
      const now = Date.now();
      const failures: FailureRecord[] = [];
      for (let i = 0; i < 5; i++) {
        failures.push({
          timestamp: now - i * 1000,
          category: 'rate_limited',
          message: 'Rate limited',
          domain: 'example.com',
          attemptedUrl: '/test',
          patternId: 'p1',
        });
      }

      const result = analyzePatternHealth(failures, 10, 90);
      expect(result.suggestedAction).toBe('backoff');
    });
  });
});

// ============================================
// UTILITY FUNCTION TESTS
// ============================================

describe('Utility Functions', () => {
  describe('getFailureSummary', () => {
    it('should return "No failures" for empty counts', () => {
      const counts = createEmptyFailureCounts();
      expect(getFailureSummary(counts)).toBe('No failures');
    });

    it('should summarize failure counts', () => {
      const counts = createEmptyFailureCounts();
      counts.auth_required = 3;
      counts.rate_limited = 2;

      const summary = getFailureSummary(counts);
      expect(summary).toContain('auth_required: 3');
      expect(summary).toContain('rate_limited: 2');
    });

    it('should exclude zero counts from summary', () => {
      const counts = createEmptyFailureCounts();
      counts.auth_required = 1;

      const summary = getFailureSummary(counts);
      expect(summary).not.toContain('rate_limited');
      expect(summary).not.toContain('timeout');
    });
  });

  describe('logFailure', () => {
    it('should not throw when logging', () => {
      const classification = classifyFailure(401, 'Unauthorized');
      expect(() => {
        logFailure(classification, {
          domain: 'example.com',
          url: 'https://example.com/test',
          patternId: 'p1',
          statusCode: 401,
        });
      }).not.toThrow();
    });
  });
});

// ============================================
// RETRY CONFIG TESTS
// ============================================

describe('Retry Configurations', () => {
  it('should have configurations for all failure categories', () => {
    const categories: FailureCategory[] = [
      'auth_required',
      'rate_limited',
      'wrong_endpoint',
      'server_error',
      'timeout',
      'parse_error',
      'validation_failed',
      'content_too_short',
      'network_error',
      'unknown',
    ];

    for (const category of categories) {
      expect(RETRY_CONFIGS[category]).toBeDefined();
      expect(RETRY_CONFIGS[category].strategy).toBeDefined();
    }
  });

  it('should have valid retry configs for retryable categories', () => {
    const retryableCategories: FailureCategory[] = ['rate_limited', 'server_error', 'timeout', 'network_error'];

    for (const category of retryableCategories) {
      const config = RETRY_CONFIGS[category];
      expect(config.config).toBeDefined();
      expect(config.config!.maxRetries).toBeGreaterThan(0);
      expect(config.config!.initialDelayMs).toBeGreaterThan(0);
      expect(config.config!.maxDelayMs).toBeGreaterThan(0);
      expect(config.config!.backoffMultiplier).toBeGreaterThan(1);
    }
  });
});

// ============================================
// ANTI-PATTERN THRESHOLD TESTS
// ============================================

describe('Anti-Pattern Thresholds', () => {
  it('should have valid threshold values', () => {
    expect(ANTI_PATTERN_THRESHOLDS.minFailures).toBeGreaterThan(0);
    expect(ANTI_PATTERN_THRESHOLDS.timeWindowMs).toBeGreaterThan(0);
    // authSuppressionMs is 0 (permanent) - auth errors need user intervention
    expect(ANTI_PATTERN_THRESHOLDS.authSuppressionMs).toBe(0);
    expect(ANTI_PATTERN_THRESHOLDS.rateLimitSuppressionMs).toBeGreaterThan(0);
    expect(ANTI_PATTERN_THRESHOLDS.defaultSuppressionMs).toBeGreaterThan(0);
  });

  it('should have appropriate suppression durations', () => {
    // Rate limit suppression should be shorter than default (temporary issue)
    expect(ANTI_PATTERN_THRESHOLDS.rateLimitSuppressionMs).toBeLessThan(
      ANTI_PATTERN_THRESHOLDS.defaultSuppressionMs
    );
    // Auth suppression is permanent (0) until user provides credentials
    expect(ANTI_PATTERN_THRESHOLDS.authSuppressionMs).toBe(0);
  });
});
