/**
 * AI Feedback System Types
 *
 * Type definitions and Zod validation schemas for the secure feedback system
 * that allows AI users to report issues with browsing quality, accuracy, and performance.
 *
 * Security Design:
 * - Rate limiting at session and tenant levels
 * - Anomaly detection for feedback poisoning
 * - Max 5% confidence adjustment per feedback
 * - Require 3 consistent signals before applying adjustments
 * - HMAC-SHA256 webhook signature verification
 */

import { z } from 'zod';

// ============================================
// FEEDBACK CATEGORIES
// ============================================

/**
 * High-level feedback categories
 */
export type FeedbackCategory =
  | 'content_quality'    // Issues with extracted content
  | 'accuracy'           // Wrong or misleading information
  | 'performance'        // Speed, timeout, or resource issues
  | 'functionality'      // Features not working as expected
  | 'security'           // Security concerns or vulnerabilities
  | 'feature_request';   // Suggestions for new capabilities

export const FeedbackCategorySchema = z.enum([
  'content_quality',
  'accuracy',
  'performance',
  'functionality',
  'security',
  'feature_request',
]);

/**
 * Detailed subtypes for each category
 */
export type FeedbackSubtype =
  // content_quality subtypes
  | 'missing_content'      // Content that should exist but wasn't extracted
  | 'garbled_content'      // Content extracted but corrupted/malformed
  | 'incomplete_content'   // Partial extraction
  | 'wrong_format'         // Content format doesn't match expectation
  // accuracy subtypes
  | 'incorrect_data'       // Data values are wrong
  | 'outdated_content'     // Content is stale/old
  | 'misattribution'       // Wrong source or authorship
  | 'hallucination'        // Content that doesn't exist on page
  // performance subtypes
  | 'slow_response'        // Response took too long
  | 'timeout'              // Request timed out
  | 'resource_exhaustion'  // Memory or CPU issues
  | 'rate_limited'         // Hit rate limits unexpectedly
  // functionality subtypes
  | 'pattern_failure'      // Learned pattern failed
  | 'api_discovery_miss'   // API endpoint not discovered
  | 'selector_broken'      // CSS/XPath selector stopped working
  | 'auth_failure'         // Authentication issue
  // security subtypes
  | 'credential_exposure'  // Potential credential leak
  | 'xss_detected'         // Cross-site scripting concern
  | 'injection_risk'       // SQL/command injection risk
  // feature_request subtypes
  | 'new_capability'       // Request for new feature
  | 'improvement'          // Enhancement to existing feature
  | 'other';               // Catch-all for unclassified

export const FeedbackSubtypeSchema = z.enum([
  'missing_content',
  'garbled_content',
  'incomplete_content',
  'wrong_format',
  'incorrect_data',
  'outdated_content',
  'misattribution',
  'hallucination',
  'slow_response',
  'timeout',
  'resource_exhaustion',
  'rate_limited',
  'pattern_failure',
  'api_discovery_miss',
  'selector_broken',
  'auth_failure',
  'credential_exposure',
  'xss_detected',
  'injection_risk',
  'new_capability',
  'improvement',
  'other',
]);

// ============================================
// FEEDBACK SEVERITY
// ============================================

/**
 * Severity levels for feedback
 */
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

export const FeedbackSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// ============================================
// FEEDBACK SENTIMENT
// ============================================

/**
 * Overall sentiment of the feedback
 */
export type FeedbackSentiment = 'positive' | 'negative' | 'neutral';

export const FeedbackSentimentSchema = z.enum(['positive', 'negative', 'neutral']);

// ============================================
// FEEDBACK SUBMISSION (INPUT)
// ============================================

/**
 * Zod schema for validating feedback submissions
 */
export const FeedbackSubmissionSchema = z.object({
  // Required fields
  category: FeedbackCategorySchema,
  sentiment: FeedbackSentimentSchema,

  // Optional classification
  subtype: FeedbackSubtypeSchema.optional(),
  severity: FeedbackSeveritySchema.optional(),

  // Context about what was being done
  context: z.object({
    url: z.string().url().max(2048),
    domain: z.string().max(253),
    operation: z.string().max(100).optional(), // e.g., 'browse', 'fetch', 'skill_replay'
    skillId: z.string().max(100).optional(),   // If feedback is about a specific skill
    patternId: z.string().max(100).optional(), // If feedback is about a pattern
    requestId: z.string().max(100).optional(), // Correlation ID
  }),

  // User-provided details
  message: z.string().max(2000).optional(),     // Free-form description
  expectedBehavior: z.string().max(1000).optional(),
  actualBehavior: z.string().max(1000).optional(),

  // Evidence (sanitized, no credentials)
  evidence: z.object({
    contentSnippet: z.string().max(500).optional(),  // Small sample of problematic content
    errorMessage: z.string().max(500).optional(),
    responseTime: z.number().min(0).max(300000).optional(), // ms
    statusCode: z.number().int().min(100).max(599).optional(),
  }).optional(),

  // Suggested action
  suggestedAction: z.enum([
    'adjust_pattern',     // Tweak pattern confidence
    'disable_pattern',    // Stop using this pattern
    'retry_with_render',  // Use heavier rendering
    'report_only',        // Just log, no action
    'escalate',           // Needs human review
  ]).optional(),
});

export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

// ============================================
// FEEDBACK RECORD (STORED)
// ============================================

/**
 * A stored feedback record with metadata
 */
export interface FeedbackRecord {
  // Unique identifier
  id: string;

  // Tenant isolation
  tenantId: string;
  sessionId: string;

  // The submitted feedback
  submission: FeedbackSubmission;

  // Processing metadata
  status: 'pending' | 'processing' | 'applied' | 'rejected' | 'escalated';
  processedAt?: number;

  // What actions were taken
  adjustments: FeedbackAdjustment[];

  // Anomaly detection results
  anomalyFlags: AnomalyFlag[];

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * An adjustment made in response to feedback
 */
export interface FeedbackAdjustment {
  // What was adjusted
  type: 'pattern_confidence' | 'tier_routing' | 'selector_priority' | 'api_preference';

  // Target of adjustment
  target: {
    id: string;        // Pattern/skill/selector ID
    domain: string;
  };

  // Change made (capped at 5%)
  previousValue: number;
  newValue: number;
  changePercent: number;

  // Can be reverted
  revertible: boolean;
  revertedAt?: number;
}

/**
 * Anomaly flags for suspicious feedback patterns
 */
export interface AnomalyFlag {
  type: 'category_flooding' | 'targeted_attack' | 'conflicting_feedback' | 'rate_exceeded';
  severity: 'warning' | 'critical';
  description: string;
  detectedAt: number;
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Audit log entry for feedback operations
 */
export interface FeedbackAuditEntry {
  // Audit ID
  id: string;

  // What happened
  action: 'submitted' | 'validated' | 'rejected' | 'adjustment_applied' | 'adjustment_reverted' | 'anomaly_detected' | 'escalated' | 'notified';

  // Who/what did it
  actor: {
    type: 'system' | 'ai_user' | 'human_admin';
    id: string;
  };

  // Context
  feedbackId: string;
  tenantId: string;

  // Details (varies by action)
  details: Record<string, unknown>;

  // When
  timestamp: number;
}

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Types of notifications that can be sent
 */
export type NotificationType =
  | 'security_alert'         // Always notify - security concerns
  | 'critical_feedback'      // High/critical severity feedback
  | 'pattern_failure'        // 3+ failures for same pattern
  | 'anomaly_detected'       // Suspicious feedback pattern
  | 'feature_request'        // User requested new feature
  | 'escalation_required';   // Needs human review

export const NotificationTypeSchema = z.enum([
  'security_alert',
  'critical_feedback',
  'pattern_failure',
  'anomaly_detected',
  'feature_request',
  'escalation_required',
]);

/**
 * A notification to be sent via webhook
 */
export interface FeedbackNotification {
  // Unique notification ID
  id: string;

  // Type determines routing and urgency
  type: NotificationType;

  // Tenant that generated the feedback
  tenantId: string;

  // Summary for quick review
  title: string;
  summary: string;

  // Full feedback record
  feedback: FeedbackRecord;

  // Urgency
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Delivery status
  status: 'pending' | 'sent' | 'failed' | 'acknowledged';
  sentAt?: number;
  acknowledgedAt?: number;

  // For idempotency
  idempotencyKey: string;

  // Timestamps
  createdAt: number;
}

// ============================================
// WEBHOOK CONFIGURATION
// ============================================

/**
 * Webhook configuration for a tenant
 */
export interface WebhookConfig {
  // Webhook URL
  url: string;

  // Secret for HMAC signing (stored hashed)
  secretHash: string;

  // Which notification types to receive
  enabledTypes: NotificationType[];

  // Whether webhook is active
  enabled: boolean;

  // Retry configuration
  maxRetries: number;
  retryDelayMs: number;

  // Last delivery status
  lastDeliveryAt?: number;
  lastDeliveryStatus?: 'success' | 'failure';
  consecutiveFailures: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * Zod schema for webhook configuration input
 */
export const WebhookConfigInputSchema = z.object({
  url: z.string().url().max(2048),
  secret: z.string().min(32).max(256), // Raw secret, will be hashed
  enabledTypes: z.array(NotificationTypeSchema).min(1),
  enabled: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().min(1000).max(60000).default(5000),
});

export type WebhookConfigInput = z.infer<typeof WebhookConfigInputSchema>;

// ============================================
// RATE LIMITING
// ============================================

/**
 * Rate limit configuration
 */
export interface FeedbackRateLimits {
  // Per-session limits
  sessionMaxPerMinute: number;

  // Per-tenant limits
  tenantMaxPerHour: number;

  // Per-target negative feedback limit (prevents targeted attacks)
  targetNegativeMaxPerHour: number;
}

/**
 * Default rate limits
 */
export const DEFAULT_FEEDBACK_RATE_LIMITS: FeedbackRateLimits = {
  sessionMaxPerMinute: 10,
  tenantMaxPerHour: 100,
  targetNegativeMaxPerHour: 5,
};

// ============================================
// SERVICE RESPONSE TYPES
// ============================================

/**
 * Result of submitting feedback
 */
export interface FeedbackSubmitResult {
  success: boolean;
  feedbackId?: string;
  status: 'accepted' | 'rate_limited' | 'validation_failed' | 'anomaly_detected';
  message: string;

  // If adjustments were made
  adjustmentsApplied?: number;

  // If notification was triggered
  notificationSent?: boolean;

  // If there were issues
  anomalyFlags?: AnomalyFlag[];
  validationErrors?: string[];
}

/**
 * Feedback statistics for a tenant
 */
export interface FeedbackStats {
  tenantId: string;
  period: {
    start: number;
    end: number;
  };

  // Counts by category
  byCategory: Record<FeedbackCategory, number>;

  // Counts by sentiment
  bySentiment: Record<FeedbackSentiment, number>;

  // Counts by status
  byStatus: Record<FeedbackRecord['status'], number>;

  // Anomaly summary
  anomaliesDetected: number;
  escalationsRequired: number;

  // Adjustment summary
  adjustmentsApplied: number;
  adjustmentsReverted: number;

  // Totals
  total: number;
}

// ============================================
// CONSISTENCY TRACKING
// ============================================

/**
 * Tracks consistent feedback signals for the same target
 * (require 3 agreeing signals before applying adjustments)
 */
export interface ConsistencyTracker {
  // Target being tracked
  targetType: 'pattern' | 'skill' | 'domain' | 'api';
  targetId: string;
  domain: string;

  // Signals received
  signals: Array<{
    feedbackId: string;
    sentiment: FeedbackSentiment;
    suggestedAction?: FeedbackSubmission['suggestedAction'];
    timestamp: number;
  }>;

  // Computed consensus
  consensus?: {
    sentiment: FeedbackSentiment;
    suggestedAction?: FeedbackSubmission['suggestedAction'];
    signalCount: number;
    reachedAt: number;
  };
}
