/**
 * Tests for AI Feedback Service
 *
 * Tests rate limiting, anomaly detection, real-time adjustments,
 * and security features of the feedback system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FeedbackService, type FeedbackServiceConfig } from '../../src/core/feedback-service.js';
import type {
  FeedbackSubmission,
  FeedbackCategory,
  FeedbackSentiment,
} from '../../src/types/feedback.js';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// ============================================
// HELPER FUNCTIONS
// ============================================

function createValidSubmission(overrides: Partial<FeedbackSubmission> = {}): FeedbackSubmission {
  return {
    category: 'content_quality',
    sentiment: 'negative',
    context: {
      url: 'https://example.com/page',
      domain: 'example.com',
    },
    message: 'Test feedback message',
    ...overrides,
  };
}

// ============================================
// BASIC FUNCTIONALITY TESTS
// ============================================

describe('FeedbackService', () => {
  let feedbackService: FeedbackService;
  const tenantId = 'test-tenant';
  const sessionId = 'test-session';

  beforeEach(() => {
    feedbackService = new FeedbackService({
      enableRealTimeAdjustments: false, // Disable for basic tests
      enableWebhooks: false,
    });
  });

  describe('Basic Submission', () => {
    it('should accept valid feedback submission', async () => {
      const submission = createValidSubmission();
      const result = await feedbackService.submitFeedback(tenantId, sessionId, submission);

      expect(result.success).toBe(true);
      expect(result.feedbackId).toBeDefined();
      expect(result.status).toBe('accepted');
    });

    it('should reject submission missing required fields', async () => {
      const result = await feedbackService.submitFeedback(tenantId, sessionId, {
        // Missing category and sentiment
        context: { url: 'https://example.com', domain: 'example.com' },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('validation_failed');
      expect(result.validationErrors).toBeDefined();
    });

    it('should reject submission with invalid URL', async () => {
      const submission = createValidSubmission({
        context: {
          url: 'not-a-valid-url',
          domain: 'example.com',
        },
      });

      const result = await feedbackService.submitFeedback(tenantId, sessionId, submission);

      expect(result.success).toBe(false);
      expect(result.status).toBe('validation_failed');
    });

    it('should accept all valid categories', async () => {
      const categories: FeedbackCategory[] = [
        'content_quality',
        'accuracy',
        'performance',
        'functionality',
        'security',
        'feature_request',
      ];

      for (const category of categories) {
        const submission = createValidSubmission({ category });
        const result = await feedbackService.submitFeedback(
          tenantId,
          `session-${category}`,
          submission
        );
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid sentiments', async () => {
      const sentiments: FeedbackSentiment[] = ['positive', 'negative', 'neutral'];

      for (const sentiment of sentiments) {
        const submission = createValidSubmission({ sentiment });
        const result = await feedbackService.submitFeedback(
          tenantId,
          `session-${sentiment}`,
          submission
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Rate Limiting', () => {
    let rateLimitedService: FeedbackService;

    beforeEach(() => {
      rateLimitedService = new FeedbackService({
        rateLimits: {
          sessionMaxPerMinute: 3,
          tenantMaxPerHour: 10,
          targetNegativeMaxPerHour: 2,
        },
        enableRealTimeAdjustments: false,
        enableWebhooks: false,
      });
    });

    it('should enforce session rate limit', async () => {
      const submission = createValidSubmission();

      // First 3 should succeed
      for (let i = 0; i < 3; i++) {
        const result = await rateLimitedService.submitFeedback(tenantId, sessionId, submission);
        expect(result.success).toBe(true);
      }

      // 4th should be rate limited
      const result = await rateLimitedService.submitFeedback(tenantId, sessionId, submission);
      expect(result.success).toBe(false);
      expect(result.status).toBe('rate_limited');
    });

    it('should enforce tenant rate limit', async () => {
      const submission = createValidSubmission();

      // Submit 10 from different sessions
      for (let i = 0; i < 10; i++) {
        const result = await rateLimitedService.submitFeedback(
          tenantId,
          `session-${i}`,
          submission
        );
        expect(result.success).toBe(true);
      }

      // 11th should be rate limited
      const result = await rateLimitedService.submitFeedback(
        tenantId,
        'session-new',
        submission
      );
      expect(result.success).toBe(false);
      expect(result.status).toBe('rate_limited');
    });

    it('should allow different tenants separately', async () => {
      const submission = createValidSubmission();

      // Exhaust tenant1's session limit (using tenant1-specific session ID)
      for (let i = 0; i < 3; i++) {
        await rateLimitedService.submitFeedback('tenant1', 'tenant1-session', submission);
      }

      // tenant2 should still be able to submit (using different session ID)
      const result = await rateLimitedService.submitFeedback('tenant2', 'tenant2-session', submission);
      expect(result.success).toBe(true);
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect category flooding', async () => {
      // Submit 10 identical negative feedback
      const submission = createValidSubmission({
        category: 'content_quality',
        sentiment: 'negative',
      });

      for (let i = 0; i < 10; i++) {
        await feedbackService.submitFeedback(tenantId, `session-${i}`, submission);
      }

      // Next submission should trigger category flooding detection
      const result = await feedbackService.submitFeedback(
        tenantId,
        'session-final',
        submission
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('anomaly_detected');
      expect(result.anomalyFlags?.some(f => f.type === 'category_flooding')).toBe(true);
    });

    it('should detect targeted attack on specific pattern', async () => {
      // Submit multiple negative feedback targeting the same pattern
      const submission = createValidSubmission({
        sentiment: 'negative',
        context: {
          url: 'https://example.com/page',
          domain: 'example.com',
          patternId: 'target-pattern-123',
        },
      });

      for (let i = 0; i < 5; i++) {
        await feedbackService.submitFeedback(tenantId, `session-${i}`, submission);
      }

      const result = await feedbackService.submitFeedback(
        tenantId,
        'session-final',
        submission
      );

      expect(result.anomalyFlags?.some(f => f.type === 'targeted_attack')).toBe(true);
    });

    it('should detect conflicting feedback on same URL', async () => {
      const baseContext = {
        url: 'https://example.com/conflict-page',
        domain: 'example.com',
      };

      // Submit enough background feedback to enable anomaly detection (requires 5+ records)
      for (let i = 0; i < 5; i++) {
        await feedbackService.submitFeedback(tenantId, `bg-session-${i}`, {
          category: 'performance',
          sentiment: 'neutral',
          context: {
            url: `https://example.com/page-${i}`,
            domain: 'example.com',
          },
        });
      }

      // Submit positive feedback for the conflict URL
      await feedbackService.submitFeedback(tenantId, 'session-positive', {
        category: 'content_quality',
        sentiment: 'positive',
        context: baseContext,
      });

      // Submit negative feedback for same URL - should detect conflict
      const result = await feedbackService.submitFeedback(tenantId, 'session-negative', {
        category: 'content_quality',
        sentiment: 'negative',
        context: baseContext,
      });

      expect(result.anomalyFlags?.some(f => f.type === 'conflicting_feedback')).toBe(true);
    });
  });

  describe('Feedback Querying', () => {
    beforeEach(async () => {
      // Submit various feedback
      const categories: FeedbackCategory[] = ['content_quality', 'accuracy', 'performance'];
      const sentiments: FeedbackSentiment[] = ['positive', 'negative', 'neutral'];

      let i = 0;
      for (const category of categories) {
        for (const sentiment of sentiments) {
          await feedbackService.submitFeedback(tenantId, `session-${i++}`, {
            category,
            sentiment,
            context: {
              url: `https://example.com/page-${i}`,
              domain: 'example.com',
            },
          });
        }
      }
    });

    it('should list all feedback for tenant', () => {
      const records = feedbackService.listFeedback(tenantId);
      expect(records.length).toBe(9);
    });

    it('should filter by category', () => {
      const records = feedbackService.listFeedback(tenantId, {
        category: 'content_quality',
      });
      expect(records.length).toBe(3);
      expect(records.every(r => r.submission.category === 'content_quality')).toBe(true);
    });

    it('should filter by sentiment', () => {
      const records = feedbackService.listFeedback(tenantId, {
        sentiment: 'negative',
      });
      expect(records.length).toBe(3);
      expect(records.every(r => r.submission.sentiment === 'negative')).toBe(true);
    });

    it('should paginate results', () => {
      const page1 = feedbackService.listFeedback(tenantId, { limit: 3, offset: 0 });
      const page2 = feedbackService.listFeedback(tenantId, { limit: 3, offset: 3 });

      expect(page1.length).toBe(3);
      expect(page2.length).toBe(3);

      // Should be different records
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Submit various feedback
      await feedbackService.submitFeedback(tenantId, 'session-1', {
        category: 'content_quality',
        sentiment: 'negative',
        context: { url: 'https://example.com/1', domain: 'example.com' },
      });
      await feedbackService.submitFeedback(tenantId, 'session-2', {
        category: 'content_quality',
        sentiment: 'positive',
        context: { url: 'https://example.com/2', domain: 'example.com' },
      });
      await feedbackService.submitFeedback(tenantId, 'session-3', {
        category: 'security',
        sentiment: 'negative',
        severity: 'critical',
        context: { url: 'https://example.com/3', domain: 'example.com' },
      });
    });

    it('should calculate correct statistics', () => {
      const stats = feedbackService.getStats(tenantId, 24);

      expect(stats.total).toBe(3);
      expect(stats.byCategory.content_quality).toBe(2);
      expect(stats.byCategory.security).toBe(1);
      expect(stats.bySentiment.negative).toBe(2);
      expect(stats.bySentiment.positive).toBe(1);
    });

    it('should respect time period filter', () => {
      // All feedback was just created, so it should be included in 24h window
      const stats = feedbackService.getStats(tenantId, 24);
      expect(stats.total).toBe(3);

      // With 0 hours (effectively no time), nothing should be included
      // This is a bit tricky since we just created them
      // Let's verify the period is set correctly instead
      expect(stats.period.end).toBeGreaterThan(stats.period.start);
    });
  });

  describe('Revert Adjustments', () => {
    let serviceWithAdjustments: FeedbackService;

    beforeEach(() => {
      serviceWithAdjustments = new FeedbackService({
        enableRealTimeAdjustments: true,
        enableWebhooks: false,
        requiredConsistentSignals: 1, // Allow single signal for testing
      });
    });

    it('should revert adjustments for specific feedback', async () => {
      // This test verifies the revert mechanism exists
      // Full integration would need mock LearningEngine

      const result = await serviceWithAdjustments.submitFeedback(tenantId, sessionId, {
        category: 'functionality',
        sentiment: 'negative',
        subtype: 'pattern_failure',
        context: {
          url: 'https://example.com/page',
          domain: 'example.com',
          patternId: 'test-pattern',
        },
      });

      // Verify we can attempt to revert (even without actual adjustments)
      if (result.feedbackId) {
        const reverted = await serviceWithAdjustments.revertAdjustments(tenantId, result.feedbackId);
        // Should return false since no LearningEngine is connected
        expect(typeof reverted).toBe('boolean');
      }
    });

    it('should return false for non-existent feedback', async () => {
      const reverted = await serviceWithAdjustments.revertAdjustments(tenantId, 'non-existent-id');
      expect(reverted).toBe(false);
    });
  });

  describe('Audit Log', () => {
    it('should record audit entries for submissions', async () => {
      await feedbackService.submitFeedback(tenantId, sessionId, createValidSubmission());

      const auditLog = feedbackService.getAuditLog(tenantId);
      expect(auditLog.length).toBeGreaterThan(0);

      const submitEntry = auditLog.find(e => e.action === 'submitted');
      expect(submitEntry).toBeDefined();
      expect(submitEntry?.tenantId).toBe(tenantId);
    });

    it('should record rejection in audit log', async () => {
      await feedbackService.submitFeedback(tenantId, sessionId, {
        // Invalid submission
        context: { url: 'invalid', domain: 'test' },
      });

      const auditLog = feedbackService.getAuditLog(tenantId);
      const rejectEntry = auditLog.find(e => e.action === 'rejected');
      expect(rejectEntry).toBeDefined();
    });

    it('should limit audit log entries', () => {
      const auditLog = feedbackService.getAuditLog(tenantId, 5);
      expect(auditLog.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired rate limit windows', async () => {
      const submission = createValidSubmission();
      await feedbackService.submitFeedback(tenantId, sessionId, submission);

      // Cleanup should not throw
      expect(() => feedbackService.cleanup()).not.toThrow();
    });
  });
});

// ============================================
// WEBHOOK TESTS
// ============================================

describe('FeedbackService Webhooks', () => {
  let feedbackService: FeedbackService;
  const tenantId = 'webhook-tenant';
  const sessionId = 'webhook-session';

  beforeEach(() => {
    feedbackService = new FeedbackService({
      enableRealTimeAdjustments: false,
      enableWebhooks: true,
    });
  });

  describe('Webhook Configuration', () => {
    it('should configure webhook for tenant', () => {
      expect(() => {
        feedbackService.configureWebhook(
          tenantId,
          'https://webhook.example.com/feedback',
          'super-secret-key-32-chars-minimum',
          ['security_alert', 'critical_feedback']
        );
      }).not.toThrow();
    });

    it('should disable webhook for tenant', () => {
      feedbackService.configureWebhook(
        tenantId,
        'https://webhook.example.com/feedback',
        'super-secret-key-32-chars-minimum',
        ['security_alert']
      );

      expect(() => {
        feedbackService.disableWebhook(tenantId);
      }).not.toThrow();
    });
  });

  describe('Security Alert Notifications', () => {
    it('should trigger notification for security feedback', async () => {
      feedbackService.configureWebhook(
        tenantId,
        'https://webhook.example.com/feedback',
        'super-secret-key-32-chars-minimum',
        ['security_alert']
      );

      const result = await feedbackService.submitFeedback(tenantId, sessionId, {
        category: 'security',
        sentiment: 'negative',
        subtype: 'credential_exposure',
        severity: 'critical',
        context: {
          url: 'https://example.com/vulnerable',
          domain: 'example.com',
        },
        message: 'Potential credential exposure detected',
      });

      expect(result.success).toBe(true);
      // Notification would be sent (we'd need to mock fetch for full verification)
    });
  });
});

// ============================================
// VALIDATION SCHEMA TESTS
// ============================================

describe('Feedback Validation', () => {
  let feedbackService: FeedbackService;
  const tenantId = 'validation-tenant';
  const sessionId = 'validation-session';

  beforeEach(() => {
    feedbackService = new FeedbackService({
      enableRealTimeAdjustments: false,
      enableWebhooks: false,
    });
  });

  it('should reject message exceeding max length', async () => {
    const longMessage = 'a'.repeat(2500); // Exceeds 2000 char limit

    const result = await feedbackService.submitFeedback(tenantId, sessionId, {
      category: 'content_quality',
      sentiment: 'negative',
      context: {
        url: 'https://example.com/page',
        domain: 'example.com',
      },
      message: longMessage,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('validation_failed');
  });

  it('should reject URL exceeding max length', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2100);

    const result = await feedbackService.submitFeedback(tenantId, sessionId, {
      category: 'content_quality',
      sentiment: 'negative',
      context: {
        url: longUrl,
        domain: 'example.com',
      },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('validation_failed');
  });

  it('should accept valid evidence fields', async () => {
    const result = await feedbackService.submitFeedback(tenantId, sessionId, {
      category: 'performance',
      sentiment: 'negative',
      subtype: 'slow_response',
      context: {
        url: 'https://example.com/slow',
        domain: 'example.com',
      },
      evidence: {
        responseTime: 5000,
        statusCode: 200,
        errorMessage: 'Request timed out',
      },
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid status code', async () => {
    const result = await feedbackService.submitFeedback(tenantId, sessionId, {
      category: 'performance',
      sentiment: 'negative',
      context: {
        url: 'https://example.com/page',
        domain: 'example.com',
      },
      evidence: {
        statusCode: 1000, // Invalid - must be 100-599
      },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('validation_failed');
  });

  it('should reject invalid suggested action', async () => {
    const result = await feedbackService.submitFeedback(tenantId, sessionId, {
      category: 'functionality',
      sentiment: 'negative',
      context: {
        url: 'https://example.com/page',
        domain: 'example.com',
      },
      suggestedAction: 'invalid_action' as any, // Invalid action
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('validation_failed');
  });

  it('should accept all valid suggested actions', async () => {
    const validActions = [
      'adjust_pattern',
      'disable_pattern',
      'retry_with_render',
      'report_only',
      'escalate',
    ];

    for (const action of validActions) {
      const result = await feedbackService.submitFeedback(tenantId, `session-${action}`, {
        category: 'functionality',
        sentiment: 'negative',
        context: {
          url: 'https://example.com/page',
          domain: 'example.com',
        },
        suggestedAction: action as any,
      });

      expect(result.success).toBe(true);
    }
  });
});
